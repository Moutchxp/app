/**
 * Chemin d'ENVOI de la SAISINE CADA (chantier X3). Calqué sur envoiRelance.ts — SIMULATION PAR DÉFAUT. DEUX canaux selon
 * config_veille.cada_email : renseigné → envoi e-mail à la CADA avec la COPIE de la demande initiale en pièce jointe (R343-1) ;
 * VIDE → aucun envoi, la saisine rejoint la file « à saisir sur le formulaire CADA » (dépôt manuel), jamais « envoi impossible ».
 *
 * RÉUTILISE sans dupliquer : envoyerDemande (+ pieces), lireCompteSmtp/obtenirTransporteur, capBatch, classerErreurSmtp,
 * problemeCorpsDemande, lireAdressesExpedition, compterEmisAujourdhui (budget PARTAGÉ), planifierSalve (générique), apercu,
 * octetsDe (d'envoiRelance). Aucun de ces modules n'est modifié → chemins demandes ET relances inchangés (tests existants verts).
 *
 * ⚠️ INVARIANT : ce chemin n'écrit JAMAIS demande.statut. Il écrit demande_acheminement (relance_id = id de la saisine, cf.
 * migration 082), demande_relance (statut 'envoyee' + envoyee_le, garde 'brouillon') et demande_journal (append-only).
 * ⚠️ FORCLUSION revérifiée AU MOMENT DE L'ENVOI (fenetreCada) : une saisine forclose est ÉCARTÉE, jamais expédiée.
 * ⚠️ PIÈCE JOINTE OBLIGATOIRE (R343-1) : si la copie de la demande ne peut être produite, la saisine ÉCHOUE — jamais sans elle.
 */
import nodemailer from 'nodemailer';
import { withTransaction, type RequeteTx } from '../db/client';
import { lireCompteSmtp, obtenirTransporteur, envoyerDemande, type CompteSmtp } from '../email';
import { chargerConfigVeille } from './veilleConfig';
import { problemeCorpsDemande, profilValide, dateEnFrancais, type ProfilDemandeur } from './demande';
import type { Requete } from './mairieContact';
import { query } from '../db/client';
import {
  INFIXE_SMTP, lireAdressesExpedition, compterEmisAujourdhui, capBatch, classerErreurSmtp, planifierSalve, apercu,
  type Transport, type IssueEmission,
} from './envoiDemande';
import { octetsDe } from './envoiRelance'; // RÉUTILISÉ (0 en simulation, octets réels en --appliquer)
import { fenetreCada } from '../veille/echeance';
import { genererCopieDemandePdf } from '../pdf/copieDemandePdf';
import { creerSaisineCada } from '../veille/saisineCadaRepo';
import { sujetAlerteSaisine, corpsAlerteSaisine, type InfoAlerteSaisine } from '../veille/alerteSaisineContenu'; // C (lot 5b)
import { prochainCreneauEnvoi, etatFiltreHoraire, type FiltreHoraire } from '../veille/envoiOuvre'; // ENVOI OUVRÉ : même fenêtre horaire, SANS décalage de jour
import type { BudgetEnvoiRun } from '../veille/plafondEnvoiRun';

// ── Types ────────────────────────────────────────────────────────────────────
export interface SaisineAEnvoyer {
  saisineId: number;
  demandeId: number;
  profil: ProfilDemandeur;         // profil PORTÉ PAR LA SAISINE → compte SMTP + from/reply-to
  reference: string;               // référence de la DEMANDE (rapport + journal + copie)
  communeNom: string | null;
  objet: string;                   // objet FIGÉ de la SAISINE (ce qui part à la CADA)
  corps: string;                   // corps FIGÉ de la SAISINE
  envoyeLe: Date;                  // envoi RÉEL de la demande initiale (fenetreCada + date de la copie)
  demandeDestEmail: string | null; // destinataire figé de la demande (en-tête de la copie)
  demandeCorps: string;            // corps FIGÉ de la DEMANDE initiale (contenu de la copie PDF)
  numeros: string[];               // C (lot 5b) : num_dau des dossiers DUS (permis) — pour l'alerte « saisine partie »
}
export interface ResultatSaisine { saisineId: number; reference: string; issue: IssueEmission; messageId?: string; motif?: string; }
export interface LigneMotif { reference: string; motif: string }
export interface LigneFile { saisineId: number; demandeId: number; reference: string; communeNom: string | null; numeros: string[]; objet: string; corps: string; urlFormulaire: string }

