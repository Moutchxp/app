/**
 * Logique PURE de l'ingestion de l'annuaire CADA des PRADA (chantier S14b) : parseur CSV (en réutilisant le tokenizer
 * `csv.ts`), extraction du millésime depuis le nom de fichier, repérage du lien .csv sur la page CADA, et fabrication du
 * SQL d'upsert. AUCUNE I/O (réseau/fichier/base) ici → entièrement testable sur des chaînes fabriquées. Le téléchargement
 * et l'insertion vivent dans `pradaIngest.ts` ; le CLI dans `app/scripts/prada-ingest.ts`.
 *
 * ⚠️ Ce chantier NE FAIT AUCUN rapprochement de commune : `prada_import.code_insee` reste NULL et `rapprochement` reste
 * 'non_traite' sur toutes les lignes (chantier séparé). Le SQL d'upsert VERROUILLE cet invariant (cf. sqlUpsertPradaImport).
 */
import { enregistrementsBruts } from './csv';

/** Séparateur du CSV CADA (virgule, contrairement au `;` de Sitadel). */
export const DELIMITEUR_CADA = ',';

/** En-tête EXACT attendu, 8 colonnes dans cet ordre. Tout écart → rejet du fichier entier. */
export const EN_TETE_CADA = [
  "Classement de l'administration",
  "Département de l'autorité",
  "Nom de l'administration",
  "Prénom PRADA",
  "Nom PRADA",
  "Courriel 1 PRADA",
  "Adresse PRADA",
  "Code postal/Ville de l'autorité",
] as const;

/** Colonnes BRUTES cibles de `prada_import`, dans le MÊME ordre que l'en-tête CADA (mapping positionnel). */
export const COLONNES_BRUTES = [
  'classement', 'departement', 'nom_administration', 'prenom', 'nom', 'courriel', 'adresse', 'code_postal_ville',
] as const;

/** Rejet d'un fichier annuaire non conforme (en-tête faux ou ligne au mauvais nombre de champs). Jamais un saut silencieux. */
export class AnnuaireInvalideError extends Error {
  constructor(message: string) { super(message); this.name = 'AnnuaireInvalideError'; }
}

/** Retire un BOM UTF-8 en tête du tout premier morceau du flux (le fichier CADA en commence un). */
async function* sansBom(source: AsyncIterable<string>): AsyncGenerator<string> {
  let premier = true;
  for await (const morceau of source) {
    if (premier) { premier = false; yield morceau.charCodeAt(0) === 0xfeff ? morceau.slice(1) : morceau; }
    else yield morceau;
  }
}

/**
 * Parse le CSV CADA en réutilisant le tokenizer `enregistrementsBruts` (BOM retiré ici ; guillemets doublés, valeurs
 * MULTI-LIGNES entre guillemets et dernière ligne sans '\n' sont gérés par le tokenizer). Rendu = tableau de lignes de 8
 * champs (en-tête exclu). REJET du fichier entier si l'en-tête ne correspond pas aux 8 libellés, ou si une ligne n'a pas
 * exactement 8 champs — avec un message nommant l'écart. Jamais de saut de ligne silencieux.
 */
export async function parserAnnuaireCada(source: AsyncIterable<string>): Promise<string[][]> {
  const lignes: string[][] = [];
  let enteteVu = false;
  let rang = 0;
  for await (const record of enregistrementsBruts(sansBom(source), DELIMITEUR_CADA)) {
    if (!enteteVu) {
      enteteVu = true;
      if (record.length !== EN_TETE_CADA.length || EN_TETE_CADA.some((c, i) => record[i] !== c)) {
        throw new AnnuaireInvalideError(
          `En-tête annuaire CADA inattendu — attendu ${EN_TETE_CADA.length} colonnes [${EN_TETE_CADA.join(' | ')}], ` +
          `reçu ${record.length} [${record.join(' | ')}] : REJET du fichier entier.`,
        );
      }
      continue;
    }
    rang += 1;
    if (record.length !== EN_TETE_CADA.length) {
      throw new AnnuaireInvalideError(
        `Ligne de données ${rang} : ${record.length} champ(s) au lieu de ${EN_TETE_CADA.length} — ` +
        `REJET du fichier entier (jamais de saut de ligne silencieux). Contenu : [${record.join(' | ')}]`,
      );
    }
    lignes.push(record);
  }
  if (!enteteVu) throw new AnnuaireInvalideError('Fichier annuaire CADA vide (aucune ligne) : REJET.');
  return lignes;
}

/**
 * Millésime 'AAAA-MM' extrait du NOM de fichier `annuaire_MM_AA[_N].csv` (ex. annuaire_07_26_0.csv → '2026-07'). C'est ce
 * qui permet de conclure « rien de nouveau » SANS télécharger le CSV (l'annuaire CADA n'a pas d'endpoint de métadonnées).
 * Rejette tout nom inattendu ou mois hors 01-12 — jamais de nom deviné.
 */
