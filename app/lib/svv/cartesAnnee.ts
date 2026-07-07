/**
 * Cartes d'année de construction configurables — module PUR (aucun accès DB, aucune IA).
 *
 * Source unique de vérité partagée entre le matching MOTEUR (`familleCoeff`) et la validation
 * CRUD admin : `intervalleReelCarte` + `carteMatche` + `validerCartesAnnee`. N'affecte JAMAIS le
 * verdict (100 % géométrique) ; alimente uniquement la note de dégagement /80.
 *
 * ⚠️ ANNÉES ENTIÈRES UNIQUEMENT : le modèle d'intervalle réel `[lo, hi]` est ENTIER (opérateurs
 * stricts → ±1). `impactAnnee` (BDNB `annee_construction`) est TOUJOURS un entier — ne jamais
 * introduire d'arrondi ni de fraction (le cas fractionnaire n'est pas atteignable).
 */

/**
 * Carte d'année : fourchette (opérateur unaire OU intervalle) + pondération de faisceau.
 * Ordre des coefficients VERROUILLÉ `{ cone, flanc, distMaxM }` (mêmes rôles que `FamilleCoeff`).
 */
export type CarteAnnee = {
  /** Borne basse (année). `null` = pas de plancher (−∞). */
  borneMin: number | null;
  /** Opérateur de la borne basse. Présent SSI `borneMin` non null. */
  opMin: '>=' | '>' | null;
  /** Borne haute (année). `null` = pas de plafond (+∞). */
  borneMax: number | null;
  /** Opérateur de la borne haute. Présent SSI `borneMax` non null. */
  opMax: '<=' | '<' | null;
  /** Multiplicateur cône (|offset| ≤ coneFamilleDemiAngleDeg). */
  cone: number;
  /** Multiplicateur flanc (au-delà du cône). */
  flanc: number;
  /** Distance max (m) de valorisation du faisceau pour cette carte (cap du total). */
  distMaxM: number;
};

/**
 * Intervalle réel ENTIER `[lo, hi]` d'une carte (opérateurs stricts → ±1) :
 * `lo = borneMin null ? −∞ : (opMin='>=' ? borneMin : borneMin + 1)` ;
 * `hi = borneMax null ? +∞ : (opMax='<=' ? borneMax : borneMax − 1)`.
 */
export function intervalleReelCarte(c: CarteAnnee): [number, number] {
  const lo = c.borneMin === null ? -Infinity : c.opMin === '>=' ? c.borneMin : c.borneMin + 1;
  const hi = c.borneMax === null ? Infinity : c.opMax === '<=' ? c.borneMax : c.borneMax - 1;
  return [lo, hi];
}

/** `true` si l'année (entière) tombe dans l'intervalle réel de la carte. */
export function carteMatche(c: CarteAnnee, annee: number): boolean {
  const [lo, hi] = intervalleReelCarte(c);
  return annee >= lo && annee <= hi;
}

/**
 * Valide un ensemble de cartes (source unique du matching moteur ET du CRUD) :
 *  (a) par carte : au moins une borne non nulle ; opérateur présent SSI borne présente ;
 *      intervalle réel non vide (`lo ≤ hi`) ;
 *  (b) non-chevauchement STRICT : pour chaque paire (i<j), conflit si les intervalles réels
 *      se recouvrent (`max(lo) ≤ min(hi)`). Trou autorisé (année hors carte → aucun bonus).
 * Retourne TOUTES les erreurs (index de la carte concernée si applicable).
 */
export function validerCartesAnnee(
  cartes: CarteAnnee[],
): { ok: true } | { ok: false; erreurs: { index?: number; message: string }[] } {
  const erreurs: { index?: number; message: string }[] = [];

  cartes.forEach((c, index) => {
    if (c.borneMin === null && c.borneMax === null) {
      erreurs.push({ index, message: 'Au moins une borne (min ou max) doit être renseignée.' });
    }
    if (c.borneMin !== null && c.opMin === null) {
      erreurs.push({ index, message: 'La borne basse requiert un opérateur (≥ ou >).' });
    }
    if (c.borneMin === null && c.opMin !== null) {
      erreurs.push({ index, message: 'Opérateur de borne basse sans borne basse.' });
    }
    if (c.borneMax !== null && c.opMax === null) {
      erreurs.push({ index, message: 'La borne haute requiert un opérateur (≤ ou <).' });
    }
    if (c.borneMax === null && c.opMax !== null) {
      erreurs.push({ index, message: 'Opérateur de borne haute sans borne haute.' });
    }
    const [lo, hi] = intervalleReelCarte(c);
    if (lo > hi) {
      erreurs.push({ index, message: 'Intervalle vide (borne basse au-dessus de la borne haute).' });
    }
  });

  for (let i = 0; i < cartes.length; i++) {
    for (let j = i + 1; j < cartes.length; j++) {
      const [loI, hiI] = intervalleReelCarte(cartes[i]);
      const [loJ, hiJ] = intervalleReelCarte(cartes[j]);
      if (Math.max(loI, loJ) <= Math.min(hiI, hiJ)) {
        erreurs.push({ message: `Chevauchement entre les cartes ${i + 1} et ${j + 1}.` });
      }
    }
  }

  return erreurs.length === 0 ? { ok: true } : { ok: false, erreurs };
}
