import { describe, expect, it } from 'vitest';
import { bulleTacheFrise, dateMissionTache, tacheGrisee, type TacheFrise } from './tacheFrise';
import { insererTachesDansLaLigne, type ElementFrise } from './frise';

/**
 * ══ 🔴 LOT GESTION-TACHES-EVENEMENTS — LE POINT D'UNE TÂCHE DANS LA FRISE (Arno, 17/10/2026) ══════════════════════
 * À la date de la mission, entre les carrés qui l'encadrent, sans déplacer ni modifier les étapes ; gris si annulée ou
 * refusée par tous ; une bulle avec le récapitulatif, 1 élément = 1 ligne.
 */
const tache = (p: Partial<TacheFrise>): TacheFrise => ({
  id: 1, objet: 'Visite', jour: '2026-10-21', heure: '14:30', dureeMinutes: null, etat: 'a_faire', expediteur: 'Arnaud Jorel',
  adresse: '7 avenue de l’Union, Asnières', invites: [{ libelle: 'Claire', statut: 'acceptee' }, { libelle: 'Emma', statut: 'en_attente' }],
  contacts: [{ nom: 'M. Martin', role: 'Locataire en place', coordonnees: ['06 00 00 00 01', 'martin@example.invalid'] }],
  pieces: ['plan.pdf'], ...p,
});
const carre = (cle: string, jour: string): ElementFrise => ({ cle, sorte: 'carre', case: { cle, type: 'ouverture', mot: cle, etape: null, sorte: 'reelle', survenuLe: `${jour} 10:00:00` } as never });
const LIGNE: ElementFrise[] = [
  carre('c1', '2026-10-01'), { cle: 'plus-entre-c1', sorte: 'plus-entre' },
  { cle: 'pts-avant-c2', sorte: 'points' }, carre('c2', '2026-10-15'), { cle: 'plus-entre-c2', sorte: 'plus-entre' },
  carre('c3', '2026-10-30'), { cle: 'plus-entre-fin', sorte: 'plus-entre' }, { cle: 'plus', sorte: 'plus' },
];

describe('la place du point : entre les carrés qui encadrent la mission, rien ne bouge', () => {
  it('après le dernier carré daté au plus tard le jour de la mission, avant son « + »', () => {
    const l = insererTachesDansLaLigne(LIGNE, [tache({ jour: '2026-10-21' })]);
    expect(l.map((e) => e.cle)).toEqual(['c1', 'plus-entre-c1', 'pts-avant-c2', 'c2', 'taches-1', 'plus-entre-c2', 'c3', 'plus-entre-fin', 'plus']);
    // Les éléments d'origine sont les MÊMES objets, dans le même ordre.
    expect(l.filter((e) => e.sorte !== 'taches')).toEqual(LIGNE);
  });
  it('avant tout : juste après l’Ouverture (rien avant elle, Arno 27/10/2026), devant le premier carré s’il n’y a pas d’Ouverture ; après tout : après le dernier carré ; le même jour qu’un carré : après lui', () => {
    const avantTout = insererTachesDansLaLigne(LIGNE, [tache({ jour: '2026-09-01' })]).map((e) => e.cle);
    expect(avantTout.slice(0, 2)).toEqual(['c1', 'taches-1']);
    const sansOuverture = LIGNE.map((e) => (e.case === undefined ? e : { ...e, case: { ...e.case, type: 'devis_recu' as const } }));
    expect(insererTachesDansLaLigne(sansOuverture, [tache({ jour: '2026-09-01' })])[0].cle).toBe('taches-1');
    const fin = insererTachesDansLaLigne(LIGNE, [tache({ jour: '2026-12-01' })]).map((e) => e.cle);
    expect(fin.indexOf('taches-1')).toBe(fin.indexOf('c3') + 1);
    const meme = insererTachesDansLaLigne(LIGNE, [tache({ jour: '2026-10-15' })]).map((e) => e.cle);
    expect(meme.indexOf('taches-1')).toBe(meme.indexOf('c2') + 1);
  });
  it('deux tâches au même endroit partagent un élément ; aucune tâche : la ligne inchangée', () => {
    const l = insererTachesDansLaLigne(LIGNE, [tache({ id: 2, jour: '2026-10-20' }), tache({ id: 1, jour: '2026-10-18' })]);
    expect(l.find((e) => e.sorte === 'taches')?.taches?.map((t) => t.id)).toEqual([1, 2]);
    expect(insererTachesDansLaLigne(LIGNE, [])).toEqual(LIGNE);
  });
});

