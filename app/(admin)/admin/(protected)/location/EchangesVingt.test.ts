import { describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (25/11/2026) — la conversation d'une ligne : les mails de ses fils, en UNE conversation, du plus ancien au plus récent. */
vi.mock('../gestion/Conversation', () => ({ MessageConversation: () => null, CSS_CONVERSATION: '' }));
vi.mock('../gestion/PiecesJointes', () => ({ CSS_PIECES: '' }));
vi.mock('../gestion/PiecesDeLaConversation', () => ({ CSS_PIECES_CONVERSATION: '' }));
const { fusionnerEchanges, libelleModeleVingt } = await import('./EchangesVingt');

const M = (messageId: number, recuLe: string) => ({ messageId, recuLe }) as never;
describe('fusionnerEchanges', () => {
  it('tous fils mêlés, du plus ancien au plus récent (à égalité : par numéro), chaque mail une fois, avec son fil', () => {
    const r = fusionnerEchanges([
      { filId: 55, messages: [M(903, '2026-11-25T08:00:00+01:00'), M(901, '2026-11-24T09:05:00+01:00')] },
      { filId: 56, messages: [M(905, '2026-11-24T18:30:00+01:00'), M(904, '2026-11-24T18:30:00+01:00'), M(901, '2026-11-24T09:05:00+01:00')] },
    ]);
    expect(r.map((x) => [x.m.messageId, x.filId])).toEqual([[901, 55], [904, 56], [905, 56], [903, 55]]);
    expect(fusionnerEchanges([])).toEqual([]);
  });
  it('le libellé d’un modèle, « Message libre » sinon', () => {
    expect(libelleModeleVingt('locataire')).toBe('Locataire — restitution du solde effectuée');
    expect(libelleModeleVingt(null)).toBe('Message libre');
  });
});
