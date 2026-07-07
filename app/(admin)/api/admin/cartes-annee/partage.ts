import 'server-only';
import { validerCartesAnnee, type CarteAnnee } from '../../../../lib/svv/cartesAnnee';

/**
 * Helpers PARTAGÉS des routes CRUD `config_famille_annee` (GET/POST + PATCH/DELETE).
 *
 * ISOLATION (invariant SVAV) : n'importe QUE le module pur `cartesAnnee.ts` (validation =
 * SOURCE UNIQUE partagée avec le moteur `familleCoeff`). AUCUN accès `app/lib/svv/coucheDegagement`
 * /`profilDegagement`, AUCUN `profilConfig` : le câblage CRUD ne touche ni le moteur ni le loader.
 * Le pool `pg` (`client.ts`) n'est importé QUE par les fichiers `route.ts` (écriture atomique locale).
 */

/** Colonnes exactes de `config_famille_annee` (SELECT commun à toutes les routes). */
export const SELECT_CARTES =
  'SELECT id, borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m FROM config_famille_annee ORDER BY id';

/** Ligne brute renvoyée par la base (`snake_case`). */
export interface LigneCarteDB {
  id: number;
  borne_min: number | null;
  op_min: string | null;
  borne_max: number | null;
  op_max: string | null;
  cone: number;
  flanc: number;
  distmax_m: number;
}

/** Erreur de validation (index de la carte concernée si applicable) — même forme que `validerCartesAnnee`. */
export type ErreurCarte = { index?: number; message: string };

/** Bornes garde-fou de DEV pour les coefficients (protègent le moteur, ne nourrissent aucun calcul). */
const COEFF_MIN = 0;
const COEFF_MAX = 10;
const DISTMAX_MAX_M = 2000;

/** Ligne base (`snake_case`) → carte moteur (`camelCase`), opérateurs normalisés en liste fermée. */
export function versCarte(r: LigneCarteDB): CarteAnnee {
  return {
    borneMin: r.borne_min,
    opMin: r.op_min === '>=' || r.op_min === '>' ? r.op_min : null,
    borneMax: r.borne_max,
    opMax: r.op_max === '<=' || r.op_max === '<' ? r.op_max : null,
    cone: r.cone,
    flanc: r.flanc,
    distMaxM: r.distmax_m,
  };
}

/** Carte sérialisée pour le journal `config_edit_log` (avant/apres). Valeurs brutes, aucun arrondi. */
export function serialiserCarte(c: CarteAnnee): string {
  return JSON.stringify(c);
}

/** `true` si un opérateur de borne basse est dans la liste fermée. */
function estOpMin(v: unknown): v is '>=' | '>' {
  return v === '>=' || v === '>';
}

/** `true` si un opérateur de borne haute est dans la liste fermée. */
function estOpMax(v: unknown): v is '<=' | '<' {
  return v === '<=' || v === '<';
}

/**
 * Lit et TYPE une carte depuis un corps JSON quelconque (POST/PATCH). Ne valide QUE la forme
 * (types, listes fermées d'opérateurs, plages de coefficients — garde-fou de dev). Le
 * non-chevauchement / l'intervalle vide / la cohérence borne↔opérateur sont vérifiés par
 * `validerCartesAnnee` sur l'ensemble RÉSULTANT (source unique).
 */
