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
 * CRITÈRE (N7-B2) : on bloque ce qui identifie une PERSONNE (le déclarant / correspondant / signataire), PAS ce qui localise le
 * PROJET. L'adresse du TERRAIN n'est pas une donnée personnelle — c'est l'objet du permis, déjà publique dans Sitadel, et
 * demandée. On la LIBÈRE ; on bloque l'identité et l'adresse du déclarant.
 *
 * Comparaison en minuscules, désaccentués, frontière « lettres seulement » (« _ », chiffres, espaces séparent) : « Nom_2 » et
 * « D2N_nom » matchent, « Nombre de places » (contient « nom ») NE matche pas.
 *
 * Trois familles, évaluées dans l'ordre :
 *  1. TERRAIN / cadastre → LIBRE (précédence) : « terrain », « parcelle », « section », « cadastr », « superficie », et le
 *     préfixe codé du terrain « T2… » du Cerfa 13409 (« T2V_voie », « T2L_localite », « T2Q_numero »…). ⚠️ Ce préfixe est calé
 *     sur le Cerfa PC 13409*15 ; d'autres millésimes/formulaires pourront demander à l'étendre.
 *  2. IDENTITÉ d'une PERSONNE → BLOQUÉ : nom, prénom, naissance, téléphone, portable, fax, courriel, SIRET, dénomination…
 *  3. LOCALISATION sans marqueur terrain (adresse, voie, localité, commune, CP, numéro, rue) → BLOQUÉ par prudence : c'est
 *     l'adresse du déclarant/correspondant. Un champ AMBIGU (ex. « M2K_commune », non préfixé terrain) reste BLOQUÉ.
 */
const sansAccent = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’‘]/g, "'").toLowerCase();
const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const borne = (tokens: readonly string[]): RegExp => new RegExp(`(?<![a-z])(${tokens.map(echapper).join('|')})(?![a-z])`);

/** Marqueurs de LOCALISATION DU TERRAIN / cadastre → toujours LIBRES (précédence). `t2[a-z]` = préfixe codé terrain du 13409. */
export const CHAMPS_TERRAIN_LIBRES: readonly string[] = ['terrain', 'parcelle', 'section', 'cadastr', 'superficie'];
const RE_TERRAIN = new RegExp(`(?<![a-z])(${CHAMPS_TERRAIN_LIBRES.map(echapper).join('|')}|t2[a-z])`);

/** LISTE NOIRE — identité d'une PERSONNE (déclarant/correspondant/signataire). Restreinte : ne contient PAS les tokens d'adresse. */
export const CHAMPS_IDENTITE_INTERDITS: readonly string[] = [
  'nom', 'prenom', 'naissance', 'courriel', 'mail', 'telephone', 'portable', 'fax', 'siret', 'soussigne',
  'raison sociale', 'denomination',
];
const RE_PERSONNE = borne(CHAMPS_IDENTITE_INTERDITS);

/** Tokens d'ADRESSE : bloqués SAUF si le champ porte un marqueur terrain (→ adresse du déclarant par défaut). */
const CHAMPS_ADRESSE = ['adresse', 'voie', 'localite', 'commune', 'code postal', 'cp', 'numero', 'rue'];
const RE_ADRESSE = borne(CHAMPS_ADRESSE);

/**
 * Un nom de champ doit-il être BLOQUÉ (identité/adresse du déclarant) ? La localisation du terrain et le cadastre passent.
 */
export function estChampIdentite(nom: string): boolean {
  const n = sansAccent(nom);
  if (RE_TERRAIN.test(n)) return false;  // localisation du PROJET → libre (précédence)
  if (RE_PERSONNE.test(n)) return true;  // identité d'une PERSONNE → bloqué
  if (RE_ADRESSE.test(n)) return true;   // adresse sans marqueur terrain → déclarant → bloqué
  return false;
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
