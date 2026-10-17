import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { immeubleDeLAg, verifierDateAg } from './immeubleAg';
import { familleDeCategorie } from './bienComplet';

/**
 * ══ 🔴🔴 TUILE LOCATION — LA DERNIÈRE AG, PAR IMMEUBLE (migration 377). IMPUR (base). ════════════════════════════════════
 *
 * Une adresse SECONDAIRE d'une copropriété (`gestion_copropriete_adresse`) se ramène à la clé de sa copropriété : tous les
 * lots de la même copropriété partagent la même date, comme ils partagent le même syndic. Sans la migration 377, la lecture
 * rend « inconnue » et l'écriture refuse en le disant. Aucun DELETE : effacer la date l'écrit à `null`.
 */

export function agDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_immeuble_ag', 'derniere_ag');
}

/** La clé de la copropriété dont cette clé d'immeuble est une adresse secondaire ; sinon elle-même. */
async function clePrincipale(cle: string): Promise<string> {
  try {
    const { rows } = await query<{ cle: string }>(
      `SELECT c.cle_immeuble AS cle FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id
        WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL LIMIT 1`, [cle]);
    return rows[0]?.cle ?? cle;
  } catch { return cle; }
}

/** L'immeuble (clé principale + libellé) d'un lot pour l'AG, ou `null` (parking nu sans immeuble). */
export async function immeubleAgDuLot(lotId: number): Promise<{ cle: string; libelle: string } | null> {
  const { rows } = await query<{ immeuble: string | null; adresse: string | null; categorie: string | null }>(
    'SELECT immeuble, adresse, categorie FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  const r = rows[0];
  if (r === undefined) return null;
  const i = immeubleDeLAg({ immeuble: r.immeuble, adresse: r.adresse, parking: familleDeCategorie(r.categorie ?? '') === 'parking' || r.categorie === 'box' });
  return i === null ? null : { cle: await clePrincipale(i.cle), libelle: i.libelle };
}

/** La date connue pour un immeuble (par sa clé), ou `null`. */
export async function lireAg(cle: string): Promise<string | null> {
  if (!(await agDisponible())) return null;
  const { rows } = await query<{ d: string | null }>('SELECT derniere_ag::text AS d FROM gestion_immeuble_ag WHERE cle_immeuble = $1', [await clePrincipale(cle)]);
  return rows[0]?.d ?? null;
}

/** La date connue pour l'immeuble d'une ADRESSE saisie (formulaire du nouveau bien : son « Immeuble » sera son adresse). */
export async function lireAgPourAdresse(adresse: string): Promise<string | null> {
  const i = immeubleDeLAg({ immeuble: adresse, parking: false });
  return i === null ? null : lireAg(i.cle);
}

/** Écrit la date d'AG de l'immeuble (création ou mise à jour), journalisée sur le lot d'où elle vient. */
export async function enregistrerAg(immeuble: { cle: string; libelle: string }, brut: unknown, lotId: number, auteur: Auteur):
  Promise<{ ok: true } | { ok: false; motif: string }> {
  const v = verifierDateAg(brut);
  if (!v.ok) return v;
  if (!(await agDisponible())) return { ok: false, motif: 'La date de la dernière AG n’est pas encore installée (migration 377).' };
  const cle = await clePrincipale(immeuble.cle);
  const { rows } = await query<{ avant: string | null }>('SELECT derniere_ag::text AS avant FROM gestion_immeuble_ag WHERE cle_immeuble = $1', [cle]);
  const avant = rows[0]?.avant ?? null;
  if (rows.length > 0 && avant === v.date) return { ok: true };
  await query(
    `INSERT INTO gestion_immeuble_ag (cle_immeuble, libelle, derniere_ag, maj_par, maj_par_libelle) VALUES ($1, $2, $3::date, $4, $5)
     ON CONFLICT (cle_immeuble) DO UPDATE SET derniere_ag = EXCLUDED.derniere_ag, maj_le = now(), maj_par = EXCLUDED.maj_par, maj_par_libelle = EXCLUDED.maj_par_libelle`,
    [cle, immeuble.libelle, v.date, auteur.id, auteur.libelle]);
  await query(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'location_derniere_ag', $2, $3, $4)`,
    [lotId, `dernière AG de l’immeuble « ${immeuble.libelle} » : ${avant ?? 'non renseignée'} → ${v.date ?? 'non renseignée'} (partagée par les lots du même immeuble)`, auteur.id, auteur.libelle]);
  return { ok: true };
}
