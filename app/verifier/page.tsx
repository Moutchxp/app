import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { verifierCertificat, verifierParReference } from "../lib/db/certificatVerification";
import { premierParam, libelleVerdict, libelleSousLigne, tuilesBien, DEFINITION_SVV, MESSAGE_SANS_COMPTE } from "./presentation";

// Runtime Node explicite : la page appelle les vérificateurs qui touchent Postgres (driver `pg`), jamais l'edge.
export const runtime = "nodejs";
// Une lecture base rend la page dynamique ; on grave l'intention pour qu'aucun cache ne fige un résultat de vérification.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérifier un certificat — Sans Vis-à-Vis®",
  description: "Vérifiez l'authenticité d'un certificat Sans Vis-à-Vis®.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// ────────────────────────────── Briques d'UI (charte SVAV, mobile d'abord) ──────────────────────────────

/** Sceau blanc à anneau rouge (le logo image viendra plus tard). Purement décoratif. */
function Sceau() {
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-svv-red bg-white">
      <span className="size-3.5 rounded-full bg-svv-red" />
    </span>
  );
}

/** Bandeau rouge pleine largeur : sceau + marque + sous-ligne (dépend du document). */
function Bandeau({ sousLigne }: { sousLigne: string }) {
  return (
    <header className="flex items-center gap-3 bg-svv-red px-5 py-4">
      <Sceau />
      <div className="leading-tight">
        <p className="svv-verif-title text-base font-extrabold tracking-wide text-white">SANS VIS·A·VIS®</p>
        <p className="text-xs text-white/90">{sousLigne}</p>
      </div>
    </header>
  );
}

/** Cadre commun à tous les états : bandeau + corps centré, largeur max ~420px, mobile d'abord. */
function Cadre({ sousLigne, children }: { sousLigne: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau sousLigne={sousLigne} />
      <div className="flex flex-col gap-5 px-5 py-6">{children}</div>
    </main>
  );
}

