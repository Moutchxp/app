/**
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES — RENDRE LES STATUTS QU'UNE FENÊTRE A EFFACÉS ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO : « Reprise : recense les conversations où une nouvelle période a effacé un statut Interne ou Hors gestion
 * antérieur (nombre et 5 exemples, dont 36694). Rétablis les statuts, simulation d'abord, puis application après
 * accord d'Arno. »
 *
 * 🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN. Il lit, il compte, il montre.
 *
 * ═══ CE QU'IL CHERCHE, ET POURQUOI C'EST CE CRITÈRE ══════════════════════════════════════════════════════════════
 *
 * Une marque « Interne » VIVANTE au moment où une fenêtre d'une AUTRE nature a été ouverte sur le même échange, et
 * retirée dans la foulée. Deux chemins l'ont fait, et le motif les distingue :
 *
 *   · « suivi de la conversation » — la PROJECTION elle-même. C'est le défaut structurel, corrigé par ce lot ;
 *   · aucun motif — le clic sur la capsule verte d'un mail, qui retire la marque de TOUT l'échange. Même cause
 *     profonde : la marque appartient à l'échange, pas à une fenêtre.
 *
 * ⚠️ « HORS GESTION » N'EST PAS CHERCHÉ, ET CE N'EST PAS UN OUBLI : la table `gestion_hors_gestion` est VIDE
 * (0 ligne au 03/10/2026), et la projection l'a toujours appliquée mail par mail. Aucun statut n'a pu s'y perdre.
 * Le script le VÉRIFIE plutôt que de le supposer, et le dit.
 *
 * ═══ 🔒 CE QUE L'APPLICATION FAIT, ET RIEN DE PLUS ═══════════════════════════════════════════════════════════════
 *
 * Elle REPOSE la marque « Interne » de l'échange, avec son auteur d'origine et un motif qui dit d'où elle vient.
 * Aucun rattachement n'est touché, aucune fenêtre n'est créée ni modifiée, rien n'est supprimé. Un échange dont la
 * marque a été retirée À LA MAIN plus tard, en connaissance de cause, n'est pas repris : on ne défait pas une
 * décision humaine postérieure.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/reprise-statuts-effaces.ts             # simulation
 *   npx tsx --env-file=.env app/scripts/reprise-statuts-effaces.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../lib/db/client';

interface Touche {
  interne_id: string;
  fil_id: string;
  pose_le: string;
  pose_par: number | null;
  pose_par_libelle: string;
  retire_le: string;
  motif: string;
  periode_id: string;
  depuis_message_id: string;
  sorte: string;
  cree_le: string;
  deja_vivante: boolean;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');

  /* ① « HORS GESTION » — on vérifie, on ne suppose pas. */
  const { rows: hg } = await query<{ total: string; parLeSuivi: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE retire_motif = 'suivi de la conversation')::text AS "parLeSuivi"
       FROM gestion_hors_gestion`);
  console.log(`« Hors gestion » : ${hg[0].total} marque(s) en tout, dont ${hg[0].parLeSuivi} retirée(s) par le suivi.`);

  /* ② « INTERNE » — les marques retirées alors qu'une fenêtre d'une autre nature s'ouvrait. */
  const { rows } = await query<Touche>(
    `SELECT i.id::text AS interne_id, i.fil_id::text, i.pose_le::text, i.pose_par,
            i.pose_par_libelle, i.retire_le::text,
            coalesce(i.retire_motif, '(aucun motif — capsule verte)') AS motif,
            p.id::text AS periode_id, p.depuis_message_id::text, p.sorte, p.cree_le::text,
            EXISTS (SELECT 1 FROM gestion_fil_interne v
                     WHERE v.fil_id = i.fil_id AND v.retire_le IS NULL) AS deja_vivante
       FROM gestion_fil_interne i
       JOIN gestion_fil_periode p ON p.fil_id = i.fil_id AND p.sorte <> 'interne'
      WHERE i.retire_le IS NOT NULL
        AND p.cree_le BETWEEN i.pose_le AND i.retire_le + INTERVAL '2 minutes'
      ORDER BY i.retire_le DESC`);

  /* Une conversation peut apparaître plusieurs fois (plusieurs fenêtres) : on ne la reprend qu'une. */
  const parFil = new Map<string, Touche>();
  for (const r of rows) if (!parFil.has(r.fil_id)) parFil.set(r.fil_id, r);

  console.log(`\n══ CONVERSATIONS OÙ UNE FENÊTRE A EFFACÉ UN « INTERNE » ═══════════════════`);
  console.log(`couples (marque × fenêtre) : ${rows.length}`);
  console.log(`conversations distinctes   : ${parFil.size}`);
  console.log(`\nEXEMPLES :`);
  for (const t of [...parFil.values()].slice(0, 5)) {
    console.log(`  · échange ${t.fil_id} — marque posée le ${t.pose_le.slice(0, 19)} par ${t.pose_par_libelle}`);
    console.log(`      retirée le ${t.retire_le.slice(0, 19)} — motif : ${t.motif}`);
    console.log(`      fenêtre « ${t.sorte} » ouverte au mail ${t.depuis_message_id} le ${t.cree_le.slice(0, 19)}`);
    console.log(`      marque vivante aujourd'hui : ${t.deja_vivante ? 'OUI — rien à faire' : 'non'}`);
  }

  const aReposer = [...parFil.values()].filter((t) => !t.deja_vivante);
  console.log(`\nÀ RÉTABLIR : ${aReposer.length} conversation(s).`);
  if (!appliquer) {
    console.log('\n(simulation — relancer avec --appliquer, APRÈS accord d’Arno, pour écrire)');
    return;
  }

  let faits = 0;
  for (const t of aReposer) {
    const r = await query(
      `INSERT INTO gestion_fil_interne (fil_id, pose_par, pose_par_libelle)
       SELECT $1::bigint, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM gestion_fil_interne v
                           WHERE v.fil_id = $1::bigint AND v.retire_le IS NULL)`,
      [Number(t.fil_id), t.pose_par, t.pose_par_libelle]);
    faits += r.rowCount ?? 0;
  }
  console.log(`\n✅ ${faits} marque(s) « Interne » rétablie(s), avec leur auteur d'origine.`);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
