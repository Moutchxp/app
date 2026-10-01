/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — « 1 LOGEMENT + 2 PARKINGS », ET D'OÙ VIENT CE COMPTE. PUR. ═════════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « Catégorie de chaque lot, d'après sa nature/type WIPPIMMO : PARKING = parking,
 * garage, box, stationnement ; CAVE = cave, cellier ; LOGEMENT = tout le reste (appartement, maison, studio,
 * local, bureau, commerce…). […] on compte les lots cochés par catégorie et on n'affiche que les catégories non
 * nulles : “1 logement”, “1 logement + 1 parking”, “3 parkings”, “2 logements + 1 cave”. »
 *
 * ═══ 🔴 CE QUE CE RÉSUMÉ REMPLACE, ET POURQUOI ══════════════════════════════════════════════════════════════════
 *
 * La case verte écrivait l'ADRESSE des biens cochés (« 28 av. Marceau — lot 421, +2 »). Sur un bloc qui surplombe
 * CHAQUE mail, cette adresse est déjà écrite juste à gauche, en entier : on la lisait deux fois, et la seconde
 * fois tronquée. Ce qu'on veut savoir d'un coup d'œil, c'est COMBIEN de quoi — un logement, ou un logement et son
 * parking. L'adresse, elle, reste à sa place : sur la ligne « Bien(s) rattaché(s) ».
 *
 * ═══ 🔴 POURQUOI LA NATURE D'ABORD, LE TYPE SEULEMENT À DÉFAUT ══════════════════════════════════════════════════
 *
 * MESURÉ EN BASE LE 01/10/2026 (365 lots) : `nature` est renseignée partout sauf deux lignes (« A renseigner »),
 * et `type_bien` est vide 38 fois. Surtout, les deux ne disent pas la même chose — 12 lots portent nature
 * « Parking » ET type « Garage », et 1 porte nature « Box » avec type « Garage » : le TYPE affine la nature, il
 * ne la contredit pas. On lit donc la nature, et le type ne sert que lorsque la nature ne dit rien.
 *
 * 🔴 « UN LOGEMENT QUI INCLUT UN PARKING DANS LE MÊME LOT COMPTE COMME 1 LOGEMENT » (Arno). C'est automatique
 * ici : un lot a UNE nature, donc UNE catégorie. Il n'y a pas de double comptage à empêcher — il n'y a rien à
 * additionner. La règle est écrite quand même, parce qu'elle explique pourquoi on ne cherche pas « parking »
 * dans le libellé d'un appartement.
 *
 * ⚠️ AUCUNE E/S : c'est une DÉCISION, et elle doit pouvoir se rejouer sur la liste entière des natures.
 */

/** Les trois catégories d'Arno, et il n'y en aura pas de quatrième sans qu'il le dise. */
export type CategorieBien = 'logement' | 'parking' | 'cave';

/**
 * 🔴 LES MOTS QUI FONT UN PARKING. Comparés SANS ACCENTS ET SANS CASSE, sur le mot entier ou son début : WIPPIMMO
 * écrit « Parking », « Garage », « Box » — mais aussi, un jour, « Place de stationnement » ou « Box fermé ».
 */
export const MOTS_PARKING: readonly string[] = ['parking', 'garage', 'box', 'stationnement'];

/** 🔴 LES MOTS QUI FONT UNE CAVE. Aucun lot n'en porte aujourd'hui ; la règle est posée pour le jour où. */
export const MOTS_CAVE: readonly string[] = ['cave', 'cellier'];

/**
 * ⚠️ SANS ACCENTS, SANS CASSE, SANS PONCTUATION. « Box fermé », « BOX », « box-garage » doivent tous répondre. On
 * normalise au lieu d'énumérer : énumérer les graphies est une liste qu'on oublie de tenir à jour.
 */
function mots(brut: string | null | undefined): string[] {
  return (brut ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m !== '');
}

/** Un des mots donnés figure-t-il dans le texte ? Comparaison sur le MOT entier. PUR. */
function porte(brut: string | null | undefined, liste: readonly string[]): boolean {
  const m = mots(brut);
  return liste.some((cle) => m.includes(cle));
}

