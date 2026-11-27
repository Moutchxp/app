'use client';

import { useCallback, useState } from 'react';
import { LienRetour } from '../_composants/NavigationRetour';
import { useContexteRedaction } from '../gestion/useContexteRedaction';
import { mailVingtDuContexte } from './MailVingtPourcent';
import { EcranVingtPourcent } from './VingtPourcent';

/**
 * « 20 % à restituer » dans la tuile Location (pleine page), lu par la route Location ; retour à l'accueil Location.
 * 🔴🔴 (Arno, 27/11/2026, 22h17) « Si je valide la restitution, je veux pouvoir envoyer les mails » : la même règle que 7b5715a6 — c'est le DROIT
 * D'ENVOI qui décide, pas la tuile. La page prend le contexte d'écriture de la boîte Gestion (useContexteRedaction) : mails de la restitution,
 * « Envoyer un mail » de la ligne et « Répondre », depuis gestion@, contrôlés au serveur à chaque envoi. Sans le droit : rien ne part, et c'est dit.
 */
export function PageVingtPourcent() {
  const redaction = useContexteRedaction();
  const [message, setMessage] = useState<string | null>(null);
  const onGeste = useCallback((m: string) => { if (m.trim() !== '') setMessage(m); }, []);
  return <EcranVingtPourcent api="/api/admin/location" mail={mailVingtDuContexte(redaction, onGeste)}
    retour={<>
      <p className="loc-retour"><LienRetour href="/admin/location" mot="Location" /></p>
      {message !== null && <p className="gst-info" role="status" data-vgp-geste-mail>{message}</p>}
    </>} />;
}
