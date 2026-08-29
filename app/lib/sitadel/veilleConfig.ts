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
  demandesParCommuneParMois: number; // VESTIGIAL (Q1) : n'agit plus ; conservé et lu pour l'affichage/l'historique
  permisParCommuneParMois: number;   // Q1 : plafond mensuel en PERMIS (dossiers) — remplace demandesParCommuneParMois
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
  envoisAutoMaxParRun: number; // LOT 6 : plafond SPÉCIFIQUE à l'envoi AUTOMATIQUE (relances + saisines) — EN PLUS des caps manuels, jamais à leur place ; borne l'accident (1..50, défaut 5)
  recomptageHeureLocale: number; // PASTILLES : heure locale (0..23) du recomptage quotidien des compteurs « actions en attente » — ne lit pas la boîte mail (défaut 8)
  envoiHeureDebut: number; // RELANCE : début (0..23) de la fenêtre d'envoi automatique (jours ouvrés) — défaut 9
  envoiHeureFin: number;   // RELANCE : fin (0..23, exclue) de la fenêtre d'envoi automatique — défaut 11 ; doit être > début (sinon rien ne part)
  adresseReponse: string;   // S38 : boîte relue en reply-to des demandes ('' = non configurée → envoi refusé)
  mentionServiceActive: boolean; // S40 : mention « service destinataire » (en tête du corps)
  mentionServiceTexte: string;   // S40 : texte éditable de la mention service
  mentionDelaiActive: boolean;   // S40 : mention « délai d'un mois » (près de la clôture)
  mentionDelaiTexte: string;     // S40 : texte éditable de la mention délai
  mentionSourcesActive: boolean; // S-DWG : 3e tiret « fichiers sources (DWG/DXF) » dans la liste des pièces (défaut true, opt-out)
  mentionSourcesTexte: string;   // S-DWG : texte éditable du tiret « fichiers sources »
  releveActive: boolean;            // R7 : relève automatique des réponses activée ? (opt-in, défaut false)
  releveIntervalleMinutes: number;  // R7 : intervalle minimum entre deux relèves automatiques (minutes)
  releveProfil: string;             // R7 : profil de boîte relevé automatiquement ('entreprise' | 'personne')
  echeanceAlerteJours: number;      // R6 : jours avant l'échéance d'un mois à partir desquels elle est « proche »
  releveFraicheurHeures: number;    // R6 : au-delà, la dernière relève est trop vieille → état d'échéance « indéterminé »
  alerteActive: boolean;            // R8 : alertes e-mail activées ? (opt-in, défaut false)
  alerteEmail: string;              // R8 : destinataire du récapitulatif quotidien ('' = aucune alerte possible)
  alerteHeureLocale: number;        // R8 : heure locale (0-23) à partir de laquelle le récapitulatif du jour peut partir
  pieceTailleMaxMo: number;         // R4 : taille max (Mo) d'une pièce jointe entrante déposée
  rechercheReferencesMax: number;   // R3e : nb max de numéros de dossier interrogés côté serveur à chaque relève
  nbCandidatsExamines: number;      // V2 : profondeur du haut du classement examinée pour constituer les demandes (ex-const NB_CANDIDATS)
  triCandidats: string;             // V2 : ordre secondaire de tri des candidats (GARDE, liste fermée) — ex-const ORDRE_SECONDAIRE
  cadaEmail: string;                // X1 : e-mail de la CADA pour une saisine par e-mail ('' = saisine par formulaire en ligne, dépôt manuel)
  cadaUrlFormulaire: string;        // X1 : URL du formulaire de saisine en ligne de la CADA (dépôt manuel quand cadaEmail vide)
  propositionCadaActive: boolean;   // X5 : proposer par e-mail (à alerteEmail) la saisine CADA d'une demande devenue saisissable (opt-in, défaut false)
  depotAdressesConnues: string;     // N1-A : adresses reconnues pour le versement auto en GED (virgules ; union avec les collaborateurs)
  natureAccuseMotifs: string;       // FUS-4 : motifs d'objet reconnaissant un accusé (liste virgules/retours) — pilotage sans code
  relanceAutoActive: boolean;       // LOT B : envoyer les relances automatiquement ? STOCKÉ/AFFICHÉ, LU PAR AUCUN CODE D'ENVOI dans ce lot
  relanceJoursAvantEcheance: number; // LOT B (VESTIGIAL, cascade lot 2) : remplacé par relanceRappelJoursAvant — conservé, non éditable
  relanceRappelJoursAvant: number;   // Cascade lot 2 : jours avant l'échéance où le RAPPEL (J-10) est préparé — borné 1..30, défaut 10
  relanceAvisJoursAvant: number;     // Cascade lot 2 : jours avant l'échéance où l'AVIS (J-3, possibilité CADA) est préparé — borné 1..30, défaut 3
  relanceSaisineDelaiJours: number;  // Cascade lot 2 : délai (jours) après l'échéance au terme duquel la SAISINE CADA sera déposée — borné 1..30, défaut 4
  saisineCadaAutoActive: boolean;    // Cascade lot 2 : envoyer la saisine CADA SANS relecture ? Sans effet tant que cadaEmail est vide — défaut false
  rattachementSuiviAutoActive: boolean; // RATT-AUTO : rejouer automatiquement le suivi des permis « en attente de bâti » à chaque tick ? (opt-in, défaut false)
  attenteBatiAlerteActive: boolean;     // ATT-BATI : envoyer un rappel e-mail quand un permis attend le bâti au-delà du seuil ? (opt-in, défaut false)
  attenteBatiAlerteJours: number;       // ATT-BATI : ancienneté (jours) au-delà de laquelle le rappel se déclenche — défaut 365, plage 30..1095
  obstacleDisparuAlerteActive: boolean; // ALERTE : prévenir quand un bâtiment qui fondait un certificat a disparu de BD TOPO ? (opt-in, défaut false)
  teleserviceDossiersParDepot: number;        // D4-ter (étanche) : dossiers par demande PROPRE au rail téléservice (valeur à part entière). Plage 1..20.
  teleservicePermisParCommuneParMois: number; // D4-ter (étanche) : plafond mensuel de permis par commune PROPRE au rail téléservice. Plage 1..50.
  teleserviceProfilDemandeurDefaut: string;   // D4-ter (étanche, absorbe P) : profil de demandeur par défaut PROPRE au téléservice (entreprise/personne). FranceConnect → 'personne'.
  teleserviceAlerteNonDeposeActive: boolean;  // D4 (B) : alerte « demande téléservice préparée non déposée depuis N jours » (opt-in, défaut false)
  teleserviceAlerteNonDeposeJours: number;    // D4 (B) : seuil (jours) de l'alerte « non déposée » du rail téléservice — défaut 7, plage 1..90
  delaiBasculeJours: number;                  // PHASE-1 : délai (jours) après l'accord avant bascule possible sur les polygones officiels — défaut 548 (≈1,5 an), plage 30..1825
  dureeMessageJours: number;                  // PHASE-1 : durée (jours) du message « construction récente », comptée depuis la bascule — défaut 548 (≈1,5 an), plage 30..1825
}

