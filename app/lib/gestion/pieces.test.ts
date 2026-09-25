import { describe, it, expect } from 'vitest';
import {
  etatArchive, etiquetteType, extensionDuNom, formaterTaille, nomArchive, nomsSansDoublon, poidsTotal,
  sortePiece, tronquerNom, PLAFOND_ARCHIVE_OCTETS, type PieceAffichee,
} from './pieces';

const piece = (o: Partial<PieceAffichee> = {}): PieceAffichee => ({
  pieceId: 1, nomFichier: 'facture.pdf', typeMime: 'application/pdf', tailleOctets: 1000,
  disponible: true, motifNonStocke: null, ...o,
});

describe('la sorte d’une pièce', () => {
  it('un PDF est un PDF', () => {
    expect(sortePiece('application/pdf', 'x.pdf')).toBe('pdf');
  });
  it('les images miniaturables sont reconnues', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']) {
      expect(sortePiece(t, 'x')).toBe('image');
    }
  });

  /**
   * 🔴 LE TEST QUI COMPTE POUR LA SÉCURITÉ. Un SVG est un document qui peut porter du script ; un HTML reçu par mail
   * est du code écrit par un inconnu. Les classer « image » les enverrait au générateur de vignettes, c'est-à-dire
   * les faire ouvrir. Ils reçoivent une icône, comme un .zip — et ce test est là pour que ça le reste.
   */
  it('un SVG n’est JAMAIS une image', () => {
    expect(sortePiece('image/svg+xml', 'piege.svg')).toBe('autre');
    expect(sortePiece('application/octet-stream', 'piege.svg')).toBe('autre');
  });
  it('un HTML n’est JAMAIS rendu', () => {
    expect(sortePiece('text/html', 'piege.html')).toBe('autre');
    expect(sortePiece('application/xhtml+xml', 'piege.xhtml')).toBe('autre');
  });

  it('un type absent se rabat sur l’extension du nom — pour l’AFFICHAGE seulement', () => {
    expect(sortePiece(null, 'photo.JPG')).toBe('image');
    expect(sortePiece('application/octet-stream', 'contrat.pdf')).toBe('pdf');
  });
  it('un relevé SEPA est « autre » : il aura son étiquette de type', () => {
    expect(sortePiece('application/xml', 'camt053.xml')).toBe('autre');
  });
  it('un type avec paramètre est normalisé', () => {
    expect(sortePiece('image/jpeg; charset=binary', 'x.jpg')).toBe('image');
  });
});

describe('l’étiquette de type', () => {
  it('vient de l’extension, en majuscules', () => {
    expect(etiquetteType('camt053.xml', 'application/xml')).toBe('XML');
    expect(etiquetteType('bail.docx', null)).toBe('DOCX');
  });
  it('se rabat sur le type MIME quand le nom n’a pas d’extension', () => {
    expect(etiquetteType('piece-jointe', 'application/zip')).toBe('ZIP');
  });
  it('ne rend jamais rien : « FICHIER » en dernier recours', () => {
    expect(etiquetteType('', null)).toBe('FICHIER');
  });
  it('une extension exotique de dix caractères n’est pas une extension', () => {
    expect(extensionDuNom('x.tropLongueExtension')).toBe('');
  });
});

describe('le nom tronqué', () => {
  it('un nom court n’est pas touché', () => {
    expect(tronquerNom('facture.pdf')).toBe('facture.pdf');
  });
  /** Couper par la fin donnerait « releve-sepa-2026-0… » : ni de quoi il s'agit, ni de quel type. */
  it('coupe par le MILIEU et garde l’extension', () => {
    const t = tronquerNom('releve-sepa-2026-09-camt053-compte-principal.xml', 28);
    expect(t.endsWith('.xml')).toBe(true);
    expect(t).toContain('…');
    expect(t.length).toBeLessThanOrEqual(28);
  });
  it('un nom sans extension est tronqué quand même', () => {
    expect(tronquerNom('a'.repeat(60), 20).length).toBeLessThanOrEqual(20);
  });
});

