import { describe, it, expect } from 'vitest';
import {
  dedoublonnerPieces, idsDesPiecesEtDeLeursJumelles, piecesDeLaConversation,
  type MessagePorteur, type PiecePortee,
} from './piecesConversation';
import { messagesDesPorteurs, motPorteeDuResume } from './historiqueBien';
import { PORTEURS_DE_PIECES_MAX, type MessagePorteurDePieces } from './historique';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LE RÉSUMÉ PORTE SUR TOUTE LA SÉLECTION ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « le résumé contient les pièces de TOUS les mails de la sélection (toutes les
 * parties cochées, toute la période), pas seulement des 100 chargés, avec le classement existant. Retire la
 * phrase “le résumé porte sur les 100 mails affichés” une fois que c'est vrai. Le compteur “N pièces dans cette
 * sélection” = la somme réelle. Vérifie à l'écran : propriétaire seul + locataire seul = les deux ensemble (sans
 * doublons). »
 *
 * CE FICHIER TIENT LES TROIS PROMESSES QUI SE VÉRIFIENT SANS ÉCRAN :
 *
 *   ① **L'ADDITION DES DEUX CÔTÉS** — la phrase même d'Arno, éprouvée : propriétaire seul ⊎ locataire seul = les
 *      deux ensemble, et un document envoyé aux deux ne compte qu'UNE fois.
 *   ② **LES IDENTIFIANTS DEMANDÉS AU DRIVE** couvrent aussi les jumelles, sans quoi le picto « déjà dans le
 *      Drive » disparaîtrait précisément sur les pièces revenues sous un autre nom.
 *   ③ **LA PHRASE DE PORTÉE** ne paraît plus que quand le résumé NE couvre PAS la sélection.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (o: Partial<PiecePortee> = {}): PiecePortee => ({
  pieceId: 1, nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 120_000,
  disponible: true, motifNonStocke: null, empreinte: `sha-${o.pieceId ?? 1}`, ...o,
});

const mail = (o: Partial<MessagePorteur> = {}): MessagePorteur => ({
  messageId: 1, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'marie@exemple.test', deNom: 'Marie Dupont',
  objet: 'Fuite', pieces: [], ...o,
});

/** Les pièces retenues par le résumé, nommées — c'est ce que l'écran affiche en miniatures. */
const resume = (messages: readonly MessagePorteur[]): string[] =>
  dedoublonnerPieces(piecesDeLaConversation(messages)).pieces.map((p) => p.nomFichier).sort();

describe('🔴🔴 ① propriétaire seul + locataire seul = les deux ensemble', () => {
  /* La sélection « propriétaire » : deux mails, trois pièces. */
  const cotePropio = [
    mail({ messageId: 1, de: 'proprio@x.fr', pieces: [piece({ pieceId: 1, nomFichier: 'bail.pdf' })] }),
    mail({
      messageId: 2, recuLe: '2026-09-02T08:00:00Z', de: 'proprio@x.fr',
      pieces: [piece({ pieceId: 2, nomFichier: 'taxe.pdf' }), piece({ pieceId: 3, nomFichier: 'photo.jpg' })],
    }),
  ];
  /* La sélection « locataire » : deux mails, deux pièces, dont AUCUNE en commun avec le côté propriétaire. */
  const coteLocataire = [
    mail({
      messageId: 10, recuLe: '2026-09-03T08:00:00Z', de: 'locataire@y.fr',
      pieces: [piece({ pieceId: 10, nomFichier: 'quittance.pdf' })],
    }),
    mail({
      messageId: 11, recuLe: '2026-09-04T08:00:00Z', de: 'locataire@y.fr',
      pieces: [piece({ pieceId: 11, nomFichier: 'constat.pdf' })],
    }),
  ];

  /**
   * 🔴🔴 LA VÉRIFICATION D'ARNO, MOT POUR MOT. C'est elle que l'ancien résumé ne passait pas : la page ne
   * chargeant que 100 mails, cocher les deux familles montrait MOINS que la somme des deux — et sur le bien 421,
   * 106 pièces au lieu de 344.
   */
  it('🔴🔴 l’ensemble des deux porte exactement l’union des deux parts', () => {
    const propio = resume(cotePropio);
    const locataire = resume(coteLocataire);
    const ensemble = resume([...cotePropio, ...coteLocataire]);
    expect(propio).toEqual(['bail.pdf', 'photo.jpg', 'taxe.pdf']);
    expect(locataire).toEqual(['constat.pdf', 'quittance.pdf']);
    expect(ensemble).toEqual([...propio, ...locataire].sort());
    expect(ensemble).toHaveLength(propio.length + locataire.length);
  });

  /**
   * 🔴 « SANS DOUBLONS » EST L'AUTRE MOITIÉ DE LA PHRASE. Un document envoyé au propriétaire PUIS au locataire
   * est le même fichier : il ne doit paraître qu'une fois, et porter la trace de sa seconde apparition.
   */
  it('🔴 un même document des deux côtés ne compte qu’une fois, et dit son autre apparition', () => {
    const memeFichier = { nomFichier: 'reglement.pdf', empreinte: 'sha-commune', tailleOctets: 4242 };
    const chezLePropio = [mail({ messageId: 1, de: 'proprio@x.fr', pieces: [piece({ pieceId: 5, ...memeFichier })] })];
    const chezLeLocataire = [mail({
      messageId: 10, recuLe: '2026-09-05T08:00:00Z', de: 'locataire@y.fr',
      pieces: [piece({ pieceId: 50, ...memeFichier })],
    })];

    expect(resume(chezLePropio)).toEqual(['reglement.pdf']);
    expect(resume(chezLeLocataire)).toEqual(['reglement.pdf']);

    const { pieces } = dedoublonnerPieces(piecesDeLaConversation([...chezLePropio, ...chezLeLocataire]));
    expect(pieces).toHaveLength(1);
    // ⚠️ C'EST LA PREMIÈRE APPARITION QUI EST GARDÉE (la pièce 5, du 01/09), et la seconde qui est renvoyée en
    //   dessous : « aussi reçue le 05/09 ». Le résumé montre le document à la date où il est ARRIVÉ.
    expect(pieces[0].pieceId).toBe(5);
    expect(pieces[0].autresApparitions.map((a) => a.pieceId)).toEqual([50]);
    // ⚠️ RAPPROCHEMENT PAR EMPREINTE, donc une PREUVE : l'écran n'a pas à le signaler comme une présomption.
    expect(pieces[0].parNomEtTaille).toBe(false);
  });
});

