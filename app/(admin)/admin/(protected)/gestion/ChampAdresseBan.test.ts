// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampAdresseBan, type ChoixAdresse } from './ChampAdresseBan';

/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — L'AUTO-COMPLÉTION D'ADRESSE, MONTÉE POUR DE VRAI ═══════════════════════
 *
 * ARNO (01/10/2026) : « On tape dans ADRESSE → propositions ajustées au fil de la frappe (délai court, 5 à 7
 * résultats, flèches ↑↓ + Entrée, clic). Un choix remplit Adresse (numéro + voie), Code postal et Commune (en
 * majuscules). Saisie libre toujours possible […] pas de blocage : un petit “adresse non vérifiée” discret. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let choix: ChoixAdresse[] = [];
let reponse: unknown = { features: [] };
let appels: string[] = [];

/** La Base Adresse Nationale, doublée. Aucun octet ne sort d'ici — c'est le fournisseur qu'on imite, pas lui. */
const BAN = {
  features: [
    { properties: { label: '1 Rue de l’Essai 92800 Puteaux', name: '1 Rue de l’Essai', postcode: '92800', city: 'Puteaux' } },
    { properties: { label: '2 Rue de l’Essai 92800 Puteaux', name: '2 Rue de l’Essai', postcode: '92800', city: 'Puteaux' } },
    { properties: { label: '3 Rue de l’Essai 75011 Paris', name: '3 Rue de l’Essai', postcode: '75011', city: 'Paris' } },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  choix = [];
  appels = [];
  reponse = BAN;
  vi.stubGlobal('fetch', async (url: string) => {
    appels.push(String(url));
    return { json: async () => reponse } as unknown as Response;
  });
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Un petit hôte qui tient l'état, comme le vrai formulaire : le champ ne s'appartient pas. */
function Hote(): React.ReactElement {
  const [v, setV] = useState('');
  const [verifiee, setVerifiee] = useState(false);
  return createElement(ChampAdresseBan, {
    valeur: v,
    verifiee,
    onChange: (x: string) => { setV(x); setVerifiee(false); },
    onChoisir: (a: ChoixAdresse) => { choix.push(a); setV(a.voie); setVerifiee(true); },
  });
}

const champ = (): HTMLInputElement => container.querySelector('input') as HTMLInputElement;

const taper = (v: string): void => {
  const poser = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    poser?.call(champ(), v);
    champ().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** Le délai court d'Arno, puis la réponse : deux temps, et il faut les deux. */
const attendreLesPropositions = async (): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
};

const propositions = (): string[] =>
  [...container.querySelectorAll('.cab-prop')].map((b) => (b.textContent ?? '').trim());

const touche = (key: string): void => {
  act(() => { champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
};

beforeEach(() => { act(() => { root.render(createElement(Hote)); }); });

describe('🔴 les propositions viennent au fil de la frappe', () => {
  it('🔴 elles paraissent après le délai court, et pas avant', async () => {
    taper('1 rue de l’essai');
    expect(propositions()).toEqual([]);
    await attendreLesPropositions();
    expect(propositions()).toHaveLength(3);
    expect(propositions()[0]).toContain('1 Rue de l’Essai');
  });

  /** ⚠️ EN DESSOUS DE TROIS LETTRES, une requête rendrait la moitié de la France : on n'interroge pas. */
  it('⚠️ deux lettres n’interrogent personne', async () => {
    taper('ru');
    await attendreLesPropositions();
    expect(appels).toEqual([]);
    expect(propositions()).toEqual([]);
  });

  /** 🔴 « 5 à 7 résultats » (Arno) : la demande le dit, et c'est la BAN qui borne. */
  it('🔴 la requête demande au plus sept résultats, à la BAN et à personne d’autre', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('api-adresse.data.gouv.fr/search/');
    expect(appels[0]).toMatch(/limit=[567]/);
    expect(appels[0]).toContain('autocomplete=1');
  });
});

/**
 * ══ 🔴🔴 UN CHOIX REMPLIT LES TROIS CHAMPS ══════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 choisir une adresse', () => {
  it('🔴 au CLIC : adresse, code postal, commune EN MAJUSCULES', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    const ligne = container.querySelectorAll('.cab-prop')[0] as HTMLButtonElement;
    act(() => { ligne.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(choix).toEqual([{ voie: '1 Rue de l’Essai', codePostal: '92800', commune: 'PUTEAUX' }]);
  });

  /** 🔴 LES FLÈCHES ↑↓ PUIS ENTRÉE — Arno les nomme, et un formulaire se remplit souvent sans quitter le clavier. */
  it('🔴 aux FLÈCHES puis ENTRÉE', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    touche('ArrowDown');
    touche('ArrowDown');
    touche('Enter');
    expect(choix).toEqual([{ voie: '2 Rue de l’Essai', codePostal: '92800', commune: 'PUTEAUX' }]);
  });

  /** ⚠️ ↑ DEPUIS LE HAUT REVIENT EN BAS : une liste qui se bloque au premier élément fait croire à une panne. */
  it('⚠️ la flèche du haut boucle sur la dernière proposition', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    touche('ArrowUp');
    touche('Enter');
    expect(choix[0].commune).toBe('PARIS');
  });

  /** ⚠️ ÉCHAP REFERME SANS RIEN CHOISIR, et n'efface pas ce qu'on vient de taper. */
  it('⚠️ Échap referme la liste et garde la saisie', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    touche('Escape');
    expect(propositions()).toEqual([]);
    expect(champ().value).toBe('1 rue de l’essai');
    expect(choix).toEqual([]);
  });

  /** 🔴 LA LISTE SE REFERME APRÈS LE CHOIX : la laisser ouverte masquerait les champs qu'on vient de remplir. */
  it('🔴 la liste se referme une fois l’adresse retenue', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    touche('ArrowDown');
    touche('Enter');
    expect(propositions()).toEqual([]);
  });
});

