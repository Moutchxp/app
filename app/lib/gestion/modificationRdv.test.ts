import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { collaborateursAPrevenir, creneauLisible, mailModificationRdv, phraseConfirmationRdv, rdvModifiable, type EtatRdv } from './modificationRdv';
import { normaliserObjet } from './typologie';
import { appliquerRegles, type RegleExclusion } from './regles';

/** 🔴 Arno (19/11/2026) — règles uniformes des rendez-vous (pré-visite, état des lieux, tâches) : D, H, J, F — module pur. */
const CLAIRE = { id: 4, libelle: 'Claire Test', email: 'claire@exemple.test', agenda: true };
const PAUL = { id: 5, libelle: 'Paul Test', email: 'paul@exemple.test', agenda: false };
const AVANT: EtatRdv = { jour: '2026-11-25', heure: '14:00', dureeMinutes: 60, collaborateurs: [CLAIRE] };

describe('🔴 D — qui prévenir', () => {
  it('collaborateur changé par QUELQU’UN D’AUTRE : l’initial est prévenu', () => {
    expect(collaborateursAPrevenir(AVANT, { ...AVANT, collaborateurs: [PAUL] }, 3)).toEqual([CLAIRE]);
  });
  it('la personne qui modifie EST le collaborateur initial : aucun mail', () => {
    expect(collaborateursAPrevenir(AVANT, { ...AVANT, collaborateurs: [PAUL] }, 4)).toEqual([]);
  });
  it('même collaborateur gardé (date ou heure changée) : pas de mail D — la nouvelle invitation existante (règle G) l’informe', () => {
    expect(collaborateursAPrevenir(AVANT, { ...AVANT, jour: '2026-11-27' }, 3)).toEqual([]);
  });
});

describe('🔴 D / H — le mail au collaborateur initial', () => {
  it('ancien et nouveau créneau, ancien et nouveau collaborateur, auteur ; l’agenda Google retiré quand il y était', () => {
    const m = mailModificationRdv({ pour: CLAIRE, objetRdv: 'État des lieux de sortie', adresse: '12 rue de l’Essai', avant: AVANT,
      apres: { jour: '2026-11-27', heure: '10:30', dureeMinutes: 90, collaborateurs: [PAUL] }, auteur: 'Arnaud Jorel' });
    expect(m.objet).toBe('[Copie interne] Rendez-vous modifié — État des lieux de sortie — 12 rue de l’Essai');
    expect(m.corps).toContain('Le rendez-vous « État des lieux de sortie » (12 rue de l’Essai) a été modifié par Arnaud Jorel.');
    expect(m.corps).toContain('Ancien créneau : 25/11/2026 de 14h00 à 15h00');
    expect(m.corps).toContain('Nouveau créneau : 27/11/2026 de 10h30 à 12h00');
    expect(m.corps).toContain('Ancien collaborateur : Claire Test');
    expect(m.corps).toContain('Nouveau collaborateur : Paul Test');
    expect(m.corps).toContain('L’événement est retiré de votre agenda Google.');
    expect(mailModificationRdv({ pour: PAUL, objetRdv: 'x', adresse: null, avant: { ...AVANT, collaborateurs: [PAUL] }, apres: AVANT, auteur: 'A' }).corps)
      .not.toContain('agenda Google');
  });
  it('la règle « courrier automatique » (500) range ce mail interne, jamais une réponse humaine', () => {
    const sql = readFileSync('db/migrations/500_gestion_regle_courrier_rdv_modifie.sql', 'utf8');
    const valeur = /\('gabarit_objet', '([^']+)', 'envoye',/.exec(sql)![1];
    const regles: RegleExclusion[] = [{ id: 1, type: 'gabarit_objet', valeur, sens: 'envoye', motif: 'm' }];
    const objet = mailModificationRdv({ pour: CLAIRE, objetRdv: 'Pré-visite', adresse: 'A', avant: AVANT, apres: AVANT, auteur: 'X' }).objet;
    expect(normaliserObjet(objet)).toBe(valeur);
    expect(appliquerRegles(regles, { sens: 'envoye', deAdresse: 'gestion@criterimmo.fr', objet, entetes: {} })).not.toBeNull();
    expect(appliquerRegles(regles, { sens: 'recu', deAdresse: 'claire@exemple.test', objet: `RE: ${objet}`, entetes: {} })).toBeNull();
  });
});

describe('🔴 J (corrigée le 19/11/2026) — seul un rendez-vous EFFECTUÉ ou ANNULÉ ne se modifie plus', () => {
  it('à faire (même date passée, compte rendu à faire) : oui ; effectué, tâche faite, annulée : non', () => {
    expect(rdvModifiable({ etat: 'a_faire' })).toBe(true);
    expect(rdvModifiable({})).toBe(true);
    expect(rdvModifiable({ etat: 'a_faire', effectue: true })).toBe(false);
    expect(rdvModifiable({ etat: 'faite' })).toBe(false);
    expect(rdvModifiable({ etat: 'annulee' })).toBe(false);
  });
});

describe('🔴 F — la phrase de la fenêtre de confirmation', () => {
  it('fixer, modifier, valider sans confirmation, annuler une validation — pour les trois sortes de rendez-vous', () => {
    expect(phraseConfirmationRdv('fixe', 'previsite', creneauLisible(AVANT))).toBe('La pré-visite est fixée le 25/11/2026 de 14h00 à 15h00.');
    expect(phraseConfirmationRdv('modifie', 'edl', '27/11/2026 de 10h30 à 12h00')).toBe('L’état des lieux de sortie est modifié : 27/11/2026 de 10h30 à 12h00.');
    expect(phraseConfirmationRdv('modifie', 'tache')).toBe('Le rendez-vous est modifié.');
    expect(phraseConfirmationRdv('valide_sans_confirmation', 'previsite')).toBe('La pré-visite est confirmée côté locataires, sans leur demander de confirmation.');
    expect(phraseConfirmationRdv('validation_annulee', 'edl')).toBe('La validation à la main est annulée : l’état des lieux de sortie n’est plus confirmé côté locataires.');
    expect(phraseConfirmationRdv('valide_sans_confirmation', 'edl')).toBe('L’état des lieux de sortie est confirmé côté locataires, sans leur demander de confirmation.');
  });
});
