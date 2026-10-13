// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { CSS_FENETRES } from './FenetresRedaction';

/**
 * ══ 🔴🔴 LOT PLEIN-ECRAN-DU-COMPOSITEUR-DANS-LA-FICHE ═════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (bien-343) : le plein écran du « Nouveau message » de la fiche se posait sur l'historique, sans voile,
 * sans marge, la barre d'envoi rognée. Il doit être IDENTIQUE à celui de la colonne (la fenêtre de `FenetresRedaction`).
 * Ces cas tiennent : ① l'éditeur confie son plein écran au cadre quand on le lui demande, et SEULEMENT alors ; ② la fiche
 * monte la fenêtre de la colonne au niveau de la page, sans jamais démonter l'éditeur ; ③ la barre d'envoi reste visible.
 * 🔒 Aucune donnée réelle, aucun envoi, aucune écriture.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HDB = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const vif = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((x) => x.replace(/^\s*\/\/.*$/, '')).join('\n');

const CONTEXTE = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;
const BROUILLON = {
  id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion', citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
} as unknown as BrouillonEcran;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, correspondants: [] }))));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const monter = async (onPleinEcran?: () => void) => {
  await act(async () => {
    root.render(createElement(Redaction, {
      brouillon: BROUILLON, contexte: CONTEXTE, onChange: () => {}, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
      ...(onPleinEcran ? { onPleinEcran } : {}),
    } as never));
  });
  await act(async () => { await Promise.resolve(); });
};
const boutonPlein = () => [...container.querySelectorAll('.red-haut button')].find((b) => b.textContent === 'Plein écran') as HTMLButtonElement;

describe('① l’éditeur confie son plein écran au cadre, et seulement quand on le lui demande', () => {
  it('🔴 avec `onPleinEcran` : le clic l’appelle, et l’éditeur ne se met PAS en `.red--plein` lui-même', async () => {
    const plein = vi.fn();
    await monter(plein);
    await act(async () => { boutonPlein().click(); });
    expect(plein).toHaveBeenCalledTimes(1);
    expect(container.querySelector('section.red')?.classList.contains('red--plein')).toBe(false);
  });
  it('🔴 sans `onPleinEcran` (boîte, Répondre sous un mail de l’historique) : exactement comme avant — `.red--plein`, puis « Réduire »', async () => {
    await monter();
    await act(async () => { boutonPlein().click(); });
    expect(container.querySelector('section.red')?.classList.contains('red--plein')).toBe(true);
    expect([...container.querySelectorAll('.red-haut button')].some((b) => b.textContent === 'Réduire')).toBe(true);
  });
});

describe('② la fiche monte la fenêtre plein écran de la colonne, au niveau de la page', () => {
  const code = vif(HDB);
  it('🔴 les classes et la feuille de la colonne : voile, cadre, barre de titre, corps', () => {
    for (const c of ['className="fre-voile"', 'className="fre fre--plein hdb-nouveau-plein"', 'className="fre-titre"', 'className="fre-corps" ref={corpsPlein}']) {
      expect(code, c).toContain(c);
    }
    expect(code).toContain('<style>{CSS_FENETRES}</style>');
  });
  it('🔴 rendue par un portail dans la racine de l’administration (celle qui porte les jetons du thème), pas dans la liste', () => {
    expect(code).toMatch(/nouveauPlein && typeof document !== 'undefined' && createPortal\([\s\S]{0,2600}hoteDeLaBulle\(\),\s*\)/);
    const infoBien = readFileSync('app/(admin)/admin/(protected)/gestion/InfoBien.tsx', 'utf8');
    expect(infoBien).toContain("document.querySelector<HTMLElement>('.svv-adm-root') ?? document.body");
  });
  it('🔴 UN SEUL éditeur, rendu dans un hôte stable que l’on déplace : jamais démonté (le brouillon reste intact)', () => {
    expect(code.match(/<Redaction brouillon=\{nouveau\}/g)).toHaveLength(1);
    expect(code).toMatch(/createPortal\(\s*<Redaction brouillon=\{nouveau\}[\s\S]{0,700}hoteNouveau,\s*\)/);
    expect(code).toContain('place.appendChild(hoteNouveau)');
    expect(code).toContain('dansFenetre={nouveauPlein} fermetureDemandee={fermetureNouveau}');
    expect(code).toContain('onPleinEcran={() => setNouveauPlein(true)}');
  });
  it('la croix ferme par la porte de l’éditeur (comme la colonne) ; réduire et quitter le plein écran le ramènent dans la fiche', () => {
    expect(code).toContain('onClick={() => setFermetureNouveau((n) => n + 1)}');
    expect(code.match(/onClick=\{\(\) => setNouveauPlein\(false\)\}/g)?.length).toBe(3);
  });
});

describe('③ la barre d’envoi reste visible : le corps défile, la barre de titre ne peut être comprimée', () => {
  it('cadre en grille « auto minmax(0,1fr) », corps qui défile, plein écran borné à la hauteur de l’écran', () => {
    expect(CSS_FENETRES).toContain('grid-template-rows:auto minmax(0,1fr)');
    expect(CSS_FENETRES).toMatch(/\.fre-corps\{[^}]*overflow-y:auto/);
    // LOT PLEIN-ECRAN-COMPOSEUR — bornée de haut en bas à l'écran (toute la zone de travail), sans transform.
    expect(CSS_FENETRES).toMatch(/\.fre\.fre--plein\{position:fixed;top:0;right:0;bottom:0;left:0;transform:none/);
    expect(CSS_FENETRES).toMatch(/\.fre-voile\{position:fixed;inset:0/);
  });
});
