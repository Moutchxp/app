/**
 * CALCUL PUR (par injection de deps) du « best-of » PDF d'un permis : classement des pièces par famille (plan de masse / étage /
 * coupe…), confirmation PARESSEUSE des planches (shortlist plafonnée) et détection du Cerfa PC — le tout à partir du TEXTE de la GED.
 *
 * 🔴 SOURCE UNIQUE du calcul : extrait VERBATIM du corps de `GET /emprise` (là où il vivait inline) pour qu'il n'existe qu'UN seul
 *    calcul de best-of, partagé par le lecteur (route, chemin « à la volée ») ET le producteur de fond (veille, `precalculBestOfAuto`).
 *    Le comportement du lecteur est INCHANGÉ : la route lit d'abord le persisté, puis appelle CE calcul en repli, puis persiste.
 * 🔴 GARDE « en cas de doute, recalcule » (identique au cache P1) : un calcul qui a subi un échec de TÉLÉCHARGEMENT/EXTRACTION (motif
 *    « échec … », possiblement TRANSITOIRE) rend `cachable=false` → ni mémoïsé, ni persisté. On ne fige JAMAIS un best-of dégradé.
 *    Une pièce simplement ILLISIBLE (contenu sans couche texte) est DÉTERMINISTE → `cachable` reste vrai.
 * PUR côté I/O réseau : toute lecture d'objet / extraction passe par les `deps` injectées (testable sans MinIO ni pdf.js).
 */
import { lireGedPermis, type DepsLectureGed, type PieceGedMeta, type ResultatLectureGed } from './lectureGed';
import { classerPiecesParFamille, pagesPlanches, lireEchelleTexte, tracabilitePlanche, type FamillePlan } from './planMasse';
import { familleDeContenu, niveauxDeContenu } from './planMasseContenu'; // PROV : famille + niveaux par le CONTENU
import { estPieceCerfaPc } from './identifierCerfa'; // LOT 66 — reconnaissance du Cerfa PC par CONTENU (n° 13409)
import type { BestOfValeur } from './bestOfPersistance';

// PROJ-3d — confirmation page-level PARESSEUSE : plafond DUR de pièces ouvertes (mesuré ~98 ms/pièce → ~0,7 s pour 7).
//   Ne JAMAIS ouvrir les 81 pièces (~8 s). Les proposées au-delà du plafond restent proposées PAR LEUR NOM, sans confirmation.
export const PLAFOND_SHORTLIST = 8;

/** Prédicat PDF — SOURCE UNIQUE partagée par la route et le producteur de fond, pour que l'empreinte GED soit calculée à l'IDENTIQUE. */
export function estPiecePdf(p: { typeMime: string | null; nomFichier: string }): boolean {
  return (p.typeMime ?? '').toLowerCase().includes('pdf') || p.nomFichier.toLowerCase().endsWith('.pdf');
}

/**
 * Une lecture de GED prête pour le calcul : le résultat brut + le signal d'échec de TÉLÉCHARGEMENT/EXTRACTION (prudence P1) + les
 * indisponibilités à remonter. Extraite pour être PARTAGÉE : le producteur de fond (P-fond 4b) lit la GED UNE seule fois et en tire À LA
 * FOIS le best-of ET la complétude — jamais deux lectures du même dossier.
 */
export interface LectureGedCalcul { ged: ResultatLectureGed; echec: boolean; indis: string[] }

/** Lit la GED une fois, avec la MÊME détection d'échec que `calculerBestOf` (catastrophe → ged vide + echec ; échec par pièce via motif). */
export async function lireGedPourCalcul(dossierId: number, deps: DepsLectureGed): Promise<LectureGedCalcul> {
  try {
    const ged = await lireGedPermis(dossierId, deps);
    // Un échec de TÉLÉCHARGEMENT/EXTRACTION d'une pièce (motif « échec … ») rend le calcul NON cachable (prudence P1).
    const echec = ged.pieces.some((g) => g.motif != null && (g.motif.startsWith('échec de lecture') || g.motif.startsWith('échec d’extraction')));
    return { ged, echec, indis: [] };
  } catch (e) {
    console.error(`[best-of] source indisponible: contenu`, { dossierId, message: e instanceof Error ? e.message : String(e) });
    return { ged: { dossierId, pieces: [], bilan: { nbPieces: 0, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 } }, echec: true, indis: ['contenu'] };
  }
}

/**
 * Calcule le best-of d'un dossier à partir de ses pièces PDF (déjà filtrées par `estPiecePdf`) et des `deps` de lecture GED.
 * Rend `{ valeur, cachable }`. Ne LIT ni n'ÉCRIT le persisté : la persistance (empreinte, `calcule_par`) appartient à l'appelant
 * (route → 'a_la_volee', producteur de fond → 'fond'), qui n'écrit QUE si `cachable`.
 * `lecturePreLue` (P-fond 4b) : lecture GED déjà faite par l'appelant (mutualisation best-of + complétude) ; ABSENTE → lecture interne
 * (chemin de la route, INCHANGÉ).
 */
