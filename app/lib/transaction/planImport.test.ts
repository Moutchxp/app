import { describe, expect, it } from 'vitest';
import type { CelluleLue, ClasseurLu } from '../location/suivi/lectureExcel';
import { analyserFormule, colonnesMois, identifierFichier, lireFichier, termesConstants } from './lectureTableau';
import { acceptation, ACCEPTATIONS_NON_RECALCULE, centimes, memeLibelle, OPTIONS_DEFAUT, planifier, type Plan } from './planImport';

/**
 * 🔴 TUILE « TRANSACTION », LOT B — la reprise, sur des classeurs FABRIQUÉS (les fichiers d'Arno ne sont jamais committés) qui
 * reprennent la forme exacte des vrais : ligne 1 datée, ligne 2 « CA … » en formules, ligne 3 « Apporteur », lignes de vente, TOTAL,
 * onglet « CA GLOBAL ». Décisions éprouvées : D1, D2, D3 (test dédié), D4, D5, D6, B3 / B4.
 */
type Cellules = Record<string, CelluleLue>;
const MOIS = 'DEFGHIJKLMNO';
/** Un onglet de négociateur : en-têtes de mois (années fausses exprès : D1), CA en formules, apporteurs, ventes. */
function onglet(nom: string, o: { ca?: Record<number, string | number>; app?: Record<number, string | number>; lignes: [number, string, ...(number | null)[]][];
  total?: { ligne: number; formule: string; col?: string }; anneeEntetes?: number; colLibelle?: string }): { nom: string; cellules: Cellules } {
  const c: Cellules = { A1: { v: `VENTES ${nom}` }, C2: { v: 'CA CRITERIMMO' }, C3: { v: 'Apporteur-Intermédiaire' } };
  [...MOIS].forEach((col, i) => { c[`${col}1`] = { v: `${o.anneeEntetes ?? 2017}-${String(i + 1).padStart(2, '0')}-01` }; });
  for (const [m, x] of Object.entries(o.ca ?? {})) c[`${MOIS[Number(m) - 1]}2`] = typeof x === 'number' ? { v: x } : { v: null, f: x };
  for (const [m, x] of Object.entries(o.app ?? {})) c[`${MOIS[Number(m) - 1]}3`] = typeof x === 'number' ? { v: x } : { v: null, f: x };
  for (const [l, lib, ...montants] of o.lignes) {
    c[`${o.colLibelle ?? 'A'}${l}`] = { v: lib };
    montants.forEach((m, i) => { if (m !== null) c[`${String.fromCharCode((o.colLibelle ?? 'A').charCodeAt(0) + 1 + i)}${l}`] = { v: m }; });
  }
  if (o.total) { c[`${o.colLibelle ?? 'A'}${o.total.ligne}`] = { v: 'TOTAL VENTES' }; c[`${o.total.col ?? 'B'}${o.total.ligne}`] = { v: null, f: o.total.formule }; }
  return { nom, cellules: c };
}
function classeur(ventes: string, valeur: number, compromis: string | null, valeurC: number | null, ...onglets: { nom: string; cellules: Cellules }[]): ClasseurLu {
  const g: Cellules = { A1: { v: 'BILAN' }, A3: { v: 'TOTAL VENTES' }, B3: { v: valeur, f: ventes } };
  if (compromis !== null) { g.A4 = { v: 'TOTAL COMPROMIS EN COURS' }; g.B4 = { v: valeurC, f: compromis }; }
  return { feuilles: [{ nom: 'CA GLOBAL', cellules: g }, ...onglets] };
}
const reco = (p: Plan, fichier: string, i: number) => p.rapports.find((r) => r.fichier === fichier)!.reconciliations[i];

