import { describe, expect, it } from 'vitest';
import {
  auteurDigicode, candidatsAnciens, changementsAVenir, codeEnVigueur, ligneEnVigueur, memeCode, mentionEnregistre, mentionPrevu, quandPrevu, placeBatiment, planRepriseUnifiee, texteRapportRepriseUnifiee, valeurSaisie,
  type DonneesAnciennes, type LigneDigicode,
} from './digicodes';

/** 🔴🔴 Arno (16/11/2026, chantier « Digicodes unifiés », lot 1) — les règles pures de la base unique : en vigueur à une date, repli, arbitrage, reprise. */
let n = 0;
const L = (o: Partial<LigneDigicode>): LigneDigicode => ({ id: ++n, adresseCle: '12 rue x', adresseLibelle: '12 rue X', batimentCle: '', batimentLibelle: null, digicode: true, code: 'A1',
  appliqueLe: '2026-11-01T10:00:00.000Z', nature: 'saisie', origine: 'fiche_copropriete', lotId: null, corrigeId: null, annuleLe: null, creeLe: '2026-11-01T10:00:00.000Z', creeParLibelle: 'arno', ...o });
const LE_15 = new Date('2026-11-15T12:00:00.000Z');

describe('le code EN VIGUEUR à un instant', () => {
  const saisie = L({ code: 'A1', appliqueLe: '2026-11-01T10:00:00.000Z' });
  const changement = L({ code: 'B2', nature: 'changement', appliqueLe: '2026-11-20T08:00:00.000Z' });
  it('avant la date d’application : l’ancien code ; à partir de la date : le nouveau ; ensuite l’ancien reste dans l’historique', () => {
    const l = [saisie, changement];
    expect(ligneEnVigueur(l, '12 rue x', '', LE_15)?.code).toBe('A1');
    expect(ligneEnVigueur(l, '12 rue x', '', new Date('2026-11-20T07:59:59.000Z'))?.code).toBe('A1');
    expect(ligneEnVigueur(l, '12 rue x', '', new Date('2026-11-20T08:00:00.000Z'))?.code).toBe('B2');
    expect(changementsAVenir(l, '12 rue x', '', LE_15).map((x) => x.code)).toEqual(['B2']);
  });
  it('une CORRECTION (même date que la ligne corrigée) l’emporte sur elle ; un changement ANNULÉ ne compte plus', () => {
    const corr = L({ code: 'A7', nature: 'correction', corrigeId: saisie.id, appliqueLe: saisie.appliqueLe });
    expect(ligneEnVigueur([saisie, corr], '12 rue x', '', LE_15)?.code).toBe('A7');
    const annule = { ...changement, annuleLe: '2026-11-10T00:00:00.000Z' };
    expect(ligneEnVigueur([saisie, annule], '12 rue x', '', new Date('2026-12-01T00:00:00.000Z'))?.code).toBe('A1');
  });
  it('chaque place est à part : le code commun et celui d’un bâtiment ; une autre adresse', () => {
    const l = [saisie, L({ batimentCle: 'b', batimentLibelle: 'B', code: 'B9' }), L({ adresseCle: '14 rue x', code: 'C3' })];
    expect([ligneEnVigueur(l, '12 rue x', '', LE_15)?.code, ligneEnVigueur(l, '12 rue x', 'b', LE_15)?.code, ligneEnVigueur(l, '14 rue x', '', LE_15)?.code]).toEqual(['A1', 'B9', 'C3']);
  });
});

