import React, { useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileText,
  Mic,
  MicOff,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Volume2,
  Square,
} from 'lucide-react';
import { COMORBIDITY_METADATA } from '../data/clinicalGraph';
import { DEMO_PRESCRIPTION_CASES, type DemoPrescriptionCase } from '../data/demoCases';
import { formatDrugLabel } from '../data/dgdaDatabase';
import { AMBIGUITY_THRESHOLD } from '../engine/grounding';
import type {
  ClinicalAlert,
  ComorbidityId,
  DecodedMedication,
  DgdaDrugRecord,
  PatientContext,
  PrescriptionPipelinePayload,
} from '../types/clinical';

interface ScannerWorkspaceProps {
  lang: 'en' | 'bn';
  prescriptionId: string;
  patientContext: PatientContext;
  medications: DecodedMedication[];
  clinicalAlerts: ClinicalAlert[];
  pipelinePayload: PrescriptionPipelinePayload;
  originalImageUrl: string | null;
  sauvolaImageUrl: string | null;
  isProcessing: boolean;
  errorMessage: string | null;
  speakingId: string | null;
  onUploadPrescriptionImage: (file: File) => void;
  onLoadDemoCase: (demo: DemoPrescriptionCase) => void;
  onToggleComorbidity: (id: ComorbidityId) => void;
  onAddDetectedComorbiditiesFromVoice: (transcript: string) => void;
  onConfirmAmbiguousCandidate: (lineId: string, chosenDrug: DgdaDrugRecord) => void;
  onAddManualRxLine: (ocrRaw: string, shorthand: string) => void;
  onRemoveMedication: (lineId: string) => void;
  onSpeakText: (id: string, text: string, urgent?: boolean) => void;
  onStopSpeech: () => void;
  onProceedToBlister: () => void;
  onProceedToCard: () => void;
}

type DocViewMode = 'original' | 'sauvola' | 'zones';

const ALL_COMORBIDITIES: ComorbidityId[] = [
  'CKD',
  'PREGNANCY',
  'DIABETES',
  'HYPERTENSION',
  'PEDIATRIC',
  'HEPATIC',
  'ASTHMA',
  'GASTRIC_ULCER',
];

