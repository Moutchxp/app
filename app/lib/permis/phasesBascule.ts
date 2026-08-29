/**
 * PHASE-1 — arithmétique de dates du verdict à trois phases. Module PUR (aucune base, aucun effet de bord) : il répond à UNE seule
 * question — « à quelle date TOMBERAIT la bascule pour ce dossier ? » = date d'accord + délai (jours). Il ne décide RIEN d'autre :
 * pas de phase, pas de verdict, pas de lecture des polygones ni du rattachement. Ces conditions (polygones publiés, rattachement
 * validé) sont l'affaire du futur moteur de phases ; ici, on ne fait QUE le calcul de date.
 *
 * ⚠️ Cette date est THÉORIQUE (le délai minimal). La bascule RÉELLE, quand elle survient, est ENREGISTRÉE en base
 * (permis_rattachement.bascule_le) et n'est jamais recalculée — la durée du message s'y adosse (cf. migration 170).
 */

/** Extrait { année, mois (0-based), jour } d'une date d'accord, de façon TZ-stable. String 'YYYY-MM-DD' → composants littéraux
 *  (déterministe, pas d'ambiguïté de fuseau) ; Date → composants UTC. `null` si la valeur n'est pas une date exploitable. */
function composantsJour(v: Date | string): { y: number; m: number; d: number } | null {
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }
  return Number.isNaN(v.getTime()) ? null : { y: v.getUTCFullYear(), m: v.getUTCMonth(), d: v.getUTCDate() };
}

/**
 * Date THÉORIQUE de bascule = date d'accord + `delaiJours` jours CALENDAIRES. Rend une date ISO 'YYYY-MM-DD' (grain jour, sans heure
 * ni fuseau), ou `null` si la bascule n'est pas calculable :
 *   · date d'accord absente (null / undefined / illisible) → `null` (comportement EXPLICITE : « pas de bascule calculable ») ;
 *   · délai non entier ou négatif → `null` (garde : un délai vient d'un CHECK entier ≥ 30, mais on ne suppose rien).
 * Le décompte est fait en UTC via setUTCDate → les rollovers de mois/année et les années BISSEXTILES (29 février) sont gérés
 * nativement : « N jours après » tombe sur la bonne date calendaire, sans dérive de fuseau ni d'heure d'été.
 */
export function dateBasculeTheorique(dateAccord: Date | string | null | undefined, delaiJours: number): string | null {
  if (dateAccord == null) return null;
  if (!Number.isInteger(delaiJours) || delaiJours < 0) return null;
  const c = composantsJour(dateAccord);
  if (!c) return null;
  const d = new Date(Date.UTC(c.y, c.m, c.d));
  d.setUTCDate(d.getUTCDate() + delaiJours);
  return d.toISOString().slice(0, 10);
}
