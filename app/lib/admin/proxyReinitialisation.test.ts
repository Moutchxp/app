import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 🔴 Arno (24/10/2026, 416) — « mot de passe oublié » : les deux pages et les deux routes sont ouvertes SANS session (la personne
// ne peut plus se connecter). Rien d'autre : une page voisine reste redirigée vers la connexion ; un POST d'une autre origine est refusé.
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => ({ ...(await vi.importActual<typeof import('./etatSession')>('./etatSession')), lireEtatCompte }));
import { proxy } from '../../../proxy';

const req = (chemin: string, method = 'GET', origin = 'http://local') =>
  new NextRequest(new URL(`http://local${chemin}`), { method, headers: method === 'POST' ? { origin } : {} });

describe('proxy — mot de passe oublié de l’administration', () => {
  it('les pages et les routes : laissées passer sans session', async () => {
    process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
    for (const r of [req('/admin/mot-de-passe-oublie'), req('/admin/reinitialiser?j=J'), req('/api/admin/reinitialiser?j=J'),
      req('/api/admin/reinitialiser', 'POST'), req('/api/admin/reinitialiser/demander', 'POST')]) {
      const res = await proxy(r);
      expect(res.headers.get('location'), r.url).toBeNull();
      expect(res.status, r.url).not.toBe(401);
    }
    expect(lireEtatCompte).not.toHaveBeenCalled();
  });
  it('une page voisine reste protégée ; une autre origine est refusée', async () => {
    expect((await proxy(req('/admin/reinitialiser-autre'))).headers.get('location')).toMatch(/\/admin\/login$/);
    expect((await proxy(req('/api/admin/reinitialiser/demander', 'POST', 'https://ailleurs.example'))).status).toBe(403);
  });
});
