"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";
import {
  AVERTISSEMENTS_SUPPRESSION, CONSEIL_TELECHARGER_SUPPRESSION, LIB_ALLER_ESPACE,
  LIB_CASE_SUPPRESSION, LIB_CHAMP_MDP_SUPPRESSION, LIB_BOUTON_SUPPRIMER, LIB_SUPPRESSION_EN_COURS,
  LIB_ANNULER_SUPPRESSION, MSG_SUPPRESSION_MDP, MSG_SUPPRESSION_THROTTLE, MSG_SUPPRESSION_ERREUR,
} from "../../presentation";

const styleInput: CSSProperties = {
  width: "100%", padding: ".75rem", minHeight: 44, fontSize: 16,
  borderRadius: ".6rem", border: "1px solid var(--color-svv-line)",
};

/**
 * Formulaire de SUPPRESSION de compte (client). Affiche l'avertissement (conséquences), le conseil de sauvegarde, puis
 * une case à cocher + un champ mot de passe. Le bouton n'est actif que si la case est cochée ET le mot de passe saisi.
 * POST `/api/internaute/espace/compte/supprimer` — succès → accueil ; échec → `role=alert`, la case RESTE cochée, le mot
 * de passe est VIDÉ. Anti-double-clic. Aucune animation.
 */
export function FormulaireSuppression() {
  const [compris, setCompris] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const actif = compris && motDePasse.trim() !== "" && !enCours;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!actif) return; // anti-double-clic + garde (case + mot de passe requis)
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/internaute/espace/compte/supprimer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse }),
      });
      if (res.ok) {
        window.location.href = "/"; // compte supprimé, session détruite → accueil
        return;
      }
      setMotDePasse(""); // échec : on vide le mot de passe, la case reste cochée
      setErreur(res.status === 401 ? MSG_SUPPRESSION_MDP : res.status === 429 ? MSG_SUPPRESSION_THROTTLE : MSG_SUPPRESSION_ERREUR);
    } catch {
      setMotDePasse("");
      setErreur(MSG_SUPPRESSION_ERREUR);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* AVERTISSEMENT : chaque conséquence énoncée séparément. */}
      <ul className="flex flex-col gap-2">
        {AVERTISSEMENTS_SUPPRESSION.map((texte, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-svv-ink">
            <span aria-hidden="true" className="text-svv-red">•</span>
            <span>{texte}</span>
          </li>
        ))}
      </ul>

      {/* CONSEIL avant les contrôles : sauvegarder ses documents, avec lien vers l'espace. */}
      <div className="svv-page-note" style={{ marginTop: 0 }}>
        <p style={{ margin: 0 }}>{CONSEIL_TELECHARGER_SUPPRESSION}</p>
        <Link href="/espace" className="svv-link" style={{ minHeight: 44, justifyContent: "flex-start" }}>{LIB_ALLER_ESPACE}</Link>
      </div>

      <form onSubmit={soumettre} className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm text-svv-ink" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            checked={compris}
            onChange={(e) => setCompris(e.target.checked)}
            style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--color-svv-red)" }}
          />
          <span>{LIB_CASE_SUPPRESSION}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="svv-label">{LIB_CHAMP_MDP_SUPPRESSION}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="svv-input"
            style={styleInput}
          />
        </label>

        {erreur && <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{erreur}</p>}

        <button type="submit" disabled={!actif} className="svv-btn svv-btn-primary" style={{ marginTop: ".25rem" }}>
          {enCours ? LIB_SUPPRESSION_EN_COURS : LIB_BOUTON_SUPPRIMER}
        </button>
        <Link href="/espace/compte" className="svv-btn svv-btn-outline">{LIB_ANNULER_SUPPRESSION}</Link>
      </form>
    </div>
  );
}
