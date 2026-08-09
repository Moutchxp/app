/**
 * Chemin d'ENVOI e-mail des demandes CRPA (chantier S38). SIMULATION PAR DÉFAUT — l'envoi réel exige `appliquer: true`
 * (motif S29). Ne réutilise QUE le transport nodemailer (`envoyerDemande`) ; l'envoi de certificat n'est jamais touché.
 *
 * GARDE-FOUS (tous obligatoires avant le 1er envoi réel) : adresse de réponse renseignée · SMTP configuré · cap par run ·
 * cap par jour (compté sur les ÉMISSIONS du jour, pas les demandes créées) · confirmation explicite (`--appliquer`) ·
 * tout-ou-rien PAR DEMANDE (chaque demande dans SA transaction) · journalisé. Le statut passe à 'envoyee' UNIQUEMENT si
 * l'émission est confirmée par le fournisseur (messageId capturé) ; un échec/rebond laisse la demande 'prete' (réémettable)
 * et ne consomme pas le plafond par commune.
 */
// (pas d'`import 'server-only'` : ce module est importé par le CLI `demandes-envoyer.ts` — sa nature serveur est déjà
//  garantie par ses dépendances db/client + nodemailer, qui ne compilent pas côté client.)
import nodemailer from 'nodemailer';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { lireCompteSmtp, obtenirTransporteur, envoyerDemande, type CompteSmtp } from '../email';
import { chargerConfigVeille } from './veilleConfig';
import { problemeCorpsDemande, profilValide, ETIQUETTE_PROFIL, type ProfilDemandeur } from './demande';
import type { Requete } from './mairieContact';

// Compte SMTP à utiliser PAR PROFIL (S43) : infixe des variables d'env. '' = compte par défaut (SMTP_*, Google Workspace) ;
// 'PERSONNE_' = second compte (SMTP_PERSONNE_*, boîte personnelle). L'adresse d'expédition/réponse, elle, vient de la base
// (config_demandeur.email_contact) — aucune adresse en variable d'env, aucune colonne ajoutée.
// W1 — EXPORTÉ : la sélection du compte SMTP par profil est partagée telle quelle par l'envoi des RELANCES (envoiRelance).
export const INFIXE_SMTP: Record<ProfilDemandeur, string> = { entreprise: '', personne: 'PERSONNE_' };
const varsCompte = (profil: ProfilDemandeur): string => `SMTP_${INFIXE_SMTP[profil]}HOST/PORT/USER/PASS`;

// ── Helpers PURS (testables) ─────────────────────────────────────────────────

/** Taille effective d'une salve : min(candidats, cap/run, reste du jour). Jamais négative. */
export function capBatch(nbCandidats: number, capParRun: number, capParJour: number, emisAujourdhui: number): number {
  return Math.max(0, Math.min(nbCandidats, capParRun, capParJour - emisAujourdhui));
}

/**
 * Motif d'ÉCARTEMENT d'une demande selon SON profil (S43), ou `null` si tout est en place — écarte une demande SANS toucher
 * les autres profils. (1) adresse d'expédition/réponse du profil absente (config_demandeur.email_contact : c'est le `from`
 * ET le `reply-to`, donc sans elle la réponse de la mairie n'a pas de destination) ; (2) compte SMTP du profil non configuré.
 */
export function problemeEnvoi(profil: ProfilDemandeur, adresseExpedition: string, comptePresent: boolean): string | null {
  if ((adresseExpedition ?? '').trim() === '') {
    return `profil « ${ETIQUETTE_PROFIL[profil]} » : adresse d’expédition/réponse absente (Réglages → identité du demandeur, « e-mail de contact ») — sans elle la mairie n’a pas de destination de réponse`;
  }
  if (!comptePresent) {
    return `profil « ${ETIQUETTE_PROFIL[profil]} » : compte SMTP non configuré (variables d’environnement ${varsCompte(profil)})`;
  }
  return null;
}

