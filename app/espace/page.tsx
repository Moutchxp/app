import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../lib/internaute/gardeEspace';
import { listerAnalyses, listerCertificats, type Verdict } from '../lib/internaute/espace';
import { DeconnexionBouton } from './DeconnexionBouton';

// Runtime Node (session + driver pg). JAMAIS de cache : l'espace dépend de la session et de l'état base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon espace — Sans Vis-à-Vis®',
  description: 'Retrouvez vos analyses et re-téléchargez vos certificats — Sans Vis-à-Vis®.',
};

/** Libellé + couleurs (charte rouge/vert/gris, aucun orange) d'un verdict, rendu en pastille. */
function pastilleVerdict(v: Verdict | null): { label: string; style: React.CSSProperties } {
  if (v === 'SANS_VIS_A_VIS') {
    return { label: 'Sans vis-à-vis', style: { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' } };
  }
  if (v === 'VIS_A_VIS') {
    return { label: 'Vis-à-vis détecté', style: { background: '#fbeceb', color: 'var(--color-svv-red)' } };
  }
  return { label: 'Indéterminé', style: { background: '#eef0f3', color: 'var(--color-svv-muted)' } };
}

function dateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function Pastille({ verdict }: { verdict: Verdict | null }) {
  const p = pastilleVerdict(verdict);
  return (
    <span className="svv-pill" style={{ ...p.style }}>
      {p.label}
    </span>
  );
}

/**
 * Espace client de l'internaute (Commit C). Page RÉSERVÉE : la garde serveur redirige vers la connexion si la session
 * est absente/invalide (aucune donnée n'est chargée dans ce cas → pas de fuite). Session valide = reconnaissance au
 * retour : l'internaute accède directement à ses analyses et certificats sans resaisir ses identifiants. Sobre et
 * mobile-first : deux listes + un bouton de téléchargement par certificat disponible.
 */
export default async function EspacePage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  const [analyses, certificats] = await Promise.all([listerAnalyses(internauteId), listerCertificats(internauteId)]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="svv-label">L&apos;immobilier</p>
          <h1 className="text-xl font-extrabold text-svv-ink">Sans Vis-à-Vis®</h1>
          <p className="mt-1 text-sm text-svv-muted">Mon espace</p>
        </div>
        <DeconnexionBouton />
      </header>

      <section aria-labelledby="titre-analyses" className="mb-8">
        <h2 id="titre-analyses" className="svv-page-title" style={{ fontSize: '1.05rem' }}>
          Mes analyses
        </h2>
        {analyses.length === 0 ? (
          <p className="mt-2 text-sm text-svv-muted">Aucune analyse pour le moment.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {analyses.map((a) => (
              <li key={`a-${a.id}`} className="svv-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-svv-muted">{dateFr(a.creeA)}</span>
                  <Pastille verdict={a.verdict} />
                </div>
                <p className="mt-1.5 text-sm text-svv-ink">{a.adresse ?? 'Adresse non renseignée'}</p>
                {a.etage !== null && <p className="mt-0.5 text-xs text-svv-muted">Étage {a.etage}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titre-certificats">
        <h2 id="titre-certificats" className="svv-page-title" style={{ fontSize: '1.05rem' }}>
          Mes certificats
        </h2>
        {certificats.length === 0 ? (
          <p className="mt-2 text-sm text-svv-muted">Aucun certificat pour le moment.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {certificats.map((c) => (
              <li key={`c-${c.id}`} className="svv-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-svv-ink">{c.numero}</span>
                  <Pastille verdict={c.verdict} />
                </div>
                <p className="mt-1.5 text-sm text-svv-ink">{c.adresse ?? 'Adresse non renseignée'}</p>
                <p className="mt-0.5 text-xs text-svv-muted">Émis le {dateFr(c.emisLe)}</p>
                {c.telechargeable ? (
                  <a
                    className="svv-btn svv-btn-primary"
                    style={{ marginTop: '.75rem' }}
                    href={`/api/internaute/espace/certificats/${c.id}/telecharger`}
                  >
                    Télécharger le PDF
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-svv-muted">PDF en préparation — disponible sous peu.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
