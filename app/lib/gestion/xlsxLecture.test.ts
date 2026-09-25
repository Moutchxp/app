import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { dateDeSerie, ErreurClasseur, indiceColonne, lireClasseur } from './xlsxLecture';

/**
 * LOT ANNUAIRE-1 — LE LECTEUR DE CLASSEURS, ÉPROUVÉ SUR DES CLASSEURS FABRIQUÉS ICI MÊME.
 *
 * 🔒 AUCUN FICHIER RÉEL N'EST LU, ET AUCUN N'EST COMMITÉ. Les exports WIPPIMMO portent les coordonnées de
 * 800 personnes : ils n'entrent pas dans le dépôt, pas même comme fixture. Les classeurs de ces épreuves sont
 * construits octet par octet dans le test, avec des noms inventés.
 *
 * 🔴 CE QUI EST ÉPROUVÉ : les deux méthodes de compression, les cellules SAUTÉES (une ligne peut ne pas porter
 * toutes ses colonnes), les chaînes riches coupées en plusieurs `<t>`, les entités XML, et le REFUS clair d'un
 * fichier qui n'est pas un classeur.
 */

// ── UN CLASSEUR .xlsx MINIMAL, ÉCRIT À LA MAIN ────────────────────────────────────────────────────────────────────

interface Fichier { nom: string; contenu: string; degonfle: boolean }

/** Écrit un ZIP (méthode 0 « stocké » ou 8 « dégonflé »), avec son annuaire central — la forme que lit le module. */
function zip(fichiers: readonly Fichier[]): Buffer {
  const locaux: Buffer[] = [];
  const entrees: Buffer[] = [];
  let position = 0;

  for (const f of fichiers) {
    const brut = Buffer.from(f.contenu, 'utf8');
    const donnees = f.degonfle ? deflateRawSync(brut) : brut;
    const nom = Buffer.from(f.nom, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(f.degonfle ? 8 : 0, 8);
    local.writeUInt32LE(0, 14);                        // crc : jamais vérifié par notre lecteur
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, donnees);

    const entree = Buffer.alloc(46);
    entree.writeUInt32LE(0x02014b50, 0);
    entree.writeUInt16LE(f.degonfle ? 8 : 0, 10);
    entree.writeUInt32LE(donnees.length, 20);
    entree.writeUInt32LE(brut.length, 24);
    entree.writeUInt16LE(nom.length, 28);
    entree.writeUInt32LE(position, 42);
    entrees.push(entree, nom);

    position += 30 + nom.length + donnees.length;
  }

  const corps = Buffer.concat(locaux);
  const annuaire = Buffer.concat(entrees);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(annuaire.length, 12);
  fin.writeUInt32LE(corps.length, 16);
  return Buffer.concat([corps, annuaire, fin]);
}

const chaines = (textes: readonly string[]): string =>
  `<?xml version="1.0"?><sst>${textes.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`;

const classeur = (feuille: string, textes: readonly string[] = [], degonfle = false): Buffer => zip([
  { nom: 'xl/sharedStrings.xml', contenu: chaines(textes), degonfle },
  { nom: 'xl/worksheets/sheet1.xml', contenu: `<?xml version="1.0"?><worksheet><sheetData>${feuille}</sheetData></worksheet>`, degonfle },
]);

// ── LES ÉPREUVES ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('les deux méthodes de compression, et rien d’autre', () => {
  const feuille = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>';
  const textes = ['Id', 'Nom prop.', '1', 'DUPONT'];

  it('lit un classeur STOCKÉ', () => {
    const f = lireClasseur(classeur(feuille, textes, false));
    expect(f.entetes).toEqual(['Id', 'Nom prop.']);
    expect(f.lignes).toEqual([['1', 'DUPONT']]);
  });

  it('lit un classeur DÉGONFLÉ', () => {
    const f = lireClasseur(classeur(feuille, textes, true));
    expect(f.lignes).toEqual([['1', 'DUPONT']]);
  });

  it('refuse une compression inconnue en DISANT laquelle — jamais par un résultat vide', () => {
    const abime = classeur(feuille, textes, false);
    // On maquille la méthode de la première entrée de l'annuaire central en « 12 » (bzip2).
    const i = abime.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    abime.writeUInt16LE(12, i + 10);
    expect(() => lireClasseur(abime)).toThrow(/compression/);
  });

  it('refuse un fichier qui n’est pas une archive, en le disant', () => {
    expect(() => lireClasseur(Buffer.from('ceci est un texte, pas un classeur', 'utf8'))).toThrow(ErreurClasseur);
  });
});

