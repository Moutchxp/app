/**
 * MODULE « GESTION » — LOT 3 : les I/O RÉELLES de la capture (base, boîte, stockage objet). C'est le seul fichier du
 * module qui écrit. L'orchestration, elle, est PURE et vit dans `capture.ts`.
 *
 * 🔒 LECTURE STRICTE DE LA BOÎTE : on n'appelle que `creerClientApprofondi` (imap.ts, NON modifié), qui ouvre n'importe
 * quel dossier en `readOnly` (EXAMINE) — aucun flag posé, rien de déplacé, rien de supprimé.
 * 🔒 ÉCRITURES BORNÉES AUX TABLES `gestion_*` : aucune table du module Permis n'est touchée, `releve_run` moins que tout
 * (y poser une ligne ferait avancer le curseur de la relève des permis, qui sauterait alors des messages en silence).
 */
import type { PoolClient } from 'pg';
import { pool, query, withTransaction } from '../db/client';
import { chargerConfigGestion, type ConfigGestion } from './config';
import type { DepsCapture, MessageAEcrire, MessageBrut, PieceBrute, FilResolu } from './capture';
import type { RegleExclusion } from './regles';
import { destinatairesDe } from './typologie';
import { CLE_VERROU_GESTION } from './verrou';

/** Règles ACTIVES, par identifiant croissant : ordre DÉTERMINISTE → deux relèves du même message produisent la même trace. */
export async function lireReglesActives(): Promise<RegleExclusion[]> {
  const { rows } = await query<{ id: number; type: string; valeur: string; sens: string; motif: string }>(
    `SELECT id::int AS id, type, valeur, sens, motif FROM gestion_regle_exclusion WHERE actif ORDER BY id`);
  return rows.map((r) => ({
    id: r.id, valeur: r.valeur, motif: r.motif,
    type: r.type as RegleExclusion['type'], sens: r.sens as RegleExclusion['sens'],
  }));
}

/** Tous les Message-ID déjà en base. Le dédoublonnage est ainsi gratuit, et toute reprise de rattrapage sans danger. */
export async function lireConnus(): Promise<Set<string>> {
  const { rows } = await query<{ message_id: string }>(`SELECT message_id FROM gestion_message`);
  return new Set(rows.map((r) => r.message_id));
}

/**
 * Les DEUX repères de la fenêtre (cf. `fenetreDepuis`) :
 *   · `curseurComplet` = fin de la dernière passe RÉUSSIE ET COMPLÈTE. `plafond_atteint IS NOT TRUE` est essentiel : une
 *     passe tronquée a délibérément laissé des messages de côté, elle n'a donc rien « certifié vu » ;
 *   · `dernierCapture` = date du message le plus récent déjà capturé — c'est LUI qui fait avancer un rattrapage dont les
 *     passes sont tronquées, puisque le curseur, lui, reste gelé exprès.
 */
export async function lireBornes(): Promise<{ curseurComplet: Date | null; dernierCapture: Date | null }> {
  const { rows: c } = await query<{ t: Date | null }>(
    `SELECT max(termine_le) AS t FROM gestion_releve_run WHERE resultat = 'ok' AND plafond_atteint IS NOT TRUE`);
  const { rows: d } = await query<{ t: Date | null }>(`SELECT max(recu_le) AS t FROM gestion_message`);
  return { curseurComplet: c[0]?.t ?? null, dernierCapture: d[0]?.t ?? null };
}

/**
 * RÉSOUT le fil d'un message : celui qui porte déjà l'un de ses identifiants, sinon un fil neuf.
 *
 * ⚠️ POURQUOI UNE COMPARAISON SANS INDEX (`lower(btrim(message_id,'<>'))`) — et pourquoi c'est le bon choix ici : la table
 * restera petite (~5 500 messages après le rattrapage de 90 jours, ~22 000 par an). Un balayage de quelques milliers de
 * lignes se compte en millisecondes, et il est EXACT, là où une comparaison sur la forme brute laisserait passer un
 * chevron ou une casse de domaine et couperait un échange en deux lignes — le défaut qu'on veut justement éviter. Le jour
 * où le volume changerait d'ordre de grandeur, une colonne normalisée indexée se posera par simple ADD COLUMN.
 *
 * FUSION : si plusieurs fils partagent les identifiants de ce message, il les RELIE. Le survivant est celui qui porte une
 * affectation active (on ne déplace jamais un échange déjà rattaché à une carte), sinon le plus ancien. Les messages des
 * autres sont déplacés, et le fait est JOURNALISÉ — c'est un événement qu'aucune donnée ne raconterait autrement. Les fils
 * vidés RESTENT en base : on ne supprime pas, et un fil sans message n'apparaît de toute façon nulle part.
 */
