import { query, withTransaction } from '../db/client';
import { attenteAvantReprise, BAIL_SECONDES, ESSAIS_MAX } from './fileEnvoi';
import { fileEnvoiDisponible } from './schema';
import type { LigneFile, PieceAFond } from './travailleurEnvoi';
import type { EtatPiece } from './fileEnvoi';

/**
 * MODULE « GESTION » — LOT ENVOI-ARRIERE-PLAN : LA FILE D'ENVOI EN BASE. Accès base, lecture et écriture.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 `FOR UPDATE SKIP LOCKED` EST LE CŒUR DE CE FICHIER, et ce n'est pas une optimisation.
 *
 * Deux travailleurs peuvent tourner en même temps : la route qui vient de recevoir un envoi, et la relève continue
 * (une passe par minute). Sans ce verrou, tous deux liraient la même ligne, et le même mail partirait DEUX FOIS chez
 * le correspondant. `SKIP LOCKED` fait que le second passe à la ligne suivante au lieu d'attendre — et l'attente
 * serait ici le second défaut : une file qui se sérialise n'a plus de parallélisme.
 *
 * 🔴 ET UN BAIL PAR-DESSUS, parce que le verrou meurt avec la transaction. Un processus tué au milieu d'un envoi
 * relâcherait son verrou en laissant la ligne « en_cours » pour toujours. `pris_le` permet au suivant de la
 * reprendre — mais seulement après un délai généreux, pour ne pas doubler un envoi encore en vol.
 *
 * 🔴 RIEN N'EST JAMAIS SUPPRIMÉ. Une ligne échouée reste, avec sa cause ; c'est elle qui porte la capsule rouge
 * « Non envoyé » à l'écran, et c'est elle qui empêche une seconde alerte.
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce fichier par `tsx`. La frontière navigateur est
 * tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'on met en file : exactement ce que l'envoi synchrone recevait. */
export interface DemandeEnFile {
  cleIdempotence: string;
  brouillonId: number | null;
  filId: number | null;
  repondAMessageId: number | null;
  voie: string | null;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  corps: string;
  corpsHtml: string | null;
  cibles: readonly unknown[];
}

/** L'état d'une ligne tel que l'écran le montre. */
export interface LigneFileAffichee {
  id: number;
  filId: number | null;
  objet: string;
  destinataires: string[];
  etat: 'attente' | 'en_cours' | 'echec';
  demandeLe: string;
  cause: string | null;
  brouillonId: number | null;
}

/**
 * 🔴 LE MARQUEUR D'UNE ALERTE. Une alerte est un mail comme un autre : elle passe par la même file. Ce préfixe
 * d'objet est ce qui permet à la file de la reconnaître et de ne JAMAIS alerter sur elle — voir `doitAlerter`.
 *
 * ⚠️ RECONNU SUR L'OBJET, et c'est assumé : l'alternative (une colonne « est_une_alerte ») serait plus propre mais
 * ajouterait une colonne à une table déjà large pour une information que l'objet porte déjà sans ambiguïté — aucun
 * mail ordinaire ne commence par ce libellé.
 */
export const PREFIXE_ALERTE = '⚠️ Mail non envoyé :';

interface LigneBrute {
  id: string;
  cle_idempotence: string;
  brouillon_id: string | null;
  fil_id: string | null;
  objet: string;
  dest_a: unknown;
  dest_cc: unknown;
  dest_cci: unknown;
  demande_le: string;
  essais: number;
  alerte_le: string | null;
  etat: string;
  derniere_erreur: string | null;
}

/** Une colonne `jsonb` de chaînes, rendue sûre. PUR. */
function listeDe(brut: unknown): string[] {
  return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string') : [];
}

function versLigne(r: LigneBrute): LigneFile {
  return {
    id: Number(r.id),
    cleIdempotence: r.cle_idempotence,
    // ⚠️ `bigint` arrive en CHAÎNE avec le pilote `pg` : sans `Number`, l'identifiant serait comparé comme du texte.
    brouillonId: r.brouillon_id === null ? null : Number(r.brouillon_id),
    objet: r.objet,
    destinataires: [...listeDe(r.dest_a), ...listeDe(r.dest_cc), ...listeDe(r.dest_cci)],
    demandeLe: new Date(r.demande_le),
    essais: r.essais,
    alerteLe: r.alerte_le === null ? null : new Date(r.alerte_le),
    estUneAlerte: r.objet.startsWith(PREFIXE_ALERTE),
  };
}

