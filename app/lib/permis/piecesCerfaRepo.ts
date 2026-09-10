import { query } from '../db/client';
import { nombrePagesPdf } from './extractionPdf';

/**
 * CR-2a — PIÈCES CERFA d'un dossier pour la section « Pièces analysées » de la cartouche : nom + nombre de pages + id (pour le lien GED
 * signé, réutilisé côté écran). Les ids Cerfa sont lus du PRÉCALCUL best-of (`resultat.cerfaIds`, déjà stocké — la pièce Cerfa est
 * identifiée PAR CONTENU), donc AUCUN recalcul. Le nombre de pages exige la lecture du PDF (numPages) — bornée aux SEULES pièces Cerfa
 * (typiquement une), et appelée UNIQUEMENT dans la sous-requête DIFFÉRÉE (jamais dans le payload principal → ouverture instantanée).
 * RÉSILIENT : best-of/pièce absents, migration manquante, S3 en échec → liste vide ou pages null, jamais d'exception.
 */
export interface PieceCerfaInfo { id: number; nom: string; pages: number | null }

export async function lirePiecesCerfa(dossierId: number): Promise<PieceCerfaInfo[]> {
  let pieces: { id: number; nom: string; typeMime: string | null; cle: string }[];
  try {
    const { rows } = await query<{ id: number; nom_fichier: string; type_mime: string | null; cle_stockage: string }>(
      `SELECT dd.id::int AS id, dd.nom_fichier, dd.type_mime, dd.cle_stockage
         FROM dossier_document dd
        WHERE dd.dossier_id = $1
          AND dd.id IN (
            SELECT jsonb_array_elements_text(resultat->'cerfaIds')::int
              FROM permis_best_of_precalcul WHERE dossier_id = $1 AND type = 'best_of')
        ORDER BY dd.id`, [dossierId]);
    pieces = rows.map((r) => ({ id: r.id, nom: r.nom_fichier, typeMime: r.type_mime, cle: r.cle_stockage }));
  } catch {
    return []; // best-of / colonne absente → pas de section (comportement dégradé, jamais une panne)
  }
  if (pieces.length === 0) return [];
  const { recuperer } = await import('../stockage'); // DYNAMIQUE : `stockage` tire server-only (config) + @aws-sdk → hors graphe statique
  const out: PieceCerfaInfo[] = [];
  for (const p of pieces) {
    let pages: number | null = null;
    try { pages = await nombrePagesPdf(await recuperer(p.cle), p.typeMime); } catch { pages = null; }
    out.push({ id: p.id, nom: p.nom, pages });
  }
  return out;
}
