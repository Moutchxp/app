import 'server-only';
/**
 * Module INTERNAUTE — LOT 3 : ACCÈS BASE de l'exploitation interne (serveur only).
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Lecture SEULE des colonnes déjà persistées (LOT 2) — le moteur n'est
 * jamais rappelé (golden intact). La seule écriture est le JOURNAL d'accountability (`internaute_extraction_log`).
 *
 * ⚠️ INVARIANT STRUCTUREL (raison d'être de la vue du LOT 1) : toute lecture exploitable contraint sur
 * `internaute_consentement_actif` par l'INTERSECTION des statuts cochés (un `EXISTS(finalité active)` par statut, en
 * AND ; `opposition_recontact=false` ssi F1 ∈ statuts). Un profil sans TOUS les statuts cochés actifs N'APPARAÎT
 * JAMAIS ; une sélection VIDE ne renvoie RIEN (fail-closed). Cet invariant est construit par `clauseStatuts`
 * (extraction.ts, pur & testable), partagé par le comptage, la liste et l'export.
 */
import { query } from '../db/client';
import { construireFiltres, clauseStatuts, exprConsentiLe, normaliserStatuts, ordreListe, FINALITE_F1, versCsv, type FiltresExtraction, type LigneProfil } from './extraction';
import type { CleFinalite } from './textesConsentement';

// L'invariant de consentement (FROM/WHERE, INTERSECTION de statuts) est construit par `clauseStatuts` (extraction.ts,
// pur & testable) ; ici on ne fait que l'EXÉCUTER. GARDE FAIL-CLOSED : une sélection de statuts VIDE renvoie un
// résultat vide SANS émettre de requête (jamais toute la base). `consenti_le` = `exprConsentiLe(statuts)`.

function clauseWhere(clauses: string[]): string {
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

/**
 * FRONTIÈRE DE DONNÉES : le driver `pg` renvoie les colonnes `numeric` (ici `internaute_projet.score`) SOUS FORME
 * DE CHAÎNE. On coerce `score` en `number` ICI, une seule fois, pour que le runtime honore le type `LigneProfil`
 * (le JSX peut alors faire confiance au type — `l.score.toFixed()` etc. sans planter). `lat`/`lon` ne sont PAS
 * concernés (colonnes `double precision` → déjà des nombres). Coercition d'affichage : n'altère aucun calcul de
 * score autoritatif (le moteur reste la seule source du score ; ici on relit une copie déjà persistée).
 */
function coercerLigne(r: LigneProfil): LigneProfil {
  return { ...r, score: r.score == null ? null : Number(r.score) };
}

/** Page de profils = INTERSECTION des statuts cochés (tous actifs) ∩ filtres, + total. Lecture seule.
 *  GARDE FAIL-CLOSED : `statuts` vide (après normalisation) → `{ total: 0, lignes: [] }` SANS requête (jamais toute la base). */
export async function lireProfilsFiltres(
  filtres: FiltresExtraction,
  page: number,
  taille: number,
  statuts: readonly CleFinalite[],
): Promise<{ total: number; lignes: LigneProfil[] }> {
  if (normaliserStatuts(statuts).length === 0) return { total: 0, lignes: [] };
  const { clauses, params } = construireFiltres(filtres);
  const where = clauseWhere(clauses);
  const from = clauseStatuts(statuts);
  const consenti = exprConsentiLe(statuts);

  const total = await query<{ n: string }>(`SELECT count(*)::text AS n ${from}${where}`, params);

  const offset = Math.max(0, (page - 1) * taille);
  const lignes = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ${consenti} AS consenti_le
     ${from}${where}
     ${ordreListe(filtres)}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, taille, offset],
  );
  return { total: Number(total.rows[0]?.n ?? 0), lignes: lignes.rows.map(coercerLigne) };
}

