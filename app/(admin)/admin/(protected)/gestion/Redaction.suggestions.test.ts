// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ChampDestinataires } from './Redaction';

/**
 * CORRECTIF DU 24/09/2026 — LA SUGGESTION QU'ON NE POUVAIT PAS CHOISIR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ARNO A VU. Il tape deux caractères dans « À », la liste de suggestions s'ouvre, il clique une suggestion —
 * et le champ crée une pastille avec le texte TAPÉ (« a. »), marquée « adresse incorrecte ». L'adresse choisie n'entre
 * jamais.
 *
 * LA CAUSE, établie par ce fichier avant d'être corrigée : cliquer une suggestion fait d'abord PERDRE LE FOCUS au
 * champ. `onBlur` valide alors le texte en cours (« a. »), vide la saisie — et la liste, conditionnée à deux
 * caractères saisis, DISPARAÎT du DOM avant que le clic n'arrive. Le clic ne rencontre plus rien.
 *
 * C'est un défaut d'ordre des événements, pas de logique : il ne se voit qu'en le rejouant. D'où ce fichier, qui le
 * rejoue à la SOURIS, au CLAVIER et au TOUCHER — trois chemins, trois façons de le casser à nouveau.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUGGESTIONS = [
  { adresse: 'a.jorel@sansvisavis.com', nom: 'Arno Jorel' },
  { adresse: 'a.martin@orange.fr', nom: null },
];

let container: HTMLDivElement;
let root: Root;
let valeurs: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  valeurs = [];
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); }); };

/** Monte le champ, et laisse le test relire `valeurs` après chaque geste. */
const monter = async () => {
  const rendre = () => root.render(createElement(ChampDestinataires, {
    libelle: 'À', valeurs, suggestions: SUGGESTIONS,
    onChange: (v: string[]) => { valeurs = v; rendre(); },
    onChercher: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};

const champ = () => container.querySelector('input') as HTMLInputElement;
const propositions = () => [...container.querySelectorAll('.red-suggestion')] as HTMLButtonElement[];
const pastilles = () => [...container.querySelectorAll('.red-pastille')].map((p) => p.textContent ?? '');
/**
 * ⚠️ `focusout`, PAS `blur` : depuis React 17, `onBlur` est branché sur l'événement `focusout`, qui remonte. Un
 * `blur` synthétique ne déclenche RIEN — et une épreuve qui ne déclenche rien conclut à tort que tout va bien.
 * C'est ce détail qui distingue une reproduction fidèle d'une reproduction qui se ment à elle-même.
 */
const perdreLeFocus = async () => {
  await act(async () => { champ().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await calmer();
};

/** Taper : React écoute `input`, pas l'affectation directe de `value`. */
const taper = async (texte: string) => {
  await act(async () => {
    const e = champ();
    e.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(e, texte);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await calmer();
};

describe('🔴 LE SCÉNARIO D’ARNO, À LA SOURIS', () => {
  it('deux caractères tapés → la liste de suggestions s’ouvre (elle est CONSERVÉE)', async () => {
    await monter();
    await taper('a.');
    expect(propositions()).toHaveLength(2);
    expect(propositions()[0].textContent).toContain('a.jorel@sansvisavis.com');
  });

  it('🔴 cliquer une suggestion insère l’ADRESSE COMPLÈTE — jamais le texte tapé', async () => {
    await monter();
    await taper('a.');
    // Un VRAI clic de souris, dans l'ordre du navigateur et avec les MÊMES temps morts :
    //   `mousedown` → perte du focus → 🔴 React REPEINT (l'événement est « discret », il est vidé tout de suite) →
    //   `mouseup` → `click`. Tout jouer d'un bloc masquerait le défaut : le bouton serait encore là au moment du clic.
    const b = propositions()[0];
    await act(async () => { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await perdreLeFocus();
    await act(async () => {
      b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      b.click();
    });
    await calmer();
    expect(valeurs).toEqual(['a.jorel@sansvisavis.com']);
    // 🔴 AUCUNE pastille parasite : c'est exactement ce qu'Arno a vu (« a. », marquée incorrecte).
    expect(valeurs).not.toContain('a.');
    expect(pastilles().join(' ')).not.toContain('red-pastille--fautive');
  });

  it('…et la saisie est VIDÉE : on enchaîne un second destinataire sans effacer à la main', async () => {
    await monter();
    await taper('a.');
    await act(async () => { propositions()[0].click(); });
    await calmer();
    expect(champ().value).toBe('');
  });

  it('le NOM est affiché quand on le connaît, et l’adresse reste lisible dans l’infobulle', async () => {
    await monter();
    await taper('a.');
    await act(async () => { propositions()[0].click(); });
    await calmer();
    const pastille = container.querySelector('.red-pastille-texte') as HTMLElement;
    expect(pastille.textContent).toContain('Arno Jorel');
    expect(container.querySelector('.red-pastille')?.getAttribute('title')).toContain('a.jorel@sansvisavis.com');
  });

  it('une suggestion SANS nom connu affiche simplement l’adresse', async () => {
    await monter();
    await taper('a.');
    await act(async () => { propositions()[1].click(); });
    await calmer();
    expect(valeurs).toEqual(['a.martin@orange.fr']);
    expect(container.querySelector('.red-pastille-texte')?.textContent).toBe('a.martin@orange.fr');
  });
});

describe('AU CLAVIER — flèches puis Entrée', () => {
  const touche = async (key: string) => {
    await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    await calmer();
  };

  it('🔴 flèche bas puis Entrée choisit la suggestion MISE EN AVANT, pas le texte tapé', async () => {
    await monter();
    await taper('a.');
    await touche('ArrowDown');
    expect(propositions()[0].getAttribute('aria-selected')).toBe('true');
    await touche('Enter');
    expect(valeurs).toEqual(['a.jorel@sansvisavis.com']);
  });

  it('deux flèches bas descendent d’un cran', async () => {
    await monter();
    await taper('a.');
    await touche('ArrowDown');
    await touche('ArrowDown');
    await touche('Enter');
    expect(valeurs).toEqual(['a.martin@orange.fr']);
  });

  it('flèche haut remonte, et ne sort jamais de la liste', async () => {
    await monter();
    await taper('a.');
    await touche('ArrowDown'); await touche('ArrowDown'); await touche('ArrowUp'); await touche('ArrowUp');
    await touche('Enter');
    expect(valeurs).toEqual(['a.jorel@sansvisavis.com']);
  });

  it('SANS avoir choisi de suggestion, Entrée valide le texte tapé — le comportement d’avant est CONSERVÉ', async () => {
    await monter();
    await taper('quelquun@ailleurs.fr');
    await touche('Enter');
    expect(valeurs).toEqual(['quelquun@ailleurs.fr']);
  });

  it('Échap referme la liste sans rien choisir', async () => {
    await monter();
    await taper('a.');
    await touche('Escape');
    expect(propositions()).toHaveLength(0);
    expect(valeurs).toEqual([]);
  });
});

describe('AU TOUCHER (iPhone)', () => {
  it('🔴 un toucher sur une suggestion insère l’adresse complète', async () => {
    await monter();
    await taper('a.');
    // Sur iOS : `touchstart`, puis `mousedown` (qui fait perdre le focus), le repeint, puis `click`.
    const b = propositions()[0];
    await act(async () => {
      b.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await perdreLeFocus();
    await act(async () => { b.click(); });
    await calmer();
    expect(valeurs).toEqual(['a.jorel@sansvisavis.com']);
  });

  it('les suggestions restent des cibles d’au moins 44 px', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    expect(css).toContain('.red-suggestion{width:100%;min-height:44px');
  });
});

describe('CE QUI NE CHANGE PAS', () => {
  it('la perte de focus VALIDE toujours une adresse tapée à la main — on ne perd pas ce qu’on a écrit', async () => {
    await monter();
    await taper('quelquun@ailleurs.fr');
    await perdreLeFocus();
    expect(valeurs).toEqual(['quelquun@ailleurs.fr']);
  });

  it('la virgule et le point-virgule valident encore, et le collage d’une liste entière marche', async () => {
    await monter();
    await taper('a@b.fr, c@d.fr;');
    expect(valeurs).toEqual(['a@b.fr', 'c@d.fr']);
  });

  it('une adresse fautive est signalée par un MOT dans son infobulle, pas seulement par la couleur', async () => {
    await monter();
    await taper('pasuneadresse');
    await perdreLeFocus();
    const p = container.querySelector('.red-pastille') as HTMLElement;
    expect(p.className).toContain('red-pastille--fautive');
    expect(p.getAttribute('title')).toContain('incorrecte');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'AUTRE DÉFAUT VU PAR ARNO LE MÊME JOUR — LE CHAMP « OBJET » HAUT DE HUIT LIGNES.
 *
 * La classe `red-saisie` porte `flex:1 1 8rem`. Dans la barre de destinataires, qui est une LIGNE, ces 8 rem sont une
 * largeur de départ. Mais le champ Objet vit dans `red-champ`, qui est une COLONNE : la même base y devenait une
 * HAUTEUR. D'où un champ d'une seule ligne affiché sur huit.
 *
 * L'épreuve lit la feuille de style du composant, faute de moteur de rendu dans jsdom (il ne calcule aucune mise en
 * page). Elle ne prouve pas le pixel ; elle prouve que la règle qui corrige est TOUJOURS LÀ — et c'est elle qu'un
 * remaniement distrait retirerait.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LE CHAMP « OBJET » TIENT SUR UNE SEULE LIGNE, COMME DANS GMAIL', () => {
  const css = () => readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');

  it('la classe du champ plein NEUTRALISE la base de 8 rem héritée de la saisie', () => {
    expect(css()).toContain('.red-saisie--pleine{flex:0 0 auto;');
  });

  it('…et elle garde une cible tactile d’au moins 44 px', () => {
    const regle = css().split('.red-saisie--pleine{')[1].split('}')[0];
    expect(regle).toContain('min-height:44px');
  });

  it('la saisie des destinataires, elle, GARDE sa base de 8 rem : c’est une largeur, et elle est utile', () => {
    expect(css()).toContain('.red-saisie{flex:1 1 8rem;');
  });

  it('l’objet reste un « input », jamais un « textarea » — un objet ne se rédige pas sur plusieurs lignes', () => {
    expect(css()).toContain('<input id="red-objet"');
    expect(css()).not.toContain('<textarea id="red-objet"');
  });
});
