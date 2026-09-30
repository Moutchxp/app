// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoiteMail } from './BoiteMail';

/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — LA BARRE « 1–25 sur N · ‹ › » ET LE TROMBONE, À L'ÉCRAN ═════════════════════════
 *
 * Les trois demandes d'Arno, chacune éprouvée sur le vrai composant monté :
 *
 *   ① LA PAGINATION remplace « Voir les échanges plus anciens ». Une barre en HAUT (sous le champ de recherche,
 *      derrière un filet) et une en BAS, toutes deux alignées à droite, avec deux chevrons qui s'éteignent aux
 *      deux bouts. 25 par page.
 *   ② N EST UN NOMBRE D'ÉCHANGES, celui que le serveur compte pour CETTE liste. Défaut signalé : « 1–25 sur
 *      291 354 », qui ressemblait à un nombre de messages ou de lignes.
 *   ③ LE TROMBONE ET SON CHIFFRE ONT LA MÊME COULEUR. Noir quand le message affiché porte les pièces, gris quand
 *      elles sont ailleurs dans la conversation, rien du tout quand il n'y en a nulle part.
 *
 * ⚠️ CE FICHIER MONTE LE VRAI COMPOSANT et interroge le DOM. Les épreuves de forme (le texte du fichier source)
 * sont réservées à ce que le DOM ne peut pas montrer — par exemple qu'un bouton a bien DISPARU du code, et pas
 * seulement d'un rendu particulier.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Une ligne de liste, réduite à ce dont ce fichier a besoin. Le trombone se règle au cas par cas. */
const LIGNE = (filId: number, pieces: { ici: number; ailleurs: number }) => ({
  filId,
  objet: `Échange ${filId}`,
  interlocuteur: 'Mme Martin',
  messageAffiche: filId * 10,
  dernierSens: 'recu' as const,
  dernierLe: '2026-09-20T08:00:00Z',
  extrait: 'bonjour',
  nbMessages: 2,
  nbLisibles: 2,
  aPiece: pieces.ici + pieces.ailleurs > 0,
  nbPieces: pieces.ici + pieces.ailleurs,
  piecesDuMessage: pieces.ici,
  piecesAilleurs: pieces.ailleurs,
  etoilee: false,
  classement: null,
  horsGestion: false,
  reference: null,
  sansSuite: false,
  nonRemise: null,
});

let container: HTMLDivElement;
let root: Root;
let urls: string[];
/**
 * Ce que le serveur répond, page après page.
 *
 * ⚠️ LA RÉPONSE EST CHOISIE PAR LE CURSEUR DEMANDÉ, JAMAIS PAR UN COMPTEUR D'APPELS. Première écriture de ce
 * fichier : une file que chaque `fetch` dépilait. L'écran appelle la route plus d'une fois par page (relecture des
 * comptes, effets qui se rejouent), et le jeu d'essai avançait donc tout seul — la page 2 s'affichait avant qu'on
 * ait cliqué. Un jeu d'essai qui dépend du NOMBRE d'appels mesure le composant autant que lui-même.
 */
