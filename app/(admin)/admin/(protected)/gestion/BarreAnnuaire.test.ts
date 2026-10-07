// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { BarreAnnuaire } from './BarreAnnuaire';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE — LA BARRE ANNUAIRE DE L'ACCUEIL, MONTÉE POUR DE VRAI ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « un grand champ de saisie sur toute la largeur, avec le libellé “Annuaire” à sa droite.
 * Pendant la saisie, une liste de suggestions des contacts de l'annuaire. Réutilise la recherche existante de
 * l'annuaire, pas une seconde recherche maison. Clic sur un locataire → fiche locataire ; clic sur un
 * propriétaire → fiche propriétaire. Clavier : flèches haut/bas, Entrée, Échap. “Aucun contact trouvé” si rien ne
 * correspond. »
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Et AUCUNE VRAIE FICHE N'EST OUVERTE — ce fichier vérifie le LIEN que le
 * code produit (`FicheUrl`), comme Arno le demande, jamais la fiche elle-même.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** ⚠️ `fin: null` = ENCORE EN GESTION (règle de la fiche propriétaire, `bienEnGestion`). */
const BIEN = { adresse: '67 rue de Normandie', commune: 'COURBEVOIE', fin: null };
/** Ce que `rechercherPersonnes` rend, réduit à ce que la barre lit. */
let personnesServies: unknown[];
let urls: string[];
let fiches: FicheUrl[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = []; fiches = [];
  personnesServies = [
    { sujet: 'proprietaire', id: 12, nomAffiche: 'Mme ABDELLATIF Névine', roles: ['proprietaire'], autreFicheId: null, biens: [BIEN] },
    { sujet: 'locataire', id: 45, nomAffiche: 'M. ROI Nathan', roles: ['locataire'], autreFicheId: null, biens: [BIEN] },
  ];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return {
      ok: true, json: async () => ({ etat: 'ok', data: { personnes: personnesServies } }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  act(() => { root.unmount(); }); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks();
});

const monter = async () => {
  await act(async () => {
    root.render(createElement(BarreAnnuaire, { onFiche: (f: FicheUrl) => fiches.push(f) }));
  });
};
const champ = (): HTMLInputElement => container.querySelector('.gst-annuaire-champ') as HTMLInputElement;
/** Taper, puis laisser passer le délai : la barre n'interroge pas à chaque touche. */
const taper = async (t: string) => {
  await act(async () => {
    const c = champ();
    const poser = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    poser?.call(c, t);
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { vi.advanceTimersByTime(300); });
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
};
const items = () => [...container.querySelectorAll('.gst-annuaire-item')] as HTMLButtonElement[];
/**
 * ⚠️ ON DÉSIGNE UNE SUGGESTION PAR SON NOM, JAMAIS PAR SA PLACE. Depuis le lot PARTIES-HAUTEUR-ANNUAIRE-ROLES,
 * l'ordre dépend de la PERTINENCE du terme tapé : viser « la deuxième » désignerait une autre personne selon ce
 * qu'on cherche — exactement l'ambiguïté que le classement vient corriger.
 */
const itemDe = (nom: string): HTMLButtonElement => {
  const b = items().find((x) => (x.textContent ?? '').includes(nom));
  if (b === undefined) throw new Error(`aucune suggestion pour « ${nom} » — ${items().length} affichée(s)`);
  return b;
};
const touche = async (key: string) => {
  await act(async () => {
    champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('🔴🔴 ① le champ et son libellé', () => {
  /**
   * ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 2 — LE LIBELLÉ PASSE À GAUCHE, DANS LA CAPSULE ═══════════════════════
   *
   * CE CAS EXIGEAIT L'INVERSE (« à sa droite »), c'était la demande du lot précédent. Arno le déplace : « le
   * libellé “Annuaire” passe à GAUCHE du champ. Libellé + champ forment une seule capsule à fond blanc. »
   *
   * 🔴 « À GAUCHE » SE VÉRIFIE PAR L'ORDRE DU DOM, qui est aussi l'ordre de lecture : le libellé précède le
   * champ, dans la même capsule. Mesurer des pixels dans jsdom n'aurait rien prouvé.
   */
  it('🔴🔴 le libellé est à GAUCHE du champ, dans la même capsule', async () => {
    await monter();
    const capsule = container.querySelector('.gst-annuaire-capsule');
    expect(capsule).not.toBeNull();
    const enfants = [...(capsule?.children ?? [])].map((e) => e.className);
    expect(enfants[0]).toContain('gst-annuaire-mot');
    expect(enfants[1]).toContain('gst-annuaire-champ');
    expect(container.querySelector('.gst-annuaire-mot')?.textContent).toBe('Annuaire');
  });

  /**
   * 🔴 LE LIBELLÉ NOMME LE CHAMP, et ne se contente pas d'être posé à côté : c'est un vrai `label`, lié par
   * `htmlFor`. Un lecteur d'écran annonce donc « Annuaire » en entrant dans le champ — et l'`aria-label` qui le
   * doublait a pu partir.
   */
  it('🔴 le libellé est un vrai `label`, lié au champ', async () => {
    await monter();
    const label = container.querySelector('label.gst-annuaire-mot') as HTMLLabelElement | null;
    expect(label).not.toBeNull();
    expect(label?.htmlFor).toBe(champ().id);
    expect(champ().id).not.toBe('');
  });

  /** 🔴 LE ✕ D'EFFACEMENT RESTE DANS LA CAPSULE : c'est celui du navigateur, porté par `type="search"`. */
  it('🔴 le champ reste un champ de recherche — son ✕ vit dans la capsule', async () => {
    await monter();
    expect(champ().getAttribute('type')).toBe('search');
    expect(champ().closest('.gst-annuaire-capsule')).not.toBeNull();
  });

  /** ⚠️ RIEN TANT QU'ON N'A PAS CHERCHÉ : « Aucun contact » sur un champ vide apprendrait à ignorer la phrase. */
  it('⚠️ au repos : aucune liste, aucune phrase, aucune requête', async () => {
    await monter();
    expect(container.querySelector('.gst-annuaire-liste')).toBeNull();
    expect(container.querySelector('.gst-annuaire-vide')).toBeNull();
    expect(urls).toEqual([]);
  });

  /** ⚠️ UNE SEULE LETTRE NE LANCE RIEN : la recherche rendrait la moitié de l'annuaire. */
  it('⚠️ une seule lettre n’interroge pas', async () => {
    await monter();
    await taper('a');
    expect(urls).toEqual([]);
  });
});

describe('🔴🔴 ② les suggestions viennent de la recherche EXISTANTE', () => {
  /**
   * 🔴🔴 AUCUNE SECONDE RECHERCHE (Arno) : la barre interroge la route de l'annuaire, celle de l'écran Annuaire.
   * Un filtre « maison » aurait donné deux annuaires qui ne trouvent pas les mêmes gens.
   */
  it('🔴🔴 elle interroge `/api/admin/gestion/annuaire?q=…`, et rien d’autre', async () => {
    await monter();
    await taper('normandie');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('/api/admin/gestion/annuaire?q=normandie');
  });

  /**
   * ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — « + Propriétaire de X biens au total » ═══════════════════════════
   *
   * Arno : « on garde l'adresse affichée aujourd'hui ; si ce propriétaire a d'autres biens en gestion chez nous,
   * on ajoute APRÈS l'adresse : “+ Propriétaire de X biens au total”. Style discret, dans le gris de l'adresse. »
   */
  it('🔴🔴 un propriétaire à plusieurs biens porte la mention, après l’adresse et dans le même gris', async () => {
    personnesServies = [{
      sujet: 'proprietaire', id: 12, nomAffiche: 'Mme ABDELLATIF Névine', roles: ['proprietaire'],
      autreFicheId: null, biens: [BIEN, { ...BIEN, adresse: '12 rue A' }, { ...BIEN, adresse: '5 rue B' }],
    }];
    await monter();
    await taper('abdellatif');
    /* 🔴 UNE SEULE LIGNE pour ce propriétaire, malgré ses trois biens (Arno : « une seule suggestion »). */
    expect(items()).toHaveLength(1);
    const gris = [...items()[0].querySelectorAll('.gst-annuaire-lieu')].map((e) => e.textContent);
    expect(gris).toEqual(['67 rue de Normandie, COURBEVOIE', '+ Propriétaire de 3 biens au total']);
  });

  it('🔴 un seul bien : aucune mention', async () => {
    await monter();
    await taper('abdellatif');
    expect(items()[0].textContent).not.toContain('biens au total');
  });

  it('🔴 chaque suggestion montre le nom, le rôle et l’adresse — sans numéro de lot', async () => {
    await monter();
    await taper('normandie');
    const proprio = itemDe('Mme ABDELLATIF Névine').textContent ?? '';
    expect(proprio).toContain('Propriétaire');
    expect(proprio).toContain('67 rue de Normandie, COURBEVOIE');
    expect(itemDe('M. ROI Nathan').textContent).toContain('Locataire');
    for (const b of items()) expect(b.textContent ?? '').not.toContain('lot');
  });
});

describe('🔴🔴 ③ le clic ouvre LA BONNE fiche', () => {
  it('🔴🔴 un propriétaire ouvre la fiche propriétaire', async () => {
    await monter();
    await taper('abdellatif');
    await act(async () => { items()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(fiches).toEqual([{ sorte: 'proprietaire', id: 12 }]);
  });

  it('🔴🔴 un locataire ouvre la fiche locataire', async () => {
    await monter();
    await taper('roi');
    await act(async () => { itemDe('M. ROI Nathan').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(fiches).toEqual([{ sorte: 'locataire', id: 45 }]);
  });

  /** 🔴🔴 LE DOUBLE RÔLE : deux lignes, deux fiches — celle du rôle cliqué, jamais « la principale ». */
  it('🔴🔴 un double rôle donne deux lignes, chacune vers SA fiche', async () => {
    personnesServies = [{
      sujet: 'proprietaire', id: 12, nomAffiche: 'M. JULLIEN - GARRIDO Cédric',
      roles: ['proprietaire', 'locataire'], autreFicheId: 98, biens: [BIEN],
    }];
    await monter();
    await taper('jullien');
    expect(items()).toHaveLength(2);
    /* ⚠️ LES DEUX LIGNES PORTENT LE MÊME NOM : on désigne donc par le RÔLE, qui est ce qui les distingue. */
    const loc = items().find((x) => (x.textContent ?? '').includes('Locataire'));
    await act(async () => { loc?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(fiches).toEqual([{ sorte: 'locataire', id: 98 }]);
  });

  /** ⚠️ ET LE CHAMP SE VIDE APRÈS : on part sur la fiche, la liste n'a plus de raison de rester ouverte. */
  it('⚠️ après l’ouverture, le champ est vide et la liste refermée', async () => {
    await monter();
    await taper('abdellatif');
    await act(async () => { items()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(champ().value).toBe('');
    expect(container.querySelector('.gst-annuaire-liste')).toBeNull();
  });
});

describe('🔴 ④ aucun résultat', () => {
  it('🔴 « Aucun contact trouvé. »', async () => {
    personnesServies = [];
    await monter();
    await taper('zzzzz');
    expect(container.querySelector('.gst-annuaire-vide')?.textContent).toBe('Aucun contact trouvé.');
    expect(container.querySelector('.gst-annuaire-liste')).toBeNull();
  });

  /** ⚠️ UNE PANNE DIT LA MÊME CHOSE QU'UNE ABSENCE plutôt que de laisser le champ muet. */
  it('⚠️ une recherche en échec ne laisse pas la barre silencieuse', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as unknown as typeof fetch;
    await monter();
    await taper('martin');
    expect(container.querySelector('.gst-annuaire-vide')).not.toBeNull();
  });
});

describe('🔴🔴 ⑤ le clavier', () => {
  it('🔴🔴 flèche bas sélectionne la première, puis la suivante', async () => {
    await monter();
    await taper('normandie');
    await touche('ArrowDown');
    expect(items()[0].className).toContain('gst-annuaire-item--vise');
    await touche('ArrowDown');
    expect(items()[1].className).toContain('gst-annuaire-item--vise');
  });

  it('🔴 flèche haut depuis « rien » prend la DERNIÈRE', async () => {
    await monter();
    await taper('normandie');
    await touche('ArrowUp');
    expect(items()[1].className).toContain('gst-annuaire-item--vise');
  });

  it('🔴🔴 Entrée ouvre la fiche sélectionnée', async () => {
    await monter();
    await taper('normandie');
    await touche('ArrowDown');
    /* ⚠️ LA PREMIÈRE LIGNE DÉPEND DU CLASSEMENT : on lit QUI elle désigne plutôt que de le supposer. */
    const attendu = (items()[0].textContent ?? '').includes('Mme ABDELLATIF Névine')
      ? { sorte: 'proprietaire', id: 12 } : { sorte: 'locataire', id: 45 };
    await touche('Enter');
    expect(fiches).toEqual([attendu]);
  });

  /** ⚠️ ENTRÉE SANS SÉLECTION N'OUVRE RIEN : on n'ouvre pas une fiche que personne n'a désignée. */
  it('⚠️ Entrée sans sélection n’ouvre rien', async () => {
    await monter();
    await taper('normandie');
    await touche('Enter');
    expect(fiches).toEqual([]);
  });

  it('🔴 Échap referme la liste', async () => {
    await monter();
    await taper('normandie');
    expect(items().length).toBeGreaterThan(0);
    await touche('Escape');
    expect(container.querySelector('.gst-annuaire-liste')).toBeNull();
  });
});

describe('🔴🔴 ⑥ les rôles sont mêlés, et leurs capsules ont la couleur de leur encart', () => {
  /**
   * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINTS 2 ET 3 ═══════════════════════════════════════════════════
   *
   * CONSTAT D'ARNO : en tapant « jo », tous les propriétaires sortaient d'abord et les locataires n'apparaissaient
   * qu'en bas — « Arno croit qu'il n'y a que des propriétaires ». La recherche rend ses propriétaires puis ses
   * locataires : c'était un ordre d'ARRIVÉE, pas un classement.
   */
  beforeEach(() => {
    personnesServies = [
      /* L'ordre d'arrivée de la recherche : les propriétaires d'abord, les locataires ensuite. */
      { sujet: 'proprietaire', id: 1, nomAffiche: 'MARTIN Paul', roles: ['proprietaire'], autreFicheId: null, biens: [BIEN] },
      { sujet: 'proprietaire', id: 2, nomAffiche: 'ALEJO BERNARD', roles: ['proprietaire'], autreFicheId: null, biens: [BIEN] },
      { sujet: 'locataire', id: 3, nomAffiche: 'JOLY Sandrine', roles: ['locataire'], autreFicheId: null, biens: [BIEN] },
      { sujet: 'locataire', id: 4, nomAffiche: 'ALEJO FERNANDEZ Paula', roles: ['ancien_locataire'], autreFicheId: null, biens: [BIEN] },
    ];
  });

  it('🔴🔴 « jo » : le locataire dont le nom commence par le terme passe en tête', async () => {
    await monter();
    await taper('jo');
    const noms = items().map((b) => (b.querySelector('.gst-annuaire-nom')?.textContent ?? ''));
    expect(noms[0]).toBe('JOLY Sandrine');
    /* 🔴 ET LES RÔLES SONT MÊLÉS : un locataire en tête, un propriétaire ensuite — plus de bloc par rôle. */
    const roles = items().map((b) => (b.querySelector('.gst-annuaire-role')?.textContent ?? ''));
    expect(roles[0]).toBe('Locataire');
    expect(new Set(roles).size).toBeGreaterThan(1);
  });

  /** 🔴 LES ANCIENS LOCATAIRES SONT DE LA PARTIE, avec leur mot à eux et la fiche locataire. */
  it('🔴 un ancien locataire est suggéré, et ouvre la fiche locataire', async () => {
    await monter();
    await taper('alejo');
    const b = itemDe('ALEJO FERNANDEZ Paula');
    expect(b.querySelector('.gst-annuaire-role')?.textContent).toBe('Ancien locataire');
    await act(async () => { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(fiches).toEqual([{ sorte: 'locataire', id: 4 }]);
  });

  /**
   * 🔴🔴 POINT 3 — ROUGE pour un propriétaire, VERT pour un locataire (ancien compris) : les MÊMES jetons que les
   * liserés des encarts de la fiche du bien. Aucune couleur nouvelle.
   */
  it('🔴🔴 capsule ROUGE pour Propriétaire, VERTE pour Locataire et Ancien locataire', async () => {
    await monter();
    await taper('alejo');
    const classeDe = (nom: string): string =>
      itemDe(nom).querySelector('.gst-annuaire-role')?.className ?? '';
    expect(classeDe('ALEJO BERNARD')).toContain('gst-annuaire-role--proprietaire');
    expect(classeDe('ALEJO FERNANDEZ Paula')).toContain('gst-annuaire-role--locataire');
    const BARRE = readFileSync('app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx', 'utf8');
    /* 🔴 LES JETONS DES ENCARTS, ET PAS UNE COULEUR EN DUR. */
    expect(BARRE).toContain('.gst-annuaire-role--proprietaire{background:var(--color-svv-red)}');
    expect(BARRE).toContain('.gst-annuaire-role--locataire{background:var(--color-svv-green)}');
    /* ⚠️ LE TEXTE EST `--color-svv-bg` ET NON UN BLANC EN DUR : en thème Sombre, c'est lui qui contraste. */
    expect(BARRE).toContain('color:var(--color-svv-bg)');
  });

  /**
   * 🔴🔴 LA DERNIÈRE LIGNE VISIBLE L'EST EN ENTIER : la liste mesure ses lignes et s'arrête au bas de la dernière
   * qui tient dans la place disponible, au lieu d'être coupée par un plafond écrit.
   */
  it('🔴🔴 la liste borne sa hauteur sur une ligne entière', () => {
    const BARRE = readFileSync('app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx', 'utf8');
    expect(BARRE).toContain("from '../../../../lib/gestion/listeDefilante'");
    expect(BARRE).toContain('setHauteurListe(hauteurEntiereDans(positions, budget));');
    expect(BARRE).toContain('style={hauteurListe === null ? undefined : { maxHeight: `${hauteurListe}px` }}');
  });
});

describe('🔴🔴 ⑦ les garanties structurelles', () => {
  const BARRE = readFileSync('app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx', 'utf8');

  /**
   * 🔴🔴 AUCUNE SECONDE RECHERCHE, ET AUCUNE SECONDE FICHE : la barre n'interroge que la route de l'annuaire, et
   * ne fabrique aucun chemin de fiche à elle — elle rend un `FicheUrl`, que l'écran passe à `Annuaire` comme un
   * clic venu de ses propres résultats.
   */
  it('🔴🔴 une seule route interrogée, et aucun chemin de fiche écrit à la main', () => {
    const appels = [...BARRE.matchAll(/fetch\(`([^`]+)`/g)].map((m) => m[1]);
    expect(appels).toEqual(['/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}']);
    expect(BARRE).not.toContain('ecran:');
    expect(BARRE).not.toContain('?fiche=');
  });

  /** 🔴 LE RANGEMENT VIENT DU MODULE PUR, éprouvé à part : la barre ne décide pas des rôles. */
  it('🔴 les suggestions viennent de `suggestionsAnnuaire`', () => {
    expect(BARRE).toContain("from '../../../../lib/gestion/suggestionAnnuaire'");
    expect(BARRE).toContain('suggestionsAnnuaire(');
    expect(BARRE).toContain('rangSuivant(');
  });
});