/**
 * ══ 🔴🔴 « SAISIE LIBRE TOUJOURS POSSIBLE », ET LA MENTION DISCRÈTE ═════════════════════════════════════════
 */
describe('🔴🔴 rien n’est jamais bloqué', () => {
  it('🔴 une adresse tapée sans être choisie porte « adresse non vérifiée »', async () => {
    taper('Calle Mayor 3, Madrid');
    await attendreLesPropositions();
    touche('Escape');
    expect(container.querySelector('.cab-note')?.textContent).toBe('adresse non vérifiée');
    // …et le champ garde ce qu'on a tapé : aucun refus, aucun effacement.
    expect(champ().value).toBe('Calle Mayor 3, Madrid');
  });

  it('🔴 une adresse CHOISIE ne porte pas la mention', async () => {
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    touche('ArrowDown');
    touche('Enter');
    expect(container.querySelector('.cab-note')).toBeNull();
  });

  /**
   * 🔴🔴 LA BAN INDISPONIBLE N'EST PAS UNE PANNE DE LA FICHE. Arno le nomme explicitement — et l'écran ne doit
   * rien dire de plus que sa petite mention : la saisie continue.
   */
  it('🔴🔴 une BAN muette ne montre aucune erreur, et la saisie continue', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('réseau coupé'); });
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    expect(propositions()).toEqual([]);
    expect(container.textContent).not.toContain('erreur');
    expect(container.textContent).not.toContain('Erreur');
    expect(champ().value).toBe('1 rue de l’essai');
    expect(container.querySelector('.cab-note')?.textContent).toBe('adresse non vérifiée');
  });

  /** ⚠️ Une réponse illisible se traite comme une absence de réponse — pas comme une panne. */
  it('⚠️ une réponse vide ne casse rien', async () => {
    reponse = {};
    taper('1 rue de l’essai');
    await attendreLesPropositions();
    expect(propositions()).toEqual([]);
  });
});
