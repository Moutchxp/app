/**
 * N7-B — LECTURE des CHAMPS DE FORMULAIRE (AcroForm) d'un PDF. Les Cerfa sont « muets » à l'extraction de texte (N7-A) parce que
 * leurs valeurs vivent dans des CHAMPS de formulaire, pas dans la couche texte. Ce module les lit — SANS aucune IA, sans réseau.
 *
 * 🔒 PÉRIMÈTRE : on LIT, c'est tout. Aucune interprétation métier, aucun mapping vers nos colonnes, aucune décision, aucune
 * écriture. La sortie est une table brute { nom de champ → valeur (+ page si dispo) }.
 *
 * 🔒 IDENTITÉ DU DEMANDEUR : les champs d'identité (nom, prénom, naissance, téléphone, courriel, SIRET, adresse du déclarant…)
 * sont filtrés À LA LECTURE et JAMAIS retournés (liste noire `CHAMPS_IDENTITE_INTERDITS`, ci-dessous, un seul endroit). C'est
 * une donnée qu'on n'a aucune raison de faire circuler.
 *
 * 🔒 ROBUSTESSE : toute l'extraction est sous try/catch → renvoie une table VIDE, jamais d'exception (même règle que
 * `extractionPdf.ts`). `pdfjs-dist` en import DYNAMIQUE (build legacy, worker désactivé, `isEvalSupported:false`).
 */

/** Un champ de formulaire renseigné (hors identité). `page` = index 0-based rendu par pdfjs, `null` si indisponible. */
export interface ChampFormulaire { nom: string; valeur: string; page: number | null; type: string | null }
export type TableChamps = ChampFormulaire[];

/**
 * LISTE NOIRE des champs d'IDENTITÉ du demandeur — filtrés à la lecture, JAMAIS retournés. Tokens comparés en minuscules,
 * désaccentués, avec une frontière « lettres seulement » (« _ », chiffres, espaces séparent) : « Nom_2 »/« Prénom_2 »/
 * « Adresse Numéro » matchent, mais « Nombre de places » (contient « nom ») ou « section » NE matchent PAS. Un seul endroit.
 */
export const CHAMPS_IDENTITE_INTERDITS: readonly string[] = [
  'nom', 'prenom', 'naissance', 'courriel', 'mail', 'telephone', 'portable', 'fax', 'siret', 'soussigne',
  'raison sociale', 'denomination', 'adresse', 'voie', 'localite', 'commune', 'code postal', 'cp',
];

const sansAccent = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’‘]/g, "'").toLowerCase();
const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE_IDENTITE = new RegExp(`(?<![a-z])(${CHAMPS_IDENTITE_INTERDITS.map(echapper).join('|')})(?![a-z])`);

/** Un nom de champ désigne-t-il l'identité du demandeur (→ à ne jamais retourner) ? */
export function estChampIdentite(nom: string): boolean {
  return RE_IDENTITE.test(sansAccent(nom));
}

/** Forme d'un champ telle que rendue par `getFieldObjects()` de pdfjs (typage souple). */
type ChampBrut = { type?: string; value?: unknown; page?: number };
type FieldObjects = Record<string, ChampBrut[]> | null;

/**
 * Filtre PUR (testable sans PDF) : d'une table `getFieldObjects()`-like, garde les champs RENSEIGNÉS et NON identité. Une valeur
 * vide / `false` / absente est ignorée (case non cochée, champ vierge). Aucune interprétation.
 */
export function filtrerChamps(fieldObjects: FieldObjects): TableChamps {
  const out: TableChamps = [];
  if (!fieldObjects) return out;
  for (const nom of Object.keys(fieldObjects)) {
    if (estChampIdentite(nom)) continue; // identité : jamais retournée
    const d = fieldObjects[nom]?.[0] ?? {};
    const v = d.value;
    if (v === null || v === undefined || v === '' || v === false) continue; // non renseigné
    out.push({ nom, valeur: typeof v === 'string' ? v : String(v), page: typeof d.page === 'number' ? d.page : null, type: d.type ?? null });
  }
  return out;
}

/**
 * Lit les champs de formulaire renseignés (hors identité) d'un PDF. Jamais d'exception : un PDF sans AcroForm, chiffré ou
 * corrompu → table VIDE.
 */
export async function lireChampsFormulaire(contenu: Buffer): Promise<TableChamps> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(contenu), isEvalSupported: false, useSystemFonts: true }).promise;
    const fo = (await doc.getFieldObjects()) as FieldObjects;
    const champs = filtrerChamps(fo);
    await doc.destroy();
    return champs;
  } catch {
    return [];
  }
}
