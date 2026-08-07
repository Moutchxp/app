/**
 * ORCHESTRATION de la relève des réponses CRPA (chantier R3). Testable par INJECTION : la fonction reçoit un `ClientBoite`
 * en paramètre ; la vraie implémentation IMAP (imapflow/mailparser) vit dans app/lib/email/imap.ts (seul endroit important
 * ces paquets). Ici : lecture base (candidates + date de départ + Message-ID déjà connus), application de rattacherReponse
 * / estAccuseDeRebond (R2), préparation des lignes, et — en mode --appliquer seulement — écriture via enregistrerReponse.
 *
 * ⚠️ N'écrit JAMAIS demande.statut ('close' reste sans écrivain, chantier R5). La SEULE écriture hors demande_reponse est
 * le passage d'une ligne demande_acheminement 'envoye' → 'rebond' quand un rebond est CERTAINEMENT rattaché.
 * ⚠️ La boîte est ouverte en LECTURE STRICTE (voir imap.ts) : aucun flag, aucun déplacement, aucune suppression.
 */
import { query } from '../db/client';
import { enregistrerReponse, type ProfilBoite, type RattachementMethode, type ReponseEntrante } from './demandeReponseRepo';
import { rattacherReponse, estAccuseDeRebond, type MessageEntrant, type DemandeCandidate } from './rattachementReponse';

/** Métadonnées d'une pièce jointe entrante (le contenu/dépôt est le chantier R4). */
export interface PieceMeta { nomFichier: string; typeMime: string | null; tailleOctets: number | null }

/** Un message relevé, prêt pour le rattachement (message brut R2) + les métadonnées d'enregistrement. */
export interface MessageBoite {
  uid: number;
  message: MessageEntrant;
  recuLe: Date;
  deNom: string | null;
  pieces: PieceMeta[];
}

/** Contrat minimal d'accès à la boîte (implémenté par imap.ts, faussé dans les tests). Ouverture en LECTURE SEULE. */
export interface ClientBoite {
  ouvrir(): Promise<void>;
  chercherDepuis(depuis: Date): Promise<number[]>;
  telechargerMessage(uid: number): Promise<MessageBoite>;
  fermer(): Promise<void>;
}

export interface LigneReleve {
  messageId: string;
  demandeId: number | null;
  methode: RattachementMethode;
  rebond: boolean;
  motif: string;
  deAdresse: string;
  objet: string | null;
  nbPieces: number;
}

export interface RapportReleve {
  mode: 'simulation' | 'applique';
  profil: ProfilBoite;
  connecte: boolean;             // false si aucune demande envoyée (pas de connexion)
  depuis: string | null;        // date de départ (ISO), ou null
  vus: number;                  // messages téléchargés dans la fenêtre (après plafond)
  dejaConnus: number;           // ignorés car Message-ID déjà en base
  rattaches: number;            // demande_id résolue
  nonRattaches: number;
  rebondsDetectes: number;
  rebondsAppliques: number;     // lignes d'acheminement passées à 'rebond' (0 en simulation)
  ecrites: number;              // enregistrerReponse ayant réellement inséré (0 en simulation)
  parMethode: Record<string, number>;
  lignes: LigneReleve[];        // ce qui a été (ou serait) écrit
}

export interface OptionsReleve {
  client: ClientBoite;
  profil: ProfilBoite;
  depuis?: Date;         // override (tests) ; sinon calculé = min(envoye_le des envoyées) − 1 j
  plafond?: number;      // défaut 200
  appliquer?: boolean;   // défaut false (simulation : aucune écriture)
}

const estMethodeCertaine = (m: RattachementMethode): boolean =>
  m === 'message_id' || m === 'reference_objet' || m === 'reference_corps';

function motifRebond(mb: MessageBoite): string {
  const src = (mb.message.objet ?? mb.message.corpsTexte ?? '').replace(/\s+/g, ' ').trim();
  if (src === '') return 'rebond détecté';
  return src.length > 300 ? `${src.slice(0, 300)}…` : src;
}

/** Candidates = demandes 'envoyee' du profil, avec les Message-ID de leurs envois e-mail (demande_acheminement). */
async function lireCandidates(profil: ProfilBoite): Promise<DemandeCandidate[]> {
  const { rows } = await query<{ id: number; reference: string; message_ids: string[] }>(
    `SELECT d.id::int AS id, d.reference,
            coalesce(array_agg(a.message_id) FILTER (WHERE a.message_id IS NOT NULL), '{}') AS message_ids
       FROM demande d
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
      GROUP BY d.id, d.reference`,
    [profil],
  );
  return rows.map((r) => ({ id: r.id, reference: r.reference, profilBoite: profil, statut: 'envoyee', messageIdsEmis: r.message_ids }));
}

/** Date de départ = la plus ancienne envoye_le des demandes envoyées du profil, moins 1 jour. `null` si aucune. */
async function dateDepart(profil: ProfilBoite): Promise<Date | null> {
  const { rows } = await query<{ depuis: Date | null }>(
    `SELECT (min(a.envoye_le) - interval '1 day') AS depuis
       FROM demande d JOIN demande_acheminement a ON a.demande_id = d.id
      WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1 AND a.canal = 'email' AND a.envoye_le IS NOT NULL`,
    [profil],
  );
  return rows[0]?.depuis ?? null;
}

