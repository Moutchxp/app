/**
 * BAT-1 — ORCHESTRATION de l'auto-création des cartes + pose du nombre validé. Deps INJECTABLES (testable sans base). RÉSILIENT : si les
 * colonnes nb_batiments_valide* manquent (migration 218 non appliquée), `colonneDisponible()` renvoie false → NO-OP COMPLET (aucune carte
 * créée) : sans capacité à mémoriser le nombre validé, on ne pourrait pas être idempotent. Réutilise `creerCorps` et `attribuerNomsRepli`
 * (aucun second chemin de création ni de nommage). Ne touche JAMAIS à une carte existante (repères, sommets validés intacts).
 */
import { query } from '../db/client';
import { creerCorps, attribuerNomsRepli } from './caracteristiquesRepo';
import { fragmentCorpsActif } from './corpsActif'; // BAT-3 — ne compte que les cartes actives (une carte retirée ne « remplit » pas le manque)
import { lireDeclarationsRecap } from './cerfaRecapRepo';
import { decisionAutocreationCartes, type EtatAutocreation } from './autocreationCartes';

export interface DepsAutocreation {
  colonneDisponible(): Promise<boolean>;                 // migration 218 appliquée ?
  etat(dossierId: number): Promise<EtatAutocreation>;     // nbValide + nbCorps + nbDecompte
  creerCarteVide(dossierId: number, majPar: string): Promise<void>;
  nommer(dossierId: number): Promise<void>;               // attribuerNomsRepli (repli numéroté ; ne touche jamais un repère)
  poserNombre(dossierId: number, n: number, majPar: string): Promise<void>;
}

export interface RapportAutocreation {
  dossierId: number;
  migrationAbsente: boolean; // 218 non appliquée → no-op complet
  intouche: boolean;         // décision humaine déjà posée, ou 0 détecté → rien fait
  detecte: number;
  nbCorpsAvant: number;
  aCreer: number;            // cartes vides que la décision PRÉVOIT de créer (plan, visible en dry-run)
  aPoser: number | null;     // nombre validé que la décision PRÉVOIT de poser (null = rien)
  creees: number;            // cartes vides RÉELLEMENT créées (0 en dry-run)
  nombrePose: number | null; // nombre validé RÉELLEMENT posé (null si dry-run / rien)
}

export async function autocreerCartes(dossierId: number, majPar: string, deps: DepsAutocreation, opts: { appliquer: boolean }): Promise<RapportAutocreation> {
  // Le PLAN se calcule TOUJOURS (le dry-run doit montrer ce qui serait créé même 218 non appliquée) ; seule l'ÉCRITURE est gatée.
  const dispo = await deps.colonneDisponible();
  const etat = await deps.etat(dossierId);
  const d = decisionAutocreationCartes(etat);
  const base: RapportAutocreation = { dossierId, migrationAbsente: !dispo, intouche: d.poser === null && d.creer === 0, detecte: d.detecte, nbCorpsAvant: etat.nbCorps, aCreer: d.creer, aPoser: d.poser, creees: 0, nombrePose: null };

  // NO-OP d'écriture : dry-run, décision humaine / 0 détecté, OU migration absente (sans colonne, pas d'idempotence possible → on n'écrit rien).
  if (!opts.appliquer || d.poser === null || !dispo) return base;

  for (let i = 0; i < d.creer; i++) await deps.creerCarteVide(dossierId, majPar);
  if (d.creer > 0) await deps.nommer(dossierId); // numérote les cartes créées (nom_repli), laisse les repères existants intacts
  await deps.poserNombre(dossierId, d.poser, majPar);
  return { ...base, creees: d.creer, nombrePose: d.poser };
}

// ── Deps RÉELLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** La colonne nb_batiments_valide existe-t-elle ? (migration 218 appliquée). Résilient → false si indéterminable. Exporté : BAT-3 gate le
 *  changement manuel de nombre (sans 218, impossible de MÉMORISER le nombre validé → 409 explicite plutôt qu'une écriture qui échoue). */
export async function colonneNbValideDisponible(): Promise<boolean> {
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'permis_caracteristique' AND column_name = 'nb_batiments_valide'`);
    return (rows[0]?.n ?? 0) > 0;
  } catch { return false; }
}

/** Nombre de bâtiments VALIDÉ d'un dossier, ou null (jamais validé, OU colonne absente → résilient). */
export async function lireNombreBatimentsValide(dossierId: number): Promise<number | null> {
  try {
    const { rows } = await query<{ n: number | null }>(`SELECT nb_batiments_valide AS n FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
    return rows[0]?.n ?? null;
  } catch { return null; } // 218 absente → traité comme « pas encore validé »
}

async function nbCorpsDe(dossierId: number): Promise<number> {
  const fa = await fragmentCorpsActif(''); // BAT-3 — cartes ACTIVES seulement (résilient : vide si 219 non appliquée)
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_corps_batiment WHERE dossier_id = $1${fa}`, [dossierId]);
  return rows[0]?.n ?? 0;
}

/** Décompte CORROBORÉ du champ libre (LOT 69) : nbBatimentsRetenu si concordant, sinon 0. Résilient. */
async function nbDecompteDe(dossierId: number): Promise<number> {
  const dc = await lireDeclarationsRecap(dossierId).catch(() => null);
  const d = dc?.declarations.decompte;
  return d?.concordant && d.nbBatimentsRetenu != null ? d.nbBatimentsRetenu : 0;
}

/**
 * POSE le nombre de bâtiments VALIDÉ (upsert CIBLÉ des 3 colonnes nb_batiments_valide*, jamais les autres champs). ON CONFLICT
 * (dossier_id) — même clé que ecrireGlobal. SOURCE UNIQUE : utilisé par l'auto-création (BAT-1) ET par le changement manuel de nombre
 * (BAT-3) — aucun 2e chemin d'écriture du nombre validé. `_le/_par` = trace (quand/qui) de la décision, sur le patron du sommet confirmé.
 */
export async function poserNombreBatimentsValide(dossierId: number, n: number, majPar: string): Promise<void> {
  await query(
    `INSERT INTO permis_caracteristique (dossier_id, nb_batiments_valide, nb_batiments_valide_le, nb_batiments_valide_par, maj_le, maj_par)
       VALUES ($1, $2, now(), $3, now(), $3)
       ON CONFLICT (dossier_id) DO UPDATE SET nb_batiments_valide = EXCLUDED.nb_batiments_valide, nb_batiments_valide_le = now(), nb_batiments_valide_par = EXCLUDED.nb_batiments_valide_par, maj_le = now()`,
    [dossierId, n, majPar]);
}

export function depsReellesAutocreation(): DepsAutocreation {
  return {
    colonneDisponible: colonneNbValideDisponible,
    etat: async (dossierId) => ({ nbValide: await lireNombreBatimentsValide(dossierId), nbCorps: await nbCorpsDe(dossierId), nbDecompte: await nbDecompteDe(dossierId) }),
    creerCarteVide: async (dossierId, majPar) => { await creerCorps(dossierId, null, majPar); }, // carte VIDE (repere null), numérotée ensuite
    nommer: async (dossierId) => { await attribuerNomsRepli(dossierId); },
    poserNombre: poserNombreBatimentsValide, // SOURCE UNIQUE (partagée avec BAT-3)
  };
}
