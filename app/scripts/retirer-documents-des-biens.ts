/**
 * ══ 🔴🔴 LOT DOCUMENTS-HORS-BIENS — LES « Document CRITERIMMO » QUITTENT LES FICHES DE BIENS ═══════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) : sur la fiche du lot 176 (25 rue Edith Cavell), le bloc « Vie du bien » affichait
 * nos propres documents — quittances, avis mensuels « Octobre 2026 », révisions — avec un badge « Auto ».
 *
 * RÈGLE D'ARNO : « Les “Document CRITERIMMO” concernent des PERSONNES, pas le bien. Ils vont UNIQUEMENT dans le
 * dossier “Documents automatiques” de la fiche locataire ou propriétaire. JAMAIS dans la fiche d'un bien, ni dans
 * “Vie du bien”, ni dans aucun historique ou compteur de bien. »
 *
 * ═══ CE QUE CE SCRIPT FAIT, ET RIEN D'AUTRE ═════════════════════════════════════════════════════════════════════
 *
 * Il RETIRE (statut `retire`, daté, signé) tous les liens VIVANTS vers un bien portés par un document que NOUS
 * avons envoyé. Il ne supprime rien : chaque ligne reste lisible, avec sa date, son auteur et son motif, et le
 * geste est réversible — exactement le mécanisme de la conversion du 28/09 qu'Arno a cité.
 *
 * 🔴 TROIS CHOSES QU'IL NE TOUCHE PAS, ET CHACUNE EST UNE DEMANDE EXPLICITE D'ARNO :
 *   ① LES LIENS POSÉS À LA MAIN. Une personne a regardé le mail ; le script, non. Ils sont comptés et montrés —
 *      c'est une question pour Arno, pas une décision du script.
 *   ② LES MAILS REÇUS. Une réponse humaine à un document est du vrai courrier client : elle garde ses biens.
 *   ③ LES FENÊTRES DE CONVERSATION. On n'en ferme aucune : les réponses humaines de la même conversation
 *      continuent d'en recevoir leurs biens. C'est la PROJECTION qui apprend à sauter les documents.
 *
 *   npm run gestion:documents:hors-biens                → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:documents:hors-biens -- --appliquer  → elle écrit
 */
import { query, withTransaction } from '../lib/db/client';
import { closePool } from '../lib/db/client';
import { MARQUEUR_DOCUMENT, REGLE_EXCLUSION_DOCUMENT, sousTypeLisible } from '../lib/gestion/documentsAuto';

const P = '  ';
const AUTEUR = 'lot DOCUMENTS-HORS-BIENS';
const MOTIF = 'un « Document CRITERIMMO » concerne une personne, pas un bien (décision d’Arno du 01/10/2026)';

/**
 * ══ 🔴🔴 « UN DOCUMENT QUE NOUS AVONS ENVOYÉ », EN SQL ═════════════════════════════════════════════════════════
 *
 * Le jumeau EXACT de `estDocumentEnvoye` (module pur). Les deux doivent dire la même chose, et un test le vérifie.
 *
 * ⚠️ `coalesce` SUR LA RÈGLE, ET CE N'EST PAS UN ORNEMENT. `exclu_par_regle_id = 5` rend NULL quand la colonne est
 * NULL — et `NULL OR false` rend NULL, que le `WHERE` rejette. Ici le rejet serait le bon comportement par chance,
 * mais la même expression recopiée dans un CHECK ACCEPTERAIT la ligne : c'est précisément le défaut qui a fait
 * passer le verrou de la migration 291 à l'essai. On écrit donc la forme bivalente partout, par discipline.
 */
const EST_DOCUMENT_ENVOYE = `(
  m.sens = 'envoye'
  AND (coalesce(m.exclu_par_regle_id, 0) = ${REGLE_EXCLUSION_DOCUMENT}
       OR m.objet ILIKE '%${MARQUEUR_DOCUMENT}%')
)`;

/** Un lien posé par une PERSONNE : le dépôt le reconnaît ainsi partout (cf. `rafraichirPropositions`). */
const EST_MANUEL = `(r.origine <> 'automatique' OR r.statut_par_libelle IS NOT NULL)`;

const VIVANT = `r.statut IN ('propose', 'confirme')`;

