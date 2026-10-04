/**
 * MODULE « GESTION » — LOT 5-PJ-D : UNE CIBLE DE DÉPÔT EST-ELLE UN VRAI DOSSIER ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT CONSTATÉ À L'ÉCRAN PAR ARNO LE 25/09/2026. À la racine du sélecteur, « Drives partagés » et « Partagés
 * avec moi » portaient un bouton « Déposer ici ». Ce sont des REGROUPEMENTS — deux mots à nous, `svav:drives` et
 * `svav:partages`, qui n'existent pas chez Google — et non des dossiers : un dépôt sur l'un des deux ne pouvait
 * qu'échouer, après le téléversement complet du fichier. Le bouton est retiré de ces DEUX entrées, et de celles-là
 * seulement (retrait validé par Arno) : « Mon Drive », chaque Drive partagé et chaque dossier gardent le leur.
 *
 * 🔴 ET LE SERVEUR REFUSE, LUI AUSSI. Retirer un bouton met l'écran d'accord avec la réalité ; ça ne protège de rien.
 * Une requête forgée, un vieil onglet, une capture rejouée arriveraient encore avec `svav:drives` dans le corps. La
 * règle est donc tenue ICI, à l'endroit qui décide, et pas seulement là où l'on clique.
 *
 * CE QUI EST UNE CIBLE VALABLE, ET C'EST TOUT :
 *   · `root` — la racine de « Mon Drive » de la personne. Google l'accepte comme parent, sans rien demander ;
 *   · un vrai DOSSIER (`mimeType` = dossier), pas à la corbeille ;
 *   · la RACINE d'un vrai Drive partagé — qui est, pour l'API, un dossier comme un autre (son identifiant est celui
 *     du Drive). Aucun cas particulier à écrire : la même vérification la couvre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MODULE PUR : la lecture du dossier est INJECTÉE. Les regroupements, eux, sont refusés SANS aucun appel à Google —
 * on ne demande pas à Google de trancher une question dont on connaît déjà la réponse.
 */
import { MIME_DOSSIER, type LecteurDossier } from './drive';

/** La racine de « Mon Drive ». Mot de Google, celui-là : l'API l'accepte tel quel comme identifiant de parent. */
export const RACINE_MON_DRIVE = 'root';
/** Les deux REGROUPEMENTS de la racine du sélecteur. Mots à NOUS : ils ne désignent aucun dossier chez Google. */
export const RACINE_DRIVES_PARTAGES = 'svav:drives';
export const RACINE_PARTAGES_AVEC_MOI = 'svav:partages';

/** Le libellé affiché pour chaque regroupement — et le mot employé dans le refus, pour que l'un explique l'autre. */
const LIBELLE_REGROUPEMENT: Record<string, string> = {
  [RACINE_DRIVES_PARTAGES]: 'Drives partagés',
  [RACINE_PARTAGES_AVEC_MOI]: 'Partagés avec moi',
};

/** Vrai pour les deux entrées qui ne sont PAS des dossiers. PUR. */
export function estRegroupement(dossierId: string): boolean {
  return dossierId in LIBELLE_REGROUPEMENT;
}

/**
 * Le refus d'un regroupement, en toutes lettres — ou `null` si ce n'en est pas un. PUR, et SANS réseau : c'est ce qui
 * permet à la route de trancher avant même d'avoir un jeton.
 */
