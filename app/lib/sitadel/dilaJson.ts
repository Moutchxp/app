/**
 * Logique PURE de lecture de l'annuaire DILA (chantier S28) — AUCUNE I/O (ni réseau, ni fichier, ni DB) → testable en Node.
 *
 * Le fichier DILA est un OBJET unique `{ "service": [ {…}, {…}, … ] }` de ~259 Mo (~86 059 éléments) : un `JSON.parse`
 * complet serait trop lourd. `enregistrementsService` est un tokenizer INCRÉMENTAL (même esprit que le tokenizer CSV du
 * dépôt) qui parcourt le flux caractère par caractère et n'assemble QU'UN élément de tableau à la fois — mémoire bornée à un
 * enregistrement. Chaque élément (petit) est ensuite `JSON.parse` individuellement.
 */

export type DilaRecord = Record<string, unknown>;

/** Un guichet est une mairie si l'un de ses pivots porte type_service_local='mairie'. */
export function estMairie(rec: DilaRecord): boolean {
  const pivot = rec.pivot;
  return Array.isArray(pivot) && pivot.some((p) => (p as { type_service_local?: unknown }).type_service_local === 'mairie');
}

/** Codes INSEE portés par une mairie : union des pivots 'mairie' + le champ top-level `code_insee_commune`. */
export function codesCommune(rec: DilaRecord): string[] {
  const out = new Set<string>();
  const pivot = rec.pivot;
  if (Array.isArray(pivot)) {
    for (const p of pivot) {
      const pp = p as { type_service_local?: unknown; code_insee_commune?: unknown };
      if (pp.type_service_local === 'mairie' && Array.isArray(pp.code_insee_commune)) {
        for (const c of pp.code_insee_commune) if (typeof c === 'string') out.add(c);
      }
    }
  }
  const top = rec.code_insee_commune;
  if (typeof top === 'string' && top !== '') out.add(top);
  return [...out];
}

/** Première `valeur` non vide d'un tableau d'objets `{valeur:…}` (téléphone / courriel / site) ; null sinon. */
function premiereValeur(v: unknown, champ = 'valeur'): string | null {
  if (!Array.isArray(v)) return null;
  for (const el of v) {
    const s = (el as Record<string, unknown>)?.[champ];
    if (typeof s === 'string' && s.trim() !== '') return s.trim();
  }
  return null;
}

function nombreOuNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function texteOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Coordonnées de CONTEXTE extraites d'un enregistrement mairie (jamais un destinataire d'envoi). */
export interface ContexteMairie {
  idDila: string | null;
  ancienCodePivot: string | null;
  codeInseeCommune: string | null;
  nom: string | null;
  categorie: string | null;
  telephone: string | null;
  courriel: string | null;
  siteInternet: string | null;
  adresseLibelle: string | null;
  adresseCodePostal: string | null;
  adresseCommune: string | null;
  latitude: number | null;
  longitude: number | null;
  dateCreation: string | null;
  dateModification: string | null;
  dateDiffusion: string | null;
}

/** Choisit l'adresse « postale » (type_adresse='Adresse' de préférence, sinon la première). */
function adressePrincipale(rec: DilaRecord): Record<string, unknown> | null {
  const a = rec.adresse;
  if (!Array.isArray(a) || a.length === 0) return null;
  const officielle = a.find((x) => (x as { type_adresse?: unknown }).type_adresse === 'Adresse');
  return (officielle ?? a[0]) as Record<string, unknown>;
}

export function extraireContexte(rec: DilaRecord): ContexteMairie {
  const adr = adressePrincipale(rec);
  return {
    idDila: texteOuNull(rec.id),
    ancienCodePivot: texteOuNull(rec.ancien_code_pivot),
    codeInseeCommune: texteOuNull(rec.code_insee_commune),
    nom: texteOuNull(rec.nom),
    categorie: texteOuNull(rec.categorie),
    telephone: premiereValeur(rec.telephone),
    courriel: premiereValeur(rec.adresse_courriel),
    siteInternet: premiereValeur(rec.site_internet),
    adresseLibelle: adr ? texteOuNull(adr.numero_voie) : null,
    adresseCodePostal: adr ? texteOuNull(adr.code_postal) : null,
    adresseCommune: adr ? texteOuNull(adr.nom_commune) : null,
    latitude: adr ? nombreOuNull(adr.latitude) : null,
    longitude: adr ? nombreOuNull(adr.longitude) : null,
    dateCreation: texteOuNull(rec.date_creation),
    dateModification: texteOuNull(rec.date_modification),
    dateDiffusion: texteOuNull(rec.date_diffusion),
  };
}

/**
 * Tokenizer INCRÉMENTAL : parcourt `{ "service": [ … ] }` et émet chaque élément du tableau `service`, un par un, sans
 * jamais charger le fichier entier. Mémoire bornée à l'élément courant. Gère les chaînes (et échappements) pour ne pas
 * compter une accolade/crochet à l'intérieur d'une chaîne. S'arrête au `]` de fermeture du tableau.
 */
