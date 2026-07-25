import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../../lib/internaute/gardeEspace';
import { FormulaireConnexion } from './FormulaireConnexion';
import { Bandeau } from '../Bandeau';
import { TITRE_CONNEXION, LIB_RETOUR_MENU } from '../presentation';

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
        {/* Sortie du mur d'auth : retour au menu (accueil + menu rouvert), MÊME mécanisme/libellé que les 4 destinations.
            Sous le formulaire, en action secondaire (outline) → ne concurrence ni « Se connecter » ni « Mot de passe oublié ? ». */}
        <Link className="svv-btn svv-btn-outline mt-4" href="/?menu">{LIB_RETOUR_MENU}</Link>
      </div>
    </main>
  );
}
