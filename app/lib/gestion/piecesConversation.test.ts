import { describe, it, expect } from 'vitest';
import {
  compterPiecesConversation, grouperParMessage, libelleOrdrePieces, mentionExpediteurPiece, motPieces,
  ordrePiecesSuivant, PARENT_PIECES_CONVERSATION, piecesDeLaConversation, voisinagePiecesConversation,
  type MessagePorteur, type PiecePortee,
} from './piecesConversation';
import { positionDans, voisinVers, voisinsVisualisables } from './apercuDrive';

/**
 * LOT PIECES-DE-LA-CONVERSATION — CE QUE COMPTE LE TROMBONE, ET DANS QUEL ORDRE ON LIT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE. Le trombone annonce un NOMBRE, et la fenêtre montre des CARTES : si les deux ne
 * sortent pas de la même règle, on lit « 7 pièces » et on en compte neuf — et l'on cherche les deux qui manquent.
 * Les trois fautes possibles sont éprouvées ici :
 *   ① un logo de signature compté comme une pièce (c'est le cas le plus fréquent : chaque mail d'Outlook en porte) ;
 *   ② un jumeau technique « ._ » de macOS compté comme un document ;
 *   ③ un ordre qui sépare les pièces d'un même message, ou qui change d'un affichage à l'autre.
 *
 * ⚠️ ET LA RÈGLE DU TOUR : « Précédent / Suivant » parcourt TOUTE la conversation côté courrier, et reste borné au
 * dossier côté Drive. Les deux sont éprouvés avec le MÊME `voisinsVisualisables`, puisque c'est le même code.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (o: Partial<PiecePortee> = {}): PiecePortee => ({
  pieceId: 1, nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 120_000,
  disponible: true, motifNonStocke: null, ...o,
});

const message = (o: Partial<MessagePorteur> = {}): MessagePorteur => ({
  messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'marie@exemple.test', deNom: 'Marie Dupont',
  objet: 'Fuite', pieces: [], ...o,
});

describe('🔴🔴 le compte des pièces d’une conversation', () => {
  it('additionne les pièces de tous les messages', () => {
    const messages = [
      message({ messageId: 1, pieces: [piece({ pieceId: 10 }), piece({ pieceId: 11, nomFichier: 'devis.pdf' })] }),
      message({ messageId: 2, pieces: [piece({ pieceId: 12, nomFichier: 'photo.jpg', typeMime: 'image/jpeg', tailleOctets: 900_000 })] }),
    ];
    expect(compterPiecesConversation(messages)).toBe(3);
    expect(piecesDeLaConversation(messages)).toHaveLength(3);
  });

  /**
   * 🔴🔴 LES IMAGES DE SIGNATURE NE COMPTENT PAS (demande d'Arno). « image001.png » de 4 ko est le logo du
   * correspondant : le compter ferait annoncer « 3 pièces » pour un mail qui n'en porte qu'une.
   */
  it('🔴 les images de signature (cid:) ne comptent pas', () => {
    const messages = [message({
      pieces: [
        piece({ pieceId: 10 }),
        piece({ pieceId: 11, nomFichier: 'image001.png', typeMime: 'image/png', tailleOctets: 4_000 }),
        piece({ pieceId: 12, nomFichier: 'logo.gif', typeMime: 'image/gif', tailleOctets: 1_200 }),
      ],
    })];
    expect(compterPiecesConversation(messages)).toBe(1);
    expect(piecesDeLaConversation(messages).map((p) => p.pieceId)).toEqual([10]);
  });

  /**
   * 🔴 LES « ._ » DE macOS NON PLUS. Aucun n'existe en base au 30/09/2026 (27 005 pièces, 0 en « ._ ») — et c'est
   * exactement pourquoi cette épreuve est écrite : le jour où l'un arrivera, personne n'aura à s'en souvenir.
   */
  it('🔴 les fichiers « ._ » de macOS ne comptent pas', () => {
    const messages = [message({
      pieces: [piece({ pieceId: 10 }), piece({ pieceId: 11, nomFichier: '._bail.pdf' })],
    })];
    expect(compterPiecesConversation(messages)).toBe(1);
    expect(piecesDeLaConversation(messages).map((p) => p.nomFichier)).toEqual(['bail.pdf']);
  });

  /**
   * 🔴 UNE PIÈCE NON CONSERVÉE COMPTE. Elle a existé dans le courrier ; la retirer du compte ferait croire que le
   * correspondant ne l'a jamais joint. C'est aussi ce que comptent les trombones des lignes : le total est leur somme.
   */
  it('🔴 une pièce non conservée compte quand même, et porte son motif', () => {
    const messages = [message({
      pieces: [piece({ pieceId: 10 }), piece({ pieceId: 11, nomFichier: 'gros.zip', disponible: false, motifNonStocke: 'trop volumineuse' })],
    })];
    expect(compterPiecesConversation(messages)).toBe(2);
    expect(piecesDeLaConversation(messages)[1].motifNonStocke).toBe('trop volumineuse');
  });

  it('sans pièce, il n’y a rien à annoncer', () => {
    expect(compterPiecesConversation([message(), message({ messageId: 2 })])).toBe(0);
    expect(piecesDeLaConversation([message()])).toEqual([]);
  });

  it('le mot s’accorde', () => {
    expect(motPieces(1)).toBe('1 pièce');
    expect(motPieces(7)).toBe('7 pièces');
  });
});

