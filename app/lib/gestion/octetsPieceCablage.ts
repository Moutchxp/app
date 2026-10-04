import { query } from '../db/client';
import { recuperer } from '../stockage';
import { jetonPourSubject } from './driveDelegue';
import { lireContenuDrive } from './pieceDriveLecture';
import { chercherParMessageId, lireOriginalGmailOctets } from './google';
import { copiePiecesDisponible, vidageDisponible } from './schema';

/**
 * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — LES LIBELLÉS QUI NE DÉSIGNENT AUCUN NOM.
 *
 * Une partie MIME sans `filename` est enregistrée chez nous sous un libellé de remplacement. Chercher ce libellé
 * dans Gmail ne peut rien trouver : là-bas, la pièce n'a pas de nom du tout.
 *
 * ⚠️ LA LISTE EST FERMÉE ET EN MINUSCULES : on compare au libellé normalisé, jamais à un motif approximatif. Un
 * fichier réellement nommé « (sans nom).pdf » garde donc son chemin ordinaire.
 */
const SANS_NOM: readonly string[] = ['', '(sans nom)', '(sans titre)'];
// 🔴 LOT NOM-UNIQUE-DES-PIECES — le nom d'USAGE pour les messages, le nom d'ORIGINE pour retrouver dans Gmail.
import { sqlNomAffiche, sqlNomOrigine } from './nomUsageSql';
// 🔴 LOT FICHE-SAISIE-UNIFORME — une copie supprimée du Drive ne doit plus être servie : elle produirait une
//   erreur à l'écran sur un document qui existe ailleurs. Voir `copieDisparue.ts`.
import { sqlCopieVivante } from './copieDisparueSql';
import { estDisparition, motifDisparition } from './copieDisparue';
import { marquerCopieDisparue } from './nomUsageRepo';
import type { DepsOctetsPiece, PieceALire } from './octetsPiece';

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — LE CÂBLAGE RÉEL DE « LIRE LES OCTETS D'UNE PIÈCE » ═══════════════════════════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, et c'est délibéré — motif F1 du dépôt. Le travailleur de fond de la file
 * d'envoi assemble les pièces d'un message et tourne sous `tsx` : `server-only` lève hors du bundle react-server
 * et le tuerait au chargement, sans rapport apparent avec ce qu'il fait (bug 0d57224). La frontière client est
 * tenue par `clientBoundary.guard.test.ts`, qui vérifie qu'aucun composant client n'atteint ce fichier.
 *
 * 🔒 LE COMPTE DU DRIVE EST CELUI DE LA MAISON, et la délégation est celle qui existe déjà. Rien de nouveau n'est
 * autorisé ici : on emprunte le chemin que la route d'affichage emprunte depuis le lot DRIVE-3.
 */

/** Le compte au nom duquel on lit le Drive. Le même que la route d'affichage : une seule identité, un seul droit. */
const COMPTE_DRIVE = 'gestion@criterimmo.fr';

/**
 * ══ 🔒🔒 CE QUE CETTE REQUÊTE GARANTIT, ET QUI N'EST PAS NÉGOCIABLE ═════════════════════════════════════════════
 *
 * `origine = 'copie'` ET `verifie_le IS NOT NULL` : l'identifiant Drive rendu ne peut désigner QUE un fichier que
 * le programme a lui-même créé dans « 00 Arrivée des mails », et dont la copie a été vérifiée. Un dépôt manuel
 * dans un dossier client — qui peut vivre sous 🔴🔴 « Documents clients scannés » — n'entre JAMAIS ici.
 *
 * La garantie ne tient donc pas à une promesse faite au lecteur : elle tient à l'ORIGINE de l'identifiant, et une
 * épreuve vérifie que ces deux conditions sont bien dans le SQL.
 *
 * ⚠️ DEUX SONDES AVANT DE NOMMER QUOI QUE CE SOIT. `gestion_piece_vidage` (migration 260) et la colonne `origine`
 * de `gestion_piece_drive` (migration 255) peuvent manquer : les nommer sans les avoir sondées ferait échouer
 * TOUT envoi, y compris ceux qui marchaient la minute d'avant. Règle du module depuis le lot 4a.
 */
