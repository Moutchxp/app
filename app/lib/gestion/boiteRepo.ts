/**
 * MODULE « GESTION » — LOT 5a : LA BOÎTE MAIL. Lecture SEULE (aucun INSERT/UPDATE/DELETE dans ce fichier).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE. La file du poste de tri ne montre que les échanges des 30 derniers jours encore à
 * classer : 442 sur 17 231, soit 2,6 %. Le reste est compté, annoncé — et inatteignable. Or la boîte est faite pour
 * être LUE en entier, comme on lit sa messagerie : tout le courrier, du plus récent au plus ancien, sans condition.
 *
 * 🔴 CE FICHIER NE REMPLACE RIEN. `fileRepo.ts` (le poste de tri) n'est pas touché : sa fenêtre de 30 jours, son
 * compteur d'échanges plus anciens et ses gestes restent exactement ce qu'ils étaient. Les deux lectures cohabitent
 * parce qu'elles répondent à deux questions différentes : « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 PAGINATION PAR CURSEUR, ET PAS PAR `OFFSET`. Sur 17 231 échanges, `OFFSET 10000` oblige PostgreSQL à produire et
 * jeter dix mille lignes avant de rendre la page — le coût grandit avec la profondeur, et deux pages consécutives
 * peuvent se chevaucher ou sauter une ligne si un message arrive entre les deux. Le curseur `(date, identifiant)` n'a
 * aucun de ces deux défauts : il désigne un POINT dans l'ordre, pas un rang.
 *
 * 🔴 COMMENT LA REQUÊTE RESTE RAPIDE — et pourquoi elle n'est pas écrite comme on l'écrirait spontanément. Trier des
 * échanges par « date du dernier message » demande un `max()` par échange. La forme évidente (`DISTINCT ON (fil_id) …
 * ORDER BY fil_id, recu_le DESC`) calcule ce maximum pour LES 17 231 ÉCHANGES, puis en jette 17 201 : mesuré à 42 ms
 * par page, avec un balayage complet de `gestion_message`. On prend donc le problème à l'envers : on parcourt les
 * MESSAGES du plus récent au plus ancien (index `gestion_message_recu_idx`) et on ne garde que ceux qui sont le
 * DERNIER de leur échange (`NOT EXISTS`, servi par `gestion_message_attente_idx`). L'ordre des messages EST alors
 * l'ordre des échanges, le `LIMIT` arrête le parcours, et rien n'est calculé pour les pages qu'on ne demande pas.
 * MESURÉ sur cluster jetable au volume d'arrivée (56 000 messages, 17 231 échanges, 2 400 affectations) :
 * **0,67 ms par page**, y compris à 300 jours de profondeur, sans un seul balayage séquentiel. Aucun index à créer :
 * les deux qui servent existent depuis la migration 228.
 */
import { query } from '../db/client';
import { autoImposeParEtiquette, type Etiquette } from './ecranUrl';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';
import { corbeilleDisponible } from './schema';

/** Combien d'échanges par page. Assez pour remplir un écran de téléphone sans faire attendre. */
export const PAGE_BOITE = 30;

/** Extrait BRUT rapporté du dernier message. Généreux à dessein : l'écran y retire l'historique cité avant d'afficher. */
const LONGUEUR_EXTRAIT = 600;

/**
 * Le curseur : le dernier échange rendu. `null` = première page. Les DEUX champs comptent — la date seule ne suffit
 * pas : deux échanges peuvent porter exactement le même instant, et la pagination en sauterait un ou le rendrait deux
 * fois. L'identifiant tranche, et il est unique.
 */
export interface CurseurBoite {
  /** Date du dernier message de l'échange précédent, en ISO. */
  dernierLe: string;
  /** Identifiant de cet échange. Rendu en CHAÎNE : `pg` rend les `bigint` ainsi, et un identifiant n'est pas un nombre. */
  filId: string;
}