/**
 * MET UN ENVOI EN FILE. Rend `null` si la file n'existe pas (migration absente) — l'appelant retombe alors sur
 * l'envoi synchrone, c'est-à-dire le comportement d'avant ce lot.
 *
 * 🔴 `ON CONFLICT DO NOTHING` SUR LA CLÉ D'IDEMPOTENCE : un double-clic, un navigateur qui rejoue la requête ou un
 * rechargement pendant le compte à rebours ne mettent pas deux mails dans la file. C'est la BASE qui tranche, pas
 * un bouton désactivé — un bouton ne protège pas d'une requête rejouée.
 */
export async function mettreEnFile(
  d: DemandeEnFile, auteur: { id: number | null; libelle: string },
): Promise<number | null> {
  if (!(await fileEnvoiDisponible())) return null;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_envoi_file
       (cle_idempotence, brouillon_id, fil_id, repond_a_message_id, voie,
        dest_a, dest_cc, dest_cci, objet, corps, corps_html, cibles, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14)
     ON CONFLICT (cle_idempotence) DO NOTHING
     RETURNING id::text`,
    [d.cleIdempotence, d.brouillonId, d.filId, d.repondAMessageId, d.voie,
      JSON.stringify(d.a), JSON.stringify(d.cc), JSON.stringify(d.cci),
      d.objet, d.corps, d.corpsHtml, JSON.stringify(d.cibles ?? []), auteur.id, auteur.libelle],
  );
  // Aucune ligne rendue = la clé existait déjà : c'est un doublon, et c'est le bon résultat.
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * ══ 🔴 PRENDRE DES LIGNES, SANS QUE DEUX TRAVAILLEURS PRENNENT LA MÊME ═══════════════════════════════════════════
 *
 * La sélection et la prise sont dans UNE transaction : entre les deux, aucune autre passe ne peut s'intercaler.
 * `SKIP LOCKED` fait passer le second travailleur à la ligne suivante plutôt que d'attendre celle-ci.
 */
export async function lignesAPrendre(max = 5): Promise<LigneFile[]> {
  if (!(await fileEnvoiDisponible())) return [];
  return withTransaction(async (q) => {
    const { rows } = await q<LigneBrute>(
      `SELECT id::text, cle_idempotence, brouillon_id::text, fil_id::text, objet,
              dest_a, dest_cc, dest_cci, demande_le::text, essais, alerte_le::text, etat, derniere_erreur
         FROM gestion_envoi_file
        WHERE etat = 'attente'
           OR (etat = 'en_cours' AND (pris_le IS NULL OR pris_le < now() - ($2 || ' seconds')::interval))
        ORDER BY demande_le
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      [max, String(BAIL_SECONDES)]);
    if (rows.length === 0) return [];
    await q(
      `UPDATE gestion_envoi_file SET etat = 'en_cours', pris_le = now(), essais = essais + 1
        WHERE id = ANY ($1::bigint[])`,
      [rows.map((r) => r.id)]);
    return rows.map(versLigne);
  });
}

/** Rend la ligne à la file : ses pièces ne sont pas prêtes. Le bail est relâché — un autre pourra la reprendre. */
export async function remettreEnAttente(id: number): Promise<void> {
  await query(
    `UPDATE gestion_envoi_file SET etat = 'attente', pris_le = NULL, essais = greatest(0, essais - 1)
      WHERE id = $1 AND etat = 'en_cours'`, [id]);
}

export async function marquerEnvoye(id: number, envoiId: number): Promise<void> {
  await query(
    `UPDATE gestion_envoi_file SET etat = 'envoye', envoi_id = $2, termine_le = now(), pris_le = NULL,
            derniere_erreur = NULL
      WHERE id = $1`, [id, envoiId]);
}

export async function marquerEchec(id: number, cause: string): Promise<void> {
  await query(
    `UPDATE gestion_envoi_file SET etat = 'echec', termine_le = now(), pris_le = NULL, derniere_erreur = $2
      WHERE id = $1`, [id, cause.slice(0, 2000)]);
}

/** 🔴 Une seule alerte, pour toujours : cette date est le second verrou, celui qui survit à un redémarrage. */
export async function marquerAlerte(id: number): Promise<void> {
  await query(`UPDATE gestion_envoi_file SET alerte_le = now() WHERE id = $1 AND alerte_le IS NULL`, [id]);
}

