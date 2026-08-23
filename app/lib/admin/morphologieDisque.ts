/**
 * FRAÎCHEUR / F4 « Morphologie » — répartition PURE de l'espace disque par SOURCE de données (aucune I/O).
 *
 * Reçoit la taille de chaque table `public` (mesurée par le repo via pg_total/relation/indexes_size) + `pg_database_size`,
 * et range chaque table dans un POSTE selon une cartographie EXHAUSTIVE et COMMENTÉE. Règle d'or : le total des postes est
 * EXACTEMENT `pg_database_size` — toute table non cartographiée tombe dans « Non rattaché » (affiché), et l'écart entre la
 * somme des tables `public` et la taille de la base (catalogues système non-`public`) est absorbé par le poste « Système ».
 * Aucun écart silencieux : une mesure qui ment est pire qu'absente.
 *
 * FRONTIÈRE source/app (arbitrée par le porteur) : en « source » UNIQUEMENT les tables BRUTES ingérées (`*_import`,
 * `*_millesime`, `parcelle`, `adresse_ban`, rasters…) ; en « SVAV » les tables de TRAVAIL dérivées ou éditables (dont
 * `mairie_contact`/`mairie_prada` et leurs journaux — elles portent les corrections manuelles, qu'une réingestion ne doit
 * jamais laisser croire écrasées).
 */

/** Taille d'une table (octets) telle que mesurée par le repo. `lignes` = reltuples (estimation), < 0 si jamais analysée. */
export interface LigneTable {
  table: string;
  total: number;
  donnees: number;
  index: number;
  lignes: number;
}

/** Un sous-groupe d'un poste (ex. « Édition courante » vs « Copies et staging » pour le bâti). */
interface SousGroupe {
  nom: string;
  tables: readonly string[];
}

/** Définition d'un poste de la cartographie. `residuel` = poste qui absorbe l'écart base/somme-public (Système). */
interface DefPoste {
  cle: string;
  nom: string;
  /** Tables directement rattachées (postes simples). */
  tables?: readonly string[];
  /** Sous-groupes affichés séparément (BD TOPO bâtiment : vive vs copies). */
  sousGroupes?: readonly SousGroupe[];
  /** Poste « Système » : reçoit en plus le résiduel (pg_database_size − Σ tables public). */
  residuel?: boolean;
}

/**
 * CARTOGRAPHIE source → tables. EXHAUSTIVE : toute table `public` NON listée ici tombe dans « Non rattaché » (jamais masquée).
 * Ordre de déclaration sans importance (l'affichage trie par poids). Aucune table ne doit apparaître dans deux postes.
 */
