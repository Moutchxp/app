/**
 * LOT 5e — BROUILLONS ET REGISTRE DES ENVOIS. IMPUR (base).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ. Abandonné, il est DATÉ. Trois paragraphes écrits puis une fenêtre fermée par
 * mégarde, c'est du travail humain : un DELETE ici le perdrait sans bruit, et personne ne saurait jamais qu'il a existé.
 *
 * 🔴 LA LIGNE D'ENVOI EST ÉCRITE AVANT L'APPEL RÉSEAU. Si l'application tombe entre l'appel et la réponse de Gmail, la
 * ligne reste `en_cours` : on SAIT qu'un mail est peut-être parti, au lieu de ne rien savoir. C'est le patron du
 * journal de passes (migration 228), et pour la même raison.
 *
 * 🔴 L'IDEMPOTENCE EST TRANCHÉE PAR LA BASE, jamais par le code : `cle_idempotence` est UNIQUE, et un second envoi
 * avec la même clé retombe sur la ligne existante. Un verrou applicatif ne survivrait pas à deux processus, et deux
 * mails partis au même correspondant ne se rattrapent pas.
 *
 * ⚠️ PIÈGE DU DÉPÔT — `withTransaction` COMMITE au retour normal : on LIT, on REFUSE, puis seulement on ÉCRIT. Jamais
 * l'inverse (cf. `piege-withtransaction-refus-apres-update`).
 * ⚠️ PIÈGE DU DÉPÔT — `pg` rend les `bigint` en CHAÎNE : tout identifiant est converti explicitement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query, withTransaction } from '../db/client';
import type { VoieRedaction } from './redaction';

export interface Auteur { id: number | null; libelle: string }

export interface BrouillonEnBase {
  id: number;
  filId: number | null;
  repondAMessageId: number | null;
  voie: VoieRedaction;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  corps: string;
  citation: string | null;
  auteurLibelle: string;
  majLe: string;
}

const INSTANT = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const CHAMPS_BROUILLON = `id::int AS id, fil_id::int AS fil_id, repond_a_message_id::int AS repond_a_message_id,
  voie, dest_a, dest_cc, dest_cci, objet, corps, citation, auteur_libelle, ${INSTANT('maj_le')} AS maj_le`;

interface LigneBrouillon {
  id: number; fil_id: number | null; repond_a_message_id: number | null; voie: string;
  dest_a: unknown; dest_cc: unknown; dest_cci: unknown; objet: string; corps: string;
  citation: string | null; auteur_libelle: string; maj_le: string;
}

/** Une colonne `jsonb` de chaînes, rendue sûre : tout ce qui n'est pas un tableau de textes devient une liste vide. PUR. */
function listeDe(brut: unknown): string[] {
  return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string') : [];
}

function versBrouillon(r: LigneBrouillon): BrouillonEnBase {
  const voies: VoieRedaction[] = ['repondre', 'repondre_tous', 'transferer', 'nouveau'];
  return {
    id: r.id, filId: r.fil_id, repondAMessageId: r.repond_a_message_id,
    voie: (voies as string[]).includes(r.voie) ? (r.voie as VoieRedaction) : 'nouveau',
    a: listeDe(r.dest_a), cc: listeDe(r.dest_cc), cci: listeDe(r.dest_cci),
    objet: r.objet, corps: r.corps, citation: r.citation,
    auteurLibelle: r.auteur_libelle, majLe: r.maj_le,
  };
}

/**
 * ENREGISTRE un brouillon : une ligne par échange et par auteur, mise à jour à chaque frappe calmée. On ne crée pas
 * une ligne de plus à chaque sauvegarde — sans quoi une demi-heure d'écriture laisserait cent brouillons identiques.
 *
 * 🔒 L'AUTEUR VIENT DE LA SESSION, jamais du navigateur : invariant du lot 5-DROITS, et la seule façon qu'un journal
 * d'envoi veuille dire quelque chose.
 */
export async function enregistrerBrouillon(
  b: { id?: number | null; filId: number | null; repondAMessageId: number | null; voie: VoieRedaction;
       a: string[]; cc: string[]; cci: string[]; objet: string; corps: string; citation: string | null },
  auteur: Auteur,
): Promise<BrouillonEnBase> {
  const valeurs = [
    b.filId, b.repondAMessageId, b.voie,
    JSON.stringify(b.a), JSON.stringify(b.cc), JSON.stringify(b.cci),
    b.objet, b.corps, b.citation, auteur.id, auteur.libelle,
  ];
  if (b.id) {
    // Mise à jour CIBLÉE : on ne touche qu'un brouillon encore vivant, et qui appartient à l'auteur. Un brouillon déjà
    //   envoyé ou abandonné ne se réécrit pas — sinon un onglet resté ouvert le ressusciterait après coup.
    const { rows } = await query<LigneBrouillon>(
      `UPDATE gestion_brouillon
          SET fil_id = $2, repond_a_message_id = $3, voie = $4, dest_a = $5::jsonb, dest_cc = $6::jsonb,
              dest_cci = $7::jsonb, objet = $8, corps = $9, citation = $10, maj_le = now()
        WHERE id = $1 AND abandonne_le IS NULL AND envoye_le IS NULL
        RETURNING ${CHAMPS_BROUILLON}`,
      [b.id, ...valeurs.slice(0, 9)]);
    if (rows[0]) return versBrouillon(rows[0]);
    // Le brouillon visé n'existe plus (envoyé, abandonné) : on en ouvre un neuf plutôt que de perdre ce qui est écrit.
  }
  const { rows } = await query<LigneBrouillon>(
    `INSERT INTO gestion_brouillon
       (fil_id, repond_a_message_id, voie, dest_a, dest_cc, dest_cci, objet, corps, citation, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
     RETURNING ${CHAMPS_BROUILLON}`, valeurs);
  return versBrouillon(rows[0]);
}

