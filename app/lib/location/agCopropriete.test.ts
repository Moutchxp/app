import { describe, expect, it } from 'vitest';
import {
  avecMentionAgLocataire, avecMentionAgProprietaire, derniereAgTenue, entreesAAjouter, ligneEntreeAg, lignesAg, moisAnnee, propositionAg, prochaineAgOfficielle,
  sansMentionAg, unAnApres, verifierSaisieAg, MENTION_PROJECTION, MOTIF_AG_DERNIERE, MOTIF_AG_PROCHAINE, MOTIF_AG_STATUT, type EntreeAg, verifierPv, mentionAg, LIBELLE_DERNIERE_AGO, LIBELLE_PROCHAINE_AGO, AIDE_AGO, pvsDeLaCopropriete, LIBELLE_NATURE_AG, MOTIF_PV_DATE, MOTIF_PV_FUTUR, MOTIF_PV_NATURE } from './agCopropriete';
import { mailsValidationSortie, PARAGRAPHE_RETENUE_LOCATAIRE, PHRASE_RETENUE_PROPRIETAIRE, type DonneesValidationSortie } from './validationSortie';

/** 🔴🔴 Arno (16/11/2026, 475) — les dates d'AG de la copropriété dans « Valider la sortie » (case 20 % cochée) : les règles pures. */
let n = 0;
const E = (o: Partial<EntreeAg>): EntreeAg => ({ id: ++n, type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false, origine: 'fiche_bien',
  saisieLe: '2026-04-01T10:00:00.000Z', saisiePar: 'Claire Test', sortieId: null, aRattacher: false, ...o });
const AUJ = '2026-11-16';

describe('le préremplissage depuis l’historique', () => {
  it('la dernière AG tenue = la plus récente saisie « dernière » ; une date retirée ensuite : plus rien', () => {
    const h = [E({ date: '2025-03-10', saisieLe: '2025-04-01T10:00:00Z' }), E({ date: '2026-03-12', saisieLe: '2026-04-01T10:00:00Z', saisiePar: 'Arnaud JOREL' })];
    expect(derniereAgTenue(h)).toMatchObject({ date: '2026-03-12', saisiePar: 'Arnaud JOREL' });
    expect(derniereAgTenue([...h, E({ date: null, saisieLe: '2026-05-01T10:00:00Z' })])).toBeNull();
    expect(derniereAgTenue([])).toBeNull();
  });
  it('« + 1 an » : la prochaine AG projetée à la même période, avec la mention ; le 29 février devient le 28', () => {
    expect(unAnApres('2026-03-12')).toBe('2027-03-12');
    expect(unAnApres('2024-02-29')).toBe('2025-02-28');
    expect(unAnApres('x')).toBeNull();
    expect(propositionAg([E({ saisiePar: 'Claire Test' })], AUJ)).toEqual({
      derniere: { date: '2026-03-12', par: 'Claire Test', le: '2026-04-01T10:00:00.000Z' },
      prochaine: { date: '2027-03-12', statut: null, mention: MENTION_PROJECTION, par: null, le: null } });
    expect(MENTION_PROJECTION).toBe('projection — généralement à la même période chaque année');
  });
  it('une prochaine AG OFFICIELLE à venir est proposée EN PRIORITÉ (statut officielle, avec qui l’a saisie) ; passée : la projection reprend', () => {
    const off = E({ type: 'prochaine', statut: 'officielle', date: '2027-04-02', saisiePar: 'Paul Syndic', saisieLe: '2026-10-01T09:00:00Z' });
    expect(prochaineAgOfficielle([E({}), off], AUJ)).toBe(off);
    expect(propositionAg([E({}), off], AUJ).prochaine).toEqual({ date: '2027-04-02', statut: 'officielle', mention: null, par: 'Paul Syndic', le: '2026-10-01T09:00:00Z' });
    expect(propositionAg([E({}), { ...off, date: '2026-04-02' }], AUJ).prochaine).toMatchObject({ date: '2027-03-12', statut: null });
    // une projection n'est jamais proposée comme officielle
    expect(propositionAg([E({}), { ...off, statut: 'projetee' }], AUJ).prochaine?.statut).toBeNull();
  });
  it('rien de connu : les deux champs vides', () => {
    expect(propositionAg([], AUJ)).toEqual({ derniere: null, prochaine: null });
  });
});

