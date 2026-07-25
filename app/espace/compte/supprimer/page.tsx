import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../../lib/internaute/gardeEspace';
import { Bandeau } from '../../Bandeau';
import { FormulaireSuppression } from './FormulaireSuppression';
import { TITRE_SUPPRESSION, INTRO_SUPPRESSION } from '../../presentation';

// Runtime Node (session). JAMAIS de cache : page réservée, dépend de la session.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Supprimer mon compte — Sans Vis-à-Vis®',
  description: 'Suppression définitive de votre compte Sans Vis-à-Vis®.',
};

/**
 * Page DÉDIÉE de confirmation de suppression (pas une modale). RÉSERVÉE : même garde que le reste de l'espace
 * (`internauteConnecteDepuisCookies` → redirection connexion si session absente/invalide). Affiche l'avertissement
 * complet + les contrôles (case + mot de passe) via `FormulaireSuppression`.
 */
export default async function SupprimerComptePage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_SUPPRESSION} />

      <div className="flex flex-col gap-5 px-5 py-6">
        <p className="text-sm text-svv-muted" style={{ margin: 0 }}>{INTRO_SUPPRESSION}</p>
        <FormulaireSuppression />
      </div>
    </main>
  );
}
