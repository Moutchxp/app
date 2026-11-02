'use client';

import { useEffect, useState } from 'react';
import { BoutonAffichage, CSS_TRANSACTION, montantAffiche, useAffichageRetenu } from '../transaction/commun';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';

/**
 * 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — l'accueil de l'espace : deux compteurs, « Mes compromis en cours » et « Mes ventes actées cette année »
 * (nombre — mon CA, décision 1), avec la bascule « HT | TTC » du Suivi CA (la même mémoire du navigateur). Les données viennent de
 * /api/admin/mon-espace/affaires, déjà filtrées par le serveur ; les listes complètes arrivent au lot 4.
 */
type Lu = { etat: 'chargement' } | { etat: 'ok'; data: MesAffaires } | { etat: 'erreur' };

export const URL_MES_AFFAIRES = '/api/admin/mon-espace/affaires';

export function MesCompteurs() {
  const [lu, setLu] = useState<Lu>({ etat: 'chargement' });
  const [unite, setUnite] = useAffichageRetenu();
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_MES_AFFAIRES, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: MesAffaires };
        if (vivant) setLu(r.ok && j.etat === 'ok' && j.data !== undefined ? { etat: 'ok', data: j.data } : { etat: 'erreur' });
      } catch { if (vivant) setLu({ etat: 'erreur' }); }
    })();
    return () => { vivant = false; };
  }, []);

  if (lu.etat === 'chargement') return <p className="loc-muet" role="status" data-mon-espace-chargement>Chargement de vos affaires…</p>;
  if (lu.etat === 'erreur') return <p className="loc-alerte loc-alerte--orange" role="alert" data-mon-espace-erreur>Vos affaires n’ont pas pu être lues. Rechargez la page.</p>;
  const { compteurs, disponible } = lu.data;
  const total = (c: { ca: { htC: number; ttcC: number } }): string => montantAffiche(unite, c.ca.htC / 100, c.ca.ttcC / 100);
  const nombre = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;
  return (
    <div className="mes-compteurs-bloc">
      <style>{CSS_TRANSACTION}{CSS_MES_COMPTEURS}</style>
      {!disponible && <p className="loc-alerte loc-alerte--orange" role="status">Le Suivi CA n’est pas encore en place dans la base : aucune affaire à montrer.</p>}
      <div className="mes-compteurs-tete"><span className="loc-muet">Montants en</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
      <div className="mes-compteurs">
        <section className="svv-card mes-compteur" aria-label="Mes compromis en cours" data-compteur="compromis">
          <h3>Mes compromis en cours</h3>
          <p className="mes-compteur-chiffres"><span data-compteur-nb>{nombre(compteurs.compromis.nb, 'compromis', 'compromis')}</span>
            <span aria-hidden="true"> — </span><strong data-compteur-total>{total(compteurs.compromis)}</strong></p>
        </section>
        <section className="svv-card mes-compteur" aria-label={`Mes ventes actées en ${compteurs.actees.annee}`} data-compteur="actees">
          <h3>Mes ventes actées cette année ({compteurs.actees.annee})</h3>
          <p className="mes-compteur-chiffres"><span data-compteur-nb>{nombre(compteurs.actees.nb, 'vente', 'ventes')}</span>
            <span aria-hidden="true"> — </span><strong data-compteur-total>{total(compteurs.actees)}</strong></p>
        </section>
      </div>
      <p className="loc-muet mes-compteurs-note">Le montant est votre CA : les honoraires du côté (vendeur ou acquéreur) que vous portez sur chaque affaire.</p>
    </div>
  );
}

// Les jetons de la charte seulement ; deux colonnes sur grand écran, une sur téléphone.
const CSS_MES_COMPTEURS = `
.mes-compteurs-tete{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;margin:0 0 .75rem}
.mes-compteurs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:.75rem}
.mes-compteur h3{margin:0 0 .4rem;font-size:1rem}
.mes-compteur-chiffres{margin:0;font-size:1.15rem;color:var(--color-svv-ink)}
.mes-compteur-chiffres strong{color:var(--color-svv-green)}
.mes-compteurs-note{margin:.75rem 0 0;font-size:.9rem}
`;
