/**
 * N4 — LECTURE INTÉGRALE de la GED d'un permis : pour CHAQUE pièce, le texte de CHAQUE page, sans troncature et sans s'arrêter
 * à la première trouvaille (différence avec `depotManuel`, qui cherche un numéro et s'arrête). Brique de lecture réutilisable
 * (fiche de synthèse, extraction assistée) ; le CLI `ged:dump` n'en est qu'un appelant.
 *
 * `lireGedPermis` est PURE par INJECTION de deps (liste des pièces, lecture d'objet, extraction) → testable sans base ni
 * réseau. Les deps RÉELLES lisent `dossier_document` (query) et l'objet S3 (`stockage`, import DYNAMIQUE : il tire `server-only`
 * via sa config + @aws-sdk — jamais dans le graphe statique du CLI, cf. incident du 09/08). Extraction = brique UNIQUE partagée.
 *
 * STRICTEMENT EN LECTURE : aucune écriture, aucune migration, aucun e-mail. La fiche de synthèse GÉNÉRÉE (origine 'genere') est
 * EXCLUE — c'est notre propre production, pas un document de mairie.
 */
import { query } from '../db/client'; // module PROPRE (pg + dotenv) : peut rester statique dans le graphe du CLI
import { extrairePagesPdf, type ExtractionPdf } from './extractionPdf'; // brique UNIQUE (pdfjs en dynamique interne) ; module propre
import { MARQUEUR_FICHE_SYNTHESE } from './gedConstantes';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PieceGedMeta {
  id: number;
  nomFichier: string;
  typeMime: string | null;
  cleStockage: string;
  tailleOctets: number | null;
}
export interface PageTexte { page: number; texte: string; aTexte: boolean }
export interface PieceLue {
  id: number;
  nomFichier: string;
  typeMime: string | null;
  nbPages: number;
  pages: PageTexte[];   // vide si la pièce est muette (non-PDF, échec de lecture/extraction)
  muette: boolean;      // aucune page avec texte extrait
  motif: string | null; // motif RÉEL de la mutité (distinguable), null si la pièce a du texte
}
export interface BilanGed {
  nbPieces: number;
  nbPages: number;
  pagesAvecTexte: number;
  pagesSansTexte: number;
  piecesMuettes: number; // pièces sans AUCUN texte extrait (candidates OCR)
}
export interface ResultatLectureGed {
  dossierId: number;
  pieces: PieceLue[];
  bilan: BilanGed;
}

