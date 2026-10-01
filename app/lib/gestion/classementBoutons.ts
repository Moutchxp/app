/**
 * ══ 🔴 CE QUE LES ÉCRANS DE CLASSEMENT ÉCRIVENT, MOT POUR MOT. PUR. ════════════════════════════════════════════
 *
 * 🔴 POURQUOI DES FONCTIONS, ET PAS DEUX LIGNES DANS L'ÉCRAN. Parce que ce sont des DÉCISIONS — ce qu'on montre,
 * ce qu'on dit du reste — et qu'une décision s'éprouve sans monter de composant. C'est la séparation que tout le
 * module applique : l'écran place et peint, le module pur décide.
 *
 * ⚠️ LE RÉSUMÉ PAR CATÉGORIE DE LA CASE VERTE N'EST PLUS ICI : il vit dans `categorieBien.ts`, avec la règle qui
 * décide de la catégorie d'un lot. Les deux sont la même question, elles ne doivent pas vivre à deux endroits.
 */

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE QUE LA LIGNE « BIEN(S) RATTACHÉ(S) : » MONTRE D'ABORD. PUR. ═══════════
 *
 * Demande d'Arno : « Affiche l'adresse complète du PREMIER bien (adresse — type — lot N). S'il y a plusieurs
 * biens, ou si l'adresse est tronquée : un petit lien “voir plus” au bout. Un clic déplie, juste en dessous,
 * l'adresse complète du premier bien puis tous les autres, une ligne chacun. »
 *
 * ═══ 🔴 CE QUE CETTE FONCTION REMPLACE, ET POURQUOI ═════════════════════════════════════════════════════════════
 *
 * `resumeBiensRattaches` écrivait « 28 av. Marceau — lot 421, 4 rue Hugo — lot 12, +2 » SOUS le mot de la case
 * verte. Deux adresses tronquées et un compte : on ne pouvait ni lire la première en entier, ni atteindre les
 * autres. Arno a coupé la question en deux, et chaque moitié a désormais sa place :
 *   · la CASE VERTE compte (« 1 logement + 1 parking ») — c'est `resumeParCategorie`, dans `categorieBien.ts` ;
 *   · la LIGNE DE GAUCHE nomme — c'est ici, et elle nomme EN ENTIER, quitte à déplier.
 *
 * ═══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — « VOIR PLUS » SEULEMENT S'IL Y A QUELQUE CHOSE EN PLUS ══
 *
 * DEMANDE D'ARNO (01/10/2026) : « le lien “voir plus” ne s'affiche que si la vue dépliée montre AU MOINS une
 * information absente de la ligne de base. Exemple : un seul bien, entièrement visible sur la ligne → pas de
 * lien. Pour le décider, compare au contenu réellement affiché, comme pour la pastille “i”. »
 *
 * 🔴 CE QUI CHANGE : LA TRONCATURE EST MESURÉE, ELLE N'EST PLUS DEVINÉE. Ce module décidait sur la LONGUEUR du
 * libellé (plus de 54 caractères ⇒ « sans doute coupé »), faute de connaître la mise en page. C'était un pari, et
 * il se trompait dans les deux sens : sur un grand écran, un libellé de 60 caractères tient très bien, et le lien
 * s'affichait pour ne rien montrer de plus. L'écran, lui, SAIT : `scrollWidth > clientWidth` est la question
 * exacte, posée à l'élément réellement affiché. Le module continue de DÉCIDER — il reçoit la mesure, il ne la
 * prend pas.
 *
 * ⚠️ `LONGUEUR_AVANT_VOIR_PLUS` A DONC DISPARU. Garder un seuil « au cas où » aurait laissé les deux règles
 * cohabiter, et la plus bavarde des deux l'aurait emporté — c'est-à-dire exactement le défaut qu'Arno signale.
 */

/** Ce que la ligne « Bien(s) rattaché(s) : » affiche, repliée. PUR. */
export interface LignePremierBien {
  /** Le libellé COMPLET du premier bien — jamais coupé ici : c'est le CSS qui met des points de suspension. */
  premier: string;
  /** Faut-il proposer « voir plus » ? Vrai seulement si le dépliage montre quelque chose que la ligne ne montre pas. */
  voirPlus: boolean;
  /** Combien de biens en tout. Zéro = la ligne dit « rien pour l'instant », comme avant ce lot. */
  total: number;
}

