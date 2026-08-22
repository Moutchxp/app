'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PastilleActions } from './permis/PastilleActions';

/**
 * PASTILLES (tuile home) — sous-titre de la tuile « Permis de construire » + cumul des actions en attente. SANS action → rendu
 * ACTUEL inchangé (le sous-titre seul). AVEC au moins une action → le sous-titre est réduit à UNE ligne (troncature propre) et,
 * en dessous, la pastille rouge du cumul suivie à sa droite du texte « Actions en attente ». Le cumul vient de la MÊME route que
 * les onglets (source unique). Comptage à l'ouverture + une fois par jour à l'heure réglée ; AUCUN sondage périodique.
 */

/** Rendu PUR (présentationnel) : `cumul<=0` → sous-titre identique à aujourd'hui ; sinon tronqué + pastille + libellé. Testable. */
export function ContenuTuilePermis({ desc, cumul }: { desc: string; cumul: number }) {
  if (!Number.isFinite(cumul) || cumul <= 0) {
    return <span className="svv-grille-desc">{desc}</span>; // rendu ACTUEL inchangé
  }
  return (
    <>
      <span className="svv-grille-desc svv-grille-desc--clamp">{desc}</span>
      <span className="svv-grille-actions">
        <PastilleActions n={cumul} />
        <span>Actions en attente</span>
      </span>
    </>
  );
}

function msJusquaProchaineHeure(h: number): number {
  const now = new Date();
  const cible = new Date(now);
  cible.setHours(h, 0, 0, 0);
  if (cible.getTime() <= now.getTime()) cible.setDate(cible.getDate() + 1);
  return cible.getTime() - now.getTime();
}

export function TuilePermisActions({ desc }: { desc: string }) {
  const [cumul, setCumul] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recompterRef = useRef<() => Promise<void>>(async () => {}); // rompt l'auto-référence (planification quotidienne)

  const recompter = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/actions', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as { total: number; recomptageHeure: number };
      setCumul(d.total);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void recompterRef.current(); }, msJusquaProchaineHeure(d.recomptageHeure)); // recomptage quotidien
    } catch { /* cumul indisponible : la tuile reste identique à aujourd'hui */ }
  }, []);

  useEffect(() => {
    recompterRef.current = recompter;
    void (async () => { await recompterRef.current(); })(); // comptage à l'ouverture (via la ref → pas de setState direct en effet)
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [recompter]);

  return <ContenuTuilePermis desc={desc} cumul={cumul} />;
}
