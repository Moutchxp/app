import { describe, expect, it } from 'vitest';
import {
  adresseComplete, adresseCourte, agendaAffiche, ajouterMinutesLocal, construireEvenement, delaiProchainEssaiMs,
  estNotreEvenement, lienFicheBien, MARQUE_APPLICATION, placeVoulue, rappelsGoogle, titreEvenement, type ContenuTache,
  type EtatPourAgenda,
} from './agendaTache';
import { lireSaisie, motRappel } from './taches';

/**
 * LOT TACHES-AGENDA — LES RÈGLES PURES : où la tâche doit être (règles 1-2-3 d'Arno), ce que dit l'événement, et la
 * reconnaissance de NOS événements (garde-fou).
 */
const DOMAINES = ['criterimmo.fr', 'sansvisavis.com'];
const base: EtatPourAgenda = {
  etat: 'a_faire', confieeA: 2, confieeEmail: 'a.jorel@sansvisavis.com', confieeActif: true, creePar: 2, acceptation: 'acceptee',
};

describe('🔴 règles 1, 2, 3 : où la tâche doit être', () => {
  it('1. confiée à soi-même (acceptée d’office) : dans son agenda', () => {
    expect(placeVoulue(base, DOMAINES)).toEqual({ sorte: 'present', agenda: 'a.jorel@sansvisavis.com', faite: false });
  });
  it('2. confiée à un collègue : rien tant qu’elle est en attente ou refusée ; dans son agenda une fois acceptée', () => {
    const coll = { ...base, confieeA: 3, confieeEmail: 'Claire@Criterimmo.fr', creePar: 2 };
    expect(placeVoulue({ ...coll, acceptation: 'en_attente' }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'en_attente' });
    expect(placeVoulue({ ...coll, acceptation: 'refusee' }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'refusee' });
    expect(placeVoulue({ ...coll, acceptation: 'acceptee' }, DOMAINES))
      .toEqual({ sorte: 'present', agenda: 'claire@criterimmo.fr', faite: false });
  });
  it('3. hors de notre Workspace (ou compte inactif) : pas d’agenda Google', () => {
    expect(placeVoulue({ ...base, confieeEmail: 'gestion.criterimmo@gmail.com' }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'hors_workspace' });
    expect(placeVoulue({ ...base, confieeActif: false }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'hors_workspace' });
    expect(placeVoulue(base, [])).toEqual({ sorte: 'absent', raison: 'hors_workspace' });
  });
  it('faite : reste, marquée ; annulée : nulle part', () => {
    expect(placeVoulue({ ...base, etat: 'faite' }, DOMAINES)).toMatchObject({ sorte: 'present', faite: true });
    expect(placeVoulue({ ...base, etat: 'annulee' }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'annulee' });
  });
  it('sans demande (tâche d’avant l’acceptation) : présente seulement si créateur = personne confiée', () => {
    expect(placeVoulue({ ...base, acceptation: null }, DOMAINES).sorte).toBe('present');
    expect(placeVoulue({ ...base, acceptation: null, creePar: 9 }, DOMAINES)).toEqual({ sorte: 'absent', raison: 'en_attente' });
  });
});

const contenu: ContenuTache = {
  id: 41, objet: 'Visite technique', texte: 'Clés chez le gardien\n\nContacts\n- Syndic', jour: '2026-10-14', heure: null,
  dureeMinutes: null, rappels: [{ sorte: 'jour', heure: '09:00' }, { sorte: 'veille', heure: '17:00' }], faite: false, lotId: 27,
  adresse: '7 avenue de l’Union', codePostal: '92600', commune: 'Asnières-sur-Seine',
  pieces: [{ driveId: 'abcDEF123', nom: 'devis.pdf', typeMime: 'application/pdf', lien: 'https://drive.google.com/file/d/abcDEF123/view' }],
};