/** Toutes les lignes de l'INTERSECTION des statuts ∩ filtres (sans pagination), pour l'export CSV. Fail-closed si vide. */
export async function lireProfilsExport(filtres: FiltresExtraction, statuts: readonly CleFinalite[]): Promise<LigneProfil[]> {
  if (normaliserStatuts(statuts).length === 0) return [];
  const { clauses, params } = construireFiltres(filtres);
  const r = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ${exprConsentiLe(statuts)} AS consenti_le
     ${clauseStatuts(statuts)}${clauseWhere(clauses)}
     ${ordreListe(filtres)}`,
    params,
  );
  return r.rows.map(coercerLigne);
}

/**
 * COMPTE des profils de l'INTERSECTION des statuts ∩ filtres — pour le compteur LIVE « == ce que l'export sortira ».
 * Réutilise EXACTEMENT les MÊMES builders que la liste/l'export (`clauseStatuts` + `construireFiltres`) → le nombre
 * renvoyé est identique à ce que `lireProfilsExport(filtres, statuts)` produirait (mêmes FROM/WHERE, mêmes params).
 * GARDE FAIL-CLOSED (même patron que les 3 lectures) : `statuts` vide (après normalisation) → `0` SANS requête ;
 * défense en profondeur = le `WHERE false` de `clauseStatuts([])`. JAMAIS de `FROM internaute` brut. Lecture seule.
 */
export async function compterProfils(filtres: FiltresExtraction, statuts: readonly CleFinalite[]): Promise<number> {
  if (normaliserStatuts(statuts).length === 0) return 0; // fail-closed : aucune requête sans contrainte de finalité
  const { clauses, params } = construireFiltres(filtres);
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n ${clauseStatuts(statuts)}${clauseWhere(clauses)}`,
    params,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Bornes de dates de création de la base, pour le bouton « depuis toujours » : MIN/MAX `cree_a` sur `internaute`
 * NON effacés (`efface_a IS NULL`, cohérent avec l'extraction). Étendue TEMPORELLE de la base, indépendante des
 * filtres — sert seulement à pré-remplir les champs de dates côté UI. `to_char` → 'YYYY-MM-DD' directement
 * consommable par un `<input type="date">`. Base vide → `{ null, null }`. Lecture seule.
 */
export async function lireBornesDates(): Promise<{ min: string | null; max: string | null }> {
  const r = await query<{ min: string | null; max: string | null }>(
    `SELECT to_char(min(cree_a), 'YYYY-MM-DD') AS min, to_char(max(cree_a), 'YYYY-MM-DD') AS max
     FROM internaute WHERE efface_a IS NULL`,
  );
  return { min: r.rows[0]?.min ?? null, max: r.rows[0]?.max ?? null };
}

/** Libellés des départements IDF (référence STATIQUE, pas une liste d'existence : la liste RÉELLE est requêtée à
 *  chaud). Un département hors carte → son code est affiché tel quel (`deptNom = dept`). */
const DEPT_NOM: Record<string, string> = {
  '75': 'Paris', '77': 'Seine-et-Marne', '78': 'Yvelines', '91': 'Essonne',
  '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': "Val-d'Oise",
};

/**
 * Communes RÉELLEMENT présentes chez les consentants de l'ENSEMBLE de statuts (extraction commerciale nominative —
 * PAS de k-anonymat ici). DYNAMIQUE : `SELECT DISTINCT p.commune_insee` sur l'intersection (`clauseStatuts`), joint à
 * `adresse_ban` (référentiel géo public BAN/IGN) pour le NOM — lu DIRECTEMENT via `db/client`, JAMAIS via
 * `app/lib/analytics/*` (cloisonnement M2). Défaut `[FINALITE_F1]` (le picker géo interroge F1, comportement
 * historique ; le câbler sur les statuts cochés est un affinage ultérieur). `statuts` vide → `WHERE false` → aucune
 * commune. Aucune liste en dur ; nom absent → INSEE. Département = 2 premiers car. (IDF) ; libellé via `DEPT_NOM`.
 */
export async function lireCommunesPresentes(statuts: readonly CleFinalite[] = [FINALITE_F1]): Promise<{ insee: string; nom: string; dept: string; deptNom: string }[]> {
  if (normaliserStatuts(statuts).length === 0) return []; // fail-closed explicite (cohérent avec les 3 lectures), doublé du `WHERE false`
  const r = await query<{ insee: string; nom: string | null }>(
    `SELECT c.insee AS insee, MAX(a.nom_commune) AS nom
       FROM (SELECT DISTINCT p.commune_insee AS insee ${clauseStatuts(statuts)} AND p.commune_insee IS NOT NULL) c
       LEFT JOIN adresse_ban a ON a.insee_commune = c.insee
      GROUP BY c.insee
      ORDER BY 1`,
  );
  return r.rows.map((row) => {
    const dept = row.insee.slice(0, 2);
    return { insee: row.insee, nom: row.nom ?? row.insee, dept, deptNom: DEPT_NOM[dept] ?? dept };
  });
}

export { versCsv };

/** Dossier complet d'UNE personne (droit d'accès). Renvoie null si l'id n'existe pas. */
export async function lireProfilComplet(id: string): Promise<{
  internaute: Record<string, unknown>;
  projets: Record<string, unknown>[];
  consentements: Record<string, unknown>[];
} | null> {
  const pers = await query(
    `SELECT id, prenom, nom, email, telephone, source_collecte, opposition_recontact, parcours, cree_a, maj_a, efface_a
     FROM internaute WHERE id = $1`,
    [id],
  );
  if (pers.rows.length === 0) return null;

  const projets = await query(
    `SELECT id, version_tunnel, payload, verdict, score, etage, dernier_etage, residence_principale,
            commune_insee, lat, lon, adresse_saisie, adresse_normalisee, cree_a,
            azimut_deg, hauteur_sous_plafond_m, hauteur_vision_m
     FROM internaute_projet WHERE internaute_id = $1 ORDER BY cree_a DESC`,
    [id],
  );

  // État de consentement PAR finalité (vue actif) + libellé. Montre à quoi la personne a consenti et depuis quand.
  const consentements = await query(
    `SELECT f.cle AS finalite, f.libelle, ca.etat, ca.actif, ca.horodatage AS depuis
     FROM internaute_finalite f
     LEFT JOIN internaute_consentement_actif ca ON ca.finalite = f.cle AND ca.internaute_id = $1
     ORDER BY f.ordre`,
    [id],
  );

  return { internaute: pers.rows[0], projets: projets.rows, consentements: consentements.rows };
}

/** Journalise une action d'exploitation (accountability). Append-only. `auteurId` = admin (null = voie de secours). */
export async function journaliserExtraction(
  auteurId: number | null,
  action: 'export_csv' | 'acces_profil',
  details: { filtres?: FiltresExtraction; nbLignes?: number; cibleInternauteId?: string; statuts?: string },
): Promise<void> {
  // Les STATUTS d'export (quelle intersection de consentements) sont tracés DANS le blob jsonb `filtres` (aucune
  // colonne dédiée → aucune migration) : l'audit distingue ainsi un export {F1} d'un export {F1,F2}. `filtres`/`statuts`
  // absents → NULL (comportement inchangé pour `acces_profil`, qui n'en passe aucun).
  const blob =
    details.filtres || details.statuts
      ? JSON.stringify({ ...(details.filtres ?? {}), ...(details.statuts ? { statuts: details.statuts } : {}) })
      : null;
  await query(
    `INSERT INTO internaute_extraction_log (utilisateur_id, action, cible_internaute_id, filtres, nb_lignes)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      auteurId,
      action,
      details.cibleInternauteId ?? null,
      blob,
      details.nbLignes ?? null,
    ],
  );
}
