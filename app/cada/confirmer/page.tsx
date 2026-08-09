import type { Metadata } from 'next';
import { verifierJetonCada } from '../../lib/internaute/jetonRectification';
import { chargerConfirmationCada } from '../../lib/veille/saisineCadaRepo';
import { premierParam } from '../../verifier/presentation';
import { ConfirmationCadaRendu, type EtatPageCada } from './ConfirmationCadaRendu';
import { ConfirmerSaisineCada } from './ConfirmerSaisineCada';

// Runtime Node explicite : la vérification du jeton (jose) tourne côté serveur. Calqué sur /desabonner et /verifier.
export const runtime = 'nodejs';
// Aucun cache : la page reflète l'état réel de la demande (déjà lancée ? forclose ?) à chaque ouverture.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Saisir la CADA — Sans Vis-à-Vis®',
  description: 'Confirmer la saisine de la CADA pour une demande restée sans réponse.',
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Renvoi vers l'onglet « Saisines CADA » de l'espace d'administration (le bouton y fonctionne toujours, même si le lien a expiré).
const URL_ONGLET = '/admin/permis';

/**
 * Page publique de CONFIRMATION de saisine CADA (voie e-mail interne). LECTURE SEULE au GET : elle VÉRIFIE le jeton (crypto),
 * charge le CONTEXTE de la demande (identification du dossier, aucun effet de bord) et affiche. Un scanner AV / proxy /
 * prefetch qui suit le lien ne déclenche AUCUNE saisine — l'acte ne part qu'au POST explicite du bouton. Le bouton n'apparaît
 * que si l'acte est réellement possible ('saisissable').
 */
export default async function ConfirmerCadaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const j = premierParam(sp.j);
  const v = j ? await verifierJetonCada(j) : ({ ok: false, raison: 'invalide' } as const);

  let contenu: React.ReactNode;
  if (!v.ok) {
    const etat: EtatPageCada = v.raison === 'expire' ? 'jeton_expire' : 'jeton_invalide';
    contenu = <ConfirmationCadaRendu etat={etat} urlOnglet={URL_ONGLET} />;
  } else {
    const ctx = await chargerConfirmationCada(v.demandeId); // lecture seule (aucune écriture)
    contenu = (
      <ConfirmationCadaRendu
        etat={ctx.etat}
        ctx={ctx}
        urlOnglet={URL_ONGLET}
        bouton={<ConfirmerSaisineCada jeton={j as string} urlOnglet={URL_ONGLET} />}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <header className="mb-6">
        <p className="svv-label">L&apos;immobilier</p>
        <h1 className="text-xl font-extrabold text-svv-ink">Sans Vis-à-Vis®</h1>
        <p className="mt-1 text-sm text-svv-muted">Saisine de la CADA</p>
      </header>
      {contenu}
      <p className="mt-5 text-center text-xs text-svv-muted">
        Ce lien ouvre seulement cette page&nbsp;: la saisine ne part qu’après confirmation explicite.
      </p>
    </main>
  );
}
