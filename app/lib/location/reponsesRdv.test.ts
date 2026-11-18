import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  creneauDe, etatReponsesRdv, jetonRdvBienForme, liensReponseRdv, motCartoucheLocataires, notificationApres, objetEdlsLocataires, objetInterneRdv,
  paragraphesBoutonsRdv, phraseRecapLocataires, verdictJetonRdv, BOUTON_ACCEPTER, BOUTON_REFUSER, type EvenementRdv,
} from './reponsesRdv';
import { normaliserObjet } from '../gestion/typologie';
import { appliquerRegles, type RegleExclusion } from '../gestion/regles';
import { mailRdvLocataire, objetConfirmationLocataires } from './previsite';

/**
 * 🔴 Arno (18/11/2026) — « Tests du COMPORTEMENT : une acceptation allume « Confirmé » ; un refus suivi d'une acceptation allume aussi « Confirmé » ;
 * si tous refusent, le cartouche affiche « Refusé » […] ; après une modification du rendez-vous, les anciennes réponses sont caduques ; un jeton
 * expiré ou falsifié est refusé […] ». Les règles (module pur) ; le dépôt est éprouvé dans reponsesRdvRepo.test.ts.
 */
const PAUL = { occupationId: 553, nom: 'Paul ESSAIPREAVIS' };
const ALICE = { occupationId: 554, nom: 'Alice ESSAIPREAVIS' };
const ev = (nature: EvenementRdv['nature'], occupationId: number | null, le: string, parLibelle = 'x'): EvenementRdv => ({ nature, occupationId, le, parLibelle });

describe('🔴 l’état côté locataires', () => {
  it('une acceptation allume « Confirmé », par ce locataire', () => {
    const e = etatReponsesRdv([PAUL, ALICE], [ev('accepte', 553, '2026-11-18T10:00:00Z')]);
    expect(e).toMatchObject({ etat: 'confirme', par: 'Paul ESSAIPREAVIS', main: false });
    expect(motCartoucheLocataires(e!)).toBe('Locataires : Confirmé (par Paul ESSAIPREAVIS)');
  });
  it('un refus suivi d’une acceptation allume aussi « Confirmé » ; l’inverse revient à « En attente » ou « Refusé »', () => {
    expect(etatReponsesRdv([PAUL], [ev('refuse', 553, '2026-11-18T10:00:00Z'), ev('accepte', 553, '2026-11-18T11:00:00Z')])?.etat).toBe('confirme');
    expect(etatReponsesRdv([PAUL, ALICE], [ev('accepte', 553, '2026-11-18T10:00:00Z'), ev('refuse', 553, '2026-11-18T11:00:00Z')])?.etat).toBe('attente');
  });
  it('tous refusent → « Refusé » (le mot écrit) ; un seul refus sur deux → « En attente »', () => {
    const tous = etatReponsesRdv([PAUL, ALICE], [ev('refuse', 553, '2026-11-18T10:00:00Z'), ev('refuse', 554, '2026-11-18T10:05:00Z')]);
    expect(tous?.etat).toBe('refuse');
    expect(motCartoucheLocataires(tous!)).toBe('Locataires : Refusé');
    expect(etatReponsesRdv([PAUL, ALICE], [ev('refuse', 553, '2026-11-18T10:00:00Z')])?.etat).toBe('attente');
    expect(motCartoucheLocataires(etatReponsesRdv([PAUL], [])!)).toBe('Locataires : En attente');
  });
  it('la validation à la main confirme (par son auteur), et son annulation la retire ; rien à montrer sans invitation ni validation', () => {
    const v = etatReponsesRdv([], [ev('validation_main', null, '2026-11-18T10:00:00Z', 'Arnaud Jorel')]);
    expect(v).toMatchObject({ etat: 'confirme', main: true, par: 'Arnaud Jorel' });
    expect(motCartoucheLocataires(v!)).toBe('Locataires : Confirmé à la main par Arnaud Jorel');
    expect(etatReponsesRdv([], [ev('validation_main', null, '2026-11-18T10:00:00Z'), ev('annulation_validation', null, '2026-11-18T11:00:00Z')])).toBeNull();
    expect(etatReponsesRdv([PAUL], [ev('validation_main', null, '2026-11-18T10:00:00Z'), ev('annulation_validation', null, '2026-11-18T11:00:00Z')])?.etat).toBe('attente');
    expect(etatReponsesRdv([], [])).toBeNull();
  });
  it('le mail interne part en DEVENANT Confirmé ou Refusé, jamais deux fois pour le même état', () => {
    const attente = etatReponsesRdv([PAUL], [])!;
    const confirme = etatReponsesRdv([PAUL], [ev('accepte', 553, '2026-11-18T10:00:00Z')])!;
    const refuse = etatReponsesRdv([PAUL], [ev('refuse', 553, '2026-11-18T10:00:00Z')])!;
    expect(notificationApres(attente, confirme)).toBe('confirme');
    expect(notificationApres(attente, refuse)).toBe('refuse');
    expect(notificationApres(confirme, confirme)).toBeNull();
    expect(notificationApres(confirme, attente)).toBeNull();
  });
});

