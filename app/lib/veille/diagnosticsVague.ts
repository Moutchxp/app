/**
 * PART-C — DIAGNOSTICS DE VAGUE : lance UN SEUL diagnostic de complétude par vague de pièces, jamais un par mail. Orchestrateur
 * testable PAR INJECTION (aucune I/O dans le cœur). Branché APRÈS les relèves (executerVeille §1ter-bis, mode 'auto') et à la fin
 * de la relève MANUELLE (route /relever, mode 'manuel').
 *
 * Une mairie peut envoyer les documents en plusieurs mails. On recense TOUT dossier (partiel OU NON — LOT 56-C) dont la GED a
 * CHANGÉ depuis le dernier diagnostic (nouvelles pièces versées), et — pour chacun — on ne relance le diagnostic que si la VAGUE
 * est close (`vagueCloseeDiagnostic` : relève manuelle → tout de suite ; relève auto → dernier mail de la demande calme depuis
 * `calmeMinutes`, sur la DATE D'ENVOI du mail). Le diagnostic (recalculerCompletude) reclasse TOUTES les pièces d'un coup et peut
 * LEVER le marqueur partiel (CASC-1) — jamais en poser un. AUCUN envoi n'est déclenché ici (le diagnostic ne réclame rien : PART-E).
 *
 * IDEMPOTENCE : une fois le diagnostic passé, la GED n'est plus « changée » → le dossier n'est plus candidat au tic suivant. Tant
 * que la vague n'est pas close (auto), le dossier est simplement REPORTÉ au prochain tic — jamais diagnostiqué à chaque mail.
 * BORNE anti-vague-infinie : la relève ne passe que toutes les quelques heures, donc `now − dernierMail` dépasse `calmeMinutes`
 * dès le tic suivant sauf mail reçu juste avant ; et la relève MANUELLE force le diagnostic (échappatoire d'Arno). Cf. AGENTS.md.
 */
import { query } from '../db/client';
import { vagueCloseeDiagnostic, type ModeReleve } from './vaguePieces';
import { MARQUEUR_FICHE_SYNTHESE } from '../permis/gedConstantes';

/** Un dossier (partiel ou non — LOT 56-C) dont la GED a changé, avec la date d'envoi du dernier mail de sa demande (null = aucun). */
export interface CandidatVague {
  dossierId: number;
  demandeId: number;
  dernierMailLe: Date | null;
}

export interface DepsDiagnosticsVague {
  maintenant(): Date;
  calmeMinutes(): Promise<number>;
  candidats(): Promise<CandidatVague[]>;           // dossiers (partiels ou non, LOT 56-C) à GED changée + dernier mail de la demande
  recalculer(dossierId: number): Promise<void>;    // recalculerCompletude(dossierId, 'completude:vague') — reclasse + lève le partiel si complet
}

export interface BilanVague { examines: number; diagnostiques: number; differes: number; erreurs: number }

/**
 * Pour chaque dossier à GED changée (partiel ou non, LOT 56-C) : si la vague est close (selon le mode), lance UN diagnostic ; sinon le REPORTE.
 * Un échec sur un dossier n'interrompt pas les suivants (isolation). Ne lance JAMAIS d'envoi.
 */
export async function executerDiagnosticsVague(mode: ModeReleve, deps: DepsDiagnosticsVague): Promise<BilanVague> {
  const candidats = await deps.candidats();
  if (candidats.length === 0) return { examines: 0, diagnostiques: 0, differes: 0, erreurs: 0 };
  const maintenant = deps.maintenant();
  const calmeMinutes = await deps.calmeMinutes();

  let examines = 0, diagnostiques = 0, differes = 0, erreurs = 0;
  for (const c of candidats) {
    examines += 1;
    if (!vagueCloseeDiagnostic({ mode, dernierMailLe: c.dernierMailLe, maintenant, calmeMinutes })) { differes += 1; continue; }
    try { await deps.recalculer(c.dossierId); diagnostiques += 1; }
    catch { erreurs += 1; } // isolation : un dossier en échec n'arrête pas les suivants
  }
  return { examines, diagnostiques, differes, erreurs };
}

