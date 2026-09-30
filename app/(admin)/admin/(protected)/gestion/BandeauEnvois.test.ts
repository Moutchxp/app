// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { BandeauEnvois } from './BandeauEnvois';

/**
 * 🔴 LOT LIGNE-NON-ENVOYE — LA CAPSULE « NON ENVOYÉ », DANS LE FIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Demande d'Arno : la même capsule que dans « Envoyés », mais ici posée sur le message, avec la CAUSE et le lien
 * « Rouvrir le brouillon ».
 *
 * Ce qui est protégé ici :
 *   ① 🔴 LE MOT PORTE L'INFORMATION, jamais la couleur seule : « Non envoyé » se lit en niveaux de gris comme il se
 *      lit par un daltonien ;
 *   ② 🔴 LA CAUSE EST AFFICHÉE, en français — « échec » seul ne dit pas s'il faut rouvrir le brouillon ou attendre ;
 *   ③ 🔴 LE BANDEAU N'EXISTE PAS QUAND IL N'A RIEN À DIRE : un bandeau permanent cesse d'être lu, et le jour où il
 *      parle, personne ne le voit ;
 *   ④ un envoi ENCORE EN ROUTE est NEUTRE — il ne dure que quelques secondes, et en faire une alerte ferait
 *      paraître anormal le fonctionnement ordinaire ;
 *   ⑤ 🔴 UNE ERREUR DE RÉSEAU N'EFFACE PAS LA CAPSULE : vider la liste sur un hoquet reviendrait à effacer
 *      l'alerte au lieu de la porter.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let reponse: Record<string, unknown>;
let appels: string[];
let rouverts: (number | null)[];

const echec = (o: Record<string, unknown> = {}) => ({
  id: 7, filId: 42, objet: 'Relance loyer', destinataires: ['martin@orange.fr'],
  etat: 'echec', demandeLe: '2026-09-28T18:12:00Z',
  cause: 'la pièce « bail.pdf » n’a pas pu être récupérée depuis le Drive.',
  brouillonId: 55, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; rouverts = [];
  reponse = { etat: 'ok', lignes: [] };
  global.fetch = vi.fn(async (url: string | URL) => {
    appels.push(String(url));
    return { ok: true, json: async () => reponse } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(BandeauEnvois, {
      onRouvrir: (id: number) => { rouverts.push(id); }, ...props,
    } as never));
  });
  await calmer();
};

describe('🔴 ①② la capsule dit le MOT, puis la CAUSE', () => {
  it('🔴 « Non envoyé » est écrit en toutes lettres', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('Non envoyé');
  });

  it('🔴 la CAUSE est affichée à côté — « échec » seul n’aide personne', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('bail.pdf');
    expect(container.textContent).toContain('Drive');
  });

  it('l’objet et les destinataires sont dits : on sait DE QUEL mail il s’agit', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('Relance loyer');
    expect(container.textContent).toContain('martin@orange.fr');
  });

  /** 🔴 LA PHRASE QUI RASSURE : sans elle, on rouvre tout pour vérifier que le travail n'est pas perdu. */
  it('🔴 il DIT que le message est retourné dans les Brouillons', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('retourné dans les Brouillons');
  });

  it('🔴 « Rouvrir le brouillon » rend LE brouillon, pas un autre', async () => {
    reponse = { etat: 'ok', lignes: [echec({ brouillonId: 55 })] };
    await monter();
    const b = [...container.querySelectorAll('button')].find((x) => /Rouvrir le brouillon/.test(x.textContent ?? ''));
    expect(b).toBeDefined();
    await act(async () => { b?.click(); });
    expect(rouverts).toEqual([55]);
  });

  it('sans brouillon connu, aucun bouton n’est offert — un bouton qui n’ouvre rien est pire que pas de bouton', async () => {
    reponse = { etat: 'ok', lignes: [echec({ brouillonId: null })] };
    await monter();
    expect([...container.querySelectorAll('button')]).toHaveLength(0);
    // …mais la capsule et la cause restent : savoir vaut mieux que ne rien savoir.
    expect(container.textContent).toContain('Non envoyé');
  });
});

