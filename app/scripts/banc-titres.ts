/**
 * P5 — TEST À CRITÈRE D'ARRÊT : les étiquettes de lot (2D1/2D2) se séparent-elles en DEUX POPULATIONS de taille de police
 * (TITRES de coupe vs ANNOTATIONS de détail) ? pdfjs expose la taille avec la position. Script ISOLÉ : aucune écriture, aucune
 * migration, aucun appel métier. On MESURE ; l'humain tranche.
 *
 * CRITÈRE D'ARRÊT (posé d'avance) : si les tailles NE séparent PAS nettement en deux populations → on ARRÊTE l'attribution auto.
 * SI et seulement si deux populations se dégagent : on recalcule le rattachement en n'utilisant QUE les étiquettes « titre »
 * (les plus grosses), et on regarde si le continuum de ratios disparaît. Aucun seuil décidé ici : on rapporte l'écart OBSERVÉ.
 * Lancer : npm run permis:banc-titres -- --permis <num_dau> [--type PC|PD]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

interface Item { str: string; x: number; y: number; taille: number }

async function itemsPage(buf: Buffer, page: number): Promise<Item[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(page)).getTextContent();
  const items = (tc.items as { str?: string; transform?: number[]; height?: number }[]).map((it) => {
    const t = it.transform ?? [];
    const taille = it.height && it.height > 0 ? it.height : Math.hypot(t[2] ?? 0, t[3] ?? 0);
    return { str: (it.str ?? '').trim(), x: t[4] ?? 0, y: t[5] ?? 0, taille };
  }).filter((i) => i.str !== '');
  await doc.destroy();
  return items;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function main(): Promise<void> {
  const resolu = await resoudreDossier(lireArg('--permis') ?? '', lireArg('--type'));
  if (!resolu.ok) { console.error('[banc-titres] usage : -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  const rapport = extraireCandidats(await lireGedPermis(resolu.dossier.dossierId, deps));

  const acro = rapport.cotes.filter((c) => c.qualificatifSommet === 'acrotère');
  const parPage = new Map<string, { pieceId: number; piece: string; page: number; valeurs: Set<number> }>();
  for (const c of acro) { const k = `${c.provenance.pieceId}:${c.provenance.page}`; const e = parPage.get(k) ?? { pieceId: c.provenance.pieceId, piece: c.provenance.pieceNom, page: c.provenance.page, valeurs: new Set<number>() }; e.valeurs.add(c.valeur); parPage.set(k, e); }
  const bufP = new Map<number, Buffer>();
  const buf = async (id: number, cle: string) => bufP.get(id) ?? (bufP.set(id, await deps.lireObjet(cle)), bufP.get(id)!);

  type Etq = { piece: string; page: number; lot: '2D1' | '2D2'; x: number; y: number; taille: number };
  const etiquettes: Etq[] = [];
  const taillesCotes: number[] = [];
  const pagesData: { piece: string; page: number; items: Item[]; vals: Set<number> }[] = [];

  for (const e of [...parPage.values()].sort((a, b) => a.piece.localeCompare(b.piece) || a.page - b.page)) {
    const meta = metas.find((m) => m.id === e.pieceId); if (!meta) continue;
    const items = await itemsPage(await buf(e.pieceId, meta.cleStockage), e.page);
    pagesData.push({ piece: e.piece, page: e.page, items, vals: e.valeurs });
    for (const it of items) {
      if (/2D1\b/.test(it.str)) etiquettes.push({ piece: e.piece, page: e.page, lot: '2D1', x: it.x, y: it.y, taille: it.taille });
      else if (/2D2\b/.test(it.str)) etiquettes.push({ piece: e.piece, page: e.page, lot: '2D2', x: it.x, y: it.y, taille: it.taille });
    }
    for (const v of e.valeurs) { const re = new RegExp(`(?<![\\d])${String(v).replace('.', '[.,]')}(?![\\d])`); for (const it of items.filter((i) => re.test(i.str.replace(',', '.')) || re.test(i.str))) taillesCotes.push(it.taille); }
  }

  console.log(`\n══════ P5 — TAILLES DE POLICE DES ÉTIQUETTES DE LOT — ${resolu.dossier.numDau} ══════`);
  console.log(`\n[a] ${etiquettes.length} occurrences 2D1/2D2 · taille · position (par page) :`);
  for (const e of etiquettes.sort((a, b) => a.piece.localeCompare(b.piece) || a.page - b.page || b.taille - a.taille)) {
    console.log(`  ${e.piece.slice(0, 10)} p.${e.page} · ${e.lot} · taille ${e.taille.toFixed(1).padStart(6)} · (${e.x | 0},${e.y | 0})`);
  }

  const tailles = etiquettes.map((e) => e.taille).sort((a, b) => a - b);
  console.log(`\n[b] DISTRIBUTION DES TAILLES (tri croissant) — deux populations, ou continuum ?`);
  console.log('  ' + tailles.map((t) => t.toFixed(1)).join(' · '));
  let saut = { a: 0, b: 0, ecart: 0 };
  for (let i = 1; i < tailles.length; i++) { const ec = tailles[i] - tailles[i - 1]; if (ec > saut.ecart) saut = { a: tailles[i - 1], b: tailles[i], ecart: ec }; }
  const etendue = tailles.length ? tailles[tailles.length - 1] - tailles[0] : 0;
  console.log(`  → plus grand saut : ${saut.a.toFixed(1)} → ${saut.b.toFixed(1)} (écart ${saut.ecart.toFixed(1)}) · étendue totale ${etendue.toFixed(1)} · ratio saut/étendue ${etendue ? (saut.ecart / etendue).toFixed(2) : '—'}`);
  console.log(`\n[d] taille des COTES elles-mêmes : médiane ${median(taillesCotes).toFixed(1)} (n=${taillesCotes.length}) · médiane des étiquettes ${median(tailles).toFixed(1)} · rapport ${(median(tailles) / median(taillesCotes)).toFixed(2)}`);

  // Le saut sépare-t-il en DEUX populations franches ? (le saut vaut-il une part notable de l'étendue, et laisse-t-il un groupe de chaque côté ?)
  const seuil = (saut.a + saut.b) / 2;
  const gros = etiquettes.filter((e) => e.taille >= seuil);
  const petit = etiquettes.filter((e) => e.taille < seuil);
  const bimodal = etendue > 0 && saut.ecart / etendue >= 0.5 && gros.length >= 2 && petit.length >= 2;
  console.log(`\n[c] Deux populations ? saut/étendue=${etendue ? (saut.ecart / etendue).toFixed(2) : '—'} · au-dessus du saut : ${gros.length} · en-dessous : ${petit.length}`);

  if (!bimodal) {
    console.log(`\n══════ CRITÈRE D'ARRÊT : ATTEINT ══════`);
    console.log(`  Les tailles ne se séparent PAS en deux populations franches (pas de « titres » distincts des annotations).`);
    console.log(`  → ON ARRÊTE l'attribution automatique. On garde ce qui marche : un corps, sommet = max des acrotères,`);
    console.log(`    confiance « à vérifier », réserve « peut appartenir à un bâtiment voisin ». Pas de rattrapage.`);
    console.log('');
    return;
  }

  // Deux populations : on recalcule le rattachement AVEC LES SEULS « GROS » (titres), et on regarde la distribution des ratios.
  console.log(`\n[e] DEUX POPULATIONS détectées → rattachement recalculé avec les SEULES étiquettes « titre » (taille ≥ ${seuil.toFixed(1)}) :`);
  const ratios: number[] = [];
  for (const pg of pagesData) {
    const l1 = etiquettes.filter((e) => e.piece === pg.piece && e.page === pg.page && e.lot === '2D1' && e.taille >= seuil);
    const l2 = etiquettes.filter((e) => e.piece === pg.piece && e.page === pg.page && e.lot === '2D2' && e.taille >= seuil);
    if (!l1.length || !l2.length) continue;
    for (const v of pg.vals) { const re = new RegExp(`(?<![\\d])${String(v).replace('.', '[.,]')}(?![\\d])`); for (const it of pg.items.filter((i) => re.test(i.str.replace(',', '.')) || re.test(i.str))) { const d1 = Math.min(...l1.map((p) => dist(it, p))), d2 = Math.min(...l2.map((p) => dist(it, p))); ratios.push(Math.max(d1, d2) / Math.min(d1, d2)); } }
  }
  ratios.sort((a, b) => a - b);
  console.log('  ratios (titres seuls) : ' + ratios.map((r) => r.toFixed(2)).join(' · '));
  console.log(`  → à toi de juger si le continuum a disparu (${ratios.filter((r) => r < 2).length}/${ratios.length} encore < 2).`);
  console.log('');
}

void main().catch((e) => { console.error('[banc-titres] échec', e); process.exitCode = 1; }).finally(() => closePool());
