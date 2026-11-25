'use client';

import { useEffect, useState } from 'react';
import { nombreCoproprietesACompleter, nombreRetards, nombreUrgences, pastilleVingt, TITRE_VINGT_POURCENT, type SuiviVingtLu } from '../../../../lib/location/vingtPourcent';

/**
 * 🔴 Arno (23/11/2026) — sur la ligne du titre « Location » de l'accueil, aligné à droite : le petit bouton qui ouvre « 20 % à restituer » en
 * pleine page. Pastille ROUGE avec le nombre de copropriétés à qui il manque la dernière AGO et/ou la date d'arrêté des comptes, parmi celles
 * d'au moins un locataire en attente des 20 % ; AUCUNE pastille à 0 (ni pendant la lecture, ni si elle échoue). Rien d'autre ne bouge sur l'accueil.
 * 🔴 Arno (24/11/2026) — une SECONDE pastille, ROUGE VIF, à gauche : le nombre de locataires en « Urgence » ; la première est gardée telle quelle.
 * 🔴🔴 Arno (25/11/2026) — « faire une seule capsule rouge qui cumule le nombre d'alertes » : UNE pastille rouge vif, en haut à droite, total =
 * locataires en urgence + copropriétés à compléter (masquée à 0) ; le détail au survol et dans le nom accessible du bouton (`pastilleVingt`).
 * 🔴🔴 Arno (25/11/2026) — le bouton ROUGE si au moins un locataire en « Alerte restitution en retard », sinon ORANGE si au moins un en « Urgence »,
 * sinon sa couleur d'origine ; la pastille ajoute les locataires en retard.
 */
export function usePastillesVingt(api: string = '/api/admin/location'): { copros: number; urgences: number; retards: number } {
  const [n, setN] = useState({ copros: 0, urgences: 0, retards: 0 });
  useEffect(() => {
    let vivant = true;
    fetch(`${api}?vingtPourcent=1`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: SuiviVingtLu }>)
      .then((d) => { if (vivant && d.etat === 'ok' && d.data) setN({ copros: nombreCoproprietesACompleter(d.data), urgences: nombreUrgences(d.data), retards: nombreRetards(d.data) }); })
      .catch(() => { /* sans pastille */ });
    return () => { vivant = false; };
  }, [api]);
  return n;
}
export function BoutonVingtPourcent() {
  const p = pastilleVingt(usePastillesVingt());
  return (
    <a className={`svv-btn svv-btn-outline gst-btn bvp${p.niveau !== null ? ` bvp--${p.niveau}` : ''}`} href="/admin/location/vingt-pourcent" data-bouton-vingt-pourcent
      data-vgp-niveau={p.niveau ?? 'origine'}
      title="Ouvrir « 20 % à restituer » en pleine page"
      aria-label={p.total > 0 ? `${TITRE_VINGT_POURCENT} — ${p.detail}` : TITRE_VINGT_POURCENT}>
      <span>{TITRE_VINGT_POURCENT}</span>
      <span className="bvp-plein" aria-hidden="true">⤢</span>
      {p.total > 0 && <span className="bvp-pastille" data-pastille-vingt-total={p.total} aria-hidden="true" title={p.detail}>{p.total}</span>}
      <style>{CSS_BOUTON_VINGT_POURCENT}</style>
    </a>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cible de 44 px. */
const CSS_BOUTON_VINGT_POURCENT = `
.bvp{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:44px;width:auto;padding:6px 12px;font-size:.88rem;text-decoration:none;white-space:nowrap}
.bvp-plein{font-size:1rem;line-height:1}
.bvp.bvp--rouge{background:var(--color-svv-red-soft);border-color:var(--color-svv-red);color:var(--color-svv-red-dark)}
.bvp.bvp--orange{background:var(--color-svv-orange-soft);border-color:var(--color-svv-urgence-orange);color:var(--color-svv-orange)}
.bvp-pastille{position:absolute;top:-8px;right:-8px;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--color-svv-rouge-vif);color:var(--color-svv-surface);font-size:.75rem;font-weight:800;border:2px solid var(--color-svv-surface);cursor:help}
`;
