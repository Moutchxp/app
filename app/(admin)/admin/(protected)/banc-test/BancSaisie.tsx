"use client";

/**
 * Banc d'essai M5 · Lot 3 — Saisie internaute (BE-30..BE-36).
 *
 * Formulaire FRONT-ONLY qui produit un objet de paramètres alimentant `analyserAdresse` (mêmes champs que
 * `ParametresAnalyse` : point, azimutPrincipalDeg, etage, hauteurSousPlafondM, dernierEtage, mode) — SANS
 * transformation cachée, SANS toucher le moteur. L'EXÉCUTION (double run actif/test + comparaison) est le
 * Lot 5 : ici on assemble et on valide seulement.
 *
 * Réutilise tel quel : AdresseAutocomplete (BAN), MapSelector/MapContent (placement + recentrage), FaisceauMap
 * (azimut, en mode 360° LIBRE via la prop `margeRotDeg`). La validité du point passe par /api/origine
 * (validerOrigine — bâtiment couvert LiDAR, PAS de bypass). Aucune écriture DB.
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdresseAutocomplete, type SuggestionAdresse } from "../../../../components/AdresseAutocomplete";
import MapSelector from "../../../../MapSelector";
import {
  hauteurVision,
  HAUTEUR_SOUS_PLAFOND_DEFAUT_M,
  HAUTEUR_SOUS_PLAFOND_MIN_M,
  HAUTEUR_SOUS_PLAFOND_MAX_M,
  HAUTEUR_SOUS_PLAFOND_PAS_M,
  type ModeOrigine,
} from "../../../../lib/svv/config";

// FaisceauMap = Leaflet impératif (ssr:false, comme dans le parcours public).
const FaisceauMap = dynamic(() => import("../../../../FaisceauMap"), { ssr: false });

// Centre par défaut de la carte tant qu'aucun point n'est choisi (Paris) — jamais le point de calcul.
const CENTRE_DEFAUT = { lat: 48.8566, lon: 2.3522 };

type StatutOrigine = "VALIDE" | "HORS_BATIMENT" | "SANS_BATIMENT";
interface ValidationPoint {
  statut: StatutOrigine;
  message: string;
}

/** Paramètres d'entrée assemblés (forme de `ParametresAnalyse`, hors `profil`/`paysage`/`ventilation`). */
export interface ParametresSaisie {
  point: { lat: number; lon: number };
  azimutPrincipalDeg: number;
  etage: number;
  hauteurSousPlafondM: number;
  dernierEtage: boolean;
  mode: ModeOrigine;
}

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
const arrondi1 = (v: number): number => Math.round(v * 10) / 10; // pas de 0,10 (affichage stepper, pas un calcul de score)

/**
 * Parse une saisie « lat, lon » WGS84 en décimal. Le POINT décimal est EXIGÉ : une virgule décimale (piège FR,
 * ex. « 48,9044 ») rend le séparateur ambigu → on REJETTE proprement avec un message clair plutôt que deviner.
 * Séparateur accepté : virgule (« 48.9044, 2.2701 ») ou espace (« 48.9044 2.2701 »). Bornes de plausibilité =
 * France métropolitaine (attrape aussi une inversion lat/lon). `validerOrigine` reste la garde réelle en aval.
 */
function parseCoords(raw: string): { lat: number; lon: number } | { erreur: string } {
  const s = raw.trim();
  if (!s) return { erreur: "Saisissez des coordonnées (ex. 48.9044, 2.2701)." };
  const parts = s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  let latStr: string;
  let lonStr: string;
  if (parts.length === 2) {
    [latStr, lonStr] = parts;
  } else if (parts.length === 1) {
    const sp = parts[0].split(/\s+/);
    if (sp.length !== 2) return { erreur: "Format attendu : lat, lon (ex. 48.9044, 2.2701)." };
    [latStr, lonStr] = sp;
  } else {
    return { erreur: "Format ambigu : utilisez le POINT décimal, ex. 48.9044, 2.2701." };
  }
  const numRe = /^-?\d+(\.\d+)?$/;
  if (!numRe.test(latStr) || !numRe.test(lonStr)) {
    return { erreur: "Coordonnées invalides : point décimal attendu, ex. 48.9044, 2.2701." };
  }
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) {
    return { erreur: "Hors zone : latitude ~[41 ; 52], longitude ~[-6 ; 10] (France métropolitaine)." };
  }
  return { lat, lon };
}

