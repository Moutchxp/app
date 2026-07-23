import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks des dépendances de la route : on teste le CONTRÔLE D'ACCÈS (rejeu du gate de la page) + le CÂBLAGE des générateurs,
// sans charger NI la base NI les moteurs de rendu (prouvés ailleurs).
const { verifierCertificat, verifierParReference } = vi.hoisted(() => ({ verifierCertificat: vi.fn(), verifierParReference: vi.fn() }));
const { genererBufferCertificat } = vi.hoisted(() => ({ genererBufferCertificat: vi.fn() }));
const { genererVisuelPng } = vi.hoisted(() => ({ genererVisuelPng: vi.fn() }));
const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../lib/db/certificatVerification', () => ({ verifierCertificat, verifierParReference }));
vi.mock('../../lib/pdf/publierCertificatPdf', () => ({ genererBufferCertificat }));
vi.mock('../../lib/visuel/genererVisuelPng', () => ({ genererVisuelPng }));
vi.mock('../../lib/db/client', () => ({ query }));

import { GET } from './route';

const PDF = Buffer.from('%PDF-anonyme');
const PNG = Buffer.from('\x89PNG-visuel');
const req = (qs: string) => new Request(`http://localhost/verifier/document?${qs}`);

const VISUEL = {
  statut: 'visuel_verifie' as const,
  visuel: {
    reference: 'SVAV-K7M2-9QX4', verdict: 'SANS_VIS_A_VIS', score: 82,
    descriptif: { ville: 'Asnières-sur-Seine', typeBien: 'Appartement', surfaceM2: 72.35, pieces: 3, anneeOuEpoque: '2008', etage: 5, dernierEtage: false, exterieur: 'Balcon' },
  },
};
const VERIFIE = {
  statut: 'verifie' as const,
  certificat: { numero: 'SAVV-2026-000007', emisLe: '2026-07-15T09:30:00.000Z', verdict: 'SANS_VIS_A_VIS', adresse: '12 rue X', etage: 3, score: 82, descriptif: VISUEL.visuel.descriptif },
};

const ORIG = { ...process.env };
beforeEach(() => {
  verifierCertificat.mockReset();
  verifierParReference.mockReset();
  genererBufferCertificat.mockReset();
  genererVisuelPng.mockReset();
  query.mockReset();
  process.env.SITE_URL = 'https://www.sansvisavis.com';
  genererBufferCertificat.mockResolvedValue(PDF);
  genererVisuelPng.mockResolvedValue(PNG);
  query.mockResolvedValue({ rows: [{ id: 77 }] });
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('GET /verifier/document — VOIE VISUEL (référence)', () => {
  it('référence valide d’un compte → 200 image/png, no-store ; visuel construit du set', async () => {
    verifierParReference.mockResolvedValue(VISUEL);
    const res = await GET(req('doc=visuel&ref=SVAV-K7M2-9QX4'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
    // Le certificat (PDF) n'est jamais sollicité sur la voie visuel.
    expect(genererBufferCertificat).not.toHaveBeenCalled();
    // La référence est bien transmise au générateur (jamais le numéro/jeton).
    const arg = genererVisuelPng.mock.calls[0]![0] as { reference: string; urlBase: string };
    expect(arg.reference).toBe('SVAV-K7M2-9QX4');
    expect(arg.urlBase).toBe('https://www.sansvisavis.com');
  });

  it('référence d’un ONE-SHOT (sans_compte) → 404, AUCUN octet, générateur non appelé', async () => {
    verifierParReference.mockResolvedValue({ statut: 'sans_compte' });
    const res = await GET(req('doc=visuel&ref=SVAV-K7M2-9QX4'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  it('référence invalide/inexistante → 404', async () => {
    verifierParReference.mockResolvedValue({ statut: 'reference_invalide' });
    expect((await GET(req('doc=visuel&ref=xxx'))).status).toBe(404);
    verifierParReference.mockResolvedValue({ statut: 'inexistant' });
    expect((await GET(req('doc=visuel&ref=SVAV-AAAA-BBBB'))).status).toBe(404);
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  it('SITE_URL absente → 503 (QR impossible), aucun octet', async () => {
    delete process.env.SITE_URL;
    verifierParReference.mockResolvedValue(VISUEL);
    const res = await GET(req('doc=visuel&ref=SVAV-K7M2-9QX4'));
    expect(res.status).toBe(503);
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });
});

describe('GET /verifier/document — VOIE CERTIFICAT (numéro + jeton) → ANONYMISÉ', () => {
  it('numéro + BON jeton → 200 application/pdf, no-store ; générateur appelé avec anonymise:true (JAMAIS le nominatif)', async () => {
    verifierCertificat.mockResolvedValue(VERIFIE);
    const res = await GET(req('n=SAVV-2026-000007&j=ABCDEFGHJKMNPQRS'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF);
    // Le rendu est TOUJOURS l'anonymisé — jamais le nominatif.
    expect(genererBufferCertificat).toHaveBeenCalledWith(77, { anonymise: true, typeDocument: 'anonyme' });
    // Le jeton a servi au gate mais n'est PAS passé au générateur (id résolu par numéro).
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FROM certificat WHERE numero/), ['SAVV-2026-000007']);
  });

  it('MAUVAIS jeton (statut existe) → 404, AUCUN octet, ni SELECT ni générateur', async () => {
    verifierCertificat.mockResolvedValue({ statut: 'existe' });
    const res = await GET(req('n=SAVV-2026-000007&j=ZZZZZZZZZZZZZZZZ'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(query).not.toHaveBeenCalled();
    expect(genererBufferCertificat).not.toHaveBeenCalled();
  });

  it('numéro invalide → 404 (aucun octet)', async () => {
    verifierCertificat.mockResolvedValue({ statut: 'numero_invalide' });
    expect((await GET(req('n=xxx'))).status).toBe(404);
    expect(genererBufferCertificat).not.toHaveBeenCalled();
  });

  it('générateur indisponible (null : SITE_URL/carte) → 503, aucun octet', async () => {
    verifierCertificat.mockResolvedValue(VERIFIE);
    genererBufferCertificat.mockResolvedValue(null);
    const res = await GET(req('n=SAVV-2026-000007&j=ABCDEFGHJKMNPQRS'));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
  });

  it('exception inattendue → 503 (aucune exception ne fuit)', async () => {
    verifierCertificat.mockRejectedValue(new Error('boom'));
    const res = await GET(req('n=SAVV-2026-000007&j=ABCDEFGHJKMNPQRS'));
    expect(res.status).toBe(503);
  });
});
