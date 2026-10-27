import { describe, expect, it } from 'vitest';
import {
  anneesDe, caHtParMois, compteDansSociete, groupesDoubles, caHtPortePar, celluleGlobal, historique, ht, moisAConfirmer, negociateursDe, NON_ATTRIBUE, parApporteur, parNegociateur,
  previsionnel, resteGestionPropose, resteTtcDe, totauxMois, variation, ventesProposees, type LigneVente, type Retrocession, type Vente,
} from './modele';

/** TUILE « TRANSACTION » — les calculs purs : HT = TTC ÷ 1,2 sans arrondi, le mois du CA, le prévisionnel, les parts, le CA global. */
let idLigne = 0;
const ligne = (negociateur: string, role: LigneVente['role'], montantTtc: number | null, compte = true): LigneVente => ({
  id: ++idLigne, negociateur, role, montantTtc, nature: 'vente', compte, origine: 'import', sourceFichier: 'F', sourceOnglet: negociateur, sourceLigne: 1, note: null });
const vente = (id: number, o: Partial<Vente> = {}): Vente => ({
  id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 3, dateCompromis: null, apporteur: null, note: null,
  origine: 'import', sourceFichier: 'F', sourceOnglet: 'CEDRIC', sourceLigne: id, lignes: [ligne('CEDRIC', 'vendeur', null)], double: null, ...o });
const retro = (id: number, o: Partial<Retrocession> = {}): Retrocession => ({
  id, societe: 'criterimmo', annee: 2025, mois: 3, negociateur: 'CEDRIC', montantTtc: 1200, apporteur: null, venteId: null, libelle: null, origine: 'import',
  sourceOnglet: 'CEDRIC', sourceCellule: 'F3', ...o });

describe('HT, mois du CA, prévisionnel', () => {
  it('HT = TTC ÷ 1,2, sans arrondi', () => {
    expect(ht(11025)).toBe(11025 / 1.2);
    expect(ht(8837.5)).toBe(8837.5 / 1.2);
  });
  it('une vente sans mois est « mois à confirmer » : dans l’année, dans aucun mois', () => {
    const v = [vente(1), vente(2, { mois: null }), vente(3, { statut: 'compromis', mois: null })];
    expect(v.map(moisAConfirmer)).toEqual([false, true, false]);
    const parMois = caHtParMois(v, 2025);
    expect(parMois[2]).toBe(10000);
    expect(parMois.reduce((s, x) => s + x, 0)).toBe(10000);
    const h = historique({ ventes: v, retrocessions: [] }, [2025])[0];
    expect(h.caHt).toBe(20000);
    expect(h.moisAConfirmerHt).toBe(10000);
    expect(h.nbCompromis).toBe(1);
    expect(h.compromisHt).toBe(10000);
  });
  it('le compromis n’est pas du CA : il fait le prévisionnel de son année', () => {
    const e = { ventes: [vente(1), vente(2, { statut: 'compromis', mois: null, societe: 'macj', honorairesTtc: 6000 })], location: null, gestion: [] };
    expect(celluleGlobal(e, 2025, null).totalHt).toBe(10000);
    expect(previsionnel(e, 2025)).toEqual({ criterimmoHt: 0, macjHt: 5000, totalHt: 5000 });
  });
});

describe('le mois d’une société : rétrocessions, paye, reste à l’agence', () => {
  it('reste = honoraires − rétrocessions du mois − paye des négociateurs', () => {
    const v = vente(1, { societe: 'macj', honorairesTtc: 11025, lignes: [ligne('MYLENE', 'negociateur', 3215), ligne('CEDRIC', 'part', 7810, false)] });
    const r = retro(1, { societe: 'macj', venteId: 1, montantTtc: 1200 });
    const t = totauxMois({ ventes: [v], retrocessions: [r] }, 2025, 3);
    expect(t.caHt).toBe(11025 / 1.2);
    expect(t.retroHt).toBe(1200 / 1.2);
    expect(t.payeHt).toBe(3215 / 1.2);
    expect(t.resteHt).toBe((11025 - 1200 - 3215) / 1.2);
    expect(resteTtcDe(v, [r])).toBe(11025 - 1200 - 3215);
  });
  it('les négociateurs : la somme du CA porté redonne le CA (parts, partage à égalité, non attribué)', () => {
    const enParts = vente(1, { honorairesTtc: 16100, lignes: [ligne('CEDRIC', 'part', 6440), ligne('MYLENE', 'part', 9660)] });
    const partage = vente(2, { honorairesTtc: 7000, lignes: [ligne('CEDRIC', 'vendeur', null), ligne('ARNAUD', 'vendeur', null)] });
    const sans = vente(3, { honorairesTtc: 1200, lignes: [] });
    expect(caHtPortePar(enParts, 'MYLENE')).toBe(9660 / 1.2);
    expect(caHtPortePar(partage, 'ARNAUD')).toBe(3500 / 1.2);
    expect(negociateursDe(sans)).toEqual([NON_ATTRIBUE]);
    const lignes = parNegociateur([enParts, partage, sans], []);
    const total = lignes.reduce((s, l) => s + l.caHt, 0);
    expect(total).toBeCloseTo((16100 + 7000 + 1200) / 1.2, 9);
    expect(lignes.find((l) => l.negociateur === 'CEDRIC')?.nbVentes).toBe(2);
  });
  it('les apporteurs : un apporteur sans nom est « Apporteur non nommé » ; les « à répartir » se comptent', () => {
    const v = vente(1, { apporteur: 'M. Dupont' });
    const a = parApporteur([retro(1, { venteId: 1 }), retro(2), retro(3, { apporteur: 'Mme X', venteId: 1 })], [v]);
    expect(a.map((x) => [x.apporteur, x.nbRetrocessions, x.aRepartir])).toEqual([['Apporteur non nommé', 1, 1], ['M. Dupont', 1, 0], ['Mme X', 1, 0]]);
  });
  it('l’outil de rattachement propose d’abord les ventes du négociateur et du mois', () => {
    const ventes = [vente(1), vente(2, { mois: 4 }), vente(3, { lignes: [ligne('ARNAUD', 'vendeur', null)] }), vente(4, { societe: 'macj' })];
    const p = ventesProposees(retro(1), ventes);
    expect(p.duMois.map((v) => v.id)).toEqual([1]);
    expect(p.autres.map((v) => v.id)).toEqual([2, 3]);
  });
});