/** Tuile de descriptif (fond --color-svv-field). `full` = pleine largeur ; `mono` = valeur en police mono. */
function Tuile({ label, valeur, full, mono }: { label: string; valeur: string; full?: boolean; mono?: boolean }) {
  return (
    <div className={`rounded-xl bg-svv-field px-3.5 py-2.5 ${full ? "col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-svv-muted">{label}</p>
      <p className={`mt-0.5 break-words text-sm font-semibold text-svv-ink ${mono ? "svv-verif-mono" : ""}`}>{valeur}</p>
    </div>
  );
}

/** Cadenas (état sans_compte) — inline, couleur héritée (currentColor). */
function Cadenas() {
  return (
    <svg viewBox="0 0 24 24" className="size-9 text-svv-red" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

/** Encart de définition : fond --color-svv-field, liseré gauche rouge, coins NON arrondis (règle charte). */
function EncartDefinition() {
  return (
    <p className="border-l-[3px] border-svv-red bg-svv-field px-3.5 py-3 text-sm leading-relaxed text-svv-ink">{DEFINITION_SVV}</p>
  );
}

/** Vue « certificat trouvé » commune aux voies JETON (adresse + numéro) et RÉFÉRENCE (ville, pas de numéro). */
function VueCertifiee({
  verdict, score, premierLabel, premierValeur, tuiles, numero, piedLabel, piedId,
}: {
  verdict: string; score: number | null;
  premierLabel: string; premierValeur: string;
  tuiles: Array<{ label: string; valeur: string }>;
  numero?: string; piedLabel: string; piedId: string;
}) {
  return (
    <>
      {/* Héros */}
      <section className="text-center">
        <p className="svv-verif-mono text-[11px] font-bold uppercase tracking-[0.18em] text-svv-muted">Certificat authentifié</p>
        <h1 className="svv-verif-title mt-1 text-2xl font-extrabold text-svv-ink">{libelleVerdict(verdict)}</h1>
        <p className="mt-1 text-sm text-svv-muted">Aucun obstacle sur 40 m face au séjour</p>
        {score !== null && (
          <div className="mt-4">
            <p className="svv-verif-title text-[3.25rem] font-extrabold leading-none text-svv-red">
              {Math.round(score)}<span className="text-2xl text-svv-muted">/100</span>
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-svv-muted">Score de qualité de vue</p>
          </div>
        )}
      </section>

      {/* Tuiles */}
      <section className="grid grid-cols-2 gap-2.5">
        <Tuile full label={premierLabel} valeur={premierValeur} />
        {tuiles.map((t) => (
          <Tuile key={t.label} label={t.label} valeur={t.valeur} />
        ))}
        {numero && <Tuile full mono label="N° de certificat" valeur={numero} />}
      </section>

      <EncartDefinition />

      {/* Appel à l'action */}
      <section className="border-t border-svv-line pt-5 text-center">
        <h2 className="svv-verif-title text-lg font-extrabold text-svv-ink">Votre bien a-t-il une vue dégagée ?</h2>
        <p className="mt-1 text-sm text-svv-muted">Faites-la analyser et certifier en 2 minutes.</p>
        {/* Destination provisoire : la racine (tunnel). La cible définitive sera tranchée plus tard. */}
        <Link href="/" className="svv-btn svv-btn-primary mt-3">Analyser mon bien</Link>
      </section>

      {/* Pied */}
      <p className="text-center text-xs text-svv-muted">
        {piedLabel} <span className="svv-verif-mono font-bold text-svv-red">{piedId}</span> · délivré par SARL CRITERIMMO
      </p>
    </>
  );
}

/** Carte de message sobre (états défensifs / erreurs) : icône optionnelle + titre + texte. */
function CarteMessage({ titre, children, icone }: { titre: string; children: ReactNode; icone?: ReactNode }) {
  return (
    <section className="text-center">
      {icone && <div className="mb-3 flex justify-center">{icone}</div>}
      <h1 className="svv-verif-title text-xl font-extrabold text-svv-ink">{titre}</h1>
      <div className="mt-2 text-sm leading-relaxed text-svv-muted">{children}</div>
    </section>
  );
}

// ────────────────────────────── Page ──────────────────────────────

export default async function VerifierPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const n = premierParam(sp.n);
  const j = premierParam(sp.j);
  const ref = premierParam(sp.ref); // VOIE VISUEL : la référence publique seule débloque le set (sans jeton, sans adresse).
  // `doc` : TYPE de document scanné, param de PRÉSENTATION UNIQUEMENT. JAMAIS passé aux vérificateurs → n'influence ni les
  // champs attestés, ni le gating, ni aucun statut : seulement la sous-ligne du bandeau.
  const doc = premierParam(sp.doc);

  // Voie RÉFÉRENCE (visuel) prioritaire si `ref` présent ; sinon voie NUMÉRO + jeton. Page nue (aucun paramètre) → saisie.
  const resultat = ref !== undefined
    ? await verifierParReference(ref)
    : n === undefined ? null : await verifierCertificat(n, j);

  // ── Aucun paramètre : écran de saisie (par référence) + définition ──
  if (resultat === null) {
    return (
      <Cadre sousLigne="Vérification de certificat">
        <CarteMessage titre="Vérifier un certificat">
          Saisissez la référence figurant sur le document ou l&apos;annonce.
        </CarteMessage>
        <form action="/verifier" method="get" className="flex flex-col gap-3">
          <input
            name="ref"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="SVAV-XXXX-XXXX"
            aria-label="Référence du certificat"
            className="svv-verif-mono w-full rounded-xl border border-svv-line bg-svv-field px-3.5 py-3 text-base uppercase tracking-wide text-svv-ink placeholder:text-svv-muted"
          />
          <button type="submit" className="svv-btn svv-btn-primary">Vérifier</button>
        </form>
        <EncartDefinition />
      </Cadre>
    );
  }

  // ── Certificat trouvé, voie JETON (numéro + jeton) : adresse + numéro ──
  if (resultat.statut === "verifie") {
    const c = resultat.certificat;
    return (
      <Cadre sousLigne={libelleSousLigne(doc)}>
        <VueCertifiee
          verdict={c.verdict}
          score={c.score}
          premierLabel="Adresse"
          premierValeur={c.adresse ?? "Non renseignée"}
          tuiles={tuilesBien(c.descriptif)}
          numero={c.numero}
          piedLabel="Certificat"
          piedId={c.numero}
        />
      </Cadre>
    );
  }

  // ── Certificat trouvé, voie RÉFÉRENCE (visuel) : ville, jamais l'adresse, pas de numéro ──
  if (resultat.statut === "visuel_verifie") {
    const v = resultat.visuel;
    return (
      <Cadre sousLigne={libelleSousLigne("visuel")}>
        <VueCertifiee
          verdict={v.verdict}
          score={v.score}
          premierLabel="Ville"
          premierValeur={v.descriptif.ville ?? "Non renseignée"}
          tuiles={tuilesBien(v.descriptif)}
          piedLabel="Référence"
          piedId={v.reference}
        />
      </Cadre>
    );
  }

  // ── One-shot : non authentifiable en ligne (état défensif, AUCUN appel à l'action) ──
  if (resultat.statut === "sans_compte") {
    return (
      <Cadre sousLigne="Vérification de certificat">
        <CarteMessage titre="Non authentifiable en ligne" icone={<Cadenas />}>{MESSAGE_SANS_COMPTE}</CarteMessage>
      </Cadre>
    );
  }

  // ── Numéro réel, jeton absent/faux : re-saisie du code (comportement conservé, rhabillé) ──
  if (resultat.statut === "existe") {
    return (
      <Cadre sousLigne={libelleSousLigne(doc)}>
        <CarteMessage titre="Code de vérification requis">
          Ce numéro correspond à un certificat émis. Saisissez le code figurant sur le document pour en afficher le contenu.
        </CarteMessage>
        <form action="/verifier" method="get" className="flex flex-col gap-3">
          <input type="hidden" name="n" value={n} />
          <input
            name="j"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="Code à 16 caractères"
            aria-label="Code de vérification"
            className="svv-verif-mono w-full rounded-xl border border-svv-line bg-svv-field px-3.5 py-3 text-base uppercase tracking-wide text-svv-ink placeholder:text-svv-muted"
          />
          <button type="submit" className="svv-btn svv-btn-primary">Vérifier</button>
        </form>
      </Cadre>
    );
  }

  // ── Introuvable ──
  if (resultat.statut === "inexistant") {
    return (
      <Cadre sousLigne="Vérification de certificat">
        <CarteMessage titre="Aucun certificat trouvé">
          Aucun certificat ne correspond. Vérifiez le code saisi et réessayez.
        </CarteMessage>
      </Cadre>
    );
  }

  // ── Format non reconnu (reference_invalide / numero_invalide) ──
  const exemple = resultat.statut === "reference_invalide" ? "SVAV-XXXX-XXXX" : "SAVV-2026-000001";
  return (
    <Cadre sousLigne="Vérification de certificat">
      <CarteMessage titre="Code non reconnu">
        Le format saisi n&apos;est pas celui d&apos;un certificat Sans Vis-à-Vis®. Format attendu :{" "}
        <span className="svv-verif-mono font-semibold text-svv-ink">{exemple}</span>.
      </CarteMessage>
    </Cadre>
  );
}
