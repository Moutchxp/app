'use client';

import { useEffect, useState } from 'react';
import { nombreCoproprietesACompleter, TITRE_VINGT_POURCENT, type SuiviVingtLu } from '../../../../lib/location/vingtPourcent';

/**
 * 🔴 Arno (23/11/2026) — sur la ligne du titre « Location » de l'accueil, aligné à droite : le petit bouton qui ouvre « 20 % à restituer » en
 * pleine page. Pastille ROUGE avec le nombre de copropriétés à qui il manque la dernière AGO et/ou la date d'arrêté des comptes, parmi celles
 * d'au moins un locataire en attente des 20 % ; AUCUNE pastille à 0 (ni pendant la lecture, ni si elle échoue). Rien d'autre ne bouge sur l'accueil.
 */
export function BoutonVingtPourcent() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch('/api/admin/location?vingtPourcent=1', { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: SuiviVingtLu }>)
      .then((d) => { if (vivant && d.etat === 'ok' && d.data) setN(nombreCoproprietesACompleter(d.data)); })
      .catch(() => { /* sans pastille */ });
    return () => { vivant = false; };
  }, []);
  return (
    <a className="svv-btn svv-btn-outline gst-btn bvp" href="/admin/location/vingt-pourcent" data-bouton-vingt-pourcent
      title="Ouvrir « 20 % à restituer » en pleine page"
      aria-label={n > 0 ? `${TITRE_VINGT_POURCENT} — ${n} copropriété${n > 1 ? 's' : ''} en attente de données` : TITRE_VINGT_POURCENT}>
      <span>{TITRE_VINGT_POURCENT}</span>
      <span className="bvp-plein" aria-hidden="true">⤢</span>
      {n > 0 && <span className="bvp-pastille" data-pastille-vingt-pourcent={n} aria-hidden="true">{n}</span>}
      <style>{CSS_BOUTON_VINGT_POURCENT}</style>
    </a>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cible de 44 px. */
const CSS_BOUTON_VINGT_POURCENT = `
.bvp{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:44px;width:auto;padding:6px 12px;font-size:.88rem;text-decoration:none;white-space:nowrap}
.bvp-plein{font-size:1rem;line-height:1}
.bvp-pastille{position:absolute;top:-8px;right:-8px;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.75rem;font-weight:800;border:2px solid var(--color-svv-surface)}
`;
