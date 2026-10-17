import { describe, expect, it } from 'vitest';
import {
  EN_TETE_SERVICE, heureMission, horodatageMail, jourMission, mailTache, phraseConfirmation, phraseInvites, planPieces,
  SEUIL_PIECES_OCTETS, type ContenuMailTache,
} from './mailTache';

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — LE CONTENU DU MAIL (Arno, 17/10/2026) ══════════════════════════════
 * Invitation ET récapitulatif, même structure, sections dans l'ordre demandé ; date de la mission très en évidence ;
 * 1 contact = 1 bloc ; « Vous êtes N invités » (et leur état dans le récapitulatif) ; pièces jointes sous le seuil,
 * liens au-delà ; boutons ou confirmation. Gmail et téléphone : tableaux, styles en ligne, 600 px max. Aucun lien
 * d'administration, aucun secret.
 */
const base: ContenuMailTache = {
  sorte: 'invitation', destinataire: 'Claire Test', expediteur: 'Arnaud Jorel', demandeLe: '2026-10-17T07:05:00Z',
  jour: '2026-10-21', heure: '14:30', dureeMinutes: 90, titre: 'Visite d’entrée', notes: 'Clés chez le gardien.\nSonner deux fois.',
  adresse: '7 avenue de l’Union, 92600 Asnières-sur-Seine',
  contacts: [
    { famille: 'locataire', nom: 'M. Martin', qualite: null, organisation: null, coordonnees: [
      { sorte: 'telephone', libelle: 'Portable', valeur: '0612345678', affichage: '06 12 34 56 78' },
      { sorte: 'email', libelle: null, valeur: 'martin@example.test', affichage: null }] },
    { famille: 'syndic_immeuble', nom: 'Mme Durand', qualite: 'Gestionnaire', organisation: 'Cabinet Exemple', coordonnees: [
      { sorte: 'telephone', libelle: 'Ligne directe', valeur: '0145000000', affichage: null }] },
  ],
  invites: [
    { libelle: 'Claire Test', statut: 'en_attente', moi: true }, { libelle: 'Emma Essai', statut: 'refusee', moi: false },
    { libelle: 'Gaspard Essai', statut: 'acceptee', moi: false },
  ],
  pieces: [
    { nom: 'plan.pdf', jointe: true, lien: null, tailleOctets: 340_000, motif: null },
    { nom: 'photos.zip', jointe: false, lien: 'https://app.test/api/tache/piece?j=1.2.3.sig', tailleOctets: 14_000_000, motif: null },
    { nom: 'cni.pdf', jointe: false, lien: null, tailleOctets: null, motif: 'dossier « Documents clients scannés »' },
  ],
  liens: { accepter: 'https://app.test/tache/reponse?j=JETON&d=accepter', refuser: 'https://app.test/tache/reponse?j=JETON&d=refuser', expireLe: '2026-10-24T07:05:00Z' },
  piecesExpirentLe: '2026-10-24T07:05:00Z',
};

describe('les dates', () => {
  it('la mission en toutes lettres ; l’heure et la durée, ou « Journée »', () => {
    expect(jourMission('2026-10-21')).toBe('Mercredi 21 octobre 2026');
    expect(jourMission('2026-11-01')).toBe('Dimanche 1er novembre 2026');
    expect(heureMission('14:30', 90)).toBe('14 h 30 (1 h 30)');
    expect(heureMission('09:00', null)).toBe('9 h 00 (1 h)');
    expect(heureMission(null, null)).toBe('Journée');
    expect(horodatageMail('2026-10-17T07:05:00Z')).toBe('17 octobre 2026 à 9 h 05');
  });
});

