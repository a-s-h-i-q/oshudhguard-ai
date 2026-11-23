import {
  COMORBIDITY_CONTRAINDICATIONS,
  COMORBIDITY_METADATA,
  DDI_GRAPH_EDGES,
  MOLECULE_NODES,
} from '../data/clinicalGraph';
import { DGDA_DRUG_DATABASE, formatDrugLabel } from '../data/dgdaDatabase';
import { toBanglaDigits } from './banglaCompiler';
import { scoreDrugCandidate } from './grounding';
import type {
  BioEquivalentOption,
  BlisterVerificationResult,
  ClinicalAlert,
  ComorbidityId,
  DecodedMedication,
  DgdaDrugRecord,
  MedicationPriceRow,
  PatientContext,
  PrescriptionPipelinePayload,
  PriceTransparencyReport,
} from '../types/clinical';

/**
 * Infers structured ComorbidityIds from Zone A free-text diagnosis notes
 * (e.g., "CKD Stage 3", "HTN", "T2DM", "Pregnancy 2nd Trimester").
 */
export function detectComorbiditiesFromNotes(notes: string[]): ComorbidityId[] {
  const joined = notes.join(' ').toLowerCase();
  const detected = new Set<ComorbidityId>();

  (Object.keys(COMORBIDITY_METADATA) as ComorbidityId[]).forEach((id) => {
    const keywords = COMORBIDITY_METADATA[id].keywords;
    if (keywords.some((kw) => joined.includes(kw))) {
      detected.add(id);
    }
  });

  return Array.from(detected);
}

/**
 * Stage 5: Clinical Graph-RAG & Deterministic Safety Audit.
 * 1. Duplicate Active Generic Detection: Generic(c_a) ∩ Generic(c_b) != ∅
 * 2. Drug-Drug Interaction (DDI) Graph Traversal over G = (V, E)
 * 3. Comorbidity Contraindications against Zone A + user toggles
 */
