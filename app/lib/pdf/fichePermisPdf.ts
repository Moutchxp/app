import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';

/**
 * N1-B — GÉNÉRATEUR PUR de la FICHE DE SYNTHÈSE d'un permis (1 page A4). Déposée en GED à chaque versement automatique, jointe
 * à l'alerte, affichée en tête des pièces. PUR : aucune base, aucun réseau ; seule exception, les ACTIFS de marque sur disque
 * (polices OFL, `app/lib/pdf/actifs/`), constants et versionnés — comme le certificat, dont ce module REPREND le pattern
 * (ACTIFS/A, POLICES, `collecter`, `info` figé pour un rendu déterministe byte-identique). Positionnement ABSOLU (aucun flux) →
 * jamais de pagination automatique : la fiche tient TOUJOURS sur une page (la liste des pièces est bornée, surplus résumé).
 *
 * N'affiche QUE ce qui existe : un champ absent devient « non renseigné » (jamais une case vide ni un zéro trompeur). La NATURE
 * DES TRAVAUX est fournie DÉJÀ TRADUITE en clair par l'appelant (`libelleNatureProjet`) — ce module n'interprète aucun code.
 */

// ── Actifs (disque, constants) — même dossier que le certificat ──
const ACTIFS = join(process.cwd(), 'app', 'lib', 'pdf', 'actifs');
const A = (nom: string) => readFileSync(join(ACTIFS, nom));

// ── Charte (en dur : un PDF ne lit pas le CSS) ──
const ROUGE = '#a30402';
const ENCRE = '#1c1917';
const GRIS = '#5c554d';
const GRIS_CLAIR = '#8a857c';
const NEUTRE = '#f3f4f6';
const NEUTRE_BORD = '#e6e7e9';

// ── Géométrie A4 (points) ──
const PT_MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 16 * PT_MM; // marge latérale (16 mm)
const MY = 16 * PT_MM; // marge haut/bas (16 mm)
const CW = PAGE_W - 2 * MX; // largeur de contenu

const POLICES: Record<string, string> = {
  sg700: 'SpaceGrotesk-Bold.otf',
  ps400: 'PublicSans-Regular.ttf',
  ps600: 'PublicSans-SemiBold.ttf',
  mono400: 'IBMPlexMono-Regular.ttf',
  mono600: 'IBMPlexMono-SemiBold.ttf',
};

/** Nom de fichier CANONIQUE de la fiche générée (affichage + pièce jointe de l'alerte). Constante partagée (jamais retapée). */
export const NOM_FICHIER_FICHE_SYNTHESE = 'Fiche de synthèse du permis.pdf';
/** Nombre maximal de pièces listées sur la fiche (borne « 1 page ») ; au-delà, une ligne « + N autre(s) » résume (jamais un silence). */
const MAX_PIECES_LISTEES = 22;

/** Données brutes du permis pour composer la fiche. Chaînes telles qu'en base ; la mise en forme (« non renseigné », dates) est
 *  faite par `composerFichePermis`. `natureTravaux` est DÉJÀ le libellé en clair (traduit par l'appelant). */
export interface SourceFichePermis {
  numDau: string;
  type: string | null;
  reference: string;
  communeNom: string | null;
  codeInsee: string;
  adresse: string | null;
  categorie: string | null;      // libellé de catégorie (classer) — « Immeuble neuf », « Surélévation »…
  natureTravaux: string | null;  // DÉJÀ traduit en clair par l'appelant (libelleNatureProjet)
  dateAutorisation: string | null; // 'YYYY-MM-DD' ou null
  surface: string | null;
  logements: number | null;
  satisfaitLe: string | null;      // 'YYYY-MM-DD' ou null
  satisfaitPar: string | null;     // 'automatique' | 'manuel' | null
  pieces: string[];                // noms des pièces présentes en GED (la fiche elle-même EXCLUE)
}

