/**
 * PART-1 — VERSEMENT en GED des pièces d'une réponse RATTACHÉE (2e voie d'admission). Passe ISOLÉE (hors de la boucle de relève) et
 * IDEMPOTENTE : pour chaque réponse « documents » rattachée à une demande, on verse ses pièces jointes stockées dans la GED du permis.
 * Le déclencheur est le RATTACHEMENT, PAS l'expéditeur — la voie « adresse connue + objet permis » (depotManuel) reste inchangée.
 *
 * Deux garde-fous (PART-1) : les pièces dont l'empreinte figure dans la liste d'exclusion (notre signature citée) ne sont JAMAIS
 * versées (`pieceExclueSignature`), et le multi-dossiers n'est PAS deviné (`cibleVersement` : ≥ 2 dossiers → non traité).
 *
 * IDEMPOTENCE : dédoublonnage pièce par pièce sur l'empreinte sha256 vs `dossier_document` (jamais deux fois le même fichier).
 * Testable par INJECTION (aucune base, aucun S3 dans les tests). Sert AUSSI le CLI de rattrapage (même orchestrateur).
 */
import { query } from '../db/client';
import { pieceExclueSignature, cibleVersement, parserHachagesExclus, type PieceCandidate } from '../permis/versementRattache';
import { PREFIXE_NOTE_VERSEMENT_AUTO } from '../permis/gedConstantes';

export interface PieceStockee { id: number; nomFichier: string; typeMime: string | null; sha256: string | null; cleStockage: string }
export interface ReponseAVerser {
  reponseId: number; demandeId: number; deAdresse: string;
  dossiers: { dossierId: number }[]; dejaSatisfait: boolean; pieces: PieceStockee[];
}

/** I/O injectables. */
export interface DepsVersementRattache {
  lireHachagesExclus(): Promise<string[]>;
  chargerReponsesAVerser(): Promise<ReponseAVerser[]>;
  empreintesEnGed(dossierId: number): Promise<Set<string>>;
  marquerSatisfait(demandeId: number, dossierId: number): Promise<void>;
  contenuPiece(cleStockage: string): Promise<Buffer | null>;
  deposer(dossierId: number, piece: { nomFichier: string; typeMime: string | null; contenu: Buffer }, expediteur: string, reponseId: number): Promise<{ ok: true } | { ok: false; motif: string }>;
}

export interface LigneBilanVersement { reponseId: number; demandeId: number; dossierId: number; versees: string[]; ecartees: string[]; doublons: string[]; echecs: string[] }
export interface BilanVersementRattache {
  reponses: number;          // réponses examinées
  versees: number; ecarteesSignature: number; ignoreesDoublon: number; echecs: number;
  multiNonTraite: number;    // réponses dont la demande a ≥ 2 dossiers (non devinées)
  lignes: LigneBilanVersement[];
  appliquer: boolean;        // false = simulation (les compteurs disent ce QUI SERAIT versé)
}

/**
 * Une passe. Pour chaque réponse rattachée : cible le dossier (1 seul), écarte les pièces de signature (sha256 exclu), déduplique vs
 * la GED, puis verse (mode appliqué) ou compte ce qui SERAIT versé (simulation). Un échec de dépôt d'UNE pièce est compté, jamais avalé.
 */
export async function executerVersementRattache(deps: DepsVersementRattache, opts: { appliquer: boolean }): Promise<BilanVersementRattache> {
  const appliquer = opts.appliquer === true;
  const hachages = await deps.lireHachagesExclus();
  const reponses = await deps.chargerReponsesAVerser();

  const bilan: BilanVersementRattache = { reponses: reponses.length, versees: 0, ecarteesSignature: 0, ignoreesDoublon: 0, echecs: 0, multiNonTraite: 0, lignes: [], appliquer };

  for (const r of reponses) {
    const cible = cibleVersement(r.dossiers);
    if (cible.multi) { bilan.multiNonTraite += 1; continue; } // ≥ 2 dossiers → non traité (chantier séparé)
    if (cible.dossierId === null) continue;                    // 0 dossier → rien à verser
    const dossierId = cible.dossierId;

    const dejaEmpreintes = await deps.empreintesEnGed(dossierId);
    const ligne: LigneBilanVersement = { reponseId: r.reponseId, demandeId: r.demandeId, dossierId, versees: [], ecartees: [], doublons: [], echecs: [] };

    // 1) TRI (pur) : signature écartée / doublon GED / à verser.
    const aVerser: PieceStockee[] = [];
    for (const p of r.pieces) {
      const cand: PieceCandidate = { typeMime: p.typeMime, sha256: p.sha256 };
      if (pieceExclueSignature(cand, hachages)) { ligne.ecartees.push(p.nomFichier); continue; } // notre signature citée
      if (p.sha256 !== null && dejaEmpreintes.has(p.sha256)) { ligne.doublons.push(p.nomFichier); continue; } // déjà en GED
      aVerser.push(p);
    }

    // 2) VERSEMENT (mode appliqué). Simulation : on ne touche NI la satisfaction NI la GED — on liste ce qui serait versé.
    if (aVerser.length > 0) {
      if (appliquer) {
        if (!r.dejaSatisfait) await deps.marquerSatisfait(r.demandeId, dossierId); // bascule en Archives AVANT le dépôt (garde saine)
        for (const p of aVerser) {
          const contenu = await deps.contenuPiece(p.cleStockage);
          if (contenu === null) { ligne.echecs.push(`${p.nomFichier} (contenu introuvable en stockage)`); continue; }
          const res = await deps.deposer(dossierId, { nomFichier: p.nomFichier, typeMime: p.typeMime, contenu }, r.deAdresse, r.reponseId);
          if (res.ok) { ligne.versees.push(p.nomFichier); if (p.sha256 !== null) dejaEmpreintes.add(p.sha256); }
          else ligne.echecs.push(`${p.nomFichier} (${res.motif})`);
        }
      } else {
        for (const p of aVerser) ligne.versees.push(p.nomFichier); // simulation : ce qui SERAIT versé
      }
    }

    bilan.versees += ligne.versees.length;
    bilan.ecarteesSignature += ligne.ecartees.length;
    bilan.ignoreesDoublon += ligne.doublons.length;
    bilan.echecs += ligne.echecs.length;
    if (ligne.versees.length + ligne.ecartees.length + ligne.doublons.length + ligne.echecs.length > 0) bilan.lignes.push(ligne);
  }

  return bilan;
}

