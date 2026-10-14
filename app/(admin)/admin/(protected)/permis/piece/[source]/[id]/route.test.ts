import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const garde = { admin: vi.fn(), module: vi.fn() };
vi.mock('../../../../../../../lib/admin/garde', () => ({
  exigerAdministrateur: (...a: unknown[]) => garde.admin(...a),
  exigerModule: (...a: unknown[]) => garde.module(...a),
}));
const repo = { lire: vi.fn() };
vi.mock('../../../../../../../lib/sitadel/demandeRepo', () => ({ lireCleTelechargeable: (...a: unknown[]) => repo.lire(...a) }));
const stockage = { recuperer: vi.fn(), urlSignee: vi.fn() };
vi.mock('../../../../../../../lib/stockage', () => ({
  recuperer: (...a: unknown[]) => stockage.recuperer(...a),
  urlSignee: (...a: unknown[]) => stockage.urlSignee(...a),
}));

import { GET } from './route';
import { proxy } from '../../../../../../../../proxy';
import { cheminPiecePermis, urlAbsoluePiecePermis } from '../../../../../../../lib/permis/piecePermisServie';

/**
 * ══ LOT PIECES-PERMIS-SERVIES-PAR-L-APPLICATION (Arno, 14/10/2026) ══════════════════════════════════════════════════════
 * Une pièce de permis s'ouvre par l'application, jamais par une URL de stockage : en production MinIO n'écoute que sur
 * 127.0.0.1. On éprouve le COMPORTEMENT : refus sans droit, 404 pièce absente, en-têtes `private, no-store`, nom de
 * téléchargement, bac à sable des pièces HTML, et le passage par la page de connexion quand on clique depuis un mail.
 * Base et stockage simulés : rien n'est lu ni écrit pour de vrai.
 */
const ctx = (source: string, id: string) => ({ params: Promise.resolve({ source, id }) });
const requete = (q = '') => new Request(`http://local/admin/permis/piece/dossier/7${q}`);
const PDF = { cle: 'dossiers/11430/uuid.pdf', nomFichier: 'PC5.5 Façade Sud.pdf', typeMime: 'application/pdf' };
const refus = () => ({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });

beforeEach(() => {
  garde.admin.mockReset(); garde.admin.mockResolvedValue({ auteurId: 1 });
  garde.module.mockReset(); garde.module.mockResolvedValue({ auteurId: 1 });
  repo.lire.mockReset(); repo.lire.mockResolvedValue(PDF);
  stockage.recuperer.mockReset(); stockage.recuperer.mockResolvedValue(Buffer.from('%PDF-1.7 octets'));
  stockage.urlSignee.mockReset();
});

describe('les octets sont servis PAR L’APPLICATION', () => {
  it('PDF inline : octets, type, nom d’origine, private no-store, nosniff ; aucune redirection, aucune URL signée', async () => {
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Location')).toBeNull();
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="PC5\.5 Facade Sud\.pdf"; filename\*=UTF-8''PC5\.5%20Fa%C3%A7ade%20Sud\.pdf$/);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBeNull(); // le visionneur PDF refuse le bac à sable
    expect(await res.text()).toBe('%PDF-1.7 octets');
    expect(repo.lire).toHaveBeenCalledWith(7, 'dossier');
    expect(stockage.recuperer).toHaveBeenCalledWith('dossiers/11430/uuid.pdf');
    expect(stockage.urlSignee).not.toHaveBeenCalled();
  });

  it('?telecharger=1 → attachment avec le nom d’origine ; un caractère hors ISO-8859-1 ne fait pas échouer la réponse', async () => {
    repo.lire.mockResolvedValueOnce({ ...PDF, nomFichier: 'Récépissé n°1 d’Arno.pdf' });
    const res = await GET(requete('?telecharger=1'), ctx('dossier', '7'));
    expect(res.status).toBe(200);
    const d = res.headers.get('Content-Disposition')!;
    expect(d.startsWith('attachment; filename="')).toBe(true);
    expect(d).toContain(`filename*=UTF-8''${encodeURIComponent('Récépissé n°1 d’Arno.pdf').replace(/'/g, '%27')}`);
  });

  it('anti-injection d’en-tête : guillemets, antislash et retours de ligne du nom sont neutralisés', async () => {
    repo.lire.mockResolvedValueOnce({ ...PDF, nomFichier: 'a"b\\c\r\nSet-Cookie: x.pdf' });
    const res = await GET(requete('?telecharger=1'), ctx('dossier', '7'));
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="a_b_c__Set-Cookie: x.pdf"');
  });

  it('pièce HTML affichée → rendue dans un bac à sable (aucun script sur l’origine de l’administration)', async () => {
    repo.lire.mockResolvedValueOnce({ ...PDF, nomFichier: 'accuse.html', typeMime: 'text/html' });
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.headers.get('Content-Type')).toBe('text/html');
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline;/);
    expect(res.headers.get('Content-Security-Policy')).toBe('sandbox');
  });

  it('archive → toujours en téléchargement (règle de la Gestion), même sans ?telecharger=1 ; type inconnu → octet-stream', async () => {
    repo.lire.mockResolvedValueOnce({ ...PDF, nomFichier: 'plans.zip', typeMime: 'application/zip' });
    expect((await GET(requete(), ctx('dossier', '7'))).headers.get('Content-Disposition')).toMatch(/^attachment;/);
    repo.lire.mockResolvedValueOnce({ ...PDF, nomFichier: 'x', typeMime: null });
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
  });
});

