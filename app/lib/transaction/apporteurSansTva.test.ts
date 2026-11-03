import { describe, expect, it } from 'vitest';
import { caNetVente, ecartsCarte, lignesCarteAffaire, resultatDesCartes } from './carteAffaireLignes';
import { controleVentilation } from './partAgence';
import { centimesRepartition } from './repartition';
import { coutsVente } from './coutsGlobal';
import { commissionNetteHt, coutTtcApporteur, htApporteur, parApporteur, totaux, tvaApporteur, type Partie, type Retrocession, type Vente } from './modele';
import { interneA, poserApporteurs, poserApporteursRetros, type TypesApporteurs } from './repo';

/**
 * 🔴 D29 (Arno, 03/11/2026, option A) — LA COMMISSION D'UN APPORTEUR EXTERNE N'A PAS DE TVA. Le montant versé = son HT = son TTC, déduit EN ENTIER
 * des honoraires HT ; toute part facturée (collaborateurs, inter-cabinet, agences extérieures) garde TTC = HT × 1,2 ; la TVA due sur la part de
 * l'apporteur sans être récupérée est une ligne TTC à part. Un apporteur interne (collaborateur) : inchangé. Données fictives (les cas d'Arno).
 */
const partie = (sorte: Partie['sorte'], compteId: number | null, negociateur: string | null, societe: Partie['societe'], pourcentage: number, nom: string | null = null): Partie =>
  ({ sorte, compteId, negociateur, societe, nom, coordonnees: null, pourcentage, montantHt: null, statut: 'associe' });
const vente = (o: Partial<Vente> = {}): Vente => ({ id: 37, societe: 'criterimmo', libelle: 'TEST TRANSACTION', honorairesTtc: 7500, statut: 'compromis', annee: 2027, mois: null,
  dateCompromis: '2026-10-28', apporteur: 'Gardien Dacquet', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
  repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50)] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 2, nom: 'Arnaud Jorel' }, apporteurId: 16, personnes: [] },
  ...o } as Vente);
const C = (htC: number, ttcC: number) => ({ htC, ttcC });

describe('🔴 D29 — la règle unique', () => {
  it('externe : HT = TTC = le versé ; coût TTC = versé × 1,2 ; TVA non récupérable = 0,2 × versé ; interne : comme avant', () => {
    expect([htApporteur(1000), coutTtcApporteur(1000)]).toEqual([1000, 1200]);
    expect(tvaApporteur(1000)).toBeCloseTo(200, 9);
    expect([htApporteur(1200, true), coutTtcApporteur(1200, true), tvaApporteur(1200, true)]).toEqual([1000, 1200, 0]);
    expect(commissionNetteHt(7500, 1000)).toBe(5250);
    expect(commissionNetteHt(7500, 1000, true)).toBeCloseTo(5416.666666, 5);
  });
});

