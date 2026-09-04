/**
 * LOT 62 — REPÉRAGE des PLANCHES ENCASTRÉES par ANALYSE D'IMAGE (une pièce à nom opaque, ex. « PC200 Autres pièces », est une notice
 * en prose dont les plans sont des IMAGES que le best-of TEXTUEL ne voit pas — mesuré au 59-B). PÉRIMÈTRE STRICT : PRÉSENCE SEULEMENT.
 * La sortie par page est {planche: oui/non/incertain, categorie} et RIEN d'autre. On n'écrit JAMAIS ce qu'il y a SUR la planche (pas
 * de cote, pas d'altitude) : l'historique du projet (P2/P4/P5) a montré qu'un modèle INVENTE une certitude dès qu'il « lit » un plan.
 * Une présence mal repérée se voit en un coup d'œil (Arno ouvre la page) ; une cote inventée, non.
 *
 * 🔒 GARDE DE PAGES — PLUS FAIBLE QU'AU 56-E, ET C'EST DIT ICI : sur le Cerfa on connaît la pagination → LISTE D'AUTORISATION. Les
 * planches encastrées n'ont ni titre ni pagination stable → on ne peut faire qu'une LISTE D'EXCLUSION, régime moins sûr. On compense
 * par un pré-filtre par page sur la COUCHE TEXTE, EN ABSTENTION : toute page portant un signal de donnée personnelle (nom d'auteur,
 * cartouche émetteur, « signature », civilité+nom, e-mail, téléphone) n'est PAS envoyée ; une page SANS texte (scan) ne peut pas être
 * vérifiée → NON envoyée non plus (doute). Le nombre de pages écartées et le motif sont journalisés (jamais une abstention muette).
 *
 * Le `LecteurPlanches` est INJECTABLE : les tests bouchonnent rasterisation + vision (aucun appel réseau ni binaire).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Modèle utilisé (le tag encode la version ; la version RÉSOLUE est relue de la réponse API, cf. `lecteurPlanchesMistral`). */
export const MODELE_PLANCHE = 'mistral-medium-latest';

/** Question FERMÉE, calée sur la mesure du 62-A (0 faux positif / 0 faux négatif sur 10 pages). PRÉSENCE seulement, jamais lecture. */
export const PROMPT_PLANCHE = `Cette image est UNE page d'un document d'urbanisme (permis de construire). Question FERMÉE et UNIQUE : la page contient-elle une PLANCHE TECHNIQUE, c'est-à-dire un dessin d'architecte ou de géomètre destiné à être lu comme tel — plan (de masse, de niveau, de sous-sol, des toitures, cadastral), coupe, façade, élévation, ou schéma coté ? NE considère PAS comme planche : un rendu ou une perspective photoréaliste, une vue aérienne, une axonométrie ou vue 3D, une carte de réseau ou de situation, un tableau, du texte de prose, un sommaire, un logo, une photo de matériaux. Si tu hésites, réponds "incertain" (c'est un choix valide, pas un pis-aller). Réponds STRICTEMENT en JSON, rien d'autre : {"planche":"oui|non|incertain","categorie":"plan|coupe|facade|elevation|schema_cote|aucune"}.`;

export interface LecteurPlanches {
  rasteriser(pdf: Buffer, page: number): string;                       // image base64 d'une page (1-based)
  vision(imageB64: string, prompt: string): Promise<Record<string, unknown>>;
}

export type VerdictPlanche = 'oui' | 'non' | 'incertain';
const CATEGORIES = new Set(['plan', 'coupe', 'facade', 'elevation', 'schema_cote', 'aucune']);

/** Normalise la réponse du modèle en un verdict SÛR (jamais une valeur inventée). Réponse inexploitable → 'incertain'/'aucune'. */
export function verdictDepuisReponse(r: Record<string, unknown>): { verdict: VerdictPlanche; categorie: string } {
  const p = String(r?.planche ?? '').toLowerCase().trim();
  const verdict: VerdictPlanche = p === 'oui' ? 'oui' : p === 'non' ? 'non' : 'incertain';
  const c = String(r?.categorie ?? '').toLowerCase().trim();
  const categorie = CATEGORIES.has(c) ? c : 'aucune';
  return { verdict, categorie: verdict === 'oui' ? (categorie === 'aucune' ? 'plan' : categorie) : 'aucune' };
}

