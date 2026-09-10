/**
 * CR-2b1 — PRODUCTION + PERSISTANCE d'une passe de lecture IA. Le JOURNAL DE TRANSMISSION est écrit AVANT l'appel (preuve de ce qui
 * sort de la machine, même si l'appel échoue) ; la ligne est COMPLÉTÉE après (UPDATE NON destructif : lecture/coût/statut). APPEND-ONLY
 * (une ligne par passe). RÉSILIENT : table `permis_cerfa_ia` absente (migration 216 non appliquée) → persistance NO-OP (repli
 * `to_regclass`), l'appel et le rapport se font quand même. AUCUN DELETE, AUCUN UPDATE de la preuve de transmission.
 */
import { query } from '../db/client';
import { empreinteGed } from './bestOfCache';
import { extrairePagesPdf } from './extractionPdf';
import { lireDeclarationsRecap } from './cerfaRecapRepo';
import { scinderDescription } from './descriptionScission';
import { selectionnerPagesIa, journalTransmission, type PageTexteIa } from './selectionPagesCerfaIa';
import { lireCompteRenduIa, lecteurCompteRenduMistral, type LecteurCompteRenduIa, type ResultatCompteRenduIa } from './lireCompteRenduIa';
import type { CompteRenduIa } from './compteRenduIaSchema';

export interface PiecePrimaireIa { pieceId: number; pieceNom: string; pdf: Buffer; pages: PageTexteIa[]; empreinte: string; texteLibreLongueur: number }
export interface DepsProduireIa {
  piecePrimaire(dossierId: number): Promise<PiecePrimaireIa | null>;
  lecteur(): LecteurCompteRenduIa;
}

export interface RapportPasseIa extends ResultatCompteRenduIa { dossierId: number; persiste: boolean; saute: boolean }

/** Dernière passe stockée d'un dossier (affichage cartouche). null si table absente ou aucune passe. */
export interface PasseIaStockee { transmission: unknown; lecture: CompteRenduIa | null; modele: string | null; coutUsd: number | null; statut: string; motif: string | null; empreinteGed: string | null; passeLe: string }
export async function lireDernierePasseIa(dossierId: number): Promise<PasseIaStockee | null> {
  try {
    const { rows } = await query<{ transmission: unknown; lecture: CompteRenduIa | null; modele: string | null; cout_usd: string | null; statut: string; motif: string | null; empreinte_ged: string | null; passe_le: string }>(
      `SELECT transmission, lecture, modele, cout_usd, statut, motif, empreinte_ged, passe_le
         FROM permis_cerfa_ia WHERE dossier_id = $1 ORDER BY passe_le DESC LIMIT 1`, [dossierId]);
    const r = rows[0];
    return r ? { transmission: r.transmission, lecture: r.lecture, modele: r.modele, coutUsd: r.cout_usd === null ? null : Number(r.cout_usd), statut: r.statut, motif: r.motif, empreinteGed: r.empreinte_ged, passeLe: r.passe_le } : null;
  } catch { return null; } // table absente → aucune lecture IA (comportement d'avant)
}