describe('🔴 le lien personnel', () => {
  const tache = { etat: 'a_faire', jour: '2026-11-20', heure: '10:00' };
  const jeton = { creneau: creneauDe('2026-11-20', '10:00'), expireLe: '2026-11-20T09:00:00.000Z' };
  it('valable avant l’heure du rendez-vous, sur le créneau en cours', () => {
    expect(verdictJetonRdv({ jeton, tache, maintenant: new Date('2026-11-19T12:00:00Z') })).toEqual({ ok: true });
  });
  it('🔴 expiré à l’heure du rendez-vous ; caduc après un déplacement ; rendez-vous terminé ; inconnu (falsifié)', () => {
    expect(verdictJetonRdv({ jeton, tache, maintenant: new Date('2026-11-20T09:00:00Z') })).toMatchObject({ ok: false, cause: 'expire' });
    expect(verdictJetonRdv({ jeton, tache: { ...tache, jour: '2026-11-22' }, maintenant: new Date('2026-11-19T12:00:00Z') })).toMatchObject({ ok: false, cause: 'caduc' });
    expect(verdictJetonRdv({ jeton, tache: { ...tache, etat: 'annulee' }, maintenant: new Date('2026-11-19T12:00:00Z') })).toMatchObject({ ok: false, cause: 'termine' });
    expect(verdictJetonRdv({ jeton: null, tache, maintenant: new Date() })).toMatchObject({ ok: false, cause: 'inconnu' });
  });
  it('un jeton falsifié (mauvaise forme) est refusé avant toute lecture', () => {
    expect(jetonRdvBienForme('A'.repeat(43))).toBe(true);
    for (const x of ['A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, "'; drop table--", null, 3]) expect(jetonRdvBienForme(x)).toBe(false);
  });
  it('les deux liens mènent à la page publique, avec la décision', () => {
    expect(liensReponseRdv('https://exemple.test/', 'J'.repeat(43))).toEqual({
      accepter: `https://exemple.test/rdv/reponse?j=${'J'.repeat(43)}&d=accepter`, refuser: `https://exemple.test/rdv/reponse?j=${'J'.repeat(43)}&d=refuser` });
  });
});

describe('🔴 les mails', () => {
  const qui = { mention: null };
  const sig = { html: '', texte: '' };
  const loc = { occupationId: 553, nom: 'ESSAIPREAVIS', prenom: 'Paul', civilite: null, emails: ['paul@exemple.test'] };
  const liens = liensReponseRdv('https://exemple.test', 'K'.repeat(43));
  it('l’invitation d’un locataire porte SES deux boutons (texte et HTML) ; sans liens, le mail d’avant, inchangé', () => {
    const avec = mailRdvLocataire({ sorte: 'previsite_locataires', de: 'gestion@criterimmo.fr', objet: 'o', adresse: '12 rue de l’Essai', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 },
      ancien: null, locataire: loc, qui, signature: sig, boutons: liens })!;
    expect(avec.texte).toContain(`${BOUTON_ACCEPTER} : ${liens.accepter}`);
    expect(avec.texte).toContain(`${BOUTON_REFUSER} : ${liens.refuser}`);
    expect(avec.html).toContain(liens.accepter.replace(/&/g, '&amp;'));
    const sans = mailRdvLocataire({ sorte: 'previsite_locataires', de: 'gestion@criterimmo.fr', objet: 'o', adresse: '12 rue de l’Essai', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 },
      ancien: null, locataire: loc, qui, signature: sig })!;
    expect(sans.texte).not.toContain(BOUTON_ACCEPTER);
    expect(avec.texte.startsWith(sans.texte.split('\n\nNous restons')[0])).toBe(true);
  });
  it('l’invitation à l’état des lieux : son propre texte, les boutons, et un objet distinct de la pré-visite', () => {
    const m = mailRdvLocataire({ sorte: 'edls_locataires', de: 'gestion@criterimmo.fr', objet: objetEdlsLocataires('12 rue de l’Essai', { jour: '2026-11-20', heure: '10:00' }),
      adresse: '12 rue de l’Essai', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 }, ancien: null, locataire: loc, qui, signature: sig, boutons: liens })!;
    expect(m.texte).toContain('Nous vous confirmons le rendez-vous d’état des lieux de sortie de votre logement situé 12 rue de l’Essai');
    expect(m.texte).toContain(BOUTON_ACCEPTER);
    expect(m.objet).toBe('Rendez-vous d’état des lieux de sortie — 20/11/2026 à 10h00 — 12 rue de l’Essai');
    expect(paragraphesBoutonsRdv(liens)).toHaveLength(4);
  });
  it('🔴 la règle « courrier automatique » (496) range les mails internes, jamais une invitation aux locataires ni une réponse humaine', () => {
    const sql = readFileSync('db/migrations/496_gestion_regles_courrier_rdv.sql', 'utf8');
    const regles: RegleExclusion[] = [];
    for (const m of sql.matchAll(/\('gabarit_objet', '([^']+)', 'envoye',/g)) regles.push({ id: regles.length + 1, type: 'gabarit_objet', valeur: m[1], sens: 'envoye', motif: 'm' });
    expect(regles).toHaveLength(4);
    const rdv = { jour: '2026-11-20', heure: '10:00' };
    const internes = [objetInterneRdv('previsite', 'confirme', 'A', rdv), objetInterneRdv('previsite', 'refuse', 'A', rdv), objetInterneRdv('edl', 'confirme', 'A', rdv), objetInterneRdv('edl', 'refuse', 'A', rdv)];
    expect(internes.map((o) => normaliserObjet(o)).sort()).toEqual(regles.map((r) => r.valeur).sort());
    const juge = (objet: string, de = 'gestion@criterimmo.fr') => appliquerRegles(regles, { sens: de === 'gestion@criterimmo.fr' ? 'envoye' : 'recu', deAdresse: de, objet, entetes: {} });
    for (const o of internes) expect(juge(o)).not.toBeNull();
    expect(juge(objetConfirmationLocataires('A', { ...rdv, dureeMinutes: 60 }))).toBeNull();
    expect(juge(objetEdlsLocataires('A', rdv))).toBeNull();
    expect(juge(`RE: ${internes[0]}`, 'jb.pons@sansvisavis.com')).toBeNull();
  });
});