describe('🔴 l’événement', () => {
  it('titre « Gestion — adresse courte — objet », jamais de n° de lot ; « ✓ » quand elle est faite', () => {
    expect(titreEvenement(contenu)).toBe('Gestion — 7 avenue de l’Union — Visite technique');
    expect(titreEvenement({ ...contenu, faite: true })).toBe('✓ Gestion — 7 avenue de l’Union — Visite technique');
    expect(titreEvenement(contenu)).not.toMatch(/lot|27/);
    expect(adresseCourte(null, 'Paris')).toBe('Paris');
  });
  it('journée entière : fin = le lendemain (borne exclusive) ; privé ; lieu = adresse complète', () => {
    const ev = construireEvenement(contenu, { siteUrl: 'https://app.test/', motRappel });
    expect(ev.start).toEqual({ date: '2026-10-14' });
    expect(ev.end).toEqual({ date: '2026-10-15' });
    expect(ev.visibility).toBe('private');
    expect(ev.location).toBe('7 avenue de l’Union, 92600 Asnières-sur-Seine');
    expect(adresseComplete(null, null, null)).toBeNull();
  });
  it('rendez-vous : 1 h par défaut, ou la durée choisie, à l’heure de Paris', () => {
    const rdv = construireEvenement({ ...contenu, heure: '09:30', rappels: [] }, { motRappel });
    expect(rdv.start).toEqual({ dateTime: '2026-10-14T09:30:00', timeZone: 'Europe/Paris' });
    expect(rdv.end).toEqual({ dateTime: '2026-10-14T10:30:00', timeZone: 'Europe/Paris' });
    const long = construireEvenement({ ...contenu, heure: '23:30', dureeMinutes: 90, rappels: [] }, { motRappel });
    expect(long.end).toEqual({ dateTime: '2026-10-15T01:00:00', timeZone: 'Europe/Paris' });
    expect(ajouterMinutesLocal('2026-10-25', '02:30', 60)).toBe('2026-10-25T03:30:00'); // nuit du changement d'heure
  });
  it('description : note + Contacts + lien vers la fiche ; pièces Drive attachées ; marque privée', () => {
    const ev = construireEvenement(contenu, { siteUrl: 'https://app.test', motRappel });
    expect(ev.description).toContain('Clés chez le gardien');
    expect(ev.description).toContain('Contacts');
    expect(ev.description).toContain('https://app.test/admin/gestion?ecran=annuaire&fiche=lot-27');
    expect(ev.attachments).toEqual([{ fileUrl: 'https://drive.google.com/file/d/abcDEF123/view', title: 'devis.pdf', fileId: 'abcDEF123', mimeType: 'application/pdf' }]);
    expect(ev.extendedProperties.private).toEqual({ svavApp: MARQUE_APPLICATION, svavTacheId: '41' });
    expect(lienFicheBien('', 27)).toBeNull();
  });
  it('rappels : « N min avant » et « la veille à 17 h » traduits ; « le jour même à 9 h » → la veille à 17 h, dit dans la description', () => {
    expect(rappelsGoogle([{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 60 }], true).reminders)
      .toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] });
    const j = rappelsGoogle([{ sorte: 'jour', heure: '09:00' }], false);
    expect(j.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 420 }] });
    expect(j.remplaces).toEqual([{ sorte: 'jour', heure: '09:00' }]);
    // jour même 9 h + veille 17 h : une seule notification (pas de doublon)
    expect(rappelsGoogle(contenu.rappels, false).reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 420 }] });
    expect(construireEvenement(contenu, { motRappel }).description)
      .toContain('Rappel prévu dans l’application : le jour même à 9 h (notification Google : la veille à 17 h).');
  });
  it('🔴 jamais les notifications par défaut de l’agenda (« la veille à 23:50 ») : aucun rappel ⇒ aucune notification', () => {
    expect(rappelsGoogle([], false).reminders).toEqual({ useDefault: false, overrides: [] });
    expect(rappelsGoogle([], true).reminders).toEqual({ useDefault: false, overrides: [] });
    expect(construireEvenement({ ...contenu, rappels: [] }, { motRappel }).description).not.toContain('Rappel prévu');
  });
});

