import { describe, expect, it } from 'vitest';
import { libelleRegleApporteur, typeDeBienDesLots, verifierActivite, verifierApporteur, type Apporteur } from './suivi';
import {
  type ActiviteCalcul, apporteursEtCollegues, commissionApporteurDe, cumulApporteur, honorairesGestionDuBail, moisDusRecurrent, partGestionMensuelleDe,
  partGestionSignatureDe, partLocationDe, sectionApporteurs, totaux, totauxApporteurs, totauxPeriode,
} from './tableauBord';

/**
 * 🔴 Arno (24/10/2026, migration 413) — LA COMMISSION D'APPORTEUR « ONE SHOT » / « RÉCURRENT », PART LOCATION + PART GESTION :
 *   · honoraires de gestion mensuels HT = loyer CC × taux de gestion HT du bien (manquant → 0, et dit) ;
 *   · One shot : part gestion = taux × mensuels × 12, due une fois à la signature ; Récurrent : taux × mensuels, chaque mois en gestion ;
 *   · le Suivi (dû aux apporteurs, par mois, par apporteur, par collègue, la fiche) en tient compte ; le CA net et la commission du
 *     négociateur restent sur la part location ; l'historique ne bouge pas.
 */
const centimes = (x: number): number => Math.round(x * 100) / 100;
const APP = (baremes: Apporteur['baremes']): Apporteur => ({ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes,
  collegues: [{ depuis: '2026-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }] });
const ONE_SHOT = APP([{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0.2 }]);
const RECURRENT = APP([{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1 }]);
const ligne = (p: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: true, categoriePrime: null, apporteurId: 3, apporteurNom: 'Kin Immo', apporteurTaux: null, commissionSaisie: null,
  negociateurId: 5, negociateurLibelle: 'N', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: 900, charges: 100,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', tauxGestionBien: 4.5, finGestion: null, ...p,
});
const ctx = (ap: Apporteur, extra: Partial<{ recurrents: ActiviteCalcul[]; aujourdhui: string }> = {}) => ({ regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
  apporteurs: [ap], retrocessions: [], ...extra });

describe('🔴 les deux exemples d’Arno, au centime', () => {
  it('One shot : loyer CC 1 000 €/mois, gestion 4,5 % HT, taux gestion apporteur 20 % → 1 000 × 12 × 4,5 % × 20 % = 108,00 €', () => {
    const a = ligne();
    expect(honorairesGestionDuBail(a)).toEqual({ montant: 45 });
    expect(centimes(partGestionSignatureDe(a, [ONE_SHOT]))).toBe(108);
    expect(partGestionMensuelleDe(a, [ONE_SHOT])).toBe(0);
    expect(centimes(partLocationDe(a, [ONE_SHOT]))).toBe(100);                       // 10 % × (600 + 400)
    expect(centimes(commissionApporteurDe(a, [ONE_SHOT]))).toBe(208);                // dû une fois, à la signature
  });
  it('Récurrent : 1 000 × 4,5 % × 10 % = 4,50 €/mois ; la part location reste due une fois', () => {
    const a = ligne();
    expect(centimes(partGestionMensuelleDe(a, [RECURRENT]))).toBe(4.5);
    expect(partGestionSignatureDe(a, [RECURRENT])).toBe(0);
    expect(centimes(commissionApporteurDe(a, [RECURRENT]))).toBe(100);
  });
});

describe('🔴 données manquantes : part gestion 0, et dit', () => {
  it('sans loyer, sans taux de gestion du bien, ou bien hors gestion', () => {
    expect(honorairesGestionDuBail(ligne({ loyerHc: null }))).toEqual({ manque: 'loyer_ou_taux' });
    expect(honorairesGestionDuBail(ligne({ tauxGestionBien: null }))).toEqual({ manque: 'loyer_ou_taux' });
    expect(honorairesGestionDuBail(ligne({ mandatGestion: false, avecGestion: false }))).toEqual({ manque: 'hors_gestion' });
    expect(partGestionSignatureDe(ligne({ loyerHc: null }), [ONE_SHOT])).toBe(0);
    expect(partGestionMensuelleDe(ligne({ tauxGestionBien: null }), [RECURRENT])).toBe(0);
    // des charges absentes valent 0 (loyer CC = loyer HC)
    expect(honorairesGestionDuBail(ligne({ charges: null }))).toEqual({ montant: 40.5 });
  });
});

describe('🔴 le mode et les taux du bail priment sur la règle (modifiables bail par bail) ; jamais rétroactif', () => {
  it('le bail choisit « Récurrent » et 5 % sur une règle « One shot 20 % »', () => {
    const a = ligne({ apporteurMode: 'recurrent', apporteurTauxGestion: 0.05 });
    expect(partGestionSignatureDe(a, [ONE_SHOT])).toBe(0);
    expect(centimes(partGestionMensuelleDe(a, [ONE_SHOT]))).toBe(2.25);
  });
  it('une règle datée APRÈS la signature ne s’applique pas : le bail garde la règle de sa date', () => {
    const ap = APP([{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 },
      { depuis: '2026-06-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1 }]);
    expect(partGestionSignatureDe(ligne(), [ap])).toBe(0);
    expect(partGestionMensuelleDe(ligne(), [ap])).toBe(0);
    expect(centimes(partGestionMensuelleDe(ligne({ dateSignature: '2026-07-01' }), [ap]))).toBe(4.5);
  });
});

describe('🔴 Récurrent : dû mois par mois, jusqu’au mois en cours, arrêté à la sortie de gestion', () => {
  it('du mois de signature au mois en cours', () => {
    expect(moisDusRecurrent(ligne(), '2026-06-15')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });
  it('arrêt à la sortie de gestion : le mois de la sortie et les suivants ne sont plus dus', () => {
    expect(moisDusRecurrent(ligne({ finGestion: '2026-05-20' }), '2026-10-24')).toEqual(['2026-03', '2026-04']);
    expect(moisDusRecurrent({ dateSignature: '2025-11-03', finGestion: null }, '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('le Suivi du mois et de l’année : la part récurrente s’ajoute au dû, PAS au CA net ni à la commission du négociateur', () => {
    const a = ligne();
    const c = ctx(RECURRENT, { recurrents: [a], aujourdhui: '2026-10-24' });
    const mars = totauxPeriode([a], c, { annee: 2026, mois: 3 });
    expect(centimes(mars.apporteurs)).toBe(104.5);                                    // 100 (location) + 4,50 (gestion de mars)
    expect(centimes(mars.apporteursRecurrents)).toBe(4.5);
    expect(centimes(mars.caNet)).toBe(900);                                           // 1 000 − 100 (part location seule)
    const mai = totauxPeriode([a], c, { annee: 2026, mois: 5 });                      // aucune affaire signée en mai, la part est due
    expect(mai.nb).toBe(0);
    expect(centimes(mai.apporteurs)).toBe(4.5);
    const annee = totauxPeriode([a], c, { annee: 2026, mois: null });                 // mars → octobre : 8 mois
    expect(centimes(annee.apporteursRecurrents)).toBe(36);
    const sortie = totauxPeriode([a], ctx(RECURRENT, { recurrents: [{ ...a, finGestion: '2026-05-01' }], aujourdhui: '2026-10-24' }), { annee: 2026, mois: null });
    expect(centimes(sortie.apporteursRecurrents)).toBe(9);                            // mars, avril
    // la commission du négociateur ne bouge pas avec la part gestion
    const sans = totauxPeriode([{ ...a, apporteurId: 3, tauxGestionBien: null }], ctx(RECURRENT), { annee: 2026, mois: 3 });
    expect(mars.commission).toBe(sans.commission);
  });
  it('One shot : la part gestion au mois de signature, dans le dû (dont gestion), pas dans le CA net', () => {
    const t = totaux([ligne()], ctx(ONE_SHOT));
    expect(centimes(t.apporteurs)).toBe(208);
    expect(centimes(t.apporteursLocation)).toBe(100);
    expect(centimes(t.apporteursGestion)).toBe(108);
    expect(centimes(t.caNet)).toBe(900);
  });
});

describe('🔴 par apporteur, par collègue, la fiche de l’apporteur', () => {
  it('feuille du mois : l’apporteur et son collègue reçoivent la part récurrente du mois', () => {
    const a = ligne();
    const r = apporteursEtCollegues([], [RECURRENT], { lignes: [a], mois: ['2026-05'], aujourdhui: '2026-10-24' });
    expect(r.apporteurs.map((x) => [x.nom, x.nb, centimes(x.commission), centimes(x.recurrente)])).toEqual([['Kin Immo', 0, 4.5, 4.5]]);
    expect(r.collegues.map((x) => [x.libelle, centimes(x.commission)])).toEqual([['Jean-Baptiste PONS', 4.5]]);
  });
  it('fiche : dont location, dont gestion (one shot), dont gestion récurrente ; par mois', () => {
    const one = ligne({ id: 1 });
    const rec = ligne({ id: 2, dateSignature: '2026-09-02', apporteurMode: 'recurrent', apporteurTauxGestion: 0.1 });
    const c = cumulApporteur([one, rec], [ONE_SHOT], 3, '2026-10-24');
    expect([centimes(c.total.location), centimes(c.total.gestion), centimes(c.total.recurrente), centimes(c.total.commission)]).toEqual([200, 108, 9, 317]);
    expect(c.parMois.map((m) => [m.mois, centimes(m.commission)])).toEqual([['2026-10', 4.5], ['2026-09', 104.5], ['2026-03', 208]]);
    expect(centimes(totauxApporteurs([one, rec], [ONE_SHOT], '2026-10-24')[3].commission)).toBe(317);
  });
  it('section « Apporteurs » de la période : la part récurrente due sur la période', () => {
    const a = ligne();
    const s = sectionApporteurs([a], ctx(RECURRENT, { recurrents: [a], aujourdhui: '2026-10-24' }), { annee: 2026, mois: 4 }, ['2026-04']);
    expect(s.map((l) => [l.nom, l.nb, centimes(l.commissions)])).toEqual([['Kin Immo', 0, 4.5]]);
  });
});

describe('🔴 l’historique ne bouge pas', () => {
  it('une règle d’avant la 413 (sans mode ni taux sur la gestion) = « One shot — gestion 0 % » : la commission est la part location', () => {
    const ancienne = APP([{ depuis: '2019-01-01', taux: 0.1, coutFixeMensuel: 0 }]);
    const a = ligne({ dateSignature: '2023-05-02', tauxGestionBien: null, apporteurMode: null, apporteurTauxGestion: null });
    expect(commissionApporteurDe(a, [ancienne])).toBe(partLocationDe(a, [ancienne]));
    // et même avec un taux de gestion du bien, une ligne reprise (commission saisie, sans taux relevé) ne change pas
    const reprise = ligne({ commissionSaisie: 64.39, tauxGestionBien: null });
    expect(commissionApporteurDe(reprise, [ONE_SHOT])).toBe(64.39);
    expect(libelleRegleApporteur(ancienne.baremes[0])).toBe('One shot — location 10 %, gestion 0 %');
  });
});

describe('🔴 la saisie', () => {
  it('la règle : mode (défaut One shot), taux sur la location, taux sur la gestion', () => {
    expect(verifierApporteur({ nom: 'X', type: 'agence', taux: '10', tauxGestion: '20', mode: 'one_shot', depuis: '2026-11-01' })).toMatchObject({ ok: true, taux: 0.1, tauxGestion: 0.2, mode: 'one_shot' });
    expect(verifierApporteur({ nom: 'X', type: 'agence', taux: '10', tauxGestion: '10', mode: 'recurrent', depuis: '2026-11-01' })).toMatchObject({ ok: true, mode: 'recurrent', tauxGestion: 0.1 });
    expect(verifierApporteur({ nom: 'X', type: 'agence', taux: '10', depuis: '2026-11-01' })).toMatchObject({ ok: true, mode: 'one_shot', tauxGestion: 0 });
    expect(verifierApporteur({ nom: 'X', type: 'agence', taux: '10', mode: 'mensuel', depuis: '2026-11-01' }).ok).toBe(false);
    expect(verifierApporteur({ nom: 'X', type: 'agence', taux: '10', tauxGestion: 'beaucoup', depuis: '2026-11-01' }).ok).toBe(false);
    expect(libelleRegleApporteur({ taux: 0.1, mode: 'recurrent', tauxGestion: 0.1 })).toBe('Récurrent — location 10 %, gestion 10 % / mois');
    expect(libelleRegleApporteur({ taux: 0.1, mode: 'one_shot', tauxGestion: 0.2 })).toBe('One shot — location 10 %, gestion 20 %');
  });
  it('le bail : mode et taux sur la gestion facultatifs (vides = la règle)', () => {
    const base = { dateSignature: '2026-10-24', honoProprietaireHt: '', honoLocataireHt: '', apporteurTaux: '', origineContact: 'apporteur', apporteurId: 3 };
    const v = verifierActivite({ ...base, apporteurMode: 'recurrent', apporteurTauxGestion: '10' });
    expect(v.ok && [v.valeurs.apporteurMode, v.valeurs.apporteurTauxGestion]).toEqual(['recurrent', 0.1]);
    const vide = verifierActivite(base);
    expect(vide.ok && [vide.valeurs.apporteurMode, vide.valeurs.apporteurTauxGestion]).toEqual([null, null]);
    expect(verifierActivite({ ...base, apporteurTauxGestion: '120' }).ok).toBe(false);
  });
});

describe('🔴 Arno (24/10/2026) — le « Type de bien » d’après les lots loués', () => {
  const L = (role: 'logement' | 'annexe', categorie: string | null, place = false) => ({ role, categorie, place });
  it('Parking seulement si TOUS les lots loués sont des parkings ; sinon la famille du lot principal', () => {
    expect(typeDeBienDesLots([])).toBeNull();
    expect(typeDeBienDesLots([L('annexe', 'parking', true)])).toEqual({ type: 'parking', parkingPermis: true });
    expect(typeDeBienDesLots([L('annexe', 'box', true), L('annexe', 'parking', true)])).toEqual({ type: 'parking', parkingPermis: true });
    expect(typeDeBienDesLots([L('logement', 'logement'), L('annexe', 'parking', true)])).toEqual({ type: 'logement', parkingPermis: false });
    expect(typeDeBienDesLots([L('logement', 'local'), L('annexe', 'parking', true)])).toEqual({ type: 'local', parkingPermis: false });
    expect(typeDeBienDesLots([L('annexe', 'cave'), L('annexe', 'parking', true)])).toEqual({ type: 'logement', parkingPermis: false });
    expect(typeDeBienDesLots([L('logement', null)])).toEqual({ type: 'logement', parkingPermis: false });
    // le lot principal : le logement de la fiche, même après une annexe « local »
    expect(typeDeBienDesLots([L('annexe', 'local'), L('logement', 'logement')])).toEqual({ type: 'logement', parkingPermis: false });
  });
});
