import { query } from '../db/client';
import { copieDisparueDisponible, nomUsageDisponible } from './schema';
import { sqlNomAffiche, sqlNomOrigine } from './nomUsageSql';
import { sqlCopieVivante } from './copieDisparueSql';
import { oublierCesNoms } from './nomsDriveMemoire';
import type { CopieDrive, RefusRenommage } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE NOM D'USAGE EN BASE, ET SON JOURNAL ═══════════════════════════════════
 *
 * IMPUR (base). La DÉCISION — quelles copies renommer, laquelle gagne quand deux Drive se contredisent — vit
 * dans `nomUsagePiece.ts`, qui s'éprouve sans base. Ici on ne fait que lire et écrire.
 *
 * 🔴 TOUT EST CONDITIONNÉ À LA MIGRATION 286. Sans elle, ces fonctions rendent des valeurs neutres sans émettre
 * la moindre requête qui nommerait `nom_usage` ou `gestion_piece_renommage` : nommer une colonne absente ferait
 * échouer la lecture des pièces ENTIÈRE, donc l'affichage de tout le courrier.
 */

export interface PieceANommer {
  pieceId: number;
  nomOrigine: string;
  nomAffiche: string;
  /**
   * 🔴 LOT RENOMMAGE-UN-SEUL-NOM — CE QUE LA PIÈCE EST. Il sert au SERVEUR à recoller l'extension d'origine
   * même quand le nom n'en porte pas à la fin : la règle d'Arno « l'extension est TOUJOURS conservée » ne peut
   * pas reposer sur l'écran seul, qui se contourne.
   */
  typeMime: string | null;
  copies: CopieDrive[];
}

/**
 * LA PIÈCE ET SES COPIES DRIVE, telles que notre registre les connaît. `null` = pièce inconnue.
 *
 * 🔒 LES COPIES VIENNENT DE `gestion_piece_drive`, ET DE NULLE PART AILLEURS. C'est CE registre qui définit « un
 * fichier que le programme a créé » : une copie de « 00 Arrivée des mails » (`origine = 'copie'`) ou un dépôt
 * fait par « Ranger » / « Copier » (`origine = 'manuel'`). Un fichier qui n'y figure pas n'est pas à nous, et la
 * garantie de ce lot tient à ce que la liste vienne d'ici.
 */
export async function lirePieceANommer(pieceId: number): Promise<PieceANommer | null> {
  if (!Number.isSafeInteger(pieceId) || pieceId <= 0) return null;
  const { rows } = await query<{ nom_origine: string; nom_affiche: string; type_mime: string | null }>(
    `SELECT ${sqlNomOrigine('p')} AS nom_origine, ${await sqlNomAffiche('p')} AS nom_affiche, p.type_mime
       FROM gestion_piece p WHERE p.id = $1`, [pieceId]);
  if (!rows[0]) return null;

  const { rows: copies } = await query<{
    drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null; origine: string;
  }>(
    `SELECT drive_file_id, drive_dossier_id, dossier_nom, origine
       FROM gestion_piece_drive WHERE piece_id = $1 ORDER BY depose_le`, [pieceId]);

  return {
    pieceId,
    nomOrigine: rows[0].nom_origine,
    nomAffiche: rows[0].nom_affiche,
    typeMime: rows[0].type_mime,
    copies: copies.map((c) => ({
      driveFileId: c.drive_file_id, dossierId: c.drive_dossier_id,
      dossierNom: c.dossier_nom, origine: c.origine,
    })),
  };
}

/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — DE QUELLE PIÈCE CE FICHIER DRIVE EST-IL UNE COPIE ? ═════════════════════
 *
 * Le pont que la fenêtre du Drive ne peut pas faire elle-même : elle ne connaît que l'identifiant Google, la
 * correspondance vit dans NOTRE registre. `null` = ce fichier n'est pas à nous, et l'appelant le DIT plutôt que
 * de renommer le document d'un correspondant.
 *
 * ⚠️ UNE COPIE DISPARUE NE COMPTE PAS : écrire dans un fichier supprimé du Drive ne peut produire qu'un refus de
 * Google. On préfère dire « ce fichier n'est pas à nous » que de laisser partir une écriture vouée à l'échec.
 *
 * ⚠️ S'IL Y EN A PLUSIEURS — un même identifiant Drive rangé sous deux pièces ne devrait pas exister, mais le
 * registre ne l'interdit pas —, on prend la PLUS ANCIENNE : c'est le dépôt d'origine, celui dont les autres
 * descendent.
 */
