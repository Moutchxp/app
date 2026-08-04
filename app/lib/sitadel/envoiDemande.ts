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
import { lireConfigEmail, obtenirTransporteur, envoyerDemande } from '../email';
import { chargerConfigVeille } from './veilleConfig';
import type { Requete } from './mairieContact';

// ── Helpers PURS (testables) ─────────────────────────────────────────────────

/** Taille effective d'une salve : min(candidats, cap/run, reste du jour). Jamais négative. */
export function capBatch(nbCandidats: number, capParRun: number, capParJour: number, emisAujourdhui: number): number {
  return Math.max(0, Math.min(nbCandidats, capParRun, capParJour - emisAujourdhui));
}

/** Motif de refus d'un envoi RÉEL (garde-fous), ou `null` si tout est en place. Le send refuse tant qu'il y a un motif. */
export function problemeEnvoi(adresseReponse: string, smtpPresent: boolean): string | null {
  if ((adresseReponse ?? '').trim() === '') return 'adresse de réponse non configurée (Réglages → « Adresse de réponse des mairies ») : une demande sans reply-to est sans réponse possible';
  if (!smtpPresent) return 'configuration SMTP absente (variables d’environnement SMTP_*/MAIL_FROM)';
  return null;
}

/** Classe une erreur d'émission : un 5xx SMTP (échec PERMANENT) = 'rebond' ; sinon 'echec' (transitoire/technique). */
export function classerErreurSmtp(err: unknown): 'rebond' | 'echec' {
  const code = (err as { responseCode?: unknown })?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600 ? 'rebond' : 'echec';
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface DemandeAEnvoyer { id: number; reference: string; communeNom: string | null; destEmail: string; objet: string; corps: string; }
export type IssueEmission = 'envoye' | 'rebond' | 'echec';
export interface ResultatDemande { id: number; reference: string; issue: IssueEmission; messageId?: string; motif?: string; }

interface Transport { sendMail: (m: Record<string, unknown>) => Promise<{ messageId?: string; response?: string }>; }

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
  mode: 'simulation' | 'applique' | 'refuse';
  probleme: string | null;      // motif de garde-fou (bloque le réel ; informatif en simulation)
  candidats: number;            // demandes 'prete' e-mail adressables
  emisAujourdhui: number;       // émissions déjà faites aujourd'hui (compte du plafond/jour)
  capParRun: number; capParJour: number;
  budget: number;               // taille de salve autorisée = min(candidats, cap/run, reste du jour)
  destinataires: { reference: string; commune: string | null; email: string; apercuCorps: string }[];
  resultats: ResultatDemande[];
  octetsPartis: number;         // toujours 0 en simulation
}

const brancher = (tx: RequeteTx): Requete =>
  (<R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>);
const SENTINELLE_DRYRUN = new Error('__DRY_RUN_ROLLBACK__');
const apercu = (corps: string): string => { const l = corps.replace(/\s+/g, ' ').trim(); return l.length > 120 ? l.slice(0, 120) + '…' : l; };

async function lireCandidats(): Promise<DemandeAEnvoyer[]> {
  const { rows } = await query<{ id: number; reference: string; commune_nom: string | null; dest_email: string; objet: string | null; corps: string | null }>(
    `SELECT d.id::int AS id, d.reference, c.nom AS commune_nom, d.dest_email, d.objet, d.corps
       FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE d.statut = 'prete' AND d.dest_canal = 'email' AND coalesce(btrim(d.dest_email), '') <> ''
      ORDER BY d.cree_le ASC`);
  return rows.map((r) => ({ id: r.id, reference: r.reference, communeNom: r.commune_nom, destEmail: r.dest_email, objet: r.objet ?? '', corps: r.corps ?? '' }));
}

/** Nombre d'ÉMISSIONS e-mail confirmées AUJOURD'HUI (compteur du plafond/jour — pas les demandes créées). */
async function compterEmisAujourdhui(): Promise<number> {
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
  const smtp = lireConfigEmail();
  const probleme = problemeEnvoi(config.adresseReponse, smtp !== null);

  const candidats = await lireCandidats();
  const emisAujourdhui = await compterEmisAujourdhui();
  const budget = capBatch(candidats.length, config.envoisMaxParRun, config.envoisMaxParJour, emisAujourdhui);
  const aTraiter = candidats.slice(0, budget);
  const base = {
    probleme, candidats: candidats.length, emisAujourdhui, capParRun: config.envoisMaxParRun, capParJour: config.envoisMaxParJour, budget,
    destinataires: aTraiter.map((d) => ({ reference: d.reference, commune: d.communeNom, email: d.destEmail, apercuCorps: apercu(d.corps) })),
  };

  // Envoi RÉEL : refus dur si un garde-fou manque (aucun octet ne part).
  if (appliquer && probleme !== null) {
    return { mode: 'refuse', ...base, resultats: [], octetsPartis: 0 };
  }

  const from = smtp?.from ?? '(alias non configuré)';
  const replyTo = config.adresseReponse;
  const resultats: ResultatDemande[] = [];

  if (!appliquer) {
    // SIMULATION : jsonTransport (aucun octet) + écritures ROLLBACK.
    const t = nodemailer.createTransport({ jsonTransport: true }) as unknown as Transport;
    try {
      await withTransaction(async (tx) => {
        const q = brancher(tx);
        for (const d of aTraiter) resultats.push(await emettreUneDemande(t, q, d, { from, replyTo, auteur }));
        throw SENTINELLE_DRYRUN; // rien n'est persisté
      });
    } catch (e) { if (e !== SENTINELLE_DRYRUN) throw e; }
    return { mode: 'simulation', ...base, resultats, octetsPartis: 0 };
  }

  // Envoi RÉEL : chaque demande dans SA transaction (tout-ou-rien par demande).
  const t = obtenirTransporteur(smtp!) as unknown as Transport;
  for (const d of aTraiter) {
    resultats.push(await withTransaction(async (tx) => emettreUneDemande(t, brancher(tx), d, { from, replyTo, auteur })));
  }
  return { mode: 'applique', ...base, resultats, octetsPartis: 0 };
}
