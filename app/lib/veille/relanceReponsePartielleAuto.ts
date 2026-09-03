/**
 * PART-E — BOUCLE de relance « la mairie a répondu partiellement ». Après le diagnostic d'une vague (PART-C), si le dossier reste
 * INCOMPLET, on relance la mairie sur les pièces qui manquent ENCORE. Deux modes, un seul interrupteur (`relance_auto_active`) :
 *  - AUTO (interrupteur ON) → la relance adaptée part seule ;
 *  - MANUEL (interrupteur OFF) → une PASTILLE dans « Analyse » (compteur projection) invite Arno à l'envoyer à la main
 *    (BlocDemandePieces, PART-3a) — cette boucle-ci n'envoie alors rien.
 *
 * 🔑 RÈGLE MÉTIER (Arno, 30/08) — un ÉCHANGE DE SUIVI sur un dossier DÉJÀ OUVERT (relance/réponse à une mairie) est une conversation
 * en cours, PAS une nouvelle sollicitation : il n'entre donc PAS dans le plafond quotidien des demandes (envois_max_par_jour) et
 * n'écrit pas `demande_acheminement`. Si dix mairies répondent le même jour, il faut pouvoir répondre aux dix. Il reste soumis à
 * TOUT le reste : délai de calme (`vagueCloseeEnvoi`), `relance_auto_active`, fenêtre jour/heure ouvrés, idempotence, régime CASC-4.
 *
 * 🔴 NOMBRE DE RELANCES NON LIMITÉ : chaque NOUVELLE réponse partielle de la mairie peut en déclencher une. Idempotence par journal :
 * on ne relance QUE si le dernier message entrant est PLUS RÉCENT que le dernier courrier sortant de suivi (tous préfixes confondus)
 * → une relance par réponse, jamais deux au tic suivant. COHABITATION CASC-3 : préfixe de journal DISTINCT → n'incrémente jamais le
 * compteur de la cascade d'absence de réponse (plafond 2), et n'en repousse pas le butoir CADA. Un cap PAR RUN borne un emballement.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { texteRelancePartielle } from './cascadePartielle';
import { famillesManquantesDemande, MOTIF_RELANCE_PARTIELLE_PREFIXE, MOTIF_ANNONCE_CADA_PREFIXE } from './cascadePartielleRepo';
import { MOTIF_COMPLEMENT_PREFIXE, MOTIF_DECLARATION_PREFIXE } from '../permis/demanderPiecesRepo';
import { vagueCloseeEnvoi } from './vaguePieces';
import { fenetreEnvoiOuverte } from './envoiOuvre';
import type { FamillePlan } from '../permis/planMasse';
import type { BudgetEnvoiRun } from './plafondEnvoiRun';
import { tracerReportPlafond } from './plafondEnvoiTrace';

/** Préfixe de journal DISTINCT (cohabitation CASC-3 : jamais confondu avec « relance partielle envoyée » ni « complément demandé »). */
export const MOTIF_RELANCE_REPONSE_PREFIXE = 'relance sur réponse partielle envoyée';

/** Les préfixes de tout courrier SORTANT de suivi (pour l'idempotence : « une réponse plus récente que le dernier sortant »). */
const PREFIXES_SORTANTS = [MOTIF_COMPLEMENT_PREFIXE, MOTIF_RELANCE_PARTIELLE_PREFIXE, MOTIF_ANNONCE_CADA_PREFIXE, MOTIF_DECLARATION_PREFIXE, MOTIF_RELANCE_REPONSE_PREFIXE];

/** Une relance sur réponse est-elle DUE ? PUR (idempotence) : la mairie a répondu (dernierMailLe) PLUS RÉCEMMENT que le dernier
 *  courrier sortant de suivi, ET il reste des pièces manquantes. Sans réponse, ou tout obtenu, ou déjà relancé depuis → non due. */
