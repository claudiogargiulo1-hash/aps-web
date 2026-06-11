import { assertEquals } from 'jsr:@std/assert@1';
import {
  calcPreopRisk,
  calcTrajectory,
  calcPod7Risk,
  calcCompositeTrajectoryScore,
  riskLevel,
  ENGINE_VERSION,
} from './cpsp-engine.ts';

// ── riskLevel boundaries ─────────────────────────────────────────────────────

Deno.test('riskLevel: boundaries basso/moderato/alto/molto_alto', () => {
  assertEquals(riskLevel(0),   'basso');
  assertEquals(riskLevel(24),  'basso');
  assertEquals(riskLevel(25),  'moderato');
  assertEquals(riskLevel(49),  'moderato');
  assertEquals(riskLevel(50),  'alto');
  assertEquals(riskLevel(69),  'alto');
  assertEquals(riskLevel(70),  'molto_alto');
  assertEquals(riskLevel(100), 'molto_alto');
});

// ── calcPreopRisk golden patients ────────────────────────────────────────────

Deno.test('golden-1: minimal input → basso (pct=12)', () => {
  const r = calcPreopRisk({
    surgeryType: 'ALTRO', opioids: 'none', nrsPreop: 0,
    pcsTotal: 0, passTotal: 0, csiTotal: 0,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 12);
  assertEquals(r.level, 'basso');
  assertEquals(r.score, 15.0);
  assertEquals(r.version, ENGINE_VERSION);
});

Deno.test('golden-2: NRS=0, THA → basso (pct=15)', () => {
  const r = calcPreopRisk({
    surgeryType: 'THA', opioids: 'none', nrsPreop: 0,
    pcsTotal: 0, passTotal: 0, csiTotal: 0,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 15);
  assertEquals(r.level, 'basso');
});

Deno.test('golden-3: TKA, moderate scales → moderato (pct=35)', () => {
  const r = calcPreopRisk({
    surgeryType: 'TKA', opioids: 'none', nrsPreop: 3,
    pcsTotal: 20, passTotal: 25, csiTotal: 30,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 35);
  assertEquals(r.level, 'moderato');
  assertEquals(r.score, 44.9);
});

Deno.test('golden-4: VERTEBRALE_FUSIONE + intermittent opioids + high scales → alto (pct=62)', () => {
  const r = calcPreopRisk({
    surgeryType: 'VERTEBRALE_FUSIONE', opioids: 'intermittent', nrsPreop: 6,
    pcsTotal: 30, passTotal: 40, csiTotal: 50,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 62);
  assertEquals(r.level, 'alto');
  assertEquals(r.score, 80.5);
});

Deno.test('golden-5: molto_alto without bonuses (pct=91)', () => {
  const r = calcPreopRisk({
    surgeryType: 'VERTEBRALE_FUSIONE', opioids: 'chronic', nrsPreop: 8,
    pcsTotal: 45, passTotal: 70, csiTotal: 80,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 91);
  assertEquals(r.level, 'molto_alto');
  assertEquals(r.score, 118.4);
});

Deno.test('golden-6: NRS=10 → moderato (pct=35)', () => {
  const r = calcPreopRisk({
    surgeryType: 'TKA', opioids: 'none', nrsPreop: 10,
    pcsTotal: 0, passTotal: 0, csiTotal: 0,
    distressThermometer: 0, painOtherSites: false,
    insomniaPresent: false, smoking: false, frailty: false,
  });
  assertEquals(r.pct, 35);
  assertEquals(r.level, 'moderato');
  assertEquals(r.score, 45.0);
});

Deno.test('golden-7: all bonuses active → molto_alto (pct=85)', () => {
  const r = calcPreopRisk({
    surgeryType: 'THA', opioids: 'intermittent', nrsPreop: 5,
    pcsTotal: 20, passTotal: 20, csiTotal: 20,
    distressThermometer: 7, painOtherSites: true,
    insomniaPresent: true, smoking: true, frailty: true,
  });
  assertEquals(r.pct, 85);
  assertEquals(r.level, 'molto_alto');
  assertEquals(r.score, 56.9);
});

Deno.test('golden-8: score exceeds 100 before cap → capped at 100', () => {
  const r = calcPreopRisk({
    surgeryType: 'VERTEBRALE_FUSIONE', opioids: 'chronic', nrsPreop: 10,
    pcsTotal: 52, passTotal: 80, csiTotal: 100,
    distressThermometer: 8, painOtherSites: true,
    insomniaPresent: true, smoking: true, frailty: true,
  });
  assertEquals(r.pct, 100);
  assertEquals(r.level, 'molto_alto');
  assertEquals(r.score, 130.0);
});

// ── vocabulary aliases ────────────────────────────────────────────────────────

Deno.test('alias: protesi_anca == THA (same pct)', () => {
  const base = { opioids: 'none', nrsPreop: 0, pcsTotal: 0, passTotal: 0, csiTotal: 0, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, surgeryType: 'protesi_anca' }).pct, calcPreopRisk({ ...base, surgeryType: 'THA' }).pct);
});

Deno.test('alias: protesi_ginocchio == TKA (same pct)', () => {
  const base = { opioids: 'none', nrsPreop: 3, pcsTotal: 20, passTotal: 25, csiTotal: 30, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, surgeryType: 'protesi_ginocchio' }).pct, calcPreopRisk({ ...base, surgeryType: 'TKA' }).pct);
});

Deno.test('alias: spinale == VERTEBRALE_FUSIONE (same pct)', () => {
  const base = { opioids: 'intermittent', nrsPreop: 6, pcsTotal: 30, passTotal: 40, csiTotal: 50, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, surgeryType: 'spinale' }).pct, calcPreopRisk({ ...base, surgeryType: 'VERTEBRALE_FUSIONE' }).pct);
});

