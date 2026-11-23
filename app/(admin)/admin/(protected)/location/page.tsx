import { redirect } from 'next/navigation';
import { EnTetePage } from '../_composants/EnTetePage';
import { accesLocation, REFUS_LOCATION } from './acces';
import { AccueilLocation } from './AccueilLocation';
import { BoutonVingtPourcent } from './BoutonVingtPourcent';
import { redirectionAncienLien } from '../../../../lib/location/cheminCompteRendu';

/**
 * Module « LOCATION » — l'accueil de la tuile (refonte d'Arno du 17/10/2026) : un moteur de recherche en haut, puis
 * trois grosses cases (propriétaires / biens, locataires, outils de suivi). MODULE GARDÉ par `perm_location` (migration 371).
 * 🔴 Les écrans de la Location vivent sous /admin/location ; seules les DONNÉES sont communes avec la Gestion.
 * 🔴 Arno (15/11/2026) — l'ancien lien du compte rendu (`?previsite=…&geste=compte-rendu`) est redirigé ICI, par le serveur, vers la page
 * du formulaire : la Location n'est jamais montée dessous.
 */
const INTRO_LOCATION =
  'L’espace de l’équipe location : propriétaires, biens et annexes, locataires — sur le même fichier que la Gestion.';

export default async function LocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cible = redirectionAncienLien(await searchParams);
  if (cible !== null) redirect(cible);
  const { autorise, gestion } = await accesLocation();
  return (
    <section className="gst-page">
      {/* 🔴 Arno (23/11/2026) — sur la ligne du titre, à droite : « 20 % à restituer » en pleine page, avec sa pastille (rien d'autre ne bouge) */}
      <EnTetePage titre="Location" intro={INTRO_LOCATION} {...(autorise ? { actions: <BoutonVingtPourcent /> } : {})} />
      {autorise ? <AccueilLocation gestion={gestion} /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
      )}
    </section>
  );
}
