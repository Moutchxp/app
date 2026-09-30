// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  CONTENEURS, MARQUE, htmlSansMarques, nettoyerDans, releverDans, sombreMaintenant, useLisibiliteSombre,
} from './lisibiliteSombre';

/**
 * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — LA PASSE D'AFFICHAGE, ET CE QU'ELLE NE TOUCHE JAMAIS ═════════════════════
 *
 * ARNO (01/10/2026) : « À l'ÉCRAN, en thème Sombre uniquement […]. NE MODIFIE PAS le HTML envoyé ni stocké : le
 * mail part avec ses couleurs d'origine, noir sur blanc pour le destinataire. Test qui prouve que le HTML envoyé
 * est identique, que l'écran soit en thème Clair ou Sombre. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** La signature d'Arno, telle qu'elle arrive : ses couleurs en attribut `style`, comme tout HTML de courrier. */
const SIGNATURE = '<div style="color:#000000">Service Gestion<br>'
  + '<span style="color:#333">19 avenue Marceau, 92400 Courbevoie</span><br>'
  + '<a href="tel:0184204942" style="color:#1a73e8">01 84 20 49 42</a><br>'
  + '<span style="color:#a30402">Sans Vis-à-Vis</span>'
  + '<img src="logo.png" alt="logo"></div>';

let racine: HTMLDivElement;
let zone: HTMLDivElement;

/**
 * ⚠️ jsdom NE CALCULE PAS LES COULEURS HÉRITÉES ni les feuilles de style : `getComputedStyle` y rend ce que
 * l'attribut `style` porte, et rien de plus. C'est EXACTEMENT ce qu'on veut éprouver ici — la décision prise sur
 * une couleur imposée. Le reste (héritage, classes du mail) relève du navigateur, et l'épreuve à l'écran s'en
 * charge ; ce fichier tient la règle, pas le moteur de rendu.
 */
beforeEach(() => {
  racine = document.createElement('div');
  racine.className = 'svv-adm-root';
  zone = document.createElement('div');
  zone.className = 'cnv-html';
  zone.innerHTML = SIGNATURE;
  racine.appendChild(zone);
  document.body.appendChild(racine);
});
afterEach(() => { racine.remove(); });

const marques = (): string[] => [...zone.querySelectorAll(`[${MARQUE}]`)]
  .map((e) => (e.getAttribute('style') ?? e.tagName));

describe('🔴 ce que la passe relève, et ce qu’elle laisse', () => {
  it('🔴 le noir et le gris foncé de la signature sont relevés', () => {
    releverDans(zone);
    expect(marques()).toContain('color:#000000');
    expect(marques()).toContain('color:#333');
  });

  /** 🔴🔴 « LES COULEURS VIVES (ROUGE, LIENS, ETC.) ET LES IMAGES NE SONT JAMAIS MODIFIÉES » (Arno). */
  it('🔴🔴 le lien, le rouge de la marque et l’image ne sont jamais marqués', () => {
    releverDans(zone);
    expect(marques()).not.toContain('color:#1a73e8');
    expect(marques()).not.toContain('color:#a30402');
    expect(zone.querySelector('img')?.hasAttribute(MARQUE)).toBe(false);
  });

  /**
   * 🔴🔴 UN FOND CLAIR IMPOSÉ ARRÊTE TOUT. Un bloc « background:#fff » avec du texte noir se lit très bien en
   * thème Sombre ; relever son texte le rendrait BLANC SUR BLANC — la correction rendrait illisible ce qui ne
   * l'était pas.
   */
  it('🔴🔴 sous un fond blanc imposé, rien n’est relevé', () => {
    zone.innerHTML = '<div style="background:#ffffff"><p style="color:#000">Facture</p></div>';
    releverDans(zone);
    expect(zone.querySelectorAll(`[${MARQUE}]`)).toHaveLength(0);
  });

  /** ⚠️ ET LA PASSE SE DÉFAIT : repasser en Clair ne doit rien laisser derrière elle. */
  it('⚠️ le nettoyage retire toute trace', () => {
    releverDans(zone);
    expect(zone.querySelectorAll(`[${MARQUE}]`).length).toBeGreaterThan(0);
    nettoyerDans(zone);
    expect(zone.querySelectorAll(`[${MARQUE}]`)).toHaveLength(0);
  });

  /** ⚠️ ELLE EST IDEMPOTENTE : deux passes de suite donnent exactement le même DOM. */
  it('⚠️ deux passes ne s’accumulent pas', () => {
    releverDans(zone);
    const apres1 = zone.innerHTML;
    releverDans(zone);
    expect(zone.innerHTML).toBe(apres1);
  });
});

