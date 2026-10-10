/**
 * MODULE « GESTION » — LOT 2 : LECTURE de l'écran à deux côtés. IMPUR (base), mais STRICTEMENT EN LECTURE : ce fichier
 * n'émet que des SELECT. Aucun INSERT, aucun UPDATE, aucun DELETE — les gestes (affecter, classer sans suite) sont le lot 4.
 *
 * 🔴 LA RÈGLE QUI COMMANDE CE FICHIER : « ATTEND UNE RÉPONSE DE NOTRE PART » EST DÉRIVÉ, JAMAIS STOCKÉ.
 * Aucune colonne ne le porte — elle mentirait dès le message suivant. Le calcul se fait à chaque lecture et s'appuie sur
 * l'index partiel `gestion_message_attente_idx (fil_id, recu_le DESC) WHERE exclu_le IS NULL` posé par la migration 228
 * exprès pour lui. Sa DÉFINITION, elle, vit dans `attente.ts` — une seule, partagée par la file et par les cartes, pour
 * que les deux colonnes de l'écran ne puissent pas se contredire (lot 4d : trois sortes d'expéditeurs, pas deux).
 *
 * L'ORDRE DEMANDÉ À L'ÉCRAN : ce qui attend une réponse depuis LE PLUS LONGTEMPS d'abord. Donc, dans les deux colonnes :
 * ce qui attend passe devant ce qui n'attend pas, puis du plus ANCIEN au plus récent.
 */
import { query } from '../db/client';
import { sqlEstVraiePiece } from './lisibilite';
/* 🔴🔴 LOT ETAT-PAR-LA-FRISE — « ouvert » se deduit des cartes de borne de la frise, et le tri de la file avec. */
import { etatAffiche, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';
import { sqlNomAffiche } from './nomUsageSql';
import { sqlCleIdentitePiece } from './piecesConversation';
import { evenementQualifieDisponible, evenementVuDisponible, pieceIntegreeDisponible } from './schema';
import { ATTEND, ATTEND_CARTE, CTE_MESSAGES_DEPLACES, cteDernier, ctesAttente, jointuresAttente } from './attente';
import { chargerConfigGestion } from './config';
/* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — le TYPE seul, effacé à la compilation : aucune dépendance ajoutée. */
import type { TypeEtape } from './mongaEtape';
import { toleranceVeilleValide, VEILLE_INTERVALLES_DEFAUT, type VeilleReleve } from './ecran';
import { adressesDe, libelleExpediteur, lirePartenairesInternes, type PartenaireInterne } from './partenaires';
import {
  corbeilleGmailDisponible, deplacementsDeMailsDisponibles, reglageVeilleDisponible, suiteReleveDisponible,
  spamDisponible,
} from './schema';
import type { SuiteVue } from './suiteReleve';
import type { CopieVue } from './copieArretee';
import { lireEtatCopie } from './copieArreteeRepo';

/** Une ligne de la FILE (colonne de gauche) : un FIL de discussion, jamais un message isolé. */
export interface LigneFile {
  filId: number;
  objet: string | null;
  interlocuteur: string | null;   // nom affiché du dernier message, à défaut son adresse
  dernierLe: string;              // ISO — date du dernier message non exclu
  nbMessages: number;
  nbPieces: number;
  attend: boolean;                // DÉRIVÉ : le dernier message non exclu est reçu ET probablement humain
}

/** Une CARTE d'événement (colonne de droite). */
export interface CarteEvenement {
  evenementId: number;
  reference: string;
  objet: string;
  demandeur: string | null;       // nom, à défaut adresse — ce que le mail contenait, rien de plus
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  ouvertLe: string;               // ISO
  dernierEchangeLe: string | null; // ISO — dernier message non exclu de ses fils, ou null s'il n'en a aucun
  nbFils: number;
  /** LOT 4d — des mails isolés, rattachés à cette carte sans leur échange. Comptés à part : ce ne sont pas des échanges. */
  nbMailsDeplaces: number;
  attend: boolean;                // DÉRIVÉ : au moins un de ses fils — ou le dernier mail déplacé — attend une réponse
  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA DERNIÈRE CARTE D'ÉTAPE DE SA FRISE ═══════════════════════════
   *
   * Arno : « Ajoute À DROITE de la vignette une miniature de la DERNIÈRE carte d'étape de sa frise (même dessin
   * qu'un carré de la frise, en réduit : nom de l'étape et date, contour vert, pictogramme Monga si elle vient
   * de Monga, ambre si “à confirmer”). Sans aucune étape : “Ouverture” et sa date. »
   *
   * 🔴 `null` = AUCUNE ÉTAPE, et c'est l'écran qui en déduit « Ouverture + la date d'ouverture de l'événement ».
   * Fabriquer ici une fausse étape d'ouverture aurait mis dans la liste une ligne qui n'existe pas en base — et
   * la frise, elle, sait très bien faire la différence entre une ouverture enregistrée et une ouverture dérivée.
   *
   * ⚠️ LA DERNIÈRE **PAR DATE**, comme la frise les range (lot FRISE-CONSTRUCTIBLE) : c'est « où en est-on ? »
   * qu'on lit sur une vignette, et la réponse est le dernier fait, pas le dernier enregistré.
   */
  derniereEtape: DerniereEtapeVignette | null;
  /**
   * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — LA DERNIÈRE ÉTAPE **VENUE DE MONGA** ═════════════════════════
   *
   * Arno : « quand l'événement a été intégré par les mails Monga (référence MNG liée), afficher la capsule verte
   * Monga juste en dessous de la vignette de droite. Elle indique la DERNIÈRE étape Monga de l'événement. »
   *
   * 🔴 CE N'EST PAS `derniereEtape`, et la différence compte : celle-ci est la dernière étape TOUTES SOURCES
   * CONFONDUES. Un dossier dont la dernière carte a été posée à la main n'en est pas moins suivi par Monga, et
   * c'est l'avancement CHEZ MONGA que la capsule annonce.
   *
   * 🔴 MÊME SOURCE DE CALCUL QUE LA FRISE, et littéralement le même texte SQL (`sqlDerniereEtape`), borné aux
   * étapes venues de Monga — jamais une seconde requête qui recalculerait à sa façon.
   *
   * ⚠️ `null` EST LE CAS ORDINAIRE (aucune étape Monga) : la capsule ne s'affiche alors pas.
   */
  derniereEtapeMonga: DerniereEtapeVignette | null;
  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — « MIS À JOUR PAR MONGA » ═════════════════════════════════════════
   *
   * Arno : « Quand l'automatisation Monga AJOUTE ou MODIFIE une étape d'un événement (jamais pour un geste
   * manuel), la vignette est mise en avant […] L'effet reste PAR COLLABORATEUR jusqu'à ce que CE collaborateur
   * clique sur la vignette, OU ouvre la fiche du bien concerné, OU ouvre la vue de l'événement. »
   *
   * 🔴 L'EFFET EST UNE COMPARAISON, PAS UN DRAPEAU : `mongaMajLe > vuLe`. Un booléen aurait demandé de
   * l'éteindre chez TOUS les collaborateurs à chaque relève — autant d'écritures que de comptes, à la minute.
   * Ici, une étape Monga ne touche RIEN : elle rallume l'effet d'elle-même, parce que sa date repasse devant.
   *
   * ⚠️ `mongaMajLe` EST `greatest(cree_le, maj_le)` et non `survenu_le` : Arno dit « AJOUTE ou MODIFIE ». La
   * date de l'étape est celle du FAIT (un rendez-vous de la semaine prochaine) ; ce qu'on veut ici est le moment
   * où l'automatisation a écrit.
   *
   * ⚠️ `null` DES DEUX CÔTÉS EST LE CAS ORDINAIRE : aucune étape Monga, ou jamais vu. L'écran n'allume alors
   * rien — un effet sans mise à jour serait un cri sans nouvelle.
   */
  mongaMajLe: string | null;
  /** Quand MOI, le collaborateur qui lit, j'ai vu cet événement pour la dernière fois. `null` = jamais. */
  vuLe: string | null;
  /**
   * 🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — les références MNG reliées à cet événement. Vide = pas suivi par
   * Monga, et c'est le cas ordinaire. L'écran en fait une vignette « MONGA », la référence au survol.
   */
  mongaRefs: string[];
  /**
   * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — CE QUE LA VIGNETTE DIT EN PLUS ════════════════════════════════
   *
   * Arno : « le TYPE d'événement […] “Ouvert depuis N jours” ET “dernier échange il y a N jours” […] l'adresse
   * du bien (avec le lot) […] le propriétaire, le locataire en place s'il y en a un, et “Demandé par <nom>”. »
   *
   * 🔴 LA LISTE DES TYPES EXISTE DÉJÀ (`CATEGORIES_EVENEMENT`, migration 268) : travaux, fuite d'eau,
   * administratif, litige. Aucune migration n'a donc été faite — Arno l'avait conditionnée à son absence.
   *
   * ⚠️ « N JOURS » SE CALCULE À L'ÉCRAN, pas ici : l'instant de référence y est injecté (règle de `depuis`),
   * et un nombre de jours figé au moment de la lecture vieillirait dans un onglet laissé ouvert.
   *
   * ⚠️ UN SEUL BIEN EST RENDU, LE PREMIER PAR CLÉ — et c'est assumé : la vignette est une vignette. Les
   * événements multi-biens existent (le gros bouton du point 1 les gère), mais quatre lignes d'adresses dans
   * une liste de dossiers la rendraient illisible. Le nombre total est rendu à côté, pour ne rien taire.
   */
  categorie: string | null;
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 1 — LE DEGRÉ D'URGENCE, qui PEINT la capsule de la carte. Le mot qu'elle
   * écrit reste le TYPE : la couleur ne fait que dire s'il y a le feu.
   *
   * ⚠️ `null` = aucun niveau enregistré, et c'est le cas de 2 événements sur 2 en base le 08/10/2026. La capsule
   * est alors GRISE NEUTRE — ni verte, ni « Normal » par défaut : ne pas avoir choisi n'est pas « pas urgent ».
   *
   * ⚠️ MÊME TÉMOIN QUE `categorie` (`evenementQualifieDisponible`), puisque c'est la MÊME migration (268).
   */
  urgence: string | null;
  /**
   * ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — COMBIEN DE MAILS REÇUS NON LUS CETTE CARTE PORTE ════════════════════════
   *
   * ARNO (08/10/2026) : « Un événement est “New” s'il a au moins un mail REÇU (pas envoyé par nous) rattaché à lui
   * et encore non lu. […] Le statut disparaît dès que tous ces mails ont été ouverts. »
   *
   * ⚠️ `0` QUAND GMAIL EST INJOIGNABLE, et c'est le bon repli : sans connexion Google il n'y a AUCUN état de
   * lecture à lire (règle du lot 5-BOITE-2). Aucune carte n'est alors « New », et l'écran n'invente pas un statut
   * qu'il ne sait pas calculer — plutôt que de toutes les déclarer neuves.
   */
  nbRecusNonLus: number;
  /**
   * 🔴 « Date de l'activité “New” = date du mail reçu non lu le plus récent de l'événement » (Arno). `null` =
   * l'événement n'est PAS « New » : c'est ce champ, et lui seul, qui porte le statut pour le tri comme pour la
   * pastille (`estNouveau`, module pur `triEvenements`).
   */
  nouveauteLe: string | null;
  bien: { cle: string; adresse: string | null; commune: string | null;
    proprietaire: string | null; locataire: string | null } | null;
  nbBiens: number;
}

