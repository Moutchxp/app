'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import {
  calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, cadreDeAnneaux, residusParPoint,
  levierCalage, etatLevier, inverseSimilitude, echelleImpliciteMParPt,
  appliquerAjustement, inverseAjustement, ajustementIdentite, resumeAjustement, ECHELLE_MIN, ECHELLE_MAX,
  inverseDepuisBoite, projeterDansBoite, ecranVersCanvas, estClic, rotePoint, type Boite, type PaireCalage, type PointPlan, type PointLambert, type VerdictCalage, type VerdictVraisemblance, type Debordement, type Ajustement,
} from '../../../../lib/permis/calageEmprise';
import { deplacerSommet, insererSommet, supprimerSommet, sommetProche, bordProche, type ResultatRetouche } from '../../../../lib/permis/retoucheEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree, PolygoneBdTopo, ObjetContexte } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments, libelleBatiment, statutEmpriseBatiment, etapeChaineEmprise, etatEnteteProjection, MOT_STATUT_EMPRISE, type BatimentProjection, type VerdictProjection } from '../../../../lib/permis/projectionBatiments'; // NOM-1 : libelleBatiment ; source unique de statut d'emprise ; ①③ chaîne + en-tête
import { HAUTEUR_CADRE_RENDU, BandeauCalage, IndicateurEcartement, PanneauAjustement, BandeauAjustementCompact, DemarrageAjustementCompact, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, affichageTrace, ListePiecesAnalyse, etatAnalyseIA, BandePlans, construireBandePlans, bornerIndex, cibleBestOf, indexSuivant, indexPrecedent, guideCalageSousSchema, NavPieceLibre, bornerPage, messageVerrou, noteFamille, OptionsVisibiliteSchema, compterBatimentsPermis, SelectionPolygonesProjet, BlocProjetRepliable, BlocExistantsRepliable, attribuerReperes, RotationSchema, ZoomPdf, guidageTrace, GuidageTraceBox, accesTrace, RepereQualiteCalage, AdoptionGroupes, ConfirmationAdoption, LegendeProjectionEmprises, legendeProjection, etiquettesProjection, FILTRES_SCHEMA_DEFAUT, type FiltresSchema, type GroupeAdoptionVue, type BatimentAdoptionVue, type Plan, type EtatAnalyseIA } from './TraceEmpriseRendu';
import { familleDeNom, estTracable, type FamillePlan } from '../../../../lib/permis/planMasse';
import { LiseusePieces, type DonneesLiseuse } from './LiseusePieces'; // LOT 90 — liseuse LECTURE SEULE autonome ; P3 — partage de la donnée /emprise (anti-doublon)
import { BandeauSelection } from './TraceEmpriseRendu'; // PL-C4 — bandeau « sélection validée » sous le curseur Rotation
import { bandeAvecOverrides, appliquerDeblocageTracable, etatDeblocagePage, statutPageAnalyse, resumePagesAnalysees } from './TraceEmpriseRendu'; // INCRÉMENT-2 — best-of overrides + statut/résumé de page (barre partagée) + déblocage manuel de traçabilité
import { BarreVisionneusePieces } from './BarreVisionneusePieces'; // INCRÉMENT-2 — barre de commandes PARTAGÉE avec la planche
import type { RunReperageAffiche } from '../../../../lib/permis/reperePlanchesRepo';
import type { LecturePageAffiche } from '../../../../lib/permis/lectureValeursPageRepo';
import { jourParisISO } from '../../../../lib/permis/horodatageParis';
import type { SelectionInfo } from '../../../../lib/permis/plancheParcellesRepo';
import { statutCourantParCleabs, type LigneStatutPolygone, type PolygoneRecouvert } from '../../../../lib/permis/polygoneStatut'; // RATT-1 (2) ; RATT-5 : recouvert + taux

/**
 * PROJ-2b — BLOC de tracé d'emprise INTÉGRÉ au détail d'un dossier de Rattachement, BÂTIMENT PAR BÂTIMENT. Le dossier vient de la
 * ligne (aucune saisie), les bâtiments viennent du permis (`batiments`). Pour chaque bâtiment : tracer une emprise OU ignorer la
 * projection (motif obligatoire, réversible). Le verdict (peut-on valider ?) remonte au parent via `onVerdict`, qui désactive le
 * bouton Valider. 🔴 Géométrie du module PUR `calageEmprise` (les handlers ne font que POSER l'état) ; enregistrement recalculé serveur.
 */

// PROJ-3d/3f — la pièce porte la PROPOSITION « plan de masse » (score par nom) + ses PLANCHES (pages hors cartouche, confirmées serveur).
interface Piece { id: number; nomFichier: string; typeMime: string | null; propose?: boolean; famille?: FamillePlan | null; planches?: { page: number; echelle: string | null; tracable?: boolean; famille?: FamillePlan; ambigu?: boolean }[]; confirme?: boolean; cerfa?: boolean; niveaux?: string[] }
interface Contexte { empreinteAnneaux: [number, number][][] | PointLambert[][]; surfaceTerrainM2: number | null; surfacePlancherM2: number | null; batiments: { corpsId: number; nbEtages: number | null; empriseM2: number | null }[] }
type Mode = 'calage' | 'trace';
// `ratio` = INSTANTANÉ au re-rendu (canvas.width / largeur affichée AU MOMENT DU RENDU) — conservé comme REPLI (aucune régression aux
//   largeurs re-rendues). `largeurCanvasPx` = nombre de pixels-device du canvas (canvas.width). Couplé à la largeur AFFICHÉE lue EN DIRECT
//   (`largeurCanvasCss`, observée), il donne le RATIO D'AFFICHAGE LIVE des repères (versCss) → exact à N largeurs, y compris non re-rendues.
type Apercu = { vp: { convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] }; ratio: number; largeurCanvasPx: number };

const BOITE_L = 300, BOITE_H = 230, BOITE_MARGE = 12;
const SEUIL_SOMMET_BOITE = 12; // PROJ-3s — rayon de capture d'un sommet au clic (unités de la boîte du schéma) : cible TACTILE, pas un seuil métier.
// PROJ-3t — la capture des poignées est décidée DANS le schéma (il connaît le rayon réel des bulles, proportionnel au viewBox). Ici ne reste que
//   le FACTEUR de déport des poignées (multiple du « rayon » de l'emprise = distance du sommet le plus loin au centre) : > 1 → hors du polygone,
//   assez pour que la bulle agrandie NE MASQUE PAS le dessin, avec une tige visible. Constante nommée.
const FACTEUR_POIGNEE_AJUSTEMENT = 1.4;
type ModeRetouche = 'deplacer' | 'inserer' | 'supprimer';

