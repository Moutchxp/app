/**
 * Classement des dossiers Sitadel par PRIORITÉ (chantier S3) — logique PURE et testable, et construction des requêtes
 * SQL filtrées de la tuile « Permis de construire ». Seuils et rangs viennent TOUJOURS de `config_veille` (aucune valeur
 * en dur ; réordonnables sans code). La LECTURE seule : ce module n'écrit jamais `sitadel_dossier`.
 *
 * RANG = position d'affichage (le plus petit d'abord). Un dossier peut satisfaire plusieurs catégories ; le PLUS PETIT
 * rang configuré l'emporte (« premier rang satisfait »). Les prédicats et le calcul du rang existent en DEUX formes qui
 * DOIVENT rester synchrones : JS (`classer`) pour l'affichage et les tests, SQL (`expressionRangSql`) pour l'ordre, le
 * filtre catégorie et les compteurs côté serveur (pagination correcte).
 */
import type { ConfigVeille } from './veilleConfig';

/** Champs d'un dossier nécessaires au classement (sous-ensemble de `sitadel_dossier`). */
export interface DossierClassable {
  type: 'PC' | 'PD';
  natureProjetCompletee: string | null;
  iExtension: boolean | null;
  iSurelevation: boolean | null;
  nbLgtTotCrees: number | null;
  surfCreee: number | null;
}

export type CleCategorie = 'immeuble_neuf' | 'surelevation' | 'construction_neuve' | 'extension' | 'demolition' | 'autre';

interface Categorie {
  cle: Exclude<CleCategorie, 'autre'>;
  libelle: string;
  rang: (c: ConfigVeille) => number;
  qualifie: (d: DossierClassable, c: ConfigVeille) => boolean;
}

/**
 * Catégories dans l'ordre CANONIQUE (départage un ex æquo de rang de façon stable). Un immeuble se qualifie par
 * nb_lgt >= seuil OU surf >= seuil (jamais les deux exigés — cf. migration 048). `nb_lgt`/`surf` NULL comptés comme 0.
 */
const CATEGORIES: readonly Categorie[] = [
  {
    cle: 'immeuble_neuf',
    libelle: 'Immeuble neuf',
    rang: (c) => c.rangImmeubleNeuf,
    qualifie: (d, c) =>
      d.natureProjetCompletee === '1' &&
      ((d.nbLgtTotCrees ?? 0) >= c.seuilLogementsImmeuble || (d.surfCreee ?? 0) >= c.seuilSurfaceImmeubleM2),
  },
  { cle: 'surelevation', libelle: 'Surélévation', rang: (c) => c.rangSurelevation, qualifie: (d) => d.iSurelevation === true },
  { cle: 'construction_neuve', libelle: 'Construction neuve', rang: (c) => c.rangConstructionNeuve, qualifie: (d) => d.natureProjetCompletee === '1' },
  {
    cle: 'extension',
    libelle: 'Extension',
    rang: (c) => c.rangExtension,
    qualifie: (d) => d.iExtension === true || d.natureProjetCompletee === '3' || d.natureProjetCompletee === '5',
  },
  { cle: 'demolition', libelle: 'Démolition', rang: (c) => c.rangDemolition, qualifie: (d) => d.type === 'PD' },
];

export interface Classement {
  cle: CleCategorie;
  libelle: string;
  rang: number;
}

// PROJ-2c — un permis CONCERNE la projection d'emprise au sol ssi il CRÉE ou ÉTEND une emprise : construction neuve (dont
// immeuble neuf) OU extension. Les SURÉLÉVATIONS et démolitions sont EXCLUES (elles ne changent pas l'emprise au sol). On
// RÉUTILISE les prédicats `qualifie` existants (pas de nouveau classifieur) ; indépendant du RANG (une extension qui serait
// aussi une surélévation reste concernée — c'est son emprise nouvelle qui compte). PUR.
const CLES_CONCERNE_PROJECTION: readonly CleCategorie[] = ['immeuble_neuf', 'construction_neuve', 'extension'];
export function concerneProjectionEmprise(d: DossierClassable, c: ConfigVeille): boolean {
  return CATEGORIES.some((cat) => CLES_CONCERNE_PROJECTION.includes(cat.cle) && cat.qualifie(d, c));
}

