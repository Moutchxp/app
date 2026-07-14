/**
 * Module INTERNAUTE — LOT 2 (ingestion) : ACCÈS BASE du socle (serveur only).
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Écrit UNIQUEMENT dans les tables `internaute*` (migration 023) ; ne
 * touche NI le moteur NI M2 ; aucune donnée nominative ne part vers M2.
 *
 * Transaction ATOMIQUE (A → B → C) : (a) get-or-create de l'internaute par email (anti-doublon, SANS écraser une
 * identité existante — la rectification est un droit du LOT 3, pas un effet de bord d'ingestion) ; (b) preuves de
 * consentement APPEND-ONLY (une ligne par finalité acceptée, avec `texte_id` matérialisé + canal) ; (c) projet
 * (jsonb versionné + colonnes stables capturées du moteur, en lecture seule). ROLLBACK complet si une étape échoue.
 */
import { withTransaction, type RequeteTx } from '../db/client';
import { TEXTES_CONSENTEMENT, type CleFinalite } from './textesConsentement';
import { auMoinsUnConsentement, type CorpsIngestion } from './ingestion';

/** Complétude du parcours tunnel (colonne `internaute.parcours`, migration 028). DISTINCT du verdict (bloc C). */
export type Parcours = 'incomplet' | 'complet';

/** Levée si AUCUN consentement (parmi les 3) n'est donné → aucun profil créé (porte de création, invariant structurel). */
export class ErreurAucunConsentement extends Error {
  constructor() {
    super('au moins un consentement requis pour créer un profil');
    this.name = 'ErreurAucunConsentement';
  }
}

/**
 * Matérialise (idempotemment) la ligne `internaute_consentement_texte` pour (finalité, version) à partir du
 * CATALOGUE SERVEUR (jamais du contenu client → non-forgeable) et renvoie son `id`. Une nouvelle version = un
 * ajout au catalogue ; les preuves passées gardent leur ancienne version.
 */
export async function assurerTexteConsentement(q: RequeteTx, finalite: CleFinalite, version: number): Promise<number> {
  const texte = TEXTES_CONSENTEMENT.find((t) => t.finalite === finalite && t.version === version);
  if (!texte) throw new Error(`texte de consentement inconnu: ${finalite} v${version}`);
  await q(
    `INSERT INTO internaute_consentement_texte (finalite, version, contenu)
     VALUES ($1, $2, $3)
     ON CONFLICT (finalite, version) DO NOTHING`,
    [finalite, version, texte.contenu],
  );
  const r = await q<{ id: number }>(
    `SELECT id FROM internaute_consentement_texte WHERE finalite = $1 AND version = $2`,
    [finalite, version],
  );
  return r.rows[0].id;
}

/**
 * Get-or-create de l'internaute par email (unicité applicative `lower(email)` du LOT 1). NON destructif : si
 * l'email existe déjà, on RÉUTILISE la ligne existante sans écraser prénom/nom/téléphone.
 *
 * `cree` distingue une VRAIE insertion (nouveau dossier) d'une réutilisation (email déjà en base). C'est le pivot
 * de la FERMETURE COLLISION EMAIL : seul un dossier réellement créé dans CETTE requête donnera droit à un
 * jeton-capacité de rectification publique — sinon un tiers connaissant un email en base pourrait modifier les
 * coordonnées du dossier d'autrui.
 */
async function getOrCreateInternaute(
  q: RequeteTx,
  identite: CorpsIngestion['identite'],
  parcours: Parcours,
): Promise<{ id: string; cree: boolean }> {
  // `parcours` n'est posé qu'à la CRÉATION (nouvelle ligne). À la réutilisation (email déjà en base), `ON CONFLICT
  // DO NOTHING` NE touche PAS la ligne existante → son `parcours` (et son identité) restent inchangés.
  const insere = await q<{ id: string }>(
    `INSERT INTO internaute (prenom, nom, email, telephone, source_collecte, parcours)
     VALUES ($1, $2, $3, $4, 'tunnel', $5)
     ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
     RETURNING id`,
    [identite.prenom, identite.nom, identite.email, identite.telephone, parcours],
  );
  if (insere.rows.length > 0) return { id: insere.rows[0].id, cree: true };
  const existant = await q<{ id: string }>(`SELECT id FROM internaute WHERE lower(email) = lower($1)`, [identite.email]);
  return { id: existant.rows[0].id, cree: false };
}

