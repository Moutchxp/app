/**
 * PL-A — PROVENANCE HONNÊTE d'une parcelle corrigée / saisie à la main. Née de l'incident « verif-lot101 » : l'écran écrivait
 * « rattachée à la main » DÈS que `origine='saisie'`, sans distinguer un vrai geste d'Arno d'un harnais de vérification qui avait
 * appelé la fonction de correction avec `maj_par='verif-lot101'`. C'était un mensonge d'interface sur l'ACTEUR.
 *
 * RÈGLE (pure, testable) : on n'écrit « à la main » QUE si l'auteur est un COMPTE ADMIN identifiable — soit un id résolu en
 * prénom/nom (`acteurNom`), soit la voie de secours nommée `'admin'`. Sinon, on affiche la VALEUR BRUTE de `maj_par`
 * (« corrigée par verif-lot101 ») : mieux vaut nommer l'outil que mentir sur la main. La résolution de l'id numérique en nom
 * (`admin_utilisateur`) est faite EN AMONT (repo) et passée ici en `acteurNom` — ce module ne fait AUCUNE I/O.
 */

export interface ActeurParcelle {
  majPar: string | null;    // auteur BRUT de la ligne permis_parcelle : id admin numérique, 'admin' (secours), ou une chaîne d'outil.
  majLe: string | null;     // horodatage de la dernière écriture (ISO ou 'YYYY-MM-DD …').
  acteurNom: string | null; // prénom + nom SI `maj_par` est un id d'admin résolu ; null sinon (outil, CLI, compte supprimé…).
}

/** Un `maj_par` désigne-t-il un COMPTE ADMIN identifiable ? nom résolu (id → admin_utilisateur) OU la voie de secours 'admin'. */
export function estActeurAdmin(a: ActeurParcelle): boolean {
  return a.acteurNom !== null || a.majPar === 'admin';
}

/** Date lisible JJ/MM/AAAA depuis un horodatage ISO (grain JOUR : l'heure n'apporte rien à l'affichage). null si absent/illisible.
 *  Parse par découpe (jamais `new Date` : ni fuseau, ni dépendance à l'horloge). */
export function dateCourteFr(horodatage: string | null): string | null {
  if (!horodatage) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(horodatage);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export interface DescriptionActeur {
  aLaMain: boolean; // true = un compte admin identifiable → on peut écrire « à la main » ; false = valeur brute, jamais « à la main ».
  qui: string;      // le nom d'admin, « compte admin » (secours), ou la valeur brute de maj_par.
  quand: string | null; // date JJ/MM/AAAA ou null.
}

/**
 * Décrit la provenance d'une parcelle corrigée/saisie, HONNÊTEMENT :
 *  · acteur admin identifiable → aLaMain=true, `qui` = son nom (ou « compte admin » pour la voie de secours) ;
 *  · sinon → aLaMain=false, `qui` = la valeur BRUTE de maj_par (« verif-lot101 », « cli:rapprocher-parcelles »…) — jamais « à la main ».
 * Le composant décide de la phrase finale (« rattachée à la main par … » vs « référence corrigée par … »).
 */
export function descriptionActeurParcelle(a: ActeurParcelle): DescriptionActeur {
  const quand = dateCourteFr(a.majLe);
  if (estActeurAdmin(a)) return { aLaMain: true, qui: a.acteurNom ?? 'compte admin', quand };
  return { aLaMain: false, qui: a.majPar ?? 'auteur inconnu', quand };
}
