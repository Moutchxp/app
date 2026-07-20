import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GET .../certificats/[id]/telecharger (Commit C) — PROUVE (b) : le re-téléchargement REFUSE un certificat qui
 * n'appartient pas à l'internaute connecté. La propriété est vérifiée AVANT toute signature (l'id agi vient de la
 * SESSION) ; un certificat d'autrui → 404 et aucune URL signée n'est produite. Le propriétaire avec PDF → 302 vers une
 * URL signée COURTE. On mocke la garde, la résolution de propriété et le signeur d'URL.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
const { resoudrePdfCertificat } = vi.hoisted(() => ({ resoudrePdfCertificat: vi.fn() }));
const { urlSignee } = vi.hoisted(() => ({ urlSignee: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../../../../lib/internaute/espace', () => ({ resoudrePdfCertificat }));
vi.mock('../../../../../../lib/stockage', () => ({ urlSignee }));

import { GET } from './route';

const req = () => new Request('http://localhost/api/internaute/espace/certificats/5/telecharger');
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET .../certificats/[id]/telecharger — propriété (anti-IDOR)', () => {
  beforeEach(() => {
    exigerInternaute.mockReset();
    resoudrePdfCertificat.mockReset();
    urlSignee.mockReset();
  });

  it('non authentifié → 401, aucune résolution ni signature', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(401);
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
    expect(urlSignee).not.toHaveBeenCalled();
  });

  it('(b) certificat d’un AUTRE internaute → 404, AUCUNE URL signée', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'introuvable' }); // pas à A
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(404);
    expect(resoudrePdfCertificat).toHaveBeenCalledWith('A', 5); // propriété vérifiée pour l'id de SESSION
    expect(urlSignee).not.toHaveBeenCalled();
  });

  it('propriétaire + PDF → 302 vers une URL signée courte (120 s)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'internautes/A/certificats/x.pdf' });
    urlSignee.mockResolvedValue('https://minio.local/signed?x=1');
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://minio.local/signed?x=1');
    expect(urlSignee).toHaveBeenCalledWith('internautes/A/certificats/x.pdf', 120);
  });

  it('propriétaire mais PDF non généré → 409', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent' });
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(409);
    expect(urlSignee).not.toHaveBeenCalled();
  });

  it('id non numérique → 404, pas de résolution', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    const res = await GET(req(), ctx('abc'));
    expect(res.status).toBe(404);
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });
});
