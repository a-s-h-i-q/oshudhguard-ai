import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, BookmarkPlus, Globe } from 'lucide-react';
import { TopBar, type ActiveTab } from './components/TopBar';
import { ScannerWorkspace } from './components/ScannerWorkspace';
import { BlisterVerifier } from './components/BlisterVerifier';
import { CaregiverCardView } from './components/CaregiverCardView';
import { DgdaIndexView } from './components/DgdaIndexView';
import {
  DEMO_PRESCRIPTION_CASES,
  type DemoBlisterFixture,
  type DemoPrescriptionCase,
} from './data/demoCases';
import { compileBanglaSchedule } from './engine/banglaCompiler';
import { resolveMedicationHypotheses } from './engine/grounding';
import {
  applyClaheFoilFilter,
  applySauvolaThreshold,
  renderDemoBlisterCanvas,
  renderDemoPrescriptionCanvas,
} from './engine/imageProcessing';
import {
  buildPipelineJsonPayload,
  computePriceTransparency,
  detectComorbiditiesFromNotes,
  runClinicalSafetyAudit,
  verifyBlisterAgainstPrescription,
} from './engine/safetyGraph';
import {
  deleteSavedScanOffline,
  loadSavedScansOffline,
  saveScanOffline,
} from './utils/storage';
import { speakBanglaText, stopBanglaSpeech } from './utils/voice';
import type {
  BlisterVerificationResult,
  ComorbidityId,
  DecodedMedication,
  DgdaDrugRecord,
  PatientContext,
  RawVlmMedicationLine,
  SavedScanRecord,
} from './types/clinical';

