import 'server-only';
import { query } from '../db/client';
import { lireCompte } from './espace';
import { texteCourant, type CleFinalite } from './textesConsentement';
import type { CoordonneesConnues } from './coordonneesConnues';

/**
 * Lecture SEULE des coordonnées connues d'un internaute CONNECTÉ, pour la page de demande de certificat
 * (cf. `coordonneesConnues.ts`). `internauteId` = celui SCELLÉ dans la session, jamais un id lu dans la requête.
 */
export async function lireCoordonneesTunnel(internauteId: string): Promise<CoordonneesConnues> {
  const [compte, consentements, residence] = await Promise.all([
    lireCompte(internauteId),
    // État COURANT par finalité (vue append-only) + version du texte accordé.
    query<{ finalite: CleFinalite; version: number }>(
      `SELECT ca.finalite, t.version
         FROM internaute_consentement_actif ca
         JOIN internaute_consentement_texte t ON t.id = ca.texte_id
        WHERE ca.internaute_id = $1 AND ca.actif = true`,
      [internauteId],
    ),
    // REPLI seulement (compte sans adresse de résidence déclarée depuis la migration 364) : dernière adresse de résidence
    // SAISIE par l'internaute (réponse « Non ») — jamais l'adresse analysée d'un projet. Aucune écriture.
    query<{ adresse: string }>(
      `SELECT payload->>'adresseResidence' AS adresse
         FROM internaute_projet
        WHERE internaute_id = $1
          AND residence_principale = false
          AND coalesce(btrim(payload->>'adresseResidence'), '') <> ''
        ORDER BY cree_a DESC, id DESC
        LIMIT 1`,
      [internauteId],
    ),
  ]);
  // Valable = accordé sur la version COURANTE du texte (texte changé depuis → reproposé).
  const consentementsValables = consentements.rows
    .filter((r) => texteCourant(r.finalite)?.version === Number(r.version))
    .map((r) => r.finalite);
  return {
    prenom: compte.prenom,
    nom: compte.nom,
    email: compte.email,
    telephone: compte.telephone,
    consentementsValables,
    // L'adresse de résidence DU COMPTE fait foi (déclarée dans le tunnel ou dans « Mon compte ») ; repli sur la dernière saisie.
    derniereResidence: compte.adresseResidence?.trim() || residence.rows[0]?.adresse?.trim() || null,
  };
}