/** Toutes les catégories connues (clé + libellé + rang courant) — pour peupler un filtre et étiqueter les compteurs. */
export function categoriesConnues(c: ConfigVeille): { cle: CleCategorie; libelle: string; rang: number }[] {
  return CATEGORIES.map((cat) => ({ cle: cat.cle, libelle: cat.libelle, rang: cat.rang(c) }));
}

/** Libellé de la catégorie dont le rang configuré vaut `rang` (inverse de `classer`, pour étiqueter un compteur). */
export function libelleParRang(rang: number, c: ConfigVeille): string {
  const cat = CATEGORIES.find((x) => x.rang(c) === rang);
  return cat ? cat.libelle : 'Autre';
}

/**
 * Classe un dossier : plus petit rang configuré parmi les catégories qu'il satisfait (départage : ordre canonique).
 * Aucun match (ne devrait pas arriver pour un dossier retenu à l'ingestion) → `autre`, rang très grand (fin de liste).
 */
export function classer(d: DossierClassable, c: ConfigVeille): Classement {
  const qualifiees = CATEGORIES.filter((cat) => cat.qualifie(d, c));
  if (qualifiees.length === 0) return { cle: 'autre', libelle: 'Autre', rang: 9999 };
  let gagnante = qualifiees[0];
  for (const cat of qualifiees) if (cat.rang(c) < gagnante.rang(c)) gagnante = cat; // < strict → l'ordre canonique tranche l'ex æquo
  return { cle: gagnante.cle, libelle: gagnante.libelle, rang: gagnante.rang(c) };
}

// ── Construction SQL (mêmes prédicats que `classer`) ─────────────────────────

const RANG_AUCUN = 9999;

/** Expression SQL du rang (LEAST des rangs des catégories satisfaites). Colonnes qualifiées `d.` (dossier). Pousse ses paramètres. */
export function expressionRangSql(c: ConfigVeille, params: unknown[]): string {
  const p = (v: number): string => { params.push(v); return `$${params.length}`; };
  const rIm = p(c.rangImmeubleNeuf), rSu = p(c.rangSurelevation), rCn = p(c.rangConstructionNeuve);
  const rEx = p(c.rangExtension), rDe = p(c.rangDemolition);
  const sLog = p(c.seuilLogementsImmeuble), sSurf = p(c.seuilSurfaceImmeubleM2);
  return `LEAST(
    CASE WHEN d.nature_projet_completee = '1' AND (COALESCE(d.nb_lgt_tot_crees,0) >= ${sLog} OR COALESCE(d.surf_creee,0) >= ${sSurf}) THEN ${rIm} ELSE ${RANG_AUCUN} END,
    CASE WHEN d.i_surelevation THEN ${rSu} ELSE ${RANG_AUCUN} END,
    CASE WHEN d.nature_projet_completee = '1' THEN ${rCn} ELSE ${RANG_AUCUN} END,
    CASE WHEN (d.i_extension OR d.nature_projet_completee IN ('3','5')) THEN ${rEx} ELSE ${RANG_AUCUN} END,
    CASE WHEN d.type = 'PD' THEN ${rDe} ELSE ${RANG_AUCUN} END
  )`;
}

// ── D1 : état de RATTACHEMENT d'un dossier (donnée d'AFFICHAGE, jamais un critère de sélection) ────────────────────────
/** Les trois états, libellés validés côté rendu. Valeurs SQL sans accent (sûres en littéral). */
export type EtatRattachement = 'rattache' | 'abandonne' | 'jamais';
export const ETATS_RATTACHEMENT: readonly EtatRattachement[] = ['rattache', 'abandonne', 'jamais'];

/**
 * Expression SQL de l'état de rattachement d'un dossier (`d.id`). Ordre de priorité STRICT porté par le CASE (court-circuit) :
 * une ligne ACTIVE l'emporte (« rattache ») sur une ligne quelconque (« abandonne »), qui l'emporte sur l'absence (« jamais »).
 * Un dossier portant à la fois d'anciennes lignes inactives ET une ligne active tombe donc dans « rattache » (1re branche).
 * AUCUN paramètre (littéraux sûrs). Utilisée POUR L'AFFICHAGE UNIQUEMENT (SELECT / filtre / compteurs), jamais côté candidats.
 */
