import { describe, expect, it } from 'vitest';
import {
  ALERTE_TOUS_REFUSENT, CARTOUCHE_ALERTE, enAlerte, finDuRendezVous, invitationIcs, jourAlerte, objetCompteRendu, paragraphesDuTexte,
  pastillesPrevisite, replierIcs, statutPrevisite, texteRefusPrevisite, tousRefusent, verifierRdvPrevisite, mailPrevisite,
  paragraphesConfirmationLocataires, paragraphesModificationLocataires, objetModificationLocataires, MENTION_AUTOMATIQUE,
  paragraphesAlertePrevisite, type FaitsPrevisite,
} from './previsite';

/**
 * 🔴🔴 LA PRÉ-VISITE (Arno, 10/11/2026) — les règles pures : alerte du 11e jour selon la date de SAISIE du rendez-vous, statuts,
 * pastilles, « tous refusent », saisie, textes, invitation d'agenda.
 */
const f = (o: Partial<FaitsPrevisite> = {}): FaitsPrevisite => ({ recuLe: '2026-11-01', rdvSaisiLe: null, refusLe: null, effectueeLe: null, ...o });

describe('🔴 Règle 2 — l’alerte : aucun rendez-vous SAISI dans les 10 jours qui suivent la réception ⇒ alerte au 11e jour', () => {
  it('réception le 01/11 : le 11/11 (10e jour) pas d’alerte ; le 12/11 (11e jour) alerte', () => {
    expect(jourAlerte('2026-11-01')).toBe('2026-11-12');
    expect(enAlerte(f(), '2026-11-11')).toBe(false);
    expect(enAlerte(f(), '2026-11-12')).toBe(true);
    expect(statutPrevisite(f(), '2026-11-11')).toBe('recu');
    expect(statutPrevisite(f(), '2026-11-12')).toBe('alerte');
  });
  it('un rendez-vous SAISI le 8e jour pour le 12e jour : pas d’alerte au 11e jour (seule la saisie compte)', () => {
    const x = f({ rdvSaisiLe: '2026-11-09T10:00:00.000Z' });
    expect(enAlerte(x, '2026-11-12')).toBe(false);
    expect(statutPrevisite(x, '2026-11-12')).toBe('programmee');
  });
  it('un rendez-vous saisi APRÈS les 10 jours lève l’alerte', () => {
    expect(statutPrevisite(f(), '2026-11-15')).toBe('alerte');
    expect(statutPrevisite(f({ rdvSaisiLe: '2026-11-15T09:00:00.000Z' }), '2026-11-15')).toBe('programmee');
  });
  it('le mail de refus / absence lève l’alerte ; le compte rendu aussi', () => {
    expect(statutPrevisite(f({ refusLe: '2026-11-14T09:00:00.000Z' }), '2026-11-15')).toBe('refusee');
    expect(statutPrevisite(f({ rdvSaisiLe: '2026-11-03T09:00:00.000Z', effectueeLe: '2026-11-10T09:00:00.000Z' }), '2026-11-15')).toBe('effectuee');
  });
  it('un préavis déjà ancien (reçu le 01/09) sans rendez-vous est en alerte aujourd’hui', () => {
    expect(statutPrevisite(f({ recuLe: '2026-09-01' }), '2026-11-10')).toBe('alerte');
  });
  it('fin de mois : reçu le 25/02/2026 → alerte le 08/03/2026', () => {
    expect(jourAlerte('2026-02-25')).toBe('2026-03-08');
  });
});

describe('🔴 Règle 1 — les statuts et les pastilles', () => {
  it('refus puis nouveau rendez-vous : programmée ; rendez-vous puis refus : refusée', () => {
    expect(statutPrevisite(f({ refusLe: '2026-11-05T09:00:00.000Z', rdvSaisiLe: '2026-11-06T09:00:00.000Z' }), '2026-11-07')).toBe('programmee');
    expect(statutPrevisite(f({ rdvSaisiLe: '2026-11-03T09:00:00.000Z', refusLe: '2026-11-06T09:00:00.000Z' }), '2026-11-07')).toBe('refusee');
    // déplacé après le refus : de nouveau programmée
    expect(statutPrevisite(f({ rdvSaisiLe: '2026-11-03T09:00:00.000Z', refusLe: '2026-11-06T09:00:00.000Z', rdvModifieLe: '2026-11-07T09:00:00.000Z' }), '2026-11-07')).toBe('programmee');
  });
  it('les compteurs, dans l’ordre d’Arno ; « Alerte préavis » absente quand il n’y en a aucune', () => {
    expect(pastillesPrevisite(['recu', 'programmee', 'programmee'])).toEqual([
      { statut: 'recu', libelle: 'Préavis reçu', nombre: 1 },
      { statut: 'programmee', libelle: 'Pré-visite programmée', nombre: 2 },
      { statut: 'effectuee', libelle: 'Pré-visite effectuée', nombre: 0 },
      { statut: 'refusee', libelle: 'Pré-visite refusée / absente', nombre: 0 },
    ]);
    expect(pastillesPrevisite(['alerte', 'recu'])[0]).toEqual({ statut: 'alerte', libelle: 'Alerte préavis', nombre: 1 });
  });
  it('les mots de la ligne', () => {
    expect(CARTOUCHE_ALERTE).toBe('Aucune pré-visite fixée');
    expect(ALERTE_TOUS_REFUSENT).toBe('Personne n’a accepté la pré-visite');
  });
});