export function lignePremierBien(libelles: readonly string[], o?: {
  /**
   * LE PREMIER LIBELLÉ EST-IL RÉELLEMENT COUPÉ À L'ÉCRAN ? Mesuré par l'écran, jamais deviné ici. Absent ⇒ on
   * considère qu'il tient : une mesure manquante ne doit pas faire apparaître un lien qui ne montrera rien.
   */
  tronque?: boolean;
  /**
   * CE QUE LE DÉPLIAGE MONTRE EN PLUS, et que la ligne ne montre pas — par exemple « cette pièce seulement »,
   * qui ne figure que dans la vue dépliée. Chaque mention compte, quelle qu'elle soit.
   */
  enPlus?: readonly string[];
}): LignePremierBien {
  // ⚠️ AUCUN LIBELLÉ VIDE : un blanc en tête ferait croire à un bien sans nom, et pousserait les autres hors de
  //   vue. Ce qui n'a pas de nom n'a rien à montrer sur cette ligne — il reste dans le dépliage.
  const propres = libelles.map((l) => l.trim()).filter((l) => l !== '');
  const premier = propres[0] ?? '';
  const enPlus = (o?.enPlus ?? []).filter((m) => m.trim() !== '');
  return {
    premier,
    // LES TROIS SEULES RAISONS D'OUVRIR : d'autres biens, un titre coupé, ou une mention qu'on ne voit pas.
    voirPlus: propres.length > 1 || o?.tronque === true || enPlus.length > 0,
    total: propres.length,
  };
}

/**
 * ══ 🔴 LA LIGNE COMPACTE D'UN RÉSULTAT DE RECHERCHE. PUR. ══════════════════════════════════════════════════════
 *
 * Demande d'Arno : « adresse — lot · type | PROPRIÉTAIRE(S) nom(s) | LOCATAIRE nom ou “Vacant” ».
 *
 * 🔴 « VACANT » EST UN MOT, JAMAIS UN BLANC. Un champ vide se lit « on ne sait pas » ; « Vacant » se lit « il n'y
 * a personne », ce qui est un FAIT, et souvent celui qui fait trancher. C'est la règle déjà posée dans l'annuaire.
 *
 * ⚠️ LES CO-PROPRIÉTAIRES SONT TOUS NOMMÉS : un bien en indivision appartient à plusieurs personnes, et n'en
 * montrer qu'une ferait chercher pourquoi « le » propriétaire n'est pas celui qu'on attendait.
 */
export interface LigneCompacte {
  /** « 28 av. Marceau — lot 421 · Appartement ». Le lot est dans le titre : il DÉSIGNE le bien. */
  titre: string;
  /** Les propriétaires, séparés par des virgules. Jamais vide : « (propriétaire inconnu) » à défaut. */
  proprietaires: string;
  /** Le ou les locataires, ou « Vacant ». */
  locataire: string;
}

export function ligneCompacteDuBien(b: {
  libelle: string;
  typeBien?: string | null;
  parties: readonly { role: string; nom: string }[];
}, titreImpose?: string): LigneCompacte {
  const type = (b.typeBien ?? '').trim();
  const proprios = b.parties.filter((p) => p.role === 'proprietaire').map((p) => p.nom.trim()).filter((n) => n !== '');
  const locataires = b.parties.filter((p) => p.role === 'locataire').map((p) => p.nom.trim()).filter((n) => n !== '');
  return {
    /**
     * 🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE PEUT ÊTRE IMPOSÉ PAR L'APPELANT, et il l'est désormais partout
     * dans la modale de rattachement : « adresse — Nature · Type », sans numéro de lot (module `titreBien`).
     *
     * ⚠️ LA FORME D'AVANT RESTE LE DÉFAUT, et ce n'est pas de la prudence : la même ligne compacte sert ailleurs
     * (la fenêtre « Visualiser / Modifier »), où le titre n'est pas calculé. Lui imposer un format qu'elle ne
     * sait pas produire l'aurait laissée sans titre du tout.
     */
    titre: (titreImpose ?? '').trim() !== ''
      ? (titreImpose as string)
      : (type === '' ? b.libelle : `${b.libelle} · ${type}`),
    proprietaires: proprios.length === 0 ? '(propriétaire inconnu)' : proprios.join(', '),
    locataire: locataires.length === 0 ? 'Vacant' : locataires.join(', '),
  };
}
