import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LA LECTURE DES PIÈCES DE **TOUTE** LA SÉLECTION ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : « propriétaire ET locataire cochés → les mails des deux familles s'affichent, mais
 * le résumé ne montre pas les pièces des deux. Suspect : “le résumé porte sur les 100 mails affichés”. »
 *
 * 🔴 SON SOUPÇON ÉTAIT EXACT, ET LA MESURE LE CHIFFRE : sur lot-290 (bien 421), **344 pièces** portées par les
 * 326 mails du bien, dont **106 seulement** appartiennent aux 100 mails chargés. Le résumé en montrait moins d'un
 * tiers — et d'autant moins que la sélection était large, l'inverse de ce qu'on attend d'un récapitulatif.
 *
 * ═══ CE QUE CES ÉPREUVES TIENNENT ════════════════════════════════════════════════════════════════════════════════
 *
 *   ① LA PAGINATION EST IGNORÉE — c'est tout l'objet de cette lecture : on veut la sélection ENTIÈRE.
 *   ② SEULS LES MAILS QUI PORTENT UNE PIÈCE sont lus ; sur un bien ordinaire, c'est moins du quart du courrier.
 *   ③ LA BORNE EST DITE, JAMAIS TAIRE : une ligne de plus que `PORTEURS_DE_PIECES_MAX` est demandée, et sa
 *      présence — et elle seule — fait `tronque`. La ligne en trop ne doit PAS être rendue.
 *   ④ CHAQUE MAIL REÇOIT SES PROPRES PIÈCES, ce qui est la seule façon pour le résumé de les dater et de les
 *      attribuer. Un mail dont la liste de pièces fuirait sur le voisin ferait un résumé faux et plausible.
 *
 * ⚠️ AUCUNE ASSERTION SUR LA FORME COMPLÈTE DU SQL (règle d'AGENTS.md) : on vérifie les PARAMÈTRES LIÉS et des
 * FRAGMENTS SÉMANTIQUES sur une chaîne dont les blancs sont normalisés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  deplacementsDeMailsDisponibles: () => Promise.resolve(false),
  horsGestionDisponible: () => Promise.resolve(false),
  rattachementsDisponibles: () => Promise.resolve(true),
  nomUsageDisponible: () => Promise.resolve(false),
  depotsDriveDisponibles: () => Promise.resolve(false),
  /* 🔴 LOT IMAGES-INTEGREES-COMME-PIECES — la lecture des pièces nomme `integree` quand la migration 296 est
     là. La doublure répond FAUX : ces cas-ci éprouvent le dépôt SANS la colonne, donc la projection d'avant. */
  pieceIntegreeDisponible: () => Promise.resolve(false),
}));

import { porteursDePieces } from './historiqueRepo';
import { PORTEURS_DE_PIECES_MAX, FILTRES_VIDES } from './historique';

/** Un bien, étendu comme `etendreCible` le rend : la cible, ses lots, et rien d'autre à dire ici. */
const CIBLE = {
  cible: { sorte: 'lot' as const, cle: '290', id: null },
  titre: 'Lot 290', sousTitre: null, lots: ['290'], proprietaires: [], evenements: [],
  libelles: new Map<string, string>(), proprietaireDuLot: null, logementsDuProprietaire: [],
  occupations: [], adresses: [],
};

/** Le SQL des mails porteurs, et celui des pièces, se distinguent par ce qu'ils interrogent. */
const estLectureDesPieces = (sql: string) => sql.includes('FROM gestion_piece WHERE message_id');

function ligneDeMail(id: number) {
  return {
    message_id: String(id), recu_le: '2026-03-04T09:00:00Z', sens: 'recu',
    de: 'proprio@x.fr', de_nom: 'Propriétaire', objet: `Objet ${id}`,
  };
}

function ligneDePiece(messageId: number, pieceId: number, nom: string) {
  return {
    message_id: String(messageId), id: String(pieceId), nom_fichier: nom, type_mime: 'application/pdf',
    taille_octets: '1234', cle_stockage: 'k', motif_non_stocke: null, empreinte: `e${pieceId}`,
  };
}

/** Les appels sont servis par ce que la requête DEMANDE, jamais par leur ordre : l'ordre n'est pas la règle. */
function servir(mails: object[], pieces: object[]): void {
  queryMock.mockImplementation((sql: string) => Promise.resolve({
    rows: estLectureDesPieces(sql) ? pieces : mails,
  }));
}

beforeEach(() => { queryMock.mockReset(); servir([], []); });

