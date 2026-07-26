/**
 * Logique PURE d'ingestion Sitadel (chantier S2) : filtres volumétriques, dédoublonnage PC logements×locaux, mapping
 * ligne → dossier, et UPSERT idempotent. Aucune I/O réseau ni fichier ici (le CLI `app/scripts/sitadel-ingest.ts`
 * orchestre téléchargement + flux) → entièrement testable sur des lignes fabriquées.
 *
 * INVARIANT DE CE CHANTIER : les champs d'adresse et de cadastre sont conservés BRUTS (libellé tronqué à 26 c, numéro à
 * suffixe). Aucune reconstitution, aucune séparation de suffixe : la normalisation est réversible et appartient à S3.
 */

/** Une ligne CSV Sitadel décodée (clés = en-têtes du fichier). */
export type LigneBrute = Record<string, string>;

/** Un dossier prêt pour l'UPSERT. Champs BRUTS ; `type` distingue PC (permis de construire) et PD (permis de démolir). */
export interface Dossier {
  type: 'PC' | 'PD';
  numDau: string;
  codeInsee: string;
  departement: string;
  etat: string | null;
  dateReelleAutorisation: string | null; // 'AAAA-MM-JJ' ou null
  natureProjetCompletee: string | null;
  iExtension: boolean | null;
  iSurelevation: boolean | null;
  nbLgtTotCrees: number | null;
  surfCreee: number | null;
  adrNumTer: string | null;
  adrLibvoieTer: string | null;
  adrLieuditTer: string | null;
  adrLocaliteTer: string | null;
  adrCodpostTer: string | null;
  secCadastre1: string | null;
  numCadastre1: string | null;
  secCadastre2: string | null;
  numCadastre2: string | null;
  secCadastre3: string | null;
  numCadastre3: string | null;
  superficieTerrain: number | null;
  denomDem: string | null;
  sirenDem: string | null;
  siretDem: string | null;
}

