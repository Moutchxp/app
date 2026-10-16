import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * GET /api/internaute/coordonnees avec une VRAIE session (lot COORDONNEES-CONNU-REEL, 16/10/2026). Le lot précédent n'avait
 * prouvé l'écran qu'avec une réponse SIMULÉE de cette route : ce test échoue si la route ne reconnaît pas une vraie session.
 *
 * RIEN n'est simulé entre le cookie et la réponse : jeton signé par le VRAI `signerSession` (celui de la connexion), cookie
 * posé sous le VRAI nom avec les VRAIES options, VRAIE garde `exigerInternaute`, VRAIE lecture `lireCoordonneesTunnel`.
 * Seule la base est remplacée par un petit registre en mémoire (aucune base réelle n'est touchée).
 */
const ID = '11111111-2222-4333-8444-555555555555';
const MAJ_CREDENTIAL = '2026-10-16 09:00:00.123456+00';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/db/client', () => ({ query }));

import { GET } from './route';
import { GET as SESSION } from '../session/route';
import { signerSession, optionsCookieClient, NOM_COOKIE_CLIENT } from '../../../lib/internaute/authSession';

/** Registre en mémoire : répond comme la base pour UN compte (ID), rien pour un autre. */
function base(sql: string, params: unknown[] = []) {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM internaute_auth WHERE internaute_id = $1')) return { rows: params[0] === ID ? [{ maj_a: MAJ_CREDENTIAL }] : [] };
  if (s.includes('JOIN internaute_auth a ON a.internaute_id = i.id')) {
    // Même règle que la garde en SQL : compte existant, non effacé, session pas antérieure au dernier mot de passe.
    const ok = params[0] === ID && params[1] !== null && new Date(String(params[1])).getTime() >= new Date(MAJ_CREDENTIAL).getTime();
    return { rows: ok ? [{ '?column?': 1 }] : [] };
  }
  if (s.includes('FROM internaute WHERE id = $1')) {
    return { rows: params[0] === ID ? [{ prenom: 'Camille', nom: 'Complet', email: 'camille@example.invalid', telephone: '+33612345678', adresse_residence: '12 Rue de la Paix 75002 Paris' }] : [] };
  }
  if (s.includes('FROM internaute_consentement_actif')) return { rows: [] };
  if (s.includes('FROM internaute_projet')) return { rows: [] };
  throw new Error('requête inattendue : ' + s.slice(0, 80));
}

const requete = (cookie?: string) =>
  new Request('https://authentification.sansvisavis.com/api/internaute/coordonnees', { headers: cookie ? { cookie } : {} });

describe('la route reconnaît une VRAIE session (cookie posé par la connexion)', () => {
  const secretAvant = process.env.INTERNAUTE_SESSION_SECRET;
  beforeEach(() => {
    process.env.INTERNAUTE_SESSION_SECRET = 'secret-de-test-coordonnees-0123456789abcdef';
    query.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => base(sql, params));
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => { process.env.INTERNAUTE_SESSION_SECRET = secretAvant; vi.restoreAllMocks(); });

  it('connecté → { connecte: true } et les coordonnées DU COMPTE, adresse de résidence comprise', async () => {
    const jeton = await signerSession(ID);
    // Le cookie tel que la connexion le pose (nom, options) et tel qu'un navigateur le renvoie (avec d'autres cookies).
    expect(optionsCookieClient(true)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
    const res = await GET(requete(`_ga=GA1.1.1; ${NOM_COOKIE_CLIENT}=${jeton}; autre=x`));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = await res.json();
    expect(b).toMatchObject({ connecte: true, prenom: 'Camille', nom: 'Complet', email: 'camille@example.invalid', telephone: '+33612345678', derniereResidence: '12 Rue de la Paix 75002 Paris' });
    // Même verdict que la route qui pilote le menu « Se déconnecter » : une seule vérité de session.
    expect(await (await SESSION(requete(`${NOM_COOKIE_CLIENT}=${jeton}`))).json()).toEqual({ connecte: true });
  });

  it('pas de cookie, cookie trafiqué, ou signé par un autre secret → { connecte: false }', async () => {
    const jeton = await signerSession(ID);
    expect(await (await GET(requete())).json()).toEqual({ connecte: false });
    expect(await (await GET(requete(`${NOM_COOKIE_CLIENT}=${jeton.slice(0, -3)}abc`))).json()).toEqual({ connecte: false });
    process.env.INTERNAUTE_SESSION_SECRET = 'un-autre-secret-0123456789abcdef-0123456789';
    expect(await (await GET(requete(`${NOM_COOKIE_CLIENT}=${jeton}`))).json()).toEqual({ connecte: false });
  });

  it('la ligne de journal dit reconnu / non reconnu et le type d’appareil, sans aucune donnée personnelle', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const jeton = await signerSession(ID);
    const appli = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    await GET(new Request('https://x/api/internaute/coordonnees', { headers: { cookie: `${NOM_COOKIE_CLIENT}=${jeton}`, 'user-agent': appli + ' Safari/604.1' } }));
    await GET(new Request('https://x/api/internaute/coordonnees', { headers: { 'user-agent': appli } }));
    expect(info.mock.calls.map((c) => c[0])).toEqual([
      '[coordonnees] reconnu cookie=present appareil=iphone-safari',
      '[coordonnees] non_reconnu cookie=absent appareil=iphone-appli',
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/camille|Paix|1111|@/i);
  });
});