let reponses: { lignes: unknown[]; suivant: unknown; total: number | null }[];
/** Quelle réponse pour quelle demande : sans curseur ⇒ page 1 ; sinon la page que ce curseur désigne. */
let pageDuCurseur: (url: string) => number;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  reponses = [];
  pageDuCurseur = (u) => {
    const m = /avant=([^&]+)/.exec(u);
    if (m === null) return 0;
    const rang = reponses.findIndex((r) => (r.suivant as { filId?: string } | null)?.filId === m[1]);
    return rang < 0 ? 0 : rang + 1;
  };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    urls.push(u);
    const r = reponses[Math.min(pageDuCurseur(u), reponses.length - 1)];
    return {
      ok: true,
      json: async () => ({ ...r, comptes: null, nonLus: [], nonLusTotal: 0, nonLusPartiel: false }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
  await calmer();
};
const barres = () => [...container.querySelectorAll('.bpg')] as HTMLElement[];
const haut = () => container.querySelector('.bpg--haut') as HTMLElement | null;
const bas = () => container.querySelector('.bpg--bas') as HTMLElement | null;
const mot = (n: HTMLElement | null) => n?.querySelector('.bpg-mot')?.textContent ?? '';
const chevrons = (n: HTMLElement | null) => [...(n?.querySelectorAll('.bpg-chevron') ?? [])] as HTMLButtonElement[];
const cliquer = async (b: HTMLButtonElement) => {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};

/** Vingt-cinq lignes : une page pleine. */
const pagePleine = (depart: number) =>
  Array.from({ length: 25 }, (_, i) => LIGNE(depart + i, { ici: 0, ailleurs: 0 }));

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA BARRE : EN HAUT, EN BAS, À DROITE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① la pagination remplace « Voir les échanges plus anciens »', () => {
  /**
   * 🔴 LE BOUTON EST SUPPRIMÉ DU CODE, pas seulement absent d'un rendu. Demande explicite d'Arno. On le vérifie
   * sur le TEXTE du fichier : un bouton rendu sous condition peut disparaître d'un cas d'essai et rester dans
   * l'application.
   */
  it('🔴 le bouton « Voir les échanges plus anciens » n’existe plus nulle part', async () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    /**
     * ⚠️ ON CHERCHE LE BOUTON, PAS SON NOM. Le nom reste écrit dans le commentaire qui explique ce qui a été
     * retiré et pourquoi — et c'est voulu : un retrait sans trace se refait au lot suivant. Ce qu'on interdit,
     * c'est que le bouton soit encore RENDU, et que la fonction qui empilait les pages existe encore.
     */
    expect(src).not.toContain('className="svv-btn svv-btn-outline gst-btn bte-plus"');
    expect(src).not.toContain('async function voirPlus');
    // Sa feuille de style est partie avec lui : une classe sans usage se recolle un jour à autre chose.
    expect(src).not.toContain('.bte-plus{');
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 }];
    await monter();
    expect(container.querySelector('.bte-plus')).toBeNull();
    expect(container.textContent).not.toContain('Voir les échanges plus anciens');
  });

  it('la barre est rendue DEUX fois : au-dessus et au-dessous de la liste', async () => {
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 }];
    await monter();
    expect(barres()).toHaveLength(2);
    expect(haut()).not.toBeNull();
    expect(bas()).not.toBeNull();
    // Les deux disent la MÊME chose : une seule écriture les produit.
    expect(mot(haut())).toBe(mot(bas()));
  });

  /** ⚠️ LA BARRE DU HAUT EST ENTRE LA RECHERCHE ET LA LISTE — c'est la place demandée, et elle porte le filet. */
  it('la barre du haut suit le champ de recherche et précède la liste', async () => {
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 }];
    await monter();
    const html = container.innerHTML;
    expect(html.indexOf('bte-recherche')).toBeLessThan(html.indexOf('bpg--haut'));
    expect(html.indexOf('bpg--haut')).toBeLessThan(html.indexOf('bte-ligne'));
    expect(html.indexOf('bte-ligne')).toBeLessThan(html.indexOf('bpg--bas'));
  });

  /** ⚠️ UNE LISTE QUI TIENT SUR UNE PAGE N'A PAS DE BARRE : deux chevrons éteints n'apprennent rien. */
  it('liste tenant sur une seule page : aucune barre', async () => {
    reponses = [{ lignes: [LIGNE(1, { ici: 0, ailleurs: 0 })], suivant: null, total: 1 }];
    await monter();
    expect(barres()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② CE QUE LA BARRE DIT, ET CE QU'ELLE FAIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② « 1–25 sur N » : N est un nombre d’ÉCHANGES, celui de cette liste', () => {
  /**
   * ══ 🔴🔴 L'ÉPREUVE DU DÉFAUT SIGNALÉ PAR ARNO ════════════════════════════════════════════════════════════
   * « un essai d'Arno affiche “1–25 sur 291 354”, ce qui est faux ». N doit être le nombre d'échanges de la liste
   * — celui que le serveur rend dans `total`, et RIEN d'autre : ni le nombre de lignes reçues, ni un cumul.
   */
  it('🔴 N est le total rendu par le serveur, jamais le nombre de lignes de la page', async () => {
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 }];
    await monter();
    expect(mot(haut())).toBe('1–25 sur 8 546');
    // ⚠️ ET SURTOUT PAS « sur 25 » : c'est ce que faisait `r.total ?? r.lignes.length`, retiré par ce lot.
    expect(mot(haut())).not.toContain('sur 25');
  });

  /**
   * 🔴 SANS TOTAL, PAS DE « sur N » INVENTÉ. Le serveur ne compte qu'à la première page ; si rien n'est compté,
   * l'étendue s'écrit seule. Annoncer « sur 0 » au-dessus de vingt-cinq lignes serait faux ET alarmant.
   */
  it('total absent : l’étendue s’écrit seule, sans « sur »', async () => {
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: null }];
    await monter();
    expect(mot(haut())).toBe('1–25');
  });

  it('première page : ‹ est éteint, › est allumé', async () => {
    reponses = [{ lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 }];
    await monter();
    const [precedent, suivant] = chevrons(haut());
    expect(precedent.disabled).toBe(true);
    expect(suivant.disabled).toBe(false);
  });

  it('dernière page : › est éteint, ‹ reste allumé', async () => {
    reponses = [
      { lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 30 },
      { lignes: [LIGNE(99, { ici: 0, ailleurs: 0 })], suivant: null, total: null },
    ];
    await monter();
    await cliquer(chevrons(haut())[1]);
    const [precedent, suivant] = chevrons(haut());
    expect(precedent.disabled).toBe(false);
    expect(suivant.disabled).toBe(true);
  });

  /**
   * 🔴 LE TOTAL NE SE PERD PAS EN TOURNANT LA PAGE. Le serveur ne le rend qu'à la première ; la page 2 le reçoit
   * à `null`. L'écraser effacerait le « sur 8 546 » dès le premier clic sur « › » — exactement le genre de
   * régression qu'on ne voit qu'en tournant une page de plus.
   */
  it('🔴 le « sur N » survit au changement de page, alors que le serveur ne le renvoie pas', async () => {
    reponses = [
      { lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 },
      { lignes: pagePleine(26), suivant: { dernierLe: 'y', filId: '2' }, total: null },
    ];
    await monter();
    await cliquer(chevrons(haut())[1]);
    expect(mot(haut())).toBe('26–50 sur 8 546');
  });

  /**
   * ══ ⚠️ RÉÉCRIT PAR LE LOT RATTACHER-EN-ECRIVANT — LA PAGE 2 EST DEMANDÉE **AVANT** LE CLIC ═════════════════
   *
   * CE QUI ÉTAIT EXIGÉ ICI : qu'un clic sur « › » émette une requête portant le curseur du serveur. L'épreuve
   * vidait `urls`, cliquait, et cherchait la requête dans ce qui suivait.
   *
   * POURQUOI ELLE NE PEUT PLUS L'ÊTRE : le lot précharge les deux pages suivantes DÈS QUE la première est
   * rendue. Au moment du clic, la page 2 est déjà en cache — et le clic n'émet donc plus RIEN. C'est
   * exactement l'amélioration demandée (« une page déjà vue se rouvre instantanément ») : l'épreuve mesurait le
   * symptôme qu'on vient de supprimer.
   *
   * 🔒 LA PROPRIÉTÉ GARDÉE EST LA MÊME, et elle est même renforcée : la page 2 est demandée AVEC LE CURSEUR RENDU
   * PAR LE SERVEUR — seulement plus tôt. Et le clic, lui, ne coûte plus un aller-retour.
   */
  it('🔴 la page suivante est préchargée AVEC le curseur du serveur, et le clic ne coûte plus rien', async () => {
    reponses = [
      { lignes: pagePleine(1), suivant: { dernierLe: '2026-09-01T00:00:00Z', filId: '4242' }, total: 8546 },
      { lignes: pagePleine(26), suivant: null, total: null },
    ];
    await monter();
    // ① LE PRÉCHARGEMENT a employé le curseur rendu par le serveur, jamais un décalage calculé.
    expect(urls.some((u) => u.includes('depuis=2026-09-01') && u.includes('avant=4242'))).toBe(true);
    // 🔒 JAMAIS D'`OFFSET` : la boîte se pagine par curseur, c'est une règle écrite du dépôt.
    expect(urls.some((u) => u.includes('offset'))).toBe(false);

    // ② LE CLIC N'ÉMET PLUS AUCUNE REQUÊTE DE PAGE : la page 2 est déjà là.
    urls.length = 0;
    await cliquer(chevrons(haut())[1]);
    expect(mot(haut())).toContain('26–50');
    expect(urls.filter((u) => u.includes('/boite') && !u.includes('/comptes'))).toEqual([]);
  });

  /**
   * 🔴 REVENIR EN ARRIÈRE REPREND UN CURSEUR DÉJÀ VU. La page 1 n'en a pas (`null`), donc le retour depuis la
   * page 2 redemande la liste SANS curseur — et surtout pas avec celui de la page 2, qui ramènerait la page 3.
   */
  it('🔴 le chevron ‹ revient à la page précédente par son propre curseur', async () => {
    reponses = [
      { lignes: pagePleine(1), suivant: { dernierLe: '2026-09-01T00:00:00Z', filId: '4242' }, total: 8546 },
      { lignes: pagePleine(26), suivant: { dernierLe: '2026-08-01T00:00:00Z', filId: '1111' }, total: null },
      { lignes: pagePleine(1), suivant: { dernierLe: '2026-09-01T00:00:00Z', filId: '4242' }, total: null },
    ];
    await monter();
    await cliquer(chevrons(haut())[1]);
    expect(mot(haut())).toContain('26–50');
    urls.length = 0;
    await cliquer(chevrons(haut())[0]);
    expect(mot(haut())).toContain('1–25');
    expect(urls.some((u) => u.includes('depuis='))).toBe(false);
  });

  /** ⚠️ LE CHANGEMENT DE PAGE REMONTE EN HAUT DE LA LISTE (demande d'Arno). */
  it('changer de page remonte en haut de la liste', async () => {
    reponses = [
      { lignes: pagePleine(1), suivant: { dernierLe: 'x', filId: '1' }, total: 8546 },
      { lignes: pagePleine(26), suivant: null, total: null },
    ];
    await monter();
    const section = container.querySelector('section[aria-labelledby="bte-titre"]') as HTMLElement;
    const remontees: unknown[] = [];
    (section as unknown as { scrollIntoView: unknown }).scrollIntoView = (o: unknown) => { remontees.push(o); };
    await cliquer(chevrons(haut())[1]);
    expect(remontees).toHaveLength(1);
    expect(remontees[0]).toEqual({ block: 'start' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE TROMBONE : L'ICÔNE ET LE CHIFFRE, DE LA MÊME COULEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ le trombone et son chiffre ont la MÊME couleur', () => {
  const marque = () => container.querySelector('.bte-marque--pieces') as HTMLElement | null;

  /**
   * ══ 🔴🔴 LA CAUSE DU DÉFAUT, ET CE QUI LE REND IMPOSSIBLE ═════════════════════════════════════════════════
   *
   * Constat d'Arno : « l'icône 📎 est grise et le chiffre noir ». La règle des deux couleurs était pourtant
   * écrite correctement : la classe pose `color` sur le CONTENEUR, donc sur l'icône ET sur le chiffre.
   *
   * 🔴 LA CAUSE ÉTAIT LE GLYPHE : « 📎 » est un emoji, rendu par une police EN COULEUR qui ignore `color`. Il
   * restait argenté quoi qu'on écrive. C'est pourquoi cette épreuve ne regarde pas une couleur calculée (jsdom
   * ne rend rien), mais la seule chose qui garantisse le résultat : l'icône est un TRACÉ dont le trait vaut
   * `currentColor`, et elle vit DANS l'élément qui porte la couleur, avec le chiffre.
   */
  it('🔴 l’icône est un tracé qui hérite de la couleur du texte, pas un emoji', async () => {
    reponses = [{ lignes: [LIGNE(1, { ici: 2, ailleurs: 0 })], suivant: null, total: 1 }];
    await monter();
    const svg = marque()?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    // 🔒 L'ICÔNE ET LE CHIFFRE SONT DANS LE MÊME ÉLÉMENT : c'est lui qui porte `color`, donc ils ne peuvent pas
    //    diverger. Les séparer serait rouvrir le défaut par un autre chemin.
    expect(marque()?.textContent).toContain('2');
    // Et l'emoji a bien disparu du rendu.
    expect(marque()?.textContent).not.toContain('\u{1F4CE}');
  });

  /** 🔴 PIÈCES DANS CE MESSAGE ⇒ NOIR (la classe « loin », celle du gris, est absente) et le chiffre est LE SIEN. */
  it('🔴 pièces sur le message affiché : marque NOIRE, et le chiffre est celui du message', async () => {
    reponses = [{ lignes: [LIGNE(1, { ici: 2, ailleurs: 5 })], suivant: null, total: 1 }];
    await monter();
    expect(marque()?.className).toContain('bte-marque--pieces');
    expect(marque()?.className).not.toContain('bte-marque--pieces-loin');
    // ⚠️ 2, PAS 7 : le nombre est celui de l'état affiché, jamais le total de la conversation.
    expect(marque()?.textContent?.trim()).toBe('2');
    expect(marque()?.getAttribute('title')).toBe('Pièces jointes dans ce message');
  });

  /** 🔴 PIÈCES AILLEURS SEULEMENT ⇒ GRIS, et le chiffre est celui de la CONVERSATION. */
  it('🔴 pièces ailleurs dans la conversation : marque GRISE, et le chiffre est celui de la conversation', async () => {
    reponses = [{ lignes: [LIGNE(1, { ici: 0, ailleurs: 3 })], suivant: null, total: 1 }];
    await monter();
    expect(marque()?.className).toContain('bte-marque--pieces-loin');
    expect(marque()?.textContent?.trim()).toBe('3');
    expect(marque()?.getAttribute('title')).toBe('Pièces jointes ailleurs dans la conversation');
  });

  /** 🔴 AUCUNE PIÈCE NULLE PART ⇒ RIEN. Pas un trombone éteint, pas un zéro : rien. */
  it('🔴 aucune pièce nulle part : aucune marque', async () => {
    reponses = [{ lignes: [LIGNE(1, { ici: 0, ailleurs: 0 })], suivant: null, total: 1 }];
    await monter();
    expect(marque()).toBeNull();
    expect(container.querySelector('.bte-ligne')?.textContent).not.toContain('\u{1F4CE}');
  });

  /**
   * ⚠️ LES DEUX COULEURS SONT DES JETONS DU THÈME, jamais des couleurs écrites : elles doivent suivre le thème
   * Sombre sans qu'on y pense. C'est déjà la règle du module ; on la garde ici parce que c'est ce lot qui touche
   * à ces deux lignes.
   */
  it('les deux couleurs sont des jetons --color-svv-*', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    expect(src).toContain('.bte-marque--pieces{flex:0 0 auto;color:var(--color-svv-ink);font-weight:600}');
    expect(src).toContain('.bte-marque--pieces-loin{color:var(--color-svv-muted);font-weight:400}');
  });
});