// ── Implémentation RÉELLE (production) ────────────────────────────────────────
export function depsReellesVersementRattache(): DepsVersementRattache {
  return {
    lireHachagesExclus: async () => {
      const { chargerConfigVeille } = await import('./veilleConfig');
      return parserHachagesExclus((await chargerConfigVeille()).piecesHachagesExclus);
    },
    chargerReponsesAVerser: async () => {
      // Réponses « documents » RATTACHÉES à une demande ayant ≥ 1 dossier actif, portant ≥ 1 pièce STOCKÉE. Le dédoublonnage
      //   pièce par pièce (orchestrateur) évite de reverser ; le multi-dossiers est tranché par cibleVersement.
      const { rows } = await query<{ reponse_id: number; demande_id: number; de_adresse: string; dossier_ids: number[]; deja_satisfait: boolean }>(
        `SELECT dr.id AS reponse_id, dr.demande_id, dr.de_adresse,
                array_agg(DISTINCT dd.dossier_id) AS dossier_ids,
                bool_or(dd.satisfait_le IS NOT NULL) AS deja_satisfait
           FROM demande_reponse dr
           JOIN demande_dossier dd ON dd.demande_id = dr.demande_id AND dd.actif
          WHERE dr.demande_id IS NOT NULL AND dr.nature = 'documents'
            AND EXISTS (SELECT 1 FROM demande_reponse_piece p WHERE p.reponse_id = dr.id AND p.cle_stockage IS NOT NULL)
          GROUP BY dr.id, dr.demande_id, dr.de_adresse`);
      const out: ReponseAVerser[] = [];
      for (const r of rows) {
        const { rows: pr } = await query<{ id: number; nom_fichier: string; type_mime: string | null; empreinte_sha256: string | null; cle_stockage: string }>(
          `SELECT id, nom_fichier, type_mime, empreinte_sha256, cle_stockage
             FROM demande_reponse_piece WHERE reponse_id = $1 AND cle_stockage IS NOT NULL ORDER BY id`, [r.reponse_id]);
        out.push({
          reponseId: r.reponse_id, demandeId: r.demande_id, deAdresse: r.de_adresse,
          dossiers: (r.dossier_ids ?? []).map((id) => ({ dossierId: Number(id) })),
          dejaSatisfait: r.deja_satisfait === true,
          pieces: pr.map((p) => ({ id: p.id, nomFichier: p.nom_fichier, typeMime: p.type_mime, sha256: p.empreinte_sha256, cleStockage: p.cle_stockage })),
        });
      }
      return out;
    },
    empreintesEnGed: async (dossierId) => {
      const { rows } = await query<{ e: string }>(`SELECT empreinte_sha256 AS e FROM dossier_document WHERE dossier_id = $1 AND empreinte_sha256 IS NOT NULL`, [dossierId]);
      return new Set(rows.map((r) => r.e));
    },
    marquerSatisfait: async (demandeId, dossierId) => {
      const { marquerDossierSatisfait } = await import('../veille/demandeReponseRepo');
      await marquerDossierSatisfait(demandeId, dossierId, null, 'versement automatique (pièce rattachée)');
    },
    contenuPiece: async (cleStockage) => {
      try {
        const { recuperer } = await import('../stockage');
        return await recuperer(cleStockage);
      } catch { return null; } // objet introuvable / stockage indisponible → échec distinguable (jamais un silence)
    },
    deposer: async (dossierId, piece, expediteur, reponseId) => {
      const { deposerDocumentSurPermis } = await import('./demandeRepo');
      const r = await deposerDocumentSurPermis(dossierId, piece.contenu, piece.typeMime, piece.nomFichier, expediteur, `${PREFIXE_NOTE_VERSEMENT_AUTO}reponse:${reponseId}`);
      return r.ok ? { ok: true } : { ok: false, motif: r.motif };
    },
  };
}
