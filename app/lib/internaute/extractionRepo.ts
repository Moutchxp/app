import 'server-only';
/**
 * Module INTERNAUTE — LOT 3 : ACCÈS BASE de l'exploitation interne (serveur only).
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Lecture SEULE des colonnes déjà persistées (LOT 2) — le moteur n'est
 * jamais rappelé (golden intact). La seule écriture est le JOURNAL d'accountability (`internaute_extraction_log`).
 *
 * ⚠️ INVARIANT STRUCTUREL (raison d'être de la vue du LOT 1) : toute lecture exploitable JOINT
 * `internaute_consentement_actif` sur (finalité F1 recontact_interne, actif=true) ET exclut les opposés
 * (`opposition_recontact=false`). Un profil sans consentement F1 actif N'APPARAÎT JAMAIS. Cet invariant vit dans
 * `FROM_INVARIANT` ci-dessous, partagé par le comptage, la liste et l'export.
 */
import { query } from '../db/client';
import { construireFiltres, versCsv, type FiltresExtraction, type LigneProfil } from './extraction';

/**
 * Clause FROM/JOIN portant l'INVARIANT de consentement. Le dernier projet de chaque personne est joint par
 * LATERAL (une personne ↔ N analyses → la plus récente sert aux filtres/affichage). AUCUN paramètre ici : la
 * finalité est un littéral constant (jamais une entrée utilisateur) → les filtres commencent à $1.
 */
const FROM_INVARIANT = `
  FROM internaute i
  JOIN internaute_consentement_actif ca
    ON ca.internaute_id = i.id AND ca.finalite = 'recontact_interne' AND ca.actif = true
  LEFT JOIN LATERAL (
    SELECT verdict, score, dernier_etage, residence_principale, commune_insee
    FROM internaute_projet pr WHERE pr.internaute_id = i.id ORDER BY pr.cree_a DESC LIMIT 1
  ) p ON true
  WHERE i.opposition_recontact = false
    AND i.efface_a IS NULL            -- LOT 4 : un profil effacé (PII anonymisées) ne réapparaît JAMAIS en extraction
`;

function clauseWhere(clauses: string[]): string {
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

/** Page de profils F1-consentants correspondant aux filtres + total. Lecture seule. */
export async function lireProfilsFiltres(
  filtres: FiltresExtraction,
  page: number,
  taille: number,
): Promise<{ total: number; lignes: LigneProfil[] }> {
  const { clauses, params } = construireFiltres(filtres);
  const where = clauseWhere(clauses);

  const total = await query<{ n: string }>(`SELECT count(*)::text AS n ${FROM_INVARIANT}${where}`, params);

  const offset = Math.max(0, (page - 1) * taille);
  const lignes = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ca.horodatage AS consenti_le
     ${FROM_INVARIANT}${where}
     ORDER BY i.cree_a DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, taille, offset],
  );
  return { total: Number(total.rows[0]?.n ?? 0), lignes: lignes.rows };
}

/** Toutes les lignes filtrées (sans pagination) pour l'export CSV — MÊME invariant F1. */
export async function lireProfilsExport(filtres: FiltresExtraction): Promise<LigneProfil[]> {
  const { clauses, params } = construireFiltres(filtres);
  const r = await query<LigneProfil>(
    `SELECT i.id, i.prenom, i.nom, i.email, i.telephone, i.cree_a,
            p.verdict, p.score, p.commune_insee, p.dernier_etage, p.residence_principale,
            ca.horodatage AS consenti_le
     ${FROM_INVARIANT}${clauseWhere(clauses)}
     ORDER BY i.cree_a DESC`,
    params,
  );
  return r.rows;
}

export { versCsv };

/** Dossier complet d'UNE personne (droit d'accès). Renvoie null si l'id n'existe pas. */
export async function lireProfilComplet(id: string): Promise<{
  internaute: Record<string, unknown>;
  projets: Record<string, unknown>[];
  consentements: Record<string, unknown>[];
} | null> {
  const pers = await query(
    `SELECT id, prenom, nom, email, telephone, source_collecte, opposition_recontact, cree_a, maj_a, efface_a
     FROM internaute WHERE id = $1`,
    [id],
  );
  if (pers.rows.length === 0) return null;

  const projets = await query(
    `SELECT id, version_tunnel, payload, verdict, score, etage, dernier_etage, residence_principale,
            commune_insee, adresse_saisie, adresse_normalisee, cree_a
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
  details: { filtres?: FiltresExtraction; nbLignes?: number; cibleInternauteId?: string },
): Promise<void> {
  await query(
    `INSERT INTO internaute_extraction_log (utilisateur_id, action, cible_internaute_id, filtres, nb_lignes)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      auteurId,
      action,
      details.cibleInternauteId ?? null,
      details.filtres ? JSON.stringify(details.filtres) : null,
      details.nbLignes ?? null,
    ],
  );
}