export const CARTOGRAPHIE_TABLES: readonly DefPoste[] = [
  {
    cle: 'bdtopo_bati',
    nom: 'BD TOPO bâtiment',
    // Deux sous-lignes pour distinguer la donnée VIVE des COPIES (disque local limité) — AFFICHAGE seul, aucune suppression.
    sousGroupes: [
      { nom: 'Édition courante', tables: ['batiment', 'bdtopo_edition', 'import_log'] },
      { nom: 'Copies et staging', tables: ['batiment_2026_03_15', 'batiment_edition_fige', 'bdtopo_next_batiment', 'stg_etat_juin'] },
    ],
  },
  { cle: 'bdtopo_adresse', nom: 'BD TOPO adresse / BAN', tables: ['adresse_ban'] },
  // Thèmes BD TOPO du score paysage (végétation + hydrographie) : poste DISTINCT du bâtiment (réingestion par un geste différent).
  { cle: 'bdtopo_paysage', nom: 'BD TOPO paysage', tables: ['bdtopo_vegetation', 'bdtopo_eau_surface', 'bdtopo_eau_plan'] },
  { cle: 'lidar', nom: 'LiDAR', tables: ['mnt_lidar_brut', 'mns_lidar_brut', 'mns_bati_propre', 'rge_alti'] },
  { cle: 'cadastre', nom: 'Cadastre', tables: ['parcelle', 'cadastre_millesime'] },
  { cle: 'bdnb', nom: 'BDNB', tables: ['bdnb_annee_batiment'] },
  { cle: 'sitadel', nom: 'Sitadel', tables: ['sitadel_dossier', 'sitadel_millesime'] },
  { cle: 'dila', nom: 'DILA', tables: ['dila_import', 'dila_millesime'] },
  { cle: 'prada', nom: 'PRADA', tables: ['prada_import', 'prada_millesime'] },
  {
    cle: 'patrimoine',
    nom: 'Patrimoine / monuments',
    tables: [
      'monuments_historiques', 'monuments_emblematiques', 'monument_emblematique_batiment',
      'patrimoine_entite', 'patrimoine_entite_batiment', 'inventaire_general', 'curation_patrimoine_log', 'parcs_jardins_92',
    ],
  },
  {
    cle: 'svav',
    nom: 'Données applicatives SVAV',
    // Tout ce que l'app PRODUIT : certificats, internautes, demandes/veille, permis, config, admin, analytics, communes,
    // + les tables de travail dérivées de DILA/PRADA (mairie_contact/mairie_prada et journaux) — cf. frontière source/app.
    tables: [
      'certificat', 'certificat_acheminement', 'certificat_compteur',
      'internaute', 'internaute_auth', 'internaute_projet', 'internaute_consentement', 'internaute_consentement_texte',
      'internaute_cycle_vie_log', 'internaute_extraction_log', 'internaute_finalite', 'internaute_login_echec',
      'internaute_reset_mot_de_passe', 'internaute_retention',
      'demande', 'demande_reponse', 'demande_dossier', 'demande_journal', 'demande_relance', 'demande_acheminement',
      'demande_reference_externe', 'demande_reponse_lien', 'demande_reponse_piece', 'demande_compteur', 'demande_depot_presume',
      'dossier_document', 'depot_manuel_journal', 'saisine_champ_copie', 'proposition_cada',
      'alerte_permis', 'alerte_ged', 'alerte_run', 'releve_run', 'veille_run',
      'permis_extraction_journal', 'permis_bati_snapshot', 'permis_bati_capture', 'permis_parcelle', 'permis_corps_batiment',
      'permis_empreinte', 'permis_caracteristique', 'permis_altitude_journal', 'permis_rattachement',
      'permis_rattachement_evenement', 'permis_polygone_altitude',
      'mairie_contact', 'mairie_contact_journal', 'mairie_prada', 'mairie_prada_journal',
      'config_veille', 'config_scoring', 'config_demandeur', 'config_famille_annee', 'config_edit_log',
      'admin_utilisateur', 'admin_utilisateur_log', 'collaborateur', 'login_echec', 'source_detection',
      'analytics_compteur_jour', 'analytics_admin_jour', 'analytics_config', 'analytics_catalogue_evenement',
      'analytics_maintenance_config', 'analytics_retention', 'analytics_session', 'analytics_session_2026_07',
      'analytics_session_2026_08', 'analytics_session_2026_09', 'analytics_session_default',
      'commune', 'commune_fusion', 'commune_perimetre',
    ],
  },
  // Système PostGIS (spatial_ref_sys = table des EPSG) + résiduel des schémas NON-public (pg_catalog, information_schema…).
  { cle: 'systeme', nom: 'Système PostgreSQL / PostGIS', tables: ['spatial_ref_sys'], residuel: true },
] as const;

/** Clé du poste fourre-tout des tables non cartographiées (toujours affiché même vide-de-motif : ici deno_affichage). */
export const CLE_NON_RATTACHE = 'non_rattache';

/** Un poste calculé, prêt à afficher. */
export interface PosteMorphologie {
  cle: string;
  nom: string;
  total: number;
  donnees: number;
  index: number;
  lignes: number;
  /** Part du total base, en pourcentage (0..100). */
  pct: number;
  /** Tables du poste (pour transparence / audit). */
  tables: string[];
  /** Sous-lignes affichées séparément (bâti : vive vs copies), si le poste en définit. */
  sousLignes?: { nom: string; total: number; donnees: number; index: number; lignes: number }[];
  /** Octets résiduels (catalogues non-public) inclus dans `total` — poste Système uniquement. */
  residuel?: number;
}

/** Résultat complet, ou sentinelle d'indisponibilité (JAMAIS des zéros : `indisponible` distingue « 0 octet » de « échec »). */
export interface MorphologieDisque {
  indisponible: boolean;
  postes: PosteMorphologie[];
  totalBase: number | null;
  /** true si Σ postes.total === totalBase (contrôle anti-écart-silencieux). */
  reconcilie: boolean;
}

/** Sentinelle : la mesure a échoué. On l'affiche telle quelle, jamais comme une base vide. */
export const MORPHOLOGIE_INDISPONIBLE: MorphologieDisque = { indisponible: true, postes: [], totalBase: null, reconcilie: false };

const pos = (n: number): number => (n > 0 ? n : 0); // reltuples < 0 (jamais analysée) → 0, jamais un compte négatif

