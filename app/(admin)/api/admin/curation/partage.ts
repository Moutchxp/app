import 'server-only';
import { CURATION_DEPLACEMENT_RAYON_MAX_M, MESSAGE_RAYON_DEPASSE } from '../../../../lib/admin/curation';

/**
 * Helpers PARTAGÉS des routes CRUD de curation patrimoine (entités, point, liaisons, emprises).
 *
 * ISOLATION (invariant SVAV) : n'importe QUE `app/lib/admin/curation` (constantes). AUCUN accès
 * `app/lib/svv/**` (moteur), AUCUN `app/lib/db/pipeline`/`faisceaux`/`profilConfig` : le câblage de
 * curation ne touche NI le moteur NI le loader. Le pool `pg` (`client.ts`) n'est importé QUE par les
 * `route.ts` (écriture atomique locale via CTE). `geom_point` (original) n'est JAMAIS muté ici.
 */

export { CURATION_DEPLACEMENT_RAYON_MAX_M, MESSAGE_RAYON_DEPASSE };

// ─────────────────────────────────────────────────────────────────────────────
// Types (colonnes réelles — cf. `\d patrimoine_entite`, `\d patrimoine_entite_batiment`).
// ─────────────────────────────────────────────────────────────────────────────

/** Liaison entité ↔ bâtiment (`snake_case` base), champs exposés à la curation. */
export interface LiaisonDB {
  cleabs: string;
  source: string;
  actif: boolean;
  detache: boolean;
  verifie_manuellement: boolean;
}

/** Ligne d'entité agrégée (une entité + ses liaisons) renvoyée par le GET liste. */
export interface LigneEntiteDB {
  id: number;
  famille: string;
  ref_code: string;
  nom: string | null;
  statut: string | null;
  point_geojson: string | null;
  corrige: boolean;
  liaisons: LiaisonDB[] | null;
}

/** État dérivé d'une entité (couleur de la carte, EX-3). */
export type EtatEntite = 'rouge' | 'orange' | 'vert';

/** Ligne d'emprise `bdtopo_batiment` renvoyée par le GET emprises (aide UI). */
export interface LigneEmpriseDB {
  cleabs: string | null;
  geom: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// État dérivé + sérialisation des entités (GET liste).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * État d'une entité à partir de ses liaisons (EX-3), en ne considérant QUE les liaisons **actives
 * non détachées** :
 * - **rouge** = aucune liaison active non détachée (entité à placer) ;
 * - **vert**  = au moins une liaison `source='manuel'` OU `verifie_manuellement=true` ;
 * - **orange** = au moins une liaison auto non vérifiée (aucune manuel/vérifiée).
 */
export function etatEntite(liaisons: LiaisonDB[]): EtatEntite {
  const actives = liaisons.filter((l) => l.actif && !l.detache);
  if (actives.length === 0) return 'rouge';
  if (actives.some((l) => l.source === 'manuel' || l.verifie_manuellement)) return 'vert';
  return 'orange';
}

/** Entité base (`snake_case`) → objet de réponse (`camelCase`), point GeoJSON parsé, état dérivé. */
export function versEntite(r: LigneEntiteDB) {
  const liaisons = r.liaisons ?? [];
  return {
    id: r.id,
    famille: r.famille,
    refCode: r.ref_code,
    nom: r.nom,
    statut: r.statut,
    point: r.point_geojson ? (JSON.parse(r.point_geojson) as unknown) : null,
    corrige: r.corrige,
    etat: etatEntite(liaisons),
    liaisons: liaisons.map((l) => ({
      cleabs: l.cleabs,
      source: l.source,
      actif: l.actif,
      detache: l.detache,
      verifieManuellement: l.verifie_manuellement,
    })),
  };
}

/** Compteurs d'entités par état (panneau latéral, EX-4). */
export function compteursParEtat(etats: EtatEntite[]): { rouge: number; orange: number; vert: number } {
  return {
    rouge: etats.filter((e) => e === 'rouge').length,
    orange: etats.filter((e) => e === 'orange').length,
    vert: etats.filter((e) => e === 'vert').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing défensif des entrées (jamais 500 sur entrée invalide → 422/404 en amont).
// ─────────────────────────────────────────────────────────────────────────────

/** Parse défensif du corps JSON (invalide → `null`, le handler renvoie 422 sans rien écrire). */
export async function lireCorps(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse l'identifiant d'entité (`params.id`) en entier positif, ou `null` si invalide. */
export function lireId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Lit `{lat, lon}` : nombres finis dans les bornes WGS84, sinon `null` (→ 422). */
export function lireLatLon(body: Record<string, unknown>): { lat: number; lon: number } | null {
  const { lat, lon } = body;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Lit `cleabs` : chaîne non vide (trim), sinon `null` (→ 422). */
export function lireCleabs(body: Record<string, unknown>): string | null {
  const c = body.cleabs;
  if (typeof c !== 'string') return null;
  const t = c.trim();
  return t.length > 0 ? t : null;
}

/** Lit une bbox depuis les query params `?minlon&minlat&maxlon&maxlat` (nombres finis), sinon `null`. */
export function lireBbox(
  params: URLSearchParams,
): { minlon: number; minlat: number; maxlon: number; maxlat: number } | null {
  const minlon = Number(params.get('minlon'));
  const minlat = Number(params.get('minlat'));
  const maxlon = Number(params.get('maxlon'));
  const maxlat = Number(params.get('maxlat'));
  if (![minlon, minlat, maxlon, maxlat].every((n) => Number.isFinite(n))) return null;
  if (minlon > maxlon || minlat > maxlat) return null;
  return { minlon, minlat, maxlon, maxlat };
}

/** Emprise base → objet de réponse (`cleabs` + géométrie GeoJSON parsée). */
export function versEmprise(r: LigneEmpriseDB) {
  return { cleabs: r.cleabs, geom: r.geom ? (JSON.parse(r.geom) as unknown) : null };
}
