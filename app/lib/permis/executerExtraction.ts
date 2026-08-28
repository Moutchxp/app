import 'server-only';
import { query } from '../db/client';
import { lireGedPermis, depsReellesLectureGed } from './lectureGed';
import { extraireCandidats } from './extractionCaracteristiques';
import { decisionChamps } from './decisionChamps';
import { ecrireChamps } from './ecritureChamps';
import { lireChampsFormulaire } from './champsFormulaire';
import { decisionCerfa, type ChampCerfa } from './decisionCerfa';
import { ecrireCerfa } from './ecritureCerfa';
import { decisionDesignation, type PagePermis } from './decisionDesignation';
import { ecrireDesignation } from './ecritureDesignation';
import { decisionLots } from './decisionLots';
import { decisionNiveaux } from './decisionNiveaux';
import { ecrireNiveaux } from './ecritureNiveaux';
import { decisionParcelles, type ParcelleSitadel } from './decisionParcelles';
import { ecrireParcelles, figerEmpreinte, figerBatiSnapshot } from './parcellesRepo';
import { lireCerfaScan, lecteurMistral } from './lireCerfaScan';
import { ecrireCerfaScan } from './ecritureCerfaScan';
import { trouverCerfaPc } from './identifierCerfa'; // LECT-1 (A) : Cerfa identifié par CONTENU (13409), jamais par nom de fichier

/**
 * EXT-1 (étape 2) — POINT D'ENTRÉE UNIFIÉ de l'extraction des caractéristiques d'UN permis. Rejoue, dans le bon ordre, le pipeline
 * jusqu'ici éclaté entre les CLI de banc :
 *   1. champs mesurés du TEXTE (motifs) → corps                       (ecrire-champs)
 *   2. Cerfa AcroForm → colonnes déclarées (surface/logements/adresse) (ecrire-champs, source Cerfa)
 *   3. désignation de l'opération (énoncé)                             (ecrire-champs, N10-H)
 *   4. tableau de NIVEAUX → corps — SUPERSÈDE plancher/sommet (donc APRÈS le pas 1) (ecrire-niveaux)
 *   5. PARCELLES cadastrales (+ empreinte attendue + snapshot bâti)    (ecrire-parcelles)
 *   6. si `avecVision` : Cerfa SCANNÉ lu par OCR + vision Mistral      (ecrire-cerfa-scan)
 *
 * 🔒 INVARIANT (confirmé) : chaque écriture est en origine 'extraite' → une valeur 'saisie' n'est JAMAIS écrasée (invariant 103,
 *   porté par caracteristiquesRepo). Cette étape 2 ne pose PAS encore la couche candidates/conflit (étape 3) : elle écrit ce qui
 *   remplit un champ VIDE et laisse intacte toute saisie. AUCUN envoi/relève. La vision (Mistral) est un appel EXTERNE, isolé en
 *   try/catch : son échec ne fait jamais échouer le reste du pipeline. Renvoie un compte rendu (champs retenus, pièces sans
 *   candidat, vision tournée oui/non + nb pièces) — « rien trouvé » est un RÉSULTAT LÉGITIME, jamais une erreur.
 */
export interface CompteRenduExtraction {
  ok: boolean;
  numDau: string | null;
  champsRetenus: number;       // valeurs role='retenue' au journal après la passe (source fiable, indépendante des écrivains)
  nbPieces: number;            // pièces GED lues
  piecesSansCandidat: number;  // pièces sans aucun candidat (muettes/OCR ou texte sans motif)
  visionTournee: boolean;
  visionPieces: number;        // pièces envoyées à la vision (0 si non tournée)
  motifVision: string | null;  // pourquoi la vision n'a pas tourné (non demandée / pas de Cerfa scanné / indisponible)
}

