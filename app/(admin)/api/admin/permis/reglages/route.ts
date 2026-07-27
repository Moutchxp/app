import 'server-only';
import { query, withTransaction } from '../../../../../lib/db/client';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { problemesIdentite, type ConfigDemandeur } from '../../../../../lib/sitadel/demande';
import { parserBornesCheck, validerReglages, type BornesParColonne } from '../../../../../lib/sitadel/reglagesVeille';

/**
 * /api/admin/permis/reglages (chantier S7d) — ÉCRAN DE RÉGLAGES de la veille permis. Applique le motif de
 * `/api/admin/config` (Pilotage Moteur) : GET lecture, PATCH écriture validée server-side, réponse d'erreur
 * `{ erreurs: [{ colonne, message }] }`, un refus n'écrit RIEN. RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde),
 * comme les routes sœurs `/api/admin/permis/*`. Les bornes appliquées viennent des CHECK de `config_veille` (source
 * unique, jamais recopiée). Ne touche NI au verdict, NI au score, NI aux demandes elles-mêmes. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

/** Bornes numériques tirées EN DIRECT des contraintes CHECK de `config_veille` (aucune liste en dur). */
async function lireBornes(): Promise<BornesParColonne> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'config_veille'::regclass AND contype = 'c'`,
  );
  return parserBornesCheck(rows.map((r) => r.def));
}

/** Lit l'identité (singleton id=1) ; ligne absente → champs vides (jamais d'exception). */
async function lireDemandeur(): Promise<ConfigDemandeur> {
  const { rows } = await query<{
    raison_sociale: string; forme_juridique: string; siege_adresse: string;
    representant_nom: string; representant_qualite: string; email_contact: string; telephone: string;
  }>(
    `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone
     FROM config_demandeur WHERE id = 1`,
  );
  const x = rows[0] ?? {
    raison_sociale: '', forme_juridique: '', siege_adresse: '',
    representant_nom: '', representant_qualite: '', email_contact: '', telephone: '',
  };
  return {
    raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
    representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
  };
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const [demandeur, veille, bornes] = await Promise.all([lireDemandeur(), chargerConfigVeille(), lireBornes()]);
    return Response.json({ demandeur, veille, bornes, problemesIdentite: problemesIdentite(demandeur) });
  } catch {
    return Response.json({ erreur: 'réglages indisponibles' }, { status: 503 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'corps JSON invalide' }] }, { status: 422 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ erreurs: [{ colonne: '', message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const patch = body as { demandeur?: Record<string, unknown>; veille?: Record<string, unknown> };

  let bornes: BornesParColonne;
  try {
    bornes = await lireBornes();
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'configuration indisponible' }] }, { status: 503 });
  }

  // Validation server-side IDENTIQUE à l'écran. KO → 422, rien n'est écrit.
  const validation = validerReglages(patch, bornes);
  if (!validation.ok) {
    return Response.json({ erreurs: validation.erreurs }, { status: 422 });
  }

  // Écriture ATOMIQUE (une transaction). Les NOMS de colonnes proviennent de l'allowlist (validerReglages), jamais des
  // clés brutes du body ; les valeurs passent en paramètres liés.
  try {
    await withTransaction(async (q) => {
      const dem = Object.entries(validation.demandeur);
      if (dem.length > 0) {
        const set = dem.map(([col], i) => `"${col}" = $${i + 1}`).join(', ');
        await q(`UPDATE config_demandeur SET ${set} WHERE id = 1`, dem.map(([, v]) => v));
      }
      const vei = Object.entries(validation.veille);
      if (vei.length > 0) {
        const set = vei.map(([col], i) => `"${col}" = $${i + 1}`).join(', ');
        await q(`UPDATE config_veille SET ${set} WHERE id = 1`, vei.map(([, v]) => v));
      }
    });
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'écriture impossible' }] }, { status: 503 });
  }

  const [demandeur, veille] = await Promise.all([lireDemandeur(), chargerConfigVeille()]);
  return Response.json({ ok: true, demandeur, veille, problemesIdentite: problemesIdentite(demandeur) });
}