export function expressionRattachementSql(): string {
  return `CASE ` +
    `WHEN EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.dossier_id = d.id AND dd.actif) THEN 'rattache' ` +
    `WHEN EXISTS (SELECT 1 FROM demande_dossier dd WHERE dd.dossier_id = d.id) THEN 'abandonne' ` +
    `ELSE 'jamais' END`;
}

/**
 * Dossier + référentiel commune + registre mairie (LEFT JOIN : un code sans commune → `commune_nom` NULL (« commune
 * inconnue ») ; une commune sans contact → `dest_email` NULL (« sans destinataire »)).
 */
const FROM_JOIN =
  'sitadel_dossier d ' +
  'LEFT JOIN commune c ON c.code_insee = d.code_insee ' +
  'LEFT JOIN mairie_contact mc ON mc.code_insee = d.code_insee ' +
  // S14d : on ÉTEND (jamais on ne remplace) avec la PRADA — la résolution du destinataire est faite en TS (destinataire.ts).
  'LEFT JOIN mairie_prada mp ON mp.code_insee = d.code_insee ' +
  // S21 : la ligne d'import d'origine de la PRADA, pour connaître l'état de rapprochement (automatique/manuel/…).
  'LEFT JOIN prada_import pi ON pi.id = mp.import_id';

/**
 * Ordre SECONDAIRE de départage (après le rang), PILOTÉ par config (V2 — ex-const ORDRE_SECONDAIRE) :
 *  - 'surface_puis_date' (défaut) : surface (PC = surf_creee, PD = superficie_terrain) DESC, puis date DESC, puis num_dau.
 *    → produit une chaîne BYTE-IDENTIQUE au comportement historique (non-régression).
 *  - 'date_puis_surface' : intervertit les DEUX premiers critères (les plus récents d'abord).
 *  - 'date_ancienne_puis_surface' (Q3) : date d'autorisation CROISSANTE (les plus ANCIENS d'abord), puis surface DESC.
 * `num_dau ASC` reste le départage stable en dernier ; `NULLS LAST` conservé sur surface et date dans TOUS les cas ; toute
 * valeur inconnue retombe sur 'surface_puis_date' (comportement historique).
 */
function ordreSecondaire(c: ConfigVeille): string {
  const surface = `(CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST`;
  const date = `d.date_reelle_autorisation DESC NULLS LAST`;
  if (c.triCandidats === 'date_puis_surface') return `${date}, ${surface}, d.num_dau ASC`;
  // Q3 — « plus anciens d'abord » : date CROISSANTE avant la surface. Même expression de surface, même départage num_dau.
  if (c.triCandidats === 'date_ancienne_puis_surface') return `d.date_reelle_autorisation ASC NULLS LAST, ${surface}, d.num_dau ASC`;
  return `${surface}, ${date}, d.num_dau ASC`; // 'surface_puis_date' (défaut) + valeur inconnue → historique BYTE-IDENTIQUE
}

/** Seuil de similarité trigramme pour la recherche de voie tolérante à la troncature 26 c (pg_trgm). */
const SIMILARITE_VOIE = 0.45;

export interface FiltresPermis {
  departement: string | null;
  communes: string[]; // codes INSEE ACTUELS sélectionnés (multi) ; expansion des anciens codes (fusions) au SQL
  type: 'PC' | 'PD' | null;
  rang: number | null;
  depuis: string | null; // 'AAAA-MM-JJ'
  jusqua: string | null;
  surfaceMin: number | null;
  logementsMin: number | null;
  q: string | null; // recherche libre : numéro de dossier (préfixe) OU libellé de voie (sous-chaîne + trigramme)
  sansDestinataire: boolean; // n'afficher que les dossiers non adressables (aucun e-mail de mairie)
  etatDau: string | null; // filtre par état d'avancement (2/4/5/6) ; null = tous (S12)
  rattachement: EtatRattachement | null; // D1 : n'afficher qu'un état de rattachement ; null = tous. AFFICHAGE seul.
}

