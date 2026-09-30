import { describe, it, expect } from 'vitest';
import {
  cleIdentitePiece, compterPiecesConversation, dedoublonnerPieces, grouperParMessage, libelleOrdrePieces,
  mentionAutreApparition, mentionExpediteurPiece, motPieces, vraiesPiecesDuMessage,
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
  // 🔴 LOT RECAP-SANS-DOUBLON — chaque pièce d'essai porte une empreinte DISTINCTE par défaut : sans cela, deux
  //   pièces de contenu différent se ressembleraient et le dédoublonnage en avalerait une.
  disponible: true, motifNonStocke: null, empreinte: `sha-${o.pieceId ?? 1}`, ...o,
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

/**
 * ══ 🔴🔴 LOT RECAP-SANS-DOUBLON — UNE MÊME PIÈCE N'APPARAÎT QU'UNE FOIS ═══════════════════════════════════════
 *
 * CONSTAT D'ARNO, fil 3494 : le récapitulatif annonçait « 30 pièces ». Mesuré en base le 30/09/2026 : 36 pièces
 * brutes pour 8 fichiers DIFFÉRENTS. Les mêmes avis d'imposition, reçus puis transférés puis re-transférés.
 *
 * Les trois cas qu'Arno a nommés sont les trois premiers `it` : reçu puis transféré = 1 ; renommé mais identique
 * = 1 ; deux fichiers différents de même nom = 2. Le troisième est le plus important : se tromper dans ce sens-là
 * FAIT DISPARAÎTRE un document, et une pièce manquante ne se voit pas, alors qu'un doublon se voit.
 */
describe('🔴🔴 le récapitulatif ne montre qu’une fois le même fichier', () => {
  /** Le même contenu (même empreinte, même taille), reçu le 1er puis renvoyé le 5. */
  const recuPuisTransfere = () => [
    message({
      messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'ddl@rdpromotion.fr', deNom: 'De Largentaye',
      pieces: [piece({ pieceId: 10, nomFichier: 'TF Pergolèse.pdf', empreinte: 'abc', tailleOctets: 76_433 })],
    }),
    message({
      messageId: 2, recuLe: '2026-09-05T17:49:00Z', sens: 'envoye', de: 'gestion@criterimmo.fr', deNom: 'Gestion',
      pieces: [piece({ pieceId: 20, nomFichier: 'TF Pergolèse.pdf', empreinte: 'abc', tailleOctets: 76_433 })],
    }),
  ];

  it('🔴 même fichier REÇU puis TRANSFÉRÉ = 1 pièce', () => {
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation(recuPuisTransfere()));
    expect(pieces).toHaveLength(1);
    expect(compterPiecesConversation(recuPuisTransfere())).toBe(1);
  });

  it('🔴 fichier RENOMMÉ mais identique = 1 pièce — le nom est ce qui change le plus facilement', () => {
    const messages = recuPuisTransfere();
    messages[1] = message({
      ...messages[1],
      pieces: [piece({ pieceId: 20, nomFichier: 'taxe foncière Pergolèse (copie).pdf', empreinte: 'abc',
        tailleOctets: 76_433 })],
    });
    expect(dedoublonnerPieces(piecesDeLaConversation(messages)).pieces).toHaveLength(1);
  });

  it('🔴🔴 deux fichiers DIFFÉRENTS de MÊME NOM = 2 pièces — en fondre un le ferait disparaître', () => {
    const messages = recuPuisTransfere();
    messages[1] = message({
      ...messages[1],
      pieces: [piece({ pieceId: 20, nomFichier: 'TF Pergolèse.pdf', empreinte: 'zzz', tailleOctets: 76_433 })],
    });
    expect(dedoublonnerPieces(piecesDeLaConversation(messages)).pieces).toHaveLength(2);
  });
});