export async function lirePiecesALire(pieceIds: readonly number[]): Promise<Map<number, PieceALire>> {
  const m = new Map<number, PieceALire>();
  const ids = [...new Set(pieceIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return m;

  const avecVidage = await vidageDisponible();
  const avecCopie = await copiePiecesDisponible();

  const { rows } = await query<{
    id: string; nom_fichier: string; nom_origine: string; cle_stockage: string | null; taille_octets: string | null;
    vide: boolean; drive_file_id: string | null; md5: string | null; message_id_rfc: string | null;
    type_mime: string | null;
  }>(
    `SELECT p.id::text, ${await sqlNomAffiche('p')} AS nom_fichier,
            ${sqlNomOrigine('p')} AS nom_origine, p.cle_stockage, p.taille_octets::text,
            ${avecVidage ? 'EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : 'false'} AS vide,
            ${avecCopie ? 'd.drive_file_id' : 'NULL::text'} AS drive_file_id,
            ${avecCopie ? 'd.md5' : 'NULL::text'} AS md5,
            m.message_id AS message_id_rfc,
            -- 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — second repere d'une piece SANS NOM chez Gmail.
            p.type_mime
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
       ${avecCopie
    ? `LEFT JOIN gestion_piece_drive d
                ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
               AND ${await sqlCopieVivante('d')}`
    : ''}
      WHERE p.id = ANY($1::bigint[])`, [ids]);

  for (const r of rows) {
    m.set(Number(r.id), {
      pieceId: Number(r.id),
      nomFichier: r.nom_fichier,
      nomOrigine: r.nom_origine,
      cleStockage: r.cle_stockage,
      stockageVide: r.vide === true,
      driveFileId: r.drive_file_id,
      md5Attendu: r.md5,
      tailleAttendue: r.taille_octets === null ? null : Number(r.taille_octets),
      messageIdRfc: r.message_id_rfc,
      /* 🔴🔴 POINT 1 — il ne sert QUE si le nom ne désigne rien. Voir le dernier recours de `lireOctetsPiece`. */
      typeMime: r.type_mime,
    });
  }
  return m;
}

/**
 * LE CÂBLAGE. `jeton` rend celui de gestion@ pour Gmail ; `null` ⇒ le dernier recours n'existe pas, et le motif
 * de refus le dira en toutes lettres plutôt que d'échouer sans raison visible.
 */
export function depsOctetsPiece(jetonGmail?: () => Promise<string | null>): DepsOctetsPiece {
  const deps: DepsOctetsPiece = {
    minio: recuperer,
    drive: async (driveFileId: string) => {
      const jeton = await jetonPourSubject(COMPTE_DRIVE, { fetch });
      if (!jeton.ok) return { ok: false, motif: jeton.motif };
      // 🔒 `lireContenuDrive` n'émet qu'un `GET … ?alt=media`. Il ne sait pas écrire dans le Drive.
      const r = await lireContenuDrive(driveFileId, jeton.jeton, { fetch });
      /**
       * 🔴🔴 LOT FICHE-SAISIE-UNIFORME — UNE COPIE SUPPRIMÉE DU DRIVE EST MARQUÉE, PAS AFFICHÉE.
       *
       * Arno (01/10/2026) : « marque la copie “disparue” dans le registre, cesse de la relire, utilise les
       * AUTRES copies, et n'affiche jamais d'erreur pour ça. » La suite se fait toute seule : `lireOctetsPiece`
       * poursuit déjà vers MinIO puis vers le message d'origine. Ce qui manquait, c'est de ne plus revenir
       * frapper à une porte murée à chaque ouverture de la pièce.
       *
       * ⚠️ ON NE MARQUE QUE 404 ET 403. Un 429 ou un 503 disent « Google est occupé », pas « le fichier n'est
       * plus là » : marquer là-dessus effacerait des lectures une copie parfaitement vivante.
       */
      if (!r.ok && typeof r.code === 'number' && estDisparition(r.code)) {
        void marquerCopieDisparue(driveFileId, motifDisparition(r.code));
      }
      return r;
    },
  };

  /**
   * ══ 🔴 LE DERNIER RECOURS : LA PIÈCE, DANS LE MESSAGE D'ORIGINE, TEL QU'IL EST AUJOURD'HUI ═══════════════════
   *
   * On rapatrie l'original complet (`format=raw`) et l'on en extrait la pièce PAR SON NOM.
   *
   * ⚠️ C'EST COÛTEUX, ET C'EST POUR ÇA QUE C'EST LE DERNIER : un message de douze mégaoctets est rapatrié en
   * entier pour en tirer une pièce de soixante-dix kilo-octets. On n'y arrive que si MinIO est vide ET que la
   * copie Drive manque ou ne correspond plus — c'est-à-dire presque jamais.
   *
   * ⚠️ LE NOM SUFFIT À DÉSIGNER LA PIÈCE : un message qui porterait deux pièces homonymes rendrait la première.
   * C'est assumé — le cas est rare, et l'alternative (un index de position) supposerait que l'ordre des parties
   * MIME n'ait pas changé entre la capture et aujourd'hui, ce que rien ne garantit.
   */
  if (jetonGmail !== undefined) {
    deps.gmail = async (messageIdRfc: string, nomFichier: string, repere?: {
      typeMime?: string | null; taille?: number | null;
    }) => {
      const jeton = await jetonGmail();
      if (jeton === null) return null;
      const trouve = await chercherParMessageId(jeton, messageIdRfc, { fetch });
      if (!trouve.ok || trouve.valeur === null) return null;
      const brut = await lireOriginalGmailOctets(jeton, trouve.valeur.id, { fetch });
      if (!brut.ok) return null;
      // Import DYNAMIQUE : `mailparser` ne doit pas entrer dans le graphe des appelants qui ne s'en servent pas.
      const { simpleParser } = await import('mailparser');
      const analyse = await simpleParser(brut.valeur);
      const pieces = analyse.attachments ?? [];
      const voulu = (nomFichier ?? '').trim().toLowerCase();
      for (const piece of pieces) {
        if ((piece.filename ?? '').trim().toLowerCase() === voulu) return Buffer.from(piece.content);
      }

      /**
       * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — LE SECOND REPÈRE, QUAND LE NOM NE DÉSIGNE RIEN ══════════
       *
       * ⚠️ CAUSE EXACTE DE 7 ÉCHECS DE RATTRAPAGE, MESURÉE : une partie MIME SANS NOM est enregistrée chez nous
       * sous le libellé « (sans nom) ». La boucle ci-dessus compare ce libellé au `filename` de Gmail, qui est
       * vide : `'' === '(sans nom)'` ne peut JAMAIS aboutir. Trois des onze photos d'Arno étaient dans ce cas,
       * et quatre pièces du lot précédent aussi — toutes déclarées « introuvables » alors qu'elles sont là.
       *
       * 🔴 CE SECOND PASSAGE NE SERT QU'À CE CAS-LÀ, et il faut que ce soit strict : il ne s'ouvre QUE si le nom
       * voulu ne désigne rien (vide, ou le libellé de remplacement), et il exige que le type ET la taille
       * correspondent. Un nom qui désigne reste la clé — il est plus sûr qu'un couple (type, taille).
       *
       * ⚠️ IL EXIGE LES DEUX, ET LA TAILLE EXACTE. Le type seul attraperait la première image du message ; la
       * taille seule, n'importe quelle pièce du même poids. Ensemble, sur une pièce sans nom, l'ambiguïté est
       * négligeable — et `verifierTaille`, côté appelant, recontrôle de toute façon ce qui revient.
       *
       * ⚠️ S'ILS SONT PLUSIEURS À CORRESPONDRE, ON NE CHOISIT PAS : deux parties sans nom, de même type et de même
       * taille, sont indiscernables. Rendre la première serait deviner, et une pièce qui serait celle du voisin
       * est exactement ce que ce module s'interdit depuis le premier jour.
       */
      if (!SANS_NOM.includes(voulu)) return null;
      const type = (repere?.typeMime ?? '').split(';')[0].trim().toLowerCase();
      const taille = repere?.taille ?? null;
      if (type === '' || taille === null || taille <= 0) return null;
      const candidats = pieces.filter((piece) => (piece.filename ?? '').trim() === ''
        && (piece.contentType ?? '').split(';')[0].trim().toLowerCase() === type
        && piece.content?.length === taille);
      return candidats.length === 1 ? Buffer.from(candidats[0].content) : null;
    };
  }
  return deps;
}
