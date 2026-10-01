/**
 * ══ 🔴🔴 LOT BULLE-INFO-ET-S12 — « LA FENÊTRE GAGNE », APPLIQUÉ À L'EXISTANT ══════════════════════════════════
 *
 * DÉCISION D'ARNO (01/10/2026) : « Un mail entrant dans une conversation qui a une fenêtre en cours : la FENÊTRE
 * GAGNE. Si l'adresse de l'expéditeur désigne un AUTRE bien, ce bien devient une proposition DÉCOCHÉE. Reprends
 * les mails déjà concernés : les liens d'expéditeur posés en plus de la fenêtre, et jamais touchés par une
 * personne, deviennent des propositions décochées. »
 *
 *   npm run gestion:fenetre:reprise                → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:fenetre:reprise -- --appliquer  → elle écrit
 *
 * ═══ 🔴 CE QU'ELLE NE TOUCHE JAMAIS ════════════════════════════════════════════════════════════════════════════
 *
 *   · un lien qu'une PERSONNE a posé ou touché (`origine = 'manuel'`, ou `statut_par_libelle` renseigné) ;
 *   · un lien que la FENÊTRE elle-même a posé (son motif le dit — voir `MOTIF_POSE_PAR_SUIVI`) ;
 *   · un lien sur un bien que la fenêtre porte AUSSI : il dit la même chose qu'elle, il n'y a rien à arbitrer.
 *
 * 🔴 ELLE NE RETIRE RIEN : elle fait passer de `confirme` à `propose`. Le lien reste, décoché, à un clic — et
 * `statut_par_libelle` RESTE VIDE, pour que le moteur puisse continuer de le gérer comme sa proposition.
 */
import { query, withTransaction } from '../lib/db/client';
import { classementParMail, MOTIF_POSE_PAR_SUIVI } from '../lib/gestion/periodeRepo';
import { faceALaFenetre } from '../lib/gestion/periodesConversation';
import { periodesDisponibles, rattachementsDisponibles } from '../lib/gestion/schema';

const P = '  ';
const EXEMPLES = 15;
const MOTIF = 'la fenêtre de la conversation l’emporte : ce bien devient une proposition';

interface Candidat {
  id: number; messageId: number; filId: number; cle: string; libelle: string; motif: string;
  fenetre: string;
}

async function confirmes(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM gestion_rattachement WHERE statut = 'confirme'");
  return rows[0]?.n ?? 0;
}

/** Les liens d'EXPÉDITEUR confirmés que la fenêtre de leur conversation ne porte pas. LECTURE SEULE. */
async function aArbitrer(): Promise<Candidat[]> {
  // ① Les conversations qui ont une fenêtre vivante — elles seules peuvent créer un désaccord.
  const { rows: fils } = await query<{ fil_id: string }>(
    'SELECT DISTINCT fil_id::text FROM gestion_fil_periode WHERE remplacee_le IS NULL');
  const filIds = fils.map((f) => Number(f.fil_id));
  if (filIds.length === 0) return [];
  const fenetres = await classementParMail(filIds);

  // ② Les liens CONFIRMÉS que le moteur a posés sur ces conversations, et qu'aucune personne n'a touchés.
  const { rows } = await query<{
    id: string; message_id: string; fil_id: string; cible_cle: string; cible_libelle: string | null;
    motif: string | null;
  }>(
    `SELECT r.id::text, r.message_id::text, m.fil_id::text, r.cible_cle, r.cible_libelle, r.motif
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE m.fil_id = ANY($1::bigint[]) AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
        AND r.piece_id IS NULL AND r.origine = 'automatique' AND r.statut_par_libelle IS NULL
        AND coalesce(r.motif, '') <> $2`, [filIds, MOTIF_POSE_PAR_SUIVI]);

  const out: Candidat[] = [];
  for (const r of rows) {
    const f = fenetres.get(Number(r.message_id));
    if (faceALaFenetre(f, r.cible_cle) === 'confirme') continue;   // la fenêtre dit la même chose : rien à faire
    out.push({
      id: Number(r.id), messageId: Number(r.message_id), filId: Number(r.fil_id),
      cle: r.cible_cle, libelle: r.cible_libelle ?? r.cible_cle, motif: r.motif ?? '',
      fenetre: f === undefined ? '(aucune)'
        : f.sorte === 'biens' ? (f.biens.map((b) => b.cle).join(', ') || '(aucun bien)') : f.sorte,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  if (!(await rattachementsDisponibles()) || !(await periodesDisponibles())) {
    console.error('Migrations 257 / 290 absentes : rien à faire.');
    process.exit(1);
  }

  const avant = await confirmes();
  const liste = await aArbitrer();
  console.log('\nAVANT');
  console.log(`${P}rattachements confirmés (toutes conversations)  ${avant}`);
  console.log(`${P}liens d’expéditeur en désaccord avec leur fenêtre  ${liste.length}`);
  console.log(`${P}sur ${new Set(liste.map((x) => x.filId)).size} conversation(s)`);

  console.log(`\n${Math.min(EXEMPLES, liste.length)} EXEMPLES`);
  for (const x of liste.slice(0, EXEMPLES)) {
    console.log(`${P}mail ${String(x.messageId).padEnd(6)} fil ${String(x.filId).padEnd(6)} `
      + `lien sur ${x.cle.padEnd(6)} — la fenêtre dit : ${x.fenetre}`);
    console.log(`${P}       « ${x.motif.slice(0, 70)} »`);
  }

  if (!appliquer) {
    console.log('\n🔵 SIMULATION — rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  /**
   * 🔴 UNE SEULE TRANSACTION PAR LIEN, ET UNE LIGNE DE JOURNAL POUR CHACUN. Un lien qui passe de « confirmé » à
   * « proposé » DISPARAÎT de l'historique d'un bien : « pourquoi ce mail n'est-il plus dans ce dossier ? » doit
   * avoir une réponse datée, et c'est le journal qui la porte.
   *
   * ⚠️ `statut_par_libelle` RESTE VIDE : sans quoi le moteur considérerait la ligne comme touchée par un humain
   * et ne la gérerait plus jamais. Le motif, lui, dit ce qui s'est passé.
   */
  console.log(`\n🔴 ARBITRAGE de ${liste.length} lien(s)…`);
  let faits = 0;
  for (const x of liste) {
    await withTransaction(async (q) => {
      const maj = await q(
        `UPDATE gestion_rattachement
            SET statut = 'propose', statut_le = now(), statut_motif = $2
          WHERE id = $1 AND statut = 'confirme' AND origine = 'automatique' AND statut_par_libelle IS NULL`,
        [x.id, MOTIF]);
      if ((maj.rowCount ?? 0) === 0) return;
      faits += 1;
      await q(
        `INSERT INTO gestion_journal
           (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
         VALUES ('rattachement', $1, 'remettre en proposition', 'confirme', 'propose', $2, $3)`,
        [x.id, `${MOTIF} (la fenêtre porte : ${x.fenetre})`, 'arbitrage « la fenêtre gagne »']);
    });
  }

  const apres = await confirmes();
  console.log('\nAPRÈS');
  console.log(`${P}rattachements confirmés  ${apres}`);
  console.log(`${P}liens devenus propositions  ${faits}`);
  const ecart = avant - apres;
  console.log(`\n${ecart === faits
    ? `✅ écart de ${ecart} confirmé(s) en moins, et ce sont EXACTEMENT les ${faits} liens arbitrés`
    : `🔴 ATTENTION : écart de ${ecart} pour ${faits} liens arbitrés — à comprendre avant d’aller plus loin`}`);
  if (ecart !== faits) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