describe('🔴 c’est la PREMIÈRE apparition qui reste, et les autres se disent', () => {
  const messages = () => [
    message({
      messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'ddl@rdpromotion.fr', deNom: 'De Largentaye',
      pieces: [piece({ pieceId: 10, empreinte: 'abc' })],
    }),
    message({
      messageId: 2, recuLe: '2026-09-05T17:49:00Z', sens: 'envoye', de: 'gestion@criterimmo.fr', deNom: 'Gestion',
      pieces: [piece({ pieceId: 20, empreinte: 'abc' })],
    }),
    message({
      messageId: 3, recuLe: '2026-09-08T09:10:00Z', sens: 'envoye', de: 'gestion@criterimmo.fr', deNom: 'Gestion',
      pieces: [piece({ pieceId: 30, empreinte: 'abc' })],
    }),
  ];

  it('🔴 la pièce gardée est la PLUS ANCIENNE, avec son message et sa date', () => {
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation(messages()));
    expect(pieces).toHaveLength(1);
    expect(pieces[0].pieceId).toBe(10);
    expect(pieces[0].messageId).toBe(1);
    expect(pieces[0].recuLe).toBe('2026-09-01T08:00:00Z');
  });

  /**
   * 🔴 LE BOUTON « PLUS RÉCENTE D'ABORD » INVERSE CE QU'ON VOIT, PAS QUI SURVIT. S'il décidait aussi de la
   * survivante, la même pièce changerait de date et de message selon le sens de lecture.
   */
  it('🔴 l’ordre d’AFFICHAGE ne change pas la pièce gardée', () => {
    for (const ordre of ['recent', 'ancien'] as const) {
      const { pieces } = dedoublonnerPieces(piecesDeLaConversation(messages(), ordre));
      expect(pieces[0].pieceId, ordre).toBe(10);
      expect(pieces[0].autresApparitions.map((a) => a.pieceId), ordre).toEqual([20, 30]);
    }
  });

  it('les autres apparitions sont rendues de la plus ANCIENNE à la plus récente, avec leur sens', () => {
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation(messages()));
    expect(pieces[0].autresApparitions.map((a) => a.messageId)).toEqual([2, 3]);
    expect(pieces[0].autresApparitions.every((a) => a.sens === 'envoye')).toBe(true);
  });

  it('🔴 la mention s’accorde avec LA PIÈCE, et porte une date ABSOLUE', () => {
    expect(mentionAutreApparition({ sens: 'envoye', recuLe: '2026-09-30T15:49:00Z', messageId: 9 }))
      .toBe('aussi envoyée le 30/09 à 17:49');
    expect(mentionAutreApparition({ sens: 'recu', recuLe: '2026-09-30T15:49:00Z', messageId: 9 }))
      .toBe('aussi reçue le 30/09 à 17:49');
  });

  /**
   * 🔴 VU À L'ÉCRAN : le mail du 23/09 portait DEUX FOIS le même PDF. « aussi reçue le 23/09 à 15:57 » sous une
   * carte datée du 23/09 à 15:57 a l'air faux, et fait chercher un second mail qui n'existe pas.
   */
  it('🔴 deux fois dans le MÊME message se dit autrement — sinon la phrase a l’air fausse', () => {
    expect(mentionAutreApparition({ sens: 'recu', recuLe: '2026-09-23T13:57:00Z', messageId: 5 }, 5))
      .toBe('jointe une seconde fois au même message');
    // Un AUTRE message garde la date : c'est elle qui dit lequel.
    expect(mentionAutreApparition({ sens: 'recu', recuLe: '2026-09-23T13:57:00Z', messageId: 6 }, 5))
      .toContain('23/09');
  });

  it('une pièce qui n’apparaît qu’une fois n’a AUCUN renvoi — le cas ordinaire ne dit rien', () => {
    const { pieces, sansEmpreinte } = dedoublonnerPieces(piecesDeLaConversation([messages()[0]]));
    expect(pieces[0].autresApparitions).toEqual([]);
    expect(sansEmpreinte).toBe(0);
  });
});

