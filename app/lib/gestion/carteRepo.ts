/**
 * MODULE « GESTION » — LOT 4c : LE DÉTAIL D'UNE CARTE ET D'UN ÉCHANGE. IMPUR (base), STRICTEMENT EN LECTURE : ce
 * fichier n'émet que des SELECT. Les écritures du côté droit (modifier une carte, changer son état, détacher un
 * échange) vivent dans `gestes.ts`, avec leur journal.
 *
 * CHARGEMENT PARESSEUX, par construction : rien ici n'est appelé par l'écran d'accueil du module. Une carte jamais
 * dépliée ne coûte aucune requête, un échange jamais déplié non plus — c'est le patron `BlocRepliable`, et c'est ce qui
 * rend l'écran tenable avec des centaines de messages capturés.
 *
 * ⚠️ AUCUNE CLÉ DE STOCKAGE NE SORT D'ICI vers le navigateur. Les pièces sont désignées par leur IDENTIFIANT en base ;
 * les octets sont servis par l'application, à chaque ouverture, après vérification du droit. Cf. la route
 * `/api/admin/gestion/pieces/[id]`.
 */
import { query } from '../db/client';
import { ATTEND, ctesAttente, jointuresAttente } from './attente';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';

export interface FilDeCarte {
  filId: number;
  objet: string | null;
  interlocuteur: string | null;
  dernierLe: string;
  nbMessages: number;
  nbPieces: number;
  attend: boolean;
}

/** Un mail rattaché à cette carte SANS son échange (lot 4d-B2), avec d'où il vient. */
export interface MailDeplace {
  message: MessageDeFil;
  filId: number;
  objetDuFil: string | null;
}

export interface CarteDetail {
  evenementId: number;
  reference: string;
  objet: string;
  demandeurNom: string | null;
  demandeurEmail: string | null;
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  ouvertLe: string;
  ouvertPar: string | null;
  traiteLe: string | null;
  traitePar: string | null;
  fils: FilDeCarte[];
  /** Les mails venus seuls. Affichés à part : ce ne sont pas des échanges, et on doit voir d'où ils sortent. */
  mailsDeplaces: MailDeplace[];
}

export interface MessageDeFil {
  messageId: number;
  /** Si ce mail a été déplacé vers une autre carte : sa référence. L'échange d'origine le DIT, il ne l'efface pas. */
  deplaceVers?: string | null;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  recuLe: string;
  objet: string | null;
  corps: string | null;
  automatique: boolean;
  pieces: PieceDeMessage[];
}

export interface PieceDeMessage {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  /** Faux quand la pièce n'a PAS pu être déposée : on dit alors POURQUOI, plutôt que d'offrir un lien qui échouerait. */
  disponible: boolean;
  motifNonStocke: string | null;
}

/** Même formatage d'instant que `fileRepo` : une seule façon d'écrire une date dans tout le module. */
const INSTANT = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

/** Borne de sûreté : un fil pathologique ne doit pas rendre une page de plusieurs mégaoctets. */
export const MAX_MESSAGES = 200;
const MAX_CORPS = 20000;

/**
 * LE DÉTAIL D'UNE CARTE : ce qu'elle porte, et les échanges qui lui sont RATTACHÉS (affectations actives seulement —
 * une affectation défaite reste en base, mais elle n'est plus la vérité du jour).
 */
