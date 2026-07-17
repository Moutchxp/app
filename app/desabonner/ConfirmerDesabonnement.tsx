'use client';

import { useState } from 'react';

/**
 * Bouton de confirmation du désabonnement (client MINIMAL). Le GET d'atterrissage (`page.tsx`) n'écrit RIEN ; SEUL ce
 * POST explicite retire le consentement F2. Aucune donnée personnelle n'est manipulée ici — juste le jeton (déjà dans
 * l'URL). La finalité retirée est forcée EN DUR côté serveur (voir la route) : ce composant ne l'envoie jamais.
 */
type Etat = 'idle' | 'envoi' | 'retire' | 'deja' | 'erreur';

export function ConfirmerDesabonnement({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>('idle');

  const confirmer = async () => {
    setEtat('envoi');
    try {
      const res = await fetch('/api/internaute/consentement/retrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      });
      if (!res.ok) {
        setEtat('erreur'); // aucun corps d'erreur serveur affiché
        return;
      }
      const data = await res.json().catch(() => ({} as { deja?: boolean }));
      setEtat(data?.deja ? 'deja' : 'retire');
    } catch {
      setEtat('erreur');
    }
  };

  if (etat === 'retire') {
    return <p className="leading-relaxed text-svv-green">C&apos;est fait. Vous ne recevrez plus de mails de Sans Vis-à-Vis®.</p>;
  }
  if (etat === 'deja') {
    // Honnêteté : rien n'a été écrit (F2 était déjà inactive) — on ne prétend pas avoir agi.
    return <p className="leading-relaxed text-svv-ink">Vous n&apos;êtes déjà plus abonné aux mails de Sans Vis-à-Vis®.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="leading-relaxed text-svv-ink">Vous êtes abonné aux mails de Sans Vis-à-Vis®.</p>
      {etat === 'erreur' && (
        <p role="alert" className="text-sm font-semibold text-svv-red">
          Le désabonnement n&apos;a pas pu être enregistré. Réessayez dans un instant.
        </p>
      )}
      <button type="button" className="svv-btn svv-btn-primary" disabled={etat === 'envoi'} onClick={confirmer}>
        {etat === 'envoi' ? 'Envoi…' : 'Confirmer le désabonnement'}
      </button>
    </div>
  );
}
