/**
 * P1/P2 — BANC D'ESSAI JETABLE de la lecture visuelle, AGNOSTIQUE du fournisseur. Mesure si un modèle de vision répond juste sur
 * NOS planches, et à quel coût, AVANT de construire autour. Script ISOLÉ : aucune écriture en base, aucune migration, aucun appel
 * depuis un module métier ; `adaptateurIaPhoto` (hors staging) n'est ni importé ni modifié (pattern seulement répliqué).
 *
 * DEUX MODES :
 *  - PROTOCOLE (défaut, économe) : sur LA planche critique (défaut PC3 p.2) et la SEULE question d'attribution (89.46 → lot),
 *    applique 3 ÉPREUVES SÉPARÉES (stabilité N tirages / localisation / question adverse). Le défaut est `indeterminable` : une
 *    attribution n'est retenue QUE si les trois passent. ~5 appels.
 *  - BENCH (`--bench`) : balaye les pages du TRIAGE N7-A + ajouts (`--ajouter`), 5 questions fermées/page, ATTENDU PAR TYPE DE PAGE.
 *
 * FOURNISSEUR & MODÈLE = arguments/env, JAMAIS codés en dur (leçon Gemini 2.0, retiré du catalogue). Impl Gemini (active) +
 * Mistral (présente ; inactive si MISTRAL_API_KEY absente, via simple HTTP, aucun SDK). Chaque réponse indique QUEL modèle a répondu.
 * Lancer : npm run permis:banc-vision -- --permis <num_dau> [--fournisseur gemini|mistral] [--modele <id>] [--tirages 3] [--delai 7000] [--bench --ajouter C_A2:14,C_A2:16 --max-pages 5]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed, type PieceGedMeta } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { trierPieces } from '../lib/permis/triagePieces';

const TIMEOUT_MS = 45000;
const COTE_CRITIQUE = '89.46';
// ⚠️ Tarifs ESTIMÉS ($/token), ordre de grandeur seulement — à ajuster.
const PRIX = { gemini: { in: 0.30 / 1e6, out: 2.50 / 1e6 }, mistral: { in: 0.15 / 1e6, out: 0.15 / 1e6 } };

// ── Interface AGNOSTIQUE du fournisseur ────────────────────────────────────────
type Reponse = { ok: true; texte: string; tokensIn: number; tokensOut: number; ms: number } | { ok: false; raison: string; ms: number };
interface FournisseurVision {
  nom: 'gemini' | 'mistral';
  modele: string;
  actif: boolean;
  raisonInactif?: string;
  /** Envoie une image (base64 jpeg) + un prompt exigeant du JSON ; rend le texte brut + les jetons. */
  interroger(imageB64: string, prompt: string, temperature: number): Promise<Reponse>;
}

function fournisseurGemini(modele: string): FournisseurVision {
  const cle = process.env.GEMINI_API_KEY;
  return {
    nom: 'gemini', modele, actif: !!cle, raisonInactif: cle ? undefined : 'GEMINI_API_KEY absente',
    async interroger(imageB64, prompt, temperature) {
      const t0 = Date.now();
      if (!cle) return { ok: false, raison: 'GEMINI_API_KEY absente', ms: 0 };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
          method: 'POST', headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: imageB64 } }, { text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature },
          }), signal: controller.signal,
        });
        const ms = Date.now() - t0;
        if (!res.ok) return { ok: false, raison: `HTTP ${res.status}`, ms };
        const data = await res.json();
        const texte: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const u = data?.usageMetadata ?? {};
        return { ok: true, texte, tokensIn: u.promptTokenCount ?? 0, tokensOut: u.candidatesTokenCount ?? 0, ms };
      } catch (e) { return { ok: false, raison: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 }; }
      finally { clearTimeout(timer); }
    },
  };
}

function fournisseurMistral(modele: string): FournisseurVision {
  const cle = process.env.MISTRAL_API_KEY;
  return {
    nom: 'mistral', modele, actif: !!cle, raisonInactif: cle ? undefined : 'MISTRAL_API_KEY absente (implémentation présente, inactive)',
    async interroger(imageB64, prompt, temperature) {
      const t0 = Date.now();
      if (!cle) return { ok: false, raison: 'MISTRAL_API_KEY absente (implémentation présente, inactive)', ms: 0 };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        // API OpenAI-compatible (chat completions), image en data-URL base64 — simple HTTP, aucun SDK.
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modele, temperature, response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: `data:image/jpeg;base64,${imageB64}` }] }],
          }), signal: controller.signal,
        });
        const ms = Date.now() - t0;
        if (!res.ok) return { ok: false, raison: `HTTP ${res.status}`, ms };
        const data = await res.json();
        const texte: string = data?.choices?.[0]?.message?.content ?? '';
        const u = data?.usage ?? {};
        return { ok: true, texte, tokensIn: u.prompt_tokens ?? 0, tokensOut: u.completion_tokens ?? 0, ms };
      } catch (e) { return { ok: false, raison: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 }; }
      finally { clearTimeout(timer); }
    },
  };
}