/** Ce qu'une miniature de dernière étape porte. Les REPÈRES en sont exclus : ce ne sont pas des étapes. */
export interface DerniereEtapeVignette {
  type: TypeEtape;
  /** Le titre saisi d'une carte LIBRE ; `null` partout ailleurs — le mot vient alors du type. */
  titre: string | null;
  survenuLe: string;
  heureConnue: boolean;
  /**
   * 🔴 LOT FRISE-DATE-VIDE-PAR-DEFAUT (migration 323) — `false` = date non saisie : la miniature n'en écrit
   * aucune, comme le carré de la frise. Facultatif : absent ⇒ connue (toutes les cartes d'avant ce lot).
   */
  jourConnu?: boolean;
  source: 'monga' | 'manuelle';
  certitude: 'fiable' | 'a_confirmer' | 'confirmee' | 'ecartee';
}

export interface EtatEcran {
  file: LigneFile[];
  filsTotal: number;              // total de la file (pour dire honnêtement « N affichés sur M »)
  // LOT 4b — FENÊTRE D'ACTIVITÉ : ce que la file ne montre pas, et depuis quand. Annoncé à l'écran, jamais tu.
  fenetreJours: number;
  filsTropAnciens: number;
  // LOT 4b — les échanges CLASSÉS SANS SUITE, pour que le geste soit RÉVERSIBLE depuis l'écran et pas seulement en base.
  sansSuite: LigneSansSuite[];
  sansSuiteTotal: number;
  evenements: CarteEvenement[];
  evenementsTotal: number;
  /**
   * ══ 🔴🔴 LOT RACCOURCI-EVENEMENTS — COMBIEN SONT ENCORE OUVERTS ════════════════════════════════════════════
   *
   * Le raccourci « Événements » de la colonne de la boîte porte ce nombre-là, et non le total : Arno demande
   * « le compteur des événements EN COURS ». Un total de 37 dont 35 sont clos n'annonce aucun travail.
   *
   * 🔴 « OUVERT » SE LIT SUR LA FRISE, par le même SQL que partout ailleurs (`etatParLaFrise`) : la colonne
   * `etat` ne fait plus foi depuis le lot ETAT-PAR-LA-FRISE, et un second critère ici aurait fini par
   * compter autre chose que la liste qu'il ouvre.
   */
  evenementsOuverts: number;
  messagesCaptures: number;       // TOUS les messages capturés, exclus compris — la preuve que la relève a tourné
  messagesExclus: number;         // tenus hors de la file par une règle (jamais supprimés)
  derniereReleveLe: string | null; // fin de la dernière relève réussie, ou null si aucune n'a jamais tourné
  /**
   * LOT VEILLE-VIVE — DATE DU DERNIER MAIL CAPTURÉ. Une autre question que « quand la dernière passe a-t-elle eu
   * lieu » : les mêler dans une phrase unique est ce qui a fait conclure à tort que la relève était arrêtée.
   */
  dernierMailLe: string | null;
  /** LOT 5-VEILLE — de quoi dire si la relève AUTOMATIQUE tourne encore. Voir `etatVeille` dans `ecran.ts`. */
  veille: VeilleReleve;
  /**
   * LOT RATTACHEMENT-2 — ce que la dernière passe automatique a fait APRÈS l'import (adresses, rattachement).
   * Tout à `null` = migration 258 absente, ou aucune passe depuis ce lot : le bandeau se tait. Voir `etatSuite`.
   */
  suite: SuiteVue;
  /**
   * LOT COPIE-SURV — l'état de la COPIE des pièces vers le Drive. `derniere: null` = migration 255 absente, ou aucune
   * passe n'a jamais tourné : le bandeau se tait. Voir `etatCopie`.
   *
   * 🔴 POURQUOI DANS L'ÉCRAN, ET PAS SEULEMENT DANS UNE COMMANDE. Le 26/09/2026 la copie s'est arrêtée sur dix échecs
   * d'affilée alors qu'il restait 24 000 pièces, et AUCUN écran ne le disait : l'arrêt a été découvert par hasard
   * deux heures plus tard. Une fonction qui s'arrête sans le dire est une fonction qu'on croit tourner.
   */
  copie: CopieVue;
}

/** Un échange classé sans suite — assez pour le reconnaître et le rouvrir, rien de plus. */
export interface LigneSansSuite {
  filId: number;
  objet: string | null;
  motif: string | null;
  classeLe: string;        // ISO
  classePar: string | null;
}