describe('les tailles', () => {
  /**
   * 🔴 UNE SEULE FAÇON D'ÉCRIRE UNE TAILLE DANS TOUT LE MODULE. `pieces.ts` RÉEXPORTE `formaterTaille` (ecran.ts, lot
   * 4c) au lieu d'en écrire une seconde : un premier jet de ce lot affichait « 120 Ko » à côté du « 120 ko » du reste
   * de l'écran, et trois tests existants l'ont attrapé. Ce test garde la porte fermée.
   */
  it('viennent du formateur DÉJÀ en place, en unités décimales', () => {
    expect(formaterTaille(500)).toBe('500 o');
    expect(formaterTaille(120_000)).toBe('120 ko');
    expect(formaterTaille(3_000_000)).toBe('3.0 Mo');
  });
  it('une taille inconnue se DIT, elle ne s’affiche pas « 0 o »', () => {
    expect(formaterTaille(null)).toBe('taille inconnue');
  });
  it('le poids total ne compte QUE les pièces conservées', () => {
    expect(poidsTotal([piece({ tailleOctets: 100 }), piece({ disponible: false, tailleOctets: 9999 })])).toBe(100);
  });
});

describe('« Tout télécharger » — ce qu’il peut, et sinon POURQUOI', () => {
  it('possible avec des pièces conservées', () => {
    const e = etatArchive([piece({ tailleOctets: 10 }), piece({ pieceId: 2, tailleOctets: 20 })]);
    expect(e).toMatchObject({ possible: true, nombre: 2, octets: 30 });
  });
  it('aucune pièce conservée → impossible, et le motif le dit', () => {
    const e = etatArchive([piece({ disponible: false })]);
    expect(e.possible).toBe(false);
    if (!e.possible) expect(e.motif).toContain('aucune pièce');
  });
  /** Un bouton qui échoue après une minute d'attente est pire qu'un bouton qui dit non tout de suite. */
  it('au-delà du plafond → le motif donne LES DEUX chiffres, et la conduite à tenir', () => {
    const e = etatArchive([piece({ tailleOctets: PLAFOND_ARCHIVE_OCTETS + 1 })]);
    expect(e.possible).toBe(false);
    if (!e.possible) {
      expect(e.motif).toContain('maximum');
      expect(e.motif).toContain('une par une');
    }
  });
});

describe('le nom de l’archive', () => {
  it('date et objet', () => {
    expect(nomArchive('2026-09-25', 'Fenêtre cassée')).toBe('2026-09-25 — Fenêtre cassée.zip');
  });
  it('les caractères interdits par le système de fichiers sont retirés', () => {
    expect(nomArchive('2026-09-25', 'Re: dégât/eau \\ n°3 *urgent*?')).not.toMatch(/[/\\:*?"<>|]/);
  });
  it('un objet démesuré est borné', () => {
    expect(nomArchive('2026-09-25', 'x'.repeat(300)).length).toBeLessThan(90);
  });
  it('sans date ni objet, un nom reste utilisable', () => {
    expect(nomArchive(null, null)).toBe('pieces-jointes.zip');
  });
  it('une date mal formée est ignorée plutôt que recopiée', () => {
    expect(nomArchive('pas une date', 'Objet')).toBe('Objet.zip');
  });
});

describe('les noms dans l’archive', () => {
  it('deux pièces de même nom sont numérotées — sinon l’archive en perd une', () => {
    expect(nomsSansDoublon(['image001.png', 'image001.png', 'image001.png']))
      .toEqual(['image001.png', 'image001 (2).png', 'image001 (3).png']);
  });
  it('la casse ne crée pas un faux doublon distinct', () => {
    expect(nomsSansDoublon(['Photo.JPG', 'photo.jpg'])[1]).toBe('photo (2).jpg');
  });

  /** « zip slip » : une pièce nommée `../../etc/passwd` ne doit jamais devenir un chemin à l'extraction. */
  it('les séparateurs de chemin sont neutralisés', () => {
    const [n] = nomsSansDoublon(['../../etc/passwd']);
    expect(n).not.toContain('/');
    expect(n).not.toContain('\\');
    expect(n.startsWith('.')).toBe(false);
  });
  it('un nom vide reçoit quand même un nom', () => {
    expect(nomsSansDoublon([''])[0]).toBe('piece-jointe');
  });
});
