/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE (point 0) — LES RÉPONSES HUMAINES REVIENNENT DANS LA RÉCEPTION ══════════
 *
 * DÉCISION D'ARNO (02/10/2026) : « Les réponses humaines reviennent dans la Réception générale. »
 *
 * ═══ CE QUE L'ANALYSE A MONTRÉ ══════════════════════════════════════════════════════════════════════════════════
 *
 * Une seule règle d'exclusion est allumée : l'objet, une fois les chiffres retirés, vaut « Document CRITERIMMO ».
 * Or `normaliserObjet` retire d'abord les « Re: » et les « Fwd: ». Donc :
 *
 *     « Re: Document CRITERIMMO - Quittance COLSON septembre »  →  « Document CRITERIMMO »  →  écarté.
 *
 * MESURÉ SUR LA BASE : 2 631 mails REÇUS sont ainsi écartés, répartis sur 1 633 conversations, dont 893 portent
 * une pièce jointe. Sur 30 tirés au hasard et lus un par un, 30 sont écrits par une personne — locataires,
 * propriétaires, prestataires. Du courrier client que personne ne voyait.
 *
 * ═══ CE QUE CE SCRIPT FAIT, ET RIEN D'AUTRE ═════════════════════════════════════════════════════════════════════
 *
 *   ① la règle n° 5 passe de « les deux sens » à « ENVOYÉ seulement » ;
 *   ② les mails REÇUS qu'elle avait écartés sont remis dans la file (`exclu_le` remis à vide).
 *
 * 🔴 ELLE NE TOUCHE PAS AUX ENVOIS. Les 28 275 documents que NOUS envoyons restent rangés en « Courrier
 * automatique », exactement comme aujourd'hui : c'est le point B de ce lot qui s'en occupera.
 *
 * 🔴 ET ELLE NE RANGE RIEN. Un mail qui revient dans la file n'est ni classé, ni rattaché, ni marqué lu : il
 * redevient simplement visible. Les rattachements que le moteur avait déjà posés sur lui ne bougent pas.
 *
 *   npm run gestion:auto:reponses                → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:auto:reponses -- --appliquer  → elle écrit
 */
import { query, withTransaction } from '../lib/db/client';

const P = '  ';
const REGLE_DOCUMENT = 5;
const EXEMPLES = 12;

async function compte(sql: string): Promise<number> {
  const { rows } = await query<{ n: number }>(sql);
  return rows[0]?.n ?? 0;
}

async function chiffres(): Promise<{ exclus: number; recus: number; fils: number; sens: string }> {
  const { rows: r } = await query<{ sens: string }>(
    'SELECT sens FROM gestion_regle_exclusion WHERE id = $1', [REGLE_DOCUMENT]);
  return {
    exclus: await compte("SELECT count(*)::int AS n FROM gestion_message WHERE exclu_le IS NOT NULL"),
    recus: await compte(
      "SELECT count(*)::int AS n FROM gestion_message WHERE exclu_le IS NOT NULL AND sens = 'recu'"),
    fils: await compte(
      `SELECT count(*)::int AS n FROM gestion_fil f
        WHERE EXISTS (SELECT 1 FROM gestion_message m2 WHERE m2.fil_id = f.id)
          AND NOT EXISTS (SELECT 1 FROM gestion_message ml WHERE ml.fil_id = f.id AND ml.exclu_le IS NULL)`),
    sens: r[0]?.sens ?? '(règle absente)',
  };
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const avant = await chiffres();

  console.log('\nAVANT');
  console.log(`${P}règle n° ${REGLE_DOCUMENT} : sens = ${avant.sens}`);
  console.log(`${P}messages écartés              ${avant.exclus}`);
  console.log(`${P}dont REÇUS (à remettre)       ${avant.recus}`);
  console.log(`${P}conversations « automatique » ${avant.fils}`);

  const { rows: ex } = await query<{ id: string; le: string; de: string; objet: string | null }>(
    `SELECT id::text, recu_le::date::text AS le, de_adresse AS de, objet
       FROM gestion_message WHERE exclu_le IS NOT NULL AND sens = 'recu'
       ORDER BY recu_le DESC LIMIT $1`, [EXEMPLES]);
  console.log(`\n${ex.length} DES MAILS QUI REVIENDRAIENT (les plus récents)`);
  for (const m of ex) {
    console.log(`${P}${m.le}  ${m.de.slice(0, 32).padEnd(32)}  « ${(m.objet ?? '').slice(0, 58)} »`);
  }

  if (!appliquer) {
    console.log('\n🔵 SIMULATION — rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  /**
   * 🔴 UNE SEULE TRANSACTION : la règle et la reprise forment UNE décision. Changer la règle sans remettre les
   * mails laisserait 2 631 courriers invisibles pour toujours ; remettre les mails sans changer la règle les
   * ferait réécarter à la prochaine relève.
   *
   * ⚠️ ON JOURNALISE, parce qu'un mail qui REPARAÎT dans une boîte se remarque : « pourquoi ces 2 631 mails
   * sont-ils arrivés d'un coup ? » doit avoir une réponse datée.
   */
  console.log('\n🔴 APPLICATION…');
  let remis = 0;
  await withTransaction(async (q) => {
    await q(`UPDATE gestion_regle_exclusion
                SET sens = 'envoye', maj_le = now()
              WHERE id = $1 AND sens <> 'envoye'`, [REGLE_DOCUMENT]);
    const maj = await q(
      `UPDATE gestion_message
          SET exclu_le = NULL, exclu_par_regle_id = NULL, exclu_motif = NULL
        WHERE exclu_le IS NOT NULL AND sens = 'recu' AND exclu_par_regle_id = $1`, [REGLE_DOCUMENT]);
    remis = maj.rowCount ?? 0;
    await q(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
       VALUES ('regle', $1, 'restreindre aux envois', 'les_deux', 'envoye', $2, $3)`,
      [REGLE_DOCUMENT,
        `${remis} mail(s) REÇUS remis dans la file : une réponse à un document n'est pas un document`,
        'reprise « réponses humaines »']);
  });

  const apres = await chiffres();
  console.log('\nAPRÈS');
  console.log(`${P}règle n° ${REGLE_DOCUMENT} : sens = ${apres.sens}`);
  console.log(`${P}messages écartés              ${apres.exclus}  (${avant.exclus - apres.exclus} de moins)`);
  console.log(`${P}dont REÇUS                    ${apres.recus}`);
  console.log(`${P}conversations « automatique » ${apres.fils}  (${avant.fils - apres.fils} de moins)`);
  console.log(`\n${avant.exclus - apres.exclus === remis && apres.recus === 0
    ? `✅ ${remis} mails reçus sont revenus dans la Réception, et plus aucun reçu n'est écarté`
    : `🔴 ATTENTION : ${remis} remis pour un écart de ${avant.exclus - apres.exclus} — à comprendre`}`);
  if (avant.exclus - apres.exclus !== remis || apres.recus !== 0) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