describe('🔴 ① bis les porteurs venus de la base entrent dans le résumé tels quels', () => {
  const porteur = (o: Partial<MessagePorteurDePieces> = {}): MessagePorteurDePieces => ({
    messageId: 7, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'proprio@x.fr', deNom: null,
    objet: 'Quittance', pieces: [], ...o,
  });

  /**
   * 🔴 LE SEUL ÉCART ENTRE LES DEUX FORMES EST L'EMPREINTE FACULTATIVE, et c'est précisément ce que
   * `messagesDesPorteurs` ferme. `undefined` et `null` veulent dire la même chose — « pas d'empreinte connue » —
   * et c'est `null` que le dédoublonnage attend.
   */
  it('🔴 une pièce sans empreinte connue arrive à `null`, jamais à `undefined`', () => {
    const [m] = messagesDesPorteurs([porteur({
      pieces: [{
        pieceId: 3, nomFichier: 'quittance.pdf', typeMime: 'application/pdf', tailleOctets: 10,
        disponible: true, motifNonStocke: null,
      }],
    })]);
    expect(m.pieces[0].empreinte).toBeNull();
  });

  it('⚠️ l’identité, la date, l’expéditeur et l’objet voyagent sans retouche', () => {
    const [m] = messagesDesPorteurs([porteur({
      pieces: [{
        pieceId: 4, nomFichier: 'bail.pdf', typeMime: null, tailleOctets: null,
        disponible: false, motifNonStocke: 'trop grosse', empreinte: 'sha-4',
      }],
    })]);
    expect(m).toEqual({
      messageId: 7, recuLe: '2026-09-01T08:00:00Z', sens: 'recu', de: 'proprio@x.fr', deNom: null,
      objet: 'Quittance',
      pieces: [{
        pieceId: 4, nomFichier: 'bail.pdf', typeMime: null, tailleOctets: null,
        disponible: false, motifNonStocke: 'trop grosse', empreinte: 'sha-4',
      }],
    });
  });

  /** ⚠️ UNE PIÈCE NON CONSERVÉE COMPTE QUAND MÊME : elle a existé dans le courrier, et l'écran doit le dire. */
  it('⚠️ une pièce que nous n’avons pas gardée reste dans le résumé', () => {
    const messages = messagesDesPorteurs([porteur({
      pieces: [{
        pieceId: 9, nomFichier: 'video.mov', typeMime: 'video/quicktime', tailleOctets: 99_000_000,
        disponible: false, motifNonStocke: 'trop grosse', empreinte: null,
      }],
    })]);
    expect(resume(messages)).toEqual(['video.mov']);
  });
});

