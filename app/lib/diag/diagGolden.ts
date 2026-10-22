/**
 * ══ LOT DIAGNOSTIC-GOLDEN (14/10/2026) — PARTIES PURES DE L'OUTIL `scripts/diag-golden.ts` ══════════════════════════════
 *
 * Constat d'origine (14/10/2026) : le golden Asnières valait 29.107259068449615 sur le Mac et 30.432841433985192 sur le
 * serveur Linux, même commit, même base. Cet outil n'en supposait aucune cause : il imprime chaque valeur intermédiaire, sur
 * chaque machine, pour que la comparaison des deux sorties désigne la PREMIÈRE étape qui diverge. (Il a désigné le faisceau
 * 45° ; corrigé par la règle « un frôlement n'est pas un contact », golden rescellé à 29.12915579059343.)
 *
 * Ce module ne contient que du PUR (aucune base, aucun réseau, aucun import) :
 *   · `jsonStable` — JSON aux clés TRIÉES, nombres en PLEINE PRÉCISION (aucun arrondi), stable d'une machine à l'autre ;
 *   · `PROFIL_GOLDEN_DIAG` — copie EXACTE du profil gelé du golden (`PROFIL_GOLDEN_REF`, `app/lib/db/pipeline.itest.ts`),
 *     qu'on ne peut pas importer d'un fichier de test. `diagGolden.test.ts` prouve que les deux restent identiques.
 *   · `sqlNormalise` — le texte d'une requête, blancs réduits, pour la lire et la comparer sans bruit de mise en forme.
 *
 * Ce lot n'ajoute qu'un OUTIL : il ne modifie ni le moteur, ni le verdict, ni le golden, ni `config_scoring`.
 */

/** Le cas du golden, mot pour mot celui de `pipeline.itest.ts` (8 rue Denfert-Rochereau, Asnières). */
export const CAS_GOLDEN = {
  point: { lat: 48.90693182287072, lon: 2.269431435588249 },
  azimutPrincipalDeg: 90,
  etage: 2,
  dernierEtage: false,
} as const;

/** La valeur scellée du golden (`pipeline.itest.ts` ; CLAUDE.md §0). Historique : 14/10/2026 : 29.107259068449615 →
 *  29.12915579059343, règle « un frôlement n'est pas un contact » (propre bâtiment et voisins), validé par Arno.
 *  22/10/2026 : 29.12915579059343 → 40.77232776704026, pivot face à la façade, décision d'Arno du 22/10/2026 ; l'ancien golden incluait des vues à travers le propre immeuble. */
export const SCORE_GOLDEN = 40.77232776704026;

/**
 * COPIE EXACTE de `PROFIL_GOLDEN_REF` (`app/lib/db/pipeline.itest.ts`). Le type est volontairement large (pas d'import du
 * type `ProfilDegagement`, ce module reste sans import) ; le script le passe au moteur tel quel.
 */
export const PROFIL_GOLDEN_DIAG = {
  boostF2: 0.3,
  boostF4: 2.5,
  forfaitConeCentral: 300,
  forfaitExtremites: 200,
  coneF3DemiAngleDeg: 60,
  distanceMaxM: 200,
  plafondCouche1: 90,
  plafondDegagement: 80,
  modeCombinaison: 'sequentiel',
  modeCombinaisonRepli: 'addition',
  couloirSeuilLateralM: 3,
  couloirFenetreConditionN: 16,
  couloirToleranceBordN: 2,
  couloirMalusPct: 0.01,
  naturesRemarquables: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'],
  coneFamilleDemiAngleDeg: 60,
  famillesPonderation: {
    mondialFaisceauM: 800,
    mh: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
    inventaire: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
  },
  famillesAnnee: [
    { borneMin: null, opMin: null, borneMax: 1900, opMax: '<=', cone: 1.5, flanc: 1.2, distMaxM: 300 },
    { borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=', cone: 1.2, flanc: 1.1, distMaxM: 200 },
  ],
  cumulNature: { seuilMinM: 30, baseM: 25, pasM: 5, increment: 0.1, plafond: 2.0, capP1M: 200 },
  orientationPts: { N: 0, NE: 1, E: 5, SE: 8, S: 10, SO: 9, O: 7, NO: 3 },
  analysisRangeM: 200,
} as const;

/** Le texte d'une requête SQL, blancs réduits à une espace. PUR. */
export function sqlNormalise(texte: string): string {
  return texte.replace(/\s+/g, ' ').trim();
}

/**
 * Une valeur rendue comparable d'une machine à l'autre, SANS rien arrondir. PUR.
 *  · nombres : JSON écrit la plus courte écriture qui RELIT exactement le même double — c'est la pleine précision ; les cas
 *    que JSON perdrait sont écrits en clair : `"NaN"`, `"Infinity"`, `"-Infinity"`, et `"-0"` (JSON écrirait `0`) ;
 *  · objets : clés TRIÉES ; `Map` → objet trié ; `Set` → tableau ; `Date` → ISO ; `Buffer`/octets → hexadécimal ;
 *    `bigint` → chaîne ; `undefined` dans un objet → clé omise (comme JSON), dans un tableau → `null` (comme JSON).
 */
export function normaliserPourJson(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    if (Object.is(v, -0)) return '-0';
    return v;
  }
  if (typeof v === 'bigint') return v.toString();
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
  if (v instanceof Map) {
    const o: Record<string, unknown> = {};
    for (const [k, val] of v) o[String(k)] = val;
    return normaliserPourJson(o);
  }
  if (v instanceof Set) return [...v].map(normaliserPourJson);
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : normaliserPourJson(x)));
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[k];
    if (val !== undefined && typeof val !== 'function') o[k] = normaliserPourJson(val);
  }
  return o;
}

/** JSON STABLE : clés triées, pleine précision, une ligne par niveau (indentation 2), fin de ligne finale. PUR. */
export function jsonStable(v: unknown): string {
  return `${JSON.stringify(normaliserPourJson(v), null, 2)}\n`;
}
