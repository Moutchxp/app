/**
 * Chemin d'ENVOI e-mail des RELANCES CRPA (chantier W1). Calqué sur envoiDemande.ts — SIMULATION PAR DÉFAUT (l'envoi réel
 * exige `appliquer: true`). RÉUTILISE le transport (`envoyerDemande`), la sélection de compte SMTP par profil, les caps
 * (`capBatch`), les garde-fous d'adresse/compte (`planifierSalve`→`problemeEnvoi`) et de corps (`problemeCorpsDemande`), le
 * compteur d'émissions du jour (`compterEmisAujourdhui`, budget PARTAGÉ avec les demandes) et l'adresse d'expédition par
 * profil (`lireAdressesExpedition`) — importés d'envoiDemande, jamais dupliqués.
 *
 * ⚠️ INVARIANT : ce chemin n'écrit JAMAIS demande.statut. Il écrit demande_acheminement (avec relance_id), demande_relance
 * (statut 'envoyee' + envoyee_le, sous garde 'brouillon' = anti-double-envoi) et demande_journal (append-only sur la demande,
 * statut_avant/apres NULL). Les seuls écrivains de demande.statut restent cloturerDemande / rouvrirDemande.
 *
 * GARDE-FOUS avant émission : corps à gabarit · adresse/compte du profil · demande close ou relance non-'brouillon' (écartées
 * à la SÉLECTION : lireCandidatsRelance) · dossiers satisfaits depuis la génération du brouillon (obsolète → refus nommant
 * les dossiers, JAMAIS de régénération automatique). Le corps STOCKÉ fait foi — jamais régénéré à l'envoi.
 */
import nodemailer from 'nodemailer';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { lireCompteSmtp, obtenirTransporteur, envoyerDemande, type CompteSmtp } from '../email';
import { chargerConfigVeille } from './veilleConfig';
import { problemeCorpsDemande, profilValide, type ProfilDemandeur } from './demande';
import type { Requete } from './mairieContact';
import {
  INFIXE_SMTP, lireAdressesExpedition, compterEmisAujourdhui, capBatch, classerErreurSmtp, planifierSalve, apercu,
  type Transport, type IssueEmission,
} from './envoiDemande';
import { dossiersSatisfaitsDepuisRelance } from '../veille/relanceAuto';
import { etapeCible, rangVariante, type ReglagesCascade, type VarianteEnBase } from '../veille/cascadeRelance';

// ── Types ────────────────────────────────────────────────────────────────────
export interface RelanceAEnvoyer {
  relanceId: number;
  demandeId: number;
  reference: string;         // référence de la DEMANDE (rapport + journal)
  communeNom: string | null;
  destEmail: string;         // dest_email FIGÉ de la demande (le destinataire de la relance)
  objet: string;             // demande_relance.objet figé (édité à la main = fait foi)
  corps: string;             // demande_relance.corps figé (jamais régénéré à l'envoi)
  profil: ProfilDemandeur;   // profil PORTÉ PAR LA RELANCE → choisit le compte SMTP + l'adresse d'expédition
  variante: string;          // H : étape ENREGISTRÉE (rappel/avis/saisine/formelle) — re-dérivée à l'envoi
  envoyeLe: Date | null;     // H : envoi RÉEL de la demande (ancre d'échéance) — pour recalculer la fenêtre du jour
}

/**
 * H — RE-DÉRIVATION À L'ENVOI : la variante ENREGISTRÉE correspond-elle encore à la fenêtre du jour, recalculée sur la date
 * d'envoi RÉELLE ? Si NON → motif d'obsolescence (aucune régénération silencieuse à l'envoi). Aligné (dont 'formelle' ≡ 'saisine')
 * ou ancre inconnue / trop tôt (impossible pour une relance existante) → null. PUR.
 */
export function motifDesalignement(variante: string, envoyeLe: Date | null, maintenant: Date, reglages: ReglagesCascade): string | null {
  if (envoyeLe === null) return null;                       // pas d'ancre d'échéance → laissé aux autres gardes
  const cible = etapeCible(envoyeLe, maintenant, reglages);
  if (cible === null) return null;                          // trop tôt (ne survient pas pour une relance déjà générée)
  if (rangVariante(variante as VarianteEnBase) === rangVariante(cible)) return null; // aligné
  return `l’étape enregistrée « ${variante} » ne correspond plus à la fenêtre du jour (« ${cible} ») : régénérez ou abandonnez cette relance — aucune régénération automatique à l’envoi`;
}
export interface ResultatRelance { relanceId: number; reference: string; issue: IssueEmission; messageId?: string; motif?: string; }

