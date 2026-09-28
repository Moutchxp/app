/**
 * MODULE « GESTION » — LOT BIEN-RATTACHE : CHERCHER UN BIEN, ET DIRE POURQUOI IL RÉPOND. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES RÉSULTATS SONT TOUJOURS DES BIENS. C'est la règle posée au lot AFFECTATION-PAR-BIEN et elle vaut ici :
 * chercher un propriétaire affiche TOUS SES BIENS, jamais une ligne « PROPRIÉTAIRE » qu'on pourrait cocher. Un
 * propriétaire n'est pas un dossier — c'est une PARTIE d'un dossier.
 *
 * 🔴 TOUS LES MOTS, DANS N'IMPORTE QUEL ORDRE. La recherche d'avant cherchait la chaîne ENTIÈRE (`LIKE '%victor
 * hugo%'`) : « 4 victor hugo » ne trouvait donc pas « 4-6-8 rue Victor Hugo », parce que les mots n'y sont pas
 * collés. On exige désormais que CHAQUE mot soit présent, et l'ordre n'a plus d'importance.
 *
 * 🔴 ET AUCUN RÉSULTAT HORS SUJET. C'est le pendant de la règle précédente, et le plus important des deux : exiger
 * TOUS les mots interdit qu'une requête de deux mots remonte un bien qui n'en porte qu'un. « victor hugo » ne peut
 * donc pas rendre « Lyautey » ni « Kléber » — vérifié sur la base : aucun lot en gestion n'a d'adresse Victor Hugo,
 * et la recherche rend « Aucun bien trouvé » plutôt qu'un à-peu-près.
 *
 * ⚠️ UN MOT D'UNE SEULE LETTRE N'EST PAS UN MOT. « 4 rue de la Paix » porte « de » et « la » ; les exiger ne coûte
 * rien, mais une initiale isolée ferait correspondre presque tout. Le seuil est à deux caractères, comme ailleurs
 * dans le module.
 *
 * Aucun import, aucune base, aucun React.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Pourquoi ce bien répond à la requête. Le mot est TOUJOURS affiché à côté du résultat. */
export type SorteRaison =
  | 'adresse'
  | 'lot'
  | 'proprietaire'
  | 'locataire'
  | 'locataire_passe'
  | 'telephone_proprietaire'
  | 'telephone_locataire'
  | 'email_proprietaire'
  | 'email_locataire';

export interface RaisonCorrespondance {
  sorte: SorteRaison;
  /** Le nom de la personne, quand la raison en désigne une. Vide pour l'adresse et le n° de lot. */
  detail: string;
}

/**
 * 🔴 L'ORDRE DE PERTINENCE, DEMANDÉ PAR ARNO : l'adresse du bien d'abord, puis les noms, puis téléphone et e-mail.
 *
 * POURQUOI CET ORDRE, ET PAS UN AUTRE. On tape une adresse quand on sait de quel logement on parle — c'est la
 * recherche la plus sûre. Un nom peut être porté par plusieurs personnes ; un numéro peut être partagé (mesuré le
 * 28/09/2026 : 32 coordonnées appartiennent à plusieurs tiers). Le plus sûr en tête, donc. PUR.
 */
export function rangRaison(s: SorteRaison): number {
  if (s === 'adresse' || s === 'lot') return 0;
  if (s === 'proprietaire' || s === 'locataire' || s === 'locataire_passe') return 1;
  return 2;
}

/** Le mot d'une raison, tel qu'il s'affiche sous le résultat. PUR. */
export function motRaison(r: RaisonCorrespondance): string {
  const nom = r.detail.trim();
  switch (r.sorte) {
    case 'adresse': return 'adresse';
    case 'lot': return 'n° de lot';
    case 'proprietaire': return nom === '' ? 'propriétaire' : `propriétaire ${nom}`;
    case 'locataire': return nom === '' ? 'locataire' : `locataire ${nom}`;
    case 'locataire_passe': return nom === '' ? 'locataire passé' : `locataire passé ${nom}`;
    case 'telephone_proprietaire': return nom === '' ? 'téléphone du propriétaire' : `téléphone de ${nom}`;
    case 'telephone_locataire': return nom === '' ? 'téléphone du locataire' : `téléphone de ${nom}`;
    case 'email_proprietaire': return nom === '' ? 'e-mail du propriétaire' : `e-mail de ${nom}`;
    case 'email_locataire': return nom === '' ? 'e-mail du locataire' : `e-mail de ${nom}`;
    default: return 'correspondance';
  }
}