/**
 * LA CATÉGORIE D'UN LOT. PUR.
 *
 * 🔴 L'ORDRE COMPTE : parking d'abord, cave ensuite, logement par défaut. « Cave » et « parking » sont deux mots
 * rares et précis ; « logement » est le reste du monde. Chercher le reste en premier n'aurait rien à chercher.
 *
 * ⚠️ RIEN N'EST JAMAIS « INCONNU ». Une nature vide, ou « A renseigner » (2 lots en base le 01/10/2026), tombe
 * dans LOGEMENT — c'est la règle d'Arno (« tout le reste »), et c'est la bonne : une quatrième catégorie
 * « indéterminé » dans la case verte ferait douter du classement lui-même, pour un cas qui se répare à l'import.
 */
export function categorieDuBien(l: { nature?: string | null; typeBien?: string | null }): CategorieBien {
  // ① LA NATURE D'ABORD : c'est le champ que WIPPIMMO remplit, et celui qui dit ce que le lot EST.
  if (porte(l.nature, MOTS_PARKING)) return 'parking';
  if (porte(l.nature, MOTS_CAVE)) return 'cave';
  // ② LE TYPE SEULEMENT SI LA NATURE NE DIT RIEN : il affine, il ne contredit pas (voir l'encadré du module).
  if (mots(l.nature).length === 0) {
    if (porte(l.typeBien, MOTS_PARKING)) return 'parking';
    if (porte(l.typeBien, MOTS_CAVE)) return 'cave';
  }
  return 'logement';
}

/** Le mot d'une catégorie, au singulier et au pluriel. Écrit UNE fois : trois endroits l'affichent. */
const MOTS: Record<CategorieBien, { un: string; plusieurs: string }> = {
  logement: { un: 'logement', plusieurs: 'logements' },
  parking: { un: 'parking', plusieurs: 'parkings' },
  cave: { un: 'cave', plusieurs: 'caves' },
};

/**
 * 🔴 L'ORDRE D'AFFICHAGE, FIXE : logement, puis parking, puis cave. C'est l'ordre d'importance et celui des
 * exemples d'Arno (« 1 logement + 2 parkings + 1 cave »). Un ordre qui dépendrait du nombre ferait changer la
 * phrase de forme d'un mail à l'autre, pour la même information.
 */
export const ORDRE_CATEGORIES: readonly CategorieBien[] = ['logement', 'parking', 'cave'];

/**
 * ══ 🔴🔴 LE RÉSUMÉ DE LA CASE VERTE. PUR. ══════════════════════════════════════════════════════════════════════
 *
 * « 1 logement », « 1 logement + 1 parking », « 1 logement + 3 parkings », « 3 parkings »,
 * « 2 logements + 1 cave », « 1 logement + 2 parkings + 1 cave ».
 *
 * ⚠️ ON N'AFFICHE QUE LES CATÉGORIES NON NULLES (Arno). « 1 logement + 0 parking » demanderait de lire un zéro
 * pour apprendre qu'il n'y a rien : c'est une information que l'absence donne mieux.
 *
 * ⚠️ AUCUN BIEN ⇒ « aucun bien ». Jamais une chaîne vide : la case verte garderait une ligne blanche sous son
 * mot, et l'on chercherait ce qui a disparu. (C'est aussi ce que l'ancien résumé par adresse écrivait.)
 */
export function resumeParCategorie(biens: readonly { categorie?: CategorieBien | null }[]): string {
  const comptes = new Map<CategorieBien, number>();
  for (const b of biens) {
    // ⚠️ UNE CATÉGORIE ABSENTE VAUT « logement », jamais une quatrième colonne : c'est la même règle que
    //   `categorieDuBien` applique au bout du compte, et les deux doivent dire la même chose.
    const c = b.categorie ?? 'logement';
    comptes.set(c, (comptes.get(c) ?? 0) + 1);
  }
  const morceaux = ORDRE_CATEGORIES
    .filter((c) => (comptes.get(c) ?? 0) > 0)
    .map((c) => {
      const n = comptes.get(c) as number;
      return `${n} ${n > 1 ? MOTS[c].plusieurs : MOTS[c].un}`;
    });
  return morceaux.length === 0 ? 'aucun bien' : morceaux.join(' + ');
}

/**
 * LE MÊME RÉSUMÉ, À PARTIR DES NATURES BRUTES. PUR.
 *
 * Raccourci pour les appelants qui tiennent la fiche du lot plutôt qu'une cible déjà catégorisée — l'écran d'un
 * mail reçu, par exemple, qui lit la nature avec le rattachement. Une seule règle, deux portes d'entrée.
 */
export function resumeDesLots(
  lots: readonly { nature?: string | null; typeBien?: string | null }[],
): string {
  return resumeParCategorie(lots.map((l) => ({ categorie: categorieDuBien(l) })));
}