export interface DonneesFichePdf extends SourceFichePermis {
  emisLe: Date; // FIGE CreationDate/ModDate → rendu déterministe
}

const NON_RENSEIGNE = 'non renseigné';

/** 'YYYY-MM-DD' → 'JJ/MM/AAAA' (déterministe, sans objet Date) ; vide/nul/malformé → « non renseigné » (jamais un tiret muet). */
function formaterDate(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : NON_RENSEIGNE;
}
/** Origine du marquage « satisfait » en clair. Valeur inattendue/nulle → « non renseigné » (jamais muet). */
function libelleOrigine(satisfaitPar: string | null): string {
  return satisfaitPar === 'automatique' ? 'automatique' : satisfaitPar === 'manuel' ? 'manuel' : NON_RENSEIGNE;
}
/** Tronque un nom de fichier trop long (une seule ligne, pas de retour) → « début….pdf » lisible. */
function tronquerNom(nom: string, max = 62): string {
  return nom.length <= max ? nom : `${nom.slice(0, max - 1)}…`;
}

export type LigneFiche = [string, string];
export interface FicheComposee {
  titre: string;
  sousTitre: string;
  champs: LigneFiche[];
  pieces: string[]; // bornée + éventuelle ligne « + N autre(s) » ; « aucune pièce en GED » si vide
}

/**
 * PUR — transforme les données brutes en libellés d'affichage : applique « non renseigné » partout où une valeur manque,
 * formate les dates, borne la liste des pièces (surplus résumé). Testable sans générer de PDF.
 */
export function composerFichePermis(s: SourceFichePermis): FicheComposee {
  const commune = s.communeNom ? `${s.communeNom} (INSEE ${s.codeInsee})` : `INSEE ${s.codeInsee}`;
  const champs: LigneFiche[] = [
    ['Numéro de permis', s.numDau || NON_RENSEIGNE],
    ['Type', s.type || NON_RENSEIGNE],
    ['Référence interne', s.reference || NON_RENSEIGNE],
    ['Commune', commune],
    ['Adresse', s.adresse || NON_RENSEIGNE],
    ['Catégorie', s.categorie || NON_RENSEIGNE],
    ['Nature des travaux', s.natureTravaux || NON_RENSEIGNE],
    ['Date d’acceptation', formaterDate(s.dateAutorisation)],
    ['Surface créée', s.surface ? `${s.surface} m²` : NON_RENSEIGNE],
    ['Logements créés', s.logements !== null && s.logements !== undefined ? String(s.logements) : NON_RENSEIGNE],
    ['Date de satisfaction', formaterDate(s.satisfaitLe)],
    ['Origine', libelleOrigine(s.satisfaitPar)],
  ];
  let pieces: string[];
  if (s.pieces.length === 0) {
    pieces = ['aucune pièce en GED'];
  } else if (s.pieces.length <= MAX_PIECES_LISTEES) {
    pieces = s.pieces.map((p) => tronquerNom(p));
  } else {
    const reste = s.pieces.length - MAX_PIECES_LISTEES;
    pieces = [...s.pieces.slice(0, MAX_PIECES_LISTEES).map((p) => tronquerNom(p)), `+ ${reste} autre(s) pièce(s) non listée(s) ici`];
  }
  return {
    titre: 'Fiche de synthèse du permis',
    sousTitre: s.numDau ? `Permis n° ${s.numDau}` : 'Permis (numéro non renseigné)',
    champs,
    pieces,
  };
}

function collecter(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const m: Buffer[] = [];
    doc.on('data', (c: Buffer) => m.push(c));
    doc.on('end', () => resolve(Buffer.concat(m)));
    doc.on('error', reject);
  });
}

/**
 * Rend la fiche en PDF 1 page A4 (Promise<Buffer>). Positionnement ABSOLU, `lineBreak:false` partout → aucune pagination.
 * Déterministe (mêmes données → mêmes octets) grâce à `info` figé sur `emisLe`.
 */