/**
 * REMET LE BROUILLON DANS LES BROUILLONS, avec tout son contenu et ses pièces déjà récupérées.
 *
 * 🔴 ON ANNULE LE MARQUAGE, ON NE RECRÉE RIEN. Le brouillon n'a jamais été supprimé — il portait seulement
 * `envoye_le`, qui le faisait quitter la liste. L'effacer le fait réapparaître tel qu'il était, pièces comprises.
 * Recréer une ligne perdrait l'identifiant, donc le lien de l'alerte, donc les pièces.
 */
export async function remettreEnBrouillon(brouillonId: number | null): Promise<void> {
  if (brouillonId === null) return;
  await query(
    `UPDATE gestion_brouillon SET envoye_le = NULL, abandonne_le = NULL, maj_le = now() WHERE id = $1`,
    [brouillonId]);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES PIÈCES À RÉCUPÉRER EN TÂCHE DE FOND
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES PIÈCES À PRENDRE. Même mécanique de verrou que les lignes de file, et pour la même raison.
 *
 * ⚠️ L'ATTENTE AVANT REPRISE EST RESPECTÉE ICI : une pièce qui vient d'échouer n'est pas reprise dans la seconde.
 * Réessayer tout de suite sur un service qui vient de dire « trop de requêtes » est la meilleure façon de se faire
 * refuser plus longtemps.
 */
export async function piecesAPrendre(max = 4): Promise<PieceAFond[]> {
  if (!(await fileEnvoiDisponible())) return [];
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; nom_fichier: string; source_drive_id: string; essais: number }>(
      `SELECT id::text, nom_fichier, source_drive_id, essais
         FROM gestion_brouillon_piece
        WHERE etat = 'attente' AND retire_le IS NULL AND source_drive_id IS NOT NULL
          AND (pris_le IS NULL OR pris_le < now() - (($2 * greatest(essais, 1)) || ' seconds')::interval)
        ORDER BY cree_le
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      [max, String(attenteAvantReprise(0))]);
    if (rows.length === 0) return [];
    await q(`UPDATE gestion_brouillon_piece SET pris_le = now(), essais = essais + 1
              WHERE id = ANY ($1::bigint[])`, [rows.map((r) => r.id)]);
    return rows.map((r) => ({
      id: Number(r.id), nom: r.nom_fichier, driveId: r.source_drive_id, essais: r.essais,
    }));
  });
}

/**
 * MARQUE UNE PIÈCE. `prete` pose aussi la clé de stockage et la taille RÉELLE des octets.
 *
 * 🔴 LA TAILLE RÉELLE REMPLACE CELLE DU DRIVE, et c'est le second contrôle de taille annoncé dans `fileEnvoi.ts` :
 * on a accepté la pièce sur la foi de ses métadonnées, on la mesure vraiment quand elle arrive.
 */
export async function marquerPiece(
  id: number, m: { etat: EtatPiece; erreur?: string | null; cleStockage?: string; taille?: number },
): Promise<void> {
  if (m.etat === 'prete') {
    await query(
      `UPDATE gestion_brouillon_piece
          SET etat = 'prete', pris_le = NULL, derniere_erreur = NULL,
              cle_stockage = coalesce($2, cle_stockage),
              taille_octets = coalesce($3::bigint, taille_octets)
        WHERE id = $1`, [id, m.cleStockage ?? null, m.taille ?? null]);
    return;
  }
  await query(
    `UPDATE gestion_brouillon_piece SET etat = $2, pris_le = NULL, derniere_erreur = $3 WHERE id = $1`,
    [id, m.etat, (m.erreur ?? '').slice(0, 2000) || null]);
}

/**
 * L'ÉTAT DES PIÈCES D'UN BROUILLON, et le NOM de la première qui a échoué.
 *
 * ⚠️ LES PIÈCES RETIRÉES SONT IGNORÉES : entre le clic et l'envoi, une pièce a pu être retirée. Une pièce échouée
 * puis retirée ne doit pas empêcher le mail de partir — c'est ce que la personne a demandé en la retirant.
 */
export async function etatDesPieces(
  brouillonId: number | null,
): Promise<{ etats: EtatPiece[]; premiereEchouee: string | null }> {
  if (brouillonId === null || !(await fileEnvoiDisponible())) return { etats: [], premiereEchouee: null };
  const { rows } = await query<{ etat: string; nom_fichier: string }>(
    `SELECT etat, nom_fichier FROM gestion_brouillon_piece
      WHERE brouillon_id = $1 AND retire_le IS NULL
      ORDER BY cree_le`, [brouillonId]);
  const etats = rows.map((r) => (r.etat === 'attente' || r.etat === 'echec' ? r.etat : 'prete') as EtatPiece);
  const echouee = rows.find((r) => r.etat === 'echec');
  return { etats, premiereEchouee: echouee?.nom_fichier ?? null };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE L'ÉCRAN MONTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES ENVOIS QUI NE SONT PAS (ENCORE) PARTIS, pour les montrer dans « Envoyés » et dans le fil.
 *
 * 🔴 POURQUOI ILS S'AFFICHENT. Demande d'Arno : « le mail apparaît dans Envoyés exactement comme un mail parti ».
 * Un mail qui disparaît de Brouillons sans apparaître ailleurs pendant une minute est un mail qu'on croit perdu —
 * et qu'on réécrit. Ces lignes comblent l'intervalle entre la remise à Gmail et la capture par la relève.
 *
 * ⚠️ LES LIGNES `envoye` NE SONT PAS RENDUES : le vrai message, capturé par la relève, prendra leur place. Les
 * afficher toutes les deux donnerait le mail en double dans la liste.
 */
export async function envoisEnCours(filId?: number | null): Promise<LigneFileAffichee[]> {
  if (!(await fileEnvoiDisponible())) return [];
  const { rows } = await query<LigneBrute>(
    `SELECT id::text, cle_idempotence, brouillon_id::text, fil_id::text, objet,
            dest_a, dest_cc, dest_cci, demande_le::text, essais, alerte_le::text, etat, derniere_erreur
       FROM gestion_envoi_file
      WHERE etat <> 'envoye'
        AND ($1::bigint IS NULL OR fil_id = $1)
      ORDER BY demande_le DESC
      LIMIT 50`,
    [filId ?? null]);
  return rows.map((r) => ({
    id: Number(r.id),
    filId: r.fil_id === null ? null : Number(r.fil_id),
    objet: r.objet,
    destinataires: [...listeDe(r.dest_a), ...listeDe(r.dest_cc)],
    etat: (r.etat === 'echec' ? 'echec' : r.etat === 'en_cours' ? 'en_cours' : 'attente'),
    demandeLe: r.demande_le,
    cause: r.derniere_erreur,
    brouillonId: r.brouillon_id === null ? null : Number(r.brouillon_id),
  }));
}

/** Le contenu complet d'une ligne, pour l'envoi réel. Lu au dernier moment, comme les pièces. */
export async function lireDemande(id: number): Promise<(DemandeEnFile & {
  auteurId: number | null; auteurLibelle: string;
}) | null> {
  const { rows } = await query<{
    cle_idempotence: string; brouillon_id: string | null; fil_id: string | null;
    repond_a_message_id: string | null; voie: string | null; dest_a: unknown; dest_cc: unknown; dest_cci: unknown;
    objet: string; corps: string; corps_html: string | null; cibles: unknown;
    auteur_id: string | null; auteur_libelle: string;
  }>(
    `SELECT cle_idempotence, brouillon_id::text, fil_id::text, repond_a_message_id::text, voie,
            dest_a, dest_cc, dest_cci, objet, corps, corps_html, cibles, auteur_id::text, auteur_libelle
       FROM gestion_envoi_file WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) return null;
  return {
    cleIdempotence: r.cle_idempotence,
    brouillonId: r.brouillon_id === null ? null : Number(r.brouillon_id),
    filId: r.fil_id === null ? null : Number(r.fil_id),
    repondAMessageId: r.repond_a_message_id === null ? null : Number(r.repond_a_message_id),
    voie: r.voie,
    a: listeDe(r.dest_a), cc: listeDe(r.dest_cc), cci: listeDe(r.dest_cci),
    objet: r.objet, corps: r.corps, corpsHtml: r.corps_html,
    cibles: Array.isArray(r.cibles) ? r.cibles : [],
    auteurId: r.auteur_id === null ? null : Number(r.auteur_id),
    auteurLibelle: r.auteur_libelle,
  };
}

/** Le nombre d'essais au-delà duquel on renonce — exposé pour que l'écran puisse l'expliquer. */
export { ESSAIS_MAX };
