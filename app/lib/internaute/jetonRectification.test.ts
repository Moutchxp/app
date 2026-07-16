import { describe, it, expect, beforeAll } from 'vitest';
import {
  signerJetonRectification,
  verifierJetonRectification,
  signerJetonEmission,
  verifierJetonEmission,
} from './jetonRectification';

beforeAll(() => {
  process.env.INTERNAUTE_TOKEN_SECRET = 'secret-de-test-au-moins-32-octets-abcdefgh';
});

describe('jetons — allers-retours', () => {
  it('rectification : sub = internauteId', async () => {
    const j = await signerJetonRectification('internaute-uuid-123');
    expect(await verifierJetonRectification(j)).toBe('internaute-uuid-123');
  });

  it('émission : sub = projetId (nombre)', async () => {
    const j = await signerJetonEmission(42);
    expect(await verifierJetonEmission(j)).toBe(42);
  });

  it('émission : jeton illisible → null', async () => {
    expect(await verifierJetonEmission('pas-un-jwt')).toBeNull();
  });
});

// ⚠️ LE CŒUR DU CORRECTIF : la séparation stricte des capacités par le SCOPE (vérifié, pas seulement lu).
describe('SÉPARATION STRICTE des scopes — une capacité ne passe JAMAIS par la mauvaise porte', () => {
  it('un jeton de RECTIFICATION présenté à verifierJetonEmission → REJET (null)', async () => {
    const rectif = await signerJetonRectification('internaute-uuid-123');
    expect(await verifierJetonEmission(rectif)).toBeNull();
  });

  it('un jeton d’ÉMISSION présenté à verifierJetonRectification → REJET (null)', async () => {
    const emission = await signerJetonEmission(42);
    expect(await verifierJetonRectification(emission)).toBeNull();
  });
});