describe('la lecture d’un fichier', () => {
  it('D1 — la société et l’année viennent du NOM du fichier', () => {
    expect(identifierFichier('TABLEAU DE BORD MACJ 2025.xlsx')).toEqual({ societe: 'macj', annee: 2025 });
    expect(identifierFichier('TABLEAU DE BORD 2019 .xlsx')).toEqual({ societe: 'criterimmo', annee: 2019 });
    expect(identifierFichier('autre.xlsx')).toBeNull();
  });
  it('D1 — le mois d’une colonne est son RANG parmi les colonnes datées (en-têtes 2017 ou 2024 : peu importe)', () => {
    const f = onglet('X', { lignes: [], anneeEntetes: 2024 });
    expect(colonnesMois(f)?.map((x) => `${x.col}${x.mois}`).slice(0, 3)).toEqual(['D1', 'E2', 'F3']);
  });
  it('les formules : références (feuille nommée, plages), constantes, division par 1,2, #REF!', () => {
    const a = analyserFormule("(CEDRIC!B17+'Jean Baptiste'!B37)/1.2", 'CA GLOBAL');
    expect(a.refs.map((r) => `${r.feuille}!${r.col}${r.ligne}`)).toEqual(['CEDRIC!B17', 'Jean Baptiste!B37']);
    expect(a.divise12).toBe(true);
    expect(analyserFormule('SUM(B8:B10)+B12', 'X').refs.map((r) => r.ligne)).toEqual([8, 9, 10, 12]);
    expect(analyserFormule('B82+#REF!', 'X').erreur).toBe(true);
    expect(termesConstants('=1200+1500+1400+1400')).toEqual([1200, 1500, 1400, 1400]);
    expect(termesConstants('SUM(1500+400)')).toEqual([1500, 400]);
    expect(termesConstants('F2*0.8')).toBeNull();
  });
  it('rapprochement des libellés : égalité, inclusion, moitié des noms ; jamais sur « SCI » seul', () => {
    expect(memeLibelle('JULIO JALLAT', 'JULIO/ JALLAT')).toBe(true);
    expect(memeLibelle('REVILLON', 'REVILLON /CHEVRON')).toBe(true);
    expect(memeLibelle('SCI L ET B KEFALIAKOS CORNIL', 'SCI CHEVREUL')).toBe(false);
    expect(memeLibelle('DOYEN HOPPENOT', 'HOPPENOT/DANLOS')).toBe(false);
  });
});

