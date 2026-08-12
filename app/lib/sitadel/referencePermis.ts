/**
 * U2 — SOURCE DE VÉRITÉ UNIQUE de la référence de permis pour le téléservice (ex. Paris sollicitations.paris.fr) : « 2 lettres
 * de type d'autorisation + num_dau, sans espace » (ex. PC07511524V0006). Le CORPS de la demande (genererTexte, variante
 * formulaire) ET le champ « Numéro de dossier instruit » de l'écran de dépôt l'appellent tous les deux — aucun autre endroit ne
 * fabrique de référence. Si le type est inconnu, la fonction le DIT (jamais d'invention, jamais « PC » par défaut : le module
 * traite aussi les démolitions PD, et à terme PA/DP). Purs, sans I/O → testables en isolation.
 */

/** Résultat du formatage : soit une référence prête, soit une RAISON explicite de non-détermination (jamais une valeur inventée). */
export type ReferencePermis = { ok: true; reference: string } | { ok: false; raison: string };

/** Types d'autorisation d'urbanisme (2 lettres) : construire / démolir / aménager / déclaration préalable. Jamais « PC » en dur. */
const TYPES_AUTORISATION = new Set(['PC', 'PD', 'PA', 'DP']);

/**
 * Référence de permis au format téléservice = `<type><num_dau>` sans espace. `type` inconnu / absent → `ok:false` (on ne
 * SUPPOSE jamais un type). `num_dau` vide → `ok:false`. Le num_dau est repris tel quel (il porte déjà les 8 chiffres + V/P + 4).
 */
export function formaterReferencePermis(type: string | null | undefined, numDau: string | null | undefined): ReferencePermis {
  const t = (type ?? '').trim().toUpperCase();
  if (!TYPES_AUTORISATION.has(t)) return { ok: false, raison: 'type d’autorisation inconnu (attendu : 2 lettres PC, PD, PA ou DP)' };
  const num = (numDau ?? '').trim();
  if (num === '') return { ok: false, raison: 'numéro de dossier absent' };
  return { ok: true, reference: `${t}${num}` };
}

/**
 * U2 — arrondissement de Paris DÉRIVÉ du num_dau (source STRUCTURÉE, jamais un parsing de l'adresse en clair). Le num_dau d'un
 * permis parisien commence par `0` + code INSEE d'arrondissement `751xx` + année (2) + `V`/`P` + 4 chiffres (ex. 07511524V0006
 * → 0 · 75115 · 24 · V · 0006 → 15e). L'arrondissement = les 2 chiffres qui suivent « 0751 ». Hors Paris (autre département) ou
 * num_dau malformé → `null` (indéterminé, jamais deviné). PUR.
 */
export function arrondissementParis(numDau: string | null | undefined): number | null {
  const m = /^0751(\d{2})\d{2}[VP]\d{4}$/.exec((numDau ?? '').trim().toUpperCase());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 20 ? n : null;
}

/** U2 — affichage de l'arrondissement en UN SEUL endroit (facile à changer) : « 1er », sinon « Ne ». `null` si indéterminé (le libellé « indéterminé » est laissé au caller). PUR. */
export function formaterArrondissement(numDau: string | null | undefined): string | null {
  const n = arrondissementParis(numDau);
  return n === null ? null : (n === 1 ? '1er' : `${n}e`);
}

/** U4 — adresse d'un permis, décomposée + assemblée. Le modèle Sitadel ne stocke QU'UNE adresse par dossier (colonnes `adr_*`). */
export interface AdressePermisComposee {
  voie: string;                   // adresse de voie déjà agrégée (num + libellé + localité) ; '' si absente en base
  villeCP: string;                // « 75015 Paris » | « Paris » | '' (code postal + commune, selon ce qui est présent)
  arrondissement: string | null;  // « 15e » | null (Paris uniquement)
  voiePresente: boolean;          // la voie est-elle renseignée ? false → l'ÉCRAN doit avertir l'opérateur (jamais la lettre)
  ligne: string;                  // ligne d'adresse ASSEMBLÉE pour le corps : voie + ville/CP + arrondissement ; repli propre (ville/CP + arrondissement) si voie absente — JAMAIS « non renseignée »
}

/**
 * U4 — SOURCE UNIQUE de composition de l'adresse d'un permis, réutilisée par le CORPS de la demande (variante formulaire) ET par
 * la CARTE de dépôt. Le modèle n'a qu'UNE adresse par dossier → aucun pluriel. Adresse absente → `voiePresente=false` et la
 * `ligne` dégrade proprement sur ville/CP + arrondissement (la lettre reste correcte ; c'est l'écran qui avertit). PUR.
 */
export function composerAdressePermis(d: { adresse?: string | null; codePostal?: string | null; communeNom?: string | null; numDau?: string | null }): AdressePermisComposee {
  const arrondissement = formaterArrondissement(d.numDau);
  const villeCP = [d.codePostal, d.communeNom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  const voie = (d.adresse ?? '').trim();
  const lieu = [villeCP, arrondissement ? `arrondissement ${arrondissement}` : ''].filter((x) => x !== '').join(', ');
  const ligne = [voie, lieu].filter((x) => x !== '').join(', ');
  return { voie, villeCP, arrondissement, voiePresente: voie !== '', ligne };
}