async function n(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await query<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/** Les chiffres que l'on compare avant et après. */
async function chiffres(): Promise<{
  biensConfirmes: number; vivantsDocBien: number; recusVersBien: number;
  recusConfirmesVersBien: number; vieDu176: number;
}> {
  return {
    biensConfirmes: await n(
      `SELECT count(*)::text AS n FROM gestion_rattachement
        WHERE statut = 'confirme' AND cible_sorte = 'lot' AND piece_id IS NULL`),
    vivantsDocBien: await n(
      `SELECT count(*)::text AS n FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
        WHERE r.cible_sorte = 'lot' AND ${VIVANT} AND ${EST_DOCUMENT_ENVOYE}`),
    /**
     * 🔴 LA PREUVE QU'ARNO DEMANDE : les liens vers un bien portés par un mail REÇU. Ce nombre doit être
     * RIGOUREUSEMENT identique avant et après. S'il bouge d'une unité, une réponse humaine a perdu son bien.
     */
    recusVersBien: await n(
      `SELECT count(*)::text AS n FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
        WHERE r.cible_sorte = 'lot' AND ${VIVANT} AND m.sens = 'recu'`),
    recusConfirmesVersBien: await n(
      `SELECT count(*)::text AS n FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
        WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND m.sens = 'recu'`),
    // Le compteur « Vie du bien » du lot 176 : des MESSAGES liés en « confirmé », comme `enteteHistorique`.
    vieDu176: await n(
      `SELECT count(DISTINCT r.message_id)::text AS n FROM gestion_rattachement r
        WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
          AND r.cible_cle = (SELECT wippimmo_id FROM gestion_annuaire_lot WHERE id = 176)`),
  };
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const avant = await chiffres();

  // ── CE QUI SERAIT RETIRÉ, PAR SOUS-TYPE ───────────────────────────────────────────────────────────────────────
  const { rows: parType } = await query<{ objet: string | null; n: string }>(
    `SELECT m.objet, count(*)::text AS n
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND ${VIVANT} AND ${EST_DOCUMENT_ENVOYE} AND NOT ${EST_MANUEL}
      GROUP BY m.objet`);
  const sousTypes = new Map<string, number>();
  let aRetirer = 0;
  for (const r of parType) {
    const t = sousTypeLisible(r.objet);
    sousTypes.set(t, (sousTypes.get(t) ?? 0) + Number(r.n));
    aRetirer += Number(r.n);
  }

  const manuels = await n(
    `SELECT count(*)::text AS n FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND ${VIVANT} AND ${EST_DOCUMENT_ENVOYE} AND ${EST_MANUEL}`);

  console.log(`\n${appliquer ? 'APPLICATION' : 'SIMULATION'} — LES DOCUMENTS QUITTENT LES FICHES DE BIENS`);
  console.log(`\n${P}liens vivants « document → bien »      ${String(avant.vivantsDocBien).padStart(7)}`);
  console.log(`${P}  · à retirer (posés par le moteur)    ${String(aRetirer).padStart(7)}`);
  console.log(`${P}  · ÉPARGNÉS (posés à la main)         ${String(manuels).padStart(7)}   ← question pour Arno`);

  console.log(`\n${P}PAR SOUS-TYPE (top 10)`);
  for (const [t, c] of [...sousTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`${P}  ${t.padEnd(22)} ${String(c).padStart(7)}`);
  }

  // ── LES LIENS MANUELS, UN PAR UN : Arno doit pouvoir les regarder ─────────────────────────────────────────────
  const { rows: exManuels } = await query<{
    id: string; message_id: string; le: string; cible: string | null; objet: string | null;
    origine: string; par: string | null; cree_par: string;
  }>(
    `SELECT r.id::text, r.message_id::text, m.recu_le::date::text AS le, r.cible_libelle AS cible, m.objet,
            r.origine, r.statut_par_libelle AS par, r.cree_par_libelle AS cree_par
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND ${VIVANT} AND ${EST_DOCUMENT_ENVOYE} AND ${EST_MANUEL}
      ORDER BY m.recu_le DESC LIMIT 10`);
  if (exManuels.length > 0) {
    console.log(`\n${P}LES LIENS MANUELS ÉPARGNÉS (10 au plus) — Arno décide s’il faut les retirer aussi`);
    for (const e of exManuels) {
      /**
       * ⚠️ « MANUEL » RECOUVRE DEUX CHOSES TRÈS DIFFÉRENTES, et Arno doit pouvoir les distinguer pour trancher :
       *   · quelqu'un a regardé CE mail et l'a rattaché — c'est un vrai geste sur ce document ;
       *   · quelqu'un a ouvert une FENÊTRE de conversation, et la projection a posé le lien toute seule sur tous
       *     les mails de la fenêtre, ce document compris. La personne n'a jamais vu ce mail-là.
       * Les deux portent `origine = 'manuel'`. Seul le motif les sépare.
       */
      const parLaFenetre = (e.cree_par ?? '').includes('suivi de la conversation');
      console.log(`${P}  #${e.message_id.padEnd(6)} ${e.le}  « ${(e.objet ?? '').slice(0, 46)} »`);
      console.log(`${P}       → ${e.cible ?? '(bien)'} · origine ${e.origine}`
        + ` · posé par « ${e.cree_par} »${e.par === null ? '' : ` · statut changé par « ${e.par} »`}`);
      console.log(`${P}       ${parLaFenetre
        ? '⚠️ posé par la PROJECTION d’une fenêtre de conversation, pas par une personne regardant ce mail'
        : '✅ geste d’une personne sur ce mail précis'}`);
    }
  } else {
    console.log(`\n${P}Aucun lien manuel : rien à épargner, rien à demander à Arno.`);
  }

  // ── LES FENÊTRES OUVERTES PAR UN DOCUMENT ────────────────────────────────────────────────────────────────────
  const fenetresDoc = await n(
    `SELECT count(*)::text AS n FROM gestion_fil_periode p JOIN gestion_message m ON m.id = p.depuis_message_id
      WHERE p.remplacee_le IS NULL AND ${EST_DOCUMENT_ENVOYE}`);
  const filsConcernes = await n(
    `SELECT count(DISTINCT p.fil_id)::text AS n FROM gestion_fil_periode p
       JOIN gestion_message m ON m.id = p.depuis_message_id
      WHERE p.remplacee_le IS NULL AND ${EST_DOCUMENT_ENVOYE}`);
  const reponsesDansCesFils = await n(
    `SELECT count(*)::text AS n
       FROM gestion_message h
      WHERE h.sens = 'recu' AND h.fil_id IN (
        SELECT p.fil_id FROM gestion_fil_periode p JOIN gestion_message m ON m.id = p.depuis_message_id
         WHERE p.remplacee_le IS NULL AND ${EST_DOCUMENT_ENVOYE})`);

  console.log(`\n${P}LES FENÊTRES DE CONVERSATION (aucune n’est fermée)`);
  console.log(`${P}  fenêtres vivantes ouvertes PAR un document  ${String(fenetresDoc).padStart(7)}`);
  console.log(`${P}  conversations concernées                    ${String(filsConcernes).padStart(7)}`);
  console.log(`${P}  réponses humaines dans ces conversations    ${String(reponsesDansCesFils).padStart(7)}`
    + '   ← elles GARDENT leurs biens');

  console.log(`\n${P}LIENS VERS UN BIEN PORTÉS PAR UN MAIL REÇU  ${String(avant.recusVersBien).padStart(7)}`
    + '   ← doit être identique après');
  console.log(`${P}compteur « Vie du bien » du lot 176          ${String(avant.vieDu176).padStart(7)}`);

  if (!appliquer) {
    console.log('\n🔵 SIMULATION — rien n’a été écrit. Relancez avec --appliquer.');
    await closePool();
    return;
  }

  /**
   * 🔴 UN SEUL UPDATE, UNE SEULE TRANSACTION — le mécanisme de la conversion du 28/09, qu'Arno a cité en exemple.
   * Trente-trois mille gestes unitaires écriraient trente-trois mille lignes de journal pour UNE décision ; c'est
   * la décision qu'on journalise, et le `statut_par_libelle` de chaque ligne dit déjà d'où elle vient.
   */
  console.log('\n🔴 APPLICATION…');
  let retires = 0;
  await withTransaction(async (q) => {
    const maj = await q(
      `UPDATE gestion_rattachement r
          SET statut = 'retire', statut_le = now(), statut_par_libelle = $1, statut_motif = $2
         FROM gestion_message m
        WHERE m.id = r.message_id
          AND r.cible_sorte = 'lot' AND ${VIVANT} AND ${EST_DOCUMENT_ENVOYE} AND NOT ${EST_MANUEL}`,
      [AUTEUR, MOTIF]);
    retires = maj.rowCount ?? 0;
    await q(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
       VALUES ('rattachement', 0, 'retirer en masse', 'vivant', 'retire', $1, $2)`,
      [`${retires} lien(s) « document → bien » retirés : ${MOTIF}. `
        + `${manuels} lien(s) manuel(s) épargné(s). Réversible.`, AUTEUR]);
  });

  const apres = await chiffres();
  console.log(`\nAPRÈS`);
  console.log(`${P}liens retirés                               ${String(retires).padStart(7)}`);
  console.log(`${P}liens vivants « document → bien » restants  ${String(apres.vivantsDocBien).padStart(7)}`
    + `   (= les ${manuels} manuel(s) épargné(s))`);
  console.log(`${P}rattachements AUX BIENS confirmés           ${avant.biensConfirmes} → ${apres.biensConfirmes}`
    + `   (écart ${apres.biensConfirmes - avant.biensConfirmes})`);
  console.log(`${P}liens vers un bien portés par un mail REÇU  ${avant.recusVersBien} → ${apres.recusVersBien}`);
  console.log(`${P}compteur « Vie du bien » du lot 176         ${avant.vieDu176} → ${apres.vieDu176}`);

  const reponsesIntactes = avant.recusVersBien === apres.recusVersBien
    && avant.recusConfirmesVersBien === apres.recusConfirmesVersBien;
  console.log(`\n${reponsesIntactes
    ? '✅ AUCUNE réponse humaine n’a perdu son rattachement à un bien'
    : '🔴 ATTENTION : une réponse humaine a perdu un rattachement — à comprendre AVANT toute suite'}`);
  console.log(`${apres.vivantsDocBien === manuels
    ? `✅ il ne reste que les ${manuels} lien(s) manuel(s), comme demandé`
    : `🔴 ATTENTION : ${apres.vivantsDocBien} liens vivants restants pour ${manuels} manuel(s) attendus`}`);

  await closePool();
  if (!reponsesIntactes || apres.vivantsDocBien !== manuels) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
