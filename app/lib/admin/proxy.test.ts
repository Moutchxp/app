import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Points 4-5 (15/10/2026) : le proxy relit le compte en base. Ici la base est simulée ; par défaut le compte est un
// administrateur actif aux droits complets, sans version de session (migration 356 non appliquée) — les droits EFFECTIFS
// sont alors ceux du jeton, et tous les cas historiques ci-dessous gardent leur sens.
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => {
  const vrai = await vi.importActual<typeof import('./etatSession')>('./etatSession');
  return { ...vrai, lireEtatCompte };
});

import { proxy } from '../../../proxy';
import { signerJeton, permsToutes, permsAucune, NOM_COOKIE, type SessionAdmin } from './session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  lireEtatCompte.mockReset().mockResolvedValue({ actif: true, role: 'administrateur', perms: permsToutes(), empreinteMdp: 'emp-actuelle', versionSession: null });
});

async function requete(pathname: string, session: SessionAdmin | null): Promise<NextRequest> {
  const headers = new Headers();
  if (session) {
    const jeton = await signerJeton(session);
    headers.set('cookie', `${NOM_COOKIE}=${jeton}`);
  }
  return new NextRequest(new URL(`http://local${pathname}`), { headers });
}

const collab = (perms = permsAucune(), doitChanger = false): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms, doitChanger, peutModifierPermis: false });
const admin = (doitChanger = false): SessionAdmin => ({ sub: 1, identifiant: 'arno', role: 'administrateur', perms: permsToutes(), doitChanger, peutModifierPermis: true });
/** Voie de secours : sub=null. doitChanger passé en entrée pour PROUVER qu'il est forcé à false par signerJeton. */
const secours = (doitChanger = false): SessionAdmin => ({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger, peutModifierPermis: true });

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

  // Décision d'Arno du 15/10/2026 (audit point A) : voie de secours WEB retirée ; une session anonyme (sub=null) n'est plus
  // acceptée — traitée comme NON authentifiée. Ce cas affirmait l'inverse.
  it('ancienne VOIE DE SECOURS (sub=null) : renvoyée à la connexion (page), jamais admise', async () => {
    const res = await proxy(await requete('/admin/pilotage', secours(true)));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
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

  // Décision d'Arno du 15/10/2026 (audit point A) : voie de secours WEB retirée ; une session anonyme (sub=null) n'est plus
  // acceptée — traitée comme NON authentifiée. Ce cas affirmait l'inverse.
  it('ancienne VOIE DE SECOURS (sub=null, administrateur) → tuile Administratif REFUSÉE (401, comme sans session)', async () => {
    const res = await proxy(await requete('/api/admin/comptes', secours()));
    expect(res.status).toBe(401);
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

  // Décision d'Arno du 15/10/2026 (audit point A) : voie de secours WEB retirée ; une session anonyme (sub=null) n'est plus
  // acceptée — traitée comme NON authentifiée. Ce cas affirmait l'inverse.
  it('ancienne VOIE DE SECOURS (sub=null, administrateur) sur route inconnue → 401', async () => {
    const res = await proxy(await requete('/api/admin/route-fantome', secours()));
    expect(res.status).toBe(401);
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

describe('proxy — RATT-EDIT (lot A2) : « Permis de construire » devient un module gardé (perm_permis)', () => {
  const avecPermis = () => collab({ ...permsAucune(), permis: true });

  it('/admin/permis (page) : collaborateur SANS perm_permis → redirection /admin (plus admin-only par défaut, mais gardé par le droit)', async () => {
    const res = await proxy(await requete('/admin/permis', collab()));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('/api/admin/permis (API) : collaborateur SANS perm_permis → 403 (URL saisie à la main comprise)', async () => {
    for (const p of ['/api/admin/permis', '/api/admin/permis/projection', '/api/admin/permis/caracteristiques']) {
      const res = await proxy(await requete(p, collab()));
      expect(res.status, p).toBe(403);
    }
  });

  it('/admin/permis + /api/admin/permis/* : collaborateur AVEC perm_permis → passe le proxy', async () => {
    for (const p of ['/admin/permis', '/api/admin/permis/projection', '/api/admin/permis/caracteristiques']) {
      const res = await proxy(await requete(p, avecPermis()));
      expect(res.status, p).not.toBe(403);
      expect(res.status, p).not.toBe(307);
    }
  });

  it('administrateur → /admin/permis et /api/admin/permis/* laissés passer (inchangé fonctionnellement)', async () => {
    for (const p of ['/admin/permis', '/api/admin/permis', '/api/admin/permis/rattachement']) {
      const res = await proxy(await requete(p, admin()));
      expect(res.status, p).not.toBe(403);
      expect(res.status, p).not.toBe(307);
    }
  });

  it('ISOLATION : perm_permis n’ouvre PAS les 6 autres modules (curation reste 403) ; et perm_curation n’ouvre PAS permis', async () => {
    expect((await proxy(await requete('/api/admin/curation', avecPermis()))).status).toBe(403);
    const avecCuration = () => collab({ ...permsAucune(), curation: true });
    expect((await proxy(await requete('/api/admin/permis', avecCuration()))).status).toBe(403);
  });

  // Décision d'Arno du 15/10/2026 (audit point A) : voie de secours WEB retirée ; une session anonyme (sub=null) n'est plus
  // acceptée — traitée comme NON authentifiée. Ce cas affirmait l'inverse.
  it('ancienne VOIE DE SECOURS (sub=null, administrateur) → /api/admin/permis refusé (401)', async () => {
    const res = await proxy(await requete('/api/admin/permis', secours()));
    expect(res.status).toBe(401);
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

describe('proxy — module « Gestion » (lot 2) : gardé par perm_gestion, comme les 7 autres', () => {
  it('/admin/gestion (page) : collaborateur SANS le droit → redirigé vers /admin, jamais la page', async () => {
    const res = await proxy(await requete('/admin/gestion', collab()));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/admin$/);
  });

  it('/api/admin/gestion (API) : collaborateur SANS le droit → 403, URL saisie à la main comprise', async () => {
    for (const p of ['/api/admin/gestion', '/api/admin/gestion/quoi-que-ce-soit']) {
      expect((await proxy(await requete(p, collab()))).status).toBe(403);
    }
  });

  it('un autre droit de module n’ouvre PAS la gestion (les permissions ne se transfèrent pas)', async () => {
    const avecCuration = collab({ ...permsAucune(), curation: true });
    expect((await proxy(await requete('/admin/gestion', avecCuration))).status).toBe(307);
    expect((await proxy(await requete('/api/admin/gestion', avecCuration))).status).toBe(403);
  });

  it('collaborateur AVEC le droit → passe le proxy (page et API)', async () => {
    const avecGestion = collab({ ...permsAucune(), gestion: true });
    for (const p of ['/admin/gestion', '/api/admin/gestion']) {
      const res = await proxy(await requete(p, avecGestion));
      expect(res.status).not.toBe(307);
      expect(res.status).not.toBe(403);
    }
  });

  it('administrateur → laissé passer (permissions implicites) ; ancienne VOIE DE SECOURS → refusée (retirée le 15/10/2026)', async () => {
    for (const p of ['/admin/gestion', '/api/admin/gestion']) {
      const res = await proxy(await requete(p, admin()));
      expect(res.status).not.toBe(307);
      expect(res.status).not.toBe(403);
    }
    expect((await proxy(await requete('/admin/gestion', secours()))).headers.get('location')).toMatch(/\/admin\/login$/);
    expect((await proxy(await requete('/api/admin/gestion', secours()))).status).toBe(401);
  });

  it('NON authentifié → login pour la page, 401 pour l’API (aucune donnée de gestion sans session)', async () => {
    expect((await proxy(await requete('/admin/gestion', null))).headers.get('location')).toMatch(/\/admin\/login$/);
    expect((await proxy(await requete('/api/admin/gestion', null))).status).toBe(401);
  });

  it('les modules EXISTANTS ne changent pas de comportement du fait de cet ajout', async () => {
    const avecGestion = collab({ ...permsAucune(), gestion: true });
    for (const p of ['/admin/curation', '/admin/permis', '/api/admin/curation', '/api/admin/permis']) {
      expect((await proxy(await requete(p, avecGestion))).status).toBeGreaterThanOrEqual(307); // toujours refusés
    }
  });
});

// ══ AUDIT POINTS 4 ET 5 (15/10/2026) — révocation côté serveur et relecture en base ══════════════════════════════════════
// Le trou : le proxy décidait sur le JETON seul (8 h). Déconnexion, désactivation, changement de mot de passe, tuile retirée :
// rien de tout cela ne coupait une session déjà ouverte sur les routes et les pages qui ne relisaient pas la base.
describe('proxy — la session vit aussi longtemps que le compte le permet (points 4 et 5)', () => {
  const collabCuration = (extra: Partial<SessionAdmin> = {}): SessionAdmin => ({ ...collab({ ...permsAucune(), curation: true }), ...extra });
  const etatCollab = (over: Record<string, unknown> = {}) => ({
    actif: true, role: 'collaborateur', perms: { ...permsAucune(), curation: true }, empreinteMdp: 'emp-actuelle', versionSession: null, ...over,
  });

  it('collaborateur DÉSACTIVÉ en base, jeton encore valable → API 401, page renvoyée à la connexion (lecture curation « jeton seul »)', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ actif: false }));
    expect((await proxy(await requete('/api/admin/curation/journal', collabCuration()))).status).toBe(401);
    const page = await proxy(await requete('/admin/curation', collabCuration()));
    expect(page.headers.get('location')).toMatch(/\/admin\/login$/);
    expect(lireEtatCompte).toHaveBeenCalledWith(3);
  });

  it('TUILE RETIRÉE en base (perm_curation=false), jeton qui la porte encore → 403 tout de suite', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ perms: permsAucune() }));
    expect((await proxy(await requete('/api/admin/curation/parcelles', collabCuration()))).status).toBe(403);
    expect((await proxy(await requete('/admin/curation', collabCuration()))).headers.get('location')).toMatch(/\/admin$/);
  });

  it('banc de test (aLaPermission = jeton seul) : tuile retirée en base → 403 au proxy', async () => {
    const collabBanc = collab({ ...permsAucune(), banc_test: true });
    lireEtatCompte.mockResolvedValue(etatCollab({ perms: permsAucune() }));
    expect((await proxy(await requete('/api/admin/banc-comparer', collabBanc))).status).toBe(403);
  });

  it('MOT DE PASSE CHANGÉ ou RÉINITIALISÉ (empreinte en base ≠ jeton) → session refusée', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ empreinteMdp: 'emp-nouvelle' }));
    expect((await proxy(await requete('/api/admin/curation', collabCuration({ empreinteMdp: 'emp-ancienne' })))).status).toBe(401);
  });

  it('DÉCONNEXION (version de session incrémentée en base) → l’ancien jeton est refusé', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ versionSession: 1 }));
    expect((await proxy(await requete('/api/admin/curation', collabCuration({ empreinteMdp: 'emp-actuelle', versionSession: 0 })))).status).toBe(401);
  });

  it('compte SUPPRIMÉ (absent en base) → 401', async () => {
    lireEtatCompte.mockResolvedValue(null);
    expect((await proxy(await requete('/api/admin/curation', collabCuration()))).status).toBe(401);
  });

  it('un refus efface le cookie de session (le navigateur ne le renvoie plus)', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ actif: false }));
    const res = await proxy(await requete('/admin/curation', collabCuration()));
    expect(res.headers.get('set-cookie') ?? '').toMatch(new RegExp(`${NOM_COOKIE}=;`));
  });

  it('jeton ADMINISTRATEUR mais compte collaborateur en base → traité en collaborateur (jamais plus que la base)', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab());
    expect((await proxy(await requete('/api/admin/comptes', admin()))).status).toBe(403);
  });

  it('base INJOIGNABLE → refus prudent (503), jamais un accès « faute de mieux »', async () => {
    lireEtatCompte.mockRejectedValue(new Error('connexion refusée'));
    expect((await proxy(await requete('/api/admin/curation', collabCuration()))).status).toBe(503);
  });

  it('USAGE NORMAL inchangé : compte actif, même empreinte, même version → passe ; un jeton d’avant ce lot (sans empreinte) passe aussi', async () => {
    lireEtatCompte.mockResolvedValue(etatCollab({ versionSession: 2 }));
    expect((await proxy(await requete('/api/admin/curation', collabCuration({ empreinteMdp: 'emp-actuelle', versionSession: 2 })))).status).not.toBe(401);
    lireEtatCompte.mockResolvedValue(etatCollab());
    const res = await proxy(await requete('/admin/curation', collabCuration()));
    expect(res.status).not.toBe(307);
  });
});