/** Une ligne de la boîte, telle que l'écran l'affiche. */
export interface LigneBoite {
  filId: number;
  /** Objet de l'échange, NON nettoyé ici (l'écran applique `nettoyerObjet`, comme partout ailleurs). */
  objet: string | null;
  /** Le correspondant : jamais nous. Voir `SQL_INTERLOCUTEUR`. */
  interlocuteur: string | null;
  /** Sens du DERNIER message — l'écran dit « Vous : … » quand c'est nous qui avons écrit en dernier. */
  dernierSens: 'recu' | 'envoye';
  dernierLe: string;
  extrait: string | null;
  nbMessages: number;
  /** Messages LISIBLES aujourd'hui (non écartés par une règle). `0` = tout l'échange est du courrier automatique. */
  nbLisibles: number;
  aPiece: boolean;
  /** Référence `GES-…` de la carte si l'échange y est affecté, sinon `null`. */
  reference: string | null;
  /** L'échange a-t-il été classé sans suite ? L'écran le DIT : la boîte montre tout, elle n'efface rien. */
  sansSuite: boolean;
}

export interface PageBoite {
  lignes: LigneBoite[];
  /** Curseur à renvoyer pour la page suivante. `null` = il n'y a plus rien après. */
  suivant: CurseurBoite | null;
  /** Nombre TOTAL d'échanges de la boîte. Calculé à part, et seulement à la première page. */
  total: number | null;
}

/**
 * LE CORRESPONDANT, ET POURQUOI CE N'EST PAS SIMPLEMENT L'EXPÉDITEUR DU DERNIER MESSAGE. 70 % du flux est SORTANT :
 * prendre l'expéditeur du dernier message afficherait « gestion@criterimmo.fr » sur les deux tiers des lignes, ce qui
 * ne renseigne sur rien. On cherche donc le dernier message REÇU de l'échange — la personne d'en face. S'il n'y en a
 * aucun (échange où nous n'avons fait qu'écrire), on retombe sur les DESTINATAIRES du dernier message : là encore,
 * c'est l'autre partie.
 */
const SQL_INTERLOCUTEUR = `
  LEFT JOIN LATERAL (
    SELECT r.de_adresse, r.de_nom
      FROM gestion_message r
     WHERE r.fil_id = p.fil_id AND r.sens = 'recu'
     ORDER BY r.recu_le DESC, r.id DESC
     LIMIT 1
  ) i ON true`;

interface LigneDB {
  fil_id: string;
  objet: string | null;
  interlocuteur: string | null;
  /** Adresse de l'interlocuteur (dernier message REÇU), ou `null` si l'échange ne contient que des envois. */
  interlocuteur_adresse: string | null;
  dernier_sens: string;
  dernier_le: string;
  extrait: string | null;
  nb_messages: number;
  nb_lisibles: number;
  a_piece: boolean;
  reference: string | null;
  sans_suite: boolean;
}

/**
 * LOT 5-FUSION — LES ÉTIQUETTES DE LA BOÎTE, côté base.
 *
 * 🔴 CHAQUE ÉTIQUETTE EST UN FILTRE, JAMAIS UNE COLONNE. Rien n'est écrit nulle part : « Envoyés » ou « Sans suite »
 * se DÉRIVENT à la lecture, exactement comme « attend une réponse » depuis le lot 2. Une étiquette stockée mentirait
 * dès le message suivant — et il faudrait alors la rattraper à chaque capture, à chaque déplacement, à chaque
 * classement. Ici, changer l'état d'un échange change son étiquette sans qu'aucun code ne s'en occupe.
 *
 * 🔴 LE FILTRE ENTRE DANS LE CTE `page`, PAS APRÈS. C'est ce qui garde la requête rapide : il restreint le parcours
 * AVANT que le `LIMIT` compte ses trente lignes. Posé dans le `SELECT` final, il ferait lire trente échanges pour
 * n'en garder que deux, et la page suivante repartirait du mauvais endroit.
 *
 * ⚠️ UN SEUL paramètre lié supplémentaire, toujours `$4`, et seulement pour les deux étiquettes qui en ont besoin :
 * PostgreSQL REFUSE une requête à qui l'on passe plus de paramètres qu'elle n'en utilise. Voir `parametresEtiquette`.
 */
const ETIQUETTE_TOUT: Etiquette = { sorte: 'reception', evenementId: null };

