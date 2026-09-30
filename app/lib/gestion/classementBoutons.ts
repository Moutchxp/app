/**
 * ══ 🔴 LOT CLASSER-DEUX-BOUTONS — CE QUE LA CASE VERTE ÉCRIT SOUS LE MOT. PUR. ═════════════════════════════════
 *
 * Demande d'Arno : « Sous le mot, en petit, la liste courte des biens choisis (“28 av. Marceau — lot 421”, “+2”
 * s'il y en a plus). »
 *
 * 🔴 POURQUOI UNE FONCTION, ET PAS DEUX LIGNES DANS L'ÉCRAN. Parce que la règle de coupe est une DÉCISION —
 * combien on montre, ce qu'on dit du reste — et qu'une décision s'éprouve sans monter de composant. C'est la
 * séparation que tout le module applique : l'écran place et peint, le module pur décide.
 */

/** Combien de biens on nomme avant de compter le reste. Deux : au-delà, la ligne déborde d'une case de 56 px. */
export const BIENS_NOMMES_MAX = 2;

/**
 * LA LISTE COURTE DES BIENS RATTACHÉS. PUR.
 *
 * ⚠️ « +2 » COMPTE CE QU'ON NE MONTRE PAS, pas le total : « 28 av. Marceau — lot 421, 4 rue Hugo — lot 12, +2 »
 * se lit « et deux autres », ce qui est la seule lecture utile. Écrire le total obligerait à soustraire de tête.
 *
 * ⚠️ AUCUN BIEN RENDU N'EST VIDE : un libellé blanc laisserait une virgule orpheline, qui se lit comme un bug.
 */
export function resumeBiensRattaches(libelles: readonly string[], max = BIENS_NOMMES_MAX): string {
  const propres = libelles.map((l) => l.trim()).filter((l) => l !== '');
  if (propres.length === 0) return 'aucun bien';
  const nommes = propres.slice(0, Math.max(1, max));
  const reste = propres.length - nommes.length;
  return reste > 0 ? `${nommes.join(', ')}, +${reste}` : nommes.join(', ');
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