export function BlocTraceEmprise({ dossierId, onVerdict, rafraichir = 0, avecLiseuse = true, onValeurLue, onEmprisesChange, onEntete, onDonneesLiseuse }: {
  dossierId: number;
  onVerdict?: (v: VerdictProjection) => void;
  onEntete?: (etat: { ton: 'vert' | 'rouge'; texte: string }) => void; // ③ COMPLÉMENT — état de l'en-tête « Bâtiments et projection » (validée / ce qui manque) remonté au parent pour le titre repliable
  onDonneesLiseuse?: (d: DonneesLiseuse) => void; // P3 (perfo) — remonte au parent la donnée /emprise déjà chargée pour qu'un frère (liseuse de la planche) la réutilise au lieu d'un 2e GET
  onEmprisesChange?: () => void; // une MUTATION d'emprise (enregistrement / suppression / adoption / retouche) a changé la base → le
                                 //   parent re-fetche CaracteristiquesBloc (capsule d'emprise du cartouche). Jamais appelé au chargement.
  rafraichir?: number; // PROJ-3b — signal du parent : incrémenté quand l'instruction change (ajout de bâtiment) → recharge la liste
                       //   DÉFAUT 0 (jamais undefined) : le tableau de dépendances de l'effet garde une TAILLE CONSTANTE (PROJ-3b-fix ③).
  avecLiseuse?: boolean; // LOT 90 — à 0 bâtiment, monter la liseuse LECTURE SEULE (consultation des plans). `false` là où une liseuse
                         //   STANDALONE existe déjà sur le même écran (En cours : famille « Pièces du permis ») → jamais deux liseuses.
  onValeurLue?: () => void; // pass-through : la liseuse embarquée signale une valeur lue/annulée par « analyse de la page » → le parent
                            //   re-fetche CaracteristiquesBloc. Ne touche RIEN au tracé/canvas.
}) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [piecesNonSupportees, setPiecesNonSupportees] = useState<{ id: number; nomFichier: string; motif: string }[]>([]); // BUG « voir toutes les pièces » — non affichables listées AVEC motif
  // INCRÉMENT-2 — état de la BARRE de commandes partagée (best-of overrides + audits d'analyse IA), lu du MÊME GET /emprise. N'interfère
  //   NI avec le canvas NI avec le calage/tracé : purement autour de l'aperçu. Le best-of visible = bande auto − retraits + ajouts.
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [inclus, setInclus] = useState<Set<string>>(new Set());
  const [debloques, setDebloques] = useState<Set<string>>(new Set()); // DÉBLOCAGE MANUEL — pages (pieceId:page) rendues traçables à la main (persistées)
  const [deblocageDemande, setDeblocageDemande] = useState<{ pieceId: number; page: number } | null>(null); // page en attente de confirmation d'un déblocage (avertissement affiché)
  const [reverrouDemande, setReverrouDemande] = useState<{ pieceId: number; page: number; nbEmprises: number } | null>(null); // retrait en attente de confirmation (emprise(s) liée(s))
  const [runs, setRuns] = useState<Record<number, RunReperageAffiche>>({});
  const [lectures, setLectures] = useState<Record<number, LecturePageAffiche[]>>({});
  const [origineSansIa, setOrigineSansIa] = useState<'auto' | 'manuelle' | null>(null);
  const [reperEnCours, setReperEnCours] = useState(false);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [reperMsg, setReperMsg] = useState<string | null>(null);
  const [lectureRes, setLectureRes] = useState<{ cle: string; texte: string; ecrit: boolean; echec?: boolean } | null>(null);
  const [pleinPagesAnalysees, setPleinPagesAnalysees] = useState(false);
  const [batiments, setBatiments] = useState<BatimentProjection[]>([]);
  const [emprises, setEmprises] = useState<EmpriseReconstruite[]>([]);
  const [validationParCorps, setValidationParCorps] = useState<Record<number, boolean>>({}); // VALIDATION PAR BÂTIMENT (corpsId → validée) : pastille + bandeau dérivent des MÊMES faits que la capsule du cartouche
  const [altitudeValideeParCorps, setAltitudeValideeParCorps] = useState<Record<number, boolean>>({}); // ③ COMPLÉMENT — altitude de sommet validée par bâtiment : avec l'emprise, décide l'en-tête « Projection(s) validée(s) »
  const [donneesLiseuse, setDonneesLiseuse] = useState<DonneesLiseuse | null>(null); // P3 (perfo) — sous-ensemble /emprise partagé avec la liseuse embarquée (0 bâtiment) ET remonté au parent (liseuse de la planche) → anti-doublon
  const [ignores, setIgnores] = useState<ProjectionIgnoree[]>([]);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [polygones, setPolygones] = useState<PolygoneBdTopo[]>([]); // PROJ-3h — polygones BD TOPO (∩ empreinte) + état, pour l'affichage
  const [filtres, setFiltres] = useState<FiltresSchema>(FILTRES_SCHEMA_DEFAUT); // options de visibilité du schéma
  const [voisinage, setVoisinage] = useState<ObjetContexte[]>([]); // PROJ-CTX — contexte (parcelles voisines + bâti dans le rayon), chargé SEULEMENT si l'interrupteur est allumé
  const [ecartes, setEcartes] = useState<string[]>([]); // PROJ-3i — cleabs des polygones « en projet » écartés (persistés)
  const [statutsLignes, setStatutsLignes] = useState<LigneStatutPolygone[]>([]); // RATT-1 (2) — registre append-only des statuts décidés
  const [recouverts, setRecouverts] = useState<PolygoneRecouvert[]>([]); // RATT-1 (2) / RATT-5 — polygones recouverts (au-dessus du seuil) + leur taux (%)
  // PL-C4 — sélection validée (superposition) : bandeau + retrait à deux temps (geste délibéré, RECALCULE l'empreinte).
  const [selection, setSelection] = useState<SelectionInfo>({ active: false, idus: [], validePar: null, valideLe: null, acteurNom: null });
  const [confirmeSel, setConfirmeSel] = useState(false);
  const [occupeSel, setOccupeSel] = useState(false);
  const [pleinEcran, setPleinEcran] = useState(false); // PROJ-3i — agrandissement du schéma
  // PROJ-AGR — agrandissement INTERACTIF de la visionneuse (« tracer en grand ») : la grille du workspace passe en plein écran (CSS),
  //   le canvas SE RE-REND à sa nouvelle largeur → apercu/ratio recalculés POUR CETTE VUE (cf. effet d'auto-affichage). afficherPage et
  //   cliquerPdf restent INCHANGÉS : un point posé en grand tombe au MÊME endroit géométrique qu'en petit (démontré dans agrandissement.filet.test.ts).
  const [imageAgrandie, setImageAgrandie] = useState(false);
  // LOT 3 — NIVEAU 3 : le PLAN SEUL en plein écran, TRACÉ actif, calage indisponible (pas de schéma). S'ouvre DEPUIS le niveau 2 et y
  //   revient. Réutilise le MÊME canvas/pdfContainerRef/cliquerPdf/apercu que les niveaux 1-2 (aucun 3e rendu pdf.js) ; seul le layout change.
  const [planSeul, setPlanSeul] = useState(false);
  // LOT 3 — largeur AFFICHÉE (mise en page, NON zoomée) du cadre du plan, lue EN DIRECT par un ResizeObserver (cf. effet plus bas). Source
  //   de justesse des REPÈRES (versCss) à N largeurs : le ratio d'affichage = apercu.largeurCanvasPx / largeurCanvasCss. `null` tant que non
  //   mesurée → versCss retombe sur apercu.ratio (byte-identique aux largeurs re-rendues → aucune régression niveaux 1-2).
  const [largeurCanvasCss, setLargeurCanvasCss] = useState<number | null>(null);
  // LOT « calage avant tracé » — clé de la page à laquelle appartient le calage/tracé EN COURS. Sert à INVALIDER le calage quand la page
  //   change (règle métier : un calage n'est valable que pour UNE page). Ajustée PENDANT LE RENDU (pas d'effet), cf. le bloc convergent plus bas.
  const [clePageTrace, setClePageTrace] = useState('');
  const [angle, setAngle] = useState(0); // PROJ-3j — rotation du schéma (0-360°), AFFICHAGE seulement, éphémère (non persistée)
  const [corpsSel, setCorpsSel] = useState<number | null>(null);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [ratioDeclareSaisi, setRatioDeclareSaisi] = useState('');
  const [mode, setMode] = useState<Mode>('calage');
  const [paires, setPaires] = useState<PaireCalage[]>([]);
  const [planEnAttente, setPlanEnAttente] = useState<PointPlan | null>(null);
  const [sommets, setSommets] = useState<PointPlan[]>([]);
  // FIX « ascenseur du guide » — la POSITION du bloc « Étape 1 — caler la vue » suit l'EXISTENCE d'un travail en cours, PAS le dernier
  //   côté cliqué. `creationEnCours` s'arme dès qu'un point est posé (calage amorcé ou sommet tracé) et se désarme À LA VALIDATION du
  //   polygone (où les paires de calage sont, elles, CONSERVÉES → un simple `paires>0` ne suffirait pas à distinguer « en cours » de
  //   « validé »). Combiné à l'état de travail réel (voir `procEnCours`), toute remise à zéro (Reprendre / Recommencer / annuler) ramène
  //   le guide à sa place initiale sans avoir à toucher chaque handler. On NE touche PAS cliquerPdf (conversion de coordonnées, gelée).
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [debordement, setDebordement] = useState<Debordement | null>(null); // repère « débordement hors parcelle » (serveur), live + après enregistrement
  // PROJ-3r — adoption : groupes automatiques (serveur), affectation cleabs→bâtiment (transient), groupes scindés, confirmation par bâtiment.
  const [groupesAdoption, setGroupesAdoption] = useState<GroupeAdoptionVue[]>([]);
  const [affectation, setAffectation] = useState<Record<string, number>>({});
  const [scindes, setScindes] = useState<number[]>([]);
  const [confirmationAdoption, setConfirmationAdoption] = useState<{ batiments: BatimentAdoptionVue[] } | null>(null);
  // PROJ-3s — RETOUCHE d'une emprise existante : id + contour Lambert en cours + historique (annuler) ; mode + sommet sélectionné.
  const [retouche, setRetouche] = useState<{ id: number; anneau: PointLambert[]; hist: PointLambert[][] } | null>(null);
  const [modeRetouche, setModeRetouche] = useState<ModeRetouche>('deplacer');
  const [sommetSel, setSommetSel] = useState<number | null>(null);
  const [motifIgnore, setMotifIgnore] = useState('');
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  // PROJ-3b-fix ② — TROIS états de chargement distincts : une panne ne doit JAMAIS s'afficher comme « 0 bâtiment ».
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [rechargeLocal, setRechargeLocal] = useState(0); // bouton « Recharger » de la carte d'échec (taille de deps constante)
  // PROJ-3e — l'unité manipulée est LE PLAN : on feuillette une bande ordonnée (ordre de pertinence PROJ-3d), sans changer de fichier ni de page.
  const [planIndex, setPlanIndex] = useState(0);
  const [avertissement, setAvertissement] = useState<{ faire: () => void } | null>(null); // action différée quand un tracé/calage est en cours
  const [pleinListe, setPleinListe] = useState(false); // repli « voir toutes les pièces du dossier » (escape hatch, jamais un cul-de-sac)
  // PROJ-3f ① — DEUX navigations DISTINCTES : 'bestof' (bande des plans proposés) et 'piece' (feuilleter les pages d'une pièce ouverte au repli).
  const [nav, setNav] = useState<'bestof' | 'piece'>('bestof');
  const [nbPagesPiece, setNbPagesPiece] = useState(1); // nb de pages de la pièce courante (borne la nav pièce) — connu au rendu pdfjs, à la demande
  // PROJ-3l — ZOOM (1 = ajusté) + DÉPLACEMENT (pan, px) du PDF de gauche. AFFICHAGE seulement ; réinitialisés au changement de plan.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null); // conteneur NON transformé (repère du clic)
  const dragRef = useRef<{ x0: number; y0: number; panX: number; panY: number; bouge: boolean } | null>(null);
  const cartoucheActifRef = useRef<HTMLButtonElement>(null); // LOT 3 (enchaînement) — cartouche actif de la BANDE du niveau 3, pour l'amener dans la vue par défilement.
  // INCRÉMENT-2 — best-of VISIBLE = bande auto − retraits + ajouts (mêmes overrides que la planche). Touche la NAVIGATION (quel plan est
  //   proposé), JAMAIS le viewport ni la conversion de coordonnées.
  const bande = useMemo(() => appliquerDeblocageTracable(bandeAvecOverrides(construireBandePlans(pieces), pieces, exclus, inclus), debloques), [pieces, exclus, inclus, debloques]);
  // DEMANDES 2/3 — la liste « voir toutes les pièces » (partagée avec la planche via ListePiecesAnalyse) a besoin de l'état d'analyse IA
  //   par pièce (repérage LOT 62 + lectures LOT 95) et de l'ensemble des pièces au best-of (pour le marquage bleu). Mêmes calculs que la planche.
  const analyseParPiece = useMemo<Record<number, EtatAnalyseIA>>(() => {
    const out: Record<number, EtatAnalyseIA> = {};
    const ids = new Set<number>([...Object.keys(runs).map(Number), ...Object.keys(lectures).map(Number)]);
    for (const id of ids) {
      const r = runs[id];
      const e = etatAnalyseIA({ reperage: r ? { nbPlanches: r.nbPlanches, creeLe: r.creeLe } : undefined, lectures: (lectures[id] ?? []).map((l) => ({ envoyee: l.envoyee, creeLe: l.creeLe })) }, (iso) => jourParisISO(iso));
      if (e) out[id] = e;
    }
    return out;
  }, [runs, lectures]);
  const piecesBestOf = useMemo(() => new Set(bande.map((pl) => pl.pieceId)), [bande]); // DEMANDE 3 — ≥ 1 page au best-of → marquage bleu
  // PROJ-3g/3m — FAMILLE + TRAÇABILITÉ de la page courante. En best-of, la traçabilité est calculée PAR PAGE côté serveur (une planche
  //   de niveau d'une pièce PC3 est traçable) ; en pièce libre, on retombe sur la famille du NOM. `verrou` = pourquoi c'est bloqué ;
  //   `ambiguCourant` = classement incertain (traçable par défaut, mais on le DIT). Verrou revérifié serveur PAR PAGE à l'enregistrement.
  const entreeCourante = nav === 'bestof' && bande.length > 0 ? bande[bornerIndex(planIndex, bande.length)] : null;
  const familleCourante: FamillePlan | null = entreeCourante ? entreeCourante.famille : familleDeNom(pieces.find((p) => p.id === pieceId)?.nomFichier ?? '');
  // DÉBLOCAGE MANUEL — la PAGE COURANTE (best-of via entreeCourante, sinon pièce libre via pieceId/page) peut avoir été rendue traçable à la
  //   main. En best-of, `entreeCourante.tracable` intègre DÉJÀ le déblocage (via appliquerDeblocageTracable dans `bande`) ; en pièce libre,
  //   `estTracable` l'ignore → on ajoute explicitement `debloqueeCourante`. Ainsi calage/tracé s'ouvrent dans les DEUX modes par la même voie.
  const pageCouranteId = entreeCourante ? entreeCourante.pieceId : pieceId;
  const pageCourantePage = entreeCourante ? entreeCourante.page : page;
  const cleCourante = pageCouranteId != null ? `${pageCouranteId}:${pageCourantePage}` : null;
  const debloqueeCourante = cleCourante != null && debloques.has(cleCourante);
  const tracable = (entreeCourante ? entreeCourante.tracable : estTracable(familleCourante)) || debloqueeCourante;
  // Page traçable UNIQUEMENT grâce au déblocage manuel (→ mention + geste de retrait). Une planche par IMAGE reste hors périmètre.
  const debloqueManuelCourant = entreeCourante ? !!entreeCourante.debloqueManuel : (debloqueeCourante && !estTracable(familleCourante));
  const origineImageCourante = entreeCourante?.origine === 'image';
  const etatDeblocage = pageCouranteId != null ? etatDeblocagePage(tracable, debloqueManuelCourant, origineImageCourante) : 'aucun';
  const verrou = tracable ? null : messageVerrou(familleCourante);
  const ambiguCourant = entreeCourante?.ambigu ?? false;
  // PROJ-3m ② — GUIDAGE du geste (pur) : étape courante, quoi cliquer, combien de points restent, où (plan/schéma). Explicitation seule.
  const guidage = guidageTrace(mode, paires.length, planEnAttente !== null, sommets.length, tracable);
  // LOT « calage avant tracé » — ACCÈS au tracé (décision PURE) : indisponible tant que le calage de la page COURANTE n'est pas complet
  //   (2 paires plan↔schéma). État de SESSION (paires.length), jamais une donnée en base ; invalidé au changement de page (effet ci-dessous
  //   + handlers de navigation). `acces.disponible` conditionne l'accès au tracé (jamais la conversion de coordonnées, gelée) ; `acces.message`
  //   explique l'étape manquante là où s'affichent les autres empêchements. Le cas « aucun bâtiment » est en amont (branche 0 bâtiment).
  const acces = accesTrace(tracable, paires.length);
  // FIX « ascenseur » — la POSITION du guide suit l'EXISTENCE d'un travail, jamais le dernier côté cliqué (`guidage.sur`). Pattern React
  //   « ajuster l'état pendant le rendu » (PAS d'effet, PAS de setState en effet, PAS de modif de cliquerPdf gelé) : on ARME `creationEnCours`
  //   dès qu'un point est en cours de pose (`enPose`). Le `(creationEnCours || enPose)` donne déjà la bonne position DANS CE rendu. Le flag
  //   persiste l'état « en cours » quand la pose momentanée retombe (ex. paire complétée : planEnAttente repasse à null mais paires>0). Le
  //   désarmement se fait À LA VALIDATION (enregistrer, où les paires sont CONSERVÉES → indistinguables sans flag). Le ET avec le travail
  //   réel ramène le guide à sa place initiale à TOUTE remise à zéro (annuler / Reprendre / Recommencer / changement de plan).
  const enPose = planEnAttente !== null || sommets.length > 0;
  if (!creationEnCours && enPose) setCreationEnCours(true); // guardé (converge) : ne re-déclenche pas une fois armé
  const procEnCours = guideCalageSousSchema(creationEnCours, planEnAttente !== null, paires.length, sommets.length); // décision PURE (testée)

  // LOT « calage avant tracé » — INVALIDATION DU CALAGE AU CHANGEMENT DE PAGE/PIÈCE (règle métier : un calage n'est valable que pour UNE page).
  //   Pattern React RECOMMANDÉ « ajuster l'état pendant le rendu » (pas d'effet → pas de setState-in-effect, pas de flash) : dès que la clé
  //   (pieceId, page) DIFFÈRE de celle du calage courant, on vide paires/sommets/point en attente et on revient au mode 'calage'. GARANTIE
  //   ROBUSTE et indépendante des handlers de navigation (qui vident déjà, mais un chemin pourrait manquer — p. ex. le clamp de page dans
  //   afficherPage). CONVERGENT : `setClePageTrace` aligne la clé → au rendu suivant les clés sont égales, plus aucune remise à zéro. Les
  //   `if (…) set…` guardés évitent tout setState superflu quand un handler a déjà nettoyé. NE TOUCHE PAS à la conversion de coordonnées.
  const clePageCourante = `${pieceId ?? ''}:${page}`;
  if (clePageTrace !== clePageCourante) {
    setClePageTrace(clePageCourante);
    if (paires.length) setPaires([]);
    if (sommets.length) setSommets([]);
    if (planEnAttente) setPlanEnAttente(null);
    if (mode !== 'calage') setMode('calage');
    // creationEnCours n'est PAS remis ici (comme les handlers de navigation) : une fois paires/sommets/planEnAttente vidés,
    //   guideCalageSousSchema retombe à false → le guide repart de lui-même à sa place initiale « calage à faire ».
  }

  // Chargement (pièces PDF + emprises + ignorées + contexte) au changement de dossier.
  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement'); setMessage(null);
      try {
        const res = await fetch(`/api/admin/permis/emprise?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); setMessage('Bâtiments indisponibles (le serveur n’a pas répondu).'); return; }
        const j = await res.json() as { pieces: Piece[]; piecesNonSupportees?: { id: number; nomFichier: string; motif: string }[]; emprises: EmpriseReconstruite[]; ignores: ProjectionIgnoree[]; batiments: BatimentProjection[]; contexte: Contexte; polygones?: PolygoneBdTopo[]; polygonesEcartes?: string[]; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[]; selection?: SelectionInfo; indisponibles?: string[]; reperageRuns?: Record<number, RunReperageAffiche>; lecturesPages?: Record<number, LecturePageAffiche[]>; exclusionsBestOf?: { pieceId: number; page: number }[]; inclusionsBestOf?: { pieceId: number; page: number }[]; deblocagesTracable?: { pieceId: number; page: number }[]; validationParCorps?: Record<number, boolean>; altitudeValideeParCorps?: Record<number, boolean>; origineExtractionSansIa?: 'auto' | 'manuelle' | null };
        // Résilience serveur : « indisponible » ≠ « vide ». Si la lecture des BÂTIMENTS a échoué, on n'affiche JAMAIS « 0 bâtiment »
        //   (panne déguisée en donnée) → état d'échec explicite invitant à recharger.
        if (j.indisponibles?.includes('batiments')) { setEtat('erreur'); setMessage('Bâtiments indisponibles : rechargez.'); return; }
        setPieces(j.pieces); setPiecesNonSupportees(j.piecesNonSupportees ?? []); setEmprises(j.emprises); setIgnores(j.ignores); setBatiments(j.batiments ?? []); setContexte(j.contexte); setPolygones(j.polygones ?? []); setEcartes(j.polygonesEcartes ?? []); setStatutsLignes(j.statutsPolygones ?? []); setRecouverts(j.polygonesRecouverts ?? []); setSelection(j.selection ?? { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null }); setConfirmeSel(false); setAngle(0); setDebordement(null); setValidationParCorps(j.validationParCorps ?? {}); setAltitudeValideeParCorps(j.altitudeValideeParCorps ?? {});
        // INCRÉMENT-2 — audits d'analyse IA + overrides best-of (mêmes champs que la planche, déjà renvoyés par le GET).
        setRuns(j.reperageRuns ?? {}); setLectures(j.lecturesPages ?? {}); setOrigineSansIa(j.origineExtractionSansIa ?? null);
        setExclus(new Set((j.exclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`))); setInclus(new Set((j.inclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`)));
        setDebloques(new Set((j.deblocagesTracable ?? []).map((e) => `${e.pieceId}:${e.page}`))); setDeblocageDemande(null); setReverrouDemande(null);
        // P3 (perfo) — la MÊME réponse /emprise alimente aussi la LISEUSE (best-of). On la partage (état local pour la liseuse embarquée à
        //   0 bâtiment + remontée au parent pour la liseuse de la planche) → aucun 2e GET /emprise identique. Sous-ensemble strictement lu par la liseuse.
        setDonneesLiseuse({ pieces: j.pieces, piecesNonSupportees: j.piecesNonSupportees, exclusionsBestOf: j.exclusionsBestOf, inclusionsBestOf: j.inclusionsBestOf, reperageRuns: j.reperageRuns, lecturesPages: j.lecturesPages, origineExtractionSansIa: j.origineExtractionSansIa });
        // PROJ-3e — on ouvre DIRECTEMENT sur le 1er plan de la bande (le mieux classé) ; à défaut de plan proposé, la 1re pièce.
        const b = construireBandePlans(j.pieces);
        setNav('bestof'); setPlanIndex(0);
        setPieceId(b[0]?.pieceId ?? j.pieces[0]?.id ?? null);
        setPage(b[0]?.page ?? 1);
        // PROJ-3f (correction D) — bande PAUVRE (0 ou 1 planche) → on pré-déplie le repli pour offrir tout de suite l'accès à toute pièce/page.
        setPleinListe(b.length <= 1);
        setEtat('ok');
      } catch { if (!annule) { setEtat('erreur'); setMessage('Bâtiments indisponibles (erreur de chargement).'); } }
    })();
    return () => { annule = true; };
  }, [dossierId, rafraichir, rechargeLocal]);

  // PROJ-CTX — CONTEXTE (parcelles voisines + bâti dans le rayon config) chargé SEULEMENT quand l'interrupteur est ALLUMÉ. Éteint →
  //   on VIDE et on NE PART PAS en requête (aucun coût). Recharge quand l'empreinte change (rafraichir / rechargeLocal). setState
  //   uniquement dans le callback async (jamais synchrone dans l'effet). AbortController → réponse périmée ignorée.
  useEffect(() => {
    if (etat !== 'ok') return;
    const ctrl = new AbortController();
    void (async () => {
      // setState uniquement dans ce callback async (jamais synchrone dans le corps de l'effet). ÉTEINT → on VIDE et on RETURN
      //   AVANT le fetch : AUCUNE requête de contexte ne part quand l'interrupteur est décoché.
      if (filtres.contexte !== true) { setVoisinage([]); return; }
      try {
        const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ action: 'voisinage_contexte', dossierId }) });
        if (!res.ok) return;
        const j = await res.json() as { voisinage?: ObjetContexte[] };
        setVoisinage(j.voisinage ?? []);
      } catch { /* aborté / réseau : on n'invente aucun contexte */ }
    })();
    return () => ctrl.abort();
  }, [dossierId, filtres.contexte, etat, rafraichir, rechargeLocal]);

  // Bâtiment EFFECTIF (dérivé, PAS un effet) : la sélection d'Arno si elle vise un bâtiment réel, sinon le PREMIER en attente,
  // sinon le premier. Évite un setState-dans-effet (cascade de rendus) : la valeur se recalcule quand les entrées changent.
  const corpsEffectif = useMemo(() => {
    if (corpsSel !== null && batiments.some((b) => b.corpsId === corpsSel)) return corpsSel;
    const attente = batiments.find((b) => statutBatiment(b.corpsId, emprises, ignores) === 'attente');
    return (attente ?? batiments[0])?.corpsId ?? null;
  }, [corpsSel, batiments, emprises, ignores]);

  // LOT 3 (enchaînement) — au niveau 3, quand on change de bâtiment actif, amener SON cartouche dans la vue en faisant défiler la BANDE
  //   (jamais la page : block/inline 'nearest'). scrollIntoView est une opération DOM (pas un setState) → pas de cascade de rendus.
  //   Le ref n'est posé QUE sur le cartouche actif de la bande du niveau 3 : hors niveau 3 (bande absente) il vaut null → effet neutre.
  useEffect(() => {
    if (planSeul) cartoucheActifRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [corpsEffectif, planSeul]);

  // Verdict de projection → remonte au parent (bouton Valider). Mémoïsé : ne rejoue l'effet que si les entrées changent.
  const verdict = useMemo(() => verdictProjectionBatiments(batiments, emprises.map((e) => ({ corpsId: e.corpsId, provenance: e.provenance })), ignores.map((i) => i.corpsId)), [batiments, emprises, ignores]);
  // Agrégat PAR BÂTIMENT pour le bandeau (« M validés · K à valider ») — MÊME source unique statutEmpriseBatiment que la pastille et la capsule.
  const { nbValides, nbAValider } = useMemo(() => {
    let v = 0, a = 0;
    for (const b of batiments) {
      const st = statutEmpriseBatiment(emprises.some((e) => e.corpsId === b.corpsId), ignores.some((i) => i.corpsId === b.corpsId), validationParCorps[b.corpsId] ?? false);
      if (st === 'validee') v += 1; else if (st === 'a_valider') a += 1;
    }
    return { nbValides: v, nbAValider: a };
  }, [batiments, emprises, ignores, validationParCorps]);
  // PROJ-3b-fix ② — on ne remonte le verdict (donc le compteur « 0 bâtiment · 0 emprise ») QU'au succès du chargement :
  //   sur un échec, le parent ne doit pas afficher un « 0 » calculé sur une liste jamais chargée.
  useEffect(() => { if (etat === 'ok') onVerdict?.(verdict); }, [verdict, onVerdict, etat]);

  const parcelle: PointLambert[][] = useMemo(() => (contexte?.empreinteAnneaux ?? []).map((a) =>
    (a as unknown[]).map((p) => Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as PointLambert))), [contexte]);
  const boite: Boite | null = useMemo(() => { const c = cadreDeAnneaux(parcelle); return c ? { largeur: BOITE_L, hauteur: BOITE_H, marge: BOITE_MARGE, cadre: c } : null; }, [parcelle]);
  // PROJ-3i — repères A/B/C… (déterministes, ordre serveur) partagés par le schéma et le panneau de sélection ; boîte plus grande pour le plein écran.
  const polygonesReperes = useMemo(() => attribuerReperes(polygones), [polygones]);
  // RÈGLE ARNO — sous-ensemble DU PERMIS (parcelle dominante du permis) : c'est LUI qui alimente l'AFFECTATION (préservé/détruit), la
  //   LÉGENDE des emprises et les ÉTIQUETTES. Le SCHÉMA, lui, reçoit TOUS les polygones (les voisins restent dessinés en contexte, bleu).
  //   `appartientPermis` absent (payload/fixture ancien) = traité comme permis (comportement d'avant), jamais un écran vide par surprise.
  const polygonesPermis = useMemo(() => polygonesReperes.filter((p) => p.appartientPermis !== false), [polygonesReperes]);
  // PROJ-3r-fix — cleabs → repère (mêmes noms que la liste des polygones et le schéma) pour nommer les lignes de l'encart d'adoption.
  const reperesParCleabs = useMemo(() => Object.fromEntries(polygonesReperes.filter((p) => p.cleabs).map((p) => [p.cleabs as string, p.repere])), [polygonesReperes]);
  const boiteGrande: Boite | null = useMemo(() => { const c = cadreDeAnneaux(parcelle); return c ? { largeur: 680, hauteur: 520, marge: 18, cadre: c } : null; }, [parcelle]);
  // RÈGLE ARNO — les compteurs des cases « bâti existant » / « futur bâti » ne comptent QUE les bâtiments DU PERMIS (les mêmes qui
  //   portent une lettre) ; les voisins relèvent de « contexte » et n'y entrent pas.
  const comptesVisibilite = useMemo(() => compterBatimentsPermis(polygones), [polygones]);
  // PROJ-3i — fermeture du plein écran à la touche Échap (le clic hors zone est géré par le fond).
  useEffect(() => {
    if (!pleinEcran) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPleinEcran(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pleinEcran]);
  // PROJ-AGR — Échap réduit aussi l'agrandissement de l'image (jamais un piège plein écran sans sortie clavier). LOT 3 — mais PAS quand le
  //   niveau 3 (plan seul) est ouvert PAR-DESSUS : Échap ferme d'abord le niveau 3 (retour au niveau 2), pas les deux d'un coup. Le
  //   comportement du niveau 2 SEUL (planSeul=false) est INCHANGÉ.
  useEffect(() => {
    if (!imageAgrandie) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !planSeul) setImageAgrandie(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageAgrandie, planSeul]);
  // LOT 3 — Échap au NIVEAU 3 (plan seul) : retour au NIVEAU 2 (décision Arno), jamais un piège plein écran sans sortie clavier.
  useEffect(() => {
    if (!planSeul) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlanSeul(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planSeul]);

  // PROJ — APERÇU LIVE du débordement (débonce 400 ms) : la géométrie Lambert est recalculée CÔTÉ SERVEUR (garde PROJ) ; on ne fait
  //   qu'AFFICHER. On ne met à jour l'état QUE depuis le callback ASYNC (jamais un setState synchrone dans l'effet). Un contour non
  //   fermé (< 3 sommets) n'interroge pas et n'efface rien : le rendu masque de toute façon un débordement tant que < 3 sommets.
  useEffect(() => {
    if (etat !== 'ok' || sommets.length < 3 || corpsEffectif === null || calculerSimilitude(paires) === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ action: 'apercu_debordement', dossierId, corpsId: corpsEffectif, paires, anneauPlan: sommets }) });
          if (!res.ok) return;
          const j = await res.json() as { debordement: Debordement | null };
          setDebordement(j.debordement ?? null);
        } catch { /* aborté / réseau : on n'invente aucune valeur */ }
      })();
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [sommets, paires, corpsEffectif, dossierId, etat]);

  // PROJ-3r — réinitialiser l'affectation au groupement AUTOMATIQUE : tous les polygones cochés → bâtiment courant, aucun groupe scindé.
  const reinitialiserAdoption = useCallback((groupes: GroupeAdoptionVue[], corpsId: number | null) => {
    const aff: Record<string, number> = {};
    if (corpsId !== null) for (const g of groupes) for (const p of g.polygones) aff[p.cleabs] = corpsId;
    setAffectation(aff); setScindes([]);
  }, []);

  // PROJ-3r — charge les GROUPES AUTOMATIQUES (connexité, serveur) des polygones cochés, et (ré)initialise l'affectation vers le
  //   bâtiment courant. setState uniquement dans le callback async (jamais synchrone dans l'effet). Recharge si le dossier / la
  //   sélection écartée / le bâtiment courant changent (le défaut d'affectation suit le bâtiment courant).
  useEffect(() => {
    if (etat !== 'ok') return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ action: 'apercu_adoption', dossierId }) });
        if (!res.ok) return;
        const j = await res.json() as { apercu?: { groupes: GroupeAdoptionVue[] } };
        const groupes = j.apercu?.groupes ?? [];
        setGroupesAdoption(groupes);
        reinitialiserAdoption(groupes, corpsEffectif);
      } catch { /* aborté / réseau : on n'invente rien */ }
    })();
    return () => ctrl.abort();
  }, [dossierId, ecartes, corpsEffectif, etat, reinitialiserAdoption]);

  const ratioDeclare = (() => { const n = Number(ratioDeclareSaisi.replace(',', '.')); return ratioDeclareSaisi.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; })();
  const sim = calculerSimilitude(paires);
  const anneauLambert = sim && sommets.length >= 3 ? anneauVersLambert(sim, sommets) : null;
  const aire = anneauLambert ? aireM2(anneauLambert) : null;
  const vc: VerdictCalage | null = sim ? verdictCalage(sim, paires, ratioDeclare) : null;
  const residus = residusParPoint(paires); // PROJ — écart par repère (affiché à partir de 3 repères) + indice du plus fautif
  const vv: VerdictVraisemblance | null = aire !== null ? verdictVraisemblance({ aireM2: aire, corpsId: corpsEffectif, surfacePlancherM2: contexte?.surfacePlancherM2 ?? null, surfaceTerrainM2: contexte?.surfaceTerrainM2 ?? null, batiments: contexte?.batiments ?? [] }) : null;

  const batSel = batiments.find((b) => b.corpsId === corpsEffectif) ?? null;
  const empriseDuBat = emprises.filter((e) => e.corpsId === corpsEffectif);
  const ignoreDuBat = ignores.find((i) => i.corpsId === corpsEffectif) ?? null;
  // Origine de l'emprise COURANTE : si adoptée (IGN), les repères de calage/échelle ne s'appliquent pas (PROJ-3r).
  const origineIgnCourant = empriseDuBat.some((e) => e.provenance === 'ign_adopte' || e.provenance === 'ign_retouche');

  // ① COMPLÉMENT — l'ÉTAPE de la chaîne (un seul bouton visible) DÉRIVE de la SOURCE UNIQUE `statutEmpriseBatiment` (comme la capsule).
  const statutSel = corpsEffectif !== null ? statutEmpriseBatiment(empriseDuBat.length > 0, ignoreDuBat !== null, validationParCorps[corpsEffectif] ?? false) : 'a_tracer';
  const etapeChaine = batSel ? etapeChaineEmprise(statutSel, sommets.length >= 3) : null;
  // ③ COMPLÉMENT — état de l'en-tête « Bâtiments et projection » : VERT quand TOUS les bâtiments ont altitude ET emprise validées (source unique).
  const enteteEtat = useMemo(() => {
    const nbSansAlt = batiments.filter((b) => !(altitudeValideeParCorps[b.corpsId] ?? false)).length;
    const nbSansEmp = batiments.filter((b) => !(validationParCorps[b.corpsId] ?? false)).length;
    return etatEnteteProjection(batiments.length, nbSansAlt, nbSansEmp);
  }, [batiments, altitudeValideeParCorps, validationParCorps]);
  useEffect(() => { if (etat === 'ok') onEntete?.(enteteEtat); }, [enteteEtat, onEntete, etat]);
  // P3 (perfo) — remonte la donnée /emprise au parent (pour la liseuse de la planche) dès qu'elle est chargée. Effet SÉPARÉ (comme onVerdict/onEntete) → n'alourdit pas l'effet de fetch.
  useEffect(() => { if (donneesLiseuse) onDonneesLiseuse?.(donneesLiseuse); }, [donneesLiseuse, onDonneesLiseuse]);

  // 🔴 RENDU PDF DÉLIBÉRÉMENT DISTINCT de la liseuse de la planche (LiseusePieces) — NE PAS UNIFIER (décision Arno 31/08/2026, arrêt du
  //   LOT 14 ; ré-confirmée au chantier « unification des visionneuses », Option 1). CE rendu calcule le viewport au scale
  //   `(largeurCss/base)·dpr` avec dpr NON PLAFONNÉ et publie `apercu={vp,ratio}` : c'est LUI que lit le calage (cliquerPdf →
  //   apercu.vp.convertToPdfPoint(u·ratio)). La liseuse, elle, plafonne le dpr à 2 + borne le canvas à MAX_PX et peint un ImageBitmap
  //   (aucun viewport exposé). Aligner ce rendu sur celui de la planche CHANGERAIT le viewport → décalerait TOUS les points posés, au
  //   pixel, silencieusement et sans test. Le garde-fou est `tracage.filet.test.ts` (composition cliquerPdf/versCss + compteur). Toute
  //   retouche du RENDU PDF (viewport, dpr, ratio, convertToPdfPoint) DOIT laisser ce filet vert et être pensée des DEUX côtés.
  const afficherPage = useCallback(async () => {
    if (pieceId === null) return;
    setOccupe(true); setMessage(null); setZoom(1); setPan({ x: 0, y: 0 }); // PROJ-3l — zoom/déplacement réinitialisés au changement de plan
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signer_piece', pieceId }) });
      if (!res.ok) { setMessage('pièce indisponible'); return; }
      const { url } = await res.json() as { url: string };
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument(url).promise;
      setNbPagesPiece(pdf.numPages); // PROJ-3f ① — borne la nav pièce (connu à la demande, jamais un chargement en masse)
      const p = Math.min(Math.max(1, page), pdf.numPages);
      const pageObj = await pdf.getPage(p);
      const canvas = canvasRef.current; if (!canvas) return;
      const largeurCss = canvas.parentElement?.clientWidth || 560;
      const base = pageObj.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = pageObj.getViewport({ scale: (largeurCss / base.width) * dpr });
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      setApercu({ vp: viewport as unknown as Apercu['vp'], ratio: canvas.width / (canvas.getBoundingClientRect().width || largeurCss), largeurCanvasPx: canvas.width });
      setPage(p);
    } catch { setMessage('impossible d’afficher la page (PDF illisible)'); } finally { setOccupe(false); }
  }, [pieceId, page]);

  // PROJ-3e/3f — AUTO-AFFICHAGE de la page courante : au chargement (etat→ok) et à chaque changement de (pièce, page). Toute navigation
  //   (bande best-of OU pièce libre) ne fait que poser pieceId/page → cet effet rend. Ref stable pour ne pas se lier à afficherPage.
  const afficherPageRef = useRef(afficherPage);
  useEffect(() => { afficherPageRef.current = afficherPage; }, [afficherPage]);
  // PROJ-AGR — `imageAgrandie` DANS les deps : basculer l'agrandissement re-déclenche afficherPage → le canvas se re-rend à la largeur
  //   de la NOUVELLE vue (petite ↔ plein écran) et apercu/ratio se recalculent pour elle. Les points posés (sommets/paires en coords PDF)
  //   ne sont PAS effacés par afficherPage → ils restent exacts et se re-projettent (versCss) au bon endroit dans les deux vues.
  // LOT 3 — `planSeul` DANS les deps (comme imageAgrandie) : entrer/sortir du niveau 3 re-rend le canvas à sa NOUVELLE largeur (plein écran
  //   plan seul → plus large) → bitmap NET pour un tracé précis, et apercu/ratio recalculés pour cette vue. Les points posés (coords PDF) ne
  //   sont pas effacés → ils se re-projettent au bon endroit. La justesse des REPÈRES à toute largeur ne DÉPEND PAS de ce re-rendu (versCss
  //   lit un ratio d'affichage live) : le re-rendu ne sert QUE la netteté.
  useEffect(() => { if (etat === 'ok') void afficherPageRef.current(); }, [pieceId, page, etat, imageAgrandie, planSeul]);

  // LOT 3 — OBSERVER→STATE : la largeur AFFICHÉE (mise en page, NON zoomée) du cadre du plan alimente `largeurCanvasCss`. On observe
  //   `pdfContainerRef`, qui est HORS du wrapper `scale(zoom)` (le zoom est appliqué à SON enfant) → sa taille est TOUJOURS non zoomée,
  //   sans dépendre de la sémantique « ResizeObserver ignore-t-il les transforms » : aucun double-comptage du zoom possible (piège lot F).
  //   `contentRect.width` = largeur de contenu = celle que le canvas (width:100%) occupe = `largeurCss` du rendu → repli byte-identique quand
  //   la vue n'a pas changé. Se ré-attache à chaque changement de niveau (l'élément est préservé, mais un disconnect/observe reste sûr).
  useEffect(() => {
    const el = pdfContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const maj = (w: number) => { if (w > 0) setLargeurCanvasCss(w); };
    maj(el.clientWidth); // valeur initiale immédiate (avant le 1er callback de l'observer)
    const ro = new ResizeObserver((entries) => { for (const e of entries) maj(e.contentRect?.width ?? el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [etat, imageAgrandie, planSeul]);

  // PROJ-3e — CHANGER DE PAGE/PLAN sans perdre le travail en silence : un calage/tracé EN COURS ET NON ENREGISTRÉ → on diffère
  //   (confirmation inline) ; sinon on exécute. Le travail n'a de sens que sur SA page (points en espace-page) → on l'abandonne à
  //   l'échange.
  // 🔴 SOURCE UNIQUE DE VÉRITÉ = `procEnCours` (le MÊME booléen que la position du guide) : un simple `paires>0` (travailEnCours)
  //   avertissait à tort APRÈS un enregistrement réussi — `enregistrer` vide les sommets et DÉSARME `creationEnCours`, mais CONSERVE
  //   les paires de calage (« repère conservé ») → l'internaute était menacé d'abandonner un tracé DÉJÀ persisté en base. `procEnCours`
  //   retombe à false dès la validation ; il ne se rarme que sur un NOUVEAU point posé (un vrai travail non sauvegardé).
  const demanderChangement = useCallback((faire: () => void) => {
    if (procEnCours) setAvertissement({ faire });
    else faire();
  }, [procEnCours]);

  // Nav BEST-OF : repasse TOUJOURS en mode best-of (LOT PROV-1 point 1 : même bande VIDE — sinon « revenir au best-of » était mort sur
  //   les dossiers sans plan classé). Restaure le plan `cible` s'il en existe un ; sinon on affiche la vue best-of (« aucun plan proposé »).
  const appliquerPlan = useCallback((cible: number) => {
    const r = cibleBestOf(bande, cible);
    setNav(r.nav);
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage'); // le travail était attaché au plan quitté
    if (r.plan) { setPlanIndex(r.plan.index); setPieceId(r.plan.pieceId); setPage(r.plan.page); }
  }, [bande]);

  // PROJ-3f ① — Nav PIÈCE LIBRE : ouvrir une pièce quelconque (depuis le repli) en mode 'piece', à la page 1.
  const ouvrirPieceLibre = useCallback((id: number) => demanderChangement(() => {
    if (id <= 0) return;
    setNav('piece'); setPieceId(id); setPage(1);
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage');
  }), [demanderChangement]);

  // PROJ-3f ① — feuilleter les pages de la pièce courante, borné [1 ; nbPagesPiece].
  const changerPage = useCallback((delta: number) => demanderChangement(() => {
    setPage((p) => bornerPage(p + delta, nbPagesPiece));
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage');
  }), [demanderChangement, nbPagesPiece]);

  // PROJ-3f ① — revenir au best-of : restaure le plan courant de la bande (repasse en mode best-of).
  const retourBestOf = useCallback(() => demanderChangement(() => appliquerPlan(planIndex)), [demanderChangement, appliquerPlan, planIndex]);

  // ─── INCRÉMENT-2 — LA BARRE DE COMMANDES PARTAGÉE (mêmes actions serveur que la planche, portées SOUS le canvas) ───────────────────────
  //   RÈGLE ABSOLUE respectée : ces handlers ne touchent NI le canvas, NI afficherPage, NI apercu/ratio, NI la conversion de coordonnées.
  //   DIFFÉRENCE CLÉ avec la planche (LiseusePieces) : ici un GET /emprise RÉINITIALISE le tracé (angle, sommets, sélection). On NE
  //   RECHARGE donc JAMAIS après une action (pas de bump `rechargeLocal`). Best-of = mise à jour LOCALE optimiste des overrides
  //   (exclus/inclus) → la bande se recalcule sans requête ; analyse IA = message du serveur (l'audit daté se rafraîchira au prochain
  //   rechargement naturel). C'est exactement l'arbitrage « ne jamais casser le calage » (incrément 1 différé pour la même raison).
  const cleBestOf = (pl: { pieceId: number; page: number }) => `${pl.pieceId}:${pl.page}`;

  const reperer = useCallback(async () => {
    if (pieceId === null || reperEnCours) return;
    setReperEnCours(true); setReperMsg(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reperer_planches', dossierId, pieceId }) });
      if (res.status === 401) { setReperMsg('Session expirée — reconnectez-vous.'); return; }
      if (res.status === 409) { setReperMsg('Une analyse de ce permis est déjà en cours.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; resume?: { planches: number; incertaines: number; ecartees: number } };
      if (!res.ok || !body.ok) { setReperMsg('Repérage impossible, réessayez.'); return; }
      const r = body.resume;
      setReperMsg(r ? `${r.planches} planche(s) repérée(s)${r.incertaines ? ` · ${r.incertaines} incertaine(s)` : ''}${r.ecartees ? ` · ${r.ecartees} page(s) écartée(s) par précaution` : ''}.` : 'Repérage terminé.');
      // pas de rechargement (préserve le tracé) : le résumé ci-dessus EST le retour ; les planches image entreront au prochain chargement.
    } catch { setReperMsg('Repérage impossible, réessayez.'); }
    finally { setReperEnCours(false); }
  }, [pieceId, dossierId, reperEnCours]);

  const analyserPage = useCallback(async () => {
    if (pieceId === null || lectureEnCours || reperEnCours) return;
    const cle = `${pieceId}:${page}`;
    setLectureEnCours(true); setLectureRes(null);
    const poser = (texte: string, ecrit = false) => setLectureRes({ cle, texte, ecrit });
    const echouer = (texte: string) => setLectureRes({ cle, texte, ecrit: false, echec: true }); // capsule « analyse échouée » (jamais silencieux)
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lire_valeurs_page', dossierId, pieceId, page }) });
      if (res.status === 401) { echouer('Session expirée — reconnectez-vous.'); return; }
      if (res.status === 409) { echouer('Une analyse de ce permis est déjà en cours.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; resume?: { texte?: string; ecrit?: boolean; envoyee?: boolean } };
      if (!res.ok || !body.ok) { echouer('Analyse de la page impossible, réessayez.'); return; }
      poser(body.resume?.texte ?? 'Analyse terminée.', body.resume?.ecrit === true);
      // MISE À JOUR OPTIMISTE de l'audit local (aucun refetch ici : préserve le calage) → la capsule reflète la VÉRITÉ tout de suite,
      //   y compris hors best-of. envoyee=false / nbValeurs=0 → « analysée, aucune valeur » (jamais « non analysée »).
      const envoyee = body.resume?.envoyee !== false;
      const nbValeurs = body.resume?.ecrit === true ? 1 : 0;
      setLectures((prev) => ({ ...prev, [pieceId]: [...(prev[pieceId] ?? []).filter((l) => l.page !== page), { page, envoyee, motif: null, nbValeurs, resume: body.resume?.texte ?? null, coutUsd: 0, creeLe: new Date().toISOString() }] }));
    } catch { echouer('Analyse de la page impossible, réessayez.'); }
    finally { setLectureEnCours(false); }
  }, [pieceId, dossierId, page, lectureEnCours, reperEnCours]);

  const annulerValeurPage = useCallback(async () => {
    const cle = `${pieceId}:${page}`;
    const poser = (texte: string) => setLectureRes({ cle, texte, ecrit: false });
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annuler_lecture_page', dossierId }) });
      if (res.status === 401) { poser('Session expirée — reconnectez-vous.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; annule?: boolean };
      if (!res.ok || !body.ok) { poser('Annulation impossible, réessayez.'); return; }
      poser(body.annule ? 'Valeur annulée : le champ a été remis à vide.' : 'Rien à annuler (aucune valeur écrite par l’image, ou valeur saisie à la main protégée).');
    } catch { poser('Annulation impossible, réessayez.'); }
  }, [pieceId, page, dossierId]);

  // LOT 65 — ouvrir le document complet dans un nouvel onglet ; lien SIGNÉ fabriqué AU CLIC (jamais pré-généré), fragment #page=N non signé.
  const ouvrirDocumentComplet = useCallback(async () => {
    if (pieceId === null) return;
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source: 'dossier', inline: true }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !body.url) { setMessage('Ouverture du document impossible, réessayez.'); return; }
      window.open(page > 0 ? `${body.url}#page=${page}` : body.url, '_blank', 'noopener,noreferrer');
    } catch { setMessage('Ouverture du document impossible, réessayez.'); }
  }, [pieceId, page]);

  // LOT 61/92 — retirer / ajouter la page courante au best-of (réversible). Mise à jour LOCALE des overrides (mutuellement exclusifs) ;
  //   AUCUN repositionnement de plan (on ne bouge pas l'utilisateur qui trace) et AUCUN rechargement (préserve le calage).
  const retirerDuBestOf = useCallback(async (pl: Plan) => {
    const k = cleBestOf(pl);
    setMessage(null);
    const action = pl.manuel ? 'desinclure_page_bestof' : 'exclure_page_bestof';
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, pieceId: pl.pieceId, page: pl.page }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Retrait non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) return; // migration best-of absente → no-op silencieux (comportement d'avant)
      if (pl.manuel) setInclus((s) => { const n = new Set(s); n.delete(k); return n; });
      else setExclus((s) => { const n = new Set(s); n.add(k); return n; });
    } catch { setMessage('Retrait non enregistré, réessayez.'); }
  }, [dossierId]);

  const ajouterAuBestOf = useCallback(async (pieceId2: number, page2: number) => {
    const k = `${pieceId2}:${page2}`;
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inclure_page_bestof', dossierId, pieceId: pieceId2, page: page2 }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Ajout non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) { setMessage('Ajout indisponible (mise à jour de la base requise).'); return; }
      setInclus((s) => { const n = new Set(s); n.add(k); return n; });
      setExclus((s) => { const n = new Set(s); n.delete(k); return n; });
    } catch { setMessage('Ajout non enregistré, réessayez.'); }
  }, [dossierId]);

  // DÉBLOCAGE MANUEL — CONFIRMER le déblocage d'une page (après l'avertissement « vue en plan »). Persiste le geste puis marque la page
  //   traçable côté client (la capsule vire au vert, le calage/tracé s'ouvrent par accesTrace inchangé). `ok:false` = migration 210 absente.
  const confirmerDeblocage = useCallback(async (cle: { pieceId: number; page: number }) => {
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'debloquer_page_tracable', dossierId, pieceId: cle.pieceId, page: cle.page }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Déblocage non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) { setMessage('Déblocage indisponible (mise à jour de la base requise).'); return; }
      setDebloques((s) => { const n = new Set(s); n.add(`${cle.pieceId}:${cle.page}`); return n; });
      setDeblocageDemande(null);
    } catch { setMessage('Déblocage non enregistré, réessayez.'); }
  }, [dossierId]);

  // DÉBLOCAGE MANUEL — RETIRER le déblocage. Si une emprise a été enregistrée sur cette page, on avertit AVANT (état reverrouDemande) et on
  //   ne poste qu'APRÈS confirmation, avec `confirmerSuppression` : le serveur supprime alors ces emprises (page redevenue non traçable → à
  //   retracer) puis retire le drapeau. Sans emprise, retrait direct. La réponse renvoie l'état emprises/ignores/statuts rafraîchi.
  const retirerDeblocage = useCallback(async (cle: { pieceId: number; page: number }, confirmerSuppression: boolean) => {
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reverrouiller_page_tracable', dossierId, pieceId: cle.pieceId, page: cle.page, confirmerSuppression }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Retrait du déblocage non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; bloque?: boolean; nbEmprises?: number; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[]; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[]; emprisesSupprimees?: number };
      if (body.bloque) { setReverrouDemande({ pieceId: cle.pieceId, page: cle.page, nbEmprises: body.nbEmprises ?? 1 }); return; } // emprise liée → demander confirmation
      setDebloques((s) => { const n = new Set(s); n.delete(`${cle.pieceId}:${cle.page}`); return n; });
      if (body.emprises) setEmprises(body.emprises);
      if (body.ignores) setIgnores(body.ignores);
      if (body.statutsPolygones) setStatutsLignes(body.statutsPolygones);
      if (body.polygonesRecouverts) setRecouverts(body.polygonesRecouverts);
      setReverrouDemande(null);
    } catch { setMessage('Retrait du déblocage non enregistré, réessayez.'); }
  }, [dossierId]);

  // DÉBLOCAGE MANUEL — geste « ne plus utiliser cette page » : compte les emprises DÉJÀ enregistrées sur cette page (état local, sans
  //   round-trip). ≥ 1 → on ouvre l'avertissement de suppression (confirmation explicite) ; 0 → retrait direct.
  const demanderRetraitDeblocage = useCallback((cle: { pieceId: number; page: number }) => {
    const n = emprises.filter((e) => e.pieceId === cle.pieceId && e.page === cle.page).length;
    if (n > 0) setReverrouDemande({ pieceId: cle.pieceId, page: cle.page, nbEmprises: n });
    else void retirerDeblocage(cle, false);
  }, [emprises, retirerDeblocage]);

  // Dérivés de la BARRE (mêmes règles pures que la planche). `bande` est déjà le best-of VISIBLE (overrides appliqués).
  const planAffiche = pieceId !== null ? (bande.find((pl) => pl.pieceId === pieceId && pl.page === page) ?? null) : null;
  const pageDansBestOf = planAffiche !== null;
  const runCourant = pieceId !== null ? runs[pieceId] : undefined;
  const lectureCourante = pieceId !== null ? (lectures[pieceId] ?? []).find((l) => l.page === page) ?? undefined : undefined;
  const pieceCourante = pieceId !== null ? pieces.find((p) => p.id === pieceId) : undefined;
  const identifieeSansIa = !!pieceCourante && pieceCourante.famille != null; // (le type Piece de ce bloc n'expose pas `cerfa`)
  const ecarteeReperage = runCourant?.pagesEcartees.find((e) => e.page === page);
  const statutPage = statutPageAnalyse({
    lecturePage: lectureCourante ? { envoyee: lectureCourante.envoyee, nbValeurs: lectureCourante.nbValeurs, motif: lectureCourante.motif, creeLe: lectureCourante.creeLe } : undefined,
    ecarteeReperage: ecarteeReperage ? { motif: ecarteeReperage.motif } : undefined,
    reperage: runCourant ? { creeLe: runCourant.creeLe } : undefined,
    identifieeSansIa,
    origineSansIa: origineSansIa ?? undefined,
  }, (iso) => jourParisISO(iso));
  const resumePages = resumePagesAnalysees(lectures[pieceId ?? -1] ?? [], runCourant ? { creeLe: runCourant.creeLe } : undefined, (iso) => jourParisISO(iso));
  const nomCourant = pieces.find((p) => p.id === pieceId)?.nomFichier ?? 'pièce';

  // PROJ-AGR / socle N largeurs (lot F) — RATIO LIVE : nombre de canvas-px par px-affiché NON zoomé, lu EN DIRECT sur le canvas au moment de
  //   l'usage (appelé UNIQUEMENT dans cliquerPdf, un gestionnaire d'événement → DOM à jour, lecture de ref autorisée). On lit la largeur
  //   AFFICHÉE du canvas (getBoundingClientRect, la MÊME mesure fractionnaire que r à :550) et on la DÉ-ZOOME (÷ zoom, car le wrapper applique
  //   scale(zoom)). Résultat = apercu.ratio À L'IDENTIQUE quand la vue n'a pas changé depuis le rendu (bit à bit à zoom 1 → aucune régression),
  //   mais EXACT à N'IMPORTE QUELLE largeur d'affichage — même une 3e largeur non re-rendue. `apercu.ratio` reste stocké (rendu), n'est plus la source de justesse.
  const ratioLive = useCallback((): number | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const larg = c.getBoundingClientRect().width;      // largeur AFFICHÉE (le wrapper lui applique scale(zoom))
    const z = zoom > 0 ? zoom : 1;
    return larg > 0 ? (c.width * z) / larg : null;      // ÷ largeur dé-zoomée → canvas-px par px-affiché non zoomé
  }, [zoom]);
  // PROJ-3l — pose un point : le clic (écran) est ramené dans le canvas NON transformé (annule zoom + pan via ecranVersCanvas), puis
  //   converti en point PDF via le RATIO LIVE. Le repère est le CONTENEUR non transformé. Résultat identique quel que soit le zoom/déplacement.
  const cliquerPdf = useCallback((clientX: number, clientY: number) => {
    const rl = ratioLive();
    if (!apercu || !pdfContainerRef.current || rl === null) return;
    const r = pdfContainerRef.current.getBoundingClientRect();
    const u = ecranVersCanvas(clientX, clientY, r.left, r.top, pan, zoom);
    const [px, py] = apercu.vp.convertToPdfPoint(u.x * rl, u.y * rl);
    if (mode === 'trace') setSommets((s) => [...s, { x: px, y: py }]);
    else setPlanEnAttente({ x: px, y: py });
  }, [mode, apercu, pan, zoom, ratioLive]);

  // PROJ-3l — ZOOM (facteur 1,25 ; bornes [1 ; 8]) et retour à l'AJUSTEMENT (zoom 1, pan 0). AFFICHAGE seulement.
  const zoomer = useCallback(() => setZoom((z) => Math.min(8, z * 1.25)), []);
  const dezoomer = useCallback(() => setZoom((z) => { const nz = Math.max(1, z / 1.25); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; }), []);
  const ajusterPdf = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // PROJ-3l — GLISSER pour déplacer (quand zoomé) vs CLIQUER pour poser un point : un mouvement ≥ seuil = glissement (jamais de point).
  const onPdfPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pdfContainerRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { x0: e.clientX, y0: e.clientY, panX: pan.x, panY: pan.y, bouge: false };
  }, [pan]);
  const onPdfPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.bouge && !estClic(dx, dy)) d.bouge = true;
    if (zoom > 1 && d.bouge) setPan({ x: d.panX + dx, y: d.panY + dy });
  }, [zoom]);
  const onPdfPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; dragRef.current = null;
    pdfContainerRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    // Clic (petit mouvement) → poser un point (si traçable) ; vrai glissement → déplacement déjà fait, aucun point.
    if (tracable && estClic(e.clientX - d.x0, e.clientY - d.y0)) cliquerPdf(e.clientX, e.clientY);
  }, [tracable, cliquerPdf]);

  const cliquerSchema = useCallback((pxBoite: { x: number; y: number }) => {
    if (mode !== 'calage' || !boite || !planEnAttente) return;
    setPaires((ps) => [...ps, { plan: planEnAttente, lambert: inverseDepuisBoite(boite, pxBoite) }]);
    setPlanEnAttente(null);
  }, [mode, boite, planEnAttente]);

  const enregistrer = useCallback(async () => {
    if (!sim || sommets.length < 3 || corpsEffectif === null || !batSel) { setMessage('sélectionnez un bâtiment, calez (2 points) et tracez un contour ≥ 3 sommets'); return; }
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enregistrer', dossierId, corpsId: corpsEffectif, libelle: libelleBatiment(batSel), pieceId, page, anneauPlan: sommets, paires, ratioDeclare }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[]; debordement?: Debordement | null };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'enregistrement refusé'); return; }
      setEmprises(j.emprises ?? []); if (j.ignores) setIgnores(j.ignores);
      setSommets([]); setCreationEnCours(false); setDebordement(j.debordement ?? null); setMessage('emprise reconstituée enregistrée'); // repère conservé « après enregistrement » ; le guide REVIENT à sa place initiale (fin du processus)
      onEmprisesChange?.(); // capsule du cartouche : l'emprise vient d'être créée → re-fetch de CaracteristiquesBloc
    } catch { setMessage('erreur d’enregistrement'); } finally { setOccupe(false); }
  }, [sim, sommets, corpsEffectif, batSel, dossierId, pieceId, page, paires, ratioDeclare, onEmprisesChange]);

  // ① COMPLÉMENT — VALIDER l'emprise du bâtiment sélectionné. MÊME validation que la capsule du cartouche (route caracteristiques,
  //   action valider_emprise → validerEmpriseBatiment + auto-finalisation gated par le mode) → SOURCE UNIQUE, jamais un 2e critère.
  //   Après succès : recharge LOCALE (la chaîne avance à « Modifier ») + onEmprisesChange (② la capsule passe au vert sans rechargement).
  const validerEmpriseChaine = useCallback(async () => {
    if (corpsEffectif === null) return;
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'valider_emprise', dossierId, corpsId: corpsEffectif }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'validation impossible'); return; } // jamais un bouton muet (règle corrigée 3× cette nuit)
      setRechargeLocal((n) => n + 1); onEmprisesChange?.();
    } catch { setMessage('validation impossible'); } finally { setOccupe(false); }
  }, [corpsEffectif, dossierId, onEmprisesChange]);

  // ① COMPLÉMENT — MODIFIER une emprise VALIDÉE = la REPRENDRE : fait RETOMBER sa validation (devalider_emprise ; règle en base :
  //   emprise_validee_id + FK ON DELETE SET NULL). La chaîne repart à « Valider » et l'écran le DIT ; retoucher/effacer (carte) redeviennent le détail.
  const modifierEmpriseChaine = useCallback(async () => {
    if (corpsEffectif === null) return;
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'devalider_emprise', dossierId, corpsId: corpsEffectif }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'modification impossible'); return; }
      setMessage('Validation retirée : vous pouvez retoucher, effacer ou re-valider l’emprise.');
      setRechargeLocal((n) => n + 1); onEmprisesChange?.();
    } catch { setMessage('modification impossible'); } finally { setOccupe(false); }
  }, [corpsEffectif, dossierId, onEmprisesChange]);

  const posterProjection = useCallback(async (action: 'ignorer' | 'retablir' | 'supprimer', corps: number, extra: Record<string, unknown> = {}) => {
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, corpsId: corps, ...extra }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'action refusée'); return; }
      if (j.emprises) setEmprises(j.emprises); if (j.ignores) setIgnores(j.ignores);
      if (action === 'ignorer') setMotifIgnore('');
      onEmprisesChange?.(); // suppression / ignorer / rétablir → l'état d'emprise du bâtiment change → capsule du cartouche
    } catch { setMessage('action impossible'); } finally { setOccupe(false); }
  }, [dossierId, onEmprisesChange]);

  // PROJ-3r — construit la liste d'affectations {cleabs→bâtiment} pour tous les polygones des groupes courants.
  const affectationsCourantes = useCallback((): { cleabs: string; corpsId: number }[] => {
    const out: { cleabs: string; corpsId: number }[] = [];
    for (const g of groupesAdoption) for (const p of g.polygones) { const c = affectation[p.cleabs]; if (c !== undefined) out.push({ cleabs: p.cleabs, corpsId: c }); }
    return out;
  }, [groupesAdoption, affectation]);


  // ② Ouvrir la confirmation : aperçu PAR BÂTIMENT (serveur) de l'affectation courante.
  const ouvrirConfirmationAdoption = useCallback(async () => {
    setMessage(null); setOccupe(true);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apercu_affectations', dossierId, affectations: affectationsCourantes() }) });
      const j = await res.json() as { apercu?: { batiments: BatimentAdoptionVue[] }; erreur?: string };
      if (!res.ok || !j.apercu) { setMessage(j.erreur ?? 'aperçu indisponible'); return; }
      setConfirmationAdoption(j.apercu);
    } catch { setMessage('aperçu indisponible'); } finally { setOccupe(false); }
  }, [dossierId, affectationsCourantes]);

  // ③ Confirmer l'adoption : enregistrement serveur par affectation (regroupement PAR bâtiment, plusieurs bâtiments possibles).
  const confirmerAdoption = useCallback(async () => {
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adopter', dossierId, affectations: affectationsCourantes() }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; nbCreees?: number; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[]; debordement?: Debordement | null };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'adoption refusée'); return; }
      setEmprises(j.emprises ?? []); if (j.ignores) setIgnores(j.ignores);
      setSommets([]); setPaires([]); setPlanEnAttente(null); // une adoption remplace tout tracé en cours
      setDebordement(j.debordement ?? null); setConfirmationAdoption(null);
      setMessage(`${j.nbCreees ?? 0} emprise(s) adoptée(s) depuis l’IGN`);
      onEmprisesChange?.(); // adoption IGN → des emprises apparaissent sur des bâtiments → capsule du cartouche
    } catch { setMessage('adoption impossible'); } finally { setOccupe(false); }
  }, [dossierId, affectationsCourantes, onEmprisesChange]);

  // PROJ-3s — RETOUCHE d'une emprise existante (mono-polygone) sur le SCHÉMA, en Lambert. Rien n'est écrit tant que non validé.
  const demarrerRetouche = useCallback((id: number) => {
    const e = emprises.find((x) => x.id === id);
    const anneau = e ? (e.anneaux?.length ? e.anneaux[0] : e.anneau) : null;
    if (!anneau || anneau.length < 3) { setMessage('emprise non retouchable'); return; }
    setRetouche({ id, anneau: anneau.map((p) => ({ x: p.x, y: p.y })), hist: [] });
    setModeRetouche('deplacer'); setSommetSel(null);
    setMessage('retouche en cours : déplacez, insérez ou supprimez un sommet, puis validez.');
  }, [emprises]);

  const appliquerRetouche = useCallback((res: ResultatRetouche) => {
    if (!res.ok) { setMessage(res.motif); return; }
    setMessage(null);
    setRetouche((r) => (r ? { id: r.id, anneau: res.anneau, hist: [...r.hist, r.anneau] } : r));
  }, []);

  // Clic sur le schéma en mode retouche : sélectionne/déplace, insère sur un bord, ou supprime — selon le sous-mode. Coords BOÎTE.
  const cliquerRetouche = useCallback((pxBoite: { x: number; y: number }) => {
    if (!retouche || !boite) return;
    const box = retouche.anneau.map((p) => projeterDansBoite(boite, p));
    const lambert = inverseDepuisBoite(boite, pxBoite);
    if (modeRetouche === 'supprimer') { const i = sommetProche(box, pxBoite, SEUIL_SOMMET_BOITE); if (i >= 0) appliquerRetouche(supprimerSommet(retouche.anneau, i)); return; }
    if (modeRetouche === 'inserer') { const i = bordProche(box, pxBoite); if (i >= 0) appliquerRetouche(insererSommet(retouche.anneau, i, lambert)); return; }
    if (sommetSel === null) { const i = sommetProche(box, pxBoite, SEUIL_SOMMET_BOITE); if (i >= 0) setSommetSel(i); return; } // 1er clic : choisir le sommet
    appliquerRetouche(deplacerSommet(retouche.anneau, sommetSel, lambert)); setSommetSel(null);                          // 2e clic : nouvelle position
  }, [retouche, boite, modeRetouche, sommetSel, appliquerRetouche]);

  const annulerRetouche = useCallback(() => { setSommetSel(null); setRetouche((r) => (r && r.hist.length > 0 ? { id: r.id, anneau: r.hist[r.hist.length - 1], hist: r.hist.slice(0, -1) } : r)); }, []);
  const abandonnerRetouche = useCallback(() => { setRetouche(null); setSommetSel(null); setMessage('retouche abandonnée : l’emprise en base n’a pas changé.'); }, []);

  const validerRetouche = useCallback(async () => {
    if (!retouche) return;
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retoucher', dossierId, id: retouche.id, anneau: retouche.anneau }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[]; debordement?: Debordement | null };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'retouche refusée'); return; } // ex. auto-intersection : message serveur, l'emprise en base reste intacte
      setEmprises(j.emprises ?? []); if (j.ignores) setIgnores(j.ignores);
      setDebordement(j.debordement ?? null); setRetouche(null); setSommetSel(null);
      setMessage('emprise retouchée.');
      onEmprisesChange?.(); // retouche → surface/géométrie de l'emprise change → capsule du cartouche
    } catch { setMessage('retouche impossible'); } finally { setOccupe(false); }
  }, [retouche, dossierId, onEmprisesChange]);

  // ─── PROJ-3t (lot 3b) — AJUSTEMENT d'UNE emprise (delta rigide réversible) ───────────────────────────────────────────────────
  // État : l'emprise ajustée + son delta EN COURS + ses anneaux d'ORIGINE (reconstruits via inverseAjustement, le socle 3a) + un flag
  //   « un delta est déjà persisté en base » (→ « revenir au tracé d'origine » disponible même après rechargement). Le drag souris vit
  //   dans une ref (mutable, hors rendu). Les DEUX moyens (souris + boutons) écrivent le MÊME delta et se COMPOSENT.
  // `bloc` : geste d'ENSEMBLE (toutes les emprises du dossier) — `id` null, `base` = tous les anneaux AFFICHÉS (le geste se compose par-dessus
  //   les ajustements individuels au serveur). `une` : `base` = anneaux d'ORIGINE de l'emprise (inverse du delta stocké). Même moteur d'aperçu.
  const [ajustement, setAjustement] = useState<{ bloc: boolean; id: number | null; delta: Ajustement; base: PointLambert[][]; enregistre: boolean } | null>(null);
  const dragAjust = useRef<{ cible: 'corps' | 'rotation' | 'echelle'; startLambert: PointLambert; startDelta: Ajustement; centreAffiche: PointLambert; startAngle: number; startDist: number } | null>(null);
  const anneauxAffiches = useCallback((e: EmpriseReconstruite) => (e.anneaux?.length ? e.anneaux : (e.anneau.length ? [e.anneau] : [])), []);

  const demarrerAjustement = useCallback((id: number) => {
    const e = emprises.find((x) => x.id === id); if (!e) return;
    const base = anneauxAffiches(e).map((a) => inverseAjustement(a, e.ajustement ?? null)); // socle 3a : origine = inverse du delta stocké
    const delta = e.ajustement ?? ajustementIdentite(base);
    setRetouche(null); setSommetSel(null); // exclusif de la retouche
    setAjustement({ bloc: false, id, delta, base, enregistre: e.ajustement != null });
    setMessage('ajustement : glissez le dessin ou une poignée, ou utilisez les boutons. Rien n’est enregistré tant que vous ne cliquez pas « Enregistrer ».');
  }, [emprises, anneauxAffiches]);

  // MODE BLOC — geste appliqué à TOUTES les emprises du dossier ensemble. `base` = anneaux AFFICHÉS de toutes les emprises (le geste `externe`
  //   se COMPOSE au serveur par-dessus l'ajustement individuel de chacune) ; centre = centroïde de l'ENSEMBLE affiché. Positions relatives préservées.
  const demarrerAjustementBloc = useCallback(() => {
    const base = emprises.flatMap((e) => anneauxAffiches(e)).filter((a) => a.length >= 3);
    if (base.length === 0) return;
    setRetouche(null); setSommetSel(null);
    setAjustement({ bloc: true, id: null, delta: ajustementIdentite(base), base, enregistre: emprises.some((e) => e.ajustement != null) });
    setMessage('ajustement d’ensemble : les emprises bougent ENSEMBLE (positions relatives conservées). Rien n’est enregistré tant que vous ne cliquez pas « Enregistrer ».');
  }, [emprises, anneauxAffiches]);

  const majDelta = useCallback((maj: (d: Ajustement) => Ajustement) => setAjustement((a) => (a ? { ...a, delta: maj(a.delta) } : a)), []);
  const onTranslate = useCallback((dxM: number, dyM: number) => majDelta((d) => ({ ...d, tx: d.tx + dxM, ty: d.ty + dyM })), [majDelta]);
  const onRotate = useCallback((deg: number) => majDelta((d) => ({ ...d, rotDeg: d.rotDeg + deg })), [majDelta]);
  const onScale = useCallback((pct: number) => majDelta((d) => ({ ...d, echelle: Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, d.echelle * (1 + pct / 100))) })), [majDelta]);

  // Aperçu (anneaux ajustés) + poignées, dérivés du delta EN COURS. Centre affiché = centre stocké + translation (le centre d'aire est fixe
  //   sous échelle/rotation autour de lui → T(centre) = centre + t). R = rayon de l'aperçu ; poignées à 1,25·R, tournant avec le delta.
  const apercuAjustement = useMemo(() => {
    if (!ajustement) return null;
    const d = ajustement.delta;
    const anneaux = ajustement.base.map((a) => appliquerAjustement(a, d));
    const centre = { x: d.centre.x + d.tx, y: d.centre.y + d.ty };
    let R = 0; for (const a of anneaux) for (const p of a) R = Math.max(R, Math.hypot(p.x - centre.x, p.y - centre.y));
    const rayon = (R > 0 ? R : 1) * FACTEUR_POIGNEE_AJUSTEMENT;
    const pt = (angleDeg: number): PointLambert => rotePoint({ x: centre.x + rayon, y: centre.y }, centre, angleDeg); // point à `rayon`, tourné
    return { anneaux, centre, poigneeRotation: pt(90 + d.rotDeg), poigneeEchelle: pt(d.rotDeg) }; // ↻ « au nord » de l'emprise, ⤢ « à l'est », suivent la rotation
  }, [ajustement]);

  // Drag SOURIS/DOIGT : `down` fixe la cible (fournie par le schéma, qui connaît le rayon réel des bulles) ; `move` compose le delta ; `up`
  //   finit. GÉNÉRIQUE sur la boîte utilisée (`boite` en page normale, `boiteGrande` en plein écran) — SEULE la conversion pxBoite → Lambert
  //   en dépend ; l'aperçu/delta/centre sont en Lambert, partagés. Un seul état `ajustement` → geste identique quelle que soit la vue.
  const gererPointeurAjustement = useCallback((boiteU: Boite | null, phase: 'down' | 'move' | 'up', pxBoite: { x: number; y: number }, cible: 'corps' | 'rotation' | 'echelle') => {
    if (!ajustement || !boiteU || !apercuAjustement) return;
    const lambert = inverseDepuisBoite(boiteU, pxBoite);
    if (phase === 'up') { dragAjust.current = null; return; }
    if (phase === 'down') {
      const centreAffiche = apercuAjustement.centre;
      dragAjust.current = { cible, startLambert: lambert, startDelta: ajustement.delta, centreAffiche,
        startAngle: Math.atan2(lambert.y - centreAffiche.y, lambert.x - centreAffiche.x),
        startDist: Math.max(1e-6, Math.hypot(lambert.x - centreAffiche.x, lambert.y - centreAffiche.y)) };
      return;
    }
    const g = dragAjust.current; if (!g) return;
    if (g.cible === 'corps') majDelta(() => ({ ...g.startDelta, tx: g.startDelta.tx + (lambert.x - g.startLambert.x), ty: g.startDelta.ty + (lambert.y - g.startLambert.y) }));
    else if (g.cible === 'rotation') { const cur = Math.atan2(lambert.y - g.centreAffiche.y, lambert.x - g.centreAffiche.x); majDelta(() => ({ ...g.startDelta, rotDeg: g.startDelta.rotDeg + (cur - g.startAngle) * 180 / Math.PI })); }
    else { const f = Math.hypot(lambert.x - g.centreAffiche.x, lambert.y - g.centreAffiche.y) / g.startDist; majDelta(() => ({ ...g.startDelta, echelle: Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, g.startDelta.echelle * f)) })); }
  }, [ajustement, apercuAjustement, majDelta]);
  const pointeurAjustement = useCallback((phase: 'down' | 'move' | 'up', px: { x: number; y: number }, cible: 'corps' | 'rotation' | 'echelle') => gererPointeurAjustement(boite, phase, px, cible), [gererPointeurAjustement, boite]);
  const pointeurAjustementGrand = useCallback((phase: 'down' | 'move' | 'up', px: { x: number; y: number }, cible: 'corps' | 'rotation' | 'echelle') => gererPointeurAjustement(boiteGrande, phase, px, cible), [gererPointeurAjustement, boiteGrande]);

  // 🔴 ABANDON = fin de la SESSION en cours seulement (aucune écriture) : les modifications NON ENREGISTRÉES sont annulées ; un ajustement DÉJÀ
  //   ENREGISTRÉ, lui, reste en place (la ligne « ajustée à la main… » demeure vraie). On le DIT clairement pour ne pas laisser croire l'inverse.
  const abandonnerAjustement = useCallback(() => { dragAjust.current = null; setAjustement(null); setMessage('Ajustement en cours abandonné : les modifications non enregistrées sont annulées. Un ajustement déjà enregistré, lui, reste inchangé.'); }, []);

  const enregistrerAjustementGeste = useCallback(async () => {
    if (!ajustement) return;
    setOccupe(true); setMessage(null); dragAjust.current = null;
    try {
      const corps = ajustement.bloc
        ? { action: 'ajuster_bloc', dossierId, ajustement: ajustement.delta }
        : { action: 'ajuster', dossierId, id: ajustement.id, ajustement: ajustement.delta };
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'ajustement refusé'); return; }
      setEmprises(j.emprises ?? []); setAjustement(null);
      setMessage(ajustement.bloc ? 'ajustement d’ensemble enregistré. « Revenir au tracé d’origine » reste disponible.' : 'ajustement enregistré. « Revenir au tracé d’origine » reste disponible à tout moment.');
      onEmprisesChange?.();
    } catch { setMessage('ajustement impossible'); } finally { setOccupe(false); }
  }, [ajustement, dossierId, onEmprisesChange]);

  const revenirOrigineAjustement = useCallback(async () => {
    if (!ajustement) return;
    setOccupe(true); setMessage(null); dragAjust.current = null;
    try {
      const corps = ajustement.bloc ? { action: 'reinitialiser_ajustement_bloc', dossierId } : { action: 'reinitialiser_ajustement', dossierId, id: ajustement.id };
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'retour à l’origine impossible'); return; }
      setEmprises(j.emprises ?? []); setAjustement(null);
      setMessage(ajustement.bloc ? 'retour à l’origine (ensemble) : tous les ajustements ont été supprimés, les géométries d’origine sont restituées.' : 'retour au tracé d’origine : l’ajustement a été supprimé, la géométrie d’origine est restituée.');
      onEmprisesChange?.();
    } catch { setMessage('retour à l’origine impossible'); } finally { setOccupe(false); }
  }, [ajustement, dossierId, onEmprisesChange]);

  // PROJ-3i — ÉCARTER / RÉTABLIR un polygone « en projet » (décision persistée). Optimiste : la réponse serveur fait foi.
  const basculerEcart = useCallback(async (cleabs: string, ecarter: boolean) => {
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: ecarter ? 'ecarter_polygone' : 'retablir_polygone', dossierId, cleabs }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; polygonesEcartes?: string[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'sélection impossible'); return; }
      if (j.polygonesEcartes) setEcartes(j.polygonesEcartes);
    } catch { setMessage('sélection impossible'); }
  }, [dossierId]);

  // RATT-1 (2) — statut COURANT par cleabs (dérivé du registre append-only). Pur, dérivé de l'état.
  const statutParCleabs = useMemo(() => statutCourantParCleabs(statutsLignes), [statutsLignes]);
  // RATT-1 (2) — STATUER un polygone existant (préservé / détruit / révoquer). La réponse serveur (registre à jour) fait foi.
  const statuerPolygone = useCallback(async (cleabs: string, statut: 'preserve' | 'detruit' | 'revoque') => {
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'statuer_polygone', dossierId, cleabs, statut }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'statut impossible'); return; }
      if (j.statutsPolygones) setStatutsLignes(j.statutsPolygones);
      if (j.polygonesRecouverts) setRecouverts(j.polygonesRecouverts);
    } catch { setMessage('statut impossible'); }
  }, [dossierId]);

  // PL-C4 — RETIRER la sélection validée (superposition) depuis le bandeau. Geste DÉLIBÉRÉ à deux temps (confirmé dans le bandeau) :
  //   RECALCULE l'empreinte + bâti + projection (réversible). Puis recharge /emprise → nouvelle empreinte, schéma et bandeau à jour.
  const retirerSelectionEmprise = useCallback(async () => {
    setOccupeSel(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/planche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retirer', dossierId }) });
      if (!res.ok) { setMessage('retour à la configuration d’origine impossible'); return; }
      setConfirmeSel(false); setRechargeLocal((n) => n + 1); // re-fetch : empreinte automatique + schéma + bandeau à jour
      setMessage('Retour à la configuration automatique — empreinte, bâti et projection recalculés.');
    } catch { setMessage('retour à la configuration d’origine impossible'); } finally { setOccupeSel(false); }
  }, [dossierId]);

  // Overlay : positions CSS des points plan / sommets (lit `apercu` en state). LOT 3 (observer→state) — la source du ratio d'affichage est
  //   désormais LIVE : `apercu.largeurCanvasPx / largeurCanvasCss`, où `largeurCanvasCss` est la largeur AFFICHÉE non zoomée lue en continu
  //   par le ResizeObserver. Ainsi les REPÈRES tombent à la bonne FRACTION d'affichage à N largeurs — y compris une 3e largeur (niveau 3) ET
  //   un simple redimensionnement de fenêtre, cas où apercu.ratio (instantané du re-rendu) serait périmé. Pas de lecture de ref en RENDU
  //   (react-hooks/refs) : on ne lit que de l'ÉTAT. Repli sur apercu.ratio tant que la largeur live n'est pas mesurée → BYTE-IDENTIQUE aux
  //   largeurs re-rendues (largeurCanvasCss == largeur du rendu ⇒ ratio == apercu.ratio) donc AUCUNE régression aux niveaux 1-2. Le zoom
  //   n'entre PAS ici (l'overlay SVG est dans le wrapper zoomé, mis à l'échelle par le CSS), exactement comme avant.
  const ratioAffichage = apercu ? (largeurCanvasCss && largeurCanvasCss > 0 ? apercu.largeurCanvasPx / largeurCanvasCss : apercu.ratio) : null;
  const versCss = (p: PointPlan): { x: number; y: number } | null => {
    if (!apercu || ratioAffichage === null) return null;
    const [vx, vy] = apercu.vp.convertToViewportPoint(p.x, p.y);
    return { x: vx / ratioAffichage, y: vy / ratioAffichage };
  };
  const cssSommets = sommets.map(versCss).filter((q): q is { x: number; y: number } => q !== null);
  const cssPaires = paires.map((pr) => versCss(pr.plan)).filter((q): q is { x: number; y: number } => q !== null);
  const cssAttente = planEnAttente ? versCss(planEnAttente) : null;

  // ÉCARTEMENT DES REPÈRES (lot 2) — sensibilité au clic, disponible dès 2 repères, AVANT le tracé. Mètres terrain par PIXEL ÉCRAN (CSS) :
  //   pt-PDF par pixel-device (pas unitaire sur convertToPdfPoint) × pixels-device par pixel-CSS (ratioAffichage) × mètres par pt-PDF
  //   (echelleImplicite). LECTURE SEULE du viewport (aucune retouche du rendu/calage). Étendue du dessin : les sommets tracés si ≥ 3, sinon
  //   la PARCELLE projetée en espace plan (inverseSimilitude) → l'indicateur existe déjà au calage, avant tout tracé.
  const mParPixelCss: number | null = (() => {
    if (!sim || !apercu || ratioAffichage === null || !(ratioAffichage > 0)) return null;
    const o = apercu.vp.convertToPdfPoint(0, 0), ux = apercu.vp.convertToPdfPoint(1, 0);
    const ptParDevicePx = Math.hypot(ux[0] - o[0], ux[1] - o[1]);
    if (!(ptParDevicePx > 0)) return null;
    return ptParDevicePx * ratioAffichage * echelleImpliciteMParPt(sim); // m terrain par pixel écran (CSS)
  })();
  const dessinPlan: PointPlan[] = sim
    ? (sommets.length >= 3 ? sommets : parcelle.flat().map((p) => inverseSimilitude(sim, p)).filter((q): q is PointPlan => q !== null))
    : [];
  const ecartement = levierCalage(paires, dessinPlan, mParPixelCss);

  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
  // POINT 3 — messages d'EMPÊCHEMENT de tracé (accesTrace : page non-plan, calage 0/2 puis 1/2) : EN ROUGE, MÊME jeton d'alerte que le
  //   bandeau « Projection des emprises — … en attente » (BandeauProjection rouge = var(--color-svv-red)). Pas une nouvelle teinte ; textes inchangés.
  const styleEmpechement: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)' };
  // PL-C4 — bandeau « sélection validée / configuration automatique », placé sous le curseur Rotation, avant le schéma (3 vues).
  const bandeauSel = <BandeauSelection selection={selection} confirme={confirmeSel} enCours={occupeSel} onDemander={() => setConfirmeSel(true)} onConfirmer={() => void retirerSelectionEmprise()} onAnnuler={() => setConfirmeSel(false)} />;

  // LOT « paire unique » — navigation PRIMAIRE (unique paire ‹/›) + avertissement de changement, descendus SOUS l'image dans la barre
  //   partagée (slotNav) ; « voir toutes les pièces » descend aussi (slotPieces). Mêmes slots/mêmes composants que la planche →
  //   disposition IDENTIQUE. Les changements de plan/page restent GARDÉS par demanderChangement (un tracé en cours n'est jamais perdu en silence).
  const slotNav = (
    <>
      {nav === 'bestof' ? (
        <BandePlans bande={bande} index={planIndex}
          onPrecedent={() => demanderChangement(() => appliquerPlan(indexPrecedent(planIndex, bande.length)))}
          onSuivant={() => demanderChangement(() => appliquerPlan(indexSuivant(planIndex, bande.length)))} />
      ) : (
        <NavPieceLibre page={page} nbPages={nbPagesPiece}
          onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} />
      )}
      {/* DÉBLOCAGE MANUEL — le GESTE + la MENTION pour la PAGE COURANTE, sous la bande de navigation (best-of OU pièce libre). Une page NON
          traçable propose « utiliser cette page pour tracer » ; une page débloquée à la main affiche la MENTION persistée + le retrait. Une
          page traçable d'origine (ou repérée par image) n'affiche rien. Le geste ne fait qu'OUVRIR l'avertissement/la confirmation ci-dessous. */}
      {cleCourante && etatDeblocage === 'proposer' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" data-action="debloquer-tracage" style={btn} onClick={() => { setReverrouDemande(null); setDeblocageDemande({ pieceId: pageCouranteId!, page: pageCourantePage }); }}>utiliser cette page pour tracer</button>
        </div>
      )}
      {cleCourante && etatDeblocage === 'retirer' && (
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span data-debloque-manuel="true" style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--color-svv-green-ink)', borderRadius: '.35rem', padding: '.05rem .35rem', color: 'var(--color-svv-green-ink)' }} title="Page rendue traçable à la main : elle n’a pas été reconnue automatiquement.">débloquée manuellement</span>
          <button type="button" data-action="reverrouiller-tracage" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} onClick={() => { setDeblocageDemande(null); demanderRetraitDeblocage({ pieceId: pageCouranteId!, page: pageCourantePage }); }}>ne plus utiliser cette page pour tracer</button>
        </div>
      )}
      {/* DÉBLOCAGE MANUEL — AVERTISSEMENT au moment du déblocage (avant de persister) : cette page doit être une VRAIE vue en plan, sinon le
          calage 2 points (similitude) donnera un tracé faux SANS alerte. Confirmation explicite requise. */}
      {deblocageDemande && (
        <div role="alertdialog" aria-label="Confirmer l’utilisation de cette page pour tracer" style={{ fontSize: 12, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.5rem .6rem', display: 'flex', flexDirection: 'column', gap: '.4rem', background: 'var(--color-svv-field)' }}>
          <span>Cette page doit être une <strong>vue en plan</strong> (vue du dessus, non déformée) : vous devez pouvoir y repérer <strong>deux points communs</strong> avec le schéma. Une coupe, une façade ou une perspective donnerait un tracé <strong>faux</strong>, sans alerte.</span>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto' }} onClick={() => void confirmerDeblocage(deblocageDemande)}>Oui, c’est une vue en plan — débloquer</button>
            <button type="button" style={btn} onClick={() => setDeblocageDemande(null)}>Annuler</button>
          </div>
        </div>
      )}
      {/* DÉBLOCAGE MANUEL — RETRAIT avec emprise(s) liée(s) : on avertit des conséquences (suppression + retracer) et on ne supprime qu'après
          confirmation explicite (décision d'Arno). Une page sans emprise ne passe jamais par ici (retrait direct). */}
      {reverrouDemande && (
        <div role="alertdialog" aria-label="Confirmer le retrait du déblocage" style={{ fontSize: 12, border: '1px solid var(--color-svv-red)', borderRadius: '.4rem', padding: '.5rem .6rem', display: 'flex', flexDirection: 'column', gap: '.4rem', background: 'var(--color-svv-field)' }}>
          <span style={{ color: 'var(--color-svv-red)' }}>{reverrouDemande.nbEmprises === 1 ? 'Une emprise a été tracée' : `${reverrouDemande.nbEmprises} emprises ont été tracées`} sur cette page. La reverrouiller <strong>supprimera {reverrouDemande.nbEmprises === 1 ? 'ce polygone' : 'ces polygones'}</strong> — il faudra {reverrouDemande.nbEmprises === 1 ? 'le' : 'les'} retracer sur une autre vue en plan.</span>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} onClick={() => void retirerDeblocage({ pieceId: reverrouDemande.pieceId, page: reverrouDemande.page }, true)}>Supprimer et reverrouiller</button>
            <button type="button" style={btn} onClick={() => setReverrouDemande(null)}>Annuler</button>
          </div>
        </div>
      )}
      {avertissement && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Un calage ou un tracé est en cours — changer de page l’abandonnera.</span>
          <button type="button" style={btn} onClick={() => { avertissement.faire(); setAvertissement(null); }}>Changer quand même</button>
          <button type="button" style={btn} onClick={() => setAvertissement(null)}>Rester</button>
        </div>
      )}
    </>
  );
  const slotPieces = (
    // Repli : atteindre N'IMPORTE QUELLE pièce (le tri PROPOSE, il n'enferme jamais) ; l'ouvrir passe en nav « pièce libre » (page par page).
    <div>
      <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} aria-expanded={pleinListe} onClick={() => setPleinListe((v) => !v)}>
        {pleinListe ? 'masquer les autres pièces' : 'voir toutes les pièces du dossier'} {pleinListe ? '▲' : '▾'}
      </button>
      {pleinListe && (
        // DEMANDE 1 — liste EXPLICITE (un seul clic sur le repli l'ouvre directement, plus de <select> à re-cliquer). DEMANDES 2/3 —
        //   groupée par catégorie + marquage bleu du best-of. MÊME composant que la planche (ListePiecesAnalyse) → les deux ne divergent pas.
        <div style={{ marginTop: '.3rem', maxHeight: '60vh', overflowY: 'auto' }}>
          <ListePiecesAnalyse pieces={pieces} analyseParPiece={analyseParPiece} nonSupportees={piecesNonSupportees} pieceId={pieceId} onChoisir={(id) => ouvrirPieceLibre(id)} piecesBestOf={piecesBestOf} />
        </div>
      )}
    </div>
  );
  // LOT « barres séparées » — la disposition du cas SANS bâtiment (dossier 470) devient la RÉFÉRENCE : DEUX barres d'outils DISTINCTES,
  //   chacune au-dessus de SON panneau, DANS SA colonne (plus de barre unique pleine largeur au-dessus des deux). `styleBarre` PARTAGÉ (MÊME
  //   hauteur mini + MÊME structure) → les deux panneaux (plan à gauche, schéma à droite) démarrent EXACTEMENT à la même hauteur. Aucun
  //   libellé, aucun ORDRE d'éléments, aucun comportement de bouton ne change : seul l'EMPLACEMENT des deux groupes change (plein-largeur →
  //   une barre par colonne). Le niveau 3 (plan seul) garde sa barre `barreNiveau3` en tête (une seule colonne).
  // `minHeight` COMMUN aux DEUX barres → les DEUX panneaux démarrent à la même hauteur dans leurs cartes. Depuis le POINT 2 (curseur de rotation
  //   raccourci), la barre droite tient sur UNE ligne à la largeur usuelle → une hauteur d'UNE ligne (1.9rem) suffit, aucune barre ne déborde,
  //   plus de vide. Le `flexWrap` reste un filet : si une barre débordait à une largeur extrême, elle passerait proprement sur deux lignes.
  const styleBarre: CSSProperties = { display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0, minHeight: '1.9rem' };
  // BARRE GAUCHE — au-dessus du PLAN (colonne colpdf) : ZOOM (contrôle) à gauche, bloc ÉCRAN [mode XL · (niveau 2) mode XXL] à
  //   DROITE de la carte (space-between) — AUX DEUX NIVEAUX (POINT 1) : même au niveau 1, « mode XL » (basculement d'affichage) est
  //   poussé contre le bord droit, séparé visuellement du groupe Zoom. Aucun handler modifié.
  const barreGauchePlan = (
    <div style={{ ...styleBarre, justifyContent: 'space-between' }}>
      <ZoomPdf zoom={zoom} onDezoom={dezoomer} onZoom={zoomer} onAjuster={ajusterPdf} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
        <button type="button" style={btn} onClick={() => setImageAgrandie((v) => !v)}
          aria-label={imageAgrandie ? 'Quitter le mode XL' : 'Activer le mode XL (tracer en grand)'}>{imageAgrandie ? '✕ quitter le mode XL' : '⤢ mode XL'}</button>
        {/* LOT 3 (décision Arno C2) — bouton d'entrée du NIVEAU 3, dans la barre de SA colonne, au-dessus de son image. Présent UNIQUEMENT au
            niveau 2 (imageAgrandie) : le niveau 3 s'ouvre DEPUIS le niveau 2 et y revient. Le niveau 1 reste STRICTEMENT inchangé (pas de bouton).
            DEMANDE 1 — libellé « (tracer) » quand le tracé est possible (page en plan ET calage complet) ; « mode XXL » (SANS « tracer »)
            sinon : on ne promet PAS une fonction indisponible → le niveau 3 s'ouvre alors en CONSULTATION. Jamais désactivé. */}
        {imageAgrandie && (
          <button type="button" style={btn} onClick={() => { if (acces.disponible) setMode('trace'); setPlanSeul(true); }}
            aria-label={acces.disponible ? 'Mode XXL — plein écran pour tracer' : 'Mode XXL — plein écran (consultation ; tracé indisponible tant que le calage n’est pas fait)'}>{acces.disponible ? '⤢ mode XXL (tracer)' : '⤢ mode XXL'}</button>
        )}
      </div>
    </div>
  );
  // BARRE DROITE — au-dessus du SCHÉMA (sa colonne) : `RotationSchema` (Rotation [curseur] 0° [Remettre à 0]) puis « Agrandir le schéma ».
  //   POINT 2 — (a) curseur RACCOURCI (largeurCurseur=48) UNIQUEMENT ICI (via prop ; les autres appelants de RotationSchema gardent 120) pour que
  //   les 4 éléments tiennent SUR UNE SEULE LIGNE à ~1312 px ; (b) tout le GROUPE justifié À DROITE de la carte (flex-end). Le pas reste 1°.
  const barreDroiteSchema = (
    <div style={{ ...styleBarre, justifyContent: 'flex-end' }}>
      <RotationSchema angle={angle} onAngle={setAngle} largeurCurseur={48} />
      <button type="button" style={btn} onClick={() => setPleinEcran(true)}>⤢ Agrandir le schéma</button>
    </div>
  );

  // LOT 3 (enchaînement) — SOURCE UNIQUE des cartouches de bâtiment (mêmes libellés, mêmes états, même onClick) réutilisée par la vue 2
  //   colonnes (repli en lignes) ET par la bande du niveau 3 (défilement horizontal). `avecRefActif` ne pose le ref QUE sur la bande du
  //   niveau 3 (auto-défilement) — jamais deux refs concurrents (les deux emplacements ne sont jamais montés en même temps).
  const boutonsCartouches = (avecRefActif: boolean) => batiments.map((b) => {
    // SOURCE UNIQUE : même statut (validee/a_valider/ignoree/a_tracer) que la capsule du cartouche → jamais « ✓ tracée » là où la capsule dit « à valider ».
    const st = statutEmpriseBatiment(emprises.some((e) => e.corpsId === b.corpsId), ignores.some((i) => i.corpsId === b.corpsId), validationParCorps[b.corpsId] ?? false);
    const actif = b.corpsId === corpsEffectif;
    return (
      <button key={b.corpsId} ref={avecRefActif && actif ? cartoucheActifRef : undefined} type="button" onClick={() => setCorpsSel(b.corpsId)}
        style={{ ...btn, flex: '0 0 auto', whiteSpace: 'nowrap', fontWeight: actif ? 700 : 400, borderColor: actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }}>
        {libelleBatiment(b)} — {MOT_STATUT_EMPRISE[st]}
      </button>
    );
  });

  // LOT 3 (enchaînement) — SOURCE UNIQUE de la CHAÎNE de validation (bouton plein rouge, un seul visible selon `etapeChaineEmprise`) réutilisée
  //   par la vue 2 colonnes ET par la bande du niveau 3. On BRANCHE sur les actions existantes (enregistrer/valider/modifier) : aucune règle
  //   d'activation/désactivation réimplémentée. Rendu uniquement dans la branche `batSel` → `batSel!` sûr.
  const chaineBoutons = (
    <>
      {etapeChaine === 'enregistrer' && (
        <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto' }} disabled={occupe || !tracable || !sim || sommets.length < 3} onClick={() => void enregistrer()}>
          Enregistrer l’emprise de {libelleBatiment(batSel!)}
        </button>
      )}
      {etapeChaine === 'valider' && (
        <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto' }} disabled={occupe} onClick={() => void validerEmpriseChaine()}>
          Valider l’emprise de {libelleBatiment(batSel!)}
        </button>
      )}
      {etapeChaine === 'modifier' && (
        <>
          <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-svv-green-ink)' }}>✓ Emprise de {libelleBatiment(batSel!)} validée</div>
          <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto' }} disabled={occupe} onClick={() => void modifierEmpriseChaine()}>
            Modifier l’emprise de {libelleBatiment(batSel!)}
          </button>
        </>
      )}
    </>
  );

  // LOT 3 — BARRE du NIVEAU 3 (plan seul, plein écran) : elle REMPLACE ligneOutils dans le même emplacement de tête (jamais les deux à la
  //   fois). Contient tout ce qu'il faut pour TRACER — retour au niveau 2, zoom, annuler/reprendre le tracé, compteur de sommets — et DIT
  //   clairement que le calage est indisponible ici (pas de schéma). « Reprendre le tracé » n'efface QUE les sommets : le CALAGE fait au
  //   niveau 2 (paires) est préservé, on n'y touche pas. Aucun outil de calage : au niveau 3 le clic pose des SOMMETS (mode 'trace' forcé).
  const barreNiveau3 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', minWidth: 0 }}>
      {/* LOT 3 (demande 3b) — RETOUR + ZOOM à GAUCHE ; le bloc TRACÉ [Annuler dernier sommet · Reprendre le tracé · Sommets : N] justifié À
          DROITE (au-dessus de l'image). Quand le tracé est impossible ici, le MESSAGE d'empêchement REMPLACE ce bloc, au MÊME endroit (à droite). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} onClick={() => setPlanSeul(false)}
            aria-label="Revenir au mode XL (liseuse et schéma)">← Revenir au mode XL</button>
          <ZoomPdf zoom={zoom} onDezoom={dezoomer} onZoom={zoomer} onAjuster={ajusterPdf} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
          {acces.disponible ? (
            <>
              <button type="button" style={btn} disabled={sommets.length === 0} onClick={() => setSommets((s) => s.slice(0, -1))}>Annuler dernier sommet</button>
              <button type="button" style={btn} disabled={sommets.length === 0} onClick={() => { setSommets([]); setDebordement(null); }}>Reprendre le tracé</button>
              <span style={styleAide}>Sommets : {sommets.length}{paires.length > 0 ? ` · calage ${paires.length} repère${paires.length > 1 ? 's' : ''} (fait au mode XL)` : ''}</span>
            </>
          ) : (
            // Tracé indisponible (page non-plan OU calage incomplet) : le MESSAGE remplace le bloc de boutons, au MÊME endroit. Jamais de bouton muet ni de vide.
            <span role="note" style={styleEmpechement}>{acces.message}</span>
          )}
        </div>
      </div>
      {/* HONNÊTETÉ (jamais laisser croire que le calage/tracé est cassé) : on DIT ce qui se passe et où. Le niveau 3 ne CALE pas (une colonne) →
          quand le calage manque, on renvoie EXPLICITEMENT vers le mode XL (demande E). */}
      {acces.disponible ? (
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .55rem' }}>
          Vue <strong>plan seul</strong> pour tracer avec précision. Le calage est fait : tracez, <strong>enregistrez et validez chaque bâtiment ici même</strong> (bande en tête), puis passez au suivant — sans quitter le plein écran.
        </div>
      ) : acces.motif === 'calage' ? (
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .55rem' }}>
          Le <strong>calage</strong> (2 paires plan ↔ schéma) ne se fait pas ici (une seule colonne, pas de schéma) : <strong>revenez au mode XL</strong> pour caler, puis revenez tracer.
        </div>
      ) : (
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .55rem' }}>
          Vue <strong>plan seul</strong> en <strong>consultation</strong> (agrandissement). Le tracé se fait sur une <strong>vue en plan</strong> : revenez au mode XL et ouvrez une planche traçable.
        </div>
      )}
    </div>
  );

  // SUITE LOT 7b47817 — le SECOND bloc « barre d'outils de calage/tracé + encadré de contrôle + aire » suit le MÊME état (procEnCours) que
  //   le guide : au repos à sa position actuelle (colonne droite, plus bas), et SOUS LE SCHÉMA — GROUPÉ avec le guide — pendant tout le
  //   processus de création. Défini UNE seule fois, rendu à deux sites MUTUELLEMENT EXCLUSIFS (jamais deux, jamais aucun). Ainsi le
  //   RÉSIDU de calage et l'écart ÉCHELLE implicite/déclarée (fiabilité du calage) restent LISIBLES pendant qu'on trace. Aucun calcul ni
  //   coordonnée touché : simple relocalisation d'affichage (vc/aire/vv sont calculés en amont, inchangés).
  const blocOutilsCalage = (
    <>
      {/* Outils de calage / tracé. LOT « calage avant tracé » — le bouton « Tracé » n'existe QUE lorsque le calage de la page est complet
          (acces.disponible). Tant qu'il ne l'est pas (page en plan mais < 2 paires), un MESSAGE prend sa place (jamais de bouton grisé ni de
          clic silencieux) : c'est le SEUL moyen de passer en mode 'trace' → invariant « mode 'trace' ⇒ calage complet », sans toucher cliquerPdf. */}
      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!tracable} style={{ ...btn, opacity: tracable ? 1 : 0.4, fontWeight: mode === 'calage' ? 700 : 400 }} onClick={() => setMode('calage')}>Calage ({paires.length} repère{paires.length > 1 ? 's' : ''})</button>
        {acces.motif === 'calage' ? (
          <span role="note" style={{ ...styleEmpechement, maxWidth: 320 }}>{acces.message}</span>
        ) : (
          <button type="button" disabled={!tracable} style={{ ...btn, opacity: tracable ? 1 : 0.4, fontWeight: mode === 'trace' ? 700 : 400 }} onClick={() => setMode('trace')}>Tracé ({sommets.length})</button>
        )}
        <button type="button" style={btn} onClick={() => mode === 'trace' ? setSommets((s) => s.slice(0, -1)) : (planEnAttente ? setPlanEnAttente(null) : setPaires((p) => p.slice(0, -1)))}>Annuler dernier</button>
        <button type="button" style={btn} onClick={() => { setSommets([]); setPaires([]); setPlanEnAttente(null); setDebordement(null); }}>Reprendre</button>
        <label style={styleAide}>échelle 1: <input inputMode="numeric" value={ratioDeclareSaisi} onChange={(e) => setRatioDeclareSaisi(e.target.value)} placeholder="200" style={{ width: 60 }} /></label>
      </div>
      <BandeauCalage calage={vc} nbPaires={paires.length} />
      {/* Lot 2 — ÉCARTEMENT (avant tracé, dès 2 repères) : information COMPLÉMENTAIRE et distincte du résidu par repère du BandeauCalage
          (après calage, dès 3 repères). L'un pronostique la sensibilité, l'autre mesure l'écart réel par point → titres distincts, jamais contradictoires. */}
      {ecartement && <IndicateurEcartement etat={etatLevier(ecartement.levier)} xCm={ecartement.erreurParPixelM !== null ? ecartement.erreurParPixelM * 100 : null} />}
      <BandeauVraisemblance aireM2={aire} v={vv} />
    </>
  );

  // PROJ-3b-fix ② — décision PURE (testée) : chargement · échec · succès-vide · prêt. « Aucun bâtiment » n'apparaît QU'au succès réel.
  const vue = affichageTrace(etat, batiments.length);
  if (vue === 'chargement') {
    return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des bâtiments…</div>;
  }
  if (vue === 'indisponible') {
    return (
      <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        <span>{message ?? 'Bâtiments indisponibles.'}</span>
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setRechargeLocal((n) => n + 1)}>Recharger</button>
      </div>
    );
  }
  if (vue === 'aucun-batiment') {
    // LOT 86 — LECTURE SEULE : le schéma reste CONSULTABLE (parcelle + empreinte + bâti BD TOPO) même sans bâtiment déclaré. `affichageTrace`
    //   reste la SOURCE UNIQUE de décision ; ici on ne masque QUE les contrôles de TRACÉ, pas le dessin. Aucun onCliquer (pas de tracé),
    //   pas de points de calage — géométrie du schéma STRICTEMENT inchangée.
    // LOT « barres alignées » — la BARRE DE ROTATION est le PREMIER élément de la carte (au-dessus du schéma), au même Y que la barre de
    //   zoom de la liseuse à gauche (cartes de MÊME padding) ; le schéma démarre juste dessous, aligné avec l'image de gauche. Sélection +
    //   options DESCENDENT sous le schéma. Carte svv-card pour la parité de padding.
    const blocSchema = boite ? (
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
        <RotationSchema angle={angle} onAngle={setAngle} />
        <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} calageLambert={[]} statuts={statutParCleabs} etiquettes={etiquettesProjection(polygonesPermis, emprises, batiments)} />
        {bandeauSel}
        {/* Options d'AFFICHAGE (bâti existant / futur / repères / projection) — pilotage visuel, pas un contrôle de tracé. Porte aussi la légende de catégories. */}
        <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={comptesVisibilite.futur} nbExistant={comptesVisibilite.existant} />
        <LegendeProjectionEmprises legende={legendeProjection(polygonesPermis, emprises, batiments)} />
      </div>
    ) : (
      // HONNÊTETÉ (piège LOT 71) : rien à dessiner → dire CE QUI MANQUE, jamais un cadre vide muet.
      <div className="svv-card" role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Rien à dessiner pour l’instant : la parcelle du permis n’est pas disponible (empreinte non figée) — sans elle, ni le contour ni le bâti BD TOPO ne peuvent être cadrés.</div>
    );
    return (
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises — reconstitution par bâtiment <span style={styleAide}>(jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span></div>
        <BandeauProjection verdict={verdict} nbValides={nbValides} nbAValider={nbAValider} />
        {/* POINT ③ — empêchement LÉGITIME (0 bâtiment DÉCLARÉ) : la règle (lot 3c / affichageTrace) est INCHANGÉE, seul le message gagne en
            CLARTÉ et en VISIBILITÉ. Il RÉSOUT le paradoxe « je vois des bâtiments A, B, C mais on me dit 0 bâtiment » : les formes du schéma
            sont le bâti EXISTANT (BD TOPO, pour se repérer), PAS un bâtiment déclaré du permis — c'est ce dernier qui débloque le tracé.
            Style RECADRÉ (LOT 90) : consultable, seul le TRACÉ attend un bâtiment ; encre (plus muet) + liseré rouge → on ne le rate plus. */}
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-ink)', border: '1px solid var(--color-svv-line)', borderLeft: '3px solid var(--color-svv-red)', borderRadius: '.4rem', padding: '.5rem .6rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <strong>Tracé indisponible : aucun bâtiment déclaré au permis.</strong>
          <span>
            {polygonesPermis.length > 0 && <>Les formes repérées (A, B, C…) sur le schéma sont le <strong>bâti existant</strong> (données BD TOPO), affichées pour se repérer — <strong>pas</strong> un bâtiment déclaré du permis. </>}
            Vous pouvez <strong>consulter</strong> les plans (liseuse à gauche) et le schéma (à droite). Pour <strong>tracer</strong> l’emprise du futur bâtiment et l’enregistrer, déclarez-le d’abord via « <strong>+ ajouter un bâtiment</strong> » (bloc « Le permis / Les bâtiments » ci-dessus) : le calage et l’enregistrement apparaîtront alors.
          </span>
        </div>
        {/* LOT 3a (layout) — DISPOSITION CÔTE À CÔTE lecture seule, aux MÊMES proportions/gouttière que le nominal (minmax(0,1.3fr) | minmax(0,1fr),
            gap .8rem) : LISEUSE à gauche (titre en en-tête → plus de colonne latérale vide, cf. LiseusePieces `titreEnEntete`), SCHÉMA à droite.
            LOT 90 — le CALAGE reste FERMÉ à 0 bâtiment (rien à enregistrer). `avecLiseuse=false` (une liseuse standalone existe déjà ailleurs)
            → pas de 2 colonnes (sinon colonne gauche vide) : on empile le seul schéma, comme avant. */}
        {avecLiseuse ? (
          // PARITÉ GRANDES IMAGES + LOT 3 — TROIS NIVEAUX, un seul conteneur (la liseuse à clé stable « liseuse » n'est jamais démontée entre
          //   niveaux → pas de re-téléchargement) ; en LECTURE SEULE (la liseuse reste PASSIVE, aucun calage). On NE réutilise NI le conteneur
          //   de coordonnées NI l'aperçu de la surface de dessin dans cette branche.
          //   • NIVEAU 1 : grille 2 colonnes EN PAGE (liseuse | schéma). INCHANGÉ.
          //   • NIVEAU 2 (imageAgrandie, !planSeul) : la MÊME grille 2 colonnes en PLEIN ÉCRAN. INCHANGÉ.
          //   • NIVEAU 3 (planSeul) : la LISEUSE SEULE en plein écran, une colonne, en CONSULTATION (tracé impossible sans bâtiment → message
          //     porté par la liseuse via `messagePlanSeul`). NOUVEAU. `imageAgrandie={imageAgrandie && !planSeul}` : le flag niveau 2 retombe à
          //     l'entrée du niveau 3 (l'agrandissement du cadre y est porté par `planSeul`), pour que l'Échap partagé (BlocTraceEmprise) et la
          //     bascule de la liseuse ne se marchent pas dessus.
          <div role={imageAgrandie || planSeul ? 'dialog' : undefined} aria-modal={imageAgrandie || planSeul || undefined}
            aria-label={planSeul ? 'Plan seul en plein écran — consultation (aucun bâtiment)' : imageAgrandie ? 'Visionneuse agrandie — liseuse et schéma (lecture seule)' : undefined}
            style={planSeul
              ? { position: 'fixed', inset: 0, zIndex: 1001, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.5rem' }
              : imageAgrandie
                ? { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem', alignContent: 'start' }
                : { display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem' }}>
            <LiseusePieces key="liseuse" dossierId={dossierId} onValeurEcrite={onValeurLue} donneesPrechargees={donneesLiseuse} titreEnEntete imageAgrandie={imageAgrandie && !planSeul} onToggleImageAgrandie={() => setImageAgrandie((v) => !v)} planSeul={planSeul} onOuvrirPlanSeul={() => setPlanSeul(true)} onQuitterPlanSeul={() => setPlanSeul(false)} messagePlanSeul="Impossible de tracer un polygone sans bâtiment renseigné" />
            {!planSeul && blocSchema}
          </div>
        ) : blocSchema}
      </div>
    );
  }

  // POSITION DU BLOC EMPRISE — dès qu'AU MOINS UNE emprise de bâtiment en projet existe pour ce permis (pas les polygones BD TOPO existants,
  //   qui sont là d'office), le bloc « Modifier l'emprise… + ligne + gestes ajuster/retoucher/effacer » REMONTE juste sous le schéma (au-dessus
  //   du bandeau « Empreinte Parcelle(s) »). Sinon, il reste à sa place actuelle, plus bas. Déplacement de POSITION uniquement : contenu, logique,
  //   conditions d'activation et navigation INCHANGÉS (même JSX `blocEmprises`, rendu à UN seul des deux emplacements).
  const aEmprises = emprises.length > 0;
  const blocEmprises = (
    <>
      {chaineBoutons}
      {/* BUG PROV — le RÉSULTAT (succès OU erreur serveur) s'affiche ICI, au point d'action : un bouton MUET était le pire cas. */}
      {message && <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-svv-red)' }}>{message}</div>}

      {/* Emprises de CE bâtiment : ajuster (delta rigide), retoucher (sommets, mono-polygone) ou effacer. Pendant un ajustement (une ou bloc), les boutons « ajuster » se masquent. */}
      <ListeEmprises emprises={empriseDuBat} empriseEnRetouche={retouche?.id ?? null} empriseEnAjustement={ajustement?.id ?? null} nomCorps={batSel ? libelleBatiment(batSel) : undefined}
        onSupprimer={(id) => void posterProjection('supprimer', corpsEffectif!, { id })}
        onRetoucher={(id) => demarrerRetouche(id)} onAjuster={ajustement ? undefined : (id) => demarrerAjustement(id)} />

      {/* PROJ-3t (lot 3b) — SÉLECTEUR de portée : « cette emprise » (bouton « ajuster » de chaque ligne ci-dessus) OU « toutes ensemble »
          (positions relatives conservées). Offert quand ≥ 2 emprises dans le DOSSIER et aucun ajustement en cours. */}
      {!ajustement && emprises.length >= 2 && (
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={demarrerAjustementBloc}>ajuster toutes les emprises du dossier ensemble ({emprises.length})</button>
      )}

      {/* PANNEAU D'AJUSTEMENT (souris + boutons ; les boutons suffisent seuls, mobile-first). Réversibilité garantie. */}
      {ajustement && apercuAjustement && (
        <PanneauAjustement resume={resumeAjustement(ajustement.delta)} occupe={occupe} aDeltaEnregistre={ajustement.enregistre} bloc={ajustement.bloc}
          onTranslate={onTranslate} onRotate={onRotate} onScale={onScale}
          onEnregistrer={() => void enregistrerAjustementGeste()} onAbandonner={abandonnerAjustement} onOrigine={() => void revenirOrigineAjustement()} />
      )}

      {/* PROJ-3s — PANNEAU DE RETOUCHE (visible seulement en retouche) : sous-mode + annuler / abandonner / valider. Mobile-first. */}
      {retouche && (
        <div style={{ border: '1px solid var(--color-svv-ink)', borderRadius: '.5rem', padding: '.6rem', background: 'var(--color-svv-surface)' }} role="group" aria-label="retouche de l’emprise">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Retouche de l’emprise <span style={styleAide}>— rien n’est modifié en base tant que vous ne validez pas</span></div>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginBottom: '.3rem' }}>
            {(['deplacer', 'inserer', 'supprimer'] as ModeRetouche[]).map((m) => (
              <button key={m} type="button" style={{ ...btn, fontWeight: modeRetouche === m ? 700 : 400 }} disabled={occupe} onClick={() => { setModeRetouche(m); setSommetSel(null); }}>
                {m === 'deplacer' ? 'Déplacer un sommet' : m === 'inserer' ? 'Insérer sur un bord' : 'Supprimer un sommet'}
              </button>
            ))}
          </div>
          <p style={{ ...styleAide, margin: '0 0 .3rem' }}>
            {modeRetouche === 'deplacer' ? (sommetSel === null ? 'Touchez un sommet à déplacer, puis touchez sa nouvelle position.' : 'Touchez la nouvelle position du sommet sélectionné.')
              : modeRetouche === 'inserer' ? 'Touchez un bord pour y insérer un sommet.'
                : 'Touchez un sommet pour le supprimer (un contour garde au moins 3 sommets).'}
          </p>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" style={btn} disabled={occupe || retouche.hist.length === 0} onClick={annulerRetouche}>Annuler la dernière action</button>
            <button type="button" style={btn} disabled={occupe} onClick={abandonnerRetouche}>Abandonner</button>
            <button type="button" className="svv-btn" style={{ width: 'auto' }} disabled={occupe} onClick={() => void validerRetouche()}>Valider la retouche</button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises — reconstitution par bâtiment <span style={styleAide}>(jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span></div>
      <BandeauProjection verdict={verdict} nbValides={nbValides} nbAValider={nbAValider} />

      {/* Sélecteur de bâtiment : statut par bâtiment (mot + couleur d'appui). SOURCE UNIQUE `boutonsCartouches` (réutilisée par la bande du niveau 3). */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {boutonsCartouches(false)}
      </div>

      {batSel && (
        // PROJ-AGR / LOT 3 — TROIS NIVEAUX, un SEUL conteneur (le canvas/pdfContainerRef n'est jamais démonté → apercu préservé, aucun 3e
        //   rendu pdf.js) : seuls le STYLE et les enfants changent.
        //   • NIVEAU 1 (défaut) : grille 2 colonnes EN PAGE. INCHANGÉ.
        //   • NIVEAU 2 (imageAgrandie, !planSeul) : la MÊME grille 2 colonnes en PLEIN ÉCRAN (plan large + schéma pour le calage). INCHANGÉ.
        //   • NIVEAU 3 (planSeul) : le PLAN SEUL en plein écran, une colonne, TRACÉ actif, calage indisponible (schéma masqué). NOUVEAU.
        //   Le canvas se re-rend à la largeur de chaque niveau (effet, deps imageAgrandie+planSeul) → bitmap net ; les repères restent justes
        //   à toute largeur via le ratio d'affichage live (versCss). Slots à CLÉ STABLE (topbar/colpdf/schema) → React réconcilie par clé et
        //   ne démonte JAMAIS la colonne du plan en changeant de niveau.
        <div role={imageAgrandie || planSeul ? 'dialog' : undefined} aria-modal={imageAgrandie || planSeul || undefined}
          aria-label={planSeul ? 'Plan seul en plein écran — tracé (calage indisponible)' : imageAgrandie ? 'Visionneuse agrandie — tracer en grand' : undefined}
          style={planSeul
            ? { position: 'fixed', inset: 0, zIndex: 1001, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.5rem' }
            : imageAgrandie
              ? { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem', alignContent: 'start' }
              : { display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem' }}>
          {/* Au NIVEAU 3 (plan seul, une colonne) : une SEULE barre `barreNiveau3` en tête, hors carte. Aux niveaux 1-2, PLUS AUCUN bandeau
              au-dessus des cadres : chaque barre est DANS la carte de sa colonne, en tête (parité EXACTE avec le cas 0 bâtiment). */}
          {planSeul && (
            <div key="topbar" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              {/* LOT 3 (enchaînement) — EN TÊTE du niveau 3, QUAND ① au moins un bâtiment ET ② le calage est complet (acces.disponible) : la BANDE
                  = sélecteur de bâtiments (défilement horizontal, jamais de repli multi-lignes, actif amené dans la vue) + le bouton de validation
                  du bâtiment actif (source unique `chaineBoutons`), sur une même ligne. Sinon : rien ici → barreNiveau3 garde ses messages rouges.
                  Bande et messages ne coexistent JAMAIS (conditions opposées : disponible vs non-disponible). */}
              {acces.disponible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '.4rem', overflowX: 'auto', flex: '1 1 auto', minWidth: 0, paddingBottom: '.2rem' }}>
                    {boutonsCartouches(true)}
                  </div>
                  <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '.4rem' }}>{chaineBoutons}</div>
                </div>
              )}
              {barreNiveau3}
            </div>
          )}
          {/* Colonne PDF = CARTE (svv-card, comme la liseuse du cas 0 bâtiment) : la BARRE GAUCHE À L'INTÉRIEUR, en tête, puis l'image, la nav,
              le guide. MÊME cadre/arrondi/padding que la carte du schéma → deux cadres jumeaux, chacun coiffé de SES outils, coupés par la
              gouttière. `gap .5rem` = celui de la carte du schéma → les deux panneaux démarrent à la même hauteur sous des barres de même hauteur. */}
          <div key="colpdf" className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            {/* BARRE GAUCHE — À L'INTÉRIEUR de la carte, en tête (jamais au niveau 3 : la barre y est barreNiveau3, hors carte). */}
            {!planSeul && barreGauchePlan}
            {/* a) IMAGE — conteneur NON transformé (repère du clic) ; le PDF + l'overlay sont dans un wrapper zoomé/déplacé. Glisser = déplacer (si zoomé), cliquer = poser un point.
                🔴 RÈGLE ABSOLUE : le repère de coordonnées (top-left du conteneur via getBoundingClientRect, canvas width:100%, ratio) est INCHANGÉ.
                CADRE À HAUTEUR FIXE + DÉFILEMENT INTERNE : la hauteur fixe et l'overflow sont portés par le WRAPPER extérieur, JAMAIS par le
                conteneur `pdfContainerRef` → getBoundingClientRect reste live (r.left/r.top suivent le défilement) → cliquerPdf INCHANGÉ. Seul
                `minHeight` du conteneur est fixé (vers le BAS uniquement : ni le top-left, ni la largeur du canvas, ni le ratio ne changent).
                LOT 3 — niveau 3 (planSeul) traité comme le niveau 2 pour la hauteur : pas de cap, l'image occupe toute la largeur (défilement porté par le conteneur plein écran). */}
            <div style={(imageAgrandie || planSeul) ? undefined : { height: HAUTEUR_CADRE_RENDU, overflow: 'auto' }}>
            <div ref={pdfContainerRef} style={{ position: 'relative', minHeight: (imageAgrandie || planSeul) ? undefined : HAUTEUR_CADRE_RENDU, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', overflow: 'hidden', touchAction: 'none', cursor: zoom > 1 ? 'grab' : (tracable ? 'crosshair' : 'default') }}
              onPointerDown={onPdfPointerDown} onPointerMove={onPdfPointerMove} onPointerUp={onPdfPointerUp}>
              <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
                <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {cssSommets.length >= 2 && <polyline points={cssSommets.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(163,4,2,.12)" stroke="var(--color-svv-red)" strokeWidth={2} />}
                  {cssSommets.map((q, i) => <circle key={`s${i}`} cx={q.x} cy={q.y} r={3.5} fill="var(--color-svv-red)" />)}
                  {cssPaires.map((q, i) => <g key={`c${i}`}><rect x={q.x - 5} y={q.y - 5} width={10} height={10} fill="none" stroke="#1f77b4" strokeWidth={2} /><text x={q.x + 7} y={q.y - 7} fontSize={12} fill="#1f77b4">{i + 1}</text></g>)}
                  {cssAttente && <circle cx={cssAttente.x} cy={cssAttente.y} r={5} fill="none" stroke="#1f77b4" strokeWidth={2} strokeDasharray="3 2" />}
                </svg>
              </div>
            </div>
            </div>{/* fin du CADRE À HAUTEUR FIXE (wrapper à défilement interne — hauteur/overflow HORS du conteneur de coordonnées) */}
            {/* b) + c) BARRE PARTAGÉE (même composant que la planche), SOUS l'image : nav complète + voir-toutes + lien (haut), puis
                statut/best-of/analyses (bas). Zoom + « mode XL » sont AU-DESSUS (ligneOutils). Zéro outil de tracé.
                LOT 3 — MASQUÉE au niveau 3 (plan seul) : cette vue est dédiée au TRACÉ, sa barre (retour/zoom/tracé) est barreNiveau3, en tête. */}
            {!planSeul && <BarreVisionneusePieces pieceId={pieceId} nomCourant={nomCourant} page={page} nbPagesPiece={nbPagesPiece} echelle={planAffiche?.echelle ?? null}
              nav={nav} slotNav={slotNav} slotPieces={slotPieces}
              onOuvrirDocument={() => void ouvrirDocumentComplet()} onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} onRetourBestOf={retourBestOf}
              pageDansBestOf={pageDansBestOf} onRetirerBestOf={() => { if (planAffiche) void retirerDuBestOf(planAffiche!); }} onAjouterBestOf={() => { if (pieceId !== null) void ajouterAuBestOf(pieceId, page); }}
              statutPage={statutPage} resumePages={resumePages} pleinPagesAnalysees={pleinPagesAnalysees} onTogglePleinPages={() => setPleinPagesAnalysees((v) => !v)}
              runCourant={runCourant} lectureCourante={lectureCourante} reperEnCours={reperEnCours} lectureEnCours={lectureEnCours}
              onAnalyseFichier={() => void reperer()} onAnalysePage={() => void analyserPage()} reperMsg={reperMsg} lectureRes={lectureRes} onAnnulerValeur={() => void annulerValeurPage()} />}
            {/* d) POSITION INITIALE (AU REPOS) du bloc « Étape 1 — caler la vue » : en bas de la colonne gauche, sous la barre. FIX
                « ascenseur » : affiché ICI UNIQUEMENT quand AUCUN processus n'est en cours (`!procEnCours`) — dès qu'on amorce un calage,
                il migre sous le schéma (à droite) et n'en bouge plus jusqu'à la validation. Un seul exemplaire à la fois (conditions
                mutuellement exclusives). Fondu sobre à l'apparition (désactivé sous prefers-reduced-motion).
                LOT 3 — jamais au niveau 3 (`!planSeul`) : ce guide parle du CALAGE, indisponible en plan seul (le tracé y est guidé par barreNiveau3). */}
            {!planSeul && tracable && !procEnCours && <div className="svv-guide-fondu"><GuidageTraceBox g={guidage}
              onAnnulerDernier={mode === 'calage' ? () => { if (planEnAttente) setPlanEnAttente(null); else setPaires((p) => p.slice(0, -1)); } : undefined}
              onRecommencer={mode === 'calage' ? () => { setPaires([]); setPlanEnAttente(null); } : undefined}
              peutAnnuler={paires.length > 0 || planEnAttente !== null} /></div>}
          </div>

          {/* Colonne de droite — DEMANDE 1 : le SCHÉMA en PREMIER, aligné à la MÊME HAUTEUR que l'image à gauche (les deux cadres démarrent
              sur la même ligne). La rotation, le bandeau de sélection et le guidage descendent SOUS le schéma. 🔴 RÈGLE ABSOLUE : le
              repère de coordonnées du calage (SchemaParcelleTrace, SVG « meet ») est INCHANGÉ — seul l'ordre des blocs voisins a bougé.
              LOT 3 — colonne ENTIÈREMENT MASQUÉE au niveau 3 (plan seul) : le calage exige les deux colonnes, il se fait aux niveaux 1-2.
              Clé stable « schema » : React la démonte proprement en entrant au niveau 3 SANS toucher à la colonne du plan (clé « colpdf »). */}
          {!planSeul && (
          <div key="schema" className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            {/* BARRE DROITE — À L'INTÉRIEUR de la carte, en tête (rotation + « Agrandir le schéma »), au-dessus du schéma. MÊME hauteur mini
                (styleBarre) et MÊME gap (.5rem) que la carte du plan → le schéma démarre à la même hauteur que l'image. */}
            {barreDroiteSchema}
            <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} calageLambert={ajustement ? [] : paires.map((p) => p.lambert)} residusCalage={residus.ecarts} indicePireCalage={residus.indexPlusFautif} statuts={statutParCleabs}
              onCliquer={ajustement ? undefined : (retouche ? cliquerRetouche : (mode === 'calage' && planEnAttente ? cliquerSchema : undefined))} retoucheAnneau={retouche?.anneau ?? null} sommetSelectionne={sommetSel}
              apercuAjustement={apercuAjustement} onPointeurAjustement={ajustement ? pointeurAjustement : undefined} />
            {/* POSITION REMONTÉE — dès qu'une emprise en projet existe, le bloc emprise vient JUSTE SOUS le schéma, au-dessus de « Empreinte Parcelle(s) ». */}
            {aEmprises && blocEmprises}
            {/* Sous le schéma : bandeau de sélection (la rotation est désormais dans la barre droite, au-dessus du schéma). */}
            {bandeauSel}
            {/* FIX « ascenseur » — PENDANT tout le processus de création (calage amorcé → 1/2 → 2/2 → tracé des sommets → jusqu'à la
                validation), le guide « Étape 1 — caler la vue » ET le bloc d'outils/contrôle (résidu, échelle, aire) restent ICI, SOUS LE
                SCHÉMA, GROUPÉS et dans cet ordre, quel que soit le côté cliqué (`procEnCours`). Un seul conteneur (fondu unique) ; exclusif
                des rendus « au repos » (guide à gauche, bloc plus bas dans cette colonne). Le résidu/échelle restent lisibles pendant le tracé. */}
            {tracable && procEnCours && <div className="svv-guide-fondu" style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              <GuidageTraceBox g={guidage}
                onAnnulerDernier={mode === 'calage' ? () => { if (planEnAttente) setPlanEnAttente(null); else setPaires((p) => p.slice(0, -1)); } : undefined}
                onRecommencer={mode === 'calage' ? () => { setPaires([]); setPlanEnAttente(null); } : undefined}
                peutAnnuler={paires.length > 0 || planEnAttente !== null} />
              {blocOutilsCalage}
            </div>}
            {/* « Agrandir le schéma » vit dans la BARRE DROITE (barreDroiteSchema, au-dessus du schéma), plus dans une barre pleine largeur. */}

            {/* Options de visibilité + sélection des polygones « en projet ». */}
            <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={comptesVisibilite.futur} nbExistant={comptesVisibilite.existant} />
            <SelectionPolygonesProjet polygones={polygonesReperes} ecartes={ecartes} onToggle={(cleabs, ecarter) => void basculerEcart(cleabs, ecarter)} />
            {/* AFF-1 — deux blocs REPLIÉS (identiques dans les deux onglets), sous le schéma : polygones « projet » affectés, puis bâtiments existants. */}
            <BlocProjetRepliable emprises={emprises} polygones={polygonesReperes} batiments={batiments} />
            <BlocExistantsRepliable polygones={polygonesPermis} recouverts={recouverts} statuts={statutParCleabs} onStatuer={(cleabs, statut) => void statuerPolygone(cleabs, statut)} />

            {/* PROJ-3r — TROISIÈME issue, DANS l'encart « en projet » : affecter chaque groupe à un bâtiment déclaré + adopter (scinder/fusionner). */}
            <AdoptionGroupes groupes={groupesAdoption} batiments={batiments} reperes={reperesParCleabs} affectation={affectation} scindes={scindes} occupe={occupe}
              onAffecter={(cleabs, corpsId) => setAffectation((prev) => { const n = { ...prev }; for (const c of cleabs) n[c] = corpsId; return n; })}
              onScinder={(i) => setScindes((prev) => (prev.includes(i) ? prev : [...prev, i]))}
              onRegrouper={(i) => setScindes((prev) => prev.filter((x) => x !== i))}
              onReinitialiser={() => reinitialiserAdoption(groupesAdoption, corpsEffectif)}
              onAdopter={() => void ouvrirConfirmationAdoption()} />
            <ConfirmationAdoption apercu={confirmationAdoption}
              remplaceExistant={emprises.some((e) => e.corpsId !== null && new Set(Object.values(affectation)).has(e.corpsId))}
              occupe={occupe} onConfirmer={() => void confirmerAdoption()} onAnnuler={() => setConfirmationAdoption(null)} />

            {/* PROJ-3g/3j/3m — VERROU (COUPES/FAÇADES seulement) ; RAPPEL « étage » ; MENTION si le classement de la page est incertain. */}
            {verrou && <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{verrou}</div>}
            {tracable && ambiguCourant && <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Type de vue incertain : proposé traçable — vérifiez qu’il s’agit bien d’une vue en plan (pas d’une coupe/façade) avant de tracer.</div>}
            {tracable && noteFamille(familleCourante) && <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{noteFamille(familleCourante)}</div>}

            {/* SUITE LOT 7b47817 — AU REPOS (aucun processus en cours), le bloc d'outils/contrôle reste ICI, à sa position actuelle
                (inchangée). Pendant le processus, il migre sous le schéma avec le guide (rendu plus haut) : sites MUTUELLEMENT EXCLUSIFs. */}
            {!procEnCours && blocOutilsCalage}
            {/* PROJ — repère « qualité du calage » : écart d'échelle (réutilisé du pavé de calage) + débordement hors parcelle (serveur). Jamais bloquant. */}
            <RepereQualiteCalage ecartEchelleRelatif={vc?.ecartEchelleRelatif ?? null} ratioImplicite={vc?.ratioImplicite ?? null} ratioDeclare={vc?.ratioDeclare ?? null}
              debordement={sommets.length >= 3 || sommets.length === 0 ? debordement : null} contourFerme={sommets.length >= 3} parcelleRattachee={parcelle.length > 0} origineIgn={origineIgnCourant && sommets.length < 3} />
            {/* POSITION AU REPOS — quand AUCUNE emprise n'existe encore, le bloc emprise (chaîne « Enregistrer ce bâtiment » + ligne + gestes)
                reste à sa place actuelle, plus bas dans la colonne. Dès qu'une emprise existe, il est rendu plus haut (juste sous le schéma). */}
            {!aEmprises && blocEmprises}

            {/* Ignorer / rétablir la projection de CE bâtiment (motif obligatoire ; réversible). */}
            {ignoreDuBat ? (
              <div className="svv-card" style={{ fontSize: 12, borderColor: 'var(--color-svv-line)' }}>
                <div>Projection <strong>ignorée</strong> — motif : {ignoreDuBat.motif}</div>
                <button type="button" style={{ ...btn, marginTop: '.3rem' }} disabled={occupe} onClick={() => void posterProjection('retablir', corpsEffectif!)}>Rétablir (tracer finalement)</button>
              </div>
            ) : empriseDuBat.length === 0 && (
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={motifIgnore} onChange={(e) => setMotifIgnore(e.target.value)} placeholder="motif court (obligatoire)…" style={{ flex: '1 1 140px', minWidth: 0, padding: '.2rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12 }} />
                <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} disabled={occupe || motifIgnore.trim() === ''} onClick={() => void posterProjection('ignorer', corpsEffectif!, { motif: motifIgnore })}>Ignorer la projection</button>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* PROJ-3i ② — PLEIN ÉCRAN : schéma agrandi + TOUS les filtres + la sélection + la légende, cliquables. Fermeture : clic hors zone,
          bouton ×, ou touche Échap. Pas de transition → rien à neutraliser pour prefers-reduced-motion. */}
      {pleinEcran && (
        <div role="dialog" aria-modal="true" aria-label="Schéma de la parcelle agrandi" onClick={() => setPleinEcran(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} className="svv-card"
            style={{ maxWidth: '95vw', maxHeight: '95vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Schéma de la parcelle et du bâti</strong>
              <button type="button" style={btn} onClick={() => setPleinEcran(false)} aria-label="Fermer l’agrandissement">✕ Fermer</button>
            </div>
            <RotationSchema angle={angle} onAngle={setAngle} />
            {/* PROJ-3t (plein écran) — COMMANDES D'AJUSTEMENT compactes, en pleine largeur près du curseur Rotation, SEULEMENT si au moins une
                emprise existe. Bandeau horizontal, bas → l'espace vertical reste au schéma. MÊME état `ajustement` que la page normale (partagé). */}
            {aEmprises && (ajustement
              ? <BandeauAjustementCompact resume={resumeAjustement(ajustement.delta)} bloc={ajustement.bloc} occupe={occupe} aDeltaEnregistre={ajustement.enregistre}
                  onTranslate={onTranslate} onRotate={onRotate} onScale={onScale}
                  onEnregistrer={() => void enregistrerAjustementGeste()} onAbandonner={abandonnerAjustement} onOrigine={() => void revenirOrigineAjustement()} />
              : <DemarrageAjustementCompact emprisesDuBatiment={empriseDuBat} nbTotal={emprises.length} occupe={occupe}
                  onDemarrer={(id) => demarrerAjustement(id)} onBloc={demarrerAjustementBloc} />)}
            {bandeauSel}
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                <SchemaParcelleTrace boite={boiteGrande} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} hauteurMax="82vh" calageLambert={[]} statuts={statutParCleabs}
                  retoucheAnneau={retouche?.anneau ?? null} sommetSelectionne={sommetSel}
                  apercuAjustement={apercuAjustement} onPointeurAjustement={ajustement ? pointeurAjustementGrand : undefined} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 240 }}>
                <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={comptesVisibilite.futur} nbExistant={comptesVisibilite.existant} />
                <SelectionPolygonesProjet polygones={polygonesReperes} ecartes={ecartes} onToggle={(cleabs, ecarter) => void basculerEcart(cleabs, ecarter)} />
            {/* AFF-1 — deux blocs REPLIÉS (identiques dans les deux onglets), sous le schéma : polygones « projet » affectés, puis bâtiments existants. */}
            <BlocProjetRepliable emprises={emprises} polygones={polygonesReperes} batiments={batiments} />
            <BlocExistantsRepliable polygones={polygonesPermis} recouverts={recouverts} statuts={statutParCleabs} onStatuer={(cleabs, statut) => void statuerPolygone(cleabs, statut)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