describe('🔴 ② les identifiants demandés au Drive couvrent les jumelles', () => {
  /**
   * 🔴 LE DÉPÔT EST ENREGISTRÉ CONTRE **LA** PIÈCE RANGÉE. Si l'on a rangé la copie du 30/09 et que le résumé
   * montre celle du 23/09, l'identifiant affiché n'a aucun dépôt : c'est sur l'autre apparition qu'il se trouve.
   * L'écran le sait quand il AFFICHE ; cette fonction est ce qui le lui fait savoir quand il DEMANDE.
   */
  it('🔴 la pièce affichée ET ses autres apparitions sont demandées', () => {
    const memeFichier = { nomFichier: 'reglement.pdf', empreinte: 'sha-commune', tailleOctets: 4242 };
    const { pieces } = dedoublonnerPieces(piecesDeLaConversation([
      mail({ messageId: 1, pieces: [piece({ pieceId: 5, ...memeFichier })] }),
      mail({ messageId: 2, recuLe: '2026-09-09T08:00:00Z', pieces: [piece({ pieceId: 50, ...memeFichier })] }),
      mail({ messageId: 3, recuLe: '2026-09-10T08:00:00Z', pieces: [piece({ pieceId: 7, nomFichier: 'a.pdf' })] }),
    ]));
    expect(idsDesPiecesEtDeLeursJumelles(pieces)).toEqual([5, 7, 50]);
  });

  /**
   * ⚠️ TRIÉS ET SANS RÉPÉTITION : l'adresse demandée ne doit dépendre que de l'ENSEMBLE des pièces, jamais de
   * leur ordre d'affichage — sinon inverser le fil relancerait une requête pour la même réponse.
   */
  it('⚠️ l’ordre d’affichage ne change pas la liste demandée', () => {
    const messages = [
      mail({ messageId: 1, pieces: [piece({ pieceId: 30, nomFichier: 'a.pdf' })] }),
      mail({ messageId: 2, recuLe: '2026-09-02T08:00:00Z', pieces: [piece({ pieceId: 4, nomFichier: 'b.pdf' })] }),
    ];
    const recent = dedoublonnerPieces(piecesDeLaConversation(messages, 'recent')).pieces;
    const ancien = dedoublonnerPieces(piecesDeLaConversation(messages, 'ancien')).pieces;
    expect(idsDesPiecesEtDeLeursJumelles(recent)).toEqual([4, 30]);
    expect(idsDesPiecesEtDeLeursJumelles(ancien)).toEqual([4, 30]);
  });

  it('⚠️ aucune pièce ⇒ aucune demande', () => {
    expect(idsDesPiecesEtDeLeursJumelles([])).toEqual([]);
  });
});

describe('🔴🔴 ③ la phrase « le résumé porte sur les 100 mails affichés » a disparu', () => {
  const cas = {
    surToutLaSelection: true, tronquee: false, enEchec: false, rechercheActive: false,
    filIncomplet: false, nbAffiches: 100,
  };

  /**
   * 🔴🔴 LA DEMANDE D'ARNO, TENUE : « Retire la phrase une fois que c'est vrai. » Elle ne paraît plus, MÊME sur
   * une sélection qui dépasse les 100 mails — c'était tout l'objet du point 5.
   */
  it('🔴🔴 rien n’est dit quand le résumé couvre la sélection, fil incomplet ou non', () => {
    expect(motPorteeDuResume(cas)).toBeNull();
    expect(motPorteeDuResume({ ...cas, filIncomplet: true, nbAffiches: 100 })).toBeNull();
  });

  /** ② LA BORNE ATTEINTE SE DIT, avec son nombre — et c'est le même que celui de la requête. */
  it('🔴 la borne atteinte est dite, et elle nomme le plafond réel', () => {
    const mot = motPorteeDuResume({ ...cas, tronquee: true });
    expect(mot).toContain(String(PORTEURS_DE_PIECES_MAX));
    expect(mot).toContain('mails porteurs de pièces');
  });

  /**
   * ③ PENDANT UNE RECHERCHE, LE RÉSUMÉ REDEVIENT CELUI DE LA PAGE, et le dire est la seule honnêteté possible :
   * la recherche ne filtre que les mails CHARGÉS (règle d'Arno au lot 3, point 5).
   */
  it('🔴 une recherche sur un fil incomplet dit que le résumé porte sur les mails chargés', () => {
    const mot = motPorteeDuResume({
      ...cas, surToutLaSelection: false, rechercheActive: true, filIncomplet: true, nbAffiches: 12,
    });
    expect(mot).toContain('La recherche ne lit que les mails chargés');
    expect(mot).toContain('12');
  });

  /** ⚠️ UNE RECHERCHE QUI PORTE DÉJÀ SUR TOUTE LA SÉLECTION N'A RIEN À SIGNALER : le fil EST la sélection. */
  it('⚠️ une recherche sur un fil complet ne dit rien', () => {
    expect(motPorteeDuResume({
      ...cas, surToutLaSelection: false, rechercheActive: true, filIncomplet: false, nbAffiches: 12,
    })).toBeNull();
  });

  /** ④ UNE PANNE ET UNE RECHERCHE NE S'ÉCRIVENT PAS PAREIL, sinon personne ne saura qu'il y a eu panne. */
  it('🔴 une lecture en échec le dit, et autrement qu’une recherche', () => {
    const mot = motPorteeDuResume({
      ...cas, surToutLaSelection: false, enEchec: true, filIncomplet: true, nbAffiches: 100,
    });
    expect(mot).toContain('n’ont pas pu être lues');
    expect(mot).not.toContain('La recherche');
  });

  /**
   * ⚠️ PENDANT LE CHARGEMENT, ON NE DIT RIEN. Annoncer une portée qui va changer dans l'instant apprend à ne
   * plus lire les notes — et c'est le résumé de la page qui s'affiche entre-temps, ce qui est exact.
   */
  it('⚠️ lecture encore en cours : aucune phrase', () => {
    expect(motPorteeDuResume({ ...cas, surToutLaSelection: false, filIncomplet: true })).toBeNull();
  });
});
