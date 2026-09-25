/**
 * MODULE « GESTION » — LOT 5-PJ-B : DÉPOSER DES PIÈCES DANS LE DRIVE, pièce par pièce. Orchestration par INJECTION :
 * aucun import lourd, tout s'éprouve avec des doublures.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE RÉSULTAT EST RENDU PIÈCE PAR PIÈCE, JAMAIS EN BLOC. « Tout ajouter au Drive » sur huit pièces peut très bien
 * en déposer six, en trouver une déjà là et en rater une : un « OK » global serait un mensonge, et un « échec »
 * global en serait un autre — il ferait recommencer six dépôts réussis. Chaque pièce rend son propre verdict.
 *
 * 🔴 L'ORIGINAL N'EST JAMAIS EFFACÉ. Ce lot DÉPOSE UNE COPIE, un point c'est tout. L'effacement des originaux est le
 * lot D, et ce sera une décision à part — avec ses propres garanties.
 *
 * 🔴 LE DOUBLON N'EST PAS UNE ERREUR. La même pièce dans le MÊME dossier est refusée par la base (index unique de la
 * migration 245) et rendue comme « déjà là », avec le lien vers le fichier existant. C'est une information utile, pas
 * un échec — et surtout, pas un second exemplaire du même bail dans le Drive d'un propriétaire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { FichierDepose } from './drive';
import type { ADeposer, DepotDrive, IssueMemorisation } from './driveRepo';
import type { EtatGoogle } from './jetonAcces';
import type { Resultat } from './google';

/** Ce qu'on sait d'une pièce avant de la déposer. */
export interface PieceADeposer {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  cleStockage: string;
}

/** Le verdict d'UNE pièce. Le mot est toujours lisible par un humain : c'est lui qui s'affichera. */
export type IssuePiece =
  | { pieceId: number; nomFichier: string; etat: 'depose'; lien: string | null }
  | { pieceId: number; nomFichier: string; etat: 'deja'; lien: string | null }
  | { pieceId: number; nomFichier: string; etat: 'echec'; motif: string };

export interface DepsDepot {
  /** `null` = pièce inconnue, ou jamais déposée sur le stockage : il n'y a rien à copier. */
  lirePiece(pieceId: number): Promise<PieceADeposer | null>;
  octets(cleStockage: string): Promise<Uint8Array>;
  depotExistant(pieceId: number, dossierId: string): Promise<DepotDrive | null>;
  deposer(jeton: string, o: { nom: string; typeMime: string | null; octets: Uint8Array; dossierId: string }): Promise<Resultat<FichierDepose>>;
  memoriser(d: ADeposer): Promise<IssueMemorisation>;
  /** Le nom du dossier au moment du dépôt, et son Drive. `null` si le Drive ne le dit pas : on déposera quand même. */
  infosDossier(jeton: string, dossierId: string): Promise<{ nom: string; driveId: string | null } | null>;
}

export interface Auteur {
  id: number | null;
  libelle: string;
  /** LOT 5-PJ-C — le compte Google employé. Journalisé avec le dépôt : c'est lui qui possède le fichier côté Drive. */
  compteGoogle?: string | null;
}

/**
 * DÉPOSE une liste de pièces dans UN dossier.
 *
 * Le jeton est demandé UNE fois pour toute la série : redemander un jeton par pièce multiplierait les allers-retours
 * sans rien garantir de plus (il vaut une heure). Le nom du dossier aussi — il ne change pas entre deux pièces.
 */
export async function deposerPieces(
  deps: DepsDepot, jeton: string, pieceIds: readonly number[], dossierId: string, auteur: Auteur,
): Promise<IssuePiece[]> {
  const infos = await deps.infosDossier(jeton, dossierId);
  const issues: IssuePiece[] = [];

  for (const pieceId of pieceIds) {
    const piece = await deps.lirePiece(pieceId);
    if (piece === null) {
      issues.push({ pieceId, nomFichier: `pièce ${pieceId}`, etat: 'echec', motif: 'cette pièce n’est pas conservée par l’application' });
      continue;
    }
    try {
      // ── ① DÉJÀ LÀ ? On demande AVANT de téléverser : inutile de pousser 25 Mo pour se faire refuser ensuite.
      //      (La base reste l'arbitre final — cf. `memoriser`, qui tranche entre deux clics simultanés.)
      const deja = await deps.depotExistant(pieceId, dossierId);
      if (deja !== null) {
        issues.push({ pieceId, nomFichier: piece.nomFichier, etat: 'deja', lien: deja.webViewLink });
        continue;
      }

      // ── ② LA COPIE PART. Le nom d'origine est conservé tel quel.
      const octets = await deps.octets(piece.cleStockage);
      const envoi = await deps.deposer(jeton, {
        nom: piece.nomFichier, typeMime: piece.typeMime, octets, dossierId,
      });
      if (!envoi.ok) {
        issues.push({ pieceId, nomFichier: piece.nomFichier, etat: 'echec', motif: envoi.motif });
        continue;
      }

      // ── ③ ON S'EN SOUVIENT. Un refus ICI veut dire qu'une autre main a déposé entre-temps : le fichier est bien
      //      là-bas, et c'est un « déjà là », pas un échec — nier un fichier qui existe serait le vrai mensonge.
      const memo = await deps.memoriser({
        pieceId, driveFileId: envoi.valeur.id, dossierId,
        dossierNom: infos?.nom ?? null, driveId: infos?.driveId ?? null,
        webViewLink: envoi.valeur.webViewLink, auteurId: auteur.id, auteurLibelle: auteur.libelle,
        compteGoogle: auteur.compteGoogle ?? null,
      });
      issues.push({
        pieceId, nomFichier: piece.nomFichier,
        etat: memo.etat === 'doublon' ? 'deja' : 'depose',
        lien: envoi.valeur.webViewLink,
      });
    } catch (e) {
      // Une pièce qui casse n'emporte pas les autres : c'est toute la raison du verdict par pièce.
      issues.push({
        pieceId, nomFichier: piece.nomFichier, etat: 'echec',
        motif: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      });
    }
  }
  return issues;
}

/**
 * LE COMPTE RENDU, en une phrase française. Pas de « 3/5 » : on dit ce qui est parti, ce qui était déjà là et ce qui
 * a raté, avec les mots correspondants. PUR.
 */
export function resumerDepot(issues: readonly IssuePiece[]): string {
  const n = (e: IssuePiece['etat']): number => issues.filter((i) => i.etat === e).length;
  const morceaux: string[] = [];
  if (n('depose') > 0) morceaux.push(`${n('depose')} pièce${n('depose') > 1 ? 's' : ''} déposée${n('depose') > 1 ? 's' : ''}`);
  if (n('deja') > 0) morceaux.push(`${n('deja')} déjà dans ce dossier`);
  if (n('echec') > 0) morceaux.push(`${n('echec')} en échec`);
  return morceaux.length === 0 ? 'Aucune pièce à déposer.' : `${morceaux.join(' · ')}.`;
}

/** Ce que l'écran dit quand Google n'est pas joignable, selon la raison. Les deux ne se réparent pas pareil. PUR. */
export function messageEtatGoogle(etat: EtatGoogle): string {
  if (etat.etat === 'ok') return '';
  return etat.etat === 'non_connecte'
    ? 'Drive non connecté — voir réglages'
    : 'La connexion Google a expiré — il faut refaire l’autorisation dans les réglages';
}
