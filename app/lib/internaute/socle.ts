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
import { consentementServicePresent, type CorpsIngestion } from './ingestion';

/** Levée si la finalité service (F1) n'est pas consentie → aucun profil créé (invariant structurel). */
export class ErreurConsentementServiceManquant extends Error {
  constructor() {
    super('consentement service (F1) requis pour créer un profil');
    this.name = 'ErreurConsentementServiceManquant';
  }
}

/**
 * Matérialise (idempotemment) la ligne `internaute_consentement_texte` pour (finalité, version) à partir du
 * CATALOGUE SERVEUR (jamais du contenu client → non-forgeable) et renvoie son `id`. Une nouvelle version = un
 * ajout au catalogue ; les preuves passées gardent leur ancienne version.
 */
async function assurerTexteConsentement(q: RequeteTx, finalite: CleFinalite, version: number): Promise<number> {
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
 */
async function getOrCreateInternaute(q: RequeteTx, identite: CorpsIngestion['identite']): Promise<string> {
  const insere = await q<{ id: string }>(
    `INSERT INTO internaute (prenom, nom, email, telephone, source_collecte)
     VALUES ($1, $2, $3, $4, 'tunnel')
     ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
     RETURNING id`,
    [identite.prenom, identite.nom, identite.email, identite.telephone],
  );
  if (insere.rows.length > 0) return insere.rows[0].id;
  const existant = await q<{ id: string }>(`SELECT id FROM internaute WHERE lower(email) = lower($1)`, [identite.email]);
  return existant.rows[0].id;
}

async function insererConsentement(q: RequeteTx, internauteId: string, finalite: CleFinalite, texteId: number): Promise<void> {
  await q(
    `INSERT INTO internaute_consentement (internaute_id, finalite, etat, texte_id, canal)
     VALUES ($1, $2, 'accorde', $3, 'tunnel')`,
    [internauteId, finalite, texteId],
  );
}

async function insererProjet(q: RequeteTx, internauteId: string, projet: CorpsIngestion['projet']): Promise<number> {
  const r = await q<{ id: number }>(
    `INSERT INTO internaute_projet
       (internaute_id, version_tunnel, payload, verdict, score, etage, dernier_etage,
        residence_principale, commune_insee, lat, lon, adresse_saisie, adresse_normalisee,
        azimut_deg, hauteur_sous_plafond_m, hauteur_vision_m)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
    ],
  );
  return r.rows[0].id;
}

/**
 * Ingestion complète d'un profil, EN UNE TRANSACTION. Refuse si F1 (service) n'est pas consentie
 * (`ErreurConsentementServiceManquant`). Renvoie les identifiants créés/réutilisés.
 */
export async function ingererProfil(corps: CorpsIngestion): Promise<{ internauteId: string; projetId: number }> {
  if (!consentementServicePresent(corps.consentements)) throw new ErreurConsentementServiceManquant();
  return withTransaction(async (q) => {
    const internauteId = await getOrCreateInternaute(q, corps.identite);
    for (const c of corps.consentements) {
      const texteId = await assurerTexteConsentement(q, c.finalite, c.version);
      await insererConsentement(q, internauteId, c.finalite, texteId);
    }
    const projetId = await insererProjet(q, internauteId, corps.projet);
    return { internauteId, projetId };
  });
}
