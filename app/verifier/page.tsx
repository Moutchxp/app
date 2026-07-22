import type { Metadata } from "next";
import type { ReactNode } from "react";
import { verifierCertificat } from "../lib/db/certificatVerification";
import { premierParam, formatDateFr, formatEtage, libelleVerdict, libelleTypeDocument, MESSAGE_SANS_COMPTE } from "./presentation";

// Runtime Node explicite : la page appelle `verifierCertificat` qui touche Postgres (driver `pg`), jamais l'edge.
export const runtime = "nodejs";

// Une requête base suffit à rendre la page dynamique (docs Next 16 : non cachée dès un accès données) ; on grave
// l'intention pour qu'aucune configuration de cache ne fige jamais un résultat de vérification.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérifier un certificat — Sans Vis-à-Vis®",
  description: "Vérifiez l'authenticité d'un certificat Sans Vis-à-Vis®.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Formulaire de saisie — PUR HTML, aucun "use client" : un simple `<form method="get">` navigue vers
 * /verifier?n=…&j=… . Aucun appel réseau, aucune logique côté client. Le code (jeton) n'est jamais pré-rempli.
 */
function Formulaire({ numero = "" }: { numero?: string }) {
  return (
    <form action="/verifier" method="get" className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold text-svv-ink">
        Numéro du certificat
        <input
          name="n"
          defaultValue={numero}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="SAVV-2026-000001"
          className="rounded-xl border border-svv-line bg-white px-3 py-3 text-base text-svv-ink placeholder:text-svv-muted"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-svv-ink">
        <span>
          Code de vérification <span className="font-normal text-svv-muted">(figurant sur le document)</span>
        </span>
        <input
          name="j"
          autoComplete="off"
          spellCheck={false}
          placeholder="16 caractères"
          className="rounded-xl border border-svv-line bg-white px-3 py-3 text-base tracking-wide text-svv-ink placeholder:text-svv-muted"
        />
      </label>
      <button type="submit" className="svv-btn svv-btn-primary mt-1">
        Vérifier
      </button>
    </form>
  );
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-svv-line py-3 last:border-b-0">
      <span className="svv-label">{label}</span>
      <span className="text-base text-svv-ink">{children}</span>
    </div>
  );
}

export default async function VerifierPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const n = premierParam(sp.n);
  const j = premierParam(sp.j);
  // `doc` : TYPE de document scanné, param de PRÉSENTATION uniquement. JAMAIS passé à `verifierCertificat` → il n'influence
  // ni les 5 champs attestés, ni le gating, ni aucun statut : seulement l'intitulé du bloc « vérifié ».
  const doc = premierParam(sp.doc);

  // Page nue (aucun numéro) → formulaire seul. Sinon, vérification (le jeton est OPTIONNEL).
  const resultat = n === undefined ? null : await verifierCertificat(n, j);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <header className="mb-6">
        <p className="svv-label">L&apos;immobilier</p>
        <h1 className="text-xl font-extrabold text-svv-ink">Sans Vis-à-Vis®</h1>
        <p className="mt-1 text-sm text-svv-muted">Vérification d&apos;un certificat</p>
      </header>

      <section className="svv-card">
        {resultat === null && (
          <>
            <p className="leading-relaxed text-svv-ink">
              Saisissez le numéro du certificat et, pour en afficher le contenu, le code de vérification figurant sur
              le document.
            </p>
            <Formulaire />
          </>
        )}

        {resultat?.statut === "numero_invalide" && (
          <p className="leading-relaxed text-svv-ink">
            Ce numéro n&apos;est pas un numéro de certificat Sans Vis-à-Vis®.
          </p>
        )}

        {resultat?.statut === "inexistant" && (
          <p className="leading-relaxed text-svv-ink">Aucun certificat ne porte ce numéro.</p>
        )}

        {/* One-shot : certificat réel mais non rattaché à un compte → jamais authentifiable en ligne. Aucun champ affiché. */}
        {resultat?.statut === "sans_compte" && (
          <p className="leading-relaxed text-svv-ink">{MESSAGE_SANS_COMPTE}</p>
        )}

        {resultat?.statut === "existe" && (
          <>
            <p className="leading-relaxed text-svv-ink">
              Ce numéro correspond à un certificat émis. Saisissez le code de vérification figurant sur le document
              pour en afficher le contenu.
            </p>
            <Formulaire numero={n} />
          </>
        )}

        {resultat?.statut === "verifie" && (
          <div>
            <p className="svv-label mb-1">Certificat vérifié</p>
            {/* Intitulé adapté au TYPE scanné (param `doc`, présentation seule). Absent/inconnu → « ce certificat ». */}
            <p className="mb-3 text-sm text-svv-muted">Vous vérifiez {libelleTypeDocument(doc)}.</p>
            <Ligne label="Numéro">{resultat.certificat.numero}</Ligne>
            <Ligne label="Date d'émission">{formatDateFr(resultat.certificat.emisLe)}</Ligne>
            <Ligne label="Verdict">
              {resultat.certificat.verdict === "SANS_VIS_A_VIS" ? (
                // Rouge CONTOUR de la charte (secondaire) : lisible d'un coup d'œil, de marque, sans bloc criard.
                <span className="inline-block rounded-full border border-svv-red px-3 py-1 text-xs font-bold text-svv-red">
                  {libelleVerdict(resultat.certificat.verdict)}
                </span>
              ) : (
                <span className="inline-block rounded-full border border-svv-line px-3 py-1 text-xs font-bold text-svv-ink">
                  {libelleVerdict(resultat.certificat.verdict)}
                </span>
              )}
            </Ligne>
            <Ligne label="Adresse">{resultat.certificat.adresse ?? "Non renseignée"}</Ligne>
            <Ligne label="Étage">{formatEtage(resultat.certificat.etage)}</Ligne>
          </div>
        )}
      </section>

      <p className="mt-5 text-center text-xs text-svv-muted">
        La vérification confronte le document que vous détenez à l&apos;enregistrement d&apos;origine.
      </p>
    </main>
  );
}