// ── Implémentation RÉELLE (production) ─────────────────────────────────────────
/**
 * LOT 56-C — Candidats réels : TOUT dossier ACTIF dont la GED a CHANGÉ depuis le dernier diagnostic, qu'il soit partiel OU NON. La
 * condition métier est « la GED a changé » (spec du 03/09 : un mail de mairie qui apporte des documents déclenche un diagnostic),
 * PAS « le dossier est partiel » — la mesure du 56-C a montré 5 dossiers non-partiels avec des documents GED jamais diagnostiqués.
 * « GED changée » = nombre de documents GED (hors fiche de synthèse) DIFFÉRENT du nombre mémorisé au dernier diagnostic (MÊME
 * critère de péremption que `lireCompletude`). `dernierMailLe` = date d'ENVOI du dernier mail non-rebond de la demande.
 *
 * ⚠️ Élargir le DIAGNOSTIC n'élargit PAS les RELANCES : `recalculer` = `recalculerCompletude`, qui ne fait qu'écrire la complétude
 * et, via `evaluerLeveeAutoPartiel`, ne peut que LEVER un partiel existant (return immédiat si la demande n'est pas suspendue) —
 * JAMAIS en créer. Les trois systèmes de relance gardent donc exactement les mêmes candidats (prouvé par `diagnosticVagueScope.itest.ts`).
 *
 * Le WHERE ne retient que les dossiers ayant une ACTIVITÉ pertinente (≥ 1 document GED réel OU un diagnostic déjà mémorisé) — les
 * autres n'ont rien à (re)diagnostiquer ; le filtre « changée » (ci-dessous, en JS) tranche ensuite. RÉSILIENT : colonnes/tables
 * absentes (174) → aucun candidat (jamais d'exception propagée).
 */
export async function candidatsVagueReels(): Promise<CandidatVague[]> {
  try {
    const { rows } = await query<{ dossier_id: number; demande_id: number; dernier_mail_le: Date | null; nb_ged: number; nb_memorise: number | null }>(
      `SELECT dd.dossier_id::int AS dossier_id, d.id::int AS demande_id,
              (SELECT max(r.recu_le) FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond') AS dernier_mail_le,
              (SELECT count(*)::int FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id AND doc.note IS DISTINCT FROM $1) AS nb_ged,
              pc.nb_pieces AS nb_memorise
         FROM demande d
         JOIN demande_dossier dd ON dd.demande_id = d.id AND dd.actif
         LEFT JOIN permis_completude pc ON pc.dossier_id = dd.dossier_id
        WHERE EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id AND doc.note IS DISTINCT FROM $1)
           OR pc.dossier_id IS NOT NULL`,
      [MARQUEUR_FICHE_SYNTHESE]);
    // GED « changée » = jamais mémorisée mais ≥ 1 document, OU nombre mémorisé ≠ nombre actuel (péremption, comme lireCompletude).
    return rows
      .filter((r) => (r.nb_memorise === null ? r.nb_ged > 0 : r.nb_ged !== r.nb_memorise))
      .map((r) => ({ dossierId: r.dossier_id, demandeId: r.demande_id, dernierMailLe: r.dernier_mail_le }));
  } catch { return []; } // 174 absente → aucun candidat (résilient)
}

export function depsReellesDiagnosticsVague(): DepsDiagnosticsVague {
  return {
    maintenant: () => new Date(),
    calmeMinutes: async () => (await import('../sitadel/veilleConfig')).chargerConfigVeille().then((c) => c.vagueCalmeMinutes),
    candidats: () => candidatsVagueReels(),
    recalculer: async (dossierId) => {
      // Import DYNAMIQUE : garde le graphe d'executerVeille léger (completudeRepo tire lectureGed). Parse LOCAL, AUCUNE vision/IA.
      const { recalculerCompletude } = await import('../permis/completudeRepo');
      await recalculerCompletude(dossierId, 'completude:vague');
    },
  };
}