const D = (o: Partial<DonneesAnciennes> = {}): DonneesAnciennes => ({
  immeubles: [], adresses: [{ adresseCle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', cleLegacy: 'residence les tilleuls|75011|paris' }],
  lots: [{ id: 1, numero: 'W1', adresseCle: 'residence les tilleuls', cleLegacy: '12 rue des lilas|75011|paris', batimentCle: '', valeur: { digicode: null, code: null } },
    { id: 2, numero: 'W2', adresseCle: 'residence les tilleuls', cleLegacy: '12 rue des lilas|75011|paris', batimentCle: 'b', valeur: { digicode: null, code: null } }], ...o });

describe('🔴 les valeurs d’AVANT (396 / 399 / colonnes du bien), rangées à la place de la copropriété — la clé unique', () => {
  it('le code écrit par la fiche Copropriété (sous son libellé) ET celui écrit depuis un bien (sous son adresse postale) arrivent à la MÊME place', () => {
    const d = D({ immeubles: [
      { cleLegacy: 'residence les tilleuls|75011|paris', voie: 'Résidence Les Tilleuls', valeur: { digicode: true, code: '1234' }, depuis: '2026-10-01T00:00:00.000Z', batiments: [] },
      { cleLegacy: '12 rue des lilas|75011|paris', voie: '12 rue des Lilas', valeur: { digicode: true, code: '12 34' }, depuis: '2026-10-02T00:00:00.000Z',
        batiments: [{ cle: 'b', libelle: 'B', valeur: { digicode: true, code: 'B77' }, depuis: null }] }] });
    const c = candidatsAnciens(d, 'residence les tilleuls', '');
    expect(c).toHaveLength(1); // « 1234 » et « 12 34 » : le même code
    expect(c[0].origines).toEqual(['adresse Résidence Les Tilleuls', 'adresse 12 rue des Lilas']);
    expect(candidatsAnciens(d, 'residence les tilleuls', 'b').map((x) => x.valeur.code)).toEqual(['B77']);
  });
  it('deux valeurs différentes : « à arbitrer » — on lit celle du bien (comme avant), rien n’est choisi ; une seule : lue telle quelle', () => {
    const d = D({ immeubles: [
      { cleLegacy: 'residence les tilleuls|75011|paris', voie: 'Résidence Les Tilleuls', valeur: { digicode: true, code: '1111' }, depuis: null, batiments: [] },
      { cleLegacy: '12 rue des lilas|75011|paris', voie: '12 rue des Lilas', valeur: { digicode: true, code: '2222' }, depuis: null, batiments: [] }] });
    const c = candidatsAnciens(d, 'residence les tilleuls', '');
    const lu = codeEnVigueur([], c, 'residence les tilleuls', '', LE_15, (x) => x.lots.includes(1));
    expect([lu?.valeur.code, lu?.source, lu?.aArbitrer.length]).toEqual(['2222', 'ancien', 2]);
    expect(codeEnVigueur([], c, 'residence les tilleuls', '', LE_15)?.valeur).toEqual({ digicode: null, code: null });
  });
  it('les anciennes colonnes d’un bien ne valent que si l’immeuble de son adresse n’a rien (règle d’avant)', () => {
    const d = D({ lots: [{ id: 1, numero: 'W1', adresseCle: 'residence les tilleuls', cleLegacy: '12 rue des lilas|75011|paris', batimentCle: '', valeur: { digicode: true, code: '9999' } }] });
    expect(candidatsAnciens(d, 'residence les tilleuls', '').map((x) => [x.valeur.code, x.origines])).toEqual([['9999', ['bien W1']]]);
    const avecImmeuble = { ...d, immeubles: [{ cleLegacy: '12 rue des lilas|75011|paris', voie: '12 rue des Lilas', valeur: { digicode: false, code: null }, depuis: null, batiments: [] }] };
    expect(candidatsAnciens(avecImmeuble, 'residence les tilleuls', '').map((x) => x.valeur)).toEqual([{ digicode: false, code: null }]);
  });
  it('un code de la base unique EN VIGUEUR l’emporte sur les valeurs d’avant ; un changement seulement À VENIR les laisse en vigueur jusqu’à sa date', () => {
    const anciens = [{ valeur: { digicode: true, code: 'OLD1' }, origines: ['adresse x'], lots: [], depuis: null }];
    const futur = L({ adresseCle: 'residence les tilleuls', code: 'NEW1', nature: 'changement', appliqueLe: '2026-11-20T08:00:00.000Z' });
    expect(codeEnVigueur([futur], anciens, 'residence les tilleuls', '', LE_15)?.valeur.code).toBe('OLD1');
    expect(codeEnVigueur([futur], anciens, 'residence les tilleuls', '', new Date('2026-11-21T00:00:00.000Z'))).toMatchObject({ valeur: { code: 'NEW1' }, source: 'unifie' });
  });
});

describe('la saisie d’une valeur', () => {
  it('un code (🔴 Arno, 17/11/2026 : 15 caractères au plus) ou « pas de digicode » ; rien, ou oui sans code : refusé', () => {
    expect(valeurSaisie({ digicode: true, code: ' 57B83 ' })).toEqual({ ok: true, valeur: { digicode: true, code: '57B83' } });
    expect(valeurSaisie({ digicode: false, code: 'X' })).toEqual({ ok: true, valeur: { digicode: false, code: null } });
    expect(valeurSaisie({ digicode: true, code: '123456789012345' })).toEqual({ ok: true, valeur: { digicode: true, code: '123456789012345' } });
    expect(valeurSaisie({ digicode: true, code: '1234567890123456' })).toEqual({ ok: false, motif: 'Le code du digicode fait 15 caractères au plus.' });
    // sans la 482, la base unique reste bornée à 8 : le serveur passe 8
    expect(valeurSaisie({ digicode: true, code: '123456789' }, 8)).toEqual({ ok: false, motif: 'Le code du digicode fait 8 caractères au plus.' });
    expect(valeurSaisie({ digicode: true }).ok).toBe(false);
    expect(valeurSaisie({}).ok).toBe(false);
    expect(memeCode({ digicode: true, code: '57b 83' }, { digicode: true, code: '57B83' })).toBe(true);
    expect([placeBatiment('Bât. B'), placeBatiment('  ')]).toEqual([{ cle: 'b', libelle: 'B' }, { cle: '', libelle: null }]);
  });
});

describe('la reprise (à blanc par défaut)', () => {
  const d = D({ immeubles: [
    { cleLegacy: '12 rue des lilas|75011|paris', voie: '12 rue des Lilas', valeur: { digicode: true, code: '57B83' }, depuis: '2026-10-02T00:00:00.000Z',
      batiments: [{ cle: 'b', libelle: 'B', valeur: { digicode: true, code: 'B77' }, depuis: null }] },
    { cleLegacy: 'residence les tilleuls|75011|paris', voie: 'Résidence Les Tilleuls', valeur: { digicode: true, code: '1111' }, depuis: null,
      batiments: [{ cle: 'b', libelle: 'B', valeur: { digicode: true, code: 'B77' }, depuis: null }] }] });
  it('une valeur : à reprendre ; plusieurs différentes : À ARBITRER ; une place déjà dans la base unique : laissée', () => {
    const p = planRepriseUnifiee(d, [], () => 'Résidence Les Tilleuls', () => 'B');
    expect(p.aReprendre.map((r) => [r.batimentCle, r.valeur.code])).toEqual([['b', 'B77']]);
    expect(p.aArbitrer.map((a) => [a.batimentCle, a.candidats.map((c) => c.valeur.code)])).toEqual([['', ['57B83', '1111']]]);
    const deja = planRepriseUnifiee(d, [L({ adresseCle: 'residence les tilleuls', batimentCle: 'b', batimentLibelle: 'B' })], () => 'x', () => 'B');
    expect([deja.dejaUnifiees, deja.aReprendre.length]).toEqual([1, 0]);
  });
  it('🔒 le rapport ne montre jamais un code en clair', () => {
    const texte = texteRapportRepriseUnifiee(planRepriseUnifiee(d, [], () => 'Résidence Les Tilleuls', () => 'B'), { reel: false, ecrites: 0, date: '16/11/2026' });
    expect(texte).toContain('À BLANC (rien n’est écrit)');
    expect(texte).toContain('oui · code •77');
    for (const code of ['57B83', '1111', 'B77']) expect(texte).not.toContain(code);
  });
});

describe('🔴 (lot 5) « Modifier » : la date et l’heure de PARIS, et ce qui part', () => {
  it('l’heure saisie est celle de Paris, hiver comme été ; une saisie incomplète : rien', async () => {
    const { instantDepuisParis } = await import('./digicodes');
    expect(instantDepuisParis('2026-11-20', '09:00')).toBe('2026-11-20T08:00:00.000Z');
    expect(instantDepuisParis('2027-07-01', '09:00')).toBe('2027-07-01T07:00:00.000Z');
    expect(instantDepuisParis('2027-03-28', '12:00')).toBe('2027-03-28T10:00:00.000Z'); // jour du passage à l'heure d'été
    expect([instantDepuisParis('', '09:00'), instantDepuisParis('2026-11-20', '9h')]).toEqual([null, null]);
  });
  it('au moins un code ; chaque nouveau code valide ; pas deux fois le même digicode ; la date est requise', async () => {
    const { validerChangements } = await import('./digicodes');
    expect(validerChangements({ appliqueLe: '2026-11-20T08:00:00.000Z', changements: [{ batiment: null, digicode: true, code: 'Z7' }, { batiment: 'Bât. B', digicode: false }] }))
      .toEqual({ ok: true, saisie: { appliqueLe: '2026-11-20T08:00:00.000Z', changements: [{ batiment: null, digicode: true, code: 'Z7', appliqueLe: '2026-11-20T08:00:00.000Z', avecHeure: true },
        { batiment: 'Bât. B', digicode: false, code: null, appliqueLe: '2026-11-20T08:00:00.000Z', avecHeure: true }] } });
    expect(validerChangements({ appliqueLe: '2026-11-20T08:00:00.000Z', changements: [] })).toMatchObject({ ok: false, motif: 'Choisissez au moins un digicode qui change.' });
    expect(validerChangements({ changements: [{ digicode: true, code: '1' }] }).ok).toBe(false);
    expect(validerChangements({ appliqueLe: '2026-11-20T08:00:00.000Z', changements: [{ batiment: 'B', digicode: true, code: '1' }, { batiment: 'bâtiment b', digicode: true, code: '2' }] }).ok).toBe(false);
  });
  it('🔴 (Arno, 17/11/2026) CHAQUE code sa date, et une heure facultative : la date générale est la PREMIÈRE ; un code sans date (et sans date générale) : refusé', async () => {
    const { validerChangements, quandChangement } = await import('./digicodes');
    const v = validerChangements({ changements: [{ batiment: 'A', digicode: true, code: 'A2', appliqueLe: '2026-11-25T23:00:00.000Z', avecHeure: false },
      { batiment: null, digicode: true, code: 'C2', appliqueLe: '2026-11-20T08:00:00.000Z', avecHeure: true }] });
    expect(v).toMatchObject({ ok: true, saisie: { appliqueLe: '2026-11-20T08:00:00.000Z', changements: [
      { batiment: 'A', appliqueLe: '2026-11-25T23:00:00.000Z', avecHeure: false }, { batiment: null, appliqueLe: '2026-11-20T08:00:00.000Z', avecHeure: true }] } });
    expect(validerChangements({ changements: [{ batiment: 'A', digicode: true, code: 'A2' }] })).toEqual({ ok: false, motif: 'Indiquez la date d’application de chaque nouveau code.' });
    // sans heure : la date seule (début de journée à Paris) ; avec : la date et l'heure
    expect([quandChangement('2026-11-25T23:00:00.000Z', false), quandChangement('2026-11-20T08:00:00.000Z', true)]).toEqual(['26/11/2026', '20/11/2026 à 09:00']);
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « sous chaque digicode DÉJÀ ENREGISTRÉ […] « Enregistré le JJ/MM/AAAA à HH:MM par Prénom NOM » […] (« Corrigé le … par … » si c'est
 * une correction). Si un changement daté est prévu, une seconde ligne : « Nouveau code prévu le JJ/MM/AAAA[ à HH:MM] — saisi le JJ/MM/AAAA par Prénom NOM ». […]
 * pour les codes repris sans auteur connu : « Enregistré le JJ/MM/AAAA (auteur inconnu — reprise) ». »
 */
describe('🔴 qui a enregistré le code, et quand', () => {
  const ARNO = { creeParNom: 'Arnaud JOREL', creeParLibelle: 'a.jorel@sansvisavis.com' };
  const vigueur = (lignes: LigneDigicode[]) => codeEnVigueur(lignes, [], '12 rue x', '', LE_15);
  it('une saisie : « Enregistré le JJ/MM/AAAA à HH:MM par Prénom NOM » (la date de la saisie, heure de Paris)', () => {
    expect(mentionEnregistre(vigueur([L({ ...ARNO, creeLe: '2026-11-03T08:15:00.000Z' })]))).toBe('Enregistré le 03/11/2026 à 09:15 par Arnaud JOREL');
  });
  it('la modification la plus récente : le changement appliqué, à la date où il a été SAISI ; une correction : « Corrigé le … par … »', () => {
    const saisie = L({ creeParLibelle: 'autre', appliqueLe: '2026-11-01T10:00:00.000Z' });
    const changement = L({ ...ARNO, nature: 'changement', code: 'B2', appliqueLe: '2026-11-10T08:00:00.000Z', creeLe: '2026-11-05T14:00:00.000Z' });
    expect(mentionEnregistre(vigueur([saisie, changement]))).toBe('Enregistré le 05/11/2026 à 15:00 par Arnaud JOREL');
    const correction = L({ ...ARNO, nature: 'correction', code: 'B3', corrigeId: changement.id, appliqueLe: '2026-11-12T09:30:00.000Z', creeLe: '2026-11-12T09:30:00.000Z' });
    expect(mentionEnregistre(vigueur([saisie, changement, correction]))).toBe('Corrigé le 12/11/2026 à 10:30 par Arnaud JOREL');
  });
  it('sans compte connu : l’identifiant noté ; un code repris : « Enregistré le JJ/MM/AAAA (auteur inconnu — reprise) » ; une valeur d’avant : pareil', () => {
    expect(mentionEnregistre(vigueur([L({ creeParNom: null, creeParLibelle: 'a.jorel@sansvisavis.com', creeLe: '2026-11-03T08:15:00.000Z' })])))
      .toBe('Enregistré le 03/11/2026 à 09:15 par a.jorel@sansvisavis.com');
    const reprise = L({ origine: 'reprise', creeParLibelle: 'reprise des digicodes dans la base unique (automatique)', appliqueLe: '2025-04-02T10:00:00.000Z', creeLe: '2026-11-16T10:00:00.000Z' });
    expect(mentionEnregistre(vigueur([reprise]))).toBe('Enregistré le 02/04/2025 (auteur inconnu — reprise)');
    expect(auteurDigicode(reprise)).toBeNull();
    expect(mentionEnregistre({ source: 'ancien', ligne: null, depuis: '2024-06-30T22:30:00.000Z' })).toBe('Enregistré le 01/07/2024 (auteur inconnu — reprise)');
    expect(mentionEnregistre({ source: 'ancien', ligne: null, depuis: null })).toBe('Enregistré (auteur inconnu — reprise)');
    expect(mentionEnregistre(null)).toBeNull();
  });
  it('un changement prévu : « Nouveau code prévu le JJ/MM/AAAA[ à HH:MM] — saisi le JJ/MM/AAAA par Prénom NOM » ; sans heure saisie (minuit à Paris) : la date seule', () => {
    expect(mentionPrevu(L({ ...ARNO, nature: 'changement', appliqueLe: '2026-11-20T08:00:00.000Z', creeLe: '2026-11-16T15:00:00.000Z' })))
      .toBe('Nouveau code prévu le 20/11/2026 à 09:00 — saisi le 16/11/2026 par Arnaud JOREL');
    expect(mentionPrevu(L({ ...ARNO, nature: 'changement', appliqueLe: '2026-11-19T23:00:00.000Z', creeLe: '2026-11-16T15:00:00.000Z' })))
      .toBe('Nouveau code prévu le 20/11/2026 — saisi le 16/11/2026 par Arnaud JOREL');
    expect(quandPrevu('2026-07-19T22:00:00.000Z')).toBe('20/07/2026'); // l'heure d'été
    expect(mentionPrevu(L({ ...ARNO, nature: 'changement', digicode: false, code: null, appliqueLe: '2026-11-20T08:00:00.000Z', creeLe: '2026-11-16T15:00:00.000Z' })))
      .toBe('Fin du digicode prévue le 20/11/2026 à 09:00 — saisi le 16/11/2026 par Arnaud JOREL');
  });
});