export async function pieceDuFichierDrive(driveFileId: string): Promise<number | null> {
  const id = driveFileId.trim();
  if (id === '') return null;
  const { rows } = await query<{ piece_id: string }>(
    `SELECT piece_id::text AS piece_id FROM gestion_piece_drive
      WHERE drive_file_id = $1 AND ${await sqlCopieVivante('gestion_piece_drive')}
      ORDER BY depose_le ASC, id ASC LIMIT 1`, [id]);
  return rows[0] === undefined ? null : Number(rows[0].piece_id);
}

/**
 * ══ 🔒 LE REGISTRE : LES IDENTIFIANTS QUE LE PROGRAMME A LUI-MÊME CRÉÉS ═══════════════════════════════════════
 *
 * 🔴🔴 C'EST LA GARANTIE CENTRALE DU LOT, et elle tient en une requête. Un identifiant qui n'est pas ici n'est
 * pas renommé — quoi qu'en dise l'écran, quoi qu'en dise l'appelant. On ne demande pas au code appelant d'être
 * discipliné : on lui donne un ensemble, et le module de renommage refuse tout ce qui n'y est pas.
 *
 * ⚠️ BORNÉ À LA PIÈCE. Charger tout le registre (26 543 lignes) pour renommer deux fichiers serait une lecture
 * inutile à chaque clic ; et un registre large ferait porter à cette fonction le risque d'autoriser un fichier
 * d'une autre pièce.
 */
export async function registreDeLaPiece(pieceId: number): Promise<Set<string>> {
  /* 🔴 LOT FICHE-SAISIE-UNIFORME — UNE COPIE DISPARUE NE SORT PAS DU REGISTRE POUR AUTANT : la ligne reste, elle
     raconte un dépôt qui a eu lieu. Mais on ne l'offre plus au renommage — écrire dans un fichier supprimé ne
     peut produire qu'un refus de Google, et donc une erreur à l'écran pour rien. */
  const { rows } = await query<{ drive_file_id: string }>(
    `SELECT drive_file_id FROM gestion_piece_drive
      WHERE piece_id = $1 AND ${await sqlCopieVivante('gestion_piece_drive')}`, [pieceId]);
  return new Set(rows.map((r) => r.drive_file_id.trim()).filter((x) => x !== ''));
}

/**
 * ÉCRIT LE NOUVEAU NOM D'USAGE. Rend `false` sans la migration 286 — et l'appelant le DIT à l'écran.
 *
 * ⚠️ ON ÉCRIT MÊME QUAND LE NOM REDEVIENT CELUI D'ORIGINE : remettre le nom reçu est un geste comme un autre, et
 * la colonne doit alors porter cette valeur plutôt que de retomber à `NULL` par magie. Le repli `NULL` est pour
 * les pièces JAMAIS renommées, pas pour celles qu'on a ramenées à leur point de départ.
 */
/**
 * ══ 🔴🔴 LOT RANGER-ET-NOM-FIABLES — TROIS RÉPONSES, ET PAS DEUX ═══════════════════════════════════════════
 *
 * DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, le 01/10/2026 : un nom renommé DANS Google Drive était bien repris par la
 * pièce, mais les TROIS autres copies gardaient l'ancien nom.
 *
 * 🔴 LA CAUSE : la reprise écrit d'abord le nom d'usage, puis appelle `renommerPiece` pour aligner les autres
 * copies. Ce second appel réécrit le MÊME nom — et depuis que l'écriture est un arbitre (`IS DISTINCT FROM`,
 * lot précédent), elle ne touche aucune ligne et rendait `false`. `renommerPiece` lisait ce `false` comme
 * « la migration 286 manque », abandonnait, et n'alignait rien.
 *
 * 🔴 UN BOOLÉEN NE POUVAIT PAS DIRE LA DIFFÉRENCE entre « je n'ai pas pu » et « c'était déjà fait ». Les deux
 * ne se traitent pas pareil : la première est un refus, la seconde est un succès. Trois réponses, donc, et le
 * compilateur force désormais l'appelant à les distinguer.
 */