// ── Utilitaires ────────────────────────────────────────────────────────────────
function lireArg(nom: string): string | undefined { const i = process.argv.indexOf(nom); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; }
const aFlag = (nom: string) => process.argv.includes(nom);
const dodo = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extrait un champ d'une réponse JSON, sinon rend le brut nettoyé. */
function champJson(texte: string, champ: string): string {
  try { const o = JSON.parse(texte); if (o && typeof o[champ] === 'string') return o[champ].trim().replace(/\s+/g, ' '); if (o && (typeof o[champ] === 'number')) return String(o[champ]); } catch { /* brut */ }
  return texte.trim().replace(/\s+/g, ' ');
}
/** Normalise une attribution en 2D1 / 2D2 / indeterminable / (autre brut). */
function normAttribution(s: string): string {
  const n = s.toLowerCase();
  if (/indeter|ne sais|impossible|pas (lisible|possible|visible|de certitude)/.test(n)) return 'indeterminable';
  if (/2d1/.test(n) && /2d2/.test(n)) return 'les deux';
  if (/2d1/.test(n)) return '2D1';
  if (/2d2/.test(n)) return '2D2';
  return s.trim().replace(/\s+/g, ' ');
}

// Rendu page → JPEG via poppler (présent). Rend le base64.
function rendreImage(dir: string, pdf: Buffer, page: number): string {
  const pdfPath = join(dir, 'p.pdf'); writeFileSync(pdfPath, pdf);
  const out = join(dir, 'page');
  execFileSync('pdftoppm', ['-jpeg', '-scale-to', '2000', '-f', String(page), '-l', String(page), '-singlefile', pdfPath, out]);
  return readFileSync(`${out}.jpg`).toString('base64');
}

