import { readFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { lireClasseur, type ClasseurLu } from './lectureExcel';
import { activitesDuMois, retrocessionDuMois } from './repriseExcel';

vi.mock('server-only', () => ({}));
const { classeurSuivi } = await import('./exportXlsx');

/** 🔴 Arno (22/10/2026, exceljs validé) — l'export .xlsx : un onglet par mois, la mise en page et les totaux du suivi mensuel. */
const classeur = JSON.parse(readFileSync(path.join(process.cwd(), 'app/lib/location/suivi/__fixtures__/suiviMensuel2026.anonyme.json'), 'utf8')) as ClasseurLu;
const mois = lireClasseur(classeur, 2026);
const activites = mois.flatMap((m) => activitesDuMois(m, { collaborateurs: [] }));
const ctx = { regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [],
  retrocessions: mois.map((m) => retrocessionDuMois(m, {})).filter((r) => r !== null) };
const relire = async (voirCommissions: boolean) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await classeurSuivi({ annee: 2026, moisMax: 10, activites, ctx, voirCommissions, filtres: '' }) as never);
  return wb;
};
const resultat = (c: ExcelJS.Cell): unknown => (c.value !== null && typeof c.value === 'object' && 'result' in c.value ? c.value.result : c.value);
const ligneDe = (ws: ExcelJS.Worksheet, mot: string): number => {
  let r = -1;
  ws.eachRow((row, i) => { if (String(row.getCell(1).value) === mot) r = i; });
  return r;
};

describe('🔴 export .xlsx du suivi', () => {
  it('un onglet par mois, de janvier au mois demandé', async () => {
    const wb = await relire(true);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre']);
  });
  it('août : les lignes, TOTAL CA HT, CA − apporteurs, la commission (formule et résultat), la ventilation', async () => {
    const ws = (await relire(true)).getWorksheet('Août')!;
    expect(ws.getRow(2).getCell(1).value).toBe('PROPRIÉTAIRES');
    const rT = ligneDe(ws, 'TOTAL CA HT');
    expect(rT).toBe(3 + 14 + 1);
    expect(ws.getCell(`B${rT}`).value).toMatchObject({ formula: 'SUM(E3:E16)' });
    expect(Math.round(Number(resultat(ws.getCell(`B${rT}`))) * 100) / 100).toBe(13471.1);
    expect(Math.round(Number(resultat(ws.getCell(`C${rT + 1}`))) * 100) / 100).toBe(13339.54);
    expect(ws.getCell(`C${rT + 2}`).value).toMatchObject({ formula: `C${rT + 1}*15%+F${rT}-200` });
    expect(Math.round(Number(resultat(ws.getCell(`C${rT + 2}`))) * 100) / 100).toBe(1965.93);
    expect(ws.getCell(`E4`).value).toMatchObject({ formula: 'B4+D4' });
    expect(ws.getCell(`H4`).value).toMatchObject({ formula: 'E4*10%' });
    const rV = ligneDe(ws, 'Location avec Gestion');
    expect(Math.round(Number(resultat(ws.getCell(`B${rV}`))) * 100) / 100).toBe(13471.1);
  });
  it('🔒 sans « Voir les commissions » : ni prime, ni commission du négociateur', async () => {
    const ws = (await relire(false)).getWorksheet('Août')!;
    expect(ws.getRow(2).getCell(6).value).toBe('');
    expect(ligneDe(ws, 'COMS négociateur brut')).toBe(-1);
  });
});