/** Surface créée de Sitadel (corroboration). */
async function lireSurfCreee(dossierId: number): Promise<number | null> {
  const { rows } = await query<{ surf: string | number | null }>(`SELECT surf_creee AS surf FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const v = rows[0]?.surf;
  return v === null || v === undefined ? null : Number(v);
}
async function lireAdresseTerrainSitadel(dossierId: number): Promise<{ numero: string | null; voie: string | null; localite: string | null } | null> {
  const { rows } = await query<{ numero: string | null; voie: string | null; localite: string | null }>(
    `SELECT adr_num_ter AS numero, adr_libvoie_ter AS voie, adr_localite_ter AS localite FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  return rows[0] ?? null;
}

export async function executerExtractionPermis(dossierId: number, opts: { avecVision: boolean; majPar: string }): Promise<CompteRenduExtraction> {
  const meta = await query<{ num_dau: string; code_insee: string }>(`SELECT num_dau, code_insee FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const m = meta.rows[0];
  if (!m) return { ok: false, numDau: null, champsRetenus: 0, nbPieces: 0, piecesSansCandidat: 0, visionTournee: false, visionPieces: 0, motifVision: 'dossier inconnu' };

  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(dossierId, deps);
  const candidats = extraireCandidats(ged);

  // 1) champs mesurés du texte (motifs) → corps
  await ecrireChamps(dossierId, decisionChamps(candidats), opts.majPar);

  // 2) Cerfa AcroForm → colonnes déclarées (source Cerfa)
  const metas = await deps.listerPieces(dossierId); // réutilisé pour la vision (identification du Cerfa par contenu)
  const champsCerfa: ChampCerfa[] = [];
  for (const p of metas) {
    let buf: Buffer;
    try { buf = await deps.lireObjet(p.cleStockage); } catch { continue; } // pièce illisible → ignorée, jamais un échec
    for (const c of await lireChampsFormulaire(buf)) champsCerfa.push({ nom: c.nom, valeur: c.valeur, page: c.page, pieceNom: p.nomFichier });
  }
  // LECT-1 (C) — repli TEXTE si l'AcroForm est vide (Cerfa scanné). On lit le texte du DOSSIER ENTIER, pas le seul PDF Cerfa : le
  //   scan mange les chiffres (« 2 1 logements »), mais la valeur du projet est CORROBORÉE des dizaines de fois dans les pièces
  //   (désignation, notices, titres) → le MODE corroboré la retrouve, là où le Cerfa scanné seul échouerait. La pièce citée en
  //   provenance reste le Cerfa identifié par contenu (l'origine déclarative). Gate : uniquement si `champsCerfa` est vide.
  const cerfaPiece = champsCerfa.length === 0 ? trouverCerfaPc(ged, metas) : null;
  const texteDossier = ged.pieces.flatMap((p) => p.pages.filter((y) => y.aTexte).map((y) => y.texte)).join('\n');
  // PROV-3 (3) — pages du Cerfa (page-aware) pour attribuer une SOURCE PRÉCISE (pièce + page) aux sous-destinations candidates.
  const pagesCerfa = cerfaPiece ? (ged.pieces.find((x) => x.id === cerfaPiece.id)?.pages.filter((y) => y.aTexte).map((y) => ({ page: y.page, texte: y.texte })) ?? []) : [];
  const cerfaTexte = cerfaPiece ? { texte: texteDossier, pieceNom: cerfaPiece.nomFichier, page: null, pages: pagesCerfa } : null;
  await ecrireCerfa(dossierId, decisionCerfa(champsCerfa, await lireSurfCreee(dossierId), await lireAdresseTerrainSitadel(dossierId), cerfaTexte), opts.majPar);

  // 3) désignation de l'opération (énoncé, niveau permis)
  const pages: PagePermis[] = ged.pieces.flatMap((p) => p.pages.filter((pg) => pg.aTexte).map((pg) => ({ piece: p.nomFichier, page: pg.page, texte: pg.texte })));
  await ecrireDesignation(dossierId, decisionDesignation(pages), opts.majPar);

  // 4) tableau de NIVEAUX → corps (SUPERSÈDE plancher/sommet — DOIT venir APRÈS le pas 1).
  const lots = decisionLots(ged, candidats);
  const fc: Record<string, { valeur: number; piece: string }> = {};
  for (const l of lots.lots) if (l.nbEtages) fc[l.repere] = { valeur: l.nbEtages.valeur, piece: l.nbEtages.sources[0]?.piece ?? '?' };
  await ecrireNiveaux(dossierId, decisionNiveaux(ged, fc), opts.majPar);

  // 5) PARCELLES cadastrales (Cerfa T2 fait foi, Sitadel corrobore ; rattachement CERTAIN, sinon idu null + réserve) + empreinte + bâti.
  const sit = await query<{ s1: string | null; n1: string | null; s2: string | null; n2: string | null; s3: string | null; n3: string | null }>(
    `SELECT sec_cadastre1 AS s1, num_cadastre1 AS n1, sec_cadastre2 AS s2, num_cadastre2 AS n2, sec_cadastre3 AS s3, num_cadastre3 AS n3 FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const sr = sit.rows[0] ?? {};
  const sitadelP: ParcelleSitadel[] = ([[sr.s1, sr.n1], [sr.s2, sr.n2], [sr.s3, sr.n3]] as [string | null, string | null][])
    .filter(([s, n]) => s && n).map(([s, n]) => ({ section: s as string, numero: n as string }));
  await ecrireParcelles(dossierId, decisionParcelles(champsCerfa, sitadelP, m.num_dau, m.code_insee).parcelles, opts.majPar);
  await figerEmpreinte(dossierId, opts.majPar).catch(() => undefined);      // géométrie : best-effort, jamais bloquant
  await figerBatiSnapshot(dossierId, opts.majPar).catch(() => undefined);

  // 6) VISION Mistral (Cerfa 13409 SCANNÉ) — seulement si demandé ; appel EXTERNE isolé.
  let visionTournee = false, visionPieces = 0, motifVision: string | null = opts.avecVision ? null : 'vision non demandée';
  if (opts.avecVision) {
    // LECT-1 (A) — Cerfa identifié par son CONTENU (n° 13409 en tête), jamais par son nom de fichier (noms opaques côté mairie).
    //   Réutilise le texte déjà lu (ged) + les métadonnées (metas) → aucune lecture supplémentaire.
    const piece = trouverCerfaPc(ged, metas);
    if (!piece) motifVision = 'aucun Cerfa 13409 identifié dans les pièces';
    else {
      try {
        const pdf = await deps.lireObjet(piece.cleStockage);
        const lectures = await lireCerfaScan(pdf, lecteurMistral());
        await ecrireCerfaScan(dossierId, piece.nomFichier, lectures, opts.majPar, false);
        visionTournee = true; visionPieces = 1; // ciblée sur LE Cerfa (les pages du triage sont envoyées à l'API)
      } catch (e) { motifVision = `vision indisponible : ${(e as Error)?.message ?? 'erreur'}`; }
    }
  }

  // Compte rendu — champs RETENUS au journal (fiable, indépendant des formes de retour de chaque écrivain).
  const cr = await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_extraction_journal WHERE dossier_id = $1 AND role = 'retenue'`, [dossierId]);
  return {
    ok: true, numDau: m.num_dau,
    champsRetenus: cr.rows[0]?.n ?? 0,
    nbPieces: candidats.bilan.nbPieces,
    piecesSansCandidat: candidats.bilan.piecesSansCandidat.length,
    visionTournee, visionPieces, motifVision,
  };
}
