import { describe, expect, it } from 'vitest';
import {
  heureFinProposee, mentionEdls, objetMailEdls, OBJET_TACHE_EDLS, pastilleEdls, plageFr, texteRecapEdls, verifierPlanification,
} from './edls';

/** L'EDLS planifié (Arno, 19/10/2026) — le module pur. */
const GROUPE = [{ recuLe: '2026-10-01', dateMax: '2026-11-01' }];
const SAISIE = { jour: '2026-11-03', debut: '10:00', fin: '11:30', confieA: 4, commentaire: '  clés chez le gardien ' };

describe('la saisie de planification', () => {
  it('fin proposée = début + 1 h (bornée à 23:59)', () => {
    expect(heureFinProposee('10:00')).toBe('11:00');
    expect(heureFinProposee('23:30')).toBe('23:59');
    expect(heureFinProposee('')).toBe('');
  });

  it('valide : la durée vient de la plage, le commentaire est nettoyé', () => {
    expect(verifierPlanification(SAISIE, GROUPE)).toEqual({ ok: true, jour: '2026-11-03', heure: '10:00', dureeMinutes: 90, commentaire: 'clés chez le gardien' });
  });

  it.each([
    ['date manquante', { jour: '' }, 'jour'],
    ['date avant la réception du recommandé', { jour: '2026-09-30' }, 'jour'],
    ['date plus de 6 mois après la fin du préavis', { jour: '2027-05-02' }, 'jour'],
    ['début manquant', { debut: '' }, 'debut'],
    ['fin manquante', { fin: '' }, 'fin'],
    ['fin = début', { fin: '10:00' }, 'fin'],
    ['fin avant le début', { fin: '09:59' }, 'fin'],
    ['personne', { confieA: null }, 'confieA'],
    ['commentaire trop long', { commentaire: 'x'.repeat(1001) }, 'commentaire'],
  ])('refus : %s', (_cas, ecart, champ) => {
    expect(verifierPlanification({ ...SAISIE, ...ecart }, GROUPE)).toMatchObject({ ok: false, champ });
  });

  it('« fin > début » le dit en toutes lettres', () => {
    expect(verifierPlanification({ ...SAISIE, fin: '09:00' }, GROUPE)).toMatchObject({ motif: 'L’heure de fin doit être après l’heure de début.' });
  });
});

describe('la mention de la ligne, toujours en toutes lettres', () => {
  const e = { jour: '2026-11-03', heure: '10:00', confieA: 'Claire Test', reponduPar: null };
  it('en attente / accepté / sans acceptation installée', () => {
    expect(mentionEdls({ ...e, statut: 'en_attente' })).toBe('EDLS le 03/11/2026 à 10h00 — confié à Claire Test — en attente de confirmation');
    expect(mentionEdls({ ...e, statut: 'acceptee' })).toBe('EDLS le 03/11/2026 à 10h00 — confié à Claire Test — accepté');
    expect(mentionEdls({ ...e, statut: null })).toBe('EDLS le 03/11/2026 à 10h00 — confié à Claire Test');
    expect(pastilleEdls({ statut: 'en_attente' })).toBe('EDLS planifié');
  });
  it('refusé : « Refusée par X — à réattribuer »', () => {
    expect(mentionEdls({ ...e, statut: 'refusee', reponduPar: 'Claire Test' })).toBe('Refusée par Claire Test — à réattribuer');
    expect(pastilleEdls({ statut: 'refusee' })).toBe('EDLS à réattribuer');
  });
});

describe('le récapitulatif de la mission (les « Précisions » du mail)', () => {
  const complet = texteRecapEdls({
    adresse: '4 rue Fictive, 92800 Puteaux',
    acces: [{ libelle: 'Bâtiment', valeur: 'B' }, { libelle: 'Étage', valeur: '3e' }, { libelle: 'Porte', valeur: 'G' },
      { libelle: 'Accès', valeur: 'Code au portail' }, { libelle: 'Digicode', valeur: '4521A' }, { libelle: 'Ascenseur', valeur: 'oui' }],
    lots: ['Appartement T3 · 3e · porte G', 'Parking · place 12'],
    proprietaires: [{ nom: 'DUPONT Jean', telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] }],
    locataires: [{ nom: 'BERNARD Alice', telephones: ['06 55 66 77 88'], emails: ['alice@exemple.test'] }],
    preavis: { recuLe: '2026-10-01', dateMax: '2026-11-01' }, commentaire: 'clés chez le gardien',
  });
  it('mission, adresse, accès, nombre et liste des lots, propriétaire, locataire sortant, dates du préavis, commentaire', () => {
    for (const x of ['Mission : état des lieux de sortie.', 'Adresse : 4 rue Fictive, 92800 Puteaux', '· Bâtiment : B', '· Étage : 3e', '· Porte : G',
      '· Accès : Code au portail', '· Digicode : 4521A', '· Ascenseur : oui', 'Lots concernés (2) :', '· Parking · place 12',
      'Propriétaire :', 'DUPONT Jean — tél. 06 11 22 33 44 — jean@exemple.test', 'Locataire sortant :',
      'BERNARD Alice — tél. 06 55 66 77 88 — alice@exemple.test',
      'Préavis : recommandé reçu le 01/10/2026 — fin du préavis le 01/11/2026', 'Commentaire : clés chez le gardien']) {
      expect(complet).toContain(x);
    }
  });
  it('n’écrit que ce qui existe', () => {
    const t = texteRecapEdls({ adresse: null, acces: [], lots: ['Studio'], proprietaires: [], locataires: [], preavis: { recuLe: '2026-10-01', dateMax: '2026-11-01' }, commentaire: null });
    expect(t).not.toMatch(/Adresse|Accès|Propriétaire|Locataire|Commentaire/);
    expect(t).toContain('Lots concernés (1) :');
  });
});

describe('l’objet des mails d’une tâche d’EDLS', () => {
  const base = { objetTache: OBJET_TACHE_EDLS, adresseCourte: '4 rue Fictive', jour: '2026-11-03', heure: '10:00', dureeMinutes: 90 };
  it('invitation, et après un déplacement', () => {
    expect(plageFr('2026-11-03', '10:00', 90)).toBe('03/11/2026 10h00-11h30');
    expect(objetMailEdls({ ...base, sorte: 'invitation' })).toBe('EDL de sortie — 4 rue Fictive — 03/11/2026 10h00-11h30');
    expect(objetMailEdls({ ...base, sorte: 'invitation', deplace: true })).toBe('Rendez-vous déplacé — EDL de sortie — 4 rue Fictive — 03/11/2026 10h00-11h30');
  });
  it('confirmation à l’expéditeur : accepté / refusé par X', () => {
    expect(objetMailEdls({ ...base, sorte: 'confirmation', par: 'Claire Test' })).toBe('EDLS du 03/11 accepté par Claire Test');
    expect(objetMailEdls({ ...base, sorte: 'confirmation', par: 'Claire Test', refusee: true })).toBe('EDLS du 03/11 refusé par Claire Test');
  });
  it('une autre tâche garde son objet ordinaire', () => {
    expect(objetMailEdls({ ...base, objetTache: 'Visite', sorte: 'invitation' })).toBeNull();
    expect(objetMailEdls({ ...base, sorte: 'recapitulatif' })).toBeNull();
  });
});
