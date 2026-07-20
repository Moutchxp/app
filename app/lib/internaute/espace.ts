import 'server-only';
import { query } from '../db/client';

/**
 * Module INTERNAUTE — ESPACE CLIENT : accès données (serveur only, Commit C). LECTURE SEULE.
 *
 * SÉCURITÉ (anti-IDOR, non négociable) : chaque fonction est paramétrée par un `internauteId` que l'APPELANT tire de la
 * SESSION (`exigerInternaute`) — JAMAIS d'un id de requête. Toute requête est SCOPÉE `WHERE internaute_id = $1` (ou via
 * la jointure `internaute_projet.internaute_id`) : un internaute ne peut jamais lire les données d'un autre. La clé de
 * stockage d'un PDF n'est JAMAIS construite depuis une entrée utilisateur — elle est LUE en base sur une ligne dont la
 * propriété a d'abord été vérifiée par la même jointure. AUCUN import moteur / analytics (cloisonnement M2, golden intact).
 */

export type Verdict = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';

/** Une analyse passée (projet du tunnel) telle qu'affichée dans l'espace. Dates en ISO (sérialisables tel quel en JSON). */
export interface AnalyseResume {
  id: number;
  creeA: string;
  verdict: Verdict | null;
  score: number | null;
  etage: number | null;
  adresse: string | null;
}

/** Un certificat émis, avec l'indicateur de disponibilité du PDF (bouton de téléchargement). */
export interface CertificatResume {
  id: number;
  numero: string;
  emisLe: string;
  verdict: Verdict;
  score: number | null;
  adresse: string | null;
  telechargeable: boolean;
}

function versNombre(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function versIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

/**
 * Historique des analyses de l'internaute CONNECTÉ (scopé `internaute_id` de session), la plus récente d'abord.
 */
export async function listerAnalyses(internauteId: string): Promise<AnalyseResume[]> {
  const r = await query<{
    id: string;
    cree_a: Date;
    verdict: Verdict | null;
    score: string | null;
    etage: number | null;
    adresse: string | null;
  }>(
    `SELECT id, cree_a, verdict, score, etage,
            COALESCE(adresse_normalisee, adresse_saisie) AS adresse
       FROM internaute_projet
      WHERE internaute_id = $1
      ORDER BY cree_a DESC`,
    [internauteId],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    creeA: versIso(row.cree_a),
    verdict: row.verdict,
    score: versNombre(row.score),
    etage: row.etage,
    adresse: row.adresse,
  }));
}

/**
 * Certificats de l'internaute CONNECTÉ. La propriété passe par `internaute_projet.internaute_id` (chaîne
 * internaute → projet → certificat). `telechargeable` = un PDF existe ET l'acheminement est au moins généré.
 */
export async function listerCertificats(internauteId: string): Promise<CertificatResume[]> {
  const r = await query<{
    id: string;
    numero: string;
    emis_le: Date;
    verdict: Verdict;
    score: string | null;
    adresse: string | null;
    telechargeable: boolean;
  }>(
    `SELECT c.id, c.numero, c.emis_le, c.verdict, c.score,
            COALESCE(c.adresse, ip.adresse_normalisee, ip.adresse_saisie) AS adresse,
            (a.pdf_cle IS NOT NULL AND a.statut IN ('genere', 'envoye')) AS telechargeable
       FROM certificat c
       JOIN internaute_projet ip ON ip.id = c.projet_id
       LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
      WHERE ip.internaute_id = $1
      ORDER BY c.emis_le DESC`,
    [internauteId],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    numero: row.numero,
    emisLe: versIso(row.emis_le),
    verdict: row.verdict,
    score: versNombre(row.score),
    adresse: row.adresse,
    telechargeable: row.telechargeable === true,
  }));
}

/**
 * Résolution — VÉRIFIÉE PAR PROPRIÉTÉ — de la clé de stockage du PDF d'un certificat pour l'internaute CONNECTÉ.
 * La jointure `ip.internaute_id = $2` est la garde anti-IDOR : un certificat qui n'appartient pas à l'internaute de
 * session renvoie 0 ligne → `'introuvable'` (indistinguable d'un id inexistant : `certificat.id` étant séquentiel, on
 * ne divulgue JAMAIS l'existence d'un certificat d'autrui). `'pdf_absent'` n'est donc renvoyé qu'au PROPRIÉTAIRE.
 */
export type ResolutionPdf =
  | { statut: 'ok'; cle: string }
  | { statut: 'introuvable' } // inexistant OU n'appartient pas à l'internaute de session
  | { statut: 'pdf_absent' }; // le certificat est bien à lui, mais son PDF n'est pas encore généré

export async function resoudrePdfCertificat(internauteId: string, certificatId: number): Promise<ResolutionPdf> {
  const r = await query<{ pdf_cle: string | null }>(
    `SELECT a.pdf_cle
       FROM certificat c
       JOIN internaute_projet ip ON ip.id = c.projet_id
       LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
      WHERE c.id = $1 AND ip.internaute_id = $2`,
    [certificatId, internauteId],
  );
  const row = r.rows[0];
  if (!row) return { statut: 'introuvable' };
  if (!row.pdf_cle) return { statut: 'pdf_absent' };
  return { statut: 'ok', cle: row.pdf_cle };
}
