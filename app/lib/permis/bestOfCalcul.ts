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
import { lireGedPermis, type DepsLectureGed, type PieceGedMeta } from './lectureGed';
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
 * Calcule le best-of d'un dossier à partir de ses pièces PDF (déjà filtrées par `estPiecePdf`) et des `deps` de lecture GED.
 * Rend `{ valeur, cachable }`. Ne LIT ni n'ÉCRIT le persisté : la persistance (empreinte, `calcule_par`) appartient à l'appelant
 * (route → 'a_la_volee', producteur de fond → 'fond'), qui n'écrit QUE si `cachable`.
 */
export async function calculerBestOf(dossierId: number, piecesPdf: PieceGedMeta[], deps: DepsLectureGed): Promise<{ valeur: BestOfValeur; cachable: boolean }> {
  const indisGed: string[] = []; let echecTelechargement = false;
  let ged: Awaited<ReturnType<typeof lireGedPermis>>;
  try { ged = await lireGedPermis(dossierId, deps); }
  catch (e) { indisGed.push('contenu'); console.error(`[best-of] source indisponible: contenu`, { dossierId, message: e instanceof Error ? e.message : String(e) }); ged = { pieces: [] } as unknown as Awaited<ReturnType<typeof lireGedPermis>>; echecTelechargement = true; }
  // Un échec de TÉLÉCHARGEMENT/EXTRACTION d'une pièce (motif « échec … ») rend le calcul NON cachable (prudence P1).
  if (ged.pieces.some((g) => g.motif != null && (g.motif.startsWith('échec de lecture') || g.motif.startsWith('échec d’extraction')))) echecTelechargement = true;
  const texteParId = new Map(ged.pieces.map((p) => [p.id, p.pages.filter((x) => x.aTexte).map((x) => x.texte)] as const));
  const proposeesAutres = classerPiecesParFamille(piecesPdf, (p) => familleDeContenu(texteParId.get(p.id) ?? []));
  const niveauxParId = new Map<number, string[]>(); // PROV : niveaux portés par une planche d'ÉTAGE (RDC/SSOL/R+n), quand connus par le CONTENU
  for (const p of proposeesAutres.proposees) if (p.famille === 'etage') { const niv = niveauxDeContenu(texteParId.get(p.id) ?? []); if (niv.length) niveauxParId.set(p.id, niv); }
  // PROJ-3d/3f — CONFIRMATION PARESSEUSE (shortlist plafonnée) : éclate chaque candidat en PLANCHES + échelle. Texte SEUL. Dégradation propre.
  const confirmations = new Map<number, { planches: { page: number; echelle: string | null; tracable: boolean; famille: FamillePlan; ambigu: boolean }[] }>();
  await Promise.all(proposeesAutres.proposees.slice(0, PLAFOND_SHORTLIST).map(async (p) => {
    try {
      const ex = await deps.extraire(await deps.lireObjet(p.cleStockage), p.typeMime);
      if (!ex.ok) { indisGed.push(`texte:${p.id}`); console.error(`[best-of] texte pièce ${p.id} illisible`, { motif: ex.motif }); return; } // contenu illisible = DÉTERMINISTE (cachable)
      const planches = pagesPlanches(ex.pages).map((pg) => {
        const tp = tracabilitePlanche(p.famille, ex.pages[pg - 1] ?? '');
        return { page: pg, echelle: lireEchelleTexte(ex.pages[pg - 1] ?? ''), tracable: tp.tracable, famille: tp.famille, ambigu: tp.ambigu };
      });
      confirmations.set(p.id, { planches });
    } catch (e) { indisGed.push(`texte:${p.id}`); console.error(`[best-of] confirmation pièce ${p.id} indisponible`, { message: e instanceof Error ? e.message : String(e) }); echecTelechargement = true; } // téléchargement raté = possiblement TRANSITOIRE → non cachable
  }));
  // ÉTAPE 3 (LOT 66) — CATÉGORIE « Cerfa » PAR CONTENU (n° 13409), lecture de TÊTE (≤3 pages) : RÉUTILISE le texte DÉJÀ extrait par
  //   lireGedPermis (jamais un re-téléchargement). Déterministe (Set, indépendant de l'ordre).
  const cerfaIds = new Set<number>();
  const gedParId = new Map(ged.pieces.map((g) => [g.id, g] as const));
  for (const p of piecesPdf) {
    const g = gedParId.get(p.id);
    if (g && estPieceCerfaPc(g.pages.slice(0, 3).map((pg) => pg.texte))) cerfaIds.add(p.id);
  }
  const valeur: BestOfValeur = { proposees: proposeesAutres.proposees, autres: proposeesAutres.autres, niveauxParId, confirmations, cerfaIds, indisGed };
  return { valeur, cachable: !echecTelechargement };
}
