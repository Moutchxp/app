/**
 * N10-O — LECTURE d'un Cerfa SCANNÉ par DEUX sources indépendantes : OCR (mistral-ocr-latest) et VISION (mistral-medium-latest).
 * IMPUR (modèle + pdftoppm). N'envoie à l'API que les PAGES DU TRIAGE (jamais le document en aveugle page par page). Les parsers
 * OCR sont calés sur le Cerfa 13409*15 (comme decisionCerfa) ; un autre millésime demandera à les étendre.
 *
 * 🔒 Deux lectures SÉPARÉES → la décision (decisionCerfaScan) n'écrit que si elles s'accordent. Ce module NE décide rien, il LIT.
 * Le `LecteurCerfa` est INJECTABLE : les tests bouchonnent OCR + vision (aucun appel réseau en test).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOUS_DESTINATION_PAR_LETTRE } from './decisionCerfa';
import type { LectureValeur } from './decisionCerfaScan';

/** Sous-destinations de la liste fermée (mêmes libellés que le CHECK 110). */
export const SOUS_DESTINATIONS: readonly string[] = [...new Set(Object.values(SOUS_DESTINATION_PAR_LETTRE))];

/** Triage MESURÉ (N10-O, Cerfa 13409*15) — pages 1-based. */
export const PAGES_CERFA = { adresse: 5, logements: 7, destinations: 9, stationnement: 10 } as const;

/** Deux sources indépendantes + rasterisation (INJECTABLE → les tests bouchonnent tout, aucun appel réseau ni pdftoppm). */
export interface LecteurCerfa {
  ocr(pdf: Buffer): Promise<string[]>;                                  // markdown par page (index 0-based)
  rasteriser(pdf: Buffer, page: number): string;                        // image base64 d'une page (1-based)
  vision(imageB64: string, prompt: string): Promise<Record<string, unknown>>;
}

// ── PARSERS OCR (purs) — markdown d'une page → LectureValeur ─────────────────────────────────────────────────────────────────────
const nettoieChiffres = (s: string) => s.replace(/\s+/g, ''); // « 7 5 0 2 0 » → « 75020 »

export function parseAdresseOcr(md: string): LectureValeur {
  const num = /Num[ée]ro\s*:\s*([0-9]+)/i.exec(md)?.[1];
  const voie = /Voie\s*:\s*([^\n]+?)\s*(?:Lieu-dit|Localit|$)/i.exec(md)?.[1]?.trim();
  const cp = /Code postal\s*:\s*([0-9 ]{5,})/i.exec(md)?.[1];
  const loc = /Localit[ée]\s*:\s*([^\n]+?)\s*(?:Code postal|$)/i.exec(md)?.[1]?.trim();
  const parts = [num, voie, cp ? nettoieChiffres(cp) : undefined, loc].filter(Boolean);
  return parts.length >= 3 ? { statut: 'valeur', valeur: parts.join(' ') } : { statut: 'vide' };
}

/** « Nombre total de logements créés : N » — N present ⇒ valeur (y compris « 0 » écrit) ; libellé présent sans nombre ⇒ vide. */
export function parseLogementsOcr(md: string): LectureValeur {
  const m = /Nombre total de logements? cr[ée]{1,2}s?\s*:\s*([0-9]+)?/i.exec(md);
  if (!m) return { statut: 'illisible' };
  return m[1] !== undefined ? { statut: 'valeur', valeur: m[1] } : { statut: 'vide' };
}

/** Ligne « Surfaces totales (en m²) » → dernière colonne (Surface totale). Aucun nombre ⇒ vide. */
export function parseSurfaceOcr(md: string): LectureValeur {
  const ligne = /Surfaces? totales[^\n|]*\|([^\n]*)/i.exec(md)?.[1];
  if (!ligne) return { statut: 'illisible' };
  const nums = [...ligne.matchAll(/([0-9][0-9 ]*)/g)].map((x) => nettoieChiffres(x[1])).filter((x) => x !== '');
  return nums.length > 0 ? { statut: 'valeur', valeur: nums[nums.length - 1] } : { statut: 'vide' };
}

/** « Nombre de places de stationnement … Après réalisation … : N » — pas de nombre ⇒ vide (JAMAIS 0). */
export function parseStationnementOcr(md: string): LectureValeur {
  const zone = /stationnement([\s\S]{0,400})/i.exec(md)?.[1] ?? '';
  const m = /Apr[èe]s r[ée]alisation[^:]*:\s*([0-9]+)?/i.exec(zone);
  if (!m) return { statut: 'illisible' };
  return m[1] !== undefined ? { statut: 'valeur', valeur: m[1] } : { statut: 'vide' };
}

