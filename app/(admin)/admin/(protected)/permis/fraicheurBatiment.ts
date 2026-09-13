/**
 * FRAÎCHEUR d'une carte de bâtiment — un bouton de validation ne reste VERT que sur la DERNIÈRE valeur saisie. PUR (client-safe,
 * aucune I/O, aucune couleur). C'est une COMPARAISON entre la SAISIE COURANTE (chaînes des inputs) et l'ÉTAT PERSISTÉ (valeurs en base) :
 * revenir à la valeur exacte de la base redonne l'état « à jour ». Vit ICI (dossier UI) et non dans app/lib/permis/* : logique de
 * présentation, pas de moteur. Deux boutons concernés :
 *   · B1 « Enregistrer ce bâtiment » — repère, adresse + 7 mesures (TOUT sauf l'altitude du sommet, validée à part) ;
 *   · B2 « Valider cette altitude » — l'altitude du sommet (SOURCE `champDiffereBase`, déjà employée par le bouton, cf. ChampMesureEditeur).
 */

/**
 * Un champ NUMÉRIQUE diffère-t-il de sa valeur en base ? Chaîne vide → null (jamais 0) ; saisie ILLISIBLE (en cours de frappe) → `false`
 * (pas d'alerte parasite). Comparaison de VALEUR, pas de forme. ⚠️ Corps IDENTIQUE à l'ancienne fonction privée de ChampMesureEditeur
 * (bouton d'altitude) : elle est simplement remontée ici pour être la SOURCE UNIQUE partagée par le bouton d'altitude ET la fraîcheur B1.
 */
export function champDiffereBase(valeurChamp: string, base: number | null | undefined): boolean {
  const c = valeurChamp.trim() === '' ? null : Number(valeurChamp);
  if (c !== null && !Number.isFinite(c)) return false; // saisie en cours illisible → pas d'alerte parasite
  return (c ?? null) !== ((base ?? null) as number | null);
}

/** Un champ TEXTE (repère, adresse) diffère-t-il de sa valeur en base ? Comparaison après trim ; base `null` ≡ chaîne vide. */
export function texteDiffereBase(valeurChamp: string, base: string | null | undefined): boolean {
  return valeurChamp.trim() !== (base ?? '').trim();
}

/** Clés des MESURES numériques écrites par « Enregistrer ce bâtiment » — TOUT sauf `altitudeSommetNgf` (validée par son propre geste). */
export const CHAMPS_ENREGISTRES_MESURE = [
  'nbEtages', 'nbNiveauxSousSol', 'altitudeDernierPlancherNgf',
  'hauteurMaxPluNgf', 'altitudePlateauNivellementNgf', 'hauteurRelativeM', 'altitudeTerrainNaturelNgf',
] as const;
export type ChampEnregistreMesure = (typeof CHAMPS_ENREGISTRES_MESURE)[number];

/** Saisie courante d'une carte réduite aux champs comparables (chaînes des inputs). */
export type SaisieCarte = { repere: string; adresse: string } & Record<ChampEnregistreMesure, string>;
/** Valeurs persistées correspondantes (base). */
export type BaseCarte = { repere: string | null; adresse: string | null } & Record<ChampEnregistreMesure, number | null>;

/**
 * B1 — la carte est-elle ENREGISTRÉE ET À JOUR ? `true` ssi AUCUN champ écrit par « Enregistrer ce bâtiment » ne diffère de la base
 * (repère, adresse, 7 mesures hors sommet). Une modification quelconque — y compris VIDER un champ rempli — le rend `false` ;
 * revenir à la valeur exacte de la base le rend `true` de nouveau.
 */
export function batimentEnregistreAJour(saisie: SaisieCarte, base: BaseCarte): boolean {
  if (texteDiffereBase(saisie.repere, base.repere)) return false;
  if (texteDiffereBase(saisie.adresse, base.adresse)) return false;
  for (const c of CHAMPS_ENREGISTRES_MESURE) if (champDiffereBase(saisie[c], base[c])) return false;
  return true;
}

/**
 * B2 — l'altitude du sommet est-elle VALIDÉE ET À JOUR ? `true` ssi elle est validée en base (`confirmeLe` posé) ET la valeur du champ
 * n'a pas changé depuis (même règle « valeur inchangée » que le bouton d'altitude, via `champDiffereBase`). SOURCE partagée avec
 * ChampMesureEditeur : dès qu'on modifie la valeur, ce booléen tombe à `false` comme le bouton repasse au rouge.
 */
export function altitudeSommetValideeAJour(confirmeLe: string | null | undefined, saisieSommet: string, baseSommet: number | null | undefined): boolean {
  return !!confirmeLe && !champDiffereBase(saisieSommet, baseSommet);
}
