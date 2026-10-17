import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
const { lirePiece, signerPiece } = await import('./mailTacheRepo');

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — LE LIEN SIGNÉ D'UNE PIÈCE ═════════════════════════════════════════
 * Propre à UNE demande et UNE pièce, avec une date de fin ; une signature fausse, une date dépassée ou une clé absente
 * ne donnent RIEN. (La revérification en base — demande remplacée, invité retiré, pièce retirée — est éprouvée sur la
 * base d'essai, `invitesTache.itest.ts`.)
 */
const env = { GESTION_JETON_CLE: 'cd'.repeat(32) };
const fin = new Date('2026-10-24T10:00:00Z');
const avant = new Date('2026-10-20T10:00:00Z');

describe('le lien signé', () => {
  it('se relit tel quel avant sa fin', () => {
    const j = signerPiece(41, 7, fin, env)!;
    expect(j).toMatch(/^41\.7\.\d+\.[A-Za-z0-9_-]{43}$/);
    expect(lirePiece(j, avant, env)).toEqual({ demandeId: 41, pieceId: 7, expire: fin });
  });
  it('refusé : après sa fin, une autre pièce, une signature touchée, une autre clé, pas de clé', () => {
    const j = signerPiece(41, 7, fin, env)!;
    expect(lirePiece(j, new Date('2026-10-24T10:00:01Z'), env)).toBeNull();
    expect(lirePiece(j.replace(/^41\.7\./, '41.8.'), avant, env)).toBeNull();
    expect(lirePiece(`${j.slice(0, -1)}${j.endsWith('A') ? 'B' : 'A'}`, avant, env)).toBeNull();
    expect(lirePiece(j, avant, { GESTION_JETON_CLE: 'ef'.repeat(32) })).toBeNull();
    expect(signerPiece(41, 7, fin, {})).toBeNull();
    expect(lirePiece(j, avant, {})).toBeNull();
  });
});
