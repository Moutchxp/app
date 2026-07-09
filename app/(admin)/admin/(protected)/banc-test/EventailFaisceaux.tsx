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
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfilDegagement } from "../../../../lib/svv/profilDegagement";

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
  // Lot 4 (détail interne de la lecture dégagement, descriptif) :
  baseM: number; // distance retenue = min(distanceObstacle ?? portée, portée)
  p1AvantCapM: number | null; // lecture dégagement avant son plafond capP1M ; null ssi p1M === null
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
  profilActif,
  profilTest,
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
  /** Profils actif et de test (déjà chargés en mémoire) — pour la modale « détail du calcul » de chaque colonne.
   *  Le profil de test = `profilTest ?? profilActif` côté appelant (le run de test l'utilise). */
  profilActif: ProfilDegagement;
  profilTest: ProfilDegagement;
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
        <DetailFaisceau a={actif[selection]} t={test[selection]} index={selection} profilActif={profilActif} profilTest={profilTest} onFermer={() => setSelection(null)} />
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

// ============================ Modale « détail du calcul de la distance pondérée » ============================
// Générateur PUR d'un récit d'étapes, en langage humain, à partir des valeurs DÉJÀ produites par le moteur
// (seam). Ne réimplémente NI le capping, NI le diviseur, NI la combinaison P1/P2 : il ASSEMBLE. Seules des
// additions/soustractions/multiplications d'AFFICHAGE entre champs du seam composent les chaînes lisibles.
// Aucun libellé ne laisse fuiter un nom de champ/table/colonne (dictionnaire ci-dessous).

/** Un opérande légendé (valeur formatée + libellé humain), pour la légende déployée d'un cartouche. */
export interface OperandeLegende {
  valeur: string; // déjà formaté (mètres, coefficient…)
  libelle: string; // libellé humain du dictionnaire (aucun nom technique)
  /** Sous-calcul (UNE profondeur) qui produit `valeur`, ex. « 2.5 × 61.769 » — composé de valeurs déjà exposées. */
  sousCalcul?: string;
  /** Légendes des opérandes du sous-calcul (ATOMIQUES : mesures/paramètres, jamais re-décomposés). */
  sousOperandes?: OperandeLegende[];
}

/** Une étape du récit de calcul : valeur à l'étape + expression composée des valeurs réelles + opérandes légendés. */
export interface EtapeCalcul {
  libelle: string;
  valeur: number; // résultat à cette étape (m)
  unite: "m" | null;
  misEnEvidence?: boolean; // étape « valeur avant plafond »
  note?: string;
  /** Calcul en clair, COMPOSÉ des valeurs réelles (jamais figé) ; `null` si l'étape est un simple relevé.
   *  Rendu clampé à 2 lignes au repli, complet au déploiement. Montre TOUJOURS le vrai résultat de l'opération. */
  expression: string | null;
  /** Ligne « Valeur retenue : X m (seuil max Y m) » quand un plafond a mordu (Y = le seuil réel qui a mordu,
   *  lu dans le profil/seam) ; absente sinon. Séparée de `expression` pour ne jamais fausser l'égalité affichée. */
  valeurRetenue?: string;
  /** Légende de chaque nombre utilisé (déployée par le bouton « i »). */
  operandes: OperandeLegende[];
}

/** Dictionnaire des libellés humains (aucun nom technique à l'écran). Règle projet « légende sinon famille ». */
// Libellés FIGÉS (indépendants de la famille). Les libellés dépendant de la famille (multiplicateur, score
// patrimoine/bâti) sont produits par `libelleMultiplicateur` / `libelleScorePatrimoine`, pas par ce dictionnaire.
const LIBELLES_ETAPE = {
  distanceReelle: "Distance réelle au 1er obstacle",
  distanceRetenue: "Distance retenue (plafonnée à la portée d’analyse)",
  bonusVegetation: "Bonus végétation traversée",
  coeffBonusVegetation: "coefficient de bonus par mètre de végétation",
  longueurVegetation: "Longueur de végétation traversée",
  scoreDegagement: "Score dégagement (distance + végétation)",
  scoreDegagementAvantPlafond: "Score dégagement avant plafond",
  plafondScoreDegagement: "Plafond du score dégagement",
  attenuation: "Atténuation du patrimoine par la végétation",
  combinaisonSequentiel: "Combinaison : dégagement + patrimoine atténué",
  combinaisonAddition: "Combinaison : dégagement + patrimoine",
  combinaisonMax: "Combinaison : on garde le meilleur des deux scores",
  valeurAvantPlafond: "Valeur avant plafond",
  valeurRetenue: "Valeur retenue",
  plafondApplique: "Plafond appliqué",
  distancePercue: "Distance pondérée finale",
  valeurFixeMondial: "Valeur fixe patrimoine mondial",
  effetCouloir: "Effet couloir (ajustement global de la note, hors de ce faisceau)",
  notePlafondAtteint: "Plafond atteint — valeur ramenée à la limite",
} as const;

