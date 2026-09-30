import { chaineParents } from './drive';
import { jetonPourSubject } from './driveDelegue';
import { alignerCopiesSurLeNom } from './renommageDrive';
import {
  cheminTouchantLaProduction, nomAffiche, type CopieDrive, type RefusRenommage,
} from './nomUsagePiece';
import {
  ecrireNomUsage, journaliserRenommage, lirePieceANommer, noterNomEcritDansDrive, registreDeLaPiece,
} from './nomUsageRepo';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — RENOMMER UNE PIÈCE, POUR DE VRAI ════════════════════════════════════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, et c'est délibéré — motif F1 du dépôt. La passe qui reprend les noms
 * changés dans Google Drive tourne sous `tsx`, lancée par launchd : `server-only` lève hors du bundle
 * react-server et la tuerait au chargement, sans rapport apparent avec ce qu'elle fait (bug 0d57224). La
 * frontière client est tenue par `clientBoundary.guard.test.ts`.
 *
 * ═══ 🔒 LES DEUX CONTRÔLES SERVEUR, DANS CET ORDRE ══════════════════════════════════════════════════════════════
 *
 * Arno : « Contrôle serveur avant chaque renommage : l'id est bien dans notre registre de fichiers créés par
 * l'app, et toute sa chaîne de parents est hors de “Documents clients scannés”. »
 *
 *   ① LE REGISTRE (`gestion_piece_drive`), en base. Un identifiant qui n'y est pas n'est pas à nous.
 *   ② LA CHAÎNE DE PARENTS, REMONTÉE CHEZ GOOGLE. 🔴 ON NE SE FIE PAS AU NOM DU DOSSIER ENREGISTRÉ : il date du
 *      jour du dépôt, et un dossier peut avoir été DÉPLACÉ sous « Documents clients scannés » depuis. Seule la
 *      remontée dit où le fichier est AUJOURD'HUI.
 *
 * 🔴 LE COÛT DE ② EST ASSUMÉ : une remontée par copie, quelques requêtes en lecture, pour un geste qu'on fait
 * quelques fois par jour. L'économiser reviendrait à écrire dans un dossier dont on croit savoir où il est.
 */

/** Le compte au nom duquel on écrit dans le Drive. Le même que la copie et que la lecture : une seule identité. */
const COMPTE_DRIVE = 'gestion@criterimmo.fr';

export type IssueRenommagePiece =
  | { ok: true; nom: string; faits: string[]; refus: RefusRenommage[] }
  | { ok: false; motif: string };

/**
 * ══ LA CHAÎNE DE PARENTS, VÉRIFIÉE CHEZ GOOGLE ════════════════════════════════════════════════════════════════
 *
 * Rend le motif du refus, ou `null`. Une remontée qui ÉCHOUE est un REFUS : ne pas savoir où est un fichier n'est
 * pas une raison de lui écrire dessus.
 */
export async function verifierChaineHorsProduction(
  accessToken: string, driveFileId: string, deps: { fetch: typeof fetch },
): Promise<string | null> {
  const chaine = await chaineParents(accessToken, driveFileId, deps);
  if (chaine.length === 0) {
    return `la chaîne de parents de ${driveFileId} n’a pas pu être lue : on ne renomme pas à l’aveugle.`;
  }
  for (const maillon of chaine) {
    const touche = cheminTouchantLaProduction(
      { dossierId: maillon.id, dossierNom: maillon.nom, chemin: maillon.nom });
    if (touche !== null) return touche;
  }
  return null;
}

/**
 * ══ 🔴🔴 RENOMMER UNE PIÈCE : LE NOM D'USAGE, PUIS LES COPIES DRIVE ══════════════════════════════════════════
 *
 * L'ORDRE COMPTE. On écrit le nom d'usage EN PREMIER : c'est lui que voient tous les écrans, et c'est lui qui
 * doit survivre si le Drive ne répond pas. Un renommage qui échouerait côté Drive laisse donc une pièce
 * correctement nommée chez nous, avec ses copies à réaligner — que la passe de reprise finira par rattraper.
 *
 * L'inverse (Drive d'abord) laisserait des copies renommées et une pièce qui ne le sait pas : le nom serait
 * perdu pour l'application, alors même qu'il est écrit dans le Drive.
 */