/** Classe une erreur d'émission : un 5xx SMTP (échec PERMANENT) = 'rebond' ; sinon 'echec' (transitoire/technique). */
export function classerErreurSmtp(err: unknown): 'rebond' | 'echec' {
  const code = (err as { responseCode?: unknown })?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600 ? 'rebond' : 'echec';
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface DemandeAEnvoyer { id: number; reference: string; communeNom: string | null; destEmail: string; objet: string; corps: string; profil: ProfilDemandeur; }
export type IssueEmission = 'envoye' | 'rebond' | 'echec' | 'gabarit';
export interface ResultatDemande { id: number; reference: string; issue: IssueEmission; messageId?: string; motif?: string; }

/**
 * Planifie une salve (PUR, testable) : (1) écarte les corps non exploitables (gabarit) ; (2) écarte, PAR PROFIL, les demandes
 * dont l'adresse d'expédition ou le compte SMTP manque, sans bloquer les autres profils ; (3) attache à chaque envoyable
 * l'`expediteur` (= from = reply-to) qui serait réellement utilisé. `adresses`/`comptesPresents` sont indexés par profil.
 */
export interface PlanSalve<T = DemandeAEnvoyer> {
  bloqueesCorps: { reference: string; motif: string }[];
  bloqueesCompte: { reference: string; motif: string }[];
  envoyables: (T & { expediteur: string })[];
}
// W1 — GÉNÉRIQUE : tout candidat exposant reference/objet/corps/profil (demande OU relance). Corps du même comportement
// qu'avant pour les demandes (T = DemandeAEnvoyer) → non-régression prouvée par les tests S38/S43 existants.
export function planifierSalve<T extends { reference: string; objet: string; corps: string; profil: ProfilDemandeur }>(
  candidats: T[], adresses: Record<string, string>, comptesPresents: Record<string, boolean>,
): PlanSalve<T> {
  const bloqueesCorps: { reference: string; motif: string }[] = [];
  const bloqueesCompte: { reference: string; motif: string }[] = [];
  const envoyables: (T & { expediteur: string })[] = [];
  for (const d of candidats) {
    const gab = problemeCorpsDemande(d.objet, d.corps);
    if (gab !== null) { bloqueesCorps.push({ reference: d.reference, motif: gab }); continue; }
    const adresse = (adresses[d.profil] ?? '').trim();
    const motif = problemeEnvoi(d.profil, adresse, comptesPresents[d.profil] === true);
    if (motif !== null) { bloqueesCompte.push({ reference: d.reference, motif }); continue; }
    envoyables.push({ ...d, expediteur: adresse });
  }
  return { bloqueesCorps, bloqueesCompte, envoyables };
}

export interface Transport { sendMail: (m: Record<string, unknown>) => Promise<{ messageId?: string; response?: string }>; }

const SQL_INSERT_ACHEMINEMENT =
  `INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le, message_id, retour_fournisseur, rebond_le, rebond_motif, derniere_erreur, maj_a)
   VALUES ($1, 'email', $2, $3, $4, $5, $6, $7, $8, now())`;

/**
 * Émet UNE demande via le transport injecté et écrit sa trace via `q` (le q d'une transaction fournie par l'appelant :
 * COMMIT pour un envoi réel, ROLLBACK pour la simulation). Succès (messageId capturé) → demande_acheminement 'envoye' +
 * demande.statut='envoyee' (garde `AND statut='prete'`) + journal. Échec/rebond → demande_acheminement 'echec'/'rebond',
 * la demande RESTE 'prete' (réémettable, plafond non consommé). Testable : transport + q injectés.
 */
export async function emettreUneDemande(
  transport: Transport, q: Requete, d: DemandeAEnvoyer, opts: { from: string; replyTo: string; auteur: string | null },
): Promise<ResultatDemande> {
  // S39 (A) — GARDE-FOU DE CORPS : un corps figé encore truffé de gabarits ne part JAMAIS. Aucune émission, aucune écriture.
  // S'applique en simulation ET en réel (le garde-fou est ici, pas contournable). Le message nomme les champs manquants.
  const gab = problemeCorpsDemande(d.objet, d.corps);
  if (gab !== null) return { id: d.id, reference: d.reference, issue: 'gabarit', motif: gab };
  try {
    const emission = await envoyerDemande(transport as never, opts.from, { to: d.destEmail, replyTo: opts.replyTo, objet: d.objet, corps: d.corps });
    await q(SQL_INSERT_ACHEMINEMENT, [d.id, 'envoye', new Date(), emission.messageId, emission.retourFournisseur, null, null, null]);
    // 'envoyee' UNIQUEMENT après émission confirmée (garde AND statut='prete' → jamais deux fois).
    await q(`UPDATE demande SET statut = 'envoyee', maj_le = now() WHERE id = $1 AND statut = 'prete'`, [d.id]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, 'prete', 'envoyee', $2, $3)`,
      [d.id, `envoi e-mail (messageId ${emission.messageId})`, opts.auteur]);
    return { id: d.id, reference: d.reference, issue: 'envoye', messageId: emission.messageId };
  } catch (err) {
    const issue = classerErreurSmtp(err);
    const nom = (err as Error)?.name ?? 'Error';
    await q(SQL_INSERT_ACHEMINEMENT, [d.id, issue, null, null, null, issue === 'rebond' ? new Date() : null, issue === 'rebond' ? nom : null, nom]);
    // la demande RESTE 'prete' : ni statut 'envoyee', ni consommation du plafond.
    return { id: d.id, reference: d.reference, issue, motif: nom };
  }
}

// ── Orchestration (I/O réelle) ───────────────────────────────────────────────
export interface RapportEnvoi {
  mode: 'simulation' | 'applique';
  candidats: number;            // demandes 'prete' e-mail adressables
  emisAujourdhui: number;       // émissions déjà faites aujourd'hui (compte du plafond/jour)
  capParRun: number; capParJour: number;
  budget: number;               // taille de salve autorisée = min(envoyables, cap/run, reste du jour)
  bloqueesCorps: { reference: string; motif: string }[];   // S39 : écartées — corps non exploitable (gabarit)
  bloqueesCompte: { reference: string; motif: string }[];  // S43 : écartées — adresse/compte d'envoi du profil non configuré
  destinataires: { reference: string; commune: string | null; email: string; expediteur: string; apercuCorps: string }[];
  resultats: ResultatDemande[];
  octetsPartis: number;         // toujours 0 en simulation
}

const brancher = (tx: RequeteTx): Requete =>
  (<R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>);
const SENTINELLE_DRYRUN = new Error('__DRY_RUN_ROLLBACK__');
export const apercu = (corps: string): string => { const l = corps.replace(/\s+/g, ' ').trim(); return l.length > 120 ? l.slice(0, 120) + '…' : l; };

async function lireCandidats(): Promise<DemandeAEnvoyer[]> {
  const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; dest_email: string; objet: string | null; corps: string | null; profil: string }>(
    `SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.dest_email, d.objet, d.corps, d.profil_demandeur AS profil
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE d.statut = 'prete' AND d.dest_canal = 'email' AND coalesce(btrim(d.dest_email), '') <> ''
      ORDER BY d.cree_le ASC`);
  return rows.map((r) => ({ id: r.id, reference: r.reference, communeNom: r.commune_nom, destEmail: r.dest_email, objet: r.objet ?? '', corps: r.corps ?? '', profil: profilValide(r.profil) }));
}

/** Adresse d'expédition/réponse PAR PROFIL = config_demandeur.email_contact (déjà ventilé par profil ; aucune colonne ajoutée).
 *  W1 — EXPORTÉ : partagé tel quel par l'envoi des relances (même identité d'expédition par profil). */
export async function lireAdressesExpedition(): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  try {
    const { rows } = await query<{ profil: string; email_contact: string }>(`SELECT profil, email_contact FROM config_demandeur`);
    for (const r of rows) m[r.profil] = (r.email_contact ?? '').trim();
  } catch { /* table absente → adresses vides → demandes écartées avec motif nommé (jamais un envoi sans adresse) */ }
  return m;
}

/** Nombre d'ÉMISSIONS e-mail confirmées AUJOURD'HUI (compteur du plafond/jour — pas les demandes créées).
 *  W1 — EXPORTÉ : compte TOUTES les lignes 'envoye' du jour (demandes ET relances écrivent ce même canal 'email') → le
 *  budget d'envoi quotidien est PARTAGÉ entre demandes et relances, sans filtre relance_id. */
export async function compterEmisAujourdhui(): Promise<number> {
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM demande_acheminement WHERE canal = 'email' AND statut = 'envoye' AND envoye_le::date = CURRENT_DATE`);
    return rows[0]?.n ?? 0;
  } catch { return 0; }
}

