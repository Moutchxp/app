'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { estCarteModifiee, modeFooter } from './curationEdition';
import { contenuBulleBatiment, doitCreerAuDoubleClic } from './bulleBatiment';
import { EnTetePage } from '../_composants/EnTetePage';
import { libelleAction, cleabsCourt, formaterHorodatage, horodatageTitle, libelleSession, nomAffiche, type LigneJournal } from './journalRendu';

/** Taille de page du volet global de l'historique (HJ-44). */
const JOURNAL_LIMIT = 50;

/**
 * Carte de curation patrimoine (Leaflet, LECTURE + écriture via endpoints CRUD).
 *
 * ISOLATION (invariant SVAV) : ce composant NE touche NI le moteur (`app/lib/svv/**`), NI la base
 * directement. Il consomme UNIQUEMENT les endpoints `/api/admin/curation/*` (déjà gardés par
 * `proxy.ts`). La carte affiche du 4326 fourni par les endpoints ; toute écriture renvoie `{lat, lon}`
 * (WGS84) et le serveur reprojette en 2154. AUCUN calcul géométrique de score côté client.
 *
 * Chargé UNIQUEMENT côté client via `next/dynamic({ ssr: false })` depuis `page.tsx` (pattern
 * `origine/page.tsx`) → l'import statique de `leaflet` ne s'exécute jamais sur le serveur.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (miroir des réponses JSON — cf. `partage.ts` / `entites/route.ts`).
// ─────────────────────────────────────────────────────────────────────────────

type EtatEntite = 'rouge' | 'orange' | 'vert';

interface PointGeoJSON {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat] en 4326
}

interface Liaison {
  cleabs: string;
  source: string;
  actif: boolean;
  detache: boolean;
  verifieManuellement: boolean;
  created: string; // ordre de rattachement (1er polygone = plus ancien)
}

interface Entite {
  id: number;
  famille: string;
  refCode: string;
  nom: string | null;
  statut: string | null;
  origine: string | null; // 'manuel' = tag créé à la main (étoile jaune, éditable/supprimable)
  point: PointGeoJSON | null;
  corrige: boolean;
  aHistorique: boolean; // ≥1 ligne de journal (bouton « Historique » de fiche) — Lot 2 UI
  etat: EtatEntite;
  liaisons: Liaison[];
}

interface Compteurs {
  rouge: number;
  orange: number;
  vert: number;
}

interface Emprise {
  cleabs: string | null;
  geom: GeoJSON.Geometry | null;
  // Année de construction (bdnb_annee_batiment) — aide UI (bulle), `null` si non renseignée. Jamais
  // consommée par un calcul de score/verdict (la carte n'en fait AUCUN, cf. en-tête du composant).
  annee?: number | null;
  // Nombre d'étages (bdtopo_batiment.nombre_d_etages) — aide UI (bulle). `null` si non renseigné ;
  // `0` = vraie valeur (« 0 étage »), jamais réinterprétée. La carte ne fait aucun calcul avec.
  etages?: number | null;
}

/** Tag manuel = 1 étoile persistante (centroïde 4326 de son 1er polygone). */
interface TagManuel {
  entiteId: number;
  nom: string | null;
  centre: { type: 'Point'; coordinates: [number, number] } | null;
}

interface Bbox {
  minlon: number;
  minlat: number;
  maxlon: number;
  maxlat: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes d'affichage (aucune valeur métier ; couleurs d'état EX-3).
// ─────────────────────────────────────────────────────────────────────────────

/** Ordre + libellés des 3 familles patrimoine (valeurs base : cf. migration 009). */
const FAMILLES: { cle: string; libelle: string }[] = [
  { cle: 'mondial', libelle: 'Mondial' },
  { cle: 'mh', libelle: 'Monuments historiques' },
  { cle: 'inventaire', libelle: 'Inventaire' },
];

/** Couleurs d'état (rouge / orange / vert) — tokens SVAV quand disponibles. */
const COULEUR_ETAT: Record<EtatEntite, string> = {
  rouge: '#a30402', // --color-svv-red
  orange: '#e08a00',
  vert: '#2e9e5b', // --color-svv-green
};

const LIBELLE_ETAT: Record<EtatEntite, string> = {
  rouge: 'À placer',
  orange: 'Auto non vérifié',
  vert: 'Manuel / vérifié',
};

/**
 * 4 seaux de statut de point GPS pour le filtre secondaire (multi-sélection). MUTUELLEMENT EXCLUSIFS : chaque
 * entité tombe dans EXACTEMENT un seau. « Sans point GPS » PRIME sur « À placer » (dans l'état rouge, un point
 * absent → `sans_point`, sinon `a_placer`). Dérivé de `etat` (etatEntite : liaisons actif && !detache) + de la
 * nullité du point effectif (COALESCE(geom_point_corrige, geom_point)) — AUCUN recalcul de la règle, aucun SQL.
 * Cohérent avec le visuel « cerclé » (dot--rouge = rouge sans point) déjà utilisé dans la liste.
 */
type StatutPoint = 'a_placer' | 'auto' | 'manuel' | 'sans_point';

const STATUTS_POINT: { cle: StatutPoint; libelle: string }[] = [
  { cle: 'a_placer', libelle: 'À placer' },
  { cle: 'auto', libelle: 'Auto non vérifié' },
  { cle: 'manuel', libelle: 'Manuel / vérifié' },
  { cle: 'sans_point', libelle: 'Sans point GPS' },
];

/** Seau de statut d'une entité (exclusif). Réutilise `e.etat` et la nullité de `e.point` ; ne recalcule rien. */
function seauStatut(e: Entite): StatutPoint {
  if (e.etat === 'rouge') return e.point === null ? 'sans_point' : 'a_placer';
  if (e.etat === 'orange') return 'auto';
  return 'manuel'; // vert
}

/**
 * 2 origines (3e axe de filtre), ORTHOGONALES à la famille : « Manuel » = tag créé à la main
 * (`meta->>'origine'='manuel'`, exposé par la route en `e.origine`) ; « Automatique » = tout le reste
 * (origine absente ou ≠ 'manuel'). Dérivé de `e.origine` — aucun recalcul, aucun SQL.
 */
type Origine = 'auto' | 'manuel';

const ORIGINES: { cle: Origine; libelle: string }[] = [
  { cle: 'auto', libelle: 'Automatique' },
  { cle: 'manuel', libelle: 'Manuel' },
];

/** Origine d'une entité (exclusive). `manuel` ssi `e.origine === 'manuel'`, sinon `auto`. */
function origineDe(e: Entite): Origine {
  return e.origine === 'manuel' ? 'manuel' : 'auto';
}

const LIBELLE_FAMILLE: Record<string, string> = {
  mondial: 'Mondial',
  mh: 'MH',
  inventaire: 'Inventaire',
};