export function relanceReponseDue(e: { dernierMailLe: Date | null; dernierSortantLe: Date | null; famillesManquantes: readonly FamillePlan[] }): boolean {
  if (e.dernierMailLe === null || e.famillesManquantes.length === 0) return false;
  return e.dernierSortantLe === null || e.dernierMailLe.getTime() > e.dernierSortantLe.getTime();
}

/** Une demande partielle avec une relance sur réponse DUE (déjà filtrée). `rang` = n° de CETTE relance PART-E (précédentes + 1). */
export interface CandidatRelanceReponse {
  demandeId: number;
  dernierMailLe: Date | null;        // dernier message mairie → délai de calme (vagueCloseeEnvoi)
  famillesManquantes: FamillePlan[];  // diagnostic À JOUR (jamais la liste d'origine)
  rang: number;
}

export interface DepsRelanceReponsePartielle {
  maintenant(): Date;
  lireConfig(): Promise<{ relanceActive: boolean; calmeMinutes: number; envoiHeureDebut: number; envoiHeureFin: number; capParRun: number }>;
  candidats(): Promise<CandidatRelanceReponse[]>;
  envoyer(demandeId: number, rang: number, objet: string, corps: string): Promise<void>; // envoie (fil) + journalise le préfixe PART-E
  // PLAFOND ANTI-CUMUL — budget PARTAGÉ du run (tous émetteurs auto). PART-E passe APRÈS la cascade partielle : si la cascade a déjà
  //   relancé la demande ce run, PART-E est REPORTÉ (sa propre idempotence le supersède déjà en pratique ; ceci est le filet explicite).
  //   Absent (tests / appel isolé) → aucune limite.
  budget?: BudgetEnvoiRun;
  journaliserReport?(demandeId: number): Promise<void>; // trace d'un report par plafond (jamais silencieux)
}

export interface BilanRelanceReponse { candidats: number; envoyes: number; differes: number; erreurs: number; reporte: boolean; raison: string }

/**
 * Une passe de la boucle. AUTO seulement (interrupteur OFF → rien, la pastille prend le relais). Envoie la relance adaptée
 * (`texteRelancePartielle`, diagnostic à jour) pour chaque demande DUE dont la vague est calme, dans la fenêtre ouvrée, sous le cap
 * par run. Un échec est ISOLÉ (compté, on continue). AUCUN écrit dans le plafond quotidien (échange de suivi, cf. en-tête).
 */
export async function executerRelanceReponsePartielle(deps: DepsRelanceReponsePartielle): Promise<BilanRelanceReponse> {
  const cfg = await deps.lireConfig();
  if (!cfg.relanceActive) return { candidats: 0, envoyes: 0, differes: 0, erreurs: 0, reporte: false, raison: 'envoi auto désactivé — mode manuel (pastille dans Analyse)' };

  const maintenant = deps.maintenant();
  const fen = fenetreEnvoiOuverte(maintenant, cfg.envoiHeureDebut, cfg.envoiHeureFin);
  if (!fen.ouverte) return { candidats: 0, envoyes: 0, differes: 0, erreurs: 0, reporte: true, raison: fen.coherente ? 'hors fenêtre d’envoi (jour/heure ouvrés) — reporté' : 'fenêtre d’envoi mal réglée — reporté' };

  const candidats = await deps.candidats();
  let envoyes = 0, differes = 0, erreurs = 0;
  for (const c of candidats) {
    if (envoyes >= cfg.capParRun) { differes += 1; continue; } // cap PAR RUN (anti-emballement), JAMAIS un plafond quotidien
    // PLAFOND ANTI-CUMUL — la demande a déjà reçu son envoi auto ce run (typiquement la relance de cascade, prioritaire) → on REPORTE
    //   au prochain run (comptée en 'différée', tracée). Refus AVANT l'envoi → aucun effet sur le fil ni sur le butoir CADA.
    if (deps.budget && !deps.budget.peutEnvoyer(c.demandeId)) { differes += 1; await deps.journaliserReport?.(c.demandeId); continue; }
    // GARDE #1 — le délai de calme s'applique TOUJOURS à l'envoi auto (même après une relève manuelle) : ne pas réclamer une pièce
    //   qui arrive cinq minutes plus tard.
    if (!vagueCloseeEnvoi({ dernierMailLe: c.dernierMailLe, maintenant, calmeMinutes: cfg.calmeMinutes })) { differes += 1; continue; }
    const { objet, corps } = texteRelancePartielle(c.rang, c.famillesManquantes);
    try { await deps.envoyer(c.demandeId, c.rang, objet, corps); envoyes += 1; deps.budget?.noterEnvoi(c.demandeId); }
    catch { erreurs += 1; } // isolation : un envoi en échec n'arrête pas les suivants
  }
  return { candidats: candidats.length, envoyes, differes, erreurs, reporte: false, raison: `envoyées=${envoyes}, différées=${differes}, erreurs=${erreurs}` };
}

