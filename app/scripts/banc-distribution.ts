/**
 * P4 — DISTRIBUTION COMPLÈTE de la géométrie native (pdfjs) sur les 48 cotes d'acrotère (N5-B2), pour VALIDER/RÉFUTER la règle de
 * rattachement cote↔lot. Script ISOLÉ : aucune écriture, aucune migration, aucun appel depuis un module métier.
 *
 * On MESURE, on ne décide AUCUN seuil ni règle. On cherche les CONTRE-EXEMPLES (on ne « nettoie » pas la distribution).
 *  M1 — table : cote, page, position, distance 2D1 la + proche, distance 2D2, rapport. + franc/ambigu (seuil OBSERVÉ), cotes→2D2, pages mono-repère.
 *  M2 — les cotes basses (< RDC 59.63) suspectées « bâti voisin » : loin des deux repères ? près d'autre chose ?
 *  M3 — solidité du repère : occurrences de 2D1/2D2 par page, positions, groupées (cartouche) ou dispersées (étiquettes).
 * Lancer : npm run permis:banc-distribution -- --permis <num_dau> [--type PC|PD]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
const RDC = 59.63;
const COTES_BASSES = [55.58, 56.45, 56.54, 57.35, 57.36]; // suspectées « bâti voisin » (N5-B2)

interface Item { str: string; x: number; y: number }
interface Ligne { cote: number; piece: string; page: number; x: number; y: number; d1: number; d2: number; proche: '2D1' | '2D2' | '—'; ratio: number; mono: boolean }

async function itemsPage(buf: Buffer, page: number): Promise<Item[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(page)).getTextContent();
  const items = (tc.items as { str?: string; transform?: number[] }[]).map((it) => ({ str: (it.str ?? '').trim(), x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 })).filter((i) => i.str !== '');
  await doc.destroy();
  return items;
}
const dist = (a: Item, b: Item) => Math.hypot(a.x - b.x, a.y - b.y);
const minDist = (c: Item, pts: Item[]) => (pts.length ? Math.min(...pts.map((p) => dist(c, p))) : Infinity);

async function main(): Promise<void> {
  const resolu = await resoudreDossier(lireArg('--permis') ?? '', lireArg('--type'));
  if (!resolu.ok) { console.error('[banc-distribution] usage : -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  const rapport = extraireCandidats(await lireGedPermis(resolu.dossier.dossierId, deps));

  // Cotes d'acrotère (N5-B2) → valeurs distinctes par (pièce, page).
  const acro = rapport.cotes.filter((c) => c.qualificatifSommet === 'acrotère');
  const parPage = new Map<string, { pieceId: number; piece: string; page: number; valeurs: Set<number> }>();
  for (const c of acro) {
    const k = `${c.provenance.pieceId}:${c.provenance.page}`;
    const e = parPage.get(k) ?? { pieceId: c.provenance.pieceId, piece: c.provenance.pieceNom, page: c.provenance.page, valeurs: new Set<number>() };
    e.valeurs.add(c.valeur); parPage.set(k, e);
  }
  const bufParPiece = new Map<number, Buffer>();
  const buf = async (pieceId: number, cle: string) => bufParPiece.get(pieceId) ?? (bufParPiece.set(pieceId, await deps.lireObjet(cle)), bufParPiece.get(pieceId)!);

  const lignes: Ligne[] = [];
  const m3: { piece: string; page: number; lot: string; positions: Item[] }[] = [];
  for (const e of [...parPage.values()].sort((a, b) => a.piece.localeCompare(b.piece) || a.page - b.page)) {
    const meta = metas.find((m) => m.id === e.pieceId); if (!meta) continue;
    const items = await itemsPage(await buf(e.pieceId, meta.cleStockage), e.page);
    const lot1 = items.filter((i) => /2D1\b/.test(i.str));
    const lot2 = items.filter((i) => /2D2\b/.test(i.str));
    m3.push({ piece: e.piece, page: e.page, lot: '2D1', positions: lot1 }, { piece: e.piece, page: e.page, lot: '2D2', positions: lot2 });
    const mono = lot1.length === 0 || lot2.length === 0;
    for (const v of e.valeurs) {
      const re = new RegExp(`(?<![\\d])${String(v).replace('.', '[.,]')}(?![\\d])`);
      for (const it of items.filter((i) => re.test(i.str.replace(',', '.')) || re.test(i.str))) {
        const d1 = minDist(it, lot1), d2 = minDist(it, lot2);
        const proche = d1 === d2 ? '—' : d1 < d2 ? '2D1' : '2D2';
        const ratio = Math.max(d1, d2) / Math.min(d1, d2);
        lignes.push({ cote: v, piece: e.piece, page: e.page, x: it.x | 0, y: it.y | 0, d1, d2, proche, ratio, mono });
      }
    }
  }

  const fmt = (d: number) => (Number.isFinite(d) ? d.toFixed(0) : '∞');
  console.log(`\n══════ DISTRIBUTION GÉOMÉTRIE — ${resolu.dossier.numDau} · ${lignes.length} items de cote d'acrotère localisés (réf. 48) ══════`);
  console.log('\n[M1] TABLE : cote · pièce p.page · pos · d(2D1) · d(2D2) · proche · ratio · mono?');
  for (const l of lignes.sort((a, b) => a.piece.localeCompare(b.piece) || a.page - b.page || a.cote - b.cote)) {
    console.log(`  ${l.cote.toFixed(2).padStart(6)} · ${l.piece.slice(0, 10)} p.${l.page} · (${l.x},${l.y}) · 2D1=${fmt(l.d1).padStart(5)} · 2D2=${fmt(l.d2).padStart(5)} · →${l.proche} · ratio ${Number.isFinite(l.ratio) ? l.ratio.toFixed(2) : '∞'}${l.mono ? ' · ⚠MONO-REPÈRE' : ''}`);
  }

  const biRep = lignes.filter((l) => !l.mono && Number.isFinite(l.ratio));
  const ratiosTries = biRep.map((l) => l.ratio).sort((a, b) => a - b);
  console.log('\n[M1a] DISTRIBUTION DES RATIOS (pages BI-repères seulement, tri croissant) — cherche où l\'écart se creuse :');
  console.log('  ' + ratiosTries.map((r) => r.toFixed(2)).join(' · '));
  // plus grand saut entre deux ratios consécutifs (observation, PAS un seuil décidé)
  let saut = { i: -1, de: 0, a: 0, ecart: 0 };
  for (let i = 1; i < ratiosTries.length; i++) { const e = ratiosTries[i] - ratiosTries[i - 1]; if (e > saut.ecart) saut = { i, de: ratiosTries[i - 1], a: ratiosTries[i], ecart: e }; }
  console.log(`  → plus grand saut : entre ${saut.de.toFixed(2)} et ${saut.a.toFixed(2)} (écart ${saut.ecart.toFixed(2)}) — OBSERVATION, seuil à trancher par l'humain.`);
  console.log(`  [M1b] ambiguës (ratio proche de 1) : les 3 plus bas = ${ratiosTries.slice(0, 3).map((r) => r.toFixed(2)).join(', ')}`);
  console.log(`  [M1c] cotes pointant vers 2D2 (bi-repères) : ${biRep.filter((l) => l.proche === '2D2').length} / ${biRep.length}${biRep.some((l) => l.proche === '2D2') ? ' → ' + biRep.filter((l) => l.proche === '2D2').map((l) => l.cote.toFixed(2)).join(', ') : ' → AUCUNE (⚠ suspect : un plan à 2 lots devrait porter des cotes des deux)'}`);
  const monoRep = lignes.filter((l) => l.mono);
  console.log(`  [M1d] items sur pages MONO-repère : ${monoRep.length} (proximité NON concluante — un seul repère sur la page) ${[...new Set(monoRep.map((l) => `${l.piece.slice(0, 8)} p.${l.page}`))].join(', ')}`);

  console.log('\n[M2] COTES BASSES (< RDC 59.63) suspectées « bâti voisin » :');
  for (const v of COTES_BASSES) { const ls = lignes.filter((l) => Math.abs(l.cote - v) < 0.001); if (!ls.length) { console.log(`  ${v} : non localisée`); continue; } for (const l of ls) console.log(`  ${v} · ${l.piece.slice(0, 10)} p.${l.page} · 2D1=${fmt(l.d1)} · 2D2=${fmt(l.d2)} · →${l.proche}${l.mono ? ' (mono)' : ''}`); }
  const basses = lignes.filter((l) => l.cote < RDC);
  const hautes = lignes.filter((l) => l.cote >= RDC);
  const moy = (a: Ligne[]) => { const f = a.map((l) => Math.min(l.d1, l.d2)).filter((x) => Number.isFinite(x)); return f.length ? f.reduce((s, x) => s + x, 0) / f.length : NaN; };
  console.log(`  → distance MOYENNE au repère le plus proche (items bi/mono-repère finis) : cotes BASSES (<${RDC}) = ${moy(basses).toFixed(0)} pts · cotes HAUTES = ${moy(hautes).toFixed(0)} pts`);

  console.log('\n[M3] SOLIDITÉ DU REPÈRE — occurrences 2D1/2D2 par page, positions, groupées ou dispersées :');
  for (const g of m3) {
    if (g.positions.length === 0) { console.log(`  ${g.piece.slice(0, 12)} p.${g.page} · ${g.lot} : 0 occurrence`); continue; }
    const xs = g.positions.map((p) => p.x), ys = g.positions.map((p) => p.y);
    const etendue = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    console.log(`  ${g.piece.slice(0, 12)} p.${g.page} · ${g.lot} : ${g.positions.length} occ · positions ${g.positions.map((p) => `(${p.x | 0},${p.y | 0})`).join(' ')} · étendue ${etendue.toFixed(0)} pts ${etendue < 50 ? '(GROUPÉ — cartouche ?)' : '(DISPERSÉ — étiquettes ?)'}`);
  }
  console.log('');
}

void main().catch((e) => { console.error('[banc-distribution] échec', e); process.exitCode = 1; }).finally(() => closePool());