/**
 * LOT 5-BOITE-3 — L'ÉCHANGE EST-IL À LA CORBEILLE ? La règle, écrite UNE fois, et entièrement DÉRIVÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 « EN CORBEILLE » = le geste est POSTÉRIEUR OU ÉGAL au dernier message. Comme `m` EST le dernier message de son
 * échange (prédicat du CTE `page`), la comparaison se fait sur lui — et c'est ce qui donne gratuitement le
 * comportement de Gmail : UN NOUVEAU MESSAGE FAIT REVENIR L'ÉCHANGE dans sa boîte, tout seul, sans qu'une seule
 * ligne soit écrite nulle part. Pas de rattrapage à la relève, rien qui puisse se désynchroniser.
 *
 * ⚠️ `>=` ET NON `>` : deux messages peuvent porter le même instant à la seconde près, et un geste fait dans la même
 * seconde que l'arrivée d'un message doit tenir — sinon l'échange ressortirait aussitôt, sans explication.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const SQL_EN_CORBEILLE = `EXISTS (SELECT 1 FROM gestion_fil fc
                                   WHERE fc.id = m.fil_id AND fc.corbeille_le IS NOT NULL
                                     AND fc.corbeille_le >= m.recu_le)`;

function sqlEtiquette(e: Etiquette, corbeille: boolean): string {
  switch (e.sorte) {
    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
     * 🔴 UNE SEULE BOÎTE PAR ÉCHANGE — décision d'Arno du 25/09/2026, 17h43. Elle REMPLACE la règle du lot 5-BOITE
     * (« au moins un message reçu »), qui laissait un échange mixte dans les DEUX étiquettes.
     *
     * LE DERNIER MESSAGE DÉCIDE, et lui seul : dernier message REÇU → Réception ; dernier message ENVOYÉ →
     * Envoyés. Jamais les deux. L'échange BASCULE d'une boîte à l'autre à chaque nouveau message — on répond, il
     * passe dans Envoyés ; l'interlocuteur revient, il repasse en Réception. Rien n'est perdu au passage :
     * l'historique complet reste dans la conversation, qui s'ouvre des deux côtés.
     *
     * CE QUI REND CE FILTRE AUSSI COURT. `m` EST DÉJÀ le dernier message de son échange : c'est le prédicat
     * « aucun message plus récent » du CTE `page` (voir `sqlPageBoite`) qui transforme un parcours de messages en
     * parcours d'échanges. Il n'y a donc RIEN à chercher — le sens de `m` est la réponse. Écrire un EXISTS ici
     * referait, plus cher, un travail déjà fait.
     *
     * ⚠️ « DERNIER » SUIT CE QUE LA LISTE MONTRE. Quand le courrier automatique est masqué (le cas par défaut),
     * `m` est le dernier message LISIBLE ; quand on l'affiche, c'est le dernier tout court. L'étiquette suit donc
     * toujours le message affiché en aperçu sur la ligne — les deux ne peuvent pas se contredire à l'écran.
     *
     * 🔴 « NOUS », C'EST `gestion_config.adresse_gestion`, ET RIEN D'AUTRE. `sens` porte déjà exactement cette
     * règle (`sensDuMessage`, capture.ts:266-268) : un collègue de @sansvisavis.com qui écrit à gestion@ est un
     * message REÇU. Confondre « interne » et « nous » ferait disparaître de la boîte les demandes des collègues.
     *
     * MESURÉ sur la vraie base, avant → après : Réception 8 463 → 5 278, Envoyés 32 736 → 4 831. Les deux boîtes
     * sont désormais DISJOINTES, et leur somme (10 109) est exactement le nombre d'échanges portant au moins un
     * message lisible.
     * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
     */
    case 'reception':
      return `AND m.sens = 'recu'`;
    // « À classer » = la règle du poste de tri : échange encore à classer, et dernier message lisible dans la fenêtre
    //   d'activité. `m` EST ce dernier message lisible (le parcours ne garde que lui), donc le test de date porte sur
    //   la même date que `lireFile`. $4 = la fenêtre en jours, lue en base comme là-bas.
    //   MESURÉ le 24/09/2026 sur la vraie base : 430 échanges des deux côtés, à l'unité.
    //
    //   ⚠️ UNE NUANCE, ET IL FAUT LA CONNAÎTRE. `lireFile` cherche le dernier message ENCORE ATTACHÉ à l'échange
    //   (un mail déplacé vers une carte n'y compte plus) ; le parcours de la boîte, lui, cherche le dernier message
    //   de l'échange, déplacé ou non — c'est le parcours du lot 5a, commun à TOUTES les étiquettes, et le rendre
    //   différent pour une seule d'entre elles créerait l'incohérence qu'on veut éviter. Écart mesuré aujourd'hui :
    //   0 échange (0 mail déplacé actif en base).
    //
    //   🔴 ET SURTOUT : L'ÉCRAN N'EMPRUNTE PAS CE CHEMIN. Sous l'étiquette « À classer », le plein écran rend le
    //   POSTE DE TRI lui-même (voir `PleinEcranBoite`), pas cette lecture. Les deux ne peuvent donc pas se
    //   contredire devant l'utilisateur. Ce filtre ne sert qu'à qui appellerait la route directement.
    case 'a_classer':
      return `AND m.recu_le >= now() - ($4::int * interval '1 day')
          AND EXISTS (SELECT 1 FROM gestion_fil f0 WHERE f0.id = m.fil_id AND f0.etat = 'a_classer')`;
    // « Envoyés » = le PENDANT EXACT de Réception : l'échange dont le dernier message est parti de chez nous. Même
    //   raison d'être aussi court — `m` est déjà ce dernier message. (Avant ce lot : « au moins un message envoyé »,
    //   ce qui mettait dans Envoyés les 32 736 échanges où nous avions répondu une fois, il y a deux ans.)
    case 'envoyes':
      return `AND m.sens = 'envoye'`;
    case 'sans_suite':
      return `AND EXISTS (SELECT 1 FROM gestion_fil f0 WHERE f0.id = m.fil_id AND f0.etat = 'sans_suite')`;
    // « Courrier automatique » = les échanges dont AUCUN message n'est lisible. Même définition que le compteur
    //   `comptesBoite`, pour que l'étiquette et son nombre ne racontent jamais deux histoires différentes.
    case 'automatique':
      return `AND NOT EXISTS (SELECT 1 FROM gestion_message ml WHERE ml.fil_id = m.fil_id AND ml.exclu_le IS NULL)`;
    // LOT 5e — « Brouillons » ne sort PAS de `gestion_message` : un brouillon n'est pas un message reçu. L'écran le
    //   sert depuis `gestion_brouillon`, et ne demande donc jamais cette liste-ci. Le prédicat impossible est un
    //   garde-fou : si quelqu'un appelait quand même, il rendrait une liste VIDE plutôt qu'une liste FAUSSE.
    case 'brouillons':
      return 'AND false';
    // LOT 5-BOITE-3 — « Corbeille » : le seul endroit qui MONTRE ce que les autres écartent. Le filtre y est donc la
    //   forme POSITIVE exacte de l'exclusion posée sur toutes les autres étiquettes — écrites au même endroit, elles
    //   ne peuvent pas diverger et laisser un échange invisible partout.
    case 'corbeille':
      // ⚠️ SANS LA MIGRATION 251, ON NE NOMME PAS LA COLONNE — pas même ici. Quelqu'un peut arriver sur cette
      //   étiquette par une adresse enregistrée : nommer une colonne absente ferait échouer TOUTE la boîte, pas
      //   seulement cette liste. Le prédicat impossible rend une liste VIDE, comme pour « Brouillons ».
      return corbeille ? `AND ${SQL_EN_CORBEILLE}` : 'AND false';
    // Une CARTE : ses échanges rattachés. `message_id IS NULL` — une affectation de MAIL isolé n'est pas un échange
    //   rattaché, et la compter ici ferait apparaître dans l'étiquette un échange qui appartient à une autre carte.
    case 'carte':
      return `AND EXISTS (SELECT 1 FROM gestion_affectation a0
                            WHERE a0.fil_id = m.fil_id AND a0.actif AND a0.message_id IS NULL
                              AND a0.evenement_id = $4::bigint)`;
  }
}

