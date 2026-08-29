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

/** Normalise une date (chaîne 'YYYY-MM-DD' ou Date) en ISO 'YYYY-MM-DD' — comparable lexicographiquement — ou null si illisible.
 *  Exporté : réutilisé par le moteur de surveillance des polygones (SURV-1) pour situer la fenêtre post-validation. */
export function versISODate(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const c = composantsJour(v);
  return c ? new Date(Date.UTC(c.y, c.m, c.d)).toISOString().slice(0, 10) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE-2 — MOTEUR de décision de phase du verdict CERTIFIÉ. PUR : ne lit rien, ne décide d'AUCUN verdict, ne touche NI le moteur SVAV
// NI le rattachement. Il prend des FAITS déjà collectés et rend la phase + les conséquences d'affichage/écriture.
//
// RÈGLE MÉTIER (Arno) — trois conditions CUMULATIVES déclenchent la bascule :
//   (a) délai écoulé : aujourd'hui − date d'accord ≥ delai_bascule_jours ;
//   (b) nouveaux polygones officiels arrivés ;  (c) rattachement validé.
// Décision d'Arno (feu vert PHASE-2) : (b) est SUBSUMÉE par (c) — le moteur ne ré-infère PAS la présence de polygones par un diff
//   géométrique (« deuxième vérité fragile ») ; il consomme `rattachementValide`, qui certifie que le bâti est apparu ET confirmé.
//   Une validation AUTOMATIQUE ('moteur:auto') vaut validation (son label/alerte distincts = chantier séparé, hors de ce module).
//
// 🔴 INVARIANT ANTI-RÉGRESSION : dès que `basculeLe` est renseignée, elle FAIT FOI. La phase se calcule alors par arithmétique de
//   dates (bascule + duree_message), JAMAIS phase 1, quelles que soient les conditions vivantes (un rattachement redevenu invalide,
//   un bâti disparu…). Interdits (portés par le caller) : recalculer `basculeLe` si déjà posée, l'effacer. Ici : on ne la relit jamais.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export type PhaseVerdict = 1 | 2 | 3;

export interface EntreePhase {
  dateAccord: Date | string | null | undefined;   // sitadel_dossier.date_reelle_autorisation
  delaiBasculeJours: number;                        // config_veille.delai_bascule_jours (≥ 0)
  dureeMessageJours: number;                        // config_veille.duree_message_jours (≥ 0)
  rattachementValide: boolean;                      // (c), subsume (b) : etat='valide' (humain OU moteur:auto)
  basculeLe: Date | string | null | undefined;      // permis_rattachement.bascule_le — si présente, FAIT FOI (anti-régression)
  aujourdhui: Date | string;                        // injecté (pureté) — normalement current_date
}

export interface DecisionPhase {
  phase: PhaseVerdict;
  doitEcrireBascule: boolean;   // true UNIQUEMENT à l'instant où la bascule survient (conditions réunies ET basculeLe encore vide)
  dateBascule: string | null;   // 'YYYY-MM-DD' à écrire si doitEcrireBascule (= aujourd'hui, l'instant d'observation) ; sinon null
  afficherMessage: boolean;     // message « construction récente » (phase 2 seulement)
  verdictProjetePropose: boolean; // le verdict projeté est proposé (phase 1 seulement)
}

/**
 * Décide la phase d'un dossier à partir de faits déjà collectés. Ne lit rien, n'écrit rien : l'écriture write-once de `basculeLe`
 * est faite par le CALLER (`UPDATE … WHERE dossier_id=$1 AND bascule_le IS NULL`) quand `doitEcrireBascule` est vrai.
 */
export function deciderPhase(e: EntreePhase): DecisionPhase {
  const aujourdhui = versISODate(e.aujourdhui);

  // 1) `basculeLe` FAIT FOI (anti-régression) : dossier déjà basculé → phase 2 ou 3 par arithmétique, JAMAIS phase 1. On NE relit ni
  //    le délai ni la validation : une condition vivante qui flanche ne peut pas rétrograder un dossier basculé.
  const bascule = versISODate(e.basculeLe);
  if (bascule !== null) {
    const finMessage = dateBasculeTheorique(bascule, e.dureeMessageJours); // bascule + duree_message
    // Message actif tant qu'aujourd'hui < fin de fenêtre. Fenêtre incalculable (durée invalide) → conservateur : on continue d'informer.
    const messageActif = finMessage !== null && aujourdhui !== null ? aujourdhui < finMessage : true;
    return { phase: messageActif ? 2 : 3, doitEcrireBascule: false, dateBascule: null, afficherMessage: messageActif, verdictProjetePropose: false };
  }

  // 2) Pas encore basculé → conditions vivantes. (a) délai écoulé + (c) rattachement validé (qui subsume b).
  const dateBasculeTh = dateBasculeTheorique(e.dateAccord, e.delaiBasculeJours);
  const delaiEcoule = dateBasculeTh !== null && aujourdhui !== null && aujourdhui >= dateBasculeTh;
  if (delaiEcoule && e.rattachementValide === true) {
    // LA BASCULE SURVIENT MAINTENANT : on enregistre la date d'OBSERVATION (aujourd'hui), pas la date théorique — les conditions
    //   b/c peuvent n'être réunies que bien après le délai. Phase 2 démarre, message actif. `aujourdhui` est ici forcément lisible
    //   (delaiEcoule l'exige).
    return { phase: 2, doitEcrireBascule: true, dateBascule: aujourdhui, afficherMessage: true, verdictProjetePropose: false };
  }

  // Phase 1 : ancienne configuration, verdict projeté proposé (y compris si la date d'accord est absente → bascule non calculable).
  return { phase: 1, doitEcrireBascule: false, dateBascule: null, afficherMessage: false, verdictProjetePropose: true };
}
