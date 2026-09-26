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
// ⚠️ UN SEUL IMPORT DE `./schema`, STATIQUE. `destinatairesSeparesDisponibles` était chargée dynamiquement au
//   milieu d'une fonction (lot 5b) : deux façons d'importer le même module, donc deux endroits à tenir. Le garde
//   d'imports de ce fichier a attrapé le doublon dès qu'un second besoin de sonde est apparu (lot DRIVE-3).
import { copiePiecesDisponible, destinatairesSeparesDisponibles, vidageDisponible } from './schema';

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
  /**
   * LOT 5-FIDÈLE — le `Message-ID` RFC, écrit dans le message lui-même. C'est le PONT vers la vraie boîte Gmail :
   * l'identifiant Gmail n'existe pas chez nous, celui-ci ne bouge jamais. GRATUIT — la colonne est déjà lue.
   */
  messageIdRfc: string;
  /** Si ce mail a été déplacé vers une autre carte : sa référence. L'échange d'origine le DIT, il ne l'efface pas. */
  deplaceVers?: string | null;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  recuLe: string;
  objet: string | null;
  /** LOT 5b — corps COMPLET, présent pour le DERNIER message seulement. Les autres arrivent avec `extrait` et se
   *  chargent au dépliage (`/api/admin/gestion/messages/[id]/corps`) : un fil de 102 messages ne traverse pas le
   *  réseau en entier pour qu'on en lise un. */
  corps: string | null;
  /** LOT 5b — les premières lignes, pour la ligne repliée. Toujours présent quand il y a du texte. */
  extrait: string | null;
  automatique: boolean;
  pieces: PieceDeMessage[];
  // ── LOT 5b — ce qu'il fallait pour lire une conversation comme on lit sa messagerie ────────────────────────────
  /**
   * Le message est-il tenu HORS DE LA FILE DE TRI par une règle ? Il reste À SA PLACE dans la conversation, signalé
   * par un MOT — même logique que Gmail, qui range les promotions ailleurs sans les retirer du fil.
   */
  horsFile: boolean;
  /** Le motif de la règle, en clair. `null` quand le message n'est pas écarté. */
  motifHorsFile: string | null;
  /** Destinataires en À, quand ils sont CONNUS (migration 235). `null` = jamais analysés (message capturé avant). */
  destA: AdresseAffichee[] | null;
  /** Destinataires en copie, même convention. */
  destCc: AdresseAffichee[] | null;
  /** La liste FONDUE d'avant (À et Cc mêlés), toujours rendue : c'est le repli quand le détail n'est pas connu. */
  destinatairesFondus: string | null;
  /**
   * Le message n'a QUE du HTML (557 messages en base) : on ne peut pas encore l'afficher (lot 5d), et on le DIT.
   * Un vide muet ferait croire à un message vide, ce qui est faux.
   */
  htmlSeul: boolean;
}

/** Un destinataire tel que l'écran l'affiche. Même forme que ce que la capture range (`adresses.ts`). */
export interface AdresseAffichee { nom: string | null; adresse: string }

/**
 * LOT 5b — L'EN-TÊTE d'un échange : de quoi alimenter le bandeau des fonctions maison, où que la conversation soit
 * ouverte. C'est ce qui permet d'avoir UNE seule vue au lieu de trois qui divergent.
 */
export interface EnTeteFil {
  filId: number;
  objet: string | null;
  etat: 'a_classer' | 'sans_suite';
  /** Référence `GES-…` si l'échange est rattaché à une carte, sinon `null`. */
  reference: string | null;
  evenementId: number | null;
  /**
   * LOT 5-STATUT — le TITRE de la carte (« Fuite salle de bain »), pour que le cartouche dise autre chose qu'un
   * numéro. GRATUIT : il vient de la ligne d'événement que la requête joignait DÉJÀ pour lire la référence — aucune
   * requête de plus, aucun aller-retour de plus.
   */
  evenementObjet: string | null;
}

/**
 * Lit une colonne `jsonb` de destinataires. `null` (colonne jamais analysée, ou migration 235 absente) reste `null` —
 * l'écran doit pouvoir dire « destinataires non détaillés » plutôt que d'afficher une liste vide qui mentirait. PUR.
 */