describe('🔴 D3 — JAMAIS d’honoraires comptés deux fois (test dédié)', () => {
  // MACJ 2025 : MYLENE compte la vente (paye 3 215, honoraires 11 025) ; CEDRIC (onglet hors totaux) en porte sa part 7 810.
  const mylene = onglet('MYLENE', { ca: { 1: 'B30' }, lignes: [[30, 'GAVEZ DE CAMPOS/ ASMAR', 3215, 11025], [31, 'LOMBARDI FORT', 8138, 16275]], total: { ligne: 41, formule: 'SUM(C30:C40)', col: 'C' } });
  const pierre = onglet('PIERRE', { ca: { 2: 'C20' }, lignes: [[20, 'LOMBARDI FORT', 8138, 16275]], total: { ligne: 34, formule: 'SUM(C16:C33)', col: 'C' } });
  const cedric = onglet('CEDRIC', { ca: { 1: 'B15' }, lignes: [[15, 'GAVEZ DE CAMPOS/ ASMAR', 7810, 11025], [21, 'NITLECH', 6090, 6090]] });
  const mylene2 = onglet('MYLENE', { ca: { 1: 'B30' }, lignes: [[30, 'GAVEZ DE CAMPOS/ ASMAR', 3215, 11025], [31, 'LOMBARDI FORT', 8138, 16275], [34, 'NITLECH', 2506, 6019]],
    total: { ligne: 41, formule: 'SUM(C30:C40)', col: 'C' } });
  const f = lireFichier('TABLEAU DE BORD MACJ 2025.xlsx', classeur('PIERRE!C34+MYLENE!C41', 11025 + 16275 + 16275, null, null, cedric, pierre, mylene));
  const p = planifier([f]);

  it('une vente présente dans plusieurs onglets est UNE vente : honoraires une seule fois, plusieurs parts', () => {
    const gavez = p.ventes.find((v) => v.libelle.startsWith('GAVEZ'))!;
    expect(gavez.honorairesTtc).toBe(11025);
    expect(gavez.lignes.map((l) => [l.occ.onglet, l.role, l.montantTtc, l.compte])).toEqual([['MYLENE', 'negociateur', 3215, true], ['CEDRIC', 'part', 7810, false]]);
  });
  it('deux onglets COMPTÉS au même montant d’honoraires : comptée une fois, l’autre écartée — et l’écart expliqué au centime', () => {
    const lombardi = p.ventes.filter((v) => v.libelle === 'LOMBARDI FORT');
    expect(lombardi).toHaveLength(1);
    expect(lombardi[0].honorairesTtc).toBe(16275);
    const r = reco(p, f.fichier, 0);
    expect(r.importeTtc).toBe(11025 + 16275);
    expect(r.ecarts.map((e) => e.montant)).toEqual([-16275]);
    expect(r.ecarts[0].libelle).toMatch(/doublon écarté/);
    expect(r.resteInexplique).toBe(0);
    expect(p.rapports[0].bloque).toBe(false);
  });
  it('un doublon DOUTEUX (même libellé, autre montant) est listé, jamais additionné', () => {
    const f2 = lireFichier('TABLEAU DE BORD MACJ 2025.xlsx', classeur('MYLENE!C41', 11025 + 16275 + 6019, null, null, cedric, mylene2));
    const p2 = planifier([f2]);
    const nit = p2.ventes.find((v) => v.libelle === 'NITLECH')!;
    expect(nit.honorairesTtc).toBe(6019);
    expect(nit.lignes.find((l) => l.occ.onglet === 'CEDRIC')?.compte).toBe(false);
    expect(p2.rapports[0].rapprochements.join('\n')).toMatch(/DOUTEUX : CEDRIC l\.21 « NITLECH »/);
    expect(p2.ventes.reduce((s, v) => s + v.honorairesTtc, 0)).toBe(11025 + 16275 + 6019);
  });
  it('onglets à UN montant (2019 → 2024) : chaque onglet compté est une PART ; la somme fait les honoraires, comme le fichier', () => {
    const c = onglet('CEDRIC', { ca: { 6: 'B56' }, lignes: [[56, 'FAUGERE ABI SEMAAN', 6440]], total: { ligne: 68, formule: 'SUM(B49:B63)' } });
    const m = onglet('MYLENE', { ca: { 6: 'B39' }, lignes: [[39, 'FAUGERE ABI SEMAAN', 9660]], total: { ligne: 47, formule: 'SUM(B35:B46)' } });
    const p3 = planifier([lireFichier('TABLEAU DE BORD MACJ 2023.xlsx', classeur('CEDRIC!B68+MYLENE!B47', 16100, null, null, c, m))]);
    expect(p3.ventes).toHaveLength(1);
    expect(p3.ventes[0].honorairesTtc).toBe(16100);
    expect(p3.ventes[0].lignes.map((l) => [l.role, l.montantTtc, l.compte])).toEqual([['part', 6440, true], ['part', 9660, true]]);
    // Avec l'option « parts égales = doublon », deux parts ÉGALES ne se cumulent pas (listées).
    const c2 = onglet('CEDRIC', { ca: { 10: 'B20' }, lignes: [[20, 'DELANOE', 8837.5]], total: { ligne: 25, formule: 'SUM(B9:B24)' } });
    const m2 = onglet('PIERRE', { ca: { 10: 'B25' }, lignes: [[25, 'DELANOE', 8837.5]], total: { ligne: 29, formule: 'SUM(B17:B28)' } });
    const cl = classeur('CEDRIC!B25+PIERRE!B29', 17675, null, null, c2, m2);
    expect(planifier([lireFichier('TABLEAU DE BORD MACJ 2019.xlsx', cl)]).ventes[0].honorairesTtc).toBe(17675);
    const p4 = planifier([lireFichier('TABLEAU DE BORD MACJ 2019.xlsx', cl)], { partsEgales: 'doublon', accepterNonRecalcule: [] });
    expect(p4.ventes[0].honorairesTtc).toBe(8837.5);
    expect(reco(p4, 'TABLEAU DE BORD MACJ 2019.xlsx', 0).resteInexplique).toBe(0);
  });
  it('un rapprochement AMBIGU ne fusionne rien (aucune fusion en chaîne)', () => {
    const c = onglet('CEDRIC', { ca: { 4: 'B16', 7: 'B19' }, lignes: [[16, 'DOYEN HOPPENOT', 3451.67], [19, 'HOPPENOT/DANLOS', 3270]], total: { ligne: 25, formule: 'SUM(B9:B24)' } });
    const jc = onglet('JEAN CLAUDE', { ca: { 4: 'B19' }, lignes: [[19, 'HOPPENOT', 1090]], total: { ligne: 21, formule: 'B19' } });
    const p5 = planifier([lireFichier('TABLEAU DE BORD MACJ 2019.xlsx', classeur("CEDRIC!B25+'JEAN CLAUDE'!B21", 7811.67, null, null, c, jc))]);
    expect(p5.ventes).toHaveLength(3);
    expect(p5.rapports[0].rapprochements.join('\n')).toMatch(/AMBIGU/);
  });
});

