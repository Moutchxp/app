'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PastilleActions } from './permis/PastilleActions';

/**
 * F7 — sous-titre de la tuile home « Sources de données » + pastille du nombre de sources PRÊTES à être mises à jour (une
 * publication plus récente détectée ET une procédure de réingestion documentée). SANS mise à jour actionnable → rendu ACTUEL
 * inchangé (le sous-titre seul). Le compte vient de la MÊME logique que l'écran Sources (route dédiée). Comptage à l'ouverture ;
 * AUCUN sondage périodique. Compte indéterminable (route en échec / indisponible) → AUCUNE pastille, jamais « 0 ».
 */

/** Rendu PUR (présentationnel) : `total<=0` → sous-titre identique à aujourd'hui ; sinon tronqué + pastille + libellé. Testable. */
export function ContenuTuileSources({ desc, total }: { desc: string; total: number }) {
  if (!Number.isFinite(total) || total <= 0) return <span className="svv-grille-desc">{desc}</span>; // rendu ACTUEL inchangé
  const label = `${total} mise${total > 1 ? 's' : ''} à jour de base de données disponible${total > 1 ? 's' : ''}`;
  return (
    <>
      <span className="svv-grille-desc svv-grille-desc--clamp">{desc}</span>
      <span className="svv-grille-actions">
        <PastilleActions n={total} ariaLabel={label} />
        <span>Mises à jour disponibles</span>
      </span>
    </>
  );
}

export function TuileSourcesActions({ desc }: { desc: string }) {
  const [total, setTotal] = useState(0);
  const chargerRef = useRef<() => Promise<void>>(async () => {}); // ref d'indirection (lint-clean, cf. TuilePermisActions)

  const charger = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/sources/pastille', { cache: 'no-store' });
      if (!res.ok) return; // 503 → aucune pastille (la tuile reste identique à aujourd'hui)
      const d = (await res.json()) as { total?: number; indisponible?: boolean };
      if (typeof d.total === 'number') setTotal(d.total); // `indisponible` → on laisse 0 → aucune pastille (jamais « 0 » affiché)
    } catch { /* compte indisponible : tuile inchangée, aucune pastille */ }
  }, []);

  useEffect(() => {
    chargerRef.current = charger;
    void (async () => { await chargerRef.current(); })(); // comptage à l'ouverture (via la ref → pas de setState direct en effet)
  }, [charger]);

  return <ContenuTuileSources desc={desc} total={total} />;
}
