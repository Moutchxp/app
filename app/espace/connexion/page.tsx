import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../lib/internaute/gardeEspace';
import { FormulaireConnexion } from './FormulaireConnexion';
import { Bandeau } from '../Bandeau';
import { TITRE_CONNEXION } from '../presentation';

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
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_CONNEXION} />
      <div className="px-5 py-6">
        <section className="svv-card">
          <FormulaireConnexion />
        </section>
      </div>
    </main>
  );
}
