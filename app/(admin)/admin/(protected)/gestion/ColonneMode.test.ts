// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

// La barre appelle `usePathname` pour souligner le module courant : hors du routeur d'application, il rend `null` et
//   la barre tombe. On lui donne le chemin réel de la page de gestion — c'est tout ce dont elle a besoin.
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/gestion' }));

import { Sidebar, ATTR_MOBILE, ATTR_PLEIN_ECRAN, ID_EMPLACEMENT_MODE } from '../Sidebar';
import { GestionVue } from './GestionVue';
import { permsToutes } from '../../../../lib/admin/session';

/**
 * LOT 5-FUSION-B — LA COLONNE DU MODE PREND LA PLACE DE LA NAVIGATION, ET SEULEMENT CELLE-LÀ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE. En plein écran, les liens de modules s'effacent au profit des commandes de l'écran —
 * décision d'Arno du 24/09/2026. Trois choses ne doivent JAMAIS partir avec eux, et chacune se casse en silence :
 *   ① « Admin SVAV® » — sans lui, les autres modules deviennent inatteignables et l'outil est un cul-de-sac ;
 *   ② « Déconnexion » — un écran dont on ne peut pas sortir sur un poste partagé est un problème de sécurité ;
 *   ③ le choix du thème — retiré, il laisse quelqu'un coincé en clair sur un écran qu'il lit en sombre.
 * Et l'écran PARTAGÉ, lui, garde sa navigation complète : le retrait ne vaut qu'en plein écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On monte la barre ET l'écran dans le même document, comme la coquille de l'admin le fait : c'est la seule façon de
 * voir le portail atterrir où il doit, et l'attribut être posé puis retiré.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECRAN = {
  file: [{ filId: 101, objet: 'Préavis de départ', interlocuteur: 'Mme M.', dernierLe: '2026-09-20T12:00:00Z',
    nbMessages: 2, nbPieces: 0, attend: true }],
  filsTotal: 442, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0,
  evenements: [], evenementsTotal: 0, messagesCaptures: 10, messagesExclus: 0, derniereReleveLe: '2026-09-24T10:00:00Z',
};
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311 };

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion');
  document.documentElement.removeAttribute(ATTR_PLEIN_ECRAN);
  document.documentElement.removeAttribute(ATTR_MOBILE);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) return { ok: true, json: async () => ({ lignes: [], suivant: null, total: null, comptes: COMPTES }) } as unknown as Response;
    if (u.includes('/affectation') && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, json: async () => ({ evenements: [], propositions: { objet: 'o', demandeurNom: null, demandeurEmail: null, adresseLibre: null } }) } as unknown as Response;
    }
    if (u.includes('/affectation')) return { ok: true, json: async () => ({ ok: true, evenementId: 9, reference: 'GES-2026-000001' }) } as unknown as Response;
    if (u.includes('/session')) return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks();
  document.documentElement.removeAttribute(ATTR_PLEIN_ECRAN);
});

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
/** La coquille de l'admin, en réduction : la barre, puis l'écran — exactement l'ordre du vrai `layout.tsx`. */
const monter = async () => {
  await act(async () => {
    root.render(createElement(Fragment, null,
      createElement(Sidebar, { role: 'administrateur', perms: permsToutes() }),
      createElement(GestionVue)));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLElement | undefined) => { await act(async () => { b?.click(); }); await calmer(); };
const liensModules = () => [...container.querySelectorAll('.svv-adm-link')];
const emplacement = () => document.getElementById(ID_EMPLACEMENT_MODE);
const entrerEnPleinEcran = async () => cliquer(boutons().filter((b) => /^Plein écran$/.test(b.textContent ?? ''))[0]);

describe('ÉCRAN PARTAGÉ — la navigation de l’administration est INTACTE', () => {
  it('les liens de modules sont là, et rien n’est posé sur la racine du document', async () => {
    await monter();
    expect(liensModules().length).toBeGreaterThan(5);
    expect(liensModules().map((a) => a.textContent)).toContain('Statistiques');
    expect(document.documentElement.hasAttribute(ATTR_PLEIN_ECRAN)).toBe(false);
  });

  it('l’emplacement du mode existe mais reste VIDE : il ne prend aucune place', async () => {
    await monter();
    expect(emplacement()).not.toBeNull();
    expect(emplacement()?.childElementCount).toBe(0);
  });
});

describe('🔴 PLEIN ÉCRAN — la colonne du mode remplace les liens de modules, et EUX SEULS', () => {
  it('l’attribut qui commande le masquage est posé sur la racine du document', async () => {
    await monter();
    await entrerEnPleinEcran();
    expect(document.documentElement.getAttribute(ATTR_PLEIN_ECRAN)).toBe('1');
  });

  it('…et c’est bien lui qui efface les LIENS DE MODULES, personne d’autre', () => {
    // La règle et l'attribut se lisent ensemble : jsdom n'applique pas une feuille de style, mais la chaîne exacte
    //   prouve que le masquage vise `.svv-adm-link` — pas la marque, pas la déconnexion, pas le thème.
    const css = readFileSync('app/(admin)/admin/(protected)/Sidebar.tsx', 'utf8');
    expect(css).toContain(':root[data-gst-plein="1"] .svv-adm-link{display:none}');
    for (const classe of ['.svv-adm-brand', '.svv-adm-logout', '.svv-adm-theme']) {
      expect(css).not.toContain(`:root[data-gst-plein="1"] ${classe}{display:none}`);
    }
  });

  it('les étiquettes atterrissent DANS la barre, pas à côté d’elle', async () => {
    await monter();
    await entrerEnPleinEcran();
    const dedans = emplacement()?.textContent ?? '';
    expect(dedans).toContain('À classer');
    expect(dedans).toContain('Réception');
    expect(dedans).toContain('← Écran partagé');
  });

  it('🔴 ① « Admin SVAV® » est TOUJOURS là, identique, et mène à l’accueil de l’administration', async () => {
    await monter();
    const avant = container.querySelector('.svv-adm-brand') as HTMLAnchorElement;
    const htmlAvant = avant.outerHTML;
    await entrerEnPleinEcran();
    const apres = container.querySelector('.svv-adm-brand') as HTMLAnchorElement;
    expect(apres).not.toBeNull();
    expect(apres.getAttribute('href')).toBe('/admin');
    expect(apres.outerHTML).toBe(htmlAvant); // même rendu, au caractère près
  });

  it('🔴 ② « Déconnexion » reste atteignable, et elle DÉCONNECTE vraiment', async () => {
    await monter();
    await entrerEnPleinEcran();
    const sortir = boutonPar(/^Déconnexion$/);
    expect(sortir).toBeDefined();
    await cliquer(sortir);
    expect(appels.some((a) => a.url.includes('/api/admin/session') && a.methode === 'DELETE')).toBe(true);
  });

  it('🔴 ③ le choix du thème reste atteignable, et ses trois valeurs répondent', async () => {
    await monter();
    await entrerEnPleinEcran();
    const groupe = container.querySelector('[aria-label="Thème de l’interface"]')
      ?? container.querySelector("[aria-label=\"Thème de l'interface\"]");
    expect(groupe).not.toBeNull();
    const choix = [...(groupe as Element).querySelectorAll('button')];
    expect(choix.map((b) => b.textContent)).toEqual(['Clair', 'Sombre', 'Système']);
    await cliquer(choix[1]);
    expect(choix[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('revenir à l’écran partagé RETIRE l’attribut : l’administration retrouve sa navigation', async () => {
    await monter();
    await entrerEnPleinEcran();
    await cliquer(boutonPar(/← Écran partagé/));
    expect(document.documentElement.hasAttribute(ATTR_PLEIN_ECRAN)).toBe(false);
    expect(emplacement()?.childElementCount).toBe(0);
  });

  it('🔴 quitter la page aussi : un écran démonté ne laisse pas l’administration sans menu', async () => {
    await monter();
    await entrerEnPleinEcran();
    expect(document.documentElement.hasAttribute(ATTR_PLEIN_ECRAN)).toBe(true);
    await act(async () => { root.unmount(); });
    expect(document.documentElement.hasAttribute(ATTR_PLEIN_ECRAN)).toBe(false);
    root = createRoot(container); // pour le démontage de `afterEach`
  });
});

describe('TÉLÉPHONE — deux écrans, jamais deux colonnes', () => {
  it('on arrive sur la COLONNE, et choisir une étiquette fait passer au contenu', async () => {
    await monter();
    await entrerEnPleinEcran();
    expect(document.documentElement.getAttribute(ATTR_MOBILE)).toBe('colonne');
    await cliquer([...(emplacement() as Element).querySelectorAll('.cm-entree')]
      .find((b) => /Réception/.test(b.textContent ?? '')) as HTMLElement);
    expect(document.documentElement.getAttribute(ATTR_MOBILE)).toBe('contenu');
  });

  it('…et « ← Étiquettes » y ramène', async () => {
    await monter();
    await entrerEnPleinEcran();
    await cliquer([...(emplacement() as Element).querySelectorAll('.cm-entree')]
      .find((b) => /Réception/.test(b.textContent ?? '')) as HTMLElement);
    await cliquer(boutonPar(/← Étiquettes/));
    expect(document.documentElement.getAttribute(ATTR_MOBILE)).toBe('colonne');
  });
});

describe('🔴 « Classer dans une carte » : le MOT a changé, la ROUTE non', () => {
  it('le geste appelle toujours /fils/[id]/affectation, en POST', async () => {
    await monter();
    await cliquer(boutonPar(/^Classer dans une carte$/));
    await cliquer(boutonPar(/^Rattacher$/));
    const post = appels.find((a) => a.url.includes('/affectation') && a.methode === 'POST');
    expect(post).toBeDefined();
    expect(post?.url).toContain('/api/admin/gestion/fils/101/affectation');
  });

  it('le mot « Affecter » n’est plus affiché nulle part dans le module', () => {
    const fichiers = ['GestionVue.tsx', 'Conversation.tsx', 'CarteVive.tsx', 'PleinEcranBoite.tsx', 'gestesMail.tsx'];
    for (const f of fichiers) {
      const src = readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
      // Sur les lignes de CODE seulement : les en-têtes CITENT l'ancien mot pour expliquer le changement.
      const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      // `PanneauAffecter` et `onAffecter` sont des NOMS DE CODE, pas du texte à l'écran : seules les chaînes comptent.
      const textes = code.match(/'[^']*[Aa]ffecter[^']*'|"[^"]*[Aa]ffecter[^"]*"/g) ?? [];
      expect(textes.filter((t) => /[Aa]ffecter (à|a) /.test(t)), f).toEqual([]);
    }
  });
});