describe('gris (historique) : annulée, ou refusée par TOUS', () => {
  it('rouge tant qu’un invité n’a pas refusé ; gris sinon', () => {
    expect(tacheGrisee(tache({}))).toBe(false);
    expect(tacheGrisee(tache({ etat: 'annulee' }))).toBe(true);
    expect(tacheGrisee(tache({ invites: [{ libelle: 'A', statut: 'refusee' }, { libelle: 'B', statut: 'refusee' }] }))).toBe(true);
    expect(tacheGrisee(tache({ invites: [{ libelle: 'A', statut: 'refusee' }, { libelle: 'B', statut: 'en_attente' }] }))).toBe(false);
    expect(tacheGrisee(tache({ etat: 'faite' }))).toBe(false);
  });
});

describe('la bulle : le récapitulatif, 1 élément = 1 ligne', () => {
  it('titre, date de la mission, envoyé par, invités et état, adresse, contacts, pièces', () => {
    const b = bulleTacheFrise(tache({ dureeMinutes: 90 }));
    expect(b.titre).toBe('Visite');
    expect(b.parties.map((p) => p.titre)).toEqual(['Date de la mission', 'Envoyé par', 'Invités (2)', 'Adresse du bien', 'Contacts (1)', 'Pièces jointes (1)']);
    expect(b.parties[0].lignes[0].texte).toBe('Mercredi 21 octobre 2026 · 14 h 30 (1 h 30)');
    expect(b.parties[2].lignes).toEqual([{ texte: 'Claire', discret: '✓ Acceptée' }, { texte: 'Emma', discret: '⏳ En attente' }]);
    expect(b.parties[4].lignes[0]).toEqual({ texte: 'M. Martin', discret: 'Locataire en place · 06 00 00 00 01 · martin@example.invalid' });
    expect(bulleTacheFrise(tache({ etat: 'annulee' })).etat).toBe('Tâche annulée');
  });
  it('les dates, sans fuseau : jour de la semaine juste', () => {
    expect(dateMissionTache('2024-02-29', null, null)).toBe('Jeudi 29 février 2024 · journée');
    expect(dateMissionTache('2026-11-01', '09:05', 30)).toBe('Dimanche 1er novembre 2026 · 9 h 05 (30 min)');
  });
});

describe('🔴 LOT GESTION-HISTORIQUE-TACHES — « validée » : au moins un invité a accepté', async () => {
  const { tacheValidee, historiqueDesTaches, invitesAcceptants } = await import('./tacheFrise');
  it('acceptée (ou confiée à soi, sans demande) : oui ; en attente, refusée par tous, annulée : non ; faite : oui', () => {
    expect(tacheValidee(tache({ invites: [{ libelle: 'A', statut: 'en_attente' }, { libelle: 'B', statut: 'acceptee' }] }))).toBe(true);
    expect(tacheValidee(tache({ invites: [{ libelle: 'A', statut: null }] }))).toBe(true);
    expect(tacheValidee(tache({ invites: [{ libelle: 'A', statut: 'en_attente' }] }))).toBe(false);
    expect(tacheValidee(tache({ invites: [{ libelle: 'A', statut: 'refusee' }, { libelle: 'B', statut: 'refusee' }] }))).toBe(false);
    expect(tacheValidee(tache({ etat: 'annulee' }))).toBe(false);
    expect(tacheValidee(tache({ etat: 'faite' }))).toBe(true);
  });
  it('l’historique : seulement les validées, de la mission la plus récente à la plus ancienne ; les acceptants', () => {
    const l = historiqueDesTaches([
      tache({ id: 1, jour: '2026-09-01' }), tache({ id: 2, jour: '2026-11-03', heure: '09:00' }),
      tache({ id: 3, jour: '2026-11-03', heure: '15:00' }), tache({ id: 4, jour: '2026-12-01', etat: 'annulee' }),
      tache({ id: 5, jour: '2026-12-02', invites: [{ libelle: 'X', statut: 'en_attente' }] }),
    ]);
    expect(l.map((t) => t.id)).toEqual([3, 2, 1]);
    expect(invitesAcceptants(tache({}))).toEqual(['Claire']);
  });
});
