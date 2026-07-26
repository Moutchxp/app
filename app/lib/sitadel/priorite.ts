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

/** Expression SQL du rang (LEAST des rangs des catégories satisfaites). Pousse ses paramètres dans `params`. */
export function expressionRangSql(c: ConfigVeille, params: unknown[]): string {
  const p = (v: number): string => { params.push(v); return `$${params.length}`; };
  const rIm = p(c.rangImmeubleNeuf), rSu = p(c.rangSurelevation), rCn = p(c.rangConstructionNeuve);
  const rEx = p(c.rangExtension), rDe = p(c.rangDemolition);
  const sLog = p(c.seuilLogementsImmeuble), sSurf = p(c.seuilSurfaceImmeubleM2);
  return `LEAST(
    CASE WHEN nature_projet_completee = '1' AND (COALESCE(nb_lgt_tot_crees,0) >= ${sLog} OR COALESCE(surf_creee,0) >= ${sSurf}) THEN ${rIm} ELSE ${RANG_AUCUN} END,
    CASE WHEN i_surelevation THEN ${rSu} ELSE ${RANG_AUCUN} END,
    CASE WHEN nature_projet_completee = '1' THEN ${rCn} ELSE ${RANG_AUCUN} END,
    CASE WHEN (i_extension OR nature_projet_completee IN ('3','5')) THEN ${rEx} ELSE ${RANG_AUCUN} END,
    CASE WHEN type = 'PD' THEN ${rDe} ELSE ${RANG_AUCUN} END
  )`;
}

/** Ordre secondaire : surface (PC = surf_creee, PD = superficie_terrain) DESC, puis date DESC, puis num_dau (stable). */
const ORDRE_SECONDAIRE =
  `(CASE WHEN type = 'PD' THEN superficie_terrain ELSE surf_creee END) DESC NULLS LAST, ` +
  `date_reelle_autorisation DESC NULLS LAST, num_dau ASC`;

/** Seuil de similarité trigramme pour la recherche de voie tolérante à la troncature 26 c (pg_trgm). */
const SIMILARITE_VOIE = 0.45;

export interface FiltresPermis {
  departement: string | null;
  commune: string | null;
  type: 'PC' | 'PD' | null;
  rang: number | null;
  depuis: string | null; // 'AAAA-MM-JJ'
  jusqua: string | null;
  surfaceMin: number | null;
  logementsMin: number | null;
  q: string | null; // recherche libre : numéro de dossier (préfixe) OU libellé de voie (sous-chaîne + trigramme)
}

const SELECTION =
  `id, type, num_dau, code_insee, departement, date_reelle_autorisation, nature_projet_completee, i_extension, ` +
  `i_surelevation, nb_lgt_tot_crees, surf_creee, superficie_terrain, adr_num_ter, adr_libvoie_ter, adr_lieudit_ter, ` +
  `adr_localite_ter, adr_codpost_ter, sec_cadastre1, num_cadastre1, sec_cadastre2, num_cadastre2, sec_cadastre3, num_cadastre3`;

/**
 * Clauses WHERE des filtres, poussant leurs paramètres dans `params`. `rangExpr` (déjà construit et paramétré) est requis
 * pour le filtre catégorie ; passer `null` si la requête n'en a pas besoin (aucun paramètre de rang inutile n'est poussé).
 * RECHERCHE : numéro par PRÉFIXE ; voie par SOUS-CHAÎNE (`ILIKE '%q%'`) OU TRIGRAMME (`word_similarity`) → tolère la
 * troncature à 26 c (« ISSY-LES-MOULINEAUX » retrouve « A 49 QUAI D'ISSY-LES-MOUL »). Jamais d'égalité.
 */
function clausesWhere(f: FiltresPermis, params: unknown[], rangExpr: string | null): string {
  const cl: string[] = [];
  const add = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  if (f.departement) cl.push(`departement = ${add(f.departement)}`);
  if (f.commune) cl.push(`code_insee = ${add(f.commune)}`);
  if (f.type) cl.push(`type = ${add(f.type)}`);
  if (f.depuis) cl.push(`date_reelle_autorisation >= ${add(f.depuis)}`);
  if (f.jusqua) cl.push(`date_reelle_autorisation <= ${add(f.jusqua)}`);
  if (f.surfaceMin != null) cl.push(`COALESCE(surf_creee,0) >= ${add(f.surfaceMin)}`);
  if (f.logementsMin != null) cl.push(`COALESCE(nb_lgt_tot_crees,0) >= ${add(f.logementsMin)}`);
  if (f.q) {
    const q = f.q;
    cl.push(
      `(num_dau ILIKE ${add(`${q}%`)} OR adr_libvoie_ter ILIKE ${add(`%${q}%`)} ` +
      `OR word_similarity(${add(q)}, adr_libvoie_ter) >= ${SIMILARITE_VOIE})`,
    );
  }
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
    `SELECT ${SELECTION}, ${rangExpr} AS rang FROM sitadel_dossier ${where} ` +
    `ORDER BY ${rangExpr} ASC, ${ORDRE_SECONDAIRE} LIMIT ${limite} OFFSET ${decalage}`;
  return { texte, params };
}

/** Requête TOTAL filtré (mêmes filtres). */
export function construireRequeteTotal(f: FiltresPermis, c: ConfigVeille): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = f.rang != null ? expressionRangSql(c, params) : null; // rang construit UNIQUEMENT s'il sert
  const where = clausesWhere(f, params, rangExpr);
  return { texte: `SELECT count(*)::int AS n FROM sitadel_dossier ${where}`, params };
}

/** Requête COMPTEURS PAR CATÉGORIE : mêmes filtres SAUF la catégorie (on veut tous les rangs). */
export function construireRequeteComptes(f: FiltresPermis, c: ConfigVeille): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const rangExpr = expressionRangSql(c, params);
  const where = clausesWhere({ ...f, rang: null }, params, rangExpr);
  return { texte: `SELECT ${rangExpr} AS rang, count(*)::int AS n FROM sitadel_dossier ${where} GROUP BY rang ORDER BY rang`, params };
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
  return {
    departement: dep && DEPARTEMENTS.has(dep) ? dep : null,
    commune: (sp.get('commune') ?? '').trim() || null,
    type: type === 'PC' || type === 'PD' ? type : null,
    rang: rang,
    depuis: dateIso(sp.get('depuis')),
    jusqua: dateIso(sp.get('jusqua')),
    surfaceMin: entierPositif(sp.get('surfaceMin')),
    logementsMin: entierPositif(sp.get('logementsMin')),
    q: q === '' ? null : q,
  };
}

/** Pagination bornée (page ≥ 1 ; taille 1..100, défaut 25). */
export function lirePagination(sp: URLSearchParams): { page: number; taille: number } {
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const taille = Math.min(100, Math.max(1, Number(sp.get('taille')) || 25));
  return { page, taille };
}