/** Combien de lignes au plus par colonne. Le total réel est renvoyé à côté → l'écran ne ment jamais sur ce qu'il montre. */
export const PAGE = 50;

/** Ce qu'il faut connaître pour trancher « qui parle » : nos partenaires internes, et notre propre adresse. */
export interface ContexteExpediteurs {
  partenaires: readonly PartenaireInterne[];
  adresseGestion: string;
  /** La migration 234 est-elle appliquée ? Si non, les mails suivent leur échange, comme avant (cf. `schema.ts`). */
  deplacements: boolean;
  /**
   * LOT ERGO-BOITE-3 — la migration 263 est-elle appliquée ? Si oui, le spam est écarté du poste de tri ; si non, la
   * colonne n'est nommée nulle part et tout se comporte comme avant. Facultatif : un contexte d'avant ce lot vaut
   * « non », ce qui est exactement le comportement d'une base sans la migration.
   */
  spam?: boolean;
  /**
   * LOT BOITE-INTERNE-CORBEILLE — la migration 275 est-elle appliquée ? Si oui, un mail à la corbeille de Gmail
   * est écarté du poste de tri ; si non, la colonne n'est nommée nulle part et le comportement est celui d'avant.
   */
  corbeille?: boolean;
}

interface LigneFileDB {
  fil_id: number; objet: string | null; interlocuteur: string | null; de_adresse: string;
  dernier_le: string; nb_messages: number; nb_pieces: number; attend: boolean;
}

/**
 * LA FILE : les fils À CLASSER qui portent encore au moins un message non exclu.
 *  - « non affectés » : `etat = 'a_classer'` (un fil affecté passe à 'affecte', un fil écarté à la main à 'sans_suite') ;
 *  - « non exclus » : la jointure sur le dernier message non exclu écarte d'elle-même un fil dont TOUS les messages ont
 *    été tenus hors de la file par une règle — sans jamais rien supprimer, et le fil revient si la règle s'éteint.
 */
export async function lireFile(
  fenetreJours: number, ctx: ContexteExpediteurs, limite = PAGE,
  /**
   * ══ 🔴 LOT LISTE-PAGINATION — LE RANG DE LA PAGE DEMANDÉE, à partir de 0 ════════════════════════════════════
   *
   * Arno demande la même pagination « 1–25 sur N · ‹ › » sur TOUTES les listes, « Sans événement » comprise.
   * Jusqu'ici cette liste montrait les 50 premiers et disait honnêtement « 50 affichés sur 523 » — ce qui est
   * honnête mais ne donne AUCUN moyen d'atteindre les 473 autres.
   *
   * 🔴 UN `OFFSET`, ET C'EST LÉGITIME ICI — contrairement à la boîte, où c'est une règle écrite du dépôt de ne
   * jamais en poser. La différence n'est pas de goût : la boîte parcourt 36 580 échanges, où un `OFFSET` profond
   * ferait lire et jeter des dizaines de milliers de lignes ; cette file en porte 523, bornées à la fenêtre
   * d'activité, et son `ORDER BY` est totalement déterministe (`attend`, puis la date, puis l'identifiant) —
   * donc aucune ligne ne peut sauter d'une page à l'autre. C'est aussi ce que fait déjà la file à rattacher.
   *
   * ⚠️ `0` (LE DÉFAUT) REND LA REQUÊTE MOT POUR MOT CELLE D'AVANT CE LOT : `OFFSET 0` ne change ni le plan ni le
   * résultat, et tous les appelants qui ne paginent pas continuent de ne rien demander.
   */
  page = 0,
): Promise<{ lignes: LigneFile[]; total: number; tropAnciens: number }> {
  const adresses = adressesDe(ctx.partenaires);
  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la colonne `integree` n'est NOMMÉE que si la migration 296 est là.
     Sans elle, le compteur retombe mot pour mot sur la règle de nom/taille d'avant ce lot. */
  const avecPieceIntegree = await pieceIntegreeDisponible();
  const { rows } = await query<LigneFileDB>(
    `WITH ${ctesAttente('$3', '$4', ctx.deplacements, ctx.spam === true, ctx.corbeille === true)}
     SELECT f.id::int AS fil_id,
            f.objet_initial AS objet,
            d.interlocuteur, d.de_adresse,
            to_char(d.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            -- Les compteurs disent ce que l'écran MONTRERA : un mail déplacé vers une autre carte n'y est plus.
            (SELECT count(*) FROM gestion_message m2 WHERE m2.fil_id = f.id AND m2.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am2 WHERE am2.message_id = m2.id AND am2.actif)' : ''})::int AS nb_messages,
            (SELECT count(DISTINCT ${sqlCleIdentitePiece('p', await sqlNomAffiche('p'))}) FROM gestion_piece p JOIN gestion_message m3 ON m3.id = p.message_id
              WHERE m3.fil_id = f.id AND m3.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am3 WHERE am3.message_id = m3.id AND am3.actif)' : ''}
              AND ${sqlEstVraiePiece('p', avecPieceIntegree)})::int AS nb_pieces,
            ${ATTEND} AS attend
       FROM gestion_fil f
       JOIN dernier d ON d.fil_id = f.id
       ${jointuresAttente('f.id')}
      WHERE f.etat = 'a_classer' AND d.recu_le >= now() - ($2::int * interval '1 day')
      ORDER BY ${ATTEND} DESC, d.recu_le ASC, f.id ASC
      LIMIT $1 OFFSET $5`,
    [limite, fenetreJours, adresses, ctx.adresseGestion, Math.max(0, page) * limite],
  );
  // DEUX comptes, jamais un seul : ce que la file montre, ET ce qu'elle tait. Le second est affiché à l'écran —
  //   un outil qui cache sans le dire ment ; un outil qui dit ce qu'il ne montre pas reste honnête.
  const { rows: t } = await query<{ dedans: number; trop_anciens: number }>(
    `WITH dernier AS (${cteDernier(ctx.deplacements, ctx.spam === true, ctx.corbeille === true)})
     SELECT count(*) FILTER (WHERE d.recu_le >= now() - ($1::int * interval '1 day'))::int AS dedans,
            count(*) FILTER (WHERE d.recu_le <  now() - ($1::int * interval '1 day'))::int AS trop_anciens
       FROM gestion_fil f JOIN dernier d ON d.fil_id = f.id WHERE f.etat = 'a_classer'`,
    [fenetreJours],
  );
  return {
    lignes: rows.map((r) => ({
      filId: r.fil_id, objet: r.objet,
      // Le libellé d'un partenaire interne PRIME sur le nom porté par le mail : « Service Gestion » se confondait
      //   avec notre propre boîte, « Comptabilité (ADHOC Gestion) » dit qui parle et à quel titre.
      interlocuteur: libelleExpediteur(ctx.partenaires, r.de_adresse, r.interlocuteur),
      dernierLe: r.dernier_le,
      nbMessages: r.nb_messages, nbPieces: r.nb_pieces, attend: r.attend === true,
    })),
    total: t[0]?.dedans ?? 0,
    tropAnciens: t[0]?.trop_anciens ?? 0,
  };
}

/**
 * Les échanges CLASSÉS SANS SUITE, les plus récemment classés d'abord. C'est la contrepartie du geste : ce qu'on écarte
 * doit rester VISIBLE et se rouvrir d'un clic, sinon « classer sans suite » est une suppression déguisée.
 */
