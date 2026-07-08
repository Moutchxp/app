import 'server-only';
import { query } from '../../../../../lib/db/client';
import { versEntite, compteursParEtat, lireCorps, type LigneEntiteDB } from '../partage';

/** Familles patrimoine autorisées (miroir du CHECK `patrimoine_entite_famille_check`). */
const FAMILLES_PATRIMOINE = ['mondial', 'mh', 'inventaire'] as const;
type FamillePatrimoine = (typeof FAMILLES_PATRIMOINE)[number];

/**
 * GET /api/admin/curation/entites — LECTURE SEULE des entités patrimoine + leurs liaisons.
 *
 * Par entité : `id, famille, ref_code, nom, statut`, **point effectif**
 * `COALESCE(geom_point_corrige, geom_point)` projeté en **4326** (null si aucune ancre), un booléen
 * `corrige` (`geom_point_corrige` non null), l'**état** dérivé (rouge/orange/vert, cf. `etatEntite`)
 * et la liste des liaisons (`cleabs, source, actif, detache, verifie_manuellement`). Compteurs par
 * état. `ST_Force2D` conservé. Route gardée par `proxy.ts` (sans session → 401). Runtime Node.
 */
const SELECT_ENTITES = `
  SELECT
    e.id,
    e.famille,
    e.ref_code,
    e.nom,
    e.statut,
    e.meta->>'origine' AS origine,
    ST_AsGeoJSON(ST_Transform(ST_Force2D(COALESCE(e.geom_point_corrige, e.geom_point)), 4326)) AS point_geojson,
    (e.geom_point_corrige IS NOT NULL) AS corrige,
    EXISTS(SELECT 1 FROM curation_patrimoine_log l WHERE l.entite_id = e.id) AS a_historique,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'cleabs', peb.cleabs,
          'source', peb.source,
          'actif', peb.actif,
          'detache', peb.detache,
          'verifie_manuellement', peb.verifie_manuellement,
          'created', peb.created
        ) ORDER BY peb.created, peb.cleabs
      ) FILTER (WHERE peb.cleabs IS NOT NULL),
      '[]'::jsonb
    ) AS liaisons
  FROM patrimoine_entite e
  LEFT JOIN patrimoine_entite_batiment peb ON peb.entite_id = e.id
  GROUP BY e.id
  ORDER BY e.id
`;

export async function GET() {
  try {
    const { rows } = await query<LigneEntiteDB>(SELECT_ENTITES);
    const entites = rows.map(versEntite);
    const compteurs = compteursParEtat(entites.map((e) => e.etat));
    return Response.json({ entites, compteurs });
  } catch {
    return Response.json({ erreur: 'entités indisponibles' }, { status: 503 });
  }
}

/** Ligne créée renvoyée par l'INSERT (colonnes exposées). */
interface EntiteCreee {
  id: number;
  famille: string;
  ref_code: string;
  nom: string | null;
  meta: unknown;
}

/**
 * POST /api/admin/curation/entites — CRÉE une entité patrimoniale MANUELLE (tag). Sous-étape 1/6.
 *
 * GOLDEN-SAFE : une entité SANS liaison n'est vue par aucun chemin de score (moteur cleabs-only) ;
 * le boost ne se déclenchera qu'à l'ajout d'une liaison `patrimoine_entite_batiment` (sous-étape 2).
 * Body `{ famille: 'mondial'|'mh'|'inventaire', nom? (optionnel), statut? }`. `ref_code` généré serveur
 * (`MANUEL-<ts>`, jamais fourni par le client) ; `meta = {origine:'manuel'}` ; `geom_point` NULL ;
 * `actif=true`. Requête PARAMÉTRÉE, server-only, INSERT SEUL (ne touche aucune entité/liaison existante).
 * Journalisé (CTE atomique) : `curation_patrimoine_log` action `'creation_entite_manuelle'`
 * (`apres` = famille/nom/ref_code ; requiert le CHECK élargi de la migration 011). Erreur 23505 → 409.
 */
export async function POST(request: Request) {
  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const famille = body.famille;
  if (typeof famille !== 'string' || !FAMILLES_PATRIMOINE.includes(famille as FamillePatrimoine)) {
    return Response.json(
      { erreurs: [{ message: "famille attendue : 'mondial' | 'mh' | 'inventaire'" }] },
      { status: 422 },
    );
  }
  // Nom OPTIONNEL (B1) : vide/absent → NULL. Le cartouche résultat affiche alors un générique par famille.
  const nom = typeof body.nom === 'string' && body.nom.trim().length > 0 ? body.nom.trim() : null;
  const statut = typeof body.statut === 'string' && body.statut.trim().length > 0 ? body.statut.trim() : null;
  const refCode = `MANUEL-${Date.now()}`;
  const meta = JSON.stringify({ origine: 'manuel' });

  try {
    const { rows } = await query<EntiteCreee>(
      `WITH mut AS (
         INSERT INTO patrimoine_entite (famille, ref_code, nom, statut, actif, meta)
         VALUES ($1, $2, $3, $4, true, $5::jsonb)
         RETURNING id, famille, ref_code, nom, meta
       ), jrnl AS (
         INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
         SELECT 'creation_entite_manuelle', mut.id, NULL, NULL,
                jsonb_build_object('famille', mut.famille, 'nom', mut.nom, 'ref_code', mut.ref_code)
         FROM mut
       )
       SELECT id, famille, ref_code, nom, meta FROM mut`,
      [famille, refCode, nom, statut, meta],
    );
    const e = rows[0];
    return Response.json(
      { ok: true, entite: { id: e.id, famille: e.famille, refCode: e.ref_code, nom: e.nom, meta: e.meta } },
      { status: 201 },
    );
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return Response.json({ erreurs: [{ message: 'ref_code déjà utilisé, réessayez' }] }, { status: 409 });
    }
    return Response.json({ erreur: 'création impossible' }, { status: 503 });
  }
}