export function millesimeDepuisNomFichier(nom: string): string {
  const m = /annuaire_(\d{2})_(\d{2})(?:_\d+)?\.csv$/i.exec(nom.trim());
  if (m === null) {
    throw new Error(`Nom de fichier annuaire CADA inattendu : « ${nom} » (attendu annuaire_MM_AA[_N].csv).`);
  }
  const mois = m[1], an = m[2];
  const moisN = Number(mois);
  if (moisN < 1 || moisN > 12) throw new Error(`Mois invalide dans « ${nom} » : « ${mois} » (attendu 01-12).`);
  return `20${an}-${mois}`;
}

/**
 * Repère le lien .csv sur la page de l'annuaire CADA (le nom change chaque mois → aucune URL stable). EXIGE EXACTEMENT UN
 * lien : zéro ou plusieurs → on ÉCHOUE explicitement plutôt que de deviner. Retourne l'URL absolue (résolue contre `base`).
 */
export function extraireLienCsv(html: string, base: string): string {
  const liens = new Set<string>();
  const re = /href\s*=\s*["']([^"']+\.csv)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) liens.add(m[1]);
  const arr = [...liens];
  if (arr.length === 0) {
    throw new Error("Aucun lien .csv trouvé sur la page de l'annuaire CADA — refus de deviner un nom de fichier ou de construire une URL par arithmétique de date.");
  }
  if (arr.length > 1) {
    throw new Error(`Plusieurs liens .csv (${arr.length}) sur la page de l'annuaire CADA [${arr.join(' | ')}] — refus de choisir arbitrairement.`);
  }
  return new URL(arr[0], base).toString();
}

// ── Rapport chiffré (pur) ────────────────────────────────────────────────────
const IDX_DEPARTEMENT = 1;   // position de « Département de l'autorité » (mapping positionnel EN_TETE_CADA)
const IDX_COURRIEL = 5;      // position de « Courriel 1 PRADA »
const CODES_CIBLES = ['75', '78', '92', '93'] as const;

/** Code département (2 chiffres / 2A-2B) extrait d'une valeur brute « Département de l'autorité », ou null si introuvable. */
export function codeDepartementDe(brut: string): string | null {
  const m = /\b(2[ab]|\d{2,3})\b/i.exec(brut);
  return m === null ? null : m[1].toUpperCase();
}

/** Répartition par département (brut, verbatim), décompte des 4 départements cibles, et nombre de courriels vides. */
export function rapportDepartements(lignes: string[][]): {
  parDepartement: [string, number][];
  cibles: Record<string, number>;
  courrielsVides: number;
} {
  const parDep = new Map<string, number>();
  const cibles: Record<string, number> = Object.fromEntries(CODES_CIBLES.map((c) => [c, 0]));
  let courrielsVides = 0;
  for (const l of lignes) {
    const dep = (l[IDX_DEPARTEMENT] ?? '').trim();
    parDep.set(dep, (parDep.get(dep) ?? 0) + 1);
    const code = codeDepartementDe(dep);
    if (code !== null && code in cibles) cibles[code] += 1;
    if ((l[IDX_COURRIEL] ?? '').trim() === '') courrielsVides += 1;
  }
  const parDepartement = [...parDep.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { parDepartement, cibles, courrielsVides };
}

// ── SQL d'upsert (fabriqué à partir des colonnes → testable, DRY) ─────────────
/**
 * INSERT ... ON CONFLICT (millesime, ligne) DO UPDATE des 8 COLONNES BRUTES UNIQUEMENT. INVARIANT VERROUILLÉ (test) : le
 * SET ne touche JAMAIS `code_insee` ni `rapprochement` — sinon un ré-import DÉTRUIRAIT le travail de revue manuelle
 * (rattachement de commune). `importe_le` n'est pas retouché non plus (garde l'horodatage du 1er import). RETURNING
 * (xmax = 0) distingue insertion (true) et mise à jour (false).
 */
export function sqlUpsertPradaImport(): string {
  const cols = [...COLONNES_BRUTES];
  const placeholders = cols.map((_, i) => `$${i + 3}`).join(', ');
  const setClause = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  return `INSERT INTO prada_import (millesime, ligne, ${cols.join(', ')})
VALUES ($1, $2, ${placeholders})
ON CONFLICT (millesime, ligne) DO UPDATE SET ${setClause}
RETURNING (xmax = 0) AS insere`;
}

/** Upsert du journal de millésime PRADA (code unique). Met à jour volumes + horodatage au ré-import. */
export function sqlUpsertPradaMillesime(): string {
  return `INSERT INTO prada_millesime (code, fichier_source, lignes_lues, lignes_retenues)
VALUES ($1, $2, $3, $4)
ON CONFLICT (code) DO UPDATE SET fichier_source = EXCLUDED.fichier_source, lignes_lues = EXCLUDED.lignes_lues, lignes_retenues = EXCLUDED.lignes_retenues, importe_le = now()`;
}