export async function resoudreFil(identifiants: string[], cleRacine: string, objet: string | null): Promise<FilResolu> {
  return withTransaction(async (q) => {
    const { rows: candidats } = await q<{ id: number }>(
      `SELECT f.id::int AS id FROM gestion_fil f WHERE lower(f.cle) = ANY($1)
       UNION
       SELECT DISTINCT m.fil_id::int AS id FROM gestion_message m WHERE lower(btrim(m.message_id, '<>')) = ANY($1)
       ORDER BY id`,
      [identifiants],
    );

    if (candidats.length === 0) {
      const { rows } = await q<{ id: number }>(
        `INSERT INTO gestion_fil (cle, objet_initial) VALUES ($1, $2)
         ON CONFLICT (cle) DO NOTHING RETURNING id::int AS id`, [cleRacine, objet]);
      if (rows[0]) return { filId: rows[0].id, cree: true, fusionnes: 0 };
      // Course : un autre chemin vient de créer ce fil → on le relit plutôt que d'échouer.
      const { rows: relu } = await q<{ id: number }>(`SELECT id::int AS id FROM gestion_fil WHERE cle = $1`, [cleRacine]);
      return { filId: relu[0].id, cree: false, fusionnes: 0 };
    }

    if (candidats.length === 1) return { filId: candidats[0].id, cree: false, fusionnes: 0 };

    // ── FUSION ──
    const ids = candidats.map((c) => c.id);
    const { rows: affectes } = await q<{ fil_id: number }>(
      `SELECT fil_id::int AS fil_id FROM gestion_affectation WHERE actif AND fil_id = ANY($1) ORDER BY fil_id LIMIT 1`, [ids]);
    const survivant = affectes[0]?.fil_id ?? Math.min(...ids);
    const absorbes = ids.filter((i) => i !== survivant);
    await q(`UPDATE gestion_message SET fil_id = $1, maj_le = now() WHERE fil_id = ANY($2)`, [survivant, absorbes]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
       VALUES ('fil', $1, 'fusion_fil', $2, $3, $4, 'automatique')`,
      [survivant, absorbes.join(','), String(survivant),
       `un message relie ${absorbes.length + 1} fils jusque-là séparés ; leurs messages rejoignent le fil ${survivant}`],
    );
    return { filId: survivant, cree: false, fusionnes: absorbes.length };
  });
}

/**
 * ÉCRIT un message. `ON CONFLICT (message_id) DO NOTHING` : deux passes concurrentes ne produisent JAMAIS de doublon —
 * la seconde n'écrit rien et renvoie `null`. Dans la même transaction, un message NON EXCLU qui arrive dans un fil classé
 * « sans suite » le RAMÈNE dans la file (règle d'Arno : rien ne reste écarté pour toujours), et le fait est journalisé —
 * une décision humaine vient d'être défaite par le système, ça ne peut pas rester muet.
 */
export async function ecrireMessage(m: MessageAEcrire, filId: number): Promise<number | null> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_message
         (fil_id, message_id, in_reply_to, references_brut, sens, de_adresse, de_nom, destinataires, nb_destinataires,
          objet, objet_gabarit, recu_le, corps_texte, corps_html, automatique, signaux_automatisme,
          exclu_le, exclu_par_regle_id, exclu_motif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               CASE WHEN $17::bigint IS NULL THEN NULL ELSE now() END, $17::bigint, $18)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id::int AS id`,
      [filId, m.messageId, m.inReplyTo, m.referencesBrut, m.sens, m.deAdresse, m.deNom, m.destinataires, m.nbDestinataires,
       m.objet, m.objetGabarit, m.recuLe, m.corpsTexte, m.corpsHtml, m.automatique, m.signauxAutomatisme,
       m.exclusion?.regleId ?? null, m.exclusion?.motif ?? null],
    );
    if (!rows[0]) return null; // déjà écrit : aucun doublon, aucune erreur

    if (m.exclusion === null) {
      const { rowCount } = await q(
        `UPDATE gestion_fil SET etat = 'a_classer', maj_le = now() WHERE id = $1 AND etat = 'sans_suite'`, [filId]);
      if ((rowCount ?? 0) > 0) {
        await q(
          `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
           VALUES ('fil', $1, 'reprise', 'sans_suite', 'a_classer', $2, 'automatique')`,
          [filId, 'un nouveau message est arrivé dans un échange classé sans suite : il revient dans la file'],
        );
      }
    }
    return rows[0].id;
  });
}

