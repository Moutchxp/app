// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';

/**
 * LOT ERGO-BOITE-2 — LE COMPTEUR « À RATTACHER » COMPTE CE QUI SE TRANCHE, PAS CE QUI EXISTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT VU PAR ARNO, le 27/09/2026. L'entrée annonçait **19 108** quand la file de tri, elle, n'offrait que
 * **3 261** mails à départager. Le compteur additionnait deux populations que rien ne permet de confondre :
 *   · `aTrier`       = le mail a AU MOINS UNE proposition à confirmer ou à rejeter → un clic suffit ;
 *   · `sansCandidat` = le programme n'a rien trouvé à proposer → il faut aller chercher la cible à la main.
 * Additionnés, ils annonçaient près de six fois le travail réellement décidable. Un compteur qui exagère est pire
 * qu'aucun compteur : on cesse de le regarder.
 *
 * 🔴 CE QUI N'EST PAS LE CORRECTIF. Ne RIEN masquer : les 15 847 mails sans candidat restent listés par l'écran de la
 * file (onglet « Sans candidat »), comptés en clair sur sa ligne de chiffres, et nommés par l'info-bulle de l'entrée.
 * Le défaut était l'addition, pas la donnée.
 *
 * ⚠️ POURQUOI UN TEST QUI MONTE L'ÉCRAN. Le défaut ne vivait ni dans le SQL (les deux nombres sont justes) ni dans une
 * fonction pure : il vivait dans le `+` d'un composant. Seul le rendu le montre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Les vrais chiffres du 27/09/2026, relevés en base — leur somme, 19 108, est précisément ce qu'on ne veut plus voir. */
const A_TRANCHER = 3261;
const SANS_CANDIDAT = 15847;

const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0,
  sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
  messagesCaptures: 56000, messagesExclus: 40000, derniereReleveLe: '2026-09-27T10:00:00Z',
};
const COMPTES = { lisibles: 8470, automatiques: 26059, envoyes: 6585 };
const PAGE_BOITE = { lignes: [], suivant: null, total: null, comptes: COMPTES };

let container: HTMLDivElement;
let root: Root;
/** Ce que la route des chiffres répond — chaque test le règle avant de monter. */
let chiffres: { etat: string; data?: { aTrier: number; sansCandidat: number } };

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  chiffres = { etat: 'ok', data: { aTrier: A_TRANCHER, sansCandidat: SANS_CANDIDAT } };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/rattachements')) return { ok: true, json: async () => chiffres } as unknown as Response;
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) return { ok: true, json: async () => PAGE_BOITE } as unknown as Response;
    if (u.includes('/messages')) return { ok: true, json: async () => ({ messages: [], partis: [] }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };

/** L'entrée « À rattacher » de la colonne, prise par son libellé — sa position n'est pas ce qu'on éprouve ici. */
const entree = (): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find(
    (b) => /À rattacher/.test(b.textContent ?? '')) as HTMLButtonElement | undefined;

describe('🔴 « À rattacher » : le nombre annonce les mails à trancher, pas le stock non rattaché', () => {
  it('affiche 3 261 — la somme 19 108 n’apparaît NULLE PART', async () => {
    await monter();
    const b = entree();
    expect(b).toBeDefined();
    expect(b?.querySelector('.gst-compte')?.textContent).toBe(String(A_TRANCHER));
    // LE CŒUR DU TEST : la somme est bannie de l'écran entier, pas seulement de cette pastille.
    expect(container.textContent ?? '').not.toContain(String(A_TRANCHER + SANS_CANDIDAT));
  });

  it('les mails sans candidat ne sont pas effacés pour autant : l’info-bulle les nomme', async () => {
    await monter();
    const titre = entree()?.getAttribute('title') ?? '';
    expect(titre).toContain(String(A_TRANCHER));
    expect(titre).toContain(String(SANS_CANDIDAT));
    expect(titre).toContain('sans aucun candidat');
  });

  /**
   * LE CAS OÙ IL N'Y A PLUS RIEN À TRANCHER. `sansCandidat` reste énorme, mais le compteur doit dire zéro : sinon on
   * chercherait indéfiniment des propositions qui n'existent pas. C'est le même défaut, vu par son autre bout.
   */
  it('zéro à trancher affiche 0, même avec 15 847 mails sans candidat', async () => {
    chiffres = { etat: 'ok', data: { aTrier: 0, sansCandidat: SANS_CANDIDAT } };
    await monter();
    expect(entree()?.querySelector('.gst-compte')?.textContent).toBe('0');
    expect(entree()?.getAttribute('title') ?? '').toContain(String(SANS_CANDIDAT));
  });

  /**
   * MIGRATION 257 ABSENTE (ou route en échec) : aucun nombre, et aucune bulle inventée. Un « 0 » ressemblerait à une
   * bonne nouvelle mesurée ; ici on n'a rien mesuré du tout.
   */
  it('sans schéma, l’entrée reste — sans nombre et sans info-bulle', async () => {
    chiffres = { etat: 'sans_schema' };
    await monter();
    expect(entree()).toBeDefined();
    expect(entree()?.querySelector('.gst-compte')).toBeNull();
    expect(entree()?.getAttribute('title')).toBeNull();
  });
});
