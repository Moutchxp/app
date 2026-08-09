'use client';

import { useState } from 'react';

/**
 * X5 — bouton de CONFIRMATION de la saisine CADA (client MINIMAL). Le GET d'atterrissage (page.tsx) n'écrit RIEN ; SEUL ce
 * POST explicite, déclenché par le clic, lance la saisine (création + orchestrateur d'envoi, chemin PARTAGÉ avec l'onglet).
 * Un scanner/antivirus/prefetch qui suit le lien de l'e-mail n'atteint jamais ce POST → aucune saisine envoyée toute seule.
 */
type Etat = 'idle' | 'envoi' | 'lancee' | 'formulaire' | 'deja' | 'refus' | 'erreur';

export function ConfirmerSaisineCada({ jeton, urlOnglet }: { jeton: string; urlOnglet: string }) {
  const [etat, setEtat] = useState<Etat>('idle');
  const [motif, setMotif] = useState('');

  const confirmer = async () => {
    setEtat('envoi');
    try {
      const res = await fetch('/api/cada/confirmer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; canal?: string; etat?: string; message?: string; motif?: string };
      if (res.ok && data.ok) { setEtat(data.canal === 'formulaire' ? 'formulaire' : 'lancee'); return; }
      if (data.etat === 'deja') { setEtat('deja'); return; }
      setMotif(data.message ?? data.motif ?? '');
      setEtat(res.status >= 500 ? 'erreur' : 'refus');
    } catch {
      setEtat('erreur');
    }
  };

  if (etat === 'lancee') return <p className="leading-relaxed font-semibold text-svv-green">C’est fait : la saisine a été envoyée à la CADA, avec la copie de votre demande en pièce jointe.</p>;
  if (etat === 'formulaire') return <p className="leading-relaxed text-svv-ink">La saisine est préparée. Aucune adresse CADA n’étant configurée, déposez-la à la main : ouvrez l’onglet «&nbsp;Saisines CADA&nbsp;» (file de dépôt). <a className="underline" href={urlOnglet}>Ouvrir l’onglet</a></p>;
  if (etat === 'deja') return <p className="leading-relaxed text-svv-ink">Cette saisine a déjà été lancée pour cette demande. Rien de plus à faire ici.</p>;
  if (etat === 'refus') return <p role="alert" className="leading-relaxed text-svv-ink">{motif || 'La saisine n’est pas possible pour cette demande.'}</p>;

  return (
    <div className="flex flex-col gap-3">
      {etat === 'erreur' && <p role="alert" className="text-sm font-semibold text-svv-red">La saisine n’a pas pu être lancée. Réessayez dans un instant.</p>}
      <button type="button" className="svv-btn svv-btn-primary" disabled={etat === 'envoi'} onClick={confirmer}>
        {etat === 'envoi' ? 'Envoi…' : 'Confirmer et saisir la CADA'}
      </button>
    </div>
  );
}