// ── Helpers PURS (testables) ─────────────────────────────────────────────────

/**
 * Planifie une salve de RELANCES (PUR). RÉUTILISE `planifierSalve` (gabarit + adresse/compte, générique) puis ajoute le
 * garde-fou propre aux relances : `obsoletes` = demandeId → num_dau satisfaits DEPUIS le brouillon → refus nommant les
 * dossiers, hors budget (JAMAIS de régénération automatique).
 */
export interface PlanRelances {
  bloqueesCorps: { reference: string; motif: string }[];
  bloqueesCompte: { reference: string; motif: string }[];
  bloqueesObsoletes: { reference: string; motif: string }[];
  envoyables: (RelanceAEnvoyer & { expediteur: string })[];
}
export function planifierRelances(
  candidats: RelanceAEnvoyer[], adresses: Record<string, string>, comptesPresents: Record<string, boolean>,
  obsoletes: Map<number, string[]>, desalignees: Map<number, string> = new Map(),
): PlanRelances {
  const base = planifierSalve(candidats, adresses, comptesPresents); // gabarit + adresse/compte, réutilisé tel quel
  const bloqueesObsoletes: { reference: string; motif: string }[] = [];
  const envoyables: (RelanceAEnvoyer & { expediteur: string })[] = [];
  for (const e of base.envoyables) {
    const desal = desalignees.get(e.relanceId); // H — variante enregistrée ≠ fenêtre du jour
    const dus = obsoletes.get(e.demandeId);     // dossiers satisfaits depuis le brouillon
    if (desal) {
      bloqueesObsoletes.push({ reference: e.reference, motif: desal });
    } else if (dus && dus.length > 0) {
      bloqueesObsoletes.push({ reference: e.reference, motif: `des dossiers ont été satisfaits depuis la génération du brouillon (${dus.join(', ')}) : régénérez ou abandonnez cette relance — aucune régénération automatique à l’envoi` });
    } else {
      envoyables.push(e);
    }
  }
  return { bloqueesCorps: base.bloqueesCorps, bloqueesCompte: base.bloqueesCompte, bloqueesObsoletes, envoyables };
}

/** Octets du texte (objet + corps) RÉELLEMENT transmis. Simulation → 0 (jsonTransport n'ouvre aucune connexion, aucun octet). */
export function octetsDe(envoyees: { objet: string; corps: string }[], appliquer: boolean): number {
  if (!appliquer) return 0;
  return envoyees.reduce((s, m) => s + Buffer.byteLength(m.objet, 'utf8') + Buffer.byteLength(m.corps, 'utf8'), 0);
}

const SQL_INSERT_ACHEMINEMENT_RELANCE =
  `INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le, message_id, retour_fournisseur, rebond_le, rebond_motif, derniere_erreur, relance_id, maj_a)
   VALUES ($1, 'email', $2, $3, $4, $5, $6, $7, $8, $9, now())`;

/**
 * Émet UNE relance via le transport injecté et écrit sa trace via `q` (transaction fournie par l'appelant : COMMIT réel,
 * ROLLBACK en simulation). Succès (messageId capturé) → demande_acheminement 'envoye' AVEC relance_id + demande_relance
 * 'envoyee'/envoyee_le (garde `AND statut='brouillon'` = anti-double-envoi) + journal append-only. Échec/rebond →
 * acheminement 'echec'/'rebond' avec relance_id, la relance RESTE 'brouillon' (réémettable). demande.statut jamais écrit.
 */
export async function emettreUneRelance(
  transport: Transport, q: Requete, r: RelanceAEnvoyer, opts: { from: string; replyTo: string; auteur: string | null },
): Promise<ResultatRelance> {
  // Garde-fou de corps (réutilisé) : un corps figé encore truffé de gabarits ne part JAMAIS. Aucune émission, aucune écriture.
  const gab = problemeCorpsDemande(r.objet, r.corps);
  if (gab !== null) return { relanceId: r.relanceId, reference: r.reference, issue: 'gabarit', motif: gab };
  try {
    const emission = await envoyerDemande(transport as never, opts.from, { to: r.destEmail, replyTo: opts.replyTo, objet: r.objet, corps: r.corps });
    await q(SQL_INSERT_ACHEMINEMENT_RELANCE, [r.demandeId, 'envoye', new Date(), emission.messageId, emission.retourFournisseur, null, null, null, r.relanceId]);
    // Statut de la RELANCE uniquement (jamais demande.statut). Garde AND statut='brouillon' → jamais réémise deux fois.
    await q(`UPDATE demande_relance SET statut = 'envoyee', envoyee_le = now() WHERE id = $1 AND statut = 'brouillon'`, [r.relanceId]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
      [r.demandeId, `relance ${r.relanceId} envoyée (messageId ${emission.messageId})`, opts.auteur]);
    return { relanceId: r.relanceId, reference: r.reference, issue: 'envoye', messageId: emission.messageId };
  } catch (err) {
    const issue = classerErreurSmtp(err);
    const nom = (err as Error)?.name ?? 'Error';
    await q(SQL_INSERT_ACHEMINEMENT_RELANCE, [r.demandeId, issue, null, null, null, issue === 'rebond' ? new Date() : null, issue === 'rebond' ? nom : null, nom, r.relanceId]);
    // la relance RESTE 'brouillon' : ni 'envoyee', ni consommation du plafond ; demande.statut intact.
    return { relanceId: r.relanceId, reference: r.reference, issue, motif: nom };
  }
}