describe('🔴 Règle 3 — plusieurs collègues ; tous refusent', () => {
  it('tous refusent ⇒ vrai ; un seul en attente ou accepté ⇒ faux ; aucun invité ⇒ faux', () => {
    expect(tousRefusent(['refusee', 'refusee'])).toBe(true);
    expect(tousRefusent(['refusee', 'en_attente'])).toBe(false);
    expect(tousRefusent(['refusee', 'acceptee'])).toBe(false);
    expect(tousRefusent([])).toBe(false);
  });
  it('la saisie : date, créneau, au moins un collègue (dédoublonnés, dans l’ordre)', () => {
    const g = [{ recuLe: '2026-11-01', dateMax: '2027-02-01' }];
    expect(verifierRdvPrevisite({ jour: '2026-11-12', debut: '10:00', fin: '11:30', destinataires: [5, 7, 5] }, g))
      .toEqual({ ok: true, jour: '2026-11-12', heure: '10:00', dureeMinutes: 90, destinataires: [5, 7] });
    expect(verifierRdvPrevisite({ jour: '2026-11-12', debut: '10:00', fin: '11:00', destinataires: [] }, g)).toMatchObject({ ok: false, champ: 'destinataires' });
    expect(verifierRdvPrevisite({ jour: '2026-11-12', debut: '10:00', fin: '09:00', destinataires: [5] }, g)).toMatchObject({ ok: false, champ: 'fin' });
    expect(verifierRdvPrevisite({ jour: '2026-10-30', debut: '10:00', fin: '11:00', destinataires: [5] }, g))
      .toEqual({ ok: false, champ: 'jour', motif: 'La pré-visite ne peut pas précéder la réception du recommandé (01/11/2026)' });
    expect(verifierRdvPrevisite({ jour: '', debut: '10:00', fin: '11:00', destinataires: [5] }, g)).toMatchObject({ ok: false, champ: 'jour' });
  });
});

describe('🔴 Règle 5 — le compte rendu : objet prérempli mot pour mot ; l’invitation après la fin du rendez-vous', () => {
  it('« Compte rendu de pré-visite d’état des lieux de sortie effectuée le JJ/MM/AAAA à HHhMM »', () => {
    expect(objetCompteRendu({ jour: '2026-11-12', heure: '09:30' })).toBe('Compte rendu de pré-visite d’état des lieux de sortie effectuée le 12/11/2026 à 09h30');
  });
  it('la fin du rendez-vous (heure de Paris, en hiver UTC+1) : 12/11 10h00 + 90 min → 10:30 UTC', () => {
    expect(finDuRendezVous('2026-11-12', '10:00', 90).toISOString()).toBe('2026-11-12T10:30:00.000Z');
  });
});

describe('🔴 Règle 6 — le texte prérempli du refus / de l’absence', () => {
  const t = texteRefusPrevisite({ adresse: '28 Avenue Marceau, 92400 Courbevoie', locataires: [{ nom: 'TEST', prenom: 'Alice' }, { nom: 'TEST', prenom: 'Bruno' }] });
  it('courtois, adressé aux locataires, avec les idées d’Arno ; 🔴 le nom de CHAQUE destinataire, jamais ceux des colocataires', () => {
    expect(t.startsWith('Bonjour [nom du locataire],')).toBe(true);
    expect(t).not.toContain('Alice');
    expect(t).not.toContain('Bruno');
    expect(t).toContain('Malgré nos recommandations, aucun rendez-vous de pré-visite n’a pu être fixé.');
    expect(t).toContain('le jour de l’état des lieux de sortie');
    expect(t).toContain('éviter une retenue sur le dépôt de garantie');
  });
  it('modifiable : le texte saisi se découpe en paragraphes, puis la mention et la signature suivent', () => {
    const paras = paragraphesDuTexte('Bonjour,\n\nTexte  modifié.\r\n\r\nFin.');
    expect(paras).toEqual(['Bonjour,', 'Texte  modifié.', 'Fin.']);
    const m = mailPrevisite({ sorte: 'previsite_refus', de: 'gestion@exemple.test', a: ['a@exemple.test'], cc: ['x@exemple.test'], objet: 'o', paragraphes: paras,
      qui: { prenom: 'Jean', nomFamille: 'Test', email: 'jean@exemple.test' }, signature: { html: '<b>Sig</b>', texte: 'Sig' } });
    expect(m.texte).toBe('Bonjour,\n\nTexte  modifié.\n\nFin.\n\nMail envoyé par Jean TEST (jean@exemple.test)\n\n-- \nSig');
    expect(m.html).toContain('gmail_signature');
  });
});

