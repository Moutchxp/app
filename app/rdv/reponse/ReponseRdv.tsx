"use client";

import { useEffect, useRef, useState } from "react";
import { BOUTON_ACCEPTER, BOUTON_REFUSER, type SorteRdv } from "../../lib/location/reponsesRdv";

/**
 * La réponse d'un locataire à un rendez-vous (pré-visite ou état des lieux de sortie), par le lien de son mail (Arno, 18/11/2026). Sans connexion.
 *  · L'OUVERTURE du lien n'enregistre RIEN (une messagerie qui vérifie les liens ne répond jamais à la place du locataire) : la page rappelle la
 *    date, l'heure et l'adresse ; seul le bouton « Confirmer … » enregistre le choix.
 *  · Il peut changer d'avis jusqu'à l'heure du rendez-vous : la page dit sa réponse actuelle et propose l'autre.
 *  · Lien faux, rendez-vous déplacé (lien caduc), heure passée, rendez-vous terminé : message clair, rien n'est modifié.
 * Mobile d'abord : une colonne, des boutons pleine largeur (44 px au moins). Couleurs du thème uniquement, le mot toujours écrit.
 */

type Reponse = "accepte" | "refuse" | null;
interface Rdv { sorte: SorteRdv; jour: string | null; heure: string | null; adresse: string | null; nom: string; reponse: Reponse }
interface Vue { peutRepondre: boolean; cause: string | null; message: string | null; rdv: Rdv | null }
type Ecran =
  | { sorte: "chargement" }
  | { sorte: "confirmer"; v: Vue; decision: "accepter" | "refuser" }
  | { sorte: "fait"; v: Vue; deja: boolean }
  | { sorte: "refus_lien"; v: Vue }
  | { sorte: "erreur"; message: string };

const TITRE_RDV: Record<SorteRdv, string> = { previsite: "Pré-visite d’état des lieux de sortie", edl: "État des lieux de sortie" };
const MSG_RESEAU = "La réponse n’a pas pu être envoyée (réseau). Réessayez dans un instant.";