export async function lireSansSuite(limite = 20): Promise<{ lignes: LigneSansSuite[]; total: number }> {
  const { rows } = await query<{ fil_id: number; objet: string | null; motif: string | null; classe_le: string; classe_par: string | null }>(
    `SELECT id::int AS fil_id, objet_initial AS objet, sans_suite_motif AS motif,
            to_char(sans_suite_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS classe_le,
            sans_suite_par_libelle AS classe_par
       FROM gestion_fil WHERE etat = 'sans_suite'
      ORDER BY sans_suite_le DESC NULLS LAST, id DESC LIMIT $1`, [limite]);
  const { rows: t } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_fil WHERE etat = 'sans_suite'`);
  return {
    lignes: rows.map((r) => ({ filId: r.fil_id, objet: r.objet, motif: r.motif, classeLe: r.classe_le, classePar: r.classe_par })),
    total: t[0]?.n ?? 0,
  };
}

interface CarteDB {
  evenement_id: number; reference: string; objet: string; demandeur: string | null; adresse_libre: string | null;
  etat: string; ouvert: boolean;
  ouvert_le: string; dernier_echange_le: string | null; nb_fils: number; nb_mails: number; attend: boolean;
  /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — la dernière carte d'étape de la frise de cet événement. */
  etape_type: TypeEtape | null; etape_titre: string | null; etape_survenu_le: string;
  etape_heure_connue: boolean | null; etape_jour_connu?: boolean | null; etape_source: string | null;
  etape_certitude: DerniereEtapeVignette['certitude'] | null;
  /* 🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — la dernière étape VENUE DE MONGA (`source` y vaut forcément
     « monga » : la jointure l'impose, et la recopier ferait une colonne qui ne peut rien dire d'autre). */
  etapem_type: TypeEtape | null; etapem_titre: string | null; etapem_survenu_le: string;
  etapem_heure_connue: boolean | null;
  etapem_certitude: DerniereEtapeVignette['certitude'] | null;
  /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — la dernière écriture de Monga, et ma dernière vue. */
  monga_maj_le: string | null; vu_le: string | null;
  monga_refs: string[] | null;
  categorie: string | null;
  /* 🔴 LOT URGENCE-EVENEMENT, POINT 1 — le degré d'urgence, qui peint la capsule de la carte. */
  urgence: string | null;
  /* 🔴 LOT FILTRES-EVENEMENTS-NEW — les mails REÇUS non lus de cet événement, et la date du plus récent. */
  nb_recus_non_lus: number; nouveaute_le: string | null;
  bien_cle: string | null; bien_adresse: string | null; bien_commune: string | null;
  bien_proprietaire: string | null; bien_locataire: string | null; nb_biens: number;
}

/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA DERNIÈRE ÉTAPE D'UN ÉVÉNEMENT, EN SQL ══════════════════════════════
 *
 * Arno veut, sur la vignette, « une miniature de la DERNIÈRE carte d'étape de sa frise ».
 *
 * 🔴 LES DEUX SOURCES DE LA FRISE, ET LES MÊMES QUE `friseDeLEvenement` : les étapes posées sur l'événement, ET
 * celles des RÉFÉRENCES Monga qui lui sont reliées. Ne lire que les premières ferait une vignette muette sur tous
 * les dossiers Monga — c'est-à-dire ceux qui bougent.
 *
 * 🔴 LES REPÈRES SONT ÉCARTÉS (`estRepere`), et c'est la règle de la frise depuis MONGA-2 : un commentaire, un
 * rappel ou une note ne sont PAS des étapes, ils s'affichent en points. Une miniature qui montrerait « Commentaire
 * Monga » comme dernière carte dirait faux.
 *
 * ⚠️ LA DERNIÈRE PAR DATE, puis par identifiant — exactement l'ordre de `construireFrise`. Une sous-requête
 * latérale `LIMIT 1` plutôt qu'un `GROUP BY` : on ne veut qu'une ligne, et la requête des cartes groupe déjà sur
 * autre chose.
 */
/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — LA DERNIÈRE ÉCRITURE DE MONGA SUR CET ÉVÉNEMENT ══════════════════════
 *
 * Arno : « Quand l'automatisation Monga AJOUTE ou MODIFIE une étape d'un événement (JAMAIS pour un geste
 * manuel) ».
 *
 * 🔴 `source = 'monga'` EST TOUTE LA RÈGLE, et elle est en SQL : une étape posée à la main n'allume rien, quelle
 * que soit la façon dont l'écran la rend. Une règle tenue par l'écran seul serait contournée par la deuxième
 * lecture qui l'oublie.
 *
 * 🔴 `greatest(cree_le, maj_le)` ET NON `survenu_le` : « ajoute OU modifie ». La date de l'étape est celle du
 * FAIT (un rendez-vous de la semaine prochaine) ; ce qu'on veut est le moment où l'automatisation a ÉCRIT.
 *
 * ⚠️ LES ÉTAPES RETIRÉES COMPTENT ICI, et c'est voulu : écarter une étape « à confirmer » est une modification
 * faite par un humain… mais une étape Monga retirée par la relève elle-même reste une nouvelle. Le filtre
 * `statut = 'vif'` de la miniature répond à une autre question — ce qui S'AFFICHE — et les deux ne se mêlent pas.
 */
/**
 * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — LE BIEN DE L'ÉVÉNEMENT, ET QUI GRAVITE AUTOUR ══════════════════════
 *
 * 🔴 LES DEUX AXES, LES MÊMES QUE PARTOUT : un bien est relié à un événement par ses PARTIES déclarées ET par
 * les RATTACHEMENTS confirmés de ses mails. Ne lire qu'un axe ferait une vignette muette sur la moitié des
 * dossiers — l'événement 1 de lot-237, par exemple, n'a aucune partie déclarée.
 *
 * ⚠️ LE PREMIER BIEN PAR CLÉ, ET LE NOMBRE TOTAL À CÔTÉ. Un événement peut en porter plusieurs ; quatre lignes
 * d'adresses dans une liste de dossiers la rendraient illisible. On montre le premier et l'on DIT qu'il y en a
 * d'autres — taire le nombre serait mentir par omission.
 *
 * ⚠️ LE LOCATAIRE « EN PLACE » EST CELUI DONT L'OCCUPATION N'A PAS DE SORTIE — la même règle que l'annuaire
 * (`annuaireRepo`), au mot près. Deux définitions de « en place » auraient fini par désigner deux personnes.
 */
/**
 * ⚠️ `aa.message_id` N'EXISTE QUE DEPUIS LA MIGRATION 234, et la garde du dépôt l'a attrapé : sans elle, nommer
 * la colonne fait tomber TOUT l'écran. Le morceau qui la lit est donc conditionnel, exactement comme les autres
 * lectures de cette table dans ce fichier. Sans la migration, une affectation couvre forcément tout le fil —
 * c'est le comportement d'avant 234 —, et la jointure se réduit à `mm.fil_id = aa.fil_id`.
 */
function sqlBienDeLEvenement(avecMessageId: boolean): string {
  const jointure = avecMessageId
    ? `ON (aa.message_id IS NOT NULL AND mm.id = aa.message_id)
          OR (aa.message_id IS NULL AND mm.fil_id = aa.fil_id)`
    : 'ON mm.fil_id = aa.fil_id';
  return `
  LEFT JOIN LATERAL (
    WITH cles AS (
      SELECT DISTINCT p.cle
        FROM gestion_evenement_partie p
       WHERE p.evenement_id = e.id AND p.sorte = 'lot' AND p.retire_le IS NULL
         AND btrim(coalesce(p.cle, '')) <> ''
      UNION
      SELECT DISTINCT r.cible_cle
        FROM gestion_affectation aa
        JOIN gestion_message mm ${jointure}
        JOIN gestion_rattachement r ON r.message_id = mm.id
       WHERE aa.evenement_id = e.id AND aa.actif
         AND r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
         AND btrim(coalesce(r.cible_cle, '')) <> ''
    )
    SELECT c.cle, lo.adresse, lo.commune,
           nullif(btrim(coalesce(lo.proprietaire_texte, '')), '') AS proprietaire,
           oc.nom AS locataire,
           (SELECT count(*)::int FROM cles) AS nb
      FROM cles c
      LEFT JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = c.cle
      LEFT JOIN LATERAL (
        SELECT l.nom FROM gestion_annuaire_occupation o
          JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
         WHERE o.lot_wippimmo_id = c.cle AND o.sortie IS NULL
         ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1
      ) oc ON true
     ORDER BY c.cle
     LIMIT 1
  ) bi ON true`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — LES MAILS REÇUS NON LUS D'UN ÉVÉNEMENT ═════════════════════════════════

   ARNO (08/10/2026) : « Un événement est “New” s'il a au moins un mail REÇU (pas envoyé par nous) rattaché à lui
   et encore non lu. […] Date de l'activité “New” = date du mail reçu non lu le plus récent de l'événement. »

   🔴 LES MÊMES MAILS QUE PARTOUT AILLEURS DANS CE MODULE : ceux que l'affectation active rattache à l'événement,
   soit par leur ÉCHANGE, soit un par un (`message_id`). C'est mot pour mot la jointure de
   `biensNommesDeLEvenement` et de `sqlBienDeLEvenement` — un troisième rapprochement aurait fini par compter
   d'autres mails que ceux que la carte affiche.

   🔴 `sens = 'recu'` EST LA MOITIÉ QUI COMPTE : « pas envoyé par nous » (Arno). Un brouillon qu'on vient
   d'envoyer ne rend pas un dossier neuf, et sans ce filtre toute réponse de notre part l'aurait fait.

   ⚠️ `exclu_le IS NULL` : un mail tenu hors de la file n'existe pas pour l'écran, il ne peut donc pas le rendre
   neuf. Même condition que les compteurs de la carte.

   ⚠️ AUCUN NON-LU À RAPPROCHER ⇒ LA JOINTURE N'EST MÊME PAS ÉMISE. Sans connexion Google (ou boîte entièrement
   lue), on rend `0` et `NULL` par une constante : payer un LATERAL pour une liste vide serait payer pour rien.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function sqlNouveauteDeLEvenement(avecMessageId: boolean, aucunNonLu: boolean, param: string): string {
  if (aucunNonLu) {
    return `LEFT JOIN LATERAL (SELECT 0::int AS nb, NULL::timestamptz AS le) nl ON true`;
  }
  const jointure = avecMessageId
    ? `ON (an.message_id IS NOT NULL AND mn.id = an.message_id)
          OR (an.message_id IS NULL AND mn.fil_id = an.fil_id
              AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2
                               WHERE a2.message_id = mn.id AND a2.actif))`
    : 'ON mn.fil_id = an.fil_id';
  return `
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT mn.id)::int AS nb, max(mn.recu_le) AS le
      FROM gestion_affectation an
      JOIN gestion_message mn ${jointure}
     WHERE an.evenement_id = e.id AND an.actif
       AND mn.exclu_le IS NULL
       AND mn.sens = 'recu'
       AND mn.id = ANY(${param}::bigint[])
  ) nl ON true`;
}

/**
 * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 4 — LES MISES À JOUR MONGA REMONTENT EN TÊTE ═══════════════════════════
 *
 * Arno (07/10/2026) : « Tant que l'effet est actif pour ce collaborateur, la vignette REMONTE EN PREMIÈRE
 * POSITION de la liste (plusieurs : la plus récente mise à jour d'abord). Une fois vue (clic ou fiche ouverte),
 * elle reprend sa place normale. Mêmes règles par collaborateur qu'au lot précédent. »
 *
 * 🔴 LE TRI EST LE MÊME CALCUL QUE L'EFFET : « la dernière écriture de Monga est postérieure à MA dernière vue ».
 * Un second critère aurait pu allumer la vignette sans la faire remonter, ou l'inverse — et c'est le genre
 * d'écart qu'on ne voit qu'après l'avoir expédié.
 *
 * 🔴 PAR COLLABORATEUR, DONC DANS LE TRI AUSSI : la liste n'est pas dans le même ordre pour deux personnes, et
 * c'est exactement ce qu'Arno demande. Sans la migration 316 — ou appelée sans clé de collaborateur — le critère
 * DISPARAÎT de la requête, et la liste retrouve son ordre d'avant, exactement.
 *
 * ⚠️ IL PASSE AVANT « les traités en dernier » : une mise à jour Monga sur un dossier clos est justement ce
 * qu'on veut voir tout de suite — c'est peut-être une reprise.
 *
 * ⚠️ L'EXPLICATION VIT ICI, EN COMMENTAIRE JAVASCRIPT, ET NON DANS LE LITTÉRAL SQL. Un premier jet l'y avait
 * mise : un bloc `/* … *` + `/` à l'intérieur d'un gabarit n'est pas un commentaire JavaScript, c'est du TEXTE
 * — il partait dans la requête à chaque appel, et il a fait échouer l'épreuve qui lit le SQL émis. Les
 * commentaires de ce fichier qui vivent DANS le SQL sont des `--` d'une ligne, et c'est la bonne mesure.
 */