/**
 * DÉPOSE les pièces d'un message sur le stockage objet, puis écrit leurs métadonnées. Trois garanties reprises du module
 * Permis, qui les a éprouvées : le contenu ne va JAMAIS en base (invariant §7) ; une pièce refusée (type hors liste,
 * trop lourde, stockage indisponible) garde sa LIGNE et son MOTIF — jamais perdue en silence, et redéposable si la
 * configuration change ; l'échec d'UNE pièce ne fait pas échouer les autres.
 */
export async function deposerPiecesMessage(
  messageId: number, pieces: readonly PieceBrute[], config: ConfigGestion,
): Promise<{ deposees: number; nonDeposees: number }> {
  const { deposerPieceGestion } = await import('../stockage'); // import DYNAMIQUE : garde le SDK S3 hors du graphe des tests
  let deposees = 0, nonDeposees = 0;
  for (const p of pieces) {
    try {
      const res = await deposerPieceGestion(p.contenu, p.typeMime, {
        messageId, typesAcceptes: config.typesPiecesAcceptes, tailleMaxOctets: config.pieceTailleMaxOctets,
      });
      if (res.depose) {
        await query(
          `INSERT INTO gestion_piece (message_id, nom_fichier, type_mime, taille_octets, cle_stockage, empreinte_sha256, stocke_le)
           VALUES ($1,$2,$3,$4,$5,$6, now())`,
          [messageId, p.nomFichier, p.typeMime, res.taille, res.cle, res.empreinte]);
        deposees += 1;
      } else {
        await query(
          `INSERT INTO gestion_piece (message_id, nom_fichier, type_mime, taille_octets, motif_non_stocke)
           VALUES ($1,$2,$3,$4,$5)`,
          [messageId, p.nomFichier, p.typeMime, p.tailleOctets, res.motif]);
        nonDeposees += 1;
      }
    } catch (e) {
      // ISOLATION : stockage indisponible, réseau coupé… la pièce garde sa trace, les suivantes continuent.
      const motif = e instanceof Error ? e.message : String(e);
      try {
        await query(
          `INSERT INTO gestion_piece (message_id, nom_fichier, type_mime, taille_octets, motif_non_stocke)
           VALUES ($1,$2,$3,$4,$5)`, [messageId, p.nomFichier, p.typeMime, p.tailleOctets, `échec de dépôt : ${motif}`]);
      } catch { /* best-effort : ne jamais faire échouer la capture pour une trace de pièce */ }
      nonDeposees += 1;
    }
  }
  return { deposees, nonDeposees };
}

/** Adresses de To + Cc, comptées et conservées brutes (affichage). Séparé pour rester testable. PUR. */
export function destinatairesDuMessage(entetes: Record<string, string>): { brut: string | null; nb: number } {
  const dest = destinatairesDe(entetes);
  const brut = [entetes.to, entetes.cc].filter((x) => (x ?? '').trim() !== '').join(', ');
  return { brut: brut === '' ? null : brut, nb: dest.length };
}

/**
 * Câblage RÉEL des dépendances de la capture. Le client IMAP est créé par l'appelant (import dynamique d'imap.ts), pour
 * que ce module reste importable par un test sans charger imapflow.
 */
export interface ClientDossier {
  ouvrir(): Promise<void>;
  ouvrirBoite(chemin: string): Promise<void>;
  chercher(criteres: { depuis: Date; from?: string }): Promise<number[]>;
  telechargerMessage(uid: number): Promise<{
    uid: number; recuLe: Date; deNom: string | null;
    message: { messageId: string; inReplyTo?: string; references?: string[]; deAdresse: string; objet?: string; corpsTexte?: string; corpsHtml?: string; entetes: Record<string, string> };
    pieces: { nomFichier: string; typeMime: string | null; tailleOctets: number | null; contenu: Buffer }[];
  }>;
  fermer(): Promise<void>;
}

