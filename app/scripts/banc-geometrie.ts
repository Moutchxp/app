/**
 * P3 — BANC GÉOMÉTRIE JETABLE : peut-on CALCULER l'attribution d'une cote à un lot, au lieu de la deviner ? Script ISOLÉ :
 * aucune écriture en base, aucune migration, aucun appel depuis un module métier ; adaptateurIaPhoto intouché.
 *
 * Deux voies mesurées sur la planche critique :
 *  1. NATIVE (défaut) — les cotes et repères sont du TEXTE VECTORIEL dans le PDF ; pdfjs expose leurs COORDONNÉES (transform).
 *     On calcule la distance entre la cote et chaque repère de lot. ⚠️ On RAPPORTE les distances ; on ne conclut PAS « le plus
 *     proche gagne » (la proximité d'un libellé ne prouve pas l'appartenance — décision humaine).
 *  2. OCR (`--ocr`) — Mistral OCR (mistral-ocr-latest) : contrôle empirique. Sur ces plans d'ingénierie, l'OCR classe le dessin
 *     en bloc « image » et NE lit PAS les cotes internes → voie inopérante ici (mesuré, reproductible).
 * Lancer : npm run permis:banc-geometrie -- --permis <num_dau> [--type PC|PD] [--page-critique PC3:2] [--cote 89.46] [--lots 2D1,2D2] [--ocr]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resoudreDossier, depsReellesLectureGed } from '../lib/permis/lectureGed';

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
const aFlag = (n: string) => process.argv.includes(n);

interface Item { str: string; x: number; y: number }

/** Positions natives du texte d'une page (pdfjs). transform[4],[5] = x,y (repère PDF). */
async function itemsTexte(buf: Buffer, page: number): Promise<Item[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(page)).getTextContent();
  const items = (tc.items as { str?: string; transform?: number[] }[])
    .map((it) => ({ str: (it.str ?? '').trim(), x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }))
    .filter((i) => i.str !== '');
  await doc.destroy();
  return items;
}

/** Contrôle OCR (Mistral) : combien de cotes « XX.XX » l'OCR lit-il, et la cote critique sort-elle ? */
async function controleOcr(buf: Buffer, page: number, cote: string): Promise<void> {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) { console.log('  [OCR] MISTRAL_API_KEY absente — contrôle OCR ignoré.'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'banc-geo-'));
  try {
    writeFileSync(join(dir, 'p.pdf'), buf);
    execFileSync('pdftoppm', ['-jpeg', '-scale-to', '3500', '-f', String(page), '-l', String(page), '-singlefile', join(dir, 'p.pdf'), join(dir, 'pg')]);
    const b64 = readFileSync(join(dir, 'pg.jpg')).toString('base64');
    const res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-ocr-latest', document: { type: 'image_url', image_url: `data:image/jpeg;base64,${b64}` }, include_image_base64: false }),
    });
    if (!res.ok) { console.log(`  [OCR] HTTP ${res.status}`); return; }
    const d = await res.json();
    const md: string = d.pages?.[0]?.markdown ?? '';
    const cotes = [...md.matchAll(/\b\d{2}[.,]\d{2}\b/g)].map((m) => m[0]);
    const types = (d.pages?.[0]?.blocks ?? []).reduce((a: Record<string, number>, b: { type: string }) => ({ ...a, [b.type]: (a[b.type] || 0) + 1 }), {});
    console.log(`  [OCR mistral-ocr-latest] cotes « XX.XX » lues : ${cotes.length}${cotes.length ? ' → ' + [...new Set(cotes)].slice(0, 12).join(', ') : ''}`);
    console.log(`  [OCR] cote « ${cote} » lue : ${md.includes(cote) || md.includes(cote.replace('.', ',')) ? 'OUI' : 'NON'} · blocs par type : ${JSON.stringify(types)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:banc-geometrie -- --permis <num_dau> [--page-critique PC3:2] [--cote 89.46] [--lots 2D1,2D2] [--ocr]'); process.exitCode = 2; return; }
  const [tok, pStr] = (lireArg('--page-critique') ?? 'PC3:2').split(':');
  const page = Number(pStr);
  const cote = lireArg('--cote') ?? '89.46';
  const lots = (lireArg('--lots') ?? '2D1,2D2').split(',').map((s) => s.trim()).filter(Boolean);

  const resolu = await resoudreDossier(numDau, lireArg('--type'));
  if (!resolu.ok) { console.error(`[banc-geometrie] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  const meta = metas.find((m) => m.nomFichier.toLowerCase().includes((tok ?? '').toLowerCase()));
  if (!meta) { console.error(`[banc-geometrie] planche « ${tok} » introuvable`); process.exitCode = 2; return; }
  const buf = await deps.lireObjet(meta.cleStockage);

  console.log(`\n══════ BANC GÉOMÉTRIE — ${resolu.dossier.numDau} · ${meta.nomFichier} p.${page} · cote ${cote} ══════`);

  const items = await itemsTexte(buf, page);
  const reCote = new RegExp(cote.replace('.', '[.,]'));
  const cotes = items.filter((i) => reCote.test(i.str));
  const dist = (a: Item, b: Item) => Math.hypot(a.x - b.x, a.y - b.y);
  console.log(`\n[1] GÉOMÉTRIE NATIVE (pdfjs) — ${items.length} items texte positionnés`);
  console.log(`  « ${cote} » : ${cotes.length} occurrence(s) ${cotes.map((i) => `(${i.x | 0},${i.y | 0})`).join(' ')}`);
  const posLots = lots.map((l) => ({ l, pts: items.filter((i) => new RegExp(`${l}\\b`).test(i.str)) }));
  for (const { l, pts } of posLots) console.log(`  « ${l} » : ${pts.length} ${pts.map((i) => `(${i.x | 0},${i.y | 0})`).join(' ')}`);
  for (const c of cotes) {
    const parLot = posLots.map(({ l, pts }) => ({ l, d: pts.length ? Math.min(...pts.map((p) => dist(c, p))) : Infinity }));
    parLot.sort((a, b) => a.d - b.d);
    const [p1, p2] = parLot;
    const franc = p2 && Number.isFinite(p2.d) ? `écart ${(p2.d - p1.d).toFixed(0)} pts (ratio ${(p2.d / p1.d).toFixed(2)}) → ${p2.d / p1.d >= 2 ? 'FRANC' : 'AMBIGU'}` : 'un seul repère localisé';
    console.log(`  → cote@(${c.x | 0},${c.y | 0}) : ${parLot.map((x) => `${x.l}=${Number.isFinite(x.d) ? x.d.toFixed(0) + 'pts' : '—'}`).join(' · ')}  [${franc}]`);
  }
  console.log('  ⚠️ distances RAPPORTÉES — « le plus proche » ne prouve pas l’appartenance (règle à trancher par l’humain).');

  if (aFlag('--ocr')) { console.log(`\n[2] CONTRÔLE OCR (l’OCR lit-il les cotes internes ?)`); await controleOcr(buf, page, cote); }
  console.log('');
}

void main().catch((e) => { console.error('[banc-geometrie] échec', e); process.exitCode = 1; }).finally(() => closePool());
