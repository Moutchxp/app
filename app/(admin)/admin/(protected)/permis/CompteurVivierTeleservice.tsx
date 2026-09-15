'use client';

import { useEffect, useState } from 'react';

/**
 * Lot 2 (carrousel Téléservice) — COMPTEUR DE VIVIER, rendu SUR LA LIGNE de navigation du carrousel (dans son prolongement, à la
 * suite des flèches et du « n sur m »), passé en prop `compteurVivier` à BlocDepot. Affiche le nombre de PERMIS encore
 * DEMANDABLES sur le rail téléservice (stock restant), servi par /demandes/vivier-compteur (dérivé de `chargerVivier` : ni cap
 * ni plafond). Le libellé dit EN TOUTES LETTRES qu'il compte des PERMIS — à ne pas confondre avec « n sur m » (PAGES du carrousel)
 * ni avec « N commune(s) » du bloc de rail (process-compteurs, GROUP BY mairie_contact) : des nombres différents cohabitent.
 *
 * INDÉPENDANT du carrousel : monté PAR BlocDepot (prop `compteurVivier`) et rendu MÊME à 0 carte (la barre subsiste pour lui) → il
 * s'affiche toujours. Se rafraîchit sur le MÊME signal que le carrousel (`signalRafraichir` : préparation / dépôt / annulation),
 * y compris à la relecture périodique (commit d2a41ee).
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
