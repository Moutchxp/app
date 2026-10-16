import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// LOT GESTION-INVITATION-ADMIN — la page et la route d'activation sont ouvertes SANS session (la personne n'a pas encore
// de mot de passe). Rien d'autre n'est ouvert : une page voisine reste redirigée vers la connexion.
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => ({ ...(await vi.importActual<typeof import('./etatSession')>('./etatSession')), lireEtatCompte }));
import { proxy } from '../../../proxy';

const req = (chemin: string, method = 'GET') => new NextRequest(new URL(`http://local${chemin}`), { method, headers: method === 'POST' ? { origin: 'http://local' } : {} });

describe('proxy — activation par le lien d’invitation', () => {
  it('/admin/activation et GET /api/admin/activation : laissés passer sans session', async () => {
    process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
    for (const r of [req('/admin/activation?j=J'), req('/api/admin/activation?j=J')]) {
      const res = await proxy(r);
      expect(res.headers.get('location')).toBeNull();
      expect(res.status).not.toBe(401);
    }
    expect(lireEtatCompte).not.toHaveBeenCalled();
  });
  it('une page voisine reste protégée', async () => {
    const res = await proxy(req('/admin/activation-autre'));
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });
});
