'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
}

interface Entite {
  id: number;
  famille: string;
  refCode: string;
  nom: string | null;
  statut: string | null;
  point: PointGeoJSON | null;
  corrige: boolean;
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

const LIBELLE_FAMILLE: Record<string, string> = {
  mondial: 'Mondial',
  mh: 'MH',
  inventaire: 'Inventaire',
};

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
  const [recherche, setRecherche] = useState('');
  const [selectionId, setSelectionId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ texte: string; type: 'ok' | 'erreur' } | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);
  const [emprises, setEmprises] = useState<Emprise[]>([]);
  const [emprisesLiees, setEmprisesLiees] = useState<Emprise[]>([]);
  const [enEcriture, setEnEcriture] = useState(false);

  // Refs Leaflet (map créée une seule fois ; couches réutilisées).
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const coucheMarqueursRef = useRef<L.LayerGroup | null>(null);
  const coucheEmprisesRef = useRef<L.LayerGroup | null>(null);
  const ajusteRef = useRef(false); // fitBounds une seule fois (jamais après un rechargement)
  const selectionIdRef = useRef<number | null>(null); // miroir pour le handler `moveend`

  // Miroir de la sélection (lu par le handler `moveend` attaché une seule fois).
  useEffect(() => {
    selectionIdRef.current = selectionId;
  }, [selectionId]);

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

  // ── Création de la carte (une seule fois). ───────────────────────────────────
  useEffect(() => {
    if (!conteneurRef.current || mapRef.current) return;
    const map = L.map(conteneurRef.current, { zoomControl: true }).setView([48.856, 2.352], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    coucheMarqueursRef.current = L.layerGroup().addTo(map);
    coucheEmprisesRef.current = L.layerGroup().addTo(map);

    // Re-charge les emprises quand la vue change et qu'une entité est sélectionnée.
    map.on('moveend', () => {
      if (selectionIdRef.current !== null) void chargerEmprises();
    });

    const surResize = () => map.invalidateSize();
    window.addEventListener('resize', surResize);
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      window.removeEventListener('resize', surResize);
      map.remove();
      mapRef.current = null;
      coucheMarqueursRef.current = null;
      coucheEmprisesRef.current = null;
    };
  }, [chargerEmprises]);

  // ── Sélection d'une entité (centre la carte + charge ses emprises via l'effet). ─
  const selectionner = useCallback(
    (id: number) => {
      setSelectionId(id);
      setConfirmDetach(null);
      coucheEmprisesRef.current?.clearLayers(); // évite un flash des emprises de l'entité précédente
      const e = entites?.find((x) => x.id === id);
      const map = mapRef.current;
      if (e?.point && map) {
        const [lon, lat] = e.point.coordinates;
        map.setView([lat, lon], Math.max(map.getZoom(), 17));
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
      await recharger();
    },
    [recharger, signaler],
  );

  // ── Entités affichables sur la carte (point non nul + famille visible). ──────
  const entitesAvecPoint = useMemo(
    () => (entites ?? []).filter((e) => e.point !== null && famillesVisibles[e.famille] !== false),
    [entites, famillesVisibles],
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
      .filter((e) => famillesVisibles[e.famille] !== false)
      .filter((e) => {
        if (!q) return true;
        return (e.nom ?? '').toLowerCase().includes(q) || e.refCode.toLowerCase().includes(q);
      });
  }, [entites, famillesVisibles, recherche]);

  const compteurs: Compteurs = useMemo(() => {
    const base = (entites ?? []).filter((e) => famillesVisibles[e.famille] !== false);
    return {
      rouge: base.filter((e) => e.etat === 'rouge').length,
      orange: base.filter((e) => e.etat === 'orange').length,
      vert: base.filter((e) => e.etat === 'vert').length,
    };
  }, [entites, famillesVisibles]);

  const sansPoint = useMemo(
    () => entitesFiltrees.filter((e) => e.point === null).length,
    [entitesFiltrees],
  );

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="svv-cur-wrap">
      <style>{CSS}</style>

      <header className="svv-cur-head">
        <h1 className="svv-cur-title">Curation patrimoine</h1>
        <p className="svv-cur-sub">
          Corriger les rattachements des 3 familles (MH / Inventaire / Mondial) : déplacer un point
          (réversible, borné), rattacher / détacher / composer des emprises <code>bdtopo_batiment</code>.
        </p>
      </header>

      {message && (
        <div className={`svv-cur-toast svv-cur-toast--${message.type}`} role="status" aria-live="polite">
          {message.texte}
        </div>
      )}

      <div className="svv-cur">
        <section className="svv-cur-panel" aria-label="Liste et filtres des entités">
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
          </fieldset>

          {/* Compteurs par état (EX-4). */}
          <div className="svv-cur-compteurs" aria-label="Compteurs par état">
            {(['rouge', 'orange', 'vert'] as EtatEntite[]).map((etat) => (
              <span key={etat} className="svv-cur-compteur">
                <span className="svv-cur-dot" style={{ background: COULEUR_ETAT[etat] }} aria-hidden="true" />
                <strong>{compteurs[etat]}</strong>
                <span className="svv-cur-compteur-lib">{LIBELLE_ETAT[etat]}</span>
              </span>
            ))}
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
                <li key={e.id} className="svv-cur-item" data-selection={selectionne}>
                  <button
                    type="button"
                    className="svv-cur-item-btn"
                    aria-expanded={selectionne}
                    onClick={() => selectionner(e.id)}
                  >
                    <span className="svv-cur-dot" style={{ background: COULEUR_ETAT[e.etat] }} aria-hidden="true" />
                    <span className="svv-cur-item-txt">
                      <span className="svv-cur-item-nom">{e.nom ?? e.refCode}</span>
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

                      <p className="svv-cur-detail-aide">
                        {e.point
                          ? 'Glissez le marqueur pour déplacer le point. Cliquez une emprise sur la carte pour rattacher (bleu) ou détacher (vert).'
                          : 'Entité sans point : cliquez une emprise sur la carte pour la rattacher.'}
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="svv-cur-map">
          <div ref={conteneurRef} className="svv-cur-map-canvas" />
        </div>
      </div>
    </div>
  );
}