// ── Helpers de lecture BRUTE ─────────────────────────────────────────────────
const brut = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};
const estVrai = (v: string | undefined): boolean => (v ?? '').trim().toLowerCase() === 'true';
const entier = (v: string | undefined): number | null => {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const reel = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ── Périmètre (filtre au DÉPARTEMENT, cf. migration 047) ─────────────────────
/** Un dossier est dans le périmètre si son département fait partie de l'ensemble actif. */
export function dansPerimetre(departement: string, departementsActifs: ReadonlySet<string>): boolean {
  return departementsActifs.has(departement);
}

// ── Filtres volumétriques ────────────────────────────────────────────────────
/**
 * PC retenu = autorisé (ETAT_DAU=2) ET construction/agrandissement : NATURE_PROJET_COMPLETEE ∈ {1,3,5}
 * OU I_EXTENSION OU I_SURELEVATION. Écarte les transformations à surface constante/en baisse (NATURE 2/4/6 sans
 * indicateur d'extension). L'ordre du OU garantit qu'une surélévation/extension déclarée passe même si NATURE=2.
 */
export function pcRetenu(r: LigneBrute): boolean {
  if ((r.ETAT_DAU ?? '').trim() !== '2') return false;
  const nat = (r.NATURE_PROJET_COMPLETEE ?? '').trim();
  return nat === '1' || nat === '3' || nat === '5' || estVrai(r.I_EXTENSION) || estVrai(r.I_SURELEVATION);
}

/** PD retenu = autorisé (ETAT_PD=2). Pas de filtre de nature (le PD n'en porte pas). */
export function pdRetenu(r: LigneBrute): boolean {
  return (r.ETAT_PD ?? '').trim() === '2';
}

// ── Mapping ligne → dossier ──────────────────────────────────────────────────
/** Somme des surfaces créées (habitation + locaux) d'une ligne, ou null si les deux sont absentes. */
function surfCreee(r: LigneBrute): number | null {
  const hab = reel(r.SURF_HAB_CREEE);
  const loc = reel(r.SURF_LOC_CREEE);
  if (hab === null && loc === null) return null;
  return (hab ?? 0) + (loc ?? 0);
}

/** Construit un dossier PC à partir d'une ligne (logements OU locaux). */
export function mapLignePC(r: LigneBrute): Dossier {
  return {
    type: 'PC',
    numDau: (r.NUM_DAU ?? '').trim(),
    codeInsee: (r.COMM ?? '').trim(),
    departement: (r.DEP_CODE ?? '').trim(),
    etat: brut(r.ETAT_DAU),
    dateReelleAutorisation: brut(r.DATE_REELLE_AUTORISATION),
    natureProjetCompletee: brut(r.NATURE_PROJET_COMPLETEE),
    iExtension: estVrai(r.I_EXTENSION),
    iSurelevation: estVrai(r.I_SURELEVATION),
    nbLgtTotCrees: entier(r.NB_LGT_TOT_CREES), // présent seulement côté logements
    surfCreee: surfCreee(r),
    adrNumTer: brut(r.ADR_NUM_TER),
    adrLibvoieTer: brut(r.ADR_LIBVOIE_TER),
    adrLieuditTer: brut(r.ADR_LIEUDIT_TER),
    adrLocaliteTer: brut(r.ADR_LOCALITE_TER),
    adrCodpostTer: brut(r.ADR_CODPOST_TER),
    secCadastre1: brut(r.SEC_CADASTRE1),
    numCadastre1: brut(r.NUM_CADASTRE1),
    secCadastre2: brut(r.SEC_CADASTRE2),
    numCadastre2: brut(r.NUM_CADASTRE2),
    secCadastre3: brut(r.SEC_CADASTRE3),
    numCadastre3: brut(r.NUM_CADASTRE3),
    superficieTerrain: entier(r.SUPERFICIE_TERRAIN),
    denomDem: brut(r.DENOM_DEM),
    sirenDem: brut(r.SIREN_DEM),
    siretDem: brut(r.SIRET_DEM),
  };
}

/** Construit un dossier PD à partir d'une ligne du fichier permis de démolir. */
export function mapLignePD(r: LigneBrute): Dossier {
  return {
    type: 'PD',
    numDau: (r.NUM_PD ?? '').trim(),
    codeInsee: (r.COMM ?? '').trim(),
    departement: (r.DEP_CODE ?? '').trim(),
    etat: brut(r.ETAT_PD),
    dateReelleAutorisation: brut(r.DATE_REELLE_AUTORISATION),
    natureProjetCompletee: null,
    iExtension: null,
    iSurelevation: null,
    nbLgtTotCrees: null,
    surfCreee: null,
    adrNumTer: brut(r.ADR_NUM_TER),
    adrLibvoieTer: brut(r.ADR_LIBVOIE_TER),
    adrLieuditTer: brut(r.ADR_LIEUDIT_TER),
    adrLocaliteTer: brut(r.ADR_LOCALITE_TER),
    adrCodpostTer: brut(r.ADR_CODPOST_TER),
    secCadastre1: brut(r.SEC_CADASTRE1),
    numCadastre1: brut(r.NUM_CADASTRE1),
    secCadastre2: brut(r.SEC_CADASTRE2),
    numCadastre2: brut(r.NUM_CADASTRE2),
    secCadastre3: brut(r.SEC_CADASTRE3),
    numCadastre3: brut(r.NUM_CADASTRE3),
    superficieTerrain: entier(r.SUPERFICIE_TERRAIN),
    denomDem: brut(r.DENOM_DEM),
    sirenDem: brut(r.SIREN_DEM),
    siretDem: brut(r.SIRET_DEM),
  };
}

/**
 * FUSION de deux lignes d'un MÊME permis PC (le permis mixte logements+locaux figure dans les deux fichiers).
 * RÈGLE, quand les deux divergent sur un champ :
 *   - champs texte / booléens (nature, état, adresse, cadastre, dates, indicateurs) → on garde la valeur DÉJÀ POSÉE
 *     (première non nulle rencontrée). L'ingestion traite le fichier LOGEMENTS d'abord : il fait donc FOI par défaut,
 *     les locaux ne comblent que ce qui manque. Choix documenté : les deux fichiers décrivent le même permis, une
 *     divergence réelle est rare et non arbitrable côté données ; on ne fabrique rien.
 *   - `surfCreee` et `nbLgtTotCrees` → MAX des deux (surfaces identiques entre fichiers → max = la valeur ; nb_lgt
 *     n'existe que côté logements → max le préserve).
 */
export function fusionnerPC(a: Dossier, b: Dossier): Dossier {
  const garder = <T>(x: T | null, y: T | null): T | null => (x !== null && x !== undefined ? x : y);
  const maxN = (x: number | null, y: number | null): number | null =>
    x === null ? y : y === null ? x : Math.max(x, y);
  return {
    type: 'PC',
    numDau: a.numDau,
    codeInsee: a.codeInsee || b.codeInsee,
    departement: a.departement || b.departement,
    etat: garder(a.etat, b.etat),
    dateReelleAutorisation: garder(a.dateReelleAutorisation, b.dateReelleAutorisation),
    natureProjetCompletee: garder(a.natureProjetCompletee, b.natureProjetCompletee),
    iExtension: a.iExtension || b.iExtension || false,
    iSurelevation: a.iSurelevation || b.iSurelevation || false,
    nbLgtTotCrees: maxN(a.nbLgtTotCrees, b.nbLgtTotCrees),
    surfCreee: maxN(a.surfCreee, b.surfCreee),
    adrNumTer: garder(a.adrNumTer, b.adrNumTer),
    adrLibvoieTer: garder(a.adrLibvoieTer, b.adrLibvoieTer),
    adrLieuditTer: garder(a.adrLieuditTer, b.adrLieuditTer),
    adrLocaliteTer: garder(a.adrLocaliteTer, b.adrLocaliteTer),
    adrCodpostTer: garder(a.adrCodpostTer, b.adrCodpostTer),
    secCadastre1: garder(a.secCadastre1, b.secCadastre1),
    numCadastre1: garder(a.numCadastre1, b.numCadastre1),
    secCadastre2: garder(a.secCadastre2, b.secCadastre2),
    numCadastre2: garder(a.numCadastre2, b.numCadastre2),
    secCadastre3: garder(a.secCadastre3, b.secCadastre3),
    numCadastre3: garder(a.numCadastre3, b.numCadastre3),
    superficieTerrain: garder(a.superficieTerrain, b.superficieTerrain),
    denomDem: garder(a.denomDem, b.denomDem),
    sirenDem: garder(a.sirenDem, b.sirenDem),
    siretDem: garder(a.siretDem, b.siretDem),
  };
}

// ── UPSERT idempotent ────────────────────────────────────────────────────────
/** Fonction de requête minimale (injectable) — compatible avec `query` de `db/client`. */
export type Requete = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[] }>;