describe('D4 — le mois vient de la formule « CA » ; rien n’est deviné', () => {
  const c = onglet('CEDRIC', { ca: { 1: 7500, 2: 'B10', 3: 'B12+B13', 12: 'B10' }, lignes: [[9, 'COMBOT', 7500], [10, 'PETIOT', 12500], [12, 'A', 100], [13, 'B', 200], [16, 'SISCARE', 18000]],
    total: { ligne: 15, formule: 'SUM(B9:B14)' } });
  c.cellules.N2 = { v: null, f: 'B16' };
  const p = planifier([lireFichier('TABLEAU DE BORD 2019 .xlsx', classeur('CEDRIC!B15/1.2', 20300 / 1.2, null, null, c))]);
  it('sans formule : « mois à confirmer » ; plusieurs mois : « mois à confirmer » ; un montant saisi en dur : « à rattacher »', () => {
    const v = (l: string) => p.ventes.find((x) => x.libelle === l)!;
    expect(v('COMBOT').mois).toBeNull();
    expect(v('COMBOT').motifMois).toMatch(/aucune formule/);
    expect(v('PETIOT').mois).toBeNull();
    expect(v('PETIOT').motifMois).toMatch(/plusieurs formules « CA » : 2, 12/);
    expect(v('A').mois).toBe(3);
    expect(p.aRattacher.map((a) => [a.m.cellule, a.m.montant])).toEqual([['D2', 7500]]);
  });
  it('une ligne hors de la somme de l’onglet, qu’une formule « CA » place dans un mois, est importée — écart expliqué (B3)', () => {
    expect(p.ventes.find((x) => x.libelle === 'SISCARE')?.mois).toBe(11);
    const r = reco(p, 'TABLEAU DE BORD 2019 .xlsx', 0);
    expect(r.ecarts.map((e) => e.montant)).toEqual([18000]);
    expect(r.resteInexplique).toBe(0);
    expect(centimes(r.importeTtc)).toBe(centimes(20300 + 18000));
  });
});

describe('D5 — les rétrocessions saisies au mois', () => {
  it('une seule vente du négociateur ce mois → rattachée ; plusieurs → « à répartir » ; « =1200+1500 » → deux rétrocessions', () => {
    const c = onglet('ARNAUD', { ca: { 4: 'B9', 6: 'B11+B12' }, app: { 4: 2600, 6: '=1200+1500' }, lignes: [[9, 'NITLECH', 11950], [11, 'LINOL', 14000], [12, 'ARAUJO', 15000]],
      total: { ligne: 17, formule: 'SUM(B9:B15)' } });
    const p = planifier([lireFichier('TABLEAU DE BORD 2025.xlsx', classeur('ARNAUD!B17/1.2', 40950 / 1.2, null, null, c))]);
    expect(p.retros.map((r) => [r.m.mois, r.m.montant, r.venteCle === null ? 'à répartir' : p.ventes.find((v) => v.cle === r.venteCle)?.libelle]))
      .toEqual([[4, 2600, 'NITLECH'], [6, 1200, 'à répartir'], [6, 1500, 'à répartir']]);
    expect(reco(p, 'TABLEAU DE BORD 2025.xlsx', 2).resteInexplique).toBe(0);
  });
});

describe('D2 — OURY / BERTRAND : un compromis 2025 vendu en 2026 n’est compté qu’en 2026', () => {
  const c25 = onglet('CATHERINE', { lignes: [[22, 'AURY MONIQUE/ ANNIE ROY', 20000], [31, 'OURY/BERTRAND', 50000]], ca: { 11: 'B22' }, total: { ligne: 23, formule: 'SUM(B19:B22)' } });
  c25.cellules.A32 = { v: 'TOTAL COMPROMIS' }; c25.cellules.B32 = { v: null, f: 'SUM(B25:B31)' };
  const c26 = onglet('CATHERINE', { lignes: [[22, 'OURY/BERTRAND', 50000]], ca: { 2: 'B22' }, total: { ligne: 26, formule: 'SUM(B19:B25)' } });
  const f25 = lireFichier('TABLEAU DE BORD 2025.xlsx', classeur('CATHERINE!B23/1.2', 20000 / 1.2, 'CATHERINE!B32/1.2', 50000 / 1.2, c25));
  const f26 = lireFichier('TABLEAU DE BORD 2026.xlsx', classeur('CATHERINE!B26/1.2', 50000 / 1.2, null, null, c26));
  const p = planifier([f25, f26]);
  it('une seule vente OURY, en 2026, vendue en février ; sa ligne 2025 la suit, hors honoraires', () => {
    const oury = p.ventes.filter((v) => v.libelle.startsWith('OURY'));
    expect(oury).toHaveLength(1);
    expect([oury[0].annee, oury[0].statut, oury[0].mois]).toEqual([2026, 'vendue', 2]);
    expect(oury[0].lignes.map((l) => [l.occ.fichier, l.compte])).toEqual([['TABLEAU DE BORD 2026.xlsx', true], ['TABLEAU DE BORD 2025.xlsx', false]]);
  });
  it('le rapport 2025 explique l’écart des compromis par D2, au centime', () => {
    const r = reco(p, 'TABLEAU DE BORD 2025.xlsx', 1);
    expect(r.importeTtc).toBe(0);
    expect(r.ecarts[0].libelle).toMatch(/OURY\/BERTRAND.*D2/);
    expect(r.resteInexplique).toBe(0);
  });
});

