import 'server-only';
import { query } from '../../../../../lib/db/client';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import {
  SELECT_CARTES,
  MESSAGE_CHEVAUCHEMENT,
  estViolationChevauchement,
  lireCorps,
  lireCarteDepuisBody,
  lireId,
  serialiserCarte,
  validerResultat,
  versCarte,
  type LigneCarteDB,
} from '../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/cartes-annee/[id] — MODIFIER une carte.
 *
 * VALIDATION = source unique `validerCartesAnnee` sur l'ensemble RÉSULTANT (existantes AVEC la
 * carte #id remplacée) : chevauchement / intervalle vide → 422 sans rien persister. Écriture
 * ATOMIQUE (CTE) : UPDATE carte + INSERT journal (`colonne = 'famille_annee:#id'`, avant → après).
 * Carte inconnue → 404. AUCUN import moteur/loader.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'cartes_annee');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant de carte invalide' }] }, { status: 422 });
  }

  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }

  const lecture = lireCarteDepuisBody(body);
  if (!lecture.ok) {
    return Response.json({ erreurs: lecture.erreurs }, { status: 422 });
  }

  // Cartes existantes (pour le journal « avant » + la validation de l'ensemble résultant).
  let existantes: LigneCarteDB[];
  try {
    existantes = (await query<LigneCarteDB>(SELECT_CARTES)).rows;
  } catch {
    return Response.json({ erreurs: [{ message: 'cartes indisponibles' }] }, { status: 503 });
  }

  const cible = existantes.find((r) => r.id === idNum);
  if (!cible) {
    return Response.json({ erreurs: [{ message: 'carte introuvable' }] }, { status: 404 });
  }

  // Ensemble résultant : la carte #id remplacée par les nouvelles valeurs.
  const resultant = existantes.map((r) => (r.id === idNum ? lecture.carte : versCarte(r)));
  const erreurs = validerResultat(resultant);
  if (erreurs) {
    return Response.json({ erreurs }, { status: 422 });
  }

  // Écriture atomique (UN seul query) : UPDATE + INSERT journal via CTE.
  const c = lecture.carte;
  const sql = `
    WITH upd AS (
      UPDATE config_famille_annee
         SET borne_min = $1, op_min = $2, borne_max = $3, op_max = $4,
             cone = $5, flanc = $6, distmax_m = $7
       WHERE id = $8
      RETURNING id, borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m
    ), jrnl AS (
      INSERT INTO config_edit_log (colonne, avant, apres) VALUES ($9, $10, $11)
    )
    SELECT * FROM upd;
  `;
  const params = [
    c.borneMin,
    c.opMin,
    c.borneMax,
    c.opMax,
    c.cone,
    c.flanc,
    c.distMaxM,
    idNum,
    `famille_annee:#${idNum}`,
    serialiserCarte(versCarte(cible)),
    serialiserCarte(c),
  ];

  try {
    const { rows } = await query<LigneCarteDB>(sql, params);
    const maj = rows[0];
    return Response.json({ ok: true, carte: { id: maj.id, ...versCarte(maj) } });
  } catch (e) {
    // Filet de dernier recours (concurrence) : contrainte EXCLUDE DB (migration 007) → 422 non-chevauchement.
    if (estViolationChevauchement(e)) {
      return Response.json({ erreurs: [{ message: MESSAGE_CHEVAUCHEMENT }] }, { status: 422 });
    }
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}

/**
 * DELETE /api/admin/cartes-annee/[id] — SUPPRIMER une carte (action de l'internaute admin).
 *
 * Aucun contrôle de chevauchement nécessaire (retirer une carte ne peut pas en créer un). Écriture
 * ATOMIQUE (CTE) : DELETE + INSERT journal (`colonne = 'famille_annee:#id'`, avant → null). Carte
 * inconnue → 404. ⚠️ Règle dure : l'agent ne déclenche JAMAIS ce DELETE lui-même (tests mockés).
 */
export async function DELETE(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'cartes_annee');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant de carte invalide' }] }, { status: 422 });
  }

  // Carte visée (pour le journal « avant »).
  let cible: LigneCarteDB | undefined;
  try {
    const { rows } = await query<LigneCarteDB>(
      'SELECT id, borne_min, op_min, borne_max, op_max, cone, flanc, distmax_m FROM config_famille_annee WHERE id = $1',
      [idNum],
    );
    cible = rows[0];
  } catch {
    return Response.json({ erreurs: [{ message: 'cartes indisponibles' }] }, { status: 503 });
  }
  if (!cible) {
    return Response.json({ erreurs: [{ message: 'carte introuvable' }] }, { status: 404 });
  }

  const sql = `
    WITH del AS (
      DELETE FROM config_famille_annee WHERE id = $1
      RETURNING id
    ), jrnl AS (
      INSERT INTO config_edit_log (colonne, avant, apres) VALUES ($2, $3, $4)
    )
    SELECT * FROM del;
  `;
  const params = [idNum, `famille_annee:#${idNum}`, serialiserCarte(versCarte(cible)), null];

  try {
    await query(sql, params);
    return Response.json({ ok: true, id: idNum });
  } catch {
    return Response.json({ erreurs: [{ message: 'suppression impossible' }] }, { status: 503 });
  }
}