export async function lireCarte(
  evenementId: number,
  ctx: { partenaires: readonly PartenaireInterne[]; adresseGestion: string; deplacements: boolean },
): Promise<CarteDetail | null> {
  const { rows } = await query<{
    evenement_id: number; reference: string; objet: string; demandeur_nom: string | null;
    demandeur_email: string | null; adresse_libre: string | null; etat: string; ouvert_le: string;
    ouvert_par: string | null; traite_le: string | null; traite_par: string | null;
  }>(
    `SELECT id::int AS evenement_id, reference, objet, demandeur_nom, demandeur_email, adresse_libre, etat,
            ${INSTANT('ouvert_le')} AS ouvert_le, ouvert_par_libelle AS ouvert_par,
            ${INSTANT('traite_le')} AS traite_le, traite_par_libelle AS traite_par
       FROM gestion_evenement WHERE id = $1`, [evenementId]);
  const e = rows[0];
  if (!e) return null;

  // L'attente se calcule avec la MÊME définition que la file (`attente.ts`) : les deux colonnes de l'écran ne
  //   doivent pas pouvoir se contredire sur un même échange.
  const { rows: fils } = await query<{
    fil_id: number; objet: string | null; interlocuteur: string | null; de_adresse: string; dernier_le: string;
    nb_messages: number; nb_pieces: number; attend: boolean;
  }>(
    `WITH ${ctesAttente('$2', '$3', ctx.deplacements)}
     SELECT f.id::int AS fil_id, f.objet_initial AS objet, d.interlocuteur, d.de_adresse,
            ${INSTANT('d.recu_le')} AS dernier_le,
            -- Les compteurs disent ce que l'écran MONTRERA : un mail déplacé vers une autre carte n'est plus ici.
            (SELECT count(*) FROM gestion_message m2 WHERE m2.fil_id = f.id AND m2.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am2 WHERE am2.message_id = m2.id AND am2.actif)' : ''})::int AS nb_messages,
            (SELECT count(*) FROM gestion_piece p JOIN gestion_message m3 ON m3.id = p.message_id
              WHERE m3.fil_id = f.id AND m3.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am3 WHERE am3.message_id = m3.id AND am3.actif)' : ''})::int AS nb_pieces,
            ${ATTEND} AS attend
       FROM gestion_affectation a
       JOIN gestion_fil f ON f.id = a.fil_id
       JOIN dernier d ON d.fil_id = f.id
       ${jointuresAttente('f.id')}
      WHERE a.evenement_id = $1 AND a.actif${ctx.deplacements ? ' AND a.message_id IS NULL' : ''}
      ORDER BY d.recu_le DESC, f.id DESC`,
    [evenementId, ctx.partenaires.map((p) => p.adresse), ctx.adresseGestion]);

  const mailsDeplaces = ctx.deplacements ? await lireMailsDeplaces(evenementId, ctx.partenaires) : [];

  return {
    evenementId: e.evenement_id, reference: e.reference, objet: e.objet,
    demandeurNom: e.demandeur_nom, demandeurEmail: e.demandeur_email, adresseLibre: e.adresse_libre,
    etat: e.etat === 'en_cours' || e.etat === 'traite' ? e.etat : 'a_traiter',
    ouvertLe: e.ouvert_le, ouvertPar: e.ouvert_par, traiteLe: e.traite_le, traitePar: e.traite_par,
    fils: fils.map((f) => ({
      filId: f.fil_id, objet: f.objet,
      interlocuteur: libelleExpediteur(ctx.partenaires, f.de_adresse, f.interlocuteur),
      dernierLe: f.dernier_le,
      nbMessages: f.nb_messages, nbPieces: f.nb_pieces, attend: f.attend === true,
    })),
    mailsDeplaces,
  };
}

/**
 * LES MAILS VENUS SEULS dans cette carte (lot 4d-B2) : le message entier, avec ses pièces, et l'échange d'où il sort.
 * Ils sont montrés ICI — pas dans leur fil d'origine, qui se contente d'annoncer leur nombre et leur destination.
 */
async function lireMailsDeplaces(
  evenementId: number, partenaires: readonly PartenaireInterne[],
): Promise<MailDeplace[]> {
  const { rows } = await query<{
    message_id: number; fil_id: number; objet_du_fil: string | null; sens: string; de_adresse: string;
    de_nom: string | null; recu_le: string; objet: string | null; corps: string | null; automatique: boolean;
  }>(
    `SELECT m.id::int AS message_id, m.fil_id::int AS fil_id, f.objet_initial AS objet_du_fil,
            m.sens, m.de_adresse, m.de_nom, ${INSTANT('m.recu_le')} AS recu_le, m.objet,
            left(coalesce(m.corps_texte, ''), ${MAX_CORPS}) AS corps, m.automatique
       FROM gestion_affectation a
       JOIN gestion_message m ON m.id = a.message_id
       JOIN gestion_fil f ON f.id = m.fil_id
      WHERE a.evenement_id = $1 AND a.actif AND a.message_id IS NOT NULL AND m.exclu_le IS NULL
      ORDER BY m.recu_le ASC, m.id ASC
      LIMIT ${MAX_MESSAGES}`, [evenementId]);
  if (rows.length === 0) return [];

  const pieces = await lirePiecesDesMessages(rows.map((r) => r.message_id));
  return rows.map((r) => ({
    filId: r.fil_id,
    objetDuFil: r.objet_du_fil,
    message: {
      messageId: r.message_id,
      sens: r.sens === 'envoye' ? 'envoye' : 'recu',
      de: r.de_adresse,
      deNom: libelleExpediteur(partenaires, r.de_adresse, r.de_nom) || null,
      recuLe: r.recu_le, objet: r.objet,
      corps: r.corps && r.corps.trim() !== '' ? r.corps : null,
      automatique: r.automatique === true,
      pieces: pieces.get(r.message_id) ?? [],
    },
  }));
}