/** Filtres neutres (aucune restriction) — base pour « top du classement » (constitution des demandes, S7). */
export const FILTRES_PERMIS_VIDES: FiltresPermis = {
  departement: null, communes: [], type: null, rang: null, depuis: null, jusqua: null,
  surfaceMin: null, logementsMin: null, q: null, sansDestinataire: false, etatDau: null, rattachement: null,
};

const SELECTION =
  `d.id, d.type, d.num_dau, d.code_insee, d.departement, d.date_reelle_autorisation::text AS date_reelle_autorisation, ` +
  `d.nature_projet_completee, d.i_extension, d.i_surelevation, d.nb_lgt_tot_crees, d.surf_creee, d.superficie_terrain, ` +
  `d.adr_num_ter, d.adr_libvoie_ter, d.adr_lieudit_ter, d.adr_localite_ter, d.adr_codpost_ter, ` +
  `d.sec_cadastre1, d.num_cadastre1, d.sec_cadastre2, d.num_cadastre2, d.sec_cadastre3, d.num_cadastre3, ` +
  `d.etat_dau, d.etat_ambigu, d.date_doc::text AS date_doc, d.date_daact::text AS date_daact, ` +
  `(d.vu_le_dernier_millesime = (SELECT max(code) FROM sitadel_millesime)) AS vu_au_dernier, ` +
  `c.nom AS commune_nom, mc.email AS dest_email, mc.statut AS dest_statut, mc.source AS dest_source, ` +
  `mc.canal AS dest_canal, mc.url_formulaire AS dest_url_formulaire, mc.adresse_postale AS dest_adresse_postale, ` +
  // S18 : protocole (téléphone / responsable / date de dernière vérification) pour l'éditeur de contact.
  `mc.telephone AS dest_telephone, mc.responsable_nom AS dest_responsable_nom, mc.protocole_verifie_le::text AS dest_protocole_verifie_le, ` +
  // S19 : standard de la mairie + nature de l'adresse (email_type).
  `mc.telephone_standard AS dest_telephone_standard, mc.email_type AS dest_email_type, mc.protocole_source AS dest_protocole_source, ` +
  // S25 : note de la commune — chargée dans l'éditeur pour être COMPLÉTÉE, jamais écrasée par une saisie vide.
  `mc.note AS dest_note, ` +
  // S14d : bruts PRADA (la précédence est calculée en TS par resoudreDestination, pas en SQL).
  `mp.courriel AS prada_courriel, mp.import_id AS prada_import_id, mp.nom AS prada_nom, mp.prenom AS prada_prenom, ` +
  // S21 : fiche PRADA (lecture seule) — adresse/millésime/statut/origine de l'annuaire + état de rapprochement.
  `mp.adresse_formatee AS prada_adresse, mp.millesime AS prada_millesime, mp.statut AS prada_statut, mp.origine AS prada_origine, pi.rapprochement AS prada_rapprochement`;

/**
 * Clauses WHERE des filtres, poussant leurs paramètres dans `params`. `rangExpr` (déjà construit et paramétré) est requis
 * pour le filtre catégorie ; passer `null` si la requête n'en a pas besoin (aucun paramètre de rang inutile n'est poussé).
 * RECHERCHE : numéro par PRÉFIXE ; voie par SOUS-CHAÎNE (`ILIKE '%q%'`) OU TRIGRAMME (`word_similarity`) → tolère la
 * troncature à 26 c (« ISSY-LES-MOULINEAUX » retrouve « A 49 QUAI D'ISSY-LES-MOUL »). Jamais d'égalité.
 */
