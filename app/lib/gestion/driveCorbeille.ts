import { DOSSIER_INTERDIT_LECTURE, situer, type Maillon } from './driveLectureFichier';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « SUPPRIMER » : LA RÈGLE, ET RIEN QUE LA RÈGLE. Module PUR ═══
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE LOT LÈVE UN INTERDIT QUI TENAIT DEPUIS LE LOT DRIVE-1, ET IL FAUT L'ÉCRIRE EN TÊTE.
 *
 * « L'application ne supprime jamais rien du Drive » : c'était la règle, et elle est écrite partout. DÉCISION
 * D'ARNO DU 03/10/2026 : elle est levée POUR CE SEUL CAS — la mise à la CORBEILLE du Drive.
 *
 * 🔴 ET LA LEVÉE EST BORNÉE PAR CE QUI LA REND ACCEPTABLE : la corbeille est RÉVERSIBLE.
 *   · trente jours chez Google, où n'importe qui peut aller rechercher le document ;
 *   · et tout de suite, par « Annuler le dernier déplacement », qui sait désormais défaire une corbeille.
 *
 * 🔴🔴 CE QUI RESTE INTERDIT, SANS AUCUNE EXCEPTION ET POUR TOUJOURS : la suppression DÉFINITIVE. Ni
 * `files.delete`, ni `files.emptyTrash`, nulle part. Ces deux-là ne se défont pas, et c'est exactement la
 * différence qui autorise l'une et interdit l'autre. Un test statique les cherche dans le fichier qui écrit.
 *
 * ═══ 🔴🔴 LES CINQ INTERDITS DE CE GESTE ════════════════════════════════════════════════════════════════════════
 *
 *   ① UN DOSSIER NE SE MET JAMAIS À LA CORBEILLE. Un dossier emporte tout ce qu'il contient, sans qu'on voie
 *      quoi : trente documents peuvent partir sur un clic destiné à un seul. Arno le dit en toutes lettres
 *      (« sur une ligne de FICHIER uniquement. Jamais sur un dossier »), et c'est ici que c'est tenu.
 *   ② RIEN DE CE QUI EST SOUS « Documents clients scannés » N'Y TOUCHE, à aucune profondeur. L'archive du cabinet
 *      ne se lit pas ; elle ne se met pas davantage à la corbeille.
 *   ③ NI L'ARCHIVE ELLE-MÊME, NI AUCUN DE SES ANCÊTRES — c'est l'interdit qu'on oublie : mettre « GESTION
 *      LOCATIVE » à la corbeille emporterait l'archive avec lui.
 *   ④ NE PAS SAVOIR VAUT INTERDIT. Chaîne trouée, cycle, profondeur dépassée : on refuse.
 *   ⑤ RIEN SANS CONFIRMATION. Elle est rendue par ce module (`phraseCorbeille`), pour que l'écran ne puisse pas
 *      inventer une phrase plus légère que ce que le geste fait réellement.
 *
 * 🔴 CE MODULE EST PUR, ET C'EST VOLONTAIRE : la règle se rejoue sans réseau, exhaustivement, dans son test. La
 * route, elle, ne fait que lui fournir les chaînes réelles — et elle les redemande à Google à chaque appel, jamais
 * à l'écran. Même séparation qu'au lot DRIVE-DEPLACER (`driveDeplacement` / `driveMouvement`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type VerdictCorbeille = { ok: true } | { ok: false; motif: string };

/** Ce que le garde a besoin de savoir, et qui vient toujours de Google — jamais du navigateur. */
export interface ContexteCorbeille {
  /** Les maillons connus : ceux du FICHIER visé et ceux de l'archive, dans un seul index. */
  index: ReadonlyMap<string, Maillon>;
  /** 🔴🔴 L'archive ET tous ses ancêtres. Y toucher emporterait l'archive : c'est l'interdit ③. */
  protegesEtAncetres: ReadonlySet<string>;
  /** Les dossiers protégés EUX-MÊMES. Un fichier qui EST l'un d'eux n'existe pas, mais la symétrie est gratuite. */
  proteges: ReadonlySet<string>;
}

const MOTIF_DOSSIER =
  'Refusé : un DOSSIER ne se met pas à la corbeille depuis cette fenêtre. Il emporterait tout ce qu’il contient — '
  + 'y compris ce qu’on ne voit pas à l’écran. Seuls les fichiers, un par un.';
const MOTIF_ARCHIVE =
  `Refusé : ce fichier est dans « ${DOSSIER_INTERDIT_LECTURE} ». L’archive du cabinet ne se lit pas, et rien n’en `
  + 'sort — pas même vers la corbeille.';
const MOTIF_ARCHIVE_ELLE_MEME =
  `Refusé : « ${DOSSIER_INTERDIT_LECTURE} » et les dossiers qui le contiennent ne se mettent pas à la corbeille — `
  + 'ce serait y emporter l’archive entière.';

/** Un mot pour dire qu'on n'a pas su lire la chaîne. Ne pas savoir vaut interdit. */
function motifIncertain(cause: 'depart' | 'trou' | 'cycle' | 'profondeur'): string {
  const mot = cause === 'depart' ? 'Emplacement inconnu'
    : cause === 'trou' ? 'Emplacement incomplet'
      : cause === 'cycle' ? 'Arborescence incohérente'
        : 'Arborescence trop profonde';
  return `${mot} : par précaution, cette mise à la corbeille est refusée.`;
}

/**
 * ══ 🔴🔴 LE VERDICT SUR UNE MISE À LA CORBEILLE. PUR. ═══════════════════════════════════════════════════════════
 *
 * ⚠️ IL VAUT AUSSI POUR LA RESTAURATION, et c'est voulu : remettre un document en place est le geste inverse,
 * mais il porte sur le même fichier et au même endroit. Lui accorder un régime plus souple ouvrirait une porte par
 * laquelle on sortirait quelque chose de l'archive — « je l'y mets, je l'en restaure ailleurs ». Un seul verdict,
 * donc, et `sorte` ne sert qu'au mot du refus.
 */
export function peutMettreCorbeille(
  o: {
    /** Le fichier visé. */
    cibleId: string;
    /** 🔴 ① Un dossier est refusé d'emblée. L'appelant le lit chez Google, jamais dans l'écran. */
    estDossier: boolean;
    sorte?: 'corbeille' | 'restaurer';
  },
  ctx: ContexteCorbeille,
): VerdictCorbeille {
  const cible = o.cibleId.trim();
  if (cible === '') return { ok: false, motif: 'Refusé : aucun fichier n’est identifié.' };

  // ── ① UN DOSSIER, JAMAIS ─────────────────────────────────────────────────────────────────────────────────────
  if (o.estDossier) return { ok: false, motif: MOTIF_DOSSIER };

  // ── ③ L'ARCHIVE ET SES ANCÊTRES ──────────────────────────────────────────────────────────────────────────────
  if (ctx.protegesEtAncetres.has(cible) || ctx.proteges.has(cible)) {
    return { ok: false, motif: MOTIF_ARCHIVE_ELLE_MEME };
  }

  // ── ② ET ④ : OÙ EST-IL, VRAIMENT ? ───────────────────────────────────────────────────────────────────────────
  const ou = situer(cible, ctx.index);
  if (ou.ou === 'dedans') return { ok: false, motif: MOTIF_ARCHIVE };
  if (ou.ou === 'inconnu') return { ok: false, motif: motifIncertain(ou.cause) };

  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA CONFIRMATION — ET POURQUOI SA PHRASE VIT ICI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 LA PHRASE DE LA CONFIRMATION, ÉCRITE UNE SEULE FOIS. PUR. ════════════════════════════════════════════════
 *
 * Arno la dicte au mot près : « Mettre à la corbeille du Drive : <nom> — dans <chemin> ? Récupérable 30 jours
 * depuis la corbeille du Drive. »
 *
 * 🔴 ELLE N'EST PAS DANS L'ÉCRAN, ET C'EST LE POINT. Une confirmation est le dernier endroit où quelqu'un peut
 * encore dire non : elle doit annoncer EXACTEMENT ce que le geste fait, et ne pas pouvoir être allégée par
 * distraction au fil d'une retouche de mise en page. Ici elle est éprouvée mot pour mot.
 *
 * ⚠️ LE CHEMIN EST DIT, ET IL EST INDISPENSABLE : deux fichiers du même nom vivent dans deux dossiers différents,
 * et c'est précisément quand on en a deux sous les yeux qu'on se trompe de ligne.
 */
export const MENTION_RECUPERABLE = 'Récupérable 30 jours depuis la corbeille du Drive.';

export function phraseCorbeille(nom: string, chemin: string): string {
  const n = (nom ?? '').trim() === '' ? 'ce fichier' : nom.trim();
  const ou = (chemin ?? '').trim() === '' ? 'ce dossier' : chemin.trim();
  return `Mettre à la corbeille du Drive : ${n} — dans ${ou} ? ${MENTION_RECUPERABLE}`;
}

/** Les deux boutons, dans l'ordre où Arno les demande. PUR. */
export const BOUTON_ANNULER_CORBEILLE = 'Annuler';
export const BOUTON_CONFIRMER_CORBEILLE = 'Mettre à la corbeille';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LE BANDEAU « ANNULER » DIT D'UNE CORBEILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE MOT DU BANDEAU après une mise à la corbeille. PUR.
 *
 * ⚠️ IL DIT « RÉCUPÉRABLE », PAS « SUPPRIMÉ ». Le mot « supprimé » ferait croire à un geste définitif, et quelqu'un
 * renoncerait à chercher le document — ce qui est exactement l'erreur que la réversibilité doit éviter.
 */
export function motCorbeilleFaite(n: number): string {
  const quoi = n > 1 ? `${n} fichiers mis` : '1 fichier mis';
  return `${quoi} à la corbeille du Drive. ${MENTION_RECUPERABLE}`;
}

/** Le mot de l'infobulle d'« Annuler » quand le dernier pas est une corbeille. PUR. */
export function motProchaineRestauration(nom: string, nombre: number): string {
  const quoi = nombre > 1 ? `les ${nombre} fichiers mis à la corbeille` : `« ${nom} »`;
  return `Sortir ${quoi} de la corbeille du Drive`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL, POINT 1 — POURQUOI LE GESTE A ÉTÉ REFUSÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (04/10/2026) : « bandeau “Ce fichier n'a pas pu être lu dans le Drive”, fichier toujours en
   place. Plus jamais “n'a pas pu être lu” pour un échec d'écriture. »

   CE QUI SE PASSAIT, REPRODUIT : sa mise à la corbeille avait RÉUSSI (journal des mouvements, ligne 170, 03/10 à
   23:56:27). La ligne restait à l'écran — Google met des secondes à cesser de rendre un fichier jeté — et le
   geste pouvait donc être rejoué. Au second coup, la lecture refusait avec une raison parfaitement claire (« Ce
   fichier est à la corbeille du Drive. ») et la route la JETAIT pour une phrase vague, qui envoyait chercher une
   panne de lecture là où il n'y avait qu'un geste déjà fait. */

/**
 * LA PHRASE D'UN REFUS, bâtie sur la raison RÉELLE. PUR.
 *
 * 🔴 LE PRÉFIXE NOMME LE GESTE qu'on voulait faire. Sans lui, « Ce fichier est à la corbeille du Drive. » se lirait
 * comme un état constaté au hasard, et pas comme la raison d'un refus.
 *
 * ⚠️ LA RAISON N'EST NI RÉÉCRITE NI TRADUITE : elle vient du lecteur (`motifHttp`, `lireMetadonnees`), elle est
 * déjà en français simple, et elle distingue les cas qui comptent — à la corbeille, introuvable, droit refusé,
 * Drive indisponible. La réécrire ici ne pourrait que l'appauvrir, et ferait deux vérités sur le même refus.
 */
export function motifRefusCorbeille(raison: string): string {
  const r = (raison ?? '').trim();
  if (r === '') return 'Mise à la corbeille impossible : le Drive n’a pas dit pourquoi.';
  return `Mise à la corbeille impossible : ${r.charAt(0).toLowerCase()}${r.slice(1)}`;
}