// ── Accès données (production) ─────────────────────────────────────────────────
/** Ligne brute par demande partielle : dernier message mairie, dernier sortant de suivi, relances PART-E déjà envoyées. */
interface LigneBrute { demande_id: number; dernier_mail_le: string | null; dernier_sortant_le: string | null; nb_relances_reponse: number }

/**
 * Demandes en dossier PARTIEL actif dont une relance sur réponse est DUE (idempotence + pièces manquantes). RÉSILIENT (177/175/174
 * absentes → aucun candidat). Le SQL ramène les dates ; le TRI (due + manquantes) est fait en TS (relanceReponseDue + diagnostic à jour).
 */
export async function candidatsRelanceReponseReels(): Promise<CandidatRelanceReponse[]> {
  let rows: LigneBrute[];
  try {
    const like = PREFIXES_SORTANTS.map((p) => `'${p.replace(/'/g, "''")}%'`).join(', ');
    const res = await query<LigneBrute>(
      `SELECT d.id::int AS demande_id,
              (SELECT max(r.recu_le)::text FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond') AS dernier_mail_le,
              (SELECT max(j.horodatage)::text FROM demande_journal j WHERE j.demande_id = d.id AND j.motif LIKE ANY (ARRAY[${like}])) AS dernier_sortant_le,
              (SELECT count(*)::int FROM demande_journal j WHERE j.demande_id = d.id AND j.motif LIKE '${MOTIF_RELANCE_REPONSE_PREFIXE.replace(/'/g, "''")}%') AS nb_relances_reponse
         FROM demande d
        WHERE d.partiel_le IS NOT NULL AND d.partiel_leve_le IS NULL AND d.statut IN ('envoyee', 'close')`);
    rows = res.rows;
  } catch { return []; } // colonnes/tables absentes → aucun candidat

  const candidats: CandidatRelanceReponse[] = [];
  for (const r of rows) {
    const dernierMailLe = r.dernier_mail_le ? new Date(r.dernier_mail_le) : null;
    const dernierSortantLe = r.dernier_sortant_le ? new Date(r.dernier_sortant_le) : null;
    if (dernierMailLe === null) continue;
    // Pré-filtre bon marché AVANT le diagnostic (lecture de complétude par dossier) : la réponse doit être plus récente que le sortant.
    if (dernierSortantLe !== null && dernierMailLe.getTime() <= dernierSortantLe.getTime()) continue;
    const { manquantes } = await famillesManquantesDemande(r.demande_id);
    if (!relanceReponseDue({ dernierMailLe, dernierSortantLe, famillesManquantes: manquantes })) continue;
    candidats.push({ demandeId: r.demande_id, dernierMailLe, famillesManquantes: manquantes, rang: r.nb_relances_reponse + 1 });
  }
  return candidats;
}