describe('l’invitation : les 9 sections, dans l’ordre', () => {
  const { texte, html } = mailTache(base);
  it('texte : en-tête, expéditeur, date de demande, date de mission, titre, notes, adresse, contacts, invités, pièces, réponse', () => {
    const ordre = [EN_TETE_SERVICE, 'Invitation envoyée par Arnaud Jorel', 'Demande du 17 octobre 2026 à 9 h 05',
      'DATE DE LA MISSION : MERCREDI 21 OCTOBRE 2026 — 14 h 30 (1 h 30)', 'Visite d’entrée', 'Sonner deux fois.',
      '7 avenue de l’Union', 'M. Martin', 'Mme Durand', 'Vous êtes 3 invités : Claire Test, Emma Essai, Gaspard Essai.',
      'plan.pdf — jointe à ce mail', 'photos.zip — à télécharger : https://app.test/api/tache/piece?j=1.2.3.sig',
      'cni.pdf — non jointe (dossier « Documents clients scannés »)', 'Accepter : https://app.test/tache/reponse?j=JETON&d=accepter',
      'Refuser : https://app.test/tache/reponse?j=JETON&d=refuser'];
    let pos = -1;
    for (const x of ordre) {
      const i = texte.indexOf(x);
      expect(i, x).toBeGreaterThan(pos);
      pos = i;
    }
  });
  it('1 contact = 1 bloc : nom, rôle, téléphone, e-mail', () => {
    expect(texte).toContain('M. Martin\nLocataire en place\nPortable : 06 12 34 56 78\nE-mail : martin@example.test');
    expect(texte).toContain('Mme Durand\nSyndic & immeuble · Gestionnaire · Cabinet Exemple\nLigne directe : 0145000000');
    expect(html.match(/border:1px solid #e3e3e3;border-radius:8px;padding:10px 12px/g)).toHaveLength(2);
    expect(html).toContain('href="tel:0612345678"');
    expect(html).toContain('href="mailto:martin@example.test"');
  });
  it('HTML : la date de la mission en grand, tout en haut du corps ; les deux boutons', () => {
    expect(html).toMatch(/font-size:26px[^>]*>Mercredi 21 octobre 2026</);
    expect(html.indexOf('Date de la mission')).toBeLessThan(html.indexOf('Visite d’entrée'));
    expect(html).toContain('>Accepter</a>');
    expect(html).toContain('>Refuser</a>');
    expect(html).toContain('Aucune connexion n’est demandée');
    expect(texte).not.toContain('Il faut être connecté');
  });
  it('Gmail et téléphone : tableaux, styles en ligne, 600 px au plus, viewport, aucune feuille de style ni image distante', () => {
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain('max-width:600px;width:100%');
    expect(html).not.toMatch(/<style|<link|<img|class=/i);
  });
  it('aucun lien d’administration, aucun secret ; tout est échappé', () => {
    expect(texte + html).not.toMatch(/\/admin|drive\.google|fiche=|Bearer|token/i);
    const piege = mailTache({ ...base, titre: '<script>alert(1)</script>', notes: null });
    expect(piege.html).not.toContain('<script>');
    expect(piege.html).toContain('&lt;script&gt;');
  });
});

describe('le récapitulatif : même structure, l’état des autres invités, la confirmation', () => {
  const recap = mailTache({ ...base, sorte: 'recapitulatif', liens: undefined, agenda: 'ajoutee',
    invites: base.invites.map((i) => (i.moi ? { ...i, statut: 'acceptee' as const } : i)) });
  it('les mêmes sections, puis les états et « Tâche acceptée, ajoutée à votre agenda »', () => {
    expect(recap.texte).toContain(EN_TETE_SERVICE);
    expect(recap.texte).toContain('Invitation envoyée par Arnaud Jorel');
    expect(recap.texte).toContain('DATE DE LA MISSION : MERCREDI 21 OCTOBRE 2026');
    expect(recap.texte).toContain('Claire Test (vous) : ✓ Acceptée');
    expect(recap.texte).toContain('Emma Essai : ✗ Refusée');
    expect(recap.texte).toContain('Gaspard Essai : ✓ Acceptée');
    expect(recap.texte).toContain('Tâche acceptée, ajoutée à votre agenda.');
    expect(recap.html).toContain('✓ Tâche acceptée, ajoutée à votre agenda.');
    expect(recap.html).not.toContain('>Accepter</a>');
  });
  it('sans agenda : il le dit, il ne le promet pas', () => {
    expect(phraseConfirmation('sans_agenda')).toMatch(/n’est pas ajoutée/);
    expect(phraseConfirmation('bientot')).toMatch(/dans quelques minutes/);
  });
  it('seul invité : pas de section « Invités »', () => {
    expect(phraseInvites([{ libelle: 'Claire', statut: 'en_attente', moi: true }])).toBeNull();
  });
});

describe('les pièces : jointes sous le seuil (total), sinon un lien chacune ; refusées : ni l’un ni l’autre', () => {
  const p = (taille: number | null, o: { permis?: boolean; telechargeable?: boolean } = {}) =>
    ({ tailleOctets: taille, permis: o.permis ?? true, telechargeable: o.telechargeable ?? true });
  it('le seuil est de 10 Mo au total', () => {
    expect(SEUIL_PIECES_OCTETS).toBe(10 * 1024 * 1024);
    expect(planPieces([p(4_000_000), p(5_000_000)]).map((x) => x.jointe)).toEqual([true, true]);
    expect(planPieces([p(6_000_000), p(6_000_000)]).map((x) => x.jointe)).toEqual([false, false]);
  });
  it('un document Google (sans octets figés) et une pièce refusée ne sont jamais jointes', () => {
    expect(planPieces([p(100), p(null, { telechargeable: false }), p(100, { permis: false })]).map((x) => x.jointe))
      .toEqual([true, false, false]);
  });
});

describe('🔴 LOT GESTION-CONFIRMATION-ACCEPTATION — la confirmation (gestion@ et le créateur)', () => {
  const conf = mailTache({ ...base, sorte: 'confirmation', liens: undefined, acceptation: { par: 'Claire Test', le: '2026-10-17T08:12:00Z' },
    invites: base.invites.map((i) => (i.moi ? { ...i, statut: 'acceptee' as const } : i)) });
  it('en tête « Acceptée par … le … », puis la même structure que le récapitulatif, états à jour, sans boutons', () => {
    expect(conf.texte.split('\n')[0]).toBe('✓ ACCEPTÉE PAR CLAIRE TEST LE 17 OCTOBRE 2026 À 10 H 12');
    expect(conf.html.indexOf('Acceptée par Claire Test le 17 octobre 2026 à 10 h 12')).toBeLessThan(conf.html.indexOf(EN_TETE_SERVICE));
    for (const x of [EN_TETE_SERVICE, 'Invitation envoyée par Arnaud Jorel', 'DATE DE LA MISSION : MERCREDI 21 OCTOBRE 2026',
      'Visite d’entrée', 'Sonner deux fois.', '7 avenue de l’Union', '_TEST'.slice(0, 0) + 'M. Martin', '3 invités : Claire Test',
      'Claire Test : ✓ Acceptée', 'Emma Essai : ✗ Refusée', 'plan.pdf — jointe à ce mail']) {
      expect(conf.texte, x).toContain(x);
    }
    expect(conf.texte).toContain('Bonjour, Claire Test a accepté la mission suivante :');
    expect(conf.texte).not.toContain('Vous êtes');
    expect(conf.texte).not.toContain('(vous)');
    expect(conf.html).not.toContain('>Accepter</a>');
  });
  it('l’objet : « Tâche acceptée par <prénom nom> — <titre> — <date de la mission> »', async () => {
    const { objetConfirmation } = await import('./mailTache');
    expect(objetConfirmation({ par: 'Claire Test', titre: ' Visite ', jour: '2026-10-21', heure: '14:30' }))
      .toBe('Tâche acceptée par Claire Test — Visite — Mercredi 21 octobre 2026 · 14 h 30');
    expect(objetConfirmation({ par: 'Claire Test', titre: 'Visite', jour: '2026-10-21', heure: null }))
      .toBe('Tâche acceptée par Claire Test — Visite — Mercredi 21 octobre 2026 · journée');
  });
});

describe('🔴 LOT GESTION-DECALER-TACHE — « Tâche déplacée » et confirmation de refus', async () => {
  const { objetConfirmation } = await import('./mailTache');
  it('invité qui avait déjà la tâche : « Tâche déplacée », ancienne date BARRÉE → nouvelle en évidence, puis le même contenu', () => {
    const m = mailTache({ ...base, deplacement: { jour: '2026-10-21', heure: '14:30', dureeMinutes: 90 }, jour: '2026-10-23', heure: '09:00', dureeMinutes: 60 });
    expect(m.texte).toContain('TÂCHE DÉPLACÉE');
    expect(m.texte).toContain('ANCIENNE DATE (annulée) : Mercredi 21 octobre 2026 — 14 h 30 (1 h 30)');
    expect(m.texte).toContain('NOUVELLE DATE DE LA MISSION : VENDREDI 23 OCTOBRE 2026 — 9 h 00 (1 h)');
    expect(m.texte).toContain('la mission suivante a été déplacée');
    expect(m.html).toContain('<s>Mercredi 21 octobre 2026 — 14 h 30 (1 h 30)</s>');
    expect(m.html).toMatch(/font-size:26px[^>]*>Vendredi 23 octobre 2026</);
    expect(m.html).toContain('>Accepter</a>');
    for (const x of ['Invitation envoyée par Arnaud Jorel', 'Visite d’entrée', 'M. Martin', 'Vous êtes 3 invités', 'plan.pdf']) expect(m.texte).toContain(x);
  });
  it('invité nouveau (sans `deplacement`) : aucune mention de l’ancienne date ni du déplacement', () => {
    const m = mailTache(base);
    expect(m.texte + m.html).not.toMatch(/déplacée|DÉPLACÉE|ANCIENNE DATE|<s>/);
  });
  it('confirmation d’un REFUS : « Refusée par … le … », le motif ; objet « Tâche refusée par … »', () => {
    const m = mailTache({ ...base, sorte: 'confirmation', liens: undefined, acceptation: { par: 'Emma Essai', le: '2026-10-17T08:00:00Z' }, refus: { motif: 'Indisponible ce jour-là' } });
    expect(m.texte.split('\n').slice(0, 2)).toEqual(['✗ REFUSÉE PAR EMMA ESSAI LE 17 OCTOBRE 2026 À 10 H 00', 'Motif du refus : Indisponible ce jour-là']);
    expect(m.texte).toContain('Bonjour, Emma Essai a refusé la mission suivante :');
    expect(m.html).toContain('Motif du refus : Indisponible ce jour-là');
    expect(objetConfirmation({ par: 'Emma Essai', titre: 'Visite', jour: '2026-10-21', heure: null, refusee: true }))
      .toBe('Tâche refusée par Emma Essai — Visite — Mercredi 21 octobre 2026 · journée');
  });
});
