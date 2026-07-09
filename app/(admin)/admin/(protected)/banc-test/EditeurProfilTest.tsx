"use client";

/**
 * Banc M5 · Lot 2b — Éditeur du PROFIL DE TEST (les 38 variables + cartes d'année).
 *
 * Édite UNIQUEMENT un clone en mémoire (`profilTest`) : le profil ACTIF et `config_scoring` restent intacts
 * (aucune écriture DB). Réutilise les métadonnées de M1 (`pilotage/mappingConfig` META : libellés, bornes,
 * statuts, types) via le pont colonne↔champ (`pontProfil`). Les VESTIGIALES (sans effet sur le score) sont
 * grisées/lecture seule. Cartes d'année : CRUD + validation anti-chevauchement (`validerCartesAnnee`, Lot 2).
 */
import { useMemo } from "react";
import type { ProfilDegagement } from "../../../../lib/svv/profilDegagement";
import type { CarteAnnee } from "../../../../lib/svv/cartesAnnee";
import { clonerProfil, diffProfils, validerCartesAnnee } from "../../../../lib/svv/profilTest";
import { META, FAMILLES_ORDRE, type ColonneMeta } from "../pilotage/mappingConfig";
import { pontParColonne } from "./pontProfil";

const COULEUR_STATUT: Record<string, string> = {
  VIVE: "var(--color-svv-green)",
  "DE GARDE": "#b45309",
  VESTIGIALE: "var(--color-svv-muted)",
  MIROIR: "var(--color-svv-muted)",
  technique: "var(--color-svv-muted)",
};

