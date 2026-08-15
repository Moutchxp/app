/**
 * P1 — BANC D'ESSAI JETABLE de la lecture visuelle. Mesure si un modèle de vision (Gemini, seule clé présente) répond juste sur
 * NOS planches, et à quel coût, AVANT de construire quoi que ce soit. AUCUNE écriture en base, aucune migration, aucun appel
 * depuis un module métier. Isolé.
 *
 * - Les pages viennent du TRIAGE N7-A (`trierPieces`) — jamais inventées — + des pages AJOUTÉES en argument (`--ajouter`).
 * - Les pièces EXCLUES par le triage (identité du demandeur) ne partent JAMAIS, même demandées.
 * - Rendu page→JPEG via `pdftoppm` (poppler, présent). Appel Gemini répliqué du pattern d'`adaptateurIaPhoto` (NON importé, hors staging).
 * - UNE question FERMÉE par appel ; réponse imprimée à côté de l'attendu ; jetons / coût estimé / latence par appel, puis totaux.
 * Lancer : npm run permis:banc-vision -- --permis <num_dau> [--type PC|PD] [--ajouter C_A2:14,C_A2:16]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { trierPieces } from '../lib/permis/triagePieces';

const MODELE = 'gemini-2.5-flash';
const TIMEOUT_MS = 45000;
// ⚠️ Tarifs ESTIMÉS (gemini-2.5-flash, $/token) — à ajuster si besoin. Ne servent qu'à un ordre de grandeur.
const PRIX_IN = 0.30 / 1_000_000;
const PRIX_OUT = 2.50 / 1_000_000;

interface Question { n: number; texte: string; attendu: string }
const QUESTIONS: Question[] = [
  { n: 1, texte: 'Combien de bâtiments distincts cette planche représente-t-elle ? Réponds par un seul nombre.', attendu: '2' },
  { n: 2, texte: 'Quels sont les identifiants/repères des bâtiments visibles (ex. « 2D1 ») ? Liste-les séparés par des virgules, ou « aucun ».', attendu: '2D1, 2D2' },
  { n: 3, texte: 'La cote d’altitude NGF la PLUS HAUTE visible sur cette planche appartient-elle au PROJET (construction neuve) ou à un BÂTIMENT VOISIN EXISTANT ? Réponds exactement un mot : projet | voisin | indeterminable.', attendu: 'projet (si cotes présentes)' },
  { n: 4, texte: 'À quel bâtiment se rattache la cote « NGF +89.46 » (ou, à défaut, la cote la plus haute) ? Réponds exactement : 2D1 | 2D2 | indeterminable. N’invente pas : si ce n’est pas lisible avec certitude, réponds indeterminable.', attendu: 'indeterminable (acceptable et valorisé)' },
  { n: 5, texte: 'Combien d’étages au-dessus du rez-de-chaussée compte chaque bâtiment (ex. « R+7 ») ? Réponds « <repère>: R+<n> » par bâtiment, ou « indeterminable ».', attendu: 'R+5 à R+7 (arrêté)' },
];

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

/** Appel Gemini (pattern répliqué d'adaptateurIaPhoto, NON importé). Rend texte + usage (jetons) + latence. */
async function demanderGemini(imageB64: string, question: string): Promise<{ ok: true; reponse: string; tokensIn: number; tokensOut: number; ms: number } | { ok: false; raison: string; ms: number }> {
  const cle = process.env.GEMINI_API_KEY;
  const t0 = Date.now();
  if (!cle) return { ok: false, raison: 'GEMINI_API_KEY absente', ms: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const prompt = `Tu regardes une planche de permis de construire (plan/coupe/façade). ${question}\nRéponds STRICTEMENT en JSON : {"reponse": "<réponse courte>"}. Aucune explication.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: imageB64 } }, { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: controller.signal,
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, raison: `HTTP ${res.status}`, ms };
    const data = await res.json();
    const texte: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let reponse = texte;
    try { const o = JSON.parse(texte); if (o && typeof o.reponse === 'string') reponse = o.reponse; } catch { /* garder le brut */ }
    const u = data?.usageMetadata ?? {};
    return { ok: true, reponse: reponse.trim().replace(/\s+/g, ' '), tokensIn: u.promptTokenCount ?? 0, tokensOut: u.candidatesTokenCount ?? 0, ms };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

const dodo = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:banc-vision -- --permis <num_dau> [--type PC|PD] [--ajouter C_A2:14,C_A2:16]'); process.exitCode = 2; return; }
  const type = lireArg('--type');
  const ajouterArg = lireArg('--ajouter'); // « tokenNom:page,tokenNom:page » — pages hors triage (ex. vues par lot)
  const delai = Math.max(0, Number(lireArg('--delai') ?? '400')); // ms entre appels — ↑ pour rester sous le quota (429)
  const maxPages = Math.max(1, Number(lireArg('--max-pages') ?? '999')); // borne le nb de pages (les ajouts sont conservés en priorité)

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) { console.error(`[banc-vision] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  const ged = await lireGedPermis(resolu.dossier.dossierId, deps);
  const plan = trierPieces(ged, extraireCandidats(ged));

  // Pièces/pages EXCLUES par le triage → interdites d'envoi (identité du demandeur), même si demandées.
  const piecesExclues = new Set(plan.exclusions.filter((e) => e.portee === 'piece').map((e) => e.piece));
  const pagesExclues = new Set(plan.exclusions.filter((e) => e.portee === 'page' && e.page !== undefined).map((e) => `${e.piece}:${e.page}`));

  type Cible = { piece: string; page: number; origine: string };
  const cibles: Cible[] = plan.pages.map((p) => ({ piece: p.piece, page: p.page, origine: p.regle }));

  // Ajouts explicites (résolus par « le nom de fichier contient le token »), refusés si exclus.
  for (const spec of (ajouterArg ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [tok, pStr] = spec.split(':');
    const page = Number(pStr);
    const meta = metas.find((m) => m.nomFichier.toLowerCase().includes((tok ?? '').toLowerCase()));
    if (!meta || !Number.isInteger(page)) { console.log(`  (ajout ignoré : « ${spec} » introuvable)`); continue; }
    if (piecesExclues.has(meta.nomFichier) || pagesExclues.has(`${meta.nomFichier}:${page}`)) { console.log(`  ⛔ ajout REFUSÉ (pièce exclue par le triage) : ${meta.nomFichier} p.${page}`); continue; }
    if (!cibles.some((c) => c.piece === meta.nomFichier && c.page === page)) cibles.push({ piece: meta.nomFichier, page, origine: 'ajout' });
  }

  // Borne éventuelle : on garde les AJOUTS en priorité (vues par lot), puis on complète avec les pages du triage.
  const cibern = maxPages < cibles.length ? [...cibles.filter((c) => c.origine === 'ajout'), ...cibles.filter((c) => c.origine !== 'ajout')].slice(0, maxPages) : cibles;
  cibles.length = 0; cibles.push(...cibern);

  console.log(`\n══════ BANC VISION — ${resolu.dossier.numDau} (${resolu.dossier.type}) — modèle ${MODELE} · délai ${delai}ms ══════`);
  console.log(`Pages à évaluer : ${cibles.length} (${cibles.map((c) => `${c.piece.slice(0, 12)}…p.${c.page}[${c.origine}]`).join(', ')})`);
  console.log(`Tarifs estimés : in ${PRIX_IN * 1e6}$/M · out ${PRIX_OUT * 1e6}$/M\n`);

  const dir = mkdtempSync(join(tmpdir(), 'banc-vision-'));
  let coutTotal = 0, appels = 0, echecs = 0;
  try {
    for (const c of cibles) {
      const meta = metas.find((m) => m.nomFichier === c.piece);
      if (!meta) { console.log(`  (méta introuvable : ${c.piece})`); continue; }
      let img: string;
      try {
        const pdfPath = join(dir, 'p.pdf');
        writeFileSync(pdfPath, await deps.lireObjet(meta.cleStockage));
        const outPrefix = join(dir, 'page');
        execFileSync('pdftoppm', ['-jpeg', '-scale-to', '2000', '-f', String(c.page), '-l', String(c.page), '-singlefile', pdfPath, outPrefix]);
        img = readFileSync(`${outPrefix}.jpg`).toString('base64');
      } catch (e) { console.log(`  ✗ rendu impossible ${c.piece} p.${c.page} : ${e instanceof Error ? e.message : String(e)}`); continue; }

      console.log(`\n── ${c.piece} p.${c.page} [${c.origine}] ──`);
      for (const q of QUESTIONS) {
        const r = await demanderGemini(img, q.texte);
        appels += 1;
        if (!r.ok) { echecs += 1; console.log(`  Q${q.n} ÉCHEC (${r.raison})`); await dodo(delai); continue; }
        const cout = r.tokensIn * PRIX_IN + r.tokensOut * PRIX_OUT;
        coutTotal += cout;
        console.log(`  Q${q.n} → « ${r.reponse} »   [attendu : ${q.attendu}]`);
        console.log(`        ${r.tokensIn}+${r.tokensOut} jetons · ~$${cout.toFixed(5)} · ${r.ms} ms`);
        await dodo(delai);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n══════ TOTAL — ${appels} appels (${echecs} échecs) · coût estimé $${coutTotal.toFixed(4)} pour ce permis ══════`);
  console.log(`Extrapolation 100 permis (si volume comparable) : ~$${(coutTotal * 100).toFixed(2)}\n`);
}

void main()
  .catch((e) => { console.error('[banc-vision] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