function adressesDe(brut: unknown): AdresseAffichee[] | null {
  if (!Array.isArray(brut)) return null;
  return brut
    .filter((x): x is { nom?: unknown; adresse?: unknown } => typeof x === 'object' && x !== null)
    .map((x) => ({ nom: typeof x.nom === 'string' ? x.nom : null, adresse: String(x.adresse ?? '') }))
    .filter((a) => a.adresse !== '');
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
/** LOT 5b — la ligne REPLIÉE d'un message : assez pour reconnaître de quoi il parle, pas assez pour peser. */
const LONGUEUR_EXTRAIT = 300;

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
    message_id: number; message_id_rfc: string; fil_id: number; objet_du_fil: string | null; sens: string;
    de_adresse: string; de_nom: string | null; recu_le: string; objet: string | null; corps: string | null;
    automatique: boolean;
  }>(
    `SELECT m.id::int AS message_id, m.message_id AS message_id_rfc, m.fil_id::int AS fil_id,
            f.objet_initial AS objet_du_fil,
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
      messageIdRfc: r.message_id_rfc,
      sens: r.sens === 'envoye' ? 'envoye' : 'recu',
      de: r.de_adresse,
      deNom: libelleExpediteur(partenaires, r.de_adresse, r.de_nom) || null,
      recuLe: r.recu_le, objet: r.objet,
      corps: r.corps && r.corps.trim() !== '' ? r.corps : null,
      // LOT 5b — un mail déplacé est montré SEUL dans sa carte : son corps part en entier (il n'y a pas de fil à
      //   alléger), et les champs de conversation n'ont pas d'objet ici. Ils sont renseignés honnêtement, jamais
      //   inventés : `null` veut dire « non analysé », et c'est vrai.
      extrait: r.corps && r.corps.trim() !== '' ? r.corps.slice(0, LONGUEUR_EXTRAIT) : null,
      automatique: r.automatique === true,
      pieces: pieces.get(r.message_id) ?? [],
      horsFile: false, // la requête ci-dessus les exclut déjà (`m.exclu_le IS NULL`)
      motifHorsFile: null,
      destA: null,
      destCc: null,
      destinatairesFondus: null,
      htmlSeul: false,
    },
  }));
}

/**
 * LOT 5b — LE CORPS D'UN SEUL MESSAGE, au dépliage. Le pendant de la lecture allégée d'une conversation : on ne paie
 * le texte que des messages qu'on ouvre vraiment.
 *
 * `htmlSeul` est rendu ICI AUSSI : un message sans texte mais avec du HTML n'est pas un message vide, et l'écran doit
 * pouvoir le dire (l'affichage de la mise en forme est le lot 5d). `null` = le message n'existe pas.
 */
export async function lireCorpsDuMessage(
  messageId: number,
): Promise<{ messageId: number; corps: string | null; htmlSeul: boolean } | null> {
  const { rows } = await query<{ message_id: number; corps: string | null; html_seul: boolean }>(
    `SELECT id::int AS message_id,
            left(coalesce(corps_texte, ''), ${MAX_CORPS}) AS corps,
            (coalesce(btrim(corps_texte), '') = '' AND coalesce(btrim(corps_html), '') <> '') AS html_seul
       FROM gestion_message WHERE id = $1`, [messageId]);
  const r = rows[0];
  if (!r) return null;
  return {
    messageId: r.message_id,
    corps: r.corps && r.corps.trim() !== '' ? r.corps : null,
    htmlSeul: r.html_seul === true,
  };
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
): Promise<{ fil: EnTeteFil; messages: MessageDeFil[]; partis: MailParti[] } | null> {
  // LOT 5b — l'EN-TÊTE de l'échange voyage avec ses messages : la vue conversation est ouverte depuis trois endroits
  //   (boîte mail, poste de tri, carte) et doit savoir seule quoi proposer en haut. Sans ça, chaque appelant
  //   reconstituerait l'état de son côté, et les trois finiraient par diverger.
  const { rows: fil } = await query<{
    id: number; objet: string | null; etat: string; reference: string | null; evenement_id: number | null;
    evenement_objet: string | null;
  }>(
    `SELECT f.id::int AS id, f.objet_initial AS objet, f.etat,
            e.reference, e.id::int AS evenement_id, e.objet AS evenement_objet
       FROM gestion_fil f
       LEFT JOIN gestion_affectation a ON a.fil_id = f.id AND a.actif AND a.message_id IS NULL
       LEFT JOIN gestion_evenement e ON e.id = a.evenement_id
      WHERE f.id = $1`, [filId]);
  if (!fil[0]) return null;

  // LOT 4d-B2 — les mails SORTIS de cet échange. On ne les affiche plus ici (ils vivent dans leur carte), mais on
  //   annonce leur nombre et leur destination : retirer quelque chose en silence est exactement ce qu'on s'interdit.
  const partis = deplacements ? await lireMailsPartis(filId) : [];

  // LOT 5b — LES MESSAGES ÉCARTÉS SONT DÉSORMAIS RENDUS, à leur place chronologique. Ils restent HORS DE LA FILE DE
  //   TRI (fileRepo n'est pas touché, ses compteurs non plus) : c'est la logique de Gmail, qui range les promotions
  //   ailleurs sans les retirer de la conversation. Sans eux, un fil montrait une réponse sans la question.
  const avecDest = await destinatairesSeparesDisponibles();
  const { rows } = await query<{
    message_id: number; message_id_rfc: string; sens: string; de_adresse: string; de_nom: string | null; recu_le: string;
    objet: string | null; corps: string | null; extrait: string | null; automatique: boolean;
    hors_file: boolean; motif_hors_file: string | null; html_seul: boolean;
    dest_a: unknown; dest_cc: unknown; destinataires: string | null; est_dernier: boolean;
  }>(
    `WITH msg AS (
       SELECT id, message_id, sens, de_adresse, de_nom, recu_le, objet, corps_texte, corps_html, automatique,
              exclu_le, exclu_motif, destinataires${avecDest ? ', dest_a, dest_cc' : ''},
              -- Le DERNIER message est celui qu'on déplie d'emblée : c'est le seul dont le corps part tout de suite.
              (row_number() OVER (ORDER BY recu_le DESC, id DESC) = 1) AS est_dernier
         FROM gestion_message
        WHERE fil_id = $1
          ${deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.message_id = gestion_message.id AND am.actif)' : ''}
        ORDER BY recu_le ASC, id ASC
        LIMIT ${MAX_MESSAGES}
     )
     SELECT id::int AS message_id, message_id AS message_id_rfc, sens, de_adresse, de_nom,
            ${INSTANT('recu_le')} AS recu_le, objet,
            CASE WHEN est_dernier THEN left(coalesce(corps_texte, ''), ${MAX_CORPS}) END AS corps,
            left(coalesce(corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait,
            automatique,
            (exclu_le IS NOT NULL) AS hors_file,
            exclu_motif AS motif_hors_file,
            (coalesce(btrim(corps_texte), '') = '' AND coalesce(btrim(corps_html), '') <> '') AS html_seul,
            ${avecDest ? 'dest_a, dest_cc' : 'NULL::jsonb AS dest_a, NULL::jsonb AS dest_cc'},
            destinataires, est_dernier
       FROM msg
      ORDER BY recu_le ASC, message_id ASC`, [filId]);

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
    messageIdRfc: m.message_id_rfc,
    sens: m.sens === 'envoye' ? 'envoye' : 'recu',
    de: m.de_adresse,
    // Le libellé du partenaire interne remplace le nom porté par le mail, ici comme partout dans l'écran Gestion.
    deNom: libelleExpediteur(partenaires, m.de_adresse, m.de_nom) || null,
    recuLe: m.recu_le, objet: m.objet,
    corps: m.corps && m.corps.trim() !== '' ? m.corps : null,
    extrait: m.extrait && m.extrait.trim() !== '' ? m.extrait : null,
    automatique: m.automatique === true,
    pieces: parMessage.get(m.message_id) ?? [],
    horsFile: m.hors_file === true,
    motifHorsFile: m.motif_hors_file,
    // `null` (jamais analysé) et `[]` (analysé, personne) ne se confondent pas — c'est tout l'objet de la migration 235.
    destA: adressesDe(m.dest_a),
    destCc: adressesDe(m.dest_cc),
    destinatairesFondus: m.destinataires && m.destinataires.trim() !== '' ? m.destinataires : null,
    htmlSeul: m.html_seul === true,
  }));
  return {
    fil: {
      filId: fil[0].id,
      objet: fil[0].objet,
      etat: fil[0].etat === 'sans_suite' ? 'sans_suite' : 'a_classer',
      reference: fil[0].reference,
      evenementId: fil[0].evenement_id,
      evenementObjet: fil[0].evenement_objet,
    },
    messages,
    partis,
  };
}

/** Un mail parti de cet échange vers une carte : ce que l'échange d'origine ANNONCE, sans plus l'afficher. */
export interface MailParti {
  messageId: number;
  objet: string | null;
  recuLe: string;
  reference: string;
  evenementId: number;
  /** LOT 5-STATUT — le titre de la carte d'arrivée. Gratuit : l'événement est déjà joint pour sa référence. */
  objetEvenement: string | null;
}

async function lireMailsPartis(filId: number): Promise<MailParti[]> {
  const { rows } = await query<{
    message_id: number; objet: string | null; recu_le: string; reference: string; evenement_id: number;
    objet_evenement: string | null;
  }>(
    `SELECT m.id::int AS message_id, m.objet, ${INSTANT('m.recu_le')} AS recu_le,
            e.reference, e.id::int AS evenement_id, e.objet AS objet_evenement
       FROM gestion_affectation a
       JOIN gestion_message m ON m.id = a.message_id
       JOIN gestion_evenement e ON e.id = a.evenement_id
      WHERE a.fil_id = $1 AND a.actif AND a.message_id IS NOT NULL
      ORDER BY m.recu_le ASC, m.id ASC`, [filId]);
  return rows.map((r) => ({
    messageId: r.message_id, objet: r.objet, recuLe: r.recu_le,
    reference: r.reference, evenementId: r.evenement_id, objetEvenement: r.objet_evenement,
  }));
}

/**
 * Ce qu'il faut pour SERVIR une pièce : sa clé de stockage, son nom et son type. Rien de tout cela ne part vers le
 * navigateur — la route lit ces champs, va chercher les octets, et rend les octets.
 */
export async function lirePieceAServir(pieceId: number): Promise<{
  cleStockage: string; nomFichier: string; typeMime: string | null;
  /**
   * LOT DRIVE-3 — le contenu a-t-il quitté MinIO ? Vrai ⇒ la route lit dans le Drive, à la même adresse et sous le
   * même nom. `cleStockage` est TOUJOURS rendue : elle n'est jamais effacée de la base, et elle sert au journal.
   */
  stockageVide: boolean;
  /** L'identifiant du fichier Drive vers lequel lire. Renseigné dès qu'une copie VÉRIFIÉE existe. */
  driveFileId: string | null;
  /** L'empreinte enregistrée à la copie — la route la compare à ce que Drive lui rend. */
  md5Attendu: string | null;
} | null> {
  /**
   * 🔴 UNE SEULE REQUÊTE, ET DEUX SONDES AVANT ELLE. `gestion_piece_vidage` (migration 260) et la colonne
   * `origine` de `gestion_piece_drive` (migration 255) peuvent manquer : nommer l'une ou l'autre sans l'avoir
   * sondée ferait échouer TOUT téléchargement, y compris ceux qui marchaient la minute d'avant.
   *
   * 🔒 LA COPIE LUE EST CELLE QUE NOUS AVONS FAITE (`origine = 'copie'`), et elle seule. Un dépôt manuel dans un
   * dossier client n'autorise AUCUNE lecture de remplacement : rien ne garantit qu'il soit encore là, et surtout il
   * peut vivre dans « Documents clients scannés », que ce lot ne touche sous aucune forme.
   */
  const avecVidage = await vidageDisponible();
  const avecCopie = await copiePiecesDisponible();

  const { rows } = await query<{
    cle_stockage: string | null; nom_fichier: string; type_mime: string | null;
    vide: boolean; drive_file_id: string | null; md5: string | null;
  }>(
    `SELECT p.cle_stockage, p.nom_fichier, p.type_mime,
            ${avecVidage ? 'EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : 'false'} AS vide,
            ${avecCopie ? 'd.drive_file_id' : 'NULL::text'} AS drive_file_id,
            ${avecCopie ? 'd.md5' : 'NULL::text'} AS md5
       FROM gestion_piece p
       ${avecCopie
    ? `LEFT JOIN gestion_piece_drive d
                ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL`
    : ''}
      WHERE p.id = $1`, [pieceId]);
  const p = rows[0];
  if (!p || !p.cle_stockage) return null; // pièce inconnue, ou jamais déposée : dans les deux cas, rien à servir
  return {
    cleStockage: p.cle_stockage, nomFichier: p.nom_fichier, typeMime: p.type_mime,
    stockageVide: p.vide, driveFileId: p.drive_file_id, md5Attendu: p.md5,
  };
}
