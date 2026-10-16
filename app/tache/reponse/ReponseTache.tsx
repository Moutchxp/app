"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Réponse à une tâche confiée, par le lien du mail (lot GESTION-ACCEPTATION, 16/10/2026). Sans connexion.
 *  - « Accepter » : l'OUVERTURE du lien n'enregistre RIEN (un antivirus de messagerie qui visite le lien ne peut pas
 *    accepter à la place du collaborateur — décision d'Arno du 16/10/2026). Seul le clic sur « Confirmer l'acceptation »
 *    enregistre → « Tâche acceptée ».
 *  - « Refuser » : le motif est demandé (obligatoire, règle 4), puis « Tâche refusée ».
 *  - Lien faux, expiré, remplacé, tâche terminée : message clair, rien n'est modifié.
 *  - Lien déjà utilisé (double clic, second clic plus tard) : la réponse déjà enregistrée est affichée, rien ne change.
 */

type Statut = "en_attente" | "acceptee" | "refusee";
interface Resume {
  tache: { objet: string; echeance: string; adresse: string; statut: Statut; demandeur: string } | null;
  peutRepondre: boolean;
  cause: string | null;
  message: string | null;
}
type Ecran =
  | { sorte: "chargement" }
  | { sorte: "choix"; r: Resume }
  | { sorte: "confirmer"; r: Resume }
  | { sorte: "motif"; r: Resume }
  | { sorte: "fait"; statut: "acceptee" | "refusee"; r: Resume; deja: boolean; agenda?: string }
  | { sorte: "refus_lien"; r: Resume }
  | { sorte: "erreur"; message: string };

/** Ce que l'agenda a réellement fait (phrase rendue par la synchronisation existante) — jamais une promesse non tenue. */
function phraseAgenda(agenda: string): string {
  if (agenda.includes("Agenda Google à jour")) return " La tâche est ajoutée à votre agenda.";
  if (agenda.includes("resynchroniser")) return " Elle sera ajoutée à votre agenda dans quelques minutes.";
  return "";
}

const MSG_RESEAU = "La réponse n’a pas pu être envoyée (réseau). Réessayez dans un instant.";

function Bloc({ titre, couleur, children }: { titre: string; couleur: "vert" | "rouge" | "neutre"; children?: React.ReactNode }) {
  const bandeau = couleur === "vert" ? "bg-svv-green" : couleur === "rouge" ? "bg-svv-red" : "bg-svv-ink";
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <h1 className={`${bandeau} px-6 py-5 text-[1.45rem] font-extrabold leading-tight text-white`}>{titre}</h1>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Tache({ r }: { r: Resume }) {
  if (r.tache === null) return null;
  return (
    <div className="rounded-xl border border-svv-line bg-svv-field p-4 text-svv-ink">
      <p className="text-lg font-bold">{r.tache.objet}</p>
      <p className="mt-1 text-base">{r.tache.echeance}</p>
      {r.tache.adresse && <p className="mt-1 text-sm text-svv-muted">{r.tache.adresse}</p>}
      {r.tache.demandeur && <p className="mt-1 text-sm text-svv-muted">Confiée par {r.tache.demandeur}</p>}
    </div>
  );
}

export function ReponseTache({ jeton, decision }: { jeton: string; decision: "accepter" | "refuser" | null }) {
  const [ecran, setEcran] = useState<Ecran>({ sorte: "chargement" });
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  const lance = useRef(false); // une seule LECTURE au chargement, même si React rend deux fois

  const repondre = async (d: "accepter" | "refuser", m?: string): Promise<void> => {
    setEnvoi(true);
    try {
      const res = await fetch("/api/tache/reponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, decision: d, ...(m !== undefined ? { motif: m } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.statut === "acceptee" || data?.statut === "refusee")) {
        setEcran({ sorte: "fait", statut: data.statut, r: data as Resume, deja: false, agenda: typeof data.agenda === "string" ? data.agenda : "" });
      } else if (res.status === 400) {
        setErreurMotif(typeof data?.erreur === "string" ? data.erreur : "Indiquez le motif du refus.");
      } else if (data && "peutRepondre" in data) {
        afficherResume(data as Resume);
      } else {
        setEcran({ sorte: "erreur", message: typeof data?.erreur === "string" ? data.erreur : MSG_RESEAU });
      }
    } catch {
      setEcran({ sorte: "erreur", message: MSG_RESEAU });
    } finally {
      setEnvoi(false);
    }
  };

  // Lien qui ne peut plus agir : déjà utilisé → la réponse enregistrée ; sinon le message clair.
  const afficherResume = (r: Resume) => {
    if (!r.peutRepondre && r.cause === "deja_utilise" && (r.tache?.statut === "acceptee" || r.tache?.statut === "refusee")) {
      setEcran({ sorte: "fait", statut: r.tache.statut, r, deja: true });
    } else if (!r.peutRepondre) {
      setEcran({ sorte: "refus_lien", r });
    } else if (decision === "refuser") {
      setEcran({ sorte: "motif", r });
    } else if (decision === "accepter") {
      setEcran({ sorte: "confirmer", r });
    } else {
      setEcran({ sorte: "choix", r });
    }
  };

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/tache/reponse?j=${encodeURIComponent(jeton)}`, { cache: "no-store" });
        const r = (await res.json()) as Resume & { erreur?: string };
        if (!res.ok) { setEcran({ sorte: "erreur", message: r.erreur ?? MSG_RESEAU }); return; }
        afficherResume(r); // LECTURE seule : l'ouverture du lien n'écrit jamais rien

      } catch {
        setEcran({ sorte: "erreur", message: MSG_RESEAU });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ecran.sorte === "chargement") {
    return <Bloc titre="Enregistrement de votre réponse…" couleur="neutre"><p className="text-svv-muted">Un instant.</p></Bloc>;
  }
  if (ecran.sorte === "erreur") {
    return <Bloc titre="Réponse non enregistrée" couleur="neutre"><p role="alert" className="text-svv-ink">{ecran.message}</p></Bloc>;
  }
  if (ecran.sorte === "refus_lien") {
    return (
      <Bloc titre="Ce lien ne peut plus servir" couleur="neutre">
        <p role="alert" className="mb-4 text-svv-ink">{ecran.r.message}</p>
        <Tache r={ecran.r} />
        <p className="mt-4 text-sm text-svv-muted">Rien n’a été modifié.</p>
      </Bloc>
    );
  }
  if (ecran.sorte === "fait") {
    const acceptee = ecran.statut === "acceptee";
    return (
      <Bloc titre={acceptee ? "Tâche acceptée" : "Tâche refusée"} couleur={acceptee ? "vert" : "rouge"}>
        <Tache r={ecran.r} />
        <p className="mt-4 text-svv-ink">
          {ecran.deja
            ? "Votre réponse avait déjà été enregistrée : rien n’a été modifié."
            : acceptee
              ? `Merci !${phraseAgenda(ecran.agenda ?? "")}`
              : "Votre refus est enregistré : la personne qui vous l’a confiée va la réattribuer."}
        </p>
      </Bloc>
    );
  }
  if (ecran.sorte === "confirmer") {
    return (
      <Bloc titre="Accepter cette tâche" couleur="vert">
        <Tache r={ecran.r} />
        <button
          type="button"
          disabled={envoi}
          onClick={() => void repondre("accepter")}
          className={`svv-btn svv-btn-primary mt-4 ${envoi ? "opacity-50" : ""}`}
        >
          {envoi ? "Enregistrement…" : "Confirmer l’acceptation"}
        </button>
      </Bloc>
    );
  }
  if (ecran.sorte === "motif") {
    return (
      <Bloc titre="Refuser cette tâche" couleur="rouge">
        <Tache r={ecran.r} />
        <label htmlFor="motif-refus" className="mb-1 mt-4 block text-sm font-semibold text-svv-ink">
          Motif du refus <span className="text-svv-red">*</span>
        </label>
        <textarea
          id="motif-refus"
          value={motif}
          onChange={(e) => { setMotif(e.target.value); setErreurMotif(null); }}
          rows={3}
          maxLength={1000}
          className={`w-full rounded-xl ${erreurMotif ? "border-2 border-svv-red" : "border border-svv-line"} bg-white p-3 text-base text-svv-ink focus:border-svv-red focus:outline-none`}
          placeholder="Ex. déjà pris ce jour-là"
        />
        {erreurMotif && <p role="alert" className="mt-1 text-sm text-svv-red">{erreurMotif}</p>}
        <button
          type="button"
          disabled={envoi}
          onClick={() => {
            if (motif.trim() === "") { setErreurMotif("Indiquez le motif du refus."); return; }
            void repondre("refuser", motif.trim());
          }}
          className={`svv-btn svv-btn-primary mt-4 ${envoi ? "opacity-50" : ""}`}
        >
          {envoi ? "Enregistrement…" : "Confirmer le refus"}
        </button>
      </Bloc>
    );
  }
  // Lien sans décision (ou décision inconnue) : les deux choix.
  return (
    <Bloc titre="Une tâche vous est confiée" couleur="neutre">
      <Tache r={ecran.r} />
      <button type="button" disabled={envoi} onClick={() => void repondre("accepter")} className={`svv-btn svv-btn-primary mt-4 ${envoi ? "opacity-50" : ""}`}>
        {envoi ? "Enregistrement…" : "Accepter"}
      </button>
      <button type="button" disabled={envoi} onClick={() => setEcran({ sorte: "motif", r: ecran.r })} className="svv-btn svv-btn-outline mt-3">
        Refuser
      </button>
    </Bloc>
  );
}