/** Tableau des surfaces → pour chaque sous-destination : un nombre sur sa ligne ⇒ 'valeur' (la surface), sinon 'vide'. */
export function parseDestinationsOcr(md: string): Record<string, LectureValeur> {
  const out: Record<string, LectureValeur> = {};
  const lignes = md.split('\n');
  for (const sd of SOUS_DESTINATIONS) {
    const re = new RegExp(sd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"), 'i');
    const l = lignes.find((x) => re.test(x));
    if (!l) { out[sd] = { statut: 'illisible' }; continue; }
    const nums = [...l.matchAll(/\|?\s*([0-9][0-9 ]*)\s*(?=\|)/g)].map((x) => nettoieChiffres(x[1])).filter((x) => x !== '' && x !== '0');
    out[sd] = nums.length > 0 ? { statut: 'valeur', valeur: nums[0] } : { statut: 'vide' };
  }
  return out;
}

// ── VISION (prompts calés sur la mesure N10-O) ──────────────────────────────────────────────────────────────────────────────────
const CONSIGNE = " Si un champ ne contient AUCUN chiffre/texte écrit, réponds 'vide'. NE réponds JAMAIS 0 pour un champ vide. N'invente rien ; en cas de doute 'illisible'.";

/**
 * N10-P — LA VALEUR PRIME SUR LE MOT D'ÉTAT. La vision lit la bonne valeur mais l'ÉTIQUETTE d'un mot instable (« rempli » / « valide »
 * / « valeur »…). Donc : (1) une valeur exploitable présente → VALEUR, quel que soit le mot d'état (on ne jette JAMAIS un nombre lu) ;
 * (2) pas de valeur + état signalant le vide → VIDE (distinction vide ≠ 0 de N10-O intacte) ; (3) sinon → ILLISIBLE. Le mot d'état ne
 * sert plus qu'à reconnaître un vide, jamais à valider une valeur.
 */
export function etatVersLecture(etat: unknown, valeur: unknown): LectureValeur {
  const v = String(valeur ?? '').trim();
  const nonExploitable = new Set(['', 'vide', 'none', 'null', 'n/a', 'na', '-', '—']);
  if (!nonExploitable.has(v.toLowerCase())) return { statut: 'valeur', valeur: v };   // (1) un nombre/texte lu survit à tout adjectif
  const e = String(etat ?? '').toLowerCase().trim();
  if (e.startsWith('vide') || e.startsWith('non') || e === 'absent') return { statut: 'vide' }; // (2) vide explicite (≠ 0)
  return { statut: 'illisible' };                                                     // (3) ni valeur ni vide franc
}

/** Lit les DEUX sources et rend, par champ, la lecture OCR et la lecture vision (pures LectureValeur). */
export async function lireCerfaScan(pdf: Buffer, lecteur: LecteurCerfa): Promise<{
  scalaires: Record<'surfacePlancherM2' | 'nbLogements' | 'nbPlacesStationnement' | 'adresseTerrain', { ocr: LectureValeur; vision: LectureValeur }>;
  destinations: { ocr: Record<string, LectureValeur>; vision: Record<string, LectureValeur> };
}> {
  const md = await lecteur.ocr(pdf);                    // markdown par page (index 0-based)
  const page = (n: number) => md[n - 1] ?? '';

  const visU = async (n: number, prompt: string) => lecteur.vision(lecteur.rasteriser(pdf, n), prompt);

  // OCR (déterministe)
  const ocr = {
    adresseTerrain: parseAdresseOcr(page(PAGES_CERFA.adresse)),
    surfacePlancherM2: parseSurfaceOcr(page(PAGES_CERFA.destinations)),
    nbLogements: parseLogementsOcr(page(PAGES_CERFA.logements)),
    nbPlacesStationnement: parseStationnementOcr(page(PAGES_CERFA.stationnement)),
    destinations: parseDestinationsOcr(page(PAGES_CERFA.destinations)),
  };

  // VISION — chaque prompt NOMME sa cible sans ambiguïté (N10-P : le banc obtenait un état stable ainsi ; le point 1 verrouille de toute façon).
  const vAdr = (await visU(PAGES_CERFA.adresse, "Dans la section « 3.1 Localisation du (ou des) terrain(s) », sous « Adresse du (ou des) terrain(s) », lis : Numéro, Voie, Code postal, Localité. JSON {numero,voie,code_postal,localite}." + CONSIGNE)) as Record<string, unknown>;
  const adrParts = ['numero', 'voie', 'code_postal', 'localite'].map((k) => String(vAdr[k] ?? '').trim()).filter((x) => x && x.toLowerCase() !== 'vide');
  const visAdresse: LectureValeur = adrParts.length >= 3 ? { statut: 'valeur', valeur: adrParts.join(' ') } : { statut: 'vide' };

  const vLog = (await visU(PAGES_CERFA.logements, "Dans « 4.3 Informations complémentaires », lis la ligne « Nombre total de logements créés ». JSON {logements_crees:{etat:'renseigne|vide|illisible',valeur}}." + CONSIGNE)) as { logements_crees?: { etat?: unknown; valeur?: unknown } };
  const vSta = (await visU(PAGES_CERFA.stationnement, "Dans « 4.7 Stationnement », sous « Nombre de places de stationnement », lis la ligne « Après réalisation du projet ». JSON {apres:{etat,valeur}}." + CONSIGNE)) as { apres?: { etat?: unknown; valeur?: unknown } };
  const vSur = (await visU(PAGES_CERFA.destinations, "Dans le tableau des surfaces, lis la ligne « Surfaces totales (en m²) », colonne « Surface totale = (A)+(B)+(C)-(D)-(E) » (dernière colonne du tableau). JSON {surface_plancher_totale:{etat,valeur}}." + CONSIGNE)) as { surface_plancher_totale?: { etat?: unknown; valeur?: unknown } };

  const vDestBrut = (await visU(PAGES_CERFA.destinations,
    "Tableau « 4.5 Destination, sous-destination des constructions et tableau des surfaces » d'un Cerfa 13409. Pour CHAQUE sous-destination listée, regarde sa LIGNE et dis si une SURFACE (un nombre) y figure : 'renseignee' (+valeur), 'vide', ou 'illisible'. N'invente aucun nombre ; ligne sans chiffre = 'vide'. JSON {resultats:[{sous_destination,etat,valeur}]}. Sous-destinations : " + SOUS_DESTINATIONS.join(' | '))) as { resultats?: { sous_destination?: string; etat?: unknown; valeur?: unknown }[] };
  const visDest: Record<string, LectureValeur> = {};
  for (const sd of SOUS_DESTINATIONS) {
    const r = (vDestBrut.resultats ?? []).find((x) => (x.sous_destination ?? '').toLowerCase() === sd.toLowerCase());
    visDest[sd] = r ? etatVersLecture(r.etat, r.valeur) : { statut: 'illisible' };
  }

  return {
    scalaires: {
      adresseTerrain: { ocr: ocr.adresseTerrain, vision: visAdresse },
      surfacePlancherM2: { ocr: ocr.surfacePlancherM2, vision: etatVersLecture(vSur.surface_plancher_totale?.etat, vSur.surface_plancher_totale?.valeur) },
      nbLogements: { ocr: ocr.nbLogements, vision: etatVersLecture(vLog.logements_crees?.etat, vLog.logements_crees?.valeur) },
      nbPlacesStationnement: { ocr: ocr.nbPlacesStationnement, vision: etatVersLecture(vSta.apres?.etat, vSta.apres?.valeur) },
    },
    destinations: { ocr: ocr.destinations, vision: visDest },
  };
}

// ── Lecteur RÉEL (Mistral) — hors des tests ─────────────────────────────────────────────────────────────────────────────────────
function rasteriser(pdf: Buffer, page: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerfa-scan-'));
  try {
    writeFileSync(join(dir, 'd.pdf'), pdf);
    execFileSync('pdftoppm', ['-jpeg', '-r', '200', '-f', String(page), '-l', String(page), '-singlefile', join(dir, 'd.pdf'), join(dir, 'p')]);
    return readFileSync(join(dir, 'p.jpg')).toString('base64');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Usage cumulé d'une passe Mistral, pour chiffrer le coût. */
export interface UsageMistral { ocrPages: number; promptTokens: number; completionTokens: number }
/** Coût USD (tarifs LISTE : mistral-medium-3 0,40 $/M in · 2,00 $/M out ; mistral-ocr 1 $/1000 pages). */
export const coutUsd = (u: UsageMistral): number => u.ocrPages * 1e-3 + u.promptTokens * 0.4e-6 + u.completionTokens * 2e-6;

/** Lecteur RÉEL : OCR + vision via l'API Mistral (clé MISTRAL_API_KEY). Jamais utilisé par les tests. `usage` (optionnel) cumule les tokens. */
export function lecteurMistral(usage?: UsageMistral): LecteurCerfa {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) throw new Error('MISTRAL_API_KEY absente — lecture Cerfa scanné impossible');
  const post = async (url: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
  return {
    rasteriser,
    async ocr(pdf) {
      const d = await post('https://api.mistral.ai/v1/ocr', { model: 'mistral-ocr-latest', document: { type: 'document_url', document_url: `data:application/pdf;base64,${pdf.toString('base64')}` }, include_image_base64: false });
      if (usage) usage.ocrPages += (d.usage_info as { pages_processed?: number })?.pages_processed ?? 0;
      const pages = (d.pages as { index: number; markdown?: string }[]) ?? [];
      const out: string[] = [];
      for (const p of pages) out[p.index] = p.markdown ?? '';
      return out;
    },
    async vision(imageB64, prompt) {
      const d = await post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-medium-latest', temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: `data:image/jpeg;base64,${imageB64}` }] }],
      });
      const u = d.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      if (usage) { usage.promptTokens += u?.prompt_tokens ?? 0; usage.completionTokens += u?.completion_tokens ?? 0; }
      const content = (((d.choices as { message?: { content?: string } }[])?.[0]?.message?.content) ?? '{}');
      try { return JSON.parse(content) as Record<string, unknown>; } catch { return {}; }
    },
  };
}
