/**
 * BAT — SESSION D'AJUSTEMENT (module PUR, testé). Deux décisions partagées, sans coupler au composant :
 *  · `deltaEgal` — deux deltas rigides (translation, rotation, échelle) sont-ils identiques (à epsilon près) ?
 *  · `estAjustementModifie` — la session EN COURS a-t-elle été MODIFIÉE par rapport à son point d'armement ?
 *    Armement = pour une emprise, le delta DÉJÀ persisté (`e.ajustement`) sinon l'identité ; pour un geste d'ENSEMBLE (bloc), l'identité.
 *    Sert (1) à PURGER une session provisoire INTOUCHÉE quand on quitte le plein écran (aucune pollution de la vue normale — armer les
 *    poignées à l'arrivée ne doit rien laisser derrière si l'internaute n'a rien fait), (2) à AVERTIR avant qu'un changement de sélection
 *    n'abandonne un travail non enregistré.
 *
 * Découplé À DESSEIN de app/lib/permis : on n'y compare que les 4 scalaires du delta (le centre est le pivot, posé à l'armement et
 * inchangé par les gestes → hors comparaison). Tout `Ajustement` réel est structurellement compatible avec `DeltaComparable`.
 */
export interface DeltaComparable { tx: number; ty: number; rotDeg: number; echelle: number }

/** Identité : aucune translation/rotation, échelle 1 (le centre n'entre pas dans la comparaison). */
const IDENTITE: DeltaComparable = { tx: 0, ty: 0, rotDeg: 0, echelle: 1 };

/** Deux deltas sont-ils égaux (translation, rotation, échelle) à `eps` près ? PUR. */
export function deltaEgal(a: DeltaComparable, b: DeltaComparable, eps = 1e-9): boolean {
  return Math.abs(a.tx - b.tx) <= eps
    && Math.abs(a.ty - b.ty) <= eps
    && Math.abs(a.rotDeg - b.rotDeg) <= eps
    && Math.abs(a.echelle - b.echelle) <= eps;
}

/**
 * La session d'ajustement a-t-elle été MODIFIÉE depuis son armement ? `null` → false (aucune session). PUR.
 * @param ajustement session en cours (bloc + emprise ciblée + delta courant), ou null.
 * @param emprises liste des emprises (pour retrouver le delta persisté de l'emprise ciblée = point d'armement).
 */
export function estAjustementModifie(
  ajustement: { bloc: boolean; id: number | null; delta: DeltaComparable } | null,
  emprises: readonly { id: number; ajustement: DeltaComparable | null }[],
): boolean {
  if (!ajustement) return false;
  const arme = ajustement.bloc
    ? IDENTITE
    : (emprises.find((e) => e.id === ajustement.id)?.ajustement ?? IDENTITE);
  return !deltaEgal(ajustement.delta, arme);
}

// BAT (défaut B) — DEUX modes de travail per-emprise dans le plein écran : 'ajuster' (delta rigide) et 'retoucher' (sommet par sommet).
export type ModeGeste = 'ajuster' | 'retoucher';

/**
 * La session de RETOUCHE a-t-elle été MODIFIÉE depuis son ouverture ? C'est l'ÉQUIVALENT « sommets » de `estAjustementModifie` : OUVRIR une
 * retouche n'est pas retoucher. Une retouche s'ouvre avec un historique VIDE (`hist: []`) ; elle n'est modifiée que dès qu'un sommet a été
 * déplacé/inséré/supprimé (au moins une entrée d'historique). Un « Annuler » qui ramène l'historique à vide revient donc à « non modifiée ».
 * `retoucheHist` = longueur de l'historique de retouche (0 = intouchée). PUR.
 */
export function estRetoucheModifiee(retoucheHist: number): boolean {
  return retoucheHist > 0;
}

/**
 * BAT (défaut B) — Le TRAVAIL EN COURS (quel que soit le mode) porte-t-il des modifications NON ENREGISTRÉES ? PUR. UNE seule notion de
 * « travail modifié », DEUX natures, jamais deux mécanismes parallèles :
 *  · ajustement rigide → `estAjustementModifie` (delta ≠ armement) ;
 *  · retouche par sommet → `estRetoucheModifiee` (au moins une édition dans l'historique).
 * Sert de « raison » unique à la garde anti-perte (changement de polygone OU de mode) ET à la purge des sessions INTOUCHÉES à la fermeture.
 * `retoucheHist` = longueur de l'historique de retouche.
 */
export function sessionModifiee(
  ajustement: { bloc: boolean; id: number | null; delta: DeltaComparable } | null,
  emprises: readonly { id: number; ajustement: DeltaComparable | null }[],
  retoucheHist: number,
): boolean {
  return estRetoucheModifiee(retoucheHist) || estAjustementModifie(ajustement, emprises);
}

/**
 * BAT (défauts D & B) — DÉCISION unique : basculer vers (emprise `cible.id`, mode `cible.mode`) est-il REFUSÉ (⇒ confirmation) ? Vrai
 * UNIQUEMENT si c'est un VRAI changement (autre emprise ET/OU autre mode) ET qu'un travail non enregistré est en cours (`dirty`). Sinon
 * faux : rien en cours, cible = état courant, ou session intouchée → bascule directe. PUR → l'écran n'a plus qu'à AFFICHER la confirmation.
 * Couvre à la fois le changement de POLYGONE (cartouche) et le changement de MODE (ajuster ⇄ retoucher) — une seule garde, jamais deux.
 */
export function basculeRefusee(
  courant: { id: number | null; mode: ModeGeste } | null,
  cible: { id: number; mode: ModeGeste },
  dirty: boolean,
): boolean {
  if (!courant) return false;                                                  // rien en cours → jamais refusé
  if (courant.id === cible.id && courant.mode === cible.mode) return false;    // déjà cet état (emprise + mode) → pas un changement
  return dirty;                                                                // vrai changement + travail non enregistré → refusé (confirmer)
}

/**
 * BAT (défaut A) — SOURCE UNIQUE de l'emprise SÉLECTIONNÉE (celle sur laquelle on travaille), quel que soit le mode. C'est le SEUL endroit
 * qui décide « quelle emprise est visée ». TOUT en dérive — le cartouche cerclé, le nom de la barre, le SURLIGNAGE du polygone dans le schéma
 * ET la CIBLE des gestes (l'ajustement s'arme sur cet id) — donc ces cinq indicateurs ne peuvent PAS désigner des polygones différents.
 *  · ajustement d'UNE emprise → son id ; · geste d'ENSEMBLE (bloc, id null) → null (aucune emprise unique) ; · retouche → l'emprise retouchée ;
 *  · rien en cours → null. PUR.
 */
export function empriseSelectionnee(
  ajustement: { bloc: boolean; id: number | null } | null,
  retouche: { id: number } | null,
): number | null {
  if (ajustement && !ajustement.bloc) return ajustement.id;
  if (retouche) return retouche.id;
  return null;
}
