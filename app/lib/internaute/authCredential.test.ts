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

import { resoudreHashParId } from './authCredential';
describe('resoudreHashParId — lecture du hash par id de SESSION', () => {
  it('SELECT mot_de_passe WHERE internaute_id = $1 → renvoie le hash', async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ mot_de_passe: '$argon2id$reel' }] });
    const h = await resoudreHashParId('uuid-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT mot_de_passe FROM internaute_auth WHERE internaute_id = \$1/);
    expect(params).toEqual(['uuid-1']);
    expect(h).toBe('$argon2id$reel');
  });
  it('aucune ligne (pas de credential) → null', async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    expect(await resoudreHashParId('uuid-1')).toBeNull();
  });
});
