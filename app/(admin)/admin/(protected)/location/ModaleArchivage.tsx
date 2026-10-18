'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  dateEntree, LIBELLE_BOUTON, LIBELLE_CONFIRMER_OCCUPE, libelleBien, phraseArchivage, type ApercuArchivage,
} from '../../../../lib/location/archivage';

/**
 * ══ 🔴🔴 L'AVERTISSEMENT « AU MOINS UN BIEN EST OCCUPÉ » (Arno, 18/10/2026) ═══════════════════════════════════════════
 *
 * « Modale qui liste chaque bien occupé (adresse, lot, locataire, date d'entrée), et en bas un gros bouton rouge
 * “Confirmer l'archivage du propriétaire et de ses biens” (+ “Annuler”). Un bien partagé avec un autre propriétaire actif
 * n'est PAS archivé (le dire dans la modale). » — et le MÊME avertissement partout où l'ancienne règle « sortie refusée
 * si locataire en place » s'appliquait : l'écran « Archiver un propriétaire » ET la sortie depuis la fiche commune
 * (propriétaire, bien, locataire). Le contenu vient de l'APERÇU du serveur, le même calcul que l'écriture.
 * La feuille de style est DANS le portail : la modale est posée sur la racine du thème (`.svv-adm-root`), hors du cadre
 * de l'écran.
 */
const TITRE: Record<ApercuArchivage['sujet'], string> = {
  proprietaire: LIBELLE_BOUTON.alerte,
  bien: 'Attention, ce bien (ou une de ses annexes) est actuellement occupé par un locataire',
  locataire: 'Attention, ce locataire a une location en cours',
};
const CONFIRMER: Record<ApercuArchivage['sujet'], string> = {
  proprietaire: LIBELLE_CONFIRMER_OCCUPE,
  bien: 'Confirmer la sortie du bien et de ses annexes',
  locataire: 'Confirmer la sortie du locataire',
};

export function ModaleArchivage({ apercu, envoi, motif, onConfirmer, onAnnuler }: {
  apercu: ApercuArchivage; envoi: boolean; motif: string | null; onConfirmer: () => void; onAnnuler: () => void;
}) {
  const annuler = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    annuler.current?.focus();
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onAnnuler(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onAnnuler]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="arc-voile" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnnuler(); }}>
      <style>{CSS_MODALE_ARCHIVAGE}</style>
      <div className="arc-modale" role="dialog" aria-modal="true" aria-labelledby="arc-titre" data-modale-archivage>
        <h2 id="arc-titre" className="arc-titre">{TITRE[apercu.sujet]}</h2>
        <div className="arc-corps">
          <p className="arc-intro">
            {apercu.occupees.length === 1 ? 'Cette location est en cours ; elle sera close à la date du jour :'
              : `Ces ${apercu.occupees.length} locations sont en cours ; elles seront closes à la date du jour :`}
          </p>
          <ul className="arc-occupes" data-biens-occupes>
            {apercu.occupees.map((o) => (
              <li key={o.occupationId} data-occupation={o.occupationId}>
                <strong className="arc-bien">{libelleBien(o)}</strong>
                <span className="arc-loc">{o.locataire}</span>
                <span className="arc-date">{dateEntree(o.entree)}</span>
              </li>
            ))}
          </ul>
          {apercu.partages.length > 0 && (
            <div className="arc-note" data-biens-partages>
              <p><strong>{apercu.partages.length === 1 ? 'Ce bien n’est PAS archivé' : 'Ces biens ne sont PAS archivés'}</strong> : un autre propriétaire actif le{apercu.partages.length === 1 ? '' : 's'} détient aussi.</p>
              <ul>
                {apercu.partages.map((p) => (
                  <li key={p.lotId}>{libelleBien(p)} — avec {p.autres.join(', ')}{p.occupe ? ' (sa location reste ouverte)' : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {apercu.locatairesGardes.length > 0 && (
            <div className="arc-note" data-locataires-gardes>
              <p><strong>{apercu.locatairesGardes.length === 1 ? 'Ce locataire n’est pas archivé' : 'Ces locataires ne sont pas archivés'}</strong> : il{apercu.locatairesGardes.length === 1 ? ' loue' : 's louent'} un autre bien du portefeuille.</p>
              <ul>{apercu.locatairesGardes.map((l) => <li key={l.id}>{l.nom}{l.ailleurs === null ? '' : ` — ${l.ailleurs}`}</li>)}</ul>
            </div>
          )}
          <p className="arc-phrase">{phraseArchivage(apercu.sujet)}</p>
          {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
        </div>
        <div className="arc-pied">
          <button type="button" className="arc-confirmer" disabled={envoi} onClick={onConfirmer} data-confirmer-archivage>{CONFIRMER[apercu.sujet]}</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn arc-annuler" ref={annuler} onClick={onAnnuler}>Annuler</button>
        </div>
      </div>
    </div>,
    // Dans la racine du THÈME (comme les autres portails de l'admin) : posée sur `body`, la modale resterait claire en Sombre.
    document.querySelector('.svv-adm-root') ?? document.body,
  );
}

/** Couleurs du thème uniquement : rouge de l'agence pour confirmer, ambre (avertissement) pour les notes. */
export const CSS_MODALE_ARCHIVAGE = `
.arc-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow-y:auto}
.arc-modale{position:relative;box-sizing:border-box;width:min(720px, 100%);background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:16px;padding:20px;box-shadow:0 12px 40px color-mix(in srgb, var(--color-svv-ink) 28%, transparent);display:flex;flex-direction:column;gap:12px;max-height:min(92vh, calc(100dvh - 32px));overflow:hidden}
.arc-titre{margin:0;font-size:1.15rem;font-weight:800;line-height:1.3;color:var(--color-svv-urgence-orange-texte);flex:0 0 auto}
.arc-corps{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px}
.arc-intro,.arc-phrase{margin:0}
.arc-phrase{color:var(--color-svv-muted);font-size:.92rem}
.arc-occupes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.arc-occupes li{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.2fr) auto;gap:4px 12px;align-items:baseline;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-left:4px solid var(--color-svv-urgence-orange);border-radius:10px;background:var(--color-svv-field)}
.arc-bien{min-width:0;overflow-wrap:anywhere}
.arc-loc{min-width:0;overflow-wrap:anywhere}
.arc-date{color:var(--color-svv-muted);font-size:.9rem;white-space:nowrap}
.arc-note{border-radius:10px;padding:10px 12px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.arc-note p{margin:0 0 4px}
.arc-note ul{margin:0;padding-left:1.2rem}
.arc-pied{flex:0 0 auto;display:flex;flex-direction:column;gap:8px}
.arc-confirmer{box-sizing:border-box;width:100%;min-height:56px;padding:14px 18px;border-radius:14px;border:2px solid var(--color-svv-red);background:var(--color-svv-red);color:var(--color-svv-surface);font:inherit;font-size:1.08rem;font-weight:800;cursor:pointer}
.arc-confirmer:disabled{opacity:.6;cursor:wait}
.arc-annuler{align-self:center;min-height:44px}
@media (max-width:640px){
  .arc-voile{padding:8px;align-items:flex-end}
  .arc-modale{padding:14px;border-radius:14px}
  .arc-occupes li{grid-template-columns:1fr}
  .arc-date{white-space:normal}
}
`;