/** Étoile jaune (divIcon) marquant une entité MANUELLE, posée au centre de son 1er polygone rattaché. */
function iconeEtoile(): L.DivIcon {
  return L.divIcon({
    className: 'svv-cur-star-pin',
    html: '<span style="color:#e0a400;font-size:20px;line-height:20px;text-shadow:0 1px 2px rgba(0,0,0,.55),0 0 2px #fff;cursor:pointer">★</span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Marqueur coloré par état (divIcon → aucune image externe, pas de 404 d'icône Leaflet). */
function iconePour(etat: EtatEntite, selectionne: boolean): L.DivIcon {
  const c = COULEUR_ETAT[etat];
  const taille = selectionne ? 22 : 15;
  const contour = selectionne ? `outline:3px solid ${c};outline-offset:2px;` : '';
  return L.divIcon({
    className: 'svv-cur-pin',
    html: `<span style="display:block;width:${taille}px;height:${taille}px;border-radius:999px;background:${c};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);${contour}"></span>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Accès endpoints (module-level : LECTURE renvoie les données, jamais de setState ici).
// ─────────────────────────────────────────────────────────────────────────────

async function fetchEntites(): Promise<Entite[] | null> {
  try {
    const res = await fetch('/api/admin/curation/entites');
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.entites)) return null;
    return data.entites as Entite[];
  } catch {
    return null;
  }
}

async function fetchEmprises(bbox: Bbox): Promise<Emprise[]> {
  const params = new URLSearchParams({
    minlon: String(bbox.minlon),
    minlat: String(bbox.minlat),
    maxlon: String(bbox.maxlon),
    maxlat: String(bbox.maxlat),
  });
  try {
    const res = await fetch(`/api/admin/curation/emprises?${params.toString()}`);
    const data = await res.json();
    if (res.ok && Array.isArray(data?.emprises)) return data.emprises as Emprise[];
    return [];
  } catch {
    return [];
  }
}

/** Emprises RATTACHÉES d'une entité (liaisons non détachées), hors bbox — pour le vert persistant. */
async function fetchEmprisesEntite(id: number): Promise<Emprise[]> {
  try {
    const res = await fetch(`/api/admin/curation/entites/${id}/emprises`);
    const data = await res.json();
    if (res.ok && Array.isArray(data?.emprises)) return data.emprises as Emprise[];
    return [];
  } catch {
    return [];
  }
}

/** Étoiles persistantes des tags manuels (centroïdes), indépendantes de la bbox. */
async function fetchTagsManuels(): Promise<TagManuel[]> {
  try {
    const res = await fetch('/api/admin/curation/tags-manuels');
    const data = await res.json();
    if (res.ok && Array.isArray(data?.tags)) return data.tags as TagManuel[];
    return [];
  } catch {
    return [];
  }
}

/** `max(id)` du journal pour une entité (borne d'ouverture ; 0 si aucune ligne ou erreur). */
async function fetchBorne(id: number): Promise<number> {
  try {
    const res = await fetch(`/api/admin/curation/entites/${id}/borne`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && typeof data?.borne === 'number') return data.borne;
    return 0;
  } catch {
    return 0;
  }
}

/** Bornes Leaflet d'un jeu d'emprises (GeoJSON), ou `null` si vide/invalide. */
function boundsEmprises(list: Emprise[]): L.LatLngBounds | null {
  const gj = L.geoJSON();
  for (const emp of list) if (emp.geom) gj.addData(emp.geom);
  const b = gj.getBounds();
  return b.isValid() ? b : null;
}

/**
 * Position { lat, lon } d'une entité pour Street View : son point propre (geom_point), sinon le
 * centroïde des emprises rattachées de la fiche ouverte. `null` si aucune position dérivable
 * (ni point, ni bâtiment rattaché) → le bouton Street View est désactivé.
 * NB : `e.point.coordinates` est en ordre GeoJSON [lon, lat] ; `L.LatLng` expose { lat, lng }.
 */
function positionStreetView(e: Entite, emprisesLiees: Emprise[]): { lat: number; lon: number } | null {
  if (e.point) {
    const [lon, lat] = e.point.coordinates;
    return { lat, lon };
  }
  const centre = boundsEmprises(emprisesLiees)?.getCenter();
  return centre ? { lat: centre.lat, lon: centre.lng } : null;
}

/** Écriture normalisée (jamais de throw ; message d'erreur extrait de la réponse). */
async function ecrire(
  url: string,
  method: 'PATCH' | 'DELETE' | 'POST',
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return { ok: true };
    let message = 'écriture refusée';
    try {
      const d = await res.json();
      message = d?.erreurs?.[0]?.message ?? d?.erreur ?? message;
    } catch {
      /* corps non-JSON : message par défaut */
    }
    return { ok: false, message };
  } catch {
    return { ok: false, message: 'réseau indisponible' };
  }
}

/**
 * Crée une entité patrimoniale manuelle (POST /entites, sous-étape 1/6) et renvoie son `id`, ou `null`
 * en cas d'échec. Le helper `ecrire` ne remonte pas le corps de réponse → fetch direct pour lire `entite.id`.
 */
async function creerEntite(payload: { famille: string; nom: string }): Promise<number | null> {
  try {
    const res = await fetch('/api/admin/curation/entites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || typeof data?.entite?.id !== 'number') return null;
    return data.entite.id as number;
  } catch {
    return null;
  }
}

/** Bornes 4326 de la vue courante (pour le GET emprises). */
function bboxDe(map: L.Map): Bbox {
  const b = map.getBounds();
  return { minlon: b.getWest(), minlat: b.getSouth(), maxlon: b.getEast(), maxlat: b.getNorth() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant.
// ─────────────────────────────────────────────────────────────────────────────

export default function CurationCarte() {
  const [entites, setEntites] = useState<Entite[] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [famillesVisibles, setFamillesVisibles] = useState<Record<string, boolean>>({
    mondial: true,
    mh: true,
    inventaire: true,
  });
  // Filtre « Manuel » = 4e item du bloc Familles : visibilité des tags créés à la main (origine='manuel'),
  // axe ORTHOGONAL à la famille mondial/mh/inventaire (un tag manuel garde sa famille, mais suit CETTE case,
  // pas celle de sa famille). Gouverne SIMULTANÉMENT la carte (couche étoiles) et la liste de gauche.
  const [manuelVisible, setManuelVisible] = useState(true);
  // Filtre SECONDAIRE (statut de point GPS), cumulatif avec les familles, tout coché par défaut (même patron).
  const [statutsVisibles, setStatutsVisibles] = useState<Record<StatutPoint, boolean>>({
    a_placer: true,
    auto: true,
    manuel: true,
    sans_point: true,
  });
  // Filtre TERTIAIRE (origine : automatique / manuel), cumulatif, tout coché par défaut (même patron).
  const [originesVisibles, setOriginesVisibles] = useState<Record<Origine, boolean>>({
    auto: true,
    manuel: true,
  });
  const [recherche, setRecherche] = useState('');
  const [selectionId, setSelectionId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ texte: string; type: 'ok' | 'erreur' } | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);
  const [emprises, setEmprises] = useState<Emprise[]>([]);
  const [emprisesLiees, setEmprisesLiees] = useState<Emprise[]>([]);
  const [emprisesFond, setEmprisesFond] = useState<Emprise[]>([]); // bâtiments bbox (hover + dblclick créer)
  // Mode « Infos bâtiment » : bulle d'info (année + étages) au survol (desktop) / tap (mobile) sur un
  // bâtiment de fond. INACTIF par défaut ; actif → SUSPEND la création par double-clic (cf. doitCreerAuDoubleClic).
  const [modeBulle, setModeBulle] = useState(false);
  const [tagsManuels, setTagsManuels] = useState<TagManuel[]>([]); // étoiles persistantes (centroïdes)
  const [enEcriture, setEnEcriture] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);
  // Formulaire « + Nouveau tag » (création d'entité manuelle).
  const [creationOuverte, setCreationOuverte] = useState(false);
  // Panneau « Filtres » repliable (regroupe Familles/Statut/Origine). REPLI PUREMENT VISUEL : les états de filtres
  // (famillesVisibles, statutsVisibles, originesVisibles, manuelVisible) vivent au-dessus et pilotent la carte même
  // panneau fermé — replier ne démonte que l'UI des cases, jamais les valeurs. Fermé par défaut.
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [formFamille, setFormFamille] = useState<'mondial' | 'mh' | 'inventaire'>('mh');
  const [formNom, setFormNom] = useState('');
  const [cleabsCible, setCleabsCible] = useState<string | null>(null); // bâtiment double-cliqué à taguer
  const [composition, setComposition] = useState<number | null>(null); // entité juste créée, en cours de composition (zone haute)
  // Redirection vers l'édition d'un tag manuel existant (au lieu d'un doublon) + confirmation de suppression.
  const [editionProposee, setEditionProposee] = useState<{ id: number; nom: string | null } | null>(null);
  const [confirmSuppression, setConfirmSuppression] = useState(false);

  // ── Édition de carte (footer Sortir / Valider-Annuler) — capture de borne + drapeau « modifiée ». ──
  const [borneOuverture, setBorneOuverture] = useState<number | null>(null); // max(id) journal à l'ouverture
  const [carteModifiee, setCarteModifiee] = useState(false); // ≥1 mutation depuis l'ouverture
  const [creeeEnSession, setCreeeEnSession] = useState(false); // entité créée pendant la session
  const [confirmValider, setConfirmValider] = useState(false);
  const creationBorneRef = useRef<number | null>(null); // id de l'entité tout juste créée (borne=0 à l'ouverture)

  // ── Historique du journal (split empilé zone droite). `mode:'global'` câblé au Lot 3 (type prévu). ──
  type EtatJournal = null | { mode: 'entite'; entiteId: number } | { mode: 'global' };
  const [journal, setJournal] = useState<EtatJournal>(null);
  const journalOuvert = journal !== null;
  const [journalLignes, setJournalLignes] = useState<LigneJournal[]>([]);
  const [journalEntite, setJournalEntite] = useState<{ nom_affiche: string; famille_affiche: string; supprimee: boolean } | null>(null);
  const [journalChargement, setJournalChargement] = useState(false);
  const [journalErreur, setJournalErreur] = useState<string | null>(null);
  // Contrôles du volet GLOBAL (HJ-42..44).
  const [journalFamille, setJournalFamille] = useState<'toutes' | 'inventaire' | 'mh' | 'mondial'>('toutes');
  const [journalOrdre, setJournalOrdre] = useState<'desc' | 'asc'>('desc');
  const [journalOffset, setJournalOffset] = useState(0);
  const [journalTotal, setJournalTotal] = useState(0);

  // Refs Leaflet (map créée une seule fois ; couches réutilisées).
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const coucheMarqueursRef = useRef<L.LayerGroup | null>(null);
  const coucheEmprisesRef = useRef<L.LayerGroup | null>(null);
  const coucheFondRef = useRef<L.LayerGroup | null>(null); // bâtiments bbox (sous les couches bleu/vert)
  const coucheEtoilesRef = useRef<L.LayerGroup | null>(null); // étoiles + vert des entités MANUELLES (persistant, bbox)
  const formulaireRef = useRef<HTMLDivElement | null>(null); // conteneur du formulaire « Nouveau tag » (scroll auto)
  const fitEnAttenteRef = useRef<number | null>(null); // entité sans-point à recadrer dès l'arrivée de ses emprises
  const ajusteRef = useRef(false); // fitBounds une seule fois (jamais après un rechargement)
  const selectionIdRef = useRef<number | null>(null); // miroir pour le handler `moveend`
  const emprisesLieesRef = useRef<Emprise[]>([]); // miroir des emprises rattachées (fit impératif au re-clic)
  const entitesRef = useRef<Entite[] | null>(null); // miroir pour `ouvrirCreationCiblee` (identité stable)
  const itemActifRef = useRef<HTMLLIElement | null>(null); // item de liste sélectionné (scroll auto)

  // Miroir de la sélection (lu par le handler `moveend` attaché une seule fois).
  useEffect(() => {
    selectionIdRef.current = selectionId;
  }, [selectionId]);

  // ── À l'ouverture d'une carte : capture borneOuverture (max id journal). Les drapeaux d'édition sont
  //    reset dans `selectionner` (handler) ; ici, uniquement le fetch async (évite le set-state synchrone
  //    en effet). Entité fraîchement créée → borne 0 posée par `selectionner`, pas de fetch (ref → skip).
  useEffect(() => {
    if (selectionId === null || creationBorneRef.current === selectionId) {
      creationBorneRef.current = null;
      return;
    }
    let annule = false;
    void (async () => {
      const b = await fetchBorne(selectionId);
      if (!annule) setBorneOuverture(b);
    })();
    return () => {
      annule = true;
    };
  }, [selectionId]);

  // Miroir de la liste des entités (lu par `ouvrirCreationCiblee` sans en refaire l'identité).
  useEffect(() => {
    entitesRef.current = entites;
  }, [entites]);

  // Miroir des emprises rattachées (lu par `selectionner` pour un fit impératif au re-clic).
  useEffect(() => {
    emprisesLieesRef.current = emprisesLiees;
  }, [emprisesLiees]);

  // Étoiles persistantes : (re)chargées à chaque changement de `entites` (création/suppression/rattachement).
  useEffect(() => {
    let annule = false;
    (async () => {
      const liste = await fetchTagsManuels();
      if (!annule) setTagsManuels(liste);
    })();
    return () => {
      annule = true;
    };
  }, [entites]);

  // ── Feedback transitoire (auto-effacé). ──────────────────────────────────────
  const signaler = useCallback((texte: string, type: 'ok' | 'erreur') => {
    setMessage({ texte, type });
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  // ── Rechargement de la liste (après une écriture). Event-driven, jamais en effet. ─
  const recharger = useCallback(async (): Promise<void> => {
    const liste = await fetchEntites();
    if (liste) {
      setEntites(liste);
      setErreurChargement(null);
    } else {
      setErreurChargement('Entités indisponibles.');
    }
  }, []);

  // ── Chargement initial (inline : setState lexicalement dans l'effet). ────────
  useEffect(() => {
    let annule = false;
    (async () => {
      const liste = await fetchEntites();
      if (annule) return;
      if (liste) setEntites(liste);
      else setErreurChargement('Entités indisponibles.');
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  // ── Emprises de la bbox visible (pour rattacher/détacher). Event-driven (`moveend`). ─
  const chargerEmprises = useCallback(async (): Promise<void> => {
    const map = mapRef.current;
    if (!map || selectionIdRef.current === null) return;
    const liste = await fetchEmprises(bboxDe(map));
    setEmprises(liste);
  }, []);

  // ── Couche de fond : bâtiments de la bbox, chargés TOUJOURS (indépendant de la sélection). ─
  const chargerEmprisesFond = useCallback(async (): Promise<void> => {
    const map = mapRef.current;
    if (!map) return;
    const liste = await fetchEmprises(bboxDe(map));
    setEmprisesFond(liste);
  }, []);

  // ── Double-clic sur un bâtiment : ouvre « Nouveau tag » ciblé, SAUF si ce cleabs appartient déjà à un
  //    tag MANUEL (liaison active) → propose l'édition de ce tag (anti-doublon manuel ; le multi-entités
  //    NATIF reste permis). Lit `entitesRef` (identité stable pour la couche de fond). ─
  const ouvrirCreationCiblee = useCallback((cleabs: string) => {
    const dejaManuel = (entitesRef.current ?? []).find(
      (e) => e.origine === 'manuel' && e.liaisons.some((l) => l.cleabs === cleabs && l.actif && !l.detache),
    );
    if (dejaManuel) {
      setEditionProposee({ id: dejaManuel.id, nom: dejaManuel.nom });
      return;
    }
    // Régression : le rendu de la carte de création est gardé derrière `composition === null`. On ferme
    // toute composition/sélection en cours pour qu'un double-clic démarre TOUJOURS une création fraîche
    // (sinon la zone de composition ou les emprises bleues candidates masqueraient/intercepteraient le formulaire).
    setComposition(null);
    setSelectionId(null);
    setCleabsCible(cleabs);
    setCreationOuverte(true);
  }, []);

  // ── Création de la carte (une seule fois). ───────────────────────────────────
  useEffect(() => {
    if (!conteneurRef.current || mapRef.current) return;
    // doubleClickZoom désactivé : le double-clic ne doit pas zoomer sur la carte de curation
    // (évite un zoom parasite ; la création passe par le bouton « + Nouveau tag »).
    const map = L.map(conteneurRef.current, { zoomControl: true, doubleClickZoom: false }).setView(
      [48.856, 2.352],
      12,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    // Ordre d'empilement : le FOND vit dans un pane DÉDIÉ sous l'overlayPane (zIndex 350 < 400) → il reste
    // TOUJOURS sous les emprises bleu/vert de la sélection (overlayPane), quel que soit l'ordre de
    // reconstruction des couches (le simple ordre d'ajout des layerGroup ne le garantirait PAS : les paths
    // GeoJSON partagent un même SVG et s'empilent par ordre d'insertion DOM — un rebuild du fond après une
    // bascule du mode bulle le ferait remonter au-dessus des candidates et VOLERAIT le clic de rattachement).
    // Le pane garantit la priorité du rattachement/détachement en toute circonstance. Marqueurs + étoiles =
    // markerPane (toujours au-dessus → l'étoile capte son double-clic).
    map.createPane('svv-cur-fond');
    const paneFond = map.getPane('svv-cur-fond');
    if (paneFond) paneFond.style.zIndex = '350';
    coucheFondRef.current = L.layerGroup().addTo(map);
    coucheEtoilesRef.current = L.layerGroup().addTo(map);
    coucheMarqueursRef.current = L.layerGroup().addTo(map);
    coucheEmprisesRef.current = L.layerGroup().addTo(map);

    // Re-charge les emprises quand la vue change : le fond TOUJOURS, les candidates si sélection.
    map.on('moveend', () => {
      void chargerEmprisesFond();
      if (selectionIdRef.current !== null) void chargerEmprises();
    });

    const surResize = () => map.invalidateSize();
    window.addEventListener('resize', surResize);
    setTimeout(() => {
      map.invalidateSize();
      void chargerEmprisesFond(); // fond initial (aucun moveend au montage)
    }, 200);

    return () => {
      window.removeEventListener('resize', surResize);
      map.remove();
      mapRef.current = null;
      coucheMarqueursRef.current = null;
      coucheEmprisesRef.current = null;
      coucheFondRef.current = null;
      coucheEtoilesRef.current = null;
    };
  }, [chargerEmprises, chargerEmprisesFond]);

  // ── Split carte/journal : après ouverture/fermeture, la carte a changé de taille → invalidateSize.
  //    APRÈS le re-render (double rAF pour laisser le layout se poser). N'apparaît QUE dans cet effet
  //    (jamais dans l'effet d'init → pas de recréation de carte). ─
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => mapRef.current?.invalidateSize());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [journalOuvert]);

  // ── Volet A : chargement de l'historique d'UNE entité (GET lecture seule). ─
  useEffect(() => {
    if (journal?.mode !== 'entite') return;
    const id = journal.entiteId;
    let annule = false;
    void (async () => {
      setJournalChargement(true);
      setJournalErreur(null);
      try {
        const res = await fetch(`/api/admin/curation/entites/${id}/journal`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) {
          setJournalErreur('Historique indisponible.');
          setJournalLignes([]);
          setJournalEntite(null);
          return;
        }
        const data = await res.json();
        if (annule) return;
        setJournalLignes(Array.isArray(data.lignes) ? (data.lignes as LigneJournal[]) : []);
        setJournalEntite(data.entite ?? null);
      } catch {
        if (!annule) setJournalErreur('Historique indisponible.');
      } finally {
        if (!annule) setJournalChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [journal]);

  // ── Volet B : chargement de l'historique GLOBAL (paginé/filtré/trié, lecture seule). Refetch sur
  //    changement de famille/ordre/offset (les handlers remettent offset à 0 sauf la pagination). ─
  useEffect(() => {
    if (journal?.mode !== 'global') return;
    let annule = false;
    void (async () => {
      setJournalChargement(true);
      setJournalErreur(null);
      try {
        const qs = new URLSearchParams({
          famille: journalFamille,
          ordre: journalOrdre,
          limit: String(JOURNAL_LIMIT),
          offset: String(journalOffset),
        });
        const res = await fetch(`/api/admin/curation/journal?${qs.toString()}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) {
          setJournalErreur('Historique indisponible.');
          setJournalLignes([]);
          setJournalTotal(0);
          return;
        }
        const data = await res.json();
        if (annule) return;
        setJournalLignes(Array.isArray(data.lignes) ? (data.lignes as LigneJournal[]) : []);
        setJournalTotal(Number(data.total) || 0);
      } catch {
        if (!annule) setJournalErreur('Historique indisponible.');
      } finally {
        if (!annule) setJournalChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [journal, journalFamille, journalOrdre, journalOffset]);

  // ── Recentrage ISOLÉ sur une entité (clic d'une ligne du journal global, OQ-2) : NE PAS ouvrir la fiche
  //    ni fermer le journal. Point → setView ; sinon best-effort fitBounds sur ses emprises ; sinon no-op. ─
  const recentrerSurEntite = useCallback(
    async (entiteId: number) => {
      const map = mapRef.current;
      if (!map) return;
      const e = entitesRef.current?.find((x) => x.id === entiteId);
      if (e?.point) {
        const [lon, lat] = e.point.coordinates;
        map.setView([lat, lon], Math.max(map.getZoom(), 17));
        return;
      }
      const b = boundsEmprises(await fetchEmprisesEntite(entiteId));
      if (b) map.fitBounds(b, { padding: [40, 40], maxZoom: 18 });
    },
    [],
  );

  // ── Sélection d'une entité (centre la carte + charge ses emprises via l'effet). ─
  const selectionner = useCallback(
    (id: number) => {
      setSelectionId(id);
      // OQ-6 : clic sur une AUTRE fiche pendant une composition → fermeture implicite (comme « Terminer »).
      setComposition((c) => (c === id ? c : null));
      // HJ-56 : clic sur une AUTRE fiche → referme le journal (garde le volet A ouvert si c'est la même entité).
      setJournal((j) => (j?.mode === 'entite' && j.entiteId === id ? j : null));
      setFlashId(id); // cible du scroll + surbrillance brève dans la liste
      setConfirmDetach(null);
      setConfirmSuppression(false);
      // Reset des drapeaux d'édition (footer) au changement de carte. Création → borne 0 + modifiée.
      setConfirmValider(false);
      setCarteModifiee(false);
      const creee = creationBorneRef.current === id;
      setCreeeEnSession(creee);
      if (creee) setBorneOuverture(0);
      coucheEmprisesRef.current?.clearLayers(); // évite un flash des emprises de l'entité précédente
      const e = entites?.find((x) => x.id === id);
      const map = mapRef.current;
      if (e?.point && map) {
        // Entité AVEC point : recentrage IMPÉRATIF synchrone (à chaque clic).
        const [lon, lat] = e.point.coordinates;
        map.setView([lat, lon], Math.max(map.getZoom(), 17));
      } else if (e && e.point === null && map) {
        // Entité SANS point : arme le fit sur ses emprises ; si déjà chargées (re-clic même fiche) → fit immédiat.
        fitEnAttenteRef.current = id;
        if (selectionIdRef.current === id) {
          const b = boundsEmprises(emprisesLieesRef.current);
          if (b) {
            map.fitBounds(b, { padding: [40, 40], maxZoom: 18 });
            fitEnAttenteRef.current = null;
          }
        }
      }
    },
    [entites],
  );

  // ── Écritures (event-driven ; chaque succès recharge l'état → couleurs/compteurs). ─
  const deplacer = useCallback(
    async (id: number, lat: number, lon: number, marqueur: L.Marker, origine: L.LatLngExpression) => {
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/point`, 'PATCH', { lat, lon });
      setEnEcriture(false);
      if (!rep.ok) {
        marqueur.setLatLng(origine); // EX-7 : remise en place, aucun état incohérent
        signaler(rep.message ?? 'Déplacement refusé.', 'erreur');
        return;
      }
      signaler('Point déplacé.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  const annulerDeplacement = useCallback(
    async (id: number) => {
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/point`, 'DELETE');
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Annulation impossible.', 'erreur');
        return;
      }
      signaler('Déplacement annulé.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  const rattacher = useCallback(
    async (id: number, cleabs: string) => {
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/liaisons`, 'POST', { cleabs });
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Rattachement impossible.', 'erreur');
        return;
      }
      signaler('Emprise rattachée.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  const detacher = useCallback(
    async (id: number, cleabs: string) => {
      setConfirmDetach(null);
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/liaisons`, 'DELETE', { cleabs });
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Détachement impossible.', 'erreur');
        return;
      }
      signaler('Liaison détachée.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  const verifier = useCallback(
    async (id: number, cleabs: string) => {
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/liaisons`, 'PATCH', {
        cleabs,
        verifie: true,
      });
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Vérification impossible.', 'erreur');
        return;
      }
      signaler('Liaison marquée vérifiée.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  // ── Création d'entité manuelle : POST → recharge (entrée dans `entites`) → sélection. ─
  const soumettreCreation = useCallback(async () => {
    // Nom OPTIONNEL (B1) : vide → NULL côté serveur, le cartouche résultat affiche un générique par famille.
    const nom = formNom.trim();
    const cible = cleabsCible; // capturé AVANT reset : polygone du double-clic à AUTO-rattacher
    setEnEcriture(true);
    const id = await creerEntite({ famille: formFamille, nom });
    if (id === null) {
      setEnEcriture(false);
      signaler('Création impossible.', 'erreur');
      return;
    }
    // Auto-rattachement du polygone double-cliqué (route /liaisons EXISTANTE, source manuel) — 2 appels distincts.
    // Échec du rattachement : l'entité (déjà créée) PERSISTE, l'opérateur clique l'emprise manuellement (cohérent Abandonner).
    let rattacheOk = false;
    if (cible !== null) {
      const rep = await ecrire(`/api/admin/curation/entites/${id}/liaisons`, 'POST', { cleabs: cible });
      rattacheOk = rep.ok;
    }
    setEnEcriture(false);
    setCreationOuverte(false);
    setFormNom('');
    setCleabsCible(null);
    await recharger(); // entités à jour → puce/compteur/emprisesLiees (vert) + étoile (effet [entites] → tags-manuels)
    // Chantier précédent : SÉLECTION SANS scroll — `selectionId` posé DIRECTEMENT (pas via `selectionner`, donc pas de
    // `flashId` → aucun scroll ni surbrillance). La fiche s'affiche dans la ZONE DE COMPOSITION en haut.
    setJournal(null);
    setConfirmDetach(null);
    setSelectionId(id);
    setComposition(id);
    if (cible !== null && !rattacheOk) {
      signaler('Tag créé, mais le rattachement du polygone a échoué — clique l’emprise bleue pour le rattacher.', 'erreur');
    } else if (cible !== null) {
      signaler('Tag créé et rattaché au polygone.', 'ok');
    } else {
      signaler('Tag créé — sélectionne un ou plusieurs polygones, puis clique « Terminer ».', 'ok');
    }
  }, [formFamille, formNom, cleabsCible, recharger, signaler]);

  // ── Renommer / supprimer un tag MANUEL (routes gardées `origine='manuel'` côté serveur). ─
  const renommerEntite = useCallback(
    async (id: number, nom: string) => {
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}`, 'PATCH', { nom });
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Renommage impossible.', 'erreur');
        return;
      }
      signaler('Tag renommé.', 'ok');
      setCarteModifiee(true);
      await recharger();
    },
    [recharger, signaler],
  );

  const supprimerEntite = useCallback(
    async (id: number) => {
      setConfirmSuppression(false);
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}`, 'DELETE');
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Suppression impossible.', 'erreur');
        return;
      }
      signaler('Tag supprimé.', 'ok');
      setSelectionId(null);
      await recharger();
    },
    [recharger, signaler],
  );

  // ── Repli de la carte SANS scroll : `selectionId=null` ; l'effet de scroll ignore null (aucun saut),
  //    aucun flyTo/fitBounds n'est déclenché (ce n'est pas un `selectionner`). L'ordre de la liste ne bouge pas.
  const refermerCarte = useCallback(() => {
    setSelectionId(null);
    setJournal(null); // fermer la fiche ferme aussi son historique (retour carte pleine)
    coucheEmprisesRef.current?.clearLayers();
  }, []);

  // ── « Annuler » (direct, sans confirmation) : rollback serveur vers la borne d'ouverture, puis repli. ──
  const annulerEdition = useCallback(
    async (id: number) => {
      if (borneOuverture === null) return; // borne pas encore chargée : on ne tente rien
      setEnEcriture(true);
      const rep = await ecrire(`/api/admin/curation/entites/${id}/annuler-edition`, 'POST', { borne: borneOuverture });
      setEnEcriture(false);
      if (!rep.ok) {
        signaler(rep.message ?? 'Annulation impossible.', 'erreur'); // échec : la carte RESTE ouverte
        return;
      }
      signaler('Modifications annulées.', 'ok');
      await recharger();
      refermerCarte();
    },
    [borneOuverture, recharger, signaler, refermerCarte],
  );

  // ── Entités affichables sur la carte (point non nul + famille visible + statut visible). ──────
  const entitesAvecPoint = useMemo(
    () =>
      (entites ?? []).filter(
        (e) =>
          e.point !== null &&
          // Axe famille : un tag manuel suit la case « Manuel » ; une entité auto suit sa famille.
          (origineDe(e) === 'manuel' ? manuelVisible : famillesVisibles[e.famille] !== false) &&
          statutsVisibles[seauStatut(e)] !== false &&
          originesVisibles[origineDe(e)] !== false,
      ),
    [entites, famillesVisibles, manuelVisible, statutsVisibles, originesVisibles],
  );

  // ── (Re)dessin des marqueurs quand entités / filtres / sélection changent. ────
  useEffect(() => {
    const map = mapRef.current;
    const couche = coucheMarqueursRef.current;
    if (!map || !couche) return;
    couche.clearLayers();
    const points: L.LatLngExpression[] = [];

    for (const e of entitesAvecPoint) {
      if (!e.point) continue;
      const [lon, lat] = e.point.coordinates;
      const selectionne = e.id === selectionId;
      const origine: L.LatLngExpression = [lat, lon];
      const marqueur = L.marker(origine, {
        draggable: selectionne,
        icon: iconePour(e.etat, selectionne),
        keyboard: false,
      });
      marqueur.on('click', () => selectionner(e.id));
      marqueur.on('dblclick', () => selectionner(e.id)); // parité étoile : double-clic point → ouvre la fiche
      if (selectionne) {
        marqueur.on('dragend', () => {
          const p = marqueur.getLatLng();
          void deplacer(e.id, p.lat, p.lng, marqueur, origine);
        });
      }
      marqueur.addTo(couche);
      points.push(origine);
    }

    if (!ajusteRef.current && points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      ajusteRef.current = true;
    }
  }, [entitesAvecPoint, selectionId, selectionner, deplacer]);

  // ── Entité sélectionnée + jeu de cleabs actifs (pour colorer les emprises). ──
  const entiteSelectionnee = useMemo(
    () => entites?.find((e) => e.id === selectionId) ?? null,
    [entites, selectionId],
  );

  // ── Emprises CANDIDATES (bbox) à la sélection / au déplacement de la vue. ────────
  useEffect(() => {
    if (selectionId === null) return;
    const map = mapRef.current;
    if (!map) return;
    let annule = false;
    (async () => {
      const liste = await fetchEmprises(bboxDe(map));
      if (!annule) setEmprises(liste);
    })();
    return () => {
      annule = true;
    };
  }, [selectionId]);

  // ── Emprises RATTACHÉES de l'entité (vert persistant, hors bbox) — refetch après écriture. ─
  useEffect(() => {
    let annule = false;
    (async () => {
      if (selectionId === null) {
        setEmprisesLiees([]);
        return;
      }
      const liste = await fetchEmprisesEntite(selectionId);
      if (!annule) setEmprisesLiees(liste);
    })();
    return () => {
      annule = true;
    };
  }, [selectionId, entites]);

  // ── Correction A : entité SANS point → ajuster la carte sur ses emprises rattachées dès qu'elles
  //    arrivent (fit ARMÉ par `selectionner`, consommé ici). Le drapeau `fitEnAttenteRef` n'est armé qu'au
  //    clic d'une fiche → aucun re-fit parasite pendant la composition (rattachements successifs). ─
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !entiteSelectionnee) return;
    if (entiteSelectionnee.point !== null) return; // entités AVEC point : recentrage fait par selectionner
    if (fitEnAttenteRef.current !== entiteSelectionnee.id) return; // aucun fit demandé pour cette entité
    if (emprisesLiees.length === 0) return; // emprises pas encore arrivées → on attend le prochain fetch
    const bounds = boundsEmprises(emprisesLiees);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
      fitEnAttenteRef.current = null; // consommé
    }
  }, [entiteSelectionnee, emprisesLiees]);

  // ── Correction B : couche de fond des bâtiments (transparente au repos, contour au survol),
  //    double-clic = ouvrir « Nouveau tag » ciblé. SOUS les couches bleu/vert (qui interceptent si sélection). ─
  //    Mode bulle ACTIF : bulle « année » au survol (desktop) ET au clic/tap (mobile, via bindPopup) — la
  //    VALEUR n'est donc jamais hover-only. Le double-clic de création est SUSPENDU (doitCreerAuDoubleClic).
  //    Le rattachement (couche bleue au-dessus) garde sa priorité : sur une entité sélectionnée, le clic
  //    atteint la couche bleue avant le fond → aucune bulle sur les candidates (curation prioritaire). ─
  useEffect(() => {
    const couche = coucheFondRef.current;
    if (!couche) return;
    couche.clearLayers();
    for (const emp of emprisesFond) {
      if (!emp.geom || !emp.cleabs) continue;
      const cleabs = emp.cleabs;
      const layer = L.geoJSON(emp.geom, {
        interactive: true,
        pane: 'svv-cur-fond', // pane bas dédié → toujours SOUS les emprises bleu/vert (priorité rattachement)
        style: { stroke: false, fill: true, fillColor: '#a30402', fillOpacity: 0 },
      });
      layer.on('mouseover', () => layer.setStyle({ stroke: true, color: '#a30402', weight: 1, fillOpacity: 0.06 }));
      layer.on('mouseout', () => layer.setStyle({ stroke: false, fillOpacity: 0 }));
      // Création par double-clic : gardée par la règle pure (suspendue quand le mode bulle est actif).
      layer.on('dblclick', () => {
        if (doitCreerAuDoubleClic(modeBulle)) ouvrirCreationCiblee(cleabs);
      });
      if (modeBulle) {
        // bindPopup ouvre la bulle au CLIC/TAP (mobile). `closeButton:false` + `autoPan:false` = bulle
        // sobre qui ne déplace pas la carte ; se ferme au clic ailleurs (closeOnClick par défaut).
        layer.bindPopup(contenuBulleBatiment(emp.annee, emp.etages), {
          className: 'svv-cur-bulle-popup',
          closeButton: false,
          autoPan: false,
        });
        layer.on('mouseover', () => layer.openPopup()); // desktop : survol → bulle
        layer.on('mouseout', () => layer.closePopup()); // se ferme au mouseout
      }
      layer.addTo(couche);
    }
  }, [emprisesFond, ouvrirCreationCiblee, modeBulle]);

  // ── Mode bulle désactivé : referme toute bulle encore ouverte (le rebuild ci-dessus retire déjà les
  //    popups liés, ce close est un filet de sécurité au basculement). ─
  useEffect(() => {
    if (!modeBulle) mapRef.current?.closePopup();
  }, [modeBulle]);

  // ── Overlay TAGS MANUELS : ÉTOILES depuis `tagsManuels` (centroïdes, PERSISTANTES à tout zoom,
  //    indépendantes de la bbox — corrige la disparition au dézoom). Le vert des liaisons n'est plus
  //    tracé ici : seul le vert INTERACTIF de la carte OUVERTE (coucheEmprisesRef) subsiste.
  //    Double-clic étoile → sélectionne la fiche (+ scroll liste), `stopPropagation` (pas de création). ─
  useEffect(() => {
    const couche = coucheEtoilesRef.current;
    if (!couche) return;
    couche.clearLayers();
    if (!manuelVisible) return; // case « Manuel » (bloc Familles) décochée → aucune étoile manuelle sur la carte

    // Étoiles PERSISTANTES (une par tag manuel, centroïde du 1er polygone) — à tout zoom.
    for (const t of tagsManuels) {
      if (!t.centre) continue;
      const [lon, lat] = t.centre.coordinates;
      const star = L.marker([lat, lon], { icon: iconeEtoile(), interactive: true, keyboard: false });
      star.on('dblclick', (ev) => {
        L.DomEvent.stopPropagation(ev); // n'ouvre PAS la création ciblée du fond dessous
        selectionner(t.entiteId);
      });
      star.addTo(couche);
    }
  }, [tagsManuels, selectionner, manuelVisible]);

  // ── Scroll auto vers l'item sélectionné dans la liste + surbrillance brève (clic marqueur / étoile). ─
  //    Keyé sur `flashId` (posé par `selectionner` à CHAQUE sélection, même re-sélection d'une fiche déjà
  //    ouverte → l'étoile scrolle comme le point). `flashId` n'est jamais touché par le repli (refermerCarte/
  //    supprimerEntite) → le repli reste SANS scroll ; le reset à null ci-dessous est neutralisé par la garde.
  useEffect(() => {
    if (flashId === null) return; // pas de scroll au montage ni au repli
    const node = itemActifRef.current;
    if (!node) return; // entité filtrée hors liste (recherche/filtre) → rien à scroller
    const reduire = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // block:'center' → scroll d'ouverture franc, la fiche sélectionnée est centrée dans la colonne.
    node.scrollIntoView({ behavior: reduire ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    const t = setTimeout(() => setFlashId(null), 1200); // retire la surbrillance (CSS gère reduce)
    return () => clearTimeout(t);
  }, [flashId]);

  // FC-60 : aucun scrollIntoView à l'ouverture du formulaire de création (effet `[creationOuverte]` retiré).

  // ── Scroll vers la zone de COMPOSITION UNIQUEMENT (fiche créée depuis la CARTE : l'attention est sur la carte →
  //    on amène la zone dans le panneau latéral). Le FORMULAIRE de création ouvert via le bouton « + Nouveau tag »
  //    NE scrolle PAS : il s'ouvre EN PLACE comme les panneaux Filtres / Infos bâtiment (accordéon), sinon « scroll
  //    bizarre » à l'ouverture. Keyé sur `composition` seul (jamais `creationOuverte`). Cible `formulaireRef` (HAUT).
  useEffect(() => {
    if (composition === null) return;
    const reduire = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const raf = requestAnimationFrame(() => {
      formulaireRef.current?.scrollIntoView({ behavior: reduire ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [composition]);

  // ── Fermeture de la zone de composition (« Terminer » / « Abandonner ») : COSMÉTIQUE, aucune écriture,
  //    aucune suppression (OQ-1). `selectionId=null` → l'entité rejoint la liste à sa place (re-render normal).
  //    Aucun scroll (flashId non touché → garde de l'effet `[flashId]`). ─
  const fermerComposition = useCallback(() => {
    setComposition(null);
    setSelectionId(null);
    coucheEmprisesRef.current?.clearLayers();
  }, []);

  // ── (Re)dessin des emprises : rattachées en VERT UNIFORME (persistant, Correction 3) +
  //    candidates de la bbox en bleu (hors des déjà rattachées). ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const couche = coucheEmprisesRef.current;
    if (!map || !couche) return;
    couche.clearLayers();
    if (!entiteSelectionnee) return;

    // 1. Rattachées (vert), quel que soit vérifié/manuel/auto — reconstruites depuis les liaisons.
    const cleabsLies = new Set<string>();
    for (const emp of emprisesLiees) {
      if (!emp.geom || !emp.cleabs) continue;
      const cleabs = emp.cleabs;
      cleabsLies.add(cleabs);
      const layer = L.geoJSON(emp.geom, {
        style: { color: '#2e9e5b', weight: 2, fillColor: '#2e9e5b', fillOpacity: 0.28 },
      });
      layer.on('click', () => setConfirmDetach(cleabs));
      layer.addTo(couche);
    }

    // 2. Candidates de la bbox (bleu) — jamais celles déjà rattachées (évite double dessin).
    for (const emp of emprises) {
      if (!emp.geom || !emp.cleabs || cleabsLies.has(emp.cleabs)) continue;
      const cleabs = emp.cleabs;
      const layer = L.geoJSON(emp.geom, {
        style: { color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12 },
      });
      layer.on('click', () => void rattacher(entiteSelectionnee.id, cleabs));
      layer.addTo(couche);
    }
  }, [emprises, emprisesLiees, entiteSelectionnee, rattacher]);

  // ── Dérivés du panneau (filtre famille + recherche + compteurs). ─────────────
  const entitesFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (entites ?? [])
      .filter((e) => e.id !== composition) // FC-20/FC-74 : l'entité en composition est dans la zone haute, hors liste
      // filtre PRIORITAIRE : famille — un tag manuel suit la case « Manuel » (pas sa famille), les autres leur famille.
      .filter((e) => (origineDe(e) === 'manuel' ? manuelVisible : famillesVisibles[e.famille] !== false))
      .filter((e) => statutsVisibles[seauStatut(e)] !== false) // filtre SECONDAIRE cumulatif : statut de point GPS
      .filter((e) => originesVisibles[origineDe(e)] !== false) // filtre TERTIAIRE cumulatif : origine
      .filter((e) => {
        if (!q) return true;
        return (e.nom ?? '').toLowerCase().includes(q) || e.refCode.toLowerCase().includes(q);
      });
  }, [entites, famillesVisibles, manuelVisible, statutsVisibles, originesVisibles, recherche, composition]);

  const compteurs: Compteurs = useMemo(() => {
    // Cohérent avec la liste : un tag manuel compte selon la case « Manuel », une entité auto selon sa famille.
    const base = (entites ?? []).filter((e) =>
      origineDe(e) === 'manuel' ? manuelVisible : famillesVisibles[e.famille] !== false,
    );
    return {
      rouge: base.filter((e) => e.etat === 'rouge').length,
      orange: base.filter((e) => e.etat === 'orange').length,
      vert: base.filter((e) => e.etat === 'vert').length,
    };
  }, [entites, famillesVisibles, manuelVisible]);

  const sansPoint = useMemo(
    () => entitesFiltrees.filter((e) => e.point === null).length,
    [entitesFiltrees],
  );

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="svv-cur-wrap">
      <style>{CSS}</style>

      <EnTetePage
        titre="Curation patrimoine"
        intro="Corriger les rattachements des 3 familles (MH / Inventaire / Mondial) : déplacer un point (réversible, borné), rattacher / détacher / composer des emprises de bâtiments."
        actions={
          <button
            type="button"
            className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
            aria-expanded={journalOuvert}
            aria-controls="svv-cur-journal"
            onClick={() => {
              if (journalOuvert) {
                setJournal(null); // BASCULE FRANCHE : tout journal ouvert (global OU entité) → ferme en 1 clic
                return;
              }
              setJournalFamille('toutes');
              setJournalOrdre('desc');
              setJournalOffset(0);
              setJournal({ mode: 'global' });
            }}
          >
            Historique
          </button>
        }
      />

      {message && (
        <div className={`svv-cur-toast svv-cur-toast--${message.type}`} role="status" aria-live="polite">
          {message.texte}
        </div>
      )}

      <div className="svv-cur">
        <section className="svv-cur-panel" aria-label="Liste et filtres des entités">
          {/* Redirection vers l'édition d'un tag manuel existant (anti-doublon manuel). */}
          {editionProposee && (
            <div className="svv-cur-form-cible" role="alert">
              {`Ce bâtiment appartient déjà au tag manuel « ${editionProposee.nom ?? 'sans nom'} ». Le modifier ?`}
              <div className="svv-cur-form-actions">
                <button
                  type="button"
                  className="svv-cur-btn svv-cur-btn--mini"
                  onClick={() => {
                    const id = editionProposee.id;
                    setEditionProposee(null);
                    selectionner(id);
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                  onClick={() => setEditionProposee(null)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* 3 actions EMPILÉES pleine largeur, en ACCORDÉON : chaque bouton déploie SON panneau JUSTE dessous
              (toggles INDÉPENDANTS, 1 clic). Ordre haut→bas : Filtres, Infos bâtiment, Nouveau tag. Le repli est
              PUREMENT VISUEL — les valeurs de filtres restent actives et pilotent la carte même panneau fermé
              (démonter les cases ne touche pas les états portés par le parent). « Filtres » replié par défaut. */}
          <div className="svv-cur-accordeon" role="group" aria-label="Actions de curation">

            {/* ── 1) FILTRES ── */}
            <button
              type="button"
              className={`svv-cur-action${filtresOuverts ? ' svv-cur-action--on' : ''}`}
              aria-pressed={filtresOuverts}
              aria-expanded={filtresOuverts}
              aria-controls="svv-cur-panneau-filtres"
              onClick={() => setFiltresOuverts((v) => !v)}
            >
              Filtres
            </button>
            {filtresOuverts && (
              <div id="svv-cur-panneau-filtres" className="svv-cur-panneau-filtres">
                {/* Chaque sous-bloc porte SA PROPRE trame grise (.svv-cur-filtres) ; le gap du conteneur les détache. */}
                {/* Filtres par famille (EX-2). */}
                <fieldset className="svv-cur-filtres">
                  <legend className="svv-cur-legende">Familles</legend>
                  {FAMILLES.map((f) => (
                    <label key={f.cle} className="svv-cur-check">
                      <input
                        type="checkbox"
                        checked={famillesVisibles[f.cle] !== false}
                        onChange={(ev) => setFamillesVisibles((v) => ({ ...v, [f.cle]: ev.target.checked }))}
                      />
                      <span>{f.libelle}</span>
                    </label>
                  ))}
                  {/* 4e item : tags créés à la main (origine='manuel'). Axe orthogonal aux 3 familles ; pilote la
                      couche étoiles (carte) + la liste. Étoile jaune = même repère visuel que les tags dans la liste. */}
                  <label className="svv-cur-check">
                    <input type="checkbox" checked={manuelVisible} onChange={(ev) => setManuelVisible(ev.target.checked)} />
                    <span>
                      <span className="svv-cur-star" aria-hidden>
                        ★
                      </span>
                      Manuel
                    </span>
                  </label>
                </fieldset>

                {/* Filtre SECONDAIRE : statut du point GPS (multi-sélection, cumulatif avec les familles). Agit sur la
                    carte et la liste uniquement (l'historique garde son propre filtre famille). */}
                <fieldset className="svv-cur-filtres">
                  <legend className="svv-cur-legende">Statut du point</legend>
                  {STATUTS_POINT.map((s) => (
                    <label key={s.cle} className="svv-cur-check">
                      <input
                        type="checkbox"
                        checked={statutsVisibles[s.cle] !== false}
                        onChange={(ev) => setStatutsVisibles((v) => ({ ...v, [s.cle]: ev.target.checked }))}
                      />
                      <span>{s.libelle}</span>
                    </label>
                  ))}
                </fieldset>

                {/* Filtre TERTIAIRE : origine (multi-sélection, cumulatif avec familles + statut). Orthogonal à la
                    famille ; agit sur la carte et la liste uniquement (l'historique garde son propre filtre famille).
                    « Manuel » partage l'état `manuelVisible` avec la case du bloc Familles (source unique → synchro
                    automatique dans les 2 sens) ; « Automatique » reste sur `originesVisibles.auto`. */}
                <fieldset className="svv-cur-filtres">
                  <legend className="svv-cur-legende">Origine</legend>
                  {ORIGINES.map((o) => {
                    const estManuel = o.cle === 'manuel'; // miroir de la case Familles « Manuel » (même état)
                    return (
                      <label key={o.cle} className="svv-cur-check">
                        <input
                          type="checkbox"
                          checked={estManuel ? manuelVisible : originesVisibles[o.cle] !== false}
                          onChange={(ev) => {
                            if (estManuel) setManuelVisible(ev.target.checked);
                            else setOriginesVisibles((v) => ({ ...v, [o.cle]: ev.target.checked }));
                          }}
                        />
                        <span>{o.libelle}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </div>
            )}

            {/* ── 2) INFOS BÂTIMENT ── (le mode `modeBulle` pilote la bulle sur la carte — comportement inchangé) */}
            <button
              type="button"
              className={`svv-cur-action${modeBulle ? ' svv-cur-action--on' : ''}`}
              aria-pressed={modeBulle}
              aria-expanded={modeBulle}
              onClick={() => setModeBulle((v) => !v)}
            >
              Infos bâtiment
            </button>
            {modeBulle && (
              <div className="svv-cur-panneau">
                <p id="svv-cur-bulle-aide" className="svv-cur-bulle-aide-txt">
                  Survolez (ou touchez) un bâtiment pour voir son année de construction et son nombre
                  d’étages. Source : données publiques IGN / BDNB — couverture partielle (l’année manque
                  souvent dans Paris, les étages y sont mieux couverts). Le nombre d’étages sert aussi, en
                  secours, à estimer la hauteur des bâtiments voisins pour le score — jamais pour le verdict.
                </p>
              </div>
            )}

            {/* ── 3) NOUVEAU TAG ── (bouton d'ouverture ; le panneau ci-dessous montre composition auto OU formulaire) */}
            <button
              type="button"
              className={`svv-cur-action${creationOuverte ? ' svv-cur-action--on' : ''}`}
              aria-pressed={creationOuverte}
              aria-expanded={creationOuverte}
              disabled={composition !== null}
              onClick={() => {
                setCleabsCible(null);
                setCreationOuverte((v) => !v);
              }}
            >
              + Nouveau tag
            </button>
            <div className="svv-cur-creation" ref={formulaireRef}>
              {composition !== null ? (
                // Zone de COMPOSITION (FC-20..29) : la fiche-en-création reste EN HAUT, hors liste triée.
                (() => {
                  const e = entiteSelectionnee;
                  const liees = e ? e.liaisons.filter((l) => l.actif && !l.detache) : []; // ordre created ↑ → [0] = mère
                  const nb = liees.length;
                  const cercle = !!e && e.etat === 'rouge' && !e.point;
                  return (
                    <div className="svv-cur-compo" role="group" aria-label="Composition du nouveau tag">
                      <div className="svv-cur-compo-tete">
                        <span
                          className={`svv-cur-dot${cercle ? ' svv-cur-dot--rouge' : ''}`}
                          style={cercle || !e ? undefined : { background: COULEUR_ETAT[e.etat] }}
                          aria-hidden="true"
                        />
                        <span className="svv-cur-compo-nom">{e?.nom ?? '(sans nom)'}</span>
                        {e && <span className="svv-cur-badge">{LIBELLE_FAMILLE[e.famille] ?? e.famille}</span>}
                      </div>
                      <p className="svv-cur-compo-invite">
                        {nb >= 1
                          ? 'Tag créé et rattaché. Sélectionne d’autres polygones sur la carte si besoin, puis clique « Terminer » — ou « Terminer » directement si c’est suffisant.'
                          : 'Sélectionne un ou plusieurs polygones sur la carte, puis clique « Terminer ».'}
                      </p>
                      <p className="svv-cur-compo-compteur">
                        {`${nb} polygone${nb > 1 ? 's' : ''} rattaché${nb > 1 ? 's' : ''}`}
                      </p>
                      {nb === 0 ? (
                        <p className="svv-cur-compo-vide">Aucun polygone rattaché — clique une emprise sur la carte.</p>
                      ) : (
                        <ul className="svv-cur-compo-liste">
                          {liees.map((l, i) => (
                            <li key={l.cleabs} className="svv-cur-compo-cleabs">
                              <code title={l.cleabs}>{cleabsCourt(l.cleabs)}</code>
                              {i === 0 && <span className="svv-cur-compo-mere">(initiale)</span>}
                              <button
                                type="button"
                                className="svv-cur-compo-x"
                                aria-label={`Détacher le polygone ${l.cleabs}`}
                                disabled={enEcriture}
                                onClick={() => e && void detacher(e.id, l.cleabs)}
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="svv-cur-form-actions">
                        <button type="button" className="svv-cur-btn svv-cur-btn--mini" onClick={fermerComposition}>
                          Terminer
                        </button>
                        <button
                          type="button"
                          className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                          onClick={fermerComposition}
                        >
                          Abandonner
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : creationOuverte ? (
                <form
                  className="svv-cur-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void soumettreCreation();
                  }}
                >
                  {cleabsCible && (
                    <p className="svv-cur-form-cible">
                      {'Bâtiment ciblé : '}
                      <code>{cleabsCible}</code>
                      {" — créez l'entité, puis cliquez l'emprise bleue pour la rattacher."}
                    </p>
                  )}
                  <label className="svv-cur-form-champ">
                    <span>Famille</span>
                    <select
                      value={formFamille}
                      onChange={(ev) => setFormFamille(ev.target.value as 'mondial' | 'mh' | 'inventaire')}
                    >
                      {FAMILLES.map((f) => (
                        <option key={f.cle} value={f.cle}>
                          {f.libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="svv-cur-form-champ">
                    <span>Nom (légende, optionnel)</span>
                    <input
                      type="text"
                      value={formNom}
                      placeholder="ex. Hôtel de ville"
                      onChange={(ev) => setFormNom(ev.target.value)}
                    />
                  </label>
                  <div className="svv-cur-form-actions">
                    <button type="submit" className="svv-cur-btn svv-cur-btn--mini" disabled={enEcriture}>
                      Créer
                    </button>
                    <button
                      type="button"
                      className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                      onClick={() => {
                        setCreationOuverte(false);
                        setCleabsCible(null);
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>

          {/* Compteurs par état (EX-4). */}
          <div className="svv-cur-compteurs" aria-label="Compteurs par état">
            {(['rouge', 'orange', 'vert'] as EtatEntite[]).map((etat) => (
              <span key={etat} className="svv-cur-compteur">
                <span className="svv-cur-dot" style={{ background: COULEUR_ETAT[etat] }} aria-hidden="true" />
                <strong>{compteurs[etat]}</strong>
                <span className="svv-cur-compteur-lib">{LIBELLE_ETAT[etat]}</span>
              </span>
            ))}
            {/* Légende du visuel cerclé (entité rouge SANS point GPS) — même puce que les lignes. */}
            <span className="svv-cur-compteur">
              <span className="svv-cur-dot svv-cur-dot--rouge" aria-hidden="true" />
              <span className="svv-cur-compteur-lib">Sans point GPS</span>
            </span>
          </div>

          {/* Recherche (EX-4). */}
          <label className="svv-cur-recherche">
            <span className="svv-cur-sr">Rechercher par nom ou référence</span>
            <input
              type="search"
              placeholder="Rechercher (nom ou référence)…"
              value={recherche}
              onChange={(ev) => setRecherche(ev.target.value)}
            />
          </label>

          {chargement && <p className="svv-cur-info">Chargement des entités…</p>}
          {erreurChargement && (
            <p className="svv-cur-info svv-cur-info--alerte" role="alert">
              {erreurChargement}
            </p>
          )}

          {!chargement && !erreurChargement && (
            <p className="svv-cur-legende-liste">
              {entitesFiltrees.length} entité(s){sansPoint > 0 ? ` · ${sansPoint} à placer` : ''}
            </p>
          )}

          <ul className="svv-cur-liste">
            {entitesFiltrees.map((e) => {
              const selectionne = e.id === selectionId;
              return (
                <li
                  key={e.id}
                  ref={selectionne ? itemActifRef : undefined}
                  className={`svv-cur-item${flashId === e.id ? ' svv-cur-item--flash' : ''}`}
                  data-selection={selectionne}
                  onDoubleClick={() => {
                    // HJ-55 : double-clic sur la fiche associée → referme son historique (retour carte pleine).
                    if (journal?.mode === 'entite' && journal.entiteId === e.id) setJournal(null);
                  }}
                >
                  <button
                    type="button"
                    className="svv-cur-item-btn"
                    aria-expanded={selectionne}
                    onClick={() => selectionner(e.id)}
                  >
                    <span
                      className={`svv-cur-dot${e.etat === 'rouge' && !e.point ? ' svv-cur-dot--rouge' : ''}`}
                      style={e.etat === 'rouge' && !e.point ? undefined : { background: COULEUR_ETAT[e.etat] }}
                      aria-hidden="true"
                    />
                    <span className="svv-cur-item-txt">
                      <span className="svv-cur-item-nom">
                        {e.origine === 'manuel' && (
                          <span className="svv-cur-star" title="Tag manuel" aria-label="Tag manuel">
                            ★
                          </span>
                        )}
                        {e.nom ?? e.refCode}
                      </span>
                      <span className="svv-cur-item-meta">
                        <span className="svv-cur-badge">{LIBELLE_FAMILLE[e.famille] ?? e.famille}</span>
                        <code>{e.refCode}</code>
                        {e.point === null && <span className="svv-cur-badge svv-cur-badge--warn">à placer</span>}
                        {e.corrige && <span className="svv-cur-badge svv-cur-badge--info">déplacé</span>}
                      </span>
                    </span>
                  </button>

                  {selectionne && (
                    <div className="svv-cur-detail">
                      {e.corrige && (
                        <button
                          type="button"
                          className="svv-cur-btn svv-cur-btn--outline"
                          disabled={enEcriture}
                          onClick={() => annulerDeplacement(e.id)}
                        >
                          Annuler le déplacement
                        </button>
                      )}

                      {/* Édition d'un tag MANUEL : renommer + supprimer (routes gardées `origine='manuel'`). */}
                      {e.origine === 'manuel' && (
                        <div className="svv-cur-edition-manuel">
                          <form
                            key={e.id}
                            className="svv-cur-renommer"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              const v = new FormData(ev.currentTarget).get('nom');
                              void renommerEntite(e.id, typeof v === 'string' ? v : '');
                            }}
                          >
                            <input
                              type="text"
                              name="nom"
                              defaultValue={e.nom ?? ''}
                              placeholder="Nom du tag (légende)"
                              aria-label="Renommer le tag"
                            />
                            <button type="submit" className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline" disabled={enEcriture}>
                              Renommer
                            </button>
                          </form>
                          {confirmSuppression ? (
                            <span className="svv-cur-confirm">
                              {`Supprimer « ${e.nom ?? 'sans nom'} » et ses ${e.liaisons.length} liaison(s) ?`}
                              <button
                                type="button"
                                className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--danger"
                                disabled={enEcriture}
                                onClick={() => supprimerEntite(e.id)}
                              >
                                Supprimer
                              </button>
                              <button
                                type="button"
                                className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                                onClick={() => setConfirmSuppression(false)}
                              >
                                Annuler
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--danger"
                              disabled={enEcriture}
                              onClick={() => setConfirmSuppression(true)}
                            >
                              Supprimer ce tag
                            </button>
                          )}
                        </div>
                      )}

                      <p className="svv-cur-detail-aide">
                        {e.point
                          ? 'Glissez le marqueur pour déplacer le point. Cliquez une emprise sur la carte pour rattacher (bleu) ou détacher (vert).'
                          : 'Entité sans point : la carte est centrée sur ses bâtiments. Cliquez une emprise VERTE pour détacher, une BLEUE pour rattacher.'}
                      </p>

                      <p className="svv-cur-detail-titre">Liaisons ({e.liaisons.length})</p>
                      {e.liaisons.length === 0 && <p className="svv-cur-info">Aucune liaison.</p>}
                      <ul className="svv-cur-liaisons">
                        {e.liaisons.map((l) => {
                          const actif = l.actif && !l.detache;
                          return (
                            <li key={l.cleabs} className="svv-cur-liaison" data-detache={l.detache}>
                              <div className="svv-cur-liaison-tete">
                                <code className="svv-cur-cleabs">{l.cleabs}</code>
                                <span className="svv-cur-tags">
                                  <span className="svv-cur-badge">{l.source}</span>
                                  {l.verifieManuellement && !l.detache && (
                                    <span className="svv-cur-badge svv-cur-badge--ok">vérifié</span>
                                  )}
                                  {l.detache && <span className="svv-cur-badge svv-cur-badge--warn">détaché</span>}
                                </span>
                              </div>
                              <div className="svv-cur-liaison-actions">
                                {actif && l.source === 'auto' && !l.verifieManuellement && (
                                  <button
                                    type="button"
                                    className="svv-cur-btn svv-cur-btn--mini"
                                    disabled={enEcriture}
                                    onClick={() => verifier(e.id, l.cleabs)}
                                  >
                                    Marquer vérifié
                                  </button>
                                )}
                                {actif &&
                                  (confirmDetach === l.cleabs ? (
                                    <span className="svv-cur-confirm">
                                      Détacher&nbsp;?
                                      <button
                                        type="button"
                                        className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--danger"
                                        disabled={enEcriture}
                                        onClick={() => detacher(e.id, l.cleabs)}
                                      >
                                        Détacher
                                      </button>
                                      <button
                                        type="button"
                                        className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                                        onClick={() => setConfirmDetach(null)}
                                      >
                                        Annuler
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                                      disabled={enEcriture}
                                      onClick={() => setConfirmDetach(l.cleabs)}
                                    >
                                      Détacher
                                    </button>
                                  ))}
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Pied de carte : Sortir (rien changé) ou Valider/Annuler (modifiée). Repli SANS scroll. */}
                      <div className="svv-cur-footer">
                        {modeFooter(estCarteModifiee(creeeEnSession, carteModifiee)) === 'sortir' ? (
                          <button type="button" className="svv-cur-btn svv-cur-btn--outline" onClick={refermerCarte}>
                            Sortir
                          </button>
                        ) : confirmValider ? (
                          <span className="svv-cur-confirm">
                            Enregistrer les modifications&nbsp;?
                            <button type="button" className="svv-cur-btn svv-cur-btn--mini" onClick={refermerCarte}>
                              Oui, enregistrer
                            </button>
                            <button
                              type="button"
                              className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                              onClick={() => setConfirmValider(false)}
                            >
                              Retour
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="svv-cur-btn"
                              disabled={enEcriture}
                              onClick={() => setConfirmValider(true)}
                            >
                              Valider
                            </button>
                            <button
                              type="button"
                              className="svv-cur-btn svv-cur-btn--danger"
                              disabled={enEcriture}
                              onClick={() => annulerEdition(e.id)}
                            >
                              Annuler
                            </button>
                          </>
                        )}
                        {/* Street View : nouvel onglet (aucune API/clé Google). Position = point propre, sinon
                            centroïde des emprises rattachées ; désactivé si aucune position dérivable. Indépendant
                            du journal/historique. */}
                        {(() => {
                          const pos = positionStreetView(e, emprisesLiees);
                          return (
                            <button
                              type="button"
                              className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline svv-cur-btn--pousse"
                              disabled={!pos}
                              title={
                                pos
                                  ? 'Ouvrir Street View dans un nouvel onglet'
                                  : 'Position inconnue — placez le point ou rattachez un bâtiment'
                              }
                              onClick={() => {
                                if (!pos) return;
                                // Recentrer la carte sur EXACTEMENT le point ouvert dans Street View (même { lat, lon }).
                                // Zoom aligné sur la branche « point » de recentrerSurEntite (Math.max(zoom, 17)).
                                const map = mapRef.current;
                                if (map) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17));
                                window.open(
                                  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${pos.lat},${pos.lon}`,
                                  '_blank',
                                  'noopener,noreferrer',
                                );
                              }}
                            >
                              Street View
                            </button>
                          );
                        })()}
                        {/* Volet A : bouton discret « Historique » (seulement si l'entité a ≥1 trace). */}
                        {e.aHistorique && (
                          <button
                            type="button"
                            className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline svv-cur-btn--histo"
                            aria-pressed={journal?.mode === 'entite' && journal.entiteId === e.id}
                            onClick={() =>
                              // Toggle franc : reclic sur l'entité déjà ouverte → ferme ; sinon ouvre/bascule vers elle.
                              setJournal((j) =>
                                j?.mode === 'entite' && j.entiteId === e.id ? null : { mode: 'entite', entiteId: e.id },
                              )
                            }
                          >
                            Historique
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="svv-cur-droite" data-journal={journalOuvert}>
          <div className="svv-cur-map">
            <div ref={conteneurRef} className="svv-cur-map-canvas" />
          </div>

          {journal && (
            <aside id="svv-cur-journal" className="svv-cur-journal" aria-label="Historique du journal">
              <div className="svv-cur-journal-tete">
                <strong className="svv-cur-journal-titre">
                  {journal.mode === 'global'
                    ? 'Historique — journal de curation'
                    : `Historique${journalEntite ? ` — ${journalEntite.nom_affiche}` : ''}`}
                </strong>
                <button type="button" className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline" onClick={() => setJournal(null)}>
                  Retour
                </button>
              </div>

              {journal.mode === 'global' && (
                <div className="svv-cur-journal-controles">
                  <div className="svv-cur-journal-filtres" role="group" aria-label="Filtrer par famille">
                    {(['toutes', 'inventaire', 'mh', 'mondial'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`svv-cur-btn svv-cur-btn--mini${journalFamille === f ? '' : ' svv-cur-btn--outline'}`}
                        aria-pressed={journalFamille === f}
                        onClick={() => {
                          setJournalFamille(f);
                          setJournalOffset(0);
                        }}
                      >
                        {f === 'toutes' ? 'Toutes' : (LIBELLE_FAMILLE[f] ?? f)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                    onClick={() => {
                      setJournalOrdre((o) => (o === 'desc' ? 'asc' : 'desc'));
                      setJournalOffset(0);
                    }}
                  >
                    {journalOrdre === 'desc' ? 'Récent → ancien' : 'Ancien → récent'}
                  </button>
                </div>
              )}

              <div className="svv-cur-journal-corps">
                {journalChargement && <p className="svv-cur-info">Chargement…</p>}
                {journalErreur && <p className="svv-cur-info svv-cur-journal-erreur">{journalErreur}</p>}
                {!journalChargement && !journalErreur && journalLignes.length === 0 && (
                  <p className="svv-cur-info">{journal.mode === 'global' ? 'Aucune entrée.' : 'Aucune trace.'}</p>
                )}
                {!journalChargement && !journalErreur && journalLignes.length > 0 && (
                  <ul className="svv-cur-journal-liste">
                    {journalLignes.map((l) => {
                      const cliquable = journal.mode === 'global' && !l.supprimee;
                      const sess = libelleSession(l); // libellé humain de session (jamais l'UUID brut)
                      return (
                        <li
                          key={l.id}
                          className={`svv-cur-journal-ligne${cliquable ? ' svv-cur-journal-ligne--clic' : ''}`}
                          {...(cliquable
                            ? { role: 'button' as const, tabIndex: 0, onClick: () => void recentrerSurEntite(l.entite_id) }
                            : {})}
                        >
                          <span className="svv-cur-journal-lib" title={l.cleabs ?? undefined}>
                            {journal.mode === 'global' && <span className="svv-cur-journal-nom">{nomAffiche(l)}</span>}
                            {libelleAction(l)}
                          </span>
                          <span className="svv-cur-journal-meta">
                            <span className={`svv-cur-badge svv-cur-badge--fam-${l.famille_affiche}`}>
                              {LIBELLE_FAMILLE[l.famille_affiche] ?? l.famille_affiche}
                            </span>
                            <time className="svv-cur-journal-ts" dateTime={horodatageTitle(l.ts)} title={horodatageTitle(l.ts)}>
                              {formaterHorodatage(l.ts)}
                            </time>
                          </span>
                          {/* Session (rattachable : même libellé = même session). Gris discret si inconnue. */}
                          <span className={`svv-cur-journal-session${sess.connue ? '' : ' svv-cur-journal-session--inconnue'}`}>
                            {sess.texte}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {journal.mode === 'global' && !journalChargement && !journalErreur && journalTotal > 0 && (
                <div className="svv-cur-journal-pagination">
                  <button
                    type="button"
                    className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                    disabled={journalOffset === 0}
                    onClick={() => setJournalOffset((o) => Math.max(0, o - JOURNAL_LIMIT))}
                  >
                    Précédent
                  </button>
                  <span className="svv-cur-journal-pos">
                    {`${journalOffset + 1}–${Math.min(journalOffset + journalLignes.length, journalTotal)} sur ${journalTotal}`}
                  </span>
                  <button
                    type="button"
                    className="svv-cur-btn svv-cur-btn--mini svv-cur-btn--outline"
                    disabled={journalOffset + JOURNAL_LIMIT >= journalTotal}
                    onClick={() => setJournalOffset((o) => o + JOURNAL_LIMIT)}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.svv-cur-wrap{display:flex;flex-direction:column;gap:.6rem;max-width:1100px}
.svv-cur-wrap code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82em;background:var(--color-svv-field);padding:.05rem .3rem;border-radius:.3rem;color:var(--color-svv-ink);word-break:break-all}

.svv-cur-toast{padding:.55rem .75rem;border-radius:.55rem;font-size:.85rem;font-weight:600}
.svv-cur-toast--ok{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-cur-toast--erreur{background:#fdecec;color:var(--color-svv-red-dark);border:1px solid #f3c9c9}

.svv-cur{display:flex;flex-direction:column;gap:.6rem;height:calc(100dvh - 210px);min-height:520px}
/* Zone droite = carte + journal empilés (colonne). Reprend le rôle flex de l'ex-.svv-cur-map. */
.svv-cur-droite{order:-1;flex:0 0 46vh;min-height:260px;display:flex;flex-direction:column;gap:.4rem;overflow:hidden}
.svv-cur-map{flex:1 1 auto;min-height:0;border:1px solid var(--color-svv-line);border-radius:.7rem;overflow:hidden;background:var(--color-svv-field)}
.svv-cur-map-canvas{width:100%;height:100%}
/* Journal empilé sous la carte (volet A / B). */
.svv-cur-journal{flex:0 0 45%;min-height:0;display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.7rem;overflow:hidden;background:#fff;transition:opacity .15s ease}
@media (prefers-reduced-motion: reduce){.svv-cur-journal{transition:none}}
.svv-cur-journal-tete{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem .55rem;border-bottom:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.svv-cur-journal-titre{font-size:.85rem;font-weight:800;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svv-cur-journal-corps{flex:1 1 auto;min-height:0;overflow:auto;padding:.35rem .55rem}
.svv-cur-journal-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.svv-cur-journal-ligne{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.2rem .5rem;padding:.35rem .1rem;border-bottom:1px solid var(--color-svv-line)}
.svv-cur-journal-lib{font-size:.82rem;color:var(--color-svv-ink)}
.svv-cur-journal-meta{display:inline-flex;align-items:center;gap:.4rem;flex:0 0 auto}
.svv-cur-journal-ts{font-size:.72rem;color:var(--color-svv-muted);white-space:nowrap}
.svv-cur-journal-session{flex:0 0 100%;font-size:.68rem;color:var(--color-svv-muted)}
.svv-cur-journal-session--inconnue{font-style:italic;opacity:.7}
.svv-cur-journal-erreur{color:var(--color-svv-red-dark)}
.svv-cur-journal-controles{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.35rem;padding:.35rem .55rem;border-bottom:1px solid var(--color-svv-line)}
.svv-cur-journal-filtres{display:inline-flex;flex-wrap:wrap;gap:.25rem}
.svv-cur-journal-nom{font-weight:700;color:var(--color-svv-ink);margin-right:.3rem}
.svv-cur-journal-ligne--clic{cursor:pointer}
.svv-cur-journal-ligne--clic:hover{background:var(--color-svv-field)}
.svv-cur-journal-pagination{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.4rem .55rem;border-top:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.svv-cur-journal-pos{font-size:.75rem;color:var(--color-svv-muted);white-space:nowrap}
.svv-cur-badge--fam-mh{background:#eef1ff;color:#3949ab}
.svv-cur-badge--fam-inventaire{background:#e8f5ec;color:#2e7d32}
.svv-cur-badge--fam-mondial{background:#fff6df;color:#8a6d00}
.svv-cur-badge--fam-inconnue{background:var(--color-svv-field);color:var(--color-svv-gray)}
.svv-cur-btn--histo{margin-left:auto}
/* Street View : 2e marge auto → l'espace libre se partage à parts égales avant Street View et avant
   Historique, ce qui centre Street View entre « Sortir » (gauche) et « Historique » (droite). */
.svv-cur-btn--pousse{margin-left:auto}
.svv-cur-panel{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:.55rem;padding-right:.15rem}

.svv-cur-creation{display:flex;flex-direction:column}
/* Accordéon des 3 actions (Filtres / Infos bâtiment / Nouveau tag), EMPILÉES pleine largeur ; chaque panneau se
   déplie JUSTE sous son bouton. Boutons en TRAME GRISE ; état actif = contour rouge (aucun bleu ; l'état est aussi
   porté par aria-pressed et, pour Infos, la forme ●/○ + mot). Cible tactile ≥44px. */
.svv-cur-accordeon{display:flex;flex-direction:column;gap:.4rem}
.svv-cur-action{appearance:none;display:flex;width:100%;align-items:center;justify-content:center;gap:.4rem;min-height:44px;padding:.4rem .7rem;border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700;font-size:.82rem;line-height:1.2;cursor:pointer;text-align:center}
.svv-cur-action--on{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.svv-cur-action:disabled{opacity:.5;cursor:default}
.svv-cur-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Panneau « Infos bâtiment » déplié : TRAME GRISE, cohérente avec les autres pages admin. */
.svv-cur-panneau{display:flex;flex-direction:column;gap:.4rem;border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.5rem .6rem;background:var(--color-svv-field)}
/* Panneau FILTRES déplié : AUCUNE trame commune — juste un gap. Chacun des 3 sous-blocs (.svv-cur-filtres) a SA
   PROPRE trame grise (3 cartouches distincts détachés par le gap). */
.svv-cur-panneau-filtres{display:flex;flex-direction:column;gap:.4rem}
.svv-cur-form{display:flex;flex-direction:column;gap:.45rem;border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.6rem;background:var(--color-svv-field)}
.svv-cur-form-champ{display:flex;flex-direction:column;gap:.2rem;font-size:.8rem;font-weight:600;color:var(--color-svv-ink)}
.svv-cur-form-champ select,.svv-cur-form-champ input{width:100%;box-sizing:border-box;padding:.45rem .55rem;border:1px solid var(--color-svv-line);border-radius:.5rem;background:#fff;color:var(--color-svv-ink);font-size:.9rem;font-family:inherit;font-weight:500;min-height:44px}
.svv-cur-form-actions{display:flex;gap:.4rem}
.svv-cur-compo{display:flex;flex-direction:column;gap:.4rem;border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.6rem;background:var(--color-svv-field)}
.svv-cur-compo-tete{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.svv-cur-compo-nom{font-weight:800;color:var(--color-svv-ink)}
.svv-cur-compo-invite{margin:0;font-size:.82rem;color:var(--color-svv-muted);line-height:1.4}
.svv-cur-compo-compteur{margin:0;font-size:.78rem;font-weight:700;color:var(--color-svv-ink)}
.svv-cur-compo-vide{margin:0;font-size:.78rem;color:var(--color-svv-muted);font-style:italic}
.svv-cur-compo-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.svv-cur-compo-cleabs{display:flex;align-items:center;gap:.4rem;padding:.2rem .1rem;border-bottom:1px solid var(--color-svv-line)}
.svv-cur-compo-cleabs code{font-size:.75rem}
.svv-cur-compo-mere{font-size:.7rem;font-weight:700;color:var(--color-svv-green-ink);white-space:nowrap}
.svv-cur-compo-x{margin-left:auto;appearance:none;border:1px solid var(--color-svv-line);background:#fff;color:var(--color-svv-red-dark);font-size:.8rem;line-height:1;width:24px;height:24px;border-radius:.4rem;cursor:pointer}
.svv-cur-compo-x:disabled{opacity:.5;cursor:default}
.svv-cur-form-cible{margin:0;font-size:.78rem;line-height:1.35;color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);border-radius:.45rem;padding:.4rem .5rem}
.svv-cur-filtres{border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.5rem .6rem;margin:0;display:flex;flex-wrap:wrap;gap:.35rem .7rem;background:var(--color-svv-field)}
.svv-cur-legende{font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted);padding:0;margin-right:.3rem}
.svv-cur-check{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;font-size:.85rem;color:var(--color-svv-ink);font-weight:600;cursor:pointer}
.svv-cur-check input{width:18px;height:18px;accent-color:var(--color-svv-red)}

/* « Infos bâtiment » est désormais un bouton d'accordéon standard (.svv-cur-action) ; son aide s'affiche dans un
   panneau .svv-cur-panneau. L'état (activé/masqué) est porté par aria-pressed + le contour rouge + l'apparition du
   panneau — comme Filtres / Nouveau tag. */
.svv-cur-bulle-aide-txt{margin:0;font-size:.72rem;line-height:1.35;color:var(--color-svv-muted)}
/* Bulle Leaflet (popup) : sobre, sans fade sous prefers-reduced-motion. Sélecteur à 3 classes
   (.leaflet-fade-anim .svv-cur-bulle-popup.leaflet-popup) → bat le défaut Leaflet indépendamment de
   l'ordre d'import des feuilles de style. */
.svv-cur-bulle{font-size:.82rem;font-weight:600;color:var(--color-svv-ink)}
.svv-cur-bulle-l{display:block}
.svv-cur-bulle-l+.svv-cur-bulle-l{margin-top:.1rem;font-weight:500;color:var(--color-svv-muted)}
@media (prefers-reduced-motion:reduce){.leaflet-fade-anim .svv-cur-bulle-popup.leaflet-popup{transition:none}}

.svv-cur-compteurs{display:flex;flex-wrap:wrap;gap:.4rem}
.svv-cur-compteur{display:inline-flex;align-items:center;gap:.3rem;background:var(--color-svv-field);border-radius:999px;padding:.25rem .55rem;font-size:.8rem;color:var(--color-svv-gray)}
.svv-cur-compteur strong{color:var(--color-svv-ink)}
.svv-cur-compteur-lib{color:var(--color-svv-muted)}
.svv-cur-dot{display:inline-block;width:11px;height:11px;border-radius:999px;flex:0 0 auto;border:1px solid rgba(0,0,0,.15)}
.svv-cur-dot--rouge{background:#fff;border:3px solid #a30402;box-sizing:border-box;width:13px;height:13px}

.svv-cur-recherche input{width:100%;box-sizing:border-box;padding:.5rem .6rem;border:1px solid var(--color-svv-line);border-radius:.5rem;background:#fff;color:var(--color-svv-ink);font-size:.95rem;font-family:inherit;min-height:44px}
.svv-cur-recherche input:focus{outline:2px solid var(--color-svv-red);outline-offset:0}
.svv-cur-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

.svv-cur-info{margin:.2rem 0;font-size:.85rem;color:var(--color-svv-muted)}
.svv-cur-info--alerte{color:var(--color-svv-red);font-weight:600}
.svv-cur-legende-liste{margin:0;font-size:.75rem;color:var(--color-svv-muted);font-weight:600}

.svv-cur-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.svv-cur-item{border:1px solid var(--color-svv-line);border-radius:.55rem;background:#fff;overflow:hidden}
.svv-cur-item[data-selection="true"]{border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red)}
.svv-cur-item--flash{animation:svv-cur-flash 1.2s ease-out}
@keyframes svv-cur-flash{from{background:var(--color-svv-green-soft)}to{background:#fff}}
.svv-cur-item-btn{display:flex;align-items:flex-start;gap:.5rem;width:100%;text-align:left;background:none;border:0;padding:.55rem .6rem;cursor:pointer;min-height:44px}
.svv-cur-item-btn:hover{background:var(--color-svv-field)}
.svv-cur-item-btn .svv-cur-dot{margin-top:.2rem}
.svv-cur-item-txt{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.svv-cur-item-nom{font-weight:700;color:var(--color-svv-ink);font-size:.88rem;line-height:1.3;word-break:break-word}
.svv-cur-star{color:#e0a400;margin-right:.25rem}
.svv-cur-edition-manuel{display:flex;flex-direction:column;gap:.4rem;border:1px solid var(--color-svv-line);border-radius:.5rem;padding:.5rem;background:var(--color-svv-field)}
.svv-cur-renommer{display:flex;gap:.35rem;align-items:center}
.svv-cur-renommer input{flex:1;min-width:0;box-sizing:border-box;padding:.4rem .5rem;border:1px solid var(--color-svv-line);border-radius:.5rem;background:#fff;color:var(--color-svv-ink);font-size:.85rem;font-family:inherit;min-height:36px}
.svv-cur-item-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem}
.svv-cur-badge{display:inline-block;font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .45rem;background:var(--color-svv-field);color:var(--color-svv-gray);white-space:nowrap}
.svv-cur-badge--warn{background:#fff4e0;color:#8a5a00}
.svv-cur-badge--info{background:#e6eefb;color:#2c4d84}
.svv-cur-badge--ok{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}

.svv-cur-detail{border-top:1px solid var(--color-svv-line);padding:.55rem .6rem;display:flex;flex-direction:column;gap:.5rem;background:var(--color-svv-field)}
.svv-cur-detail-aide{margin:0;font-size:.78rem;color:var(--color-svv-muted);line-height:1.4}
.svv-cur-footer{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;border-top:1px solid var(--color-svv-line);padding-top:.5rem;margin-top:.1rem}
.svv-cur-detail-titre{margin:0;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.svv-cur-liaisons{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.svv-cur-liaison{border:1px solid var(--color-svv-line);border-radius:.5rem;background:#fff;padding:.4rem .5rem;display:flex;flex-direction:column;gap:.35rem}
.svv-cur-liaison[data-detache="true"]{opacity:.7}
.svv-cur-liaison-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.3rem}
.svv-cur-cleabs{font-size:.72rem}
.svv-cur-tags{display:inline-flex;flex-wrap:wrap;gap:.25rem}
.svv-cur-liaison-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem}
.svv-cur-confirm{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.3rem;font-size:.78rem;font-weight:600;color:var(--color-svv-red-dark)}

.svv-cur-btn{appearance:none;border:1px solid var(--color-svv-red);background:var(--color-svv-red);color:#fff;font-weight:700;font-size:.8rem;padding:.4rem .7rem;border-radius:.5rem;cursor:pointer;line-height:1.2;min-height:36px}
.svv-cur-btn:disabled{opacity:.6;cursor:progress}
.svv-cur-btn--mini{padding:.3rem .55rem;font-size:.75rem;min-height:34px}
.svv-cur-btn--outline{background:#fff;color:var(--color-svv-ink);border-color:#d7dbe1}
.svv-cur-btn--danger{background:var(--color-svv-red);border-color:var(--color-svv-red);color:#fff}

.svv-cur-pin{background:transparent;border:0}
.svv-cur-star-pin{background:transparent;border:0}

@media (min-width:768px){
  .svv-cur{flex-direction:row}
  .svv-cur-droite{order:0;flex:1 1 auto;min-height:0;height:100%}
  .svv-cur-panel{flex:0 0 350px;height:100%}
  /* Split desktop : carte 55 % (hauteur non nulle) / journal 45 %. */
  .svv-cur-droite[data-journal="true"] .svv-cur-map{flex:0 0 55%}
  .svv-cur-droite[data-journal="true"] .svv-cur-journal{flex:0 0 45%}
}

/* Mobile : journal plein, carte masquée (un split 45 % donnerait une carte ~25vh illisible — décision figée). */
@media (max-width:767px){
  .svv-cur-droite[data-journal="true"] .svv-cur-map{display:none}
  .svv-cur-droite[data-journal="true"] .svv-cur-journal{flex:1 1 auto}
}

@media (prefers-reduced-motion:reduce){
  .svv-cur-item-btn{transition:none}
  .svv-cur-item--flash{animation:none}
  .svv-cur-journal{transition:none}
}
`;