const CSS = `
.svv-cur-wrap{display:flex;flex-direction:column;gap:.6rem;max-width:1100px}
.svv-cur-head{margin-bottom:.1rem}
.svv-cur-title{font-size:1.35rem;font-weight:800;color:var(--color-svv-ink);margin:0 0 4px}
.svv-cur-sub{color:var(--color-svv-muted);font-size:.88rem;line-height:1.45;margin:0}
.svv-cur-wrap code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82em;background:var(--color-svv-field);padding:.05rem .3rem;border-radius:.3rem;color:var(--color-svv-ink);word-break:break-all}

.svv-cur-toast{padding:.55rem .75rem;border-radius:.55rem;font-size:.85rem;font-weight:600}
.svv-cur-toast--ok{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-cur-toast--erreur{background:#fdecec;color:var(--color-svv-red-dark);border:1px solid #f3c9c9}

.svv-cur{display:flex;flex-direction:column;gap:.6rem;height:calc(100dvh - 210px);min-height:520px}
.svv-cur-map{order:-1;flex:0 0 46vh;min-height:260px;border:1px solid var(--color-svv-line);border-radius:.7rem;overflow:hidden;background:var(--color-svv-field)}
.svv-cur-map-canvas{width:100%;height:100%}
.svv-cur-panel{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:.55rem;padding-right:.15rem}

.svv-cur-filtres{border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.5rem .6rem;margin:0;display:flex;flex-wrap:wrap;gap:.35rem .7rem}
.svv-cur-legende{font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted);padding:0;margin-right:.3rem}
.svv-cur-check{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;font-size:.85rem;color:var(--color-svv-ink);font-weight:600;cursor:pointer}
.svv-cur-check input{width:18px;height:18px;accent-color:var(--color-svv-red)}

.svv-cur-compteurs{display:flex;flex-wrap:wrap;gap:.4rem}
.svv-cur-compteur{display:inline-flex;align-items:center;gap:.3rem;background:var(--color-svv-field);border-radius:999px;padding:.25rem .55rem;font-size:.8rem;color:var(--color-svv-gray)}
.svv-cur-compteur strong{color:var(--color-svv-ink)}
.svv-cur-compteur-lib{color:var(--color-svv-muted)}
.svv-cur-dot{display:inline-block;width:11px;height:11px;border-radius:999px;flex:0 0 auto;border:1px solid rgba(0,0,0,.15)}

.svv-cur-recherche input{width:100%;box-sizing:border-box;padding:.5rem .6rem;border:1px solid var(--color-svv-line);border-radius:.5rem;background:#fff;color:var(--color-svv-ink);font-size:.95rem;font-family:inherit;min-height:44px}
.svv-cur-recherche input:focus{outline:2px solid var(--color-svv-red);outline-offset:0}
.svv-cur-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

.svv-cur-info{margin:.2rem 0;font-size:.85rem;color:var(--color-svv-muted)}
.svv-cur-info--alerte{color:var(--color-svv-red);font-weight:600}
.svv-cur-legende-liste{margin:0;font-size:.75rem;color:var(--color-svv-muted);font-weight:600}

.svv-cur-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.svv-cur-item{border:1px solid var(--color-svv-line);border-radius:.55rem;background:#fff;overflow:hidden}
.svv-cur-item[data-selection="true"]{border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red)}
.svv-cur-item-btn{display:flex;align-items:flex-start;gap:.5rem;width:100%;text-align:left;background:none;border:0;padding:.55rem .6rem;cursor:pointer;min-height:44px}
.svv-cur-item-btn:hover{background:var(--color-svv-field)}
.svv-cur-item-btn .svv-cur-dot{margin-top:.2rem}
.svv-cur-item-txt{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.svv-cur-item-nom{font-weight:700;color:var(--color-svv-ink);font-size:.88rem;line-height:1.3;word-break:break-word}
.svv-cur-item-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem}
.svv-cur-badge{display:inline-block;font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .45rem;background:var(--color-svv-field);color:var(--color-svv-gray);white-space:nowrap}
.svv-cur-badge--warn{background:#fff4e0;color:#8a5a00}
.svv-cur-badge--info{background:#e6eefb;color:#2c4d84}
.svv-cur-badge--ok{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}

.svv-cur-detail{border-top:1px solid var(--color-svv-line);padding:.55rem .6rem;display:flex;flex-direction:column;gap:.5rem;background:var(--color-svv-field)}
.svv-cur-detail-aide{margin:0;font-size:.78rem;color:var(--color-svv-muted);line-height:1.4}
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

@media (min-width:768px){
  .svv-cur{flex-direction:row}
  .svv-cur-map{order:0;flex:1 1 auto;height:100%}
  .svv-cur-panel{flex:0 0 350px;height:100%}
}

@media (prefers-reduced-motion:reduce){
  .svv-cur-item-btn{transition:none}
}
`;
