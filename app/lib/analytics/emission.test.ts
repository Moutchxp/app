import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `after` de next/server piloté par test (défère / exécute / échoue selon le scénario).
const afterMock = vi.fn();
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));

// `incrementerCompteur` mocké (le writer a ses propres tests). Ne throw jamais.
const incrementerMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./writer', () => ({ incrementerCompteur: (...a: unknown[]) => incrementerMock(...a) }));

import { emettreApresReponse } from './emission';

beforeEach(() => {
  afterMock.mockReset();
  incrementerMock.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('emettreApresReponse — non bloquant, différé après réponse', () => {
  it("diffère via after() : le payload n'est construit QUE dans le callback (jamais avant)", async () => {
    let cb: (() => unknown) | null = null;
    afterMock.mockImplementation((c: () => unknown) => {
      cb = c;
    }); // capture sans exécuter
    const construire = vi.fn(() => ({ nom: 'resultat' as const }));

    emettreApresReponse(construire);
    // after a capturé le callback, mais RIEN n'est encore construit ni écrit (post-réponse).
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(construire).not.toHaveBeenCalled();
    expect(incrementerMock).not.toHaveBeenCalled();

    // Simule l'exécution post-réponse par le runtime.
    await cb!();
    expect(construire).toHaveBeenCalledTimes(1);
    expect(incrementerMock).toHaveBeenCalledWith({ nom: 'resultat' });
  });
});

describe("emettreApresReponse — NE THROW JAMAIS vers l'appelant", () => {
  it('un throw SYNCHRONE dans construire() (dans le callback) est avalé, aucune écriture', async () => {
    afterMock.mockImplementation(async (c: () => unknown) => c());
    const construire = () => {
      throw new Error('payload cassé');
    };
    expect(() => emettreApresReponse(construire)).not.toThrow();
    await Promise.resolve();
    expect(incrementerMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("si after() lui-même throw (hors contexte de requête), c'est avalé", () => {
    afterMock.mockImplementation(() => {
      throw new Error('after hors requête');
    });
    expect(() => emettreApresReponse(() => ({ nom: 'resultat' }))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it('construire() renvoyant null → aucune écriture, aucune erreur', async () => {
    afterMock.mockImplementation(async (c: () => unknown) => c());
    emettreApresReponse(() => null);
    await Promise.resolve();
    expect(incrementerMock).not.toHaveBeenCalled();
  });
});

describe("emettreApresReponse — une réponse de route aboutit même si l'analytics casse", () => {
  it('un « handler » simulé renvoie sa réponse malgré un payload qui throw', () => {
    afterMock.mockImplementation(async (c: () => unknown) => c()); // exécute (throw sync avalé dedans)
    function handlerSimule(): string {
      emettreApresReponse(() => {
        throw new Error('boom analytics');
      });
      return 'REPONSE_CERTIFICATION';
    }
    expect(handlerSimule()).toBe('REPONSE_CERTIFICATION'); // la certification aboutit, jamais bloquée
  });
});
