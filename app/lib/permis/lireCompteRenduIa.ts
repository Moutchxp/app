/**
 * CR-2b1 — LECTURE IA VISION d'un Cerfa : UN SEUL appel multi-pages, sortie VALIDÉE (Zod). Réutilise la rasterisation pdftoppm et le
 * cumul de coût de `lireCerfaScan.ts`. RGPD : seules les pages retenues par `selectionnerPagesIa` (cible ET sans identité) sont
 * rasterisées puis transmises — JAMAIS le PDF entier. Le `LecteurCompteRenduIa` est INJECTABLE → les tests bouchonnent tout (aucun
 * réseau, aucun binaire).
 *
 * Le modèle a le DROIT de ne pas savoir (abstention par champ). Une sortie non conforme est REJETÉE (statut 'echec'), jamais devinée.
 * Pannes (clé absente, HTTP 401 fournisseur, timeout, sortie invalide) → statut 'echec' + motif, JAMAIS un crash ni un catch muet.
 *
 * 📏 MESURE (dry-run réel du 10/09/2026, mistral-medium-latest, dossiers 468/470/531) — CE N'EST PAS UNE PROMESSE, C'EST UNE MESURE :
 *   - le modèle a ABSTENU sur les CASES À COCHER (`natureProjet`, `recoursArchitecte`, `travauxParTranches`) sur les 3 dossiers —
 *     or ces cases étaient sa seule raison d'être ici ; il n'a donc PAS résolu l'ambiguïté « nature du projet » du 468 ;
 *   - il n'a apporté avec assurance que `typeOperationSvav` (« immeuble ») et `demolition` (false), page citée — deux infos que la
 *     voie DÉTERMINISTE connaît déjà ;
 *   - 1 dossier sur 3 (531) a été REJETÉ par la validation (le modèle enveloppait `resumeDescription` dans {valeur,confiance,page}).
 *   Coût de la passe : ~0,002–0,003 USD/dossier. → Utilité RÉELLE faible en l'état ; cet étage est INFORMATIF, jamais autoritatif.
 *
 * 🔒 LECTURE SEULE. Cet étage N'ÉCRIT AUCUN CHAMP (ni permis_caracteristique, ni permis_corps_batiment) et RIEN dans ce lot ne le
 * branche sur un déclenchement AUTOMATIQUE : aucune boucle, aucune veille, aucun appel depuis precalculBestOfAuto. Il ne tourne que
 * sur invocation EXPLICITE du script (dry-run par défaut). L'écriture de champs, si un jour jugée fiable, serait un lot distinct.
 */
import { rasteriser as rasteriserReel, coutUsd, type UsageMistral } from './lireCerfaScan';
import { selectionnerPagesIa, journalTransmission, type PageTexteIa, type JournalTransmissionPiece } from './selectionPagesCerfaIa';
import { construirePromptIa, validerSortieIa, SEUIL_RESUME_DESCRIPTION, type CompteRenduIa } from './compteRenduIaSchema';

/** Adaptateur injectable : rasterisation d'une page + UN appel vision multi-images. */
export interface LecteurCompteRenduIa {
  rasteriser(pdf: Buffer, page: number): string;                                   // JPEG base64 d'UNE page (1-based)
  visionMultiPages(images: readonly string[], prompt: string): Promise<{ json: unknown; usage: { promptTokens: number; completionTokens: number }; modele: string }>;
}

export type StatutPasseIa = 'lu' | 'abstention' | 'echec';

export interface ResultatCompteRenduIa {
  transmission: JournalTransmissionPiece;   // preuve : pages envoyées / refusées + motifs (écrite AVANT l'appel)
  lecture: CompteRenduIa | null;            // compte rendu structuré (null si abstention / échec)
  statut: StatutPasseIa;
  motif: string | null;                     // motif si 'echec' / 'abstention'
  modele: string | null;
  coutUsd: number;
}

export interface EntreePieceIa { pieceId: number; pieceNom: string; pdf: Buffer; pages: readonly PageTexteIa[] }