describe('le statut obligatoire et le blocage', () => {
  it('dernière AG vide, prochaine vide, statut non choisi : refus, champs en défaut, message clair', () => {
    expect(verifierSaisieAg({ derniere: '', prochaine: '', statut: null })).toEqual({ ok: false, motif: MOTIF_AG_DERNIERE, champs: ['derniere', 'prochaine', 'statut'] });
    expect(verifierSaisieAg({ derniere: '2026-03-12', prochaine: '', statut: 'projetee' })).toEqual({ ok: false, motif: MOTIF_AG_PROCHAINE, champs: ['prochaine'] });
    expect(verifierSaisieAg({ derniere: '2026-03-12', prochaine: '2027-03-12', statut: null })).toEqual({ ok: false, motif: MOTIF_AG_STATUT, champs: ['statut'] });
    expect(verifierSaisieAg({ derniere: '2026-02-30', prochaine: '2027-03-12', statut: 'projetee' })).toMatchObject({ ok: false, champs: ['derniere'] });
    expect(verifierSaisieAg({ derniere: '2026-03-12', prochaine: '2026-03-01', statut: 'officielle' })).toMatchObject({ ok: false, champs: ['prochaine'] });
    expect(verifierSaisieAg({ derniere: '2026-03-12', prochaine: '2027-03-12', statut: 'projetee' })).toEqual({ ok: true });
  });
});

describe('ce qui entre dans l’historique à la confirmation (ajout seul)', () => {
  const connue = propositionAg([E({})], AUJ);
  it('dernière AG inchangée et non confirmée : rien ; confirmée comme référence : une entrée « confirmation » ; modifiée : une entrée', () => {
    expect(entreesAAjouter({ derniere: '2026-03-12', derniereConfirmee: false, prochaine: '2027-03-12', statut: 'projetee' }, connue))
      .toEqual([{ type: 'prochaine', statut: 'projetee', date: '2027-03-12', confirmation: false }]);
    expect(entreesAAjouter({ derniere: '2026-03-12', derniereConfirmee: true, prochaine: '2027-03-12', statut: 'projetee' }, connue)[0])
      .toEqual({ type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: true });
    expect(entreesAAjouter({ derniere: '2026-03-20', derniereConfirmee: false, prochaine: '2027-03-12', statut: 'officielle' }, connue))
      .toEqual([{ type: 'derniere', statut: 'officielle', date: '2026-03-20', confirmation: false }, { type: 'prochaine', statut: 'officielle', date: '2027-03-12', confirmation: false }]);
  });
  it('la prochaine OFFICIELLE déjà connue, reprise telle quelle : pas de doublon ; rien de connu : les deux entrées', () => {
    const c = propositionAg([E({}), E({ type: 'prochaine', statut: 'officielle', date: '2027-04-02' })], AUJ);
    expect(entreesAAjouter({ derniere: '2026-03-12', derniereConfirmee: false, prochaine: '2027-04-02', statut: 'officielle' }, c)).toEqual([]);
    expect(entreesAAjouter({ derniere: '2026-03-12', derniereConfirmee: false, prochaine: '2027-03-12', statut: 'projetee' }, { derniere: null, prochaine: null })).toHaveLength(2);
  });
});