/** PART-E — nombre de relances sur réponse DUES. 0 en mode AUTO (elles partent seules → aucune action manuelle attendue) ; en mode
 *  MANUEL, chaque due est une action d'Arno (envoyer via BlocDemandePieces, depuis « En cours »). RÉSILIENT (→ 0).
 *  ⚠️ LOT 52 — N'ALIMENTE PLUS la pastille « Analyse » (elle violait l'invariant « pastille == lignes affichées » : ces dossiers
 *  partiel-actifs sont exclus de la file par FIX-2, donc sans ligne). Helper CONSERVÉ pour un éventuel placement dédié (« En cours »)
 *  décidé plus tard ; actuellement NON CÂBLÉ à une pastille. */
export async function compterRelancesReponseDue(relanceActive: boolean): Promise<number> {
  if (relanceActive) return 0;
  try { return (await candidatsRelanceReponseReels()).length; } catch { return 0; }
}

export function depsReellesRelanceReponsePartielle(budget?: BudgetEnvoiRun): DepsRelanceReponsePartielle {
  return {
    maintenant: () => new Date(),
    budget,
    journaliserReport: async (demandeId) => { await tracerReportPlafond(demandeId, 'relance sur réponse (PART-E)'); },
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      // Cap PAR RUN de sécurité = plafond d'envoi automatique par run (réutilisé) ; JAMAIS un plafond quotidien (échange de suivi).
      return { relanceActive: c.relanceAutoActive === true, calmeMinutes: c.vagueCalmeMinutes, envoiHeureDebut: c.envoiHeureDebut, envoiHeureFin: c.envoiHeureFin, capParRun: c.envoisAutoMaxParRun };
    },
    candidats: () => candidatsRelanceReponseReels(),
    envoyer: async (demandeId, rang, objet, corps) => {
      // GARDE CASC-4 (défensif) : n'agir QUE sur une demande en régime PARTIEL actif.
      const { lireEtatPartiel } = await import('../permis/dossierPartielRepo');
      if ((await lireEtatPartiel(demandeId)) === null) throw new Error('demande non partielle : relance sur réponse refusée (régime CASC-4)');
      // Cible = fil du dernier message mairie (réutilise lireCibleComplementReel via un dossier actif) — aucune 2e implémentation d'envoi.
      const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE demande_id = $1 AND actif ORDER BY dossier_id LIMIT 1`, [demandeId]);
      const dossierId = rows[0]?.dossier_id;
      if (dossierId === undefined) throw new Error('aucun dossier actif');
      const { lireCibleComplementReel } = await import('../permis/demanderPiecesRepo');
      const cible = await lireCibleComplementReel(dossierId);
      if (cible === null || cible.motifIndisponible !== null) throw new Error(cible?.motifIndisponible ?? 'aucun message de mairie auquel répondre');
      const { obtenirTransporteur, lireCompteSmtp, envoyerComplementPieces } = await import('../email');
      const { INFIXE_SMTP } = await import('../sitadel/envoiDemande');
      const { entetesFil } = await import('../permis/complementPieces');
      const compte = lireCompteSmtp(INFIXE_SMTP[cible.profil as 'entreprise' | 'personne'] ?? '');
      if (compte === null) throw new Error('compte SMTP non configuré');
      const { inReplyTo, references } = entetesFil(cible.messageId, cible.referencesBrut);
      const emission = await envoyerComplementPieces(obtenirTransporteur(compte), cible.from, { to: cible.destinataire, replyTo: cible.from, objet, corps, inReplyTo, references });
      // Journal : préfixe DISTINCT (cohabitation CASC-3) + auteur 'auto'. details jsonb si migration 175 présente, sinon repli motif.
      const motif = `${MOTIF_RELANCE_REPONSE_PREFIXE} #${rang} à ${cible.destinataire} (messageId ${emission.messageId})`;
      const details = JSON.stringify({ type: 'relance_reponse_partielle', rang, objet, corps, destinataire: cible.destinataire, messageId: emission.messageId });
      try {
        await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur, details) VALUES ($1, NULL, NULL, $2, 'auto', $3::jsonb)`, [demandeId, motif, details]);
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
          await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'auto')`, [demandeId, `${motif}\n--- objet ---\n${objet}\n--- corps ---\n${corps}`]);
        } else throw e;
      }
    },
  };
}
