'use client';

import { useEffect, useState } from 'react';
import { nombreCoproprietesACompleter, nombreUrgences, TITRE_VINGT_POURCENT, type SuiviVingtLu } from '../../../../lib/location/vingtPourcent';

/**
 * 🔴 Arno (23/11/2026) — sur la ligne du titre « Location » de l'accueil, aligné à droite : le petit bouton qui ouvre « 20 % à restituer » en
 * pleine page. Pastille ROUGE avec le nombre de copropriétés à qui il manque la dernière AGO et/ou la date d'arrêté des comptes, parmi celles
 * d'au moins un locataire en attente des 20 % ; AUCUNE pastille à 0 (ni pendant la lecture, ni si elle échoue). Rien d'autre ne bouge sur l'accueil.
 * 🔴 Arno (24/11/2026) — une SECONDE pastille, ROUGE VIF, à gauche : le nombre de locataires en « Urgence » ; la première est gardée telle quelle.
 */
export function usePastillesVingt(api: string = '/api/admin/location'): { copros: number; urgences: number } {
  const [n, setN] = useState({ copros: 0, urgences: 0 });
  useEffect(() => {
    let vivant = true;
    fetch(`${api}?vingtPourcent=1`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: SuiviVingtLu }>)
      .then((d) => { if (vivant && d.etat === 'ok' && d.data) setN({ copros: nombreCoproprietesACompleter(d.data), urgences: nombreUrgences(d.data) }); })
      .catch(() => { /* sans pastille */ });
    return () => { vivant = false; };
  }, [api]);
  return n;
}
export function BoutonVingtPourcent() {
  const { copros: n, urgences: u } = usePastillesVingt();
  return (
    <a className="svv-btn svv-btn-outline gst-btn bvp" href="/admin/location/vingt-pourcent" data-bouton-vingt-pourcent
      title="Ouvrir « 20 % à restituer » en pleine page"
      aria-label={[TITRE_VINGT_POURCENT, ...(u > 0 ? [`${u} locataire${u > 1 ? 's' : ''} en urgence`] : []), ...(n > 0 ? [`${n} copropriété${n > 1 ? 's' : ''} en attente de données`] : [])].join(' — ')}>
      <span>{TITRE_VINGT_POURCENT}</span>
      <span className="bvp-plein" aria-hidden="true">⤢</span>
      {n > 0 && <span className="bvp-pastille" data-pastille-vingt-pourcent={n} aria-hidden="true">{n}</span>}
      {u > 0 && <span className="bvp-pastille bvp-pastille--urgence" data-pastille-vingt-urgence={u} aria-hidden="true" title={`${u} locataire${u > 1 ? 's' : ''} en urgence`}>{u}</span>}
      <style>{CSS_BOUTON_VINGT_POURCENT}</style>
    </a>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cible de 44 px. */
const CSS_BOUTON_VINGT_POURCENT = `
.bvp{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:44px;width:auto;padding:6px 12px;font-size:.88rem;text-decoration:none;white-space:nowrap}
.bvp-plein{font-size:1rem;line-height:1}
.bvp-pastille{position:absolute;top:-8px;right:-8px;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.75rem;font-weight:800;border:2px solid var(--color-svv-surface)}
.bvp-pastille.bvp-pastille--urgence{right:auto;left:-8px;background:var(--color-svv-rouge-vif)}
`;
