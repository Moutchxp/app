import 'server-only';
import { lirePieceANommer, ecrireNomUsage, journaliserRenommage, noterNomEcritDansDrive } from './nomUsageRepo';
import type { IssuePiece } from './depotDrive';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — « RENOMMER AVANT DE RANGER » ÉCRIT LE NOM D'USAGE ═════════════════════
 *
 * CAS RÉEL D'ARNO (fil 36575, pièce `0836_001.pdf`, 30/09/2026) : « Arno la renomme “Recommandé M Ahmed KHARRAT”
 * avec le stylo, puis la glisse dans le dossier Test. […] Ensuite, la carte de la pièce dans le mail affiche
 * encore “0836_001.pdf” au lieu du nouveau nom. »
 *
 * ═══ 🔴 CE QU'ON A TROUVÉ EN BASE, ET QUI EXPLIQUE TOUT ═════════════════════════════════════════════════════
 *
 *   gestion_piece       id 26994   nom_fichier '0836_001.pdf'          nom_usage  NULL
 *   gestion_piece_drive id 26545   nom_depose  'Recommandé M Ahmed KHARRAT.pdf'   nom_drive  NULL
 *
 * DEUX MANQUES, ET CHACUN CASSE UNE PROMESSE DIFFÉRENTE :
 *
 * ① `nom_usage` EST RESTÉ NUL. Le stylo de la fenêtre « ranger » (lot RENOMMER-AVANT-RANGER) ne nommait que la
 *    COPIE : le nom voyageait avec la requête de dépôt et mourait avec elle. Tout l'affichage lit pourtant
 *    `coalesce(nom_usage, nom_fichier)` — la carte du message rendait donc fidèlement `0836_001.pdf`. Ce n'était
 *    pas un défaut d'affichage : il n'y avait rien d'autre à afficher.
 *
 * ② `nom_drive` EST RESTÉ NUL. C'est le REGISTRE des noms que l'application a elle-même écrits dans le Drive
 *    (migration 286). Sans lui, la reprise des renommages faits dans Google Drive laisse cette copie tranquille
 *    POUR TOUJOURS — c'est sa règle, et c'est la bonne : « ne pas savoir ce qu'on y a écrit n'est pas une raison
 *    de renommer, c'est exactement la raison de ne pas le faire ». La copie tombait donc hors de portée du
 *    mécanisme même qui devait la tenir à jour.
 *
 * 🔴 LES DEUX SE RÉPARENT AU MÊME ENDROIT ET AU MÊME MOMENT : quand Google a confirmé la création. Avant, on
 * écrirait un nom pour un fichier qui n'existe peut-être pas ; après, il faudrait retrouver l'occasion.
 *
 * ⚠️ CE MODULE N'ÉCRIT JAMAIS DANS LE DRIVE. Il n'aligne pas les AUTRES copies sur le nouveau nom — c'est le
 * geste du stylo de la visionneuse (`renommagePieceReel`), qui passe par le registre et par le verdict de
 * l'archive. Ici, on ne fait que CONSIGNER ce qui vient d'être fait.
 */

/** Ce qu'on a consigné, pour que l'appelant puisse le dire. */
export interface BilanNomDepose {
  /** Le nom d'usage a-t-il été écrit (ou confirmé) sur la pièce ? */
  nomUsageEcrit: boolean;
  /** Les identifiants Drive inscrits au registre sous ce nom. */
  idsNotes: string[];
}

/**
 * CONSIGNE le nom d'un dépôt qui vient d'aboutir.
 *
 * @param nomChoisi le nom demandé au dépôt, déjà nettoyé et validé par la route. Vide ⇒ rien à consigner : la
 *   pièce est partie sous son nom courant, et il est déjà celui de la base.
 *
 * ⚠️ IL NE LÈVE JAMAIS. Un dépôt réussi ne doit pas devenir un échec parce qu'on n'a pas su noter son nom : le
 * fichier EST dans le Drive, et le dire faussement raté enverrait le déposer une seconde fois.
 */
export async function consignerNomDuDepot(
  pieceId: number, nomChoisi: string, issues: readonly IssuePiece[],
  auteur: { id: number | null; libelle: string },
): Promise<BilanNomDepose> {
  const vide: BilanNomDepose = { nomUsageEcrit: false, idsNotes: [] };
  const nom = nomChoisi.trim();
  if (nom === '') return vide;

  /* 🔴 SEULEMENT LES DÉPÔTS CONFIRMÉS PAR GOOGLE. Un « déjà là » porte l'identifiant d'une copie faite AVANT, qui
     n'a pas été écrite sous ce nom-ci : l'inscrire au registre sous un nom qu'elle ne porte pas ferait croire, à
     la reprise suivante, qu'un humain l'a renommée dans Drive. Le registre doit dire ce QU'ON A ÉCRIT, rien d'autre. */
  const ids = issues
    .filter((i): i is Extract<IssuePiece, { etat: 'depose' }> => i.etat === 'depose' && i.pieceId === pieceId)
    .map((i) => i.driveFileId)
    .filter((x) => x !== '');
  if (ids.length === 0) return vide;

  try {
    const avant = await lirePieceANommer(pieceId);
    const ancien = avant?.nomAffiche ?? '';
    // ⚠️ RIEN À FAIRE SI LE NOM N'A PAS CHANGÉ : on note quand même le registre (le fichier Drive porte bien ce
    //   nom-là), mais on n'écrit ni journal ni colonne pour un geste qui n'en est pas un.
    const change = ancien.trim() !== nom;
    const nomUsageEcrit = change ? await ecrireNomUsage(pieceId, nom) : false;
    await noterNomEcritDansDrive(ids, nom);
    if (change && nomUsageEcrit) {
      await journaliserRenommage({
        pieceId, ancienNom: ancien, nouveauNom: nom, source: 'app', idsDrive: ids, refus: [],
        par: auteur.id, parLibelle: auteur.libelle,
      });
    }
    return { nomUsageEcrit, idsNotes: ids };
  } catch (e) {
    console.error('[gestion/depot] nom du dépôt non consigné', e);
    return vide;
  }
}
