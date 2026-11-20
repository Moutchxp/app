import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { enregistrerRapprochement, rapprocherAdresse, rapprocherBien } from './banRepo';

/**
 * ══ 🔴🔴 UNE ADRESSE SAISIE DANS L'APPLICATION, ENREGISTRÉE AU FORMAT UNIQUE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7a). IMPUR (base). ══
 *
 * Règle d'Arno : « chaque adresse choisie est enregistrée au format unique (identifiant BAN, libellé officiel, numéro et indice, code postal, INSEE,
 * commune) là où la table le permet ». Les tables qui le permettent aujourd'hui :
 *   • un BIEN : `gestion_lot_adresse_ban` (migration 505) — un rapprochement d'origine « saisie », posé dans la transaction qui écrit l'adresse ;
 *     une adresse qui n'est pas retrouvée avec certitude (hors liste, Base locale incomplète) y entre « à vérifier » et rejoint la file ;
 *   • une adresse de COPROPRIÉTÉ : `gestion_copropriete_adresse.ban_id` (migration 505).
 * Le format est celui du MODULE UNIQUE de rapprochement (la Base Adresse locale), relu au serveur : on n'écrit jamais un identifiant venu du seul
 * navigateur. Les adresses texte des fiches (`adresse`, `code_postal`, `commune`) ne changent pas. Sans la migration 505 : rien de plus n'est écrit.
 */
let disponible = false;
/** Les tables du format unique sont-elles posées ? (mémorisé dès que oui ; une base sans elles est relue à chaque fois) */
export async function formatUniqueDisponible(): Promise<boolean> {
  if (disponible) return true;
  try {
    const { rows } = await query<{ ok: boolean }>(
      `SELECT to_regclass('public.gestion_lot_adresse_ban') IS NOT NULL
              AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_copropriete_adresse' AND column_name = 'ban_id') AS ok`);
    disponible = rows?.[0]?.ok === true;
  } catch {
    disponible = false;
  }
  return disponible;
}

/** L'adresse d'un BIEN, écrite par l'application : son rapprochement au format unique (dans la transaction de l'appelant). */
export async function enregistrerAdresseSaisieDuLot(q: RequeteTx, lotId: number,
  a: { adresse: string | null; codePostal: string | null; commune: string | null; nature?: string | null }, auteur: Auteur): Promise<void> {
  if (!(await formatUniqueDisponible())) return;
  if ((a.adresse ?? '').trim() === '') return;
  const r = await rapprocherBien({ immeuble: null, adresse: a.adresse, codePostal: a.codePostal, commune: a.commune });
  await enregistrerRapprochement(q, lotId, r, {
    origine: 'saisie', methode: r.statut === 'certain' && (a.nature ?? 'liste') === 'liste' ? 'auto_completion' : 'similarite_voie',
    motifFin: 'adresse saisie dans l’application',
  }, auteur);
}

/** L'identifiant BAN d'une adresse de COPROPRIÉTÉ, seulement si le module la retrouve avec certitude ; sinon null (aucune supposition). */
export async function banIdDeLAdresse(a: { libelle: string; codePostal: string | null; commune: string | null }): Promise<string | null> {
  if (!(await formatUniqueDisponible())) return null;
  const r = await rapprocherAdresse({ texte: a.libelle, codePostal: a.codePostal, commune: a.commune });
  return r.statut === 'certain' ? r.ban?.id ?? null : null;
}