function clausesWhere(f: FiltresPermis, params: unknown[], rangExpr: string | null): string {
  const cl: string[] = [];
  const add = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  if (f.departement) cl.push(`d.departement = ${add(f.departement)}`);
  if (f.communes.length > 0) {
    // Multi-sélection de communes ACTUELLES. Inclut aussi les dossiers déposés sous un ANCIEN code fusionné dans une
    // commune sélectionnée (commune_fusion). C'est un WHERE (pas un JOIN) sur `d.code_insee` (unique par ligne) → un
    // dossier ne peut JAMAIS être doublé, même si l'ancien ET le nouveau code sont dans la sélection.
    const arr = add(f.communes);
    cl.push(
      `(d.code_insee = ANY(${arr}::text[]) ` +
      `OR d.code_insee IN (SELECT ancien_code FROM commune_fusion WHERE code_actuel = ANY(${arr}::text[])))`,
    );
  }
  if (f.type) cl.push(`d.type = ${add(f.type)}`);
  if (f.depuis) cl.push(`d.date_reelle_autorisation >= ${add(f.depuis)}`);
  if (f.jusqua) cl.push(`d.date_reelle_autorisation <= ${add(f.jusqua)}`);
  if (f.surfaceMin != null) cl.push(`COALESCE(d.surf_creee,0) >= ${add(f.surfaceMin)}`);
  if (f.logementsMin != null) cl.push(`COALESCE(d.nb_lgt_tot_crees,0) >= ${add(f.logementsMin)}`);
  if (f.q) {
    const q = f.q;
    cl.push(
      `(d.num_dau ILIKE ${add(`${q}%`)} OR d.adr_libvoie_ter ILIKE ${add(`%${q}%`)} ` +
      `OR word_similarity(${add(q)}, d.adr_libvoie_ter) >= ${SIMILARITE_VOIE})`,
    );
  }
  // S15 — « sans destinataire » = AUCUNE adresse e-mail nulle part (ni contact générique, ni PRADA), PRADA-aware (mp joint
  // en S14d). Remplace l'ancien `mc.canal = 'inconnu'` devenu faux (13 des 29 'inconnu' sont joignables par leur PRADA).
  if (f.sansDestinataire) cl.push("coalesce(btrim(mc.email), '') = '' AND coalesce(btrim(mp.courriel), '') = ''");
  if (f.etatDau) cl.push(`d.etat_dau = ${add(f.etatDau)}`); // filtre par état d'avancement (S12)
  // D1 — filtre par état de rattachement (AFFICHAGE seul). Ajouté UNIQUEMENT quand demandé : FILTRES_PERMIS_VIDES.rattachement
  // = null → aucune clause → le chemin CANDIDATS reste byte-identique.
  if (f.rattachement) cl.push(`${expressionRattachementSql()} = ${add(f.rattachement)}`);
  if (f.rang != null && rangExpr) cl.push(`${rangExpr} = ${add(f.rang)}`);
  return cl.length ? `WHERE ${cl.join(' AND ')}` : '';
}

/**
 * Requête LISTE paginée : rang calculé, tri (rang → surface → date → num_dau), LIMIT/OFFSET.
 * D1 — `opts.avecRattachement` (opt-in de l'AFFICHAGE) ajoute l'état de rattachement + la référence/statut de la demande
 * active. Par DÉFAUT (false, chemin CANDIDATS via lireDossiersPriorite) la requête est BYTE-IDENTIQUE à l'historique :
 * aucune colonne, aucune jointure ajoutée → le plan de sélection des dossiers à démarcher n'est jamais modifié.
 */
export function construireRequeteListe(
  f: FiltresPermis, c: ConfigVeille, page: number, taille: number, opts: { avecRattachement?: boolean } = {},
): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = expressionRangSql(c, params);
  const where = clausesWhere(f, params, rangExpr);
  const limite = add(params, taille);
  const decalage = add(params, (page - 1) * taille);
  // Colonnes + jointure LATÉRALE de rattachement, UNIQUEMENT sur demande explicite de l'affichage (sinon chaînes vides →
  // texte byte-identique). La latérale ne renvoie que la demande ACTIVE (index unique partiel → au plus une ligne).
  const selRatt = opts.avecRattachement
    ? `, ${expressionRattachementSql()} AS etat_rattachement, rat.reference AS demande_reference, rat.statut AS demande_statut`
    : '';
  const joinRatt = opts.avecRattachement
    ? ' LEFT JOIN LATERAL (SELECT dm.reference, dm.statut FROM demande_dossier dd JOIN demande dm ON dm.id = dd.demande_id WHERE dd.dossier_id = d.id AND dd.actif LIMIT 1) rat ON true'
    : '';
  const texte =
    `SELECT ${SELECTION}${selRatt}, ${rangExpr} AS rang FROM ${FROM_JOIN}${joinRatt} ${where} ` +
    `ORDER BY ${rangExpr} ASC, ${ordreSecondaire(c)} LIMIT ${limite} OFFSET ${decalage}`;
  return { texte, params };
}