Deno.test('alias: opioids cronico == chronic (same pct)', () => {
  const base = { surgeryType: 'THA', nrsPreop: 5, pcsTotal: 20, passTotal: 30, csiTotal: 40, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, opioids: 'cronico' }).pct, calcPreopRisk({ ...base, opioids: 'chronic' }).pct);
});

Deno.test('alias: opioids intermittente == intermittent (same pct)', () => {
  const base = { surgeryType: 'TKA', nrsPreop: 4, pcsTotal: 15, passTotal: 20, csiTotal: 25, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, opioids: 'intermittente' }).pct, calcPreopRisk({ ...base, opioids: 'intermittent' }).pct);
});

Deno.test('alias: unknown surgery falls back to ALTRO weight (1.5)', () => {
  const base = { opioids: 'none', nrsPreop: 0, pcsTotal: 0, passTotal: 0, csiTotal: 0, distressThermometer: 0, painOtherSites: false, insomniaPresent: false, smoking: false, frailty: false };
  assertEquals(calcPreopRisk({ ...base, surgeryType: 'xyz_unknown' }).pct, calcPreopRisk({ ...base, surgeryType: 'ALTRO' }).pct);
});

// ── calcTrajectory ────────────────────────────────────────────────────────────

Deno.test('calcTrajectory: improving (delta <= -3)', () => {
  assertEquals(calcTrajectory(7, 3), 'improving');
  assertEquals(calcTrajectory(5, 2), 'improving');
});

Deno.test('calcTrajectory: worsening (delta >= 2)', () => {
  assertEquals(calcTrajectory(3, 5), 'worsening');
});

Deno.test('calcTrajectory: non_resolving (pod7 >= 5, delta in (-3,2))', () => {
  assertEquals(calcTrajectory(5, 5), 'non_resolving');
  assertEquals(calcTrajectory(4, 6), 'worsening'); // delta=2 → worsening wins
  assertEquals(calcTrajectory(6, 5), 'non_resolving'); // delta=-1, pod7=5
});

Deno.test('calcTrajectory: stable', () => {
  assertEquals(calcTrajectory(3, 3), 'stable');
  assertEquals(calcTrajectory(4, 4), 'stable');
});

// ── calcPod7Risk ─────────────────────────────────────────────────────────────

Deno.test('calcPod7Risk: improving trajectory reduces risk', () => {
  const base = 50;
  const r = calcPod7Risk(base, 2, 3, 3, 7, 5, 0, 'improving');
  // avgRest<=2: -5, avgMov<=3: -3, avgInterference<=3: -3, avgSleep>=7: -3, avgMood=5: 0, opioids=0: 0, improving: -8
  // delta = -5-3-3-3-8 = -22 → 50-22=28
  assertEquals(r, 28);
});

Deno.test('calcPod7Risk: non_resolving + high pain increases risk', () => {
  const r = calcPod7Risk(40, 7, 8, 8, 3, 3, 6, 'non_resolving');
  // avgRest>6: +15, avgMov>7: +18, avgInt>6: +12, avgSleep<=4: +8, avgMood<=4: +5, opioids>=5: +10, non_resolving: +12
  // delta = 15+18+12+8+5+10+12 = 80 → 40+80=120 → capped at 100
  assertEquals(r, 100);
});

Deno.test('calcPod7Risk: result never below 0', () => {
  const r = calcPod7Risk(0, 1, 1, 1, 9, 9, 0, 'improving');
  assertEquals(r >= 0, true);
});

// ── calcCompositeTrajectoryScore ──────────────────────────────────────────────

Deno.test('calcCompositeTrajectoryScore: empty array returns 0', () => {
  assertEquals(calcCompositeTrajectoryScore([]), 0);
});

Deno.test('calcCompositeTrajectoryScore: all zeros → minimal score', () => {
  const days = [
    { nrs_rest: 0, nrs_movement: 0, pain_interference: 0, sleep_quality: 10, mood_score: 10, using_opioids: false },
    { nrs_rest: 0, nrs_movement: 0, pain_interference: 0, sleep_quality: 10, mood_score: 10, using_opioids: false },
  ];
  // painComponent=0, recoveryComponent=0, opioidComponent=0
  assertEquals(calcCompositeTrajectoryScore(days), 0);
});

Deno.test('calcCompositeTrajectoryScore: high pain + opioids → high score', () => {
  const days = [
    { nrs_rest: 8, nrs_movement: 9, pain_interference: 8, sleep_quality: 2, mood_score: 2, using_opioids: true },
    { nrs_rest: 8, nrs_movement: 9, pain_interference: 8, sleep_quality: 2, mood_score: 2, using_opioids: true },
  ];
  // painComponent = (8*0.25 + 9*0.30 + 8*0.25)*10 = (2+2.7+2)*10 = 67
  // recoveryComponent = ((10-2)*0.1 + (10-2)*0.1)*10 = (0.8+0.8)*10 = 16
  // opioidComponent = (2/2)*20 = 20
  // total = min(100, 67+16+20) = 100
  assertEquals(calcCompositeTrajectoryScore(days), 100);
});