/** Le paramètre `$4` que l'étiquette réclame — au plus un, jamais un de trop (voir l'encadré ci-dessus). */
export function parametresEtiquette(e: Etiquette, fenetreJours: number): number[] {
  if (e.sorte === 'a_classer') return [fenetreJours];
  if (e.sorte === 'carte') return [e.evenementId ?? 0];
  return [];
}

/**
 * LE SQL DE LA PAGE, EXTRAIT pour être EXPLAINABLE TEL QUEL. La règle du dépôt est qu'un plan se contrôle sur la
 * requête RÉELLEMENT ÉMISE, jamais sur une copie simplifiée — une copie dérive au premier changement, et la mesure
 * ment alors sans prévenir. `lireBoiteMail` et le banc d'épreuve appellent donc la MÊME fonction.
 * Paramètres liés : $1 = date du curseur, $2 = identifiant du curseur, $3 = nombre de lignes à lire.
 */
export function sqlPageBoite(
  inclureAutomatiques: boolean, etiquette: Etiquette = ETIQUETTE_TOUT, corbeille = false,
): string {
  // Le filtre s'applique AUX DEUX ÉTAGES du parcours (le message candidat, et le « y a-t-il plus récent ? ») : les
  //   dissocier ferait sortir un échange dont le dernier message est écarté, avec l'avant-dernier comme aperçu.
  const filtreM = inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL';
  const filtreM2 = inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL';
  const filtreEtiquette = sqlEtiquette(etiquette, corbeille);
  // LOT 5-BOITE-3 — TOUTES les autres étiquettes écartent la corbeille, et la corbeille seule la montre. Sans la
  //   migration 251, `corbeille` est faux : la colonne n'est PAS nommée — la nommer ferait échouer toute la boîte,
  //   pas seulement le geste nouveau.
  const filtreCorbeille = !corbeille || etiquette.sorte === 'corbeille' ? '' : `AND NOT ${SQL_EN_CORBEILLE}`;
  return `WITH page AS (
       SELECT m.fil_id, m.id AS message_id, m.recu_le, m.sens, m.de_adresse, m.de_nom, m.destinataires,
              left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait
         FROM gestion_message m
        WHERE (m.recu_le, m.fil_id) < ($1::timestamptz, $2::bigint)
          ${filtreM}
          ${filtreEtiquette}
          ${filtreCorbeille}
          -- ⚠️ « ce message est le DERNIER de son échange ». C'est CE prédicat qui transforme un parcours de messages
          --    en parcours d'échanges, et qui permet au LIMIT d'arrêter le travail. Servi par l'index (fil_id, recu_le).
          AND NOT EXISTS (
                SELECT 1 FROM gestion_message m2
                 WHERE m2.fil_id = m.fil_id ${filtreM2}
                   AND (m2.recu_le, m2.id) > (m.recu_le, m.id))
        ORDER BY m.recu_le DESC, m.fil_id DESC
        LIMIT $3
     )
     SELECT p.fil_id::text AS fil_id,
            f.objet_initial AS objet,
            coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(p.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,
            p.sens AS dernier_sens,
            to_char(p.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            p.extrait,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id)::int AS nb_messages,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id AND c.exclu_le IS NULL)::int AS nb_lisibles,
            EXISTS (SELECT 1 FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
                     WHERE pm.fil_id = p.fil_id) AS a_piece,
            (SELECT e.reference FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
              WHERE a.fil_id = p.fil_id AND a.actif AND a.message_id IS NULL LIMIT 1) AS reference,
            (f.etat = 'sans_suite') AS sans_suite
       FROM page p JOIN gestion_fil f ON f.id = p.fil_id
       ${SQL_INTERLOCUTEUR}
      ORDER BY p.recu_le DESC, p.fil_id DESC`;
}

