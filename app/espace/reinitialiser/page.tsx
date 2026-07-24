import type { Metadata } from 'next';
import { Bandeau } from '../Bandeau';
import { FormulaireNouveauMotDePasse } from './FormulaireNouveauMotDePasse';
import { TITRE_NOUVEAU_MDP } from '../presentation';

export const metadata: Metadata = {
  title: 'Réinitialisation du mot de passe — Sans Vis-à-Vis®',
  description: 'Choisissez un nouveau mot de passe pour votre espace client Sans Vis-à-Vis®.',
};

/**
 * Page de SAISIE du nouveau mot de passe (cible du lien e-mail `…/espace/reinitialiser?j=<secret>`). Coquille SERVEUR
 * (bandeau + carte) qui NE LIT PAS `searchParams` : le secret ne transite JAMAIS par un Server Component sérialisé — il
 * est lu côté client dans le formulaire (même règle que /verifier).
 */
export default function ReinitialiserPage() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_NOUVEAU_MDP} />
      <div className="px-5 py-6">
        <section className="svv-card">
          <FormulaireNouveauMotDePasse />
        </section>
      </div>
    </main>
  );
}