// ── PARTIE B — attendu PAR TYPE DE PAGE (sinon la note mesure l'attendu, pas le modèle) ──────────
type TypePage = 'planche_cotes' | 'plan_masse' | 'vue_lot';
const typeDePage = (origine: string): TypePage => (origine === 'cote_qualifiee' ? 'planche_cotes' : origine === 'planche_multi_corps' ? 'plan_masse' : 'vue_lot');
const ATTENDU: Record<TypePage, Record<number, string>> = {
  planche_cotes: { 1: '2', 2: '2D1, 2D2', 3: 'projet', 4: 'indeterminable (valorisé)', 5: 'R+5 à R+7' },
  plan_masse: { 1: '2', 2: '2D1, 2D2', 3: 'projet ou indeterminable', 4: 'indeterminable (valorisé)', 5: 'R+5 à R+7' },
  vue_lot: { 1: '1 (vue d’un seul lot)', 2: 'le lot de la page (2D1 OU 2D2)', 3: 'indeterminable (pas de cotes)', 4: 'indeterminable', 5: 'les étages de ce lot' },
};
const QUESTIONS: { n: number; texte: string }[] = [
  { n: 1, texte: 'Combien de bâtiments distincts cette planche représente-t-elle ? Réponds par un seul nombre.' },
  { n: 2, texte: 'Quels sont les identifiants/repères des bâtiments visibles (ex. « 2D1 ») ? Liste-les séparés par des virgules, ou « aucun ».' },
  { n: 3, texte: 'La cote NGF la PLUS HAUTE visible appartient-elle au PROJET (neuf) ou à un BÂTIMENT VOISIN EXISTANT ? Un mot : projet | voisin | indeterminable.' },
  { n: 4, texte: `À quel bâtiment se rattache la cote « NGF +${COTE_CRITIQUE} » (ou à défaut la plus haute) ? 2D1 | 2D2 | indeterminable. N'invente pas.` },
  { n: 5, texte: 'Combien d’étages au-dessus du rez-de-chaussée par bâtiment (ex. « R+7 ») ? « <repère>: R+<n> », ou « indeterminable ».' },
];
const enJson = (q: string, champ = 'reponse') => `Tu regardes une planche de permis de construire. ${q}\nRéponds STRICTEMENT en JSON : {"${champ}": "<réponse courte>"}. Aucune explication.`;

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:banc-vision -- --permis <num_dau> [--fournisseur gemini|mistral] [--modele <id>] [--tirages 3] [--delai 7000] [--bench --ajouter … --max-pages …]'); process.exitCode = 2; return; }
  const type = lireArg('--type');
  const delai = Math.max(0, Number(lireArg('--delai') ?? '7000'));
  const tirages = Math.max(1, Number(lireArg('--tirages') ?? '3'));
  const tempStab = Number(lireArg('--temp') ?? '0.6'); // >0 pour que des tirages puissent DIVERGER (indépendance)

  // Fournisseur + modèle : args/env, jamais codés en dur.
  const nomF = (lireArg('--fournisseur') ?? process.env.BANC_FOURNISSEUR ?? 'gemini').toLowerCase();
  const modeleDefaut = nomF === 'mistral' ? (process.env.MISTRAL_MODEL ?? 'pixtral-12b-2409') : (process.env.GEMINI_MODEL ?? 'gemini-2.5-flash');
  const modele = lireArg('--modele') ?? modeleDefaut;
  const f = nomF === 'mistral' ? fournisseurMistral(modele) : fournisseurGemini(modele);
  const tarif = PRIX[f.nom];
  const cout = (r: { tokensIn: number; tokensOut: number }) => r.tokensIn * tarif.in + r.tokensOut * tarif.out;

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) { console.error(`[banc-vision] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  const ged = await lireGedPermis(resolu.dossier.dossierId, deps);
  const plan = trierPieces(ged, extraireCandidats(ged));
  const piecesExclues = new Set(plan.exclusions.filter((e) => e.portee === 'piece').map((e) => e.piece));
  const pagesExclues = new Set(plan.exclusions.filter((e) => e.portee === 'page' && e.page !== undefined).map((e) => `${e.piece}:${e.page}`));
  const metaParToken = (tok: string): PieceGedMeta | undefined => metas.find((m) => m.nomFichier.toLowerCase().includes(tok.toLowerCase()));

  console.log(`\n══════ BANC VISION — ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  console.log(`Fournisseur : ${f.nom} · modèle : ${modele} · ${f.actif ? 'ACTIF' : `INACTIF (${f.raisonInactif})`}`);
  if (!f.actif) { console.log('→ fournisseur inactif : rien à mesurer. Fournis la clé, ou choisis --fournisseur gemini.\n'); return; }

  const dir = mkdtempSync(join(tmpdir(), 'banc-vision-'));
  try {
    if (!aFlag('--bench')) {
      // ─────────── MODE PROTOCOLE (défaut, économe) ───────────
      const [tok, pStr] = (lireArg('--page-critique') ?? 'PC3:2').split(':');
      const page = Number(pStr);
      const meta = metaParToken(tok ?? '');
      if (!meta) { console.log(`planche critique introuvable : ${tok}`); return; }
      if (piecesExclues.has(meta.nomFichier) || pagesExclues.has(`${meta.nomFichier}:${page}`)) { console.log('planche critique exclue par le triage — abandon.'); return; }
      const img = rendreImage(dir, await deps.lireObjet(meta.cleStockage), page);
      console.log(`\nPROTOCOLE D'ATTRIBUTION — ${meta.nomFichier} p.${page} · cote ${COTE_CRITIQUE} · ${tirages} tirages (temp ${tempStab})\n`);

      // ÉPREUVE 1 — STABILITÉ (tirages indépendants)
      const rep: string[] = [];
      let coutT = 0;
      for (let i = 0; i < tirages; i++) {
        const r = await f.interroger(img, enJson(QUESTIONS[3].texte), tempStab);
        if (!r.ok) { rep.push(`ÉCHEC(${r.raison})`); } else { rep.push(normAttribution(champJson(r.texte, 'reponse'))); coutT += cout(r); }
        await dodo(delai);
      }
      const valides = rep.filter((x) => !x.startsWith('ÉCHEC'));
      const stable = valides.length === tirages && valides.every((x) => x === valides[0]);
      const candidat = stable ? valides[0] : null;
      console.log(`  [1] STABILITÉ  : ${rep.map((x, i) => `t${i + 1}=${x}`).join(' · ')}`);
      console.log(`      → ${stable ? `stable sur « ${candidat} »` : 'DÉSACCORD → indeterminable'}`);

      let localise = false, locTexte = '(non testée)';
      let maintient = false, advTexte = '(non testée)';
      if (candidat === '2D1' || candidat === '2D2') {
        // ÉPREUVE 2 — LOCALISATION
        const autre = candidat === '2D1' ? '2D2' : '2D1';
        const rl = await f.interroger(img, enJson(`Tu dis que la cote NGF +${COTE_CRITIQUE} se rattache au bâtiment ${candidat}. OÙ précisément le lis-tu (repère écrit, légende, position sur la planche) ? Si aucun élément ne le montre, réponds « aucune ».`, 'localisation'), 0);
        if (rl.ok) { coutT += cout(rl); locTexte = champJson(rl.texte, 'localisation'); localise = !/^aucun|ne sais|rien|pas (visible|lisible|d)|indeter/i.test(locTexte) && locTexte.trim().length > 3; await dodo(delai); }
        else locTexte = `ÉCHEC(${rl.raison})`;
        console.log(`  [2] LOCALISATION : « ${locTexte} » → ${localise ? 'PASSE (élément cité)' : 'ÉCHOUE → indeterminable'}`);

        // ÉPREUVE 3 — QUESTION ADVERSE
        const ra = await f.interroger(img, enJson(`Tu as répondu que la cote NGF +${COTE_CRITIQUE} se rattache à ${candidat}. En es-tu sûr ? Ne serait-ce pas plutôt ${autre} ? Réponds : ${candidat} | ${autre} | indeterminable.`), 0);
        if (ra.ok) { coutT += cout(ra); advTexte = normAttribution(champJson(ra.texte, 'reponse')); maintient = advTexte === candidat; await dodo(delai); }
        else advTexte = `ÉCHEC(${ra.raison})`;
        console.log(`  [3] ADVERSE    : « ${advTexte} » → ${maintient ? 'MAINTIENT (⚠ la fermeté n’est PAS une preuve)' : 'CHANGE → indeterminable'}`);
      } else {
        console.log('  [2] LOCALISATION : (non testée — pas de candidat de lot stable)');
        console.log('  [3] ADVERSE    : (non testée — pas de candidat de lot stable)');
      }

      const retenu = (candidat === '2D1' || candidat === '2D2') && stable && localise && maintient ? candidat : 'indeterminable';
      console.log(`\n  VERDICT : ${retenu}${retenu === 'indeterminable' ? '  (le protocole a protégé de l’attribution)' : '  (retenu — mais reste une réponse invérifiable, cf. rapport)'}`);
      console.log(`  Coût protocole : ~$${coutT.toFixed(5)} · modèle ${f.nom}/${modele}\n`);
      return;
    }

    // ─────────── MODE BENCH (--bench) : pages × questions, attendu par type ───────────
    type Cible = { piece: string; page: number; origine: string };
    const cibles: Cible[] = plan.pages.map((p) => ({ piece: p.piece, page: p.page, origine: p.regle }));
    for (const spec of (lireArg('--ajouter') ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const [tok, pStr] = spec.split(':'); const page = Number(pStr); const meta = metaParToken(tok ?? '');
      if (!meta || !Number.isInteger(page)) { console.log(`  (ajout ignoré : ${spec})`); continue; }
      if (piecesExclues.has(meta.nomFichier) || pagesExclues.has(`${meta.nomFichier}:${page}`)) { console.log(`  ⛔ ajout REFUSÉ (exclu) : ${meta.nomFichier} p.${page}`); continue; }
      if (!cibles.some((c) => c.piece === meta.nomFichier && c.page === page)) cibles.push({ piece: meta.nomFichier, page, origine: 'ajout' });
    }
    const maxPages = Math.max(1, Number(lireArg('--max-pages') ?? '999'));
    const gardees = maxPages < cibles.length ? [...cibles.filter((c) => c.origine === 'ajout'), ...cibles.filter((c) => c.origine !== 'ajout')].slice(0, maxPages) : cibles;

    let coutTotal = 0, appels = 0, echecs = 0;
    for (const c of gardees) {
      const meta = metas.find((m) => m.nomFichier === c.piece); if (!meta) continue;
      let img: string;
      try { img = rendreImage(dir, await deps.lireObjet(meta.cleStockage), c.page); } catch (e) { console.log(`  ✗ rendu ${c.piece} p.${c.page} : ${e instanceof Error ? e.message : String(e)}`); continue; }
      const tp = typeDePage(c.origine);
      console.log(`\n── ${c.piece} p.${c.page} [${c.origine} → type: ${tp}] ──`);
      for (const q of QUESTIONS) {
        const r = await f.interroger(img, enJson(q.texte), 0); appels += 1;
        if (!r.ok) { echecs += 1; console.log(`  Q${q.n} ÉCHEC (${r.raison})`); await dodo(delai); continue; }
        const c$ = cout(r); coutTotal += c$;
        console.log(`  Q${q.n} → « ${champJson(r.texte, 'reponse')} »   [attendu ${tp} : ${ATTENDU[tp][q.n]}]   (${f.nom}/${modele}, ${r.tokensIn}+${r.tokensOut} jet., ~$${c$.toFixed(5)}, ${r.ms}ms)`);
        await dodo(delai);
      }
    }
    console.log(`\n══════ TOTAL — ${appels} appels (${echecs} échecs) · ~$${coutTotal.toFixed(4)} · 100 permis ≈ $${(coutTotal * 100).toFixed(2)} ══════\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void main().catch((e) => { console.error('[banc-vision] échec', e); process.exitCode = 1; }).finally(() => closePool());
