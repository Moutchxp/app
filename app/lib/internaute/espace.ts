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

/** Identité du titulaire pour l'accueil personnalisé. `null` sur chaque champ possible (dossier anonymisé = prénom/nom NULL). */
export interface IdentiteTitulaire {
  prenom: string | null;
  nom: string | null;
}

/**
 * Prénom + nom de l'internaute CONNECTÉ (scopé par l'id de SESSION, jamais une entrée de requête). SELECT d'UNE ligne,
 * ces DEUX colonnes SEULEMENT (aucune autre PII). Après le droit à l'oubli, `prenom`/`nom` sont NULL → renvoyés tels quels
 * (l'appelant applique le repli d'affichage). Id inconnu → `{ null, null }`.
 */
export async function lireIdentite(internauteId: string): Promise<IdentiteTitulaire> {
  const r = await query<{ prenom: string | null; nom: string | null }>(
    `SELECT prenom, nom FROM internaute WHERE id = $1`,
    [internauteId],
  );
  const row = r.rows[0];
  return { prenom: row?.prenom ?? null, nom: row?.nom ?? null };
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
  | { statut: 'ok'; cle: string; numero: string } // `numero` = identifiant IMPRIMÉ (SAVV-AAAA-NNNNNN), pour un nom de fichier parlant
  | { statut: 'introuvable' } // inexistant OU n'appartient pas à l'internaute de session
  | { statut: 'pdf_absent'; numero: string }; // le certificat est bien à lui, mais son PDF n'est pas encore généré

export async function resoudrePdfCertificat(internauteId: string, certificatId: number): Promise<ResolutionPdf> {
  const r = await query<{ numero: string; pdf_cle: string | null }>(
    `SELECT c.numero, a.pdf_cle
       FROM certificat c
       JOIN internaute_projet ip ON ip.id = c.projet_id
       LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
      WHERE c.id = $1 AND ip.internaute_id = $2`,
    [certificatId, internauteId],
  );
  const row = r.rows[0];
  if (!row) return { statut: 'introuvable' };
  if (!row.pdf_cle) return { statut: 'pdf_absent', numero: row.numero };
  return { statut: 'ok', cle: row.pdf_cle, numero: row.numero };
}

/**
 * Descriptif d'un logement pour le VISUEL d'annonce (aucune donnée nominative : ni nom, ni adresse, ni lat/lon).
 * ⚠️ DUPLICATION ASSUMÉE : forme et mapping identiques à `DescriptifVisuel`/`mapDescriptif` de
 * `app/lib/db/certificatVerification.ts` (non exporté, hors périmètre) et à l'assemblage inline de
 * `app/lib/email/publierEnvoiCertificat.ts`. À factoriser un jour dans une source unique de mapping.
 */
export interface VisuelCertificat {
  reference: string;
  verdict: string;
  score: number | null;
  descriptif: {
    ville: string | null;
    typeBien: string | null;
    surfaceM2: number | null;
    pieces: number | null;
    anneeOuEpoque: string | null;
    etage: number | null;
    dernierEtage: boolean | null;
    exterieur: string | null;
  };
}

/**
 * Données du VISUEL d'annonce d'un certificat — LECTURE SEULE, régénérable, NON NOMINATIVE.
 *
 * SÉCURITÉ (SECONDE barrière, pas la principale) : cette fonction porte SA PROPRE contrainte de propriété
 * (jointure `ip.internaute_id = $2`, comme `resoudrePdfCertificat`) → sûre en elle-même, cohérente avec le
 * doc-contract du module (« toute fonction scopée par internauteId »). Le GATE PRINCIPAL — celui qui produit le
 * 404 indistinguable et uniforme — reste `resoudrePdfCertificat`, appelé EN PREMIER par la route. Ce re-scope est
 * un filet : si le gate est passé mais que cette lecture renvoie 0 ligne (incohérence qui ne doit jamais survenir),
 * l'appelant répond 404. `null` = aucune ligne pour ce couple (certificat, internaute).
 * `mapDescriptif` étant absente et hors périmètre, le mapping est reproduit ici (cf. `VisuelCertificat`).
 */
export async function resoudreVisuelCertificat(
  internauteId: string,
  certificatId: number,
): Promise<VisuelCertificat | null> {
  const r = await query<{
    reference: string;
    verdict: string;
    score: string | null; // numeric → string (driver pg)
    type_bien: string | null;
    surface_m2: string | null; // numeric → string (driver pg)
    nb_pieces: number | null;
    annee_batiment: number | null;
    epoque: string | null;
    etage: number | null;
    dernier_etage: boolean | null;
    visuel_exterieur: string | null;
    visuel_ville: string | null;
  }>(
    `SELECT c.reference, c.verdict, c.score, c.type_bien, c.surface_m2, c.nb_pieces, c.annee_batiment, c.epoque,
            c.etage, c.dernier_etage,
            c.resultat->'visuel'->>'exterieur' AS visuel_exterieur, c.resultat->'visuel'->>'ville' AS visuel_ville
       FROM certificat c
       JOIN internaute_projet ip ON ip.id = c.projet_id
      WHERE c.id = $1 AND ip.internaute_id = $2`,
    [certificatId, internauteId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    reference: row.reference,
    verdict: row.verdict,
    score: row.score === null ? null : Number(row.score),
    descriptif: {
      ville: row.visuel_ville,
      typeBien: row.type_bien,
      surfaceM2: row.surface_m2 === null ? null : Number(row.surface_m2),
      pieces: row.nb_pieces,
      anneeOuEpoque: row.annee_batiment !== null ? String(row.annee_batiment) : row.epoque,
      etage: row.etage,
      dernierEtage: row.dernier_etage,
      exterieur: row.visuel_exterieur,
    },
  };
}
