"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { CadenasInfo } from "./CadenasInfo";
import {
  LIB_CHAMP_PRENOM, LIB_CHAMP_NOM, LIB_CHAMP_EMAIL_COMPTE, LIB_CHAMP_TELEPHONE,
  MSG_VALEUR_ABSENTE, MSG_TELEPHONE_ABSENT,
  LIB_MODIFIER, LIB_ENREGISTRER, LIB_ENREGISTREMENT, LIB_ANNULER,
  MSG_COMPTE_ENREGISTRE, MSG_COMPTE_VALIDATION, MSG_COMPTE_ERREUR,
} from "../presentation";

const styleInput: CSSProperties = {
  width: "100%", padding: ".75rem", minHeight: 44, fontSize: 16,
  borderRadius: ".6rem", border: "1px solid var(--color-svv-line)",
};

interface Coordonnees {
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
}

/** Ligne en LECTURE : libellé + valeur, avec cadenas optionnel (champs non modifiables). */
function LigneLecture({ label, valeur, cadenas }: { label: string; valeur: string; cadenas?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-svv-line py-3">
      <div className="min-w-0">
        <span className="svv-label block">{label}</span>
        <span className="block truncate text-sm text-svv-ink">{valeur}</span>
      </div>
      {cadenas}
    </div>
  );
}

/**
 * Fiche « Mon compte » (client). LECTURE d'abord : les 4 infos affichées. « Modifier » bascule prénom/nom en champs de
 * saisie (Enregistrer / Annuler). « Annuler » restaure les valeurs initiales SANS appel réseau. E-mail et téléphone
 * TOUJOURS en lecture seule, avec cadenas. Succès → mode lecture + valeurs NORMALISÉES renvoyées par la route +
 * confirmation `role=status`. Échec → `role=alert`, valeurs saisies CONSERVÉES. Aucune animation.
 */
export function FicheCompte({ initial }: { initial: Coordonnees }) {
  const [edition, setEdition] = useState(false);
  const [prenom, setPrenom] = useState(initial.prenom ?? "");
  const [nom, setNom] = useState(initial.nom ?? "");
  const [ref, setRef] = useState({ prenom: initial.prenom ?? "", nom: initial.nom ?? "" }); // valeurs en base (pour Annuler + affichage lecture)
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const email = initial.email ?? MSG_VALEUR_ABSENTE;
  const telephone = initial.telephone ?? MSG_TELEPHONE_ABSENT;

  function ouvrirEdition() {
    setSucces(false);
    setErreur(null);
    setPrenom(ref.prenom);
    setNom(ref.nom);
    setEdition(true);
  }

  function annuler() {
    setPrenom(ref.prenom); // restaure les valeurs initiales, aucun appel réseau
    setNom(ref.nom);
    setErreur(null);
    setEdition(false);
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (enCours) return; // anti-double-clic
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/internaute/espace/compte", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom, nom }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const p = typeof data?.prenom === "string" ? data.prenom : prenom; // valeurs normalisées réellement en base
        const n = typeof data?.nom === "string" ? data.nom : nom;
        setRef({ prenom: p, nom: n });
        setPrenom(p);
        setNom(n);
        setEdition(false);
        setSucces(true);
        return;
      }
      setErreur(res.status === 400 ? MSG_COMPTE_VALIDATION : MSG_COMPTE_ERREUR); // valeurs saisies conservées
    } catch {
      setErreur(MSG_COMPTE_ERREUR);
    } finally {
      setEnCours(false);
    }
  }

  const cadenasEmail = <CadenasInfo cible="email" />;
  const cadenasTel = <CadenasInfo cible="telephone" />;

  return (
    <div className="flex flex-col gap-4">
      {!edition ? (
        <>
          <div>
            <LigneLecture label={LIB_CHAMP_PRENOM} valeur={ref.prenom || MSG_VALEUR_ABSENTE} />
            <LigneLecture label={LIB_CHAMP_NOM} valeur={ref.nom || MSG_VALEUR_ABSENTE} />
            <LigneLecture label={LIB_CHAMP_EMAIL_COMPTE} valeur={email} cadenas={cadenasEmail} />
            <LigneLecture label={LIB_CHAMP_TELEPHONE} valeur={telephone} cadenas={cadenasTel} />
          </div>

          {succes && (
            <p role="status" className="svv-page-note" style={{ marginTop: 0 }}>{MSG_COMPTE_ENREGISTRE}</p>
          )}

          <button type="button" onClick={ouvrirEdition} className="svv-btn svv-btn-primary">
            {LIB_MODIFIER}
          </button>
        </>
      ) : (
        <form onSubmit={enregistrer} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="svv-label">{LIB_CHAMP_PRENOM}</span>
            <input type="text" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="svv-input" style={styleInput} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="svv-label">{LIB_CHAMP_NOM}</span>
            <input type="text" autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} className="svv-input" style={styleInput} />
          </label>

          {/* E-mail et téléphone restent en lecture seule même en édition. */}
          <LigneLecture label={LIB_CHAMP_EMAIL_COMPTE} valeur={email} cadenas={cadenasEmail} />
          <LigneLecture label={LIB_CHAMP_TELEPHONE} valeur={telephone} cadenas={cadenasTel} />

          {erreur && <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{erreur}</p>}

          <button type="submit" disabled={enCours} className="svv-btn svv-btn-primary" style={{ marginTop: ".25rem" }}>
            {enCours ? LIB_ENREGISTREMENT : LIB_ENREGISTRER}
          </button>
          <button type="button" onClick={annuler} disabled={enCours} className="svv-btn svv-btn-outline">
            {LIB_ANNULER}
          </button>
        </form>
      )}
    </div>
  );
}
