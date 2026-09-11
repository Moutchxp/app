import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fragmentCorpsActif, colonneCorpsActifDisponible, _resetCacheCorpsActif } from './corpsActif';

/**
 * BAT-3 — le prédicat « carte active » partagé par tous les lecteurs. On éprouve : fragment ` AND alias.actif` quand 219 est appliquée ;
 * CHAÎNE VIDE quand elle ne l'est pas (aucun filtre = comportement d'avant, aucun crash 42703) ; repli sûr sur erreur ; mémoïsation.
 */
type Q = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const qPresente: Q = async () => ({ rows: [{ ok: 1 }] });
const qAbsente: Q = async () => ({ rows: [] });

beforeEach(() => { _resetCacheCorpsActif(); });

describe('BAT-3 — fragmentCorpsActif', () => {
  it('colonne PRÉSENTE (219 appliquée) → « AND <alias>.actif » (alias ou non, connecteur AND/WHERE)', async () => {
    expect(await fragmentCorpsActif('cb', 'AND', qPresente as never)).toBe(' AND cb.actif');
    _resetCacheCorpsActif();
    expect(await fragmentCorpsActif('', 'AND', qPresente as never)).toBe(' AND actif');
    _resetCacheCorpsActif();
    expect(await fragmentCorpsActif('', 'WHERE', qPresente as never)).toBe(' WHERE actif');
  });
  it('colonne ABSENTE (219 non appliquée) → chaîne VIDE (aucun filtre, aucun crash)', async () => {
    expect(await fragmentCorpsActif('cb', 'AND', qAbsente as never)).toBe('');
  });
  it('erreur de sonde → chaîne vide (repli sûr = comportement d’avant)', async () => {
    const qErr: Q = async () => { throw new Error('indisponible'); };
    expect(await fragmentCorpsActif('cb', 'AND', qErr as never)).toBe('');
  });
  it('MÉMOÏSÉ : une seule sonde information_schema par process (jusqu’au reset)', async () => {
    const spy = vi.fn(async () => ({ rows: [{ ok: 1 }] }));
    expect(await colonneCorpsActifDisponible(spy as never)).toBe(true);
    await colonneCorpsActifDisponible(spy as never);
    await fragmentCorpsActif('cb', 'AND', spy as never);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
