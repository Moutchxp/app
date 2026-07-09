import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../../proxy';
import { signerJeton, permsToutes, permsAucune, NOM_COOKIE, type SessionAdmin } from './session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

async function requete(pathname: string, session: SessionAdmin | null): Promise<NextRequest> {
  const headers = new Headers();
  if (session) {
    const jeton = await signerJeton(session);
    headers.set('cookie', `${NOM_COOKIE}=${jeton}`);
  }
  return new NextRequest(new URL(`http://local${pathname}`), { headers });
}

const collab = (perms = permsAucune()): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms });
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'arno', role: 'administrateur', perms: permsToutes() });

describe('proxy — garde de permissions (e)', () => {
  it('collaborateur sans perm_curation sur /admin/curation → redirigé vers /admin', async () => {
    const res = await proxy(await requete('/admin/curation', collab()));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('collaborateur sans perm_curation sur /api/admin/curation → 403', async () => {
    const res = await proxy(await requete('/api/admin/curation', collab()));
    expect(res.status).toBe(403);
  });

  it('collaborateur AVEC perm_curation sur /admin/curation → laissé passer', async () => {
    const res = await proxy(await requete('/admin/curation', collab({ ...permsAucune(), curation: true })));
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(403);
  });

  it('administrateur → toutes les pages de modules laissées passer', async () => {
    for (const p of ['/admin/curation', '/admin/pilotage', '/admin/banc-test', '/api/admin/config']) {
      const res = await proxy(await requete(p, admin()));
      expect(res.status).not.toBe(307);
      expect(res.status).not.toBe(403);
    }
  });

  it('page sans permission requise (/admin accueil) → laissée passer pour un collaborateur', async () => {
    const res = await proxy(await requete('/admin', collab()));
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(403);
  });

  it('/api/admin/ping (aucune permission requise) → laissé passer', async () => {
    const res = await proxy(await requete('/api/admin/ping', collab()));
    expect(res.status).not.toBe(403);
  });

  it('non authentifié sur une page → redirigé vers /admin/login', async () => {
    const res = await proxy(await requete('/admin/curation', null));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });

  it('non authentifié sur une API → 401', async () => {
    const res = await proxy(await requete('/api/admin/curation', null));
    expect(res.status).toBe(401);
  });
});
