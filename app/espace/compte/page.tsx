import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../lib/internaute/gardeEspace';
import { lireCompte } from '../../lib/internaute/espace';
import { Bandeau } from '../Bandeau';
import { FicheCompte } from './FicheCompte';
import { TITRE_COMPTE, LIB_RETOUR_MENU, TITRE_ZONE_DANGER, LIB_LIEN_SUPPRESSION } from '../presentation';

// Runtime Node (session + driver pg). JAMAIS de cache : dépend de la session et de l'état base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon compte — Sans Vis-à-Vis®',
  description: 'Consultez et modifiez les coordonnées de votre compte Sans Vis-à-Vis®.',
};

/**
 * Page « Mon compte » — RÉSERVÉE : MÊME garde que /espace (`internauteConnecteDepuisCookies` → redirection vers la
 * connexion si session absente/invalide, sans rien divulguer). Lit les 4 coordonnées scopées session et les confie à
 * `FicheCompte` (client), qui gère lecture/édition (prénom/nom éditables ; e-mail/téléphone en lecture seule).
 */
export default async function ComptePage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  const compte = await lireCompte(internauteId);

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_COMPTE} />

      <div className="flex flex-col gap-6 px-5 py-6">
        <FicheCompte initial={compte} />

        {/* Retour au menu (accueil + menu rouvert) — action secondaire. */}
        <Link className="svv-btn svv-btn-outline" href="/?menu">{LIB_RETOUR_MENU}</Link>

        {/* Zone sensible — séparée visuellement, mène à la page dédiée de suppression. */}
        <section aria-labelledby="zone-danger" className="mt-4 border-t border-svv-line pt-5">
          <h2 id="zone-danger" className="svv-label" style={{ color: 'var(--color-svv-red)' }}>{TITRE_ZONE_DANGER}</h2>
          <Link
            href="/espace/compte/supprimer"
            className="mt-2 flex min-h-[44px] items-center text-sm font-semibold text-svv-red underline"
          >
            {LIB_LIEN_SUPPRESSION}
          </Link>
        </section>
      </div>
    </main>
  );
}