describe('🔴🔴 garde-fou : est-ce NOTRE événement ?', () => {
  it('marque ET numéro de tâche en propriété privée ; tout le reste est étranger', () => {
    expect(estNotreEvenement({ extendedProperties: { private: { svavApp: MARQUE_APPLICATION, svavTacheId: '41' } } }, 41)).toBe(true);
    expect(estNotreEvenement({ extendedProperties: { private: { svavApp: MARQUE_APPLICATION, svavTacheId: '42' } } }, 41)).toBe(false);
    expect(estNotreEvenement({ extendedProperties: { shared: { svavApp: MARQUE_APPLICATION, svavTacheId: '41' } } }, 41)).toBe(false);
    expect(estNotreEvenement({ summary: 'Dentiste' }, 41)).toBe(false);
    expect(estNotreEvenement(null, 41)).toBe(false);
  });
});

describe('ce que l’écran dit', () => {
  const present = { sorte: 'present', agenda: 'a@sansvisavis.com', faite: false } as const;
  it('jamais d’échec silencieux : « à resynchroniser » + Réessayer', () => {
    expect(agendaAffiche({ reglageActif: true, synchroEtat: 'echec', erreur: 'Google indisponible', evenementId: null, place: present, confieeLibelle: 'Arno' }))
      .toEqual({ etat: 'a_resynchroniser', texte: 'Agenda : à resynchroniser', motif: 'Google indisponible', peutReessayer: true });
  });
  it('hors Workspace : « pas d’agenda Google » ; réglage coupé sans événement : rien', () => {
    expect(agendaAffiche({ reglageActif: false, synchroEtat: 'non_demandee', erreur: null, evenementId: null, place: { sorte: 'absent', raison: 'hors_workspace' }, confieeLibelle: 'X' })?.texte)
      .toBe('pas d’agenda Google');
    expect(agendaAffiche({ reglageActif: false, synchroEtat: 'non_demandee', erreur: null, evenementId: null, place: present, confieeLibelle: 'X' })).toBeNull();
  });
  it('dans l’agenda ; en attente d’acceptation', () => {
    expect(agendaAffiche({ reglageActif: true, synchroEtat: 'envoyee', erreur: null, evenementId: 'e1', place: present, confieeLibelle: 'Arno' })?.etat).toBe('dans_agenda');
    expect(agendaAffiche({ reglageActif: true, synchroEtat: 'non_demandee', erreur: null, evenementId: null, place: { sorte: 'absent', raison: 'en_attente' }, confieeLibelle: 'C' })?.texte)
      .toBe('Agenda : après acceptation');
  });
  it('reprise : délai croissant, plafonné', () => {
    expect(delaiProchainEssaiMs(0)).toBe(300_000);
    expect(delaiProchainEssaiMs(1)).toBe(600_000);
    expect(delaiProchainEssaiMs(50)).toBe(6 * 3_600_000);
  });
  it('la saisie lit la durée seulement pour un rendez-vous, et pas quand l’écran ne l’envoie pas', () => {
    expect(lireSaisie({ objet: 'x', jour: '2026-10-14', heure: '09:00', dureeMinutes: 90 }).dureeMinutes).toBe(90);
    expect(lireSaisie({ objet: 'x', jour: '2026-10-14', heure: '', dureeMinutes: 90 }).dureeMinutes).toBeNull();
    expect(lireSaisie({ objet: 'x', jour: '2026-10-14', heure: '09:00', dureeMinutes: 3 }).dureeMinutes).toBeNull();
    expect('dureeMinutes' in lireSaisie({ objet: 'x', jour: '2026-10-14' })).toBe(false);
  });
});
