// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonPiecesConversation, ModalePiecesConversation } from './PiecesDeLaConversation';
import {
  dedoublonnerPieces, piecesDeLaConversation, type MessagePorteur, type PiecePortee,
} from '../../../../lib/gestion/piecesConversation';

/**
 * LOT PIECES-DE-LA-CONVERSATION — LE RÉCAPITULATIF EST RENDU, ET IL DIT TOUT CE QU'ARNO A DEMANDÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE, ET QUE LES ÉPREUVES DU MODULE PUR NE PEUVENT PAS PROTÉGER. Le module pur dit quelles
 * pièces existent, dans quel ordre et avec quels mots ; il ne dit pas qu'elles ARRIVENT À L'ÉCRAN, ni qu'une carte
 * porte ses quatre gestes. C'est exactement la liste d'Arno : « sous chacune le nom, la taille, la date, l'expéditeur,
 * et l'état “Dans le Drive” si elle y est déjà. Actions par carte : Visualiser, Télécharger, Ranger dans le Drive, et
 * Aller au message ».
 *
 * ⚠️ CE QU'IL NE PEUT PAS PROUVER : la mise en page (jsdom ne calcule aucune hauteur), et le fait que la visionneuse
 * s'ouvre VRAIMENT sur la pièce cliquée — ici on vérifie que le geste est DEMANDÉ, avec le bon identifiant. Ce que la
 * visionneuse fait du tour est éprouvé, lui, dans `piecesConversation.test.ts`, sur le même code pur que le Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const piece = (o: Partial<PiecePortee> = {}): PiecePortee => ({
  pieceId: 1, nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 120_000,
  // 🔴 LOT RECAP-SANS-DOUBLON — chaque pièce d'essai porte une empreinte DISTINCTE par défaut : sans cela, deux
  //   pièces de contenu différent se ressembleraient et le dédoublonnage en avalerait une.
  disponible: true, motifNonStocke: null, empreinte: `sha-${o.pieceId ?? 1}`, ...o,
});
const message = (o: Partial<MessagePorteur> = {}): MessagePorteur => ({
  messageId: 1, recuLe: '2026-09-20T08:00:00Z', sens: 'recu', de: 'marie@exemple.test', deNom: 'Marie Dupont',
  objet: 'Quittances', pieces: [], ...o,
});

const MESSAGES: MessagePorteur[] = [
  message({
    messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', deNom: 'Marie Dupont',
    pieces: [
      piece({ pieceId: 10, nomFichier: 'bail.pdf' }),
      // Un logo de signature : il ne doit apparaître NI dans le compte, NI dans la grille.
      piece({ pieceId: 11, nomFichier: 'image001.png', typeMime: 'image/png', tailleOctets: 3_000 }),
    ],
  }),
  message({
    messageId: 2, recuLe: '2026-09-20T08:00:00Z', sens: 'envoye', de: 'gestion@exemple.test', deNom: 'Gestion',
    pieces: [
      piece({ pieceId: 20, nomFichier: 'devis.pdf', tailleOctets: 45_000 }),
      piece({ pieceId: 21, nomFichier: 'perdue.zip', typeMime: 'application/zip', disponible: false, motifNonStocke: 'trop volumineuse' }),
    ],
  }),
];

let container: HTMLDivElement;
let root: Root;
/* 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — un cinquième geste : « voir cet emplacement dans le Drive ». */
const gestes = {
  onVoir: vi.fn(), onRanger: vi.fn(), onAllerAuMessage: vi.fn(), onVoirDansLeDrive: vi.fn(),
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  gestes.onVoir.mockReset(); gestes.onRanger.mockReset(); gestes.onAllerAuMessage.mockReset();
  gestes.onVoirDansLeDrive.mockReset();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const monter = (o: {
  ordre?: 'recent' | 'ancien';
  depots?: Map<number, { pieceId: number; dossierNom: string | null; webViewLink: string | null }>;
  /** 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — où chaque CONTENU se trouve déjà. Absent ⇒ aucun picto. */
  emplacements?: Map<number, unknown[]>;
  /** 🔴 LOT RECAP-SANS-DOUBLON — la fenêtre reçoit ce que l'écran lui donne : une liste DÉJÀ dédoublonnée. */
  messages?: MessagePorteur[];
} = {}) => {
  const ordre = o.ordre ?? 'recent';
  const recap = dedoublonnerPieces(piecesDeLaConversation(o.messages ?? MESSAGES, ordre));
  act(() => {
    root.render(createElement(ModalePiecesConversation, {
      pieces: recap.pieces,
      sansEmpreinte: recap.sansEmpreinte,
      ordre,
      onOrdre: () => {},
      depots: o.depots ?? new Map(),
      emplacements: o.emplacements ?? new Map(),
      maintenant: new Date('2026-09-30T12:00:00Z'),
      gestes,
      ecouterEchap: true,
      onFermer: () => {},
    } as never));
  });
};

const cartes = () => [...container.querySelectorAll('.pdc-carte')];
const nomsAffiches = () => [...container.querySelectorAll('.pdc-nom')].map((e) => e.textContent ?? '');

describe('🔴🔴 la fenêtre « Pièces jointes de la conversation »', () => {
  it('🔴 elle est rendue, avec son titre et le compte', () => {
    monter();
    const boite = container.querySelector('[role="dialog"]');
    expect(boite).not.toBeNull();
    expect(boite?.getAttribute('aria-label')).toBe('Pièces jointes de la conversation');
    expect(container.querySelector('.pdc-titre')?.textContent).toContain('3 pièces');
  });

  /** 🔴 UNE CARTE PAR PIÈCE COMPTÉE, et le logo de signature n'en a pas : le compte et la grille ne divergent pas. */
  it('🔴 une carte par pièce, signature exclue', () => {
    monter();
    expect(cartes()).toHaveLength(3);
    expect(nomsAffiches()).toEqual(['devis.pdf', 'perdue.zip', 'bail.pdf']);
    expect(container.textContent).not.toContain('image001.png');
  });

  /** 🔴 L'ORDRE DE LA FENÊTRE EST CELUI QU'ON LUI DONNE : elle n'en invente aucun. */
  it('🔴 l’ordre inversé remonte les plus anciennes', () => {
    monter({ ordre: 'ancien' });
    expect(nomsAffiches()).toEqual(['bail.pdf', 'devis.pdf', 'perdue.zip']);
  });

  /** 🔴 LES PIÈCES SONT REGROUPÉES SOUS LA DATE DU MESSAGE, avec l'expéditeur en mots (demande d'Arno). */
  it('🔴 un groupe par message, daté, avec « reçu de » ou « nous avons envoyé »', () => {
    monter();
    const titres = [...container.querySelectorAll('.pdc-groupe-titre')].map((e) => e.textContent ?? '');
    expect(titres).toHaveLength(2);
    expect(titres[0]).toContain('nous avons envoyé');
    expect(titres[0]).toContain('septembre 2026');
    expect(titres[1]).toContain('reçu de Marie Dupont');
  });

  /** 🔴 CHAQUE CARTE PORTE LE NOM, LA TAILLE, LA DATE ET L'EXPÉDITEUR — la liste exacte d'Arno. */
  it('🔴 la carte dit le nom, la taille, la date et l’expéditeur', () => {
    monter();
    const premiere = cartes()[0];
    expect(premiere.querySelector('.pdc-nom')?.textContent).toBe('devis.pdf');
    const metas = [...premiere.querySelectorAll('.pdc-meta')].map((e) => e.textContent ?? '');
    expect(metas.join(' | ')).toContain('45');
    expect(metas.join(' | ')).toContain('nous avons envoyé');
  });

  /** 🔴 « Dans le Drive » EST DIT EN MOTS, avec le nom du dossier et un lien pour y aller. */
  it('🔴 une pièce déjà rangée le DIT, avec son dossier', () => {
    monter({
      depots: new Map([[20, { pieceId: 20, dossierNom: 'Quittances 2026', webViewLink: 'https://drive.example/x' }]]),
    });
    const mention = cartes()[0].querySelector('.pdc-drive');
    expect(mention?.textContent).toContain('Dans le Drive');
    expect(mention?.textContent).toContain('Quittances 2026');
    expect(mention?.querySelector('a')?.getAttribute('href')).toBe('https://drive.example/x');
    // ⚠️ Et une pièce NON rangée ne porte aucune mention : « Dans le Drive » ne se devine pas, il s'affiche.
    expect(cartes()[2].querySelector('.pdc-drive')).toBeNull();
  });

  /**
   * 🔴🔴 LES QUATRE GESTES D'UNE CARTE (demande d'Arno) : Visualiser, Télécharger, Ranger dans le Drive, Aller au
   * message. C'est l'épreuve qui échoue si l'un d'eux disparaît.
   */
  it('🔴 les quatre gestes sont là, et chacun porte sur LA BONNE pièce', () => {
    monter();
    const premiere = cartes()[0];
    const titres = [...premiere.querySelectorAll('.pdc-action')].map((e) => e.getAttribute('title') ?? '');
    expect(titres).toEqual(['Visualiser', 'Télécharger', 'Ranger dans le Drive', 'Aller au message']);

    const bouton = (t: string) => premiere.querySelector(`.pdc-action[title="${t}"]`) as HTMLElement;
    act(() => { bouton('Visualiser').click(); });
    expect(gestes.onVoir).toHaveBeenCalledWith(20);
    act(() => { bouton('Ranger dans le Drive').click(); });
    expect(gestes.onRanger.mock.calls[0][0].pieceId).toBe(20);
    act(() => { bouton('Aller au message').click(); });
    expect(gestes.onAllerAuMessage).toHaveBeenCalledWith(2);

    // Le téléchargement est un LIEN vers notre route, jamais une URL de stockage.
    expect(premiere.querySelector('a.pdc-action')?.getAttribute('href'))
      .toBe('/api/admin/gestion/pieces/20?telecharger=1');
  });

  /**
   * ══ 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — LE CLIC SIMPLE N'OUVRE PLUS LA VISIONNEUSE ═══════════════════════════
   *
   * DÉCISION D'ARNO (03/10/2026). Ce test disait l'inverse avant ce lot (« la vignette est aussi un bouton :
   * c'est le geste qu'on fait d'instinct ») — il est RETOURNÉ, pas supprimé : la règle a changé, et le défaut
   * qu'on veut interdire désormais est qu'un clic distrait ouvre une fenêtre.
   *
   * 🔴 LES DEUX GESTES RESTENT, CHACUN LE SIEN : l'œil de la rangée d'actions ouvre la visionneuse (éprouvé juste
   * au-dessus), le double-clic ouvre le document entier dans un onglet (éprouvé juste en dessous).
   */
  it('🔴🔴 cliquer la vignette n’ouvre PLUS la visionneuse', () => {
    monter();
    act(() => { (cartes()[0].querySelector('.pdc-apercu') as HTMLElement).click(); });
    expect(gestes.onVoir).not.toHaveBeenCalled();
  });

  /** 🔴🔴 LE DOUBLE-CLIC OUVRE LE DOCUMENT ENTIER, DANS UN NOUVEL ONGLET ET EN INLINE (aucun `?telecharger=1`). */
  it('🔴🔴 double-cliquer la vignette ouvre le document dans un nouvel onglet', () => {
    monter();
    const ouvre = vi.fn();
    const avant = window.open;
    (window as unknown as { open: unknown }).open = ouvre;
    try {
      act(() => {
        (cartes()[0].querySelector('.pdc-apercu') as HTMLElement)
          .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
    } finally {
      (window as unknown as { open: unknown }).open = avant;
    }
    expect(ouvre).toHaveBeenCalledWith('/api/admin/gestion/pieces/20', '_blank', 'noopener,noreferrer');
    // ⚠️ ET LA VISIONNEUSE N'EST PAS OUVERTE AU PASSAGE : un double-clic émet d'abord deux `click`.
    expect(gestes.onVoir).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 UNE PIÈCE NON CONSERVÉE NE PROMET AUCUN GESTE, ET DIT POURQUOI. La promettre puis échouer après coup est
   * pire que de ne rien proposer — c'est la règle du module, appliquée ici.
   */
  it('🔴 une pièce non conservée : aucun geste actif, et son motif est écrit', () => {
    monter();
    const perdue = cartes()[1];
    expect(perdue.textContent).toContain('non conservée');
    expect(perdue.textContent).toContain('trop volumineuse');
    // Les trois premiers gestes sont MUETS (des constats), seul « Aller au message » reste un bouton.
    expect(perdue.querySelectorAll('.pdc-action--muette')).toHaveLength(3);
    act(() => { (perdue.querySelector('.pdc-apercu') as HTMLElement).click(); });
    expect(gestes.onVoir).not.toHaveBeenCalled();
  });
});

describe('🔴 le trombone', () => {
  it('🔴 il annonce le compte, avec l’infobulle d’Arno', () => {
    act(() => { root.render(createElement(BoutonPiecesConversation, { nombre: 7, onOuvrir: () => {} })); });
    const b = container.querySelector('.pdc-trombone');
    expect(b?.textContent).toContain('7 pièces');
    expect(b?.getAttribute('title')).toBe('Toutes les pièces jointes de la conversation');
  });

  /** 🔴 AUCUNE PIÈCE ⇒ AUCUN TROMBONE (demande d'Arno) : un trombone à zéro promettrait une fenêtre vide. */
  it('🔴 sans pièce, il n’y a rien du tout', () => {
    act(() => { root.render(createElement(BoutonPiecesConversation, { nombre: 0, onOuvrir: () => {} })); });
    expect(container.querySelector('.pdc-trombone')).toBeNull();
  });
});

/**
 * ══ 🔴🔴 GARDE DE SOURCE — LE TROMBONE EST BIEN AUX DEUX ENDROITS DEMANDÉS ════════════════════════════════════════
 *
 * Arno : « place une petite icône trombone + nombre total à DEUX endroits : en HAUT à côté de “N messages · Tout
 * déplier · Plus récent d'abord”, et en BAS à côté de la rangée Répondre / Répondre à tous / Transférer ».
 *
 * ⚠️ POURQUOI UN GARDE DE SOURCE ET NON UN RENDU. Monter `Conversation` demande de simuler une demi-douzaine de
 * routes (messages, corps, Gmail, rattachements, hors-gestion, brouillons) pour éprouver DEUX emplacements. Le garde
 * dit ce qui compte vraiment ici : le bouton est écrit UNE fois et posé DEUX fois, et le trombone du bas a sa propre
 * rangée — celle qui survit à l'absence du pied de réponse. Le rendu du bouton, lui, est éprouvé juste au-dessus.
 */
describe('🔴 le trombone est écrit une fois et posé deux fois', () => {
  // ⚠️ Chemin depuis la RACINE du dépôt, comme les autres gardes de source du module : `import.meta.url` n'est pas
  //   une adresse `file:` sous l'environnement jsdom.
  const source = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  it('🔴 un seul composant, deux emplacements', () => {
    expect(source).toContain('const trombonePieces = <BoutonPiecesConversation');
    // Une définition + deux poses = trois occurrences au minimum.
    expect(source.match(/trombonePieces/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('🔴 le trombone du bas a sa propre rangée, hors du pied de réponse', () => {
    expect(source).toContain('className="cnv-pieces-bas"');
    expect(source).toContain('.cnv-pieces-bas{');
  });
});

/**
 * ══ 🔴🔴 LOT RECAP-SANS-DOUBLON — CE QUE LA FENÊTRE DIT D'UNE PIÈCE VUE PLUSIEURS FOIS ════════════════════════
 *
 * Le module pur décide QUI survit ; seule cette épreuve-ci vérifie que les autres apparitions ARRIVENT à l'écran,
 * et qu'elles y sont CLIQUABLES. Retirer les répétitions sans rien laisser ferait douter : « je suis sûr de
 * l'avoir renvoyée, pourquoi ne la vois-je pas ? ».
 */
describe('🔴🔴 les autres apparitions se disent, et mènent au message', () => {
  const MEMES: MessagePorteur[] = [
    message({
      messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', deNom: 'De Largentaye',
      pieces: [piece({ pieceId: 10, nomFichier: 'TF Pergolèse.pdf', empreinte: 'abc' })],
    }),
    message({
      messageId: 2, recuLe: '2026-09-30T15:49:00Z', sens: 'envoye', de: 'gestion@exemple.test', deNom: 'Gestion',
      pieces: [piece({ pieceId: 20, nomFichier: 'TF Pergolèse.pdf', empreinte: 'abc' })],
    }),
  ];

  it('🔴 UNE SEULE carte, et le titre annonce UNE pièce', () => {
    monter({ messages: MEMES });
    expect(cartes()).toHaveLength(1);
    expect(container.querySelector('.pdc-compte')?.textContent).toContain('1 pièce');
  });

  it('🔴 la mention « aussi envoyée le 30/09 à 17:49 » est écrite sous la vignette', () => {
    monter({ messages: MEMES });
    const renvois = [...container.querySelectorAll('.pdc-aussi')].map((e) => e.textContent ?? '');
    expect(renvois).toEqual(['aussi envoyée le 30/09 à 17:49']);
  });

  it('🔴 le renvoi est CLIQUABLE et mène AU MESSAGE de cette apparition, pas à celui de la pièce gardée', () => {
    monter({ messages: MEMES });
    const renvoi = container.querySelector('.pdc-aussi') as HTMLButtonElement;
    act(() => { renvoi.click(); });
    expect(gestes.onAllerAuMessage).toHaveBeenCalledWith(2);
  });

  /**
   * 🔴 LE DÉPÔT EST ENREGISTRÉ CONTRE LA PIÈCE RANGÉE. Si l'on a rangé la copie du 30/09 et que la carte montre
   * celle du 23/09, ne chercher que sur l'identifiant affiché ferait disparaître « Dans le Drive » — et l'on
   * rangerait une seconde fois un fichier déjà rangé.
   */
  it('🔴 « Dans le Drive » se voit même si c’est une AUTRE apparition qui a été rangée', () => {
    monter({
      messages: MEMES,
      depots: new Map([[20, { pieceId: 20, dossierNom: 'Taxes 2026', webViewLink: null }]]),
    });
    expect(container.querySelector('.pdc-drive')?.textContent).toContain('Taxes 2026');
  });

  it('une pièce vue une seule fois ne porte AUCUN renvoi', () => {
    monter();
    expect(container.querySelectorAll('.pdc-aussi')).toHaveLength(0);
  });

  it('⚠️ le rapprochement SANS EMPREINTE est signalé en pied de fenêtre, et seulement alors', () => {
    monter({ messages: MEMES });
    expect(container.querySelector('.pdc-presomption')).toBeNull();

    const sansEmpreinte = MEMES.map((m) => message({
      ...m, pieces: m.pieces.map((x) => ({ ...x, empreinte: null })),
    }));
    monter({ messages: sansEmpreinte });
    expect(container.querySelector('.pdc-presomption')?.textContent)
      .toContain('sur son nom et sa taille');
  });
});