function decodeRawLines(rawLines: RawVlmMedicationLine[]): DecodedMedication[] {
  return rawLines.map((line) => {
    const resolved = resolveMedicationHypotheses(line);
    const chosenDrug = resolved.bestCandidate.drug;
    const compiled = compileBanglaSchedule(
      chosenDrug,
      line.scheduleShorthand,
      line.durationDays,
    );

    return {
      lineId: line.lineId,
      ocrRaw: line.ocrRaw,
      hypotheses: line.hypotheses,
      dosageFormHint: line.dosageFormHint,
      strengthHint: line.strengthHint,
      scheduleShorthand: line.scheduleShorthand,
      bbox: line.bbox,
      resolvedDrug: chosenDrug,
      groundingScore: resolved.bestCandidate.breakdown.totalScore,
      scoreBreakdown: resolved.bestCandidate.breakdown,
      topCandidates: resolved.topCandidates,
      requiresHumanVerification: resolved.requiresHumanVerification,
      humanConfirmed: !resolved.requiresHumanVerification,
      compiledSchedule: compiled,
    };
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  // Core prescription session state
  const [prescriptionId, setPrescriptionId] = useState<string>('');
  const [patientContext, setPatientContext] = useState<PatientContext>({
    detectedConditions: [],
    activeComorbidities: [],
  });
  const [medications, setMedications] = useState<DecodedMedication[]>([]);
  const [blisterChecks, setBlisterChecks] = useState<BlisterVerificationResult[]>([]);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [sauvolaImageUrl, setSauvolaImageUrl] = useState<string | null>(null);

  // Loading, error, voice, and offline cache state
  const [isProcessingRx, setIsProcessingRx] = useState(false);
  const [rxError, setRxError] = useState<string | null>(null);
  const [isVerifyingBlister, setIsVerifyingBlister] = useState(false);
  const [blisterError, setBlisterError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [savedScans, setSavedScans] = useState<SavedScanRecord[]>([]);
  const [justSavedOffline, setJustSavedOffline] = useState(false);

  // Load offline IndexedDB saved scans on mount
  useEffect(() => {
    loadSavedScansOffline().then(setSavedScans);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => stopBanglaSpeech();
  }, []);

  // Reactive Stage 5 Clinical Safety Audit (recomputes live on comorbidity toggle or ambiguity confirm)
  const clinicalAlerts = useMemo(
    () => runClinicalSafetyAudit(medications, patientContext.activeComorbidities),
    [medications, patientContext.activeComorbidities],
  );

  // Reactive Stage 5 DGDA Official MRP & Generic Price Transparency Report
  const priceReport = useMemo(() => computePriceTransparency(medications), [medications]);

  // Reactive Page 6 Sample Pipeline JSON Output Payload
  const pipelinePayload = useMemo(
    () =>
      buildPipelineJsonPayload(
        prescriptionId || 'COU-RX-NEW',
        patientContext,
        medications,
        blisterChecks,
        clinicalAlerts,
      ),
    [prescriptionId, patientContext, medications, blisterChecks, clinicalAlerts],
  );

  const handleLoadDemoCase = useCallback(async (demo: DemoPrescriptionCase) => {
    stopBanglaSpeech();
    setSpeakingId(null);
    setRxError(null);
    setBlisterError(null);
    setIsProcessingRx(true);
    setJustSavedOffline(false);

    try {
      const renderedRx = renderDemoPrescriptionCanvas(demo);
      const sauvola = await applySauvolaThreshold(renderedRx);
      const decoded = decodeRawLines(demo.rawLines);

      setPrescriptionId(demo.prescriptionId);
      setPatientContext({
        patientName: demo.patientName,
        age: demo.age,
        sex: demo.sex,
        doctorName: demo.doctorName,
        clinicName: demo.clinicName,
        detectedConditions: demo.diagnosisNotes,
        activeComorbidities: demo.defaultComorbidities,
      });
      setMedications(decoded);
      setBlisterChecks([]);
      setOriginalImageUrl(renderedRx);
      setSauvolaImageUrl(sauvola);
      setActiveTab('scanner');
    } catch (err) {
      setRxError(err instanceof Error ? err.message : 'Unable to process demo prescription.');
    } finally {
      setIsProcessingRx(false);
    }
  }, []);

  // Auto-load the primary CKD Polypharmacy case on initial open if ?autostart=1 or for immediate workbench readiness
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('empty') !== '1') {
      handleLoadDemoCase(DEMO_PRESCRIPTION_CASES[0]);
    }
  }, [handleLoadDemoCase]);

  const handleUploadPrescriptionImage = async (file: File) => {
    stopBanglaSpeech();
    setSpeakingId(null);
    setRxError(null);
    setIsProcessingRx(true);
    setJustSavedOffline(false);

    try {
      const dataUrl = await fileToDataUrl(file);
      const sauvola = await applySauvolaThreshold(dataUrl);
      setOriginalImageUrl(dataUrl);
      setSauvolaImageUrl(sauvola);

      const response = await fetch('/api/analyze-prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const result = (await response.json()) as {
        error?: string;
        patientName?: string;
        age?: number;
        sex?: string;
        doctorName?: string;
        clinicName?: string;
        detectedConditions?: string[];
        medications?: Array<{
          ocrRaw: string;
          hypotheses: string[];
          dosageFormHint?: string;
          strengthHint?: string;
          scheduleShorthand: string;
          durationDays?: number;
          bbox?: number[];
        }>;
      };

      if (!response.ok) {
        setRxError(result.error || 'Vision extraction failed. Try another photo or a demo case.');
        return;
      }

      const rawLines: RawVlmMedicationLine[] = (result.medications ?? []).map((m, idx) => ({
        lineId: `vlm-${Date.now()}-${idx}`,
        ocrRaw: m.ocrRaw,
        hypotheses: m.hypotheses?.length ? m.hypotheses : [m.ocrRaw],
        dosageFormHint: m.dosageFormHint,
        strengthHint: m.strengthHint,
        scheduleShorthand: m.scheduleShorthand || '1+0+1 p/c 7d',
        durationDays: m.durationDays,
        bbox:
          Array.isArray(m.bbox) && m.bbox.length === 4
            ? [m.bbox[0], m.bbox[1], m.bbox[2], m.bbox[3]]
            : undefined,
      }));

      if (rawLines.length === 0) {
        setRxError(
          'No medication lines could be detected in this photo. Ensure good lighting and retry, or add lines manually.',
        );
        return;
      }

      const notes = result.detectedConditions ?? [];
      const inferredComorbidities = detectComorbiditiesFromNotes(notes);
      if (typeof result.age === 'number' && result.age < 12 && !inferredComorbidities.includes('PEDIATRIC')) {
        inferredComorbidities.push('PEDIATRIC');
      }

      const newId = `COU-RX-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`;
      setPrescriptionId(newId);
      setPatientContext({
        patientName: result.patientName,
        age: result.age,
        sex: result.sex,
        doctorName: result.doctorName,
        clinicName: result.clinicName,
        detectedConditions: notes,
        activeComorbidities: inferredComorbidities,
      });
      setMedications(decodeRawLines(rawLines));
      setBlisterChecks([]);
    } catch (err) {
      setRxError(err instanceof Error ? err.message : 'Failed to analyze prescription image.');
    } finally {
      setIsProcessingRx(false);
    }
  };

  const handleToggleComorbidity = (id: ComorbidityId) => {
    setPatientContext((prev) => {
      const exists = prev.activeComorbidities.includes(id);
      return {
        ...prev,
        activeComorbidities: exists
          ? prev.activeComorbidities.filter((c) => c !== id)
          : [...prev.activeComorbidities, id],
      };
    });
  };

  const handleAddDetectedComorbiditiesFromVoice = (transcript: string) => {
    const detected = detectComorbiditiesFromNotes([transcript]);
    setPatientContext((prev) => ({
      ...prev,
      detectedConditions: Array.from(new Set([...prev.detectedConditions, transcript])),
      activeComorbidities: Array.from(new Set([...prev.activeComorbidities, ...detected])),
    }));
  };

  const handleConfirmAmbiguousCandidate = (lineId: string, chosenDrug: DgdaDrugRecord) => {
    setMedications((prev) =>
      prev.map((med) => {
        if (med.lineId !== lineId) return med;
        const compiled = compileBanglaSchedule(
          chosenDrug,
          med.scheduleShorthand,
          med.compiledSchedule.durationDays,
        );
        const matchedCand = med.topCandidates.find((c) => c.drug.id === chosenDrug.id);
        return {
          ...med,
          resolvedDrug: chosenDrug,
          groundingScore: matchedCand?.breakdown.totalScore ?? med.groundingScore,
          scoreBreakdown: matchedCand?.breakdown ?? med.scoreBreakdown,
          requiresHumanVerification: false,
          humanConfirmed: true,
          compiledSchedule: compiled,
        };
      }),
    );
  };

  const handleAddManualRxLine = (ocrRaw: string, shorthand: string) => {
    const newLine: RawVlmMedicationLine = {
      lineId: `manual-${Date.now()}`,
      ocrRaw,
      hypotheses: [ocrRaw],
      scheduleShorthand: shorthand,
    };
    const decoded = decodeRawLines([newLine]);
    if (!prescriptionId) {
      setPrescriptionId(`COU-RX-${new Date().getFullYear()}-MAN`);
    }
    setMedications((prev) => [...prev, ...decoded]);
  };

  const handleRemoveMedication = (lineId: string) => {
    setMedications((prev) => prev.filter((m) => m.lineId !== lineId));
  };

  const handleRunDemoBlister = async (fixture: DemoBlisterFixture) => {
    setBlisterError(null);
    setIsVerifyingBlister(true);
    try {
      const stripDataUrl = renderDemoBlisterCanvas(fixture);
      const claheDataUrl = await applyClaheFoilFilter(stripDataUrl);
      const result = verifyBlisterAgainstPrescription(fixture.ocrStripRaw, medications, {
        stripId: `${fixture.id}-${Date.now()}`,
        dosageFormHint: fixture.dosageFormHint,
        strengthHint: fixture.strengthHint,
        stripImageDataUrl: stripDataUrl,
        claheImageDataUrl: claheDataUrl,
      });
      setBlisterChecks((prev) => [result, ...prev]);
    } catch (err) {
      setBlisterError(err instanceof Error ? err.message : 'Failed to verify blister strip.');
    } finally {
      setIsVerifyingBlister(false);
    }
  };

  const handleUploadBlisterImage = async (file: File) => {
    setBlisterError(null);
    setIsVerifyingBlister(true);
    try {
      const stripDataUrl = await fileToDataUrl(file);
      const claheDataUrl = await applyClaheFoilFilter(stripDataUrl);

      const response = await fetch('/api/analyze-blister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: claheDataUrl }),
      });
      const data = (await response.json()) as {
        error?: string;
        ocrStripRaw?: string;
        brandGuess?: string;
        dosageFormHint?: string;
        strengthHint?: string;
      };

      if (!response.ok) {
        setBlisterError(data.error || 'Blister foil OCR failed.');
        return;
      }

      const rawText = data.brandGuess
        ? `${data.brandGuess} ${data.strengthHint || ''}`.trim()
        : data.ocrStripRaw || '';

      const result = verifyBlisterAgainstPrescription(rawText, medications, {
        stripId: `upload-${Date.now()}`,
        dosageFormHint: data.dosageFormHint,
        strengthHint: data.strengthHint,
        stripImageDataUrl: stripDataUrl,
        claheImageDataUrl: claheDataUrl,
      });
      setBlisterChecks((prev) => [result, ...prev]);
    } catch (err) {
      setBlisterError(err instanceof Error ? err.message : 'Unable to analyze blister strip photo.');
    } finally {
      setIsVerifyingBlister(false);
    }
  };

  const handleRunManualFoilText = (foilImprint: string) => {
    setBlisterError(null);
    const result = verifyBlisterAgainstPrescription(foilImprint, medications, {
      stripId: `manual-strip-${Date.now()}`,
    });
    setBlisterChecks((prev) => [result, ...prev]);
  };

  const handleSpeakText = async (id: string, text: string, urgent = false) => {
    setSpeakingId(id);
    await speakBanglaText(text, {
      urgent,
      onEnd: () => {
        setSpeakingId((curr) => (curr === id ? null : curr));
      },
    });
  };

  const handleStopSpeech = () => {
    stopBanglaSpeech();
    setSpeakingId(null);
  };

  const handleSaveOffline = async () => {
    if (!prescriptionId || medications.length === 0) return;
    const record: SavedScanRecord = {
      prescriptionId,
      savedAt: new Date().toISOString(),
      patientContext,
      medications,
      blisterChecks,
      prescriptionImageDataUrl: originalImageUrl ?? undefined,
    };
    await saveScanOffline(record);
    const updated = await loadSavedScansOffline();
    setSavedScans(updated);
    setJustSavedOffline(true);
    setTimeout(() => setJustSavedOffline(false), 2200);
  };

  const handleLoadSavedScan = async (scan: SavedScanRecord) => {
    setPrescriptionId(scan.prescriptionId);
    setPatientContext(scan.patientContext);
    setMedications(scan.medications);
    setBlisterChecks(scan.blisterChecks);
    setOriginalImageUrl(scan.prescriptionImageDataUrl ?? null);
    if (scan.prescriptionImageDataUrl) {
      const sauvola = await applySauvolaThreshold(scan.prescriptionImageDataUrl);
      setSauvolaImageUrl(sauvola);
    } else {
      setSauvolaImageUrl(null);
    }
    setActiveTab('scanner');
  };

  const handleDeleteSavedScan = async (id: string) => {
    await deleteSavedScanOffline(id);
    const updated = await loadSavedScansOffline();
    setSavedScans(updated);
  };

  const handleNewScan = () => {
    stopBanglaSpeech();
    setSpeakingId(null);
    setPrescriptionId('');
    setPatientContext({ detectedConditions: [], activeComorbidities: [] });
    setMedications([]);
    setBlisterChecks([]);
    setOriginalImageUrl(null);
    setSauvolaImageUrl(null);
    setRxError(null);
    setBlisterError(null);
    setActiveTab('scanner');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewScan={handleNewScan}
        lang={lang}
      />

      {/* Contextual Workspace Utility Toolbar (below header to keep TopBar clean) */}
      <div className="no-print border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="font-medium text-slate-900">
              {prescriptionId ? `Active Rx: ${prescriptionId}` : 'Ready for Scan'}
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums">{medications.length} medicines</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums">{clinicalAlerts.length} clinical alerts</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums">
              Est. MRP ৳{priceReport.totalStatutoryMrpBdt.toFixed(0)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {medications.length > 0 && (
              <button
                type="button"
                onClick={handleSaveOffline}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-teal-800 bg-slate-100 hover:bg-teal-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                {justSavedOffline ? (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    Saved Offline
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Save Offline
                  </>
                )}
              </button>
            )}

            <div
              role="group"
              aria-label="Interface language"
              className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1" aria-hidden="true" />
              <button
                type="button"
                aria-pressed={lang === 'en'}
                onClick={() => setLang('en')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  lang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                aria-pressed={lang === 'bn'}
                onClick={() => setLang('bn')}
                className={`px-2 py-0.5 text-xs font-medium font-bangla rounded transition-colors cursor-pointer ${
                  lang === 'bn' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'scanner' && (
          <ScannerWorkspace
            lang={lang}
            prescriptionId={prescriptionId}
            patientContext={patientContext}
            medications={medications}
            clinicalAlerts={clinicalAlerts}
            pipelinePayload={pipelinePayload}
            originalImageUrl={originalImageUrl}
            sauvolaImageUrl={sauvolaImageUrl}
            isProcessing={isProcessingRx}
            errorMessage={rxError}
            speakingId={speakingId}
            onUploadPrescriptionImage={handleUploadPrescriptionImage}
            onLoadDemoCase={handleLoadDemoCase}
            onToggleComorbidity={handleToggleComorbidity}
            onAddDetectedComorbiditiesFromVoice={handleAddDetectedComorbiditiesFromVoice}
            onConfirmAmbiguousCandidate={handleConfirmAmbiguousCandidate}
            onAddManualRxLine={handleAddManualRxLine}
            onRemoveMedication={handleRemoveMedication}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onProceedToBlister={() => setActiveTab('blister')}
            onProceedToCard={() => setActiveTab('caregiver')}
          />
        )}

        {activeTab === 'blister' && (
          <BlisterVerifier
            lang={lang}
            medications={medications}
            blisterChecks={blisterChecks}
            isVerifying={isVerifyingBlister}
            errorMessage={blisterError}
            speakingId={speakingId}
            onUploadBlisterImage={handleUploadBlisterImage}
            onRunDemoBlister={handleRunDemoBlister}
            onRunManualFoilText={handleRunManualFoilText}
            onClearBlisterChecks={() => setBlisterChecks([])}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onGoToScanner={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'caregiver' && (
          <CaregiverCardView
            lang={lang}
            prescriptionId={prescriptionId}
            patientContext={patientContext}
            medications={medications}
            priceReport={priceReport}
            speakingId={speakingId}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onGoToScanner={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'dgda' && (
          <DgdaIndexView
            lang={lang}
            savedScans={savedScans}
            onLoadSavedScan={handleLoadSavedScan}
            onDeleteSavedScan={handleDeleteSavedScan}
          />
        )}
      </main>

      {/* Quiet Clinical Disclaimer Footer */}
      <footer className="no-print border-t border-slate-200 bg-white mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            OshudhGuard AI · Clinical pharmacist safety co-pilot for Bangladeshi prescriptions &amp;
            loose blister strips
          </span>
          <span>
            Decision support only — always confirm dosage changes with a registered physician or
            Grade-A pharmacist.
          </span>
        </div>
      </footer>
    </div>
  );
}
