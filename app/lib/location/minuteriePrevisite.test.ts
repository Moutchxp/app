import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 LA PRÉ-VISITE — LA MINUTERIE DU SERVEUR WEB ET LE VERROU DE LA RECETTE (Arno, 10/11/2026) :
 *   · la minuterie : toutes les 5 minutes (la première passe après 1 minute), une seule par processus, jamais deux passes à la fois,
 *     jamais sous les tests, un journal muet sur une passe calme ;
 *   · lancée par le démarrage du serveur web APRÈS le verrou de la recette ; jamais par le démon ;
 *   · VERROU RECETTE = AUCUN ENVOI : un mail de pré-visite passe par le transport des mails de la Location, dont l'envoi Gmail est
 *     intercepté (boîte de test) — le vrai `fetch` n'est jamais atteint.
 * Aucun accès réseau : `fetch` de base faux, boîte de test relevée en mémoire, identifiants Google simulés.
 */
const { depots } = vi.hoisted(() => ({ depots: [] as Record<string, unknown>[] }));
vi.mock('../recette/boite', async (orig) => ({ ...(await orig<typeof import('../recette/boite')>()), deposerDansBoite: (e: Record<string, unknown>) => { depots.push(e); } }));
vi.mock('../gestion/google', async (orig) => ({
  ...(await orig<typeof import('../gestion/google')>()),
  lireIdentifiants: () => ({ clientId: 'id', clientSecret: 'secret' }),
  rafraichirJeton: async () => ({ ok: true, valeur: 'jeton-factice' }),
}));
vi.mock('../gestion/googleJeton', async (orig) => ({ ...(await orig<typeof import('../gestion/googleJeton')>()), lireJeton: () => ({ refreshToken: 'r' }) }));

import { demarrerMinuteriePrevisite, INTERVALLE_PREVISITE_MS, oublierMinuteriePrevisite, PREMIERE_PASSE_MS } from './minuteriePrevisite';
import { demarrerServeurNode } from '../recette/demarrageNode';
import { installerVerrouRecette, verrouRecettePose } from '../recette/installer';
import { transportReel } from '../gestion/envoiDemandeTache';
import { mailPrevisite, MENTION_AUTOMATIQUE } from './previsite';

const POSE = Symbol.for('svav.recette.verrouPose');
const drapeaux = globalThis as unknown as Record<symbol, boolean | undefined>;
const fetchOrigine = globalThis.fetch;
const DEV = { NODE_ENV: 'development' };

