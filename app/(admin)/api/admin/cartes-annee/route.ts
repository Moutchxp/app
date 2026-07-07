import 'server-only';
import { query } from '../../../../lib/db/client';
import {
  SELECT_CARTES,
  lireCorps,
  lireCarteDepuisBody,
  serialiserCarte,
  validerResultat,
  versCarte,
  type LigneCarteDB,
} from './partage';

/**
 * GET /api/admin/cartes-annee — LECTURE SEULE des cartes d'année (`config_famille_annee`).
 *
 * Liste ordonnée par id : chaque carte = fourchette (bornes + opérateurs) + coefficients
 * `cone`/`flanc`/`distMaxM`. Route gardée par `proxy.ts` (sans session → 401). Runtime Node.
 */
export async function GET() {
  try {
    const { rows } = await query<LigneCarteDB>(SELECT_CARTES);
    const cartes = rows.map((r) => ({ id: r.id, ...versCarte(r) }));
    return Response.json({ cartes });
  } catch {
    return Response.json({ erreur: 'cartes indisponibles' }, { status: 503 });
  }
}

/**
 * POST /api/admin/cartes-annee — CRÉER une carte.
 *
 * VALIDATION = source unique `validerCartesAnnee` appliquée à l'ensemble RÉSULTANT (cartes
 * existantes + la nouvelle) : chevauchement / intervalle vide / borne manquante → 422 sans rien
 * persister. Écriture ATOMIQUE en UN seul `query()` (CTE) : INSERT carte + INSERT journal
 * (`colonne = 'famille_annee:#new'`). AUCUN `DELETE/UPDATE` autonome (Règle dure — l'agent ne
 * supprime jamais). AUCUN import moteur/loader.
 */
export async function POST(request: Request) {
  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }

  // 1. Forme de la carte (types, opérateurs, plages de coefficients).
  const lecture = lireCarteDepuisBody(body);
  if (!lecture.ok) {
    return Response.json({ erreurs: lecture.erreurs }, { status: 422 });
  }

  // 2. Cartes existantes (pour valider l'ensemble résultant + non-chevauchement).
  let existantes: LigneCarteDB[];
  try {
    existantes = (await query<LigneCarteDB>(SELECT_CARTES)).rows;
  } catch {
    return Response.json({ erreurs: [{ message: 'cartes indisponibles' }] }, { status: 503 });
  }

  // 3. Validation de l'ensemble résultant — si KO, rien n'est écrit (422).
  const resultant = [...existantes.map(versCarte), lecture.carte];
  const erreurs = validerResultat(resultant);
  if (erreurs) {
    return Response.json({ erreurs }, { status: 422 });
  }

  // 4. Écriture atomique (UN seul query) : INSERT carte + INSERT journal via CTE.
  const c = lecture.carte;
  const sql = `
    WITH ins AS (
      INSERT INTO config_famille_annee (borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m
    ), jrnl AS (
      INSERT INTO config_edit_log (colonne, avant, apres) VALUES ($8, $9, $10)
    )
    SELECT * FROM ins;
  `;
  const params = [
    c.borneMin,
    c.opMin,
    c.borneMax,
    c.opMax,
    c.cone,
    c.flanc,
    c.distMaxM,
    'famille_annee:#new',
    null,
    serialiserCarte(c),
  ];

  try {
    const { rows } = await query<LigneCarteDB>(sql, params);
    const creee = rows[0];
    return Response.json({ ok: true, carte: { id: creee.id, ...versCarte(creee) } });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}
