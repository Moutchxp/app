/**
 * Configuration de la tuile « Permis de construire » (chantier S3), lue depuis le singleton `config_veille`
 * (migration 048) avec REPLI SÛR sur les valeurs par défaut si la ligne manque — même principe que
 * `chargerProfilDegagement`. AUCUNE valeur en dur ailleurs : seuils et rangs viennent d'ici (pilotage sans code).
 */
import { query } from '../db/client';

export interface ConfigVeille {
  seuilLogementsImmeuble: number;
  seuilSurfaceImmeubleM2: number;
  anneesParDefaut: number;
  rangImmeubleNeuf: number;
  rangSurelevation: number;
  rangConstructionNeuve: number;
  rangExtension: number;
  rangDemolition: number;
  dossiersParDemande: number;
  demandesParCommuneParMois: number;
  piecesDemandees: string;
}

/** Repli : valeurs identiques aux DEFAULT de la migration 048 (si `config_veille` est absente/vide). */
export const CONFIG_VEILLE_DEFAUT: ConfigVeille = {
  seuilLogementsImmeuble: 10,
  seuilSurfaceImmeubleM2: 1500,
  anneesParDefaut: 3,
  rangImmeubleNeuf: 1,
  rangSurelevation: 2,
  rangConstructionNeuve: 3,
  rangExtension: 4,
  rangDemolition: 5,
  dossiersParDemande: 5,
  demandesParCommuneParMois: 1,
  piecesDemandees: 'PC2,PC3',
};

interface LigneConfigVeille {
  seuil_logements_immeuble: number;
  seuil_surface_immeuble_m2: number;
  annees_par_defaut: number;
  rang_immeuble_neuf: number;
  rang_surelevation: number;
  rang_construction_neuve: number;
  rang_extension: number;
  rang_demolition: number;
  dossiers_par_demande: number;
  demandes_par_commune_par_mois: number;
  pieces_demandees: string;
}

/** Lit le singleton `config_veille`. Ligne absente / table absente / erreur → `CONFIG_VEILLE_DEFAUT` (jamais d'exception propagée). */
export async function chargerConfigVeille(): Promise<ConfigVeille> {
  try {
    const res = await query<LigneConfigVeille>(
      `SELECT seuil_logements_immeuble, seuil_surface_immeuble_m2, annees_par_defaut,
              rang_immeuble_neuf, rang_surelevation, rang_construction_neuve, rang_extension, rang_demolition,
              dossiers_par_demande, demandes_par_commune_par_mois, pieces_demandees
       FROM config_veille WHERE id = 1`,
    );
    const r = res.rows[0];
    if (!r) return CONFIG_VEILLE_DEFAUT;
    return {
      seuilLogementsImmeuble: r.seuil_logements_immeuble,
      seuilSurfaceImmeubleM2: r.seuil_surface_immeuble_m2,
      anneesParDefaut: r.annees_par_defaut,
      rangImmeubleNeuf: r.rang_immeuble_neuf,
      rangSurelevation: r.rang_surelevation,
      rangConstructionNeuve: r.rang_construction_neuve,
      rangExtension: r.rang_extension,
      rangDemolition: r.rang_demolition,
      dossiersParDemande: r.dossiers_par_demande,
      demandesParCommuneParMois: r.demandes_par_commune_par_mois,
      piecesDemandees: r.pieces_demandees,
    };
  } catch {
    return CONFIG_VEILLE_DEFAUT;
  }
}
