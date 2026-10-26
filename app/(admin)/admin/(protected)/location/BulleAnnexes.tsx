'use client';

import type { ReactNode } from 'react';
import { motAnnexes, type AnnexeDuGroupe } from '../../../../lib/location/suivi/biensRegroupes';
import { useBulle } from './LigneManques';

/**
 * ══ 🔴 Arno (26/10/2026) — « + N annexe(s) » APRÈS L'ADRESSE DU LOT PRINCIPAL, LE DÉTAIL DANS UNE BULLE ═══════════════════════════════
 * Outils de suivi, une ligne par bien : la bulle dit chaque annexe (type, n° de porte ou de place, lot, niveau, adresse si elle diffère),
 * et ce que la ligne d'annexe portait (« non comptée », un montant à elle) — rien de l'ancienne ligne ne se perd. Mêmes gestes que
 * « Reste à renseigner » (`useBulle`) : survol de la souris, toucher, focus clavier ; Échap ou un toucher ailleurs la referme. Zone ≥ 24 px.
 * `place` : « dessous » dans une fenêtre qui défile (une bulle au-dessus y serait coupée par le haut).
 */
export function BulleAnnexes<T>({ annexes, note, extra, place = 'dessus', repere }: {
  annexes: readonly AnnexeDuGroupe<T>[];
  /** Une phrase en tête de bulle (ex. le lot principal sans mouvement sur la période). */
  note?: string | null;
  /** Ce qu'il faut ajouter au détail d'une annexe (« non comptée », son montant…). */
  extra?: (a: AnnexeDuGroupe<T>) => ReactNode;
  place?: 'dessus' | 'dessous';
  repere?: string | number;
}) {
  const b = useBulle();
  if (annexes.length === 0) return null;
  return (
    <span className={`anx-bulle-zone anx-bulle-zone--${place}`} {...b.zone} data-annexes-zone={repere}>
      <button className="anx-bulle-declencheur" {...b.declencheur} data-annexes-declencheur>{motAnnexes(annexes.length)}</button>
      <span className="anx-bulle" {...b.bulle} data-annexes-bulle>
        {note && <span className="anx-bulle-note">{note}</span>}
        <ul>{annexes.map((a) => (
          <li key={a.lotId} data-annexe-detail={a.lotId}>
            <strong>{a.type}</strong>{a.details.length > 0 ? ` · ${a.details.join(' · ')}` : ''}{extra?.(a)}
          </li>
        ))}</ul>
      </span>
    </span>
  );
}

/** La feuille de la bulle (jetons --color-svv-* seulement : clair, sombre et système ; jamais plus large que l'écran). */
export const CSS_BULLE_ANNEXES = `
/* 🔴 Arno (26/10/2026) — « + 1 annexe » DISCRET : texte plus petit, couleur secondaire, souligné pointillé, aligné sur la ligne de base de
   l'adresse — plus de gros bouton arrondi. La zone active reste de 24 px de haut au moins ; la bulle et ses gestes ne changent pas. */
.anx-bulle-zone{position:relative;display:inline-block;vertical-align:baseline;margin-left:6px}
.anx-bulle-declencheur{display:inline-flex;align-items:baseline;min-height:24px;padding:3px 2px;border:0;border-radius:4px;background:none;color:var(--color-svv-muted);font:inherit;font-size:.78rem;font-weight:600;line-height:18px;white-space:nowrap;cursor:help;text-decoration:underline dotted;text-underline-offset:3px;vertical-align:baseline}
@media (hover:hover){ .anx-bulle-declencheur:hover{color:var(--color-svv-ink)} }
.anx-bulle-declencheur[aria-expanded="true"]{color:var(--color-svv-ink)}
.anx-bulle-declencheur:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.anx-bulle{display:none;position:absolute;left:0;z-index:20;width:max-content;max-width:min(26rem,calc(100vw - 48px));padding:10px 14px;border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface-raised);color:var(--color-svv-ink);font-size:.85rem;font-weight:400;line-height:1.45;text-align:left;white-space:normal;overflow-wrap:anywhere;box-shadow:0 10px 28px color-mix(in srgb,var(--color-svv-ink) 22%,transparent)}
.anx-bulle-zone--dessus .anx-bulle{bottom:calc(100% + 8px)}
.anx-bulle-zone--dessous .anx-bulle{top:calc(100% + 8px)}
.anx-bulle[data-ouvert]{display:block}
.anx-bulle-note{display:block;margin:0 0 6px;color:var(--color-svv-muted)}
.anx-bulle ul{margin:0;padding-left:1.1em}
.anx-bulle li + li{margin-top:4px}
.anx-bulle-extra{color:var(--color-svv-muted)}
/* iPhone en portrait : la bulle se pose en bas de l'écran, sur toute la largeur moins 16 px de chaque côté — jamais de débordement. */
@media (max-width:640px){ .anx-bulle-zone--dessus .anx-bulle,.anx-bulle-zone--dessous .anx-bulle{position:fixed;left:16px;right:16px;top:auto;bottom:16px;width:auto;max-width:none;max-height:60vh;overflow-y:auto} }
`;