export function refusRegroupement(dossierId: string): string | null {
  const nom = LIBELLE_REGROUPEMENT[dossierId];
  if (nom === undefined) return null;
  return `« ${nom} » n’est pas un dossier, c’est un regroupement : ouvrez-le et choisissez un dossier à l’intérieur.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 5 — OÙ « DÉPOSER ICI » POSE, ET POURQUOI IL EST PARFOIS ÉTEINT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (04/10/2026) : « éprouve-les pour de vrai dans “Test”, en arborescence ET en liste, avec un
   dossier sélectionné et sans dossier sélectionné. Le bouton inactif doit l'afficher clairement et dire pourquoi. »

   ═══ 🔴🔴 LE DÉFAUT MESURÉ À L'ÉCRAN, ET IL EST EXACTEMENT CELUI QU'ARNO FAISAIT CHERCHER ════════════════════════

   En ARBORESCENCE : on reste dans « Drives partagés », on déplie « Test » sur place par son triangle, on clique la
   ligne « Test » — elle est bel et bien sélectionnée (`aria-selected="true"`). Et « Déposer ici » restait ÉTEINT,
   avec l'infobulle « ouvrez-le et choisissez un dossier dedans » : le bouton demandait de faire ce qu'on venait de
   faire. Un cul-de-sac, et dans le geste le plus courant de la fenêtre.

   LA CAUSE : la cible était le dossier AFFICHÉ, et lui seul. Or en arborescence le dossier affiché est la racine —
   un REGROUPEMENT, qui n'existe pas chez Google — tandis que le dossier visé par l'œil et par le clic est la ligne
   dépliée.

   ═══ 🔴 LA RÈGLE, ET CE QU'ELLE NE CHANGE PAS ═══════════════════════════════════════════════════════════════════

   ① LE DOSSIER AFFICHÉ GAGNE, dès qu'il est un vrai dossier. Tous les cas qui marchaient marchent à l'identique,
      sélection ou pas : on ne RE-CIBLE aucun geste existant, et personne ne verra son dépôt partir ailleurs
      qu'avant. C'est la condition pour que ce correctif n'ait aucun effet de bord.
   ② SINON, LA SÉLECTION RÉPOND — à une condition : qu'elle désigne UN SEUL dossier. C'est ce qui réveille le
      bouton en arborescence, là où il était mort.
   ③ ET LE BOUTON NOMME ALORS SA CIBLE (« Déposer dans “Test” »). « Ici » ne veut plus rien dire quand la cible
      n'est pas ce qu'on affiche : le mot doit suivre, sinon le bouton est pire qu'éteint — il est trompeur.

   ⚠️ DEUX DOSSIERS SÉLECTIONNÉS NE DONNENT PAS DE CIBLE, et le refus le dit avec leur nombre. Choisir pour la
   personne — le premier, le dernier, le plus haut — serait deviner, et un dépôt ne se défait qu'à la main.
   ⚠️ CE MODULE NE DÉCIDE PAS SEUL : le serveur revérifie la cible (`verifierCibleDepot`) à chaque dépôt. Ceci
   n'est que le mot de l'écran, et c'est pour cela que la fonction est PURE — elle ne peut rien écrire.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un dossier tel que l'écran le connaît : juste ce qu'il faut pour viser et pour le NOMMER. */
export interface DossierVise { id: string; nom: string }

/** Ce que l'écran doit savoir pour dessiner le bouton : où l'on pose, ou pourquoi on ne peut pas. */
export interface CibleDeposerIci {
  /** Le dossier où le clic posera. `null` ⇒ bouton éteint, et `refus` dit pourquoi. */
  cible: DossierVise | null;
  /** Le motif de l'extinction, en toutes lettres. `null` quand le bouton est allumé. */
  refus: string | null;
  /**
   * La cible vient-elle de la SÉLECTION plutôt que du dossier affiché ? C'est ce qui décide que le bouton se
   * nomme « Déposer dans “…” » au lieu de « Déposer ici ».
   */
  parLaSelection: boolean;
}

/** 🔴 OÙ « DÉPOSER ICI » POSE. PUR. L'ordre des trois cas EST la règle : voir l'encadré ci-dessus. */
export function cibleDeposerIci(
  affiche: DossierVise | null,
  /** Les dossiers SÉLECTIONNÉS dans la liste — jamais les fichiers : on ne dépose pas dans un fichier. */
  dossiersChoisis: readonly DossierVise[] = [],
): CibleDeposerIci {
  // ① LE DOSSIER AFFICHÉ, dès qu'il en est un. Le comportement d'avant ce point, mot pour mot.
  if (affiche !== null && !estRegroupement(affiche.id)) {
    return { cible: affiche, refus: null, parLaSelection: false };
  }
  // ② LA SÉLECTION, si et seulement si elle désigne UN dossier déposable.
  const utiles = dossiersChoisis.filter((d) => d.id.trim() !== '' && !estRegroupement(d.id));
  if (utiles.length === 1) return { cible: utiles[0], refus: null, parLaSelection: true };

  // ③ LE REFUS, ET IL DIT CE QU'IL FAUT FAIRE.
  if (utiles.length > 1) {
    return {
      cible: null, parLaSelection: false,
      refus: `${utiles.length} dossiers sont sélectionnés : n’en gardez qu’un, ou entrez dans celui où vous voulez `
        + 'déposer.',
    };
  }
  if (affiche === null) {
    return { cible: null, refus: 'Entrez dans un dossier du Drive, ou sélectionnez-en un.', parLaSelection: false };
  }
  /* ⚠️ LE MOT DU REGROUPEMENT EST COMPLÉTÉ, PAS RÉÉCRIT : il disait « ouvrez-le et choisissez un dossier à
     l'intérieur », ce qui laissait croire qu'une sélection ne suffisait pas. Elle suffit, désormais. */
  return {
    cible: null, parLaSelection: false,
    refus: `${refusRegroupement(affiche.id) ?? 'Ce n’est pas un dossier.'} Vous pouvez aussi déplier un dossier `
      + 'et le sélectionner.',
  };
}

export type VerdictCible = { ok: true } | { ok: false; motif: string };

/**
 * LA CIBLE EST-ELLE DÉPOSABLE ? Un seul endroit décide, pour les deux routes de dépôt (une pièce, tout un message) :
 * deux vérifications jumelles divergeraient à la première correction, et c'est toujours celle qu'on relit le moins
 * qui garderait l'ancienne règle.
 */
export async function verifierCibleDepot(dossierId: string, lire: LecteurDossier): Promise<VerdictCible> {
  const cible = dossierId.trim();
  if (cible === '') return { ok: false, motif: 'Aucun dossier choisi.' };

  const regroupement = refusRegroupement(cible);
  if (regroupement !== null) return { ok: false, motif: regroupement };

  // « Mon Drive » n'a pas de fiche à lire : `root` est un alias que l'API résout elle-même.
  if (cible === RACINE_MON_DRIVE) return { ok: true };

  const d = await lire(cible);
  if (!d.ok) return { ok: false, motif: d.motif };
  if (d.valeur.corbeille) {
    return { ok: false, motif: 'Ce dossier est à la corbeille du Drive : déposer dedans reviendrait à jeter le document.' };
  }
  if (d.valeur.mimeType !== MIME_DOSSIER) {
    return { ok: false, motif: 'La destination choisie n’est pas un dossier du Drive.' };
  }
  return { ok: true };
}
