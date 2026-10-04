import 'server-only';
import {
  deposerFichier, lireDossier, nomDuDrive, NOM_GENERIQUE_RACINE_DRIVE, type LecteurDossier,
} from './drive';
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
    /**
     * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — L'INDEX DES EMPREINTES, ALIMENTÉ PAR LE DÉPÔT LUI-MÊME ════════════
     *
     * C'est la MÊME fonction que le balayage de fond et que chaque dossier ouvert dans la fenêtre
     * (`noterFichiersVus`, `empreinteDriveRepo`) — pas une seconde écriture. Son `ON CONFLICT … DO UPDATE` fait
     * que revoir le fichier plus tard par `changes.list` ne contredit rien : il remet la même ligne à jour.
     *
     * 🔒 ELLE N'ÉCRIT RIEN DANS LE DRIVE, et c'est une propriété de son code : `empreinteDriveRepo` n'importe
     * aucun module Drive et n'émet aucun `fetch` — un garde statique le vérifie. Elle range des métadonnées
     * qu'on vient de recevoir.
     *
     * ⚠️ `est_dossier: false` EN DUR, ET C'EST EXACT : une pièce jointe déposée est un FICHIER. Le dépôt ne crée
     * jamais de dossier (c'est `creerDossier`, ailleurs, et sous son propre garde-fou).
     */
    noterAuIndex: async (l) => {
      const { noterFichiersVus } = await import('./empreinteDriveRepo');
      await noterFichiersVus([{ ...l, estDossier: false }]);
    },
    infosDossier: async (jeton: string, dossierId: string) => {
      const d = await (lire ? lire(dossierId) : lireDossier(jeton, dossierId, { fetch }));
      // Un nom illisible n'empêche PAS de déposer : on perdrait le confort d'afficher « dossier X », pas le geste.
      if (!d.ok) return null;
      /**
       * ══ 🔴🔴 LA RACINE D'UN DRIVE PARTAGÉ NE S'APPELLE PAS « Drive » ════════════════════════════════════════
       *
       * DÉFAUT MESURÉ LE 04/10/2026 (lot RENOMMER-PARTOUT-ET-FINITIONS, point 5) : après un dépôt réel dans le
       * Drive partagé « Test », le registre portait `dossier_nom = 'Drive'`. C'est le piège que ce module
       * connaît déjà par cœur — `files.get` sur la racine d'un Drive partagé rend le nom GÉNÉRIQUE —, et c'est
       * sa CINQUIÈME apparition : fil d'Ariane, index des empreintes, nettoyage des fantômes, bandeau de
       * déplacement, et maintenant le registre lui-même.
       *
       * 🔴 ET ICI IL COÛTE PLUS CHER QU'AILLEURS, parce qu'il s'ÉCRIT. Un nom d'affichage faux se corrige en
       * rechargeant ; une ligne de registre fausse ment pour toujours — c'est précisément ce que le nettoyage des
       * emplacements fantômes du point 0 de ce lot a passé une nuit à réparer.
       *
       * ⚠️ UN SEUL APPEL DE PLUS, ET SEULEMENT SUR LE NOM GÉNÉRIQUE. Partout ailleurs, rien n'est demandé.
       * ⚠️ ET SON ÉCHEC GARDE LE NOM GÉNÉRIQUE : vague, mais pas faux, et le dépôt ne doit pas échouer pour un nom.
       */
      if (d.valeur.nom !== NOM_GENERIQUE_RACINE_DRIVE || d.valeur.driveId === null) {
        return { nom: d.valeur.nom, driveId: d.valeur.driveId };
      }
      const vrai = await nomDuDrive(jeton, d.valeur.driveId, { fetch }).catch(() => null);
      return { nom: vrai ?? d.valeur.nom, driveId: d.valeur.driveId };
    },
  };
}

/** Les pièces RÉELLEMENT conservées d'un message — celles que « Tout ajouter au Drive » peut copier. */
export async function piecesDeposablesDuMessage(messageId: number): Promise<number[]> {
  return (await lirePiecesDuMessage(messageId)).map((p) => p.pieceId);
}