export async function* enregistrementsService(chunks: AsyncIterable<string>): AsyncGenerator<DilaRecord> {
  let dansTableau = false; // a-t-on franchi le `[` d'ouverture de service ?
  let prefixe = '';        // buffer minimal tant qu'on cherche l'ouverture (reste minuscule : `[` est au tout début)
  let capture = false;     // sommes-nous en train d'assembler un élément ?
  let profondeur = 0;
  let enChaine = false;
  let echap = false;
  let cur = '';
  let fini = false;

  // Automate à état (ferme sur les variables ci-dessus) : consomme un caractère, renvoie l'objet complété ou null.
  const pasElement = (c: string): DilaRecord | null => {
    if (capture) {
      cur += c;
      if (enChaine) {
        if (echap) echap = false;
        else if (c === '\\') echap = true;
        else if (c === '"') enChaine = false;
        return null;
      }
      if (c === '"') { enChaine = true; return null; }
      if (c === '{' || c === '[') { profondeur++; return null; }
      if (c === '}' || c === ']') {
        profondeur--;
        if (profondeur === 0) { const obj = JSON.parse(cur) as DilaRecord; capture = false; cur = ''; return obj; }
      }
      return null;
    }
    // entre deux éléments
    if (c === ']') { fini = true; return null; }   // fin du tableau service
    if (c === '{') { capture = true; profondeur = 1; cur = '{'; enChaine = false; echap = false; }
    return null;                                    // whitespace, virgule → ignorés
  };

  for await (const chunk of chunks) {
    let balayage = chunk;
    if (!dansTableau) {
      prefixe += chunk;
      const m = /"service"\s*:\s*\[/.exec(prefixe);
      if (m === null) continue;                     // ouverture pas encore vue ; on continue d'accumuler (borné en pratique)
      dansTableau = true;
      balayage = prefixe.slice(m.index + m[0].length); // on reprend juste après le `[`
      prefixe = '';
    }
    for (let i = 0; i < balayage.length && !fini; i++) {
      const r = pasElement(balayage[i]);
      if (r !== null) yield r;
    }
    if (fini) return;
  }
}

/** Résultat du rattachement d'une commune à sa mairie principale. */
export interface Retenue {
  codeInsee: string;
  // ⚠️ SEULES valeurs de `rapprochement` réellement ÉCRITES en base aujourd'hui. La colonne `dila_import.rapprochement`
  // (CHECK migration 068) admet AUSSI 'non_traite'|'manuel'|'ambigu'|'hors_perimetre' : VALEURS DE GARDE réservées, jamais
  // posées par cette ingestion. En particulier 'hors_perimetre' est RÉSERVÉE à un futur élargissement du périmètre (des
  // enregistrements qu'on ramènerait alors) — à NE PAS confondre avec les mairies déléguées écartées ici : celles-ci
  // relèvent de communes DANS le périmètre, écartées par la règle -01, et ne sont PAS écrites (cf. `ecarteesDeleguee`).
  rapprochement: 'direct' | 'desambigue_01';
  rec: DilaRecord;
}

/**
 * Rattache chaque commune du périmètre à SA mairie principale. Une seule mairie → 'direct'. Plusieurs (communes fusionnées :
 * mairie principale + mairie(s) déléguée(s)) → on retient celle dont `ancien_code_pivot = mairie-<INSEE>-01` ('desambigue_01').
 * Les autres candidates sont des MAIRIES DÉLÉGUÉES : elles ne sont PAS retenues (comptées `ecarteesDeleguee`) — ⚠️ elles ne
 * sont PAS « hors périmètre » (leur commune EN fait partie), elles sont ÉCARTÉES PAR LA RÈGLE -01. Une commune sans mairie
 * ou multiple sans `-01` clair est signalée (`ambigus` / `manquants`) et n'est pas retenue.
 */
export function rattacher(parCode: Map<string, DilaRecord[]>, codesPerimetre: string[]): {
  retenues: Retenue[]; direct: number; desambigue01: number; ecarteesDeleguee: number; ambigus: string[]; manquants: string[];
} {
  const retenues: Retenue[] = [];
  const ambigus: string[] = [];
  const manquants: string[] = [];
  let direct = 0, desambigue01 = 0, ecarteesDeleguee = 0;
  for (const code of codesPerimetre) {
    const cands = parCode.get(code) ?? [];
    if (cands.length === 0) { manquants.push(code); continue; }
    if (cands.length === 1) { retenues.push({ codeInsee: code, rapprochement: 'direct', rec: cands[0] }); direct++; continue; }
    const principales = cands.filter((r) => texteOuNull(r.ancien_code_pivot) === `mairie-${code}-01`);
    if (principales.length === 1) {
      retenues.push({ codeInsee: code, rapprochement: 'desambigue_01', rec: principales[0] });
      desambigue01++;
      ecarteesDeleguee += cands.length - 1; // mairies déléguées écartées par la règle -01 (commune EN périmètre), non écrites
    } else {
      ambigus.push(code); // aucun -01 unique : on ne devine pas
    }
  }
  return { retenues, direct, desambigue01, ecarteesDeleguee, ambigus, manquants };
}