describe('🔴🔴 l’ordre : par date, la plus récente d’abord', () => {
  const messages = [
    message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [piece({ pieceId: 10, nomFichier: 'a.pdf' })] }),
    message({ messageId: 2, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 11, nomFichier: 'b.pdf' }), piece({ pieceId: 12, nomFichier: 'c.pdf' })] }),
    message({ messageId: 3, recuLe: '2026-09-10T08:00:00Z', pieces: [piece({ pieceId: 13, nomFichier: 'd.pdf' })] }),
  ];

  it('🔴 la plus récente d’abord par défaut', () => {
    expect(piecesDeLaConversation(messages).map((p) => p.nomFichier)).toEqual(['b.pdf', 'c.pdf', 'd.pdf', 'a.pdf']);
  });

  it('🔴 le bouton inverse l’ordre, et rien d’autre', () => {
    expect(piecesDeLaConversation(messages, 'ancien').map((p) => p.nomFichier))
      .toEqual(['a.pdf', 'd.pdf', 'b.pdf', 'c.pdf']);
  });

  /**
   * 🔴 LES PIÈCES D'UN MÊME MESSAGE RESTENT ENSEMBLE, DANS L'ORDRE DU MAIL (demande d'Arno). On classe les
   * MESSAGES, jamais les pièces une à une : « b.pdf » et « c.pdf » ne se séparent donc dans aucun des deux sens.
   */
  it('🔴 les pièces d’un même message ne se séparent pas, et gardent l’ordre du mail', () => {
    for (const ordre of ['recent', 'ancien'] as const) {
      const noms = piecesDeLaConversation(messages, ordre).map((p) => p.nomFichier);
      expect(noms.indexOf('c.pdf'), ordre).toBe(noms.indexOf('b.pdf') + 1);
    }
  });

  /** ⚠️ DEUX MAILS À LA MÊME SECONDE (un automate en rafale) : l'identifiant tranche, l'ordre ne bouge plus. */
  it('🔴 à date égale, l’identifiant tranche — l’ordre est stable', () => {
    const exaequo = [
      message({ messageId: 7, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 70, nomFichier: 'sept.pdf' })] }),
      message({ messageId: 8, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 80, nomFichier: 'huit.pdf' })] }),
    ];
    expect(piecesDeLaConversation(exaequo).map((p) => p.nomFichier)).toEqual(['huit.pdf', 'sept.pdf']);
    expect(piecesDeLaConversation([...exaequo].reverse()).map((p) => p.nomFichier)).toEqual(['huit.pdf', 'sept.pdf']);
  });

  /** ⚠️ Une date illisible se comporte comme la plus ancienne : elle ne doit pas emporter le classement. */
  it('une date illisible ne renverse pas le classement', () => {
    const noms = piecesDeLaConversation([
      message({ messageId: 1, recuLe: 'pas une date', pieces: [piece({ pieceId: 10, nomFichier: 'x.pdf' })] }),
      message({ messageId: 2, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 11, nomFichier: 'y.pdf' })] }),
    ]).map((p) => p.nomFichier);
    expect(noms).toEqual(['y.pdf', 'x.pdf']);
  });

  it('le libellé dit l’ordre en cours, et la bascule fait l’aller-retour', () => {
    expect(libelleOrdrePieces('recent')).toBe('Plus récente d’abord');
    expect(libelleOrdrePieces('ancien')).toBe('Plus ancienne d’abord');
    expect(ordrePiecesSuivant(ordrePiecesSuivant('recent'))).toBe('recent');
  });
});

describe('🔴 le regroupement sous la date du message', () => {
  it('un groupe par message, dans l’ordre reçu, sans reclasser', () => {
    const groupes = grouperParMessage(piecesDeLaConversation([
      message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [piece({ pieceId: 10 })] }),
      message({ messageId: 2, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 11 }), piece({ pieceId: 12 })] }),
    ]));
    expect(groupes.map((g) => [g.messageId, g.pieces.length])).toEqual([[2, 2], [1, 1]]);
  });

  it('aucune pièce, aucun groupe', () => {
    expect(grouperParMessage([])).toEqual([]);
  });
});

