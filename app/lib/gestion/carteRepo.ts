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
// 🔴 LOT NOM-UNIQUE-DES-PIECES — le repli « nom d'usage, sinon nom d'origine », écrit UNE fois.
import { sqlNomAffiche, sqlNomOrigine } from './nomUsageSql';
// 🔴 LOT FICHE-SAISIE-UNIFORME — une copie supprimée du Drive ne doit plus être servie : elle produirait une
//   erreur à l'écran sur un document qui existe ailleurs. Voir `copieDisparue.ts`.
import { sqlCopieVivante } from './copieDisparueSql';
// LOT BIEN-RATTACHE — le HTML d'un mail est assaini CÔTÉ SERVEUR, jamais dans le navigateur (voir `lireCorpsDuMessage`).
import { assainirHtml, echapperTexte, htmlVide } from './htmlMail';
// 🔴🔴 LOT CADRE-ISOLE-MAILS — les <style> d'en-tête du mail, extraits du BRUT et filtrés. Module PUR.
import { stylesDuMail } from './cadreMail';
// LOT LECTURE-HTML-FIL-TROMBONE — les images d'un mail passent par NOS routes : voir `imagesMail`.
import { reecrireImages, type PieceIntegree } from './imagesMail';
/** 🔴🔴 LOT SIGNATURE-ECHELLE — la taille que l'auteur d'une image lui a donnée. Voir `dimensionsDOrigine`. */
import { dimensionsParRang, type Dimensions } from './tailleImageMail';
import {
  decouperTexteAImages, sqlExtraitLisible, sqlSansChargeImage, texteAUneImage,
} from './imagesIntegrees';
// 🔴 LOT ETOILE-SIGNATURES-PIECES — « cette pièce est-elle une VRAIE pièce ? », rendu en SQL. Une seule règle.
import { sqlEstVraiePiece } from './lisibilite';
import { sqlCleIdentitePiece } from './piecesConversation';
import { ATTEND, ctesAttente, jointuresAttente } from './attente';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';
// ⚠️ UN SEUL IMPORT DE `./schema`, STATIQUE. `destinatairesSeparesDisponibles` était chargée dynamiquement au
//   milieu d'une fonction (lot 5b) : deux façons d'importer le même module, donc deux endroits à tenir. Le garde
//   d'imports de ce fichier a attrapé le doublon dès qu'un second besoin de sonde est apparu (lot DRIVE-3).
import {
  copiePiecesDisponible, corbeilleGmailDisponible, destinatairesSeparesDisponibles, evenementQualifieDisponible,
  pieceIntegreeDisponible, vidageDisponible,
} from './schema';
// LOT ENVOI-DIAG — lecture seule elle aussi (SELECT sur `gestion_non_remise`). Elle rejoint la liste blanche du
//   garde d'imports de ce fichier pour la même raison que `./schema` : elle ne manipule aucun octet de pièce jointe.
import { nonRemisesDesMessages, type MentionNonRemise } from './nonRemiseRepo';
/* 🔴 LOT MARQUES-EVENEMENT-EN-COURS — la MÊME question que l'historique du bien et que la boîte. */
import { evenementsOuvertsDesMails } from './historiqueRepo';

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
  /**
   * 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — LE TYPE DE L'ÉVÉNEMENT, pour que le formulaire « Modifier les
   * informations de l'événement » puisse le PRÉ-REMPLIR. Il n'était lu nulle part sur le détail : on ne pouvait
   * donc choisir un type qu'À LA CRÉATION, et plus jamais après.
   *
   * ⚠️ `null` SANS LA MIGRATION 268 (la colonne n'existe pas) comme pour une carte sans type : les deux cas se
   * lisent pareil à l'écran — « Type à définir » —, et c'est juste dans les deux cas.
   */
  categorie: string | null;
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINTS 1 ET 3 — LE DEGRÉ D'URGENCE. Il PEINT la capsule de la carte (le mot qu'elle
   * écrit reste le type) et il pré-remplit le sélecteur à trois boutons. Il n'était lu nulle part sur le détail :
   * on ne pouvait donc choisir un niveau qu'À LA CRÉATION, et plus jamais après — exactement le trou qu'avait le
   * type avant le lot CAPSULE-TYPE-EVENEMENT.
   *
   * ⚠️ `null` SANS LA MIGRATION 268 (la colonne n'existe pas) comme pour une carte sans niveau : les deux cas se
   * lisent pareil à l'écran — capsule grise neutre —, et c'est juste dans les deux cas.
   */
  urgence: string | null;
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
  /**
   * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — CE MESSAGE EST À LA CORBEILLE ════════════════════════
   *
   * Constat d'Arno : sur un mail DÉJÀ à la corbeille, la grande icône corbeille de l'en-tête reste proposée.
   * C'est le signal qui la remplace par « Réintégrer ».
   *
   * ⚠️ `false` SANS LA MIGRATION 275, et c'est le bon repli : l'écran se comporte alors comme avant ce lot, au
   * lieu d'annoncer « Réintégrer » sur un mail dont on ne sait rien.
   */
  aLaCorbeille: boolean;
  /**
   * 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — COMBIEN D'ÉVÉNEMENTS EN COURS CE MAIL PORTE-T-IL ?
   *
   * DEMANDE D'ARNO : la capsule orange « PARTOUT où ces lignes apparaissent », la conversation nommément.
   *
   * ⚠️ CE N'EST PAS `fil.reference` DE L'EN-TÊTE, qui nomme la carte affectée à l'ÉCHANGE — ouverte ou close, et
   * la même pour tous ses messages. Ici la question se pose MAIL PAR MAIL, parce que la fenêtre de l'événement
   * est bornée par des dates et que deux messages d'un même fil peuvent tomber de part et d'autre.
   */
  evenementsEnCours: number;
  /** Le motif de la règle, en clair. `null` quand le message n'est pas écarté. */
  motifHorsFile: string | null;
  /**
   * LOT ENVOI-DIAG — CE MESSAGE N'EST PAS ARRIVÉ, et le serveur d'en face l'a dit.
   *
   * 🔴 VIDE DANS LE CAS ORDINAIRE, et c'est la seule chose qui compte : un mail dont personne ne se plaint est
   * arrivé. Non vide, il porte une phrase par avis reçu — un mail à cinq destinataires dont deux échouent en rend
   * deux, et il faut les deux : n'en montrer qu'un cacherait qu'une seule des cinq personnes n'a pas reçu.
   *
   * ⚠️ TOUJOURS `[]` SANS LA MIGRATION 261 : le fil s'affiche exactement comme avant.
   */
  nonRemises: MentionNonRemise[];
  /** Destinataires en À, quand ils sont CONNUS (migration 235). `null` = jamais analysés (message capturé avant). */
  destA: AdresseAffichee[] | null;
  /** Destinataires en copie, même convention. */
  destCc: AdresseAffichee[] | null;
  /** La liste FONDUE d'avant (À et Cc mêlés), toujours rendue : c'est le repli quand le détail n'est pas connu. */
  destinatairesFondus: string | null;
  /**
   * ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — CE MAIL A-T-IL UNE VERSION EN HTML ? ═════════════════════════════════
   *
   * REMPLACE `htmlSeul`, qui disait « ce mail n'a QUE du HTML ». Ce n'était pas la bonne question : depuis que le
   * HTML passe AVANT le texte quand il existe, il faut savoir s'il y en a — pas s'il est seul. Mesuré le
   * 29/09/2026 : 56 367 mails sur 57 223 en ont un. C'est le cas général.
   */
  aHtml: boolean;
  /**
   * Le HTML PRÊT POUR L'ÉCRAN (assaini, images réécrites vers nos routes) — rendu avec la liste pour le SEUL
   * message déplié d'emblée, `null` pour les autres. Ceux-là le reçoivent à l'ouverture, avec leur texte.
   */
  html: string | null;
  /**
   * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LA FEUILLE `<style>` D'EN-TÊTE DU MAIL, DÉJÀ FILTRÉE ═════════════════════
   *
   * Elle n'est posée QUE dans le cadre isolé, où elle ne peut peindre que le mail. `''` = ce mail n'en a pas, ou
   * cette lecture ne la rapporte pas — le cadre s'affiche alors comme avant ce lot.
   */
  cssMail?: string;
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
  /**
   * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — les octets de cette image sont DÉJÀ posés dans le corps du message : ce
   * n'est donc pas une pièce jointe (règle d'Arno). `null` = non décidé, et la pièce reste comptée. Lue seulement
   * si la migration 296 est appliquée ; `trierPieces` s'en sert, l'écran n'a rien à savoir.
   */
  integree?: boolean | null;
  /**
   * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — `nomFichier` EST LE NOM D'USAGE ══════════════════════════════════════
   *
   * Sa valeur change, son nom de champ non : c'est ce qui fait que les dix écrans qui l'affichent montrent le
   * nom d'usage sans qu'une seule ligne d'écran ait à bouger. Le nom D'ORIGINE, lui, arrive à côté.
   *
   * ⚠️ POURQUOI PAS RENOMMER LE CHAMP EN `nomAffiche` : il est lu dans une trentaine d'endroits, et le renommer
   * aurait mêlé un remaniement mécanique à un changement de comportement. Le commentaire coûte moins cher qu'un
   * diff de trois cents lignes où le vrai changement serait invisible.
   */
  /** Le nom sous lequel le correspondant l'a envoyée. Jamais modifié — c'est lui qu'on cherche dans Gmail. */
  nomOrigine: string;
  /**
   * 🔴 LOT RECAP-SANS-DOUBLON — L'EMPREINTE DU CONTENU. C'est elle qui dit si deux pièces d'une même conversation
   * sont le MÊME fichier — un document transféré puis re-transféré n'a pas à être listé trois fois.
   *
   * ⚠️ `null` = pièce sans octets chez nous (jamais conservée) : le récapitulatif retombe alors sur le nom et la
   * taille, et il le SIGNALE. Mesuré le 30/09/2026 : 0 pièce a des octets sans empreinte, les 430 sans empreinte
   * sont exactement les 430 sans clé de stockage.
   */
  empreinte: string | null;
}