export async function genererFichePermisPdf(d: DonneesFichePdf): Promise<Buffer> {
  const f = composerFichePermis(d);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
    info: {
      Title: `Fiche de synthèse — permis ${d.numDau}`,
      Author: 'Sans Vis-à-Vis',
      Creator: 'Sans Vis-à-Vis',
      Producer: 'Sans Vis-à-Vis',
      CreationDate: d.emisLe,
      ModDate: d.emisLe,
    },
  });
  const sortie = collecter(doc);
  for (const [nom, fichier] of Object.entries(POLICES)) doc.registerFont(nom, A(fichier));

  const txt = (s: string, x: number, y: number, police: string, taille: number, couleur: string, opts: PDFKit.Mixins.TextOptions = {}) => {
    doc.font(police).fontSize(taille).fillColor(couleur).text(s, x, y, { lineBreak: false, ...opts });
  };

  let y = MY;

  // ── En-tête : logo + titre ──
  try {
    doc.image(A('logo-long.png'), MX, y, { width: 150 });
  } catch { /* actif absent → on continue sans logo (jamais d'échec de fiche pour un logo manquant) */ }
  txt('DOCUMENT GÉNÉRÉ', PAGE_W - MX - 120, y + 2, 'mono600', 8, GRIS_CLAIR, { width: 120, align: 'right', lineBreak: true });
  txt('régénéré à chaque versement', PAGE_W - MX - 120, y + 14, 'mono400', 7, GRIS_CLAIR, { width: 120, align: 'right', lineBreak: true });
  y += 46;
  txt(f.titre, MX, y, 'sg700', 20, ENCRE);
  y += 26;
  txt(f.sousTitre, MX, y, 'ps600', 12, ROUGE);
  y += 22;
  doc.moveTo(MX, y).lineTo(PAGE_W - MX, y).lineWidth(1).stroke(NEUTRE_BORD);
  y += 16;

  // ── Bloc caractéristiques (clé : valeur), deux colonnes ──
  const colGap = 20;
  const colW = (CW - colGap) / 2;
  const lh = 26;
  const moitie = Math.ceil(f.champs.length / 2);
  const rendreColonne = (rows: LigneFiche[], x: number) => {
    let yy = y;
    for (const [k, v] of rows) {
      txt(k.toUpperCase(), x, yy, 'mono600', 7, GRIS, { width: colW, characterSpacing: 0.4 });
      txt(v, x, yy + 9, 'ps400', 11, ENCRE, { width: colW, ellipsis: true });
      yy += lh;
    }
    return yy;
  };
  const yGauche = rendreColonne(f.champs.slice(0, moitie), MX);
  const yDroite = rendreColonne(f.champs.slice(moitie), MX + colW + colGap);
  y = Math.max(yGauche, yDroite) + 10;

  // ── Pièces présentes en GED ──
  doc.moveTo(MX, y).lineTo(PAGE_W - MX, y).lineWidth(1).stroke(NEUTRE_BORD);
  y += 14;
  txt('PIÈCES PRÉSENTES EN GED', MX, y, 'mono600', 9, ROUGE, { characterSpacing: 0.5 });
  y += 18;
  const pieceLh = 15;
  for (const p of f.pieces) {
    txt('•', MX, y, 'ps400', 10, GRIS_CLAIR);
    txt(p, MX + 14, y, 'ps400', 10, ENCRE, { width: CW - 14, ellipsis: true });
    y += pieceLh;
  }

  // ── Pied de page ──
  const yPied = PAGE_H - MY - 24;
  doc.roundedRect(MX, yPied, CW, 24, 4).fill(NEUTRE);
  txt(
    'Document généré automatiquement par Sans Vis-à-Vis à partir des données du permis. Il se régénère à chaque nouveau versement et n’est pas modifiable à la main.',
    MX + 10, yPied + 7, 'ps400', 8, GRIS, { width: CW - 20, lineBreak: true },
  );

  doc.end();
  return sortie;
}