describe('B4 — un total qui ne s’explique pas bloque le fichier', () => {
  const c = onglet('CEDRIC', { ca: { 1: 'B10' }, lignes: [[10, 'X', 1000]], total: { ligne: 15, formule: 'SUM(B9:B14)' } });
  it('un total AFFICHÉ non recalculé bloque, sauf si Arno l’accepte pour ce fichier', () => {
    const cl = classeur('CEDRIC!B15', 999, null, null, c);
    const nom = 'TABLEAU DE BORD 2024.xlsx';
    expect(planifier([lireFichier(nom, cl)]).rapports[0].bloque).toBe(true);
    expect(planifier([lireFichier(nom, cl)], { partsEgales: 'parts', accepterNonRecalcule: [nom] }).rapports[0].bloque).toBe(false);
  });
  it('D6 — un #REF! dans la ligne « CA » est ignoré et signalé', () => {
    const d = onglet('CEDRIC', { ca: { 1: 'B10', 2: 'B82+#REF!' }, lignes: [[10, 'X', 1000]], total: { ligne: 15, formule: 'SUM(B9:B14)' } });
    const f = lireFichier('TABLEAU DE BORD 2024.xlsx', classeur('CEDRIC!B15', 1000, null, null, d));
    expect(f.alertes.join('\n')).toMatch(/#REF! ignorée \(D6\)/);
    expect(planifier([f]).rapports[0].bloque).toBe(false);
  });
});

describe('🔴 LOT C — décisions d’Arno du 27/10/2026', () => {
  it('la même vente notée chez les deux sociétés la même année forme UN groupe « à attribuer » (HOPPENOT : une note CRITERIMMO, deux MACJ)', () => {
    const crit = onglet('CEDRIC', { ca: { 10: 'B25' }, lignes: [[25, 'HOPPENOT / DANLOS', 2180], [27, 'DHIB / FARIA', 10000]], total: { ligne: 28, formule: 'SUM(B9:B27)' } });
    crit.cellules.L2 = { v: null, f: 'B27' };
    const mc = onglet('CEDRIC', { ca: { 5: 'B16', 7: 'B19', 10: 'B22' }, lignes: [[16, 'DOYEN HOPPENOT', 3451.67], [19, 'HOPPENOT/DANLOS', 3270], [22, 'DHIB/FARIA', 5000]],
      total: { ligne: 25, formule: 'SUM(B9:B24)' } });
    const jc = onglet('JEAN CLAUDE', { ca: { 4: 'B19' }, lignes: [[19, 'HOPPENOT', 1090]], total: { ligne: 21, formule: 'B19' } });
    const p = planifier([lireFichier('TABLEAU DE BORD 2019 .xlsx', classeur('CEDRIC!B28/1.2', 12180 / 1.2, null, null, crit)),
      lireFichier('TABLEAU DE BORD MACJ 2019.xlsx', classeur("CEDRIC!B25+'JEAN CLAUDE'!B21", 12811.67, null, null, mc, jc))]);
    expect(p.doubles.map((g) => g.ventes.length).sort()).toEqual([2, 3]);
    expect(p.interSocietes).toHaveLength(3);
  });
  it('MACJ 2023 : accepté nommément, avec son motif, malgré le total non recalculé ; les parts restent gardées', () => {
    expect(ACCEPTATIONS_NON_RECALCULE.map((a) => a.fichier)).toEqual(['TABLEAU DE BORD MACJ 2023.xlsx']);
    expect(acceptation('TABLEAU DE BORD MACJ 2023.xlsx', OPTIONS_DEFAUT)).toMatch(/^accepté par décision d'Arno, 27\/10\/2026.*10 950 €.*179 935 €/);
    expect(acceptation('TABLEAU DE BORD MACJ 2024.xlsx', OPTIONS_DEFAUT)).toBeNull();
    expect(OPTIONS_DEFAUT.partsEgales).toBe('parts');
    const c = onglet('CEDRIC', { ca: { 1: 'B10' }, lignes: [[10, 'X', 1000]], total: { ligne: 15, formule: 'SUM(B9:B14)' } });
    const r = planifier([lireFichier('TABLEAU DE BORD MACJ 2023.xlsx', classeur('CEDRIC!B15', 999, null, null, c))]).rapports[0];
    expect(r.bloque).toBe(false);
    expect(r.reconciliations[0].ecarts.at(-1)?.libelle).toMatch(/✔ accepté par décision d'Arno/);
  });
});