export type IssueNomUsage = 'ecrit' | 'inchange' | 'indisponible';

export async function ecrireNomUsage(pieceId: number, nom: string): Promise<IssueNomUsage> {
  if (!(await nomUsageDisponible())) return 'indisponible';
  const propre = nom.trim();
  if (propre === '') return 'indisponible';
  /**
   * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — « IS DISTINCT FROM » : LE PREMIER ÉCRIVAIN GAGNE ═══════════════════
   *
   * DÉFAUT OBSERVÉ À L'ÉPREUVE RÉELLE, le 30/09/2026 : un renommage fait dans Google Drive a produit DEUX lignes
   * de journal identiques pour un seul geste. L'écran avait ouvert le fil deux fois presque en même temps ; les
   * deux lectures ont vu l'ancien nom, les deux ont écrit le nouveau, les deux ont journalisé.
   *
   * 🔴 LA CONDITION FAIT DE L'ÉCRITURE UN ARBITRE. Le second `UPDATE` ne touche aucune ligne, rend `false`, et
   * l'appelant n'écrit alors PAS de seconde ligne de journal. Un fait, une ligne — c'est toute la valeur d'un
   * journal qu'on relit pour comprendre.
   *
   * ⚠️ CE N'EST PAS UN CHANGEMENT DE RÈGLE. On écrit toujours quand le nom redevient celui d'origine : passer de
   * `NULL` à « 0836_001.pdf » EST une écriture (`IS DISTINCT FROM` traite `NULL` comme différent de tout). Ce
   * qu'on refuse, c'est de réécrire une valeur déjà en place — ce qui n'a jamais rien changé à personne.
   */
  const { rowCount } = await query(
    'UPDATE gestion_piece SET nom_usage = $2 WHERE id = $1 AND nom_usage IS DISTINCT FROM $2',
    [pieceId, propre]);
  /* ⚠️ ZÉRO LIGNE TOUCHÉE VEUT DIRE « LA VALEUR Y ÉTAIT DÉJÀ » — la pièce existe (l'appelant vient de la lire),
     et la colonne existe (sonde ci-dessus). C'est un SUCCÈS, pas un refus. */
  return (rowCount ?? 0) > 0 ? 'ecrit' : 'inchange';
}

/**
 * ══ 🔴🔴 ON NOTE CE QU'ON A ÉCRIT DANS LE DRIVE ══════════════════════════════════════════════════════════════
 *
 * 🔴 C'EST CE QUI PERMET DE RECONNAÎTRE UN RENOMMAGE HUMAIN. Sans cette mémoire, la reprise comparait le nom
 * Drive au nom de la PIÈCE — et comme les copies de « 00 Arrivée des mails » portent un préfixe
 * « date — expéditeur — », la comparaison était vraie partout : la première épreuve réelle a « repris » 60
 * pièces sur 60, et aurait renommé toute la base d'après ses préfixes.
 *
 * Un renommage humain, c'est Drive qui dit autre chose que CE qu'on y a écrit. Rien d'autre.
 *
 * ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM — ET ON OUBLIE AUSSITÔT CE QU'ON VIENT DE RENDRE FAUX ═══════════════════════
 *
 * DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, le 03/10/2026 : un renommage s'annulait TOUT SEUL 63 millisecondes plus tard
 * (journal, pièce 27087 : ligne 81 `app` « test renomage.pdf » → « epreuve lot extension.pdf », ligne 82 `drive`
 * qui revient en arrière). La reprise relisait le nom du fichier dans sa MÉMOIRE de 30 secondes — remplie à
 * l'ouverture de la visionneuse, donc AVANT notre écriture —, le trouvait différent du `nom_drive` qu'on vient
 * d'écrire ici, et en concluait qu'un humain avait renommé dans Drive. Elle défaisait notre propre geste.
 *
 * 🔴 C'EST ICI QUE L'OUBLI DOIT SE FAIRE, et nulle part ailleurs : cette fonction est le SEUL endroit qui note
 * « voilà ce que nous avons écrit chez Google ». Les deux faits — ce qu'on a écrit, et le cache que cela périme
 * — sont le même fait ; les séparer, c'est accepter qu'un jour l'un se fasse sans l'autre.
 *
 * ⚠️ L'OUBLI PASSE AVANT L'ÉCRITURE EN BASE, et avant même la sonde de migration : il ne coûte rien, il ne peut
 * pas échouer, et le faire après laisserait une fenêtre — courte, mais c'est exactement dans une fenêtre de
 * 63 ms que le défaut s'est produit.
 */