/**
 * ══ 🔴🔴 LE TEST QU'ARNO DEMANDE EN TOUTES LETTRES ══════════════════════════════════════════════════════════
 *
 * « Test qui prouve que le HTML envoyé est identique, que l'écran soit en thème Clair ou Sombre. »
 */
describe('🔴🔴 le HTML qui part est le MÊME dans les deux thèmes', () => {
  it('🔴🔴 caractère pour caractère', () => {
    // ① THÈME CLAIR : aucune passe n'a eu lieu.
    const enClair = htmlSansMarques(zone);
    // ② THÈME SOMBRE : la passe a marqué ce qu'elle juge illisible…
    releverDans(zone);
    expect(zone.querySelectorAll(`[${MARQUE}]`).length).toBeGreaterThan(0);
    // …et ce qui REMONTE est pourtant identique.
    const enSombre = htmlSansMarques(zone);
    expect(enSombre).toBe(enClair);
    expect(enSombre).toBe(SIGNATURE);
  });

  /**
   * 🔴 LES COULEURS D'ORIGINE SONT INTACTES : « le mail part avec ses couleurs d'origine, noir sur blanc pour le
   * destinataire ». On l'éprouve sur le texte, pas seulement sur l'égalité des deux chaînes.
   */
  it('🔴 le noir de la signature est toujours là dans ce qui part', () => {
    releverDans(zone);
    const html = htmlSansMarques(zone);
    expect(html).toContain('color:#000000');
    expect(html).toContain('color:#333');
    expect(html).not.toContain(MARQUE);
  });

  /**
   * 🔴🔴 ET L'ÉDITEUR REMONTE PAR CE CHEMIN-LÀ. Sans cela, l'attribut d'affichage serait entré dans le brouillon
   * enregistré, donc dans le mail — exactement ce qu'Arno interdit.
   */
  it('🔴🔴 `EditeurRiche` remonte par `htmlSansMarques`, jamais par `innerHTML` brut', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/EditeurRiche.tsx', 'utf8');
    const corps = src.slice(src.indexOf('const remonter = useCallback'), src.indexOf('const retenirSelection'));
    expect(corps).toContain('htmlSansMarques(zone.current)');
    expect(corps).not.toContain('zone.current?.innerHTML');
  });
});

describe('🔴 le thème, lu sur le DOM réel', () => {
  it('🔴 « dark » est sombre, « light » ne l’est pas', () => {
    racine.setAttribute('data-theme', 'dark');
    expect(sombreMaintenant(racine)).toBe(true);
    racine.setAttribute('data-theme', 'light');
    expect(sombreMaintenant(racine)).toBe(false);
  });

  /** ⚠️ « Système » DEMANDE À L'ORDINATEUR : c'est le seul cas où l'attribut ne suffit pas. */
  it('⚠️ « system » s’en remet à `prefers-color-scheme`', () => {
    racine.setAttribute('data-theme', 'system');
    const vrai = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('dark'), addEventListener() {}, removeEventListener() {} }),
    });
    expect(sombreMaintenant(racine)).toBe(true);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vrai });
  });
});

/**
 * ══ 🔴 LE CROCHET : LA PASSE SE REJOUE À LA BASCULE DE THÈME ════════════════════════════════════════════════
 *
 * Sans cela, il faudrait ROUVRIR le mail pour que la correction s'applique — et Arno bascule de thème en
 * regardant un fil.
 */
describe('🔴 la bascule de thème rejoue la passe, sans rouvrir le mail', () => {
  let container: HTMLDivElement;
  let root: Root;

  function Vue({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useLisibiliteSombre(ref, [html]);
    return createElement('div', { ref, className: 'cnv-html', dangerouslySetInnerHTML: { __html: html } });
  }

  beforeEach(() => {
    container = document.createElement('div');
    racine.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); });

  it('🔴 Clair → Sombre marque, Sombre → Clair nettoie', async () => {
    racine.setAttribute('data-theme', 'light');
    await act(async () => { root.render(createElement(Vue, { html: SIGNATURE })); });
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(container.querySelectorAll(`[${MARQUE}]`)).toHaveLength(0);

    await act(async () => { racine.setAttribute('data-theme', 'dark'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(container.querySelectorAll(`[${MARQUE}]`).length).toBeGreaterThan(0);

    await act(async () => { racine.setAttribute('data-theme', 'light'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(container.querySelectorAll(`[${MARQUE}]`)).toHaveLength(0);
  });
});

/** ⚠️ Les trois conteneurs de HTML de courrier sont nommés à UN seul endroit : ils doivent se comporter pareil. */
describe('⚠️ les conteneurs', () => {
  it('l’éditeur, le fil et le corps de message sont tous couverts', () => {
    for (const c of ['.cnv-html', '.edr-zone', '.gst-msg-corps']) expect(CONTENEURS).toContain(c);
  });
});