function triMongaDAbord(avecVues: boolean): string {
  if (!avecVues) return '';
  const vue = `(SELECT v.vu_le FROM gestion_evenement_vu v
                 WHERE v.evenement_id = e.id AND v.compte_cle = $4)`;
  const allumee = `(mg.le IS NOT NULL AND (${vue} IS NULL OR mg.le > ${vue}))`;
  /**
   * ⚠️ LE SECOND CRITÈRE NE VAUT QU'ENTRE VIGNETTES ALLUMÉES, ET C'EST UN DÉFAUT MESURÉ À L'ÉCRAN.
   *
   * Premier jet : `mg.le DESC NULLS LAST` tout court. Essai sur l'écran partagé — l'événement 2, remonté en tête
   * parce qu'allumé, Y RESTAIT APRÈS AVOIR ÉTÉ VU : son `mg.le` récent le faisait passer devant l'événement 1,
   * qui n'a aucune référence Monga reliée (`mg.le` nul). Arno demande l'inverse en toutes lettres : « Une fois
   * vue (clic ou fiche ouverte), elle reprend sa place NORMALE. »
   *
   * 🔴 LE `CASE` LE BORNE AUX ALLUMÉES : éteinte, la date ne pèse plus rien, et les critères d'origine
   * reprennent la main — les traités en dernier, puis ce qui attend, puis la plus ancienne attente.
   */
  return `${allumee} DESC,
               CASE WHEN ${allumee} THEN mg.le END DESC NULLS LAST,
               `;
}

const SQL_DERNIERE_MAJ_MONGA = `
  LEFT JOIN LATERAL (
    SELECT max(greatest(y.cree_le, y.maj_le)) AS le
      FROM gestion_monga_etape y
     WHERE y.source = 'monga'
       AND (y.evenement_id = e.id
            OR y.reference IN (SELECT reference FROM gestion_monga_lien
                                WHERE evenement_id = e.id AND retire_le IS NULL))
  ) mg ON true`;

/**
 * ══ 🔴🔴 LA DERNIÈRE CARTE D'ÉTAPE, ÉCRITE **UNE SEULE FOIS** ═══════════════════════════════════════════════════
 *
 * C'est la MÊME question que la frise d'avancement, et le même ensemble de faits : les étapes vives de
 * l'événement et de ses références MNG reliées, les types qui ne sont pas des cartes exclus, triées par date
 * (lot FRISE-CONSTRUCTIBLE).
 *
 * 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — ET LA CAPSULE MONGA POSE LA MÊME QUESTION, BORNÉE AUX ÉTAPES VENUES
 * DE MONGA. Arno : « la même source de calcul que la frise d'avancement (aucune seconde requête qui recalcule à
 * sa façon) ». D'où un seul texte, deux liaisons — c'est le patron du dépôt (cf. `sqlMailEtoile`).
 *
 * ⚠️ `mongaSeulement` NE CHANGE PAS LE TRI NI LE PÉRIMÈTRE, seulement la provenance retenue : la « dernière étape
 * Monga » reste la dernière PAR DATE, comme la frise les range. Un second tri aurait fait dire à la capsule autre
 * chose que la frise qu'elle résume.
 */
function sqlDerniereEtape(alias: string, mongaSeulement: boolean): string {
  return `
  LEFT JOIN LATERAL (
    SELECT x.type, x.titre, x.survenu_le, x.heure_connue, x.jour_connu, x.source, x.certitude
      FROM gestion_monga_etape x
     WHERE x.statut = 'vif'
       AND x.type NOT IN ('facture','rappel_devis','contact_injoignable','commentaire','note')
       ${mongaSeulement ? "AND x.source = 'monga'" : ''}
       AND (x.evenement_id = e.id
            OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                WHERE evenement_id = e.id AND retire_le IS NULL))
     ORDER BY x.survenu_le DESC, x.id DESC
     LIMIT 1
  ) ${alias} ON true`;
}