export function lireCarteDepuisBody(
  body: Record<string, unknown>,
): { ok: true; carte: CarteAnnee } | { ok: false; erreurs: ErreurCarte[] } {
  const erreurs: ErreurCarte[] = [];

  // Bornes : entier ou null/absent (= borne ouverte).
  let borneMin: number | null = null;
  const bMin = body.borneMin;
  if (bMin !== null && bMin !== undefined && bMin !== '') {
    if (typeof bMin === 'number' && Number.isInteger(bMin)) borneMin = bMin;
    else erreurs.push({ message: 'Borne basse : année entière (ou vide) attendue.' });
  }
  let borneMax: number | null = null;
  const bMax = body.borneMax;
  if (bMax !== null && bMax !== undefined && bMax !== '') {
    if (typeof bMax === 'number' && Number.isInteger(bMax)) borneMax = bMax;
    else erreurs.push({ message: 'Borne haute : année entière (ou vide) attendue.' });
  }

  // Opérateurs : liste fermée, ou null/absent/vide (= pas d'opérateur).
  let opMin: '>=' | '>' | null = null;
  const oMin = body.opMin;
  if (oMin !== null && oMin !== undefined && oMin !== '') {
    if (estOpMin(oMin)) opMin = oMin;
    else erreurs.push({ message: 'Opérateur de borne basse invalide (≥ ou >).' });
  }
  let opMax: '<=' | '<' | null = null;
  const oMax = body.opMax;
  if (oMax !== null && oMax !== undefined && oMax !== '') {
    if (estOpMax(oMax)) opMax = oMax;
    else erreurs.push({ message: 'Opérateur de borne haute invalide (≤ ou <).' });
  }

  // Coefficients : finis + dans les plages garde-fou.
  const cone = body.cone;
  const flanc = body.flanc;
  const distMaxM = body.distMaxM;
  const coneOk = typeof cone === 'number' && Number.isFinite(cone) && cone >= COEFF_MIN && cone <= COEFF_MAX;
  const flancOk =
    typeof flanc === 'number' && Number.isFinite(flanc) && flanc >= COEFF_MIN && flanc <= COEFF_MAX;
  const distOk =
    typeof distMaxM === 'number' && Number.isFinite(distMaxM) && distMaxM > 0 && distMaxM <= DISTMAX_MAX_M;
  if (!coneOk) erreurs.push({ message: `Coefficient cône attendu entre ${COEFF_MIN} et ${COEFF_MAX}.` });
  if (!flancOk) erreurs.push({ message: `Coefficient flanc attendu entre ${COEFF_MIN} et ${COEFF_MAX}.` });
  if (!distOk) erreurs.push({ message: `Distance max attendue entre 0 (exclu) et ${DISTMAX_MAX_M} m.` });

  if (erreurs.length > 0) return { ok: false, erreurs };
  return {
    ok: true,
    carte: {
      borneMin,
      opMin,
      borneMax,
      opMax,
      cone: cone as number,
      flanc: flanc as number,
      distMaxM: distMaxM as number,
    },
  };
}

/**
 * Valide l'ensemble RÉSULTANT (source unique `validerCartesAnnee`) : cohérence borne↔opérateur,
 * intervalle réel non vide, NON-CHEVAUCHEMENT strict. Retourne `null` si OK, sinon les erreurs.
 */
export function validerResultat(resultant: CarteAnnee[]): ErreurCarte[] | null {
  const v = validerCartesAnnee(resultant);
  return v.ok ? null : v.erreurs;
}

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

/** Parse l'identifiant de route (`params.id`) en entier positif, ou `null` si invalide. */
export function lireId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Message de rejet du non-chevauchement — cohérent avec `validerCartesAnnee` (« Chevauchement entre
 * les cartes … »). Sert au mapping de la contrainte DB `EXCLUDE` (migration 007) sur le chemin
 * concurrent, où les index des cartes en conflit ne sont pas connus.
 */
export const MESSAGE_CHEVAUCHEMENT =
  'Chevauchement entre cartes : une année ne peut appartenir qu’à une seule carte.';

/**
 * `true` si l'erreur `pg` est une violation de contrainte d'exclusion (SQLSTATE **23P01**), posée
 * par la migration 007 (`config_famille_annee_no_overlap`). Filet de dernier recours contre les
 * écritures CONCURRENTES qui passeraient la validation applicative ; à mapper en **422**.
 */
export function estViolationChevauchement(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === '23P01'
  );
}
