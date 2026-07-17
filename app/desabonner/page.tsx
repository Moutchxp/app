import type { Metadata } from 'next';
import { verifierJetonRetrait } from '../lib/internaute/jetonRectification';
import { premierParam } from '../verifier/presentation';
import { ConfirmerDesabonnement } from './ConfirmerDesabonnement';

// Runtime Node explicite : la vérification du jeton (jose) tourne côté serveur, jamais l'edge. Calqué sur /verifier.
export const runtime = 'nodejs';

// Aucun cache : la page ne doit jamais figer un état de désabonnement. (Elle ne lit pourtant RIEN en base — cf. infra.)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Se désabonner — Sans Vis-à-Vis®',
  description: 'Ne plus recevoir les e-mails de Sans Vis-à-Vis®.',
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Page publique de DÉSABONNEMENT (voie de retrait e-mail).
 *
 * LECTURE SEULE ABSOLUE : elle VÉRIFIE le jeton (crypto pure, AUCUN accès base) et affiche. Un scanner AV / proxy /
 * prefetch qui suit le lien du mail ne produit AUCUN effet de bord — le retrait n'a lieu qu'au POST explicite du bouton.
 * ZÉRO DONNÉE PERSONNELLE À L'ÉCRAN (ni e-mail, ni prénom, ni adresse, ni numéro) : c'est la contrepartie du jeton sans
 * expiration. Le texte est FIXE, indépendant de l'état réel en base (qu'on ne lit pas).
 */
export default async function DesabonnerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const j = premierParam(sp.j);
  const internauteId = j ? await verifierJetonRetrait(j) : null; // crypto only — jamais de requête base ici
  const valide = internauteId !== null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <header className="mb-6">
        <p className="svv-label">L&apos;immobilier</p>
        <h1 className="text-xl font-extrabold text-svv-ink">Sans Vis-à-Vis®</h1>
        <p className="mt-1 text-sm text-svv-muted">Désabonnement</p>
      </header>

      <section className="svv-card">
        {!valide ? (
          <p className="leading-relaxed text-svv-ink">
            Ce lien de désabonnement n&apos;est pas valide. Vérifiez que vous avez copié l&apos;adresse complète depuis
            votre e-mail.
          </p>
        ) : (
          // Le token brut (déjà présent dans l'URL) est confié au bouton client, qui déclenche le POST de retrait.
          <ConfirmerDesabonnement jeton={j as string} />
        )}
      </section>

      <p className="mt-5 text-center text-xs text-svv-muted">
        Vous pourrez à tout moment redonner votre accord depuis l&apos;application sansvisavis.com.
      </p>
    </main>
  );
}