/**
 * 🔴 CE QUE LA BOÎTE MONTRE PAR DÉFAUT, ET POURQUOI CE N'EST PAS « TOUT ».
 *
 * MESURÉ sur la vraie base : **12 262 échanges sur 17 206 (71 %) ne contiennent QUE des messages écartés** par une
 * règle — presque tous des envois produits par un logiciel. Les verser dans la liste par défaut la remplirait à 71 %
 * de bruit, et le mode « boîte mail » serait illisible le jour de sa livraison.
 *
 * On ne les SUPPRIME pas pour autant, et on ne les cache pas en silence : `inclureAutomatiques` les ramène, l'écran
 * annonce leur nombre en toutes lettres, et l'interrupteur est visible en permanence. C'est le traitement que Gmail
 * réserve aux promotions : tout est là, rien ne noie le reste, et tout est à un geste.
 */
export interface OptionsBoite {
  /** Ramener aussi les échanges dont TOUS les messages sont tenus hors de la file par une règle. */
  inclureAutomatiques?: boolean;
  /** LOT 5-FUSION — l'étiquette choisie dans la colonne de gauche. Absente = « Réception », la boîte entière. */
  etiquette?: Etiquette;
  /** La fenêtre d'activité, en jours — utilisée par la seule étiquette « À classer ». Lue en base par l'appelant. */
  fenetreJours?: number;
}

