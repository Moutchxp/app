/**
 * Configuration de la tuile « Permis de construire » (chantier S3), lue depuis le singleton `config_veille`
 * (migration 048) avec REPLI SÛR sur les valeurs par défaut si la ligne manque — même principe que
 * `chargerProfilDegagement`. AUCUNE valeur en dur ailleurs : seuils et rangs viennent d'ici (pilotage sans code).
 */
import { query } from '../db/client';

/**
 * URL par défaut de l'archive de l'annuaire DILA (ressource data.gouv, qui redirige 302 vers all_latest.tar.bz2). C'est le
 * DEFAULT de `config_veille.dila_url` (migration 069) ET le repli ultime si la base est injoignable. Défini ici (config)
 * plutôt que dans `dilaIngest` pour éviter un cycle d'import (dilaIngest → veilleConfig → dilaIngest).
 */
export const DILA_URL_DEFAUT = 'https://www.data.gouv.fr/api/1/datasets/r/73302880-e4df-4d4c-8676-1a61bb997f3d';

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
  dilaUrl: string; // S30 : URL de l'annuaire DILA, éditable en base (config_veille.dila_url) — pilotage sans code
  envoisMaxParRun: number;  // S37 : cap d'envoi — e-mails aux mairies par action d'envoi (rempart anti-salve)
  envoisMaxParJour: number; // S37 : cap d'envoi — e-mails aux mairies par jour (runs cumulés)
  adresseReponse: string;   // S38 : boîte relue en reply-to des demandes ('' = non configurée → envoi refusé)
  mentionServiceActive: boolean; // S40 : mention « service destinataire » (en tête du corps)
  mentionServiceTexte: string;   // S40 : texte éditable de la mention service
  mentionDelaiActive: boolean;   // S40 : mention « délai d'un mois » (près de la clôture)
  mentionDelaiTexte: string;     // S40 : texte éditable de la mention délai
  releveActive: boolean;            // R7 : relève automatique des réponses activée ? (opt-in, défaut false)
  releveIntervalleMinutes: number;  // R7 : intervalle minimum entre deux relèves automatiques (minutes)
  releveProfil: string;             // R7 : profil de boîte relevé automatiquement ('entreprise' | 'personne')
  echeanceAlerteJours: number;      // R6 : jours avant l'échéance d'un mois à partir desquels elle est « proche »
  releveFraicheurHeures: number;    // R6 : au-delà, la dernière relève est trop vieille → état d'échéance « indéterminé »
  alerteActive: boolean;            // R8 : alertes e-mail activées ? (opt-in, défaut false)
  alerteEmail: string;              // R8 : destinataire du récapitulatif quotidien ('' = aucune alerte possible)
  alerteHeureLocale: number;        // R8 : heure locale (0-23) à partir de laquelle le récapitulatif du jour peut partir
  pieceTailleMaxMo: number;         // R4 : taille max (Mo) d'une pièce jointe entrante déposée
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
  dilaUrl: DILA_URL_DEFAUT,
  envoisMaxParRun: 10,   // = DEFAULT de la migration 070 (défaut prudent)
  envoisMaxParJour: 25,  // = DEFAULT de la migration 070 (défaut prudent)
  adresseReponse: '',    // = DEFAULT de la migration 071 (non configurée → le send refuse)
  mentionServiceActive: false, mentionServiceTexte: '', // = DEFAULT de la migration 072 (désactivée, vide)
  mentionDelaiActive: false, mentionDelaiTexte: '',     // = DEFAULT de la migration 072 (désactivée, vide)
  releveActive: false, releveIntervalleMinutes: 60, releveProfil: 'entreprise', // = DEFAULT de la migration 074 (opt-in)
  echeanceAlerteJours: 7, releveFraicheurHeures: 48, // = DEFAULT de la migration 075
  alerteActive: false, alerteEmail: '', alerteHeureLocale: 8, // = DEFAULT de la migration 078 (opt-in)
  pieceTailleMaxMo: 50, // = DEFAULT de la migration 079
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

