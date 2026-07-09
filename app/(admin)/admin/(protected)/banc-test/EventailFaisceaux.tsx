"use client";

/**
 * Banc M5 · Lot 6 — Graphique en ÉVENTAIL des 61 faisceaux (3 séries : actif / test / brut).
 *
 * VISUALISATION PURE : dessine la ventilation DÉJÀ calculée par le seam (Lot 1), ne recalcule RIEN.
 *  - Série ACTIF / TEST : `distancePercueM` de chaque ventilation.
 *  - Série BRUT : `distanceBruteM` (géométrique, identique aux deux runs ; `null` = faisceau dégagé, rendu distinct).
 *  - Arcs de seuil : rayons dérivés des BORNES DU PROFIL affiché (base `distanceMaxM`, famille `distMaxM`, mondial
 *    `mondialFaisceauM`) — jamais de littéraux. Échelle radiale par PALIERS (r200 < r400 < r800, CA-6.6).
 * Repos = tracés seuls ; survol/sélection = valeurs + détail (BE-65a/66). Respecte prefers-reduced-motion.
 */
import { useMemo, useState } from "react";

/** Carte d'année appliquée (miroir de CarteAnnee du seam, Chantier A) — pour rendre les bornes lisibles. */
export interface CarteAnneeLite {
  borneMin: number | null;
  opMin: string | null;
  borneMax: number | null;
  opMax: string | null;
  cone: number;
  flanc: number;
  distMaxM: number;
}

/** Ligne de ventilation d'un faisceau (miroir de VentilationFaisceau, seam enrichi Chantier A). */
export interface LigneVentil {
  offsetDeg: number;
  distanceBruteM: number | null;
  distancePercueM: number;
  seuilBorneM: number;
  famille: "mh" | "inventaire" | "mondial" | "annee" | null;
  coeffApplique: number | null;
  boostF4AppliqueM: number;
  natureTraverseeM: number;
  diviseurCumulNature: number | null;
  modeCombinaison: string | null;
  capFamilleApplique: boolean;
  // Chantier A (enrichissement descriptif) :
  carteAnnee: CarteAnneeLite | null; // bornes + coeffs + cap de la carte appliquée (si famille === 'annee')
  familleLibelle: string | null; // « Monument Historique » / « Inventaire » / « Patrimoine mondial » (mh/inventaire/mondial)
  dansChaineCouloir: boolean; // faisceau ∈ chaîne couloir validée (malus AGRÉGÉ, pas par faisceau)
  // Lot 1 (valeur avant plafond, descriptif) :
  valeurAvantCapM: number; // valeur pondérée avant le dernier plafond ; distancePercueM === min(valeurAvantCapM, seuilBorneM)
  p1M: number | null; // Partie 1 (nature classique après cap capP1M) du cumul nature+bâti ; null si pas de cumul
  p2M: number | null; // Partie 2 (lecture patrimoine = distance × coeff) du cumul nature+bâti ; null si pas de cumul
}

export interface BornesArcs {
  base: number; // distanceMaxM (arc 200)
  famille: number; // max(mh.distMaxM, inv.distMaxM) (arc 400)
  mondial: number; // mondialFaisceauM (arc 800)
}

type SerieId = "actif" | "test" | "brut";
// Couleurs alignées sur les en-têtes du tableau de détail : Brut gris / Actif vert / Test rouge.
const COULEUR: Record<SerieId, string> = {
  brut: "var(--color-svv-gray)",
  actif: "var(--color-svv-green-ink)",
  test: "var(--color-svv-red)",
};
const LIBELLE_SERIE: Record<SerieId, string> = { brut: "Brut (géométrique)", actif: "Moteur actif", test: "Profil de test" };
const ORDRE_SERIES: readonly SerieId[] = ["brut", "actif", "test"]; // filtres ET tracés : Brut / Actif / Test

// Géométrie SVG (schématique — PAS à l'échelle, BE-60).
const W = 360;
const H = 196;
const OX = W / 2;
const OY = H - 8;
const R0 = 0;
const R200 = 92;
const R400 = 132;
const R800 = 168;

// Calque de cône — MÊMES valeurs que le cône de la carte d'orientation `FaisceauMap.tsx:370`, réutilisées à
// L'IDENTIQUE (aucun token bleu SVAV n'existe ; hex documentés et centralisés ici, non dispersés).
const CONE_FILL = "#3b82f6";
const CONE_STROKE = "#60a5fa";