export async function noterNomEcritDansDrive(driveFileIds: readonly string[], nom: string): Promise<void> {
  const ids = [...new Set(driveFileIds.map((i) => i.trim()).filter((i) => i !== ''))];
  oublierCesNoms(ids);
  if (ids.length === 0 || !(await nomUsageDisponible())) return;
  try {
    await query(
      'UPDATE gestion_piece_drive SET nom_drive = $2 WHERE drive_file_id = ANY($1::text[])', [ids, nom]);
  } catch (e) {
    console.error('[gestion/nom-usage] mémoire du nom Drive impossible', e);
  }
}

/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — MARQUER UNE COPIE DISPARUE DU DRIVE ════════════════════════════════════
 *
 * 🔴 ARNO (01/10/2026) : « marque la copie “disparue” dans le registre, cesse de la relire, utilise les autres
 * copies, et n'affiche jamais d'erreur à Arno pour ça. »
 *
 * ⚠️ ELLE NE LÈVE JAMAIS, et elle n'est jamais attendue par un verdict. Elle est appelée depuis des chemins de
 * LECTURE (relecture de nom, aperçu, rangement) : les faire échouer parce qu'on n'a pas su noter une disparition
 * remplacerait un silence par une panne — exactement le contraire de ce qui est demandé.
 *
 * ⚠️ IDEMPOTENTE : `disparu_le IS NULL` dans le `WHERE`. Une copie déjà marquée garde sa PREMIÈRE date, qui est
 * la seule intéressante — celle où l'on s'en est aperçu.
 */
