import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Moon,
  Printer,
  Square,
  Sun,
  Sunrise,
  Volume2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { buildWhatsAppCaregiverMessage, toBanglaDigits } from '../engine/banglaCompiler';
import { downloadCaregiverCardPng } from '../utils/cardExporter';
import type {
  DecodedMedication,
  PatientContext,
  PriceTransparencyReport,
} from '../types/clinical';

interface CaregiverCardViewProps {
  lang: 'en' | 'bn';
  prescriptionId: string;
  patientContext: PatientContext;
  medications: DecodedMedication[];
  priceReport: PriceTransparencyReport;
  speakingId: string | null;
  onSpeakText: (id: string, text: string, urgent?: boolean) => void;
  onStopSpeech: () => void;
  onGoToScanner: () => void;
}

export const CaregiverCardView: React.FC<CaregiverCardViewProps> = ({
  lang,
  prescriptionId,
  patientContext,
  medications,
  priceReport,
  speakingId,
  onSpeakText,
  onStopSpeech,
  onGoToScanner,
}) => {
  const [whatsappCopied, setWhatsappCopied] = useState(false);
  const [pharmacyBillInput, setPharmacyBillInput] = useState('');

  const fullBanglaScript = useMemo(() => {
    return medications.map((m) => m.compiledSchedule.banglaVoiceText).join(' ');
  }, [medications]);

  const parsedQuotedBill = parseFloat(pharmacyBillInput);
  const overchargeAmount =
    Number.isFinite(parsedQuotedBill) && parsedQuotedBill > 0
      ? Number((parsedQuotedBill - priceReport.totalStatutoryMrpBdt).toFixed(2))
      : null;

  const handleCopyWhatsApp = async () => {
    const msg = buildWhatsAppCaregiverMessage(
      prescriptionId,
      patientContext.patientName,
      medications,
      priceReport.totalStatutoryMrpBdt,
    );
    try {
      await navigator.clipboard.writeText(msg);
      setWhatsappCopied(true);
      setTimeout(() => setWhatsappCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  if (medications.length === 0) {
    return (
      <section className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-4">
        <Sunrise className="w-8 h-8 text-amber-600 mx-auto" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">
            No Caregiver Schedule Generated Yet
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Decode a prescription first to generate the Zero-Literacy Sun/Moon Visual Caregiver
            Card, spoken Bangla instructions, and DGDA statutory price comparison.
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
    <div className="space-y-8">
      {/* Action Header Bar */}
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {lang === 'bn'
              ? 'সূর্য/চাঁদ ভিজ্যুয়াল কেয়ারগিভার কার্ড ও সরকারি MRP তালিকা'
              : 'Sun/Moon Caregiver Card & DGDA Price Transparency'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            {lang === 'bn'
              ? 'বয়স্ক ও স্বল্প-শিক্ষিত রোগীদের জন্য সকাল-দুপুর-রাতের সহজ ভিজ্যুয়াল কার্ড, বাংলা ভয়েস নির্দেশনা এবং সরকারি DGDA সর্বোচ্চ খুচরা মূল্য।'
              : 'Deterministic zero-hallucination Bangla schedule for elderly caregivers with spoken audio, printable PNG export, and DGDA statutory MRP verification.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              speakingId === 'full-schedule'
                ? onStopSpeech()
                : onSpeakText('full-schedule', fullBanglaScript)
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {speakingId === 'full-schedule' ? (
              <>
                <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                Stop Voice
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                পুরো তালিকা শুনুন (বাংলা)
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              downloadCaregiverCardPng(
                prescriptionId,
                patientContext,
                medications,
                priceReport.totalStatutoryMrpBdt,
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Save PNG
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print
          </button>

          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {whatsappCopied ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                Copied for WhatsApp
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                WhatsApp Text
              </>
            )}
          </button>
        </div>
      </div>

      {/* HIGH-CONTRAST SUN/MOON CAREGIVER CARD */}
      <section
        aria-label="Sun and Moon Visual Medication Schedule Card"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        {/* Card Masthead */}
        <div className="bg-teal-800 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold font-bangla">
              ওষুধ খাওয়ার দৈনিক সময়সূচী · Daily Medication Guide
            </div>
            <div className="text-xs text-teal-100 mt-0.5">
              {patientContext.patientName || 'Outpatient Caregiver Card'}
              {patientContext.age ? ` · Age ${patientContext.age}y` : ''} · Rx {prescriptionId}
            </div>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div className="text-xs text-teal-100">DGDA Statutory Total</div>
            <div className="text-lg font-bold">
              ৳{priceReport.totalStatutoryMrpBdt.toFixed(0)}
            </div>
          </div>
        </div>

        {/* Visual Sun/Moon Schedule Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="py-3.5 px-5 text-sm font-semibold text-slate-900">
                  ওষুধের নাম · Medicine
                </th>
                <th className="py-3.5 px-4 text-center bg-amber-50/70 border-x border-slate-200 min-w-[120px]">
                  <div className="inline-flex flex-col items-center gap-1 text-amber-800">
                    <Sunrise className="w-5 h-5" aria-hidden="true" />
                    <span className="text-sm font-bold font-bangla">সকাল</span>
                    <span className="text-[11px] font-medium">Morning</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center bg-sky-50/70 border-r border-slate-200 min-w-[120px]">
                  <div className="inline-flex flex-col items-center gap-1 text-sky-800">
                    <Sun className="w-5 h-5" aria-hidden="true" />
                    <span className="text-sm font-bold font-bangla">দুপুর</span>
                    <span className="text-[11px] font-medium">Noon</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center bg-indigo-50/70 border-r border-slate-200 min-w-[120px]">
                  <div className="inline-flex flex-col items-center gap-1 text-indigo-900">
                    <Moon className="w-5 h-5" aria-hidden="true" />
                    <span className="text-sm font-bold font-bangla">রাত</span>
                    <span className="text-[11px] font-medium">Night</span>
                  </div>
                </th>
                <th className="no-print py-3.5 px-4 text-right text-xs font-semibold text-slate-600">
                  Voice
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {medications.map((med) => {
                const s = med.compiledSchedule;
                const isSpeaking = speakingId === `card-${med.lineId}`;

                const renderDoseCell = (count: number, dotColorClass: string) => {
                  if (count <= 0) {
                    return <span className="text-slate-300 font-mono text-lg">—</span>;
                  }
                  const dotCount = Math.min(4, Math.ceil(count));
                  return (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
                        {Array.from({ length: dotCount }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-3.5 h-3.5 rounded-full ${dotColorClass}`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold font-bangla text-slate-900 tabular-nums">
                        {toBanglaDigits(count)} টি
                      </span>
                    </div>
                  );
                };

                return (
                  <tr key={med.lineId} className="hover:bg-slate-50/50">
                    <td className="py-4 px-5">
                      <div className="text-base font-bold text-slate-900">
                        {med.resolvedDrug.brandName} {med.resolvedDrug.strengthText}{' '}
                        <span className="font-bangla text-teal-800">
                          ({med.resolvedDrug.banglaName})
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {med.resolvedDrug.activeGenericDisplay} · {med.resolvedDrug.dosageForm} ·{' '}
                        <span className="font-semibold text-slate-800 font-bangla">
                          {s.banglaTimingLabel}
                        </span>{' '}
                        ·{' '}
                        <span className="font-bangla">
                          {toBanglaDigits(s.durationDays)} দিন
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-bangla text-slate-800">
                        {s.banglaVoiceText}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center bg-amber-50/25 border-x border-slate-200">
                      {renderDoseCell(s.morning, 'bg-amber-600')}
                    </td>
                    <td className="py-4 px-4 text-center bg-sky-50/25 border-r border-slate-200">
                      {renderDoseCell(s.noon, 'bg-sky-600')}
                    </td>
                    <td className="py-4 px-4 text-center bg-indigo-50/25 border-r border-slate-200">
                      {renderDoseCell(s.night, 'bg-indigo-700')}
                    </td>
                    <td className="no-print py-4 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          isSpeaking
                            ? onStopSpeech()
                            : onSpeakText(`card-${med.lineId}`, s.banglaVoiceText)
                        }
                        aria-label={`Speak Bangla schedule for ${med.resolvedDrug.brandName}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        {isSpeaking ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                            শুনুন
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* STAGE 5: DGDA OFFICIAL MRP & BIO-EQUIVALENT PRICE TRANSPARENCY */}
      <section className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {lang === 'bn'
                ? 'DGDA সরকারি সর্বোচ্চ মূল্য (MRP) ও সমমানের সাশ্রয়ী ব্র্যান্ড'
                : 'DGDA Official MRP Bill Checker & Bio-Equivalent Savings'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Prevent pharmacy overcharging on unmarked loose strips and compare verified
              bio-equivalent Bangladeshi DGDA brands.
            </p>
          </div>

          <div className="flex items-end gap-3">
            <div>
              <label
                htmlFor="pharmacy-bill-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Pharmacy Asked Bill (৳ BDT)
              </label>
              <input
                id="pharmacy-bill-input"
                type="number"
                min="0"
                step="1"
                value={pharmacyBillInput}
                onChange={(e) => setPharmacyBillInput(e.target.value)}
                placeholder={`e.g. ${Math.round(priceReport.totalStatutoryMrpBdt * 1.25)}`}
                className="w-44 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-200 py-4">
          <div>
            <div className="text-xs text-slate-500">Prescribed DGDA Statutory Bill</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              ৳{priceReport.totalStatutoryMrpBdt.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Lowest Bio-Equivalent DGDA Total</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-teal-800 mt-0.5">
              ৳{priceReport.minBioEquivalentTotalBdt.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Verified Generic Cost Savings</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              ৳{priceReport.potentialSavingsBdt.toFixed(2)}{' '}
              <span className="text-sm font-semibold">
                ({priceReport.potentialSavingsPercent}% saved)
              </span>
            </div>
          </div>
        </div>

        {/* Pharmacy Overcharging Check Banner */}
        {overchargeAmount !== null && (
          <div
            role="status"
            className={`flex items-center gap-2.5 p-3.5 rounded-lg border text-sm ${
              overchargeAmount > 5
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {overchargeAmount > 5 ? (
              <>
                <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Potential MRP Overcharge Detected:</strong> Pharmacy quoted{' '}
                  <span className="font-mono font-semibold">৳{parsedQuotedBill.toFixed(2)}</span>,
                  which is{' '}
                  <span className="font-mono font-semibold">৳{overchargeAmount.toFixed(2)}</span>{' '}
                  above the DGDA statutory total of{' '}
                  <span className="font-mono font-semibold">
                    ৳{priceReport.totalStatutoryMrpBdt.toFixed(2)}
                  </span>
                  .
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>
                  Pharmacy quote of{' '}
                  <span className="font-mono font-semibold">৳{parsedQuotedBill.toFixed(2)}</span>{' '}
                  is within the official DGDA statutory MRP ceiling.
                </span>
              </>
            )}
          </div>
        )}

        {/* Line-by-Line MRP & Bio-Equivalent Brands Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-3">Prescribed Brand</th>
                <th className="py-2.5 px-3 text-right">Units</th>
                <th className="py-2.5 px-3 text-right">Unit MRP</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
                <th className="py-2.5 px-3">Cheaper Bio-Equivalent DGDA Brand</th>
                <th className="py-2.5 px-3 text-right">Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceReport.rows.map((row) => (
                <tr key={row.medication.lineId} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">
                      {row.medication.resolvedDrug.brandName}{' '}
                      {row.medication.resolvedDrug.strengthText}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.medication.resolvedDrug.activeGenericDisplay} ·{' '}
                      {row.medication.resolvedDrug.manufacturer}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    {row.totalUnits}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    ৳{row.unitMrpBdt.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    ৳{row.lineTotalBdt.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3">
                    {row.cheapestAlternative ? (
                      <div>
                        <div className="font-medium text-teal-900">
                          {row.cheapestAlternative.drug.brandName}{' '}
                          {row.cheapestAlternative.drug.strengthText} · ৳
                          {row.cheapestAlternative.drug.unitMrpBdt.toFixed(2)}/unit
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.cheapestAlternative.drug.manufacturer}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Lowest indexed DGDA rate</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs font-semibold">
                    {row.cheapestAlternative ? (
                      <span className="text-emerald-700">
                        -৳{row.cheapestAlternative.savingsBdt.toFixed(0)} (
                        {row.cheapestAlternative.savingsPercent}%)
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
