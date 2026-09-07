'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import {
  calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, cadreDeAnneaux,
  inverseDepuisBoite, projeterDansBoite, ecranVersCanvas, estClic, type Boite, type PaireCalage, type PointPlan, type PointLambert, type VerdictCalage, type VerdictVraisemblance, type Debordement,
} from '../../../../lib/permis/calageEmprise';
import { deplacerSommet, insererSommet, supprimerSommet, sommetProche, bordProche, type ResultatRetouche } from '../../../../lib/permis/retoucheEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree, PolygoneBdTopo, ObjetContexte } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments, libelleBatiment, statutEmpriseBatiment, etapeChaineEmprise, etatEnteteProjection, MOT_STATUT_EMPRISE, type BatimentProjection, type VerdictProjection } from '../../../../lib/permis/projectionBatiments'; // NOM-1 : libelleBatiment ; source unique de statut d'emprise ; ①③ chaîne + en-tête
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, affichageTrace, ListePiecesAnalyse, etatAnalyseIA, BandePlans, construireBandePlans, bornerIndex, cibleBestOf, indexSuivant, indexPrecedent, guideCalageSousSchema, NavPieceLibre, bornerPage, messageVerrou, noteFamille, OptionsVisibiliteSchema, SelectionPolygonesProjet, BlocProjetRepliable, BlocExistantsRepliable, attribuerReperes, RotationSchema, ZoomPdf, guidageTrace, GuidageTraceBox, RepereQualiteCalage, AdoptionGroupes, ConfirmationAdoption, LegendeProjectionEmprises, legendeProjection, etiquettesProjection, FILTRES_SCHEMA_DEFAUT, type FiltresSchema, type GroupeAdoptionVue, type BatimentAdoptionVue, type Plan, type EtatAnalyseIA } from './TraceEmpriseRendu';
import { familleDeNom, estTracable, type FamillePlan } from '../../../../lib/permis/planMasse';
import { LiseusePieces, type DonneesLiseuse } from './LiseusePieces'; // LOT 90 — liseuse LECTURE SEULE autonome ; P3 — partage de la donnée /emprise (anti-doublon)
import { BandeauSelection } from './TraceEmpriseRendu'; // PL-C4 — bandeau « sélection validée » sous le curseur Rotation
import { bandeAvecOverrides, statutPageAnalyse, resumePagesAnalysees } from './TraceEmpriseRendu'; // INCRÉMENT-2 — best-of overrides + statut/résumé de page (barre partagée)
import { BarreVisionneusePieces } from './BarreVisionneusePieces'; // INCRÉMENT-2 — barre de commandes PARTAGÉE avec la planche
import type { RunReperageAffiche } from '../../../../lib/permis/reperePlanchesRepo';
import type { LecturePageAffiche } from '../../../../lib/permis/lectureValeursPageRepo';
import { jourParisISO } from '../../../../lib/permis/horodatageParis';
import type { SelectionInfo } from '../../../../lib/permis/plancheParcellesRepo';
import { estFuturBati } from '../../../../lib/permis/etatBati';
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
type Apercu = { vp: { convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] }; ratio: number };