// Forme (allégée) de la réponse /api/admin/banc-comparer — on ne lit ici que le score client + méta.
type ScoreLite = {
  total: number;
  libelle: "EXCEPTIONNELLE" | "EXCELLENTE" | null;
  scorePartiel: boolean;
  famille1?: { total?: number };
  famille2?: { total?: number };
};
type RunLite = { score: ScoreLite; verdict: string };
type ComparaisonLite = {
  ok: boolean;
  message?: string;
  actif?: RunLite;
  test?: RunLite;
  delta?: number;
  verdictIdentique?: boolean;
  ecarts?: { total: number };
};

/** Texte du libellé de score (la clé enum vit côté moteur ; le texte est une préoccupation UI). */
function libelleTexte(l: ScoreLite["libelle"]): string {
  if (l === "EXCEPTIONNELLE") return "Vue exceptionnelle";
  if (l === "EXCELLENTE") return "Excellente vue";
  return "—";
}

export default function BancSaisie() {
  const [adresse, setAdresse] = useState("");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [azimut, setAzimut] = useState(0);
  const [etage, setEtage] = useState(0);
  const [hauteurSousPlafondM, setHauteurSousPlafondM] = useState(HAUTEUR_SOUS_PLAFOND_DEFAUT_M);
  const [dernierEtage, setDernierEtage] = useState(false);
  const [mode, setMode] = useState<ModeOrigine>("semi_auto");
  const [validation, setValidation] = useState<ValidationPoint | null>(null);
  const [validating, setValidating] = useState(false);
  // Point recalé sur la façade (semi_auto) renvoyé par validerOrigine → pilote le flyTo de MapContent.
  const [snappe, setSnappe] = useState<{ lat: number; lon: number } | null>(null);
  // Saute UN reverse-geocode juste après une sélection d'adresse (ne pas écraser le label choisi).
  const ignoreReverseRef = useRef(false);
  // Coordonnées du centre EN TEMPS RÉEL (event `move`) — affichage seul, throttlé à une frame.
  const [coordsLive, setCoordsLive] = useState<{ lat: number; lon: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const dernierCentreRef = useRef<{ lat: number; lon: number } | null>(null);
  // Saisie directe de coordonnées GPS (alternative à l'adresse).
  const [coordsInput, setCoordsInput] = useState("");
  const [coordsErreur, setCoordsErreur] = useState<string | null>(null);
  // Exécution ×2 (actif/test) + comparatif (Lot 5).
  const [comparaison, setComparaison] = useState<ComparaisonLite | null>(null);
  const [runEnCours, setRunEnCours] = useState(false);
  const [runErreur, setRunErreur] = useState<string | null>(null);
  const [runSnapshot, setRunSnapshot] = useState<string | null>(null); // params au moment du run (péremption CA-5.4)

  // Validation du point via /api/origine (validerOrigine) — débounce 300 ms, annulable. Tous les setState
  // sont différés dans le timer (jamais synchrones dans le corps de l'effet).
  useEffect(() => {
    let annule = false;
    const t = setTimeout(async () => {
      if (!point) {
        setValidation(null);
        setSnappe(null);
        return;
      }
      setValidating(true);
      try {
        const res = await fetch("/api/origine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: point.lat, lon: point.lon, mode }),
        });
        const data: { statut?: StatutOrigine; message?: string; pointSnappeWgs84?: { lat: number; lon: number } | null } =
          await res.json();
        if (!annule && data.statut) {
          setValidation({ statut: data.statut, message: data.message ?? "" });
          setSnappe(data.pointSnappeWgs84 ?? null); // façade recalée (null si non valide) — piloté par la prop selon le mode
        }
      } catch {
        if (!annule) {
          setValidation({ statut: "SANS_BATIMENT", message: "Erreur lors de la validation du point." });
          setSnappe(null);
        }
      } finally {
        if (!annule) setValidating(false);
      }
    }, point ? 300 : 0);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [point, mode]);

  // L'ADRESSE suit le POINT : reverse-geocode BAN (débounce, annulable) à chaque déplacement. Le point reste
  // AUTORITAIRE — le reverse ne déplace jamais le point, ne re-snappe pas, ne relance pas la validation ; seul
  // le LABEL suit. Un reverse est sauté juste après une sélection d'adresse (ne pas écraser le label choisi).
  useEffect(() => {
    if (!point) return;
    if (ignoreReverseRef.current) {
      ignoreReverseRef.current = false;
      return;
    }
    let annule = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${point.lat}&lon=${point.lon}`);
        const data: { features?: { properties?: { label?: string } }[] } = await res.json();
        const label = data.features?.[0]?.properties?.label;
        if (!annule && label) setAdresse(label); // échec/réseau vide → champ laissé inchangé
      } catch {
        /* réseau indisponible : on laisse le champ tel quel, aucune exception propagée */
      }
    }, 350);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [point]);

  // Annule un rAF de coords en attente au démontage.
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const centre = point ?? CENTRE_DEFAUT;
  const coordsAffichees = coordsLive ?? point; // temps réel si dispo, sinon dernier point posé
  const pointValide = validation?.statut === "VALIDE";
  const hv = hauteurVision(etage, hauteurSousPlafondM);

  const parametres: ParametresSaisie | null = useMemo(
    () =>
      point && pointValide
        ? { point, azimutPrincipalDeg: azimut, etage, hauteurSousPlafondM, dernierEtage, mode }
        : null,
    [point, pointValide, azimut, etage, hauteurSousPlafondM, dernierEtage, mode],
  );

  // CA-5.4 : si les paramètres changent après un run, le comparatif affiché devient périmé.
  const perime = comparaison != null && runSnapshot !== JSON.stringify(parametres);

  function onSelectAdresse(s: SuggestionAdresse) {
    setAdresse(s.label);
    ignoreReverseRef.current = true; // le point va changer, mais on garde le label choisi (pas de reverse)
    setPoint({ lat: s.lat, lon: s.lon });
  }

  // Centre en TEMPS RÉEL (event `move`) → throttlé à une frame pour ne pas re-rendre à 60 fps. Affichage seul.
  function handleMapMove(pos: { latitude: number; longitude: number }) {
    dernierCentreRef.current = { lat: pos.latitude, lon: pos.longitude };
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (dernierCentreRef.current) setCoordsLive(dernierCentreRef.current);
    });
  }

  // Saisie GPS directe → MÊME chemin qu'une adresse : setPoint déclenche validation + snap via l'effet [point,mode].
  function placerCoords() {
    const r = parseCoords(coordsInput);
    if ("erreur" in r) {
      setCoordsErreur(r.erreur);
      return;
    }
    setCoordsErreur(null);
    setPoint({ lat: r.lat, lon: r.lon });
  }

  // Lance l'exécution ×2 (build entree ×1 + analyser actif/test, côté serveur). Aucun profilTest fourni →
  // le serveur clone le profil actif (délta nul tant que l'éditeur — Lot 2b — n'existe pas).
  async function lancer() {
    if (!parametres) return;
    setRunEnCours(true);
    setRunErreur(null);
    try {
      const res = await fetch("/api/admin/banc-comparer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parametres),
      });
      const data: ComparaisonLite = await res.json();
      if (!data.ok) {
        setComparaison(null);
        setRunErreur(data.message ?? "Exécution impossible.");
      } else {
        setComparaison(data);
        setRunSnapshot(JSON.stringify(parametres));
      }
    } catch {
      setComparaison(null);
      setRunErreur("Erreur réseau lors de l’exécution.");
    } finally {
      setRunEnCours(false);
    }
  }

  function ajusterHauteur(delta: number) {
    setHauteurSousPlafondM((h) => Math.min(HAUTEUR_SOUS_PLAFOND_MAX_M, Math.max(HAUTEUR_SOUS_PLAFOND_MIN_M, arrondi1(h + delta))));
  }

  return (
    <section style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--color-svv-ink)", margin: "0 0 4px" }}>
        Banc d’essai — saisie
      </h1>
      <p style={{ color: "var(--color-svv-muted)", fontSize: ".9rem", margin: "0 0 18px" }}>
        Paramètres d’entrée d’une analyse de test. L’exécution et la comparaison des scores arrivent au Lot 5.
      </p>

      {/* 1. Adresse (BE-30) */}
      <label className="svv-label" style={{ display: "block", marginBottom: 6 }}>
        Adresse
      </label>
      <AdresseAutocomplete value={adresse} onChange={setAdresse} onSelect={onSelectAdresse} placeholder="Rechercher une adresse…" />

      {/* Alternative : coordonnées GPS directes — MÊME chemin de validation/snap que l'adresse */}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={coordsInput}
          onChange={(e) => setCoordsInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              placerCoords();
            }
          }}
          placeholder="ou coordonnées GPS : 48.9044, 2.2701"
          className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={placerCoords}
          className="svv-pill"
          style={{ padding: "8px 14px", whiteSpace: "nowrap", borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)" }}
        >
          Placer
        </button>
      </div>
      {coordsErreur && <div style={{ marginTop: 6, fontSize: ".82rem", color: "var(--color-svv-red)" }}>{coordsErreur}</div>}

      {/* 2. Point d’origine sur carte (BE-31/32/33) */}
      <div style={{ margin: "10px 0 6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="svv-label">Point d’observation</span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["semi_auto", "manuel"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="svv-pill"
              style={{
                fontSize: ".78rem",
                padding: "3px 10px",
                background: mode === m ? "var(--color-svv-red)" : "transparent",
                color: mode === m ? "#fff" : "var(--color-svv-ink)",
                borderColor: mode === m ? "var(--color-svv-red)" : "var(--color-svv-line)",
              }}
            >
              {m === "semi_auto" ? "Façade (snap)" : "Libre"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--color-svv-line)" }}>
        <MapSelector
          latitude={centre.lat}
          longitude={centre.lon}
          mode={mode}
          onModeChange={setMode}
          onPositionChange={(p) => setPoint({ lat: p.latitude, lon: p.longitude })}
          onMove={handleMapMove}
          pointSnappe={mode === "manuel" ? null : snappe}
        />
      </div>

      {/* Statut de validation du point (BE-33) */}
      {point && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: ".85rem",
            background: validating ? "var(--color-svv-field)" : pointValide ? "rgba(21,128,61,.10)" : "rgba(163,4,2,.08)",
            color: validating ? "var(--color-svv-muted)" : pointValide ? "var(--color-svv-green)" : "var(--color-svv-red)",
            border: `1px solid ${pointValide ? "var(--color-svv-green)" : "var(--color-svv-line)"}`,
          }}
        >
          {validating ? "Validation du point…" : validation?.message ?? "Placez le point à l’intérieur de votre logement."}
        </div>
      )}

      {/* Coordonnées WGS84 du point courant, EN TEMPS RÉEL au déplacement (affichage de state, aucun réseau) */}
      {coordsAffichees && (
        <div style={{ marginTop: 6, fontSize: ".8rem", color: "var(--color-svv-muted)", fontFamily: "ui-monospace, monospace" }}>
          Point (WGS84) : {coordsAffichees.lat.toFixed(6)}, {coordsAffichees.lon.toFixed(6)}
        </div>
      )}

      {/* 3. Azimut principal — 360° LIBRE (BE-34) */}
      <div style={{ margin: "18px 0 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="svv-label">Azimut principal</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            min={0}
            max={359}
            value={Math.round(azimut)}
            onChange={(e) => setAzimut(norm360(Number(e.target.value) || 0))}
            className="rounded-lg border border-svv-line bg-white px-2 py-1 text-base text-svv-ink focus:border-svv-red focus:outline-none"
            style={{ width: 90 }}
          />
          <span style={{ color: "var(--color-svv-muted)", fontSize: ".85rem" }}>°</span>
        </div>
      </div>
      {point ? (
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--color-svv-line)" }}>
          <FaisceauMap
            lat={point.lat}
            lon={point.lon}
            azimutDeg={azimut}
            azimutInitial={azimut}
            margeRotDeg={180}
            onAzimutChange={(propose) => setAzimut(norm360(propose))}
          />
        </div>
      ) : (
        <p style={{ color: "var(--color-svv-muted)", fontSize: ".82rem", margin: "4px 0 0" }}>
          Choisissez d’abord un point pour orienter le faisceau.
        </p>
      )}

      {/* 4. Infos logement — étage + hauteur sous plafond + dernier étage (BE-35/36) */}
      <div style={{ margin: "18px 0 0", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="svv-label">Étage</span>
          <Stepper
            value={String(etage)}
            onMinus={() => setEtage((e) => Math.max(0, e - 1))}
            onPlus={() => setEtage((e) => e + 1)}
            minusDisabled={etage <= 0}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="svv-label">Hauteur sous plafond</span>
          <Stepper
            value={`${hauteurSousPlafondM.toFixed(2).replace(".", ",")} m`}
            onMinus={() => ajusterHauteur(-HAUTEUR_SOUS_PLAFOND_PAS_M)}
            onPlus={() => ajusterHauteur(HAUTEUR_SOUS_PLAFOND_PAS_M)}
            minusDisabled={hauteurSousPlafondM <= HAUTEUR_SOUS_PLAFOND_MIN_M}
            plusDisabled={hauteurSousPlafondM >= HAUTEUR_SOUS_PLAFOND_MAX_M}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={dernierEtage} onChange={(e) => setDernierEtage(e.target.checked)} />
          <span style={{ color: "var(--color-svv-ink)", fontSize: ".9rem" }}>Dernier étage</span>
        </label>
      </div>

      {/* Hauteur de vision dérivée (formule config.ts, aucun arrondi) */}
      <div style={{ marginTop: 12, color: "var(--color-svv-muted)", fontSize: ".82rem" }}>
        Hauteur de vision calculée : <strong style={{ color: "var(--color-svv-ink)" }}>{hv} m</strong>{" "}
        (étage {etage} × ({hauteurSousPlafondM.toFixed(2).replace(".", ",")} + 0,30) + 1,65)
      </div>

      {/* 5. Paramètres assemblés — prêts pour le Lot 5 (exécution) */}
      <div
        className="svv-card"
        style={{ marginTop: 18, padding: 14, borderRadius: 12, border: "1px solid var(--color-svv-line)" }}
      >
        <div className="svv-label" style={{ marginBottom: 8 }}>
          Paramètres du test
        </div>
        {parametres ? (
          <>
            <pre
              style={{
                margin: 0,
                fontSize: ".78rem",
                color: "var(--color-svv-ink)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(parametres, null, 2)}
            </pre>
            <p style={{ margin: "10px 0 0", color: "var(--color-svv-muted)", fontSize: ".8rem" }}>
              Paramètres prêts pour l’exécution.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--color-svv-muted)", fontSize: ".85rem" }}>
            {point ? "Point non valide — corrigez le placement pour préparer le test." : "Renseignez un point d’observation valide."}
          </p>
        )}
      </div>

      {/* 6. Exécution ×2 (profil actif vs profil de test) + comparaison des scores (Lot 5) */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={lancer}
          disabled={!parametres || runEnCours}
          className="svv-btn svv-btn-primary"
          style={{ opacity: !parametres || runEnCours ? 0.6 : 1 }}
        >
          {runEnCours ? "Exécution…" : "Lancer le test"}
        </button>
        {perime && (
          <div style={{ marginTop: 8, fontSize: ".82rem", color: "var(--color-svv-ink)" }}>
            Paramètres modifiés depuis le dernier test — relancez pour un comparatif à jour.
          </div>
        )}
      </div>

      {runErreur && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, fontSize: ".85rem", color: "var(--color-svv-red)", border: "1px solid var(--color-svv-line)" }}>
          {runErreur}
        </div>
      )}

      {comparaison?.ok && comparaison.actif && comparaison.test && (
        <div style={{ marginTop: 14, opacity: perime ? 0.5 : 1 }}>
          {/* Deux scores CÔTE À CÔTE — neutres (aucune couleur évaluative, CA-5.5) */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <ScoreCarte titre="Moteur actif (tel que publié)" run={comparaison.actif} />
            <ScoreCarte titre="Profil de test" run={comparaison.test} />
          </div>

          {/* Différence globale (signe + valeur), couleur neutre */}
          <div style={{ marginTop: 12, fontSize: ".95rem", color: "var(--color-svv-ink)", fontWeight: 600 }}>
            Écart (test − actif) : {(comparaison.delta ?? 0) >= 0 ? "+" : ""}
            {(comparaison.delta ?? 0).toFixed(2)}
          </div>

          {/* Récap des écarts de variables (BE-53) — pas d'attribution par variable (BE-53a) */}
          <div style={{ marginTop: 4, fontSize: ".85rem", color: "var(--color-svv-muted)" }}>
            {comparaison.ecarts && comparaison.ecarts.total > 0
              ? `${comparaison.ecarts.total} variable(s) modifiée(s) dans le profil de test.`
              : "Profil de test identique au profil actif (aucun écart) — l’éditeur de variables arrive au Lot 2b."}
          </div>

          {/* Verdict identique (BE-56) — le verdict est 100 % géométrique, indépendant du profil */}
          <div style={{ marginTop: 6, fontSize: ".82rem", color: comparaison.verdictIdentique ? "var(--color-svv-muted)" : "var(--color-svv-red)" }}>
            {comparaison.verdictIdentique
              ? `Verdict identique entre les deux runs (${comparaison.actif.verdict}) — découplage score/verdict respecté.`
              : "⚠ Verdict divergent entre actif et test — anomalie de couplage score↔verdict."}
          </div>
        </div>
      )}
    </section>
  );
}

/** Carte d'un score client : total /100 + libellé. `famille1`/`famille2` = détail interne, NON sommés (BE-51a). */
function ScoreCarte({ titre, run }: { titre: string; run: RunLite }) {
  return (
    <div
      className="svv-card"
      style={{ flex: "1 1 220px", minWidth: 200, padding: 14, borderRadius: 12, border: "1px solid var(--color-svv-line)" }}
    >
      <div className="svv-label" style={{ marginBottom: 6 }}>
        {titre}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-svv-ink)" }}>{Math.round(run.score.total)}</span>
        <span style={{ fontSize: ".9rem", color: "var(--color-svv-muted)" }}>/100</span>
      </div>
      <div style={{ fontSize: ".85rem", color: "var(--color-svv-ink)" }}>{libelleTexte(run.score.libelle)}</div>
      <div style={{ marginTop: 8, fontSize: ".72rem", color: "var(--color-svv-muted)" }}>
        détail interne (non sommé) — F1 {run.score.famille1?.total != null ? run.score.famille1.total.toFixed(1) : "—"} /50 ·
        F2 {run.score.famille2?.total != null ? run.score.famille2.total.toFixed(1) : "—"} /50
      </div>
    </div>
  );
}

/** Stepper − / valeur / + réutilisé (étage, hauteur). Cibles tactiles suffisantes (mobile). */
function Stepper({
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  const btn = (disabled?: boolean) =>
    ({
      width: 40,
      height: 40,
      borderRadius: 10,
      border: "1px solid var(--color-svv-line)",
      background: disabled ? "var(--color-svv-field)" : "#fff",
      color: disabled ? "var(--color-svv-muted)" : "var(--color-svv-ink)",
      fontSize: "1.2rem",
      lineHeight: 1,
      cursor: disabled ? "default" : "pointer",
    }) as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button type="button" onClick={onMinus} disabled={minusDisabled} style={btn(minusDisabled)} aria-label="Diminuer">
        −
      </button>
      <div style={{ minWidth: 96, textAlign: "center", color: "var(--color-svv-ink)", fontSize: ".95rem", fontWeight: 600 }}>
        {value}
      </div>
      <button type="button" onClick={onPlus} disabled={plusDisabled} style={btn(plusDisabled)} aria-label="Augmenter">
        +
      </button>
    </div>
  );
}