describe('l’affichage : récapitulatif, fiche (auteur), paragraphe « 20 % »', () => {
  it('les deux dates avec leur statut', () => {
    expect(lignesAg({ derniere: '2026-03-12', prochaine: '2027-03-12', statut: 'projetee' })).toEqual([
      ['Dernière AGO (assemblée générale ordinaire)', '12/03/2026'], ['Prochaine AGO', '12/03/2027 (date projetée)']]);
    expect(lignesAg({ derniere: '2026-03-12', prochaine: '2027-04-02', statut: 'officielle' })[1][1]).toBe('02/04/2027 (date officielle)');
  });
  it('une entrée de la fiche : date, type, statut, qui, quand, d’où ; « à rattacher » si aucune copropriété', () => {
    expect(ligneEntreeAg(E({ type: 'prochaine', statut: 'projetee', date: '2027-03-12', origine: 'sortie', sortieId: 12, saisieLe: '2026-11-16T10:00:00Z', saisiePar: 'Arnaud JOREL' })))
      .toBe('12/03/2027 — prochaine AGO, projetée — saisie par Arnaud JOREL le 16/11/2026 (sortie n° 12)');
    expect(ligneEntreeAg(E({ origine: 'reprise', confirmation: true, aRattacher: true })))
      .toBe('12/03/2026 — dernière AG tenue (AGO) (confirmée comme référence) — saisie par Claire Test le 01/04/2026 (reprise (ancienne saisie)) — à rattacher à une copropriété');
  });
  it('la mention de la prochaine AG dans le paragraphe des locataires et la phrase des propriétaires ; retirée sans trace ; texte modifié gardé', () => {
    expect(moisAnnee('2027-03-12')).toBe('mars 2027');
    const p = avecMentionAgLocataire(PARAGRAPHE_RETENUE_LOCATAIRE, '2027-03-12');
    expect(p).toContain('couvrant votre période d’occupation, prévue en principe lors de l’assemblée générale ordinaire de mars 2027. Une régularisation');
    expect(avecMentionAgLocataire(p, '2027-06-01')).toContain('de juin 2027.');
    expect(avecMentionAgLocataire(p, '2027-06-01')).not.toContain('mars 2027');
    expect(sansMentionAg(p)).toBe(PARAGRAPHE_RETENUE_LOCATAIRE);
    expect(avecMentionAgLocataire('Provision gardée jusqu’à l’approbation des comptes. Merci.', '2027-03-12')).toBe('Provision gardée jusqu’à l’approbation des comptes, prévue en principe lors de l’assemblée générale ordinaire de mars 2027. Merci.');
    expect(avecMentionAgProprietaire(PHRASE_RETENUE_PROPRIETAIRE, '2027-03-12'))
      .toBe('Une provision de 20 % du dépôt de garantie est conservée jusqu’à l’approbation des comptes de la copropriété, prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
  });
  it('les mails : la phrase des propriétaires avec la mention ; la copie interne porte les deux dates ; sans date : texte actuel inchangé', () => {
    const d: DonneesValidationSortie = { adresse: '4 rue X', date: '2026-11-10', compteRendu: '', vacant: true, copropriete: true, destinataires: [
      { cle: 'loc-1', famille: 'locataire', nom: 'BERNARD', prenom: 'Alice', emails: ['a@x.test'], telephones: [] },
      { cle: 'pro-5', famille: 'proprietaire', nom: 'DUPONT Jean', prenom: null, emails: ['j@x.test'], telephones: [] }],
    sortants: [{ nom: 'BERNARD', prenom: 'Alice' }], expediteur: 'g@x.test', qui: { prenom: 'Arnaud', nomFamille: 'Jorel', email: 'a.j@x.test' } as never,
    signature: { texte: '', html: '' }, internes: ['g@x.test'],
    retenue: { appliquee: true, paragrapheLocataire: avecMentionAgLocataire(PARAGRAPHE_RETENUE_LOCATAIRE, '2027-03-12'),
      phraseProprietaire: avecMentionAgProprietaire(PHRASE_RETENUE_PROPRIETAIRE, '2027-03-12'), ag: { derniere: '2026-03-12', prochaine: '2027-03-12', statut: 'projetee' } } };
    const m = mailsValidationSortie(d);
    expect(m.parties[0].mail.texte).toContain('assemblée générale ordinaire de mars 2027');
    expect(m.parties[1].mail.texte).toContain('approbation des comptes de la copropriété, prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
    expect(m.interne!.texte).toContain('Dernière AGO (assemblée générale ordinaire) : 12/03/2026\nProchaine AGO : 12/03/2027 (date projetée)');
    const sans = mailsValidationSortie({ ...d, retenue: { appliquee: true, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } });
    expect(sans.parties[1].mail.texte).toContain(PHRASE_RETENUE_PROPRIETAIRE);
    expect(sans.parties[0].mail.texte).not.toContain('assemblée générale');
    expect(sans.interne!.texte).not.toContain('assemblée générale');
  });
});

/** 🔴🔴 Arno (17/11/2026, 481) : « + Ajouter un PV d'AG » : date du PV (obligatoire), type obligatoire AGO / AGE, note facultative ; QUE des dates OFFICIELLES ; historique du plus récent au plus ancien ; « Corriger » avec trace. */
describe('🔴🔴 les PV d’AG de la fiche copropriété', () => {
  const E = (o: Partial<EntreeAg>): EntreeAg => ({ id: 1, type: 'derniere', statut: 'officielle', date: '2024-03-12', confirmation: false, origine: 'fiche_copropriete',
    saisieLe: '2026-11-17T10:00:00.000Z', saisiePar: 'Arnaud JOREL', sortieId: null, aRattacher: false, ...o });
  it('le contrôle : date obligatoire, jamais à venir (aujourd’hui accepté) ; type obligatoire ; note bornée et nettoyée', () => {
    expect(verifierPv({ nature: 'ago' }, '2026-11-17')).toMatchObject({ ok: false, motif: MOTIF_PV_DATE, champs: ['date'] });
    expect(verifierPv({ date: '2026-11-18', nature: 'ago' }, '2026-11-17')).toMatchObject({ ok: false, motif: MOTIF_PV_FUTUR });
    expect(verifierPv({ date: '2026-11-17' }, '2026-11-17')).toMatchObject({ ok: false, motif: MOTIF_PV_NATURE, champs: ['nature'] });
    expect(verifierPv({ date: '2026-11-17', nature: 'age', note: 'x'.repeat(501) }, '2026-11-17')).toMatchObject({ ok: false, champs: ['note'] });
    expect(verifierPv({ date: '2026-11-17', nature: 'age', note: '  vote   des travaux ' }, '2026-11-17')).toEqual({ ok: true, saisie: { date: '2026-11-17', nature: 'age', note: 'vote des travaux' } });
    expect(verifierPv({ date: '2015-03-12', nature: 'ago', note: '' }, '2026-11-17')).toEqual({ ok: true, saisie: { date: '2015-03-12', nature: 'ago', note: null } });
  });
  it('l’historique des PV : du plus RÉCENT au plus ancien (date du PV), quel que soit l’ordre de saisie ; sans les prochaines AG ni les dates retirées', () => {
    const l = pvsDeLaCopropriete([E({ id: 1, date: '2015-03-12' }), E({ id: 2, date: '2024-03-12' }), E({ id: 3, type: 'prochaine', statut: 'projetee', date: '2027-03-12' }), E({ id: 4, date: null }), E({ id: 5, date: '2019-06-01', nature: 'age' })]);
    expect(l.map((e) => e.id)).toEqual([2, 5, 1]);
  });
  it('la ligne dit le type (AGO / AGE ; avant la 481 : AGO) et la trace d’une correction', () => {
    expect(ligneEntreeAg(E({ nature: 'age' }))).toContain('dernière AG tenue (AGE)');
    expect(ligneEntreeAg(E({}))).toContain('dernière AG tenue (AGO)');
    expect(ligneEntreeAg(E({ corrige: { id: 9, date: '2015-03-12', nature: 'ago', note: null } }))).toContain('corrige la saisie d’avant : 12/03/2015, AGO');
    expect(LIBELLE_NATURE_AG).toEqual({ ago: 'AGO (assemblée générale ordinaire)', age: 'AGE (assemblée générale extraordinaire)' });
  });
});

/** 🔴🔴 Arno (17/11/2026) : « RETENUE DES 20 % […] seule l'AGO compte, car c'est elle qui clôture les comptes. […] Le pré-remplissage ne lit QUE les AGO de la copropriété (jamais une AGE). […] La mention dans le paragraphe « 20 % » parle d'« assemblée générale ordinaire ». » */
describe('🔴🔴 la retenue des 20 % : seule l’AGO compte', () => {
  const E = (o: Partial<EntreeAg>): EntreeAg => ({ id: 1, type: 'derniere', statut: 'officielle', date: '2024-03-12', confirmation: false, origine: 'fiche_copropriete',
    saisieLe: '2026-11-17T10:00:00.000Z', saisiePar: 'Arnaud JOREL', sortieId: null, aRattacher: false, ...o });
  it('une AGE n’est JAMAIS lue, même plus récente', () => {
    expect(derniereAgTenue([E({ id: 1, date: '2025-06-01', nature: 'age' }), E({ id: 2, date: '2024-03-12', nature: 'ago' })])?.id).toBe(2);
    expect(derniereAgTenue([E({ id: 1, date: '2025-06-01', nature: 'age' })])).toBeNull();
    expect(propositionAg([E({ id: 1, date: '2025-06-01', nature: 'age' })], '2026-11-17')).toEqual({ derniere: null, prochaine: null });
  });
  it('les PV saisis dans le désordre : la plus récente DATE ; face à une saisie de la fiche du bien, la plus récente des deux dates', () => {
    const pvs = [E({ id: 1, date: '2024-03-12', saisieLe: '2026-11-17T12:00:00.000Z' }), E({ id: 2, date: '2015-03-12', saisieLe: '2026-11-17T13:00:00.000Z' })];
    expect(derniereAgTenue(pvs)?.date).toBe('2024-03-12');
    expect(derniereAgTenue([...pvs, E({ id: 3, origine: 'fiche_bien', date: '2025-04-01', saisieLe: '2026-11-17T09:00:00.000Z' })])?.date).toBe('2025-04-01');
    expect(derniereAgTenue([...pvs, E({ id: 3, origine: 'fiche_bien', date: null, saisieLe: '2026-11-17T14:00:00.000Z' })])?.date).toBe('2024-03-12');
    expect(propositionAg(pvs, '2026-11-17').derniere?.date).toBe('2024-03-12');
  });
  it('la mention « 20 % » dit « assemblée générale ordinaire » ; l’ancienne mention est retirée ou remplacée de même', () => {
    expect(mentionAg('2027-03-12')).toBe(', prévue en principe lors de l’assemblée générale ordinaire de mars 2027');
    expect(sansMentionAg('comptes, prévue en principe lors de l’assemblée générale de mars 2027. Fin')).toBe('comptes. Fin');
    expect(avecMentionAgProprietaire('Une provision est conservée jusqu’à l’approbation des comptes de la copropriété, prévue en principe lors de l’assemblée générale de mars 2026.', '2027-03-12'))
      .toBe('Une provision est conservée jusqu’à l’approbation des comptes de la copropriété, prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
  });
  it('les libellés et la phrase d’aide, mot pour mot', () => {
    expect([LIBELLE_DERNIERE_AGO, LIBELLE_PROCHAINE_AGO, AIDE_AGO]).toEqual(['Dernière AGO connue (assemblée générale ordinaire) *', 'Prochaine AGO *',
      'Seule l’AGO compte : c’est l’assemblée qui clôture les comptes de la copropriété.']);
  });
});
