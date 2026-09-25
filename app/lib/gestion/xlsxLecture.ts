/**
 * MODULE « GESTION » — LOT ANNUAIRE-1 : LIRE UN CLASSEUR .xlsx, SANS DÉPENDANCE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI ÉCRIRE CE LECTEUR PLUTÔT QUE D'AJOUTER UNE BIBLIOTHÈQUE. C'est la même décision que `zip.ts` (lot
 * 5-PJ-A), pour les mêmes raisons, et elle est ici plus forte encore : ce module lit des fichiers qui contiennent
 * les COORDONNÉES DE 800 PERSONNES. Une bibliothèque de tableur, c'est des dizaines de milliers de lignes de code
 * tiers, des formules, des macros, des chemins de désérialisation — une surface qu'on ne relira jamais, sur la
 * donnée la plus sensible du dépôt. Ce qu'il faut lire tient en trois choses : le ZIP, une table de chaînes, une
 * feuille de cellules. On les lit, et rien d'autre.
 *
 * CE QU'IL FAIT : ouvre l'archive (un .xlsx EST un .zip), inflate `xl/sharedStrings.xml` et la feuille demandée,
 * et rend des lignes de chaînes. RIEN de plus.
 *
 * 🔒 CE QU'IL NE FAIT JAMAIS : évaluer une formule, suivre un lien externe, lire une macro, exécuter quoi que ce
 * soit. Une formule est rendue par sa VALEUR mémorisée (`<v>`) ; son texte n'est même pas lu.
 *
 * ⚠️ BORNES ASSUMÉES : pas de ZIP64 (au-delà de 4 Gio ou 65 535 entrées, l'annuaire central déborde — un export de
 * 500 lignes en fait 30 Ko), et seules les méthodes 0 (stocké) et 8 (dégonflé) sont connues. Tout le reste est
 * refusé par un message qui dit quoi, jamais par un résultat vide qui passerait pour « fichier sans ligne ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { inflateRawSync } from 'node:zlib';

/** Une feuille lue : ses en-têtes (première ligne) et ses lignes de données, toutes en chaînes. */
export interface FeuilleLue {
  entetes: string[];
  lignes: string[][];
}

/** Ce que l'appelant reçoit quand le fichier n'est pas lisible. Un motif en français, jamais une pile d'appels. */
export class ErreurClasseur extends Error {}

// ── ① L'ARCHIVE ───────────────────────────────────────────────────────────────────────────────────────────────────

const SIGNATURE_FIN_ANNUAIRE = 0x0605_4b50;
const SIGNATURE_ENTREE = 0x0201_4b50;

/** Les entrées de l'archive, par nom. Lecture par l'ANNUAIRE CENTRAL (la fin du fichier), jamais en balayant les
 *  en-têtes locaux : c'est la seule lecture correcte d'un ZIP, et la seule qui survive à un fichier écrit en flux. */
