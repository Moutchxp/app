import { PRODUCTION_INTERDITE } from './classement';
import { SOUS_DOSSIERS_PRODUCTION } from './classementDrive';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE NOM D'USAGE D'UNE PIÈCE. Module PUR. ══════════════════════════════════
 *
 * Arno : « une pièce jointe ne doit avoir qu'un seul nom, qu'elle soit dans un mail ou dans le Drive ».
 *
 * ═══ CE QUE ÇA RÉPARE ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le nom appartenait au DÉPÔT. `gestion_piece_drive.nom_depose` (lot RENOMMER-AVANT-RANGER) garde le nom donné à
 * UNE copie au moment de la ranger : une pièce rangée dans deux dossiers portait donc deux noms, et le mail en
 * gardait un troisième — celui du correspondant. Le nom appartient désormais à la PIÈCE, et les copies le suivent.
 *
 * ═══ DEUX NOMS, ET UN SEUL SE MODIFIE ═══════════════════════════════════════════════════════════════════════════
 *
 *   · LE NOM D'ORIGINE (`gestion_piece.nom_fichier`) est en LECTURE SEULE. C'est sous lui que le correspondant a
 *     envoyé la pièce, et c'est lui qu'on cherchera dans Gmail — où l'on ne peut de toute façon rien renommer.
 *   · LE NOM D'USAGE est celui qu'on affiche et qu'on envoie. `null` = il n'a jamais été changé, et vaut alors le
 *     nom d'origine. Ce repli est toute la raison pour laquelle la migration ne remplit pas 27 000 lignes.
 *
 * ═══ 🔒 CE QUE CE MODULE GARANTIT, ET QUI N'EST PAS NÉGOCIABLE ══════════════════════════════════════════════════
 *
 * 🔴🔴 IL NE LAISSE RENOMMER QUE CE QUE L'APPLICATION A ELLE-MÊME CRÉÉ. Décision d'Arno du 30/09/2026 : l'app
 * peut renommer dans le Drive, mais UNIQUEMENT les copies de « 00 Arrivée des mails » et les fichiers déposés par
 * « Ranger » ou « Copier » — c'est-à-dire les identifiants qui figurent dans `gestion_piece_drive`. Jamais un
 * autre fichier. Jamais rien sous 🔴🔴 « Documents clients scannés ».
 *
 * 🔒 LA GARANTIE NE TIENT PAS À UNE PROMESSE FAITE AU LECTEUR : elle tient à ce que la liste des identifiants
 * renommables vienne de NOTRE registre, et à ce que la chaîne de parents soit vérifiée avant chaque écriture. Les
 * deux sont éprouvés — ici pour la décision, dans `renommageDrive.test.ts` pour l'écriture.
 */

/** Ce qu'il faut savoir d'une pièce pour l'afficher sous son nom. */
export interface PieceNommee {
  /** Le nom sous lequel le correspondant l'a envoyée. Jamais modifié. */
  nomOrigine: string;
  /** Le nom d'usage. `null` = jamais renommée, donc le nom d'origine. */
  nomUsage: string | null;
}

/**
 * LE NOM À AFFICHER ET À ENVOYER. PUR.
 *
 * ⚠️ UN NOM D'USAGE VIDE OU BLANC RETOMBE SUR L'ORIGINE : une pièce sans nom du tout n'existe pas à l'écran, et
 * une chaîne blanche en base (un jour, par accident) ne doit pas la faire disparaître.
 */
export function nomAffiche(p: PieceNommee): string {
  const u = (p.nomUsage ?? '').trim();
  return u === '' ? p.nomOrigine : u;
}

/** Les deux noms diffèrent-ils ? C'est ce qui décide d'afficher la mention « reçue sous : … ». PUR. */
export function aEteRenommee(p: PieceNommee): boolean {
  const u = (p.nomUsage ?? '').trim();
  return u !== '' && u !== p.nomOrigine;
}

/**
 * LA MENTION DISCRÈTE, dans les mots d'Arno : « reçue sous : <nom d'origine> ». PUR.
 *
 * 🔴 ELLE EXISTE PARCE QUE LE MAIL, LUI, N'A PAS CHANGÉ. Gmail garde la pièce sous son nom d'origine et ne permet
 * pas de la renommer : sans cette mention, une pièce renommée deviendrait introuvable dans le courrier d'où elle
 * vient — on chercherait « Quittance juillet.pdf » dans un mail qui dit « scan_0042.pdf ».
 */
