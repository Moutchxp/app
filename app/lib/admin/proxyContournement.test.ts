import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

/**
 * 🔴 SÉCURITÉ (audit du 13/11/2026, C1) — contournement du garde `proxy.ts` (GHSA-6gpp-xcg3-4w24), corrigé par Next 16.4.6.
 * Deux preuves : (1) la version de Next installée est au moins la version corrigée ; (2) sans connexion, une route admin
 * protégée reste refusée, y compris sous les formes de chemin et les en-têtes internes de Next qu'un contournement exploite.
 */
vi.mock('./etatSession', async () => {
  const vrai = await vi.importActual<typeof import('./etatSession')>('./etatSession');
  return { ...vrai, lireEtatCompte: vi.fn(async () => null) };
});

import { proxy } from '../../../proxy';
import { NOM_COOKIE } from './session';

process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

const version = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10));
const auMoins = (v: string, min: string) => {
  const a = version(v); const b = version(min);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe('🔴 Next.js installé : la version corrigée', () => {
  it('next ≥ 16.4.6 (GHSA-6gpp, GHSA-2464, GHSA-2xp9) — dans node_modules ET épinglé dans package.json', () => {
    const installe = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/next/package.json'), 'utf8')).version as string;
    const epingle = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).dependencies.next as string;
    expect(auMoins(installe, '16.4.6')).toBe(true);
    expect(epingle).toMatch(/^\d+\.\d+\.\d+$/); // version exacte : pas de glissement silencieux
    expect(auMoins(epingle, '16.4.6')).toBe(true);
  });
});

describe('🔴 sans connexion, une route admin protégée reste refusée (contournement GHSA-6gpp)', () => {
  const ENTETES_INTERNES: Record<string, string>[] = [{}, { rsc: '1' }, { 'next-router-prefetch': '1' }, { 'next-router-state-tree': '%5B%22%22%5D' },
    { 'x-nextjs-data': '1' }, { 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' }, { 'x-middleware-prefetch': '1' }];
  const req = (chemin: string, entetes: Record<string, string>) => new NextRequest(new URL(`http://local${chemin}`), { headers: new Headers(entetes) });

  for (const chemin of ['/admin/gestion', '/admin/gestion/', '/admin/location', '/admin/mon-espace/recapitulatif', '/admin/transaction/criterimmo', '/admin/%67estion']) {
    it(`page ${chemin} : renvoyée à la connexion, quels que soient les en-têtes internes`, async () => {
      for (const e of ENTETES_INTERNES) {
        const res = await proxy(req(chemin, e));
        expect(res.status, JSON.stringify(e)).toBe(307);
        expect(res.headers.get('location'), JSON.stringify(e)).toMatch(/\/admin\/login(\?retour=[^&]+)?$/);
      }
    });
  }
  for (const chemin of ['/api/admin/gestion', '/api/admin/gestion/', '/api/admin/transaction', '/api/admin/%67estion']) {
    it(`API ${chemin} : 401, quels que soient les en-têtes internes`, async () => {
      for (const e of ENTETES_INTERNES) expect((await proxy(req(chemin, e))).status, JSON.stringify(e)).toBe(401);
    });
  }
  it('un faux cookie de session (jeton non signé) : refusé comme une absence de connexion', async () => {
    const r = new NextRequest(new URL('http://local/api/admin/gestion'), { headers: new Headers({ cookie: `${NOM_COOKIE}=eyJhbGciOiJub25lIn0.eyJzdWIiOjF9.` }) });
    expect((await proxy(r)).status).toBe(401);
  });
});

describe('🔴 Arno (13/11/2026) — le lien du mail ouvert sans le cookie (app Mail, SameSite=Strict) : la connexion RAMÈNE au formulaire', () => {
  it('/admin/location?previsite=11&geste=compte-rendu sans session → /admin/login?retour=<la même page>', async () => {
    const res = await proxy(new NextRequest(new URL('http://local/admin/location?previsite=11&geste=compte-rendu')));
    expect(res.status).toBe(307);
    const l = new URL(res.headers.get('location')!);
    expect(l.pathname).toBe('/admin/login');
    expect(l.searchParams.get('retour')).toBe('/admin/location?previsite=11&geste=compte-rendu');
  });
  it('l’API reste en 401, sans redirection', async () => {
    expect((await proxy(new NextRequest(new URL('http://local/api/admin/location?previsiteCompteRendu=11')))).status).toBe(401);
  });
});
