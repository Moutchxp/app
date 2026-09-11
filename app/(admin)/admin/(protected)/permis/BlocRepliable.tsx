'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * PERF-1 — BLOC DÉPLIABLE À CHARGEMENT PARESSEUX. Replié par défaut ; son corps — et donc ses REQUÊTES — n'est MONTÉ qu'au PREMIER
 * dépliage (le corps est une RENDER-PROP `children()`, évaluée uniquement une fois ouverte). Un bloc jamais ouvert ne monte jamais
 * son enfant → AUCUNE requête. Une fois ouvert, l'enfant reste MONTÉ (caché en CSS via `hidden` quand replié) : refermer/rouvrir ou
 * un re-rendu du parent ne relance AUCUNE requête (données chargées une seule fois).
 *
 * `titre` reste visible même replié (il peut porter un bilan léger). Accessible et tactile : vrai `<button>` + `aria-expanded`,
 * aucune interaction au survol seul (exigence transverse mobile §15).
 */
export function BlocRepliable({ titre, children, onOuvertChange, defautOuvert = false, ouvrirSignal }: {
  titre: ReactNode;                    // ligne de titre, visible repliée (peut porter un bilan léger)
  children: () => ReactNode;           // RENDER-PROP : évaluée (donc l'enfant monté) UNIQUEMENT une fois le bloc ouvert
  onOuvertChange?: (ouvert: boolean) => void; // notifie le parent (ex. jauge le bouton « Valider » sur l'ouverture des bâtiments)
  defautOuvert?: boolean;
  // OUVERTURE COMMANDÉE (optionnelle) : à chaque NOUVELLE valeur de `ouvrirSignal` (un nonce croissant), le bloc s'ouvre — et MONTE son enfant.
  //   Absente/undefined → comportement non contrôlé STRICTEMENT inchangé (tous les autres appelants). Ne PREND PAS le contrôle : l'internaute
  //   peut toujours replier/déplier ensuite. Sert au parent qui veut ouvrir un bloc frère d'un clic (BAT — accès à « Bâtiments et projection »).
  ouvrirSignal?: number;
}) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  const [dejaOuvert, setDejaOuvert] = useState(defautOuvert); // resté vrai après la 1re ouverture → l'enfant n'est plus démonté (pas de refetch)
  // Dernier signal HONORÉ (initialisé à la valeur au montage → un `ouvrirSignal` déjà posé au montage ne force PAS l'ouverture ; et un simple
  //   re-rendu à valeur INCHANGÉE ne rouvre pas un bloc que l'internaute vient de replier). L'ouverture n'est déclenchée qu'au CHANGEMENT.
  const dernierSignal = useRef<number | undefined>(ouvrirSignal);
  useEffect(() => {
    if (ouvrirSignal === undefined || ouvrirSignal === dernierSignal.current) return;
    dernierSignal.current = ouvrirSignal;
    setOuvert(true); setDejaOuvert(true); onOuvertChange?.(true);
  }, [ouvrirSignal, onOuvertChange]);

  const basculer = () => {
    const v = !ouvert;
    setOuvert(v);
    if (v) setDejaOuvert(true);
    onOuvertChange?.(v);
  };

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        style={{
          display: 'flex', alignItems: 'center', gap: '.4rem', width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '.5rem .6rem', fontSize: 13, fontWeight: 700, color: 'var(--color-svv-ink)',
          background: 'transparent', border: '1px solid var(--color-svv-line)', borderRadius: '.5rem',
        }}
      >
        <span aria-hidden style={{ color: 'var(--color-svv-muted)', flexShrink: 0 }}>{ouvert ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{titre}</span>
      </button>
      {/* Monté SEULEMENT après la 1re ouverture (dejaOuvert) ; caché en CSS quand replié → jamais démonté, donc jamais de refetch. */}
      {dejaOuvert && <div hidden={!ouvert}>{children()}</div>}
    </div>
  );
}
