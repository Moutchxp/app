import { RACINE_NOM } from './driveGardeFou';
import { NOM_INACTIFS } from './rangementDossiersCopies';

/**
 * ══ 🔴🔴 LA RÈGLE ACTIFS / INACTIFS DU DRIVE (Arno, 20/10/2026 — PERMANENTE). PUR. ══════════════════════════════════════
 *
 *   · Seuls passent dans « Inactifs » : un BIEN avec toute son arborescence (son N5 et tout ce qu'il contient), ou un
 *     PROPRIÉTAIRE avec toute son arborescence (son N3, ses adresses, tous ses biens et tout leur contenu). Un déplacement
 *     Drive emporte le dossier ENTIER : déplacer le N5 ou le N3, c'est déplacer « en entier ».
 *   · Un dossier BAIL ne quitte JAMAIS le « 6 Locataires » de son bien. La sortie d'un locataire, la fin d'un bail ou un
 *     préavis ne déplacent rien sur le Drive : les baux s'y cumulent. Les dossiers du bail (pièces, sous-pièces) restent
 *     dans leur bail.
 *
 * La règle porte sur les dossiers de L'ARBORESCENCE (ceux du registre `gestion_drive_noeud`, migration 389) : un fichier,
 * ou un dossier que l'application n'a pas posé, se range comme avant.
 */

/** Les sortes du registre qui forment un BAIL : elles ne se déplacent jamais. */
export const SORTES_DU_BAIL = ['bail', 'piece_bail', 'sous_piece_bail'] as const;
/** Les seules sortes du registre qui passent ENTIÈRES dans « Inactifs ». */
export const SORTES_VERS_INACTIFS = ['bien', 'proprietaire'] as const;

/** La destination est-elle dans « Inactifs » (le N2 sous « Base de données locative ») ? `chaine` part de la cible. PUR. */
export function dansInactifs(chaine: readonly { id: string; nom: string; parentId: string | null }[]): boolean {
  return chaine.some((m, i) => m.nom.trim() === NOM_INACTIFS && chaine[i + 1]?.nom.trim() === RACINE_NOM);
}

/**
 * LE VERDICT pour UN dossier de l'arborescence qu'on veut déplacer. `sorte` : sa sorte au registre (`null` : il n'y est
 * pas — la règle ne s'applique pas). `null` = permis ; sinon le motif du refus. PUR.
 */
export function refusActifsInactifs(o: { sorte: string | null; cibleDansInactifs: boolean }): string | null {
  if (o.sorte === null) return null;
  if ((SORTES_DU_BAIL as readonly string[]).includes(o.sorte)) {
    return 'Un dossier de bail ne quitte jamais le dossier « 6 Locataires » de son bien : la sortie d’un locataire ou la fin d’un bail ne déplace rien sur le Drive.';
  }
  if (o.cibleDansInactifs && !(SORTES_VERS_INACTIFS as readonly string[]).includes(o.sorte)) {
    return 'Seuls un bien ou un propriétaire passent dans « Inactifs », avec toute leur arborescence : déplacez le dossier du bien ou celui du propriétaire.';
  }
  return null;
}