/**
 * Lecture BEST-EFFORT de `config_veille.dila_url`, ISOLÉE du reste (S30). ⚠️ Résilience à l'ORDRE D'APPLICATION : tant que la
 * migration 069 n'est pas passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur le défaut, SANS faire
 * dégrader tout le reste de la config à ses valeurs par défaut (ce qui arriverait si `dila_url` était dans la requête
 * principale). Après 069 : renvoie la valeur en base (fait foi), défaut si vide.
 */
async function lireDilaUrl(): Promise<string> {
  try {
    const { rows } = await query<{ dila_url: string }>(`SELECT dila_url FROM config_veille WHERE id = 1`);
    const v = (rows[0]?.dila_url ?? '').trim();
    return v === '' ? DILA_URL_DEFAUT : v;
  } catch {
    return DILA_URL_DEFAUT; // colonne pas encore migrée (069) → défaut, sans casser le reste de la config
  }
}

/**
 * Lecture BEST-EFFORT des CAPS D'ENVOI (S37), ISOLÉE — même motif de résilience que `lireDilaUrl` : tant que la migration
 * 070 n'est pas passée, les colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts prudents, sans
 * dégrader tout le reste de la config. Après 070 : renvoie les valeurs en base (font foi).
 */
async function lireCapsEnvoi(): Promise<{ envoisMaxParRun: number; envoisMaxParJour: number }> {
  try {
    const { rows } = await query<{ envois_max_par_run: number; envois_max_par_jour: number }>(
      `SELECT envois_max_par_run, envois_max_par_jour FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return { envoisMaxParRun: CONFIG_VEILLE_DEFAUT.envoisMaxParRun, envoisMaxParJour: CONFIG_VEILLE_DEFAUT.envoisMaxParJour };
    return { envoisMaxParRun: r.envois_max_par_run, envoisMaxParJour: r.envois_max_par_jour };
  } catch {
    return { envoisMaxParRun: CONFIG_VEILLE_DEFAUT.envoisMaxParRun, envoisMaxParJour: CONFIG_VEILLE_DEFAUT.envoisMaxParJour }; // 070 pas encore appliquée → défauts
  }
}

/**
 * Lecture BEST-EFFORT de l'ADRESSE DE RÉPONSE (S38), ISOLÉE — même motif de résilience : tant que la migration 071 n'est pas
 * passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur '' (non configurée), sans dégrader le reste.
 */
async function lireAdresseReponse(): Promise<string> {
  try {
    const { rows } = await query<{ adresse_reponse: string }>(`SELECT adresse_reponse FROM config_veille WHERE id = 1`);
    return (rows[0]?.adresse_reponse ?? '').trim();
  } catch {
    return ''; // 071 pas encore appliquée → non configurée (le send refusera)
  }
}

/**
 * Lecture BEST-EFFORT des MENTIONS de courrier (S40), ISOLÉE — même motif de résilience : tant que la migration 072 n'est
 * pas passée, les colonnes n'existent pas → retombe sur les défauts (désactivées, vides), sans dégrader le reste.
 */
async function lireMentions(): Promise<Pick<ConfigVeille, 'mentionServiceActive' | 'mentionServiceTexte' | 'mentionDelaiActive' | 'mentionDelaiTexte'>> {
  const def = { mentionServiceActive: false, mentionServiceTexte: '', mentionDelaiActive: false, mentionDelaiTexte: '' };
  try {
    const { rows } = await query<{ mention_service_active: boolean; mention_service_texte: string; mention_delai_active: boolean; mention_delai_texte: string }>(
      `SELECT mention_service_active, mention_service_texte, mention_delai_active, mention_delai_texte FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { mentionServiceActive: r.mention_service_active, mentionServiceTexte: r.mention_service_texte, mentionDelaiActive: r.mention_delai_active, mentionDelaiTexte: r.mention_delai_texte };
  } catch { return def; } // 072 pas encore appliquée → défauts
}

/**
 * Lecture BEST-EFFORT de la RELÈVE AUTOMATIQUE (R7), ISOLÉE — même motif de résilience que `lireMentions` : tant que la
 * migration 074 n'est pas passée, les colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts
 * (désactivée, 60 min, entreprise), sans dégrader tout le reste de la config. Après 074 : renvoie les valeurs en base.
 */
async function lireReleve(): Promise<Pick<ConfigVeille, 'releveActive' | 'releveIntervalleMinutes' | 'releveProfil'>> {
  const def = { releveActive: false, releveIntervalleMinutes: 60, releveProfil: 'entreprise' };
  try {
    const { rows } = await query<{ releve_active: boolean; releve_intervalle_minutes: number; releve_profil: string }>(
      `SELECT releve_active, releve_intervalle_minutes, releve_profil FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { releveActive: r.releve_active, releveIntervalleMinutes: r.releve_intervalle_minutes, releveProfil: r.releve_profil };
  } catch { return def; } // 074 pas encore appliquée → défauts
}

/**
 * Lecture BEST-EFFORT de l'ÉCHÉANCE (R6), ISOLÉE — même motif de résilience : tant que la migration 075 n'est pas passée,
 * les colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts (7 j, 48 h), sans dégrader le reste.
 */
async function lireEcheance(): Promise<Pick<ConfigVeille, 'echeanceAlerteJours' | 'releveFraicheurHeures'>> {
  const def = { echeanceAlerteJours: 7, releveFraicheurHeures: 48 };
  try {
    const { rows } = await query<{ echeance_alerte_jours: number; releve_fraicheur_heures: number }>(
      `SELECT echeance_alerte_jours, releve_fraicheur_heures FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { echeanceAlerteJours: r.echeance_alerte_jours, releveFraicheurHeures: r.releve_fraicheur_heures };
  } catch { return def; } // 075 pas encore appliquée → défauts
}

/**
 * Lecture BEST-EFFORT des ALERTES (R8), ISOLÉE — même motif de résilience : tant que la migration 078 n'est pas passée, les
 * colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts (désactivée, vide, 8 h), sans dégrader le reste.
 */
async function lireAlerte(): Promise<Pick<ConfigVeille, 'alerteActive' | 'alerteEmail' | 'alerteHeureLocale'>> {
  const def = { alerteActive: false, alerteEmail: '', alerteHeureLocale: 8 };
  try {
    const { rows } = await query<{ alerte_active: boolean; alerte_email: string; alerte_heure_locale: number }>(
      `SELECT alerte_active, alerte_email, alerte_heure_locale FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { alerteActive: r.alerte_active, alerteEmail: (r.alerte_email ?? '').trim(), alerteHeureLocale: r.alerte_heure_locale };
  } catch { return def; } // 078 pas encore appliquée → défauts
}

/**
 * Lecture BEST-EFFORT de la BORNE DE TAILLE des pièces entrantes (R4), ISOLÉE — même motif de résilience : tant que la
 * migration 079 n'est pas passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur le défaut (50 Mo).
 */
async function lirePieceTaille(): Promise<Pick<ConfigVeille, 'pieceTailleMaxMo'>> {
  try {
    const { rows } = await query<{ piece_taille_max_mo: number }>(`SELECT piece_taille_max_mo FROM config_veille WHERE id = 1`);
    return { pieceTailleMaxMo: rows[0]?.piece_taille_max_mo ?? 50 };
  } catch { return { pieceTailleMaxMo: 50 }; } // 079 pas encore appliquée → défaut
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
      dilaUrl: await lireDilaUrl(), // S30 : lecture isolée (résiliente à l'ordre d'application de la 069)
      ...(await lireCapsEnvoi()),   // S37 : caps d'envoi, lecture isolée (résiliente à l'ordre d'application de la 070)
      adresseReponse: await lireAdresseReponse(), // S38 : lecture isolée (résiliente à l'ordre d'application de la 071)
      ...(await lireMentions()),                   // S40 : mentions de courrier, lecture isolée (résiliente à la 072)
      ...(await lireReleve()),                      // R7 : relève automatique, lecture isolée (résiliente à la 074)
      ...(await lireEcheance()),                     // R6 : échéance/fraîcheur, lecture isolée (résiliente à la 075)
      ...(await lireAlerte()),                        // R8 : alertes e-mail, lecture isolée (résiliente à la 078)
      ...(await lirePieceTaille()),                    // R4 : borne de taille des pièces, lecture isolée (résiliente à la 079)
    };
  } catch {
    return CONFIG_VEILLE_DEFAUT;
  }
}
