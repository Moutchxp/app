import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { internauteConnecteDepuisCookies } from '../lib/internaute/gardeEspace';
import { listerAnalyses, listerCertificats, lireIdentite, type CertificatResume } from '../lib/internaute/espace';
import { DeconnexionBouton } from './DeconnexionBouton';
import { Bandeau } from './Bandeau';
import { ListeAnalyses, type LigneEspace } from './ListeAnalyses';
import {
  TITRE_ESPACE, SOUS_LIGNE_ACCUEIL, TITRE_ANALYSES, MSG_AUCUNE_ANALYSE,
  MSG_ADRESSE_ABSENTE, LIB_RETOUR, salutation, formatScore,
} from './presentation';

// Runtime Node (session + driver pg). JAMAIS de cache : l'espace dépend de la session et de l'état base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon espace — Sans Vis-à-Vis®',
  description: 'Retrouvez vos analyses et re-téléchargez vos certificats — Sans Vis-à-Vis®.',
};

function dateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/**
 * Espace client de l'internaute. Page RÉSERVÉE : la garde serveur redirige vers la connexion si la session est
 * absente/invalide (aucune donnée chargée → pas de fuite). Sobre et mobile-first : accueil personnalisé + UNE liste
 * unifiée (une ligne par analyse, certificat rattaché à sa ligne) + bouton de retour.
 *
 * Jointure analyse ↔ certificat : `certificat.projetId` = `analyse.id` (= `internaute_projet.id`). On indexe les
 * certificats par `projetId` (le plus récent l'emporte, la liste étant déjà triée `emis_le DESC`), puis on rattache.
 * TOUT le formatage d'affichage (date, score) est fait ICI, côté serveur → le client component ne reçoit que des chaînes.
 */
export default async function EspacePage() {
  const internauteId = await internauteConnecteDepuisCookies();
  if (!internauteId) redirect('/espace/connexion');

  const [identite, analyses, certificats] = await Promise.all([
    lireIdentite(internauteId),
    listerAnalyses(internauteId),
    listerCertificats(internauteId),
  ]);

  const certParProjet = new Map<number, CertificatResume>();
  for (const c of certificats) if (!certParProjet.has(c.projetId)) certParProjet.set(c.projetId, c);

  const lignes: LigneEspace[] = analyses.map((a) => {
    const c = certParProjet.get(a.id) ?? null;
    return {
      analyseId: a.id,
      dateLabel: dateFr(a.creeA),
      adresse: a.adresse ?? MSG_ADRESSE_ABSENTE,
      scoreLabel: formatScore(a.score),
      verdict: a.verdict,
      certificatId: c ? c.id : null,
      nominatifPret: c ? c.telechargeable : false,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col">
      <Bandeau titre={TITRE_ESPACE} />

      <div className="flex flex-col gap-7 px-5 py-6">
        {/* Accueil personnalisé */}
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="svv-verif-title text-xl font-extrabold text-svv-ink">{salutation(identite.prenom, identite.nom)}</h1>
            <p className="mt-1 text-sm text-svv-muted">{SOUS_LIGNE_ACCUEIL}</p>
          </div>
          <DeconnexionBouton />
        </header>

        {/* Liste unifiée : une ligne par analyse */}
        <section aria-labelledby="titre-analyses">
          <h2 id="titre-analyses" className="svv-verif-title text-lg font-extrabold text-svv-ink">{TITRE_ANALYSES}</h2>
          {lignes.length === 0 ? (
            <p className="mt-2 text-sm text-svv-muted">{MSG_AUCUNE_ANALYSE}</p>
          ) : (
            <ListeAnalyses lignes={lignes} />
          )}
        </section>

        {/* Retour à l'accueil de l'application — action secondaire, en pied de page */}
        <Link className="svv-btn svv-btn-outline" href="/">{LIB_RETOUR}</Link>
      </div>
    </main>
  );
}
