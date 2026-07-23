import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * GET .../certificats/[id]/telecharger — TÉLÉCHARGEMENT des TROIS documents (nominatif | anonyme | visuel).
 *
 * PREUVE CENTRALE (anti-IDOR) : `resoudrePdfCertificat` est LE gate de propriété UNIQUE, appelé EN PREMIER pour les
 * trois valeurs de `doc` ; un certificat d'autrui → 404 UNIFORME et AUCUN octet, quelle que soit la valeur de `doc`,
 * et AUCUN générateur n'est invoqué. Le nominatif (défaut) reste STRICTEMENT le comportement historique (302 vers une
 * URL signée courte). On mocke la garde, la résolution de propriété, le helper visuel, le signeur d'URL et les deux
 * générateurs (purs). Aucun accès réseau/base réel.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
const { resoudrePdfCertificat, resoudreVisuelCertificat } = vi.hoisted(() => ({
  resoudrePdfCertificat: vi.fn(),
  resoudreVisuelCertificat: vi.fn(),
}));
const { urlSignee } = vi.hoisted(() => ({ urlSignee: vi.fn() }));
const { genererBufferCertificat } = vi.hoisted(() => ({ genererBufferCertificat: vi.fn() }));
const { genererVisuelPng } = vi.hoisted(() => ({ genererVisuelPng: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../../../../lib/internaute/espace', () => ({ resoudrePdfCertificat, resoudreVisuelCertificat }));
vi.mock('../../../../../../lib/stockage', () => ({ urlSignee }));
vi.mock('../../../../../../lib/pdf/publierCertificatPdf', () => ({ genererBufferCertificat }));
vi.mock('../../../../../../lib/visuel/genererVisuelPng', () => ({ genererVisuelPng }));

import { GET } from './route';

const req = (doc?: string) =>
  new Request(`http://localhost/api/internaute/espace/certificats/5/telecharger${doc === undefined ? '' : `?doc=${doc}`}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Descriptif minimal réutilisé pour le helper visuel. */
const visuel = {
  reference: 'REF9ABC',
  verdict: 'SANS_VIS_A_VIS',
  score: 88,
  descriptif: {
    ville: 'Asnières', typeBien: 'Appartement', surfaceM2: 72, pieces: 3,
    anneeOuEpoque: '1930', etage: 2, dernierEtage: false, exterieur: 'Balcon',
  },
};

describe('GET .../certificats/[id]/telecharger — trois documents', () => {
  beforeEach(() => {
    exigerInternaute.mockReset();
    resoudrePdfCertificat.mockReset();
    resoudreVisuelCertificat.mockReset();
    urlSignee.mockReset();
    genererBufferCertificat.mockReset();
    genererVisuelPng.mockReset();
    process.env.SITE_URL = 'https://sansvisavis.example';
  });
  afterEach(() => {
    delete process.env.SITE_URL;
  });

  it('non authentifié → 401, aucune résolution ni génération', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(401);
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
    expect(genererBufferCertificat).not.toHaveBeenCalled();
    expect(resoudreVisuelCertificat).not.toHaveBeenCalled();
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  // ── (2) LE TEST QUI COMPTE LE PLUS : NON-propriétaire → 404 sans octet sur les 3 valeurs ──
  it.each(['nominatif', 'anonyme', 'visuel'])(
    "(b) certificat d'un AUTRE internaute + doc=%s → 404, aucun octet, aucun générateur",
    async (doc) => {
      exigerInternaute.mockResolvedValue({ internauteId: 'A' });
      resoudrePdfCertificat.mockResolvedValue({ statut: 'introuvable' }); // pas à A → gate unique
      const res = await GET(req(doc), ctx('5'));
      expect(res.status).toBe(404);
      expect(resoudrePdfCertificat).toHaveBeenCalledWith('A', 5); // propriété vérifiée pour l'id de SESSION
      // « aucun octet » = aucun document servi : le corps est un JSON générique, jamais un PDF/PNG.
      expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
      expect(res.headers.get('Content-Type')).not.toBe('image/png');
      expect(genererBufferCertificat).not.toHaveBeenCalled();
      expect(resoudreVisuelCertificat).not.toHaveBeenCalled();
      expect(genererVisuelPng).not.toHaveBeenCalled();
      expect(urlSignee).not.toHaveBeenCalled();
    },
  );

  it('sans doc = non-propriétaire → 404 (même gate que doc=nominatif explicite)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'introuvable' });
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(404);
    expect(urlSignee).not.toHaveBeenCalled();
  });

  // ── (1) propriétaire : 3 valeurs → 3 documents distincts, bons Content-Type ──
  it('propriétaire + sans doc → 302 URL signée courte (nominatif, comportement historique)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'internautes/A/certificats/x.pdf' });
    urlSignee.mockResolvedValue('https://minio.local/signed?x=1');
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://minio.local/signed?x=1');
    expect(urlSignee).toHaveBeenCalledWith('internautes/A/certificats/x.pdf', 120);
    expect(genererBufferCertificat).not.toHaveBeenCalled();
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  it('propriétaire + doc=nominatif explicite → 302 (identique au défaut)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    urlSignee.mockResolvedValue('https://minio.local/signed?x=2');
    const res = await GET(req('nominatif'), ctx('5'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://minio.local/signed?x=2');
  });

  it('propriétaire + doc=anonyme → 200 octets application/pdf, nom de fichier = NUMÉRO imprimé', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf', numero: 'SAVV-2026-000016' });
    genererBufferCertificat.mockResolvedValue(Buffer.from('%PDF-anonyme'));
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toContain('inline');
    expect(res.headers.get('Content-Disposition')).toContain('Certificat-anonymise-SAVV-2026-000016.pdf'); // numéro, pas l'id interne
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(Buffer.from('%PDF-anonyme')));
    expect(genererBufferCertificat).toHaveBeenCalledWith(5, { anonymise: true, typeDocument: 'anonyme' });
    expect(urlSignee).not.toHaveBeenCalled();
  });

  it('propriétaire + doc=visuel → 200 octets image/png (helper re-scopé par internaute)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    resoudreVisuelCertificat.mockResolvedValue(visuel);
    genererVisuelPng.mockResolvedValue(Buffer.from('\x89PNG-visuel'));
    const res = await GET(req('visuel'), ctx('5'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toContain('Visuel-annonce-REF9ABC.png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(Buffer.from('\x89PNG-visuel')));
    expect(resoudreVisuelCertificat).toHaveBeenCalledWith('A', 5); // SECONDE barrière scopée par l'id de SESSION
    expect(genererVisuelPng).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'REF9ABC', urlBase: 'https://sansvisavis.example', descriptif: visuel.descriptif }),
    );
  });

  // ── (3) doc inconnu → 400, aucun octet, aucune génération ──
  it('doc inconnu → 400, aucune génération', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    const res = await GET(req('espion'), ctx('5'));
    expect(res.status).toBe(400);
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
    expect(genererBufferCertificat).not.toHaveBeenCalled();
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  // ── (5) générateur indisponible → 503 ──
  it('doc=anonyme + générateur renvoie null → 503', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    genererBufferCertificat.mockResolvedValue(null);
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(503);
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBeGreaterThan(0); // corps JSON générique, pas les octets d'un PDF
  });

  it('doc=anonyme + générateur lève → 503', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    genererBufferCertificat.mockRejectedValue(new Error('carte indisponible'));
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(503);
  });

  it('doc=visuel + générateur lève → 503', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    resoudreVisuelCertificat.mockResolvedValue(visuel);
    genererVisuelPng.mockRejectedValue(new Error('rendu png indisponible'));
    const res = await GET(req('visuel'), ctx('5'));
    expect(res.status).toBe(503);
  });

  it('doc=visuel + SITE_URL absente → 503 avant toute lecture visuel', async () => {
    delete process.env.SITE_URL;
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    const res = await GET(req('visuel'), ctx('5'));
    expect(res.status).toBe(503);
    expect(resoudreVisuelCertificat).not.toHaveBeenCalled();
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  // ── (4) pdf_absent : anonyme/visuel régénèrent quand même, seul le nominatif reste 409 ──
  it('pdf_absent + doc=nominatif → 409', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent' });
    const res = await GET(req('nominatif'), ctx('5'));
    expect(res.status).toBe(409);
    expect(urlSignee).not.toHaveBeenCalled();
  });

  it('pdf_absent + doc=anonyme → 200 avec octets + numéro dans le nom (indépendant du PDF stocké)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent', numero: 'SAVV-2026-000016' });
    genererBufferCertificat.mockResolvedValue(Buffer.from('%PDF-anonyme'));
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('Certificat-anonymise-SAVV-2026-000016.pdf'); // numéro présent même sans PDF stocké
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('pdf_absent + doc=visuel → 200 avec octets', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent' });
    resoudreVisuelCertificat.mockResolvedValue(visuel);
    genererVisuelPng.mockResolvedValue(Buffer.from('\x89PNG'));
    const res = await GET(req('visuel'), ctx('5'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  // ── Incohérence : gate passé mais lecture visuel vide → 404 (filet de la 2ᵉ barrière) ──
  it('gate ok mais helper visuel renvoie 0 ligne → 404, aucun rendu', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf' });
    resoudreVisuelCertificat.mockResolvedValue(null); // incohérence : ne doit jamais survenir
    const res = await GET(req('visuel'), ctx('5'));
    expect(res.status).toBe(404);
    expect(genererVisuelPng).not.toHaveBeenCalled();
  });

  it('id non numérique → 404, aucune résolution', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    const res = await GET(req('anonyme'), ctx('abc'));
    expect(res.status).toBe(404);
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });

  it('résolution du gate lève → 503', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockRejectedValue(new Error('db down'));
    const res = await GET(req('anonyme'), ctx('5'));
    expect(res.status).toBe(503);
  });
});