describe('🔴 les cellules SAUTÉES ne décalent rien', () => {
  it('une ligne qui n’a que A et C laisse B vide, à sa place', () => {
    const f = lireClasseur(classeur(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>',
      ['Id', 'Mobile', 'Email', '7', 'zoe@fictif.fr'],
    ));
    expect(f.entetes).toEqual(['Id', 'Mobile', 'Email']);
    // Sans la lecture de la RÉFÉRENCE de cellule, l'e-mail serait tombé dans la colonne « Mobile ».
    expect(f.lignes).toEqual([['7', '', 'zoe@fictif.fr']]);
  });

  it('les lettres de colonne se lisent au-delà de Z', () => {
    expect(indiceColonne('A1')).toBe(0);
    expect(indiceColonne('B2')).toBe(1);
    expect(indiceColonne('Z9')).toBe(25);
    expect(indiceColonne('AA1')).toBe(26);
    expect(indiceColonne('AB1')).toBe(27);
    expect(indiceColonne('BA1')).toBe(52);
  });
});

describe('les textes, tels qu’ils sont écrits', () => {
  it('une chaîne RICHE (plusieurs polices) est recollée, pas tronquée', () => {
    const riche = '<?xml version="1.0"?><sst><si><r><t>DUP</t></r><r><t>ONT</t></r></si></sst>';
    const octets = zip([
      { nom: 'xl/sharedStrings.xml', contenu: riche, degonfle: false },
      { nom: 'xl/worksheets/sheet1.xml', contenu: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>', degonfle: false },
    ]);
    expect(lireClasseur(octets).entetes).toEqual(['DUPONT']);
  });

  it('les entités XML sont décodées, et « &amp;lt; » ne se décode pas deux fois', () => {
    const f = lireClasseur(classeur(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>',
      ['Nom', 'DUPONT &amp; FILS &lt;SCI&gt; &#233;'],
    ));
    expect(f.lignes[0][0]).toBe('DUPONT & FILS <SCI> é');
  });

  it('une cellule en ligne (`inlineStr`) est lue comme les autres', () => {
    const f = lireClasseur(classeur(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Commune</t></is></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>PUTEAUX</t></is></c></row>',
    ));
    expect(f.entetes).toEqual(['Commune']);
    expect(f.lignes).toEqual([['PUTEAUX']]);
  });

  it('un nombre est rendu TEL QUEL : ce module ne devine aucun type', () => {
    const f = lireClasseur(classeur(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>43300</v></c></row>',
      ['Déb gest.'],
    ));
    expect(f.lignes).toEqual([['43300']]);
  });

  it('une feuille sans aucune ligne rend des en-têtes vides, jamais une erreur', () => {
    const f = lireClasseur(classeur(''));
    expect(f.entetes).toEqual([]);
    expect(f.lignes).toEqual([]);
  });

  it('les lignes vides de la fin sont retirées : ce sont des artefacts du tableur', () => {
    const f = lireClasseur(classeur(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>1</v></c></row>'
      + '<row r="3"><c r="A3"><v></v></c></row>',
      ['Nom', 'DUPONT'],
    ));
    expect(f.lignes).toEqual([['DUPONT']]);
  });
});

/**
 * 🔴 LE FILET DES DATES EN NUMÉRO DE SÉRIE. Mesuré sur les trois exports du 25/09/2026 : aucune date n'est dans
 * cette forme. Ce filet existe pour le jour où WIPPIMMO changera d'avis — pas pour aujourd'hui.
 */
describe('les dates écrites en numéro de série', () => {
  it('le 1er janvier 2020 est le jour 43831', () => {
    expect(dateDeSerie('43831')).toBe('01/01/2020');
  });

  it('le décalage du 29 février 1900 d’Excel est REPRODUIT, pas « corrigé »', () => {
    // Le jour 59 est le 28/02/1900 ; le 60 n'a jamais existé ; le 61 est le 01/03/1900.
    expect(dateDeSerie('59')).toBe('28/02/1900');
    expect(dateDeSerie('61')).toBe('01/03/1900');
  });

  it('ce qui n’est pas un nombre, ou est hors bornes, rend null', () => {
    for (const non of ['', '19/07/2018', 'abc', '0', '9999999']) {
      expect(dateDeSerie(non), non).toBeNull();
    }
  });
});