describe('🔴 D29 — TEST TRANSACTION : Gardien Dacquet (externe), 1 000 € sans TVA', () => {
  const v = vente();
  it('honoraires nets par côté : (6 250 − 1 000) × 50 % = 2 625 € HT (3 150 € TTC = HT × 1,2) ; apporteur 1 000 HT = TTC ; TVA non récupérable 200 € TTC', () => {
    const l = lignesCarteAffaire(v, 'criterimmo');
    expect(l.lignes.map((x) => x.honoraires)).toEqual([C(262500, 315000), C(262500, 315000)]);
    expect(l.apporteur).toEqual(C(100000, 100000));
    expect(l.tva).toEqual(C(0, 20000));
    expect(ecartsCarte(v, 'criterimmo', l)).toEqual([]);
    expect(controleVentilation(v, 'criterimmo')!.ecart).toEqual(C(0, 0));
  });
  it('les centimes : base HT 5 250 ; en TTC, commission 7 500 = parts 6 300 + apporteur 1 000 + TVA 200', () => {
    const r = v.repartition!;
    const h = centimesRepartition(r.parties, 7500, 1000, 'criterimmo')!;
    const t = centimesRepartition(r.parties, 7500, 1000, 'criterimmo', 'ttc')!;
    expect([h.commissionHt, h.apporteurHt, h.tvaApporteur, h.baseHt, h.parts]).toEqual([6250, 1000, 0, 5250, [2625, 2625]]);
    expect([t.commissionHt, t.apporteurHt, t.tvaApporteur, t.baseHt, t.parts]).toEqual([7500, 1000, 200, 6300, [3150, 3150]]);
  });
  it('le Résultat (somme des cartes) : CA − apporteurs − TVA non récupérable − … = reste, au centime ; le CA net suit (HT : 5 250 €)', () => {
    const r = resultatDesCartes([v], 'criterimmo');
    expect([r.ca, r.retro, r.tvaApporteur, r.reste]).toEqual([C(625000, 750000), C(100000, 100000), C(0, 20000), C(525000, 630000)]);
    expect(caNetVente(v, 'criterimmo')).toEqual(C(525000, 630000));
  });
  it('apporteur INTERNE (collaborateur) : inchangé — 2 708,33 / 2 708,34 € HT, 3 250 € TTC, aucune TVA perdue', () => {
    const i = vente({ apporteurInterne: true, repartition: { ...vente().repartition!, apporteurInterne: true } });
    const l = lignesCarteAffaire(i, 'criterimmo');
    expect(l.lignes.map((x) => x.honoraires)).toEqual([C(270833, 325000), C(270834, 325000)]);
    expect([l.apporteur, l.tva]).toEqual([C(83333, 100000), null]);
    expect(ecartsCarte(i, 'criterimmo', l)).toEqual([]);
  });
  it('agence extérieure (elle facture) : sa part garde TTC = HT × 1,2 ; avec un apporteur externe, la base est la commission nette HT', () => {
    const ext = vente({ repartition: { retroApporteurTtc: 1000, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 40), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 40),
      partie('exterieure', null, null, null, 20, 'Agence du Parc')] } });
    const l = lignesCarteAffaire(ext, 'criterimmo');
    const parc = l.lignes.flatMap((x) => x.exterieures).reduce((t, y) => C(t.htC + y.m.htC, t.ttcC + y.m.ttcC), C(0, 0));
    expect(parc).toEqual(C(105000, 126000)); // 5 250 × 20 % = 1 050 HT, 1 260 TTC
    expect(ecartsCarte(ext, 'criterimmo', l)).toEqual([]);
    // sans apporteur : rien ne change (6 250 × 20 % = 1 250 HT)
    const sans = vente({ apporteur: null, repartition: { ...ext.repartition!, retroApporteurTtc: 0 } });
    expect(lignesCarteAffaire(sans, 'criterimmo').lignes.flatMap((x) => x.exterieures).reduce((t, y) => t + y.m.htC, 0)).toBe(125000);
  });
});

