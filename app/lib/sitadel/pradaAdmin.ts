/**
 * Actions d'administration PRADA (chantier S14e) : lecture des ARBITRAGES (PRADA disponible mais contact confirmé
 * conservé) et des lignes AMBIGUËS, et écriture d'un rattachement MANUEL ou d'un écartement 'hors_perimetre'. Ne touche NI
 * mairie_contact, NI la règle de résolution (destinataire.ts). AUCUN envoi.
 *
 * INVARIANTS (verrouillés par test) :
 *   - un rattachement humain pose `rapprochement = 'manuel'` (JAMAIS 'automatique') → protégé des ré-imports par le moteur ;
 *   - l'alimentation de mairie_prada réutilise le MÊME upsert que le moteur (sqlUpsertMairiePrada) : ne remplace jamais une
 *     PRADA 'confirme'/'saisie_manuelle' ; et on n'écrit JAMAIS mairie_contact → un contact 'confirme' reste intact.
 */
import { query, withTransaction } from '../db/client';
import type { Requete } from './mairieContact';
import { sqlUpsertMairiePrada, sqlJournalMairiePrada } from './pradaRapprocher';

const asQ = (q: (t: string, p?: unknown[]) => Promise<unknown>): Requete => ((t, p) => q(t, p)) as Requete;

// ── SQL PURS (inspectables par les tests) ────────────────────────────────────
/** Ligne brute prada_import (pour l'upsert mairie_prada lors d'un rattachement manuel). */
export const SQL_LIGNE_IMPORT = `SELECT nom, prenom, courriel, adresse, millesime FROM prada_import WHERE id = $1`;
/** Rattachement humain : pose code_insee ET rapprochement = 'manuel' (jamais 'automatique'). Un humain peut re-corriger un
 *  'manuel' (pas de garde <> 'manuel' ici) ; le MOTEUR, lui, ne touche jamais 'manuel'. */
export const SQL_RATTACHER_MANUEL = `UPDATE prada_import SET code_insee = $1, rapprochement = 'manuel' WHERE id = $2`;
/** Écarter définitivement une ligne qui n'est pas une commune du périmètre. */
export const SQL_ECARTER = `UPDATE prada_import SET rapprochement = 'hors_perimetre', code_insee = NULL WHERE id = $1`;
/**
 * Lignes ambiguës exposées au client. ⚠️ `id::int` : `prada_import.id` est un bigint que node-postgres rend en CHAÎNE
 * (défaut int8) ; sans cast, l'identifiant arriverait côté client en string et serait rejeté par la validation stricte de
 * la route (`estIdentifiantValide`). Le cast le rend en nombre JSON (même convention que les `count(*)::int` du module ;
 * volumétrie de l'annuaire << 2^31).
 */
export const SQL_AMBIGUITES = `SELECT id::int AS id, nom_administration, departement, code_postal_ville, courriel, adresse, prenom, nom, millesime
     FROM prada_import WHERE rapprochement = 'ambigu' ORDER BY nom_administration NULLS LAST, id`;

/**
 * Validation STRICTE d'un identifiant de ligne reçu du client : DOIT être un entier JS. Un bigint sérialisé en chaîne
 * (« 1634 ») est REFUSÉ — on ne rattache jamais sur une ligne indéterminée. La source (lireAmbiguites) caste `id::int` pour
 * que l'identifiant soit bien un nombre ; ce garde reste la barrière côté route.
 */
export function estIdentifiantValide(x: unknown): x is number {
  return Number.isInteger(x);
}

export class PradaImportIntrouvableError extends Error {
  constructor(public importId: number) { super(`ligne prada_import ${importId} introuvable`); this.name = 'PradaImportIntrouvableError'; }
}

// ── Lectures (pour l'affichage) ──────────────────────────────────────────────
export interface ArbitragePrada {
  codeInsee: string; communeNom: string | null; pradaNom: string | null; pradaCourriel: string | null;
  contactCanal: string | null; contactEmail: string | null; contactAdressePostale: string | null;
}

/** Communes où une PRADA au courriel non vide existe mais le contact 'confirme' est CONSERVÉ (rien n'a basculé). */
export async function lireArbitrages(): Promise<ArbitragePrada[]> {
  const { rows } = await query<{ code_insee: string; commune_nom: string | null; prada_nom: string | null; prada_courriel: string | null; contact_canal: string | null; contact_email: string | null; contact_adresse: string | null }>(
    `SELECT mp.code_insee, c.nom AS commune_nom,
            NULLIF(btrim(concat_ws(' ', mp.prenom, mp.nom)), '') AS prada_nom, mp.courriel AS prada_courriel,
            mc.canal AS contact_canal, mc.email AS contact_email, mc.adresse_postale AS contact_adresse
     FROM mairie_prada mp
     JOIN mairie_contact mc ON mc.code_insee = mp.code_insee
     LEFT JOIN commune c ON c.code_insee = mp.code_insee
     WHERE coalesce(btrim(mp.courriel), '') <> '' AND mc.statut = 'confirme'
     ORDER BY c.nom NULLS LAST, mp.code_insee`,
  );
  return rows.map((r) => ({
    codeInsee: r.code_insee, communeNom: r.commune_nom, pradaNom: r.prada_nom, pradaCourriel: r.prada_courriel,
    contactCanal: r.contact_canal, contactEmail: r.contact_email, contactAdressePostale: r.contact_adresse,
  }));
}

