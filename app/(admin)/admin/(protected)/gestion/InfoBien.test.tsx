// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfoBien, hoteDeLaBulle, DELAI_SURVOL_MS, DELAI_GRACE_MS } from './InfoBien';

/**
 * ══ 🔴🔴 LOT BULLE-INFO-ET-S12 — LA BULLE, MONTÉE POUR DE VRAI ═════════════════════════════════════════════════
 *
 * Les deux constats d'Arno (01/10/2026) sont ici des essais :
 *   (a) « la bulle est coupée par le bord de son bloc » → elle est rendue AU-DESSUS DE TOUT, par un portail dans
 *       `document.body`, donc hors de tout conteneur qui pourrait la rogner ;
 *   (b) « dès que la souris quitte le picto, la bulle se ferme, donc le lien est inatteignable » → survol du picto,
 *       puis de la bulle, puis CLIC RÉEL sur le lien, sans fermeture entre les deux.
 * Et le reste de la demande : sortie de la bulle → fermeture, Échap, clavier, toucher, une seule bulle à la fois,
 * plus d'attribut `title`.
 *
 * ⚠️ POURQUOI DES TEMPORISATEURS SIMULÉS. La bulle vit de deux délais (150 ms au survol, 200 ms de grâce) : les
 * attendre vraiment rendrait la suite lente ET instable. `vi.useFakeTimers` les fait avancer à la demande, ce qui
 * est aussi la seule façon d'éprouver que la grâce couvre bien le trajet du picto vers la bulle.
 *
 * 🔒 Aucune donnée réelle : une clé et une fiche inventées, et `fetch` est simulé — rien ne sort.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FICHE = {
  id: 4242, numero: 'LOT-FICTIF', nature: 'Appartement', typeBien: 'T3', immeuble: 'Résidence Fictive',
  adresse: '1 rue Inventée', codePostal: '92000', commune: 'VILLE-TEST',
  debut: '2020-01-01', fin: null, surfaceM2: null,
  proprietaireNom: 'PROPRIO Fictif', proprietaires: [], occupations: [], driveDossierId: null,
};

let root: Root | null = null;
let hote: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ etat: 'ok', data: FICHE }) })));
});
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  hote?.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter(node: ReactElement): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root!.render(node));
  return hote;
}

const pastille = (c: HTMLElement) => c.querySelector('button.ifb-pastille') as HTMLButtonElement;
/** 🔴 ON LA CHERCHE DANS LE DOCUMENT ENTIER, ET C'EST TOUT LE POINT : elle n'est plus dans l'hôte. */
const laBulle = () => document.querySelector('.ifb-bulle') as HTMLElement | null;
const lien = () => document.querySelector('.ifb-bulle a.ifb-fiche') as HTMLAnchorElement | null;