/** Requête TOTAL filtré (mêmes filtres). */
export function construireRequeteTotal(f: FiltresPermis, c: ConfigVeille): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = f.rang != null ? expressionRangSql(c, params) : null; // rang construit UNIQUEMENT s'il sert
  const where = clausesWhere(f, params, rangExpr);
  return { texte: `SELECT count(*)::int AS n FROM ${FROM_JOIN} ${where}`, params };
}

/** Requête COMPTEURS PAR CATÉGORIE : mêmes filtres SAUF la catégorie (on veut tous les rangs). */
export function construireRequeteComptes(f: FiltresPermis, c: ConfigVeille): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = expressionRangSql(c, params);
  const where = clausesWhere({ ...f, rang: null }, params, rangExpr);
  return { texte: `SELECT ${rangExpr} AS rang, count(*)::int AS n FROM ${FROM_JOIN} ${where} GROUP BY rang ORDER BY rang`, params };
}

/**
 * D1 — COMPTEURS PAR ÉTAT DE RATTACHEMENT : mêmes filtres en cours SAUF le rattachement lui-même (on veut toujours les
 * TROIS décomptes). Porte donc sur l'ENSEMBLE des dossiers filtrés, pas sur la page. Modèle : construireRequeteComptes.
 */
export function construireRequeteComptesRattachement(f: FiltresPermis, c: ConfigVeille): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = f.rang != null ? expressionRangSql(c, params) : null; // rang construit UNIQUEMENT s'il filtre
  const where = clausesWhere({ ...f, rattachement: null }, params, rangExpr);
  const expr = expressionRattachementSql();
  return { texte: `SELECT ${expr} AS etat_rattachement, count(*)::int AS n FROM ${FROM_JOIN} ${where} GROUP BY etat_rattachement ORDER BY etat_rattachement`, params };
}

/** Compteurs d'état GLOBAUX (indicateurs de pipeline, indépendants des filtres) : annulés (etat_dau=4) et absents du
 *  dernier millésime (retirés du fichier). Non ré-écrit par les filtres — ce sont des jauges de santé (S12). */
export const REQUETE_COMPTEURS_ETAT =
  `SELECT count(*) FILTER (WHERE etat_dau = '4')::int AS annules, ` +
  `count(*) FILTER (WHERE vu_le_dernier_millesime <> (SELECT max(code) FROM sitadel_millesime))::int AS absents, ` +
  `count(*) FILTER (WHERE etat_ambigu)::int AS ambigus ` +
  `FROM sitadel_dossier`;

export interface CompteursEtat { annules: number; absents: number; ambigus: number }

/**
 * Normalise la ligne (unique) de `REQUETE_COMPTEURS_ETAT` : renvoie TOUJOURS les trois clés, 0 par défaut. Un décompte à
 * zéro est une INFORMATION, pas une absence — la route ne doit jamais omettre une clé, car le rendu la lit sans condition
 * (`.toLocaleString`). Robuste à une ligne absente (base vide) ET à une clé manquante/nulle (forme de réponse plus ancienne).
 */
export function compteursEtatDepuisRow(row: { annules?: number | null; absents?: number | null; ambigus?: number | null } | undefined): CompteursEtat {
  return { annules: row?.annules ?? 0, absents: row?.absents ?? 0, ambigus: row?.ambigus ?? 0 };
}

/** Libellés d'état (source SDES). Valeur inattendue → « état X » ; NULL/vide → « non renseigné » (jamais un tiret muet). */
export const LIBELLE_ETAT_DAU: Record<string, string> = { '2': 'Autorisé', '4': 'Annulé', '5': 'Commencé', '6': 'Terminé' };
export function libelleEtat(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (c === '') return 'non renseigné';
  return LIBELLE_ETAT_DAU[c] ?? `état ${c}`;
}
/** Codes d'état connus (pour peupler un filtre). */
export const ETATS_CONNUS = ['2', '4', '5', '6'] as const;