/** Montant en mètres pour les valeurs « en-tête » et le récapitulatif (1 décimale). AFFICHAGE seul. */
const fmtMontant = (v: number): string => v.toFixed(1);

/** Nombre fidèle jusqu'à 3 décimales (zéros superflus retirés, min 1 décimale), pour les expressions détaillées.
 *  AFFICHAGE seul : n'arrondit ni ne recalcule aucune valeur transmise. */
function fmtNb(v: number): string {
  const r = parseFloat(v.toFixed(3));
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

/** Opérande légendé en mètres. */
const opM = (v: number, libelle: string): OperandeLegende => ({ valeur: `${fmtNb(v)} m`, libelle });
/** Opérande légendé sans unité (coefficient / diviseur). */
const opX = (v: number, libelle: string): OperandeLegende => ({ valeur: fmtNb(v), libelle });

/** Contexte de famille en clair pour la note d'une étape patrimoine (« légende sinon famille »). */
function contexteFamille(l: LigneVentil): string | undefined {
  if (l.famille === "annee") return l.carteAnnee ? `Époque de construction : ${formaterBornesCarte(l.carteAnnee)}` : undefined;
  return l.familleLibelle ?? undefined; // « Monument Historique » / « Inventaire »
}

/** Un « bien historique » = MH / Inventaire / Patrimoine mondial. Une CARTE D'ANNÉE n'en est PAS un
 *  (bâti daté par son époque de construction) → jamais les mots « monument » ni « historique » pour elle. */
function estHistorique(l: LigneVentil): boolean {
  return l.famille === "mh" || l.famille === "inventaire" || l.famille === "mondial";
}

/** Libellé du multiplicateur cône/flanc, SELON LA FAMILLE effective (`l.famille`). Jamais « monument ». */
function libelleMultiplicateur(l: LigneVentil, enCone: boolean): string {
  const nature = estHistorique(l) ? "patrimoine historique" : "époque de construction";
  const position = enCone ? "bâtiment dans l’axe" : "bâtiment sur le côté";
  return `Multiplicateur ${nature} (${position})`;
}

/** Libellé du score patrimoine (P2), SELON LA FAMILLE : « patrimoine historique » vs « bâti » (carte d'année). */
function libelleScorePatrimoine(l: LigneVentil): string {
  return estHistorique(l) ? "Score patrimoine historique" : "Score bâti";
}

/** Opérande « bonus végétation » DÉCOMPOSÉ (une profondeur) : boostF4AppliqueM = boostF4 × natureTraverseeM.
 *  Les deux facteurs (paramètre profil + mesure) sont ATOMIQUES → pas de nouvelle décomposition. */
function opBonus(l: LigneVentil, profil: ProfilDegagement): OperandeLegende {
  return {
    valeur: `${fmtNb(l.boostF4AppliqueM)} m`,
    libelle: LIBELLES_ETAPE.bonusVegetation,
    sousCalcul: `${fmtNb(profil.boostF4)} × ${fmtNb(l.natureTraverseeM)}`,
    sousOperandes: [opX(profil.boostF4, LIBELLES_ETAPE.coeffBonusVegetation), opM(l.natureTraverseeM, LIBELLES_ETAPE.longueurVegetation)],
  };
}

/** Ligne « Valeur retenue : X m (seuil max Y m) » — Y = le plafond qui a EFFECTIVEMENT mordu (profil/seam, jamais figé). */
function ligneRetenue(apresM: number, seuilM: number): string {
  return `${LIBELLES_ETAPE.valeurRetenue} : ${fmtNb(apresM)} m (seuil max ${fmtNb(seuilM)} m)`;
}

/** Opérande légendé « valeur retenue » : valeur APRÈS plafond + le seuil réel qui l'a produite. */
function opRetenue(apresM: number, seuilM: number): OperandeLegende {
  return { valeur: `${fmtNb(apresM)} m`, libelle: `${LIBELLES_ETAPE.valeurRetenue} (seuil max ${fmtNb(seuilM)} m)` };
}

/** Opérande « score patrimoine/bâti » (P2) DÉCOMPOSÉ : p2M = distanceBruteM × coeffApplique (opérandes atomiques). */
function opP2(l: LigneVentil, enCone: boolean): OperandeLegende {
  const decomposable = l.distanceBruteM !== null && l.coeffApplique !== null;
  return {
    valeur: `${fmtNb(l.p2M as number)} m`,
    libelle: libelleScorePatrimoine(l),
    sousCalcul: decomposable ? `${fmtNb(l.distanceBruteM as number)} × ${fmtCoeff(l.coeffApplique)}` : undefined,
    sousOperandes: decomposable ? [opM(l.distanceBruteM as number, LIBELLES_ETAPE.distanceReelle), opX(l.coeffApplique as number, libelleMultiplicateur(l, enCone))] : undefined,
  };
}

/** Opérande « valeur avant plafond » DÉCOMPOSÉ selon le cas : combinaison (cumul), produit (patrimoine seul),
 *  somme (ordinaire + nature). Opérandes du sous-calcul ATOMIQUES (une profondeur). Sinon atomique. */
function opValeurAvantCap(l: LigneVentil, enCone: boolean): OperandeLegende {
  const o: OperandeLegende = { valeur: `${fmtNb(l.valeurAvantCapM)} m`, libelle: LIBELLES_ETAPE.valeurAvantPlafond };
  if (l.p1M !== null && l.p2M !== null) {
    const p2Divise = l.diviseurCumulNature !== null && l.modeCombinaison === "sequentiel";
    const termeP2 = p2Divise ? `(${fmtNb(l.p2M)} ÷ ${fmtNb(l.diviseurCumulNature as number)})` : `${fmtNb(l.p2M)}`;
    o.sousCalcul = `${fmtNb(l.p1M)} + ${termeP2}`;
    o.sousOperandes = [opM(l.p1M, LIBELLES_ETAPE.scoreDegagement), opM(l.p2M, libelleScorePatrimoine(l)), ...(p2Divise ? [opX(l.diviseurCumulNature as number, LIBELLES_ETAPE.attenuation)] : [])];
  } else if (l.famille !== null && l.distanceBruteM !== null && l.coeffApplique !== null) {
    o.sousCalcul = `${fmtNb(l.distanceBruteM)} × ${fmtCoeff(l.coeffApplique)}`;
    o.sousOperandes = [opM(l.distanceBruteM, LIBELLES_ETAPE.distanceReelle), opX(l.coeffApplique, libelleMultiplicateur(l, enCone))];
  } else if (l.famille === null && l.natureTraverseeM > 0) {
    o.sousCalcul = `${fmtNb(l.baseM)} + ${fmtNb(l.boostF4AppliqueM)}`;
    o.sousOperandes = [opM(l.baseM, LIBELLES_ETAPE.distanceRetenue), opM(l.boostF4AppliqueM, LIBELLES_ETAPE.bonusVegetation)];
  }
  return o;
}

/**
 * Assemble le récit d'étapes du calcul de la distance perçue d'UN faisceau, dérivé du CAS RÉEL (lu dans `l`) :
 *  - `famille === 'mondial'`                       → valeur fixe ;
 *  - `famille === null`                            → ordinaire / dégagé (distance ± bonus végétation) ;
 *  - `famille ≠ null` & `natureTraverseeM === 0`   → patrimoine seul (distance × coeff) ;
 *  - `famille ≠ null` & `natureTraverseeM > 0`     → cumul (deux lectures + combinaison selon le mode EFFECTIF).
 * Tous les nombres proviennent de `l` ou de `profil`. Aucune constante de barème. Un champ `null` → étape omise.
 * PURE : aucune I/O, aucun effet, ne recalcule jamais le barème.
 */
export function construireEtapesCalcul(l: LigneVentil, profil: ProfilDegagement): EtapeCalcul[] {
  const etapes: EtapeCalcul[] = [];

  // Patrimoine mondial : faisceau fixe, aucune décomposition.
  if (l.famille === "mondial") {
    etapes.push({ libelle: LIBELLES_ETAPE.valeurFixeMondial, valeur: l.valeurAvantCapM, unite: "m", misEnEvidence: true, expression: null, operandes: [opM(l.valeurAvantCapM, LIBELLES_ETAPE.valeurFixeMondial)] });
    return etapes;
  }

  const enCone = Math.abs(l.offsetDeg) <= profil.coneFamilleDemiAngleDeg;
  const pondere = l.famille !== null; // 'mh' | 'inventaire' | 'annee'
  const aNature = l.natureTraverseeM > 0;

  if (!pondere) {
    // Ordinaire / dégagé : distance retenue (+ éventuel bonus végétation), avant le plafond de portée.
    // `baseM` vient du seam (Lot 4) = min(distanceObstacle ?? portée, portée). Aucun recalcul.
    if (l.distanceBruteM !== null) {
      etapes.push({ libelle: LIBELLES_ETAPE.distanceReelle, valeur: l.distanceBruteM, unite: "m", expression: null, operandes: [opM(l.distanceBruteM, LIBELLES_ETAPE.distanceReelle)] });
    } else {
      etapes.push({ libelle: LIBELLES_ETAPE.distanceRetenue, valeur: l.baseM, unite: "m", expression: null, operandes: [opM(l.baseM, LIBELLES_ETAPE.distanceRetenue)] });
    }
    if (aNature) {
      etapes.push({
        libelle: LIBELLES_ETAPE.bonusVegetation,
        valeur: l.valeurAvantCapM,
        unite: "m",
        expression: `${fmtNb(l.baseM)} + ${fmtNb(l.boostF4AppliqueM)} = ${fmtNb(l.valeurAvantCapM)}`,
        operandes: [opM(l.baseM, LIBELLES_ETAPE.distanceRetenue), opBonus(l, profil)],
      });
    }
  } else if (!aNature) {
    // Patrimoine seul : distance réelle × coeff (cône ou flanc), avant le cap famille.
    if (l.distanceBruteM !== null) {
      etapes.push({ libelle: LIBELLES_ETAPE.distanceReelle, valeur: l.distanceBruteM, unite: "m", expression: null, operandes: [opM(l.distanceBruteM, LIBELLES_ETAPE.distanceReelle)] });
    }
    const operandes: OperandeLegende[] = [];
    if (l.distanceBruteM !== null) operandes.push(opM(l.distanceBruteM, LIBELLES_ETAPE.distanceReelle));
    if (l.coeffApplique !== null) operandes.push(opX(l.coeffApplique, libelleMultiplicateur(l, enCone)));
    etapes.push({
      libelle: libelleMultiplicateur(l, enCone),
      valeur: l.valeurAvantCapM,
      unite: "m",
      expression: l.distanceBruteM !== null && l.coeffApplique !== null ? `${fmtNb(l.distanceBruteM)} × ${fmtCoeff(l.coeffApplique)} = ${fmtNb(l.valeurAvantCapM)}` : null,
      operandes,
      note: contexteFamille(l),
    });
  } else {
    // Cumul : deux lectures autonomes (P1 dégagement, P2 patrimoine) puis combinaison selon le mode EFFECTIF.
    if (l.p1M !== null) {
      // Détail P1 : SOMME BRUTE affichée telle quelle (baseM + boostF4AppliqueM, addition d'affichage) — JAMAIS
      // remplacée par une valeur post-plafond, sinon l'égalité serait fausse. Deux plafonds possibles, chacun
      // DÉTECTÉ par comparaison de valeurs du seam (aucun min réimplémenté) : portée `distanceMaxM` (a mordu si la
      // somme brute ≠ p1AvantCapM, valeur classique déjà capée portée) ; `capP1M` (a mordu si p1AvantCapM ≠ p1M).
      const sommeBrute = l.baseM + l.boostF4AppliqueM;
      const porteeAMordu = l.p1AvantCapM !== null && sommeBrute !== l.p1AvantCapM;
      const capP1AMordu = l.p1AvantCapM !== null && l.p1M !== l.p1AvantCapM;
      const operandes: OperandeLegende[] = [
        opM(l.baseM, LIBELLES_ETAPE.distanceReelle),
        opBonus(l, profil),
        {
          valeur: `${fmtNb(sommeBrute)} m`,
          libelle: LIBELLES_ETAPE.scoreDegagementAvantPlafond,
          sousCalcul: `${fmtNb(l.baseM)} + ${fmtNb(l.boostF4AppliqueM)}`,
          sousOperandes: [opM(l.baseM, LIBELLES_ETAPE.distanceReelle), opM(l.boostF4AppliqueM, LIBELLES_ETAPE.bonusVegetation)],
        },
      ];
      let valeurRetenue: string | undefined;
      if (porteeAMordu) {
        valeurRetenue = ligneRetenue(l.p1AvantCapM as number, profil.distanceMaxM);
        operandes.push(opRetenue(l.p1AvantCapM as number, profil.distanceMaxM));
      }
      if (capP1AMordu) {
        valeurRetenue = ligneRetenue(l.p1M, profil.cumulNature.capP1M);
        operandes.push(opRetenue(l.p1M, profil.cumulNature.capP1M));
      }
      etapes.push({
        libelle: LIBELLES_ETAPE.scoreDegagement,
        valeur: l.p1M,
        unite: "m",
        expression: `${fmtNb(l.baseM)} + ${fmtNb(l.boostF4AppliqueM)} = ${fmtNb(sommeBrute)}`,
        valeurRetenue,
        operandes,
      });
    }
    if (l.p2M !== null) {
      const operandes: OperandeLegende[] = [];
      if (l.distanceBruteM !== null) operandes.push(opM(l.distanceBruteM, LIBELLES_ETAPE.distanceReelle));
      if (l.coeffApplique !== null) operandes.push(opX(l.coeffApplique, libelleMultiplicateur(l, enCone)));
      etapes.push({
        libelle: libelleScorePatrimoine(l),
        valeur: l.p2M,
        unite: "m",
        expression: l.distanceBruteM !== null && l.coeffApplique !== null ? `${fmtNb(l.distanceBruteM)} × ${fmtCoeff(l.coeffApplique)} = ${fmtNb(l.p2M)}` : null,
        operandes,
        note: contexteFamille(l),
      });
    }
    // Libellé de combinaison choisi d'après le mode RÉELLEMENT retenu (jamais présumé).
    const libCombi =
      l.modeCombinaison === "sequentiel" ? LIBELLES_ETAPE.combinaisonSequentiel
      : l.modeCombinaison === "max" ? LIBELLES_ETAPE.combinaisonMax
      : LIBELLES_ETAPE.combinaisonAddition;
    // Terme patrimoine PARENTHÉSÉ dès qu'il est divisé (règle générale « divisé ⟹ parenthèses », pas par mode).
    const p2Divise = l.diviseurCumulNature !== null && l.modeCombinaison === "sequentiel";
    const termeP2 = l.p2M !== null ? (p2Divise ? `(${fmtNb(l.p2M)} ÷ ${fmtNb(l.diviseurCumulNature as number)})` : `${fmtNb(l.p2M)}`) : null;
    const exprCombi =
      l.modeCombinaison !== "max" && l.p1M !== null && termeP2 !== null ? `${fmtNb(l.p1M)} + ${termeP2} = ${fmtNb(l.valeurAvantCapM)}` : null;
    const operandesCombi: OperandeLegende[] = [];
    if (l.p1M !== null) operandesCombi.push(opM(l.p1M, LIBELLES_ETAPE.scoreDegagement));
    if (l.p2M !== null) operandesCombi.push(opP2(l, enCone));
    if (p2Divise) operandesCombi.push(opX(l.diviseurCumulNature as number, LIBELLES_ETAPE.attenuation));
    etapes.push({ libelle: libCombi, valeur: l.valeurAvantCapM, unite: "m", expression: exprCombi, operandes: operandesCombi });
  }

  // Étape « valeur avant plafond » en évidence : la dernière étape dont la valeur == valeurAvantCapM.
  for (let i = etapes.length - 1; i >= 0; i--) {
    if (etapes[i].valeur === l.valeurAvantCapM) { etapes[i].misEnEvidence = true; break; }
  }

  // Étape finale « plafond appliqué » quand le cap famille mord OU que la valeur avant plafond dépasse la borne.
  if (l.capFamilleApplique || l.valeurAvantCapM > l.seuilBorneM) {
    etapes.push({
      libelle: LIBELLES_ETAPE.plafondApplique,
      valeur: l.distancePercueM,
      unite: "m",
      expression: null,
      valeurRetenue: ligneRetenue(l.distancePercueM, l.seuilBorneM),
      operandes: [opValeurAvantCap(l, enCone), opRetenue(l.distancePercueM, l.seuilBorneM)],
      note: LIBELLES_ETAPE.notePlafondAtteint,
    });
  }

  return etapes;
}

type LigneDetail =
  | { type: "section"; titre: string }
  | { type: "valeur"; libelle: string; brut: string; actif: string; test: string; depliable?: boolean };

/** Construit les lignes du tableau (Brut | Actif | Test) pour un faisceau, structurées par section. */
function construireLignes(a: LigneVentil, t: LigneVentil): LigneDetail[] {
  const r: LigneDetail[] = [
    { type: "section", titre: "Distances" },
    { type: "valeur", libelle: "Distance brute (m)", brut: fmt(a.distanceBruteM), actif: fmt(a.distanceBruteM), test: fmt(t.distanceBruteM) },
    { type: "valeur", libelle: "Distance pondérée (m)", brut: "—", actif: fmt(a.distancePercueM), test: fmt(t.distancePercueM), depliable: true },
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
function DetailFaisceau({ a, t, index, profilActif, profilTest, onFermer }: { a: LigneVentil; t: LigneVentil; index: number; profilActif: ProfilDegagement; profilTest: ProfilDegagement; onFermer: () => void }) {
  const statut = statutPonderation(t); // sur le run affiché (profil de test)
  const lignes = construireLignes(a, t);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const boutonRef = useRef<HTMLButtonElement | null>(null);
  const fermerModale = () => { setModaleOuverte(false); boutonRef.current?.focus(); }; // rend le focus au picto
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
                  <td style={{ padding: "3px 8px", color: "var(--color-svv-ink)" }}>
                    {ligne.libelle}
                    {ligne.depliable && (
                      <>
                        {/* Bouton d'information « i » : cercle bordé bien visible ; hover/focus = plein encre inversé ;
                            anneau de focus clavier ; zone de clic ≥ 24 px (pseudo transparent) ; transition coupée si
                            prefers-reduced-motion. <style> scopé (pattern déjà utilisé par la modale et l'éventail). */}
                        <style>{`.svv-info-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;margin-left:6px;vertical-align:middle;border-radius:9999px;border:1.5px solid var(--color-svv-ink);background:#fff;color:var(--color-svv-ink);font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:12px;line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease}.svv-info-btn::before{content:"";position:absolute;inset:-4px;border-radius:9999px}.svv-info-btn:hover{background:var(--color-svv-ink);color:#fff}.svv-info-btn:focus-visible{background:var(--color-svv-ink);color:#fff;outline:2px solid var(--color-svv-red);outline-offset:2px}@media (prefers-reduced-motion: reduce){.svv-info-btn{transition:none}}`}</style>
                        <button
                          ref={boutonRef}
                          type="button"
                          onClick={() => setModaleOuverte(true)}
                          aria-haspopup="dialog"
                          aria-expanded={modaleOuverte}
                          aria-label="Voir le détail du calcul de la distance pondérée"
                          title="Voir le détail du calcul de la distance pondérée"
                          className="svv-info-btn"
                        >
                          i
                        </button>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "var(--color-svv-gray)" }}>{ligne.brut}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "var(--color-svv-ink)" }}>{ligne.actif}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: differe ? "var(--color-svv-red)" : "var(--color-svv-ink)" }}>{ligne.test}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modaleOuverte && (
        <ModaleCalcul a={a} t={t} index={index} profilActif={profilActif} profilTest={profilTest} onFermer={fermerModale} />
      )}
    </div>
  );
}

