import { describe, it, expect } from 'vitest';
import { verdictAnnulation, RAISON_REFUS_ANNULATION } from './demande';
import { partitionnerAnnulationMasse } from './demandesListe';

/**
 * D1 — cœur PUR de l'annulation. Deux garde-fous NON NÉGOCIABLES verrouillés ici :
 *  · une 'prete' n'entre JAMAIS dans le lot de masse par défaut (Part 3) ;
 *  · une 'envoyee'/'close' n'est JAMAIS annulable, quel que soit le geste (Part 4).
 */
describe('D1 — verdictAnnulation', () => {
  it('brouillon → annulable (masse comme unité)', () => {
    expect(verdictAnnulation('brouillon', false)).toBe('annulable');
    expect(verdictAnnulation('brouillon', true)).toBe('annulable');
  });

  // 🔴 PART 3 — CASSE si une 'prete' devient annulable dans le geste de MASSE (autoriserPrete=false).
  it('prete → EXCLUE du geste de masse (autoriserPrete=false), annulable seulement par le geste dédié (true)', () => {
    expect(verdictAnnulation('prete', false)).toBe('prete_exclue');
    expect(verdictAnnulation('prete', false)).not.toBe('annulable');
    expect(verdictAnnulation('prete', true)).toBe('annulable');
  });

  // 🔴 PART 4 — CASSE si une 'envoyee'/'close' devient annulable, quel que soit le drapeau.
  it('envoyee / close → JAMAIS annulable, sous aucun drapeau', () => {
    for (const autoriserPrete of [false, true]) {
      expect(verdictAnnulation('envoyee', autoriserPrete)).toBe('envoyee_interdite');
      expect(verdictAnnulation('close', autoriserPrete)).toBe('envoyee_interdite');
      expect(verdictAnnulation('envoyee', autoriserPrete)).not.toBe('annulable');
      expect(verdictAnnulation('close', autoriserPrete)).not.toBe('annulable');
    }
  });

  it('annulee → deja_annulee ; null/undefined → introuvable ; statut inattendu → refus PRUDENT (jamais annulable)', () => {
    expect(verdictAnnulation('annulee', true)).toBe('deja_annulee');
    expect(verdictAnnulation(null, true)).toBe('introuvable');
    expect(verdictAnnulation(undefined, true)).toBe('introuvable');
    expect(verdictAnnulation('zombie', true)).toBe('envoyee_interdite'); // inconnu → refus, jamais annuler à l'aveugle
  });

  it('chaque verdict de refus a une raison lisible non vide (compte rendu) ; annulable = pas de raison', () => {
    expect(RAISON_REFUS_ANNULATION.annulable).toBe('');
    for (const v of ['prete_exclue', 'envoyee_interdite', 'deja_annulee', 'introuvable'] as const) {
      expect(RAISON_REFUS_ANNULATION[v].length).toBeGreaterThan(0);
    }
  });
});

describe('D1 — partitionnerAnnulationMasse (vue filtrée)', () => {
  const d = (id: number, statut: string) => ({ id, statut });

  // 🔴 PART 3 — CASSE si une 'prete' se retrouve dans les cibles du « Tout annuler ».
  it('les prêtes sont dans `pretes`, JAMAIS dans `brouillons`', () => {
    const { brouillons, pretes } = partitionnerAnnulationMasse([d(1, 'brouillon'), d(2, 'prete'), d(3, 'brouillon')]);
    expect(brouillons.map((x) => x.id)).toEqual([1, 3]);
    expect(pretes.map((x) => x.id)).toEqual([2]);
    expect(brouillons.some((x) => x.statut === 'prete')).toBe(false);
  });

  it('envoyee / close / annulee ne sont NI dans brouillons NI dans pretes (le geste de masse ne les touche jamais)', () => {
    const { brouillons, pretes } = partitionnerAnnulationMasse([d(1, 'envoyee'), d(2, 'close'), d(3, 'annulee'), d(4, 'brouillon')]);
    expect(brouillons.map((x) => x.id)).toEqual([4]);
    expect(pretes).toHaveLength(0);
  });
});