describe('le CA global : vente CRITERIMMO + vente MACJ + location + gestion', () => {
  const e = {
    ventes: [vente(1, { honorairesTtc: 12000 }), vente(2, { societe: 'macj', honorairesTtc: 6000, mois: 3 }), vente(3, { mois: null, honorairesTtc: 2400 })],
    location: { '2025-03': 9398.6, '2025-04': 100 },
    gestion: [{ annee: 2025, mois: 3, honorairesHt: 14665 }],
  };
  it('un mois : chaque part, le total, et le total par société (location et gestion = CRITERIMMO)', () => {
    const c = celluleGlobal(e, 2025, 3);
    expect(c).toEqual({ venteCriterimmoHt: 10000, venteMacjHt: 5000, aAttribuerHt: 0, locationHt: 9398.6, gestionHt: 14665, totalHt: 10000 + 9398.6 + 14665 + 5000,
      criterimmoHt: 10000 + 9398.6 + 14665, macjHt: 5000 });
  });
  it('l’année : les ventes « mois à confirmer » comprises ; location non lue = null, jamais 0 inventé', () => {
    expect(celluleGlobal(e, 2025, null).venteCriterimmoHt).toBe(12000);
    expect(celluleGlobal({ ...e, location: null }, 2025, 3).locationHt).toBeNull();
    expect(celluleGlobal(e, 2025, 5).gestionHt).toBeNull();
  });
  it('variation : null sans base', () => {
    expect(variation(10, 0)).toBeNull();
    expect(variation(15, 10)).toBe(0.5);
  });
  it('le reste de gestion proposé = honoraires − ADHOC − salarié', () => {
    expect(resteGestionPropose({ honorairesHt: 15345.12, adhocHt: 2767.2, salarieHt: 2444 })).toBe(15345.12 - 2767.2 - 2444);
    expect(resteGestionPropose({ honorairesHt: null, adhocHt: 1, salarieHt: 1 })).toBeNull();
  });
  it('les années présentes, l’année en cours comprise', () => {
    expect(anneesDe({ ventes: [vente(1, { annee: 2019 })], retrocessions: [retro(1, { annee: 2021 })] }, '2026-10-27')).toEqual([2019, 2021, 2026]);
  });
});

describe('🔴 LOT C — la même vente notée chez CRITERIMMO et chez MACJ', () => {
  const dbl = (attribution: 'a_attribuer' | 'retenue' | 'ecartee') => ({ cle: 'double|DHIB', attribution });
  const notes = (crit: 'a_attribuer' | 'retenue' | 'ecartee', macj: 'a_attribuer' | 'retenue' | 'ecartee') => [
    vente(1, { honorairesTtc: 12000, double: dbl(crit) }),
    vente(2, { societe: 'macj', honorairesTtc: 6000, double: dbl(macj) }),
    vente(3, { honorairesTtc: 2400 }),
  ];
  const e = (v: Vente[]) => ({ ventes: v, location: null, gestion: [] });
  it('à attribuer : comptée UNE fois au global (le plus bas), dans AUCUNE société', () => {
    const v = notes('a_attribuer', 'a_attribuer');
    const a = celluleGlobal(e(v), 2025, null);
    expect([a.venteCriterimmoHt, a.venteMacjHt, a.aAttribuerHt, a.totalHt]).toEqual([2000, 0, 5000, 7000]);
    expect(totauxMois({ ventes: v, retrocessions: [] }, 2025, 3).caHt).toBe(2000);
    expect(celluleGlobal(e(v), 2025, 3).totalHt).toBe(2000);
    const g = groupesDoubles(v);
    expect(g.map((x) => [x.cle, x.attribuee, x.retenuTtc])).toEqual([['double|DHIB', null, 6000]]);
  });
  it('attribuée à CRITERIMMO : dans CRITERIMMO seulement, au montant de SA note ; à MACJ : dans MACJ seulement', () => {
    const c = celluleGlobal(e(notes('retenue', 'ecartee')), 2025, null);
    expect([c.venteCriterimmoHt, c.venteMacjHt, c.aAttribuerHt, c.totalHt]).toEqual([12000, 0, 0, 12000]);
    const m = celluleGlobal(e(notes('ecartee', 'retenue')), 2025, null);
    expect([m.venteCriterimmoHt, m.venteMacjHt, m.aAttribuerHt, m.totalHt]).toEqual([2000, 5000, 0, 7000]);
    expect(compteDansSociete({ double: dbl('ecartee') })).toBe(false);
  });
  it('remise à attribuer (annulation) : de nouveau dans aucune société, une fois au global', () => {
    const r = celluleGlobal(e(notes('a_attribuer', 'a_attribuer')), 2025, null);
    expect(r.totalHt).toBe(7000);
  });
});