/** Une colonne de la modale (Actif ou Test) : récit d'étapes dépliables + récapitulatif. `diff` = indices soulignés.
 *  Chaque cartouche : calcul en clair (clampé à 2 lignes), bouton « i » → déploie l'expression complète + les
 *  légendes de chaque nombre. État de déploiement LOCAL par cartouche, indépendant entre colonnes. */
function ColonneCalcul({ titre, couleur, l, etapes, diff, prefixId }: { titre: string; couleur: string; l: LigneVentil; etapes: EtapeCalcul[]; diff: Set<number>; prefixId: string }) {
  const [deployes, setDeployes] = useState<Record<number, boolean>>({});
  const basculer = (i: number) => setDeployes((d) => ({ ...d, [i]: !d[i] }));
  return (
    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: ".82rem", color: couleur, marginBottom: 8 }}>{titre}</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {etapes.map((e, i) => {
          const deploye = !!deployes[i];
          const detailId = `${prefixId}-etape-${i}`;
          return (
            <li
              key={i}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: e.misEnEvidence ? "color-mix(in srgb, var(--color-svv-green-soft) 70%, white)" : "var(--color-svv-field)",
                border: e.misEnEvidence ? "1px solid var(--color-svv-green-ink)" : "1px solid transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: ".78rem", color: "var(--color-svv-ink)", textDecoration: diff.has(i) ? "underline dotted" : "none" }}>{e.libelle}</span>
                <span style={{ fontSize: ".8rem", fontWeight: 700, color: couleur, whiteSpace: "nowrap" }}>
                  {fmtMontant(e.valeur)}{e.unite ? " m" : ""}
                </span>
              </div>
              {/* Calcul en clair : clampé à 2 lignes au repli, complet au déploiement. Montre le VRAI résultat. */}
              {e.expression && (
                <div className={deploye ? undefined : "svv-expr-clamp"} style={{ fontSize: ".72rem", color: "var(--color-svv-muted)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>
                  {e.expression}
                </div>
              )}
              {/* Ligne « Valeur retenue : X m (seuil max Y m) » — uniquement quand un plafond a effectivement mordu. */}
              {e.valeurRetenue && (
                <div style={{ fontSize: ".72rem", color: "var(--color-svv-ink)", fontWeight: 600, marginTop: 2 }}>{e.valeurRetenue}</div>
              )}
              {e.note && <div style={{ fontSize: ".72rem", color: "var(--color-svv-muted)", marginTop: 2 }}>{e.note}</div>}
              {e.operandes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    className="svv-info-btn-sm"
                    aria-expanded={deploye}
                    aria-controls={detailId}
                    aria-label={`Détail des valeurs : ${e.libelle}`}
                    title={`Détail des valeurs : ${e.libelle}`}
                    onClick={() => basculer(i)}
                  >
                    i
                  </button>
                </div>
              )}
              {deploye && e.operandes.length > 0 && (
                <div id={detailId} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--color-svv-line)", display: "flex", flexDirection: "column", gap: 2 }}>
                  {e.operandes.map((o, k) => (
                    <div key={k} style={{ fontSize: ".72rem", color: "var(--color-svv-muted)" }}>
                      <div>
                        <strong style={{ color: "var(--color-svv-ink)", fontFamily: "ui-monospace, monospace" }}>{o.valeur}</strong> — {o.libelle}
                        {o.sousCalcul ? <span style={{ fontFamily: "ui-monospace, monospace" }}> ({o.sousCalcul})</span> : null}
                      </div>
                      {o.sousOperandes && o.sousOperandes.length > 0 && (
                        <div style={{ marginLeft: 14, marginTop: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                          {o.sousOperandes.map((so, j) => (
                            <div key={j}>
                              <strong style={{ color: "var(--color-svv-ink)", fontFamily: "ui-monospace, monospace" }}>{so.valeur}</strong> — {so.libelle}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {/* Récapitulatif : valeur avant plafond → plafond appliqué → distance perçue finale. */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--color-svv-line)", fontSize: ".74rem", color: "var(--color-svv-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
        <span>{LIBELLES_ETAPE.valeurAvantPlafond} : <strong style={{ color: "var(--color-svv-ink)" }}>{fmtMontant(l.valeurAvantCapM)} m</strong></span>
        <span>{LIBELLES_ETAPE.plafondApplique} : <strong style={{ color: "var(--color-svv-ink)" }}>{fmtMontant(l.seuilBorneM)} m</strong></span>
        <span>{LIBELLES_ETAPE.distancePercue} : <strong style={{ color: couleur }}>{fmtMontant(l.distancePercueM)} m</strong></span>
        {l.dansChaineCouloir && <span style={{ marginTop: 2 }}>{LIBELLES_ETAPE.effetCouloir}</span>}
      </div>
    </div>
  );
}

/**
 * Modale « détail du calcul de la distance pondérée » — PUREMENT INFORMATIVE (lecture seule, aucun effet sur le
 * score, les faisceaux ou la base). Deux colonnes AUTONOMES (Actif vert / Test rouge), chacune issue de
 * `construireEtapesCalcul` avec SON profil. Accessible : role dialog, aria-modal, Échap, clic dehors, focus piégé,
 * focus rendu au picto par l'appelant. Respecte prefers-reduced-motion. Mobile : colonnes empilées < 640 px.
 */
function ModaleCalcul({ a, t, index, profilActif, profilTest, onFermer }: { a: LigneVentil; t: LigneVentil; index: number; profilActif: ProfilDegagement; profilTest: ProfilDegagement; onFermer: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const etapesA = construireEtapesCalcul(a, profilActif);
  const etapesT = construireEtapesCalcul(t, profilTest);

  // Indices dont la valeur diffère entre Actif et Test (soulignés discrètement ; comparaison par position, les
  // deux chaînes restant AUTONOMES — une étape sans contrepartie compte comme différente).
  const diffA = new Set<number>();
  const diffT = new Set<number>();
  const maxLen = Math.max(etapesA.length, etapesT.length);
  for (let i = 0; i < maxLen; i++) {
    const ea = etapesA[i];
    const et = etapesT[i];
    if (!ea || !et || ea.valeur !== et.valeur) {
      if (ea) diffA.add(i);
      if (et) diffT.add(i);
    }
  }

  // Échap ferme ; focus initial dans la modale ; focus PIÉGÉ (Tab cycle dans le dialog).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const focusables = () =>
      Array.from(dlg.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? dlg).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onFermer(); return; }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) { e.preventDefault(); return; }
        const premier = f[0];
        const dernier = f[f.length - 1];
        if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFermer]);

  const titreId = `modale-calcul-titre-${index}`;
  return (
    <div
      onClick={onFermer} // clic hors modale (sur l'overlay) ferme
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(22,32,44,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <style>{`@keyframes svvModaleIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.svv-expr-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.svv-info-btn-sm{position:relative;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:9999px;border:1.5px solid var(--color-svv-ink);background:#fff;color:var(--color-svv-ink);font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:10px;line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease}.svv-info-btn-sm::before{content:"";position:absolute;inset:-5px;border-radius:9999px}.svv-info-btn-sm:hover{background:var(--color-svv-ink);color:#fff}.svv-info-btn-sm:focus-visible{background:var(--color-svv-ink);color:#fff;outline:2px solid var(--color-svv-red);outline-offset:2px}@media (prefers-reduced-motion: reduce){.svv-modale-calcul{animation:none!important}.svv-info-btn-sm{transition:none}}`}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()} // clic DANS la modale ne ferme pas
        className="svv-modale-calcul"
        style={{
          background: "white",
          borderRadius: 14,
          border: "1px solid var(--color-svv-line)",
          boxShadow: "0 12px 40px rgba(22,32,44,.25)",
          width: "min(680px, 100%)",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: 16,
          animation: "svvModaleIn .16s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2 id={titreId} style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "var(--color-svv-ink)" }}>
            Détail du calcul — Faisceau {index + 1} · {signeOffset(a.offsetDeg)}
          </h2>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="svv-pill" style={{ padding: "2px 12px", background: "white", borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)", cursor: "pointer" }}>
            Fermer
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <ColonneCalcul titre="Moteur actif" couleur="var(--color-svv-green-ink)" l={a} etapes={etapesA} diff={diffA} prefixId={`actif-${index}`} />
          <ColonneCalcul titre="Profil de test" couleur="var(--color-svv-red)" l={t} etapes={etapesT} diff={diffT} prefixId={`test-${index}`} />
        </div>

        <p style={{ margin: "14px 0 0", fontSize: ".74rem", color: "var(--color-svv-muted)", lineHeight: 1.5 }}>
          La « valeur avant plafond » est indicative : elle n’entre pas dans le score. Seule la distance pondérée finale, une fois le plafond appliqué, est prise en compte.
        </p>
      </div>
    </div>
  );
}
