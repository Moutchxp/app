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

const collab = (perms = permsAucune(), doitChanger = false): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms, doitChanger });
const admin = (doitChanger = false): SessionAdmin => ({ sub: 1, identifiant: 'arno', role: 'administrateur', perms: permsToutes(), doitChanger });
/** Voie de secours : sub=null. doitChanger passé en entrée pour PROUVER qu'il est forcé à false par signerJeton. */
const secours = (doitChanger = false): SessionAdmin => ({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger });

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

describe('proxy — enforcement première connexion (M3-4 Lot B)', () => {
  const collabCuration = () => collab({ ...permsAucune(), curation: true }, true); // contraint + a la perm curation

  it('doitChanger=true sur une PAGE admin → 302 vers /admin/compte/mot-de-passe', async () => {
    const res = await proxy(await requete('/admin/curation', admin(true)));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/\/admin\/compte\/mot-de-passe$/);
  });

  it('doitChanger=true sur une API admin → 403 CHANGEMENT_REQUIS', async () => {
    const res = await proxy(await requete('/api/admin/config', admin(true)));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'CHANGEMENT_REQUIS' });
  });

  it('CONTOURNEMENT bloqué : doitChanger=true sur une route d’ÉCRITURE (curation) → 403 CHANGEMENT_REQUIS', async () => {
    const res = await proxy(await requete('/api/admin/curation/entites/5', collabCuration()));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'CHANGEMENT_REQUIS' });
  });

  it('la PAGE de changement est atteignable malgré doitChanger', async () => {
    const res = await proxy(await requete('/admin/compte/mot-de-passe', collabCuration()));
    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(403);
  });

  it('la ROUTE de changement (singulier) est atteignable malgré doitChanger (non-collision de namespace)', async () => {
    const res = await proxy(await requete('/api/admin/compte/mot-de-passe', collabCuration()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(302);
  });

  it('la déconnexion reste possible malgré doitChanger', async () => {
    const res = await proxy(await requete('/api/admin/session', collabCuration()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(302);
  });

  it('VOIE DE SECOURS (sub=null) : JAMAIS redirigée, même si doitChanger est passé à true', async () => {
    const res = await proxy(await requete('/admin/pilotage', secours(true))); // signerJeton force doitChanger=false
    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(403);
  });

  it('jeton LEGACY (sans doitChanger) : session non cassée, pas de redirection', async () => {
    const { SignJWT } = await import('jose');
    const legacy = await new SignJWT({ sub: '1', role: 'administrateur' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h')
      .sign(new TextEncoder().encode(SECRET));
    const req = new NextRequest(new URL('http://local/admin/curation'), {
      headers: new Headers({ cookie: `${NOM_COOKIE}=${legacy}` }),
    });
    const res = await proxy(req);
    expect(res.status).not.toBe(302);
  });
});