describe('🔴 Règles 3-4 — les mails aux locataires (plusieurs locataires) ; le déplacement', () => {
  const locs = [{ nom: 'TEST', prenom: 'Alice' }, { nom: 'TEST', prenom: 'Bruno' }];
  it('confirmation : tous les locataires nommés, le créneau, l’invitation jointe', () => {
    const p = paragraphesConfirmationLocataires({ adresse: '4 rue Fictive', locataires: locs, rdv: { jour: '2026-11-12', heure: '10:00', dureeMinutes: 60 } });
    expect(p[0]).toBe('Bonjour Alice TEST et Bruno TEST,');
    expect(p[1]).toBe('Nous vous confirmons le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé 4 rue Fictive, le 12/11/2026 de 10h00 à 11h00.');
  });
  it('modification : l’ancien et le nouveau créneau', () => {
    const p = paragraphesModificationLocataires({ adresse: '4 rue Fictive', locataires: locs, rdv: { jour: '2026-11-14', heure: '15:00', dureeMinutes: 30 }, ancien: { jour: '2026-11-12', heure: '10:00', dureeMinutes: 60 } });
    expect(p[1]).toBe('Le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé 4 rue Fictive, prévu le 12/11/2026 de 10h00 à 11h00, est déplacé au 14/11/2026 de 15h00 à 15h30.');
    expect(objetModificationLocataires('4 rue Fictive', { jour: '2026-11-14', heure: '15:00', dureeMinutes: 30 })).toBe('Modification de votre rendez-vous de pré-visite — nouvelle date : 14/11/2026 à 15h00 — 4 rue Fictive');
  });
  it('l’alerte : envoi automatique, avec le lien vers la ligne', () => {
    const p = paragraphesAlertePrevisite({ adresse: '4 rue Fictive', locataires: locs, recuLe: '2026-11-01', dateMax: '2027-02-01', lien: 'http://localhost:3000/admin/location?preavis=x' });
    expect(p[1]).toContain('reçu le 01/11/2026');
    expect(p[3]).toBe('Ouvrir la ligne de ce préavis : http://localhost:3000/admin/location?preavis=x');
    const m = mailPrevisite({ sorte: 'previsite_alerte', de: 'g@exemple.test', a: ['a@exemple.test'], cc: [], objet: 'o', paragraphes: p, qui: { mention: MENTION_AUTOMATIQUE }, signature: { html: '', texte: '' } });
    expect(m.texte.endsWith(MENTION_AUTOMATIQUE)).toBe(true);
  });
});

describe('★ L’invitation d’agenda (.ics)', () => {
  const ics = invitationIcs({ uid: 'previsite-12@exemple.test', sequence: 1, rdv: { jour: '2026-07-12', heure: '10:00', dureeMinutes: 60 },
    titre: 'Pré-visite, état des lieux', lieu: '4 rue Fictive; Paris', description: 'Ligne 1\nLigne 2', maintenant: new Date('2026-07-01T08:00:00Z') });
  it('heures en UTC (été : UTC+2), même UID, séquence, sans bouton de réponse (PUBLISH)', () => {
    expect(ics).toContain('DTSTART:20260712T080000Z');
    expect(ics).toContain('DTEND:20260712T090000Z');
    expect(ics).toContain('UID:previsite-12@exemple.test');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('LOCATION:4 rue Fictive\\; Paris');
    expect(ics).toContain('SUMMARY:Pré-visite\\, état des lieux');
    expect(ics).toContain('DESCRIPTION:Ligne 1\\nLigne 2');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('les lignes longues sont repliées sans couper un caractère', () => {
    const longue = `DESCRIPTION:${'é'.repeat(80)}`;
    const r = replierIcs(longue);
    expect(r.split('\r\n ').join('')).toBe(longue);
  });
});
