import { describe, expect, it } from 'vitest';
import {
  aujourdhuiParis, gestesPour, LIBELLE_STATUT, mandatPropose, motifTransition, phraseTransition, proprietaireEnGestion, refusTransition,
  statutDeduit, TEINTE_STATUT, verifierDateEffet, type StatutBien,
} from './statutBien';

/** 🔴 Arno (21/10/2026, 403) — le statut d'un bien : trois statuts, des transitions permises et aucune autre. */
describe('🔴 statut du bien — les transitions permises', () => {
  it('chaque statut offre ses gestes : location seule → passer en gestion ; en gestion → sortie (2 destinations) ; ancienne → reprendre / remettre', () => {
    expect(gestesPour('location_seule').map((g) => [g.libelle, g.vers])).toEqual([['Passer en gestion', ['en_gestion']]]);
    expect(gestesPour('en_gestion').map((g) => [g.libelle, g.vers])).toEqual([['Sortie de gestion', ['ancienne_gestion', 'location_seule']]]);
    expect(gestesPour('ancienne_gestion').map((g) => [g.libelle, g.vers])).toEqual([
      ['Reprendre en gestion', ['en_gestion']], ['Remettre en location seule', ['location_seule']]]);
  });

  it('dans les DEUX sens : toutes les paires permises passent, les autres sont refusées avec un motif', () => {
    const S: StatutBien[] = ['en_gestion', 'ancienne_gestion', 'location_seule'];
    const permis = S.flatMap((a) => S.filter((b) => refusTransition(a, b) === null).map((b) => `${a}>${b}`));
    expect(permis.sort()).toEqual(['ancienne_gestion>en_gestion', 'ancienne_gestion>location_seule', 'en_gestion>ancienne_gestion',
      'en_gestion>location_seule', 'location_seule>en_gestion'].sort());
    expect(refusTransition('location_seule', 'ancienne_gestion')).toBe('Transition impossible : « Location seule » → « Ancienne gestion ».');
    expect(refusTransition('en_gestion', 'en_gestion')).toBe('Le bien est déjà « En gestion ».');
    expect(refusTransition('en_gestion', undefined)).toBe('Choisissez la destination du bien.');
    expect(refusTransition('en_gestion', 'vendu')).toBe('Choisissez la destination du bien.');
  });

  it('le mandat PROPOSÉ : de gestion pour passer en gestion depuis la location seule, de transaction pour la sortie vers la location seule', () => {
    expect(mandatPropose('location_seule', 'en_gestion')).toBe('gestion');
    expect(mandatPropose('en_gestion', 'location_seule')).toBe('transaction');
    expect(mandatPropose('en_gestion', 'ancienne_gestion')).toBeNull();
    expect(mandatPropose('ancienne_gestion', 'en_gestion')).toBeNull();
  });

  it('les libellés et les teintes : vert en gestion, bleu location seule, gris ancienne gestion', () => {
    expect(LIBELLE_STATUT).toEqual({ en_gestion: 'En gestion', ancienne_gestion: 'Ancienne gestion', location_seule: 'Location seule' });
    expect(TEINTE_STATUT).toEqual({ en_gestion: 'vert', location_seule: 'bleu', ancienne_gestion: 'gris' });
  });
});

describe('🔴 statut du bien — date d’effet, motif, reprise', () => {
  const midi = new Date('2026-10-21T10:00:00Z');
  it('la date d’effet : obligatoire, vraie date, jamais dans le futur (Paris)', () => {
    expect(verifierDateEffet('2026-10-21', midi)).toEqual({ ok: true, date: '2026-10-21' });
    expect(verifierDateEffet('2026-01-31', midi)).toEqual({ ok: true, date: '2026-01-31' });
    expect(verifierDateEffet('', midi)).toEqual({ ok: false, motif: 'La date d’effet est à renseigner.' });
    expect(verifierDateEffet('21/10/2026', midi)).toEqual({ ok: false, motif: 'La date d’effet est à saisir au format JJ/MM/AAAA.' });
    expect(verifierDateEffet('2026-02-30', midi)).toEqual({ ok: false, motif: 'La date d’effet n’existe pas.' });
    expect(verifierDateEffet('2026-10-22', midi)).toEqual({ ok: false, motif: 'La date d’effet ne peut pas être dans le futur : le statut change aujourd’hui.' });
    // 23 h 30 à Paris le 21 = 21 h 30 UTC : on est encore le 21.
    expect(aujourdhuiParis(new Date('2026-10-21T21:30:00Z'))).toBe('2026-10-21');
    expect(aujourdhuiParis(new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
  });

  it('le motif est facultatif, nettoyé, borné', () => {
    expect(motifTransition('  ')).toBeNull();
    expect(motifTransition(' vente ')).toBe('vente');
    expect(motifTransition('x'.repeat(900))?.length).toBe(500);
  });

  it('la règle de REPRISE : « Bien en gestion ? = Non » → location seule ; fin ou sortie → ancienne ; sinon en gestion', () => {
    expect(statutDeduit(false, null, null)).toBe('location_seule');
    expect(statutDeduit(false, '2026-01-01', null)).toBe('location_seule');
    expect(statutDeduit(true, '2026-01-01', null)).toBe('ancienne_gestion');
    expect(statutDeduit(true, null, '2026-10-01T10:00:00Z')).toBe('ancienne_gestion');
    expect(statutDeduit(null, null, null)).toBe('en_gestion');
    expect(statutDeduit(true, null, null)).toBe('en_gestion');
  });

  it('le propriétaire est « en gestion » s’il a au moins un bien en gestion', () => {
    expect(proprietaireEnGestion(['location_seule', 'ancienne_gestion'])).toBe(false);
    expect(proprietaireEnGestion(['location_seule', 'en_gestion'])).toBe(true);
    expect(proprietaireEnGestion([])).toBe(false);
  });

  it('la phrase du journal', () => {
    expect(phraseTransition('en_gestion', 'location_seule', '2026-10-20', 'mandat résilié'))
      .toBe('Sortie de gestion : En gestion → Location seule, au 20/10/2026 — mandat résilié');
    expect(phraseTransition('ancienne_gestion', 'en_gestion', '2026-10-21', null)).toBe('Reprendre en gestion : Ancienne gestion → En gestion, au 21/10/2026');
  });
});