export async function marquerCopieDisparue(driveFileId: string, motif: string): Promise<boolean> {
  const id = driveFileId.trim();
  if (id === '' || !(await copieDisparueDisponible())) return false;
  try {
    const { rowCount } = await query(
      `UPDATE gestion_piece_drive
          SET disparu_le = now(), disparu_motif = left($2, 200)
        WHERE drive_file_id = $1 AND disparu_le IS NULL`, [id, motif]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[gestion/copie-drive] marque « disparue » impossible', e);
    return false;
  }
}

/**
 * ══ 🔴 LE JOURNAL — QUI, QUAND, ANCIEN ET NOUVEAU NOM, IDS DRIVE TOUCHÉS ═════════════════════════════════════
 *
 * Demande d'Arno, mot pour mot. Append-only : rien n'y est jamais modifié ni supprimé.
 *
 * ⚠️ IL NE LÈVE JAMAIS. Un journal qui ferait échouer le geste qu'il raconte serait pire que pas de journal : on
 * perdrait le renommage POUR avoir voulu le tracer. On note l'incident au journal du serveur et l'on continue.
 */
export async function journaliserRenommage(o: {
  pieceId: number;
  ancienNom: string;
  nouveauNom: string;
  source: 'app' | 'drive';
  idsDrive: readonly string[];
  refus: readonly RefusRenommage[];
  par: number | null;
  parLibelle: string;
}): Promise<void> {
  if (!(await nomUsageDisponible())) return;
  try {
    await query(
      `INSERT INTO gestion_piece_renommage
         (piece_id, ancien_nom, nouveau_nom, source, ids_drive, refus, par, par_libelle)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [o.pieceId, o.ancienNom, o.nouveauNom, o.source,
        JSON.stringify([...o.idsDrive]), JSON.stringify([...o.refus]), o.par, o.parLibelle]);
  } catch (e) {
    console.error('[gestion/nom-usage] journal impossible', e);
  }
}

/** Une ligne de journal, telle que l'écran la lit. */
export interface LigneRenommage {
  id: number;
  ancienNom: string;
  nouveauNom: string;
  source: 'app' | 'drive';
  parLibelle: string;
  le: string;
}

/** L'historique des renommages d'une pièce, du plus récent au plus ancien. Vide sans la migration. */
export async function journalDeLaPiece(pieceId: number, limite = 20): Promise<LigneRenommage[]> {
  if (!(await nomUsageDisponible())) return [];
  const { rows } = await query<{
    id: string; ancien_nom: string; nouveau_nom: string; source: string; par_libelle: string; le: string;
  }>(
    `SELECT id::text, ancien_nom, nouveau_nom, source, par_libelle, le::text
       FROM gestion_piece_renommage WHERE piece_id = $1
      ORDER BY le DESC, id DESC LIMIT $2`, [pieceId, Math.min(Math.max(1, limite), 100)]);
  return rows.map((r) => ({
    id: Number(r.id), ancienNom: r.ancien_nom, nouveauNom: r.nouveau_nom,
    source: r.source === 'drive' ? 'drive' : 'app', parLibelle: r.par_libelle, le: r.le,
  }));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LA PASSE QUI REPREND LES NOMS CHANGÉS DANS GOOGLE DRIVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une pièce candidate à la relecture, avec ses copies. */
export interface PieceARelire {
  pieceId: number;
  nomAffiche: string;
  copies: {
    driveFileId: string; dossierId: string; dossierNom: string | null; origine: string;
    /**
     * 🔴 LE NOM QUE L'APPLICATION A ÉCRIT SUR CE FICHIER. `null` = on ne le sait pas, et la reprise laisse alors
     * cette copie TRANQUILLE. Ne pas savoir n'est pas une raison de renommer — c'est la raison de s'abstenir.
     */
    nomDrive: string | null;
  }[];
}

/**
 * ══ 🔴🔴 LE COÛT, ET POURQUOI CE CHOIX ════════════════════════════════════════════════════════════════════════
 *
 * Arno : « Coût maîtrisé : requêtes groupées, pas de relecture de tout à chaque minute. Explique ton choix. »
 *
 * MESURÉ LE 30/09/2026 : 26 543 copies Drive. Les relire toutes à chaque relève — donc toutes les minutes — ferait
 * quelque 530 appels `files.list` par passe, près de 400 000 par jour, pour découvrir un renommage que personne ne
 * fait plus d'une fois par semaine. C'est le genre de coût invisible jusqu'au jour où Google limite le compte, et
 * où c'est la RELÈVE qui s'arrête.
 *
 * ═══ 🔴 CE QUE J'AVAIS ÉCRIT D'ABORD, ET POURQUOI C'ÉTAIT FAUX ══════════════════════════════════════════════════
 *
 * Première version : « les pièces les plus récemment déposées d'abord », avec un plafond par passe. Le
 * raisonnement semblait bon — un fichier qu'on vient de renommer est un fichier qu'on vient d'ouvrir.
 *
 * 🔴 IL EST FAUX SUR CETTE BASE-CI, et l'épreuve réelle l'a montré tout de suite : 26 522 des 26 543 copies ont
 * été déposées LA MÊME NUIT, par la passe de copie du 29/09. Trier par date de dépôt ne classe donc rien — l'ordre
 * est arbitraire à l'intérieur du paquet. La pièce que je voulais éprouver s'est retrouvée au rang 24 100 : un
 * renommage fait dans Drive ne l'aurait JAMAIS été repris, quel que soit le nombre de passes.
 *
 * ═══ 🔴🔴 CE QUI LA REMPLACE : UN BALAYAGE COMPLET, DÉTERMINISTE ET SANS ÉTAT ═══════════════════════════════════
 *
 * On découpe le registre en `TRANCHES` paquets, par le reste de la division de l'identifiant. Chaque passe en
 * prend UN, choisi par l'horloge. Trois propriétés, et il faut les trois :
 *   ① TOUT EST VU, dans un délai BORNÉ : une tranche par passe, `TRANCHES` passes pour faire le tour — environ
 *      trois jours au rythme d'une passe toutes les dix minutes. Aucune pièce ne peut être oubliée.
 *   ② SANS ÉTAT : rien à retenir entre deux passes. Un compteur en mémoire repartirait de zéro à chaque
 *      redémarrage du travailleur (launchd, un déploiement) et relirait éternellement les mêmes.
 *   ③ SANS PIC : chaque passe lit le même nombre de pièces, quel que soit le moment.
 *
 * ⚠️ LE RESTE DE LA DIVISION, ET PAS UN `OFFSET` : un `OFFSET 24000` ferait balayer 24 000 lignes pour en rendre
 * soixante, et l'ordre changerait à chaque pièce capturée. Le modulo est stable et se lit sur l'index primaire.
 */
export const PLAFOND_RELECTURE = 60;

/**
 * EN COMBIEN DE PAQUETS ON DÉCOUPE LE REGISTRE. 440 tranches sur 26 543 pièces font environ 60 pièces par passe —
 * soit une seule requête `files.list`, et le tour complet en 440 passes.
 *
 * ⚠️ CE N'EST PAS UNE CONSTANTE DE CONFORT : la changer change le délai au bout duquel un renommage fait dans
 * Drive est repris. Plus grand = moins cher et plus lent ; plus petit = l'inverse.
 */
export const TRANCHES = 440;

/** La tranche à lire à cet instant. PUR — l'horloge est passée, jamais lue ici. */
export function trancheDuMoment(maintenantMs: number, tranches = TRANCHES): number {
  return Math.floor(maintenantMs / 600_000) % tranches;
}

/**
 * LES PIÈCES DE LA TRANCHE DEMANDÉE, avec leurs copies Drive.
 *
 * ⚠️ `origine` EST RENDUE : le tri des copies à renommer en a besoin, et la relire ensuite ferait une requête par
 * pièce là où celle-ci les rend toutes.
 *
 * ⚠️ `limite` BORNE LA TRANCHE, elle ne la choisit pas : c'est un garde-fou pour le jour où le registre aura
 * beaucoup grossi, pas le mécanisme de découpe.
 */
export async function piecesARelire(
  tranche: number, limite = PLAFOND_RELECTURE, tranches = TRANCHES,
): Promise<PieceARelire[]> {
  if (!(await nomUsageDisponible())) return [];
  const { rows } = await query<{
    piece_id: string; nom_affiche: string;
    drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null; origine: string;
    nom_drive: string | null;
  }>(
    `WITH choisies AS (
       SELECT DISTINCT d.piece_id
         FROM gestion_piece_drive d
        WHERE (d.piece_id % $1::bigint) = $2::bigint
        ORDER BY d.piece_id
        LIMIT $3
     )
     SELECT p.id::text AS piece_id, ${await sqlNomAffiche('p')} AS nom_affiche,
            d.drive_file_id, d.drive_dossier_id, d.dossier_nom, d.origine, d.nom_drive
       FROM choisies c
       JOIN gestion_piece p ON p.id = c.piece_id
       JOIN gestion_piece_drive d ON d.piece_id = c.piece_id AND ${await sqlCopieVivante('d')}
      ORDER BY p.id, d.depose_le`,
    [Math.max(1, tranches), ((tranche % tranches) + tranches) % tranches, Math.min(Math.max(1, limite), 500)]);

  return regrouperPourRelecture(rows);
}

/** Une pièce par ligne de pièce, ses copies rassemblées. PUR — la même pour les deux sélecteurs. */
function regrouperPourRelecture(rows: readonly {
  piece_id: string; nom_affiche: string; drive_file_id: string; drive_dossier_id: string;
  dossier_nom: string | null; origine: string; nom_drive: string | null;
}[]): PieceARelire[] {
  const par = new Map<number, PieceARelire>();
  for (const r of rows) {
    const id = Number(r.piece_id);
    const deja = par.get(id) ?? { pieceId: id, nomAffiche: r.nom_affiche, copies: [] };
    deja.copies.push({
      driveFileId: r.drive_file_id, dossierId: r.drive_dossier_id,
      dossierNom: r.dossier_nom, origine: r.origine, nomDrive: r.nom_drive,
    });
    par.set(id, deja);
  }
  return [...par.values()];
}

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LES PIÈCES QU'UN ÉCRAN VIENT D'AFFICHER ══════════════════════════════
 *
 * 🔴 LA MÊME FORME QUE `piecesARelire`, ET C'EST VOULU : la décision de reprendre un nom est écrite UNE fois
 * (`reprendrePourCesPieces`), et elle ne doit pas pouvoir voir deux formes de données différentes selon qu'elle
 * a été déclenchée par l'horloge ou par un clic.
 *
 * ⚠️ CE N'EST PAS UNE TRANCHE : ici, on sait exactement quelles pièces nous intéressent — celles qui sont sous
 * les yeux. Le découpage par modulo existe pour balayer 26 543 copies sans en oublier ; il n'a rien à faire dans
 * une demande qui en vise trente.
 */
/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LES PIÈCES RANGÉES RÉCEMMENT PASSENT DEVANT ══════════════════════════
 *
 * Demande d'Arno : « Garde le balayage de fond pour le reste, mais fais passer en priorité les pièces rangées ou
 * consultées récemment. »
 *
 * 🔴 CE QUE CELA NE DÉFAIT PAS. Le balayage par tranches garde ses trois propriétés — tout est vu dans un délai
 * borné, sans état, sans pic. Cette liste s'AJOUTE devant lui, elle ne le remplace pas : une pièce déposée il y a
 * un mois et jamais rouverte continue d'être vue par son tour de tranche, et par lui seul.
 *
 * 🔴 POURQUOI « RANGÉE RÉCEMMENT » ET PAS « DÉPOSÉE RÉCEMMENT ». Les 26 522 copies de « 00 Arrivée des mails »
 * ont été faites la même nuit : trier par date de dépôt ne classe rien (c'est l'erreur que l'épreuve réelle a
 * corrigée au lot précédent). Ce qu'on retient ici, ce sont les copies dont on SAIT ce qu'on y a écrit
 * (`nom_drive` renseigné) — c'est-à-dire, par construction, celles qu'un humain a rangées ou renommées depuis
 * l'application. Ce sont exactement celles qu'il peut avoir rouvertes dans Drive pour les renommer.
 *
 * ⚠️ PETIT PLAFOND : cette liste s'ajoute au coût de chaque passe. Elle doit rester une poignée, sinon elle
 * devient le balayage — avec un ordre, donc avec un angle mort.
 */
export const PLAFOND_PRIORITAIRES = 15;

/** Au-delà, une pièce n'est plus « récente » : son tour de tranche viendra, et c'est bien assez. */
export const FENETRE_PRIORITAIRE_JOURS = 7;

export async function piecesPrioritaires(limite = PLAFOND_PRIORITAIRES): Promise<PieceARelire[]> {
  if (!(await nomUsageDisponible())) return [];
  const { rows } = await query<{
    piece_id: string; nom_affiche: string;
    drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null; origine: string;
    nom_drive: string | null;
  }>(
    `WITH choisies AS (
       SELECT d.piece_id, max(d.depose_le) AS vue
         FROM gestion_piece_drive d
        WHERE d.nom_drive IS NOT NULL
          AND d.depose_le > now() - ($2::int * INTERVAL '1 day')
        GROUP BY d.piece_id
        ORDER BY vue DESC
        LIMIT $1
     )
     SELECT p.id::text AS piece_id, ${await sqlNomAffiche('p')} AS nom_affiche,
            d.drive_file_id, d.drive_dossier_id, d.dossier_nom, d.origine, d.nom_drive
       FROM choisies c
       JOIN gestion_piece p ON p.id = c.piece_id
       JOIN gestion_piece_drive d ON d.piece_id = c.piece_id AND ${await sqlCopieVivante('d')}
      ORDER BY c.vue DESC, p.id, d.depose_le`,
    [Math.min(Math.max(1, limite), 100), FENETRE_PRIORITAIRE_JOURS]);
  return regrouperPourRelecture(rows);
}

export async function piecesParIdentifiants(pieceIds: readonly number[]): Promise<PieceARelire[]> {
  const ids = [...new Set(pieceIds.filter((i) => Number.isSafeInteger(i) && i > 0))];
  if (ids.length === 0 || !(await nomUsageDisponible())) return [];
  const { rows } = await query<{
    piece_id: string; nom_affiche: string;
    drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null; origine: string;
    nom_drive: string | null;
  }>(
    `SELECT p.id::text AS piece_id, ${await sqlNomAffiche('p')} AS nom_affiche,
            d.drive_file_id, d.drive_dossier_id, d.dossier_nom, d.origine, d.nom_drive
       FROM gestion_piece p
       JOIN gestion_piece_drive d ON d.piece_id = p.id AND ${await sqlCopieVivante('d')}
      WHERE p.id = ANY($1::bigint[])
      ORDER BY p.id, d.depose_le`, [ids]);
  return regrouperPourRelecture(rows);
}
