import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route. On teste l'ORCHESTRATION (ownership par jeton d'émission, statuts → HTTP)
// sans charger NI la base NI le pipeline.
const { verifierJetonEmission } = vi.hoisted(() => ({ verifierJetonEmission: vi.fn() }));
const { emettreCertificat } = vi.hoisted(() => ({ emettreCertificat: vi.fn() }));

vi.mock('../../lib/internaute/jetonRectification', () => ({ verifierJetonEmission }));
vi.mock('../../lib/db/certificatEmission', () => ({ emettreCertificat }));

// T5-bis — envoi du mail et `after()` mockés : on prouve que l'envoi est DIFFÉRÉ, pas attendu par la réponse.
const { publierEnvoiCertificat } = vi.hoisted(() => ({ publierEnvoiCertificat: vi.fn() }));
vi.mock('../../lib/email/publierEnvoiCertificat', () => ({ publierEnvoiCertificat }));
// `after()` : on CAPTURE le callback SANS l'exécuter — c'est exactement ce qu'on veut observer.
const differes: (() => unknown)[] = [];
vi.mock('next/server', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, after: (fn: () => unknown) => { differes.push(fn); } };
});

import { POST } from './route';

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  verifierJetonEmission.mockReset();
  emettreCertificat.mockReset();
  publierEnvoiCertificat.mockReset();
  publierEnvoiCertificat.mockResolvedValue(undefined);
  differes.length = 0;
});

describe('POST /api/certificat — jeton d’émission & entrée', () => {
  it('jeton invalide/expiré/mauvais scope → 401, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(null); // scope rectify-contact ou jeton pourri → null
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(401);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('jeton absent → 401', async () => {
    const res = await POST(req({ projetId: 42 }));
    expect(res.status).toBe(401);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('projetId invalide → 422, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    const res = await POST(req({ jeton: 'jwt', projetId: 'abc' }));
    expect(res.status).toBe(422);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('corps JSON illisible → 422', async () => {
    const res = await POST({ json: async () => { throw new Error('bad'); } } as unknown as Request);
    expect(res.status).toBe(422);
  });

  it('projetId en CHAÎNE numérique (bigserial) → accepté, coercé, émis', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000001', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-A-B' });
    const res = await POST(req({ jeton: 'jwt', projetId: '42' }));
    expect(res.status).toBe(200);
    expect(emettreCertificat).toHaveBeenCalledWith(42); // signature (projetId), plus d'internauteId
  });
});

describe('POST /api/certificat — OWNERSHIP (sub === projetId) & mapping des statuts', () => {
  it('OWNERSHIP : le sub du jeton (projet 99) ≠ projetId demandé (42) → 403, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(99); // jeton pour un AUTRE projet
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(403);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('sub === projetId → émission autorisée avec CE projet', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000002', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-A-B' });
    await POST(req({ jeton: 'jwt', projetId: 42, internauteId: 'INJECTE-IGNORE' }));
    expect(emettreCertificat).toHaveBeenCalledWith(42); // le corps ne peut rien injecter : ownership vient du jeton
  });

  it('projet absent → 403', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'projet_absent' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(403);
  });

  it('refus mode inconnu → 422 (raison mode_inconnu)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_mode_inconnu' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'mode_inconnu' });
  });

  it('refus verdict indéterminé → 422 (raison indetermine)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_indetermine' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'indetermine' });
  });

  it('refus VIS_A_VIS (hors périmètre) → 422 (raison vis_a_vis)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_vis_a_vis' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'vis_a_vis' });
  });

  it('émission nominale → 200, numéro + référence + deja:false', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', reference: 'SVAV-K7M2-9QX4', verdict: 'SANS_VIS_A_VIS', deja: false });
  });

  it('IDEMPOTENCE : certificat déjà émis → 200, MÊME numéro + référence, deja:true', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'existant', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', reference: 'SVAV-K7M2-9QX4', deja: true });
  });
});

/**
 * T5-bis — l'envoi du mail ne doit plus être DANS la réponse. Mesuré avant le lot sur 8 émissions réelles :
 * l'écart `genere_le` → `envoye_le` valait 2,83 à 3,74 s, pendant lesquelles l'internaute attendait alors que
 * son certificat et ses documents étaient déjà faits.
 */
describe('POST /api/certificat — envoi du mail APRÈS la réponse', () => {
  const emis = { statut: 'emis', numero: 'SAVV-2026-000099', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-AAAA-BBBB' };

  it('LE TEST DU LOT — la réponse n’attend PAS l’envoi : 200 rendu, mail pas encore parti', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, envoiADeclencher: 7 });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    // Au moment où la réponse est rendue, l'envoi est SEULEMENT programmé.
    expect(publierEnvoiCertificat).not.toHaveBeenCalled();
    expect(differes).toHaveLength(1);
  });

  it('…et l’envoi est bien DÉCLENCHÉ ensuite, sur le bon certificat', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, envoiADeclencher: 7 });
    await POST(req({ jeton: 'jwt', projetId: 42 }));
    await differes[0](); // ce que Next exécutera après la réponse
    expect(publierEnvoiCertificat).toHaveBeenCalledWith(7);
  });

  it('un échec d’envoi ne casse rien et n’est pas avalé sans trace', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, envoiADeclencher: 7 });
    publierEnvoiCertificat.mockImplementationOnce(async () => { throw new Error('SMTP down'); });
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200); // la réponse était déjà partie
    await expect(differes[0]()).resolves.not.toThrow();
    expect(erreur).toHaveBeenCalled(); // tracé, jamais silencieux
    // Aucune donnée de destinataire dans la trace : le NOM de l'erreur seulement.
    expect(JSON.stringify(erreur.mock.calls[0])).not.toMatch(/@|SMTP down/);
    erreur.mockRestore();
  });

  it('le corps de la réponse ne porte JAMAIS le champ interne `envoiADeclencher`', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, envoiADeclencher: 7 });
    const json = await (await POST(req({ jeton: 'jwt', projetId: 42 }))).json();
    expect(json).toEqual({ ok: true, numero: emis.numero, reference: emis.reference, verdict: emis.verdict, deja: false });
    expect(Object.keys(json)).not.toContain('envoiADeclencher');
  });

  it('CHEMIN IDEMPOTENT — certificat déjà émis ET mail déjà parti → 200 `deja:true`, AUCUN envoi', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, statut: 'existant' }); // pas d'`envoiADeclencher`
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect((await res.json()).deja).toBe(true);
    expect(differes).toHaveLength(0);
    expect(publierEnvoiCertificat).not.toHaveBeenCalled();
  });

  it('CHEMIN IDEMPOTENT — certificat déjà émis mais mail JAMAIS parti → rattrapage, différé lui aussi', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ ...emis, statut: 'existant', envoiADeclencher: 7 });
    await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(publierEnvoiCertificat).not.toHaveBeenCalled(); // pas pendant la réponse
    await differes[0]();
    expect(publierEnvoiCertificat).toHaveBeenCalledWith(7);
  });

  it.each(['refus_indetermine', 'refus_vis_a_vis', 'refus_mode_inconnu', 'projet_absent'])(
    'un refus (%s) ne programme AUCUN envoi',
    async (statut) => {
      verifierJetonEmission.mockResolvedValue(42);
      emettreCertificat.mockResolvedValue({ statut });
      await POST(req({ jeton: 'jwt', projetId: 42 }));
      expect(differes).toHaveLength(0);
      expect(publierEnvoiCertificat).not.toHaveBeenCalled();
    },
  );
});