export async function calculerBestOf(dossierId: number, piecesPdf: PieceGedMeta[], deps: DepsLectureGed, lecturePreLue?: LectureGedCalcul): Promise<{ valeur: BestOfValeur; cachable: boolean }> {
  const lecture = lecturePreLue ?? await lireGedPourCalcul(dossierId, deps);
  const ged = lecture.ged;
  const indisGed: string[] = [...lecture.indis];
  let echecTelechargement = lecture.echec;
  const texteParId = new Map(ged.pieces.map((p) => [p.id, p.pages.filter((x) => x.aTexte).map((x) => x.texte)] as const));
  const proposeesAutres = classerPiecesParFamille(piecesPdf, (p) => familleDeContenu(texteParId.get(p.id) ?? []));
  const niveauxParId = new Map<number, string[]>(); // PROV : niveaux portés par une planche d'ÉTAGE (RDC/SSOL/R+n), quand connus par le CONTENU
  for (const p of proposeesAutres.proposees) if (p.famille === 'etage') { const niv = niveauxDeContenu(texteParId.get(p.id) ?? []); if (niv.length) niveauxParId.set(p.id, niv); }
  // Index des pièces DÉJÀ lues par lireGedPermis (texte de CHAQUE page, tableau COMPLET, ordre préservé) — partagé par la shortlist et le Cerfa.
  const gedParId = new Map(ged.pieces.map((g) => [g.id, g] as const));
  // PROJ-3d/3f — CONFIRMATION PARESSEUSE (shortlist plafonnée) : éclate chaque candidat en PLANCHES + échelle. Texte SEUL. Dégradation propre.
  const confirmations = new Map<number, { planches: { page: number; echelle: string | null; tracable: boolean; famille: FamillePlan; ambigu: boolean }[] }>();
  await Promise.all(proposeesAutres.proposees.slice(0, PLAFOND_SHORTLIST).map(async (p) => {
    try {
      // P-fond 3 (perfo) — RÉUTILISE le texte DÉJÀ extrait par lireGedPermis (même approche que la détection Cerfa, commit 582a9f7) au lieu
      //   de RE-TÉLÉCHARGER + RÉ-EXTRAIRE la pièce : lireGedPermis appelle le MÊME `deps.extraire` sans maxPages, sur le MÊME objet →
      //   `g.pages[i].texte === ex.pages[i]` (tableau complet, pages vides incluses). Résultat STRICTEMENT identique, zéro re-téléchargement.
      //   REPLI (comportement actuel) si le texte n'est pas disponible : pièce absente de la GED lue OU extraction en échec (g.pages vide).
      const g = gedParId.get(p.id);
      let pages: string[];
      if (g && g.pages.length > 0) {
        pages = g.pages.map((pg) => pg.texte); // texte complet déjà en mémoire (aucune I/O)
      } else {
        const ex = await deps.extraire(await deps.lireObjet(p.cleStockage), p.typeMime); // repli : re-télécharge + ré-extrait
        if (!ex.ok) { indisGed.push(`texte:${p.id}`); console.error(`[best-of] texte pièce ${p.id} illisible`, { motif: ex.motif }); return; } // contenu illisible = DÉTERMINISTE (cachable)
        pages = ex.pages;
      }
      const planches = pagesPlanches(pages).map((pg) => {
        const tp = tracabilitePlanche(p.famille, pages[pg - 1] ?? '');
        return { page: pg, echelle: lireEchelleTexte(pages[pg - 1] ?? ''), tracable: tp.tracable, famille: tp.famille, ambigu: tp.ambigu };
      });
      confirmations.set(p.id, { planches });
    } catch (e) { indisGed.push(`texte:${p.id}`); console.error(`[best-of] confirmation pièce ${p.id} indisponible`, { message: e instanceof Error ? e.message : String(e) }); echecTelechargement = true; } // téléchargement raté (repli) = possiblement TRANSITOIRE → non cachable
  }));
  // ÉTAPE 3 (LOT 66) — CATÉGORIE « Cerfa » PAR CONTENU (n° 13409), lecture de TÊTE (≤3 pages) : RÉUTILISE le texte DÉJÀ extrait par
  //   lireGedPermis (jamais un re-téléchargement). Déterministe (Set, indépendant de l'ordre).
  const cerfaIds = new Set<number>();
  for (const p of piecesPdf) {
    const g = gedParId.get(p.id);
    if (g && estPieceCerfaPc(g.pages.slice(0, 3).map((pg) => pg.texte))) cerfaIds.add(p.id);
  }
  const valeur: BestOfValeur = { proposees: proposeesAutres.proposees, autres: proposeesAutres.autres, niveauxParId, confirmations, cerfaIds, indisGed };
  return { valeur, cachable: !echecTelechargement };
}