/**
 * UNE PAGE DE LA BOÎTE, du message le plus récent au plus ancien.
 *
 * `total` n'est compté qu'à la PREMIÈRE page : c'est la seule requête un peu chère de l'écran, et la redemander à
 * chaque « voir plus » la paierait pour rien — le total ne bouge pas entre deux pages.
 */
export async function lireBoiteMail(
  curseur: CurseurBoite | null,
  partenaires: readonly PartenaireInterne[] = [],
  limite = PAGE_BOITE,
  options: OptionsBoite = {},
): Promise<PageBoite> {
  const etiquette = options.etiquette ?? ETIQUETTE_TOUT;
  // L'étiquette prime sur l'interrupteur quand elle ne laisse pas le choix — sans quoi « Courrier automatique »
  //   afficherait une liste vide, et « À classer » ne serait plus le poste de tri.
  const impose = autoImposeParEtiquette(etiquette);
  const tous = impose ?? options.inclureAutomatiques === true;
  // On demande UNE ligne de plus que la page : sa présence dit « il y a une suite », sans compter quoi que ce soit.
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  // LOT 5-BOITE-3 — la corbeille n'entre dans le SQL que si la migration 251 est là. Sonde HORS transaction : une
  //   colonne nommée alors qu'elle n'existe pas ferait échouer TOUTE la boîte, pas seulement le geste nouveau.
  const corbeille = await corbeilleDisponible();
  const { rows } = await query<LigneDB>(
    sqlPageBoite(tous, etiquette, corbeille),
    // `infinity` plutôt qu'une date arbitraire : il n'existe aucun message après, quelle que soit l'horloge.
    [curseur?.dernierLe ?? 'infinity', curseur?.filId ?? '9223372036854775807', aLire,
      ...parametresEtiquette(etiquette, options.fenetreJours ?? 30)],
  );

  const aSuite = rows.length === aLire;
  const gardees = aSuite ? rows.slice(0, aLire - 1) : rows;
  const dernier = gardees[gardees.length - 1];

  return {
    lignes: gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, l'écran comparerait des chaînes à des nombres et
      //    les clés React comme les comparaisons d'identifiant mentiraient. Piège connu du dépôt.
      filId: Number(r.fil_id),
      objet: r.objet,
      // Le libellé d'un partenaire interne PRIME sur le nom porté par le mail, ici comme partout dans le module.
      interlocuteur: r.interlocuteur_adresse === null
        ? r.interlocuteur
        : libelleExpediteur(partenaires, r.interlocuteur_adresse, r.interlocuteur) || r.interlocuteur,
      dernierSens: r.dernier_sens === 'envoye' ? 'envoye' : 'recu',
      dernierLe: r.dernier_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      nbMessages: r.nb_messages,
      nbLisibles: r.nb_lisibles,
      aPiece: r.a_piece === true,
      reference: r.reference,
      sansSuite: r.sans_suite === true,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    // Le total N'EST COMPTÉ QUE pour la boîte entière. Sous une étiquette, c'est la colonne de gauche qui porte le
    //   nombre — et le recompter ici donnerait deux chiffres pour une seule vérité, donc tôt ou tard deux chiffres
    //   différents. `null` se lit « demande-le à l'étiquette », pas « zéro ».
    // LOT 5-BOITE-2 — les DEUX boîtes portent désormais leur total, calculé avec leur propre règle. Les autres
    //   étiquettes s'en remettent toujours à la colonne de gauche (`null` se lit « demande-le à l'étiquette »).
    total: curseur === null && (etiquette.sorte === 'reception' || etiquette.sorte === 'envoyes')
      ? await compterBoite(tous, etiquette.sorte === 'envoyes' ? 'envoye' : 'recu', corbeille)
      : null,
  };
}

