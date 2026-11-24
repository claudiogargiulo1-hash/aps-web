// OME (Oral Morphine Equivalent) conversion factors — CDC 2022 / NIH HEAL 2024
// Per farmaci TD la dose è in mcg/h e il fattore converte già in OME mg/die

export interface OmeDrugDef {
  routes: Record<string, number>;
  isTd?: boolean;
  doseUnit?: string;
  note: string;
}

export const OME_CONVERSION: Record<string, OmeDrugDef> = {
  'Morfina':             { routes: { orale: 1, ev: 3, sc: 3, im: 3, epidurale: 10 }, note: 'Standard di riferimento' },
  'Ossicodone':          { routes: { orale: 1.5, ev: 3 }, note: 'CDC 2022: 1mg orale = 1.5mg OME' },
  'Idromorfone':         { routes: { orale: 4, ev: 20, sc: 20 }, note: '7.5mg orale = 30mg morfina' },
  'Fentanyl TD':         { routes: { td: 2.4 }, isTd: true, doseUnit: 'mcg/h', note: '25mcg/h ≈ 60mg OME/die' },
  'Fentanyl EV':         { routes: { ev: 100 }, note: '0.1mg EV = 10mg morfina orale' },
  'Tramadolo':           { routes: { orale: 0.2, ev: 0.2, im: 0.2 }, note: 'NIH HEAL 2024: 100mg = 20mg OME' },
  'Buprenorfina SL':     { routes: { sl: 30 }, note: 'CDC 2022: 1mg SL = 30mg OME' },
  'Buprenorfina TD':     { routes: { td: 2.4 }, isTd: true, doseUnit: 'mcg/h', note: '35mcg/h ≈ 84mg OME/die' },
  'Tapentadolo':         { routes: { orale: 0.4 }, note: 'Palexia: 100mg = 40mg OME' },
  'Codeina':             { routes: { orale: 0.15 }, note: '200mg = 30mg morfina' },
  'Ossicodone/Naloxone': { routes: { orale: 1.5 }, note: 'Targiniq: equivalente a ossicodone orale' },
};

export interface OmeResult {
  omePerDose: number;
  omeDaily: number;
}

export function calcOME(
  drugName: string,
  doseMg: number,
  route: string,
  frequencyPerDay: number,
  isPrn: boolean,
  prnDosesGiven: number,
): OmeResult {
  const drugDef = OME_CONVERSION[drugName];
  const factor = drugDef?.routes[route] ?? 1;
  const isTd = drugDef?.isTd ?? false;
  const omePerDose = Math.round(doseMg * factor * 10) / 10;
  let omeDaily: number;
  if (isTd) {
    omeDaily = omePerDose; // fattore già include le 24h
  } else if (isPrn) {
    omeDaily = Math.round(omePerDose * prnDosesGiven * 10) / 10;
  } else {
    omeDaily = Math.round(omePerDose * frequencyPerDay * 10) / 10;
  }
  return { omePerDose, omeDaily };
}
