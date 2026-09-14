'use client';

import { useEffect, useState } from 'react';

/**
 * Lot 2 (carrousel Téléservice) — COMPTEUR DE VIVIER, au-dessus du carrousel, à gauche. Affiche le nombre de PERMIS encore
 * DEMANDABLES sur le rail téléservice (stock restant), servi par /demandes/vivier-compteur (dérivé de `chargerVivier` : ni cap
 * ni plafond). Le libellé dit EN TOUTES LETTRES qu'il compte des PERMIS — à ne pas confondre avec « N commune(s) » du bloc de
 * rail (process-compteurs, GROUP BY mairie_contact) : deux nombres différents cohabitent, chacun s'annonce clairement.
 *
 * INDÉPENDANT du carrousel : ce composant vit à côté de BlocDepot dans ADemanderVue → il s'affiche MÊME quand le carrousel rend
 * null (0 carte). Se rafraîchit sur le MÊME signal que le carrousel (`signalRafraichir` : préparation / dépôt / annulation).
 * LECTURE SEULE. `tronque` (plafond de chargement atteint) → « au moins N » (jamais un total faux affiché comme exact).
 */
export function CompteurVivierTeleservice({ signalRafraichir }: { signalRafraichir: number }) {
  const [n, setN] = useState<number | null>(null);
  const [tronque, setTronque] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/vivier-compteur', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setErreur(true); return; }
        const d = (await res.json()) as { formulaire: number; tronque: boolean };
        setN(d.formulaire); setTronque(!!d.tronque); setErreur(false);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [signalRafraichir]); // même signal que le carrousel (création / dépôt / annulation)

  return (
    <p role="status" aria-live="polite" style={{ margin: 0, textAlign: 'left', fontSize: 13, color: 'var(--color-svv-ink)' }}>
      {erreur
        ? 'Vivier téléservice indisponible.'
        : n === null
          ? 'Comptage des permis demandables (téléservice)…'
          : <><strong>{tronque ? `au moins ${n}` : n}</strong> permis encore demandables sur le rail Téléservice</>}
    </p>
  );
}
