/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — REPRENDRE LA MARQUE D'ÉCHANGE EN MARQUE PAR MAIL ═══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (04/10/2026) : « Reprise des données existantes : simulation (nombre et exemples sur les 9 échanges
 * marqués Interne), puis application. »
 *
 * CE QUE CETTE REPRISE FAIT, ET POURQUOI ELLE EST SÛRE. Un échange marqué « Interne » l'est, aujourd'hui, POUR TOUS
 * SES MAILS — c'est la définition même de la marque d'échange (`gestion_fil_interne`, migration 281). Écrire une
 * marque PAR MAIL sur chacun de ses mails ne change donc RIEN à ce qui s'affiche : elle rend explicite ce que le
 * repli disait déjà. Ce qui change, c'est l'avenir : à partir de là, un choix sur un mail ne peut plus emporter
 * les autres.
 *
 * 🔴 LA MARQUE D'ÉCHANGE N'EST PAS RETIRÉE. Elle reste le REPLI, pour les mails qu'aucune fenêtre ne couvre et
 * pour tout échange marqué plus tard. La retirer « puisqu'on a mieux » aurait cassé le repli le jour même.
 *
 * 🔴 L'AUTEUR D'ORIGINE EST CONSERVÉ : la ligne par mail porte le libellé de qui avait marqué l'échange, et non
 * « reprise ». Six mois plus tard, la question qu'on se pose est « qui a décidé ça ? », pas « quel script l'a
 * recopié ». Le motif, lui, dit la reprise.
 *
 * 🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN. C'est le mode par défaut.
 * 🔒 AUCUN `DELETE`, AUCUNE SUPPRESSION, AUCUN APPEL RÉSEAU : il ne lit et n'écrit que notre base.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/reprise-interne-par-mail.ts              # simule
 *   npx tsx --env-file=.env app/scripts/reprise-interne-par-mail.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../lib/db/client';
import { interneDuMessageDisponible } from '../lib/gestion/schema';
import { MOTIF_INTERNE_REPRISE } from '../lib/gestion/interneDuMail';

const APPLIQUER = process.argv.includes('--appliquer');
/** Au plus tant d'exemples affichés : un rapport de cent lignes ne se lit pas. */
const EXEMPLES_MAX = 12;

interface ACreer {
  filId: number;
  messageId: number;
  objet: string;
  recuLe: string;
  /** Le libellé de qui avait marqué l'ÉCHANGE : c'est lui qu'on inscrit, pas le nom du script. */
  auteur: string;
}

/**
 * LES MAILS À REPRENDRE. LECTURE SEULE.
 *
 * 🔴 TROIS CONDITIONS, ET CHACUNE COMPTE :
 *   ① l'échange porte une marque VIVANTE (`gestion_fil_interne.retire_le IS NULL`) ;
 *   ② le mail n'a AUCUNE ligne par mail — ni vivante, ni retirée. Une ligne retirée veut dire « quelqu'un s'est
 *      prononcé », et la reprise n'a pas à défaire un « non » explicite ;
 *   ③ le mail n'est pas à la corbeille de l'application : on ne ressuscite pas un statut sur du courrier jeté.
 */
async function aCreer(): Promise<ACreer[]> {
  const { rows } = await query<{
    fil_id: string; message_id: string; objet: string | null; recu_le: string; auteur: string;
  }>(
    `SELECT m.fil_id::text, m.id::text AS message_id, m.objet,
            to_char(m.recu_le, 'YYYY-MM-DD HH24:MI') AS recu_le,
            i.pose_par_libelle AS auteur
       FROM gestion_fil_interne i
       JOIN gestion_message m ON m.fil_id = i.fil_id AND m.corbeille_le IS NULL
      WHERE i.retire_le IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM gestion_message_interne mi WHERE mi.message_id = m.id
        )
      ORDER BY m.fil_id, m.recu_le`);
  return rows.map((r) => ({
    filId: Number(r.fil_id), messageId: Number(r.message_id),
    objet: (r.objet ?? '(sans objet)').slice(0, 40), recuLe: r.recu_le, auteur: r.auteur,
  }));
}

async function main(): Promise<void> {
  if (!(await interneDuMessageDisponible())) {
    console.error('🔴 la migration 297 n’est pas appliquée : `gestion_message_interne` n’existe pas.');
    console.error('   Rien n’a été lu, rien n’a été écrit.');
    process.exit(1);
  }

  const { rows: marques } = await query<{ n: string }>(
    `SELECT count(DISTINCT fil_id)::text AS n FROM gestion_fil_interne WHERE retire_le IS NULL`);
  const { rows: deja } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_message_interne WHERE retire_le IS NULL`);

  const liste = await aCreer();
  const fils = new Set(liste.map((x) => x.filId));

  console.log(`échanges marqués « Interne » (marque d’échange vivante) : ${marques[0]?.n ?? '?'}`);
  console.log(`marques PAR MAIL déjà vivantes avant la reprise          : ${deja[0]?.n ?? '?'}`);
  console.log(`${APPLIQUER ? '🔴 APPLICATION' : 'SIMULATION'} — ${liste.length} marque(s) par mail à créer, `
    + `sur ${fils.size} échange(s)\n`);

  for (const x of liste.slice(0, EXEMPLES_MAX)) {
    console.log(`  échange ${x.filId} · mail ${x.messageId} · ${x.recuLe} · « ${x.objet} » · ${x.auteur}`);
  }
  if (liste.length > EXEMPLES_MAX) console.log(`  … et ${liste.length - EXEMPLES_MAX} autre(s)`);

  if (!APPLIQUER) {
    console.log('\nAucune écriture. Relancer avec --appliquer pour reprendre.');
    return;
  }
  if (liste.length === 0) { console.log('\nRien à reprendre.'); return; }

  /**
   * 🔴 UNE SEULE INSTRUCTION, ET L'AUTEUR D'ORIGINE PAR LIGNE. `jsonb_to_recordset` évite une boucle de requêtes
   * et toute interpolation de valeur. `ON CONFLICT DO NOTHING` sur l'index partiel des vivantes : relancer la
   * reprise ne crée aucun doublon et ne fait perdre aucune date.
   */
  const { rows: faits } = await query<{ id: string }>(
    `INSERT INTO gestion_message_interne (message_id, pose_par_libelle, retire_motif)
     SELECT x.message_id, x.auteur, NULL
       FROM jsonb_to_recordset($1::jsonb) AS x(message_id bigint, auteur text)
     ON CONFLICT (message_id) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [JSON.stringify(liste.map((x) => ({ message_id: x.messageId, auteur: x.auteur })))]);

  console.log(`\n🔴 ${faits.length} marque(s) par mail créée(s).`);

  /* 🔴 LE JOURNAL, pour qu'on sache dans six mois d'où viennent ces lignes. Au mieux-effort : son échec ne défait
     pas une reprise qui a eu lieu. */
  try {
    await query(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('message', 0, 'reprise_interne_par_mail', $1, $2, $3, NULL, $4)`,
      [
        `${fils.size} échange(s) marqué(s) « Interne »`,
        `${faits.length} marque(s) par mail créée(s)`,
        `Reprise de la marque d’ÉCHANGE (gestion_fil_interne) en marque PAR MAIL (gestion_message_interne, `
          + `migration 297). La marque d’échange n’est PAS retirée : elle reste le repli pour les mails qu’aucune `
          + `fenêtre ne couvre. L’auteur d’origine est conservé ligne par ligne. Aucune suppression.`,
        MOTIF_INTERNE_REPRISE,
      ]);
  } catch (e) {
    console.error('[reprise-interne] bilan NON journalisé', e);
  }
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