const dateFr = (iso: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (m === null) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const heureFr = (h: string | null): string => (h === null ? "" : h.slice(0, 5).replace(":", "h"));

function Bloc({ titre, ton, children }: { titre: string; ton: "vert" | "rouge" | "neutre"; children?: React.ReactNode }) {
  const bandeau = ton === "vert" ? "bg-svv-green" : ton === "rouge" ? "bg-svv-red" : "bg-svv-ink";
  return (
    <section className="overflow-hidden rounded-3xl bg-svv-surface shadow-sm" data-rdv-reponse>
      <h1 className={`${bandeau} px-6 py-5 text-[1.45rem] font-extrabold leading-tight text-white`}>{titre}</h1>
      <div className="p-6">{children}</div>
    </section>
  );
}

function RappelRdv({ v }: { v: Vue }) {
  if (v.rdv === null) return null;
  return (
    <div className="rounded-xl border border-svv-line bg-svv-field p-4 text-svv-ink" data-rdv-rappel>
      <p className="text-lg font-bold">{TITRE_RDV[v.rdv.sorte]}</p>
      <p className="mt-1 text-base">{dateFr(v.rdv.jour)}{v.rdv.heure ? ` à ${heureFr(v.rdv.heure)}` : ""}</p>
      {v.rdv.adresse && <p className="mt-1 text-sm text-svv-muted">{v.rdv.adresse}</p>}
    </div>
  );
}

const motReponse = (r: Reponse): string | null => (r === "accepte" ? "Vous avez accepté ce rendez-vous." : r === "refuse" ? "Vous avez refusé ce rendez-vous." : null);

export function ReponseRdv({ jeton, decision }: { jeton: string; decision: "accepter" | "refuser" | null }) {
  const [ecran, setEcran] = useState<Ecran>({ sorte: "chargement" });
  const [envoi, setEnvoi] = useState(false);
  const lance = useRef(false); // une seule LECTURE au chargement, même si React rend deux fois

  const afficher = (v: Vue, d: "accepter" | "refuser" | null) => {
    if (!v.peutRepondre) { setEcran({ sorte: "refus_lien", v }); return; }
    // sans décision dans le lien : celle qui change la réponse actuelle (ou « accepter » sans réponse)
    const choix = d ?? (v.rdv?.reponse === "accepte" ? "refuser" : "accepter");
    setEcran({ sorte: "confirmer", v, decision: choix });
  };

  const repondre = async (d: "accepter" | "refuser"): Promise<void> => {
    setEnvoi(true);
    try {
      const res = await fetch("/api/rdv/reponse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jeton, decision: d }) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.etat === "ok") setEcran({ sorte: "fait", v: data as Vue, deja: data.deja === true });
      else if (data && "peutRepondre" in data) setEcran({ sorte: "refus_lien", v: data as Vue });
      else setEcran({ sorte: "erreur", message: typeof data?.erreur === "string" ? data.erreur : MSG_RESEAU });
    } catch {
      setEcran({ sorte: "erreur", message: MSG_RESEAU });
    } finally {
      setEnvoi(false);
    }
  };

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/rdv/reponse?j=${encodeURIComponent(jeton)}`, { cache: "no-store" });
        const v = (await res.json()) as Vue & { erreur?: string };
        if (!res.ok) { setEcran({ sorte: "erreur", message: v.erreur ?? MSG_RESEAU }); return; }
        afficher(v, decision); // LECTURE seule : l'ouverture du lien n'écrit jamais rien
      } catch {
        setEcran({ sorte: "erreur", message: MSG_RESEAU });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ecran.sorte === "chargement") return <Bloc titre="Votre rendez-vous" ton="neutre"><p className="text-svv-muted">Un instant.</p></Bloc>;
  if (ecran.sorte === "erreur") return <Bloc titre="Réponse non enregistrée" ton="neutre"><p role="alert" className="text-svv-ink">{ecran.message}</p></Bloc>;
  if (ecran.sorte === "refus_lien") {
    return (
      <Bloc titre="Ce lien ne permet plus de répondre" ton="neutre">
        <p role="alert" className="mb-4 text-svv-ink" data-rdv-refus={ecran.v.cause ?? ""}>{ecran.v.message}</p>
        <RappelRdv v={ecran.v} />
        <p className="mt-4 text-sm text-svv-muted">Rien n’a été modifié. Pour toute question, répondez simplement au mail reçu.</p>
      </Bloc>
    );
  }
  if (ecran.sorte === "fait") {
    const accepte = ecran.v.rdv?.reponse === "accepte";
    return (
      <Bloc titre={accepte ? "Rendez-vous accepté" : "Rendez-vous refusé"} ton={accepte ? "vert" : "rouge"}>
        <RappelRdv v={ecran.v} />
        <p className="mt-4 text-svv-ink" role="status" data-rdv-fait={accepte ? "accepte" : "refuse"}>
          {ecran.deja ? "Votre réponse était déjà enregistrée : rien n’a été modifié."
            : accepte ? "Merci ! Votre accord est enregistré." : "Votre refus est enregistré : nous allons vous recontacter pour convenir d’un autre créneau."}
        </p>
        <p className="mt-2 text-sm text-svv-muted">Vous pouvez changer d’avis jusqu’à l’heure du rendez-vous, depuis le même mail.</p>
      </Bloc>
    );
  }
  const accepter = ecran.decision === "accepter";
  const actuelle = motReponse(ecran.v.rdv?.reponse ?? null);
  return (
    <Bloc titre={accepter ? BOUTON_ACCEPTER : "Refuser le rendez-vous"} ton={accepter ? "vert" : "rouge"}>
      <RappelRdv v={ecran.v} />
      {actuelle && <p className="mt-4 text-sm text-svv-muted" data-rdv-actuelle>{actuelle}</p>}
      <button type="button" disabled={envoi} onClick={() => void repondre(ecran.decision)} data-rdv-confirmer={ecran.decision}
        className={`svv-btn svv-btn-primary mt-4 min-h-11 w-full ${envoi ? "opacity-50" : ""}`}>
        {envoi ? "Enregistrement…" : accepter ? "Confirmer : j’accepte le rendez-vous" : "Confirmer : je refuse le rendez-vous"}
      </button>
      <button type="button" disabled={envoi} onClick={() => setEcran({ sorte: "confirmer", v: ecran.v, decision: accepter ? "refuser" : "accepter" })}
        className="svv-btn svv-btn-outline mt-3 min-h-11 w-full" data-rdv-autre>
        {accepter ? BOUTON_REFUSER : BOUTON_ACCEPTER}
      </button>
    </Bloc>
  );
}
