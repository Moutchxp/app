// Adaptateur IA photo (Famille 2) — appel Gemini en REST natif (fetch), SANS SDK.
// Sépare strictement : parsing PUR (parserReponseIa) | appel réseau (appelerGemini) | orchestration.
// Biais prudent partout : tout doute → photo inexploitable (listes vidées), jamais d'invention.
import "dotenv/config";
import { construirePromptIaPhoto } from "./promptIaPhoto";
import type { MonumentCandidatGeo } from "./preparateurPaysage";
import type {
  ReponseIaPhoto,
  FractionVisible,
  NuisanceMajeure,
  NuisanceMineure,
  MonumentId,
} from "./contratIaPhoto";

const MODELE_GEMINI = "gemini-2.5-flash";
const TIMEOUT_MS = 20000;

// Ensembles de valeurs valides (tableaux littéraux → validation à l'exécution).
const FRACTIONS_VALIDES: readonly FractionVisible[] = [
  "PLUS_DES_TROIS_QUARTS",
  "AU_MOINS_LA_MOITIE",
  "AU_MOINS_UN_QUART",
  "MOINS_DUN_QUART",
];
const NUISANCES_MAJEURES_VALIDES: readonly NuisanceMajeure[] = [
  "LIGNE_HAUTE_TENSION",
  "INDUSTRIEL_FRICHE",
  "SILO_CHATEAU_EAU",
];
const NUISANCES_MINEURES_VALIDES: readonly NuisanceMineure[] = [
  "ANTENNE_TELECOM",
  "PANNEAU_PUBLICITAIRE",
  "MUR_AVEUGLE",
  "GRAND_PARKING",
];

export type ResultatIaPhoto =
  | { statut: "ok"; reponse: ReponseIaPhoto } // l'IA a répondu, JSON valide (même si photoExploitable: false)
  | { statut: "echec_technique"; raison: string }; // réseau / JSON cassé / clé absente — distinct de « photo inexploitable »

/** Réponse neutre « photo inexploitable » (objet frais à chaque appel). */
function inexploitable(): ReponseIaPhoto {
  return { photoExploitable: false, monuments: [], nuisancesMajeures: [], nuisancesMineures: [] };
}

/** Filtre un tableau brut sur un ensemble de valeurs valides, dédoublonne, ignore le reste. */
function filtrerDedup<T extends string>(valeur: unknown, valides: readonly T[]): T[] {
  if (!Array.isArray(valeur)) return [];
  const out: T[] = [];
  const vus = new Set<string>();
  for (const v of valeur) {
    if (typeof v !== "string") continue;
    if (!(valides as readonly string[]).includes(v)) continue;
    if (vus.has(v)) continue;
    vus.add(v);
    out.push(v as T);
  }
  return out;
}

/**
 * PURE — convertit le JSON snake_case du modèle en ReponseIaPhoto (camelCase), avec validation
 * stricte et biais prudent. Ne lève jamais : tout problème → fallback inexploitable.
 */
export function parserReponseIa(
  texteJson: string,
  idsCandidats: readonly MonumentId[],
): ReponseIaPhoto {
  try {
    let brut: unknown;
    try {
      brut = JSON.parse(texteJson);
    } catch {
      return inexploitable();
    }
    if (typeof brut !== "object" || brut === null) return inexploitable();
    const obj = brut as Record<string, unknown>;

    // photo_exploitable : exactement true (booléen), sinon false → inexploitable (listes vidées).
    if (obj.photo_exploitable !== true) return inexploitable();

    // monuments : ne garder que id ∈ candidats ET fraction_visible valide. Dédup par id.
    const idsSet = new Set<string>(idsCandidats as readonly string[]);
    const monuments: { id: MonumentId; fractionVisible: FractionVisible }[] = [];
    const vusId = new Set<string>();
    const arrMon = Array.isArray(obj.monuments) ? obj.monuments : [];
    for (const e of arrMon) {
      if (typeof e !== "object" || e === null) continue;
      const me = e as Record<string, unknown>;
      const id = me.id;
      const fv = me.fraction_visible;
      if (typeof id !== "string" || typeof fv !== "string") continue;
      if (!idsSet.has(id)) continue; // id inconnu / hors candidats
      if (!(FRACTIONS_VALIDES as readonly string[]).includes(fv)) continue; // fraction inconnue
      if (vusId.has(id)) continue;
      vusId.add(id);
      monuments.push({ id: id as MonumentId, fractionVisible: fv as FractionVisible });
    }

    const nuisancesMajeures = filtrerDedup<NuisanceMajeure>(
      obj.nuisances_majeures,
      NUISANCES_MAJEURES_VALIDES,
    );
    const nuisancesMineures = filtrerDedup<NuisanceMineure>(
      obj.nuisances_mineures,
      NUISANCES_MINEURES_VALIDES,
    );

    return { photoExploitable: true, monuments, nuisancesMajeures, nuisancesMineures };
  } catch {
    return inexploitable();
  }
}

/** SEULE fonction spécifique Gemini : appel REST + timeout. Renvoie le texte brut ou un échec. */
async function appelerGemini(
  prompt: string,
  photoBase64SansPrefixe: string,
): Promise<{ ok: true; texte: string } | { ok: false; raison: string }> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) return { ok: false, raison: "GEMINI_API_KEY absente" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_GEMINI}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "image/jpeg", data: photoBase64SansPrefixe } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return { ok: false, raison: `HTTP ${response.status}` };
    const data = await response.json();
    const texte = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof texte !== "string" || texte.length === 0) return { ok: false, raison: "réponse vide" };
    return { ok: true, texte };
  } catch (e) {
    const raison = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { ok: false, raison };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Orchestrateur : data-URL photo + azimut + candidats → ResultatIaPhoto.
 * Échec réseau/clé/JSON cassé → "echec_technique" (distinct d'une photo simplement inexploitable).
 */
export async function analyserPhotoIa(params: {
  photoDataUrl: string;
  azimutPrincipalDeg: number;
  candidats: MonumentCandidatGeo[];
}): Promise<ResultatIaPhoto> {
  const base64 = params.photoDataUrl.includes(",")
    ? params.photoDataUrl.split(",")[1]
    : params.photoDataUrl;
  const prompt = construirePromptIaPhoto(params.azimutPrincipalDeg, params.candidats);
  const resultat = await appelerGemini(prompt, base64);
  if (!resultat.ok) return { statut: "echec_technique", raison: resultat.raison };
  const reponse = parserReponseIa(
    resultat.texte,
    params.candidats.map((c) => c.id),
  );
  return { statut: "ok", reponse };
}