describe('refus et absences', () => {
  it('sans droit : refus de la garde, sans cache, et RIEN n’est lu', async () => {
    garde.module.mockResolvedValueOnce(refus());
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(repo.lire).not.toHaveBeenCalled();
    expect(stockage.recuperer).not.toHaveBeenCalled();
  });

  it('LE MÊME DROIT QU’AVANT : « dossier » → module permis (comme emprise) ; « reponse » → administrateur (comme reponses)', async () => {
    await GET(requete(), ctx('dossier', '7'));
    expect(garde.module).toHaveBeenCalledWith(expect.any(Request), 'permis');
    expect(garde.admin).not.toHaveBeenCalled();
    garde.module.mockClear();
    garde.admin.mockResolvedValueOnce(refus());
    const res = await GET(requete(), ctx('reponse', '7'));
    expect(res.status).toBe(403);
    expect(garde.admin).toHaveBeenCalledTimes(1);
    expect(garde.module).not.toHaveBeenCalled();
  });

  it('pièce absente ou jamais déposée → 404 sans cache ; source ou identifiant invalides → 404 sans lecture', async () => {
    repo.lire.mockResolvedValueOnce(null);
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    repo.lire.mockClear();
    for (const [s, i] of [['autre', '7'], ['dossier', 'abc'], ['dossier', '0'], ['dossier', '-3'], ['dossier', '1e3']]) {
      expect((await GET(requete(), ctx(s, i))).status).toBe(404);
    }
    expect(repo.lire).not.toHaveBeenCalled();
  });

  it('stockage muet → 503 sans cache (jamais un faux 404)', async () => {
    stockage.recuperer.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await GET(requete(), ctx('dossier', '7'));
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('le lien d’un mail : sans session, la page de connexion', () => {
  beforeEach(() => { process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789'; });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('le VRAI proxy redirige le chemin de la pièce vers /admin/login quand aucune session n’est présente', async () => {
    const res = await proxy(new NextRequest(new URL(`http://local${cheminPiecePermis('reponse', 42, { telecharger: true })}`)));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });

  it('URL absolue sur SVAV_URL_PUBLIQUE (barre finale retirée), repli http://localhost:3000 ; jamais l’endpoint S3', () => {
    const env = { SVAV_URL_PUBLIQUE: 'https://app.exemple.fr/', S3_ENDPOINT: 'http://127.0.0.1:9000' };
    expect(urlAbsoluePiecePermis('dossier', 55, {}, env)).toBe('https://app.exemple.fr/admin/permis/piece/dossier/55');
    expect(urlAbsoluePiecePermis('reponse', 9, { telecharger: true }, {})).toBe('http://localhost:3000/admin/permis/piece/reponse/9?telecharger=1');
    expect(urlAbsoluePiecePermis('dossier', 55, {}, env)).not.toContain('127.0.0.1:9000');
  });
});
