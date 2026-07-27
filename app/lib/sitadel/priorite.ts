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

/**
 * Dossier + référentiel commune + registre mairie (LEFT JOIN : un code sans commune → `commune_nom` NULL (« commune
 * inconnue ») ; une commune sans contact → `dest_email` NULL (« sans destinataire »)).
 */
const FROM_JOIN =
  'sitadel_dossier d ' +
  'LEFT JOIN commune c ON c.code_insee = d.code_insee ' +
  'LEFT JOIN mairie_contact mc ON mc.code_insee = d.code_insee';

/** Ordre secondaire : surface (PC = surf_creee, PD = superficie_terrain) DESC, puis date DESC, puis num_dau (stable). */
const ORDRE_SECONDAIRE =
  `(CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST, ` +
  `d.date_reelle_autorisation DESC NULLS LAST, d.num_dau ASC`;

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
}

const SELECTION =
  `d.id, d.type, d.num_dau, d.code_insee, d.departement, d.date_reelle_autorisation::text AS date_reelle_autorisation, ` +
  `d.nature_projet_completee, d.i_extension, d.i_surelevation, d.nb_lgt_tot_crees, d.surf_creee, d.superficie_terrain, ` +
  `d.adr_num_ter, d.adr_libvoie_ter, d.adr_lieudit_ter, d.adr_localite_ter, d.adr_codpost_ter, ` +
  `d.sec_cadastre1, d.num_cadastre1, d.sec_cadastre2, d.num_cadastre2, d.sec_cadastre3, d.num_cadastre3, ` +
  `c.nom AS commune_nom, mc.email AS dest_email, mc.statut AS dest_statut, ` +
  `mc.canal AS dest_canal, mc.url_formulaire AS dest_url_formulaire, mc.adresse_postale AS dest_adresse_postale`;

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
  if (f.sansDestinataire) cl.push("mc.canal = 'inconnu'"); // non adressable = canal inconnu (S5b) — PAS les orphelins
  if (f.rang != null && rangExpr) cl.push(`${rangExpr} = ${add(f.rang)}`);
  return cl.length ? `WHERE ${cl.join(' AND ')}` : '';
}

/** Requête LISTE paginée : rang calculé, tri (rang → surface → date → num_dau), LIMIT/OFFSET. */
export function construireRequeteListe(
  f: FiltresPermis, c: ConfigVeille, page: number, taille: number,
): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = expressionRangSql(c, params);
  const where = clausesWhere(f, params, rangExpr);
  const limite = add(params, taille);
  const decalage = add(params, (page - 1) * taille);
  const texte =
    `SELECT ${SELECTION}, ${rangExpr} AS rang FROM ${FROM_JOIN} ${where} ` +
    `ORDER BY ${rangExpr} ASC, ${ORDRE_SECONDAIRE} LIMIT ${limite} OFFSET ${decalage}`;
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