const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (d: number, d0: number, d1: number, r0: number, r1: number) =>
  d1 === d0 ? r0 : r0 + ((d - d0) / (d1 - d0)) * (r1 - r0);

/** Points d'un secteur (pie) du cône central : origine + arc échantillonné de −demi à +demi au rayon r. */
function secteurCone(demiAngleDeg: number, r: number, pointFor: (offsetDeg: number, r: number) => { x: number; y: number }): string {
  const demi = Math.min(90, demiAngleDeg); // le balayage réel va de −90° à +90°
  const p0 = pointFor(0, 0); // origine (r=0)
  const pts = [`${p0.x.toFixed(1)},${p0.y.toFixed(1)}`];
  const N = Math.max(2, Math.ceil((2 * demi) / 3));
  for (let i = 0; i <= N; i++) {
    const p = pointFor(-demi + (i * 2 * demi) / N, r);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export default function EventailFaisceaux({
  actif,
  test,
  bornes,
  coneDemiAngleDeg,
  borneScoreM,
}: {
  actif: LigneVentil[];
  test: LigneVentil[];
  bornes: BornesArcs;
  /** Demi-angle du cône central (deg) DÉRIVÉ DU PROFIL (`coneFamilleDemiAngleDeg`) → calque bleuté ±demi-angle.
   *  Absent → pas de calque. Jamais figé : s'adapte quand la valeur change dans l'éditeur du profil de test. */
  coneDemiAngleDeg?: number;
  /** Borne du profil (`distanceMaxM`) pour la moyenne « Brut au sens du score » — LUE DU PROFIL DE TEST (adaptatif) ;
   *  repli `bornes.base`. Jamais un 200 en dur. */
  borneScoreM?: number;
}) {
  const [visibles, setVisibles] = useState<Record<SerieId, boolean>>({ brut: false, actif: true, test: true });
  const [selection, setSelection] = useState<number | null>(null);
  const [survol, setSurvol] = useState<number | null>(null);

  // Rayon (px) d'une distance (m), par paliers : 0→base→famille→mondial ↦ R0→R200→R400→R800 (CA-6.6).
  const rayon = useMemo(() => {
    const { base, famille, mondial } = bornes;
    return (d: number): number => {
      if (d <= base) return lerp(d, 0, base, R0, R200);
      if (d <= famille) return lerp(d, base, famille, R200, R400);
      return lerp(Math.min(d, mondial), famille, mondial, R400, R800);
    };
  }, [bornes]);

  const pointFor = (offsetDeg: number, r: number) => ({
    x: OX + r * Math.sin(rad(offsetDeg)),
    y: OY - r * Math.cos(rad(offsetDeg)),
  });

  // Un arc de seuil = polyligne sur les 61 offsets à rayon constant.
  const arc = (r: number) =>
    actif.map((l) => { const p = pointFor(l.offsetDeg, r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");

  // Tips d'une série (une valeur par faisceau).
  const tips = (lignes: LigneVentil[], serie: SerieId) =>
    lignes.map((l) => {
      const valeur = serie === "brut" ? l.distanceBruteM : l.distancePercueM;
      const degage = serie === "brut" && l.distanceBruteM === null;
      const d = valeur ?? bornes.base; // brut null = dégagé → arc de base, rendu distinct
      const p = pointFor(l.offsetDeg, rayon(d));
      return { ...p, valeur, degage };
    });

  const tipsActif = tips(actif, "actif");
  const tipsTest = tips(test, "test");
  const tipsBrut = tips(actif, "brut"); // distanceBruteM est identique actif/test (géométrie build×1)

  // Faisceaux où test diffère de l'actif (BE-70) : mis en évidence ; les autres estompés.
  const diffPercue = actif.map((l, i) => Math.abs(l.distancePercueM - (test[i]?.distancePercueM ?? l.distancePercueM)) > 1e-9);

  // Moyenne descriptive des 61 faisceaux par série (aucun recalcul de score). Brut = distanceBruteM sur les
  // faisceaux OBSTRUÉS (non-null) ; Actif/Test = distancePercueM (jamais null → sur les 61).
  const moyenneSerie = (lignes: LigneVentil[], serie: "brut" | "percue") => {
    const vals = lignes
      .map((l) => (serie === "brut" ? l.distanceBruteM : l.distancePercueM))
      .filter((v): v is number => v != null);
    return { moy: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  };
  const moyBrut = moyenneSerie(actif, "brut"); // (1) distanceBruteM sur les OBSTRUÉS (dégagés exclus)
  const moyActif = moyenneSerie(actif, "percue"); // (3) distancePercueM sur les 61 (dégagé = borne)
  const moyTest = moyenneSerie(test, "percue"); // (4) idem, profil de test
  // (2) « Brut au sens du score » : distanceBruteM avec les dégagés (null) remplacés par la BORNE DU PROFIL de test
  // (adaptatif ; repli sur la borne des arcs), sur les 61 → comparable à (3)/(4). Non profil-indépendante.
  const borneScore = borneScoreM ?? bornes.base;
  const brutScoreVals = actif.map((l) => l.distanceBruteM ?? borneScore);
  const moyBrutScore = brutScoreVals.length ? brutScoreVals.reduce((a, b) => a + b, 0) / brutScoreVals.length : null;
  const nbDegages = actif.length - moyBrut.n;

  const focus = survol ?? selection;
  const reduce = "prefers-reduced-motion";

  return (
    <div>
      {/* Graphique EN PREMIER (ajustement 2) : filtres + moyennes déplacés SOUS le graphe → la carte analysée
          (au-dessus de ce composant) et l'éventail se touchent, comparaison visuelle immédiate.
          SVG centré horizontalement (`margin: 0 auto`, ajustement 1) → le sommet (OX = W/2) tombe au centre du
          bloc, sur le MÊME axe vertical que le point d'origine rouge de la carte analysée (lui aussi centré). */}
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 520, display: "block", margin: "0 auto" }} role="img" aria-label="Éventail des 61 faisceaux">
          <style>{`@media (${reduce}: reduce){.svv-ev *{transition:none!important;animation:none!important}}`}</style>
          <g className="svv-ev">
            {/* Calque du cône central (±demi-angle) DÉRIVÉ DU PROFIL — DESSINÉ EN PREMIER (derrière arcs + séries),
                opacité douce pour que TOUT reste visible par transparence. Couleurs de FaisceauMap conservées. */}
            {typeof coneDemiAngleDeg === "number" && coneDemiAngleDeg > 0 && (
              <polygon
                points={secteurCone(coneDemiAngleDeg, R800, pointFor)}
                fill={CONE_FILL}
                fillOpacity={0.09}
                stroke={CONE_STROKE}
                strokeOpacity={0.5}
                strokeWidth={1}
                strokeDasharray="5 4"
                strokeLinejoin="round"
              />
            )}
            {/* Arcs de seuil (dérivés des bornes du profil) */}
            {[R200, R400, R800].map((r, i) => (
              <polyline key={r} points={arc(r)} fill="none" stroke="var(--color-svv-line)" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
            ))}
            {[
              { r: R200, t: `${Math.round(bornes.base)} m` },
              { r: R400, t: `${Math.round(bornes.famille)} m` },
              { r: R800, t: `${Math.round(bornes.mondial)} m` },
            ].map(({ r, t }) => {
              const p = pointFor(90, r); // bord droit de l'arc — ancrage à DROITE pour ne pas déborder le viewBox (fix « 80 » → « 800 »)
              return <text key={r} x={p.x} y={p.y - 2} textAnchor="end" fontSize="8" fill="var(--color-svv-muted)">{t}</text>;
            })}

            {/* Guides radiaux faibles (61 directions) + zones de survol/clic invisibles */}
            {actif.map((l, i) => {
              const ext = pointFor(l.offsetDeg, R800);
              const differe = diffPercue[i];
              return (
                <g key={i}>
                  <line x1={OX} y1={OY} x2={ext.x} y2={ext.y} stroke="var(--color-svv-line)" strokeWidth="0.5" opacity={differe ? 0.5 : 0.18} />
                  <line
                    x1={OX} y1={OY} x2={ext.x} y2={ext.y}
                    stroke="transparent" strokeWidth="7"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setSurvol(i)}
                    onMouseLeave={() => setSurvol((s) => (s === i ? null : s))}
                    onClick={() => setSelection((s) => (s === i ? null : i))}
                  />
                </g>
              );
            })}

            {/* Séries (polyligne des tips) — repos = tracés seuls (BE-65a). Ordre = Brut/Actif/Test (test au-dessus). */}
            {ORDRE_SERIES.map((s) => {
              if (!visibles[s]) return null;
              const ts = s === "actif" ? tipsActif : s === "test" ? tipsTest : tipsBrut;
              const atenue = focus != null;
              return (
                <g key={s} opacity={atenue ? 0.55 : 1}>
                  <polyline points={ts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={COULEUR[s]} strokeWidth="1.4" />
                  {ts.map((p, i) =>
                    p.degage ? (
                      <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="none" stroke={COULEUR[s]} strokeWidth="0.8" />
                    ) : null,
                  )}
                </g>
              );
            })}

            {/* Faisceau focalisé (survol/sélection) : tips agrandis + valeurs (BE-65a) */}
            {focus != null && ORDRE_SERIES.map((s) => {
              if (!visibles[s]) return null;
              const ts = s === "actif" ? tipsActif : s === "test" ? tipsTest : tipsBrut;
              const p = ts[focus];
              if (!p) return null;
              return (
                <g key={s}>
                  <circle cx={p.x} cy={p.y} r={2.6} fill={COULEUR[s]} />
                  <text x={p.x + 3} y={p.y - 3} fontSize="8" fill={COULEUR[s]}>
                    {p.valeur == null ? "dégagé" : `${Math.round(p.valeur)}`}
                  </text>
                </g>
              );
            })}
            {/* Origine */}
            <circle cx={OX} cy={OY} r={2.4} fill="var(--color-svv-red)" />
          </g>
        </svg>
      </div>

      <p style={{ margin: "2px 0 0", fontSize: ".72rem", color: "var(--color-svv-muted)" }}>
        Survolez un faisceau pour lire ses valeurs ; cliquez pour figer le détail. Faisceaux où test ≠ actif : guides plus marqués.
      </p>

      {/* Filtres de séries (BE-64/64a) — DÉPLACÉS SOUS le graphe (ajustement 2). Tabulation cohérente : le graphe
          (éléments non focusables) précède, puis les cases à cocher, puis les moyennes. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
        {ORDRE_SERIES.map((s) => (
          <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--color-svv-ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={visibles[s]} onChange={(e) => setVisibles((v) => ({ ...v, [s]: e.target.checked }))} />
            <span style={{ display: "inline-block", width: 12, height: 3, background: COULEUR[s] }} />
            {LIBELLE_SERIE[s]}
          </label>
        ))}
      </div>

      {/* Moyennes sur DEUX lignes (ajustement 3) — descriptif, aucun recalcul de score.
          Ligne 1 = les TROIS moyennes COMPARABLES entre elles : sur les 61 faisceaux, dégagés comptés à la BORNE
          (gris « Brut au sens du score » / vert « Moteur actif » / rouge « Profil de test »).
          Ligne 2 = « Brut géométrique » SEULE : moyenne sur les OBSTRUÉS uniquement (dégagés exclus) — série
          profil-INDÉPENDANTE, NON comparable aux trois ci-dessus (le dire). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: ".8rem", marginTop: 10 }}>
        <span
          style={{ color: COULEUR.brut }}
          title={`Dégagés comptés à la borne du profil de test (${Math.round(borneScore)} m), comme le score. Non profil-indépendante.`}
        >
          Brut au sens du score ⌀ {moyBrutScore != null ? moyBrutScore.toFixed(1) : "—"} m{" "}
          <span style={{ color: "var(--color-svv-muted)", fontSize: ".72rem" }}>(dégagés → borne)</span>
        </span>
        <span style={{ color: COULEUR.actif }}>Moteur actif ⌀ {moyActif.moy != null ? moyActif.moy.toFixed(1) : "—"} m</span>
        <span style={{ color: COULEUR.test }}>Profil de test ⌀ {moyTest.moy != null ? moyTest.moy.toFixed(1) : "—"} m</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", fontSize: ".8rem", marginTop: 4 }}>
        <span style={{ color: COULEUR.brut }}>
          Brut géométrique ⌀ {moyBrut.moy != null ? moyBrut.moy.toFixed(1) : "—"} m
          {nbDegages > 0 ? ` (${moyBrut.n}/${actif.length} · ${nbDegages} dégagé${nbDegages > 1 ? "s" : ""} exclu${nbDegages > 1 ? "s" : ""})` : ""}
        </span>
        <span style={{ color: "var(--color-svv-muted)", fontSize: ".72rem" }}>
          série géométrique, non comparable aux trois ci-dessus (profil-indépendante)
        </span>
      </div>

      {/* Détail par faisceau (BE-66/66a) : actif vs test, écarts surlignés ; brut en repère neutre */}
      {selection != null && actif[selection] && test[selection] && (
        <DetailFaisceau a={actif[selection]} t={test[selection]} index={selection} onFermer={() => setSelection(null)} />
      )}
    </div>
  );
}

// Rouge doux DÉRIVÉ du token (aucun hex en dur) : trame « baisse » + surlignage des écarts.
const ROUGE_DOUX = "color-mix(in srgb, var(--color-svv-red) 10%, white)";

function fmt(v: number | string | boolean | null): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return v;
}

/** Coefficient (cône/flanc) — 1 décimale (ex. 1.5, 2.0). AFFICHAGE seul (ne touche pas les valeurs calculées). */
function fmtCoeff(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}

/** Libellé de la famille RÉELLEMENT appliquée (après précédence). Année → « Carte d'année » (détaillée en dessous). */
function familleTexte(l: LigneVentil): string {
  if (l.famille == null) return "aucune";
  if (l.famille === "annee") return "Carte d’année";
  return l.familleLibelle ?? l.famille; // « Monument Historique » / « Inventaire » / « Patrimoine mondial »
}

/** Bornes d'une carte d'année en clair, ex. « > 1910 et ≤ 1935 ». */
function formaterBornesCarte(c: CarteAnneeLite): string {
  const min = c.borneMin != null ? `${c.opMin === ">=" ? "≥" : ">"} ${c.borneMin}` : null;
  const max = c.borneMax != null ? `${c.opMax === "<=" ? "≤" : "<"} ${c.borneMax}` : null;
  if (min && max) return `${min} et ${max}`;
  return min ?? max ?? "toutes années";
}

/** Statut de pondération d'un faisceau (perçue vs brute) sur le run affiché → trame colorée du bandeau. */
function statutPonderation(l: LigneVentil): { texte: string; bg: string; fg: string } {
  if (l.distanceBruteM == null) return { texte: "faisceau dégagé (aucun obstacle)", bg: "var(--color-svv-field)", fg: "var(--color-svv-muted)" };
  if (l.distancePercueM > l.distanceBruteM) return { texte: "pondéré à la hausse", bg: "var(--color-svv-green-soft)", fg: "var(--color-svv-green-ink)" };
  if (l.distancePercueM < l.distanceBruteM) return { texte: "pondéré à la baisse", bg: ROUGE_DOUX, fg: "var(--color-svv-red)" };
  return { texte: "neutre (aucune pondération)", bg: "var(--color-svv-field)", fg: "var(--color-svv-muted)" };
}

type LigneDetail =
  | { type: "section"; titre: string }
  | { type: "valeur"; libelle: string; brut: string; actif: string; test: string };

/** Construit les lignes du tableau (Brut | Actif | Test) pour un faisceau, structurées par section. */
function construireLignes(a: LigneVentil, t: LigneVentil): LigneDetail[] {
  const r: LigneDetail[] = [
    { type: "section", titre: "Distances" },
    { type: "valeur", libelle: "Distance brute (m)", brut: fmt(a.distanceBruteM), actif: fmt(a.distanceBruteM), test: fmt(t.distanceBruteM) },
    { type: "valeur", libelle: "Distance pondérée (m)", brut: "—", actif: fmt(a.distancePercueM), test: fmt(t.distancePercueM) },
    { type: "valeur", libelle: "Borne du profil (m)", brut: "—", actif: fmt(a.seuilBorneM), test: fmt(t.seuilBorneM) },
    { type: "section", titre: "Famille appliquée (après précédence)" },
    { type: "valeur", libelle: "Famille", brut: "—", actif: familleTexte(a), test: familleTexte(t) },
  ];
  if (a.famille === "annee" || t.famille === "annee") {
    const cA = a.carteAnnee;
    const cT = t.carteAnnee;
    r.push(
      { type: "valeur", libelle: "Carte — période", brut: "—", actif: cA ? formaterBornesCarte(cA) : "—", test: cT ? formaterBornesCarte(cT) : "—" },
      { type: "valeur", libelle: "Carte — coeff cône", brut: "—", actif: cA ? fmtCoeff(cA.cone) : "—", test: cT ? fmtCoeff(cT.cone) : "—" },
      { type: "valeur", libelle: "Carte — coeff flanc", brut: "—", actif: cA ? fmtCoeff(cA.flanc) : "—", test: cT ? fmtCoeff(cT.flanc) : "—" },
      { type: "valeur", libelle: "Carte — cap (m)", brut: "—", actif: cA ? fmt(cA.distMaxM) : "—", test: cT ? fmt(cT.distMaxM) : "—" },
    );
  }
  r.push(
    { type: "section", titre: "Pondérations" },
    { type: "valeur", libelle: "Coeff cône/flanc", brut: "—", actif: fmtCoeff(a.coeffApplique), test: fmtCoeff(t.coeffApplique) },
    { type: "valeur", libelle: "Nature traversée (m)", brut: fmt(a.natureTraverseeM), actif: fmt(a.natureTraverseeM), test: fmt(t.natureTraverseeM) },
    { type: "valeur", libelle: "Boost F4 nature (m)", brut: "—", actif: fmt(a.boostF4AppliqueM), test: fmt(t.boostF4AppliqueM) },
    { type: "valeur", libelle: "Diviseur cumul", brut: "—", actif: fmt(a.diviseurCumulNature), test: fmt(t.diviseurCumulNature) },
    { type: "valeur", libelle: "Cap famille appliqué", brut: "—", actif: fmt(a.capFamilleApplique), test: fmt(t.capFamilleApplique) },
    { type: "section", titre: "Combinaison" },
    { type: "valeur", libelle: "Mode (P1 nature + P2 bâti)", brut: "—", actif: fmt(a.modeCombinaison), test: fmt(t.modeCombinaison) },
    { type: "section", titre: "Malus couloir (ajustement AGRÉGÉ, pas par faisceau)" },
    { type: "valeur", libelle: "Dans la chaîne du malus couloir", brut: "—", actif: fmt(a.dansChaineCouloir), test: fmt(t.dansChaineCouloir) },
  );
  return r;
}

const signeOffset = (deg: number): string => `${deg > 0 ? "+" : ""}${deg}°`;

/**
 * Détail seam d'un faisceau : bandeau de statut (pondération, sur le profil de TEST) + tableau 3 colonnes
 * Brut | Actif | Test, structuré par sections. Lignes surlignées si Actif ≠ Test (BE-66a). Rendu pur.
 */
function DetailFaisceau({ a, t, index, onFermer }: { a: LigneVentil; t: LigneVentil; index: number; onFermer: () => void }) {
  const statut = statutPonderation(t); // sur le run affiché (profil de test)
  const lignes = construireLignes(a, t);
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--color-svv-line)", borderRadius: 10, overflow: "hidden" }}>
      {/* Bandeau de statut — trame entière dans la couleur du statut de pondération */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", background: statut.bg, color: statut.fg }}>
        <span style={{ fontWeight: 700, fontSize: ".85rem" }}>
          Faisceau {index + 1} · {signeOffset(a.offsetDeg)} — {statut.texte} (profil de test)
        </span>
        <button type="button" onClick={onFermer} className="svv-pill" style={{ padding: "2px 10px", background: "white", borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)" }}>
          Fermer
        </button>
      </div>
      <div style={{ overflowX: "auto", padding: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: ".8rem", width: "100%", minWidth: 360 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "3px 8px", color: "var(--color-svv-muted)", fontWeight: 600 }}>Contribution</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: "var(--color-svv-gray)", fontWeight: 700 }}>Brut</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: "var(--color-svv-green-ink)", fontWeight: 700 }}>Actif</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: "var(--color-svv-red)", fontWeight: 700 }}>Test</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, i) => {
              if (ligne.type === "section") {
                return (
                  <tr key={i}>
                    <td colSpan={4} style={{ padding: "8px 8px 2px", fontSize: ".72rem", fontWeight: 700, color: "var(--color-svv-ink)", textTransform: "uppercase", letterSpacing: ".02em" }}>
                      {ligne.titre}
                    </td>
                  </tr>
                );
              }
              const differe = ligne.actif !== ligne.test; // brut-only → actif==test=="—" → jamais surligné
              return (
                <tr key={i} style={{ background: differe ? ROUGE_DOUX : "transparent" }}>
                  <td style={{ padding: "3px 8px", color: "var(--color-svv-ink)" }}>{ligne.libelle}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "var(--color-svv-gray)" }}>{ligne.brut}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "var(--color-svv-ink)" }}>{ligne.actif}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: differe ? "var(--color-svv-red)" : "var(--color-svv-ink)" }}>{ligne.test}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
