'use client';

import { useState, type ReactNode } from 'react';

/**
 * LOT-5 — repli LÉGER à UN SEUL clic, pour un SOUS-bloc DANS une famille déjà dépliable (ex. « Liens, pièces et messages des réponses »
 * sous « Historique des échanges »). On n'utilise DÉLIBÉRÉMENT PAS `BlocRepliable` : imbriquer deux `BlocRepliable` reproduirait le
 * défaut « 2 clics » de « Complétude » (un pli dans un pli). Ici, un unique bouton bascule l'état ; le CONTENU n'est monté qu'à
 * l'ouverture (paresseux — aucun geste retiré, seulement caché derrière le pli, précédent 18/08). `defautOuvert` = état initial
 * (permet aux tests `renderToStaticMarkup`, sans DOM, de vérifier les deux états). `prefers-reduced-motion` : aucune animation ici.
 */
export function SousBlocRepliable({ titre, defautOuvert = false, children }: { titre: string; defautOuvert?: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  return (
    <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem' }}>
      <button
        type="button" className="svv-link" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}
        style={{ width: 'auto', padding: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-svv-muted)', display: 'inline-flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}
      >
        <span aria-hidden>{ouvert ? '▾' : '▸'}</span>{titre}
      </button>
      {ouvert && <div className="flex flex-col gap-1" style={{ marginTop: '.4rem' }}>{children}</div>}
    </div>
  );
}
