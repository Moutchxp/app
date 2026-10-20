/**
 * ══ 🔴🔴 LA MENTION « EN INDIVISION AVEC » (Arno, 20/10/2026 — correctif du point 6 de la migration 393). PUR. ══════════════
 *
 * « La mention n'apparaît que sur un bien qui a réellement, POUR CE BIEN, au moins un autre copropriétaire avec un lien en
 * cours et une fiche non archivée. Elle ne cite que ces copropriétaires-là, jamais le propriétaire de la fiche affichée. »
 *
 * LE DÉFAUT CORRIGÉ (constaté sur la fiche 146 en recette) : la première version prenait chaque lien sans date de fin,
 * MÊME D'UNE FICHE ARCHIVÉE — les cinq biens de 146 portent des liens d'essai (fiches 310 à 313, archivées les 30/09 et
 * 01/10/2026, liens jamais clos) et affichaient tous « en indivision avec » ces fiches.
 *
 * Un copropriétaire ACTIF du bien `lo` :
 *   · une fiche NON ARCHIVÉE et NON SUPPRIMÉE ;
 *   · le titulaire du bien (`lo.proprietaire_id`), OU un lien de `gestion_annuaire_lot_proprietaire` EN COURS pour CE bien
 *     (commencé — début vide ou passé — et pas fini — fin vide ou à venir, incluse) ;
 *   · jamais le propriétaire de la fiche affichée (`moi`).
 */
export const SQL_JOUR_PARIS = `(now() AT TIME ZONE 'Europe/Paris')::date`;

/** Un lien (alias `lp`) en cours aujourd'hui. */
export function sqlLienEnCours(lp: string): string {
  return `(${lp}.depuis IS NULL OR ${lp}.depuis <= ${SQL_JOUR_PARIS}) AND (${lp}.jusqu_a IS NULL OR ${lp}.jusqu_a >= ${SQL_JOUR_PARIS})`;
}

/**
 * Les NOMS des autres copropriétaires actifs du bien `lo` (tableau trié, NULL s'il n'y en a aucun), sans `moi` (un
 * paramètre SQL, ex. `$1`). `vivante` : le fragment « fiche non supprimée » pour l'alias `px` (`sqlPersonneVivante`).
 */
export function sqlCoproprietairesActifs(lo: string, moi: string, vivante: string): string {
  return `(SELECT array_agg(DISTINCT px.nom_complet ORDER BY px.nom_complet) FROM gestion_annuaire_proprietaire px
     WHERE px.id <> ${moi} AND px.nom_complet IS NOT NULL AND px.archive_le IS NULL AND ${vivante}
       AND (px.id = ${lo}.proprietaire_id OR EXISTS (SELECT 1 FROM gestion_annuaire_lot_proprietaire lp
             WHERE lp.lot_id = ${lo}.id AND lp.proprietaire_id = px.id AND ${sqlLienEnCours('lp')})))`;
}

/** La mention, ou `null` : rien quand il n'y a aucun autre copropriétaire actif. */
export function motIndivision(autres: readonly string[] | null | undefined): string | null {
  const l = (autres ?? []).filter((x) => x.trim() !== '');
  return l.length === 0 ? null : `en indivision avec ${l.join(', ')}`;
}
