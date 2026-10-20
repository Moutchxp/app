'use client';

import { LIBELLE_MANDAT, type Mandat, type SorteMandat } from '../../../../lib/location/mandatBien';

/**
 * ══ 🔴🔴 « BIEN EN GESTION ? » — LA LIGNE DU MANDAT (Arno, 21/10/2026, migration 397) ═════════════════════════════════════════
 * Juste sous les boutons Oui / Non : Oui ouvre « Mandat de gestion », Non ouvre « Mandat de transaction locative » (n° et date de
 * signature), avec l'animation de dépliement des encarts (hauteur et opacité, 0,28 s ; aucune si l'on a demandé moins
 * d'animations). Les DEUX lignes restent montées : basculer Oui / Non referme l'une et ouvre l'autre, et ce qui a été saisi dans
 * la ligne refermée est gardé tant qu'on reste sur l'écran (seul le mandat du choix final est envoyé, par l'écran hôte).
 * FACULTATIF : jamais dans « Reste à renseigner », jamais bloquant.
 */
export function LignesMandat({ enGestion, mandats, onChange, notes }: {
  enGestion: boolean | null;
  mandats: Record<SorteMandat, Mandat>;
  onChange: (sorte: SorteMandat, m: Mandat) => void;
  /** « Pré-rempli avec le mandat de … » par sorte, s'il y a lieu. */
  notes?: Partial<Record<SorteMandat, string | null>>;
}) {
  const ligne = (sorte: SorteMandat, ouverte: boolean) => {
    const m = mandats[sorte];
    return (
      <div className={`lmd${ouverte ? ' lmd--ouverte' : ''}`} aria-hidden={!ouverte} inert={!ouverte} data-mandat-ligne={sorte} data-ouverte={ouverte ? 'oui' : 'non'}>
        <div className="lmd-dedans">
          <fieldset className="lmd-champs">
            <legend>{LIBELLE_MANDAT[sorte]} <span className="loc-muet">(facultatif)</span></legend>
            <label className="loc-champ">N° de mandat
              <input value={m.numero ?? ''} maxLength={80} placeholder={sorte === 'gestion' ? 'ex. MG 2026-041' : 'ex. MT 2026-041'} data-mandat-numero={sorte}
                onChange={(e) => onChange(sorte, { ...m, numero: e.target.value === '' ? null : e.target.value })} /></label>
            <label className="loc-champ">Date de signature
              <input type="date" value={m.signeLe ?? ''} data-mandat-date={sorte}
                onChange={(e) => onChange(sorte, { ...m, signeLe: e.target.value === '' ? null : e.target.value })} /></label>
          </fieldset>
          {notes?.[sorte] && <p className="loc-muet lmd-note" data-mandat-note={sorte}>{notes[sorte]}</p>}
        </div>
      </div>
    );
  };
  return (
    <div className="lmd-bloc">
      <style>{CSS_LIGNES_MANDAT}</style>
      {ligne('gestion', enGestion === true)}
      {ligne('transaction', enGestion === false)}
    </div>
  );
}

/** L'animation de l'encart du bien (`rb-detail`) : 0fr → 1fr et l'opacité, 0,28 s ; jetons du thème. */
export const CSS_LIGNES_MANDAT = `
.lmd{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease,opacity .28s ease}
.lmd--ouverte{grid-template-rows:1fr;opacity:1}
.lmd-dedans{overflow:hidden;min-height:0}
.lmd--ouverte .lmd-dedans{padding-top:14px}
.lmd-champs{border:1px solid var(--color-svv-line);border-radius:14px;margin:0;padding:12px 14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;min-width:0}
.lmd-champs legend{font-weight:800;padding:0 4px;color:var(--color-svv-ink)}
.lmd-note{margin:6px 0 0}
@media (max-width:640px){ .lmd-champs{grid-template-columns:minmax(0,1fr)} }
@media (prefers-reduced-motion: reduce){ .lmd{transition:none} }
`;
