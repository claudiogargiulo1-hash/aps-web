export const ENGINE_VERSION = '2026.06.0';

export const SURGERY_RISK_MAP: Record<string, number> = {
  // iOS / canonical keys
  THA: 2, TKA: 2.5, ARTR_GINOCCHIO: 1.2, ARTR_SPALLA: 1.3, PROTESI_SPALLA: 2,
  FRATTURA_INF: 2.2, FRATTURA_SUP: 1.8, VERTEBRALE_FUSIONE: 3,
  VERTEBRALE_DECOMPRESSIONE: 2.2, ALTRO: 1.5,
  // web vocabulary aliases
  artroscopia: 1.2, colecistectomia: 1.3, ernioplastica: 1.5, cesareo: 1.5,
  colorettale: 1.8, protesi_anca: 2.0, mammaria: 2.0, frattura_arto: 2.2,
  vascolare: 2.2, protesi_ginocchio: 2.5, spinale: 3.0, toracotomia: 3.0,
};

export function riskLevel(pct: number): 'basso' | 'moderato' | 'alto' | 'molto_alto' {
  return pct < 25 ? 'basso' : pct < 50 ? 'moderato' : pct < 70 ? 'alto' : 'molto_alto';
}

export function calcPreopRisk(p: {
  surgeryType: string;
  opioids: string;
  nrsPreop: number;
  pcsTotal: number;
  passTotal: number;
  csiTotal: number;
  distressThermometer: number;
  painOtherSites: boolean;
  insomniaPresent: boolean;
  smoking: boolean;
  frailty: boolean;
}) {
  const surgeryRisk = SURGERY_RISK_MAP[p.surgeryType] ?? 1.5;
  const surgeryScore = surgeryRisk * 10;
  const painScore = p.nrsPreop <= 3 ? p.nrsPreop * 1 : p.nrsPreop <= 6 ? p.nrsPreop * 1.5 : p.nrsPreop * 2;
  const opioidNorm = p.opioids === 'cronico' ? 'chronic' : p.opioids === 'intermittente' ? 'intermittent' : p.opioids;
  const opioidScore = opioidNorm === 'chronic' ? 30 : opioidNorm === 'intermittent' ? 15 : 0;
  const rawScore = surgeryScore + painScore + opioidScore
    + (p.pcsTotal / 52) * 20 + (p.passTotal / 80) * 15 + (p.csiTotal / 100) * 15;
  let pct = Math.min(100, Math.round((rawScore / 130) * 100));
  if (p.distressThermometer >= 7) pct = Math.min(100, pct + 15);
  if (p.painOtherSites)           pct = Math.min(100, pct + 10);
  if (p.insomniaPresent)          pct = Math.min(100, pct + 8);
  if (p.smoking)                  pct = Math.min(100, pct + 3);
  if (p.frailty)                  pct = Math.min(100, pct + 5);
  return { score: Math.round(rawScore * 10) / 10, pct, level: riskLevel(pct), version: ENGINE_VERSION };
}

export function calcTrajectory(pod1: number, pod7: number): string {
  const delta = pod7 - pod1;
  if (delta <= -3) return 'improving';
  if (delta >= 2) return 'worsening';
  if (pod7 >= 5) return 'non_resolving';
  return 'stable';
}

export function calcPod7Risk(
  pod1Pct: number,
  avgRest: number,
  avgMov: number,
  avgInterference: number,
  avgSleep: number,
  avgMood: number,
  opioidDays: number,
  trajectory: string,
): number {
  let delta = 0;
  if (avgRest <= 2)       delta -= 5;
  else if (avgRest <= 4)  delta += 0;
  else if (avgRest <= 6)  delta += 8;
  else                    delta += 15;
  if (avgMov <= 3)        delta -= 3;
  else if (avgMov <= 5)   delta += 5;
  else if (avgMov <= 7)   delta += 10;
  else                    delta += 18;
  if (avgInterference <= 3)      delta -= 3;
  else if (avgInterference <= 6) delta += 5;
  else                           delta += 12;
  if (avgSleep >= 7)     delta -= 3;
  else if (avgSleep <= 4) delta += 8;
  if (avgMood <= 4)      delta += 5;
  if (opioidDays >= 5)      delta += 10;
  else if (opioidDays >= 3) delta += 5;
  if (trajectory === 'non_resolving') delta += 12;
  if (trajectory === 'worsening')     delta += 15;
  if (trajectory === 'improving')     delta -= 8;
  return Math.min(100, Math.max(0, pod1Pct + delta));
}

export function calcCompositeTrajectoryScore(days: any[]): number {
  if (!days.length) return 0;
  const avgRest = days.reduce((s, d) => s + (d.nrs_rest || 0), 0) / days.length;
  const avgMov  = days.reduce((s, d) => s + (d.nrs_movement || 0), 0) / days.length;
  const avgInt  = days.reduce((s, d) => s + (d.pain_interference || 0), 0) / days.length;
  const avgSlp  = days.reduce((s, d) => s + (d.sleep_quality || 5), 0) / days.length;
  const avgMood = days.reduce((s, d) => s + (d.mood_score || 5), 0) / days.length;
  const opioidDays = days.filter(d => d.using_opioids).length;
  const painComponent     = (avgRest * 0.25 + avgMov * 0.30 + avgInt * 0.25) * 10;
  const recoveryComponent = ((10 - avgSlp) * 0.1 + (10 - avgMood) * 0.1) * 10;
  const opioidComponent   = (opioidDays / days.length) * 20;
  return Math.round(Math.min(100, painComponent + recoveryComponent + opioidComponent));
}
