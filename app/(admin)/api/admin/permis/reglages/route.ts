import 'server-only';
import { query, withTransaction } from '../../../../../lib/db/client';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { problemesIdentite, profilValide, type ConfigDemandeur, type ProfilDemandeur } from '../../../../../lib/sitadel/demande';
import { parserBornesCheck, validerReglages, type BornesParColonne } from '../../../../../lib/sitadel/reglagesVeille';

/**
 * /api/admin/permis/reglages (chantier S7d / S7e) — RÉGLAGES de la veille permis. Édite les DEUX identités de demandeur
 * (config_demandeur, profils 'entreprise' et 'personne') et les paramètres du moteur (config_veille, dont le profil par
 * défaut). Motif Pilotage Moteur : validation server-side, réponse `{ erreurs:[{colonne,message}] }`, refus n'écrit RIEN,
 * écriture en transaction, bornes tirées EN DIRECT des CHECK. RÉSERVÉ ADMINISTRATEUR. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

async function lireBornes(): Promise<BornesParColonne> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'config_veille'::regclass AND contype = 'c'`,
  );
  return parserBornesCheck(rows.map((r) => r.def));
}

/** Identité d'un profil ; ligne absente → champs vides. */
async function lireDemandeur(profil: ProfilDemandeur): Promise<ConfigDemandeur> {
  const { rows } = await query<{ raison_sociale: string; forme_juridique: string; siege_adresse: string; representant_nom: string; representant_qualite: string; email_contact: string; telephone: string }>(
    `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone FROM config_demandeur WHERE profil = $1`,
    [profil],
  );
  const x = rows[0] ?? { raison_sociale: '', forme_juridique: '', siege_adresse: '', representant_nom: '', representant_qualite: '', email_contact: '', telephone: '' };
  return {
    raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
    representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
  };
}

/** Payload complet (les deux profils, défaut, paramètres, bornes, problèmes par profil). */
async function etatComplet() {
  const [entreprise, personne, veille, bornes] = await Promise.all([lireDemandeur('entreprise'), lireDemandeur('personne'), chargerConfigVeille(), lireBornes()]);
  return {
    demandeur: { entreprise, personne },
    profilDefaut: profilValide(veille.profilDemandeurDefaut),
    veille,
    bornes,
    problemesIdentite: {
      entreprise: problemesIdentite(entreprise, 'entreprise'),
      personne: problemesIdentite(personne, 'personne'),
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await etatComplet());
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
  const patch = body as { profil?: unknown; demandeur?: Record<string, unknown>; veille?: Record<string, unknown> };
  const profil = profilValide(patch.profil); // le profil édité (défaut 'entreprise')

  let bornes: BornesParColonne;
  try {
    bornes = await lireBornes();
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'configuration indisponible' }] }, { status: 503 });
  }

  const validation = validerReglages({ demandeur: patch.demandeur, veille: patch.veille }, bornes, profil);
  if (!validation.ok) return Response.json({ erreurs: validation.erreurs }, { status: 422 });

  // Écriture ATOMIQUE. Colonnes issues de l'allowlist (validerReglages) ; l'identité écrite est celle du PROFIL édité.
  try {
    await withTransaction(async (q) => {
      const dem = Object.entries(validation.demandeur);
      if (dem.length > 0) {
        const set = dem.map(([col], i) => `"${col}" = $${i + 1}`).join(', ');
        await q(`UPDATE config_demandeur SET ${set} WHERE profil = $${dem.length + 1}`, [...dem.map(([, v]) => v), profil]);
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

  return Response.json({ ok: true, ...(await etatComplet()) });
}
