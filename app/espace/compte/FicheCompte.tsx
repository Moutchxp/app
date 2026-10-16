"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { CadenasInfo } from "./CadenasInfo";
import { AdresseAutocomplete } from "../../components/AdresseAutocomplete";
import {
  LIB_CHAMP_PRENOM, LIB_CHAMP_NOM, LIB_CHAMP_EMAIL_COMPTE, LIB_CHAMP_TELEPHONE, LIB_CHAMP_RESIDENCE, PLACEHOLDER_RESIDENCE,
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
  adresseResidence: string | null;
}

/** Ligne en LECTURE : libellé + valeur, avec cadenas optionnel (champs non modifiables). `long` : valeur sur plusieurs lignes. */
function LigneLecture({ label, valeur, cadenas, long }: { label: string; valeur: string; cadenas?: ReactNode; long?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-svv-line py-3">
      <div className="min-w-0">
        <span className="svv-label block">{label}</span>
        <span className={long ? "block break-words text-sm text-svv-ink" : "block truncate text-sm text-svv-ink"}>{valeur}</span>
      </div>
      {cadenas}
    </div>
  );
}

/**
 * Fiche « Mon compte » (client). LECTURE d'abord : les 5 infos affichées. « Modifier » bascule prénom/nom ET l'adresse de
 * résidence principale (même saisie à auto-complétion que le tunnel ; lot COORDONNEES-CONNU-REEL) en champs de saisie
 * (Enregistrer / Annuler). « Annuler » restaure les valeurs initiales SANS appel réseau. E-mail et téléphone
 * TOUJOURS en lecture seule, avec cadenas. Succès → mode lecture + valeurs NORMALISÉES renvoyées par la route +
 * confirmation `role=status`. Échec → `role=alert`, valeurs saisies CONSERVÉES. Aucune animation.
 */
export function FicheCompte({ initial }: { initial: Coordonnees }) {
  const [edition, setEdition] = useState(false);
  const [prenom, setPrenom] = useState(initial.prenom ?? "");
  const [nom, setNom] = useState(initial.nom ?? "");
  const [residence, setResidence] = useState(initial.adresseResidence ?? "");
  const [ref, setRef] = useState({ prenom: initial.prenom ?? "", nom: initial.nom ?? "", residence: initial.adresseResidence ?? "" }); // valeurs en base (pour Annuler + affichage lecture)
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
    setResidence(ref.residence);
    setEdition(true);
  }

  function annuler() {
    setPrenom(ref.prenom); // restaure les valeurs initiales, aucun appel réseau
    setNom(ref.nom);
    setResidence(ref.residence);
    setErreur(null);
    setEdition(false);
  }

  // N'envoie que ce qui a changé (pas de fausse « rectification » au journal) ; rien de changé → comme avant, prénom/nom.
  function corpsModification(): Record<string, string> {
    const corps: Record<string, string> = {};
    if (prenom !== ref.prenom || nom !== ref.nom) Object.assign(corps, { prenom, nom });
    if (residence !== ref.residence) corps.adresseResidence = residence;
    return Object.keys(corps).length > 0 ? corps : { prenom, nom };
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
        body: JSON.stringify(corpsModification()),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const p = typeof data?.prenom === "string" ? data.prenom : prenom; // valeurs normalisées réellement en base
        const n = typeof data?.nom === "string" ? data.nom : nom;
        const r = data && "adresseResidence" in data ? (data.adresseResidence ?? "") : residence;
        setRef({ prenom: p, nom: n, residence: r });
        setPrenom(p);
        setNom(n);
        setResidence(r);
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
            <LigneLecture label={LIB_CHAMP_RESIDENCE} valeur={ref.residence || MSG_VALEUR_ABSENTE} long />
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

          {/* Adresse de résidence principale — même saisie à auto-complétion (BAN) que dans le tunnel. */}
          <div className="flex flex-col gap-1">
            <span className="svv-label">{LIB_CHAMP_RESIDENCE}</span>
            <AdresseAutocomplete
              value={residence}
              onChange={setResidence}
              onSelect={(s) => setResidence(s.label)}
              placeholder={PLACEHOLDER_RESIDENCE}
            />
          </div>

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