/** INSÈRE la ligne de passe AVANT l'appel (preuve de transmission). Renvoie l'id, ou null si la table est absente (no-op). */
async function insererTransmission(dossierId: number, transmission: unknown, statut: string, empreinte: string): Promise<number | null> {
  try {
    const { rows } = await query<{ id: number }>(
      `INSERT INTO permis_cerfa_ia (dossier_id, transmission, statut, empreinte_ged) VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
      [dossierId, JSON.stringify(transmission), statut, empreinte]);
    return rows[0]?.id ?? null;
  } catch { return null; } // 216 absente → no-op
}

/** COMPLÈTE la ligne après l'appel (UPDATE NON destructif : ne touche QUE lecture/coût/statut/motif/modèle de LA passe courante). */
async function completerPasse(id: number, lecture: CompteRenduIa | null, coutUsd: number, statut: string, motif: string | null, modele: string | null): Promise<void> {
  try {
    await query(
      `UPDATE permis_cerfa_ia SET lecture = $2::jsonb, cout_usd = $3, statut = $4, motif = $5, modele = $6 WHERE id = $1`,
      [id, lecture === null ? null : JSON.stringify(lecture), coutUsd, statut, motif, modele]);
  } catch { /* 216 absente → no-op */ }
}

/**
 * Produit UNE passe pour un dossier. `persister` → écrit la transmission AVANT l'appel puis complète (no-op si 216 absente).
 * `forcer` → ignore le gate d'empreinte (le dry-run payant force une passe). Sinon : empreinte GED inchangée depuis la dernière passe
 * → on SAUTE (jamais re-payer). UN SEUL appel, aucune boucle, aucun rejeu.
 */
export async function produirePasseIa(dossierId: number, deps: DepsProduireIa, opts: { persister: boolean; forcer: boolean }): Promise<RapportPasseIa> {
  const piece = await deps.piecePrimaire(dossierId);
  if (!piece) {
    const vide = { transmission: { pieceId: 0, pieceNom: '(aucune pièce Cerfa)', envoyees: [], refusees: [] }, lecture: null, statut: 'abstention' as const, motif: 'aucune pièce Cerfa dans la GED', modele: null, coutUsd: 0 };
    return { dossierId, ...vide, persiste: false, saute: false };
  }

  if (opts.persister && !opts.forcer) {
    const derniere = await lireDernierePasseIa(dossierId);
    if (derniere && derniere.empreinteGed === piece.empreinte) {
      return { dossierId, transmission: journalTransmission(piece.pieceId, piece.pieceNom, selectionnerPagesIa(piece.pages)), lecture: null, statut: 'abstention', motif: 'GED inchangée depuis la dernière passe — non rejouée (gate)', modele: null, coutUsd: 0, persiste: false, saute: true };
    }
  }

  const selection = selectionnerPagesIa(piece.pages);
  const transmission = journalTransmission(piece.pieceId, piece.pieceNom, selection);
  const statutInitial = selection.envoyees.length === 0 ? 'abstention' : 'transmis';
  const passeId = opts.persister ? await insererTransmission(dossierId, transmission, statutInitial, piece.empreinte) : null;

  if (selection.envoyees.length === 0) {
    if (passeId !== null) await completerPasse(passeId, null, 0, 'abstention', 'aucune page transmissible', null);
    return { dossierId, transmission, lecture: null, statut: 'abstention', motif: 'aucune page transmissible (cible absente ou mêlée à de l’identité)', modele: null, coutUsd: 0, persiste: passeId !== null, saute: false };
  }

  const res = await lireCompteRenduIa(piece, deps.lecteur(), { texteLibreLongueur: piece.texteLibreLongueur });
  if (passeId !== null) await completerPasse(passeId, res.lecture, res.coutUsd, res.statut, res.motif, res.modele);
  return { dossierId, ...res, persiste: passeId !== null, saute: false };
}

// ── Deps RÉELLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function depsReellesIa(): DepsProduireIa {
  return {
    piecePrimaire: async (dossierId) => {
      // Pièce Cerfa PRIMAIRE = 1er id du best-of (identifié PAR CONTENU). Une seule pièce → citation de page non ambiguë.
      const { rows } = await query<{ id: number; nom: string; type_mime: string | null; cle: string; taille: number | null }>(
        `SELECT dd.id::int AS id, dd.nom_fichier AS nom, dd.type_mime, dd.cle_stockage AS cle, dd.taille_octets AS taille
           FROM dossier_document dd
          WHERE dd.dossier_id = $1
            AND dd.id = (SELECT (jsonb_array_elements_text(resultat->'cerfaIds'))::int FROM permis_best_of_precalcul WHERE dossier_id = $1 AND type = 'best_of' LIMIT 1)`, [dossierId]);
      const r = rows[0];
      if (!r) return null;
      const { recuperer } = await import('../stockage');
      const pdf = await recuperer(r.cle);
      const ex = await extrairePagesPdf(pdf, r.type_mime);
      if (!ex.ok) return null;
      const pages: PageTexteIa[] = ex.pages.map((t, i) => ({ page: i + 1, texte: t }));
      const dc = await lireDeclarationsRecap(dossierId).catch(() => null);
      const humain = scinderDescription(dc?.declarations.descriptionProjet ?? null).humain;
      return { pieceId: r.id, pieceNom: r.nom, pdf, pages, empreinte: empreinteGed([{ id: r.id, cleStockage: r.cle, tailleOctets: r.taille, nomFichier: r.nom }]), texteLibreLongueur: (humain ?? '').length };
    },
    lecteur: lecteurCompteRenduMistral,
  };
}
