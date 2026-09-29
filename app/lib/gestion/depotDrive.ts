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
  /**
   * ══ 🔴 LOT RANGER-PJ-FIABLE — CE QU'IL FAUT SAVOIR QUAND LES OCTETS NE SONT PLUS LÀ ════════════════════════
   *
   * `stockageVide` : les octets ont été libérés du stockage local. `driveFileId` : la copie Drive PROUVÉE de
   * cette pièce — celle que NOUS avons faite (`origine = 'copie'`), jamais un dépôt manuel.
   *
   * Les deux existaient déjà (`lirePieceAServir`, lot DRIVE-3) et servaient à SERVIR la pièce à l'écran. Le
   * dépôt les ignorait : il lisait les octets, ne les trouvait pas, et échouait. Ils entrent ici pour que ranger
   * une pièce vidée devienne ce qu'il aurait toujours dû être — une copie de dossier à dossier, chez Google.
   *
   * ⚠️ FACULTATIFS : un appelant qui ne les renseigne pas se comporte exactement comme avant ce lot.
   */
  stockageVide?: boolean;
  driveFileId?: string | null;
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
  /**
   * 🔴 COPIER LA PIÈCE D'UN DOSSIER DU DRIVE À UN AUTRE, sans qu'un seul octet repasse par nous (`files.copy`).
   * C'est la voie d'une pièce dont les octets locaux ont été libérés. Absente ⇒ comportement d'avant ce lot.
   */
  copierDepuisDrive?(jeton: string, o: { driveFileId: string; nom: string; dossierId: string }): Promise<Resultat<FichierDepose>>;
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
 * ══ 🔴 POURQUOI UN ÉCHEC NE SE DIT PAS AVEC LES MOTS DE LA MACHINE ══════════════════════════════════════════════
 *
 * Vu à l'écran le 29/09/2026, en rangeant une vraie pièce : « The specified key does not exist. » Le message vient
 * du stockage objet, il est en anglais, et il n'apprend rien à qui le lit — sinon que quelque chose est cassé.
 *
 * 🔴 OR CE CAS-LÀ N'EST PAS UNE PANNE, ET C'EST TOUT CE QUI COMPTE : c'est la trace du VIDAGE du stockage local.
 * Les octets d'une pièce sont libérés une fois que sa copie Drive est prouvée (même taille, même md5) — donc une
 * pièce dont les octets manquent est, presque toujours, une pièce qui EST DÉJÀ dans le Drive, ailleurs. Le dire
 * envoie la chercher ; « The specified key does not exist » envoie ouvrir un ticket.
 *
 * ⚠️ ON NE DEVINE PAS POUR AUTANT : la phrase dit ce qu'on sait (les octets ne sont plus là, et pourquoi), et
 * renvoie au Drive sans affirmer qu'elle y est. Affirmer serait inventer.
 */
function motifEchec(e: unknown): string {
  const brut = (e instanceof Error ? e.message : String(e)).slice(0, 200);
  if (/specified key does not exist|NoSuchKey|not found/i.test(brut)) {
    return 'les octets de cette pièce ne sont plus dans le stockage local — ils sont libérés une fois la copie '
      + 'vers le Drive prouvée. Cherchez-la dans le Drive : elle y est probablement déjà.';
  }
  return brut;
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

      /**
       * ── ② LA COPIE PART. Le nom d'origine est conservé tel quel.
       *
       * ══ 🔴🔴 DEUX VOIES, ET LA SECONDE N'EST PAS UN RATTRAPAGE ═══════════════════════════════════════════
       *
       * · PAR NOS OCTETS, le cas ordinaire : on lit le stockage local et on téléverse ;
       * · PAR LE DRIVE, quand les octets locaux ont été LIBÉRÉS. Ce n'est pas une panne : c'est ce que le vidage
       *   laisse derrière lui, une fois la copie Drive PROUVÉE (même taille, même md5). Google copie alors de
       *   dossier à dossier sans qu'un seul octet repasse par nous — plus rapide, et toujours fidèle.
       *
       * 🔴 CE QUE CELA REMPLACE : un échec, avec le message du stockage objet EN ANGLAIS — « The specified key
       * does not exist. » Refuser de faire ce qui est parfaitement possible, et le dire dans une langue qui
       * envoie ouvrir un ticket.
       *
       * ⚠️ ON TENTE LA VOIE DU DRIVE AUSSI QUAND LA LECTURE DES OCTETS ÉCHOUE alors qu'on les croyait là : la
       * colonne peut dire « plein » et le stockage avoir été nettoyé autrement. L'état réel prime sur ce qu'on
       * en savait.
       */
      const copieDrive = (piece.driveFileId ?? '').trim();
      const parLeDrive = async (): Promise<Resultat<FichierDepose> | null> => {
        if (copieDrive === '' || deps.copierDepuisDrive === undefined) return null;
        return deps.copierDepuisDrive(jeton, { driveFileId: copieDrive, nom: piece.nomFichier, dossierId });
      };

      let envoi: Resultat<FichierDepose> | null = null;
      if (piece.stockageVide === true) {
        envoi = await parLeDrive();
      }
      if (envoi === null) {
        try {
          const octets = await deps.octets(piece.cleStockage);
          envoi = await deps.deposer(jeton, {
            nom: piece.nomFichier, typeMime: piece.typeMime, octets, dossierId,
          });
        } catch (e) {
          // 🔴 LES OCTETS MANQUENT : on essaie le Drive AVANT de déclarer l'échec. S'il n'y a rien à copier,
          //    `motifEchec` dira en français ce qu'on sait, et où chercher.
          envoi = await parLeDrive();
          if (envoi === null) throw e;
        }
      }
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
      issues.push({ pieceId, nomFichier: piece.nomFichier, etat: 'echec', motif: motifEchec(e) });
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
