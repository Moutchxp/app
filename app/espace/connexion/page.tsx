import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../lib/internaute/gardeEspace';
import { FormulaireConnexion } from './FormulaireConnexion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connexion — Sans Vis-à-Vis®',
  description: 'Accédez à votre espace Sans Vis-à-Vis®.',
};

/**
 * Page de CONNEXION de l'espace client (Commit C). RECONNAISSANCE AU RETOUR : si une session valide existe déjà, on
 * redirige directement vers l'espace (l'internaute n'a pas à resaisir ses identifiants). Sinon, on affiche le formulaire
 * qui poste vers la route de connexion livrée au Commit B (`/api/internaute/auth/login`).
 */
export default async function ConnexionPage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (internauteId) redirect('/espace');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <header className="mb-6">
        <p className="svv-label">L&apos;immobilier</p>
        <h1 className="text-xl font-extrabold text-svv-ink">Sans Vis-à-Vis®</h1>
        <p className="mt-1 text-sm text-svv-muted">Connexion à mon espace</p>
      </header>
      <section className="svv-card">
        <FormulaireConnexion />
      </section>
    </main>
  );
}
