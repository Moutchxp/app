// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { fenetreVisible, HAUTEUR_LIGNE, SEUIL_VIRTUALISATION } from '../../../../lib/gestion/finderDrive';
import { listerContenu, PAGES_MAX_CONTENU, TAILLE_PAGE_CONTENU } from '../../../../lib/gestion/drive';

/**
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES, POINT 2 — ON DESCEND JUSQU'AU DERNIER FICHIER ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « dossier “Test” déplié : la liste s'arrête vers “Appel provision Orliange
 * léo.pdf” alors qu'il reste des fichiers dessous. Impossible de descendre plus bas. »
 *
 * 🔴 CE QUE CE FICHIER TIENT : « tous les fichiers d'un dossier sont atteignables, quel que soit leur nombre ».
 * Au-delà de `SEUIL_VIRTUALISATION` entrées, la liste n'en rend plus qu'une fenêtre — et c'est là que le dernier
 * élément peut devenir inatteignable, sans que rien ne le dise.
 *
 * ⚠️ jsdom NE MET EN PAGE RIEN : toutes les hauteurs y valent zéro. On n'y éprouve donc PAS la mise en page, mais
 * ce qui en dépend et qui est, lui, du calcul : quelles lignes la fenêtre rend, et quelles cales elle pose. C'est
 * exactement là que vit le défaut d'une liste virtualisée — une cale fausse et le bas devient inaccessible.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** Un dossier de `n` fichiers, nommés pour que l'ordre se lise d'un coup d'œil. */
const CONTENU = (n: number) => ({
  etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: false, motifCreation: null, tronque: false,
  fichiers: Array.from({ length: n }, (_, i) => ({
    id: `f${i}`, nom: `fichier ${String(i).padStart(3, '0')}.pdf`, typeMime: 'application/pdf',
    tailleOctets: 1024, modifieLe: '2026-09-15T08:00:00Z', lien: null, dossier: false, parentId: 'D1',
  })),
});