describe('🔴🔴 les mails porteurs de pièces de toute la sélection', () => {
  /** ① LA SÉLECTION ENTIÈRE : ni `page` ni `taille` ne doivent atteindre la requête. */
  it('🔴 ignore la pagination : aucun OFFSET, et la borne est la SIENNE', async () => {
    await porteursDePieces(CIBLE, { ...FILTRES_VIDES, page: 7, taille: 10 });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).not.toContain('OFFSET');
    expect(params.at(-1)).toBe(PORTEURS_DE_PIECES_MAX + 1);
  });

  /** ② UN MAIL SANS PIÈCE N'A RIEN À FAIRE DANS UN RÉSUMÉ DE PIÈCES — et l'écarter en base évite de le charger. */
  it('🔴 ne lit que les mails qui PORTENT une pièce', async () => {
    await porteursDePieces(CIBLE, FILTRES_VIDES);
    const sql = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(sql).toContain('EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  });

  /** 🔴 LES MÊMES TAMIS QUE LE LISTING, PAR LA MÊME FONCTION : les adresses cochées voyagent en PARAMÈTRES. */
  it('🔴 les parties cochées et la période passent en paramètres liés', async () => {
    await porteursDePieces(CIBLE, {
      ...FILTRES_VIDES, interlocuteurs: ['locataire@y.fr'], du: '2026-01-01', au: '2026-03-31',
    });
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params).toContainEqual(['locataire@y.fr']);
    expect(params).toContain('2026-01-01');
    expect(params).toContain('2026-03-31');
  });

  /** ③ LA BORNE NON ATTEINTE : rien n'est tronqué, et tout est rendu. */
  it('⚠️ sous la borne, `tronque` est faux et tous les mails sont rendus', async () => {
    servir([ligneDeMail(1), ligneDeMail(2)], [ligneDePiece(1, 11, 'bail.pdf')]);
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    expect(r.tronque).toBe(false);
    expect(r.messages).toHaveLength(2);
  });

  /**
   * ③ LA BORNE ATTEINTE : la ligne en trop DIT la troncature et ne paraît PAS. La rendre aurait fait un résumé
   * d'un mail de plus que la borne — et la borne n'aurait plus rien borné.
   */
  it('🔴 une ligne de plus que la borne ⇒ `tronque`, et elle n’est pas rendue', async () => {
    const trop = Array.from({ length: PORTEURS_DE_PIECES_MAX + 1 }, (_, i) => ligneDeMail(i + 1));
    servir(trop, []);
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    expect(r.tronque).toBe(true);
    expect(r.messages).toHaveLength(PORTEURS_DE_PIECES_MAX);
  });

  it('⚠️ pile la borne ⇒ PAS de troncature : c’est la ligne EN TROP qui la dit, pas le compte', async () => {
    servir(Array.from({ length: PORTEURS_DE_PIECES_MAX }, (_, i) => ligneDeMail(i + 1)), []);
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    expect(r.tronque).toBe(false);
    expect(r.messages).toHaveLength(PORTEURS_DE_PIECES_MAX);
  });

  /** ④ CHAQUE MAIL SES PIÈCES : un résumé qui attribue une quittance au mauvais mail est faux et plausible. */
  it('🔴🔴 chaque mail reçoit SES pièces, et un mail sans pièce rendue en reçoit zéro', async () => {
    servir(
      [ligneDeMail(1), ligneDeMail(2), ligneDeMail(3)],
      [ligneDePiece(1, 11, 'bail.pdf'), ligneDePiece(1, 12, 'etat.pdf'), ligneDePiece(2, 21, 'constat.pdf')],
    );
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    const parMail = new Map(r.messages.map((m) => [m.messageId, m.pieces.map((p) => p.nomFichier)]));
    expect(parMail.get(1)).toEqual(['bail.pdf', 'etat.pdf']);
    expect(parMail.get(2)).toEqual(['constat.pdf']);
    expect(parMail.get(3)).toEqual([]);
  });

  /**
   * 🔴 L'EMPREINTE VOYAGE AVEC LA PIÈCE, et c'est elle qui permet au résumé de dédoublonner par CONTENU. Sans
   * elle, deux « facture.pdf » de même taille venus de deux fournisseurs fondraient en une seule pièce — une
   * pièce manquante, qui ne se voit pas (voir `dedoublonnerPieces`).
   */
  it('🔴 l’empreinte du contenu voyage, et le compte des pièces est la somme réelle', async () => {
    servir(
      [ligneDeMail(1), ligneDeMail(2)],
      [ligneDePiece(1, 11, 'bail.pdf'), ligneDePiece(2, 21, 'constat.pdf'), ligneDePiece(2, 22, 'photo.jpg')],
    );
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    expect(r.messages.flatMap((m) => m.pieces).map((p) => p.empreinte)).toEqual(['e11', 'e21', 'e22']);
    expect(r.messages.reduce((n, m) => n + m.pieces.length, 0)).toBe(3);
  });

  /** ⚠️ AUCUN MAIL PORTEUR ⇒ AUCUNE SECONDE REQUÊTE : on ne demande pas les pièces d'une liste vide. */
  it('⚠️ sélection sans aucune pièce : une seule requête, et un résumé vide EXACT', async () => {
    const r = await porteursDePieces(CIBLE, FILTRES_VIDES);
    expect(r.messages).toEqual([]);
    expect(r.tronque).toBe(false);
    expect(queryMock.mock.calls.filter((c) => estLectureDesPieces(c[0] as string))).toHaveLength(0);
  });
});