/** Index table → (poste, sous-groupe) construit une fois depuis la cartographie ; détecte un double rattachement (bug). */
function indexerTables(): Map<string, { cle: string; sousGroupe: string | null }> {
  const idx = new Map<string, { cle: string; sousGroupe: string | null }>();
  for (const def of CARTOGRAPHIE_TABLES) {
    for (const t of def.tables ?? []) {
      if (idx.has(t)) throw new Error(`Table « ${t} » rattachée à deux postes (${idx.get(t)!.cle} et ${def.cle})`);
      idx.set(t, { cle: def.cle, sousGroupe: null });
    }
    for (const sg of def.sousGroupes ?? []) {
      for (const t of sg.tables) {
        if (idx.has(t)) throw new Error(`Table « ${t} » rattachée à deux postes (${idx.get(t)!.cle} et ${def.cle})`);
        idx.set(t, { cle: def.cle, sousGroupe: sg.nom });
      }
    }
  }
  return idx;
}

/**
 * Construit la morphologie : chaque table `public` va dans son poste (ou « Non rattaché »), le poste Système reçoit le
 * résiduel (base − Σ public), les pourcentages sont calculés, et les postes sont triés par poids décroissant. PUR.
 * Réconciliation garantie : Σ postes.total === dbTotal.
 */
export function construireMorphologie(tables: LigneTable[], dbTotal: number): MorphologieDisque {
  const idx = indexerTables();
  const acc = new Map<string, PosteMorphologie>();
  const sousAcc = new Map<string, Map<string, { nom: string; total: number; donnees: number; index: number; lignes: number }>>();

  const poste = (cle: string, nom: string): PosteMorphologie => {
    let p = acc.get(cle);
    if (!p) { p = { cle, nom, total: 0, donnees: 0, index: 0, lignes: 0, pct: 0, tables: [] }; acc.set(cle, p); }
    return p;
  };
  const nomPoste = (cle: string): string => CARTOGRAPHIE_TABLES.find((d) => d.cle === cle)?.nom ?? cle;

  let sommePublic = 0;
  for (const t of tables) {
    sommePublic += t.total;
    const cible = idx.get(t.table);
    const cle = cible?.cle ?? CLE_NON_RATTACHE;
    const p = poste(cle, cle === CLE_NON_RATTACHE ? 'Non rattaché' : nomPoste(cle));
    p.total += t.total; p.donnees += t.donnees; p.index += t.index; p.lignes += pos(t.lignes); p.tables.push(t.table);
    if (cible?.sousGroupe) {
      if (!sousAcc.has(cle)) sousAcc.set(cle, new Map());
      const m = sousAcc.get(cle)!;
      const s = m.get(cible.sousGroupe) ?? { nom: cible.sousGroupe, total: 0, donnees: 0, index: 0, lignes: 0 };
      s.total += t.total; s.donnees += t.donnees; s.index += t.index; s.lignes += pos(t.lignes);
      m.set(cible.sousGroupe, s);
    }
  }

  // Résiduel des schémas non-public → poste Système, pour que Σ postes === pg_database_size À L'OCTET PRÈS.
  const residuel = pos(dbTotal - sommePublic);
  const sys = poste('systeme', nomPoste('systeme'));
  sys.total += residuel;
  sys.residuel = residuel;

  // Sous-lignes ordonnées comme dans la cartographie (Édition courante avant Copies et staging).
  for (const [cle, m] of sousAcc) {
    const def = CARTOGRAPHIE_TABLES.find((d) => d.cle === cle);
    const ordre = def?.sousGroupes?.map((sg) => sg.nom) ?? [...m.keys()];
    acc.get(cle)!.sousLignes = ordre.map((n) => m.get(n)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  }

  const postes = [...acc.values()];
  for (const p of postes) p.pct = dbTotal > 0 ? (p.total / dbTotal) * 100 : 0;
  postes.sort((a, b) => b.total - a.total);

  const sommePostes = postes.reduce((s, p) => s + p.total, 0);
  return { indisponible: false, postes, totalBase: dbTotal, reconcilie: sommePostes === dbTotal };
}

/** Formate des octets en o/Ko/Mo/Go (base 1024), 2 décimales sous 10, 1 sous 100, 0 au-delà. */
export function formaterOctets(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} o`;
  const unites = ['Ko', 'Mo', 'Go', 'To'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i += 1; }
  const dec = v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(dec)} ${unites[i]}`;
}

/** Formate un pourcentage (1 décimale). */
export function formaterPct(pct: number): string {
  return `${pct.toFixed(1)} %`;
}
