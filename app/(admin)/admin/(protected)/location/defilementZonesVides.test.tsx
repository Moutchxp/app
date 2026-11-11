// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilLocation } from './AccueilLocation';
import { CSS_LOCATION_ECRANS } from './commun';

/**
 * 🔴🔴 ARNO (11/11/2026) — LA MOLETTE FAIT DÉFILER LA PAGE AU-DESSUS DES ESPACES VIDES DE L'ACCUEIL DE LA LOCATION.
 *
 * Défaut constaté : pointeur dans l'espace vide sous la barre de recherche, ou dans celui sous les trois cartes (avant
 * « Locataires en préavis »), la page ne défilait pas. Diagnostic au vrai Chrome (`document.elementFromPoint`) : ces deux
 * espaces sont l'espace RÉSERVÉ `.loc-zone-resultats` (101 px), qui portait `overflow-y:auto` + `overscroll-behavior:contain`.
 * Rien à y faire défiler (hauteur de contenu = hauteur visible), et `contain` interdit à la molette de passer à la page.
 *
 * L'épreuve rend le VRAI composant, lit le CSS qu'il pose réellement, et rejoue la règle de Chrome pour une molette vers le
 * bas : en remontant du point visé jusqu'à la page, le premier conteneur de défilement qui PEUT encore défiler prend la
 * molette ; un conteneur de défilement qui ne peut plus défiler la laisse passer — sauf s'il porte `overscroll-behavior:
 * contain` (ou `none`), qui l'arrête là. Si rien ne la prend ni ne l'arrête, c'est la page qui défile.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Regle = { selecteurs: string[]; decl: Record<string, string> };

/** Les règles de premier niveau d'une feuille (commentaires et blocs `@media` ôtés — ils ne touchent pas ces propriétés). */
function regles(css: string): Regle[] {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Regle[] = [];
  // Lecture au compteur d'accolades : seuls les blocs de PREMIER niveau hors « @… » sont des règles retenues.
  let profondeur = 0;
  let debut = 0;
  let tete = '';
  let ignore = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '{') {
      if (profondeur === 0) { tete = s.slice(debut, i).trim(); ignore = tete.startsWith('@'); debut = i + 1; }
      profondeur += 1;
    } else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0) {
        if (!ignore) {
          const decl: Record<string, string> = {};
          for (const d of s.slice(debut, i).split(';')) {
            const k = d.indexOf(':');
            if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).replace(/!important/, '').trim();
          }
          out.push({ selecteurs: tete.split(',').map((x) => x.trim()).filter(Boolean), decl });
        }
        debut = i + 1;
      }
    }
  }
  return out;
}

/** La valeur d'une propriété pour un élément : la dernière règle qui la pose l'emporte (ordre des feuilles de la page). */
function valeur(el: Element, feuille: Regle[], props: string[], defaut: string): string {
  let v = defaut;
  for (const r of feuille) {
    const touche = r.selecteurs.some((s) => { try { return el.matches(s); } catch { return false; } });
    if (!touche) continue;
    for (const p of props) {
      const brut = r.decl[p];
      if (brut !== undefined) v = brut.split(/\s+/).pop() ?? brut;
    }
  }
  return v;
}

/** Un nom lisible (jamais l'élément lui-même : son affichage par vitest, propriétés React comprises, est interminable). */
const nom = (el: Element): string => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;

/** Qui reçoit une molette vers le bas posée sur `cible` : « page », ou l'élément qui la prend / l'arrête. */
function molette(cible: Element, feuille: Regle[]): { recoit: 'page' } | { recoit: 'element'; el: string; pourquoi: 'defile' | 'contain' } {
  for (let el: Element | null = cible; el && el !== document.body; el = el.parentElement) {
    const oy = valeur(el, feuille, ['overflow', 'overflow-y'], 'visible');
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const h = el as HTMLElement;
    if (h.scrollTop + h.clientHeight < h.scrollHeight) return { recoit: 'element', el: nom(el), pourquoi: 'defile' };
    const ob = valeur(el, feuille, ['overscroll-behavior', 'overscroll-behavior-y'], 'auto');
    if (ob === 'contain' || ob === 'none') return { recoit: 'element', el: nom(el), pourquoi: 'contain' };
  }
  return { recoit: 'page' };
}

const feuilleDeLaPage = (): Regle[] => [...document.querySelectorAll('style')].flatMap((s) => regles(s.textContent ?? ''));

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('q=')) {
      const l = (id: number) => ({ id, titre: `EXEMPLE ${id}`, telephone: null, email: null, adresse: null, detail: null, ancien: false });
      return ok({ proprietaires: Array.from({ length: 20 }, (_, i) => l(i + 1)), locataires: [], syndics: [], biens: [], tronque: false });
    }
    return ok({ lignes: [], personnes: [], biens: [], tronque: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.querySelectorAll('style').forEach((s) => s.remove()); });