export const ScannerWorkspace: React.FC<ScannerWorkspaceProps> = ({
  lang,
  prescriptionId,
  patientContext,
  medications,
  clinicalAlerts,
  pipelinePayload,
  originalImageUrl,
  sauvolaImageUrl,
  isProcessing,
  errorMessage,
  speakingId,
  onUploadPrescriptionImage,
  onLoadDemoCase,
  onToggleComorbidity,
  onAddDetectedComorbiditiesFromVoice,
  onConfirmAmbiguousCandidate,
  onAddManualRxLine,
  onRemoveMedication,
  onSpeakText,
  onStopSpeech,
  onProceedToBlister,
  onProceedToCard,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [docViewMode, setDocViewMode] = useState<DocViewMode>('zones');
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  // Manual Rx line addition form state
  const [manualDrugInput, setManualDrugInput] = useState('');
  const [manualShorthandInput, setManualShorthandInput] = useState('1+0+1 p/c for 7 days');
  const [manualFormError, setManualFormError] = useState<string | null>(null);

  // Voice comorbidity recorder state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceNoteStatus, setVoiceNoteStatus] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const ambiguousMeds = useMemo(
    () => medications.filter((m) => m.requiresHumanVerification && !m.humanConfirmed),
    [medications],
  );

  const highAlertsCount = useMemo(
    () => clinicalAlerts.filter((a) => a.severity === 'HIGH').length,
    [clinicalAlerts],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadPrescriptionImage(file);
    }
    e.target.value = '';
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDrugInput.trim()) {
      setManualFormError('Enter a medicine name (e.g., Cap. Srgel 20 or Tab. Napa 500).');
      return;
    }
    setManualFormError(null);
    onAddManualRxLine(manualDrugInput.trim(), manualShorthandInput.trim() || '1+0+1 p/c 7d');
    setManualDrugInput('');
  };

  const handleVoiceComorbidityToggle = async () => {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    setVoiceNoteStatus(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceNoteStatus('Microphone unavailable in this browser. Use the health condition toggles.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = String(reader.result || '');
          const base64 = dataUrl.split(',')[1];
          if (!base64) return;
          setVoiceNoteStatus('Transcribing spoken condition note...');
          try {
            const resp = await fetch('/api/transcribe-comorbidities', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm' }),
            });
            const data = (await resp.json()) as { transcript?: string; error?: string };
            if (resp.ok && data.transcript) {
              onAddDetectedComorbiditiesFromVoice(data.transcript);
              setVoiceNoteStatus(`Detected from voice: "${data.transcript}"`);
            } else {
              setVoiceNoteStatus(data.error || 'Could not transcribe audio note.');
            }
          } catch {
            setVoiceNoteStatus('Voice transcription unavailable offline. Use the toggles below.');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
      setVoiceNoteStatus('Listening... speak patient conditions (e.g., "কিডনি রোগ ও ডায়াবেটিস") then click stop.');
    } catch {
      setVoiceNoteStatus('Microphone permission denied. Select conditions manually below.');
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(pipelinePayload, null, 2));
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(pipelinePayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prescriptionId}-pipeline.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const displayedImage =
    docViewMode === 'sauvola' && sauvolaImageUrl ? sauvolaImageUrl : originalImageUrl;

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload prescription photograph"
      />

      {/* Capture / Demo Prescription Selector Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {lang === 'bn'
                ? 'বাংলাদেশি প্রেসক্রিপশন ডিকোডার ও ক্লিনিক্যাল সেফটি অডিট'
                : 'Bangladeshi Prescription Decoder & Clinical Safety Audit'}
            </h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              {lang === 'bn'
                ? 'হাতে লেখা প্রেসক্রিপশনের ছবি তুলুন বা নিচের নমুনা কেস নির্বাচন করুন — DGDA ব্র্যান্ড গ্রাউন্ডিং, ডুপ্লিকেট জেনেরিক ও কিডনি/গর্ভাবস্থা সতর্কতা তাৎক্ষণিক যাচাই হবে।'
                : 'Capture or upload a handwritten outpatient prescription, or run a real Bangladeshi clinical case to verify DGDA brands, duplicate generics, interactions, and Bangla dosage.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              {lang === 'bn' ? 'প্রেসক্রিপশন ছবি তুলুন / আপলোড' : 'Upload / Capture Rx Photo'}
            </button>
            <button
              type="button"
              onClick={() => setShowJsonPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Code2 className="w-4 h-4" aria-hidden="true" />
              {showJsonPanel ? 'Hide JSON' : 'Pipeline JSON'}
            </button>
          </div>
        </div>

        {/* 3 Curated Bangladeshi Clinical Demo Prescriptions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMO_PRESCRIPTION_CASES.map((demo) => {
            const isSelected = prescriptionId === demo.prescriptionId;
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => onLoadDemoCase(demo)}
                disabled={isProcessing}
                className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-teal-700 bg-teal-50/50'
                    : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-500">{demo.prescriptionId}</span>
                  <span className="text-xs font-medium text-teal-800">
                    {isSelected ? 'Active Case' : 'Run Case'}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {lang === 'bn' ? demo.titleBn : demo.titleEn}
                </div>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{demo.subtitle}</p>
              </button>
            );
          })}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900"
          >
            <AlertOctagon className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>{errorMessage}</div>
          </div>
        )}
      </section>

      {/* Processing Skeleton State */}
      {isProcessing && (
        <div
          aria-live="polite"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 animate-pulse"
        >
          <div className="h-5 w-72 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 h-80 bg-slate-100 rounded-lg" />
            <div className="lg:col-span-7 space-y-3">
              <div className="h-16 bg-slate-100 rounded-lg" />
              <div className="h-16 bg-slate-100 rounded-lg" />
              <div className="h-16 bg-slate-100 rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Empty State Prompt */}
      {!isProcessing && medications.length === 0 && (
        <section className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-4">
          <Upload className="w-8 h-8 text-teal-700 mx-auto" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {lang === 'bn'
                ? 'কোনো প্রেসক্রিপশন লোড করা হয়নি'
                : 'No Prescription Loaded Yet'}
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Upload a photograph of any Bangladeshi handwritten prescription or select one of the
              three clinical demo cases above to run the 6-stage neuro-symbolic safety pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onLoadDemoCase(DEMO_PRESCRIPTION_CASES[0])}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              Load CKD Polypharmacy Demo
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Choose Prescription Image
            </button>
          </div>
        </section>
      )}

      {/* Main 2-Column Clinical Workbench */}
      {!isProcessing && medications.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Stage 1 Document Viewer + Stage 5 Comorbidity Controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Stage 1 Pre-Processing & Zone Segmentation Viewer */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Stage 1 Document &amp; Zones
                </h2>
                <div
                  role="tablist"
                  aria-label="Document image filter mode"
                  className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg"
                >
                  {(
                    [
                      { id: 'zones', label: 'Zones A/B/C' },
                      { id: 'sauvola', label: 'Sauvola Ink' },
                      { id: 'original', label: 'Original' },
                    ] as Array<{ id: DocViewMode; label: string }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="tab"
                      aria-selected={docViewMode === mode.id}
                      onClick={() => setDocViewMode(mode.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        docViewMode === mode.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {displayedImage ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={displayedImage}
                    alt="Uploaded Bangladeshi outpatient prescription document"
                    referrerPolicy="no-referrer"
                    className="w-full h-auto block"
                  />

                  {/* Stage 1 Zone A/B/C Structural Segmentation Overlay */}
                  {docViewMode === 'zones' && (
                    <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                      {/* Zone A: Clinical Header & Diagnosis Notes */}
                      <div
                        className="absolute border-2 border-sky-600/80 bg-sky-500/5 rounded"
                        style={{ top: '13.4%', left: '3.8%', width: '92.4%', height: '16.5%' }}
                      >
                        <span className="inline-block bg-sky-700 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-br">
                          Zone A · Diagnosis Notes
                        </span>
                      </div>

                      {/* Zone B: Rx Medication Block */}
                      <div
                        className="absolute border-2 border-teal-700/80 bg-teal-500/5 rounded"
                        style={{ top: '36.2%', left: '27%', width: '37.5%', height: '52%' }}
                      >
                        <span className="inline-block bg-teal-700 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-br">
                          Zone B · Rx Block
                        </span>
                      </div>

                      {/* Zone C: Schedule & Duration Column */}
                      <div
                        className="absolute border-2 border-amber-600/80 bg-amber-500/5 rounded"
                        style={{ top: '36.2%', left: '65.2%', width: '31%', height: '52%' }}
                      >
                        <span className="inline-block bg-amber-700 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-br">
                          Zone C · Schedule
                        </span>
                      </div>

                      {/* Highlight ambiguous bounding box if any line < 0.78 */}
                      {ambiguousMeds.map((med) =>
                        med.bbox ? (
                          <div
                            key={med.lineId}
                            className="absolute border-2 border-red-600 bg-red-500/15 rounded"
                            style={{
                              top: `${med.bbox[0] / 10}%`,
                              left: `${med.bbox[1] / 10}%`,
                              height: `${(med.bbox[2] - med.bbox[0]) / 10}%`,
                              width: `${(med.bbox[3] - med.bbox[1]) / 10}%`,
                            }}
                          >
                            <span className="inline-block bg-red-700 text-white text-[10px] font-mono px-1.5 py-0.5">
                              S={med.groundingScore.toFixed(2)} &lt; 0.78 · Verify
                            </span>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                  Manual prescription session — upload a photo anytime for Zone A/B/C visual
                  verification.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                <span>
                  {patientContext.doctorName || 'Outpatient Prescription'}
                  {patientContext.clinicName ? ` · ${patientContext.clinicName}` : ''}
                </span>
                <span className="font-mono tabular-nums">{prescriptionId}</span>
              </div>
            </section>

            {/* Stage 5 Interactive Patient Comorbidity Filter */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {lang === 'bn'
                      ? 'রোগীর শারীরিক অবস্থা (Comorbidity Filter)'
                      : 'Patient Comorbidity & Risk Profile'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {patientContext.patientName || 'Patient'}
                    {patientContext.age ? ` · ${patientContext.age}y` : ''}
                    {patientContext.sex ? ` · ${patientContext.sex}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleVoiceComorbidityToggle}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    isRecordingVoice
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isRecordingVoice ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                      Stop Voice
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                      Voice Note
                    </>
                  )}
                </button>
              </div>

              {patientContext.detectedConditions.length > 0 && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-800">Zone A Notes: </span>
                  {patientContext.detectedConditions.join(' · ')}
                </div>
              )}

              {voiceNoteStatus && (
                <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                  {voiceNoteStatus}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {ALL_COMORBIDITIES.map((cid) => {
                  const active = patientContext.activeComorbidities.includes(cid);
                  const meta = COMORBIDITY_METADATA[cid];
                  return (
                    <button
                      key={cid}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onToggleComorbidity(cid)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-700 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">
                        {lang === 'bn' ? meta.labelBn : meta.labelEn}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 shrink-0 text-teal-700" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Safety Alerts + Ambiguity Resolution + Decoded Rx Table */}
          <div className="lg:col-span-7 space-y-6">
            {/* Stage 5 Clinical Safety Audit Panel */}
            <section
              aria-label="Clinical Safety Audit Alerts"
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {clinicalAlerts.length > 0 ? (
                    <ShieldAlert className="w-5 h-5 text-red-700" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                  )}
                  <h2 className="text-base font-semibold text-slate-900">
                    {lang === 'bn'
                      ? 'ক্লিনিক্যাল সেফটি গ্রাফ অডিট (ডুপ্লিকেট ও ঝুঁকি)'
                      : 'Active-Molecule Clinical Safety Audit'}
                  </h2>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-600">
                  {clinicalAlerts.length === 0
                    ? '0 Conflicts Detected'
                    : `${highAlertsCount} High · ${clinicalAlerts.length - highAlertsCount} Moderate`}
                </div>
              </div>

              {clinicalAlerts.length === 0 ? (
                <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/70 text-sm text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>
                    No duplicate active generics, major Drug-Drug Interactions, or comorbidity
                    contraindications detected for the selected patient profile.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {clinicalAlerts.map((alert) => {
                    const isHigh = alert.severity === 'HIGH';
                    const isSpeakingThis = speakingId === alert.id;
                    return (
                      <article
                        key={alert.id}
                        className={`p-4 rounded-lg border space-y-2 ${
                          isHigh
                            ? 'border-red-200 bg-red-50/60'
                            : 'border-amber-200 bg-amber-50/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            {isHigh ? (
                              <AlertOctagon className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                            )}
                            <span className={isHigh ? 'text-red-800' : 'text-amber-800'}>
                              {alert.severity} · {alert.alertType.replace(/_/g, ' ')}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="text-slate-900">{alert.drugInvolved}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              isSpeakingThis
                                ? onStopSpeech()
                                : onSpeakText(alert.id, alert.banglaReason, true)
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
                          >
                            {isSpeakingThis ? (
                              <>
                                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                                বাংলা সতর্কতা শুনুন
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-sm text-slate-800 leading-relaxed">
                          {alert.clinicalReason}
                        </p>
                        <p className="text-sm font-bangla font-medium text-slate-900">
                          {alert.banglaReason}
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">Action: </span>
                          {alert.recommendation}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Stage 3 Human-in-the-Loop Ambiguity Alerts (Score < 0.78) */}
            {ambiguousMeds.length > 0 && (
              <section
                aria-label="Human-in-the-Loop Ambiguity Alerts"
                className="bg-amber-50/70 border border-amber-300 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-semibold text-amber-950">
                      Human-in-the-Loop Ambiguity Alert (Confidence &lt; {AMBIGUITY_THRESHOLD})
                    </h2>
                    <p className="text-xs text-amber-900 mt-0.5">
                      OshudhGuard AI abstained from guessing an illegible handwritten scribble.
                      Confirm the correct DGDA candidate below to finalize safety and dosage.
                    </p>
                  </div>
                </div>

                {ambiguousMeds.map((med) => (
                  <div
                    key={med.lineId}
                    className="bg-white border border-amber-200 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Raw OCR Scribble: </span>
                        <code className="font-mono font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                          {med.ocrRaw}
                        </code>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600">Schedule: {med.scheduleShorthand}</span>
                      </div>
                      <span className="font-mono tabular-nums text-amber-800 font-semibold">
                        Top Score: {med.groundingScore.toFixed(2)} &lt; 0.78
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {med.topCandidates.slice(0, 2).map((cand) => (
                        <button
                          key={cand.drug.id}
                          type="button"
                          onClick={() => onConfirmAmbiguousCandidate(med.lineId, cand.drug)}
                          className="text-left p-3 rounded-lg border border-slate-200 hover:border-teal-700 hover:bg-teal-50/40 transition-colors cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {formatDrugLabel(cand.drug)}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-teal-800 font-semibold">
                              S={cand.breakdown.totalScore.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600">
                            {cand.drug.activeGenericDisplay} · {cand.drug.manufacturer}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            cos {cand.breakdown.denseCosine.toFixed(2)} · Lev{' '}
                            {cand.breakdown.levenshteinNorm.toFixed(2)} · Phon{' '}
                            {cand.breakdown.phoneticMatch.toFixed(2)} · Φ{' '}
                            {cand.breakdown.clinicalPrior.toFixed(2)}
                          </div>
                          <div className="pt-1 text-xs font-semibold text-teal-800">
                            Confirm this medicine
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Stage 2 + 3 + 6 Decoded Medications Ledger */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {lang === 'bn'
                      ? 'ডিকোডকৃত ওষুধের তালিকা (DGDA গ্রাউন্ডেড)'
                      : 'Decoded Medications (DGDA Grounded)'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {medications.length} prescription lines resolved against indexed Bangladeshi
                    trade brands
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onProceedToBlister}
                    className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Verify Blister Strips →
                  </button>
                  <button
                    type="button"
                    onClick={onProceedToCard}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Sun/Moon Card →
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {medications.map((med) => {
                  const isSpeaking = speakingId === med.lineId;
                  const needsCheck = med.requiresHumanVerification && !med.humanConfirmed;
                  return (
                    <div key={med.lineId} className="p-4 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                              {formatDrugLabel(med.resolvedDrug)}
                            </span>
                            <span className="text-sm font-bangla text-slate-600">
                              ({med.resolvedDrug.banglaName})
                            </span>
                            {needsCheck ? (
                              <span className="text-xs font-semibold text-amber-800">
                                · Needs Confirmation
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-700">
                                · Grounded {med.groundingScore.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600">
                            <span>{med.resolvedDrug.activeGenericDisplay}</span>
                            <span aria-hidden="true" className="mx-1.5 text-slate-300">
                              ·
                            </span>
                            <span>{med.resolvedDrug.manufacturer}</span>
                            <span aria-hidden="true" className="mx-1.5 text-slate-300">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-slate-800">
                              MRP ৳{med.resolvedDrug.unitMrpBdt.toFixed(2)}/unit
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            OCR: &ldquo;{med.ocrRaw}&rdquo; → Shorthand: {med.scheduleShorthand} (
                            {med.compiledSchedule.totalUnits} units)
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              isSpeaking
                                ? onStopSpeech()
                                : onSpeakText(med.lineId, med.compiledSchedule.banglaVoiceText)
                            }
                            aria-label={`Play Bangla voice instruction for ${med.resolvedDrug.brandName}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {isSpeaking ? (
                              <>
                                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                                শুনুন
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveMedication(med.lineId)}
                            aria-label={`Remove ${med.resolvedDrug.brandName} from prescription`}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-bangla text-slate-800">
                        {med.compiledSchedule.banglaVoiceText}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Additional Handwritten Rx Line Manually */}
              <form
                onSubmit={handleManualSubmit}
                className="pt-2 border-t border-slate-200 space-y-2"
              >
                <div className="text-xs font-semibold text-slate-700">
                  Add / Test Another Prescription Line (Runs Stage 3 Grounding + Stage 5 Audit)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    aria-label="OCR medicine line text"
                    value={manualDrugInput}
                    onChange={(e) => setManualDrugInput(e.target.value)}
                    placeholder="e.g. Tab. Clopid 75 or Cap. Seclo 20"
                    className="sm:col-span-5 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                  <input
                    type="text"
                    aria-label="Clinical dosage shorthand"
                    value={manualShorthandInput}
                    onChange={(e) => setManualShorthandInput(e.target.value)}
                    placeholder="1+0+1 a/c 30m for 14 days"
                    className="sm:col-span-4 px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add Rx Line
                  </button>
                </div>
                {manualFormError && (
                  <p className="text-xs text-red-700" role="alert">
                    {manualFormError}
                  </p>
                )}
              </form>
            </section>

            {/* Sample Pipeline JSON Output Payload Drawer (Page 6 Specification) */}
            {showJsonPanel && (
              <section className="bg-slate-900 text-slate-100 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="w-4 h-4 text-teal-400" aria-hidden="true" />
                    Structured Pipeline JSON Payload
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      {jsonCopied ? 'Copied' : 'Copy JSON'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Export
                    </button>
                  </div>
                </div>
                <pre className="text-xs font-mono text-slate-200 overflow-x-auto max-h-96 leading-relaxed">
                  {JSON.stringify(pipelinePayload, null, 2)}
                </pre>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