export function runClinicalSafetyAudit(
  medications: DecodedMedication[],
  activeComorbidities: ComorbidityId[],
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  const seenKeys = new Set<string>();

  // 1. Duplicate Active Generic Detection
  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const medA = medications[i];
      const medB = medications[j];
      const drugA = medA.resolvedDrug;
      const drugB = medB.resolvedDrug;

      const sharedMolecules = drugA.activeMoleculeIds.filter((mol) =>
        drugB.activeMoleculeIds.includes(mol),
      );

      if (sharedMolecules.length > 0) {
        const key = `dup:${[drugA.id, drugB.id].sort().join('|')}:${sharedMolecules.join(',')}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const molNames = sharedMolecules
          .map((m) => MOLECULE_NODES[m]?.canonicalName ?? m)
          .join(' + ');
        const molNamesBn = sharedMolecules
          .map((m) => MOLECULE_NODES[m]?.banglaName ?? m)
          .join(' ও ');

        const labelA = `${drugA.brandName} ${drugA.strengthText}`;
        const labelB = `${drugB.brandName} ${drugB.strengthText}`;

        alerts.push({
          id: key,
          alertType: 'DUPLICATE_GENERIC',
          severity: 'HIGH',
          drugInvolved: `${labelA} + ${labelB} (${molNames})`,
          relatedDrugs: [labelA, labelB],
          activeMolecule: molNames,
          clinicalReason: `Silent duplicate active generic detected: both ${labelA} (${drugA.manufacturer}) and ${labelB} (${drugB.manufacturer}) contain ${molNames}. Taking both causes accidental double dosing.`,
          banglaReason: `সতর্কতা! ${drugA.banglaName} এবং ${drugB.banglaName} — দুটি ওষুধে একই জেনেরিক (${molNamesBn}) রয়েছে। একসাথে খেলে ওভারডোজ হতে পারে।`,
          recommendation:
            'Do not take both brands concurrently. Confirm with physician which single brand to continue.',
        });
      }
    }
  }

  // 2. Drug-Drug Interaction (DDI) Graph Traversal
  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const drugA = medications[i].resolvedDrug;
      const drugB = medications[j].resolvedDrug;

      for (const edge of DDI_GRAPH_EDGES) {
        const forward =
          drugA.activeMoleculeIds.includes(edge.moleculeA) &&
          drugB.activeMoleculeIds.includes(edge.moleculeB);
        const reverse =
          drugA.activeMoleculeIds.includes(edge.moleculeB) &&
          drugB.activeMoleculeIds.includes(edge.moleculeA);

        if (forward || reverse) {
          const key = `ddi:${edge.id}:${[drugA.id, drugB.id].sort().join('|')}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const labelA = `${drugA.brandName} ${drugA.strengthText}`;
          const labelB = `${drugB.brandName} ${drugB.strengthText}`;

          alerts.push({
            id: key,
            alertType: 'DRUG_DRUG_INTERACTION',
            severity: edge.severity,
            drugInvolved: `${labelA} + ${labelB}`,
            relatedDrugs: [labelA, labelB],
            clinicalReason: edge.clinicalReason,
            banglaReason: edge.banglaReason,
            recommendation: edge.recommendation,
          });
        }
      }
    }
  }

  // 3. Comorbidity Contraindication Audit
  for (const comorbidity of activeComorbidities) {
    const rules = COMORBIDITY_CONTRAINDICATIONS.filter((r) => r.comorbidity === comorbidity);
    for (const med of medications) {
      const drug = med.resolvedDrug;
      for (const rule of rules) {
        const matchedMol = drug.activeMoleculeIds.find((m) => rule.molecules.includes(m));
        if (matchedMol) {
          const key = `cm:${comorbidity}:${drug.id}:${rule.id}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const molName = MOLECULE_NODES[matchedMol]?.canonicalName ?? drug.activeGenericDisplay;
          alerts.push({
            id: key,
            alertType: 'COMORBIDITY_CONTRAINDICATION',
            severity: rule.severity,
            drugInvolved: `${drug.brandName} ${drug.strengthText} (${molName})`,
            relatedDrugs: [`${drug.brandName} ${drug.strengthText}`],
            activeMolecule: molName,
            clinicalReason: `[${COMORBIDITY_METADATA[comorbidity].labelEn}] ${rule.clinicalReason}`,
            banglaReason: `[${COMORBIDITY_METADATA[comorbidity].labelBn}] ${rule.banglaReason}`,
            recommendation: rule.recommendation,
          });
        }
      }
    }
  }

  // Sort HIGH alerts first, then Duplicate -> Comorbidity -> DDI
  const severityOrder = { HIGH: 0, MODERATE: 1, LOW: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Stage 4: Physical Blister-Strip Bipartite Verification against Prescribed Set C_Rx.
 * Classifies each dispensed strip into:
 * - EXACT_MATCH (Green)
 * - BIO_EQUIVALENT (Amber)
 * - CRITICAL_MISMATCH (Red + Bangla Voice Alert)
 */
export function verifyBlisterAgainstPrescription(
  ocrStripRaw: string,
  prescribedMeds: DecodedMedication[],
  options?: {
    stripId?: string;
    dosageFormHint?: string;
    strengthHint?: string;
    stripImageDataUrl?: string;
    claheImageDataUrl?: string;
  },
  database: DgdaDrugRecord[] = DGDA_DRUG_DATABASE,
): BlisterVerificationResult {
  // Resolve the physical foil imprint against the local DGDA database
  let bestDrug = database[0];
  let bestScore = -1;

  for (const drug of database) {
    const score = scoreDrugCandidate(ocrStripRaw, drug, {
      dosageFormHint: options?.dosageFormHint,
      strengthHint: options?.strengthHint,
    });
    if (score.totalScore > bestScore) {
      bestScore = score.totalScore;
      bestDrug = drug;
    }
  }

  const dispensedLabel = formatDrugLabel(bestDrug);
  const stripId = options?.stripId ?? `strip-${Date.now()}`;

  // 1. Check Exact Match (same brand, same active molecules, same strength)
  const exactMatch = prescribedMeds.find(
    (m) =>
      m.resolvedDrug.id === bestDrug.id ||
      (m.resolvedDrug.brandName.toLowerCase() === bestDrug.brandName.toLowerCase() &&
        m.resolvedDrug.strengthMg === bestDrug.strengthMg),
  );

  if (exactMatch) {
    return {
      stripId,
      status: 'EXACT_MATCH',
      ocrStripRaw,
      dispensedDrug: bestDrug,
      dispensedScore: bestScore,
      prescribedMatch: exactMatch,
      prescribedItem: formatDrugLabel(exactMatch.resolvedDrug),
      dispensedOnStrip: dispensedLabel,
      reasonEnglish: `Verified exact brand and strength match (${dispensedLabel}) against prescription.`,
      alertBangla: `নিশ্চিত হয়েছে: ফার্মেসি আপনাকে সঠিক ওষুধ ${bestDrug.banglaName} ${toBanglaDigits(bestDrug.strengthText)} দিয়েছে।`,
      priceDiffBdt: 0,
      stripImageDataUrl: options?.stripImageDataUrl,
      claheImageDataUrl: options?.claheImageDataUrl,
    };
  }

  // 2. Check Wrong Strength for SAME brand or SAME active generic (CRITICAL MISMATCH!)
  const sameGenericDifferentStrength = prescribedMeds.find((m) => {
    const sameMolecules =
      m.resolvedDrug.activeMoleculeIds.length === bestDrug.activeMoleculeIds.length &&
      m.resolvedDrug.activeMoleculeIds.every((id) => bestDrug.activeMoleculeIds.includes(id));
    return sameMolecules && m.resolvedDrug.strengthMg !== bestDrug.strengthMg;
  });

  if (sameGenericDifferentStrength) {
    const rx = sameGenericDifferentStrength.resolvedDrug;
    const rxStrengthBn = toBanglaDigits(rx.strengthText).replace(/mg/gi, ' মিলিগ্রাম');
    const stripStrengthBn = toBanglaDigits(bestDrug.strengthText).replace(/mg/gi, ' মিলিগ্রাম');

    return {
      stripId,
      status: 'CRITICAL_MISMATCH',
      ocrStripRaw,
      dispensedDrug: bestDrug,
      dispensedScore: bestScore,
      prescribedMatch: sameGenericDifferentStrength,
      prescribedItem: formatDrugLabel(rx),
      dispensedOnStrip: dispensedLabel,
      reasonEnglish: `Wrong strength dispensed! Prescription specifies ${formatDrugLabel(rx)}, but the physical blister strip contains ${dispensedLabel}.`,
      alertBangla: `সতর্কতা! প্রেসক্রিপশনে ${rxStrengthBn} লেখা আছে, কিন্তু ফার্মেসি আপনাকে ${stripStrengthBn} এর পাতা দিয়েছে।`,
      priceDiffBdt: Number((bestDrug.unitMrpBdt - rx.unitMrpBdt).toFixed(2)),
      stripImageDataUrl: options?.stripImageDataUrl,
      claheImageDataUrl: options?.claheImageDataUrl,
    };
  }

  // 3. Check Bio-Equivalent Generic Substitution (same exact molecules & strength, different local brand)
  const bioEquivalentMatch = prescribedMeds.find((m) => {
    const sameMolecules =
      m.resolvedDrug.activeMoleculeIds.length === bestDrug.activeMoleculeIds.length &&
      m.resolvedDrug.activeMoleculeIds.every((id) => bestDrug.activeMoleculeIds.includes(id));
    return sameMolecules && m.resolvedDrug.strengthMg === bestDrug.strengthMg;
  });

  if (bioEquivalentMatch) {
    const rx = bioEquivalentMatch.resolvedDrug;
    const priceDiff = Number((bestDrug.unitMrpBdt - rx.unitMrpBdt).toFixed(2));
    return {
      stripId,
      status: 'BIO_EQUIVALENT',
      ocrStripRaw,
      dispensedDrug: bestDrug,
      dispensedScore: bestScore,
      prescribedMatch: bioEquivalentMatch,
      prescribedItem: formatDrugLabel(rx),
      dispensedOnStrip: dispensedLabel,
      reasonEnglish: `Bio-equivalent local substitution: ${bestDrug.brandName} (${bestDrug.manufacturer}) contains the exact same active generic (${bestDrug.activeGenericDisplay} ${bestDrug.strengthText}) as prescribed ${rx.brandName}.`,
      alertBangla: `ভিন্ন ব্র্যান্ড কিন্তু একই ওষুধ: প্রেসক্রিপশনে ${rx.banglaName} লেখা ছিল, ফার্মেসি একই জেনেরিকের ${bestDrug.banglaName} ${toBanglaDigits(bestDrug.strengthText)} দিয়েছে। এটি নিরাপদ বিকল্প।`,
      priceDiffBdt: priceDiff,
      stripImageDataUrl: options?.stripImageDataUrl,
      claheImageDataUrl: options?.claheImageDataUrl,
    };
  }

  // 4. Completely Unprescribed / Wrong Drug (CRITICAL MISMATCH!)
  const rxSummary =
    prescribedMeds.length > 0
      ? prescribedMeds.map((m) => `${m.resolvedDrug.brandName} ${m.resolvedDrug.strengthText}`).join(', ')
      : 'No active prescription';

  return {
    stripId,
    status: 'CRITICAL_MISMATCH',
    ocrStripRaw,
    dispensedDrug: bestDrug,
    dispensedScore: bestScore,
    prescribedItem: rxSummary,
    dispensedOnStrip: dispensedLabel,
    reasonEnglish: `Unprescribed drug mismatch! Physical strip ${dispensedLabel} (${bestDrug.activeGenericDisplay}) does not match any active molecule on the decoded prescription.`,
    alertBangla: `সতর্কতা! এই পাতাটি (${bestDrug.banglaName} ${toBanglaDigits(bestDrug.strengthText)}) আপনার প্রেসক্রিপশনে নেই। খাওয়ার আগে ফার্মেসিতে ফেরত দিন।`,
    stripImageDataUrl: options?.stripImageDataUrl,
    claheImageDataUrl: options?.claheImageDataUrl,
  };
}

/**
 * Stage 5: DGDA Official MRP & Generic Price Transparency Report.
 */
export function computePriceTransparency(
  medications: DecodedMedication[],
  database: DgdaDrugRecord[] = DGDA_DRUG_DATABASE,
): PriceTransparencyReport {
  let totalStatutoryMrpBdt = 0;
  let minBioEquivalentTotalBdt = 0;

  const rows: MedicationPriceRow[] = medications.map((med) => {
    const drug = med.resolvedDrug;
    const totalUnits = med.compiledSchedule.totalUnits;
    const lineTotalBdt = Number((drug.unitMrpBdt * totalUnits).toFixed(2));
    totalStatutoryMrpBdt += lineTotalBdt;

    // Find verified bio-equivalent Bangladeshi brands (exact same active molecules & strength)
    const alternatives: BioEquivalentOption[] = database
      .filter((candidate) => {
        if (candidate.id === drug.id) return false;
        const sameMolecules =
          candidate.activeMoleculeIds.length === drug.activeMoleculeIds.length &&
          candidate.activeMoleculeIds.every((m) => drug.activeMoleculeIds.includes(m));
        return sameMolecules && candidate.strengthMg === drug.strengthMg;
      })
      .map((candidate) => {
        const totalCostBdt = Number((candidate.unitMrpBdt * totalUnits).toFixed(2));
        const savingsBdt = Number((lineTotalBdt - totalCostBdt).toFixed(2));
        const savingsPercent =
          lineTotalBdt > 0 ? Math.round((savingsBdt / lineTotalBdt) * 100) : 0;
        return {
          drug: candidate,
          totalCostBdt,
          savingsBdt,
          savingsPercent,
        };
      })
      .sort((a, b) => a.totalCostBdt - b.totalCostBdt);

    const cheaperAlt = alternatives.find((a) => a.savingsBdt > 0);
    minBioEquivalentTotalBdt += cheaperAlt ? cheaperAlt.totalCostBdt : lineTotalBdt;

    return {
      medication: med,
      unitMrpBdt: drug.unitMrpBdt,
      totalUnits,
      lineTotalBdt,
      cheapestAlternative: cheaperAlt,
      alternatives,
    };
  });

  const potentialSavingsBdt = Number(
    Math.max(0, totalStatutoryMrpBdt - minBioEquivalentTotalBdt).toFixed(2),
  );
  const potentialSavingsPercent =
    totalStatutoryMrpBdt > 0
      ? Math.round((potentialSavingsBdt / totalStatutoryMrpBdt) * 100)
      : 0;

  return {
    totalStatutoryMrpBdt: Number(totalStatutoryMrpBdt.toFixed(2)),
    minBioEquivalentTotalBdt: Number(minBioEquivalentTotalBdt.toFixed(2)),
    potentialSavingsBdt,
    potentialSavingsPercent,
    rows,
  };
}

/**
 * Builds the exact structured pipeline JSON payload matching Page 6 of the OshudhGuard AI document.
 */
export function buildPipelineJsonPayload(
  prescriptionId: string,
  patientContext: PatientContext,
  medications: DecodedMedication[],
  blisterChecks: BlisterVerificationResult[],
  clinicalAlerts: ClinicalAlert[],
): PrescriptionPipelinePayload {
  const latestBlister = blisterChecks[0] ?? null;

  return {
    prescriptionId,
    createdAt: new Date().toISOString(),
    patientContext: {
      age: patientContext.age ?? null,
      detectedConditions: patientContext.detectedConditions,
    },
    decodedMedications: medications.map((m) => ({
      ocrRaw: m.ocrRaw,
      resolvedBrand: formatDrugLabel(m.resolvedDrug),
      manufacturer: m.resolvedDrug.manufacturer,
      activeGeneric: m.resolvedDrug.activeGenericDisplay,
      groundingScore: m.groundingScore,
      unitMrpBdt: m.resolvedDrug.unitMrpBdt,
      scheduleShorthand: m.scheduleShorthand,
      banglaVoiceText: m.compiledSchedule.banglaVoiceText,
    })),
    blisterVerification: latestBlister
      ? {
          status: latestBlister.status.replace('_', ' '),
          prescribedItem: latestBlister.prescribedItem,
          dispensedOnStrip: latestBlister.dispensedOnStrip,
          alertBangla: latestBlister.alertBangla,
        }
      : null,
    clinicalAlerts: clinicalAlerts.map((a) => ({
      alertType: a.alertType,
      severity: a.severity,
      drugInvolved: a.drugInvolved,
      clinicalReason: a.clinicalReason,
    })),
  };
}