export function mentionRecueSous(p: PieceNommee): string | null {
  return aEteRenommee(p) ? `reçue sous : ${p.nomOrigine}` : null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 QUELLES COPIES DRIVE PEUVENT ÊTRE RENOMMÉES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une copie Drive de la pièce, telle que notre registre la connaît. */
export interface CopieDrive {
  driveFileId: string;
  /** Le dossier qui la contient, et son nom : les deux servent au contrôle de sécurité. */
  dossierId: string;
  dossierNom: string | null;
  /** Le chemin complet, quand on le connaît. Une chaîne de plus à contrôler, jamais une de moins. */
  chemin?: string | null;
  /** `copie` = « 00 Arrivée des mails » ; `manuel` = déposée par « Ranger » ou « Copier ». Les deux sont à nous. */
  origine: string;
}

export type RefusRenommage = { driveFileId: string; motif: string };

/**
 * ══ 🔴🔴 LE TRI : CE QU'ON RENOMME, ET CE QU'ON REFUSE, AVEC LE MOTIF ══════════════════════════════════════════
 *
 * Arno : « Contrôle serveur avant chaque renommage : l'id est bien dans notre registre de fichiers créés par
 * l'app, et toute sa chaîne de parents est hors de “Documents clients scannés”. Sinon refus avec le motif, et le
 * renommage des autres copies continue. »
 *
 * 🔴 « ET LE RENOMMAGE DES AUTRES COPIES CONTINUE » EST LA PARTIE QU'ON OUBLIE. Un refus n'est pas une panne :
 * c'est une copie qu'on ne touche pas, et les autres doivent quand même porter le bon nom. S'arrêter au premier
 * refus laisserait la pièce avec trois noms au lieu de deux.
 *
 * ⚠️ CE MODULE NE LIT RIEN. Le registre et les chemins lui sont DONNÉS : c'est ce qui permet d'éprouver la
 * décision sans Drive, sans base et sans réseau — et c'est ce qui empêche ce fichier de pouvoir se tromper sur ce
 * qu'il lit.
 */
export function trierCopiesARenommer(
  copies: readonly CopieDrive[],
  registre: ReadonlySet<string>,
  /** Les identifiants de dossiers de production CONNUS, quand on en a. Une garde de plus, jamais une de moins. */
  productionConnue: ReadonlySet<string> = new Set(),
): { aRenommer: CopieDrive[]; refus: RefusRenommage[] } {
  const aRenommer: CopieDrive[] = [];
  const refus: RefusRenommage[] = [];
  const vus = new Set<string>();

  for (const c of copies) {
    const id = c.driveFileId.trim();
    if (id === '') continue;
    // ⚠️ UNE COPIE N'EST RENOMMÉE QU'UNE FOIS : le registre peut porter deux lignes pour un même fichier (deux
    //   dossiers, un ré-enregistrement). Deux écritures identiques ne cassent rien, mais elles se comptent.
    if (vus.has(id)) continue;
    vus.add(id);

    // ── ① LE FICHIER EST-IL L'UN DES NÔTRES ? ──────────────────────────────────────────────────────────────────
    if (!registre.has(id)) {
      refus.push({ driveFileId: id, motif: motifHorsRegistre(id) });
      continue;
    }

    // ── ② SA CHAÎNE DE PARENTS EST-ELLE HORS DE LA PRODUCTION ? ────────────────────────────────────────────────
    const production = cheminTouchantLaProduction(c, productionConnue);
    if (production !== null) {
      refus.push({ driveFileId: id, motif: production });
      continue;
    }

    aRenommer.push(c);
  }
  return { aRenommer, refus };
}

/** Le motif d'un refus pour cause d'identifiant inconnu. Écrit une fois : l'écran et le journal le partagent. PUR. */
export function motifHorsRegistre(driveFileId: string): string {
  return `le fichier ${driveFileId} n’est pas une copie que ce programme a créée : il n’est pas renommé.`;
}

/**
 * LE CHEMIN DE CETTE COPIE TOUCHE-T-IL LA PRODUCTION ? Rend le motif, ou `null`. PUR.
 *
 * 🔴🔴 ON REGARDE TOUT CE QU'ON A : le nom du dossier, le chemin complet, et les identifiants connus de
 * production. Trois façons de reconnaître le même interdit — parce qu'aucune des trois n'est toujours disponible,
 * et qu'il suffit qu'UNE seule attrape le cas pour que l'écriture n'ait pas lieu.
 */
export function cheminTouchantLaProduction(
  c: Pick<CopieDrive, 'dossierId' | 'dossierNom' | 'chemin'>,
  productionConnue: ReadonlySet<string> = new Set(),
): string | null {
  const interdits = [PRODUCTION_INTERDITE.toLowerCase(), ...SOUS_DOSSIERS_PRODUCTION.map((s) => s.toLowerCase())];
  for (const texte of [c.chemin, c.dossierNom]) {
    const t = (texte ?? '').toLowerCase();
    if (t === '') continue;
    const mot = interdits.find((i) => t.includes(i));
    if (mot !== undefined) {
      return `le chemin « ${texte} » désigne « ${PRODUCTION_INTERDITE} » (« ${mot} ») : rien n’y est renommé.`;
    }
  }
  const d = (c.dossierId ?? '').trim();
  if (d !== '' && productionConnue.has(d)) {
    return `le dossier ${d} est un dossier de production connu : rien n’y est renommé.`;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 QUAND LE NOM A CHANGÉ DANS GOOGLE DRIVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce que Drive rend d'un fichier quand on relit ses métadonnées. */
export interface NomVuDansDrive {
  driveFileId: string;
  nom: string;
  /** `modifiedTime` — c'est lui qui départage deux copies aux noms différents. */
  modifieLe: string | null;
}

/**
 * ══ 🔴🔴 LE NOM REPRIS DEPUIS GOOGLE DRIVE ═════════════════════════════════════════════════════════════════════
 *
 * Arno : « Si le nom a changé dans Drive, le nom d'usage de la pièce le reprend. Si plusieurs copies d'une même
 * pièce ont des noms différents, la plus récemment modifiée gagne, et les autres copies sont alignées. »
 *
 * 🔴 « LA PLUS RÉCEMMENT MODIFIÉE GAGNE » EST UNE RÈGLE D'ARBITRAGE, PAS UNE PRÉFÉRENCE. Deux copies renommées
 * différemment sont deux intentions contradictoires ; sans règle écrite, on prendrait celle que la requête rend
 * en premier — c'est-à-dire au hasard, et pas le même hasard d'une fois sur l'autre.
 *
 * ⚠️ UNE DATE ILLISIBLE OU ABSENTE PERD TOUJOURS : on ne fait pas gagner une copie dont on ne sait pas quand elle
 * a changé. À égalité parfaite, l'identifiant tranche — pour que deux passes successives donnent le même résultat.
 *
 * Rend `null` quand il n'y a rien à reprendre : aucune copie, ou toutes déjà au nom d'usage.
 */
export function nomRepriseDepuisDrive(
  nomActuel: string, vus: readonly NomVuDansDrive[],
): { nom: string; venantDe: string } | null {
  let gagnant: { nom: string; venantDe: string; t: number; id: string } | null = null;
  for (const v of vus) {
    const nom = v.nom.trim();
    if (nom === '' || nom === nomActuel) continue;
    const brut = Date.parse(v.modifieLe ?? '');
    const t = Number.isNaN(brut) ? -Infinity : brut;
    if (gagnant === null
      || t > gagnant.t
      || (t === gagnant.t && v.driveFileId > gagnant.id)) {
      gagnant = { nom, venantDe: v.driveFileId, t, id: v.driveFileId };
    }
  }
  return gagnant === null ? null : { nom: gagnant.nom, venantDe: gagnant.venantDe };
}

/** La ligne de journal d'une reprise, dans les mots d'Arno. PUR. */
export const SOURCE_DRIVE = 'renommé dans Google Drive';

/**
 * ══ 🔴 LE MESSAGE D'UN DOUBLON DE NOM DANS UN MÊME DOSSIER ═════════════════════════════════════════════════════
 *
 * Arno : « Doublon de nom dans le même dossier Drive : même règle que Drive (les deux conservés), avec un
 * message. »
 *
 * 🔴 ON NE REFUSE PAS, ET ON NE RENOMME PAS « (2) ». Google Drive accepte deux fichiers de même nom dans un même
 * dossier — c'est sa règle, pas la nôtre, et la contredire créerait un nom que personne n'a demandé. On fait donc
 * ce que fait Drive, et l'on DIT que c'est arrivé : un doublon silencieux se découvre trois mois plus tard, quand
 * on ouvre le mauvais des deux.
 */
export function mentionDoublonDossier(nom: string, dossier: string | null): string {
  const ou = (dossier ?? '').trim() === '' ? 'ce dossier' : `« ${(dossier as string).trim()} »`;
  return `Un autre fichier de ${ou} porte déjà le nom « ${nom} ». Les deux sont conservés, comme le fait Google `
    + 'Drive ; vérifiez lequel vous voulez ouvrir.';
}
