import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * LOT INSTRUMENTATION-RUNTIME-NODE (18/10/2026) — le verrou de la recette est posé au démarrage, et seulement par le
 * runtime Node.
 *  · échoue si `register()` ne pose plus le verrou en recette (SVAV_RECETTE=1, serveur de développement, Mac) ;
 *  · échoue s'il le pose en production (NODE_ENV=production, machine svav-prod), sans la variable, ou dans le runtime Edge ;
 *  · échoue si du code Node (import, process.exit, node:…) revient dans `instrumentation.ts` hors de la branche
 *    `NEXT_RUNTIME === 'nodejs'` : c'est ce qui faisait écrire au compilateur Edge « Node.js API is used » / « Node.js
 *    module is loaded » dans le terminal de `npm run recette`.
 * Aucun accès réseau : le `fetch` global est un faux, restauré après chaque test.
 */
import { register } from '../../../instrumentation';
import { demarrerServeurNode } from './demarrageNode';
import { verrouRecettePose } from './installer';

const POSE = Symbol.for('svav.recette.verrouPose');
const MARQUE = Symbol.for('svav.recette.fetch');
const drapeaux = globalThis as unknown as Record<symbol, boolean | undefined>;
const fetchOrigine = globalThis.fetch;
const MAC = { SVAV_RECETTE: '1', NODE_ENV: 'development', SITE_URL: 'https://x.trycloudflare.com' };

function enveloppe(): boolean {
  return (globalThis.fetch as unknown as Record<symbol, unknown>)[MARQUE] === true;
}

beforeEach(() => {
  delete drapeaux[POSE];
  globalThis.fetch = (async () => new Response('faux')) as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete drapeaux[POSE];
  globalThis.fetch = fetchOrigine;
});

describe('register() : le verrou est posé en recette, et seulement là', () => {
  it('recette sur le Mac (runtime Node, SVAV_RECETTE=1) → verrou posé, fetch enveloppé, bandeau au journal', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    for (const [k, v] of Object.entries(MAC)) vi.stubEnv(k, v);
    await register();
    expect(verrouRecettePose()).toBe(true);
    expect(enveloppe()).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('RECETTE — aucun envoi réel'));
  });

  it('production (NODE_ENV=production) même avec SVAV_RECETTE=1 → aucun verrou, refus écrit', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    for (const [k, v] of Object.entries({ ...MAC, NODE_ENV: 'production' })) vi.stubEnv(k, v);
    await register();
    expect(verrouRecettePose()).toBe(false);
    expect(enveloppe()).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('MODE RECETTE REFUSÉ'));
  });

  it('sans SVAV_RECETTE → aucun verrou, rien au journal sur la recette', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('SVAV_RECETTE', '');
    vi.stubEnv('NODE_ENV', 'production');
    await register();
    expect(verrouRecettePose()).toBe(false);
    expect(enveloppe()).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('runtime Edge → rien n’est chargé ni posé', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    for (const [k, v] of Object.entries(MAC)) vi.stubEnv(k, v);
    await register();
    expect(verrouRecettePose()).toBe(false);
    expect(enveloppe()).toBe(false);
  });
});

describe('demarrerServeurNode : mêmes refus, même arrêt si le verrou ne peut pas être posé', () => {
  it('machine svav-prod → aucun verrou', async () => {
    const sortir = vi.fn();
    await demarrerServeurNode({ env: MAC, nomMachine: () => 'svav-prod', sortir });
    expect(verrouRecettePose()).toBe(false);
    expect(sortir).not.toHaveBeenCalled();
  });

  it('recette demandée mais contrôle impossible → le serveur s’arrête (code 1) ; en production, jamais', async () => {
    const panne = () => { throw new Error('panne'); };
    const sortir = vi.fn();
    await demarrerServeurNode({ env: MAC, nomMachine: panne, sortir });
    expect(sortir).toHaveBeenCalledWith(1);
    const sortirProd = vi.fn();
    await demarrerServeurNode({ env: { ...MAC, NODE_ENV: 'production' }, nomMachine: panne, sortir: sortirProd });
    expect(sortirProd).not.toHaveBeenCalled();
  });
});

describe('instrumentation.ts : aucun code Node hors de la branche NEXT_RUNTIME === "nodejs"', () => {
  const source = readFileSync(path.join(__dirname, '../../../instrumentation.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const branche = source.indexOf("if (process.env.NEXT_RUNTIME === 'nodejs') {");

  it('la branche Node existe, et pas de retour anticipé « !== nodejs » (le compilateur Edge analysait la suite)', () => {
    expect(branche).toBeGreaterThan(-1);
    expect(source).not.toMatch(/NEXT_RUNTIME\s*!==/);
  });

  it('aucun import statique, aucun module node:, process.exit et import() seulement dans la branche', () => {
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/['"]node:/);
    for (const motif of [/process\.exit/g, /import\(/g]) {
      for (const m of source.matchAll(motif)) expect(m.index!).toBeGreaterThan(branche);
    }
    expect(source).toContain("import('./app/lib/recette/demarrageNode')");
  });
});
