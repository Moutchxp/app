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

/** Ligne de ventilation d'un faisceau (miroir de VentilationFaisceau du seam Lot 1). */
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
}

export interface BornesArcs {
  base: number; // distanceMaxM (arc 200)
  famille: number; // max(mh.distMaxM, inv.distMaxM) (arc 400)
  mondial: number; // mondialFaisceauM (arc 800)
}

type SerieId = "actif" | "test" | "brut";
const COULEUR: Record<SerieId, string> = {
  actif: "var(--color-svv-ink)",
  test: "var(--color-svv-red)",
  brut: "var(--color-svv-muted)",
};
const LIBELLE_SERIE: Record<SerieId, string> = { actif: "Moteur actif", test: "Profil de test", brut: "Brut (géométrique)" };

// Géométrie SVG (schématique — PAS à l'échelle, BE-60).
const W = 360;
const H = 196;
const OX = W / 2;
const OY = H - 8;
const R0 = 0;
const R200 = 92;
const R400 = 132;
const R800 = 168;

const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (d: number, d0: number, d1: number, r0: number, r1: number) =>
  d1 === d0 ? r0 : r0 + ((d - d0) / (d1 - d0)) * (r1 - r0);

export default function EventailFaisceaux({
  actif,
  test,
  bornes,
}: {
  actif: LigneVentil[];
  test: LigneVentil[];
  bornes: BornesArcs;
}) {
  const [visibles, setVisibles] = useState<Record<SerieId, boolean>>({ actif: true, test: true, brut: false });
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

  const focus = survol ?? selection;
  const reduce = "prefers-reduced-motion";

  return (
    <div>
      {/* Filtres de séries (BE-64/64a) */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        {(["actif", "test", "brut"] as SerieId[]).map((s) => (
          <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--color-svv-ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={visibles[s]} onChange={(e) => setVisibles((v) => ({ ...v, [s]: e.target.checked }))} />
            <span style={{ display: "inline-block", width: 12, height: 3, background: COULEUR[s] }} />
            {LIBELLE_SERIE[s]}
          </label>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 520, display: "block" }} role="img" aria-label="Éventail des 61 faisceaux">
          <style>{`@media (${reduce}: reduce){.svv-ev *{transition:none!important;animation:none!important}}`}</style>
          <g className="svv-ev">
            {/* Arcs de seuil (dérivés des bornes du profil) */}
            {[R200, R400, R800].map((r, i) => (
              <polyline key={r} points={arc(r)} fill="none" stroke="var(--color-svv-line)" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
            ))}
            {[
              { r: R200, t: `${Math.round(bornes.base)} m` },
              { r: R400, t: `${Math.round(bornes.famille)} m` },
              { r: R800, t: `${Math.round(bornes.mondial)} m` },
            ].map(({ r, t }) => {
              const p = pointFor(90, r);
              return <text key={r} x={p.x + 2} y={p.y - 2} fontSize="8" fill="var(--color-svv-muted)">{t}</text>;
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

            {/* Séries (polyligne des tips) — repos = tracés seuls (BE-65a) */}
            {(["brut", "actif", "test"] as SerieId[]).map((s) => {
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
            {focus != null && (["actif", "test", "brut"] as SerieId[]).map((s) => {
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

      {/* Détail par faisceau (BE-66/66a) : actif vs test, écarts surlignés ; brut en repère neutre */}
      {selection != null && actif[selection] && test[selection] && (
        <DetailFaisceau a={actif[selection]} t={test[selection]} index={selection} onFermer={() => setSelection(null)} />
      )}
    </div>
  );
}

const LIGNES_DETAIL: { cle: keyof LigneVentil; libelle: string }[] = [
  { cle: "distanceBruteM", libelle: "Distance brute (m)" },
  { cle: "distancePercueM", libelle: "Distance perçue (m)" },
  { cle: "seuilBorneM", libelle: "Borne du profil (m)" },
  { cle: "famille", libelle: "Famille appliquée" },
  { cle: "coeffApplique", libelle: "Coeff cône/flanc" },
  { cle: "boostF4AppliqueM", libelle: "Boost F4 nature (m)" },
  { cle: "natureTraverseeM", libelle: "Nature traversée (m)" },
  { cle: "diviseurCumulNature", libelle: "Diviseur cumul" },
  { cle: "modeCombinaison", libelle: "Mode combinaison" },
  { cle: "capFamilleApplique", libelle: "Cap famille appliqué" },
];

function fmt(v: number | string | boolean | null): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return v;
}

/** Détail seam d'un faisceau : deux colonnes (actif/test), lignes surlignées si elles diffèrent (BE-66a). */
function DetailFaisceau({ a, t, index, onFermer }: { a: LigneVentil; t: LigneVentil; index: number; onFermer: () => void }) {
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--color-svv-line)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="svv-label">Faisceau {index + 1} — offset {a.offsetDeg}°</span>
        <button type="button" onClick={onFermer} className="svv-pill" style={{ padding: "2px 10px", borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)" }}>Fermer</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: ".8rem", width: "100%", minWidth: 320 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "3px 8px", color: "var(--color-svv-muted)", fontWeight: 600 }}>Contribution</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: "var(--color-svv-ink)" }}>Actif</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: "var(--color-svv-red)" }}>Test</th>
            </tr>
          </thead>
          <tbody>
            {LIGNES_DETAIL.map(({ cle, libelle }) => {
              const va = a[cle] as number | string | boolean | null;
              const vt = t[cle] as number | string | boolean | null;
              const differe = String(va) !== String(vt);
              const neutre = cle === "distanceBruteM"; // brut = repère neutre (identique)
              return (
                <tr key={cle} style={{ background: differe && !neutre ? "rgba(163,4,2,.08)" : "transparent" }}>
                  <td style={{ padding: "3px 8px", color: "var(--color-svv-ink)" }}>{libelle}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: "var(--color-svv-ink)" }}>{fmt(va)}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", color: differe && !neutre ? "var(--color-svv-red)" : "var(--color-svv-ink)" }}>{fmt(vt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
