import { describe, it, expect, vi } from 'vitest';

// `authCredential` est server-only + pool `pg`. On neutralise `server-only` et on MOCKE `query` ; argon2 est RÉEL
// (roundtrip hache→vérifie prouvé), sans base.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { politiqueMotDePasse, poserMotDePasse, verifier } from './authCredential';

describe('authCredential — politique + hachage argon2id (roundtrip réel)', () => {
  it('politique : < 12 caractères refusé, ≥ 12 accepté, non-string refusé', () => {
    expect(politiqueMotDePasse('court').ok).toBe(false);
    expect(politiqueMotDePasse('douzecaract1').ok).toBe(true); // 12
    expect(politiqueMotDePasse(12345678901234).ok).toBe(false);
  });

  it('poserMotDePasse : hache en argon2id (jamais le clair) et le hash RE-VÉRIFIE ; un mauvais mot de passe échoue', async () => {
    let hashPose = '';
    query.mockImplementation(async (_sql: string, params?: unknown[]) => {
      hashPose = String(params?.[1]);
      return { rows: [] };
    });
    await poserMotDePasse('11111111-1111-1111-1111-111111111111', 'motdepasselong12');
    expect(hashPose.startsWith('$argon2id$')).toBe(true); // argon2id encodé
    expect(hashPose).not.toContain('motdepasselong12'); // jamais le clair
    expect(await verifier('motdepasselong12', hashPose)).toBe(true); // roundtrip OK
    expect(await verifier('mauvais mot de passe', hashPose)).toBe(false); // mauvais → false
  });

  it('poserMotDePasse : refuse un mot de passe non conforme (garde de défense serveur)', async () => {
    await expect(poserMotDePasse('uuid', 'court')).rejects.toThrow();
  });
});