/** Ensemble des Message-ID déjà enregistrés pour ce profil (dédoublonnage AVANT écriture). */
async function messageIdsConnus(profil: ProfilBoite): Promise<Set<string>> {
  const { rows } = await query<{ message_id: string }>(`SELECT message_id FROM demande_reponse WHERE profil_boite = $1`, [profil]);
  return new Set(rows.map((r) => r.message_id));
}

/** Passe à 'rebond' les acheminements e-mail encore 'envoye' d'une demande. Seule écriture hors demande_reponse. */
async function marquerRebond(demandeId: number, motif: string): Promise<number> {
  const res = await query(
    `UPDATE demande_acheminement
        SET statut = 'rebond', rebond_le = now(), rebond_motif = $2, maj_a = now()
      WHERE demande_id = $1 AND statut = 'envoye' AND canal = 'email'`,
    [demandeId, motif],
  );
  return res.rowCount ?? 0;
}

/**
 * Relève la boîte du profil et rattache chaque message. Voir l'en-tête du fichier pour les invariants (lecture stricte,
 * jamais demande.statut). `appliquer=false` (défaut) = simulation : rien n'est écrit, le rapport dit ce qui SERAIT écrit.
 */
export async function releverBoite(opts: OptionsReleve): Promise<RapportReleve> {
  const appliquer = opts.appliquer === true;
  const plafond = opts.plafond ?? 200;
  const mode: 'simulation' | 'applique' = appliquer ? 'applique' : 'simulation';

  const candidates = await lireCandidates(opts.profil);
  const depuis = opts.depuis ?? (await dateDepart(opts.profil));
  if (depuis === null) {
    // Aucune demande envoyée → on ne se connecte MÊME PAS.
    return { mode, profil: opts.profil, connecte: false, depuis: null, vus: 0, dejaConnus: 0, rattaches: 0, nonRattaches: 0, rebondsDetectes: 0, rebondsAppliques: 0, ecrites: 0, parMethode: {}, lignes: [] };
  }

  const connus = await messageIdsConnus(opts.profil);
  const lignes: LigneReleve[] = [];
  const parMethode: Record<string, number> = {};
  let vus = 0, dejaConnus = 0, rattaches = 0, nonRattaches = 0, rebondsDetectes = 0, rebondsAppliques = 0, ecrites = 0;

  await opts.client.ouvrir();
  try {
    const uidsTous = await opts.client.chercherDepuis(depuis);
    const uids = uidsTous.slice(-plafond); // plafond : on garde les plus récents
    for (const uid of uids) {
      vus += 1;
      const mb = await opts.client.telechargerMessage(uid);
      const mid = mb.message.messageId.trim();
      if (mid === '' || connus.has(mid)) { dejaConnus += 1; continue; }
      connus.add(mid); // évite un doublon au sein de la même relève

      const r = rattacherReponse(mb.message, candidates);
      const rebond = estAccuseDeRebond(mb.message);
      if (r.demandeId !== null) rattaches += 1; else nonRattaches += 1;
      parMethode[r.methode] = (parMethode[r.methode] ?? 0) + 1;
      if (rebond) rebondsDetectes += 1;

      lignes.push({ messageId: mid, demandeId: r.demandeId, methode: r.methode, rebond, motif: r.motif, deAdresse: mb.message.deAdresse, objet: mb.message.objet ?? null, nbPieces: mb.pieces.length });

      if (appliquer) {
        const ligne: ReponseEntrante = {
          demandeId: r.demandeId, profilBoite: opts.profil, messageId: mid,
          inReplyTo: mb.message.inReplyTo ?? null,
          referencesBrut: mb.message.references && mb.message.references.length > 0 ? mb.message.references.join(' ') : null,
          deAdresse: mb.message.deAdresse, deNom: mb.deNom, objet: mb.message.objet ?? null,
          recuLe: mb.recuLe, corpsTexte: mb.message.corpsTexte ?? null,
          rattachementMethode: r.methode, rattacheLe: r.demandeId !== null ? mb.recuLe : null, note: r.motif,
          pieces: mb.pieces.map((p) => ({ nomFichier: p.nomFichier, typeMime: p.typeMime, tailleOctets: p.tailleOctets, cleStockage: null, empreinteSha256: null, stockeLe: null, motifNonStocke: 'dépôt non implémenté' })),
        };
        const id = await enregistrerReponse(ligne);
        if (id !== null) ecrites += 1;
        if (rebond && r.demandeId !== null && estMethodeCertaine(r.methode)) {
          rebondsAppliques += await marquerRebond(r.demandeId, motifRebond(mb));
        }
      }
    }
  } finally {
    await opts.client.fermer();
  }

  return { mode, profil: opts.profil, connecte: true, depuis: depuis.toISOString(), vus, dejaConnus, rattaches, nonRattaches, rebondsDetectes, rebondsAppliques, ecrites, parMethode, lignes };
}
