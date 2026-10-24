// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocIndiceLoyers, OngletIndices } from './IndicesLoyers';
import { BlocConditionsEntree } from './ConditionsEntree';
import { manquesConditions, versEnvoiConditions, CONDITIONS_VIDES, type SaisieConditions } from '../../../../lib/location/conditionsEntree';
import type { IndiceSaisi, SaisieIndice } from '../../../../lib/location/indicesLoyers';

/**
 * 🔴 Arno (25/10/2026, 423) — LE BLOC « INDICE DES LOYERS » (vrai composant, route simulée : rien n'est écrit) :
 * présélection selon le bien, liste triée avec la dernière utilisation, nouvel indice enregistré puis proposé, doublon refusé avec la
 * valeur existante, champs obligatoires ; l'onglet « Indices » et ses alertes. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;

let container: HTMLDivElement;
let root: Root;
let table: IndiceSaisi[];
let posts: Record<string, unknown>[];
let disponible: boolean;
const vu: { dernier: SaisieIndice | undefined } = { dernier: undefined };
const IRL = (annee: number, trimestre: number, valeur: number, derniere: string | null = null): IndiceSaisi => ({ type: 'irl', annee, trimestre, valeur, derniereUtilisation: derniere });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; disponible = true; vu.dernier = undefined;
  table = [IRL(2025, 2, 145.17, '2026-10-12'), IRL(2026, 2, 146.68), IRL(2025, 4, 145.78, '2026-03-01'),
    { type: 'ilc', annee: 2026, trimestre: 1, valeur: 136.12, derniereUtilisation: null }];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(c);
      const deja = table.find((i) => i.type === c.type && i.annee === c.annee && i.trimestre === c.trimestre);
      if (deja) return reponse({ etat: 'refus', motif: `L’indice existe déjà avec la valeur ${String(deja.valeur).replace('.', ',')} : rien n’est écrasé.`, existant: deja });
      const n: IndiceSaisi = { type: c.type as 'irl', annee: Number(c.annee), trimestre: Number(c.trimestre), valeur: Number(String(c.valeur).replace(',', '.')), derniereUtilisation: null };
      table = [...table, n];
      return reponse({ etat: 'ok', data: n });
    }
    return reponse({ etat: 'ok', data: { disponible, indices: table, alertes: disponible ? [{ type: 'irl', annee: 2025, trimestre: 3, biens: ['3 rue Fictive'] }] : [] } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const clic = async (el: Element): Promise<void> => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
function Hote({ famille, entree = '2026-10-12', initial }: { famille: string | null; entree?: string; initial?: SaisieIndice }) {
  const [v, setV] = useState<SaisieIndice | undefined>(initial);
  useEffect(() => { vu.dernier = v; }, [v]);
  return createElement(BlocIndiceLoyers, { valeur: v, onChange: setV, famille, dateEntree: entree, manque: () => null });
}
const monter = async (props: Parameters<typeof Hote>[0]): Promise<void> => { await act(async () => { root.render(createElement(Hote, props)); }); await calmer(); };
const ouvrir = async (attr: string): Promise<string[]> => {
  await clic(container.querySelector(`[${attr}]`)!);
  return [...container.querySelectorAll('[data-liste-choix] [role="option"]')].map((o) => o.textContent?.replace('✓', '') ?? '');
};

describe('🔴 le bloc « Indice des loyers »', () => {
  it('PRÉSÉLECTION selon le bien : Logement → IRL, Local → ILC, Parking → IRL ; l’indice le plus récent ; la révision à l’anniversaire', async () => {
    await monter({ famille: 'logement' });
    expect(vu.dernier).toEqual({ type: 'irl', reference: '2026-2', revision: '2027-10-12' });
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter({ famille: 'local' });
    expect(vu.dernier).toEqual({ type: 'ilc', reference: '2026-1', revision: '2027-10-12' });
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter({ famille: 'parking' });
    expect(vu.dernier?.type).toBe('irl');
  });

  it('la LISTE : du plus récent au plus ancien, la dernière utilisation (ou « jamais utilisé »), puis « + Saisir un nouvel indice »', async () => {
    await monter({ famille: 'logement' });
    expect(await ouvrir('data-indice-reference')).toEqual([
      '— choisir —',
      'T2 2026 — 146,68 · jamais utilisé',
      'T4 2025 — 145,78 · dernière utilisation le 01/03/2026',
      'T2 2025 — 145,17 · dernière utilisation le 12/10/2026',
      '+ Saisir un nouvel indice',
    ]);
  });

  it('un NOUVEL indice : enregistré (POST), puis proposé dans la liste et choisi', async () => {
    await monter({ famille: 'logement' });
    await ouvrir('data-indice-reference');
    await clic(container.querySelector('[data-option="nouveau"]')!);
    expect(container.querySelector('[data-nouvel-indice]')).not.toBeNull();
    await ouvrir('data-nouvel-indice-trimestre');
    await clic(container.querySelector('[data-option="3"]')!);
    await saisir(container.querySelector('[data-nouvel-indice-annee]') as HTMLInputElement, '2026');
    await saisir(container.querySelector('[data-nouvel-indice-valeur]') as HTMLInputElement, '147,031');
    await clic(container.querySelector('[data-enregistrer-indice]')!);
    expect(posts).toEqual([{ action: 'creer', type: 'irl', annee: 2026, trimestre: 3, valeur: '147,031' }]);
    expect(vu.dernier?.reference).toBe('2026-3');
    expect((await ouvrir('data-indice-reference'))[1]).toBe('T3 2026 — 147,031 · jamais utilisé');
  });

  it('un DOUBLON est refusé, la valeur existante proposée (« Utiliser … ») ; rien n’est écrasé', async () => {
    await monter({ famille: 'logement', initial: { type: 'irl', reference: '', revision: '2027-10-12' } });
    await ouvrir('data-indice-reference');
    await clic(container.querySelector('[data-option="nouveau"]')!);
    await ouvrir('data-nouvel-indice-trimestre');
    await clic(container.querySelector('[data-option="4"]')!);
    await saisir(container.querySelector('[data-nouvel-indice-annee]') as HTMLInputElement, '2025');
    await saisir(container.querySelector('[data-nouvel-indice-valeur]') as HTMLInputElement, '150');
    await clic(container.querySelector('[data-enregistrer-indice]')!);
    expect(container.querySelector('[data-refus-indice]')?.textContent).toContain('rien n’est écrasé');
    expect(table.filter((i) => i.type === 'irl' && i.annee === 2025 && i.trimestre === 4).map((i) => i.valeur)).toEqual([145.78]);
    expect(vu.dernier?.reference).toBe('');
    await clic(container.querySelector('[data-utiliser-existant]')!);
    expect(vu.dernier?.reference).toBe('2025-4');
  });

  it('une révision déjà enregistrée n’est JAMAIS recalculée (Dossier de location en modification)', async () => {
    await monter({ famille: 'logement', entree: '2024-05-01', initial: { type: 'irl', reference: '2025-2', revision: '2025-06-01' } });
    expect(vu.dernier).toEqual({ type: 'irl', reference: '2025-2', revision: '2025-06-01' });
  });

  it('SANS la migration 423 : le bandeau, aucun champ, rien n’est posé (donc rien n’est exigé)', async () => {
    disponible = false;
    await monter({ famille: 'logement' });
    expect(container.querySelector('[data-indice-sans-migration]')).not.toBeNull();
    expect(container.querySelector('[data-indice-type]')).toBeNull();
    expect(vu.dernier).toBeUndefined();
  });
});

describe('🔴 dans le bloc 3 : à droite de « Loyer mensuel », et aucune mise à jour automatique n’en écrase une autre', () => {
  it('la date d’entrée change : le prorata ET la date de révision suivent, tous les deux', async () => {
    const vus: { s: SaisieConditions | null } = { s: null };
    function Bloc({ entree }: { entree: string }) {
      const [s, setS] = useState<SaisieConditions>({ ...CONDITIONS_VIDES, loyer: { principal: '1000', provisions: '' } });
      useEffect(() => { vus.s = s; }, [s]);
      return createElement(BlocConditionsEntree, { valeur: s, onChange: setS, manque: () => null, dateEntree: entree, indice: { famille: 'logement' } });
    }
    await act(async () => { root.render(createElement(Bloc, { entree: '2026-10-12' })); });
    await calmer();
    const paire = container.querySelector('[data-cond-paire="loyer-indice"]')!;
    expect([...paire.querySelectorAll(':scope > .loc-cond-bloc')].map((b) => b.getAttribute('data-cond'))).toEqual(['loyer', 'indice']);
    expect(vus.s?.indice).toEqual({ type: 'irl', reference: '2026-2', revision: '2027-10-12' });
    expect(vus.s?.sommes.prorataLoyer).toBe('645,16');
    await act(async () => { root.render(createElement(Bloc, { entree: '2026-11-21' })); });
    await calmer();
    expect(vus.s?.indice?.revision).toBe('2027-11-21');
    expect(vus.s?.sommes.prorataLoyer).toBe('333,33');
  });
});

describe('🔴 les trois champs sont OBLIGATOIRES (« Reste à renseigner »), seulement quand le bloc est là', () => {
  const base: SaisieConditions = { ...CONDITIONS_VIDES };
  it('bloc absent : rien d’exigé ; bloc présent et vide : type, indice appliqué, date de révision', () => {
    expect(Object.keys(manquesConditions(versEnvoiConditions(base))).filter((k) => k.startsWith('indice'))).toEqual([]);
    const m = manquesConditions(versEnvoiConditions({ ...base, indice: { type: null, reference: '', revision: '' } }));
    expect(Object.keys(m).filter((k) => k.startsWith('indice'))).toEqual(['indice-type', 'indice-reference', 'indice-revision']);
    const plein = manquesConditions(versEnvoiConditions({ ...base, indice: { type: 'irl', reference: '2026-2', revision: '2027-10-12' } }));
    expect(Object.keys(plein).filter((k) => k.startsWith('indice'))).toEqual([]);
  });
});

describe('🔴 l’onglet « Indices » de Paramètres Location', () => {
  it('l’alerte « indice manquant » avec le bien, les listes par type avec la dernière utilisation, « Corriger »', async () => {
    await act(async () => { root.render(createElement(OngletIndices)); });
    await calmer();
    expect(container.querySelector('[data-alerte-indice="irl-2025-3"]')?.textContent).toContain('Indice IRL T3 2025 manquant');
    expect(container.querySelector('[data-alerte-indice="irl-2025-3"]')?.textContent).toContain('3 rue Fictive');
    const lignes = [...container.querySelectorAll('[data-indices-type="irl"] [data-indice-ligne]')].map((l) => l.getAttribute('data-indice-ligne'));
    expect(lignes).toEqual(['irl-2026-2', 'irl-2025-4', 'irl-2025-2']);
    expect(container.querySelector('[data-indice-ligne="irl-2025-2"]')?.textContent).toContain('Dernière utilisation le 12/10/2026');
    await clic(container.querySelector('[data-corriger-indice="irl-2025-2"]')!);
    await saisir(container.querySelector('[data-valeur-corrigee]') as HTMLInputElement, '145,18');
    await clic(container.querySelector('[data-enregistrer-correction]')!);
    expect(posts.at(-1)).toEqual({ action: 'corriger', type: 'irl', annee: 2025, trimestre: 2, valeur: '145,18' });
  });
});