/** I/O injectables (aucune dépendance lourde dans les tests). */
export interface DepsLectureGed {
  listerPieces(dossierId: number): Promise<PieceGedMeta[]>;      // dossier_document du permis, fiche générée EXCLUE
  lireObjet(cle: string): Promise<Buffer>;                        // contenu S3 (peut jeter → motif d'échec par pièce)
  extraire(contenu: Buffer, typeMime: string | null): Promise<ExtractionPdf>;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Lit toute la GED d'un permis. Aucune exception ne remonte : un échec de lecture ou d'extraction d'UNE pièce est capturé en
 * `motif` distinguable (jamais un silence, jamais un catch muet) et n'interrompt PAS les pièces suivantes. Rend un bilan chiffré
 * exact — c'est lui qui décidera d'un éventuel OCR, il ne maquille rien.
 */
export async function lireGedPermis(dossierId: number, deps: DepsLectureGed): Promise<ResultatLectureGed> {
  const metas = await deps.listerPieces(dossierId);
  const pieces: PieceLue[] = [];
  for (const m of metas) {
    let contenu: Buffer;
    try {
      contenu = await deps.lireObjet(m.cleStockage);
    } catch (e) {
      pieces.push({ id: m.id, nomFichier: m.nomFichier, typeMime: m.typeMime, nbPages: 0, pages: [], muette: true, motif: `échec de lecture de l’objet : ${msg(e)}` });
      continue;
    }
    let ex: ExtractionPdf;
    try {
      ex = await deps.extraire(contenu, m.typeMime);
    } catch (e) {
      pieces.push({ id: m.id, nomFichier: m.nomFichier, typeMime: m.typeMime, nbPages: 0, pages: [], muette: true, motif: `échec d’extraction : ${msg(e)}` });
      continue;
    }
    if (!ex.ok) {
      pieces.push({ id: m.id, nomFichier: m.nomFichier, typeMime: m.typeMime, nbPages: 0, pages: [], muette: true, motif: ex.motif });
      continue;
    }
    const pages: PageTexte[] = ex.pages.map((t, i) => ({ page: i + 1, texte: t, aTexte: t.trim() !== '' }));
    const avecTexte = pages.filter((p) => p.aTexte).length;
    const muette = avecTexte === 0;
    pieces.push({
      id: m.id, nomFichier: m.nomFichier, typeMime: m.typeMime, nbPages: pages.length, pages, muette,
      motif: muette ? 'PDF sans couche texte lisible (aucune page avec texte extrait)' : null,
    });
  }
  const bilan: BilanGed = {
    nbPieces: pieces.length,
    nbPages: pieces.reduce((s, p) => s + p.nbPages, 0),
    pagesAvecTexte: pieces.reduce((s, p) => s + p.pages.filter((x) => x.aTexte).length, 0),
    pagesSansTexte: pieces.reduce((s, p) => s + p.pages.filter((x) => !x.aTexte).length, 0),
    piecesMuettes: pieces.filter((p) => p.muette).length,
  };
  return { dossierId, pieces, bilan };
}

// ── Résolution du permis (sélection CLI) ──────────────────────────────────────
export interface DossierResolu {
  dossierId: number;
  numDau: string;
  type: string;
  communeNom: string | null;
  codeInsee: string;
  adresse: string | null;
  dateAutorisation: string | null;
}
export type ResolutionDossier =
  | { ok: true; dossier: DossierResolu }
  | { ok: false; raison: 'inconnu' }
  | { ok: false; raison: 'ambigu'; candidats: { type: string; numDau: string; codeInsee: string }[] };

/**
 * Résout un permis par `num_dau` (+ `type` optionnel). `sitadel_dossier` est clé par (type, num_dau) : si le num_dau seul est
 * ambigu (plusieurs types), on N'EN CHOISIT AUCUN → `{ raison:'ambigu', candidats }` (le CLI liste et sort en erreur). LECTURE SEULE.
 */
export async function resoudreDossier(numDau: string, type?: string): Promise<ResolutionDossier> {
  const params: unknown[] = [numDau];
  let filtreType = '';
  if (type && type.trim() !== '') { params.push(type.trim().toUpperCase()); filtreType = ` AND upper(s.type) = $${params.length}`; }
  const { rows } = await query<{
    dossier_id: number; num_dau: string; type: string; commune_nom: string | null; code_insee: string;
    adresse: string | null; date_autorisation: string | null;
  }>(
    `SELECT s.id::int AS dossier_id, s.num_dau, s.type, c.nom AS commune_nom, s.code_insee,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            s.date_reelle_autorisation::text AS date_autorisation
       FROM sitadel_dossier s
       LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE s.num_dau = $1${filtreType}
      ORDER BY s.type`,
    params,
  );
  if (rows.length === 0) return { ok: false, raison: 'inconnu' };
  if (rows.length > 1) return { ok: false, raison: 'ambigu', candidats: rows.map((r) => ({ type: r.type, numDau: r.num_dau, codeInsee: r.code_insee })) };
  const r = rows[0];
  return { ok: true, dossier: { dossierId: r.dossier_id, numDau: r.num_dau, type: r.type, communeNom: r.commune_nom, codeInsee: r.code_insee, adresse: r.adresse, dateAutorisation: r.date_autorisation } };
}

// ── Deps RÉELLES (production) ──────────────────────────────────────────────────
export function depsReellesLectureGed(): DepsLectureGed {
  return {
    listerPieces: async (dossierId) => {
      // GED d'un permis = dossier_document du dossier, fiche GÉNÉRÉE EXCLUE (note = marqueur). Ordre = dépôt.
      const { rows } = await query<{ id: number; nom_fichier: string; type_mime: string | null; cle_stockage: string; taille_octets: number | null }>(
        `SELECT id::int AS id, nom_fichier, type_mime, cle_stockage, taille_octets
           FROM dossier_document
          WHERE dossier_id = $1 AND note IS DISTINCT FROM $2
          ORDER BY depose_le, id`,
        [dossierId, MARQUEUR_FICHE_SYNTHESE],
      );
      return rows.map((r) => ({ id: r.id, nomFichier: r.nom_fichier, typeMime: r.type_mime, cleStockage: r.cle_stockage, tailleOctets: r.taille_octets }));
    },
    lireObjet: async (cle) => {
      const { recuperer } = await import('../stockage'); // DYNAMIQUE : `stockage` tire server-only (config) + @aws-sdk → hors graphe statique
      return recuperer(cle);
    },
    extraire: (contenu, typeMime) => extrairePagesPdf(contenu, typeMime),
  };
}