/** Projette un message lu par l'adaptateur IMAP sur ce dont la capture a besoin. PUR. */
export function versMessageBrut(mb: Awaited<ReturnType<ClientDossier['telechargerMessage']>>): MessageBrut {
  const entetes = mb.message.entetes ?? {};
  const dest = destinatairesDuMessage(entetes);
  return {
    uid: mb.uid,
    messageId: mb.message.messageId ?? '',
    inReplyTo: mb.message.inReplyTo ?? null,
    references: mb.message.references ?? [],
    deAdresse: mb.message.deAdresse,
    deNom: mb.deNom,
    destinataires: dest.brut,
    nbDestinataires: dest.nb,
    objet: mb.message.objet ?? null,
    corpsTexte: mb.message.corpsTexte ?? null,
    corpsHtml: mb.message.corpsHtml ?? null,
    recuLe: mb.recuLe,
    entetes,
    pieces: mb.pieces,
  };
}

/** Dépendances RÉELLES. `ouvrir()` de la connexion est fait ici, à la première ouverture de dossier. */
export function depsReellesCapture(client: ClientDossier): DepsCapture {
  let connecte = false;
  return {
    maintenant: () => new Date(),
    config: chargerConfigGestion,
    reglesActives: lireReglesActives,
    ouvrirDossier: async (chemin) => {
      if (!connecte) { await client.ouvrir(); connecte = true; }
      await client.ouvrirBoite(chemin); // readOnly (EXAMINE) : imposé par imap.ts, jamais un choix d'ici
    },
    chercherDepuis: (depuis) => client.chercher({ depuis }),
    telecharger: async (uid) => versMessageBrut(await client.telechargerMessage(uid)),
    fermer: () => client.fermer(),
    connus: lireConnus,
    bornes: lireBornes,
    resoudreFil,
    ecrire: ecrireMessage,
    deposerPieces: deposerPiecesMessage,
  };
}

// ── Journal des passes (table SŒUR de releve_run, JAMAIS la même) ────────────────────────────────────────────────────

/** Ligne « en_cours » posée AVANT la connexion : un plantage brutal laisse quand même une trace datée. */
export async function insererRun(declencheur: 'manuel' | 'planifie' | 'rattrapage', dossier: string): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO gestion_releve_run (declencheur, dossier) VALUES ($1, $2) RETURNING id::int AS id`, [declencheur, dossier]);
  return rows[0].id;
}

export interface MajRun {
  resultat: 'ok' | 'erreur';
  termineLe: Date;
  rapport?: { depuis: string | null; uidsServeur: number; vus: number; dejaConnus: number; captures: number; exclus: number; filsCrees: number; filsFusionnes: number; piecesDeposees: number; piecesNonDeposees: number; plafondAtteint: boolean };
  erreur?: string;
}

/** Finalise la ligne : « ok » avec ses compteurs, ou « erreur » avec son motif. Jamais laissée « en_cours » en silence. */
export async function finaliserRun(id: number, maj: MajRun): Promise<void> {
  const r = maj.rapport;
  await query(
    `UPDATE gestion_releve_run
        SET termine_le = $2, resultat = $3, fenetre_depuis = $4, uids_serveur = $5, vus = $6, deja_connus = $7,
            captures = $8, exclus = $9, fils_touches = $10, pieces_deposees = $11, pieces_non_deposees = $12,
            plafond_atteint = $13, erreur = $14
      WHERE id = $1`,
    [id, maj.termineLe, maj.resultat, r?.depuis ?? null, r?.uidsServeur ?? null, r?.vus ?? null, r?.dejaConnus ?? null,
     r?.captures ?? null, r?.exclus ?? null, (r ? r.filsCrees + r.filsFusionnes : null), r?.piecesDeposees ?? null,
     r?.piecesNonDeposees ?? null, r?.plafondAtteint ?? null, maj.erreur ?? null],
  );
}

// ── Verrou consultatif PROPRE au module (jamais celui de la veille) ──────────────────────────────────────────────────

/** Verrou SESSION-scoped : pris ET rendu sur la MÊME connexion, tenue le temps de la passe (même schéma que la veille). */
export function verrouGestion() {
  let client: PoolClient | null = null;
  return {
    acquerir: async (): Promise<boolean> => {
      client = await pool.connect();
      const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [CLE_VERROU_GESTION]);
      if (!rows[0]?.ok) { client.release(); client = null; return false; }
      return true;
    },
    liberer: async (): Promise<void> => {
      if (client === null) return;
      try { await client.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU_GESTION]); }
      finally { client.release(); client = null; }
    },
  };
}
