import 'server-only';
import { deposerFichier, lireDossier, type LecteurDossier } from './drive';
import { lireDepotExistant, memoriserDepot } from './driveRepo';
import { copierFichier } from './driveMouvement';
import { motifDisparition } from './copieDisparue';
import { marquerCopieDisparue } from './nomUsageRepo';
import { lirePiecesDuMessage } from './piecesRepo';
import { lirePieceAServir } from './carteRepo';
import { recuperer } from '../stockage';
import type { DepsDepot, PieceADeposer } from './depotDrive';

/**
 * MODULE « GESTION » — LOT 5-PJ-B : CÂBLAGE RÉEL du dépôt dans le Drive. Même rôle que `releveReelle.ts` pour la
 * relève : tenir les I/O à un seul endroit, pour que l'orchestration (`depotDrive.ts`) reste éprouvable sans réseau
 * ni base.
 *
 * 🔒 LA LECTURE DE LA PIÈCE RÉUTILISE `lirePieceAServir` (lot 4c), qui est déjà la porte par laquelle la pièce est
 * servie à l'écran : une seule définition de « cette pièce existe-t-elle et où sont ses octets ». En écrire une
 * seconde ici donnerait deux réponses possibles à la même question.
 */
/**
 * @param lire LOT 5-PJ-D — le lecteur de dossiers de la requête en cours. La route a DÉJÀ lu le dossier pour vérifier
 * que la cible est un vrai dossier ; le lui passer évite de reposer la même question à Google. Absent, on lit
 * normalement : rien ne dépend de cette optimisation.
 */
export function depsReellesDepot(lire?: LecteurDossier): DepsDepot {
  return {
    lirePiece: async (pieceId: number): Promise<PieceADeposer | null> => {
      const p = await lirePieceAServir(pieceId);
      /**
       * 🔴 LOT RANGER-PJ-FIABLE — `stockageVide` ET `driveFileId` VOYAGENT AVEC LA PIÈCE. `lirePieceAServir` les
       * rendait déjà (lot DRIVE-3) et le dépôt les jetait : il lisait les octets, ne les trouvait pas, et
       * échouait sur « The specified key does not exist ». Avec eux, une pièce vidée se copie de dossier à
       * dossier chez Google — ce qu'elle aurait toujours dû faire.
       */
      return p === null ? null
        : {
          pieceId, nomFichier: p.nomFichier, typeMime: p.typeMime, cleStockage: p.cleStockage,
          stockageVide: p.stockageVide, driveFileId: p.driveFileId,
        };
    },
    octets: async (cle: string) => new Uint8Array(await recuperer(cle)),
    /**
     * 🔴 `files.copy` — la MÊME fonction que le geste « copier » du navigateur de fichiers (`driveMouvement`), et
     * pas une seconde écriture vers Google.
     *
     * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LE NOM CHOISI PART AVEC LA COPIE ═══════════════════════════════
     *
     * CE QUI ÉTAIT ÉCRIT ICI : « le nom n'est pas imposé : Google donne à la copie le nom de l'original ». Vrai,
     * et c'est précisément le défaut : le nom choisi au stylo était calculé, passé jusqu'ici… et jeté. La même
     * pièce se rangeait donc sous « Recommandé M Ahmed KHARRAT.pdf » par la voie des octets et sous
     * « 0836_001.pdf » par la voie de la copie — le contraire exact de « un seul nom, partout ».
     *
     * ⚠️ ET CE N'EST PAS UN RENOMMAGE : le fichier NAÎT de cet appel, il n'a pas encore de nom à défaire. Voir
     * `copierFichier`, où le garde statique continue de surveiller le corps du `PATCH` de `deplacerVers`.
     */
    copierDepuisDrive: async (jeton, o) => {
      /* 🔴 LOT FICHE-SAISIE-UNIFORME — SI LA COPIE SOURCE A DISPARU DU DRIVE, on la marque et l'on n'en parle
         pas : `deposerPieces` retombe tout seul sur nos octets, et le rangement aboutit quand même. C'est
         exactement « utilise les autres copies, et n'affiche jamais d'erreur pour ça ». */
      const r = await copierFichier(
        jeton, { id: o.driveFileId, parentCible: o.dossierId, nom: o.nom }, { fetch },
        (mort, statut) => { void marquerCopieDisparue(mort, motifDisparition(statut)); });
      return r.ok
        ? { ok: true, valeur: { id: r.valeur.id, nom: r.valeur.nom || o.nom, webViewLink: r.valeur.lien ?? null } }
        : r;
    },
    depotExistant: lireDepotExistant,
    deposer: (jeton, o) => deposerFichier(jeton, o, { fetch }),
    memoriser: memoriserDepot,
    infosDossier: async (jeton: string, dossierId: string) => {
      const d = await (lire ? lire(dossierId) : lireDossier(jeton, dossierId, { fetch }));
      // Un nom illisible n'empêche PAS de déposer : on perdrait le confort d'afficher « dossier X », pas le geste.
      return d.ok ? { nom: d.valeur.nom, driveId: d.valeur.driveId } : null;
    },
  };
}

/** Les pièces RÉELLEMENT conservées d'un message — celles que « Tout ajouter au Drive » peut copier. */
export async function piecesDeposablesDuMessage(messageId: number): Promise<number[]> {
  return (await lirePiecesDuMessage(messageId)).map((p) => p.pieceId);
}