/** Les pièces d'un ensemble de messages, rangées par message. Une seule requête, quel que soit le nombre de messages. */
async function lirePiecesDesMessages(messageIds: readonly number[]): Promise<Map<number, PieceDeMessage[]>> {
  const parMessage = new Map<number, PieceDeMessage[]>();
  if (messageIds.length === 0) return parMessage;
  const { rows } = await query<{
    piece_id: number; message_id: number; nom_fichier: string; type_mime: string | null;
    taille_octets: string | number | null; disponible: boolean; motif_non_stocke: string | null;
  }>(
    `SELECT p.id::int AS piece_id, p.message_id::int AS message_id, p.nom_fichier, p.type_mime, p.taille_octets,
            (p.cle_stockage IS NOT NULL) AS disponible, p.motif_non_stocke
       FROM gestion_piece p WHERE p.message_id = ANY($1::bigint[]) ORDER BY p.id ASC`, [messageIds]);
  for (const p of rows) {
    const liste = parMessage.get(p.message_id) ?? [];
    liste.push({
      pieceId: p.piece_id, nomFichier: p.nom_fichier, typeMime: p.type_mime,
      // `bigint` revient en CHAÎNE avec pg : sans conversion, les tailles se compareraient comme du texte.
      tailleOctets: p.taille_octets === null ? null : Number(p.taille_octets),
      disponible: p.disponible === true, motifNonStocke: p.motif_non_stocke,
    });
    parMessage.set(p.message_id, liste);
  }
  return parMessage;
}

/**
 * LES MESSAGES D'UN ÉCHANGE, du plus ancien au plus récent — l'ordre dans lequel une conversation se lit. Les messages
 * EXCLUS (accusés automatiques, bruit) restent hors de la vue : ils sont en base, mais les afficher ferait de la lecture
 * d'un fil une corvée, et c'est justement ce que les règles d'exclusion existent pour éviter.
 *
 * Le corps est borné : un mail de 400 ko ne traverse pas le réseau pour être lu en diagonale dans un panneau.
 */
