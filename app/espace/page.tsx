import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../lib/internaute/gardeEspace';
import { listerAnalyses, listerCertificats, lireIdentite, type Verdict } from '../lib/internaute/espace';
import { DeconnexionBouton } from './DeconnexionBouton';
import { Bandeau } from './Bandeau';
import {
  TITRE_ESPACE, SOUS_LIGNE_ACCUEIL, TITRE_ANALYSES, TITRE_CERTIFICATS,
  MSG_AUCUNE_ANALYSE, MSG_AUCUN_CERTIFICAT, LIB_TELECHARGER, MSG_PDF_PREPARATION, MSG_ADRESSE_ABSENTE,
  LIB_ETAGE, LIB_EMIS_LE, salutation, libelleVerdict,
} from './presentation';

// Runtime Node (session + driver pg). JAMAIS de cache : l'espace dépend de la session et de l'état base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon espace — Sans Vis-à-Vis®',
  description: 'Retrouvez vos analyses et re-téléchargez vos certificats — Sans Vis-à-Vis®.',
};

/** Fond/texte d'une pastille de verdict — tokens de charte UNIQUEMENT (aucun hex). Symétrie vert/rouge (soft + ink/dark). */
function stylePastille(v: Verdict | null): CSSProperties {
  if (v === 'SANS_VIS_A_VIS') return { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' };
  if (v === 'VIS_A_VIS') return { background: 'var(--color-svv-red-soft)', color: 'var(--color-svv-red-dark)' };
  return { background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' };
}

function dateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function Pastille({ verdict }: { verdict: Verdict | null }) {
  return (
    <span className="svv-pill" style={stylePastille(verdict)}>
      {libelleVerdict(verdict)}
    </span>
  );
}

/**
 * Espace client de l'internaute. Page RÉSERVÉE : la garde serveur redirige vers la connexion si la session est
 * absente/invalide (aucune donnée chargée → pas de fuite). Sobre et mobile-first : accueil personnalisé + deux listes.
 */
export default async function EspacePage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  const [identite, analyses, certificats] = await Promise.all([
    lireIdentite(internauteId),
    listerAnalyses(internauteId),
    listerCertificats(internauteId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_ESPACE} />

      <div className="flex flex-col gap-7 px-5 py-6">
        {/* Accueil personnalisé */}
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="svv-verif-title text-xl font-extrabold text-svv-ink">{salutation(identite.prenom, identite.nom)}</h1>
            <p className="mt-1 text-sm text-svv-muted">{SOUS_LIGNE_ACCUEIL}</p>
          </div>
          <DeconnexionBouton />
        </header>

        {/* Mes analyses */}
        <section aria-labelledby="titre-analyses">
          <h2 id="titre-analyses" className="svv-verif-title text-lg font-extrabold text-svv-ink">{TITRE_ANALYSES}</h2>
          {analyses.length === 0 ? (
            <p className="mt-2 text-sm text-svv-muted">{MSG_AUCUNE_ANALYSE}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {analyses.map((a) => (
                <li key={`a-${a.id}`} className="svv-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-svv-muted">{dateFr(a.creeA)}</span>
                    <Pastille verdict={a.verdict} />
                  </div>
                  <p className="mt-1.5 text-sm text-svv-ink">{a.adresse ?? MSG_ADRESSE_ABSENTE}</p>
                  {a.etage !== null && <p className="mt-0.5 text-xs text-svv-muted">{LIB_ETAGE} {a.etage}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Mes certificats */}
        <section aria-labelledby="titre-certificats">
          <h2 id="titre-certificats" className="svv-verif-title text-lg font-extrabold text-svv-ink">{TITRE_CERTIFICATS}</h2>
          {certificats.length === 0 ? (
            <p className="mt-2 text-sm text-svv-muted">{MSG_AUCUN_CERTIFICAT}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {certificats.map((c) => (
                <li key={`c-${c.id}`} className="svv-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="svv-verif-mono text-xs font-bold text-svv-ink">{c.numero}</span>
                    <Pastille verdict={c.verdict} />
                  </div>
                  <p className="mt-1.5 text-sm text-svv-ink">{c.adresse ?? MSG_ADRESSE_ABSENTE}</p>
                  <p className="mt-0.5 text-xs text-svv-muted">{LIB_EMIS_LE} {dateFr(c.emisLe)}</p>
                  {c.telechargeable ? (
                    <a className="svv-btn svv-btn-primary mt-3" href={`/api/internaute/espace/certificats/${c.id}/telecharger`}>
                      {LIB_TELECHARGER}
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-svv-muted">{MSG_PDF_PREPARATION}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
