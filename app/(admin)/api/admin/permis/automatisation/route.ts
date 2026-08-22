import 'server-only';
import { query, withTransaction } from '../../../../../lib/db/client';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { parserBornesCheck, validerAutomatisation, type BornesParColonne, type PatchAutomatisation } from '../../../../../lib/sitadel/reglagesVeille';
import { historiqueRuns, dernierSuccesLe, dernierPassageLe, dateArriveeMillesime } from '../../../../../lib/sitadel/executerVeille';
import { prochainPassage, ordonnanceurSuspect, millesimeFige, echecsConsecutifs, type ConfigAuto } from '../../../../../lib/sitadel/planification';

/**
 * /api/admin/permis/automatisation (chantier S11b) — pilotage de la veille AUTOMATIQUE. GET = état complet (réglages +
 * bornes des CHECK + millésime en base + dernier run + prochain passage + demande en attente + 20 derniers runs +
 * détection d'ordonnanceur absent). PATCH = met à jour auto_active/intervalle/rétention et/ou pose le drapeau « lancer
 * maintenant » (le serveur ne lance JAMAIS l'ingestion lui-même). Motif Pilotage : validation server-side, écriture en
 * transaction, refus ⇒ rien écrit, allowlist de colonnes. RÉSERVÉ ADMINISTRATEUR. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

async function lireBornes(): Promise<BornesParColonne> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'config_veille'::regclass AND contype = 'c'`,
  );
  return parserBornesCheck(rows.map((r) => r.def));
}

interface LigneConfig {
  auto_active: boolean; auto_intervalle_heures: number; csv_retention_jours: number; run_demande_le: Date | null;
  alerte_millesime_fige_jours: number; alerte_echecs_consecutifs: number;
}

async function lireConfig(): Promise<LigneConfig> {
  const { rows } = await query<LigneConfig>(
    `SELECT auto_active, auto_intervalle_heures, csv_retention_jours, run_demande_le,
            alerte_millesime_fige_jours, alerte_echecs_consecutifs FROM config_veille WHERE id = 1`,
  );
  return rows[0] ?? {
    auto_active: false, auto_intervalle_heures: 24, csv_retention_jours: 0, run_demande_le: null,
    alerte_millesime_fige_jours: 35, alerte_echecs_consecutifs: 3,
  };
}

/** PASTILLES — heure de recomptage, lue À PART et BEST-EFFORT : tant que la 139 n'est pas appliquée, la colonne n'existe pas →
 *  défaut 8, SANS casser l'écran Automatisation (résilience à l'ordre d'application, comme les lecteurs isolés de veilleConfig). */
async function lireRecomptageHeure(): Promise<number> {
  try {
    const { rows } = await query<{ recomptage_heure_locale: number }>(`SELECT recomptage_heure_locale FROM config_veille WHERE id = 1`);
    return rows[0]?.recomptage_heure_locale ?? 8;
  } catch { return 8; }
}

/** État complet renvoyé par GET (et par PATCH après écriture). */
async function etatComplet() {
  const [cfg, bornes, mille, historique, dernierSucces, dernierPassage, recompteHeure] = await Promise.all([
    lireConfig(), lireBornes(),
    query<{ code: string }>(`SELECT code FROM sitadel_millesime ORDER BY code DESC LIMIT 1`),
    historiqueRuns(20), dernierSuccesLe(), dernierPassageLe(), lireRecomptageHeure(),
  ]);
  const maintenant = new Date();
  const millesimeBase = mille.rows[0]?.code ?? null;
  const configAuto: ConfigAuto = { autoActive: cfg.auto_active, autoIntervalleHeures: cfg.auto_intervalle_heures, runDemandeLe: cfg.run_demande_le };
  const prochain = prochainPassage(dernierSucces, configAuto, maintenant);
  const suspect = ordonnanceurSuspect(dernierPassage, configAuto, maintenant);
  // Date d'arrivée du millésime courant : fallback FIABLE sur veille_run (telecharge_a n'est pas exploitable).
  const dateAvancee = millesimeBase ? await dateArriveeMillesime(millesimeBase) : null;
  const millesimeFigeAlarme = millesimeFige(dateAvancee, millesimeBase, maintenant, cfg.alerte_millesime_fige_jours);
  const echecsAlarme = echecsConsecutifs(historique, cfg.alerte_echecs_consecutifs);
  return {
    autoActive: cfg.auto_active,
    autoIntervalleHeures: cfg.auto_intervalle_heures,
    csvRetentionJours: cfg.csv_retention_jours,
    alerteMillesimeFigeJours: cfg.alerte_millesime_fige_jours,
    alerteEchecsConsecutifs: cfg.alerte_echecs_consecutifs,
    recomptageHeureLocale: recompteHeure,
    bornes,
    millesimeBase,
    dernierRun: historique[0] ?? null,
    demandeEnAttente: cfg.run_demande_le !== null,
    prochainPassage: { dateIso: prochain.date ? prochain.date.toISOString() : null, phrase: prochain.phrase },
    ordonnanceurSuspect: suspect,
    alarmes: { echecs: echecsAlarme, millesimeFige: millesimeFigeAlarme },
    historique,
    maintenant: maintenant.toISOString(),
  };
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await etatComplet());
  } catch {
    return Response.json({ erreur: 'automatisation indisponible' }, { status: 503 });
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

  let bornes: BornesParColonne;
  try {
    bornes = await lireBornes();
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'configuration indisponible' }] }, { status: 503 });
  }

  const validation = validerAutomatisation(body as PatchAutomatisation, bornes);
  if (!validation.ok) return Response.json({ erreurs: validation.erreurs }, { status: 422 });

  // Écriture ATOMIQUE. Noms de colonnes issus de l'allowlist (validerAutomatisation), jamais des clés brutes du body.
  // « lancer maintenant » ne pose le drapeau que s'il n'y en a PAS déjà un (pas de seconde demande).
  let demandeDejaEnAttente = false;
  try {
    await withTransaction(async (q) => {
      const cols = Object.entries(validation.colonnes);
      if (cols.length > 0) {
        const set = cols.map(([col], i) => `"${col}" = $${i + 1}`).join(', ');
        await q(`UPDATE config_veille SET ${set} WHERE id = 1`, cols.map(([, v]) => v));
      }
      if (validation.lancer) {
        const r = await q<{ run_demande_le: Date }>(
          `UPDATE config_veille SET run_demande_le = now() WHERE id = 1 AND run_demande_le IS NULL RETURNING run_demande_le`,
        );
        demandeDejaEnAttente = r.rows.length === 0; // 0 ligne modifiée → une demande était déjà en attente
      }
    });
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'écriture impossible' }] }, { status: 503 });
  }

  return Response.json({ ok: true, lancer: validation.lancer, demandeDejaEnAttente, ...(await etatComplet()) });
}