describe('🔴 ③④ ce qui ne s’affiche pas, et ce qui reste neutre', () => {
  it('🔴 rien à dire ⇒ AUCUN bandeau dans le DOM', async () => {
    reponse = { etat: 'ok', lignes: [] };
    await monter();
    expect(container.querySelector('.bev-envois')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('🔴 un envoi en route est NEUTRE, pas rouge', async () => {
    reponse = { etat: 'ok', lignes: [echec({ etat: 'attente', cause: null })] };
    await monter();
    expect(container.textContent).toContain('Envoi en cours');
    expect(container.querySelector('.bev-envoi--rouge')).toBeNull();
    expect(container.querySelector('.bev-envoi--neutre')).not.toBeNull();
  });

  it('un échec est ROUGE — le seul état qui demande un geste', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.querySelector('.bev-envoi--rouge')).not.toBeNull();
  });
});

describe('🔴 ⑤ le bandeau est borné à son échange, et il ne s’efface pas tout seul', () => {
  it('avec un `filId`, il ne demande QUE cet échange', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter({ filId: 42 });
    expect(appels.some((u) => u.includes('fil=42'))).toBe(true);
  });

  it('sans `filId`, il demande tout — c’est le bandeau en tête du module', async () => {
    await monter();
    expect(appels.some((u) => u.includes('fil='))).toBe(false);
  });

  /**
   * 🔴 VIDER LA LISTE SUR UNE ERREUR reviendrait à effacer la capsule rouge à cause d'un hoquet de réseau —
   * c'est-à-dire à faire disparaître l'alerte au lieu de la porter. On garde ce qu'on affichait.
   */
  it('🔴 une réponse en ERREUR laisse la capsule en place', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('Non envoyé');

    /**
     * ⚠️ HORLOGE FEINTE, et non une vraie attente : le bandeau se relit toutes les cinq secondes, et attendre
     * vraiment ferait un test qui dure plus longtemps que la limite. On avance l'horloge, on ne la subit pas.
     */
    vi.useFakeTimers();
    reponse = { etat: 'erreur', lignes: [] };
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    vi.useRealTimers();
    await calmer();
    expect(container.textContent).toContain('Non envoyé');
  });
});

describe('garanties d’écran (statiques)', () => {
  /** Règle du module : aucune couleur en dur, uniquement des jetons de charte. */
  it('aucune couleur en dur : uniquement des jetons --color-svv-*', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BandeauEnvois.tsx', 'utf8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
  });

  /** 🔴 Le MOT vient du module PUR : l'écran ne réécrit jamais un libellé d'état de son côté. */
  it('🔴 les mots et les tons viennent du module PUR, ils ne sont pas réécrits ici', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BandeauEnvois.tsx', 'utf8');
    expect(src).toContain("from '../../../../lib/gestion/fileEnvoi'");
    // 🔴 LOT PJ-APRES-VIDAGE — `motGroupeEnvoi` remplace `motEtatFile` : il rend le MÊME mot pour une tentative,
    //   et « 2 tentatives non envoyées » pour deux. Le libellé reste écrit dans le module pur, pas ici.
    expect(src).toContain('motGroupeEnvoi');
    expect(src).toContain('tonEtatFile');
    expect(src).toContain('grouperEnvois');
    // Le libellé n'est écrit nulle part en dur dans cet écran.
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(code).not.toContain("'Non envoyé'");
  });
});

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — UN ÉCHEC = UN BANDEAU ════════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO, fil 3494 : le même échec s'affichait QUATRE fois — deux en tête de page, deux dans le fil.
 * Mesuré en base : deux clics sur « transférer » (14:55:31 et 14:56:53), deux lignes de file (12 et 14), MÊME
 * brouillon (64), MÊME cause au mot près. Deux causes d'affichage, éprouvées ici l'une après l'autre.
 */