export interface CommuneInjoignable { codeInsee: string; nom: string; departement: string }

/** Requête des communes du périmètre SANS aucune adresse e-mail (ni contact générique, ni PRADA) — testable. */
export const SQL_INJOIGNABLES = `SELECT c.code_insee, c.nom, c.departement
     FROM commune c
     LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
     LEFT JOIN mairie_prada mp ON mp.code_insee = c.code_insee
     WHERE coalesce(btrim(mc.email), '') = '' AND coalesce(btrim(mp.courriel), '') = ''
     ORDER BY c.departement, c.nom`;

/** Communes du périmètre injoignables par e-mail (à saisir à la main). Aujourd'hui 16. */
export async function lireInjoignables(): Promise<CommuneInjoignable[]> {
  const { rows } = await query<{ code_insee: string; nom: string; departement: string }>(SQL_INJOIGNABLES);
  return rows.map((r) => ({ codeInsee: r.code_insee, nom: r.nom, departement: r.departement }));
}

export interface LigneAmbigue {
  id: number; nomAdministration: string | null; departement: string | null; codePostalVille: string | null;
  courriel: string | null; adresse: string | null; prenom: string | null; nom: string | null; millesime: string;
}

/** Lignes prada_import non tranchées (rapprochement = 'ambigu') — à rattacher à la main. */
export async function lireAmbiguites(): Promise<LigneAmbigue[]> {
  const { rows } = await query<{ id: number; nom_administration: string | null; departement: string | null; code_postal_ville: string | null; courriel: string | null; adresse: string | null; prenom: string | null; nom: string | null; millesime: string }>(SQL_AMBIGUITES);
  return rows.map((r) => ({
    id: r.id, nomAdministration: r.nom_administration, departement: r.departement, codePostalVille: r.code_postal_ville,
    courriel: r.courriel, adresse: r.adresse, prenom: r.prenom, nom: r.nom, millesime: r.millesime,
  }));
}

// ── Écritures ────────────────────────────────────────────────────────────────
/**
 * Pose un rattachement MANUEL sur `q` (transaction) : prada_import.code_insee + rapprochement='manuel', puis alimente
 * mairie_prada avec la MÊME précédence que le moteur (sqlUpsertMairiePrada : ne remplace jamais confirme/saisie_manuelle),
 * puis journalise (création ou changement de courriel). N'écrit JAMAIS mairie_contact.
 */
export async function rattacherManuelTx(q: Requete, importId: number, codeInsee: string, auteur: string | null): Promise<{ ok: true }> {
  const ligne = await q<{ nom: string | null; prenom: string | null; courriel: string | null; adresse: string | null; millesime: string }>(SQL_LIGNE_IMPORT, [importId]);
  const l = ligne.rows[0];
  if (!l) throw new PradaImportIntrouvableError(importId);
  await q(SQL_RATTACHER_MANUEL, [codeInsee, importId]);
  const avant = await q<{ courriel: string | null }>(`SELECT courriel FROM mairie_prada WHERE code_insee = $1`, [codeInsee]);
  const courrielAvant = avant.rows[0]?.courriel ?? null;
  const up = await q<{ insere: boolean; courriel: string | null }>(sqlUpsertMairiePrada(), [codeInsee, importId, l.nom, l.prenom, l.courriel, l.adresse, l.millesime]);
  if (up.rows.length === 1) { // 0 ligne = mairie_prada protégée (confirme / saisie_manuelle) → rien écrit, rien journalisé
    const apres = up.rows[0].courriel;
    if (up.rows[0].insere || (courrielAvant ?? '') !== (apres ?? '')) {
      await q(sqlJournalMairiePrada(), [
        codeInsee, courrielAvant, apres, 'annuaire_cada',
        up.rows[0].insere ? 'création (rattachement manuel)' : 'maj courriel (rattachement manuel)', auteur,
      ]);
    }
  }
  return { ok: true };
}

/** Enveloppe transactionnelle du rattachement manuel (pour la route). */
export async function rattacherManuel(importId: number, codeInsee: string, auteur: string | null): Promise<{ ok: true }> {
  return withTransaction((tx) => rattacherManuelTx(asQ(tx), importId, codeInsee, auteur));
}

/** Écarte définitivement une ligne (hors périmètre) — aucune alimentation de mairie_prada. */
export async function ecarterHorsPerimetre(importId: number): Promise<{ ok: true }> {
  await query(SQL_ECARTER, [importId]);
  return { ok: true };
}