/** Même formatage d'instant que `fileRepo` : une seule façon d'écrire une date dans tout le module. */
const INSTANT = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

/** Borne de sûreté : un fil pathologique ne doit pas rendre une page de plusieurs mégaoctets. */
export const MAX_MESSAGES = 200;
const MAX_CORPS = 20000;
/**
 * 🔴 LE HTML EST BORNÉ PLUS LARGEMENT QUE LE TEXTE, et c'est nécessaire : un mail de syndic fait couramment
 * 60 à 150 ko de balises pour trois paragraphes utiles. Couper à 20 000 rendrait un tableau à moitié fermé.
 * `assainirHtml` referme de toute façon les balises laissées ouvertes, et borne lui aussi à `HTML_MAX`.
 */
const MAX_HTML = 400000;
/** LOT 5b — la ligne REPLIÉE d'un message : assez pour reconnaître de quoi il parle, pas assez pour peser. */
const LONGUEUR_EXTRAIT = 300;

/**
 * LE DÉTAIL D'UNE CARTE : ce qu'elle porte, et les échanges qui lui sont RATTACHÉS (affectations actives seulement —
 * une affectation défaite reste en base, mais elle n'est plus la vérité du jour).
 */
export async function lireCarte(
  evenementId: number,
  ctx: { partenaires: readonly PartenaireInterne[]; adresseGestion: string; deplacements: boolean; spam?: boolean },
): Promise<CarteDetail | null> {
  /* 🔴 LOT CAPSULE-TYPE-EVENEMENT — `categorie` n'est NOMMÉE que si la migration 268 est là. Sans elle, la
     colonne n'existe pas et la nommer ferait échouer toute la lecture de la carte, pas seulement son type.
     🔴 LOT URGENCE-EVENEMENT — `urgence` vient de la MÊME migration (268) et suit donc le MÊME témoin. Deux
     sondes pour un seul fait finiraient par se contredire le jour où l'une serait oubliée. */
  const avecCategorie = await evenementQualifieDisponible();
  const { rows } = await query<{
    evenement_id: number; reference: string; objet: string; demandeur_nom: string | null;
    demandeur_email: string | null; adresse_libre: string | null; etat: string; ouvert_le: string;
    ouvert_par: string | null; traite_le: string | null; traite_par: string | null; categorie: string | null;
    urgence: string | null;
  }>(
    `SELECT id::int AS evenement_id, reference, objet, demandeur_nom, demandeur_email, adresse_libre, etat,
            ${avecCategorie ? 'categorie, urgence' : 'NULL::text AS categorie, NULL::text AS urgence'},
            ${INSTANT('ouvert_le')} AS ouvert_le, ouvert_par_libelle AS ouvert_par,
            ${INSTANT('traite_le')} AS traite_le, traite_par_libelle AS traite_par
       FROM gestion_evenement WHERE id = $1`, [evenementId]);
  const e = rows[0];
  if (!e) return null;

  // L'attente se calcule avec la MÊME définition que la file (`attente.ts`) : les deux colonnes de l'écran ne
  //   doivent pas pouvoir se contredire sur un même échange.
  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la colonne `integree` n'est NOMMÉE que si la migration 296 est là.
     Sans elle, le compteur retombe mot pour mot sur la règle de nom/taille d'avant ce lot. */
  const avecPieceIntegree = await pieceIntegreeDisponible();
  const { rows: fils } = await query<{
    fil_id: number; objet: string | null; interlocuteur: string | null; de_adresse: string; dernier_le: string;
    nb_messages: number; nb_pieces: number; attend: boolean;
  }>(
    `WITH ${ctesAttente('$2', '$3', ctx.deplacements, ctx.spam === true)}
     SELECT f.id::int AS fil_id, f.objet_initial AS objet, d.interlocuteur, d.de_adresse,
            ${INSTANT('d.recu_le')} AS dernier_le,
            -- Les compteurs disent ce que l'écran MONTRERA : un mail déplacé vers une autre carte n'est plus ici.
            (SELECT count(*) FROM gestion_message m2 WHERE m2.fil_id = f.id AND m2.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am2 WHERE am2.message_id = m2.id AND am2.actif)' : ''})::int AS nb_messages,
            (SELECT count(DISTINCT ${sqlCleIdentitePiece('p', await sqlNomAffiche('p'))}) FROM gestion_piece p JOIN gestion_message m3 ON m3.id = p.message_id
              WHERE m3.fil_id = f.id AND m3.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am3 WHERE am3.message_id = m3.id AND am3.actif)' : ''}
              AND ${sqlEstVraiePiece('p', avecPieceIntegree)})::int AS nb_pieces,
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
    categorie: e.categorie,
    urgence: e.urgence,
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
  // LOT ENVOI-DIAG — un mail déplacé vers une carte garde son avis de non-remise : déplacer un mail ne le fait pas
  //   arriver. L'oublier ici ferait du déplacement un moyen involontaire de faire disparaître l'alerte.
  const avisPartis = await nonRemisesDesMessages(rows.map((r) => r.message_id));
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
      /* ⚠️ LOT MARQUES-EVENEMENT-EN-COURS — un mail DÉPLACÉ vers une carte est montré SEUL, et c'est la carte
         elle-même qui porte son événement : la capsule de ligne n'a rien à dire ici. Renseigné honnêtement à
         zéro, jamais deviné — même convention que `horsFile` juste en dessous. */
      evenementsEnCours: 0,
      horsFile: false, // la requête ci-dessus les exclut déjà (`m.exclu_le IS NULL`)
      /**
       * 🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — `false` ICI, ET C'EST EXACT : ce sont les mails DÉPLACÉS
       * vers une carte, affichés en lecture dans la fiche de l'événement. Ils n'y portent aucune corbeille, donc
       * aucun « Réintégrer » n'a de sens. Lire la colonne aurait ajouté une question à une requête qui n'en a pas
       * besoin, pour un geste que cet écran n'offre pas.
       */
      aLaCorbeille: false,
      motifHorsFile: null,
      nonRemises: avisPartis.get(r.message_id) ?? [],
      destA: null,
      destCc: null,
      destinatairesFondus: null,
      /**
       * ⚠️ UN MAIL DÉPLACÉ EST MONTRÉ SEUL DANS SA CARTE, et cette lecture-là ne rapporte PAS son HTML : elle ne
       * lit que `corps_texte`. On le dit honnêtement — `aHtml: false` veut dire « cette lecture n'en sait rien »,
       * et l'écran affiche alors le texte, exactement comme avant ce lot. Prétendre le contraire ferait attendre
       * une mise en forme qui n'arriverait jamais.
       */
      aHtml: false,
      html: null,
      // 🔴 CETTE LECTURE NE RAPPORTE PAS LE HTML : elle n'a donc pas de feuille à rendre non plus.
      cssMail: '',
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
): Promise<{
  messageId: number; corps: string | null; html: string | null; htmlSeul: boolean;
  /**
   * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE CSS D'EN-TÊTE DU MAIL, POUR SON CADRE ISOLÉ ════════════════════════════
   *
   * 34 366 mails stockés portent un `<style>` qui change vraiment leur rendu (mesuré le 03/10/2026). Jusqu'ici il
   * était VIDÉ par l'assainissement, contenu compris — et il le reste pour tout ce qui s'affiche DANS la page.
   * Il n'est rendu ici que pour être posé dans le cadre isolé, où il ne peut peindre que le mail.
   *
   * ⚠️ `''` QUAND IL N'Y EN A PAS, jamais `null` : l'écran n'a alors rien à décider, il pose une feuille vide.
   */
  cssMail: string;
} | null> {
  const { rows } = await query<{
    message_id: number; corps: string | null; corps_html: string | null; html_seul: boolean;
  }>(
    `SELECT id::int AS message_id,
            left(coalesce(corps_texte, ''), ${MAX_CORPS}) AS corps,
            left(${sqlSansChargeImage('corps_html')}, ${MAX_HTML}) AS corps_html,
            (coalesce(btrim(corps_texte), '') = '' AND coalesce(btrim(corps_html), '') <> '') AS html_seul
       FROM gestion_message WHERE id = $1`, [messageId]);
  const r = rows[0];
  if (!r) return null;
  return {
    messageId: r.message_id,
    corps: r.corps && r.corps.trim() !== '' ? r.corps : null,
    /**
     * 🔴 LOT BIEN-RATTACHE — LE HTML EST ASSAINI **ICI**, CÔTÉ SERVEUR, ET JAMAIS DANS LE NAVIGATEUR.
     *
     * Demande d'Arno : 1 180 mails en base n'ont QUE du HTML, et l'écran leur opposait « Contenu disponible en
     * mise en forme uniquement — affichage à venir ». Un avis d'appel de provisions illisible est un avis perdu.
     *
     * 🔴 POURQUOI CÔTÉ SERVEUR. Le composant le pose ensuite par `dangerouslySetInnerHTML` : si l'assainissement
     * vivait dans le navigateur, il suffirait d'une réponse forgée pour poser du HTML brut dans la page. Ici, ce
     * qui sort de la base ne peut PAS quitter cette fonction sans être passé par `assainirHtml` — pas de script,
     * pas d'attribut d'événement, et les images selon la règle déjà en place (`PROTOCOLES_IMAGE`).
     */
    /**
     * 🔴🔴 LOT IMAGES-INTEGREES — UN TEXTE QUI PORTE UNE BALISE D'IMAGE DEVIENT UN CORPS À DESSINER.
     *
     * Demande d'Arno : « Texte seul contenant une balise <img src="data:image/…"> → l'image est dessinée à sa
     * place. » MESURÉ : 20 messages ont « <img » dans leur `corps_texte`, dont 2 une image `data:`. L'écran les
     * affichait en code, parce qu'un corps « texte » est rendu tel quel — et c'est la bonne règle, sauf ici.
     *
     * 🔴 ON NE DEVIENT PAS UN LECTEUR DE HTML POUR AUTANT. Le texte est reconstruit morceau par morceau : tout ce
     * qui n'est pas une balise `<img>` est ÉCHAPPÉ caractère par caractère, puis le tout repasse par le même
     * assainissement et la même réécriture d'images que n'importe quel corps HTML. Un `<b>` dans le texte reste
     * donc affiché comme `<b>`, et une image devient une image.
     */
    html: await htmlPourLEcran(messageId, texteAUneImage(r.corps) && (r.corps_html ?? '').trim() === ''
      ? htmlDuTexteAImages(r.corps ?? '')
      : r.corps_html),
    htmlSeul: r.html_seul === true,
    /**
     * 🔴 LU SUR LE **BRUT**, ET IL LE FAUT : `assainirHtml` vide la balise `<style>`, contenu compris. L'extraction
     * se fait donc sur la source, avant assainissement — puis le CSS est filtré (`@import`, `url(` externe,
     * `expression(`, `javascript:`, et toute sortie de balise).
     */
    cssMail: stylesDuMail(r.corps_html),
  };
}

/**
 * Le HTML d'un corps TEXTE qui porte des balises d'image : les images restent des balises, tout le reste est
 * échappé. PUR. Le résultat repasse par `assainirHtml`, qui reste le seul juge de ce qui a le droit d'exister.
 */
export function htmlDuTexteAImages(texte: string): string {
  return decouperTexteAImages(texte)
    .map((m) => (m.sorte === 'image'
      ? m.valeur
      : `<p>${echapperTexte(m.valeur).split('\n').join('<br />')}</p>`))
    .join('');
}

/**
 * ══ 🔴 LE HTML PRÊT POUR L'ÉCRAN : ASSAINI, PUIS SES IMAGES RÉÉCRITES ══════════════════════════════════════════
 *
 * L'ORDRE N'EST PAS INDIFFÉRENT — assainir D'ABORD, réécrire ENSUITE. `reecrireImages` ne protège de rien : elle
 * range. L'inverse laisserait l'assainissement passer sur des adresses que nous venons de fabriquer, et surtout
 * ferait compter les images sur un document qui n'est pas celui que le relais relira.
 *
 * ⚠️ LE RANG EST CELUI DU DOCUMENT ASSAINI, des deux côtés (ici et dans `htmlDuMessage`) : `assainirHtml` est pure
 * et déterministe, les deux comptages sont donc le même comptage.
 */
export async function htmlPourLEcran(messageId: number, brut: string | null | undefined): Promise<string | null> {
  const propre = htmlAffichable(brut);
  if (propre === null) return null;
  // Les pièces ne sont lues que s'il y a un `cid:` à résoudre — la quasi-totalité des mails n'en a aucun.
  const avecCid = propre.toLowerCase().includes('cid:');
  const pieces = avecCid ? await piecesIntegrees(messageId) : [];
  /**
   * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — ET LES PIÈCES DE L'ÉCHANGE, pour les `cid:` que ce message ne porte pas.
   *
   * Un mail qui nous revient cite les images de NOTRE envoi sans les emporter : Gmail garde les `<img src="cid:…">`
   * du corps cité et laisse les parties chez lui. Elles sont alors dans un AUTRE message de la conversation, et
   * c'est là qu'on va les chercher (voir `resoudreCids`).
   *
   * ⚠️ UNE SECONDE REQUÊTE, ET SEULEMENT S'IL Y A UN `cid:` — c'est-à-dire sur 64 messages de la base, pas sur
   * 57 466. La quasi-totalité des mails ne paie rien.
   */
  const conversation = avecCid ? await piecesDeLaConversation(messageId) : [];
  return reecrireImages(propre, {
    pieces,
    conversation,
    piece: (pieceId) => `/api/admin/gestion/pieces/${pieceId}`,
    relais: (rang) => `/api/admin/gestion/messages/${messageId}/image?rang=${rang}`,
    /**
     * 🔴🔴 LOT IMAGES-INTEGREES — les octets d'une image `data:` sont retirés à la LECTURE (`sqlSansChargeImage`)
     * et servis à la demande par cette route. Le rang est celui du document assaini, exactement comme pour le
     * relais des images distantes : les deux côtés comptent les mêmes `<img>` dans le même ordre.
     */
    integree: (rang) => `/api/admin/gestion/messages/${messageId}/integree?rang=${rang}`,
  });
}

/** Les pièces d'un message, réduites à ce qui permet de résoudre un `cid:`. LECTURE SEULE. */
async function piecesIntegrees(messageId: number): Promise<PieceIntegree[]> {
  const { rows } = await query<{
    id: number; nom_fichier: string; type_mime: string | null; taille_octets: string | null;
  }>(
    `SELECT id::int AS id, nom_fichier, type_mime, taille_octets::text
       FROM gestion_piece WHERE message_id = $1 ORDER BY id`,
    [messageId]);
  /**
   * ⚠️ PAS DE `dimensions` ICI, ET CE N'EST PAS UN OUBLI : pour une image du message lui-même, la balise qu'on
   * est en train de réécrire EST celle de l'auteur. Lui opposer une « origine » tirée du même document n'aurait
   * aucun sens. Seul le POIDS sert — il permet au repli d'icône de reconnaître une signature sans dimensions.
   */
  return rows.map((r) => ({
    pieceId: r.id,
    nomFichier: r.nom_fichier,
    typeMime: r.type_mime,
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
  }));
}

/**
 * ══ 🔴 LES PIÈCES DES **AUTRES** MESSAGES DE L'ÉCHANGE. LECTURE SEULE. ══════════════════════════════════════════
 *
 * ⚠️ « AUTRES » AU SENS STRICT : celles du message lui-même sont déjà passées au premier temps, et les laisser
 * entrer ici les ferait compter deux fois parmi les candidates du rang — donc décaler tout le rapprochement.
 *
 * ⚠️ ORDONNÉES PAR (date du message, id de pièce) : c'est l'ordre dans lequel les images ont été écrites, donc
 * celui du corps cité. Trier par id de pièce seul reviendrait presque au même, mais « presque » ne suffit pas
 * quand on rapproche par position.
 */
async function piecesDeLaConversation(messageId: number): Promise<PieceIntegree[]> {
  const { rows } = await query<{
    id: number; nom_fichier: string; type_mime: string | null; taille_octets: string | null;
    message_id: number; corps_html: string | null; integree: boolean | null;
  }>(
    `SELECT p.id::int AS id, p.nom_fichier, p.type_mime, p.taille_octets::text,
            p.message_id::int AS message_id,
            left(${sqlSansChargeImage('m.corps_html')}, ${MAX_HTML}) AS corps_html,
            ${await pieceIntegreeDisponible() ? 'p.integree' : 'NULL::boolean'} AS integree
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = (SELECT fil_id FROM gestion_message WHERE id = $1)
        AND p.message_id <> $1
      ORDER BY m.recu_le ASC, m.id ASC, p.id ASC`, [messageId]);
  const tailles = dimensionsDOrigine(rows);
  return rows.map((r) => ({
    pieceId: r.id,
    nomFichier: r.nom_fichier,
    typeMime: r.type_mime,
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
    dimensions: tailles.get(r.id) ?? null,
  }));
}

/**
 * ══ 🔴🔴 LOT SIGNATURE-ECHELLE — LA TAILLE QUE L'AUTEUR A DONNÉE À CHAQUE IMAGE INTÉGRÉE ════════════════════════
 *
 * Pour chaque message de l'échange, on apparie SES `<img>` (dans l'ordre du document) avec SES images intégrées
 * (dans l'ordre des pièces). C'est EXACTEMENT la convention de rang que le relais `/messages/[id]/integree?rang=N`
 * emploie déjà pour servir les octets : on ne pose pas une seconde hypothèse, on réemploie celle qui est en
 * service, et les deux lisent le même HTML assaini (`sqlSansChargeImage` retire les octets, jamais les balises).
 *
 * 🔴 CE QUE ÇA RAPPORTE : notre envoi 57464 publie ses icônes en `width="20" height="20"`. La réponse d'Arno les
 * cite en `style="width:240px"`. Sans cette table, on n'aurait aucun moyen de savoir laquelle des deux tailles
 * est celle de l'auteur — et l'on afficherait une épingle de 240 px au milieu d'un texte de 13 px.
 *
 * ⚠️ ON N'APPARIE QUE LES IMAGES **INTÉGRÉES**, et seulement celles-là : une pièce jointe ordinaire (un PDF, une
 * photo envoyée en pièce) n'a pas de balise dans le corps, et la faire entrer dans le comptage décalerait tout
 * l'appariement. Sans la migration 296 (`integree` à `NULL`), on se rabat sur « c'est une image », qui est la
 * règle d'avant — au pire on apparie quelques images de trop, jamais l'inverse.
 *
 * ⚠️ ET L'APPARIEMENT EST ABANDONNÉ SI LES DEUX COMPTES DIFFÈRENT : un message dont le corps porte trois images
 * et qui n'a que deux pièces intégrées ne se laisse pas apparier sans deviner. On préfère ne rien dire.
 */
function dimensionsDOrigine(
  rows: readonly {
    id: number; message_id: number; corps_html: string | null; type_mime: string | null;
    nom_fichier: string; integree: boolean | null;
  }[],
): Map<number, Dimensions> {
  const parMessage = new Map<number, { html: string | null; pieces: number[] }>();
  for (const r of rows) {
    const estImage = (r.type_mime ?? '').toLowerCase().startsWith('image/');
    const retenue = r.integree === null ? estImage : r.integree === true;
    const e = parMessage.get(r.message_id) ?? { html: r.corps_html, pieces: [] };
    if (retenue) e.pieces.push(r.id);
    parMessage.set(r.message_id, e);
  }
  const out = new Map<number, Dimensions>();
  for (const { html, pieces } of parMessage.values()) {
    if (html === null || pieces.length === 0) continue;
    const dims = dimensionsParRang(htmlAffichable(html) ?? '');
    if (dims.length !== pieces.length) continue;          // voir l'encadré : on ne devine pas
    pieces.forEach((pieceId, i) => out.set(pieceId, dims[i]));
  }
  return out;
}

/**
 * ══ 🔴 LE HTML ASSAINI D'UN MESSAGE, TEL QUE L'AFFICHAGE LE VOIT — pour le relais d'images ══════════════════════
 *
 * Le relais (`/messages/[id]/image?rang=N`) doit retrouver EXACTEMENT la même liste d'images que le rendu, dans le
 * même ordre : c'est le rang qui les relie. Il passe donc par cette fonction, et non par une lecture à lui.
 *
 * ⚠️ SANS RÉÉCRITURE DES IMAGES. C'est le HTML d'origine, assaini : les `src` y sont encore ceux de l'expéditeur,
 * et c'est précisément ce que le relais vient chercher.
 */
export async function htmlDuMessage(messageId: number): Promise<string | null> {
  const { rows } = await query<{ corps_html: string | null }>(
    `SELECT left(${sqlSansChargeImage('corps_html')}, ${MAX_HTML}) AS corps_html FROM gestion_message WHERE id = $1`,
    [messageId]);
  const r = rows[0];
  return r === undefined ? null : htmlAffichable(r.corps_html);
}

/**
 * LE HTML PRÊT À POSER DANS LA PAGE, ou `null` quand il ne reste rien à montrer. PUR (délègue au module `htmlMail`).
 *
 * ⚠️ `htmlVide` APRÈS assainissement, et non avant : un HTML fait de balises de mise en page sans texte ni image
 * donnerait un cadre blanc, ce qui se lit « message vide » — alors qu'il n'y avait rien à lire dès le départ.
 */
export function htmlAffichable(brut: string | null | undefined): string | null {
  /**
   * ══ 🔴🔴 LOT RENDU-FIDELE-HTML — C'EST UN MAIL **REÇU** QU'ON AFFICHE, DONC LE PROFIL « reception » ══════════
   *
   * Demande d'Arno : « un mail doit s'afficher comme dans Gmail, et surtout ses boutons et liens doivent être
   * présents et cliquables (ce sont des liens de travail : missions, devis, validations) ».
   *
   * 🔴 CETTE SEULE LIGNE EST CE QUI RÉPARE LE BOUTON D'ARNO. Avec le profil d'ÉCRITURE, `background:#1B4DFF`
   * tombait (seul `background-color` était permis) alors que `color:#FFFFFF` passait : le bouton Monga était
   * rendu en blanc sur blanc — présent, cliquable, et invisible. Et `width`/`align`/`cellpadding`/`max-width`
   * tombaient aussi, d'où la colonne étalée sur toute la largeur.
   *
   * ⚠️ LA SÛRETÉ NE BOUGE PAS D'UN CARACTÈRE : même moteur, mêmes balises interdites et vidées (`script`,
   * `style`, `iframe`, `form`…), mêmes `on*` jetés, mêmes protocoles de lien, même refus de toute valeur portant
   * `url(`, `expression(`, `javascript:` ou `@import`. Le profil n'ouvre que des NOMS.
   *
   * ⚠️ ET L'ÉCRITURE N'EST PAS CONCERNÉE : ce que NOUS envoyons passe toujours par le profil strict, qui est son
   * défaut. Un collage ne peut toujours pas glisser du contenu caché dans un mail signé de nous.
   */
  const propre = assainirHtml(brut, 'reception');
  return htmlVide(propre) ? null : propre;
}

/**
 * ══ 🔴 LES CHAMPS D'UNE PIÈCE DE MESSAGE, ÉCRITS UNE FOIS ═══════════════════════════════════════════════════════
 *
 * Deux requêtes lisent les mêmes colonnes — l'une pour un ensemble de messages, l'autre pour tout un fil. Elles
 * étaient recopiées mot pour mot. En ajoutant l'empreinte (lot RECAP-SANS-DOUBLON), il aurait fallu penser à
 * l'ajouter DEUX fois : un oubli aurait donné un récapitulatif dédoublonné dans un écran et pas dans l'autre,
 * sans que rien ne le dise.
 *
 * ⚠️ `empreinte_sha256` EXISTE DEPUIS LA CRÉATION DE LA TABLE : aucune sonde de schéma ici, pas plus que pour
 * `motif_non_stocke` juste à côté. Les sondes protègent les colonnes AJOUTÉES par migration.
 */
/**
 * 🔴 LOT NOM-UNIQUE-DES-PIECES — `nom_fichier` REND LE NOM D'USAGE, et `nom_origine` le nom reçu. Le repli est
 * écrit une seule fois (`sqlNomAffiche`) et dépend d'une sonde : sans la migration 286, les deux colonnes
 * rendent la même chose et la requête est mot pour mot celle d'avant ce lot.
 */
const champsPieceDeMessage = async (): Promise<string> =>
  `p.id::int AS piece_id, p.message_id::int AS message_id,
   ${await sqlNomAffiche('p')} AS nom_fichier, ${sqlNomOrigine('p')} AS nom_origine,
   p.type_mime, p.taille_octets, (p.cle_stockage IS NOT NULL) AS disponible, p.motif_non_stocke,
   p.empreinte_sha256,
   ${/* 🔴 LOT ETOILE-SIGNATURES-PIECES — nommée seulement si la migration 296 est là. */
     await pieceIntegreeDisponible() ? 'p.integree' : 'NULL::boolean AS integree'}`;

interface LignePieceDeMessage {
  piece_id: number; message_id: number; nom_fichier: string; nom_origine: string; type_mime: string | null;
  taille_octets: string | number | null; disponible: boolean; motif_non_stocke: string | null;
  empreinte_sha256: string | null; integree: boolean | null;
}

/** Les pièces d'un ensemble de messages, rangées par message. Une seule requête, quel que soit le nombre de messages. */
async function lirePiecesDesMessages(messageIds: readonly number[]): Promise<Map<number, PieceDeMessage[]>> {
  const parMessage = new Map<number, PieceDeMessage[]>();
  if (messageIds.length === 0) return parMessage;
  const { rows } = await query<LignePieceDeMessage>(
    `SELECT ${await champsPieceDeMessage()}
       FROM gestion_piece p WHERE p.message_id = ANY($1::bigint[]) ORDER BY p.id ASC`, [messageIds]);
  for (const p of rows) {
    const liste = parMessage.get(p.message_id) ?? [];
    liste.push({
      pieceId: p.piece_id, nomFichier: p.nom_fichier, nomOrigine: p.nom_origine, typeMime: p.type_mime,
      // `bigint` revient en CHAÎNE avec pg : sans conversion, les tailles se compareraient comme du texte.
      tailleOctets: p.taille_octets === null ? null : Number(p.taille_octets),
      disponible: p.disponible === true, motifNonStocke: p.motif_non_stocke,
      empreinte: p.empreinte_sha256, integree: p.integree,
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
  /* 🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — la sonde de la migration 275. Même patron que les autres :
     sans elle, `corbeille_le` n'est nommée nulle part et le fil se lit mot pour mot comme avant. */
  const avecCorbeille = await corbeilleGmailDisponible();
  const { rows } = await query<{
    message_id: number; message_id_rfc: string; sens: string; de_adresse: string; de_nom: string | null; recu_le: string;
    objet: string | null; corps: string | null; extrait: string | null; automatique: boolean;
    hors_file: boolean; motif_hors_file: string | null; a_html: boolean; corps_html: string | null;
    dest_a: unknown; dest_cc: unknown; destinataires: string | null; est_dernier: boolean;
    /** 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — « false » partout sans la migration 275. */
    a_la_corbeille: boolean;
  }>(
    `WITH msg AS (
       SELECT id, message_id, sens, de_adresse, de_nom, recu_le, objet, corps_texte, corps_html, automatique,
              exclu_le, exclu_motif, destinataires${avecDest ? ', dest_a, dest_cc' : ''},
              /**
               * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — CE MESSAGE EST-IL À LA CORBEILLE ? ═══════
               *
               * CONSTAT D'ARNO (fil 36698 / message 57477, « _TEST corbeille ») : « la grande icône corbeille du
               * bloc gris est toujours là. C'est illogique pour un mail déjà à la corbeille. »
               *
               * 🔴 L'ÉCRAN DEMANDE LA DONNÉE, PAS LA NAVIGATION. On aurait pu déduire « il est à la corbeille »
               * de « la conversation a été ouverte depuis la Corbeille » — c'est faux dès qu'un échange mêle un
               * mail jeté et un mail vivant, ce qui est précisément le cas de « _TEST corbeille ». La question
               * porte sur CE message, et seule la base y répond.
               *
               * ⚠️ SANS LA MIGRATION 275, LA COLONNE N'EST NOMMÉE NULLE PART et l'expression vaut « false » : le
               * fil se lit exactement comme avant ce lot, et l'icône reste la corbeille. Discipline des sondes.
               */
              ${avecCorbeille ? '(corbeille_le IS NOT NULL)' : 'false'} AS a_la_corbeille,
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
            left(${sqlExtraitLisible('corps_texte')}, ${LONGUEUR_EXTRAIT}) AS extrait,
            automatique,
            (exclu_le IS NOT NULL) AS hors_file,
            exclu_motif AS motif_hors_file,
            (coalesce(btrim(corps_html), '') <> '') AS a_html,
            -- 🔴 LOT LECTURE-HTML-FIL-TROMBONE — le HTML du DERNIER message part avec la liste, comme son texte.
            --    Sans lui, le message qu'on déplie d'emblée afficherait « Mise en forme en cours de lecture… » le
            --    temps d'un aller-retour : un clignotement à CHAQUE ouverture de conversation, pour rien.
            CASE WHEN est_dernier THEN left(${sqlSansChargeImage('corps_html')}, ${MAX_HTML}) END AS corps_html,
            ${avecDest ? 'dest_a, dest_cc' : 'NULL::jsonb AS dest_a, NULL::jsonb AS dest_cc'},
            destinataires, est_dernier, a_la_corbeille
       FROM msg
      ORDER BY recu_le ASC, message_id ASC`, [filId]);

  const { rows: pieces } = await query<LignePieceDeMessage>(
    `SELECT ${await champsPieceDeMessage()}
       FROM gestion_piece p JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = $1 AND m.exclu_le IS NULL
      ORDER BY p.id ASC`, [filId]);

  const parMessage = new Map<number, PieceDeMessage[]>();
  for (const p of pieces) {
    const liste = parMessage.get(p.message_id) ?? [];
    liste.push({
      pieceId: p.piece_id, nomFichier: p.nom_fichier, nomOrigine: p.nom_origine, typeMime: p.type_mime,
      // `bigint` revient en CHAÎNE avec pg : sans conversion, l'écran afficherait « 12345 o » comme du texte et les
      //   comparaisons de taille mentiraient. Piège connu du dépôt.
      tailleOctets: p.taille_octets === null ? null : Number(p.taille_octets),
      disponible: p.disponible === true, motifNonStocke: p.motif_non_stocke,
      empreinte: p.empreinte_sha256, integree: p.integree,
    });
    parMessage.set(p.message_id, liste);
  }

  /**
   * LOT ENVOI-DIAG — LES AVIS DE NON-REMISE DU FIL, en une requête pour tous les messages.
   *
   * ⚠️ UN SEUL ALLER-RETOUR, pas un par message : un fil de cent messages ne doit pas coûter cent requêtes pour
   * découvrir que rien n'a été refusé — ce qui est le cas général.
   */
  const avisParMessage = await nonRemisesDesMessages(rows.map((m) => m.message_id));

  /**
   * ⚠️ LE HTML DU DERNIER MESSAGE EST ASSAINI ET SES IMAGES RÉÉCRITES ICI, comme le ferait `lireCorpsDuMessage` :
   * c'est le MÊME chemin, appelé au même endroit de la chaîne. Le faire seulement à l'ouverture obligerait le
   * message déplié d'emblée à repasser par le réseau pour rien.
   */
  const htmlDernier = await Promise.all(rows.map(async (m) => [
    m.message_id, m.corps_html === null ? null : await htmlPourLEcran(m.message_id, m.corps_html),
  ] as const));
  const parHtml = new Map(htmlDernier);

  /**
   * ══ 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — LES ÉVÉNEMENTS EN COURS DE CHAQUE MESSAGE DU FIL ═══════════════════
   *
   * 🔴 MÊME FONCTION QUE L'HISTORIQUE DU BIEN ET QUE LA BOÎTE (`evenementsOuvertsDesMails`) : les deux voies
   * d'Arno unies, la fenêtre de l'événement comprise. La conversation dit donc la même chose que la ligne par
   * laquelle on y est entré — ce qui est tout l'intérêt de poser la question à un seul endroit.
   *
   * ⚠️ DEUX REQUÊTES POUR LE FIL ENTIER, jamais une par message : même borne que les pièces et les avis de
   * non-remise juste au-dessus.
   */
  const evtsOuverts = await evenementsOuvertsDesMails(
    rows.map((m) => ({ messageId: m.message_id, filId })));

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
    /**
     * 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — CE MESSAGE EST-IL À LA CORBEILLE ?
     *
     * C'est lui qui décide si l'écran montre une corbeille ou un « Réintégrer » — par la DONNÉE, et non par
     * l'endroit d'où l'on a ouvert la conversation. Voir l'encadré de la requête.
     */
    aLaCorbeille: m.a_la_corbeille === true,
    evenementsEnCours: (evtsOuverts.get(m.message_id) ?? []).length,
    nonRemises: avisParMessage.get(m.message_id) ?? [],
    // `null` (jamais analysé) et `[]` (analysé, personne) ne se confondent pas — c'est tout l'objet de la migration 235.
    destA: adressesDe(m.dest_a),
    destCc: adressesDe(m.dest_cc),
    destinatairesFondus: m.destinataires && m.destinataires.trim() !== '' ? m.destinataires : null,
    /**
     * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — `aHtml` REMPLACE `htmlSeul`, et la différence est tout le lot.
     *
     * `htmlSeul` disait « ce mail n'a QUE du HTML » (557 messages) : il ne servait qu'à ne pas afficher un vide
     * muet. Mais la règle a changé — le HTML passe AVANT le texte, quand il existe — et la question n'est donc
     * plus « n'y a-t-il que ça ? » mais « y en a-t-il ? ». Mesuré le 29/09/2026 : 56 367 mails sur 57 223 ont du
     * HTML. C'est le cas général, plus l'exception.
     */
    aHtml: m.a_html === true,
    html: parHtml.get(m.message_id) ?? null,
    /**
     * 🔴🔴 LOT CADRE-ISOLE-MAILS — LA FEUILLE D'EN-TÊTE DU MAIL VOYAGE AVEC SON HTML, par le même chemin.
     *
     * ⚠️ ELLE EST LUE SUR LE **BRUT** (`m.corps_html`), avant assainissement : `assainirHtml` vide la balise
     * `<style>`, contenu compris, et c'est très bien ainsi pour tout ce qui s'affiche DANS la page. Le cadre
     * isolé, lui, est le seul endroit où cette feuille peut peindre sans risque.
     */
    cssMail: stylesDuMail(m.corps_html),
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
  /**
   * 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE NOM D'ORIGINE, ET IL SERT À UNE CHOSE PRÉCISE : retrouver la pièce dans
   * le message Gmail, au dernier recours du lecteur d'octets. Gmail ne permet pas de renommer une pièce jointe :
   * là-bas, elle porte TOUJOURS le nom d'origine. Y chercher le nom d'usage ne trouverait rien, et la pièce
   * serait déclarée introuvable alors qu'elle est là.
   */
  nomOrigine: string;
  /**
   * 🔴 LOT PJ-APRES-VIDAGE — la TAILLE connue, et l'ancre du message d'origine. Le lecteur central s'en sert pour
   * vérifier ce qu'il reçoit (une source qui rend 40 octets au lieu de 76 504 n'a pas rendu le bon fichier) et
   * pour son dernier recours (la pièce, dans le message tel qu'il est aujourd'hui dans Gmail).
   *
   * ⚠️ RENDUS PAR LA MÊME REQUÊTE, et c'est le point : une seconde lecture pour deux colonnes ajouterait un
   * aller-retour à CHAQUE ouverture de pièce, sur la route qui sert les octets.
   */
  tailleAttendue: number | null;
  messageIdRfc: string | null;
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
    cle_stockage: string | null; nom_fichier: string; nom_origine: string; type_mime: string | null;
    vide: boolean; drive_file_id: string | null; md5: string | null;
    taille_octets: string | null; message_id_rfc: string | null;
  }>(
    `SELECT p.cle_stockage, ${await sqlNomAffiche('p')} AS nom_fichier,
            ${sqlNomOrigine('p')} AS nom_origine, p.type_mime, p.taille_octets::text,
            (SELECT m.message_id FROM gestion_message m WHERE m.id = p.message_id) AS message_id_rfc,
            ${avecVidage ? 'EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : 'false'} AS vide,
            ${avecCopie ? 'd.drive_file_id' : 'NULL::text'} AS drive_file_id,
            ${avecCopie ? 'd.md5' : 'NULL::text'} AS md5
       FROM gestion_piece p
       ${avecCopie
    ? `LEFT JOIN gestion_piece_drive d
                ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
               AND ${await sqlCopieVivante('d')}`
    : ''}
      WHERE p.id = $1`, [pieceId]);
  const p = rows[0];
  if (!p || !p.cle_stockage) return null; // pièce inconnue, ou jamais déposée : dans les deux cas, rien à servir
  return {
    cleStockage: p.cle_stockage, nomFichier: p.nom_fichier, nomOrigine: p.nom_origine, typeMime: p.type_mime,
    stockageVide: p.vide, driveFileId: p.drive_file_id, md5Attendu: p.md5,
    tailleAttendue: p.taille_octets === null ? null : Number(p.taille_octets),
    messageIdRfc: p.message_id_rfc,
  };
}
