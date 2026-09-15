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
  const [total, setTotal] = useState<number | null>(null);       // formulaire TOUS TYPES (secondaire, en retrait)
  const [horsDemo, setHorsDemo] = useState<number | null>(null); // formulaire HORS DÉMOLITION (principal, saute aux yeux)
  const [tronque, setTronque] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/vivier-compteur', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setErreur(true); return; }
        const d = (await res.json()) as { formulaire: number; formulaireHorsDemolition?: number; tronque: boolean };
        setTotal(d.formulaire);
        // Repli sûr : champ absent (route antérieure) → on retombe sur le total, jamais un « undefined » affiché.
        setHorsDemo(typeof d.formulaireHorsDemolition === 'number' ? d.formulaireHorsDemolition : d.formulaire);
        setTronque(!!d.tronque); setErreur(false);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [signalRafraichir]); // même signal que le carrousel (création / dépôt / annulation) — les DEUX nombres se rafraîchissent ensemble

  const mini = (v: number): string => (tronque ? `au moins ${v}` : String(v)); // tronque → décompte MINIMUM, pour les DEUX nombres

  return (
    <p role="status" aria-live="polite" style={{ margin: 0, textAlign: 'left', fontSize: 13, color: 'var(--color-svv-ink)' }}>
      {erreur
        ? 'Vivier téléservice indisponible.'
        : total === null || horsDemo === null
          ? 'Comptage des permis demandables (téléservice)…'
          : (
            <>
              {/* PRINCIPAL — le nombre qui SAUTE AUX YEUX (gras) + libellé EXPLICITE « hors démolition ». */}
              <strong>{mini(horsDemo)}</strong> permis encore demandables hors démolition sur le rail Téléservice
              {/* SECONDAIRE — total TOUS TYPES, EN RETRAIT (gris + plus petit), séparé par un « · » discret : information de second
                  rang, jamais un nombre nu (il porte son libellé « tous types confondus »). */}
              <span style={{ color: 'var(--color-svv-muted)', fontSize: 12 }}> · {mini(total)} tous types confondus</span>
            </>
          )}
    </p>
  );
}