/**
 * Une PASSE de lecture IA sur UNE pièce Cerfa. Sélection RGPD → (si des pages passent) rasterisation des SEULES pages retenues → UN
 * appel → validation. `texteLibreLongueur` pilote la demande de résumé (seuil). `budgetPages` plafonne (défaut = plafond de la sélection).
 */
export async function lireCompteRenduIa(
  piece: EntreePieceIa, lecteur: LecteurCompteRenduIa, opts: { texteLibreLongueur: number },
): Promise<ResultatCompteRenduIa> {
  const selection = selectionnerPagesIa(piece.pages);
  const transmission = journalTransmission(piece.pieceId, piece.pieceNom, selection);

  // ABSTENTION : aucune page transmissible → AUCUN appel, aucune donnée sortie. La trace (transmission) prouve la garde.
  if (selection.envoyees.length === 0) {
    return { transmission, lecture: null, statut: 'abstention', motif: 'aucune page transmissible (cible absente ou mêlée à de l’identité)', modele: null, coutUsd: 0 };
  }

  const pagesEnvoyees = selection.envoyees.map((e) => e.page);
  const images = pagesEnvoyees.map((p) => lecteur.rasteriser(piece.pdf, p)); // SEULES les pages retenues
  const prompt = construirePromptIa(pagesEnvoyees, opts.texteLibreLongueur > SEUIL_RESUME_DESCRIPTION);

  try {
    const { json, usage, modele } = await lecteur.visionMultiPages(images, prompt);
    const cout = coutUsd({ ocrPages: 0, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } as UsageMistral);
    const valide = validerSortieIa(json);
    if (!valide.ok) return { transmission, lecture: null, statut: 'echec', motif: valide.erreur, modele, coutUsd: cout };
    const lecture: CompteRenduIa = { ...valide.valeur };
    // Le résumé ne s'AJOUTE que si le texte libre dépasse le seuil ; sinon on force null (le texte intégral suffit — CR-2b1 §3).
    if (opts.texteLibreLongueur <= SEUIL_RESUME_DESCRIPTION) lecture.resumeDescription = null;
    return { transmission, lecture, statut: 'lu', motif: null, modele, coutUsd: cout };
  } catch (e) {
    // Panne fournisseur (clé absente, HTTP 401, timeout…) → statut 'echec' + motif distinguable, jamais un crash.
    return { transmission, lecture: null, statut: 'echec', motif: `lecture IA non disponible : ${e instanceof Error ? e.message : String(e)}`, modele: null, coutUsd: 0 };
  }
}

// ── Lecteur RÉEL (Mistral) — hors des tests. UN appel /v1/chat/completions, N images, response_format json_object. ────────────────
const MODELE_IA = 'mistral-medium-latest';

export function lecteurCompteRenduMistral(): LecteurCompteRenduIa {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) throw new Error('MISTRAL_API_KEY absente'); // panne « clé absente » — capturée par l'orchestrateur
  return {
    rasteriser: rasteriserReel,
    async visionMultiPages(images, prompt) {
      const contenu = [
        { type: 'text', text: prompt },
        ...images.map((img) => ({ type: 'image_url', image_url: `data:image/jpeg;base64,${img}` })),
      ];
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELE_IA, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: contenu }] }),
      });
      if (!res.ok) throw new Error(`fournisseur HTTP ${res.status}`); // 401/500… → panne distinguable (≠ 401 session admin)
      const d = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string; choices?: { message?: { content?: string } }[] };
      const content = d.choices?.[0]?.message?.content ?? '{}';
      let json: unknown;
      try { json = JSON.parse(content); } catch { json = {}; } // JSON illisible → {} → la validation Zod le rejettera proprement
      return { json, usage: { promptTokens: d.usage?.prompt_tokens ?? 0, completionTokens: d.usage?.completion_tokens ?? 0 }, modele: d.model ?? MODELE_IA };
    },
  };
}
