import 'server-only';
import { deposerFichier, lireDossier, type LecteurDossier } from './drive';
import { lireDepotExistant, memoriserDepot } from './driveRepo';
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
      return p === null ? null
        : { pieceId, nomFichier: p.nomFichier, typeMime: p.typeMime, cleStockage: p.cleStockage };
    },
    octets: async (cle: string) => new Uint8Array(await recuperer(cle)),
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
