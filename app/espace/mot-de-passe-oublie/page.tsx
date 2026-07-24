import type { Metadata } from 'next';
import { Bandeau } from '../Bandeau';
import { FormulaireDemandeReset } from './FormulaireDemandeReset';
import { TITRE_MDP_OUBLIE } from '../presentation';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — Sans Vis-à-Vis®',
  description: 'Recevez un lien pour réinitialiser le mot de passe de votre espace client Sans Vis-à-Vis®.',
};

/**
 * Page de DEMANDE de réinitialisation (« mot de passe oublié »). Coquille serveur (bandeau + carte) rendue sous le layout
 * de segment /espace (polices de marque). Aucun accès base, aucune donnée sérialisée : tout se passe dans le formulaire
 * client, qui poste vers la route livrée au commit C.
 */
export default function MotDePasseOubliePage() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_MDP_OUBLIE} />
      <div className="px-5 py-6">
        <section className="svv-card">
          <FormulaireDemandeReset />
        </section>
      </div>
    </main>
  );
}