/**
 * N1-B — libellés de la NATURE DU PROJET (colonne Sitadel `nature_projet_completee`, code numérique brut : « 1 », « 3 »…).
 * Aucune nomenclature SDES complète n'est publiée dans le repo : on ne mappe donc QUE les regroupements documentés dans
 * `docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md` (1 = construction neuve ; 3/5 = extension ou surélévation ; 2/4/6 =
 * transformation à surface constante ou en diminution). Un code hors de cette liste N'EST JAMAIS affiché nu : `libelleNatureProjet`
 * le préfixe explicitement (« nature (code X) ») pour qu'un chiffre seul ne trompe personne. Calqué sur `LIBELLE_ETAT_DAU`.
 */
export const LIBELLE_NATURE_PROJET: Record<string, string> = {
  '1': 'Construction neuve',
  '2': 'Transformation à surface constante ou en diminution',
  '3': 'Extension ou surélévation',
  '4': 'Transformation à surface constante ou en diminution',
  '5': 'Extension ou surélévation',
  '6': 'Transformation à surface constante ou en diminution',
};
export function libelleNatureProjet(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (c === '') return 'non renseigné';
  return LIBELLE_NATURE_PROJET[c] ?? `nature (code ${c})`; // jamais un chiffre nu : préfixe explicite si le code est inconnu
}

function add(params: unknown[], v: unknown): string { params.push(v); return `$${params.length}`; }

// ── Lecture des paramètres d'URL (pur) ───────────────────────────────────────
const DEPARTEMENTS = new Set(['75', '92', '93', '78']);
const entierPositif = (v: string | null): number | null => {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};
const dateIso = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Construit `FiltresPermis` depuis les paramètres d'URL (valeurs invalides ignorées, jamais d'exception). */
export function lireFiltres(sp: URLSearchParams): FiltresPermis {
  const dep = sp.get('departement');
  const type = sp.get('type');
  const rang = entierPositif(sp.get('rang'));
  const q = (sp.get('q') ?? '').trim();
  // `communes` : répété (communes=X&communes=Y) et/ou séparé par virgules ; codes INSEE à 5 chiffres, dédupliqués.
  const communes = [...new Set(
    sp.getAll('communes').flatMap((s) => s.split(',')).map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s)),
  )];
  return {
    departement: dep && DEPARTEMENTS.has(dep) ? dep : null,
    communes,
    type: type === 'PC' || type === 'PD' ? type : null,
    rang: rang,
    depuis: dateIso(sp.get('depuis')),
    jusqua: dateIso(sp.get('jusqua')),
    surfaceMin: entierPositif(sp.get('surfaceMin')),
    logementsMin: entierPositif(sp.get('logementsMin')),
    q: q === '' ? null : q,
    sansDestinataire: sp.get('sansDestinataire') === '1',
    etatDau: ((): string | null => { const e = (sp.get('etat') ?? '').trim(); return (ETATS_CONNUS as readonly string[]).includes(e) ? e : null; })(),
    rattachement: ((): EtatRattachement | null => { const r = (sp.get('rattachement') ?? '').trim(); return (ETATS_RATTACHEMENT as readonly string[]).includes(r) ? (r as EtatRattachement) : null; })(),
  };
}

/** Pagination bornée (page ≥ 1 ; taille 1..100, défaut 25). */
export function lirePagination(sp: URLSearchParams): { page: number; taille: number } {
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const taille = Math.min(100, Math.max(1, Number(sp.get('taille')) || 25));
  return { page, taille };
}

// ── Affichage (pur, sans fuseau) ─────────────────────────────────────────────
/**
 * Jour d'une date de permis, SANS conversion de fuseau. La colonne est un `date` : la requête la renvoie déjà en
 * `AAAA-MM-JJ` (cast `::text`). Par sécurité, si une valeur ISO horodatée arrivait (« 2025-12-10T23:00:00.000Z »), on
 * garde les 10 premiers caractères — JAMAIS `new Date(v)`, qui décalerait d'un jour selon le fuseau du serveur.
 */
export function formaterDateJour(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : v;
}

/** Libellé de commune : « Nom (code) » si le nom est connu, sinon le code seul (dégradation gracieuse — code orphelin). */
export function libelleCommune(nom: string | null | undefined, code: string): string {
  return nom && nom.trim() !== '' ? `${nom} (${code})` : code;
}