export async function lireMessagesDuFil(
  filId: number, partenaires: readonly PartenaireInterne[] = [], deplacements = false,
): Promise<{ messages: MessageDeFil[]; partis: MailParti[] } | null> {
  const { rows: fil } = await query<{ id: number }>(`SELECT id::int AS id FROM gestion_fil WHERE id = $1`, [filId]);
  if (!fil[0]) return null;

  // LOT 4d-B2 — les mails SORTIS de cet échange. On ne les affiche plus ici (ils vivent dans leur carte), mais on
  //   annonce leur nombre et leur destination : retirer quelque chose en silence est exactement ce qu'on s'interdit.
  const partis = deplacements ? await lireMailsPartis(filId) : [];

  const { rows } = await query<{
    message_id: number; sens: string; de_adresse: string; de_nom: string | null; recu_le: string;
    objet: string | null; corps: string | null; automatique: boolean;
  }>(
    `SELECT id::int AS message_id, sens, de_adresse, de_nom, ${INSTANT('recu_le')} AS recu_le,
            objet, left(coalesce(corps_texte, ''), ${MAX_CORPS}) AS corps, automatique
       FROM gestion_message
      WHERE fil_id = $1 AND exclu_le IS NULL
        ${deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.message_id = gestion_message.id AND am.actif)' : ''}
      ORDER BY recu_le ASC, id ASC
      LIMIT ${MAX_MESSAGES}`, [filId]);

  const { rows: pieces } = await query<{
    piece_id: number; message_id: number; nom_fichier: string; type_mime: string | null;
    taille_octets: string | number | null; disponible: boolean; motif_non_stocke: string | null;
  }>(
    `SELECT p.id::int AS piece_id, p.message_id::int AS message_id, p.nom_fichier, p.type_mime, p.taille_octets,
            (p.cle_stockage IS NOT NULL) AS disponible, p.motif_non_stocke
       FROM gestion_piece p JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = $1 AND m.exclu_le IS NULL
      ORDER BY p.id ASC`, [filId]);

  const parMessage = new Map<number, PieceDeMessage[]>();
  for (const p of pieces) {
    const liste = parMessage.get(p.message_id) ?? [];
    liste.push({
      pieceId: p.piece_id, nomFichier: p.nom_fichier, typeMime: p.type_mime,
      // `bigint` revient en CHAÎNE avec pg : sans conversion, l'écran afficherait « 12345 o » comme du texte et les
      //   comparaisons de taille mentiraient. Piège connu du dépôt.
      tailleOctets: p.taille_octets === null ? null : Number(p.taille_octets),
      disponible: p.disponible === true, motifNonStocke: p.motif_non_stocke,
    });
    parMessage.set(p.message_id, liste);
  }

  const messages: MessageDeFil[] = rows.map((m) => ({
    messageId: m.message_id,
    sens: m.sens === 'envoye' ? 'envoye' : 'recu',
    de: m.de_adresse,
    // Le libellé du partenaire interne remplace le nom porté par le mail, ici comme partout dans l'écran Gestion.
    deNom: libelleExpediteur(partenaires, m.de_adresse, m.de_nom) || null,
    recuLe: m.recu_le, objet: m.objet,
    corps: m.corps && m.corps.trim() !== '' ? m.corps : null,
    automatique: m.automatique === true,
    pieces: parMessage.get(m.message_id) ?? [],
  }));
  return { messages, partis };
}

/** Un mail parti de cet échange vers une carte : ce que l'échange d'origine ANNONCE, sans plus l'afficher. */
export interface MailParti {
  messageId: number;
  objet: string | null;
  recuLe: string;
  reference: string;
  evenementId: number;
}

async function lireMailsPartis(filId: number): Promise<MailParti[]> {
  const { rows } = await query<{
    message_id: number; objet: string | null; recu_le: string; reference: string; evenement_id: number;
  }>(
    `SELECT m.id::int AS message_id, m.objet, ${INSTANT('m.recu_le')} AS recu_le,
            e.reference, e.id::int AS evenement_id
       FROM gestion_affectation a
       JOIN gestion_message m ON m.id = a.message_id
       JOIN gestion_evenement e ON e.id = a.evenement_id
      WHERE a.fil_id = $1 AND a.actif AND a.message_id IS NOT NULL
      ORDER BY m.recu_le ASC, m.id ASC`, [filId]);
  return rows.map((r) => ({
    messageId: r.message_id, objet: r.objet, recuLe: r.recu_le,
    reference: r.reference, evenementId: r.evenement_id,
  }));
}

/**
 * Ce qu'il faut pour SERVIR une pièce : sa clé de stockage, son nom et son type. Rien de tout cela ne part vers le
 * navigateur — la route lit ces champs, va chercher les octets, et rend les octets.
 */
export async function lirePieceAServir(pieceId: number): Promise<{
  cleStockage: string; nomFichier: string; typeMime: string | null;
} | null> {
  const { rows } = await query<{ cle_stockage: string | null; nom_fichier: string; type_mime: string | null }>(
    `SELECT cle_stockage, nom_fichier, type_mime FROM gestion_piece WHERE id = $1`, [pieceId]);
  const p = rows[0];
  if (!p || !p.cle_stockage) return null; // pièce inconnue, ou jamais déposée : dans les deux cas, rien à servir
  return { cleStockage: p.cle_stockage, nomFichier: p.nom_fichier, typeMime: p.type_mime };
}