describe('🔴🔴 deux tentatives identiques ne font qu’UN bandeau, qui dit COMBIEN', () => {
  const memeEchec = (id: number, quand: string) => echec({
    id, demandeLe: quand, brouillonId: 64, filId: 3494,
    objet: 'TR : Taxes Foncières', destinataires: ['compta@adhoc.fr'],
    cause: 'Gmail a refusé l’envoi : Les pièces jointes n’ont pas pu être lues.',
  });

  it('🔴 « 2 tentatives non envoyées », et UNE SEULE ligne dans le DOM', async () => {
    reponse = { etat: 'ok', lignes: [memeEchec(14, '2026-09-30T14:56:53Z'), memeEchec(12, '2026-09-30T14:55:31Z')] };
    await monter();
    expect(container.querySelectorAll('.bev-envoi')).toHaveLength(1);
    expect(container.textContent).toContain('2 tentatives non envoyées');
    // Le mot REMPLACE « Non envoyé » : le laisser à côté ferait lire deux états pour une seule chose.
    expect(container.textContent).not.toContain('Non envoyé');
  });

  it('🔴 le brouillon rouvert est celui de la tentative la PLUS RÉCENTE', async () => {
    reponse = { etat: 'ok', lignes: [
      memeEchec(12, '2026-09-30T14:55:31Z'),
      { ...memeEchec(14, '2026-09-30T14:56:53Z'), brouillonId: 64 },
    ] };
    await monter();
    const b = [...container.querySelectorAll('button')].find((x) => /Rouvrir le brouillon/.test(x.textContent ?? ''));
    await act(async () => { b?.click(); });
    expect(rouverts).toEqual([64]);
  });

  /**
   * 🔴 REGROUPER SUR LE SEUL FIL MASQUERAIT UNE PANNE. Deux échecs DIFFÉRENTS du même échange sont deux choses à
   * réparer : les fondre en « 2 tentatives » ferait disparaître l'une des deux pour toujours.
   */
  it('🔴 deux échecs du même échange mais de CAUSES différentes restent DEUX bandeaux', async () => {
    reponse = { etat: 'ok', lignes: [
      memeEchec(14, '2026-09-30T14:56:53Z'),
      { ...memeEchec(12, '2026-09-30T14:55:31Z'), cause: 'la pièce « bail.pdf » n’a pas pu être récupérée.' },
    ] };
    await monter();
    expect(container.querySelectorAll('.bev-envoi')).toHaveLength(2);
    expect(container.textContent).not.toContain('2 tentatives');
  });

  it('une seule tentative garde son mot d’origine — rien ne change au cas ordinaire', async () => {
    reponse = { etat: 'ok', lignes: [echec()] };
    await monter();
    expect(container.textContent).toContain('Non envoyé');
    expect(container.textContent).not.toContain('tentatives');
  });
});

describe('🔴 `sauf` : ce que le fil ouvert dit déjà, la tête de page ne le redit pas', () => {
  it('🔴 l’échec de l’échange OUVERT disparaît du bandeau général', async () => {
    reponse = { etat: 'ok', lignes: [echec({ filId: 3494 })] };
    await monter({ sauf: 3494 });
    expect(container.querySelector('.bev-envois')).toBeNull();
  });

  it('les échecs des AUTRES échanges restent — c’est tout l’intérêt du bandeau en tête', async () => {
    reponse = { etat: 'ok', lignes: [echec({ id: 1, filId: 3494 }), echec({ id: 2, filId: 77, objet: 'Devis' })] };
    await monter({ sauf: 3494 });
    expect(container.querySelectorAll('.bev-envoi')).toHaveLength(1);
    expect(container.textContent).toContain('Devis');
  });

  /** ⚠️ Un message NEUF n'a pas de fil : il ne doit jamais être masqué par la borne d'un échange ouvert. */
  it('un échec SANS échange n’est jamais masqué', async () => {
    reponse = { etat: 'ok', lignes: [echec({ filId: null })] };
    await monter({ sauf: 3494 });
    expect(container.textContent).toContain('Non envoyé');
  });

  it('sans borne, rien n’est masqué', async () => {
    reponse = { etat: 'ok', lignes: [echec({ filId: 3494 })] };
    await monter();
    expect(container.textContent).toContain('Non envoyé');
  });

  /**
   * 🔴 L'ORDRE DES DEUX RÉDUCTIONS COMPTE : masquer PUIS regrouper. L'inverse compterait des tentatives qu'on ne
   * montre pas, et annoncerait « 2 tentatives » au-dessus d'un bandeau qui n'en montre qu'une.
   */
  it('🔴 le nombre annoncé est celui des tentatives RESTANTES, pas des tentatives reçues', async () => {
    reponse = { etat: 'ok', lignes: [
      echec({ id: 1, filId: 3494 }), echec({ id: 2, filId: 3494, demandeLe: '2026-09-28T18:00:00Z' }),
      echec({ id: 3, filId: 77, objet: 'Devis' }),
    ] };
    await monter({ sauf: 3494 });
    expect(container.querySelectorAll('.bev-envoi')).toHaveLength(1);
    expect(container.textContent).not.toContain('tentatives');
  });
});