function ouvrirArchive(octets: Buffer): Map<string, Buffer> {
  const finAnnuaire = chercherFinAnnuaire(octets);
  if (finAnnuaire < 0) throw new ErreurClasseur('Ce fichier n’est pas un classeur .xlsx (archive illisible).');

  const nombre = octets.readUInt16LE(finAnnuaire + 10);
  let position = octets.readUInt32LE(finAnnuaire + 16);
  const entrees = new Map<string, Buffer>();

  for (let i = 0; i < nombre; i += 1) {
    if (position + 46 > octets.length || octets.readUInt32LE(position) !== SIGNATURE_ENTREE) {
      throw new ErreurClasseur('Ce fichier n’est pas un classeur .xlsx (annuaire de l’archive abîmé).');
    }
    const methode = octets.readUInt16LE(position + 10);
    const tailleCompressee = octets.readUInt32LE(position + 20);
    const longueurNom = octets.readUInt16LE(position + 28);
    const longueurExtra = octets.readUInt16LE(position + 30);
    const longueurCommentaire = octets.readUInt16LE(position + 32);
    const debutLocal = octets.readUInt32LE(position + 42);
    const nom = octets.toString('utf8', position + 46, position + 46 + longueurNom);

    // L'en-tête LOCAL porte ses propres longueurs de nom et d'extra, qui peuvent différer de celles de l'annuaire.
    const nomLocal = octets.readUInt16LE(debutLocal + 26);
    const extraLocal = octets.readUInt16LE(debutLocal + 28);
    const debutDonnees = debutLocal + 30 + nomLocal + extraLocal;
    const brut = octets.subarray(debutDonnees, debutDonnees + tailleCompressee);

    if (methode === 0) entrees.set(nom, Buffer.from(brut));
    else if (methode === 8) entrees.set(nom, inflateRawSync(brut));
    else throw new ErreurClasseur(`Ce classeur emploie une compression que nous ne lisons pas (méthode ${methode}).`);

    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return entrees;
}

/** Le « end of central directory », cherché depuis la fin. Le commentaire final peut faire jusqu'à 64 Kio. */
function chercherFinAnnuaire(o: Buffer): number {
  const min = Math.max(0, o.length - 0x1_0000 - 22);
  for (let i = o.length - 22; i >= min; i -= 1) {
    if (o.readUInt32LE(i) === SIGNATURE_FIN_ANNUAIRE) return i;
  }
  return -1;
}

// ── ② LE XML, LU AU STRICT NÉCESSAIRE ─────────────────────────────────────────────────────────────────────────────

/** Les cinq entités XML, plus les références numériques. Aucune entité personnalisée n'est résolue — une DTD
 *  externe ne doit JAMAIS être suivie (c'est par là qu'on fait lire /etc/passwd à un lecteur naïf). */
function decoderEntites(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');   // en DERNIER, sinon « &amp;lt; » se décode deux fois
}

/** Le texte d'un fragment `<si>…</si>` ou `<is>…</is>` : la concaténation de ses `<t>`, dans l'ordre. Une chaîne
 *  riche (plusieurs polices) est découpée en plusieurs `<r><t>` — les recoller est la seule lecture juste. */
function texteDeFragment(fragment: string): string {
  let out = '';
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null = re.exec(fragment);
  while (m !== null) {
    out += decoderEntites(m[1]);
    m = re.exec(fragment);
  }
  return out;
}

/** La table des chaînes partagées. Absente = classeur sans aucune cellule texte : c'est légal, et ce n'est pas
 *  une erreur — on rend une table vide. */
function lireChainesPartagees(entrees: Map<string, Buffer>): string[] {
  const brut = entrees.get('xl/sharedStrings.xml');
  if (brut === undefined) return [];
  const xml = brut.toString('utf8');
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m: RegExpExecArray | null = re.exec(xml);
  while (m !== null) {
    out.push(m[1] === undefined ? '' : texteDeFragment(m[1]));
    m = re.exec(xml);
  }
  return out;
}

/** « B », « AA », « ABC » → 1, 26, 730. Le numéro de colonne est dans la référence de la cellule, et lui seul dit
 *  où elle va : une ligne peut SAUTER des cellules vides, et les lire dans l'ordre d'apparition décalerait tout. */
export function indiceColonne(reference: string): number {
  const lettres = /^([A-Z]+)/.exec(reference.toUpperCase());
  if (lettres === null) return -1;
  let n = 0;
  for (const c of lettres[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// ── ③ LA FEUILLE ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LIT LA PREMIÈRE FEUILLE d'un classeur et rend ses en-têtes et ses lignes.
 *
 * ⚠️ TOUT EST RENDU EN CHAÎNE, y compris les nombres. C'est volontaire : ce module ne sait pas ce qu'est une date
 * ni un montant dans CE classeur — c'est l'import qui le sait, et c'est lui qui convertit, avec un motif de rejet
 * lisible quand il n'y arrive pas. Un lecteur qui devine les types invente des valeurs.
 */
export function lireClasseur(octets: Buffer, nomFeuille = 'xl/worksheets/sheet1.xml'): FeuilleLue {
  const entrees = ouvrirArchive(octets);
  const brut = entrees.get(nomFeuille) ?? premiereFeuille(entrees);
  if (brut === undefined) throw new ErreurClasseur('Ce classeur ne contient aucune feuille de calcul.');

  const chaines = lireChainesPartagees(entrees);
  const xml = brut.toString('utf8');
  const lignes: string[][] = [];

  const reLigne = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
  let mLigne: RegExpExecArray | null = reLigne.exec(xml);
  while (mLigne !== null) {
    lignes.push(mLigne[1] === undefined ? [] : lireLigne(mLigne[1], chaines));
    mLigne = reLigne.exec(xml);
  }

  // Une ligne entièrement vide en fin de feuille est un artefact du tableur, pas une donnée.
  while (lignes.length > 0 && lignes[lignes.length - 1].every((c) => c === '')) lignes.pop();

  const entetes = (lignes.shift() ?? []).map((x) => x.trim());
  return { entetes, lignes };
}

/** À défaut du nom attendu, la première feuille trouvée — un export peut la nommer `sheet01.xml`. */
function premiereFeuille(entrees: Map<string, Buffer>): Buffer | undefined {
  const noms = [...entrees.keys()].filter((n) => n.startsWith('xl/worksheets/') && n.endsWith('.xml')).sort();
  return noms.length > 0 ? entrees.get(noms[0]) : undefined;
}

function lireLigne(contenu: string, chaines: readonly string[]): string[] {
  const cellules: string[] = [];
  const re = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null = re.exec(contenu);
  while (m !== null) {
    const attributs = m[1];
    const corps = m[2] ?? '';
    const ref = /r="([A-Z]+\d+)"/i.exec(attributs);
    const indice = ref === null ? cellules.length : indiceColonne(ref[1]);
    while (cellules.length < indice) cellules.push('');   // les cellules SAUTÉES sont des vides, pas un décalage
    cellules[indice] = valeurCellule(attributs, corps, chaines);
    m = re.exec(contenu);
  }
  return cellules;
}

function valeurCellule(attributs: string, corps: string, chaines: readonly string[]): string {
  const type = /t="([^"]+)"/.exec(attributs)?.[1] ?? 'n';
  if (type === 'inlineStr') return texteDeFragment(corps).trim();
  const v = /<v>([\s\S]*?)<\/v>/.exec(corps);
  if (v === null) return '';
  const texte = decoderEntites(v[1]).trim();
  if (type === 's') {
    const i = Number(texte);
    return Number.isInteger(i) && i >= 0 && i < chaines.length ? chaines[i] : '';
  }
  // 'str' (valeur d'une formule), 'n' (nombre), 'b' (booléen), 'e' (erreur) : rendus tels quels. L'import décide.
  return texte;
}

/**
 * UNE DATE ÉCRITE EN NUMÉRO DE SÉRIE (le tableau interne d'Excel) → `JJ/MM/AAAA`, ou `null`.
 *
 * ⚠️ MESURÉ SUR LES TROIS EXPORTS DU 25/09/2026 : aucune date n'est dans cette forme — toutes sont du TEXTE
 * (365 cellules « Déb gest. » sur 365 en JJ/MM/AAAA). Cette fonction n'est donc pas un chemin courant, c'est un
 * FILET : le jour où WIPPIMMO exporte des vraies dates, l'import les lit au lieu de rejeter 365 lignes.
 *
 * 🔴 LE « BUG DU 29 FÉVRIER 1900 » EST DÉLIBÉRÉMENT REPRODUIT, parce qu'Excel le porte : le jour 60 n'existe pas,
 * et l'époque est donc décalée d'un jour pour tout ce qui suit. Toutes les dates de gestion sont postérieures à
 * 1900 de plusieurs décennies ; corriger « proprement » décalerait chaque date d'un jour.
 */
export function dateDeSerie(brut: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(brut.trim())) return null;
  const n = Math.floor(Number(brut));
  if (n < 1 || n > 2_958_465) return null;      // 2958465 = 31/12/9999
  const jours = n > 59 ? n - 1 : n;             // le 29/02/1900 d'Excel, qui n'a jamais existé
  const d = new Date(Date.UTC(1899, 11, 31) + jours * 86_400_000);
  const jj = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getUTCFullYear()}`;
}
