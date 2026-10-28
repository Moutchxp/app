import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

/**
 * 🔴 LOT P (Arno, 28/10/2026) — OBSERVATEUR = LECTURE SEULE ABSOLUE, PAR UNE GARDE CENTRALE UNIQUE (le proxy).
 * L'épreuve : le RECENSEMENT de toutes les routes d'écriture de l'admin (tout `route.ts` qui exporte POST / PUT / PATCH / DELETE), puis,
 * pour CHACUNE et chacune de ses méthodes, une requête d'un observateur (administrateur de rôle, toutes les tuiles : rien d'autre ne
 * pourrait le refuser) — refusée par le proxy avec `LECTURE_SEULE` ; la même requête d'un associé n'est pas refusée pour ce motif. Une
 * route ajoutée demain entre dans la liste toute seule : aucune ne peut échapper à la garde.
 */
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => {
  const vrai = await vi.importActual<typeof import('./etatSession')>('./etatSession');
  return { ...vrai, lireEtatCompte };
});
import { proxy } from '../../../proxy';
import { signerJeton, permsToutes, NOM_COOKIE } from './session';
import { ECRITURES_PERMISES_OBSERVATEUR, ecritureRefuseeObservateur } from './observateur';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
let statut: string | null = 'observateur';
beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  lireEtatCompte.mockReset().mockImplementation(async () => ({ actif: true, role: 'administrateur', perms: permsToutes(), empreinteMdp: 'emp', versionSession: null, statut }));
});

/** Tous les fichiers `route.ts` sous un dossier. */
function routes(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    const p = path.join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...routes(p));
    else if (e === 'route.ts') out.push(p);
  }
  return out;
}
const METHODES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const methodesDe = (src: string): string[] => METHODES.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(src));
/** Le chemin d'URL d'un fichier de route : sans les groupes « (x) », chaque « [param] » remplacé par une valeur. */
const urlDe = (fichier: string): string => `/${path.dirname(fichier).split(path.sep).filter((s) => s !== 'app' && !/^\(.*\)$/.test(s))
  .map((s) => (s.startsWith('[') ? '1' : s)).join('/')}`;

const INVENTAIRE = routes('app/(admin)').map((f) => ({ fichier: f, url: urlDe(f), methodes: methodesDe(readFileSync(f, 'utf8')) })).filter((r) => r.methodes.length > 0);

async function requete(url: string, methode: string): Promise<NextRequest> {
  const jeton = await signerJeton({ sub: 9, identifiant: 'obs', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
  return new NextRequest(new URL(`http://local${url}`), { method: methode, headers: new Headers({ cookie: `${NOM_COOKIE}=${jeton}`, 'sec-fetch-site': 'same-origin' }),
    body: methode === 'DELETE' || methode === 'GET' ? undefined : '{}' });
}

describe('🔴 LOT P — le recensement des routes d’écriture de l’admin', () => {
  it('il y en a, toutes sous /api/admin (le seul préfixe que la garde couvre) — sauf la liste nommée ci-dessous', () => {
    expect(INVENTAIRE.length).toBeGreaterThan(100);
    const horsApi = INVENTAIRE.filter((r) => !r.url.startsWith('/api/admin/'));
    // Les routes sous /admin (pages) n'écrivent pas : aucune n'exporte de méthode d'écriture.
    expect(horsApi.map((r) => r.url)).toEqual([]);
  });
});

describe('🔴 LOT P — un observateur est refusé (403 LECTURE_SEULE) sur CHAQUE route d’écriture, un associé ne l’est pas', () => {
  it.each(INVENTAIRE.flatMap((r) => r.methodes.map((m) => [`${m} ${r.url}`, r.url, m] as const)))('%s', async (_nom, url, methode) => {
    const exempte = ECRITURES_PERMISES_OBSERVATEUR.has(url) || url === '/api/admin/session' || url === '/api/admin/activation'
      || url === '/api/admin/reinitialiser' || url === '/api/admin/reinitialiser/demander';
    statut = 'observateur';
    const r = await proxy(await requete(url, methode));
    if (exempte) {
      expect(r.status === 403 && (await r.clone().json().catch(() => ({})) as { erreur?: string }).erreur === 'LECTURE_SEULE').toBe(false);
    } else {
      expect(r.status).toBe(403);
      expect(((await r.json()) as { erreur: string }).erreur).toBe('LECTURE_SEULE');
    }
    statut = 'associe';
    const a = await proxy(await requete(url, methode));
    expect(a.status === 403 && (await a.clone().json().catch(() => ({})) as { erreur?: string }).erreur === 'LECTURE_SEULE').toBe(false);
  });
  it('les lectures (GET) d’un observateur passent ; la règle pure', async () => {
    statut = 'observateur';
    const r = await proxy(await requete('/api/admin/transaction?vue=compromis&societe=tous', 'GET'));
    expect(r.status).not.toBe(403);
    expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/location')).toBe(true);
    expect(ecritureRefuseeObservateur('observateur', 'get', '/api/admin/location')).toBe(false);
    expect(ecritureRefuseeObservateur('salarie', 'POST', '/api/admin/location')).toBe(false);
    expect(ecritureRefuseeObservateur(null, 'POST', '/api/admin/location')).toBe(false);
    expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/compte/mot-de-passe')).toBe(false);
  });
});
