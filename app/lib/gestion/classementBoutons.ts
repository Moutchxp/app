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
 * 🔴 « OU SI L'ADRESSE EST TRONQUÉE » : une troncature est un fait de MISE EN PAGE (largeur de la fenêtre,
 * taille de police), que ce module ne peut pas connaître — et le navigateur ne la signale pas. On ne la devine
 * donc pas : on décide sur la LONGUEUR du libellé, qui est la seule chose dont on dispose et qui prédit la
 * troncature dans l'immense majorité des cas. Le seuil est bas exprès : proposer « voir plus » pour un libellé
 * qui tenait finalement ne coûte qu'un lien ignoré ; ne pas le proposer sur un libellé coupé cache une adresse.
 */
export const LONGUEUR_AVANT_VOIR_PLUS = 54;

/** Ce que la ligne « Bien(s) rattaché(s) : » affiche, repliée. PUR. */
export interface LignePremierBien {
  /** Le libellé COMPLET du premier bien — jamais coupé ici : c'est le CSS qui met des points de suspension. */
  premier: string;
  /** Faut-il proposer « voir plus » ? Vrai dès qu'il y a un second bien, ou que le premier risque d'être coupé. */
  voirPlus: boolean;
  /** Combien de biens en tout. Zéro = la ligne dit « rien pour l'instant », comme avant ce lot. */
  total: number;
}

export function lignePremierBien(
  libelles: readonly string[], seuil = LONGUEUR_AVANT_VOIR_PLUS,
): LignePremierBien {
  // ⚠️ AUCUN LIBELLÉ VIDE : un blanc en tête ferait croire à un bien sans nom, et pousserait les autres hors de
  //   vue. Ce qui n'a pas de nom n'a rien à montrer sur cette ligne — il reste dans le dépliage.
  const propres = libelles.map((l) => l.trim()).filter((l) => l !== '');
  const premier = propres[0] ?? '';
  return {
    premier,
    voirPlus: propres.length > 1 || premier.length > seuil,
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
}): LigneCompacte {
  const type = (b.typeBien ?? '').trim();
  const proprios = b.parties.filter((p) => p.role === 'proprietaire').map((p) => p.nom.trim()).filter((n) => n !== '');
  const locataires = b.parties.filter((p) => p.role === 'locataire').map((p) => p.nom.trim()).filter((n) => n !== '');
  return {
    titre: type === '' ? b.libelle : `${b.libelle} · ${type}`,
    proprietaires: proprios.length === 0 ? '(propriétaire inconnu)' : proprios.join(', '),
    locataire: locataires.length === 0 ? 'Vacant' : locataires.join(', '),
  };
}
