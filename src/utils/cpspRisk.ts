// Utility functions for CPSP risk calculation
// Copied from App.tsx — source of truth until full MVC refactor is complete

export const SURGERY_TYPES = [
  { value: 'artroscopia',      label: 'Artroscopia',                         riskWeight: 1.2 },
  { value: 'colecistectomia',  label: 'Colecistectomia laparoscopica',        riskWeight: 1.3 },
  { value: 'ernioplastica',    label: 'Ernioplastica',                        riskWeight: 1.5 },
  { value: 'cesareo',          label: 'Taglio cesareo',                       riskWeight: 1.5 },
  { value: 'colorettale',      label: 'Chirurgia colorettale',                riskWeight: 1.8 },
  { value: 'protesi_anca',     label: "Protesi d'anca (THA)",                 riskWeight: 2.0 },
  { value: 'mammaria',         label: 'Chirurgia mammaria',                   riskWeight: 2.0 },
  { value: 'frattura_arto',    label: 'Frattura arto inferiore',              riskWeight: 2.2 },
  { value: 'vascolare',        label: 'Chirurgia vascolare maggiore',         riskWeight: 2.2 },
  { value: 'protesi_ginocchio',label: 'Protesi di ginocchio (TKA)',           riskWeight: 2.5 },
  { value: 'spinale',          label: 'Chirurgia spinale / fusione vertebrale',riskWeight: 3.0 },
  { value: 'toracotomia',      label: 'Toracotomia / chirurgia toracica',     riskWeight: 3.0 },
];

export type RiskLevel = 'basso' | 'moderato' | 'alto' | 'molto_alto';

export interface DynamicRiskResult {
  dynamicPct: number;
  dynamicLevel: RiskLevel;
  delta: number;
}

/**
 * Dynamic risk update at POD1.
 */
export function calcDynamicRisk(
  preOpPct: number,
  pod1NrsRest: number,
  pod1NrsMovement: number,
  pod1Ome: number,
): DynamicRiskResult {
  let delta = 0;
  if (pod1NrsRest <= 3) delta += 0;
  else if (pod1NrsRest <= 6) delta += (pod1NrsRest - 3) * 3;
  else delta += 9 + (pod1NrsRest - 6) * 5;
  if (pod1NrsMovement <= 4) delta += 0;
  else if (pod1NrsMovement <= 7) delta += (pod1NrsMovement - 4) * 4;
  else delta += 12 + (pod1NrsMovement - 7) * 6;
  if (pod1Ome > 60) delta += 10;
  else if (pod1Ome > 30) delta += 5;
  const dynamicPct = Math.min(100, preOpPct + delta);
  const dynamicLevel: RiskLevel = dynamicPct < 25 ? 'basso' : dynamicPct < 50 ? 'moderato' : dynamicPct < 70 ? 'alto' : 'molto_alto';
  return { dynamicPct, dynamicLevel, delta };
}