// ── Orchestration (I/O réelle) ───────────────────────────────────────────────
export interface RapportEnvoiRelance {
  mode: 'simulation' | 'applique';
  candidats: number;
  emisAujourdhui: number;      // émissions e-mail déjà faites aujourd'hui (compteur PARTAGÉ demandes + relances)
  capParRun: number; capParJour: number;
  budget: number;
  bloqueesCorps: { reference: string; motif: string }[];
  bloqueesCompte: { reference: string; motif: string }[];
  bloqueesObsoletes: { reference: string; motif: string }[]; // W1 : dossiers satisfaits depuis le brouillon
  destinataires: { reference: string; commune: string | null; email: string; expediteur: string; apercuCorps: string }[];
  resultats: ResultatRelance[];
  octetsPartis: number;        // 0 en simulation ; octets du texte réellement transmis en --appliquer
}

const brancher = (tx: RequeteTx): Requete =>
  (<R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>);
const SENTINELLE_DRYRUN = new Error('__DRY_RUN_ROLLBACK__');

/** Candidats à la relance : brouillons vivants dont la DEMANDE est envoyée + adressable par e-mail. Le WHERE écarte une
 *  demande close (d.statut≠'envoyee') et une relance non-'brouillon' (déjà envoyée / abandonnée) → jamais candidates.
 *  EXPORTÉ pour tester ce filtre de sélection (garde-fous close / non-brouillon). */
export async function lireCandidatsRelance(): Promise<RelanceAEnvoyer[]> {
  const { rows } = await query<{ relance_id: number; demande_id: number; reference: string; commune_nom: string | null; dest_email: string; objet: string | null; corps: string | null; profil: string; variante: string; envoye_le: Date | null }>(
    `SELECT dr.id::int AS relance_id, dr.demande_id::int AS demande_id, d.reference, c.nom AS commune_nom,
            d.dest_email, dr.objet, dr.corps, dr.profil_demandeur AS profil, dr.variante,
            -- H : ancre d'échéance (envoi RÉEL) pour re-dériver la fenêtre à l'envoi ; agnostique au canal (formulaire compris).
            (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id) AS envoye_le
       FROM demande_relance dr
       JOIN demande d ON d.id = dr.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE dr.statut = 'brouillon' AND dr.type = 'relance'
        AND d.statut = 'envoyee' AND d.dest_canal = 'email' AND coalesce(btrim(d.dest_email), '') <> ''
      ORDER BY dr.generee_le ASC`);
  return rows.map((r) => ({
    relanceId: r.relance_id, demandeId: r.demande_id, reference: r.reference, communeNom: r.commune_nom,
    destEmail: r.dest_email, objet: r.objet ?? '', corps: r.corps ?? '', profil: profilValide(r.profil),
    variante: r.variante, envoyeLe: r.envoye_le,
  }));
}

/** num_dau des dossiers de la demande satisfaits APRÈS la génération de sa relance vivante — sert à NOMMER le refus (obsolète). */
async function nommerDossiersSatisfaitsDepuis(demandeId: number): Promise<string[]> {
  const { rows } = await query<{ num_dau: string }>(
    `SELECT s.num_dau
       FROM demande_relance rl
       JOIN demande_dossier dd ON dd.demande_id = rl.demande_id
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE rl.demande_id = $1 AND rl.type = 'relance' AND rl.statut <> 'abandonnee'
        AND dd.satisfait_le IS NOT NULL AND dd.satisfait_le > rl.generee_le
      ORDER BY s.num_dau`, [demandeId]);
  return rows.map((r) => r.num_dau);
}