describe('⚠️ sans empreinte, on rapproche sur le nom et la taille — et on le DIT', () => {
  const sansEmpreinte = (id: number, o: Partial<PiecePortee> = {}) =>
    piece({ pieceId: id, empreinte: null, nomFichier: 'quittance.pdf', tailleOctets: 4_200, ...o });

  it('le repli rapproche, et se compte', () => {
    const r = dedoublonnerPieces(piecesDeLaConversation([
      message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [sansEmpreinte(10)] }),
      message({ messageId: 2, recuLe: '2026-09-05T08:00:00Z', pieces: [sansEmpreinte(20)] }),
    ]));
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].parNomEtTaille).toBe(true);
    expect(r.sansEmpreinte).toBe(1);
  });

  it('une TAILLE différente suffit à séparer deux fichiers de même nom', () => {
    const r = dedoublonnerPieces(piecesDeLaConversation([
      message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [sansEmpreinte(10)] }),
      message({ messageId: 2, recuLe: '2026-09-05T08:00:00Z', pieces: [sansEmpreinte(20, { tailleOctets: 9_000 })] }),
    ]));
    expect(r.pieces).toHaveLength(2);
  });

  /**
   * 🔴🔴 UNE PRÉSOMPTION N'EST PAS UNE PREUVE, ET LES DEUX NE SE MÉLANGENT PAS. Une pièce sans empreinte ne doit
   * jamais être fondue dans une pièce qui en a une : on ne sait rien du contenu de la première.
   */
  it('🔴 une pièce SANS empreinte n’est jamais confondue avec une pièce QUI EN A une', () => {
    const r = dedoublonnerPieces(piecesDeLaConversation([
      message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z',
        pieces: [piece({ pieceId: 10, nomFichier: 'q.pdf', tailleOctets: 4_200, empreinte: 'abc' })] }),
      message({ messageId: 2, recuLe: '2026-09-05T08:00:00Z',
        pieces: [piece({ pieceId: 20, nomFichier: 'q.pdf', tailleOctets: 4_200, empreinte: null })] }),
    ]));
    expect(r.pieces).toHaveLength(2);
    expect(cleIdentitePiece({ ...piece(), empreinte: 'abc' }).cle)
      .not.toBe(cleIdentitePiece({ ...piece(), empreinte: null }).cle);
  });

  it('⚠️ une pièce sans empreinte qui n’apparaît QU’UNE fois ne fait rien signaler', () => {
    const r = dedoublonnerPieces(piecesDeLaConversation([
      message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z', pieces: [sansEmpreinte(10)] }),
    ]));
    expect(r.sansEmpreinte).toBe(0);
  });
});

describe('🔴 le compte et la liste ne peuvent pas diverger', () => {
  const messages = [
    message({ messageId: 1, recuLe: '2026-09-01T08:00:00Z',
      pieces: [piece({ pieceId: 10, empreinte: 'a' }), piece({ pieceId: 11, empreinte: 'b' })] }),
    message({ messageId: 2, recuLe: '2026-09-05T08:00:00Z', sens: 'envoye',
      pieces: [piece({ pieceId: 20, empreinte: 'a' }), piece({ pieceId: 21, empreinte: 'c' })] }),
  ];

  it('le total du trombone EST la longueur de la liste dédoublonnée', () => {
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation(messages));
    expect(compterPiecesConversation(messages)).toBe(pieces.length);
    expect(pieces).toHaveLength(3);
  });

  /** Arno : « Précédent / Suivant dans la visionneuse parcourent la liste dédoublonnée. » */
  it('🔴 le tour de la visionneuse suit la liste DÉDOUBLONNÉE', () => {
    // ⚠️ L'ORDRE PAR DÉFAUT EST « plus récente d'abord » : le message 2 passe donc devant. La pièce 20, doublon
    //   de la 10, a disparu du tour — c'est tout ce que cette épreuve tient.
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation(messages));
    expect(voisinagePiecesConversation(pieces).map((v) => v.id)).toEqual(['21', '10', '11']);
    const anciennes = dedoublonnerPieces(piecesDeLaConversation(messages, 'ancien'));
    expect(voisinagePiecesConversation(anciennes.pieces).map((v) => v.id)).toEqual(['10', '11', '21']);
  });

  /**
   * ⚠️ CE QUI NE CHANGE PAS (demande d'Arno) : le trombone d'un MESSAGE compte les pièces DE CE MESSAGE, doublons
   * compris. Un mail qui re-transmet deux pièces déjà reçues en porte bien deux, et prétendre le contraire
   * mentirait sur ce qui est parti.
   */
  it('🔴 le trombone d’un MESSAGE reste inchangé : il compte SES pièces, doublons compris', () => {
    expect(vraiesPiecesDuMessage(messages[1].pieces)).toHaveLength(2);
  });
});
