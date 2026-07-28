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
  ancienneteMaxDemandeAnnees: number;
  profilDemandeurDefaut: string;
  autoActive: boolean;
  autoIntervalleHeures: number;
  csvRetentionJours: number;
  runDemandeLe: Date | null;
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
  ancienneteMaxDemandeAnnees: 3,
  profilDemandeurDefaut: 'entreprise',
  autoActive: false,
  autoIntervalleHeures: 24,
  csvRetentionJours: 0,
  runDemandeLe: null,
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
  anciennete_max_demande_annees: number;
  profil_demandeur_defaut: string;
  auto_active: boolean;
  auto_intervalle_heures: number;
  csv_retention_jours: number;
  run_demande_le: Date | null;
}

/** Lit le singleton `config_veille`. Ligne absente / table absente / erreur → `CONFIG_VEILLE_DEFAUT` (jamais d'exception propagée). */
export async function chargerConfigVeille(): Promise<ConfigVeille> {
  try {
    const res = await query<LigneConfigVeille>(
      `SELECT seuil_logements_immeuble, seuil_surface_immeuble_m2, annees_par_defaut,
              rang_immeuble_neuf, rang_surelevation, rang_construction_neuve, rang_extension, rang_demolition,
              dossiers_par_demande, demandes_par_commune_par_mois, pieces_demandees, anciennete_max_demande_annees,
              profil_demandeur_defaut, auto_active, auto_intervalle_heures, csv_retention_jours, run_demande_le
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
      ancienneteMaxDemandeAnnees: r.anciennete_max_demande_annees,
      profilDemandeurDefaut: r.profil_demandeur_defaut,
      autoActive: r.auto_active,
      autoIntervalleHeures: r.auto_intervalle_heures,
      csvRetentionJours: r.csv_retention_jours,
      runDemandeLe: r.run_demande_le,
    };
  } catch {
    return CONFIG_VEILLE_DEFAUT;
  }
}
