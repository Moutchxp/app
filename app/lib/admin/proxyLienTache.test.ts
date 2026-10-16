import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Lot GESTION-ACCEPTATION (16/10/2026) : les liens des mails déjà envoyés (`/admin/taches?j=…`) ouvraient la page de
// connexion et perdaient le jeton. Ils sont désormais envoyés sur la page PUBLIQUE de réponse, sans connexion.
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => {
  const vrai = await vi.importActual<typeof import('./etatSession')>('./etatSession');
  return { ...vrai, lireEtatCompte };
});

import { proxy } from '../../../proxy';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
  lireEtatCompte.mockReset();
});

const req = (chemin: string) => new NextRequest(new URL(`http://local${chemin}`));

describe('proxy — ancien lien de réponse à une tâche', () => {
  it('sans session : redirigé vers /tache/reponse avec le jeton et la décision — jamais vers la connexion', async () => {
    const res = await proxy(req('/admin/taches?j=JETON-abc_123&d=accepter'));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.pathname).toBe('/tache/reponse');
    expect(loc.searchParams.get('j')).toBe('JETON-abc_123');
    expect(loc.searchParams.get('d')).toBe('accepter');
    expect(lireEtatCompte).not.toHaveBeenCalled(); // aucun contrôle de session
  });

  it('« Refuser » garde sa décision', async () => {
    const res = await proxy(req('/admin/taches?j=J&d=refuser'));
    expect(new URL(res.headers.get('location') ?? '').searchParams.get('d')).toBe('refuser');
  });

  it('« Mes tâches » SANS jeton reste la page protégée d’avant (connexion exigée)', async () => {
    const res = await proxy(req('/admin/taches'));
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });
});