describe('🔴 (2e lot) « Locataires non invités » et la phrase du récapitulatif', () => {
  it('« Non » choisi pour ce créneau, aucun invité : « Locataires non invités » (pas « En attente ») ; une validation à la main reste prioritaire', () => {
    const e = etatReponsesRdv([], [ev('non_invite', null, '2026-11-18T10:00:00Z')]);
    expect(e?.etat).toBe('non_invites');
    expect(motCartoucheLocataires(e!)).toBe('Locataires non invités');
    expect(etatReponsesRdv([], [ev('non_invite', null, '2026-11-18T10:00:00Z'), ev('validation_main', null, '2026-11-18T11:00:00Z', 'Arnaud Jorel')])?.etat).toBe('confirme');
    expect(notificationApres(null, e)).toBeNull(); // aucun mail interne pour un « Non »
  });
  it('le récapitulatif dit clairement si les locataires seront invités ou non', () => {
    expect(phraseRecapLocataires({ choix: 'non', invites: [], sansEmail: [], impossible: null, texte: null })).toBe('Les locataires ne seront PAS invités : aucun mail ne leur partira.');
    expect(phraseRecapLocataires({ choix: 'oui', invites: ['Paul ESSAIPREAVIS'], sansEmail: [], impossible: null, texte: null }))
      .toBe('Les locataires seront invités (1) : Paul ESSAIPREAVIS — avec « J’accepte le rendez-vous » / « Je refuse ».');
    expect(phraseRecapLocataires({ choix: 'oui', invites: [], sansEmail: [], impossible: 'migration absente.', texte: null })).toBe('Les locataires ne pourront pas être invités : migration absente.');
  });
});

