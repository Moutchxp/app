import { query } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';

/**
 * 🔴🔴 (Arno, 27/11/2026, 11h01, point 2) « Pour la sélection des collègues, il faut une fenêtre qui s'ouvre avec tous les utilisateurs qui ont accès
 * aux tuiles Gestion et Location. » — les comptes ACTIFS qui ouvrent la tuile Gestion OU la tuile Location : la règle de exigerCompteActif
 * (administrateur = toutes les tuiles, sinon perm_gestion / perm_location), la même que les destinataires de la pré-visite. Lecture seule.
 * Sans la colonne perm_location : Gestion seule (la direction sûre). Les noms bruts : l'écran les écrit « Prénom NOM » (nomCollaborateur).
 */
export async function colleguesGestionLocation(): Promise<{ id: number; prenom: string | null; nom: string | null }[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? ' OR perm_location IS TRUE' : '';
  const { rows } = await query<{ id: number; prenom: string | null; nom: string | null }>(
    `SELECT id::int AS id, prenom, nom FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE${location})`);
  return rows.map((r) => ({ id: Number(r.id), prenom: r.prenom, nom: r.nom }));
}
