/**
 * ADRESSE DE RÉSIDENCE PRINCIPALE DU COMPTE (lot COORDONNEES-CONNU-REEL, 16/10/2026) — règles PURES (aucun accès base).
 *
 * Décision d'Arno : quand un internaute CONNECTÉ répond « Oui » à « Le bien analysé est-il votre résidence principale ? »,
 * l'adresse du bien analysé devient l'adresse de résidence de son compte ; « Non » + adresse saisie → l'adresse saisie.
 * La déclaration la plus récente remplace la précédente. Modifiable aussi dans « Mon compte ». L'écriture (et son
 * journal) est dans `cycleVie.declarerResidence` ; la colonne vient de la migration 364.
 */

/** D'où vient la déclaration — liste FERMÉE, identique au CHECK de la migration 364. */
export type SourceResidence = 'tunnel_bien_analyse' | 'tunnel_adresse_saisie' | 'espace_client';
export const SOURCES_RESIDENCE: readonly SourceResidence[] = ['tunnel_bien_analyse', 'tunnel_adresse_saisie', 'espace_client'];

/** Borne de longueur : une adresse postale tient largement dedans ; au-delà, ce n'est pas une adresse. */
export const LONGUEUR_MAX_ADRESSE = 300;

/** Adresse nettoyée (blancs resserrés, bords retirés) ; `null` si vide, non textuelle ou trop longue. */
export function normaliserAdresse(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const a = v.replace(/\s+/g, ' ').trim();
  if (a === '' || a.length > LONGUEUR_MAX_ADRESSE) return null;
  return a;
}

/** Ce qu'une analyse DÉCLARE comme résidence principale (sous-ensemble du corps d'ingestion). */
export interface DeclarationProjet {
  residencePrincipale: boolean | null;
  adresseNormalisee: string | null;
  adresseSaisie: string | null;
  payload: Record<string, unknown>;
}

/**
 * Adresse de résidence déclarée par une analyse : « Oui » → l'adresse du bien analysé (celle affichée, normalisée par la
 * base d'adresses, sinon celle saisie) ; « Non » → l'adresse de résidence saisie ; pas de réponse ou adresse vide → rien.
 */
export function residenceDeclaree(p: DeclarationProjet): { adresse: string; source: SourceResidence } | null {
  if (p.residencePrincipale === true) {
    const adresse = normaliserAdresse(p.adresseNormalisee) ?? normaliserAdresse(p.adresseSaisie);
    return adresse ? { adresse, source: 'tunnel_bien_analyse' } : null;
  }
  if (p.residencePrincipale === false) {
    const adresse = normaliserAdresse(p.payload?.adresseResidence);
    return adresse ? { adresse, source: 'tunnel_adresse_saisie' } : null;
  }
  return null;
}
