// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampClassement } from './ChampClassement';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';

/**
 * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LES TROIS ÉTATS DU BLOC « CLASSER CE MAIL » ═══════════════════════════════
 *
 * CE QU'IL Y AVAIT : une phrase grise (« Aucun classement — ce message partira à classer ») suivie de deux liens
 * en petit. Le geste principal — rattacher ce mail à un bien — était caché dans un lien de la taille d'une note
 * de bas de page.
 *
 * 🔴 LA DEMANDE D'ARNO : deux grandes cases côte à côte, de même hauteur ; rouge plein « Rattacher » à gauche,
 * blanche « Interne » à droite. Puis UNE case verte quand c'est décidé, et « Réinitialiser » dessous.
 *
 * ⚠️ CE FICHIER MONTE LE VRAI COMPOSANT et clique dessus. Un test qui chercherait les mots dans le source
 * prouverait qu'ils sont écrits, pas qu'ils arrivent à l'écran ni que le clic fait ce qu'il promet.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const gestes = { onRattacher: vi.fn(), onInterne: vi.fn(), onReinitialiser: vi.fn() };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  gestes.onRattacher.mockReset(); gestes.onInterne.mockReset(); gestes.onReinitialiser.mockReset();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const LOT = (cle: string, libelle: string): CibleBrouillon => ({ sorte: 'lot', cle, id: null, libelle });

const monter = (o: {
  cibles?: CibleBrouillon[]; interne?: boolean; sansDestinataire?: boolean;
  interneDisponible?: boolean; persistant?: boolean;
} = {}) => {
  act(() => {
    root.render(createElement(ChampClassement, {
      cibles: o.cibles ?? [],
      interne: o.interne === true,
      onRattacher: o.sansDestinataire === true ? undefined : gestes.onRattacher,
      onInterne: gestes.onInterne,
      onReinitialiser: gestes.onReinitialiser,
      interneDisponible: o.interneDisponible !== false,
      persistant: o.persistant !== false,
    } as never));
  });
};

const cases = () => [...container.querySelectorAll('.ccl-case')];
const boutonPar = (re: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => re.test((b.textContent ?? '').trim())) as HTMLButtonElement | undefined;

describe('🔴 ① rien n’est décidé : DEUX cases, moitié-moitié', () => {
  it('🔴 « Rattacher » en ROUGE à gauche, « Interne » en BLANC à droite', () => {
    monter();
    const c = cases();
    expect(c).toHaveLength(2);
    expect(c[0].textContent).toContain('Rattacher');
    expect(c[0].className).toContain('ccl-case--rouge');
    expect(c[1].textContent).toContain('Interne');
    expect(c[1].className).toContain('ccl-case--blanche');
  });

  it('🔴 « Rattacher » ouvre la modale', () => {
    monter();
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onRattacher).toHaveBeenCalledTimes(1);
  });

  it('🔴 le mail part « à classer » tant que rien n’est choisi, et le bloc le DIT', () => {
    monter();
    expect(container.textContent).toContain('à classer');
  });

  /** ⚠️ UN BOUTON INERTE DIT POURQUOI. Éteint sans motif, il se lit comme une panne. */
  it('⚠️ sans destinataire, « Rattacher » est inerte et dit pourquoi', () => {
    monter({ sansDestinataire: true });
    expect((cases()[0] as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('Ajoutez d’abord un destinataire');
  });

  it('⚠️ sans la migration 281, « Interne » est inerte et dit pourquoi', () => {
    monter({ interneDisponible: false });
    expect((cases()[1] as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('migration 281');
  });
});

describe('🔴 ② des biens cochés : UNE case VERTE « Rattaché »', () => {
  it('🔴 une seule case, verte, et le MOT porte l’information', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421')] });
    const c = cases();
    expect(c).toHaveLength(1);
    expect(c[0].className).toContain('ccl-case--verte');
    expect(c[0].textContent).toContain('Rattaché');
  });

  it('🔴 la liste courte des biens est SOUS le mot', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421')] });
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('28 av. Marceau — lot 421');
  });

  it('🔴 au-delà de deux biens, « +N » compte CE QU’ON NE MONTRE PAS', () => {
    monter({ cibles: [LOT('1', 'A'), LOT('2', 'B'), LOT('3', 'C'), LOT('4', 'D')] });
    expect(container.querySelector('.ccl-case-detail')?.textContent).toBe('A, B, +2');
  });

  it('🔴 un clic sur la case verte ROUVRE la modale', () => {
    monter({ cibles: [LOT('421', '28 av. Marceau — lot 421')] });
    act(() => { (cases()[0] as HTMLButtonElement).click(); });
    expect(gestes.onRattacher).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 ③ « Interne » : UNE case VERTE, et une animation', () => {
  it('🔴 le clic pose le choix TOUT DE SUITE — l’animation n’attend rien', () => {
    monter();
    act(() => { (cases()[1] as HTMLButtonElement).click(); });
    expect(gestes.onInterne).toHaveBeenCalledTimes(1);
  });

  it('🔴 une seule case verte « Interne », et plus de case rouge', () => {
    monter({ interne: true });
    const c = cases();
    expect(c).toHaveLength(1);
    expect(c[0].className).toContain('ccl-case--verte');
    expect(c[0].textContent).toContain('Interne');
    expect(container.querySelector('.ccl-case--rouge')).toBeNull();
  });

  /** 🔴 LES DEUX RÉPONSES S'EXCLUENT : il n'y a JAMAIS deux cases vertes. */
  it('🔴 jamais deux cases vertes, même si les deux états arrivaient ensemble', () => {
    monter({ interne: true, cibles: [LOT('421', 'A')] });
    expect(container.querySelectorAll('.ccl-case--verte')).toHaveLength(1);
  });
});

describe('🔴 « Réinitialiser » revient à l’état initial', () => {
  it('🔴 il est là dès qu’une décision est prise, et pas avant', () => {
    monter();
    expect(boutonPar(/^Réinitialiser$/)).toBeUndefined();
    monter({ interne: true });
    expect(boutonPar(/^Réinitialiser$/)).toBeDefined();
    monter({ cibles: [LOT('421', 'A')] });
    expect(boutonPar(/^Réinitialiser$/)).toBeDefined();
  });

  it('🔴 le clic demande la remise à zéro', () => {
    monter({ cibles: [LOT('421', 'A')] });
    act(() => { boutonPar(/^Réinitialiser$/)?.click(); });
    expect(gestes.onReinitialiser).toHaveBeenCalledTimes(1);
  });

  it('🔴 remis à zéro, on retrouve EXACTEMENT les deux cases du départ', () => {
    monter({ cibles: [LOT('421', 'A')] });
    monter({ cibles: [], interne: false });
    const c = cases();
    expect(c).toHaveLength(2);
    expect(c[0].className).toContain('ccl-case--rouge');
    expect(c[1].className).toContain('ccl-case--blanche');
  });
});

/**
 * ⚠️ SANS LA MIGRATION 285, LE CHOIX NE SURVIT PAS À LA FERMETURE DE LA FENÊTRE. On le DIT : laisser croire
 * qu'un travail de classement est gardé alors qu'il est perdu est exactement le silence que ce module refuse.
 */
describe('⚠️ la persistance se dit quand elle manque', () => {
  it('rien n’est annoncé dans le cas ordinaire', () => {
    monter();
    expect(container.textContent).not.toContain('migration 285');
  });

  it('🔴 sans la migration 285, le bloc prévient que le choix ne sera pas retrouvé', () => {
    monter({ persistant: false });
    expect(container.textContent).toContain('migration 285');
    expect(container.textContent).toContain('ne sera pas retrouvé');
  });
});

describe('garanties d’écran (statiques)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/ChampClassement.tsx', 'utf8');

  /** Règle du module : aucune couleur en dur, uniquement des jetons de charte. Le blanc du texte sur le rouge
   *  plein est la seule exception admise — c'est une valeur de contraste, pas une couleur de marque. */
  it('aucune couleur en dur hors le blanc du texte sur fond rouge', () => {
    const couleurs = (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((c) => c !== '#fff' && c !== '#000');
    expect(couleurs).toEqual([]);
  });

  /** 🔴 LES DEUX CASES FONT CHACUNE LA MOITIÉ, et de même hauteur : c'est la demande, au mot près. */
  it('🔴 deux colonnes égales, et des hauteurs alignées', () => {
    expect(src).toContain('grid-template-columns:1fr 1fr');
    expect(src).toContain('align-items:stretch');
  });

  /** EXIGENCE TRANSVERSE DU DÉPÔT : qui demande moins de mouvement n'en reçoit aucun. */
  it('⚠️ l’animation respecte `prefers-reduced-motion`', () => {
    expect(src).toContain('prefers-reduced-motion');
    const bloc = src.slice(src.indexOf('prefers-reduced-motion'));
    expect(bloc).toContain('animation:none');
  });

  /** La règle de coupe vient du module PUR : l'écran place et peint, il ne décide pas. */
  it('le résumé des biens vient du module pur', () => {
    expect(src).toContain('resumeBiensRattaches');
  });
});