/**
 * Point d'entrée. `appliquer:false` (défaut) = SIMULATION : jsonTransport (aucune connexion, aucun octet), écritures en
 * transaction ROLLBACK (rien persisté). `appliquer:true` = envoi RÉEL : chaque relance dans SA transaction (tout-ou-rien),
 * via le compte SMTP de SON profil. AUCUN branchement dans executerVeille : ce point d'entrée est manuel (CLI).
 */
export async function envoyerRelances(opts: { appliquer?: boolean; auteur?: string | null } = {}): Promise<RapportEnvoiRelance> {
  const appliquer = opts.appliquer === true;
  const auteur = opts.auteur ?? null;
  const config = await chargerConfigVeille();

  const adresses = await lireAdressesExpedition();
  const comptes: Record<string, CompteSmtp | null> = {
    entreprise: lireCompteSmtp(INFIXE_SMTP.entreprise),
    personne: lireCompteSmtp(INFIXE_SMTP.personne),
  };
  const comptesPresents: Record<string, boolean> = { entreprise: comptes.entreprise !== null, personne: comptes.personne !== null };

  const candidats = await lireCandidatsRelance();
  // Garde-fou « brouillon obsolète » : dossiersSatisfaitsDepuisRelance (booléen, RÉUTILISÉ) décide ; on nomme les dossiers pour le refus.
  const obsoletes = new Map<number, string[]>();
  for (const r of candidats) {
    if (await dossiersSatisfaitsDepuisRelance(r.demandeId)) obsoletes.set(r.demandeId, await nommerDossiersSatisfaitsDepuis(r.demandeId));
  }
  // H — RE-DÉRIVATION À L'ENVOI : la variante enregistrée d'un brouillon ne correspond plus à la fenêtre du jour → bloquée obsolète.
  const reglagesCascade: ReglagesCascade = { rappelJoursAvant: config.relanceRappelJoursAvant, avisJoursAvant: config.relanceAvisJoursAvant, saisineDelaiJours: config.relanceSaisineDelaiJours };
  const maintenant = new Date();
  const desalignees = new Map<number, string>();
  for (const r of candidats) {
    const m = motifDesalignement(r.variante, r.envoyeLe, maintenant, reglagesCascade);
    if (m !== null) desalignees.set(r.relanceId, m);
  }
  const plan = planifierRelances(candidats, adresses, comptesPresents, obsoletes, desalignees);

  const emisAujourdhui = await compterEmisAujourdhui(); // PARTAGÉ avec les demandes (même table, même compteur)
  const budget = capBatch(plan.envoyables.length, config.envoisMaxParRun, config.envoisMaxParJour, emisAujourdhui);
  const aTraiter = plan.envoyables.slice(0, budget);
  const base = {
    candidats: candidats.length, emisAujourdhui, capParRun: config.envoisMaxParRun, capParJour: config.envoisMaxParJour, budget,
    bloqueesCorps: plan.bloqueesCorps, bloqueesCompte: plan.bloqueesCompte, bloqueesObsoletes: plan.bloqueesObsoletes,
    destinataires: aTraiter.map((r) => ({ reference: r.reference, commune: r.communeNom, email: r.destEmail, expediteur: r.expediteur, apercuCorps: apercu(r.corps) })),
  };
  const resultats: ResultatRelance[] = [];
  const octets = (): number => octetsDe(aTraiter.filter((r) => resultats.find((x) => x.relanceId === r.relanceId)?.issue === 'envoye'), appliquer);

  if (!appliquer) {
    const t = nodemailer.createTransport({ jsonTransport: true }) as unknown as Transport;
    try {
      await withTransaction(async (tx) => {
        const q = brancher(tx);
        for (const r of aTraiter) resultats.push(await emettreUneRelance(t, q, r, { from: r.expediteur, replyTo: r.expediteur, auteur }));
        throw SENTINELLE_DRYRUN; // rien n'est persisté
      });
    } catch (e) { if (e !== SENTINELLE_DRYRUN) throw e; }
    return { mode: 'simulation', ...base, resultats, octetsPartis: octets() }; // = 0 (appliquer=false)
  }

  for (const r of aTraiter) {
    const t = obtenirTransporteur(comptes[r.profil]!) as unknown as Transport; // non-null : planifierSalve a écarté les profils sans compte
    resultats.push(await withTransaction(async (tx) => emettreUneRelance(t, brancher(tx), r, { from: r.expediteur, replyTo: r.expediteur, auteur })));
  }
  return { mode: 'applique', ...base, resultats, octetsPartis: octets() };
}
