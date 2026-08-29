/**
 * PART-1 — DÉCISIONS PURES du versement en GED des pièces d'une réponse RATTACHÉE. Aucune I/O. Le versement suit le RATTACHEMENT
 * (la réponse est liée à une demande qui a un ou des dossiers), PAS l'expéditeur : c'est la 2e voie d'admission, en plus de la voie
 * « adresse connue + objet permis » (depotManuel, INCHANGÉE).
 *
 * Deux décisions pures ici : (1) quelle(s) pièce(s) ÉCARTER (notre propre signature citée) ; (2) sur QUEL dossier verser (1 demande =
 * 1 dossier ; le multi-dossiers est explicitement NON traité — voir cibleVersement). Le caller impur lit/écrit ; ici on ne fait que
 * trancher à partir de faits déjà collectés.
 */

/** Une pièce candidate au versement, réduite à ce qui décide de son exclusion. */
export interface PieceCandidate {
  typeMime: string | null;
  sha256: string | null;
}

/** Parse une liste d'empreintes sha256 (virgules/point-virgules/espaces) en minuscules, sans entrée vide. PURE. */
export function parserHachagesExclus(brut: string | null | undefined): string[] {
  return (brut ?? '').split(/[,;\s]+/).map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
}

/**
 * Une pièce est ÉCARTÉE du versement si son empreinte sha256 figure dans la liste d'exclusion (nos actifs propres : logo de
 * signature cité par une mairie). Critère DÉTERMINISTE et par CONTENU (jamais le nom de fichier). Comparaison insensible à la casse.
 * `sha256` absent (jamais calculé) → jamais exclu par ce critère (on ne devine pas).
 */
export function pieceExclueSignature(p: PieceCandidate, hachagesExclus: readonly string[]): boolean {
  if (p.sha256 == null || p.sha256.trim() === '') return false;
  const h = p.sha256.trim().toLowerCase();
  return hachagesExclus.some((x) => x.toLowerCase() === h);
}

/**
 * Sur quel dossier verser les pièces d'une réponse rattachée. RÈGLE (PART-1) : on NE DEVINE PAS le multi-dossiers.
 *  · exactement 1 dossier  → on verse dessus ;
 *  · 0 dossier             → rien (la demande n'a aucun permis rattaché) ;
 *  · ≥ 2 dossiers          → NON TRAITÉ (multi=true) : le caller ne verse rien et le signale (chantier séparé).
 * PURE.
 */
export function cibleVersement(dossiers: readonly { dossierId: number }[]): { dossierId: number | null; multi: boolean } {
  if (dossiers.length === 1) return { dossierId: dossiers[0].dossierId, multi: false };
  if (dossiers.length >= 2) return { dossierId: null, multi: true };
  return { dossierId: null, multi: false };
}
