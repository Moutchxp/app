/**
 * CR-2b1 — DRY-RUN DE SÉLECTION RGPD « qui n'envoie RIEN ». Pour chaque dossier ayant un Cerfa en GED, montre PAGE PAR PAGE le
 * JOURNAL DE TRANSMISSION : les pages qui SERAIENT envoyées à l'IA (avec leur cible) et les pages REFUSÉES avec leur MOTIF. Cette
 * commande ne contacte JAMAIS Mistral — elle prouve, avant qu'un octet ne sorte, ce que la sélection par contenu déciderait.
 *
 * Lecture des pages = pdfjs LOCAL (extrairePagesPdf). Pièces Cerfa = ids du précalcul best-of (identifiées PAR CONTENU). Aucun réseau
 * vers un tiers, aucune écriture. Résilient : best-of/pièce absents → « aucune pièce Cerfa ».
 *
 * Lancer : npm run permis:selection-pages-ia [-- 468 470 531 7424]   (par défaut : tous les dossiers avec Cerfa au best-of)
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { extrairePagesPdf } from '../lib/permis/extractionPdf';
import { selectionnerPagesIa } from '../lib/permis/selectionPagesCerfaIa';

async function piecesCerfa(dossierId: number): Promise<{ id: number; nom: string; typeMime: string | null; cle: string }[]> {
  const { rows } = await query<{ id: number; nom_fichier: string; type_mime: string | null; cle_stockage: string }>(
    `SELECT dd.id::int AS id, dd.nom_fichier, dd.type_mime, dd.cle_stockage
       FROM dossier_document dd
      WHERE dd.dossier_id = $1
        AND dd.id IN (SELECT jsonb_array_elements_text(resultat->'cerfaIds')::int FROM permis_best_of_precalcul WHERE dossier_id = $1 AND type = 'best_of')
      ORDER BY dd.id`, [dossierId]);
  return rows.map((r) => ({ id: r.id, nom: r.nom_fichier, typeMime: r.type_mime, cle: r.cle_stockage }));
}

async function cibles(): Promise<number[]> {
  const args = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  if (args.length) return args;
  const { rows } = await query<{ dossier_id: number | string }>(
    `SELECT DISTINCT dossier_id FROM permis_best_of_precalcul WHERE type='best_of' AND resultat->'cerfaIds' <> '[]'::jsonb ORDER BY dossier_id`);
  return rows.map((r) => Number(r.dossier_id));
}

async function main(): Promise<void> {
  const ids = await cibles();
  console.log(`[selection-pages-ia] DRY-RUN — AUCUN appel à Mistral. ${ids.length} dossier(s).`);
  const { recuperer } = await import('../lib/stockage');
  for (const id of ids) {
    const pieces = await piecesCerfa(id);
    console.log(`\n===== dossier ${id} =====`);
    if (pieces.length === 0) { console.log('  aucune pièce Cerfa (best-of sans cerfaIds).'); continue; }
    for (const p of pieces) {
      let pagesTexte: { page: number; texte: string }[] = [];
      try {
        const buf = await recuperer(p.cle);
        const ex = await extrairePagesPdf(buf, p.typeMime);
        if (ex.ok) pagesTexte = ex.pages.map((t, i) => ({ page: i + 1, texte: t }));
      } catch (e) { console.log(`  ${p.nom} — lecture impossible : ${e instanceof Error ? e.message : String(e)}`); continue; }
      const sel = selectionnerPagesIa(pagesTexte);
      console.log(`  pièce « ${p.nom} » (${pagesTexte.length} pages) :`);
      console.log(`    → ENVOYÉES (${sel.envoyees.length}) : ${sel.envoyees.map((e) => `p${e.page} [${e.cibles.join('+')}]`).join(', ') || '(aucune — abstention)'}`);
      const refCible = sel.refusees.filter((r) => !/aucune cible/.test(r.motif)); // on ne liste que les refus INTÉRESSANTS (cible mais refusée / plafond)
      if (refCible.length) console.log(`    → REFUSÉES malgré une cible : ${refCible.map((r) => `p${r.page} (${r.motif})`).join(' ; ')}`);
      console.log(`    → (${sel.refusees.length - refCible.length} pages sans cible, non listées)`);
    }
  }
  console.log('\n[selection-pages-ia] Terminé. AUCUNE donnée n’a quitté la machine.');
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:selection-pages-ia] échec', e); process.exitCode = 1; }).finally(() => closePool());
