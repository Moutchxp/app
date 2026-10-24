'use client';

import { cascadeAuCentime } from '../../../../lib/location/suivi/tableauBord';

/**
 * ══ 🔴 Arno (24/10/2026) — LA CASCADE DES HONORAIRES ═══════════════════════════════════════════════════════════════════════════
 *   Honoraires HT                       7 134,01 €
 *   − Dû à l'apporteur (COHEN Michel)       x €
 *   − Dû au collègue (Arnaud Jorel)         y €      ← absente pour un apporteur INTERNE (rattaché à personne)
 *   = Net agence HT                         z €
 * Montants à droite, chiffres tabulaires ; juste au centime (`cascadeAuCentime`). Cartes de l'annuaire, « Fiche et cumul » (par
 * dossier) et panneau déplié de « Locations du mois ».
 */
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function CascadeHonoraires({ ca, apporteur, collegue, nomApporteur, nomCollegue, repere, compacte = false }: {
  ca: number; apporteur: number; collegue: number | null; nomApporteur: string; nomCollegue?: string | null; repere?: string; compacte?: boolean;
}) {
  const c = cascadeAuCentime({ ca, apporteur, collegue });
  return (
    <dl className={`cas${compacte ? ' cas--compacte' : ''}`} data-cascade={repere ?? ''}>
      <style>{CSS_CASCADE}</style>
      <div data-cascade-ligne="ca"><dt>Honoraires HT</dt><dd>{euros(c.ca)}</dd></div>
      <div data-cascade-ligne="apporteur"><dt>− Dû à l’apporteur ({nomApporteur})</dt><dd>{euros(c.apporteur)}</dd></div>
      {c.collegue !== null && <div data-cascade-ligne="collegue"><dt>− Dû au collègue ({nomCollegue ?? '—'})</dt><dd>{euros(c.collegue)}</dd></div>}
      <div className="cas-net" data-cascade-ligne="net"><dt>= Net agence HT</dt><dd>{euros(c.net)}</dd></div>
    </dl>
  );
}

export const CSS_CASCADE = `
.cas{margin:6px 0;padding:8px 12px;border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-field);max-width:520px;font-size:.88rem}
.cas>div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:2px 0}
.cas dt{color:var(--color-svv-muted);font-weight:600;min-width:0;overflow-wrap:anywhere}
.cas dd{margin:0;color:var(--color-svv-ink);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.cas-net{border-top:1px solid var(--color-svv-line-strong);margin-top:2px;padding-top:4px !important}
.cas-net dt,.cas-net dd{color:var(--color-svv-ink);font-weight:800}
.cas--compacte{margin:0;padding:4px 8px;font-size:.82rem;max-width:none}
`;