/** Date d'un instant en français (« 14 mars 2026 »), en date UTC (cohérent avec echeanceDe). */
function dateFr(d: Date): string { return dateEnFrancais(d.toISOString().slice(0, 10)); }

const SQL_INSERT_ACHEMINEMENT_SAISINE =
  `INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le, message_id, retour_fournisseur, rebond_le, rebond_motif, derniere_erreur, relance_id, maj_a)
   VALUES ($1, 'email', $2, $3, $4, $5, $6, $7, $8, $9, now())`;

/**
 * Émet UNE saisine (avec la COPIE en pièce jointe) via le transport injecté et écrit sa trace via `q`. Succès → acheminement
 * 'envoye' AVEC relance_id = id de la saisine + demande_relance 'envoyee'/envoyee_le (garde 'brouillon' = anti-double-envoi) +
 * journal. Échec/rebond → acheminement 'echec'/'rebond' avec relance_id, la saisine RESTE 'brouillon'. demande.statut jamais écrit.
 */
export async function emettreUneSaisine(
  transport: Transport, q: Requete, s: SaisineAEnvoyer, opts: { from: string; replyTo: string; to: string; piece: Buffer; auteur: string | null },
): Promise<ResultatSaisine> {
  const gab = problemeCorpsDemande(s.objet, s.corps);
  if (gab !== null) return { saisineId: s.saisineId, reference: s.reference, issue: 'gabarit', motif: gab };
  try {
    const emission = await envoyerDemande(transport as never, opts.from, {
      to: opts.to, replyTo: opts.replyTo, objet: s.objet, corps: s.corps,
      pieces: [{ filename: `Copie-demande-${s.reference}.pdf`, content: opts.piece, contentType: 'application/pdf' }],
    });
    await q(SQL_INSERT_ACHEMINEMENT_SAISINE, [s.demandeId, 'envoye', new Date(), emission.messageId, emission.retourFournisseur, null, null, null, s.saisineId]);
    await q(`UPDATE demande_relance SET statut = 'envoyee', envoyee_le = now() WHERE id = $1 AND statut = 'brouillon'`, [s.saisineId]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [s.demandeId, `saisine CADA ${s.saisineId} envoyée à la CADA (messageId ${emission.messageId})`, opts.auteur]);
    return { saisineId: s.saisineId, reference: s.reference, issue: 'envoye', messageId: emission.messageId };
  } catch (err) {
    const issue = classerErreurSmtp(err);
    const nom = (err as Error)?.name ?? 'Error';
    await q(SQL_INSERT_ACHEMINEMENT_SAISINE, [s.demandeId, issue, null, null, null, issue === 'rebond' ? new Date() : null, issue === 'rebond' ? nom : null, nom, s.saisineId]);
    return { saisineId: s.saisineId, reference: s.reference, issue, motif: nom };
  }
}

/** Partition PURE des candidats selon la fenêtre CADA revérifiée à l'instant `maintenant` : recevables (ouverte) vs forcloses
 *  (fermée) / pas encore ouvertes — écartées avec un motif nommant la date. Une saisine irrecevable ne part JAMAIS. */
export function partitionForclusion(candidats: SaisineAEnvoyer[], maintenant: Date): { recevables: SaisineAEnvoyer[]; forcloses: LigneMotif[] } {
  const recevables: SaisineAEnvoyer[] = [];
  const forcloses: LigneMotif[] = [];
  for (const s of candidats) {
    const f = fenetreCada(s.envoyeLe, maintenant);
    if (f.etat === 'ouverte') recevables.push(s);
    else forcloses.push({ reference: s.reference, motif: f.etat === 'fermee' ? `délai de saisine forclos (forclusion le ${dateFr(f.forclusionLe)}) — non expédiée` : `refus tacite pas encore acquis (attendu le ${dateFr(f.refusTaciteLe)})` });
  }
  return { recevables, forcloses };
}