const SQL_DERNIERE_ETAPE = sqlDerniereEtape('et', false);
/** 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — la dernière étape VENUE DE MONGA, pour la capsule verte. */
const SQL_DERNIERE_ETAPE_MONGA = sqlDerniereEtape('etm', true);

/**
 * LES CARTES : tous les événements, les OUVERTS d'abord (un événement traité n'attend plus rien), puis ceux qui attendent
 * une réponse, puis du plus ancien au plus récent. `attend_depuis` = la plus ANCIENNE attente parmi ses fils : c'est elle
 * qui décide du rang, pas la date d'ouverture de la carte — une carte ouverte hier mais dont le locataire attend depuis
 * trois semaines doit passer devant.
 */
export async function lireEvenements(
  ctx: ContexteExpediteurs, limite = PAGE, compteCle: string | null = null,
  /**
   * ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — LES MESSAGES NON LUS, VENUS DE GMAIL ════════════════════════════════════
   *
   * ARNO : « “Non lu” = le même état lu / non lu que la boîte de réception. Réutilise ce calcul, sans en créer un
   * nouveau. » Ce calcul est `nonLusGmail`, et il n'est PAS en base : le lu/non lu vit chez Gmail depuis le lot
   * 5-BOITE-2 (« un seul état, commun à l'équipe »). Il est donc INJECTÉ ici plutôt que recalculé — c'est
   * `lireEcran` qui le demande, une fois, et le passe.
   *
   * ⚠️ LISTE VIDE ⇒ AUCUNE CARTE « NEW », et c'est le repli juste : sans connexion Google il n'y a aucun état de
   * lecture, et l'écran ne doit pas déclarer tout le monde neuf. La requête ne nomme alors même pas la jointure.
   */
  messagesNonLus: readonly number[] = [],
): Promise<{ cartes: CarteEvenement[]; total: number; ouverts: number }> {
  /**
   * 🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — SANS LA MIGRATION 316, AUCUNE REQUÊTE NE NOMME LA TABLE ABSENTE, et
   * l'écran est exactement celui d'avant : `vu_le` vaut `null` partout, donc rien ne s'allume (voir `mongaMajLe`).
   */
  const avecVues = (await evenementVuDisponible()) && compteCle !== null;
  /**
   * 🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — LA CATÉGORIE N'EXISTE QUE DEPUIS LA MIGRATION 268. Sans elle, la
   * vignette n'affiche simplement pas de type : aucune requête ne nomme la colonne absente, et l'écran est
   * celui d'avant. Même prudence que partout ailleurs dans ce module.
   *
   * ⚠️ LE MÊME TÉMOIN QUE `gestes.ts` (`evenementQualifieDisponible`), et non un second : la table
   * `gestion_evenement_partie` et les colonnes `categorie`/`urgence` viennent de la MÊME migration (268). Deux
   * témoins pour un seul fait finiraient par se contredire le jour où l'un serait oublié.
   */
  const avecCategorie = await evenementQualifieDisponible();
  /* ⚠️ DÉDOUBLONNÉE ET BORNÉE AUX ENTIERS : la liste vient d'un rapprochement Gmail, et `= ANY(...)` sur des
     valeurs répétées ferait travailler la base pour rien. */
  const nonLus = [...new Set(messagesNonLus.filter((n) => Number.isSafeInteger(n) && n > 0))];
  const { rows } = await query<CarteDB>(
    `WITH ${ctesAttente('$2', '$3', ctx.deplacements, ctx.spam === true, ctx.corbeille === true)},
          messages_deplaces AS (${ctx.deplacements ? CTE_MESSAGES_DEPLACES : 'SELECT NULL::bigint AS evenement_id, NULL::text AS sens, NULL::boolean AS automatique, NULL::timestamptz AS recu_le WHERE false'})
     SELECT e.id::int AS evenement_id, e.reference, e.objet,
            coalesce(nullif(btrim(e.demandeur_nom), ''), e.demandeur_email) AS demandeur,
            e.adresse_libre, e.etat, ${sqlEvenementOuvertParLaFrise('e')} AS ouvert,
            to_char(e.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            -- La dernière activité d'une carte, c'est le plus récent de SES échanges ET des mails qu'on y a déplacés.
            to_char(greatest(max(d.recu_le), max(md.recu_le)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_echange_le,
            count(a.fil_id)::int AS nb_fils,
            ${ctx.deplacements ? `(SELECT count(*) FROM gestion_affectation am
                WHERE am.evenement_id = e.id AND am.actif AND am.message_id IS NOT NULL)::int` : '0'} AS nb_mails,
            ${ATTEND_CARTE} AS attend,
            /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — la dernière carte d'étape, pour la miniature de la vignette. */
            et.type AS etape_type, et.titre AS etape_titre,
            to_char(et.survenu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS etape_survenu_le,
            et.heure_connue AS etape_heure_connue, et.jour_connu AS etape_jour_connu,
            et.source AS etape_source, et.certitude AS etape_certitude,
            /* 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — la dernière étape VENUE DE MONGA : la capsule verte. */
            etm.type AS etapem_type, etm.titre AS etapem_titre,
            to_char(etm.survenu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS etapem_survenu_le,
            etm.heure_connue AS etapem_heure_connue, etm.certitude AS etapem_certitude,
            /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — la dernière ÉCRITURE de Monga (ajout OU modification), et ma
               dernière vue de cet événement. L'écran compare les deux, il ne lit aucun drapeau. */
            to_char(mg.le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS monga_maj_le,
            ${avecVues
    ? `to_char((SELECT v.vu_le FROM gestion_evenement_vu v
                 WHERE v.evenement_id = e.id AND v.compte_cle = $4) AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
    : 'NULL::text'} AS vu_le,
            /* 🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — les références MNG reliées : la vignette « MONGA ». */
            (SELECT array_agg(x.reference ORDER BY x.reference)
               FROM (SELECT DISTINCT reference FROM gestion_monga_lien
                      WHERE evenement_id = e.id AND retire_le IS NULL) x) AS monga_refs,
            -- 🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — le type, et le bien avec ceux qui gravitent autour.
            -- 🔴 LOT URGENCE-EVENEMENT, POINT 1 — et le degre d'urgence, qui peint la capsule du type. Meme
            --    migration, donc meme temoin : avecCategorie. ⚠️ AUCUN ACCENT GRAVE ICI, et des -- d'une ligne :
            --    ce commentaire vit DANS un litteral de gabarit (regle du fichier, cf. triMongaDAbord).
            ${avecCategorie ? 'e.categorie, e.urgence' : 'NULL::text AS categorie, NULL::text AS urgence'},
            -- 🔴 LOT FILTRES-EVENEMENTS-NEW — le statut « New » : combien de mails RECUS non lus, et le plus recent.
            coalesce(nl.nb, 0) AS nb_recus_non_lus,
            to_char(nl.le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nouveaute_le,
            bi.cle AS bien_cle, bi.adresse AS bien_adresse, bi.commune AS bien_commune,
            bi.proprietaire AS bien_proprietaire, bi.locataire AS bien_locataire,
            coalesce(bi.nb, 0) AS nb_biens
       FROM gestion_evenement e
       -- message_id IS NULL : une affectation de MAIL ne compte pas comme un échange rattaché, sans quoi une carte
       --   annoncerait « 3 échanges » là où elle n'en a qu'un et deux mails isolés.
       LEFT JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif${ctx.deplacements ? ' AND a.message_id IS NULL' : ''}
       LEFT JOIN dernier d ON d.fil_id = a.fil_id
       LEFT JOIN messages_deplaces md ON md.evenement_id = e.id
       ${jointuresAttente('a.fil_id')}
       ${SQL_DERNIERE_ETAPE}
       ${SQL_DERNIERE_ETAPE_MONGA}
       ${SQL_DERNIERE_MAJ_MONGA}
       ${sqlBienDeLEvenement(ctx.deplacements)}
       ${sqlNouveauteDeLEvenement(ctx.deplacements, nonLus.length === 0, `$${avecVues ? 5 : 4}`)}
      GROUP BY e.id, et.type, et.titre, et.survenu_le, et.heure_connue, et.jour_connu, et.source, et.certitude, mg.le,
               etm.type, etm.titre, etm.survenu_le, etm.heure_connue, etm.certitude,
               bi.cle, bi.adresse, bi.commune, bi.proprietaire, bi.locataire, bi.nb,
               nl.nb, nl.le
      /* 🔴 LOT ETAT-PAR-LA-FRISE — LES OUVERTS D'ABORD, et « ouvert » se lit sur la frise : un evenement dont
         la carte Cloture a ete retiree remonte desormais dans la file, comme il le doit. */
      ORDER BY ${triMongaDAbord(avecVues)}NOT ${sqlEvenementOuvertParLaFrise('e')} ASC,
               ${ATTEND_CARTE} DESC,
               coalesce(min(d.recu_le) FILTER (WHERE ${ATTEND}), min(md.recu_le), e.ouvert_le) ASC,
               e.id ASC
      LIMIT $1`,
    /* ⚠️ LA LISTE DES NON-LUS N'EST PASSÉE QUE SI LA REQUÊTE LA NOMME : quand elle est vide, la jointure est une
       constante et un quatrième (ou cinquième) paramètre non lié ferait échouer la requête entière. */
    [
      ...(avecVues
        ? [limite, adressesDe(ctx.partenaires), ctx.adresseGestion, compteCle]
        : [limite, adressesDe(ctx.partenaires), ctx.adresseGestion]),
      ...(nonLus.length === 0 ? [] : [nonLus]),
    ],
  );
  /* 🔴 LOT RACCOURCI-EVENEMENTS — le total ET les ouverts, dans la MÊME lecture : deux requêtes pour deux
     comptes du même ensemble auraient pu se contredire le temps d'une écriture entre les deux. */
  const { rows: t } = await query<{ n: number; ouverts: number }>(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE ${sqlEvenementOuvertParLaFrise('e')})::int AS ouverts
       FROM gestion_evenement e`);
  return {
    cartes: rows.map((r) => ({
      evenementId: r.evenement_id, reference: r.reference, objet: r.objet, demandeur: r.demandeur,
      adresseLibre: r.adresse_libre,
      /* 🔴 LOT ETAT-PAR-LA-FRISE — « Traité » vient de la frise, les deux autres de la colonne. Une seule
         fonction assemble les trois, pour toute l'application. */
      etat: etatAffiche(r.etat, r.ouvert),
      ouvertLe: r.ouvert_le, dernierEchangeLe: r.dernier_echange_le,
      nbFils: r.nb_fils, nbMailsDeplaces: r.nb_mails, attend: r.attend === true,
      derniereEtape: r.etape_type === null ? null : {
        type: r.etape_type, titre: r.etape_titre, survenuLe: r.etape_survenu_le,
        heureConnue: r.etape_heure_connue === true,
        jourConnu: r.etape_jour_connu !== false,
        source: r.etape_source === 'monga' ? 'monga' : 'manuelle',
        certitude: r.etape_certitude ?? 'fiable',
      },
      /**
       * 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — `null` = aucune étape venue de Monga, et c'est le cas
       * ordinaire : la capsule ne s'affiche alors pas. Une capsule « Monga » sans étape ne dirait rien.
       */
      derniereEtapeMonga: r.etapem_type === null || r.etapem_type === undefined ? null : {
        type: r.etapem_type, titre: r.etapem_titre, survenuLe: r.etapem_survenu_le,
        heureConnue: r.etapem_heure_connue === true,
        source: 'monga' as const,
        certitude: r.etapem_certitude ?? 'fiable',
      },
      mongaMajLe: r.monga_maj_le, vuLe: r.vu_le,
      /* ⚠️ `null` DE POSTGRES ⇒ TABLEAU VIDE : l'écran n'a pas à distinguer « aucune référence » d'une absence. */
      mongaRefs: r.monga_refs ?? [],
      categorie: r.categorie,
      urgence: r.urgence,
      nbRecusNonLus: Number(r.nb_recus_non_lus ?? 0),
      /* ⚠️ `null` QUAND IL N'Y EN A AUCUN : c'est ce champ qui porte le statut « New », et `max()` d'un ensemble
         vide rend bien `NULL`. Une date par défaut aurait rendu toutes les cartes neuves. */
      nouveauteLe: r.nouveaute_le,
      bien: r.bien_cle === null ? null : {
        cle: r.bien_cle, adresse: r.bien_adresse, commune: r.bien_commune,
        proprietaire: r.bien_proprietaire, locataire: r.bien_locataire,
      },
      nbBiens: Number(r.nb_biens ?? 0),
    })),
    total: t[0]?.n ?? 0,
    ouverts: t[0]?.ouverts ?? 0,
  };
}

/**
 * Repères d'HONNÊTETÉ de l'écran : combien de messages ont été capturés, combien sont tenus hors de la file, et quand la
 * dernière relève a réussi. Sans eux, une page vide est ambiguë — « rien n'est arrivé » et « on n'a jamais relevé » se
 * ressemblent, et c'est exactement la confusion que le journal des passes existe pour lever.
 */
export async function lireReperes(): Promise<{
  messagesCaptures: number; messagesExclus: number; derniereReleveLe: string | null; dernierMailLe: string | null;
}> {
  const { rows } = await query<{ captures: number; exclus: number }>(
    `SELECT count(*)::int AS captures, count(exclu_le)::int AS exclus FROM gestion_message`);
  const { rows: r } = await query<{ le: string | null }>(
    `SELECT to_char(max(termine_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
       FROM gestion_releve_run WHERE resultat = 'ok'`);
  /**
   * LOT VEILLE-VIVE — LA DATE DU DERNIER MAIL CAPTURÉ, au chargement de la page.
   *
   * 🔴 ELLE RÉPOND À UNE AUTRE QUESTION QUE L'HEURE DE LA DERNIÈRE PASSE, et c'est pour les avoir mêlées que l'écran
   * était illisible : un dimanche calme donne une passe par minute et pas un mail pendant six heures. Le battement
   * la rafraîchit ensuite (route `empreinte`) ; ici on la donne pour que l'en-tête soit juste AVANT le premier
   * battement, c'est-à-dire pendant les trente premières secondes.
   *
   * ⚠️ PAR L'IDENTIFIANT LE PLUS GRAND, pas par `max(recu_le)` : la clé primaire est indexée, la date non.
   */
  const { rows: m } = await query<{ le: string | null }>(
    `SELECT to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
       FROM gestion_message ORDER BY id DESC LIMIT 1`);
  return {
    messagesCaptures: rows[0]?.captures ?? 0,
    messagesExclus: rows[0]?.exclus ?? 0,
    derniereReleveLe: r[0]?.le ?? null,
    dernierMailLe: m[0]?.le ?? null,
  };
}

/**
 * LOT 5-VEILLE — LA DERNIÈRE PASSE AUTOMATIQUE, et elle seule.
 *
 * 🔴 `declencheur = 'planifie'` : ni « manuel » (un clic), ni « rattrapage » (une opération d'historique). C'est toute
 * la question que l'écran doit pouvoir poser — « l'ordonnanceur tourne-t-il encore ? » — et à laquelle un clic humain
 * répondrait faussement oui.
 *
 * 🔴 ON PREND LA DERNIÈRE PASSE TERMINÉE, RÉUSSIE OU NON. Ne regarder que les réussites masquerait exactement le cas
 * qu'il faut voir : un ordonnanceur qui tourne et qui échoue à chaque tour.
 *
 * ⚠️ Les lignes « en_cours » sont écartées : une passe commencée il y a deux secondes n'est pas encore une preuve, et
 * une passe abandonnée par un plantage brutal resterait « en_cours » pour toujours — elle ne doit pas éteindre
 * l'alerte à elle seule.
 */
export async function lireDernierePasseAuto(): Promise<{ le: string | null; resultat: 'ok' | 'erreur' | null; erreur: string | null }> {
  const { rows } = await query<{ le: string; resultat: 'ok' | 'erreur'; erreur: string | null }>(
    `SELECT to_char(termine_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, resultat, erreur
       FROM gestion_releve_run
      WHERE declencheur = 'planifie' AND resultat IN ('ok', 'erreur') AND termine_le IS NOT NULL
      ORDER BY termine_le DESC
      LIMIT 1`);
  const r = rows[0];
  return r ? { le: r.le, resultat: r.resultat, erreur: r.erreur } : { le: null, resultat: null, erreur: null };
}

/**
 * LOT RATTACHEMENT-2 — CE QUE LA DERNIÈRE PASSE AUTOMATIQUE A FAIT *APRÈS* AVOIR RELEVÉ LE COURRIER.
 *
 * ⚠️ LU À PART, et surtout PAS ajouté au SELECT de `lireDernierePasseAuto` : celui-ci nomme trois colonnes qui
 * existent depuis toujours, et y glisser une colonne de la migration 258 ferait échouer la requête — donc perdre
 * l'alerte de veille elle-même — le temps que la migration soit appliquée. Même précaution que pour
 * `lireToleranceVeille`, et pour la même raison.
 *
 * ⚠️ MIGRATION 258 ABSENTE ⇒ TOUT À `null`, ce qui veut dire « on ne sait pas » et non « tout va bien » : le bandeau
 * se tait alors, il ne rassure pas.
 */
export async function lireSuiteDernierePasse(): Promise<SuiteVue> {
  if (!await suiteReleveDisponible()) return { resultat: null, detail: null, ms: null };
  try {
    const { rows } = await query<{ r: 'ok' | 'erreur' | 'ignore' | null; d: string | null; ms: number | null }>(
      `SELECT suite_resultat AS r, suite_detail AS d, suite_ms AS ms
         FROM gestion_releve_run
        WHERE declencheur = 'planifie' AND resultat IN ('ok', 'erreur') AND termine_le IS NOT NULL
        ORDER BY termine_le DESC
        LIMIT 1`);
    const r = rows[0];
    return r ? { resultat: r.r, detail: r.d, ms: r.ms } : { resultat: null, detail: null, ms: null };
  } catch {
    return { resultat: null, detail: null, ms: null }; // le bandeau se tait plutôt que d'empêcher l'écran de s'afficher
  }
}

/**
 * LOT 5-VEILLE — combien d'intervalles de retard avant de crier. RÉGLAGE (migration 249), jamais un chiffre en dur.
 *
 * ⚠️ Lu À PART, et surtout PAS ajouté au SELECT de `chargerConfigGestion` : celui-ci retombe sur un jeu de colonnes
 * réduit dès qu'UNE colonne manque (42703), ce qui ferait perdre, le temps que la migration soit appliquée, tous les
 * réglages des migrations 230 à 241 — intervalle de relève compris, c'est-à-dire l'étalon même de cette alerte.
 */
export async function lireToleranceVeille(): Promise<number> {
  if (!await reglageVeilleDisponible()) return VEILLE_INTERVALLES_DEFAUT;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT veille_releve_intervalles AS n FROM gestion_config WHERE id = 1`);
    return toleranceVeilleValide(rows[0]?.n);
  } catch {
    return VEILLE_INTERVALLES_DEFAUT; // le réglage n'est pas la fonctionnalité : l'écran s'affiche quand même
  }
}

/**
 * LES MESSAGES NON LUS, tels que Gmail les connaît. LECTURE SEULE, et silencieuse en cas d'échec.
 *
 * 🔴 C'EST LA MÊME FONCTION QUE LA BOÎTE APPELLE (`nonLusGmail`), avec les mêmes dépendances réelles : le gras de
 * la liste des échanges et la pastille « New » d'un événement ne peuvent donc pas se contredire.
 */
async function lireMessagesNonLus(): Promise<number[]> {
  try {
    const { depsNonLusGmail, nonLusGmail } = await import('./lectureGmailReel');
    const nl = await nonLusGmail(depsNonLusGmail());
    return nl.disponible ? [...nl.messages] : [];
  } catch (e) {
    console.error('[gestion/ecran] non-lus Gmail illisibles — aucune carte « New »', e);
    return [];
  }
}

/** L'état complet de l'écran, en une fois. LECTURE SEULE de bout en bout. */
export async function lireEcran(limite = PAGE, pageFile = 0, compteCle: string | null = null): Promise<EtatEcran> {
  // La fenêtre d'activité ET la liste des partenaires internes viennent de la BASE, jamais du code. Les deux sont lues
  //   d'abord : l'attente ne se calcule pas sans savoir qui est qui (lot 4d).
  const [config, partenaires, deplacements, spam, corbeille] = await Promise.all([
    chargerConfigGestion(), lirePartenairesInternes(), deplacementsDeMailsDisponibles(), spamDisponible(),
    corbeilleGmailDisponible(),
  ]);
  const ctx: ContexteExpediteurs = {
    partenaires, adresseGestion: config.adresseGestion, deplacements, spam, corbeille,
  };
  /**
   * ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — LE NON-LU, DEMANDÉ UNE FOIS, ICI ═══════════════════════════════════════
   *
   * ARNO : « “Non lu” = le même état lu / non lu que la boîte de réception. Réutilise ce calcul, sans en créer un
   * nouveau. » Ce calcul est `nonLusGmail`, et il n'est PAS en base : le lu/non lu vit chez Gmail depuis le lot
   * 5-BOITE-2. `lireEvenements` ne peut donc pas le lire tout seul — on le lui INJECTE.
   *
   * ⚠️ L'IMPORT EST PARESSEUX, ET CE N'EST PAS UN ORNEMENT : `lectureGmailReel` tire le client Google et ses
   * jetons. Le charger au MODULE ferait payer cette dépendance à tous les appelants de `fileRepo` — y compris les
   * scripts CLI qui n'ont rien à demander à Gmail.
   *
   * ⚠️ UN ÉCHEC SE TAIT, ET REND « AUCUN NON-LU ». Sans connexion Google il n'y a aucun état de lecture à lire
   * (règle du lot 5-BOITE-2) : aucune carte n'est alors « New ». Faire tomber TOUT l'écran parce que Gmail n'a
   * pas répondu serait payer une pastille au prix de la page.
   */
  const messagesNonLus = await lireMessagesNonLus();
  const [file, evenements, reperes, sansSuite, auto, tolerance, suite, copie] = await Promise.all([
    // 🔴 LOT LISTE-PAGINATION — le rang de page ne concerne QUE la file : les cartes, les repères et les échanges
    //   sans suite ne sont pas paginés, et leur passer un rang les ferait mentir.
    lireFile(config.fenetreActiviteJours, ctx, limite, pageFile),
    lireEvenements(ctx, PAGE, compteCle, messagesNonLus),
    lireReperes(), lireSansSuite(),
    lireDernierePasseAuto(), lireToleranceVeille(), lireSuiteDernierePasse(), lireEtatCopie(),
  ]);
  return {
    file: file.lignes, filsTotal: file.total,
    fenetreJours: config.fenetreActiviteJours, filsTropAnciens: file.tropAnciens,
    // La CADENCE ATTENDUE vient du même réglage que la relève elle-même : l'alerte et la boucle ne peuvent pas
    //   diverger, et changer `releve_continue_secondes` déplace les deux du même coup.
    veille: {
      derniereLe: auto.le, resultat: auto.resultat, erreur: auto.erreur,
      intervalleS: config.releveContinueSecondes, toleranceIntervalles: tolerance,
    },
    suite,
    copie,
    sansSuite: sansSuite.lignes, sansSuiteTotal: sansSuite.total,
    evenements: evenements.cartes, evenementsTotal: evenements.total,
    evenementsOuverts: evenements.ouverts,
    ...reperes,
  };
}
