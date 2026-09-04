/**
 * Brique UNIQUE d'extraction du texte d'un PDF, côté serveur, via `pdfjs-dist` (build legacy, worker désactivé). Partagée par
 * `depotManuel.ts` (N1-A : cherche un numéro et s'arrête) et `lectureGed.ts` (N4 : rend le texte de CHAQUE page). JAMAIS deux
 * implémentations. MODULE PROPRE : `pdfjs-dist` est en import DYNAMIQUE (hors graphe statique), aucun `import 'server-only'`.
 *
 * Résultat DISCRIMINÉ, jamais un silence : `{ ok:true, pages }` (une entrée par page, éventuellement vide = page sans couche
 * texte) ou `{ ok:false, motif }` (type non extractible, ou échec de lecture) — le motif est exploitable par l'appelant.
 */
export type ExtractionPdf =
  | { ok: true; pages: string[] }
  | { ok: false; motif: string };

/**
 * Extrait le texte page par page. `typeMime` non PDF → `{ ok:false }` avec un motif explicite (jamais d'exception). Un PDF
 * illisible (chiffré, corrompu) → `{ ok:false }` avec le message d'erreur réel. Un PDF SANS couche texte extrait renvoie
 * `{ ok:true }` avec des pages VIDES (c'est à l'appelant de le qualifier « muet » — cas typique d'un scan à passer à l'OCR).
 *
 * `maxPages` (optionnel, LOT 66) : ne lit que les N premières pages — pour une reconnaissance de TÊTE bon marché (ex. « cette pièce
 * est-elle le formulaire Cerfa ? »), sans extraire un document de 300 pages. Absent = toutes les pages (comportement historique).
 */
export async function extrairePagesPdf(contenu: Buffer, typeMime: string | null, maxPages?: number): Promise<ExtractionPdf> {
  if (typeMime !== 'application/pdf') return { ok: false, motif: `type non extractible (${typeMime ?? 'inconnu'})` };
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(contenu), isEvalSupported: false, useSystemFonts: true }).promise;
    const pages: string[] = [];
    const dernierePage = maxPages && maxPages > 0 ? Math.min(maxPages, doc.numPages) : doc.numPages;
    for (let n = 1; n <= dernierePage; n++) {
      const page = await doc.getPage(n);
      const contenuTexte = await page.getTextContent();
      pages.push(contenuTexte.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    await doc.destroy();
    return { ok: true, pages };
  } catch (e) {
    return { ok: false, motif: `échec de lecture du PDF : ${e instanceof Error ? e.message : String(e)}` };
  }
}