// ── Orchestration (I/O) ───────────────────────────────────────────────────────
export interface RapportEnvoiSaisine {
  mode: 'simulation' | 'applique';
  canal: 'email' | 'formulaire';   // formulaire = cada_email vide → dépôt manuel (aucune émission)
  candidats: number;
  emisAujourdhui: number; capParRun: number; capParJour: number; budget: number;
  bloqueesForclusion: LigneMotif[];
  bloqueesCorps: LigneMotif[];
  bloqueesCompte: LigneMotif[];
  bloqueesPiece: LigneMotif[];      // copie de la demande impossible à produire → jamais envoyée sans PJ
  destinataires: { saisineId: number; demandeId: number; reference: string; commune: string | null; email: string; expediteur: string; apercuCorps: string; numeros: string[] }[];
  reportes: { reference: string; commune: string | null; numeros: string[]; motif: string }[]; // LOT 6 : envoyables au-delà du plafond (auto/caps) — reportées, NOMMÉES
  reportesHoraire: { reference: string; commune: string | null; numeros: string[]; motif: string; prevu: string | null }[]; // ENVOI OUVRÉ : reportées pour cause d'heure/jour (SANS décalage de jour : la saisine a son propre délai)
  resultats: ResultatSaisine[];
  fileADeposer: LigneFile[];        // canal 'formulaire' : à saisir à la main sur le formulaire en ligne
  octetsPartis: number;
}

const brancher = (tx: RequeteTx): Requete =>
  (<R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>);
const SENTINELLE_DRYRUN = new Error('__DRY_RUN_ROLLBACK__');

/** Candidats : saisines 'brouillon' d'une demande 'envoyee' (émission e-mail confirmée) portant au moins un dossier DÛ. La
 *  forclusion et le canal sont décidés ensuite (TS). EXPORTÉ pour tester le filtre (close / non-brouillon exclus). */
export async function lireCandidatsSaisine(): Promise<SaisineAEnvoyer[]> {
  const { rows } = await query<{ saisine_id: number; demande_id: number; reference: string; commune_nom: string | null; objet: string | null; corps: string | null; profil: string; envoye_le: Date; demande_dest_email: string | null; demande_corps: string | null; dus_nums: string[] }>(
    `WITH ach AS (SELECT demande_id, min(envoye_le) AS envoye_le FROM demande_acheminement WHERE canal = 'email' AND statut = 'envoye' GROUP BY demande_id)
     SELECT dr.id::int AS saisine_id, dr.demande_id::int AS demande_id, d.reference, c.nom AS commune_nom,
            dr.objet, dr.corps, dr.profil_demandeur AS profil, a.envoye_le, d.dest_email AS demande_dest_email, d.corps AS demande_corps,
            -- C (lot 5b) : num_dau des dossiers DUS (permis concernés) pour l'alerte « saisine partie ».
            coalesce((SELECT array_agg(s.num_dau ORDER BY s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                       WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL), '{}') AS dus_nums
       FROM demande_relance dr
       JOIN demande d ON d.id = dr.demande_id
       JOIN ach a ON a.demande_id = d.id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE dr.statut = 'brouillon' AND dr.type = 'saisine_cada'
        AND d.statut = 'envoyee'
        AND EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL)
      ORDER BY dr.generee_le ASC`);
  return rows.map((r) => ({
    saisineId: r.saisine_id, demandeId: r.demande_id, profil: profilValide(r.profil), reference: r.reference, communeNom: r.commune_nom,
    objet: r.objet ?? '', corps: r.corps ?? '', envoyeLe: r.envoye_le, demandeDestEmail: r.demande_dest_email, demandeCorps: r.demande_corps ?? '', numeros: r.dus_nums ?? [],
  }));
}

// ── C (lot 5b) : ALERTE INTERNE « une saisine est partie » — ISOLÉE, une par saisine ─────────────────────────────────────────
/** Émet l'alerte interne (vers alerte_email) APRÈS un envoi confirmé. ISOLÉE : ne throw JAMAIS (un échec journalise sans défaire
 *  la saisine). `alerte_email` vide → aucune alerte (journalisé). JAMAIS vers la mairie ni la CADA. */
