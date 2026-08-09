import { describe, it, expect, beforeAll } from 'vitest';
import { signerJetonCada, SCOPE_CADA, cleSignature } from './jetonCada';
import { verifierJetonCada } from './jetonRectification';

/**
 * F1 — la SIGNATURE du jeton CADA a été extraite dans `jetonCada.ts` (sans `server-only`, pour le CLI de veille) tandis que
 * le VÉRIFICATEUR reste dans `jetonRectification.ts` (sous `server-only`). Ce test prouve que le déplacement n'a rien cassé :
 * un jeton signé par le NOUVEAU module reste accepté par le vérificateur (clé `cleSignature` partagée, scope inchangé).
 * (Rappel : vitest aliase `server-only` → empty.js ; ce test NE prouve PAS le correctif de chargement du CLI — ça, c'est le
 *  graphe esbuild. Il prouve l'INTEROPÉRABILITÉ fonctionnelle après déplacement.)
 */
beforeAll(() => {
  process.env.INTERNAUTE_TOKEN_SECRET = 'secret-de-test-au-moins-32-octets-abcdefgh';
});

describe('F1 — jetonCada : signature (sans server-only) interopérable avec le vérificateur (server-only)', () => {
  it('un jeton signé par jetonCada.signerJetonCada est accepté par jetonRectification.verifierJetonCada', async () => {
    const j = await signerJetonCada(4242);
    expect(await verifierJetonCada(j)).toEqual({ ok: true, demandeId: 4242 });
  });

  it('le contrat inchangé : scope « confirm-cada » et clé dérivée du secret dédié', () => {
    expect(SCOPE_CADA).toBe('confirm-cada');
    expect(cleSignature()).toEqual(new TextEncoder().encode(process.env.INTERNAUTE_TOKEN_SECRET as string));
  });
});
