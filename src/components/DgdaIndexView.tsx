import React, { useMemo, useState } from 'react';
import { History, Search, Trash2, ArrowUpRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { DGDA_DRUG_DATABASE } from '../data/dgdaDatabase';
import { AMBIGUITY_THRESHOLD, RANKING_WEIGHTS, searchDgdaHybrid } from '../engine/grounding';
import type { SavedScanRecord } from '../types/clinical';

interface DgdaIndexViewProps {
  lang: 'en' | 'bn';
  savedScans: SavedScanRecord[];
  onLoadSavedScan: (scan: SavedScanRecord) => void;
  onDeleteSavedScan: (prescriptionId: string) => void;
}

export const DgdaIndexView: React.FC<DgdaIndexViewProps> = ({
  lang,
  savedScans,
  onLoadSavedScan,
  onDeleteSavedScan,
}) => {
  const [query, setQuery] = useState('Cap. Srgel 20');
  const [formHint, setFormHint] = useState<string>('Capsule');
  const [strengthHint, setStrengthHint] = useState<string>('20mg');
  const [scheduleHint, setScheduleHint] = useState<string>('1+0+1 a/c');

  const results = useMemo(
    () =>
      searchDgdaHybrid(query, {
        dosageFormHint: formHint || undefined,
        strengthHint: strengthHint || undefined,
        scheduleShorthand: scheduleHint || undefined,
        limit: 16,
      }),
    [query, formHint, strengthHint, scheduleHint],
  );

  const uniqueGenericsCount = useMemo(() => {
    const set = new Set<string>();
    DGDA_DRUG_DATABASE.forEach((d) => d.activeMoleculeIds.forEach((m) => set.add(m)));
    return set.size;
  }, []);

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {lang === 'bn'
              ? 'DGDA ব্র্যান্ড ইনডেক্স ও হাইব্রিড এন্টিটি গ্রাউন্ডিং'
              : 'DGDA Brand Index & Hybrid Entity Grounding'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            {lang === 'bn'
              ? 'অস্পষ্ট হাতের লেখার শব্দ দিয়ে পরীক্ষা করুন কীভাবে বহু-ফ্যাক্টর স্কোরিং (Cosine + Levenshtein + Double-Metaphone + Clinical Prior) সঠিক বাংলাদেশি ব্র্যান্ড নির্বাচন করে।'
              : 'Test noisy cursive prescription OCR queries against the local Bangladeshi DGDA registry using our Stage 3 multi-factor objective S(q, c) with fail-safe threshold 0.78.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
          <span>{DGDA_DRUG_DATABASE.length} Indexed BD Brands</span>
          <span aria-hidden="true">·</span>
          <span>{uniqueGenericsCount} Canonical Molecules</span>
          <span aria-hidden="true">·</span>
          <span>τ = {AMBIGUITY_THRESHOLD.toFixed(2)}</span>
        </div>
      </div>

      {/* Live Hybrid Scorer Controls */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Stage 3 Zero-Hallucination Grounding Formula Sandbox
          </h2>
          <code className="text-xs font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
            S(q, c) = {RANKING_WEIGHTS.alpha}·cos + {RANKING_WEIGHTS.beta}·Lev +{' '}
            {RANKING_WEIGHTS.gamma}·Phon + {RANKING_WEIGHTS.delta}·Φ(f,s,t)
          </code>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label
              htmlFor="dgda-query-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Noisy OCR Transcription Query (q)
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="dgda-query-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Cap. Srgel 20, Tab. Seklo, Naprosin..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="dgda-form-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Dosage Form (f)
            </label>
            <select
              id="dgda-form-select"
              value={formHint}
              onChange={(e) => setFormHint(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="">Any Form</option>
              <option value="Capsule">Capsule</option>
              <option value="Tablet">Tablet</option>
              <option value="Syrup">Syrup</option>
              <option value="Suspension">Suspension</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="dgda-strength-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Strength (s)
            </label>
            <input
              id="dgda-strength-input"
              type="text"
              value={strengthHint}
              onChange={(e) => setStrengthHint(e.target.value)}
              placeholder="20mg"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="dgda-schedule-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Meal-Timing Prior (t)
            </label>
            <select
              id="dgda-schedule-select"
              value={scheduleHint}
              onChange={(e) => setScheduleHint(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value="">None</option>
              <option value="1+0+1 a/c">1+0+1 a/c (Before meals)</option>
              <option value="1+0+1 p/c">1+0+1 p/c (After meals)</option>
              <option value="0+0+1 HS">0+0+1 HS (Bedtime)</option>
            </select>
          </div>
        </div>

        {/* Quick Preset Query Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-500">Test noisy queries:</span>
          {[
            { q: 'Cap. Srgel 20', f: 'Capsule', s: '20mg', t: '1+0+1 a/c' },
            { q: 'Tab. Seklo 20', f: 'Capsule', s: '20mg', t: '1+0+1 a/c' },
            { q: 'Tab. Mns 10', f: 'Tablet', s: '10mg', t: '0+0+1 HS' },
            { q: 'Tab. Naprosin 500', f: 'Tablet', s: '500mg', t: '1+0+1 p/c' },
            { q: 'Tab. Zymax 500', f: 'Tablet', s: '500mg', t: '1+0+1 p/c' },
          ].map((preset) => (
            <button
              key={preset.q}
              type="button"
              onClick={() => {
                setQuery(preset.q);
                setFormHint(preset.f);
                setStrengthHint(preset.s);
                setScheduleHint(preset.t);
              }}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {preset.q}
            </button>
          ))}
        </div>

        {/* Ranked DGDA Results Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-3">DGDA Brand &amp; Form</th>
                <th className="py-2.5 px-3">Canonical Generic &amp; Manufacturer</th>
                <th className="py-2.5 px-3 text-right">cos</th>
                <th className="py-2.5 px-3 text-right">Lev</th>
                <th className="py-2.5 px-3 text-right">Phon</th>
                <th className="py-2.5 px-3 text-right">Φ Prior</th>
                <th className="py-2.5 px-3 text-right">S(q, c)</th>
                <th className="py-2.5 px-3 text-right">Unit MRP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {results.map((item, idx) => {
                const aboveTau = item.breakdown.totalScore >= AMBIGUITY_THRESHOLD;
                return (
                  <tr
                    key={item.drug.id}
                    className={`${
                      idx === 0 ? 'bg-teal-50/40' : 'hover:bg-slate-50/70'
                    } transition-colors`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        {item.drug.brandName} {item.drug.strengthText}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.drug.dosageForm} ·{' '}
                        <span className="font-bangla">{item.drug.banglaName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-800 font-medium">
                        {item.drug.activeGenericDisplay}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.drug.manufacturer} · {item.drug.therapeuticClass}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                      {item.breakdown.denseCosine.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                      {item.breakdown.levenshteinNorm.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                      {item.breakdown.phoneticMatch.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                      {item.breakdown.clinicalPrior.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs font-semibold">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          aboveTau ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {idx === 0 &&
                          (aboveTau ? (
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          ))}
                        {item.breakdown.totalScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sm text-slate-900">
                      ৳{item.drug.unitMrpBdt.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Offline IndexedDB Saved Prescriptions Cache */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              {lang === 'bn'
                ? 'অফলাইন সংরক্ষিত প্রেসক্রিপশন (IndexedDB)'
                : 'Offline Saved Prescriptions (Local IndexedDB Cache)'}
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {savedScans.length} saved
          </span>
        </div>

        {savedScans.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
            <p className="text-sm text-slate-600">
              {lang === 'bn'
                ? 'এখনো কোনো প্রেসক্রিপশন অফলাইনে সংরক্ষিত নেই। স্ক্যানার থেকে "Save Offline" বাটনে ক্লিক করুন।'
                : 'No prescriptions cached offline yet. Decode any prescription and click "Save Offline" to access it without internet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {savedScans.map((scan) => (
              <div
                key={scan.prescriptionId}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="font-mono">{scan.prescriptionId}</span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span>{scan.patientContext.patientName || 'Outpatient Record'}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {scan.medications.length} medicines · {scan.blisterChecks.length} blister
                    checks · Saved {new Date(scan.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadSavedScan(scan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Open Record
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved prescription ${scan.prescriptionId}`}
                    onClick={() => onDeleteSavedScan(scan.prescriptionId)}
                    className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