beforeEach(() => { oublierMinuteriePrevisite(); delete drapeaux[POSE]; depots.length = 0; vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { oublierMinuteriePrevisite(); delete drapeaux[POSE]; globalThis.fetch = fetchOrigine; vi.restoreAllMocks(); });

const montage = () => {
  const appels: { f: () => void; ms: number; sorte: string }[] = [];
  return {
    appels,
    programmer: (f: () => void, ms: number) => { appels.push({ f, ms, sorte: 'intervalle' }); return {}; },
    differer: (f: () => void, ms: number) => { appels.push({ f, ms, sorte: 'premiere' }); return {}; },
  };
};

describe('la minuterie du serveur web', () => {
  it('jamais sous les tests', () => {
    expect(demarrerMinuteriePrevisite({ env: { VITEST: 'true' } })).toBe(false);
    expect(demarrerMinuteriePrevisite({ env: { NODE_ENV: 'test' } })).toBe(false);
  });
  it('toutes les 5 minutes, la première passe après 1 minute ; une seule minuterie par processus', () => {
    const m = montage();
    expect(demarrerMinuteriePrevisite({ env: DEV, passe: async () => null, ...m })).toBe(true);
    expect(m.appels.map((a) => [a.sorte, a.ms])).toEqual([['premiere', PREMIERE_PASSE_MS], ['intervalle', INTERVALLE_PREVISITE_MS]]);
    expect(INTERVALLE_PREVISITE_MS).toBe(300_000);
    expect(demarrerMinuteriePrevisite({ env: DEV, passe: async () => null, ...m })).toBe(false);
    expect(m.appels).toHaveLength(2);
  });
  it('jamais deux passes à la fois ; une passe calme n’écrit rien, une passe active le dit, une erreur ne remonte pas', async () => {
    const m = montage();
    let liberer: (v: { alertes: number; invitations: number; echecs: number; recapitulatif: boolean }) => void = () => {};
    const passe = vi.fn(() => new Promise<{ alertes: number; invitations: number; echecs: number; recapitulatif: boolean }>((r) => { liberer = r; }));
    const journal = vi.fn();
    demarrerMinuteriePrevisite({ env: DEV, passe, journal, ...m });
    m.appels[0].f(); m.appels[1].f();
    expect(passe).toHaveBeenCalledTimes(1);
    liberer({ alertes: 0, invitations: 0, echecs: 0, recapitulatif: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(journal).not.toHaveBeenCalled();
    passe.mockImplementationOnce(async () => ({ alertes: 3, invitations: 1, echecs: 0, recapitulatif: true }));
    m.appels[1].f();
    await new Promise((r) => setTimeout(r, 0));
    expect(journal).toHaveBeenCalledWith('[pré-visite] récapitulatif des 3 préavis en retard envoyé, 1 invitation(s) au compte rendu, 0 échec(s) (réessayés à la passe suivante)');
    passe.mockImplementationOnce(async () => { throw new Error('base injoignable'); });
    m.appels[1].f();
    await new Promise((r) => setTimeout(r, 0));
    expect(journal).toHaveBeenLastCalledWith('[pré-visite] passe impossible : base injoignable');
  });
});

describe('lancée au démarrage du serveur web, APRÈS le verrou de la recette — jamais par le démon', () => {
  it('recette : le verrou est déjà posé quand la minuterie est lancée', async () => {
    globalThis.fetch = (async () => new Response('faux')) as typeof fetch;
    let verrouAuLancement: boolean | null = null;
    await demarrerServeurNode({ env: { SVAV_RECETTE: '1', NODE_ENV: 'development' }, nomMachine: () => 'mac-arno', sortir: () => {},
      minuterie: () => { verrouAuLancement = verrouRecettePose(); return true; } });
    expect(verrouAuLancement).toBe(true);
  });
  it('production (recette refusée) : la minuterie est lancée, sans verrou', async () => {
    const minuterie = vi.fn(() => true);
    await demarrerServeurNode({ env: { NODE_ENV: 'production' }, nomMachine: () => 'svav-prod', sortir: () => {}, minuterie });
    expect(minuterie).toHaveBeenCalledTimes(1);
    expect(verrouRecettePose()).toBe(false);
  });
  it('recette demandée mais verrou impossible : le serveur s’arrête, la minuterie n’est pas lancée', async () => {
    const minuterie = vi.fn(() => true);
    const sortir = vi.fn();
    await demarrerServeurNode({ env: { SVAV_RECETTE: '1', NODE_ENV: 'development' }, nomMachine: () => { throw new Error('nom illisible'); }, sortir, minuterie });
    expect(sortir).toHaveBeenCalledWith(1);
    expect(minuterie).not.toHaveBeenCalled();
  });
  it('le démon de relève n’envoie rien de la pré-visite', () => {
    const demon = readFileSync('app/scripts/relever-gestion-continu.ts', 'utf8');
    expect(demon).not.toMatch(/previsite/i);
  });
});

describe('🔴 VERROU RECETTE = AUCUN ENVOI', () => {
  it('un mail de pré-visite par le transport des mails Location : intercepté, déposé dans la boîte de test, le vrai fetch jamais atteint pour l’envoi', async () => {
    const base = vi.fn(async (..._a: unknown[]) => new Response('{"ok":1}', { status: 200 }));
    globalThis.fetch = base as unknown as typeof fetch;
    expect(installerVerrouRecette()).toBe(true);
    const m = mailPrevisite({ sorte: 'previsite_alerte', de: 'gestion@exemple.test', a: ['arno@exemple.test'], cc: [], objet: 'Alerte préavis — aucune pré-visite fixée — 4 rue Fictive',
      paragraphes: ['Bonjour,'], qui: { mention: MENTION_AUTOMATIQUE }, signature: { html: '', texte: '' } });
    const r = await transportReel.envoyer({ de: m.de, deNom: 'Gestion', a: m.a, cc: m.cc, cci: [], objet: m.objet, corps: m.texte, corpsHtml: m.html, messageId: '<x@exemple.test>' });
    expect(r).toMatchObject({ ok: true, factice: false });
    expect(base.mock.calls.some((c) => String(c[0]).includes('/messages/send'))).toBe(false);
    expect(depots).toEqual([expect.objectContaining({ canal: 'gmail_envoi', issue: 'intercepte', a: 'arno@exemple.test' })]);
  });
  it('les modules de la pré-visite n’envoient QUE par ce canal (aucun fetch direct, aucun SMTP)', () => {
    for (const f of ['previsiteAuto', 'previsiteBase', 'previsiteRepo', 'previsiteMailTache', 'minuteriePrevisite']) {
      const src = readFileSync(`app/lib/location/${f}.ts`, 'utf8');
      expect(src, f).not.toMatch(/nodemailer|obtenirTransporteur|\bfetch\(|transportReel/);
    }
    expect(readFileSync('app/lib/location/mailsPreavisSortieRepo.ts', 'utf8')).toContain('(deps.transport ?? transportParDefaut()).envoyer(');
  });
});