/**
 * Combien d'échanges la boîte contient au total. Un échange compte dès qu'il porte AU MOINS un message non écarté —
 * même règle que la liste, pour que le compteur et la liste ne racontent jamais deux histoires différentes.
 */
export async function compterBoite(
  inclureAutomatiques = false, sens: 'recu' | 'envoye' = 'recu', corbeille = false,
): Promise<number> {
  // LOT 5-BOITE-2 — ce total porte EXACTEMENT la règle de l'étiquette : c'est le DERNIER message de l'échange qui
  //   décide. Un compteur calculé autrement annoncerait un nombre que la liste ne montre pas — et c'est toujours le
  //   compteur qu'on croit. `DISTINCT ON` est ici le bon outil : on veut UNE ligne par échange, la plus récente.
  // La corbeille est écartée du total comme elle l'est de la liste — et par la MÊME règle, le dernier message
  //   décidant aussi du retour automatique. Sans la migration 251, la colonne n'est pas nommée.
  const horsCorbeille = corbeille
    ? `AND NOT EXISTS (SELECT 1 FROM gestion_fil fc WHERE fc.id = m.fil_id
                        AND fc.corbeille_le IS NOT NULL AND fc.corbeille_le >= m.recu_le)`
    : '';
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM (SELECT DISTINCT ON (m.fil_id) m.sens
               FROM gestion_message m
              WHERE ${inclureAutomatiques ? 'true' : 'm.exclu_le IS NULL'} ${horsCorbeille}
              ORDER BY m.fil_id, m.recu_le DESC, m.id DESC) d
      WHERE d.sens = $1`,
    [sens]);
  return rows[0]?.n ?? 0;
}

/**
 * Les DEUX comptes de la boîte, pour que l'écran puisse dire ce qu'il montre ET ce qu'il ne montre pas. Un outil qui
 * cache sans le dire ment ; un outil qui annonce ce qu'il tait reste honnête — c'est la règle du module depuis le lot 4b.
 */
export async function comptesBoite(): Promise<{ lisibles: number; automatiques: number; envoyes: number; reception: number }> {
  // ⚠️ UN SEUL parcours pour les TROIS nombres. « Envoyés » est arrivé avec le lot 5-FUSION : il aurait pu être une
  //   requête de plus, il n'est qu'un `FILTER` de plus sur le regroupement qui existait déjà — même balayage, même
  //   coût, et surtout aucune chance que les compteurs se contredisent puisqu'ils sortent de la même lecture.
  const { rows } = await query<{ lisibles: number; total: number; envoyes: number; reception: number }>(
    `SELECT count(*) FILTER (WHERE lisibles > 0)::int AS lisibles,
            count(*)::int AS total,
            -- LOT 5-BOITE-2 — les deux boîtes suivent la règle de l'étiquette : LE DERNIER MESSAGE LISIBLE DÉCIDE.
            --   Elles sont donc DISJOINTES, et leur somme vaut exactement le nombre d'échanges lisibles. Calculées
            --   par un array_agg ordonné, sur le regroupement qui existait déjà : même balayage, même coût, et
            --   (pas d'accent grave dans ce commentaire : il est DANS un littéral gabarit, qu'il terminerait)
            --   aucune chance que les deux nombres se contredisent puisqu'ils sortent de la même lecture.
            count(*) FILTER (WHERE dernier_lisible = 'envoye')::int AS envoyes,
            count(*) FILTER (WHERE dernier_lisible = 'recu')::int AS reception
       FROM (SELECT fil_id,
                    count(*) FILTER (WHERE exclu_le IS NULL) AS lisibles,
                    (array_agg(sens ORDER BY recu_le DESC, id DESC)
                       FILTER (WHERE exclu_le IS NULL))[1] AS dernier_lisible
               FROM gestion_message GROUP BY fil_id) x`);
  const l = rows[0]?.lisibles ?? 0;
  return {
    lisibles: l, automatiques: (rows[0]?.total ?? 0) - l, envoyes: rows[0]?.envoyes ?? 0,
    reception: rows[0]?.reception ?? 0,
  };
}
