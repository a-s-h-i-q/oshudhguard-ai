import React, { useRef, useState } from 'react';
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  RefreshCw,
  ScanLine,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { DEMO_BLISTER_FIXTURES, type DemoBlisterFixture } from '../data/demoCases';
import { formatDrugLabel } from '../data/dgdaDatabase';
import type { BlisterVerificationResult, DecodedMedication } from '../types/clinical';

interface BlisterVerifierProps {
  lang: 'en' | 'bn';
  medications: DecodedMedication[];
  blisterChecks: BlisterVerificationResult[];
  isVerifying: boolean;
  errorMessage: string | null;
  speakingId: string | null;
  onUploadBlisterImage: (file: File) => void;
  onRunDemoBlister: (fixture: DemoBlisterFixture) => void;
  onRunManualFoilText: (foilImprint: string) => void;
  onClearBlisterChecks: () => void;
  onSpeakText: (id: string, text: string, urgent?: boolean) => void;
  onStopSpeech: () => void;
  onGoToScanner: () => void;
}

export const BlisterVerifier: React.FC<BlisterVerifierProps> = ({
  lang,
  medications,
  blisterChecks,
  isVerifying,
  errorMessage,
  speakingId,
  onUploadBlisterImage,
  onRunDemoBlister,
  onRunManualFoilText,
  onClearBlisterChecks,
  onSpeakText,
  onStopSpeech,
  onGoToScanner,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [manualFoilInput, setManualFoilInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const latestCheck = blisterChecks[0] ?? null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadBlisterImage(file);
    }
    e.target.value = '';
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFoilInput.trim()) {
      setManualError('Enter the text printed on the metallic blister foil (e.g., Sergel 40mg).');
      return;
    }
    setManualError(null);
    onRunManualFoilText(manualFoilInput.trim());
    setManualFoilInput('');
  };

  if (medications.length === 0) {
    return (
      <section className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-4">
        <ScanLine className="w-8 h-8 text-teal-700 mx-auto" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">
            Decode a Prescription First to Verify Blister Strips
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Stage 4 cross-modal verification compares the loose cut medicine foil strips handed to
            you at the pharmacy against your decoded prescription set.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToScanner}
          className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
        >
          Go to Prescription Scanner
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload loose blister strip photograph"
      />

      {/* Header + Capture Actions */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {lang === 'bn'
                ? 'খোলা ওষুধের পাতা (Blister-Strip) ক্রস-ভেরিফায়ার'
                : 'Physical Blister-Strip Cross-Verifier'}
            </h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              {lang === 'bn'
                ? 'ফার্মেসি থেকে দেওয়া খোলা অ্যালুমিনিয়াম পাতার ছবি তুলুন। CIE-LAB CLAHE গ্লেয়ার রিমুভাল ও বাইপার্টাইট ম্যাচিং ভুল মাত্রা বা ভুল ওষুধ তাৎক্ষণিক ধরে ফেলবে।'
                : 'Photograph loose cut metallic foil strips handed over at the pharmacy counter. Applies CIE-LAB luminance CLAHE glare removal and bipartite matching against your active prescription.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isVerifying}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            {lang === 'bn' ? 'পাতার ছবি তুলুন / আপলোড' : 'Capture / Upload Blister Strip'}
          </button>
        </div>

        {/* Active Prescribed Set Reference Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">Active Prescribed Set (C_Rx): </span>
          {medications.map((m) => formatDrugLabel(m.resolvedDrug)).join(' · ')}
        </div>

        {/* 4 Demo Physical Foil Strip Scenarios */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DEMO_BLISTER_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              disabled={isVerifying}
              onClick={() => onRunDemoBlister(fixture)}
              className="text-left p-3.5 rounded-lg border border-slate-200 bg-white hover:border-teal-700 hover:bg-teal-50/30 transition-colors cursor-pointer space-y-1"
            >
              <div className="text-xs font-mono text-slate-500">{fixture.foilBrandPrint}</div>
              <div className="text-sm font-semibold text-slate-900">
                {lang === 'bn' ? fixture.labelBn : fixture.labelEn}
              </div>
              <p className="text-xs text-slate-600">{fixture.expectedOutcomeHint}</p>
            </button>
          ))}
        </div>

        {/* Manual Foil Imprint Input */}
        <form onSubmit={handleManualSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
          <input
            type="text"
            aria-label="Manual blister foil imprint text"
            value={manualFoilInput}
            onChange={(e) => setManualFoilInput(e.target.value)}
            placeholder="Or type printed foil text (e.g. Sergel 40mg, Exium 20mg, Napa 500mg)"
            className="sm:col-span-9 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
          />
          <button
            type="submit"
            disabled={isVerifying}
            className="sm:col-span-3 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Verify Foil Imprint
          </button>
        </form>
        {manualError && (
          <p className="text-xs text-red-700" role="alert">
            {manualError}
          </p>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900"
          >
            <AlertOctagon className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* Active Verification Result & CLAHE Glare Removal Side-by-Side */}
      {isVerifying && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-3">
          <div className="h-5 w-64 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 bg-slate-100 rounded-lg" />
            <div className="h-48 bg-slate-100 rounded-lg" />
          </div>
        </div>
      )}

      {!isVerifying && latestCheck && (
        <section
          aria-label="Latest Blister Strip Verification Result"
          className={`rounded-xl border p-5 space-y-5 ${
            latestCheck.status === 'CRITICAL_MISMATCH'
              ? 'border-red-300 bg-red-50/70'
              : latestCheck.status === 'BIO_EQUIVALENT'
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-emerald-300 bg-emerald-50/70'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold">
                {latestCheck.status === 'CRITICAL_MISMATCH' && (
                  <>
                    <AlertOctagon className="w-5 h-5 text-red-700" aria-hidden="true" />
                    <span className="text-red-800">
                      CRITICAL DISPENSING MISMATCH — DO NOT CONSUME
                    </span>
                  </>
                )}
                {latestCheck.status === 'BIO_EQUIVALENT' && (
                  <>
                    <RefreshCw className="w-5 h-5 text-amber-800" aria-hidden="true" />
                    <span className="text-amber-900">
                      BIO-EQUIVALENT GENERIC SUBSTITUTION
                    </span>
                  </>
                )}
                {latestCheck.status === 'EXACT_MATCH' && (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                    <span className="text-emerald-900">EXACT MATCH VERIFIED</span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-sm">
                <div className="bg-white/90 border border-slate-200 rounded-lg px-3.5 py-2.5">
                  <div className="text-xs text-slate-500">Prescribed on Rx</div>
                  <div className="font-semibold text-slate-900">{latestCheck.prescribedItem}</div>
                </div>
                <div className="bg-white/90 border border-slate-200 rounded-lg px-3.5 py-2.5">
                  <div className="text-xs text-slate-500">
                    Detected on Strip (S={latestCheck.dispensedScore.toFixed(2)})
                  </div>
                  <div className="font-semibold text-slate-900">
                    {latestCheck.dispensedOnStrip}
                  </div>
                  <div className="text-xs text-slate-500">
                    {latestCheck.dispensedDrug.activeGenericDisplay} ·{' '}
                    {latestCheck.dispensedDrug.manufacturer} · ৳
                    {latestCheck.dispensedDrug.unitMrpBdt.toFixed(2)}/unit
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-800 pt-1">{latestCheck.reasonEnglish}</p>
              <p className="text-base font-bangla font-semibold text-slate-950">
                {latestCheck.alertBangla}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                speakingId === latestCheck.stripId
                  ? onStopSpeech()
                  : onSpeakText(
                      latestCheck.stripId,
                      latestCheck.alertBangla,
                      latestCheck.status === 'CRITICAL_MISMATCH',
                    )
              }
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                latestCheck.status === 'CRITICAL_MISMATCH'
                  ? 'bg-red-700 hover:bg-red-800 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {speakingId === latestCheck.stripId ? (
                <>
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                  Stop Alert
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  {latestCheck.status === 'CRITICAL_MISMATCH'
                    ? 'Play Bangla Voice Alert'
                    : 'Listen in Bangla'}
                </>
              )}
            </button>
          </div>

          {/* Original Metallic Foil vs CIE-LAB CLAHE Anti-Glare Preview */}
          {latestCheck.stripImageDataUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Raw Metallic Foil Capture (Specular Glare)
                </div>
                <img
                  src={latestCheck.stripImageDataUrl}
                  alt="Raw photograph of loose metallic blister strip"
                  referrerPolicy="no-referrer"
                  className="w-full h-48 object-cover rounded-md border border-slate-200"
                />
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-teal-800">
                  Stage 4 CIE-LAB Luminance CLAHE Processed (Anti-Glare OCR Ready)
                </div>
                <img
                  src={latestCheck.claheImageDataUrl || latestCheck.stripImageDataUrl}
                  alt="CLAHE anti-glare processed blister foil strip"
                  referrerPolicy="no-referrer"
                  className="w-full h-48 object-cover rounded-md border border-slate-200"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Checked Strips Ledger */}
      {blisterChecks.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Verified Strip Session Log ({blisterChecks.length})
            </h2>
            <button
              type="button"
              onClick={onClearBlisterChecks}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-red-700 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Clear Log
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Verification State</th>
                  <th className="py-2.5 px-3">Dispensed Foil Strip</th>
                  <th className="py-2.5 px-3">Prescribed Item</th>
                  <th className="py-2.5 px-3 text-right">Score</th>
                  <th className="py-2.5 px-3 text-right">Unit MRP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {blisterChecks.map((check) => (
                  <tr key={check.stripId} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-semibold text-xs whitespace-nowrap">
                      {check.status === 'EXACT_MATCH' && (
                        <span className="text-emerald-700">Exact Match</span>
                      )}
                      {check.status === 'BIO_EQUIVALENT' && (
                        <span className="text-amber-800">Bio-Equivalent</span>
                      )}
                      {check.status === 'CRITICAL_MISMATCH' && (
                        <span className="text-red-700">Critical Mismatch</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {check.dispensedOnStrip}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{check.prescribedItem}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs">
                      {check.dispensedScore.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      ৳{check.dispensedDrug.unitMrpBdt.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