// ══ AUDIT POINT 6 (15/10/2026) — contrôle d'ORIGINE sur les requêtes qui modifient ══════════════════════════════════════
// Le trou : seul SameSite=Strict protégeait des requêtes forgées ; or les sous-domaines de sansvisavis.com sont « même site »
// pour le navigateur — une faille sur l'un d'eux pouvait envoyer des actions authentifiées à l'admin.
describe('proxy — contrôle d’origine des requêtes qui modifient (point 6)', () => {
  async function ecriture(pathname: string, entetes: Record<string, string>, session: SessionAdmin | null = admin(), methode = 'POST'): Promise<NextRequest> {
    const base = await requete(pathname, session);
    const headers = new Headers(base.headers);
    headers.set('host', 'authentification.sansvisavis.com');
    for (const [k, v] of Object.entries(entetes)) headers.set(k, v);
    return new NextRequest(new URL(`http://authentification.sansvisavis.com${pathname}`), { method: methode, headers });
  }

  it('POST depuis un AUTRE sous-domaine (Sec-Fetch-Site: same-site) → 403, même avec une session valide', async () => {
    const res = await proxy(await ecriture('/api/admin/gestion/brouillons', { 'sec-fetch-site': 'same-site', origin: 'https://blog.sansvisavis.com' }));
    expect(res.status).toBe(403);
  });

  it('POST depuis un site tiers (cross-site) ou une Origin étrangère → 403', async () => {
    expect((await proxy(await ecriture('/api/admin/comptes', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await proxy(await ecriture('/api/admin/comptes', { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await proxy(await ecriture('/api/admin/comptes', { origin: 'null' }))).status).toBe(403);
  });

  it('connexion forgée depuis un autre site (CSRF de connexion) → 403 avant toute vérification', async () => {
    expect((await proxy(await ecriture('/api/admin/session', { 'sec-fetch-site': 'cross-site' }, null))).status).toBe(403);
  });

  it('PATCH / DELETE aussi contrôlés', async () => {
    expect((await proxy(await ecriture('/api/admin/config', { 'sec-fetch-site': 'same-site' }, admin(), 'PATCH'))).status).toBe(403);
    expect((await proxy(await ecriture('/api/admin/session', { 'sec-fetch-site': 'same-site' }, admin(), 'DELETE'))).status).toBe(403);
  });

  it('USAGE NORMAL : même origine (Sec-Fetch-Site same-origin, ou Origin du même hôte, https derrière Caddy) → passe', async () => {
    expect((await proxy(await ecriture('/api/admin/comptes', { 'sec-fetch-site': 'same-origin', origin: 'https://authentification.sansvisavis.com' }))).status).not.toBe(403);
    expect((await proxy(await ecriture('/api/admin/comptes', { origin: 'https://authentification.sansvisavis.com' }))).status).not.toBe(403);
    expect((await proxy(await ecriture('/api/admin/session', { 'sec-fetch-site': 'same-origin' }, null))).status).not.toBe(403);
  });

  it('lecture (GET) venue d’ailleurs → non concernée (SameSite et la garde de session s’appliquent)', async () => {
    expect((await proxy(await ecriture('/api/admin/comptes', { 'sec-fetch-site': 'cross-site' }, admin(), 'GET'))).status).not.toBe(403);
  });

  it('client hors navigateur (ni Origin ni Sec-Fetch-Site : script, curl) → non concerné, la session décide', async () => {
    expect((await proxy(await ecriture('/api/admin/comptes', {}))).status).not.toBe(403);
  });
});