let nbFichiers = 150;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* sans stockage, l'arbre part fermé */ }
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({ etat: 'ok', mode: 'accueil', dernier: null, recents: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(CONTENU(nbFichiers)), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, { onChoisir: () => {}, onFermer: () => {} } as never));
  });
  await calmer();
};
const zone = () => container.querySelector('.sfd-lignes') as HTMLElement | null;
const noms = () => [...container.querySelectorAll('.sfd-ligne .sfd-nom')].map((x) => x.textContent ?? '');
/** Faire défiler POUR DE VRAI : on pose `scrollTop` et on émet l'événement que le composant écoute. */
const defilerA = async (y: number) => {
  const z = zone();
  if (z !== null) { z.scrollTop = y; z.dispatchEvent(new Event('scroll', { bubbles: true })); }
  await calmer();
};
/** La hauteur TOTALE que la liste prétend occuper : les deux cales plus les lignes rendues. */
const hauteurAnnoncee = (): number => {
  const z = zone();
  if (z === null) return 0;
  const cales = [...z.querySelectorAll(':scope > div[aria-hidden="true"]')]
    .map((d) => Number.parseFloat((d as HTMLElement).style.height || '0'))
    .reduce((a, b) => a + b, 0);
  return cales + container.querySelectorAll('.sfd-ligne').length * HAUTEUR_LIGNE;
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE CALCUL DE LA FENÊTRE, ÉPROUVÉ SEUL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la fenêtre visible couvre toujours le bas de la liste', () => {
  /** ⚠️ EN DESSOUS DU SEUIL, RIEN N'EST VIRTUALISÉ : tout est rendu, et le navigateur fait le reste. */
  it('⚠️ une petite liste n’est pas virtualisée du tout', () => {
    const f = fenetreVisible(SEUIL_VIRTUALISATION, 0, 500);
    expect(f).toEqual({ debut: 0, fin: SEUIL_VIRTUALISATION, avant: 0, apres: 0 });
  });

  /**
   * 🔴🔴 LA GARANTIE QUI COMPTE : tout en bas, la DERNIÈRE ligne est dans la fenêtre. Sans elle, on descend et il
   * manque les dernières — c'est le constat d'Arno, mot pour mot.
   */
  it('🔴🔴 au fond de la liste, la dernière ligne est rendue', () => {
    for (const total of [121, 150, 500, 1000, 5000]) {
      for (const hauteurVue of [200, 519, 545, 900]) {
        const max = Math.max(0, total * HAUTEUR_LIGNE - hauteurVue);
        const f = fenetreVisible(total, max, hauteurVue);
        expect(f.fin, `total ${total}, vue ${hauteurVue}`).toBe(total);
        expect(f.apres, `total ${total}, vue ${hauteurVue}`).toBe(0);
      }
    }
  });

  /**
   * 🔴🔴 ET LA HAUTEUR ANNONCÉE NE BOUGE PAS QUAND ON DÉFILE. C'est elle qui donne au navigateur la course du
   * défilement : si elle rétrécit en descendant, la barre remonte sous le doigt et l'on ne touche jamais le fond.
   */
  it('🔴🔴 cales + lignes = la hauteur totale, à toutes les positions', () => {
    const total = 500;
    const hauteurVue = 519;
    const attendu = total * HAUTEUR_LIGNE;
    for (let y = 0; y <= total * HAUTEUR_LIGNE; y += 137) {
      const f = fenetreVisible(total, y, hauteurVue);
      expect(f.avant + (f.fin - f.debut) * HAUTEUR_LIGNE + f.apres, `à ${y}`).toBe(attendu);
    }
  });

  /** ⚠️ LA MARGE EXISTE DES DEUX CÔTÉS : on rend un peu avant et un peu après, pour que le défilement ne clignote pas. */
  it('⚠️ une marge est rendue au-dessus et au-dessous', () => {
    const f = fenetreVisible(1000, 100 * HAUTEUR_LIGNE, 280);
    expect(f.debut).toBeLessThan(100);
    expect(f.fin).toBeGreaterThan(100 + Math.ceil(280 / HAUTEUR_LIGNE));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA LISTE MONTÉE POUR DE VRAI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② un dossier de plus de 100 éléments se parcourt jusqu’au bout', () => {
  it('🔴🔴 le dernier fichier est atteint en défilant', async () => {
    nbFichiers = 150;
    await monter();
    // En haut : la première est là, la dernière non (c'est le propre d'une liste virtualisée).
    expect(noms()[0]).toBe('fichier 000.pdf');
    expect(noms()).not.toContain('fichier 149.pdf');

    await defilerA(150 * HAUTEUR_LIGNE);
    expect(noms()).toContain('fichier 149.pdf');
    expect(noms().at(-1)).toBe('fichier 149.pdf');
  });

  /**
   * 🔴🔴 LA COURSE DU DÉFILEMENT NE RÉTRÉCIT PAS EN CHEMIN. C'est ce qui rend le fond atteignable : le navigateur
   * calcule la barre sur la hauteur annoncée, et une hauteur qui change en descendant la fait fuir.
   */
  it('🔴🔴 la hauteur annoncée reste la même du haut en bas', async () => {
    nbFichiers = 150;
    await monter();
    const enHaut = hauteurAnnoncee();
    expect(enHaut).toBe(150 * HAUTEUR_LIGNE);
    await defilerA(70 * HAUTEUR_LIGNE);
    expect(hauteurAnnoncee()).toBe(enHaut);
    await defilerA(150 * HAUTEUR_LIGNE);
    expect(hauteurAnnoncee()).toBe(enHaut);
  });

  /** ⚠️ ET UN DOSSIER SOUS LE SEUIL EST RENDU EN ENTIER, sans cale ni fenêtre : rien à atteindre, tout est là. */
  it('⚠️ sous le seuil, tout est rendu d’emblée', async () => {
    nbFichiers = 25;
    await monter();
    expect(noms()).toHaveLength(25);
    expect(noms().at(-1)).toBe('fichier 024.pdf');
    expect(zone()?.querySelectorAll(':scope > div[aria-hidden="true"]')).toHaveLength(0);
  });

  /** 🔴 LE DÉFILEMENT PAR LA MOLETTE EST ÉCOUTÉ : c'est `onScroll` de la zone, et rien d'autre, qui le porte. */
  it('🔴 la molette fait défiler la zone, et la fenêtre suit', async () => {
    nbFichiers = 150;
    await monter();
    const z = zone();
    expect(z).not.toBeNull();
    z!.scrollTop = 100 * HAUTEUR_LIGNE;
    await act(async () => { z!.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true })); });
    await act(async () => { z!.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await calmer();
    expect(noms()).toContain('fichier 100.pdf');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE DOSSIER EST LU EN ENTIER — « quel que soit leur nombre »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LA SEULE LIMITE QUI RESTAIT, ET CE QU'ELLE COÛTAIT ════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO : « tous les fichiers d'un dossier sont atteignables, QUEL QUE SOIT LEUR NOMBRE […] Garde la
 * vitesse obtenue. »
 *
 * La lecture suivait déjà `nextPageToken`, mais s'arrêtait à CINQ pages de 200 — soit 1 000 entrées, après quoi la
 * liste était tronquée et renvoyait à la recherche. `files.list` accepte `pageSize` jusqu'à 1 000 : on demande
 * donc des pages pleines, et le plafond passe à 25 000 entrées.
 *
 * MESURÉ LE 03/10/2026 sur « 1 Propriétaires » (307 entrées), médiane de cinq lectures :
 *     pageSize  200 → 2 appels, 1 032 ms
 *     pageSize 1000 → 1 appel,    668 ms
 * La lecture est donc plus RAPIDE, pas plus lente : c'est le nombre d'allers-retours qui coûte.
 */
describe('🔴🔴 ③ un dossier se lit en entier, et plus vite', () => {
  it('🔴🔴 la page est pleine, et le plafond couvre 25 000 entrées', () => {
    expect(TAILLE_PAGE_CONTENU).toBe(1000);
    expect(PAGES_MAX_CONTENU * TAILLE_PAGE_CONTENU).toBe(25_000);
  });

  /** 🔴 UN DOSSIER DE 1 500 ENTRÉES SE LIT EN ENTIER — il était tronqué à 1 000 avant ce lot. */
  it('🔴🔴 1 500 entrées reviennent toutes, sans troncature', async () => {
    const page = (debut: number, n: number, suite: string | null) => ({
      files: Array.from({ length: n }, (_, i) => ({
        id: `f${debut + i}`, name: `f${debut + i}`, mimeType: 'application/pdf',
      })),
      ...(suite === null ? {} : { nextPageToken: suite }),
    });
    let appels = 0;
    const faux = (async (u: unknown) => {
      appels += 1;
      const jeton = new URL(String(u)).searchParams.get('pageToken');
      // ⚠️ ON VÉRIFIE LA TAILLE DEMANDÉE : c'est elle qui fait la vitesse, et un test qui l'ignore la laisserait
      //    retomber à 200 sans rien dire.
      expect(new URL(String(u)).searchParams.get('pageSize')).toBe('1000');
      return new Response(JSON.stringify(jeton === null ? page(0, 1000, 'p2') : page(1000, 500, null)),
        { status: 200 });
    }) as unknown as typeof fetch;

    const r = await listerContenu('JETON', { parentId: 'D1' }, { fetch: faux });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.fichiers).toHaveLength(1500);
    expect(r.valeur.tronque).toBe(false);
    expect(appels).toBe(2);
  });

  /**
   * ⚠️ LA BORNE EXISTE TOUJOURS, ET ELLE SE DIT. Sans elle, un dossier pathologique ferait tourner la lecture
   * pendant qu'un écran attend ; `tronque` est ce qui empêche de conclure qu'un fichier n'existe pas.
   */
  it('⚠️ au-delà de la borne, la troncature est ANNONCÉE', async () => {
    const faux = (async () => new Response(JSON.stringify({
      files: [{ id: 'x', name: 'x', mimeType: 'application/pdf' }], nextPageToken: 'encore',
    }), { status: 200 })) as unknown as typeof fetch;
    const r = await listerContenu('JETON', { parentId: 'D1', pagesMax: 3 }, { fetch: faux });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.tronque).toBe(true);
  });
});