/** Le brouillon VIVANT d'un échange, s'il y en a un. Le plus récemment touché fait foi. */
export async function lireBrouillonDuFil(filId: number): Promise<BrouillonEnBase | null> {
  const { rows } = await query<LigneBrouillon>(
    `SELECT ${CHAMPS_BROUILLON} FROM gestion_brouillon
      WHERE fil_id = $1 AND abandonne_le IS NULL AND envoye_le IS NULL
      ORDER BY maj_le DESC, id DESC LIMIT 1`, [filId]);
  return rows[0] ? versBrouillon(rows[0]) : null;
}

/** Tous les brouillons vivants — ce que montre le libellé « Brouillons ». Borné : une liste se lit, elle ne défile pas. */
export async function listerBrouillons(limite = 50): Promise<BrouillonEnBase[]> {
  const { rows } = await query<LigneBrouillon>(
    `SELECT ${CHAMPS_BROUILLON} FROM gestion_brouillon
      WHERE abandonne_le IS NULL AND envoye_le IS NULL
      ORDER BY maj_le DESC, id DESC LIMIT $1`, [Math.min(Math.max(1, limite), 200)]);
  return rows.map(versBrouillon);
}

/** Combien de brouillons vivants — le nombre porté par le libellé. */
export async function compterBrouillons(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_brouillon WHERE abandonne_le IS NULL AND envoye_le IS NULL`);
  return rows[0]?.n ?? 0;
}

/** ABANDONNE un brouillon : daté, jamais supprimé. Le geste se défait — il suffit d'en rouvrir un. */
export async function abandonnerBrouillon(id: number): Promise<void> {
  await query(
    `UPDATE gestion_brouillon SET abandonne_le = now()
      WHERE id = $1 AND abandonne_le IS NULL AND envoye_le IS NULL`, [id]);
}

// ── Le registre des envois ────────────────────────────────────────────────────────────────────────────────────────

export interface EnvoiEnBase {
  id: number;
  etat: 'en_cours' | 'envoye' | 'echec' | 'annule';
  messageIdRfc: string;
  objet: string;
  a: string[];
  cc: string[];
  cci: string[];
  auteurLibelle: string;
  erreur: string | null;
  demandeLe: string;
  /** `true` quand la ligne existait DÉJÀ pour cette clé : un double-clic retombe dessus, il n'en crée pas une seconde. */
  deja: boolean;
}

interface LigneEnvoi {
  id: number; etat: string; message_id_rfc: string; objet: string;
  dest_a: unknown; dest_cc: unknown; dest_cci: unknown;
  auteur_libelle: string; erreur: string | null; demande_le: string;
}

const CHAMPS_ENVOI = `id::int AS id, etat, message_id_rfc, objet, dest_a, dest_cc, dest_cci,
  auteur_libelle, erreur, ${INSTANT('demande_le')} AS demande_le`;

function versEnvoi(r: LigneEnvoi, deja: boolean): EnvoiEnBase {
  const etats = ['en_cours', 'envoye', 'echec', 'annule'];
  return {
    id: r.id, etat: (etats.includes(r.etat) ? r.etat : 'en_cours') as EnvoiEnBase['etat'],
    messageIdRfc: r.message_id_rfc, objet: r.objet,
    a: listeDe(r.dest_a), cc: listeDe(r.dest_cc), cci: listeDe(r.dest_cci),
    auteurLibelle: r.auteur_libelle, erreur: r.erreur, demandeLe: r.demande_le, deja,
  };
}

/**
 * OUVRE la ligne d'envoi, AVANT tout appel réseau — et LA BASE tranche l'idempotence.
 *
 * 🔴 `ON CONFLICT DO NOTHING` puis relecture : deux clics simultanés produisent une seule ligne, et le second
 * appelant reçoit celle du premier avec `deja: true`. Il ne doit alors RIEN envoyer. Un `SELECT` préalable suivi d'un
 * `INSERT` ne donnerait pas cette garantie — entre les deux, l'autre requête a le temps de passer.
 */
export async function ouvrirEnvoi(
  e: { cleIdempotence: string; brouillonId: number | null; filId: number | null; repondAMessageId: number | null;
       messageIdRfc: string; inReplyTo: string | null; references: string | null;
       a: string[]; cc: string[]; cci: string[]; objet: string },
  auteur: Auteur,
): Promise<EnvoiEnBase> {
  const { rows } = await query<LigneEnvoi>(
    `INSERT INTO gestion_envoi
       (cle_idempotence, brouillon_id, fil_id, repond_a_message_id, message_id_rfc, in_reply_to, references_rfc,
        dest_a, dest_cc, dest_cci, objet, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13)
     ON CONFLICT (cle_idempotence) DO NOTHING
     RETURNING ${CHAMPS_ENVOI}`,
    [e.cleIdempotence, e.brouillonId, e.filId, e.repondAMessageId, e.messageIdRfc, e.inReplyTo, e.references,
     JSON.stringify(e.a), JSON.stringify(e.cc), JSON.stringify(e.cci), e.objet, auteur.id, auteur.libelle]);
  if (rows[0]) return versEnvoi(rows[0], false);
  // Conflit : la ligne existait déjà. C'est un DOUBLE-CLIC, pas une erreur — on rend l'existante, telle quelle.
  const { rows: deja } = await query<LigneEnvoi>(
    `SELECT ${CHAMPS_ENVOI} FROM gestion_envoi WHERE cle_idempotence = $1`, [e.cleIdempotence]);
  return versEnvoi(deja[0], true);
}

/** FINALISE la ligne : parti, refusé, ou annulé. Jamais laissée `en_cours` en silence. */
export async function finaliserEnvoi(
  id: number, maj: { etat: 'envoye' | 'echec' | 'annule'; gmailMessageId?: string | null; erreur?: string | null },
): Promise<void> {
  await query(
    `UPDATE gestion_envoi
        SET etat = $2, gmail_message_id = $3, erreur = $4,
            parti_le = CASE WHEN $2 = 'envoye' THEN now() ELSE parti_le END
      WHERE id = $1 AND etat = 'en_cours'`,
    [id, maj.etat, maj.gmailMessageId ?? null, maj.erreur ?? null]);
}

/** Les envois d'un échange, du plus récent au plus ancien — ce que la conversation montre sous les messages. */
export async function lireEnvoisDuFil(filId: number, limite = 20): Promise<EnvoiEnBase[]> {
  const { rows } = await query<LigneEnvoi>(
    `SELECT ${CHAMPS_ENVOI} FROM gestion_envoi WHERE fil_id = $1
      ORDER BY demande_le DESC, id DESC LIMIT $2`, [filId, Math.min(Math.max(1, limite), 100)]);
  return rows.map((r) => versEnvoi(r, false));
}

/**
 * MARQUE le brouillon comme envoyé, dans la MÊME transaction que rien d'autre — c'est un geste à part, fait après
 * l'envoi confirmé. ⚠️ On LIT d'abord, on refuse ensuite : `withTransaction` COMMITE au retour normal, donc un refus
 * rendu après un UPDATE aurait quand même écrit (piège connu du dépôt).
 */
export async function marquerBrouillonEnvoye(brouillonId: number): Promise<void> {
  await withTransaction(async (q) => {
    const { rows } = await q<{ id: number }>(
      `SELECT id::int AS id FROM gestion_brouillon
        WHERE id = $1 AND envoye_le IS NULL FOR UPDATE`, [brouillonId]);
    if (!rows[0]) return; // déjà marqué : rien à faire, et surtout rien à écrire
    await q(`UPDATE gestion_brouillon SET envoye_le = now() WHERE id = $1`, [brouillonId]);
  });
}

/**
 * LES CORRESPONDANTS DÉJÀ VUS, pour les suggestions du champ destinataire. Adresse et nom le plus récemment porté.
 *
 * ⚠️ BORNÉ à 10 résultats et filtré sur au moins deux caractères : un champ de saisie ne déclenche pas un balayage de
 * 56 000 messages à la première lettre. La recherche est insensible à la casse, sur l'adresse ET sur le nom — on se
 * souvient du nom du plombier avant de se souvenir de son adresse.
 */
export async function suggererCorrespondants(saisie: string, limite = 10): Promise<{ adresse: string; nom: string | null }[]> {
  const q = (saisie ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const { rows } = await query<{ adresse: string; nom: string | null }>(
    `SELECT de_adresse AS adresse, max(de_nom) AS nom
       FROM gestion_message
      WHERE de_adresse <> '' AND (lower(de_adresse) LIKE '%' || $1 || '%' OR lower(coalesce(de_nom, '')) LIKE '%' || $1 || '%')
      GROUP BY de_adresse
      ORDER BY max(recu_le) DESC
      LIMIT $2`, [q, Math.min(Math.max(1, limite), 25)]);
  return rows.map((r) => ({ adresse: r.adresse, nom: (r.nom ?? '').trim() || null }));
}
