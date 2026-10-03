// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PiecesBrouillon } from './PiecesBrouillon';
import { HAUTEUR_VIGNETTE, MENTION_NON_ENVOYEE } from '../../../../lib/gestion/piecesEnvoi';

/**
 * ══ 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES, POINT 2 — LES PIÈCES DE L'ÉDITEUR EN MINIATURES ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « le transfert avec pièces cochées est parfait, mais les pièces apparaissent en
 * lignes de texte. Je veux le format MINIATURE, comme dans la lecture des mails, pour vérifier ce que j'envoie. »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① chaque pièce est une VIGNETTE : aperçu, nom, taille, case, et la rangée d'actions ;
 *   ② l'ŒIL ouvre la MÊME visionneuse — et il n'existe que s'il a quelque chose à ouvrir ;
 *   ③ décocher ESTOMPE et DIT « Non envoyée » — la vignette reste, elle ne disparaît pas ;
 *   ④ la croix ✕ retire ;
 *   ⑤ jamais de vignette cassée : un type sans aperçu montre son étiquette, et une image morte y retombe ;
 *   ⑥ 🔴 TOUT CE QUI EXISTAIT RESTE : compteur, « Tout cocher », « Joindre un fichier », Drive, lien, « Récents ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let pieces: Record<string, unknown>[];
let patchs: { piece: number; cochee: boolean }[];
let supprimees: number[];

const PIECE = (id: number, nom: string, o: Record<string, unknown> = {}) => ({
  id, nom, typeMime: 'application/pdf', taille: 1000 * id, origine: 'reprise',
  cochee: true, disponible: true, pieceId: 9000 + id, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  pieces = []; patchs = []; supprimees = [];
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    if (u.includes('/pieces-recentes')) {
      return { ok: true, json: async () => ({ etat: 'ok', disponible: false, lignes: [] }) } as unknown as Response;
    }
    if (methode === 'PATCH') {
      const c = JSON.parse(String(init?.body ?? '{}')) as { piece: number; cochee: boolean };
      patchs.push(c);
      pieces = pieces.map((p) => (p.id === c.piece ? { ...p, cochee: c.cochee } : p));
      return { ok: true, json: async () => ({ etat: 'ok', cochee: c.cochee }) } as unknown as Response;
    }
    if (methode === 'DELETE') {
      const id = Number(new URL(u, 'http://x').searchParams.get('piece'));
      supprimees.push(id);
      pieces = pieces.filter((p) => p.id !== id);
      return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', pieces }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
let vues: { id: number; nom: string; typeMime: string | null }[] = [];
const monter = async (avecOeil = true) => {
  vues = [];
  await act(async () => {
    root.render(createElement(PiecesBrouillon, {
      brouillonId: 7,
      onVisualiser: avecOeil ? (p: { id: number; nom: string; typeMime: string | null }) => { vues.push(p); } : undefined,
    } as never));
  });
  await calmer();
};
const cartes = () => [...container.querySelectorAll('.pjb-carte')];
const images = () => [...container.querySelectorAll('img.pjb-vignette')] as HTMLImageElement[];
const yeux = () => [...container.querySelectorAll('.pjb-oeil')] as HTMLButtonElement[];
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA GRILLE DE VIGNETTES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① les pièces s’affichent en vignettes, plus en lignes de texte', () => {
  beforeEach(() => { pieces = [PIECE(1, 'bail.pdf'), PIECE(2, 'quittance.pdf'), PIECE(3, 'edl.pdf')]; });

  it('🔴🔴 une carte par pièce, dans une grille', async () => {
    await monter();
    expect(cartes()).toHaveLength(3);
    expect(container.querySelector('.pjb-grille')).not.toBeNull();
    // ⚠️ L'ANCIENNE LISTE DE LIGNES N'EXISTE PLUS : c'est précisément ce qu'Arno demande de remplacer.
    expect(container.querySelector('.pjb-liste')).toBeNull();
  });

  /**
   * 🔴🔴 L'APERÇU VIENT DE LA ROUTE DES PIÈCES DE BROUILLON, et c'est ce qui le rend UNIFORME : un fichier pris
   * sur le Mac n'a aucune ligne dans `gestion_piece`, donc aucun identifiant que la route des pièces reçues
   * saurait lire. Faire dépendre l'aperçu de l'origine aurait donné une grille à deux vitesses.
   */
  it('🔴🔴 chaque vignette demande son aperçu à la route du brouillon', async () => {
    await monter();
    expect(images()).toHaveLength(3);
    expect(images()[0].getAttribute('src'))
      .toBe('/api/admin/gestion/brouillons/7/pieces/miniature?piece=1');
  });

  /** 🔴 MÊMES DIMENSIONS QUE LA LECTURE : la hauteur est la constante PARTAGÉE, pas une seconde valeur. */
  it('🔴 la hauteur réservée est celle des miniatures de lecture', async () => {
    await monter();
    expect(images()[0].getAttribute('height')).toBe(String(HAUTEUR_VIGNETTE));
    // ⚠️ `lazy` : vingt pièces ne déclenchent pas vingt requêtes au chargement.
    expect(images()[0].getAttribute('loading')).toBe('lazy');
  });

  it('🔴 le nom, la taille et la provenance restent lisibles sur la carte', async () => {
    await monter();
    expect(container.textContent).toContain('bail.pdf');
    expect(container.textContent).toContain('du message d’origine');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'ŒIL — LA MÊME VISIONNEUSE, ET SEULEMENT S'IL OUVRE QUELQUE CHOSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② l’œil ouvre la visionneuse', () => {
  it('🔴🔴 il transmet la pièce REÇUE, pas la ligne du brouillon', async () => {
    pieces = [PIECE(1, 'bail.pdf')];
    await monter();
    expect(yeux()).toHaveLength(1);
    await cliquer(yeux()[0]);
    expect(vues).toEqual([{ id: 9001, nom: 'bail.pdf', typeMime: 'application/pdf' }]);
  });

  /**
   * 🔴 UN BOUTON QUI N'OUVRIRAIT RIEN EST PIRE QUE PAS DE BOUTON — règle du module depuis le lot 5-PJ-A. Un
   * fichier ajouté depuis le Mac n'existe dans aucun message : la visionneuse n'a rien à lui montrer.
   */
  it('🔴 aucun œil sur un fichier ajouté, qui n’est dans aucun message', async () => {
    pieces = [PIECE(1, 'photo.pdf', { origine: 'ajoutee', pieceId: null })];
    await monter();
    expect(yeux()).toHaveLength(0);
    // ⚠️ MAIS SA VIGNETTE EST BIEN LÀ : l'aperçu ne dépend pas de l'origine.
    expect(images()).toHaveLength(1);
  });

  it('⚠️ aucun œil non plus quand l’écran n’en propose pas', async () => {
    pieces = [PIECE(1, 'bail.pdf')];
    await monter(false);
    expect(yeux()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ DÉCOCHER ESTOMPE ET LE DIT — ✕ RETIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ décocher n’est pas retirer, et la vignette le montre', () => {
  beforeEach(() => { pieces = [PIECE(1, 'bail.pdf'), PIECE(2, 'quittance.pdf')]; });

  it('🔴🔴 décocher estompe la carte et écrit « Non envoyée »', async () => {
    await monter();
    const cases = [...container.querySelectorAll('input.pjb-case')] as HTMLInputElement[];
    await act(async () => { cases[1].click(); }); await calmer();
    expect(patchs).toEqual([{ piece: 2, cochee: false }]);
    // 🔴 ELLE RESTE : décocher n'est pas retirer.
    expect(cartes()).toHaveLength(2);
    expect(cartes()[1].className).toContain('pjb-carte--decochee');
    expect(container.textContent).toContain(MENTION_NON_ENVOYEE);
  });

  it('🔴 la croix ✕ retire la vignette', async () => {
    await monter();
    await cliquer(container.querySelector('.pjb-retirer'));
    expect(supprimees).toEqual([1]);
    expect(cartes()).toHaveLength(1);
  });

  /** ⚠️ ET « Non envoyée » NE S'ÉCRIT PAS SUR UNE PIÈCE INDISPONIBLE : elle a déjà sa propre mention. */
  it('⚠️ une pièce introuvable garde SA mention, pas celle des décochées', async () => {
    pieces = [PIECE(1, 'perdu.pdf', { cochee: false, disponible: false })];
    await monter();
    expect(cartes()[0].className).toContain('pjb-carte--indisponible');
    expect(container.textContent).not.toContain(MENTION_NON_ENVOYEE);
    // 🔴 ET AUCUNE VIGNETTE N'EST DEMANDÉE : la route répondrait 404, l'étiquette de type suffit.
    expect(images()).toHaveLength(0);
    expect(container.querySelector('.pjb-type')?.textContent).toBe('PDF');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ JAMAIS UNE VIGNETTE CASSÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ une tuile neutre plutôt qu’une image morte', () => {
  it('🔴 un type sans aperçu montre son étiquette, et ne demande aucune image', async () => {
    pieces = [PIECE(1, 'contrat.docx', { typeMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })];
    await monter();
    expect(images()).toHaveLength(0);
    expect(container.querySelector('.pjb-type')?.textContent).toBe('DOCX');
  });

  /** 🔴 ET SI L'IMAGE MEURT EN ROUTE (404, fichier illisible), la carte retombe sur l'étiquette. */
  it('🔴🔴 une vignette qui échoue retombe sur l’étiquette de type', async () => {
    pieces = [PIECE(1, 'bail.pdf')];
    await monter();
    expect(images()).toHaveLength(1);
    await act(async () => { images()[0].dispatchEvent(new Event('error')); });
    await calmer();
    expect(images()).toHaveLength(0);
    expect(container.querySelector('.pjb-type')?.textContent).toBe('PDF');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴 TOUT CE QUI EXISTAIT RESTE — Arno l'a demandé explicitement
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ le compteur, « Tout cocher » et la barre ne bougent pas', () => {
  beforeEach(() => { pieces = [PIECE(1, 'a.pdf'), PIECE(2, 'b.pdf'), PIECE(3, 'c.pdf')]; });

  it('🔴 « N pièce(s) jointe(s) sur M » et le lien de bascule sont toujours là', async () => {
    await monter();
    expect(container.querySelector('.pjb-compte')?.textContent).toContain('3 pièces jointes sur 3');
    const tout = container.querySelector('.pjb-tout') as HTMLButtonElement;
    expect(tout.textContent).toBe('Tout décocher');
    await cliquer(tout);
    expect(container.querySelector('.pjb-compte')?.textContent).toContain('0 pièce jointe sur 3');
  });

  it('🔴 « Joindre un fichier » et la zone de dépôt sont intacts', async () => {
    await monter();
    expect(container.querySelector('.pjb-ajouter')?.textContent).toContain('Joindre un fichier');
    expect(container.querySelector('.pjb-champ')).not.toBeNull();
    expect(container.querySelector('.pjb-aide')?.textContent).toContain('Glissez vos fichiers ici');
  });
});