const BOITE_L = 300, BOITE_H = 230, BOITE_MARGE = 12;
const SEUIL_SOMMET_BOITE = 12; // PROJ-3s — rayon de capture d'un sommet au clic (unités de la boîte du schéma) : cible TACTILE, pas un seuil métier.
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
  // INCRÉMENT-2 — best-of VISIBLE = bande auto − retraits + ajouts (mêmes overrides que la planche). Touche la NAVIGATION (quel plan est
  //   proposé), JAMAIS le viewport ni la conversion de coordonnées.
  const bande = useMemo(() => bandeAvecOverrides(construireBandePlans(pieces), pieces, exclus, inclus), [pieces, exclus, inclus]);
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
  const tracable = entreeCourante ? entreeCourante.tracable : estTracable(familleCourante);
  const verrou = tracable ? null : messageVerrou(familleCourante);
  const ambiguCourant = entreeCourante?.ambigu ?? false;
  // PROJ-3m ② — GUIDAGE du geste (pur) : étape courante, quoi cliquer, combien de points restent, où (plan/schéma). Explicitation seule.
  const guidage = guidageTrace(mode, paires.length, planEnAttente !== null, sommets.length, tracable);
  // FIX « ascenseur » — la POSITION du guide suit l'EXISTENCE d'un travail, jamais le dernier côté cliqué (`guidage.sur`). Pattern React
  //   « ajuster l'état pendant le rendu » (PAS d'effet, PAS de setState en effet, PAS de modif de cliquerPdf gelé) : on ARME `creationEnCours`
  //   dès qu'un point est en cours de pose (`enPose`). Le `(creationEnCours || enPose)` donne déjà la bonne position DANS CE rendu. Le flag
  //   persiste l'état « en cours » quand la pose momentanée retombe (ex. paire complétée : planEnAttente repasse à null mais paires>0). Le
  //   désarmement se fait À LA VALIDATION (enregistrer, où les paires sont CONSERVÉES → indistinguables sans flag). Le ET avec le travail
  //   réel ramène le guide à sa place initiale à TOUTE remise à zéro (annuler / Reprendre / Recommencer / changement de plan).
  const enPose = planEnAttente !== null || sommets.length > 0;
  if (!creationEnCours && enPose) setCreationEnCours(true); // guardé (converge) : ne re-déclenche pas une fois armé
  const procEnCours = guideCalageSousSchema(creationEnCours, planEnAttente !== null, paires.length, sommets.length); // décision PURE (testée)

  // Chargement (pièces PDF + emprises + ignorées + contexte) au changement de dossier.
  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement'); setMessage(null);
      try {
        const res = await fetch(`/api/admin/permis/emprise?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); setMessage('Bâtiments indisponibles (le serveur n’a pas répondu).'); return; }
        const j = await res.json() as { pieces: Piece[]; piecesNonSupportees?: { id: number; nomFichier: string; motif: string }[]; emprises: EmpriseReconstruite[]; ignores: ProjectionIgnoree[]; batiments: BatimentProjection[]; contexte: Contexte; polygones?: PolygoneBdTopo[]; polygonesEcartes?: string[]; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[]; selection?: SelectionInfo; indisponibles?: string[]; reperageRuns?: Record<number, RunReperageAffiche>; lecturesPages?: Record<number, LecturePageAffiche[]>; exclusionsBestOf?: { pieceId: number; page: number }[]; inclusionsBestOf?: { pieceId: number; page: number }[]; validationParCorps?: Record<number, boolean>; altitudeValideeParCorps?: Record<number, boolean>; origineExtractionSansIa?: 'auto' | 'manuelle' | null };
        // Résilience serveur : « indisponible » ≠ « vide ». Si la lecture des BÂTIMENTS a échoué, on n'affiche JAMAIS « 0 bâtiment »
        //   (panne déguisée en donnée) → état d'échec explicite invitant à recharger.
        if (j.indisponibles?.includes('batiments')) { setEtat('erreur'); setMessage('Bâtiments indisponibles : rechargez.'); return; }
        setPieces(j.pieces); setPiecesNonSupportees(j.piecesNonSupportees ?? []); setEmprises(j.emprises); setIgnores(j.ignores); setBatiments(j.batiments ?? []); setContexte(j.contexte); setPolygones(j.polygones ?? []); setEcartes(j.polygonesEcartes ?? []); setStatutsLignes(j.statutsPolygones ?? []); setRecouverts(j.polygonesRecouverts ?? []); setSelection(j.selection ?? { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null }); setConfirmeSel(false); setAngle(0); setDebordement(null); setValidationParCorps(j.validationParCorps ?? {}); setAltitudeValideeParCorps(j.altitudeValideeParCorps ?? {});
        // INCRÉMENT-2 — audits d'analyse IA + overrides best-of (mêmes champs que la planche, déjà renvoyés par le GET).
        setRuns(j.reperageRuns ?? {}); setLectures(j.lecturesPages ?? {}); setOrigineSansIa(j.origineExtractionSansIa ?? null);
        setExclus(new Set((j.exclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`))); setInclus(new Set((j.inclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`)));
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
  // PROJ-3r-fix — cleabs → repère (mêmes noms que la liste des polygones et le schéma) pour nommer les lignes de l'encart d'adoption.
  const reperesParCleabs = useMemo(() => Object.fromEntries(polygonesReperes.filter((p) => p.cleabs).map((p) => [p.cleabs as string, p.repere])), [polygonesReperes]);
  const boiteGrande: Boite | null = useMemo(() => { const c = cadreDeAnneaux(parcelle); return c ? { largeur: 680, hauteur: 520, marge: 18, cadre: c } : null; }, [parcelle]);
  const nbFutur = useMemo(() => polygones.filter((p) => estFuturBati(p.etat)).length, [polygones]);
  // PROJ-3i — fermeture du plein écran à la touche Échap (le clic hors zone est géré par le fond).
  useEffect(() => {
    if (!pleinEcran) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPleinEcran(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pleinEcran]);
  // PROJ-AGR — Échap réduit aussi l'agrandissement de l'image (jamais un piège plein écran sans sortie clavier).
  useEffect(() => {
    if (!imageAgrandie) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImageAgrandie(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageAgrandie]);

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
      setApercu({ vp: viewport as unknown as Apercu['vp'], ratio: canvas.width / (canvas.getBoundingClientRect().width || largeurCss) });
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
  useEffect(() => { if (etat === 'ok') void afficherPageRef.current(); }, [pieceId, page, etat, imageAgrandie]);

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

  // PROJ-3l — pose un point : le clic (écran) est ramené dans le canvas NON transformé (annule zoom + pan via ecranVersCanvas), puis
  //   converti en point PDF. Le repère est le CONTENEUR non transformé. Résultat identique quel que soit le zoom/déplacement (calage exact).
  const cliquerPdf = useCallback((clientX: number, clientY: number) => {
    if (!apercu || !pdfContainerRef.current) return;
    const r = pdfContainerRef.current.getBoundingClientRect();
    const u = ecranVersCanvas(clientX, clientY, r.left, r.top, pan, zoom);
    const [px, py] = apercu.vp.convertToPdfPoint(u.x * apercu.ratio, u.y * apercu.ratio);
    if (mode === 'trace') setSommets((s) => [...s, { x: px, y: py }]);
    else setPlanEnAttente({ x: px, y: py });
  }, [mode, apercu, pan, zoom]);

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

  // Overlay : positions CSS des points plan / sommets (lit `apercu` en state).
  const versCss = (p: PointPlan): { x: number; y: number } | null => {
    if (!apercu) return null;
    const [vx, vy] = apercu.vp.convertToViewportPoint(p.x, p.y);
    return { x: vx / apercu.ratio, y: vy / apercu.ratio };
  };
  const cssSommets = sommets.map(versCss).filter((q): q is { x: number; y: number } => q !== null);
  const cssPaires = paires.map((pr) => versCss(pr.plan)).filter((q): q is { x: number; y: number } => q !== null);
  const cssAttente = planEnAttente ? versCss(planEnAttente) : null;

  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
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
  // DEMANDE 1 — LIGNE D'OUTILS AU-DESSUS DES DEUX IMAGES (en tête de grille, span 2 colonnes) : à GAUCHE (au-dessus de l'image) les
  //   contrôles de zoom + « mode grandes images » ; à l'EXTRÊME DROITE (au-dessus du schéma) « Agrandir le schéma ». Remontés de leur
  //   position sous les images. « Agrandir l'image » RENOMMÉ « mode grandes images ». Aucun handler de zoom/agrandissement modifié.
  const ligneOutils = (
    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
        <ZoomPdf zoom={zoom} onDezoom={dezoomer} onZoom={zoomer} onAjuster={ajusterPdf} />
        <button type="button" style={btn} onClick={() => setImageAgrandie((v) => !v)}
          aria-label={imageAgrandie ? 'Quitter le mode grandes images' : 'Activer le mode grandes images (tracer en grand)'}>{imageAgrandie ? '✕ quitter les grandes images' : '⤢ mode grandes images'}</button>
      </div>
      <button type="button" style={btn} onClick={() => setPleinEcran(true)}>⤢ Agrandir le schéma</button>
    </div>
  );

  // SUITE LOT 7b47817 — le SECOND bloc « barre d'outils de calage/tracé + encadré de contrôle + aire » suit le MÊME état (procEnCours) que
  //   le guide : au repos à sa position actuelle (colonne droite, plus bas), et SOUS LE SCHÉMA — GROUPÉ avec le guide — pendant tout le
  //   processus de création. Défini UNE seule fois, rendu à deux sites MUTUELLEMENT EXCLUSIFS (jamais deux, jamais aucun). Ainsi le
  //   RÉSIDU de calage et l'écart ÉCHELLE implicite/déclarée (fiabilité du calage) restent LISIBLES pendant qu'on trace. Aucun calcul ni
  //   coordonnée touché : simple relocalisation d'affichage (vc/aire/vv sont calculés en amont, inchangés).
  const blocOutilsCalage = (
    <>
      {/* Outils de calage / tracé. */}
      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={!tracable} style={{ ...btn, opacity: tracable ? 1 : 0.4, fontWeight: mode === 'calage' ? 700 : 400 }} onClick={() => setMode('calage')}>Calage ({paires.length}/2)</button>
        <button type="button" disabled={!tracable} style={{ ...btn, opacity: tracable ? 1 : 0.4, fontWeight: mode === 'trace' ? 700 : 400 }} onClick={() => setMode('trace')}>Tracé ({sommets.length})</button>
        <button type="button" style={btn} onClick={() => mode === 'trace' ? setSommets((s) => s.slice(0, -1)) : (planEnAttente ? setPlanEnAttente(null) : setPaires((p) => p.slice(0, -1)))}>Annuler dernier</button>
        <button type="button" style={btn} onClick={() => { setSommets([]); setPaires([]); setPlanEnAttente(null); setDebordement(null); }}>Reprendre</button>
        <label style={styleAide}>échelle 1: <input inputMode="numeric" value={ratioDeclareSaisi} onChange={(e) => setRatioDeclareSaisi(e.target.value)} placeholder="200" style={{ width: 60 }} /></label>
      </div>
      <BandeauCalage calage={vc} nbPaires={paires.length} />
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
    //   reste la SOURCE UNIQUE de décision (on ne duplique pas sa logique) ; ici on ne masque QUE les contrôles de TRACÉ (attacher une
    //   emprise à un bâtiment, valider la projection), pas le dessin. RENDU PUR : aucune écriture, aucun calcul de verdict ajouté.
    return (
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises — reconstitution par bâtiment <span style={styleAide}>(jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span></div>
        <BandeauProjection verdict={verdict} nbValides={nbValides} nbAValider={nbAValider} />
        {/* Message RECADRÉ (LOT 90) : on peut CONSULTER les plans (liseuse) et le schéma ; seul le TRACÉ/enregistrement attend un bâtiment. */}
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .55rem' }}>
          Aucun bâtiment déclaré au permis. Vous pouvez <strong>consulter</strong> les plans (liseuse ci-dessous) et le schéma. Pour <strong>tracer</strong> une emprise et l’enregistrer, déclarez d’abord un bâtiment via « <strong>+ ajouter un bâtiment</strong> » (bloc « Le permis / Les bâtiments » ci-dessus) : le calage et l’enregistrement apparaîtront alors.
        </div>
        {/* LOT 90 — LISEUSE lecture seule (best-of + navigation + zoom, composant autonome). Le CALAGE reste FERMÉ à 0 bâtiment : il
            n'alimente que l'enregistrement, qui exige un bâtiment → l'ouvrir mènerait à un cul-de-sac. La liseuse gère elle-même le
            best-of vide (« Aucun plan… ») → jamais un cadre vide muet. `avecLiseuse=false` là où une liseuse standalone existe déjà. */}
        {avecLiseuse && <LiseusePieces dossierId={dossierId} onValeurEcrite={onValeurLue} donneesPrechargees={donneesLiseuse} />}
        {boite ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            <RotationSchema angle={angle} onAngle={setAngle} />
            {bandeauSel}
            {/* Schéma LECTURE SEULE : aucun onCliquer (pas de tracé), pas de points de calage. Étiquettes/légende des LOTs 81/82/83. */}
            <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} calageLambert={[]} statuts={statutParCleabs} etiquettes={etiquettesProjection(polygonesReperes, emprises, batiments)} />
            {/* Options d'AFFICHAGE (bâti existant / futur / repères / projection) — pilotage visuel, pas un contrôle de tracé. Porte aussi la légende de catégories. */}
            <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={nbFutur} nbExistant={polygones.length - nbFutur} />
            <LegendeProjectionEmprises legende={legendeProjection(polygonesReperes, emprises, batiments)} />
          </div>
        ) : (
          // HONNÊTETÉ (piège LOT 71) : rien à dessiner → dire CE QUI MANQUE, jamais un cadre vide muet.
          <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Rien à dessiner pour l’instant : la parcelle du permis n’est pas disponible (empreinte non figée) — sans elle, ni le contour ni le bâti BD TOPO ne peuvent être cadrés.</div>
        )}
      </div>
    );
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises — reconstitution par bâtiment <span style={styleAide}>(jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span></div>
      <BandeauProjection verdict={verdict} nbValides={nbValides} nbAValider={nbAValider} />

      {/* Sélecteur de bâtiment : statut par bâtiment (mot + couleur d'appui). */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {batiments.map((b) => {
          // SOURCE UNIQUE : même statut (validee/a_valider/ignoree/a_tracer) que la capsule du cartouche → jamais « ✓ tracée » là où la capsule dit « à valider ».
          const st = statutEmpriseBatiment(emprises.some((e) => e.corpsId === b.corpsId), ignores.some((i) => i.corpsId === b.corpsId), validationParCorps[b.corpsId] ?? false);
          const actif = b.corpsId === corpsEffectif;
          return (
            <button key={b.corpsId} type="button" onClick={() => setCorpsSel(b.corpsId)}
              style={{ ...btn, fontWeight: actif ? 700 : 400, borderColor: actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }}>
              {libelleBatiment(b)} — {MOT_STATUT_EMPRISE[st]}
            </button>
          );
        })}
      </div>

      {batSel && (
        // PROJ-AGR — quand `imageAgrandie`, TOUTE la grille (plan À GAUCHE + schéma À DROITE + outils) passe en PLEIN ÉCRAN (CSS
        //   position:fixed). Le plan s'affiche large (tracé précis), le schéma reste présent (2e point de calage). Les MÊMES éléments et
        //   handlers (pdfContainerRef/cliquerPdf, SchemaParcelleTrace/cliquerSchema) sont réutilisés → aucune duplication du tracé ; le
        //   canvas se re-rend à la nouvelle largeur (effet ci-dessus) → coordonnées exactes pour cette vue.
        <div role={imageAgrandie ? 'dialog' : undefined} aria-modal={imageAgrandie || undefined} aria-label={imageAgrandie ? 'Visionneuse agrandie — tracer en grand' : undefined}
          style={imageAgrandie
            ? { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem', alignContent: 'start' }
            : { display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem' }}>
          {/* DEMANDE 1 — LIGNE D'OUTILS au-dessus des DEUX images (span 2 colonnes) : zoom + « mode grandes images » à gauche, « Agrandir le schéma » à l'extrême droite. */}
          {ligneOutils}
          {/* Colonne PDF — DEMANDE 2 : a) l'IMAGE en tête (alignée avec le schéma à droite) ; b) IMMÉDIATEMENT sous l'image, tout le bloc de
              navigation + « voir toutes les pièces » + lien (barre, section haute) ; c) « agrandir l'image » + zoom + fonctions (barre,
              section basse) ; d) EN DERNIER : le bloc « Étape 1 — caler la vue » (encadré rouge). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', minWidth: 0 }}>
            {/* a) IMAGE — conteneur NON transformé (repère du clic) ; le PDF + l'overlay sont dans un wrapper zoomé/déplacé. Glisser = déplacer (si zoomé), cliquer = poser un point.
                🔴 RÈGLE ABSOLUE : géométrie du conteneur, canvas et repère de coordonnées INCHANGÉS — seul l'ORDRE des blocs autour a bougé. */}
            <div ref={pdfContainerRef} style={{ position: 'relative', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', overflow: 'hidden', touchAction: 'none', cursor: zoom > 1 ? 'grab' : (tracable ? 'crosshair' : 'default') }}
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
            {/* b) + c) BARRE PARTAGÉE (même composant que la planche), SOUS l'image : nav complète + voir-toutes + lien (haut), puis
                statut/best-of/analyses (bas). Zoom + « mode grandes images » sont AU-DESSUS (ligneOutils). Zéro outil de tracé. */}
            <BarreVisionneusePieces pieceId={pieceId} nomCourant={nomCourant} page={page} nbPagesPiece={nbPagesPiece} echelle={planAffiche?.echelle ?? null}
              nav={nav} slotNav={slotNav} slotPieces={slotPieces}
              onOuvrirDocument={() => void ouvrirDocumentComplet()} onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} onRetourBestOf={retourBestOf}
              pageDansBestOf={pageDansBestOf} onRetirerBestOf={() => { if (planAffiche) void retirerDuBestOf(planAffiche!); }} onAjouterBestOf={() => { if (pieceId !== null) void ajouterAuBestOf(pieceId, page); }}
              statutPage={statutPage} resumePages={resumePages} pleinPagesAnalysees={pleinPagesAnalysees} onTogglePleinPages={() => setPleinPagesAnalysees((v) => !v)}
              runCourant={runCourant} lectureCourante={lectureCourante} reperEnCours={reperEnCours} lectureEnCours={lectureEnCours}
              onAnalyseFichier={() => void reperer()} onAnalysePage={() => void analyserPage()} reperMsg={reperMsg} lectureRes={lectureRes} onAnnulerValeur={() => void annulerValeurPage()} />
            {/* d) POSITION INITIALE (AU REPOS) du bloc « Étape 1 — caler la vue » : en bas de la colonne gauche, sous la barre. FIX
                « ascenseur » : affiché ICI UNIQUEMENT quand AUCUN processus n'est en cours (`!procEnCours`) — dès qu'on amorce un calage,
                il migre sous le schéma (à droite) et n'en bouge plus jusqu'à la validation. Un seul exemplaire à la fois (conditions
                mutuellement exclusives). Fondu sobre à l'apparition (désactivé sous prefers-reduced-motion). */}
            {tracable && !procEnCours && <div className="svv-guide-fondu"><GuidageTraceBox g={guidage}
              onAnnulerDernier={mode === 'calage' ? () => { if (planEnAttente) setPlanEnAttente(null); else setPaires((p) => p.slice(0, -1)); } : undefined}
              onRecommencer={mode === 'calage' ? () => { setPaires([]); setPlanEnAttente(null); } : undefined}
              peutAnnuler={paires.length > 0 || planEnAttente !== null} /></div>}
          </div>

          {/* Colonne de droite — DEMANDE 1 : le SCHÉMA en PREMIER, aligné à la MÊME HAUTEUR que l'image à gauche (les deux cadres démarrent
              sur la même ligne). La rotation, le bandeau de sélection et le guidage descendent SOUS le schéma. 🔴 RÈGLE ABSOLUE : le
              repère de coordonnées du calage (SchemaParcelleTrace, SVG « meet ») est INCHANGÉ — seul l'ordre des blocs voisins a bougé. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} calageLambert={paires.map((p) => p.lambert)} statuts={statutParCleabs}
              onCliquer={retouche ? cliquerRetouche : (mode === 'calage' && planEnAttente ? cliquerSchema : undefined)} retoucheAnneau={retouche?.anneau ?? null} sommetSelectionne={sommetSel} />
            {/* PROJ-3j ② — rotation d'affichage + bandeau de sélection, sous le schéma. */}
            <RotationSchema angle={angle} onAngle={setAngle} />
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
            {/* DEMANDE 1 — « Agrandir le schéma » a été REMONTÉ dans la ligne d'outils au-dessus des images (extrême droite). */}

            {/* Options de visibilité + sélection des polygones « en projet ». */}
            <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={nbFutur} nbExistant={polygones.length - nbFutur} />
            <SelectionPolygonesProjet polygones={polygonesReperes} ecartes={ecartes} onToggle={(cleabs, ecarter) => void basculerEcart(cleabs, ecarter)} />
            {/* AFF-1 — deux blocs REPLIÉS (identiques dans les deux onglets), sous le schéma : polygones « projet » affectés, puis bâtiments existants. */}
            <BlocProjetRepliable emprises={emprises} polygones={polygonesReperes} batiments={batiments} />
            <BlocExistantsRepliable polygones={polygonesReperes} recouverts={recouverts} statuts={statutParCleabs} onStatuer={(cleabs, statut) => void statuerPolygone(cleabs, statut)} />

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
            {/* ① COMPLÉMENT — CHAÎNE DE TROIS BOUTONS PAR BÂTIMENT : UN SEUL visible selon l'état (source unique `etapeChaineEmprise`),
                ROUGE plein (facture « Enregistrer ce bâtiment » = svv-btn-primary), nommant le bâtiment par son repère réel. Au clic, l'état
                avance (l'indicateur vert apparaît, le bouton suivant s'affiche). Toute erreur est DITE (jamais un bouton muet). */}
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
            {/* BUG PROV — le RÉSULTAT (succès OU erreur serveur) s'affiche ICI, au point d'action : un bouton MUET était le pire cas. */}
            {message && <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-svv-red)' }}>{message}</div>}

            {/* Emprises de CE bâtiment : retoucher (mono-polygone) ou effacer. */}
            <ListeEmprises emprises={empriseDuBat} empriseEnRetouche={retouche?.id ?? null} nomCorps={libelleBatiment(batSel)}
              onSupprimer={(id) => void posterProjection('supprimer', corpsEffectif!, { id })}
              onRetoucher={(id) => demarrerRetouche(id)} />

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
            {bandeauSel}
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                <SchemaParcelleTrace boite={boiteGrande} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={filtres} voisinage={filtres.contexte === true ? voisinage : []} ecartes={ecartes} angle={angle} hauteurMax="82vh" calageLambert={[]} statuts={statutParCleabs}
                  retoucheAnneau={retouche?.anneau ?? null} sommetSelectionne={sommetSel} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 240 }}>
                <OptionsVisibiliteSchema filtres={filtres} onFiltres={setFiltres} nbFutur={nbFutur} nbExistant={polygones.length - nbFutur} />
                <SelectionPolygonesProjet polygones={polygonesReperes} ecartes={ecartes} onToggle={(cleabs, ecarter) => void basculerEcart(cleabs, ecarter)} />
            {/* AFF-1 — deux blocs REPLIÉS (identiques dans les deux onglets), sous le schéma : polygones « projet » affectés, puis bâtiments existants. */}
            <BlocProjetRepliable emprises={emprises} polygones={polygonesReperes} batiments={batiments} />
            <BlocExistantsRepliable polygones={polygonesReperes} recouverts={recouverts} statuts={statutParCleabs} onStatuer={(cleabs, statut) => void statuerPolygone(cleabs, statut)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