export default function EditeurProfilTest({
  profilActif,
  profilTest,
  onChange,
  onReset,
}: {
  profilActif: ProfilDegagement | null;
  profilTest: ProfilDegagement | null;
  onChange: (p: ProfilDegagement) => void;
  onReset: () => void;
}) {
  const ecarts = useMemo(
    () => (profilActif && profilTest ? diffProfils(profilActif, profilTest) : null),
    [profilActif, profilTest],
  );
  const erreursCartes = useMemo(
    () => (profilTest ? validerCartesAnnee(profilTest.famillesAnnee) : { ok: true as const }),
    [profilTest],
  );

  if (!profilActif || !profilTest) {
    return <p style={{ color: "var(--color-svv-muted)", fontSize: ".85rem" }}>Chargement du profil actif…</p>;
  }

  // Écrit une valeur scalaire (clampée aux bornes META) dans un clone → onChange.
  function editerScalaire(meta: ColonneMeta, brut: string) {
    const pont = pontParColonne(meta.colonne);
    if (!pont || !meta.editable) return;
    const next = clonerProfil(profilTest!);
    if (meta.type === "enum") {
      pont.ecrire(next, brut);
    } else {
      let v = Number(brut);
      if (!Number.isFinite(v)) return;
      if (typeof meta.min === "number") v = Math.max(meta.min, v);
      if (typeof meta.max === "number") v = Math.min(meta.max, v);
      pont.ecrire(next, v);
    }
    onChange(next);
  }

  function editerCartes(cartes: CarteAnnee[]) {
    const next = clonerProfil(profilTest!);
    next.famillesAnnee = cartes;
    onChange(next);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span className="svv-label">Profil de test — {ecarts?.total ?? 0} écart(s)</span>
        <button
          type="button"
          onClick={onReset}
          disabled={(ecarts?.total ?? 0) === 0}
          className="svv-pill"
          style={{ padding: "3px 12px", opacity: (ecarts?.total ?? 0) === 0 ? 0.5 : 1, borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)" }}
        >
          Réinitialiser (= profil actif)
        </button>
      </div>

      {/* Scalaires groupés par famille (ordre M1) */}
      {FAMILLES_ORDRE.map((famille) => {
        const colonnes = META.filter((m) => m.famille === famille && m.colonne !== "id" && pontParColonne(m.colonne));
        if (colonnes.length === 0) return null;
        return (
          <fieldset key={famille} style={{ border: "1px solid var(--color-svv-line)", borderRadius: 10, padding: "10px 12px", margin: "0 0 10px", background: "var(--color-svv-field)" }}>
            <legend style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--color-svv-ink)", padding: "0 6px" }}>{famille}</legend>
            <div style={{ display: "grid", gap: 8 }}>
              {colonnes.map((meta) => (
                <ChampScalaire
                  key={meta.colonne}
                  meta={meta}
                  valeur={pontParColonne(meta.colonne)!.lire(profilTest)}
                  valeurActive={pontParColonne(meta.colonne)!.lire(profilActif)}
                  onEdit={(brut) => editerScalaire(meta, brut)}
                />
              ))}
            </div>
          </fieldset>
        );
      })}

      {/* Cartes d'année (famillesAnnee) — CRUD + validation anti-chevauchement */}
      <fieldset style={{ border: "1px solid var(--color-svv-line)", borderRadius: 10, padding: "10px 12px", margin: "0 0 10px", background: "var(--color-svv-field)" }}>
        <legend style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--color-svv-ink)", padding: "0 6px" }}>
          Cartes d’année de construction
        </legend>
        <div style={{ display: "grid", gap: 8 }}>
          {profilTest.famillesAnnee.map((carte, i) => (
            <CarteLigne
              key={i}
              carte={carte}
              onEdit={(c) => editerCartes(profilTest.famillesAnnee.map((x, j) => (j === i ? c : x)))}
              onSupprimer={() => editerCartes(profilTest.famillesAnnee.filter((_, j) => j !== i))}
            />
          ))}
          {profilTest.famillesAnnee.length === 0 && (
            <p style={{ margin: 0, fontSize: ".8rem", color: "var(--color-svv-muted)" }}>Aucune carte (aucun bonus d’année).</p>
          )}
          <button
            type="button"
            onClick={() =>
              editerCartes([
                ...profilTest.famillesAnnee,
                { borneMin: null, opMin: null, borneMax: 1900, opMax: "<=", cone: 1.5, flanc: 1.2, distMaxM: 300 },
              ])
            }
            className="svv-pill"
            style={{ padding: "3px 12px", justifySelf: "start", borderColor: "var(--color-svv-line)", color: "var(--color-svv-ink)" }}
          >
            + Ajouter une carte
          </button>
          {!erreursCartes.ok && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--color-svv-red)", fontSize: ".8rem" }}>
              {erreursCartes.erreurs.map((e, i) => (
                <li key={i}>{e.index != null ? `Carte ${e.index + 1} : ` : ""}{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>
    </div>
  );
}

/** Une variable scalaire : libellé + statut + saisie (nombre/enum) ou lecture seule (vestigiale/liste). */
function ChampScalaire({
  meta,
  valeur,
  valeurActive,
  onEdit,
}: {
  meta: ColonneMeta;
  valeur: number | string | readonly string[];
  valeurActive: number | string | readonly string[];
  onEdit: (brut: string) => void;
}) {
  const modifie = String(valeur) !== String(valeurActive);
  const vestigiale = meta.statut === "VESTIGIALE" || !meta.editable;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: vestigiale ? 0.6 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: ".82rem", color: "var(--color-svv-ink)" }}>
          {meta.libelle}
          {modifie && <span style={{ marginLeft: 6, color: "var(--color-svv-red)", fontWeight: 700 }} title="modifié">●</span>}
        </div>
        <div style={{ fontSize: ".68rem", color: COULEUR_STATUT[meta.statut] ?? "var(--color-svv-muted)" }}>
          {meta.statut}
          {vestigiale ? " — sans effet sur le score" : ""} · {meta.unite}
        </div>
      </div>
      {vestigiale ? (
        <div style={{ fontSize: ".82rem", color: "var(--color-svv-muted)", whiteSpace: "nowrap" }}>
          {Array.isArray(valeur) ? `${valeur.length} élément(s)` : String(valeur)}
        </div>
      ) : meta.type === "enum" ? (
        <select
          value={String(valeur)}
          onChange={(e) => onEdit(e.target.value)}
          className="rounded-lg border border-svv-line bg-white px-2 py-1 text-sm text-svv-ink focus:border-svv-red focus:outline-none"
          style={modifie ? { borderColor: "var(--color-svv-red)", boxShadow: "0 0 0 1px var(--color-svv-red)" } : undefined}
        >
          {(meta.optionsEnum ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={String(valeur)}
          min={meta.min}
          max={meta.max}
          step={meta.pas ?? "any"}
          onChange={(e) => onEdit(e.target.value)}
          className="rounded-lg border border-svv-line bg-white px-2 py-1 text-sm text-svv-ink focus:border-svv-red focus:outline-none"
          style={{ width: 110, ...(modifie ? { borderColor: "var(--color-svv-red)", boxShadow: "0 0 0 1px var(--color-svv-red)" } : {}) }}
        />
      )}
    </div>
  );
}

const OPS_MIN: readonly (string)[] = ["", ">=", ">"];
const OPS_MAX: readonly (string)[] = ["", "<=", "<"];

/** Une carte d'année éditable (bornes + opérateurs + coeffs) + suppression. */
function CarteLigne({
  carte,
  onEdit,
  onSupprimer,
}: {
  carte: CarteAnnee;
  onEdit: (c: CarteAnnee) => void;
  onSupprimer: () => void;
}) {
  const nb = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  const champStyle = "rounded-lg border border-svv-line bg-white px-2 py-1 text-sm text-svv-ink focus:border-svv-red focus:outline-none";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, borderTop: "1px dashed var(--color-svv-line)", paddingTop: 8 }}>
      <span style={{ fontSize: ".72rem", color: "var(--color-svv-muted)" }}>Année</span>
      <select value={carte.opMin ?? ""} onChange={(e) => onEdit({ ...carte, opMin: (e.target.value || null) as CarteAnnee["opMin"] })} className={champStyle}>
        {OPS_MIN.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
      <input type="number" value={carte.borneMin ?? ""} placeholder="min" onChange={(e) => onEdit({ ...carte, borneMin: nb(e.target.value) })} className={champStyle} style={{ width: 84 }} />
      <select value={carte.opMax ?? ""} onChange={(e) => onEdit({ ...carte, opMax: (e.target.value || null) as CarteAnnee["opMax"] })} className={champStyle}>
        {OPS_MAX.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
      <input type="number" value={carte.borneMax ?? ""} placeholder="max" onChange={(e) => onEdit({ ...carte, borneMax: nb(e.target.value) })} className={champStyle} style={{ width: 84 }} />
      <span style={{ fontSize: ".72rem", color: "var(--color-svv-muted)" }}>cône</span>
      <input type="number" step="0.1" value={carte.cone} onChange={(e) => onEdit({ ...carte, cone: Number(e.target.value) })} className={champStyle} style={{ width: 70 }} />
      <span style={{ fontSize: ".72rem", color: "var(--color-svv-muted)" }}>flanc</span>
      <input type="number" step="0.1" value={carte.flanc} onChange={(e) => onEdit({ ...carte, flanc: Number(e.target.value) })} className={champStyle} style={{ width: 70 }} />
      <span style={{ fontSize: ".72rem", color: "var(--color-svv-muted)" }}>cap</span>
      <input type="number" value={carte.distMaxM} onChange={(e) => onEdit({ ...carte, distMaxM: Number(e.target.value) })} className={champStyle} style={{ width: 80 }} />
      <button type="button" onClick={onSupprimer} aria-label="Supprimer la carte" className="svv-pill" style={{ padding: "2px 10px", borderColor: "var(--color-svv-line)", color: "var(--color-svv-red)" }}>
        ✕
      </button>
    </div>
  );
}