export async function renommerPiece(o: {
  pieceId: number;
  nom: string;
  par: number | null;
  parLibelle: string;
  /** `false` (défaut) : on écrit dans le Drive. `true` : on n'écrit que chez nous — sert à la reprise. */
  sansDrive?: boolean;
  /**
   * 🔴 `true` : ON N'ÉCRIT PAS DE LIGNE DE JOURNAL. Réservé à la reprise depuis Google Drive, qui en a DÉJÀ écrit
   * une (« renommé dans Google Drive ») et ne fait ici qu'aligner les autres copies. Deux lignes pour un seul
   * fait feraient lire deux renommages dans l'historique.
   */
  sansJournal?: boolean;
}, deps: { fetch: typeof fetch } = { fetch }): Promise<IssueRenommagePiece> {
  const piece = await lirePieceANommer(o.pieceId);
  if (piece === null) return { ok: false, motif: 'Cette pièce jointe est inconnue.' };

  const nom = o.nom.trim();
  if (nom === '') return { ok: false, motif: 'Un nom vide n’est pas un nom.' };

  const ancien = piece.nomAffiche;
  if (!(await ecrireNomUsage(o.pieceId, nom))) {
    return {
      ok: false,
      motif: 'Mise à jour de la base à appliquer (migration 286) : le nom d’usage n’est pas encore installé.',
    };
  }

  const tracer = async (idsDrive: readonly string[], refus: readonly RefusRenommage[]): Promise<void> => {
    if (o.sansJournal === true) return;
    await journaliserRenommage({
      pieceId: o.pieceId, ancienNom: ancien, nouveauNom: nom, source: 'app',
      idsDrive, refus, par: o.par, parLibelle: o.parLibelle,
    });
  };

  if (o.sansDrive === true || piece.copies.length === 0) {
    await tracer([], []);
    return { ok: true, nom, faits: [], refus: [] };
  }

  const jeton = await jetonPourSubject(COMPTE_DRIVE, deps);
  if (!jeton.ok) {
    await tracer([], [{ driveFileId: '(tous)', motif: jeton.motif }]);
    // 🔴 LE NOM EST QUAND MÊME CHANGÉ CHEZ NOUS : on rend `ok`, avec le refus en clair. Annuler l'écriture locale
    //   parce que Google ne répond pas ferait perdre un geste que la personne a fait.
    return { ok: true, nom, faits: [], refus: [{ driveFileId: '(tous)', motif: jeton.motif }] };
  }

  // ── ② LA CHAÎNE DE PARENTS, COPIE PAR COPIE, AVANT LA MOINDRE ÉCRITURE ────────────────────────────────────
  const sures: CopieDrive[] = [];
  const refusChaine: RefusRenommage[] = [];
  for (const c of piece.copies) {
    const motif = await verifierChaineHorsProduction(jeton.jeton, c.driveFileId, deps);
    if (motif === null) sures.push(c); else refusChaine.push({ driveFileId: c.driveFileId, motif });
  }

  const bilan = await alignerCopiesSurLeNom(
    { accessToken: jeton.jeton, nom, copies: sures, registre: await registreDeLaPiece(o.pieceId) }, deps);

  /**
   * 🔴🔴 ON NOTE CE QU'ON VIENT D'ÉCRIRE DANS LE DRIVE. C'est cette mémoire, et elle seule, qui permettra de
   * reconnaître un renommage HUMAIN plus tard : Drive disant autre chose que ce qu'on y a mis. La première
   * version s'en passait, comparait au nom de la PIÈCE, et « reprenait » 60 pièces sur 60 — parce que les copies
   * de « 00 Arrivée des mails » portent un préfixe « date — expéditeur — » qui n'est pas le nom de la pièce.
   */
  await noterNomEcritDansDrive(bilan.faits, nom);

  const refus = [...refusChaine, ...bilan.refus];
  await tracer(bilan.faits, refus);
  return { ok: true, nom, faits: bilan.faits, refus };
}

/** Le nom affiché d'une pièce, pour les appelants qui n'ont que les deux valeurs. Réexporté : une seule règle. */
export { nomAffiche };