// ── PRÉ-FILTRE RGPD (pur) : on bloque ce qui identifie une PERSONNE, pas ce qui localise/contacte le PROJET ────────────────────────
// LOT 63 — ARBITRAGE (identique au 56-E) : téléphone, e-mail, nom de société, SIRET, adresse d'entreprise, et le cartouche émetteur
//   « Rédaction | Vérification | Validation » PRIS SEUL sont des CONTACTS PROFESSIONNELS PUBLIÉS → ils NE BLOQUENT PLUS à eux seuls
//   (quasi toutes les planches d'architecte en portent → sinon le repérage serait inutilisable, mesuré sur le dossier 7424 : 2/32
//   pages écartées au lieu de 5). RESTENT BLOQUANTS, car ils identifient une PERSONNE PHYSIQUE : civilité+nom, date de naissance,
//   signature, ET le cartouche émetteur QUAND IL NOMME DES PERSONNES (initiale + patronyme, ex. « J.TRESCARTES » — cas p1 de PC200
//   du 62-A, qui NE doit PAS régresser). ABSTENTION conservée : une page SANS texte reste invérifiable → non envoyée.
const RE_NAISSANCE = /\bnée?\s+le\b/i;
const RE_SIGNATURE = /signature\s+(numérique|manuscrite|électronique|electronique)|signé\s+par/i; // signature de personne (jamais un simple champ « Signature : » vide d'un cartouche)
const RE_CIVILITE_NOM = /\b(Monsieur|Madame|Mademoiselle|Mme|Mlle)\.?\s+[A-ZÉÈÀ][a-zà-ÿ'-]+/;    // « Monsieur Monteils », « Mme Durand »
const RE_REDACTION = /r[ée]daction/i, RE_VERIF = /v[ée]rification/i, RE_VALIDATION = /validation/i;
// Nom de PERSONNE en convention de cartouche : INITIALE + PATRONYME en capitales (« J.TRESCARTES », « H. NAULIN »). Ne matche NI un
//   nom de société (« SGP », « GRAND PARIS ») NI un nom de projet (« FERRAGUS ») : ceux-ci n'ont pas la forme « X. PATRONYME ».
const RE_NOM_PERSONNE = /\b[A-ZÉÈ]\.\s?[A-ZÉÈ][A-ZÉÈ']{2,}\b/;

/**
 * Une page doit-elle être ÉCARTÉE avant tout envoi (donnée d'une PERSONNE PHYSIQUE, ou texte absent = invérifiable) ? ABSTENTION : au
 * moindre signal de personne, ou en l'absence de texte, on n'envoie pas. Un contact PROFESSIONNEL (tél/e-mail/société/SIRET) ou une
 * adresse de projet / référence cadastrale n'est PAS un signal (même critère qu'au 56-E). Le motif NOMME le signal réel. PUR.
 */
export function pageExclueRgpd(texte: string): { exclue: boolean; motif: string | null } {
  const t = texte ?? '';
  if (t.trim().length === 0) return { exclue: true, motif: 'page sans texte exploitable — impossible de vérifier l’absence de données personnelles' };
  if (RE_NAISSANCE.test(t)) return { exclue: true, motif: 'date de naissance d’une personne détectée' };
  if (RE_SIGNATURE.test(t)) return { exclue: true, motif: 'signature d’une personne détectée' };
  if (RE_CIVILITE_NOM.test(t)) return { exclue: true, motif: 'civilité + nom d’une personne détectés' };
  // Cartouche émetteur : bloque UNIQUEMENT s'il NOMME des personnes (initiale + patronyme). L'entête seul ne bloque plus.
  if (RE_REDACTION.test(t) && RE_VERIF.test(t) && RE_VALIDATION.test(t) && RE_NOM_PERSONNE.test(t)) return { exclue: true, motif: 'noms de personnes dans le cartouche émetteur (rédaction/vérification/validation)' };
  return { exclue: false, motif: null };
}

// ── ORCHESTRATEUR (testable par injection : aucune I/O ici) ───────────────────────────────────────────────────────────────────────
export interface DepsReperage {
  textesPages(): Promise<string[]>;   // texte par page (index 0-based), '' pour une page sans texte
  pdf(): Promise<Buffer>;             // le PDF de la pièce (pour rasteriser les pages autorisées)
  lecteur: LecteurPlanches;
}
export interface ResultatReperage {
  pagesEnvoyees: number[];
  pagesEcartees: { page: number; motif: string }[];
  verdicts: { page: number; verdict: VerdictPlanche; categorie: string }[]; // pour les pages ENVOYÉES uniquement
}

/**
 * Pour CHAQUE page : pré-filtre RGPD → si écartée, on la journalise et on ne l'envoie JAMAIS ; sinon on rasterise et on pose la
 * question FERMÉE. Aucune lecture de contenu, aucune écriture ici (la persistance/journal vit dans la route + le repo). PRÉSENCE seule.
 */
export async function executerReperagePlanches(deps: DepsReperage): Promise<ResultatReperage> {
  const textes = await deps.textesPages();
  const pagesEnvoyees: number[] = [];
  const pagesEcartees: { page: number; motif: string }[] = [];
  for (let i = 0; i < textes.length; i += 1) {
    const g = pageExclueRgpd(textes[i]);
    if (g.exclue) pagesEcartees.push({ page: i + 1, motif: g.motif! });
    else pagesEnvoyees.push(i + 1);
  }
  const verdicts: ResultatReperage['verdicts'] = [];
  if (pagesEnvoyees.length > 0) {
    const pdf = await deps.pdf();
    for (const page of pagesEnvoyees) {
      const img = deps.lecteur.rasteriser(pdf, page);
      const r = await deps.lecteur.vision(img, PROMPT_PLANCHE);
      const { verdict, categorie } = verdictDepuisReponse(r);
      verdicts.push({ page, verdict, categorie });
    }
  }
  return { pagesEnvoyees, pagesEcartees, verdicts };
}

// ── Lecteur RÉEL (Mistral) — hors des tests ─────────────────────────────────────────────────────────────────────────────────────
export interface UsageVision { promptTokens: number; completionTokens: number; modeleResolu: string | null }
/** Coût USD (tarifs LISTE mistral-medium : 0,40 $/M in · 2,00 $/M out). Mesuré au 62-A ≈ 0,1 ¢/page. */
export const coutVisionUsd = (u: UsageVision): number => u.promptTokens * 0.4e-6 + u.completionTokens * 2e-6;

function rasteriserReel(pdf: Buffer, page: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'planche-'));
  try {
    writeFileSync(join(dir, 'd.pdf'), pdf);
    execFileSync('pdftoppm', ['-jpeg', '-r', '150', '-f', String(page), '-l', String(page), '-singlefile', join(dir, 'd.pdf'), join(dir, 'p')]);
    return readFileSync(join(dir, 'p.jpg')).toString('base64');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Lecteur RÉEL : rasterisation poppler + vision Mistral (clé MISTRAL_API_KEY). Jamais utilisé par les tests. `usage` cumule tokens + modèle résolu. */
export function lecteurPlanchesMistral(usage?: UsageVision): LecteurPlanches {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) throw new Error('MISTRAL_API_KEY absente — repérage des planches impossible');
  return {
    rasteriser: rasteriserReel,
    async vision(imageB64, prompt) {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELE_PLANCHE, temperature: 0, response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: `data:image/jpeg;base64,${imageB64}` }] }] }) });
      if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`);
      const d = await res.json() as { usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string; choices?: { message?: { content?: string } }[] };
      if (usage) { usage.promptTokens += d.usage?.prompt_tokens ?? 0; usage.completionTokens += d.usage?.completion_tokens ?? 0; usage.modeleResolu = d.model ?? usage.modeleResolu; }
      try { return JSON.parse(d.choices?.[0]?.message?.content ?? '{}') as Record<string, unknown>; } catch { return {}; }
    },
  };
}