/**
 * S-DWG — TEXTE par défaut du 3e tiret « fichiers sources des pièces graphiques ». SOURCE UNIQUE côté code (repli avant
 * migration + défaut du repli). ⚠️ Doit rester byte-identique au DEFAULT SQL de `mention_sources_texte` (migration 148) —
 * un test statique le verrouille. Formulation qui N'OBLIGE À RIEN (les sources ne sont pas une pièce Cerfa).
 */
export const MENTION_SOURCES_TEXTE_DEFAUT =
  '— si le dossier en comporte, les fichiers sources des pièces graphiques (DWG, DXF) ; leur communication nous serait précieuse, mais leur absence ne doit en rien retarder l’envoi des pièces ci-dessus.';

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
  demandesParCommuneParMois: 1,        // VESTIGIAL (Q1)
  permisParCommuneParMois: 5,          // Q1 : = défaut(demandes 1) × défaut(dossiers 5)
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
  envoisAutoMaxParRun: 5, // = DEFAULT de la migration 137 (plafond d'envoi automatique)
  recomptageHeureLocale: 8, // = DEFAULT de la migration 139 (recomptage quotidien des pastilles)
  envoiHeureDebut: 9, envoiHeureFin: 11, // = DEFAULT de la migration 140 (fenêtre d'envoi automatique, jours ouvrés)
  adresseReponse: '',    // = DEFAULT de la migration 071 (non configurée → le send refuse)
  mentionServiceActive: false, mentionServiceTexte: '', // = DEFAULT de la migration 072 (désactivée, vide)
  mentionDelaiActive: false, mentionDelaiTexte: '',     // = DEFAULT de la migration 072 (désactivée, vide)
  mentionSourcesActive: true, mentionSourcesTexte: MENTION_SOURCES_TEXTE_DEFAUT, // = DEFAULT de la migration 148 (actif, texte pré-rédigé)
  releveActive: false, releveIntervalleMinutes: 60, releveProfil: 'entreprise', // = DEFAULT de la migration 074 (opt-in)
  echeanceAlerteJours: 7, releveFraicheurHeures: 48, // = DEFAULT de la migration 075
  alerteActive: false, alerteEmail: '', alerteHeureLocale: 8, // = DEFAULT de la migration 078 (opt-in)
  pieceTailleMaxMo: 50, // = DEFAULT de la migration 079
  rechercheReferencesMax: 50, // = DEFAULT de la migration 080
  nbCandidatsExamines: 5000, triCandidats: 'surface_puis_date', // = DEFAULT de la migration 081
  cadaEmail: '', cadaUrlFormulaire: 'https://www.cada.fr/formulaire-de-saisine', // = DEFAULT de la migration 083
  propositionCadaActive: false, // = DEFAULT de la migration 084 (opt-in)
  depotAdressesConnues: '',     // = DEFAULT de la migration 102 (aucune adresse connue en propre → seuls les collaborateurs)
  natureAccuseMotifs: '',       // FUS-4 : repli ultime = aucun motif → comportement d'AVANT ce lot (la 125 pose 'accusé de réception')
  relanceAutoActive: false, relanceJoursAvantEcheance: 10, // = DEFAULT de la migration 128 (LOT B : opt-out d'envoi auto, préparation à J-10)
  relanceRappelJoursAvant: 10, relanceAvisJoursAvant: 3, relanceSaisineDelaiJours: 4, saisineCadaAutoActive: false, // = DEFAULT de la migration 136 (cascade lot 2)
  rattachementSuiviAutoActive: false, // = DEFAULT de la migration 154 (RATT-AUTO : opt-in, comme tous les interrupteurs d'automatisation)
  attenteBatiAlerteActive: false, attenteBatiAlerteJours: 365, // = DEFAULT de la migration 155 (ATT-BATI : opt-in ; seuil 1 an, bas de la fenêtre IGN 1-3 ans)
  obstacleDisparuAlerteActive: false, // = DEFAULT de la migration 157 (ALERTE obstacle disparu : opt-in)
  // D4-ter (étanche) — valeurs de rail téléservice à part entière. Ces défauts ne servent qu'au repli TOTAL (lecture impossible) ;
  //   en marche normale, lireTeleservice COALESCE sur la valeur commune (= comportement identique jour J).
  teleserviceDossiersParDepot: 5, teleservicePermisParCommuneParMois: 5, teleserviceProfilDemandeurDefaut: 'entreprise',
  teleserviceAlerteNonDeposeActive: false, teleserviceAlerteNonDeposeJours: 7, // = DEFAULT de la migration 159 (D4 : réglages téléservice)
  delaiBasculeJours: 548, dureeMessageJours: 548, // = DEFAULT de la migration 170 (PHASE-1 : délais du verdict à trois phases, ≈ 1,5 an chacun)
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
 * PASTILLES — Lecture BEST-EFFORT de l'HEURE DE RECOMPTAGE quotidien, ISOLÉE (même motif que `lireCapsEnvoi`) : tant que la
 * migration 139 n'est pas passée, la colonne n'existe pas → retombe sur le défaut 8, sans dégrader le reste de la config.
 */
