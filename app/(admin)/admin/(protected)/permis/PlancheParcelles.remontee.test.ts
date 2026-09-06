// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PL-H — REMONTÉE planche → bloc « Bâtiments et projection ». On MONTE réellement la planche (jsdom) et on prouve le COMPORTEMENT :
 *   (a) « Valider la sélection » réussie → le callback `onEmpreinteRecalculee` est appelé UNE fois (c'est lui qui, chez le parent,
 *       bumpe vInstruction → BlocTraceEmprise se re-fetch : le bloc bâtiments demande donc bien une nouvelle donnée) ;
 *   (c) aucune BOUCLE : après la validation, la planche ne relance PAS un GET /planche (le GET initial reste unique) ;
 *       et sur un POST en ÉCHEC, le callback n'est PAS appelé (pas de faux rafraîchissement) et un message honnête s'affiche.
 * La liseuse (enfant réseau/pdf.js) est STUBBÉE : ce test ne porte que sur la planche. Aucun appel réseau réel (fetch mocké).
 */
vi.mock('./LiseusePieces', () => ({ LiseusePieces: () => null }));

import { PlancheParcelles } from './PlancheParcelles';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Planche = Record<string, unknown>;
const planche = (selectionActive: boolean): Planche => ({
  schema: { largeur: 360, hauteur: 300, empreintePath: 'M0,0 L10,0 L10,10 Z', motif: null,
    polygones: [{ repere: 'A', cleabs: 'P1', path: 'M0,0 L10,0 L10,10 Z', cx: 5, cy: 5, horsEmpreinte: false }],
    transform: { minX: 0, minY: 0, scale: 1, padX: 0, padY: 0, hauteur: 300 } },
  meta: [{ idu: 'P1', section: 'AB', numero: '1', retenue: true, origine: 'extraite', surfaceM2: 100, majPar: null, majLe: null, acteurNom: null }],
  rayonM: 50, nbRetenues: 1, nbVoisines: 0, motif: null,
  centre: { mode: 'empreinte', idu: null, point: null, provenance: null, label: null },
  centreAvertissement: null, marqueurAdresse: null,
  parcellesChoix: [{ idu: 'P1', section: 'AB', numero: '1' }], // non vide → pas d'auto-bascule adresse
  localisation: { communeCode: '75119', communeNom: 'Paris 19e', sections: ['AB'], feuilleLibelle: 'Paris 19e — section AB', feuilleNote: '' },
  selection: selectionActive
    ? { active: true, idus: ['P1'], validePar: '2', valideLe: '2026-09-06T10:00:00Z', acteurNom: 'Arno' }
    : { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null },
  retenuesHorsVue: 0,
});

let container: HTMLDivElement;
let root: Root;
let gets = 0, posts = 0;
let postOk = true; // pilote l'issue du POST valider (succès vs échec)

beforeEach(() => {
  gets = 0; posts = 0; postOk = true;
  global.fetch = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      posts++;
      return postOk
        ? { ok: true, status: 200, json: async () => ({ ok: true, planche: planche(true) }) } as unknown as Response
        : { ok: false, status: 422, json: async () => ({ erreur: 'écriture refusée (base indisponible)' }) } as unknown as Response;
    }
    // GET : la planche initiale. (La liseuse est stubbée → aucune autre requête GET.)
    if (String(input).includes('/api/admin/permis/planche')) gets++;
    return { ok: true, status: 200, json: async () => ({ planche: planche(false) }) } as unknown as Response;
  }) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

async function flush(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
function boutonTexte(txt: string): HTMLButtonElement | null {
  return [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === txt) as HTMLButtonElement | null ?? null;
}

describe('PL-H — remontée planche → bloc « Bâtiments et projection » (comportement, DOM réel)', () => {
  it('(a) « Valider la sélection » réussie → onEmpreinteRecalculee appelé UNE fois ; (c) aucune boucle : le GET initial reste unique', async () => {
    const onEmpreinteRecalculee = vi.fn();
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1, onEmpreinteRecalculee })); });
    await flush();
    expect(gets).toBe(1);                       // GET initial de la planche
    const b = boutonTexte('Valider la sélection');
    expect(b).not.toBeNull();
    expect(b!.disabled).toBe(false);            // composition = parcelle du permis retenue → activable
    act(() => { b!.click(); });
    await flush();
    expect(posts).toBe(1);                       // un seul POST de validation
    expect(onEmpreinteRecalculee).toHaveBeenCalledTimes(1); // le parent va bumper vInstruction → BlocTraceEmprise se re-fetch
    expect(gets).toBe(1);                         // (c) PAS de re-GET de la planche : aucune boucle de rafraîchissement
    expect(container.textContent).toContain('Sélection validée'); // message honnête de succès
  });

  it('(c-bis) POST en ÉCHEC → onEmpreinteRecalculee N’est PAS appelé (pas de faux rafraîchissement) + message honnête', async () => {
    postOk = false;
    const onEmpreinteRecalculee = vi.fn();
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1, onEmpreinteRecalculee })); });
    await flush();
    act(() => { boutonTexte('Valider la sélection')!.click(); });
    await flush();
    expect(posts).toBe(1);
    expect(onEmpreinteRecalculee).not.toHaveBeenCalled(); // échec serveur → on ne rafraîchit rien
    expect(container.textContent).toContain('écriture refusée'); // message honnête, jamais un silence
  });
});

/** Gardes de CÂBLAGE (lecture de source) : le MÊME canal existant est réutilisé, et le retrait côté bloc bâtiments est INCHANGÉ. */
// En env jsdom `import.meta.url` n'est pas une URL file: → on lit depuis la racine du projet (process.cwd() = dossier app).
const DIR = join(process.cwd(), 'app', '(admin)', 'admin', '(protected)', 'permis');
const SRC_PROJECTION = readFileSync(join(DIR, 'ProjectionVue.tsx'), 'utf8');
const SRC_BLOC = readFileSync(join(DIR, 'BlocTraceEmprise.tsx'), 'utf8');
const SRC_PLANCHE = readFileSync(join(DIR, 'PlancheParcelles.tsx'), 'utf8');

describe('PL-H — câblage : réutilise le canal existant (vInstruction), retrait inchangé', () => {
  it('la planche appelle onEmpreinteRecalculee après un recompute, et le PARENT le branche sur vInstruction (canal de CaracteristiquesBloc)', () => {
    expect(SRC_PLANCHE).toContain('onEmpreinteRecalculee?.()');                 // appelé dans le handler poster (pas un effet)
    expect(SRC_PROJECTION).toContain('onEmpreinteRecalculee={() => setVInstruction((v) => v + 1)}'); // MÊME canal que CaracteristiquesBloc.onChange
  });
  it('(b) le RETRAIT depuis le bandeau du bloc bâtiments est INCHANGÉ (POST retirer /planche puis re-fetch local rechargeLocal)', () => {
    expect(SRC_BLOC).toContain("action: 'retirer'");
    expect(SRC_BLOC).toContain("fetch('/api/admin/permis/planche'");
    expect(SRC_BLOC).toContain('setRechargeLocal((n) => n + 1)'); // le canal LOCAL du bloc, tel quel
  });
});