/**
 * Point d'entrée. `appliquer:false` (défaut) = SIMULATION : transport jsonTransport (aucune connexion, aucun octet), toutes
 * les écritures dans UNE transaction ROLLBACK (rien persisté). `appliquer:true` = envoi RÉEL : refuse si un garde-fou manque,
 * sinon émet la salve bornée par les caps, CHAQUE demande dans SA transaction (tout-ou-rien par demande).
 */
export async function envoyerDemandes(opts: { appliquer?: boolean; auteur?: string | null } = {}): Promise<RapportEnvoi> {
  const appliquer = opts.appliquer === true;
  const auteur = opts.auteur ?? null;
  const config = await chargerConfigVeille();

  // Résolution PAR PROFIL : adresse d'expédition/réponse (base) + présence du compte SMTP (env). Le from ET le reply-to
  // d'une demande valent l'adresse de SON profil ; son transport est le compte SMTP de SON profil.
  const adresses = await lireAdressesExpedition();
  const comptes: Record<string, CompteSmtp | null> = {
    entreprise: lireCompteSmtp(INFIXE_SMTP.entreprise),
    personne: lireCompteSmtp(INFIXE_SMTP.personne),
  };
  const comptesPresents: Record<string, boolean> = { entreprise: comptes.entreprise !== null, personne: comptes.personne !== null };

  const candidats = await lireCandidats();
  const plan = planifierSalve(candidats, adresses, comptesPresents);

  const emisAujourdhui = await compterEmisAujourdhui();
  const budget = capBatch(plan.envoyables.length, config.envoisMaxParRun, config.envoisMaxParJour, emisAujourdhui);
  const aTraiter = plan.envoyables.slice(0, budget);
  const base = {
    candidats: candidats.length, emisAujourdhui, capParRun: config.envoisMaxParRun, capParJour: config.envoisMaxParJour, budget,
    bloqueesCorps: plan.bloqueesCorps, bloqueesCompte: plan.bloqueesCompte,
    destinataires: aTraiter.map((d) => ({ reference: d.reference, commune: d.communeNom, email: d.destEmail, expediteur: d.expediteur, apercuCorps: apercu(d.corps) })),
  };
  const resultats: ResultatDemande[] = [];

  if (!appliquer) {
    // SIMULATION : jsonTransport (aucun octet) + écritures ROLLBACK. Le from/reply-to par profil est calculé et affiché.
    const t = nodemailer.createTransport({ jsonTransport: true }) as unknown as Transport;
    try {
      await withTransaction(async (tx) => {
        const q = brancher(tx);
        for (const d of aTraiter) resultats.push(await emettreUneDemande(t, q, d, { from: d.expediteur, replyTo: d.expediteur, auteur }));
        throw SENTINELLE_DRYRUN; // rien n'est persisté
      });
    } catch (e) { if (e !== SENTINELLE_DRYRUN) throw e; }
    return { mode: 'simulation', ...base, resultats, octetsPartis: 0 };
  }

  // Envoi RÉEL : chaque demande via LE transport de SON profil (cache par compte), dans SA transaction (tout-ou-rien).
  for (const d of aTraiter) {
    const t = obtenirTransporteur(comptes[d.profil]!) as unknown as Transport; // non-null : planifierSalve a écarté les profils sans compte
    resultats.push(await withTransaction(async (tx) => emettreUneDemande(t, brancher(tx), d, { from: d.expediteur, replyTo: d.expediteur, auteur })));
  }
  return { mode: 'applique', ...base, resultats, octetsPartis: 0 };
}