async function emettreAlerteSaisineReel(info: InfoAlerteSaisine, demandeId: number): Promise<void> {
  const journal = async (motif: string): Promise<void> => {
    try { await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`, [demandeId, motif]); } catch { /* best-effort */ }
  };
  try {
    const dest = (await chargerConfigVeille()).alerteEmail.trim();
    if (dest === '') { await journal('saisine partie : alerte NON émise (aucune adresse d’alerte configurée)'); return; }
    const { lireConfigEmail, obtenirTransporteur } = await import('../email');
    const cfg = lireConfigEmail();
    if (cfg === null) { await journal('saisine partie : alerte NON émise (compte SMTP par défaut non configuré)'); return; }
    await obtenirTransporteur(cfg).sendMail({ from: cfg.from, to: dest, subject: sujetAlerteSaisine(info), text: corpsAlerteSaisine(info) });
    await journal(`alerte interne « saisine partie » envoyée à ${dest}`);
  } catch (e) {
    // ISOLÉ : la saisine est déjà envoyée/tracée ; l'échec d'alerte ne défait rien.
    await journal(`échec d’émission de l’alerte « saisine partie » (${e instanceof Error ? e.name : 'Error'}) — la saisine reste envoyée`);
  }
}

/** Construit l'info d'alerte d'une saisine partie (forclusion dérivée de la date d'envoi de la demande). PUR. */
function infoAlerteDe(s: SaisineAEnvoyer, canal: 'email' | 'formulaire', maintenant: Date): InfoAlerteSaisine {
  return { communeNom: s.communeNom, reference: s.reference, numeros: s.numeros, envoyeeLe: maintenant, canal, forclusionLe: fenetreCada(s.envoyeLe, maintenant).forclusionLe };
}

/** Lectures + production de PJ injectables (test node-pur) ; l'ÉCRITURE passe par withTransaction (db/client). */
export interface DepsEnvoiSaisine {
  cadaEmail(): Promise<string>;
  cadaUrlFormulaire(): Promise<string>;
  caps(): Promise<{ capParRun: number; capParJour: number }>;
  candidats(): Promise<SaisineAEnvoyer[]>;
  adresses(): Promise<Record<string, string>>;
  comptes(): Record<string, CompteSmtp | null>;
  emisAujourdhui(): Promise<number>;
  produireCopie(s: SaisineAEnvoyer): Promise<Buffer>; // genererCopieDemandePdf ; throw → PJ non produite → saisine écartée
  emettreAlerte(info: InfoAlerteSaisine, demandeId: number): Promise<void>; // C (lot 5b) : alerte interne « saisine partie » (isolée)
  maintenant(): Date;
}

export function depsReellesEnvoiSaisine(): DepsEnvoiSaisine {
  return {
    cadaEmail: async () => (await chargerConfigVeille()).cadaEmail,
    cadaUrlFormulaire: async () => (await chargerConfigVeille()).cadaUrlFormulaire,
    caps: async () => { const c = await chargerConfigVeille(); return { capParRun: c.envoisMaxParRun, capParJour: c.envoisMaxParJour }; },
    // CASC-4 — RÉGIME UNIQUE : une demande PARTIELLE (marqueur CASC-1) dont le butoir CASC-2 n'est pas atteint n'est JAMAIS envoyée en
    //   saisine. Filet AU NIVEAU DE LA SÉLECTION D'ENVOI (en plus de la garde autoritaire de creerSaisineCada — un tel brouillon ne peut
    //   déjà plus être créé). Résilient : 177/178 absente → aucun butoir → aucune exclusion → comportement inchangé.
    candidats: async () => {
      const bruts = await lireCandidatsSaisine();
      const cfg = await chargerConfigVeille();
      const { lireButoirsPartiel } = await import('../permis/dossierPartielRepo');
      const butoirs = await lireButoirsPartiel(cfg.cadaPartielDelaiMois, cfg.cadaPartielDelaiJours);
      const now = Date.now();
      return bruts.filter((c) => { const b = butoirs.get(c.demandeId); return b === undefined || now >= b.getTime(); });
    },
    adresses: () => lireAdressesExpedition(),
    comptes: () => ({ entreprise: lireCompteSmtp(INFIXE_SMTP.entreprise), personne: lireCompteSmtp(INFIXE_SMTP.personne) }),
    emisAujourdhui: () => compterEmisAujourdhui(),
    produireCopie: (s) => genererCopieDemandePdf({ reference: s.reference, destinataire: s.demandeDestEmail, dateEnvoi: dateFr(s.envoyeLe), corps: s.demandeCorps }),
    emettreAlerte: (info, demandeId) => emettreAlerteSaisineReel(info, demandeId), // C (lot 5b)
    maintenant: () => new Date(),
  };
}

/**
 * Point d'entrée. `appliquer:false` (défaut) = SIMULATION (jsonTransport, écritures ROLLBACK). Canal E-MAIL si cada_email est
 * renseigné ; sinon canal FORMULAIRE : aucune émission, aucune ligne d'acheminement, la file « à déposer » est renvoyée.
 * AUCUN branchement dans executerVeille.
 */
export async function envoyerSaisinesCada(opts: { appliquer?: boolean; auteur?: string | null; plafondAuto?: number; filtreHoraire?: FiltreHoraire; budget?: BudgetEnvoiRun } = {}, deps: DepsEnvoiSaisine = depsReellesEnvoiSaisine()): Promise<RapportEnvoiSaisine> {
  const appliquer = opts.appliquer === true;
  const auteur = opts.auteur ?? null;
  // LOT 6 : plafond d'envoi AUTOMATIQUE (EN PLUS des caps, jamais à leur place). Absent (appel manuel) → aucune borne ajoutée.
  const plafondAuto = typeof opts.plafondAuto === 'number' ? Math.max(0, Math.trunc(opts.plafondAuto)) : Infinity;
  const [cadaEmail, cadaUrl, caps, candidats] = await Promise.all([deps.cadaEmail(), deps.cadaUrlFormulaire(), deps.caps(), deps.candidats()]);
  const maintenant = deps.maintenant();
  const mode = appliquer ? 'applique' : 'simulation';

  // FORCLUSION revérifiée à l'envoi : les forcloses/pas-encore-ouvertes sont écartées (jamais expédiées).
  const { recevables, forcloses } = partitionForclusion(candidats, maintenant);

  // CANAL FORMULAIRE (cada_email vide) : aucune tentative d'envoi, aucune ligne d'acheminement — la file est renvoyée.
  if (cadaEmail.trim() === '') {
    // LOT 6 : le plafond d'envoi AUTO ne borne PAS la file de dépôt (aucun envoi n'y a lieu ; elle est déjà visible dans l'onglet
    // Saisines et le dépôt reste MANUEL). Le canal formulaire n'expédie rien → « reportes » vide.
    const fileADeposer: LigneFile[] = recevables.map((s) => ({ saisineId: s.saisineId, demandeId: s.demandeId, reference: s.reference, communeNom: s.communeNom, numeros: s.numeros, objet: s.objet, corps: s.corps, urlFormulaire: cadaUrl }));
    return { mode, canal: 'formulaire', candidats: candidats.length, emisAujourdhui: 0, capParRun: caps.capParRun, capParJour: caps.capParJour, budget: 0, bloqueesForclusion: forcloses, bloqueesCorps: [], bloqueesCompte: [], bloqueesPiece: [], destinataires: [], reportes: [], reportesHoraire: [], resultats: [], fileADeposer, octetsPartis: 0 };
  }

  // CANAL E-MAIL. Garde-fous gabarit + adresse/compte du profil (planifierSalve réutilisé).
  const [adresses, emisAujourdhui] = await Promise.all([deps.adresses(), deps.emisAujourdhui()]);
  const comptes = deps.comptes();
  const comptesPresents: Record<string, boolean> = { entreprise: comptes.entreprise !== null, personne: comptes.personne !== null };
  const plan = planifierSalve(recevables, adresses, comptesPresents);
  // Salve réelle = MIN(candidats, cap/run, reste du jour, plafond auto) — le plafond auto resserre les 3 bornes de capBatch.
  const budget = Math.min(capBatch(plan.envoyables.length, caps.capParRun, caps.capParJour, emisAujourdhui), plafondAuto);
  const aTraiterBudget = plan.envoyables.slice(0, budget);
  const reportes = plan.envoyables.slice(budget).map((s) => ({
    reference: s.reference, commune: s.communeNom, numeros: s.numeros,
    motif: 'plafond d’envoi atteint (envoi auto / caps) — saisine reportée au prochain run, aucune donnée perdue',
  }));

  // ENVOI OUVRÉ (D) — MÊME fenêtre horaire que les relances, mais SANS décalage de jour (la saisine a déjà son propre délai de
  // 4 j). Hors fenêtre ou config incohérente (auto seulement ; manuel = filtre absent) → on n'envoie rien, on reporte.
  const filtre = opts.filtreHoraire;
  const { envoie } = etatFiltreHoraire(filtre);
  const aTraiterHoraire = envoie ? aTraiterBudget : [];
  // PLAFOND ANTI-CUMUL — au plus N envois auto/demande/run, tous émetteurs confondus. La saisine passe APRÈS la relance ordinaire dans
  //   le même run (envoiAuto) : si la demande a déjà reçu sa relance auto ce run, sa saisine est REPORTÉE. Budget absent (appel manuel/
  //   CLI) → jamais bridé. Refus AVANT émission → la saisine reste candidate, aucun effet sur le butoir CADA.
  const reportesPlafond = aTraiterHoraire.filter((s) => opts.budget && !opts.budget.peutEnvoyer(s.demandeId));
  const aTraiter = aTraiterHoraire.filter((s) => !(opts.budget && !opts.budget.peutEnvoyer(s.demandeId)));
  const reportesHoraire = (!envoie && filtre ? aTraiterBudget : []).map((s) => ({
    reference: s.reference, commune: s.communeNom, numeros: s.numeros,
    motif: filtre!.coherente
      ? 'hors fenêtre d’envoi automatique (jour ouvré / heures ouvrées)'
      : 'fenêtre horaire incohérente (début ≥ fin) — aucun envoi automatique tant qu’elle n’est pas corrigée',
    prevu: filtre!.coherente ? prochainCreneauEnvoi(filtre!.maintenant, filtre!.heureDebut).toISOString() : null,
  }));

  // PIÈCE JOINTE OBLIGATOIRE (R343-1) : produire la copie de la demande ; un échec ÉCARTE la saisine (jamais envoyée sans PJ).
  const bloqueesPiece: LigneMotif[] = [];
  const prets: (typeof aTraiter[number] & { piece: Buffer })[] = [];
  for (const s of aTraiter) {
    try { prets.push({ ...s, piece: await deps.produireCopie(s) }); }
    catch (e) { bloqueesPiece.push({ reference: s.reference, motif: `pièce jointe (copie de la demande) impossible à produire : ${(e as Error)?.name ?? 'Erreur'} — saisine non expédiée (R343-1)` }); }
  }

  const resultats: ResultatSaisine[] = [];
  const octets = (): number => octetsDe(prets.filter((s) => resultats.find((x) => x.saisineId === s.saisineId)?.issue === 'envoye'), appliquer);
  // Les saisines écartées par le PLAFOND ANTI-CUMUL rejoignent `reportes` (visibles au compte rendu, motif dédié) → jamais silencieux.
  const reportesTous = [...reportes, ...reportesPlafond.map((s) => ({
    reference: s.reference, commune: s.communeNom, numeros: s.numeros,
    motif: 'plafond « un envoi automatique par demande et par passage » atteint — saisine reportée au prochain passage (aucune donnée perdue)',
  }))];
  const base = {
    canal: 'email' as const, candidats: candidats.length, emisAujourdhui, capParRun: caps.capParRun, capParJour: caps.capParJour, budget,
    bloqueesForclusion: forcloses, bloqueesCorps: plan.bloqueesCorps, bloqueesCompte: plan.bloqueesCompte, bloqueesPiece, reportes: reportesTous, reportesHoraire,
    destinataires: prets.map((s) => ({ saisineId: s.saisineId, demandeId: s.demandeId, reference: s.reference, commune: s.communeNom, email: cadaEmail, expediteur: s.expediteur, apercuCorps: apercu(s.corps), numeros: s.numeros })),
    fileADeposer: [] as LigneFile[],
  };

  if (!appliquer) {
    const t = nodemailer.createTransport({ jsonTransport: true }) as unknown as Transport;
    try {
      await withTransaction(async (tx) => {
        const q = brancher(tx);
        for (const s of prets) resultats.push(await emettreUneSaisine(t, q, s, { from: s.expediteur, replyTo: s.expediteur, to: cadaEmail, piece: s.piece, auteur }));
        throw SENTINELLE_DRYRUN; // rien n'est persisté
      });
    } catch (e) { if (e !== SENTINELLE_DRYRUN) throw e; }
    return { mode: 'simulation', ...base, resultats, octetsPartis: octets() };
  }

  for (const s of prets) {
    const t = obtenirTransporteur(comptes[s.profil]!) as unknown as Transport; // non-null : planifierSalve a écarté les profils sans compte
    const res = await withTransaction(async (tx) => emettreUneSaisine(t, brancher(tx), s, { from: s.expediteur, replyTo: s.expediteur, to: cadaEmail, piece: s.piece, auteur }));
    if (res.issue === 'envoye') opts.budget?.noterEnvoi(s.demandeId); // PLAFOND ANTI-CUMUL : ne consomme le budget que sur un envoi CONFIRMÉ
    resultats.push(res);
  }
  // C (lot 5b) — ALERTE « saisine partie » APRÈS chaque envoi CONFIRMÉ (apply seulement, jamais en simulation). Une par saisine :
  //   une fois envoyée elle passe 'envoyee' → n'est plus candidate. ISOLÉE : un échec n'annule ni ne masque la saisine.
  for (const s of prets) {
    if (resultats.find((x) => x.saisineId === s.saisineId)?.issue !== 'envoye') continue;
    try { await deps.emettreAlerte(infoAlerteDe(s, 'email', deps.maintenant()), s.demandeId); } catch { /* isolation : la saisine est déjà envoyée/tracée */ }
  }
  return { mode: 'applique', ...base, resultats, octetsPartis: octets() };
}

// ── Chemin PARTAGÉ « lancer une saisine pour UNE demande » (onglet Saisines CADA + page de confirmation du lien e-mail) ────
/** Résultat d'un lancement UNITAIRE : de quoi construire une réponse HTTP franche (jamais un faux succès). */
export interface ResultatLancement {
  saisineId: number;
  ok: boolean;                       // true = envoyée (e-mail) ou préparée (formulaire) ; false = brouillon créé, envoi non abouti
  canal: 'email' | 'formulaire';
  issue?: string;                    // 'envoye' | 'rebond' | 'echec' | 'gabarit' | 'bloquee'
  motif?: string;
}
/** Collaborateurs injectables (test node-pur du mapping) ; défauts = production. */
export interface DepsLancement { creer: typeof creerSaisineCada; envoyer: typeof envoyerSaisinesCada; deps: DepsEnvoiSaisine }

/**
 * Crée la saisine en brouillon (creerSaisineCada) PUIS la fait partir via l'orchestrateur d'envoi RESTREINT à cette seule
 * saisine (candidats filtrés par id) — AUCUNE logique d'envoi réécrite. UNIQUE point d'entrée du « lancer » : l'onglet
 * d'admin et la page de confirmation du lien e-mail passent tous deux par ICI (donc même chemin, même anti-doublon). Laisse
 * remonter SaisineCadaError / 23505 (demande_relance_vivante_uniq) / IdentiteIncompleteError à l'appelant (→ 409 côté route).
 */
export async function lancerSaisinePourDemande(demandeId: number, auteur: string | null, dl: Partial<DepsLancement> = {}): Promise<ResultatLancement> {
  const creer = dl.creer ?? creerSaisineCada;
  const envoyer = dl.envoyer ?? envoyerSaisinesCada;
  const deps = dl.deps ?? depsReellesEnvoiSaisine();
  const saisineId = await creer(demandeId, auteur); // peut lever (état, doublon, identité) → géré par l'appelant
  const rapport = await envoyer(
    { appliquer: true, auteur },
    { ...deps, candidats: async () => (await deps.candidats()).filter((s) => s.saisineId === saisineId) },
  );
  if (rapport.canal === 'formulaire') {
    // C (lot 5b) — saisine FORMULAIRE « lancée » (à déposer) : alerte une fois (re-lancer bloqué par « déjà lancée »). ISOLÉE.
    const cand = (await deps.candidats()).find((s) => s.saisineId === saisineId);
    if (cand) { try { await deps.emettreAlerte(infoAlerteDe(cand, 'formulaire', deps.maintenant()), demandeId); } catch { /* isolation */ } }
    return { saisineId, ok: true, canal: 'formulaire' };
  }
  const r0 = rapport.resultats.find((x) => x.saisineId === saisineId) ?? rapport.resultats[0];
  if (r0 && r0.issue === 'envoye') return { saisineId, ok: true, canal: 'email', issue: 'envoye' };
  const motif = r0?.motif
    ?? rapport.bloqueesForclusion[0]?.motif ?? rapport.bloqueesPiece[0]?.motif
    ?? rapport.bloqueesCompte[0]?.motif ?? rapport.bloqueesCorps[0]?.motif
    ?? (rapport.budget === 0 ? 'plafond d’envoi du jour atteint (saisine préparée en brouillon, à relancer)' : 'envoi impossible (saisine préparée en brouillon)');
  return { saisineId, ok: false, canal: 'email', issue: r0?.issue ?? 'bloquee', motif };
}