async function rendreAccueil(): Promise<void> {
  await act(async () => { root.render(createElement(AccueilLocation)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('Accueil de la Location — la molette au-dessus des espaces vides fait défiler la PAGE', () => {
  it('espace vide sous la barre de recherche ([data-resultats]) : la page défile', async () => {
    await rendreAccueil();
    const zone = container.querySelector('[data-resultats]')!;
    expect(zone).not.toBeNull();
    expect(molette(zone, feuilleDeLaPage())).toEqual({ recoit: 'page' });
  });

  it('espace vide sous les trois cartes, avant « Locataires en préavis » ([data-espace-preavis]) : la page défile', async () => {
    await rendreAccueil();
    const zone = container.querySelector('[data-espace-preavis]')!;
    expect(zone).not.toBeNull();
    expect(molette(zone, feuilleDeLaPage())).toEqual({ recoit: 'page' });
  });

  it('TÉMOIN : avec l’ancienne règle (overflow-y:auto + overscroll-behavior:contain), la molette était retenue — c’est bien elle', async () => {
    await rendreAccueil();
    const ancienne = regles('.loc-zone-resultats{box-sizing:border-box;height:101px;flex:0 0 auto;overflow-y:auto;overscroll-behavior:contain}');
    for (const sel of ['[data-resultats]', '[data-espace-preavis]']) {
      const r = molette(container.querySelector(sel)!, [...feuilleDeLaPage(), ...ancienne]);
      expect(r).toMatchObject({ recoit: 'element', pourquoi: 'contain' });
    }
  });

  it('les espaces réservés gardent leur hauteur (la mise en page ne bouge pas) mais ne sont plus des zones de défilement', () => {
    const r = regles(CSS_LOCATION_ECRANS).filter((x) => x.selecteurs.includes('.loc-zone-resultats'));
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.decl.height === '101px')).toBe(true);
    for (const x of r) {
      expect(x.decl['overflow-y']).toBeUndefined();
      expect(x.decl.overflow).toBeUndefined();
      expect(x.decl['overscroll-behavior']).toBeUndefined();
    }
  });

  it('le panneau de résultats défile seul tant qu’il a de quoi défiler, puis, AU BOUT, la molette passe à la page', async () => {
    await rendreAccueil();
    const champ = container.querySelector('input[type="search"]') as HTMLInputElement;
    const regler = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { regler.call(champ, 'EXEMPLE'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    const panneau = container.querySelector('[data-panneau]') as HTMLElement;
    expect(panneau).not.toBeNull();
    const ligne = panneau.querySelector('.loc-res-ligne') ?? panneau;
    Object.defineProperty(panneau, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(panneau, 'clientHeight', { configurable: true, value: 300 });
    panneau.scrollTop = 0;
    expect(molette(ligne, feuilleDeLaPage())).toMatchObject({ recoit: 'element', pourquoi: 'defile', el: nom(panneau) });
    Object.defineProperty(panneau, 'scrollTop', { configurable: true, value: 600 });
    expect(molette(ligne, feuilleDeLaPage())).toEqual({ recoit: 'page' });
  });
});

describe('Gestion, pleines pages Préavis et RDV / Tâches — aucun conteneur ne retient la molette', () => {
  // Contrôlé au vrai Chrome le 11/11/2026 (aucun élément « contain » ni zone de défilement vide sur /admin/gestion,
  // /admin/location/preavis, /admin/gestion?ecran=preavis, /admin/gestion?ecran=taches) ; la garde empêche le retour.
  const racine = join(process.cwd(), 'app/(admin)/admin/(protected)');
  const fichiers = [
    'location/commun.tsx', 'location/AccueilLocation.tsx', 'location/EcransLocation.tsx', 'location/PreavisAccueil.tsx',
    'location/preavis/page.tsx', 'gestion/GestionVue.tsx', 'gestion/TableauTaches.tsx', 'gestion/LigneTache.tsx',
    'gestion/TachesDuBien.tsx', 'gestion/HistoriqueTaches.tsx',
  ];
  it.each(fichiers)('%s ne pose aucun overscroll-behavior:contain', (f) => {
    const css = readFileSync(join(racine, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\s+/g, '');
    expect(css).not.toMatch(/overscroll-behavior(-y)?:(contain|none)/);
  });
});