/**
 * ══ 🔴 LOT BANDEAU-ET-BROUILLONS — « IGNORER » ════════════════════════════════════════════════════════════════
 *
 * Arno : « un lien “Ignorer” qui masque le bandeau durablement pour cet échec, SANS RIEN SUPPRIMER ».
 */
describe('🔴 « Ignorer » fait taire un échec, et rien de plus', () => {
  const echecs = (n: number) => Array.from({ length: n }, (_, i) => echec({
    id: 10 + i, filId: 3494, objet: 'Fwd: Taxes Foncières', destinataires: ['compta@adhoc.fr'],
    cause: 'Gmail a refusé l’envoi.', demandeLe: `2026-09-30T14:5${i}:00Z`,
  }));

  it('🔴 le lien N’EXISTE PAS tant que la migration 284 manque — un lien qui ne fait rien est pire', async () => {
    reponse = { etat: 'ok', lignes: echecs(1), ignorable: false };
    await monter();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Ignorer')).toBe(false);
    // …et le bandeau, lui, est EXACTEMENT celui d'avant.
    expect(container.textContent).toContain('Non envoyé');
  });

  it('🔴 le clic retire le bandeau TOUT DE SUITE et demande la mise en sourdine', async () => {
    reponse = { etat: 'ok', lignes: echecs(1), ignorable: true };
    await monter();
    const lien = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ignorer');
    expect(lien).toBeDefined();

    reponse = { etat: 'ok', lignes: [], ignorable: true };
    await act(async () => { lien?.click(); });
    await calmer();

    const patch = appels.filter((u) => u.includes('envois-en-cours'));
    expect(patch.length).toBeGreaterThan(1); // la lecture initiale, plus le PATCH, plus la relecture
    expect(container.querySelector('.bev-envois')).toBeNull();
  });

  /**
   * 🔴 UN GROUPE S'IGNORE EN ENTIER. Le bandeau annonce « 2 tentatives non envoyées » : n'en taire qu'une
   * laisserait le bandeau à l'écran en disant « 1 tentative », ce qui se lirait comme un NOUVEL échec.
   */
  it('🔴 « 2 tentatives non envoyées » se tait d’un seul clic, pour les deux', async () => {
    reponse = { etat: 'ok', lignes: echecs(2), ignorable: true };
    await monter();
    expect(container.textContent).toContain('2 tentatives non envoyées');
    const lien = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ignorer');
    reponse = { etat: 'ok', lignes: [], ignorable: true };
    await act(async () => { lien?.click(); });
    await calmer();
    expect(container.querySelector('.bev-envois')).toBeNull();
  });

  /** ⚠️ LE MOT PROMET CE QU'IL FAIT : il masque, il ne supprime pas — et l'infobulle le dit. */
  it('⚠️ l’infobulle dit que rien n’est supprimé', async () => {
    reponse = { etat: 'ok', lignes: echecs(1), ignorable: true };
    await monter();
    const lien = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ignorer');
    expect(lien?.getAttribute('title')).toContain('Rien n’est supprimé');
  });
});
