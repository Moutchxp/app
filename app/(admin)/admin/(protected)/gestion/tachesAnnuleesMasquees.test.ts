import { afterEach, describe, expect, it, vi } from 'vitest';
import { lireTaches } from './tachesClient';
import { TITRE_TERMINEES } from '../../../../lib/gestion/taches';
import { STATUTS_PLEINE_PAGE } from '../../../../lib/gestion/tachesPleinePage';

/** 🔴🔴 Arno (19/11/2026, choix A) — une tâche annulée n'apparaît plus dans AUCUNE liste (écran partagé, fiche du bien, récapitulatifs, compteurs, recherche). */
afterEach(() => { vi.unstubAllGlobals(); });
describe('🔴 aucune tâche annulée à l’écran', () => {
  it('la liste lue (tous les écrans de tâches passent par elle) ne garde jamais une tâche annulée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ etat: 'ok', moi: 2, tronque: false,
      taches: [{ id: 1, etat: 'a_faire' }, { id: 2, etat: 'annulee' }, { id: 3, etat: 'faite' }] })));
    const l = await lireTaches(12);
    expect(l.etat === 'ok' ? l.taches.map((t) => t.id) : null).toEqual([1, 3]);
  });
  it('plus de trace : le repli dit « Faites », le filtre « Annulée » n’est plus proposé', () => {
    expect(TITRE_TERMINEES).toBe('Faites — 7 derniers jours');
    expect(STATUTS_PLEINE_PAGE).not.toContain('annulee');
  });
});