describe('🔴 d’où vient la pièce, en mots', () => {
  it('reçue : le nom de l’expéditeur, sinon son adresse', () => {
    expect(mentionExpediteurPiece({ sens: 'recu', de: 'm@x.test', deNom: 'Marie Dupont' })).toBe('reçu de Marie Dupont');
    expect(mentionExpediteurPiece({ sens: 'recu', de: 'm@x.test', deNom: null })).toBe('reçu de m@x.test');
    expect(mentionExpediteurPiece({ sens: 'recu', de: 'm@x.test', deNom: '   ' })).toBe('reçu de m@x.test');
  });

  /** 🔴 LES MOTS D'ARNO : « nous avons envoyé ». Un fichier s'envoie ; seul un message « s'écrit ». */
  it('🔴 envoyée par nous : « nous avons envoyé »', () => {
    expect(mentionExpediteurPiece({ sens: 'envoye', de: 'gestion@x.test', deNom: 'Gestion' })).toBe('nous avons envoyé');
  });
});

describe('🔴🔴 « Précédent / Suivant » parcourt TOUTE la conversation côté courrier', () => {
  const messages = [
    message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [piece({ pieceId: 10, nomFichier: 'a.pdf' })] }),
    message({ messageId: 2, recuLe: '2026-09-20T08:00:00Z', pieces: [piece({ pieceId: 11, nomFichier: 'b.pdf' }), piece({ pieceId: 12, nomFichier: 'c.jpg', typeMime: 'image/jpeg' })] }),
  ];
  const pieces = piecesDeLaConversation(messages);
  const voisinage = voisinagePiecesConversation(pieces);

  it('🔴 le tour tient toutes les pièces, dans l’ordre de la fenêtre', () => {
    const tour = voisinsVisualisables(voisinage, { id: '11', typeMime: 'application/pdf', parentId: PARENT_PIECES_CONVERSATION });
    expect(tour.map((v) => v.nom)).toEqual(['b.pdf', 'c.jpg', 'a.pdf']);
    expect(positionDans(tour, '12')).toBe(2);
  });

  /** 🔴 ET ON NE BOUCLE PAS : au dernier, « Suivant » est éteint (demande d'Arno, déjà tenue par `voisinVers`). */
  it('🔴 aucun rebouclage au bout du tour', () => {
    const tour = voisinsVisualisables(voisinage, { id: '11', typeMime: 'application/pdf', parentId: PARENT_PIECES_CONVERSATION });
    expect(voisinVers(tour, '11', -1)).toBeNull();
    expect(voisinVers(tour, '11', 1)).toBe('12');
    expect(voisinVers(tour, '10', 1)).toBeNull();
  });

  /** ⚠️ UNE PIÈCE NON CONSERVÉE N'EST PAS DANS LE TOUR : il n'y a pas d'octets, « Suivant » montrerait un cadre vide. */
  it('les pièces non conservées sortent du tour', () => {
    const avecPerdue = voisinagePiecesConversation(piecesDeLaConversation([
      message({ pieces: [piece({ pieceId: 10 }), piece({ pieceId: 11, nomFichier: 'perdue.pdf', disponible: false })] }),
    ]));
    expect(avecPerdue.map((v) => v.id)).toEqual(['10']);
  });

  /**
   * 🔴🔴 LE TOUR DU COURRIER ET CELUI DU DRIVE NE SE MÉLANGENT JAMAIS, et c'est le parent inventé qui le garantit.
   * Un fichier du Drive glissé dans le même voisinage n'entre pas dans le tour, et réciproquement : c'est la même
   * règle de sécurité que côté Drive, tenue par le même code.
   */
  it('🔴 un fichier du Drive ne peut pas entrer dans le tour du courrier', () => {
    const melange = [
      ...voisinage,
      { id: 'drive-1', nom: 'autre.pdf', typeMime: 'application/pdf', dossier: false, parentId: 'dossier-drive' },
    ];
    const tour = voisinsVisualisables(melange, { id: '11', typeMime: 'application/pdf', parentId: PARENT_PIECES_CONVERSATION });
    expect(tour.map((v) => v.id)).not.toContain('drive-1');
    // 🔴 ET RÉCIPROQUEMENT : ouvert depuis un dossier du Drive, le tour reste BORNÉ À CE DOSSIER (inchangé).
    const cote = voisinsVisualisables(melange, { id: 'drive-1', typeMime: 'application/pdf', parentId: 'dossier-drive' });
    expect(cote.map((v) => v.id)).toEqual(['drive-1']);
  });
});
