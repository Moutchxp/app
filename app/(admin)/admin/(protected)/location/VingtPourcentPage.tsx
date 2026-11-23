'use client';

import { LienRetour } from '../_composants/NavigationRetour';
import { EcranVingtPourcent } from './VingtPourcent';

/** « 20 % à restituer » dans la tuile Location (pleine page), lu par la route Location ; retour à l'accueil Location. */
export function PageVingtPourcent() {
  return <EcranVingtPourcent api="/api/admin/location" retour={<p className="loc-retour"><LienRetour href="/admin/location" mot="Location" /></p>} />;
}