const survoler = (e: Element) => act(() => { e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
const quitter = (e: Element) => act(() => { e.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
const cliquer = (e: Element) => act(() => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const avancer = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Le survol ouvre après le délai, et la fiche arrive : deux attentes, donc deux vidages de file. */
async function ouvrirAuSurvol(c: HTMLElement): Promise<void> {
  survoler(pastille(c));
  avancer(DELAI_SURVOL_MS);
  await act(async () => { await Promise.resolve(); });
}

const unBien = () => createElement(InfoBien, { cle: 'LOT-FICTIF', titre: '1 rue Inventée — lot LOT-FICTIF' });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 (a) LA BULLE EST AU-DESSUS DE TOUT — ELLE N'EST PLUS DANS SON BLOC
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 (a) la bulle n’est plus coupée : elle sort de son bloc', () => {
  it('🔴 elle est rendue dans le CORPS du document, pas dans la ligne du bien', async () => {
    const c = monter(unBien());
    expect(laBulle()).toBeNull();                       // rien avant le geste : aucune requête inutile
    await ouvrirAuSurvol(c);

    const b = laBulle();
    expect(b).not.toBeNull();
    // 🔴 HORS DE L'HÔTE : aucun conteneur de la modale ne peut plus la rogner.
    expect(c.contains(b)).toBe(false);
    expect(b?.parentElement).toBe(document.body);
  });

  /**
   * 🔴🔴 LE SECOND DÉFAUT MESURÉ À L'ÉCRAN LE 01/10/2026 : EN THÈME SOMBRE, LA BULLE SORTAIT BLANCHE.
   *
   * Les jetons de couleur de l'administration vivent sur `.svv-adm-root[data-theme=…]`, et non sur `:root` : une
   * bulle posée dans `document.body` tombe hors de cette portée et reprend les valeurs claires par défaut. Le
   * portail vise donc la racine de l'administration quand elle existe.
   */
  it('🔴🔴 elle naît DANS la racine de l’administration, pour hériter du thème', async () => {
    const racineAdmin = document.createElement('div');
    racineAdmin.className = 'svv-adm-root';
    racineAdmin.setAttribute('data-theme', 'dark');
    document.body.appendChild(racineAdmin);
    try {
      expect(hoteDeLaBulle()).toBe(racineAdmin);
      const c = monter(unBien());
      await ouvrirAuSurvol(c);
      expect(laBulle()?.parentElement).toBe(racineAdmin);
    } finally {
      racineAdmin.remove();
    }
  });

  it('⚠️ sans cette racine, le corps du document fait le repli — mieux qu’aucune bulle', () => {
    expect(hoteDeLaBulle()).toBe(document.body);
  });

  it('🔴 elle est posée en « fixed » et placée par le module pur (un côté est retenu)', async () => {
    const c = monter(unBien());
    // Un picto mesurable : jsdom rend des rectangles nuls, on en donne un vrai.
    pastille(c).getBoundingClientRect = () =>
      ({ left: 600, top: 400, width: 18, height: 18, right: 618, bottom: 418, x: 600, y: 400,
        toJSON: () => ({}) }) as DOMRect;
    await ouvrirAuSurvol(c);

    const b = laBulle() as HTMLElement;
    expect(b.getAttribute('data-cote')).toBe('droite');
    expect(b.style.left).not.toBe('');
    expect(b.style.top).not.toBe('');
  });

  it('⚠️ le descriptif de la fiche est bien là, et le lien avec', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    expect(laBulle()?.textContent).toMatch(/Résidence Fictive|1 rue Inventée|VILLE-TEST/);
    expect(lien()?.textContent).toBe('Ouvrir la fiche du bien');
    expect(lien()?.getAttribute('target')).toBe('_blank');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 (b) PICTO → BULLE → LIEN, SANS FERMETURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 (b) le lien « Ouvrir la fiche du bien » est atteignable', () => {
  it('🔴🔴 quitter le picto puis entrer dans la bulle : elle RESTE ouverte, et le lien se clique', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);

    // ① la souris quitte le picto : la fermeture est seulement ARMÉE
    quitter(pastille(c));
    avancer(DELAI_GRACE_MS - 50);          // on est encore dans la grâce
    expect(laBulle()).not.toBeNull();

    // ② elle entre dans la bulle : la fermeture est annulée, et le temps peut passer
    survoler(laBulle() as Element);
    avancer(2000);
    expect(laBulle()).not.toBeNull();

    // ③ 🔴 LE CLIC RÉEL SUR LE LIEN : il existe, il est dans la bulle, et le clic ne la ferme pas
    const a = lien() as HTMLAnchorElement;
    expect(a).not.toBeNull();
    cliquer(a);
    expect(laBulle()).not.toBeNull();
  });

  /**
   * 🔴🔴 LE DÉFAUT MESURÉ AU NAVIGATEUR LE 01/10/2026, ET QU'AUCUN ESSAI N'ATTRAPAIT.
   *
   * Les événements de focus TRAVERSENT LE PORTAIL : React les fait remonter par l'arbre des composants. Le focus
   * que l'enfoncement donnait au lien remontait donc jusqu'au `onFocus` de la racine, qui RÉOUVRAIT une bulle déjà
   * ouverte — remettant sa place à `null`. La bulle repartait une image dans le coin de l'écran pour être
   * remesurée, et le relâchement de la souris tombait sur le voile de la modale : le lien ne s'ouvrait JAMAIS.
   * Trace relevée dans le navigateur : « mousedown → ifb-fiche », puis « mouseup → mrt-voile ».
   */
  it('🔴🔴 le focus DANS la bulle ne la replace pas (sans quoi le clic rate le lien)', async () => {
    const c = monter(unBien());
    pastille(c).getBoundingClientRect = () =>
      ({ left: 600, top: 400, width: 18, height: 18, right: 618, bottom: 418, x: 600, y: 400,
        toJSON: () => ({}) }) as DOMRect;
    await ouvrirAuSurvol(c);
    const avant = laBulle() as HTMLElement;
    const place = avant.style.left;
    expect(place).not.toBe('0px');

    // Le focus arrive sur le lien, exactement comme l'enfoncement de la souris le donne.
    act(() => { (lien() as HTMLAnchorElement).dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });

    // 🔴 LA MÊME BULLE, À LA MÊME PLACE : rien n'a été remesuré, donc rien n'a bougé sous le curseur.
    expect(laBulle()).toBe(avant);
    expect((laBulle() as HTMLElement).style.left).toBe(place);
    expect(document.querySelectorAll('.ifb-bulle')).toHaveLength(1);
  });

  it('🔴 sans la grâce, elle se fermerait : passé le délai SANS entrer dans la bulle, elle se ferme', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    quitter(pastille(c));
    avancer(DELAI_GRACE_MS + 10);
    expect(laBulle()).toBeNull();
  });

  it('🔴 sortir DE LA BULLE la ferme', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    survoler(laBulle() as Element);
    quitter(laBulle() as Element);
    avancer(DELAI_GRACE_MS + 10);
    expect(laBulle()).toBeNull();
  });

  it('⚠️ le survol n’ouvre RIEN avant le délai : traverser une liste ne charge pas quarante fiches', () => {
    const c = monter(unBien());
    survoler(pastille(c));
    avancer(DELAI_SURVOL_MS - 50);
    expect(laBulle()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    quitter(pastille(c));
    avancer(DELAI_SURVOL_MS + DELAI_GRACE_MS);
    expect(laBulle()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES SORTIES : ÉCHAP, UN CLIC AILLEURS, LA CROIX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('les trois sorties', () => {
  it('🔴 « Échap » ferme, et rend le focus au picto', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(laBulle()).toBeNull();
    expect(document.activeElement).toBe(pastille(c));
  });

  it('🔴 un clic AILLEURS ferme — c’est aussi l’appui tactile hors de la bulle', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    const ailleurs = document.createElement('button');
    document.body.appendChild(ailleurs);
    act(() => { ailleurs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(laBulle()).toBeNull();
    ailleurs.remove();
  });

  it('🔴 la croix ferme', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    const croix = document.querySelector('.ifb-bulle button.ifb-croix') as HTMLButtonElement;
    expect(croix).not.toBeNull();
    cliquer(croix);
    expect(laBulle()).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE CLAVIER, LE TOUCHER, ET LE NOM DE LA PASTILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('le clavier', () => {
  it('🔴 le focus sur le picto ouvre SANS délai', async () => {
    const c = monter(unBien());
    act(() => { pastille(c).dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(laBulle()).not.toBeNull();
  });

  it('🔴🔴 Tab depuis le picto atteint la bulle — le portail ne perd pas le clavier', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    act(() => { pastille(c).focus(); });
    act(() => {
      pastille(c).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    // Le premier élément atteignable de la bulle est la croix ; le lien vient juste après.
    expect(document.activeElement?.classList.contains('ifb-croix')).toBe(true);
  });

  it('🔴 Maj+Tab depuis le premier élément de la bulle revient au picto : la boucle est fermée', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    const croix = document.querySelector('.ifb-bulle button.ifb-croix') as HTMLButtonElement;
    act(() => { croix.focus(); });
    act(() => {
      croix.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(pastille(c));
  });
});

describe('le toucher', () => {
  /** Au doigt, le navigateur SIMULE un survol : sans garde, l'appui et le survol se battraient. */
  const appuyer = (e: Element) => act(() => {
    e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('🔴 un appui OUVRE, un second appui ferme', async () => {
    const c = monter(unBien());
    appuyer(pastille(c));
    await act(async () => { await Promise.resolve(); });
    expect(laBulle()).not.toBeNull();
    // Le survol simulé n'a rien armé : le temps peut passer sans rien changer.
    avancer(DELAI_SURVOL_MS + DELAI_GRACE_MS);
    expect(laBulle()).not.toBeNull();

    appuyer(pastille(c));
    expect(laBulle()).toBeNull();
  });

  it('🔴 un appui AILLEURS ferme', async () => {
    const c = monter(unBien());
    appuyer(pastille(c));
    await act(async () => { await Promise.resolve(); });
    const ailleurs = document.createElement('button');
    document.body.appendChild(ailleurs);
    act(() => { ailleurs.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); });
    act(() => { ailleurs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(laBulle()).toBeNull();
    ailleurs.remove();
  });
});

describe('le nom de la pastille, et le chevauchement', () => {
  /**
   * 🔴 DEMANDE D'ARNO : « Remplacer l'attribut `title` “Descriptif du bien” par un `aria-label` (même nom pour les
   * lecteurs d'écran, plus de chevauchement). » L'infobulle NATIVE du navigateur se superposait à la bulle.
   */
  it('🔴🔴 plus d’attribut `title` ; l’`aria-label` dit la même chose', () => {
    const c = monter(unBien());
    const b = pastille(c);
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.getAttribute('aria-label')).toMatch(/^Descriptif du bien — /);
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('⚠️ `aria-expanded` suit l’état', async () => {
    const c = monter(unBien());
    await ouvrirAuSurvol(c);
    expect(pastille(c).getAttribute('aria-expanded')).toBe('true');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 UNE SEULE BULLE À LA FOIS, ET LA CASE NE SE COCHE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 une seule bulle ouverte à la fois', () => {
  it('🔴 ouvrir la seconde ferme la première', async () => {
    const c = monter(createElement('div', null,
      createElement(InfoBien, { key: 'a', cle: 'LOT-A', titre: 'Premier bien' }),
      createElement(InfoBien, { key: 'b', cle: 'LOT-B', titre: 'Second bien' })));
    const [un, deux] = [...c.querySelectorAll('button.ifb-pastille')] as HTMLButtonElement[];

    survoler(un);
    avancer(DELAI_SURVOL_MS);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelectorAll('.ifb-bulle')).toHaveLength(1);

    survoler(deux);
    avancer(DELAI_SURVOL_MS);
    await act(async () => { await Promise.resolve(); });
    // 🔴 UNE SEULE, et c'est celle du second bien.
    expect(document.querySelectorAll('.ifb-bulle')).toHaveLength(1);
    expect(laBulle()?.textContent).toMatch(/Second bien/);
  });
});

describe('🔴🔴 cliquer la pastille ne coche pas la case', () => {
  it('🔴🔴 la case du libellé reste décochée', async () => {
    const c = monter(createElement('label', null,
      createElement('input', { type: 'checkbox', defaultChecked: false }),
      'Un bien fictif',
      createElement(InfoBien, { cle: 'LOT-FICTIF', titre: 'Un bien fictif' })));
    const case_ = c.querySelector('input') as HTMLInputElement;

    act(() => { pastille(c).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    cliquer(pastille(c));
    await act(async () => { await Promise.resolve(); });

    expect(case_.checked).toBe(false);
    // …et la bulle, elle, s'est bien ouverte : c'est le clic qui bascule, pas l'enfoncement.
    expect(laBulle()).not.toBeNull();
  });
});