async function lireRecomptageHeure(): Promise<Pick<ConfigVeille, 'recomptageHeureLocale'>> {
  try {
    const { rows } = await query<{ recomptage_heure_locale: number }>(
      `SELECT recomptage_heure_locale FROM config_veille WHERE id = 1`);
    return { recomptageHeureLocale: rows[0]?.recomptage_heure_locale ?? CONFIG_VEILLE_DEFAUT.recomptageHeureLocale };
  } catch {
    return { recomptageHeureLocale: CONFIG_VEILLE_DEFAUT.recomptageHeureLocale }; // 139 pas encore appliquée → défaut
  }
}

/**
 * RELANCE — Lecture BEST-EFFORT de la FENÊTRE HORAIRE d'envoi automatique, ISOLÉE : tant que la migration 140 n'est pas passée,
 * les colonnes n'existent pas → retombe sur les défauts 9/11, sans dégrader le reste de la config.
 */
async function lireFenetreEnvoi(): Promise<Pick<ConfigVeille, 'envoiHeureDebut' | 'envoiHeureFin'>> {
  try {
    const { rows } = await query<{ envoi_heure_debut: number; envoi_heure_fin: number }>(
      `SELECT envoi_heure_debut, envoi_heure_fin FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return { envoiHeureDebut: CONFIG_VEILLE_DEFAUT.envoiHeureDebut, envoiHeureFin: CONFIG_VEILLE_DEFAUT.envoiHeureFin };
    return { envoiHeureDebut: r.envoi_heure_debut, envoiHeureFin: r.envoi_heure_fin };
  } catch {
    return { envoiHeureDebut: CONFIG_VEILLE_DEFAUT.envoiHeureDebut, envoiHeureFin: CONFIG_VEILLE_DEFAUT.envoiHeureFin }; // 140 pas encore appliquée → défauts
  }
}

/**
 * LOT 6 — Lecture BEST-EFFORT du PLAFOND D'ENVOI AUTOMATIQUE, ISOLÉE (même motif de résilience que `lireCapsEnvoi`) : tant que
 * la migration 137 n'est pas passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur le défaut prudent 5,
 * sans dégrader le reste de la config. Après 137 : renvoie la valeur en base (fait foi).
 */
async function lireEnvoiAutoPlafond(): Promise<Pick<ConfigVeille, 'envoisAutoMaxParRun'>> {
  try {
    const { rows } = await query<{ envois_auto_max_par_run: number }>(
      `SELECT envois_auto_max_par_run FROM config_veille WHERE id = 1`);
    return { envoisAutoMaxParRun: rows[0]?.envois_auto_max_par_run ?? CONFIG_VEILLE_DEFAUT.envoisAutoMaxParRun };
  } catch {
    return { envoisAutoMaxParRun: CONFIG_VEILLE_DEFAUT.envoisAutoMaxParRun }; // 137 pas encore appliquée → défaut
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
async function lireMentions(): Promise<Pick<ConfigVeille, 'mentionServiceActive' | 'mentionServiceTexte' | 'mentionDelaiActive' | 'mentionDelaiTexte' | 'mentionSourcesActive' | 'mentionSourcesTexte'>> {
  // S-DWG — le défaut du tiret « sources » est ACTIF + pré-rédigé (opt-out), pour que le repli AVANT la migration 148
  // reproduise EXACTEMENT le défaut SQL (une seule vérité de comportement, migration passée ou non). S40 reste opt-in/vide.
  const def = { mentionServiceActive: false, mentionServiceTexte: '', mentionDelaiActive: false, mentionDelaiTexte: '', mentionSourcesActive: true, mentionSourcesTexte: MENTION_SOURCES_TEXTE_DEFAUT };
  try {
    const { rows } = await query<{ mention_service_active: boolean; mention_service_texte: string; mention_delai_active: boolean; mention_delai_texte: string; mention_sources_active: boolean; mention_sources_texte: string }>(
      `SELECT mention_service_active, mention_service_texte, mention_delai_active, mention_delai_texte, mention_sources_active, mention_sources_texte FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { mentionServiceActive: r.mention_service_active, mentionServiceTexte: r.mention_service_texte, mentionDelaiActive: r.mention_delai_active, mentionDelaiTexte: r.mention_delai_texte, mentionSourcesActive: r.mention_sources_active, mentionSourcesTexte: r.mention_sources_texte };
  } catch { return def; } // 072/148 pas encore appliquées → défauts (sources actif par défaut)
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

/** Lecture BEST-EFFORT du PLAFOND de références de recherche (R3e), ISOLÉE — retombe sur 50 tant que la migration 080 n'est pas passée. */
async function lireRechercheReferences(): Promise<Pick<ConfigVeille, 'rechercheReferencesMax'>> {
  try {
    const { rows } = await query<{ recherche_references_max: number }>(`SELECT recherche_references_max FROM config_veille WHERE id = 1`);
    return { rechercheReferencesMax: rows[0]?.recherche_references_max ?? 50 };
  } catch { return { rechercheReferencesMax: 50 }; } // 080 pas encore appliquée → défaut
}

/**
 * Lecture BEST-EFFORT de la SÉLECTION DES CANDIDATS (V2 : profondeur d'examen + ordre de tri), ISOLÉE — même motif de
 * résilience : tant que la migration 081 n'est pas passée, les colonnes n'existent pas → cette lecture échoue SEULE et
 * retombe sur les défauts (5000, 'surface_puis_date'), SANS dégrader tout le reste de la config (précédent 054 : une lecture
 * dans la requête principale aurait replié SILENCIEUSEMENT toute la veille sur ses défauts).
 */
async function lireSelectionCandidats(): Promise<Pick<ConfigVeille, 'nbCandidatsExamines' | 'triCandidats'>> {
  const def = { nbCandidatsExamines: 5000, triCandidats: 'surface_puis_date' };
  try {
    const { rows } = await query<{ nb_candidats_examines: number; tri_candidats: string }>(
      `SELECT nb_candidats_examines, tri_candidats FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { nbCandidatsExamines: r.nb_candidats_examines, triCandidats: r.tri_candidats };
  } catch { return def; } // 081 pas encore appliquée → défauts
}

/**
 * Q1 — lecture ISOLÉE de `permis_par_commune_par_mois` : tant que la migration 087 n'est pas passée, la colonne n'existe pas →
 * cette lecture échoue SEULE et renvoie `null`, SANS dégrader tout le reste de la config (motif `lireSelectionCandidats`). Le
 * repli (calculé par l'appelant) = `demandes_par_commune_par_mois × dossiers_par_demande` = le débit ACTUEL exact.
 */
async function lirePermisParCommune(): Promise<number | null> {
  try {
    const { rows } = await query<{ permis_par_commune_par_mois: number }>(`SELECT permis_par_commune_par_mois FROM config_veille WHERE id = 1`);
    return rows[0]?.permis_par_commune_par_mois ?? null;
  } catch { return null; } // 087 pas encore appliquée → repli calculé
}

/**
 * Lecture BEST-EFFORT du canal CADA (X1 : e-mail + URL du formulaire), ISOLÉE — même motif de résilience : tant que la
 * migration 083 n'est pas passée, les colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts
 * ('' e-mail, URL du formulaire), SANS dégrader tout le reste de la config (précédent 054).
 */
async function lireCada(): Promise<Pick<ConfigVeille, 'cadaEmail' | 'cadaUrlFormulaire'>> {
  const def = { cadaEmail: '', cadaUrlFormulaire: 'https://www.cada.fr/formulaire-de-saisine' };
  try {
    const { rows } = await query<{ cada_email: string; cada_url_formulaire: string }>(
      `SELECT cada_email, cada_url_formulaire FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { cadaEmail: (r.cada_email ?? '').trim(), cadaUrlFormulaire: r.cada_url_formulaire };
  } catch { return def; } // 083 pas encore appliquée → défauts
}

/**
 * Lecture BEST-EFFORT de la PROPOSITION CADA (X5 : interrupteur), ISOLÉE — même motif de résilience : tant que la migration
 * 084 n'est pas passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur le défaut (désactivée), SANS
 * dégrader tout le reste de la config (précédent 054).
 */
async function lireProposition(): Promise<Pick<ConfigVeille, 'propositionCadaActive'>> {
  try {
    const { rows } = await query<{ proposition_cada_active: boolean }>(`SELECT proposition_cada_active FROM config_veille WHERE id = 1`);
    return { propositionCadaActive: rows[0]?.proposition_cada_active === true };
  } catch {
    return { propositionCadaActive: false }; // 084 pas encore appliquée → désactivée
  }
}

/**
 * Lecture BEST-EFFORT des ADRESSES CONNUES du versement automatique (N1-A), ISOLÉE — tant que la migration 102 n'est pas
 * passée, la colonne n'existe pas → cette lecture échoue SEULE et retombe sur le défaut ('' = aucune), SANS dégrader le reste.
 */
async function lireDepotAdresses(): Promise<Pick<ConfigVeille, 'depotAdressesConnues'>> {
  try {
    const { rows } = await query<{ depot_adresses_connues: string }>(`SELECT depot_adresses_connues FROM config_veille WHERE id = 1`);
    return { depotAdressesConnues: (rows[0]?.depot_adresses_connues ?? '').trim() };
  } catch {
    return { depotAdressesConnues: '' }; // 102 pas encore appliquée → aucune adresse en propre
  }
}

// FUS-4 — motifs d'objet « accusé de réception ». Lecture ISOLÉE (résiliente à l'ordre d'application de la 125) : '' si la
//   colonne n'existe pas encore → aucun motif → nature inchangée (comme avant ce lot).
async function lireNatureAccuseMotifs(): Promise<Pick<ConfigVeille, 'natureAccuseMotifs'>> {
  try {
    const { rows } = await query<{ nature_accuse_motifs: string }>(`SELECT nature_accuse_motifs FROM config_veille WHERE id = 1`);
    return { natureAccuseMotifs: (rows[0]?.nature_accuse_motifs ?? '').trim() };
  } catch {
    return { natureAccuseMotifs: '' };
  }
}

// LOT B — réglages de RELANCE (relance_auto_active + relance_jours_avant_echeance). Lecture ISOLÉE (résiliente à l'ordre
//   d'application de la 128, livrée NON APPLIQUÉE) : tant que les colonnes n'existent pas, cette lecture échoue SEULE et
//   retombe sur les défauts (false, 10), SANS dégrader tout le reste de la config (motif des migrations 069+).
async function lireRelanceReglages(): Promise<Pick<ConfigVeille, 'relanceAutoActive' | 'relanceJoursAvantEcheance'>> {
  const def = { relanceAutoActive: false, relanceJoursAvantEcheance: 10 };
  try {
    const { rows } = await query<{ relance_auto_active: boolean; relance_jours_avant_echeance: number }>(
      `SELECT relance_auto_active, relance_jours_avant_echeance FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { relanceAutoActive: r.relance_auto_active === true, relanceJoursAvantEcheance: r.relance_jours_avant_echeance };
  } catch { return def; } // 128 pas encore appliquée → défauts
}

// Cascade lot 2 — réglages de la CASCADE (3 délais + auto-saisine CADA). Lecture ISOLÉE (résiliente à l'ordre d'application de
//   la 136, livrée NON APPLIQUÉE) : tant que ces colonnes n'existent pas, cette lecture échoue SEULE et retombe sur les défauts
//   (10 / 3 / 4 / false), SANS dégrader le reste de la config (motif lireRelanceReglages / lireCapsEnvoi).
async function lireRelanceCascadeReglages(): Promise<Pick<ConfigVeille, 'relanceRappelJoursAvant' | 'relanceAvisJoursAvant' | 'relanceSaisineDelaiJours' | 'saisineCadaAutoActive'>> {
  const def = { relanceRappelJoursAvant: 10, relanceAvisJoursAvant: 3, relanceSaisineDelaiJours: 4, saisineCadaAutoActive: false };
  try {
    const { rows } = await query<{ relance_rappel_jours_avant: number; relance_avis_jours_avant: number; relance_saisine_delai_jours: number; saisine_cada_auto_active: boolean }>(
      `SELECT relance_rappel_jours_avant, relance_avis_jours_avant, relance_saisine_delai_jours, saisine_cada_auto_active FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return {
      relanceRappelJoursAvant: r.relance_rappel_jours_avant, relanceAvisJoursAvant: r.relance_avis_jours_avant,
      relanceSaisineDelaiJours: r.relance_saisine_delai_jours, saisineCadaAutoActive: r.saisine_cada_auto_active === true,
    };
  } catch { return def; } // 136 pas encore appliquée → défauts
}

// RATT-AUTO — lecture ISOLÉE de l'interrupteur du rejeu automatique du suivi (résiliente à l'ordre d'application de la 154, livrée
//   NON APPLIQUÉE) : tant que la colonne n'existe pas, cette lecture échoue SEULE et retombe sur false (OFF), SANS dégrader le reste.
async function lireRattachementSuiviAuto(): Promise<Pick<ConfigVeille, 'rattachementSuiviAutoActive'>> {
  try {
    const { rows } = await query<{ rattachement_suivi_auto_active: boolean }>(`SELECT rattachement_suivi_auto_active FROM config_veille WHERE id = 1`);
    return { rattachementSuiviAutoActive: rows[0]?.rattachement_suivi_auto_active === true };
  } catch { return { rattachementSuiviAutoActive: false }; } // 154 pas encore appliquée → OFF
}

// ATT-BATI — lecture ISOLÉE de l'interrupteur + du seuil du rappel « en attente de bâti » (résiliente à l'ordre d'application de la
//   155, livrée NON APPLIQUÉE) : tant que les colonnes n'existent pas, cette lecture échoue SEULE et retombe sur (false, 365), OFF.
async function lireAttenteBatiAlerte(): Promise<Pick<ConfigVeille, 'attenteBatiAlerteActive' | 'attenteBatiAlerteJours'>> {
  const def = { attenteBatiAlerteActive: false, attenteBatiAlerteJours: 365 };
  try {
    const { rows } = await query<{ attente_bati_alerte_active: boolean; attente_bati_alerte_jours: number }>(
      `SELECT attente_bati_alerte_active, attente_bati_alerte_jours FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return { attenteBatiAlerteActive: r.attente_bati_alerte_active === true, attenteBatiAlerteJours: r.attente_bati_alerte_jours };
  } catch { return def; } // 155 pas encore appliquée → OFF, seuil défaut
}

// ALERTE obstacle disparu — lecture ISOLÉE de l'interrupteur (résiliente à l'ordre d'application de la 157, livrée NON APPLIQUÉE) :
//   tant que la colonne n'existe pas, cette lecture échoue SEULE et retombe sur false (OFF), SANS dégrader le reste de la config.
async function lireObstacleDisparuAlerte(): Promise<Pick<ConfigVeille, 'obstacleDisparuAlerteActive'>> {
  try {
    const { rows } = await query<{ obstacle_disparu_alerte_active: boolean }>(`SELECT obstacle_disparu_alerte_active FROM config_veille WHERE id = 1`);
    return { obstacleDisparuAlerteActive: rows[0]?.obstacle_disparu_alerte_active === true };
  } catch { return { obstacleDisparuAlerteActive: false }; } // 157 pas encore appliquée → OFF
}

// PHASE-1 — lecture ISOLÉE des deux délais du verdict à trois phases (résiliente à l'ordre d'application de la 170, livrée NON
//   APPLIQUÉE) : tant que les colonnes n'existent pas, cette lecture échoue SEULE et retombe sur (548, 548), sans dégrader le reste.
async function lireDelaisPhasesConfig(): Promise<Pick<ConfigVeille, 'delaiBasculeJours' | 'dureeMessageJours'>> {
  const def = { delaiBasculeJours: CONFIG_VEILLE_DEFAUT.delaiBasculeJours, dureeMessageJours: CONFIG_VEILLE_DEFAUT.dureeMessageJours };
  try {
    const { rows } = await query<{ delai_bascule_jours: number | null; duree_message_jours: number | null }>(
      `SELECT delai_bascule_jours, duree_message_jours FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return {
      delaiBasculeJours: r.delai_bascule_jours ?? def.delaiBasculeJours,
      dureeMessageJours: r.duree_message_jours ?? def.dureeMessageJours,
    };
  } catch { return def; } // 170 pas encore appliquée → défauts
}

/**
 * D4 — Lecture BEST-EFFORT des RÉGLAGES TÉLÉSERVICE, ISOLÉE (même motif de résilience que `lireCapsEnvoi` / `lireEnvoiAutoPlafond`) :
 * tant que la migration 159 n'est pas passée, les colonnes n'existent pas → cette lecture échoue SEULE et retombe sur les défauts
 * (1 dossier/dépôt, alerte OFF, seuil 7 j) SANS dégrader le reste de la config. Après 159 : renvoie les valeurs en base (font foi).
 */
type TeleserviceConfig = Pick<ConfigVeille, 'teleserviceDossiersParDepot' | 'teleservicePermisParCommuneParMois' | 'teleserviceProfilDemandeurDefaut' | 'teleserviceAlerteNonDeposeActive' | 'teleserviceAlerteNonDeposeJours'>;
/**
 * D4-ter (étanche) — chaque valeur de rail téléservice est lue TELLE QUELLE, avec un filet COALESCE sur la valeur COMMUNE :
 * tant que la migration 161 n'est pas appliquée (colonnes téléservice encore NULL, ou `teleservice_profil_demandeur_defaut`
 * ABSENTE), le rail téléservice reprend la valeur commune → comportement STRICTEMENT identique. Deux tentatives : AVEC la colonne
 * profil (post-161), puis SANS elle (pré-161, profil téléservice = profil commun) ; à défaut total, les repli de CONFIG_VEILLE_DEFAUT.
 */
async function lireTeleservice(): Promise<TeleserviceConfig> {
  const def: TeleserviceConfig = {
    teleserviceDossiersParDepot: CONFIG_VEILLE_DEFAUT.teleserviceDossiersParDepot,
    teleservicePermisParCommuneParMois: CONFIG_VEILLE_DEFAUT.teleservicePermisParCommuneParMois,
    teleserviceProfilDemandeurDefaut: CONFIG_VEILLE_DEFAUT.teleserviceProfilDemandeurDefaut,
    teleserviceAlerteNonDeposeActive: CONFIG_VEILLE_DEFAUT.teleserviceAlerteNonDeposeActive,
    teleserviceAlerteNonDeposeJours: CONFIG_VEILLE_DEFAUT.teleserviceAlerteNonDeposeJours,
  };
  try {
    const { rows } = await query<{ teleservice_dossiers_par_depot: number | null; teleservice_permis_par_commune_par_mois: number | null; teleservice_profil_demandeur_defaut: string | null; teleservice_alerte_non_depose_active: boolean; teleservice_alerte_non_depose_jours: number; dossiers_par_demande: number; permis_par_commune_par_mois: number; profil_demandeur_defaut: string }>(
      `SELECT teleservice_dossiers_par_depot, teleservice_permis_par_commune_par_mois, teleservice_profil_demandeur_defaut, teleservice_alerte_non_depose_active, teleservice_alerte_non_depose_jours, dossiers_par_demande, permis_par_commune_par_mois, profil_demandeur_defaut FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return def;
    return {
      teleserviceDossiersParDepot: r.teleservice_dossiers_par_depot ?? r.dossiers_par_demande,
      teleservicePermisParCommuneParMois: r.teleservice_permis_par_commune_par_mois ?? r.permis_par_commune_par_mois,
      teleserviceProfilDemandeurDefaut: r.teleservice_profil_demandeur_defaut ?? r.profil_demandeur_defaut,
      teleserviceAlerteNonDeposeActive: r.teleservice_alerte_non_depose_active === true,
      teleserviceAlerteNonDeposeJours: r.teleservice_alerte_non_depose_jours ?? def.teleserviceAlerteNonDeposeJours,
    };
  } catch {
    // pré-161 : la colonne teleservice_profil_demandeur_defaut n'existe pas encore → on relit SANS elle (profil téléservice = commun).
    try {
      const { rows } = await query<{ teleservice_dossiers_par_depot: number | null; teleservice_permis_par_commune_par_mois: number | null; teleservice_alerte_non_depose_active: boolean; teleservice_alerte_non_depose_jours: number; dossiers_par_demande: number; permis_par_commune_par_mois: number; profil_demandeur_defaut: string }>(
        `SELECT teleservice_dossiers_par_depot, teleservice_permis_par_commune_par_mois, teleservice_alerte_non_depose_active, teleservice_alerte_non_depose_jours, dossiers_par_demande, permis_par_commune_par_mois, profil_demandeur_defaut FROM config_veille WHERE id = 1`);
      const r = rows[0];
      if (!r) return def;
      return {
        teleserviceDossiersParDepot: r.teleservice_dossiers_par_depot ?? r.dossiers_par_demande,
        teleservicePermisParCommuneParMois: r.teleservice_permis_par_commune_par_mois ?? r.permis_par_commune_par_mois,
        teleserviceProfilDemandeurDefaut: r.profil_demandeur_defaut,
        teleserviceAlerteNonDeposeActive: r.teleservice_alerte_non_depose_active === true,
        teleserviceAlerteNonDeposeJours: r.teleservice_alerte_non_depose_jours ?? def.teleserviceAlerteNonDeposeJours,
      };
    } catch { return def; } // 159/160/161 pas appliquées → repli total sur les défauts
  }
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
      demandesParCommuneParMois: r.demandes_par_commune_par_mois, // VESTIGIAL (Q1) : conservé pour l'affichage
      // Q1 — plafond mensuel en PERMIS ; lecture isolée (résiliente à l'ordre d'application de 087), repli = ancien × dossiers.
      permisParCommuneParMois: (await lirePermisParCommune()) ?? (r.demandes_par_commune_par_mois * r.dossiers_par_demande),
      piecesDemandees: r.pieces_demandees,
      ancienneteMaxDemandeAnnees: r.anciennete_max_demande_annees,
      profilDemandeurDefaut: r.profil_demandeur_defaut,
      autoActive: r.auto_active,
      autoIntervalleHeures: r.auto_intervalle_heures,
      csvRetentionJours: r.csv_retention_jours,
      runDemandeLe: r.run_demande_le,
      dilaUrl: await lireDilaUrl(), // S30 : lecture isolée (résiliente à l'ordre d'application de la 069)
      ...(await lireCapsEnvoi()),   // S37 : caps d'envoi, lecture isolée (résiliente à l'ordre d'application de la 070)
      ...(await lireEnvoiAutoPlafond()), // LOT 6 : plafond d'envoi automatique, lecture isolée (résiliente à la 137)
      ...(await lireRecomptageHeure()),  // PASTILLES : heure de recomptage quotidien, lecture isolée (résiliente à la 139)
      ...(await lireFenetreEnvoi()),     // RELANCE : fenêtre horaire d'envoi automatique, lecture isolée (résiliente à la 140)
      adresseReponse: await lireAdresseReponse(), // S38 : lecture isolée (résiliente à l'ordre d'application de la 071)
      ...(await lireMentions()),                   // S40 : mentions de courrier, lecture isolée (résiliente à la 072)
      ...(await lireReleve()),                      // R7 : relève automatique, lecture isolée (résiliente à la 074)
      ...(await lireEcheance()),                     // R6 : échéance/fraîcheur, lecture isolée (résiliente à la 075)
      ...(await lireAlerte()),                        // R8 : alertes e-mail, lecture isolée (résiliente à la 078)
      ...(await lirePieceTaille()),                    // R4 : borne de taille des pièces, lecture isolée (résiliente à la 079)
      ...(await lireRechercheReferences()),            // R3e : plafond de références, lecture isolée (résiliente à la 080)
      ...(await lireSelectionCandidats()),             // V2 : profondeur + ordre de tri des candidats, lecture isolée (résiliente à la 081)
      ...(await lireCada()),                           // X1 : canal CADA (e-mail + formulaire), lecture isolée (résiliente à la 083)
      ...(await lireProposition()),                    // X5 : interrupteur des propositions CADA, lecture isolée (résiliente à la 084)
      ...(await lireDepotAdresses()),                  // N1-A : adresses connues du versement auto, lecture isolée (résiliente à la 102)
      ...(await lireNatureAccuseMotifs()),             // FUS-4 : motifs d'objet « accusé », lecture isolée (résiliente à la 125)
      ...(await lireRelanceReglages()),                // LOT B : réglages de relance, lecture isolée (résiliente à la 128)
      ...(await lireRelanceCascadeReglages()),          // Cascade lot 2 : 3 délais + auto-saisine CADA, lecture isolée (résiliente à la 136)
      ...(await lireRattachementSuiviAuto()),           // RATT-AUTO : interrupteur du rejeu automatique du suivi, lecture isolée (résiliente à la 154)
      ...(await lireAttenteBatiAlerte()),               // ATT-BATI : interrupteur + seuil du rappel « en attente de bâti », lecture isolée (résiliente à la 155)
      ...(await lireObstacleDisparuAlerte()),           // ALERTE obstacle disparu : interrupteur, lecture isolée (résiliente à la 157)
      ...(await lireTeleservice()),                     // D4 : réglages téléservice, lecture isolée (résiliente à la 159)
      ...(await lireDelaisPhasesConfig()),              // PHASE-1 : délais bascule + message, lecture isolée (résiliente à la 170)
    };
  } catch {
    return CONFIG_VEILLE_DEFAUT;
  }
}