/** Résultat d'un UPSERT : nouveau (inséré) vs déjà connu (conflit → seul `vu_le_dernier_millesime` avance). */
export interface ResultatUpsert {
  nouveau: boolean;
}

const COLONNES = [
  'type', 'num_dau', 'code_insee', 'departement', 'etat', 'date_reelle_autorisation',
  'nature_projet_completee', 'i_extension', 'i_surelevation', 'nb_lgt_tot_crees', 'surf_creee',
  'adr_num_ter', 'adr_libvoie_ter', 'adr_lieudit_ter', 'adr_localite_ter', 'adr_codpost_ter',
  'sec_cadastre1', 'num_cadastre1', 'sec_cadastre2', 'num_cadastre2', 'sec_cadastre3', 'num_cadastre3',
  'superficie_terrain', 'denom_dem', 'siren_dem', 'siret_dem',
  'millesime_id', 'vu_le_premier_millesime', 'vu_le_dernier_millesime',
];

/**
 * UPSERT d'un dossier. IDEMPOTENT : rejouer le même millésime ne change RIEN (le conflit ne fait qu'affecter
 * `vu_le_dernier_millesime` à la même valeur). Un dossier déjà connu voit SEULEMENT `vu_le_dernier_millesime` avancer ;
 * sa charge utile n'est jamais réécrite, et il n'est JAMAIS supprimé. `xmax = 0` distingue une insertion d'un conflit.
 */
export async function upserterDossier(
  q: Requete,
  d: Dossier,
  millesimeId: number,
  codeMillesime: string,
): Promise<ResultatUpsert> {
  const valeurs: unknown[] = [
    d.type, d.numDau, d.codeInsee, d.departement, d.etat, d.dateReelleAutorisation,
    d.natureProjetCompletee, d.iExtension, d.iSurelevation, d.nbLgtTotCrees, d.surfCreee,
    d.adrNumTer, d.adrLibvoieTer, d.adrLieuditTer, d.adrLocaliteTer, d.adrCodpostTer,
    d.secCadastre1, d.numCadastre1, d.secCadastre2, d.numCadastre2, d.secCadastre3, d.numCadastre3,
    d.superficieTerrain, d.denomDem, d.sirenDem, d.siretDem,
    millesimeId, codeMillesime, codeMillesime,
  ];
  const placeholders = valeurs.map((_, i) => `$${i + 1}`).join(', ');
  const r = await q<{ est_nouveau: boolean }>(
    `INSERT INTO sitadel_dossier (${COLONNES.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (type, num_dau) DO UPDATE SET vu_le_dernier_millesime = EXCLUDED.vu_le_dernier_millesime
     RETURNING (xmax = 0) AS est_nouveau`,
    valeurs,
  );
  return { nouveau: r.rows[0]?.est_nouveau === true };
}