/** INSERT append-only d'une décision de consentement (bloc B). `etat` : 'accorde' (défaut) ou 'retire' (retrait à
 *  l'Écran B). JAMAIS d'UPDATE : une décision = une nouvelle ligne ; la vue `internaute_consentement_actif` prend la
 *  plus récente. `canal='tunnel'` (recueil public). */
export async function insererConsentement(
  q: RequeteTx,
  internauteId: string,
  finalite: CleFinalite,
  texteId: number,
  etat: 'accorde' | 'retire' = 'accorde',
): Promise<void> {
  await q(
    `INSERT INTO internaute_consentement (internaute_id, finalite, etat, texte_id, canal)
     VALUES ($1, $2, $3, $4, 'tunnel')`,
    [internauteId, finalite, etat, texteId],
  );
}

async function insererProjet(
  q: RequeteTx,
  internauteId: string,
  projet: CorpsIngestion['projet'],
  certificatEnvoye: boolean,
): Promise<number> {
  // `certificat_envoye` (migration 029) posé à la CRÉATION : false à l'Écran A (Écran B pas encore validé), true lors
  // d'une création DIRECTE à l'Écran B (upsert CAS 2 — l'internaute a validé « Recevoir mon certificat »).
  const r = await q<{ id: string }>(
    `INSERT INTO internaute_projet
       (internaute_id, version_tunnel, payload, verdict, score, etage, dernier_etage,
        residence_principale, commune_insee, lat, lon, adresse_saisie, adresse_normalisee,
        azimut_deg, hauteur_sous_plafond_m, hauteur_vision_m, certificat_envoye)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      internauteId,
      projet.versionTunnel,
      JSON.stringify(projet.payload),
      projet.verdict,
      projet.score,
      projet.etage,
      projet.dernierEtage,
      projet.residencePrincipale,
      projet.communeInsee,
      projet.lat,
      projet.lon,
      projet.adresseSaisie,
      projet.adresseNormalisee,
      projet.azimutDeg,
      projet.hauteurSousPlafondM,
      projet.hauteurVisionM,
      certificatEnvoye,
    ],
  );
  return Number(r.rows[0].id); // bigserial → chaîne (driver pg) → number (id de projet bien < 2^53)
}

/**
 * Ingestion complète d'un profil, EN UNE TRANSACTION. Refuse si AUCUN consentement n'est donné
 * (`ErreurAucunConsentement`). `parcours` = statut de complétude posé à la CRÉATION : 'incomplet' à l'Écran A (défaut),
 * 'complet' lors d'une création directe à l'Écran B (coordonnées confirmées). `certificatEnvoye` = statut certificat du
 * projet créé (false à l'Écran A ; true lors d'une création directe à l'Écran B). Renvoie les identifiants créés/réutilisés.
 */
export async function ingererProfil(
  corps: CorpsIngestion,
  parcours: Parcours = 'incomplet',
  certificatEnvoye = false,
): Promise<{ internauteId: string; projetId: number; creeInternaute: boolean }> {
  if (!auMoinsUnConsentement(corps.consentements)) throw new ErreurAucunConsentement();
  return withTransaction(async (q) => {
    const { id: internauteId, cree: creeInternaute } = await getOrCreateInternaute(q, corps.identite, parcours);
    for (const c of corps.consentements) {
      const texteId = await assurerTexteConsentement(q, c.finalite, c.version);
      await insererConsentement(q, internauteId, c.finalite, texteId);
    }
    // `certificat_envoye` marqué UNIQUEMENT si le profil est GENUINEMENT créé dans CETTE requête (`creeInternaute`). Un
    // email DÉJÀ existant (réutilisé, SANS preuve de propriété) → projet appendé NON marqué : un tiers non authentifié ne
    // peut PAS faire apparaître une ligne « (Certificat envoyé) » sur la fiche d'autrui (défense en profondeur, IDOR).
    const projetId = await insererProjet(q, internauteId, corps.projet, certificatEnvoye && creeInternaute);
    return { internauteId, projetId, creeInternaute };
  });
}