describe('🔴 D29 — les rétrocessions saisies au mois (l’historique : sans apporteur nommé = externe)', () => {
  const retro = (id: number, venteId: number | null, montantTtc: number, o: Partial<Retrocession> = {}): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 7,
    negociateur: 'CEDRIC', montantTtc, apporteur: null, venteId, libelle: null, origine: 'import', sourceOnglet: 'CEDRIC', sourceCellule: 'J3', ...o });
  const imp = vente({ id: 200, libelle: 'ZEMMOR', honorairesTtc: 12000, statut: 'vendue', mois: 7, annee: 2026, origine: 'import', apporteur: null, repartition: null, dossier: null });
  it('rattachée : 1 200 déduits en entier du HT (10 000 → 8 800), TTC = HT × 1,2 (10 560) ; versé 1 200 sans TVA ; TVA 240 à part', () => {
    const rs = [retro(1, 200, 1200)];
    const l = lignesCarteAffaire(imp, 'criterimmo', { retros: rs });
    expect(l.lignes[0].honoraires).toEqual(C(880000, 1056000));
    expect([l.retro, l.tva]).toEqual([C(120000, 120000), C(0, 24000)]);
    expect(ecartsCarte(imp, 'criterimmo', l)).toEqual([]);
    const r = resultatDesCartes([imp], 'criterimmo', { retros: rs });
    expect([r.retro, r.tvaApporteur, r.reste]).toEqual([C(120000, 120000), C(0, 24000), C(880000, 1056000)]);
  });
  it('les totaux (tuiles) et le tableau par apporteur : le HT du versé ; « sans TVA » ; un interne : ÷ 1,2', () => {
    const rs = [retro(1, 200, 1200), retro(2, null, 600)];
    expect(totaux([imp], rs, 'criterimmo').retroHt).toBeCloseTo(1800, 9);
    const [a] = parApporteur(rs, [imp]);
    expect([a.apporteur, a.retroHt, a.retroTtc, a.sansTva]).toEqual(['Apporteur non nommé', 1800, 1800, true]);
    const [b] = parApporteur([retro(3, 200, 1200, { interne: true })], [imp]);
    expect([b.retroHt, b.sansTva]).toEqual([1000, false]);
  });
  it('« Les coûts » = Suivi CA au centime : CA − commissions − apporteurs (versé + TVA non récupérable) − extérieures = CA net', () => {
    const rs = [retro(1, 200, 1200)];
    const c = coutsVente([imp, vente()], { retros: rs }, 'criterimmo');
    for (const u of ['htC', 'ttcC'] as const) expect(c.ca[u] - c.commissions[u] - c.apporteurs[u] - c.exterieures[u]).toBe(c.net[u]);
    expect(c.apporteurs).toEqual(C(220000, 264000)); // 1 200 + 1 000 versés ; TTC : + 240 + 200 de TVA non récupérable
  });
});

describe('🔴 D29 — interne ou externe : l’annuaire (lecture)', () => {
  const types: TypesApporteurs = { parId: new Map([[16, { compteId: null, interneDepuis: null }], [21, { compteId: 9, interneDepuis: '2026-01-01' }]]),
    parNom: new Map([['gardien dacquet', { compteId: null, interneDepuis: null }], ['léa martin', { compteId: 5, interneDepuis: null }]]) };
  it('un compte = interne (depuis sa date) ; partenaire, agence, internet, hors annuaire, sans nom : externe', () => {
    expect([interneA(types.parId.get(21), '2026-06-01'), interneA(types.parId.get(21), '2025-12-31'), interneA(types.parId.get(16), '2026-06-01'), interneA(undefined, '2026-06-01')])
      .toEqual([true, false, false, false]);
  });
  it('ventes : `apporteurInterne` posé pour un collaborateur seulement ; un externe saisi « en HT » : le montant tapé est le versé', () => {
    const [a, b] = poserApporteurs([vente({ dossier: { ...vente().dossier!, apporteurId: 21 } }),
      vente({ retroApporteur: { montant: 1000, unite: 'ht' }, repartition: { ...vente().repartition!, retroApporteurTtc: 1200 } })], types);
    expect([a.apporteurInterne, a.repartition!.apporteurInterne]).toEqual([true, true]);
    expect([b.apporteurInterne, b.repartition!.apporteurInterne, b.repartition!.retroApporteurTtc]).toEqual([undefined, undefined, 1000]);
  });
  it('rétrocessions : par leur nom, sinon l’apporteur de leur vente ; sans nom ni vente (« à répartir ») : externe', () => {
    const rs = poserApporteursRetros([
      { id: 1, societe: 'criterimmo', annee: 2026, mois: 7, negociateur: 'X', montantTtc: 10, apporteur: 'Léa MARTIN', venteId: null, libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null },
      { id: 2, societe: 'criterimmo', annee: 2026, mois: 7, negociateur: 'X', montantTtc: 10, apporteur: null, venteId: 38, libelle: null, origine: 'import', sourceOnglet: null, sourceCellule: null },
      { id: 3, societe: 'criterimmo', annee: 2026, mois: 7, negociateur: 'X', montantTtc: 10, apporteur: null, venteId: null, libelle: null, origine: 'import', sourceOnglet: null, sourceCellule: null }],
    types, new Map([[38, { apporteurId: 21, apporteur: null }]]));
    expect(rs.map((r) => r.interne)).toEqual([true, true, undefined]);
  });
});
