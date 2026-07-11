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

  it('/admin (accueil) : collaborateur laissé passer via l’allow-list AUTHENTIFIÉ-SEUL (ex-fail-open)', async () => {
    // Durcissement : avant, ce chemin passait par le fail-open (chemin non listé → autorisé). Désormais il est
    // autorisé EXPLICITEMENT (CHEMINS_AUTHENTIFIE_SEUL) ; un chemin non listé, lui, serait refusé (cf. bloc dédié).
    const res = await proxy(await requete('/admin', collab()));
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(403);
  });

  it('/api/admin/ping : collaborateur laissé passer via l’allow-list AUTHENTIFIÉ-SEUL (ex-fail-open)', async () => {
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

describe('proxy — tuile Administratif, rôle EN DUR (M3-4 Lot C)', () => {
  it('collaborateur sur /admin/comptes (page) → redirigé vers /admin', async () => {
    const res = await proxy(await requete('/admin/comptes', collab(permsToutes()))); // même toutes perms : rôle décide
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('collaborateur sur /api/admin/comptes (API) → 403', async () => {
    const res = await proxy(await requete('/api/admin/comptes', collab(permsToutes())));
    expect(res.status).toBe(403);
  });

  it('collaborateur sur une sous-route /api/admin/comptes/5/actif → 403', async () => {
    const res = await proxy(await requete('/api/admin/comptes/5/actif', collab(permsToutes())));
    expect(res.status).toBe(403);
  });

  it('administrateur → /admin/comptes et /api/admin/comptes laissés passer', async () => {
    for (const p of ['/admin/comptes', '/api/admin/comptes']) {
      const res = await proxy(await requete(p, admin()));
      expect(res.status).not.toBe(307);
      expect(res.status).not.toBe(403);
    }
  });

  it('VOIE DE SECOURS (sub=null, administrateur) → tuile Administratif accessible', async () => {
    const res = await proxy(await requete('/api/admin/comptes', secours()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
  });

  it('NON-COLLISION : /admin/compte/mot-de-passe (singulier) N’EST PAS capté par la garde /comptes', async () => {
    // Un collaborateur atteint sa route self-service singulière, jamais bloqué par la garde du pluriel /comptes.
    const res = await proxy(await requete('/api/admin/compte/mot-de-passe', collab()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
  });
});

describe('proxy — défaut FAIL-CLOSED (durcissement : chemin non déclaré → refusé)', () => {
  it('route API INCONNUE (non déclarée) + collaborateur (même toutes perms) → 403 (foot-gun fermé)', async () => {
    // Cœur du durcissement : une route jamais déclarée dans PERMISSIONS n'est plus accessible à un collaborateur
    // du seul fait d'être authentifié. Avant (fail-open) : elle passait.
    const res = await proxy(await requete('/api/admin/route-fantome-non-declaree', collab(permsToutes())));
    expect(res.status).toBe(403);
  });

  it('page INCONNUE (non déclarée) + collaborateur → redirection /admin', async () => {
    const res = await proxy(await requete('/admin/page-fantome-non-declaree', collab(permsToutes())));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('route/page inconnue + ADMINISTRATEUR → laissé passer (accès total inchangé)', async () => {
    for (const p of ['/api/admin/route-fantome', '/admin/page-fantome']) {
      const res = await proxy(await requete(p, admin()));
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(307);
    }
  });

  it('VOIE DE SECOURS (sub=null, administrateur) sur route inconnue → laissé passer', async () => {
    const res = await proxy(await requete('/api/admin/route-fantome', secours()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
  });

  it('route inconnue + NON authentifié → 401 (l’auth prime sur le défaut fail-closed)', async () => {
    const res = await proxy(await requete('/api/admin/route-fantome', null));
    expect(res.status).toBe(401);
  });
});

describe('proxy — routes de module nouvellement déclarées (statistiques, geo, audit)', () => {
  const avecStats = () => collab({ ...permsAucune(), statistiques: true });

  it('/api/admin/statistiques : collaborateur SANS perm_statistiques → 403', async () => {
    const res = await proxy(await requete('/api/admin/statistiques', collab()));
    expect(res.status).toBe(403);
  });

  it('/api/admin/statistiques : collaborateur AVEC perm_statistiques → passe', async () => {
    const res = await proxy(await requete('/api/admin/statistiques', avecStats()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
  });

  it('/api/admin/geo/communes : collaborateur SANS perm_statistiques → 403', async () => {
    const res = await proxy(await requete('/api/admin/geo/communes', collab()));
    expect(res.status).toBe(403);
  });

  it('/api/admin/geo/communes : collaborateur AVEC perm_statistiques → passe', async () => {
    const res = await proxy(await requete('/api/admin/geo/communes', avecStats()));
    expect(res.status).not.toBe(403);
  });

  it('/admin/audit (page) : collaborateur même toutes perms → redirection /admin (RÔLE admin requis)', async () => {
    const res = await proxy(await requete('/admin/audit', collab(permsToutes())));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('/api/admin/audit (API) : collaborateur même toutes perms → 403 (RÔLE admin requis)', async () => {
    const res = await proxy(await requete('/api/admin/audit', collab(permsToutes())));
    expect(res.status).toBe(403);
  });

  it('/api/admin/audit + administrateur → passe (double barrière : proxy rôle + exigerAdministrateur en aval)', async () => {
    const res = await proxy(await requete('/api/admin/audit', admin()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
  });
});

describe('proxy — allow-list AUTHENTIFIÉ-SEUL (sans permission de module)', () => {
  it.each([
    '/admin',
    '/api/admin/ping',
    '/admin/compte/mot-de-passe',
    '/api/admin/compte/mot-de-passe',
  ])('%s : collaborateur sans aucune permission → laissé passer', async (p) => {
    const res = await proxy(await requete(p, collab()));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(302);
  });

  it('/admin : NON authentifié → redirection login (l’allow-list n’ouvre PAS aux anonymes)', async () => {
    const res = await proxy(await requete('/admin', null));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });

  it('/api/admin/ping : NON authentifié → 401', async () => {
    const res = await proxy(await requete('/api/admin/ping', null));
    expect(res.status).toBe(401);
  });
});