/**
 * LES RAISONS D'UN BIEN, TRIÉES ET DÉDOUBLONNÉES. PUR.
 *
 * ⚠️ LA MEILLEURE RAISON EN TÊTE, et c'est elle qui classe le bien. Un logement trouvé À LA FOIS par son adresse
 * et par le téléphone de son bailleur est un résultat d'adresse : c'est la raison la plus sûre qui compte.
 */
export function raisonsTriees(raisons: readonly RaisonCorrespondance[]): RaisonCorrespondance[] {
  const vues = new Set<string>();
  const propres: RaisonCorrespondance[] = [];
  for (const r of raisons) {
    const cle = `${r.sorte}|${r.detail.trim().toLowerCase()}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    propres.push({ sorte: r.sorte, detail: r.detail.trim() });
  }
  return propres.sort((a, b) => rangRaison(a.sorte) - rangRaison(b.sorte));
}

/** Le rang d'un bien : celui de sa meilleure raison. `9` quand il n'en a aucune — il ne devrait pas être là. PUR. */
export function rangDuBien(raisons: readonly RaisonCorrespondance[]): number {
  return raisons.length === 0 ? 9 : Math.min(...raisons.map((r) => rangRaison(r.sorte)));
}

/**
 * LE CLASSEMENT DES RÉSULTATS. PUR.
 *
 * ⚠️ À RANG ÉGAL, L'ORDRE ALPHABÉTIQUE DE L'ADRESSE — et non l'ordre de la base. Deux recherches identiques doivent
 * rendre la même liste dans le même ordre, sinon on croit que quelque chose a changé.
 */
export function classerResultats<T extends { adresse: string; raisons: readonly RaisonCorrespondance[] }>(
  biens: readonly T[],
): T[] {
  return [...biens].sort((a, b) =>
    rangDuBien(a.raisons) - rangDuBien(b.raisons)
    || a.adresse.localeCompare(b.adresse, 'fr', { numeric: true }));
}

/**
 * 🔴 LE MOTIF QUAND ON NE TROUVE RIEN. PUR.
 *
 * « Aucun résultat » tout court laisse croire à une panne, ou à une recherche cassée. On DIT ce qui a été cherché
 * et ce qu'on peut taper : celui qui cherche comprend alors qu'il a peut-être tapé le nom d'une copropriété
 * (« VICTOR HUGO 4-6-8 ») là où aucun lot n'est en gestion à cette adresse.
 */
export function messageAucunBien(brut: string): string {
  const q = brut.trim();
  return q === ''
    ? 'Tapez une adresse, un nom, un téléphone ou un e-mail pour chercher un bien.'
    : `Aucun bien trouvé pour « ${q} ». On peut chercher par adresse (même partielle), par nom de propriétaire ou `
      + 'de locataire (même passé), par téléphone ou par e-mail.';
}

/**
 * LES BIENS DÉJÀ PROPOSÉS PAR L'AUTOMATISATION NE SONT PAS RÉPÉTÉS DANS LES RÉSULTATS. PUR.
 *
 * 🔴 POURQUOI. La même ligne deux fois, à deux endroits de la même fenêtre, avec deux cases à cocher : on en coche
 * une, l'autre reste vide, et l'on ne sait plus laquelle compte. Demande d'Arno, et c'est la bonne.
 */
export function sansLesProposes<T extends { cle: string }>(
  resultats: readonly T[], clesProposees: readonly string[],
): T[] {
  const deja = new Set(clesProposees);
  return resultats.filter((r) => !deja.has(r.cle));
}
