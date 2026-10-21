'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ExplicationEchec } from '../../../../lib/location/issueEnregistrement';

/**
 * ══ 🔴🔴 LA MODALE D'ISSUE D'UN ENREGISTREMENT (Arno, 21/10/2026) — « Nouveau bien » et « Nouveau locataire » ════════════════
 *
 * « PLUS AUCUN ÉCHEC SILENCIEUX » :
 *   · SUCCÈS — « ✓ Bien enregistré » (ou « ✓ Locataire enregistré et rattaché à … »), un résumé court, et les gestes qui
 *     suivent (voir la fiche, envoi ADHOC & MONGA, en créer un autre, fermer) ;
 *   · ÉCHEC — une modale ROUGE : ce qui a échoué, pourquoi, quoi faire ; la saisie reste à l'écran (rien n'est perdu).
 * Rendue dans `.svv-adm-root` (jamais rognée, aux couleurs du thème), au-dessus de la barre collante ; Échap ou « Fermer » la ferment ; le focus va sur le
 * PREMIER bouton (jamais un geste qui écrit). Jetons du thème seulement (Clair / Sombre) ; plein écran au téléphone.
 */
export interface ActionIssue {
  libelle: string;
  /** Un lien (fiche, nouvel écran) ; sinon un bouton. */
  href?: string;
  onClick?: () => void;
  principal?: boolean;
  /** L'attribut de repère (`data-…`) pour les épreuves. */
  repere?: string;
}

export function ModaleIssue({ sorte, titre, lignes = [], echec, notes = [], actions, onFermer, children }: {
  sorte: 'succes' | 'erreur' | 'attention';
  titre: string;
  /** Le résumé (succès) : [libellé, valeur]. */
  lignes?: [string, ReactNode][];
  /** L'explication d'un échec (quoi / pourquoi / quoi faire / saisie conservée). */
  echec?: ExplicationEchec;
  /** Des remarques (ex. le mail de mandat non parti, une réintégration) : dites, jamais bloquantes. */
  notes?: string[];
  actions: ActionIssue[];
  onFermer: () => void;
  /** Un contenu propre à la modale (ex. la liste des biens de « Rattacher à un bien »), avant les boutons. */
  children?: ReactNode;
}) {
  const idTitre = useId();
  const boite = useRef<HTMLDivElement | null>(null);
  const fermer = useRef(onFermer);
  useEffect(() => { fermer.current = onFermer; }, [onFermer]);
  // Une seule fois à l'ouverture : Échap ferme, le focus va sur le premier bouton.
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer.current(); };
    window.addEventListener('keydown', clavier);
    boite.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => window.removeEventListener('keydown', clavier);
  }, []);
  const contenu = (
    <div className="mis-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_MODALE_ISSUE}</style>
      <div ref={boite} className={`mis-boite mis-boite--${sorte}`} role={sorte === 'succes' ? 'dialog' : 'alertdialog'} aria-modal="true"
        aria-labelledby={idTitre} data-modale-issue={sorte}>
        <h2 id={idTitre} className="mis-titre">{sorte === 'succes' ? '✓ ' : sorte === 'erreur' ? '✕ ' : '⚠ '}{titre}</h2>
        {echec !== undefined && (
          <dl className="mis-echec" data-echec>
            <div><dt>Ce qui a échoué</dt><dd data-echec-quoi>{echec.quoi}</dd></div>
            <div><dt>Pourquoi</dt><dd data-echec-pourquoi>{echec.pourquoi}</dd></div>
            <div><dt>Que faire</dt><dd data-echec-faire>{echec.faire}</dd></div>
          </dl>
        )}
        {echec !== undefined && <p className="mis-conserve" data-echec-conserve>{echec.conserve}</p>}
        {lignes.length > 0 && (
          <dl className="mis-resume" data-resume>
            {lignes.map(([mot, valeur]) => <div key={mot}><dt>{mot}</dt><dd>{valeur}</dd></div>)}
          </dl>
        )}
        {notes.map((n, i) => <p key={`${i}-${n}`} className="mis-note" data-note>{n}</p>)}
        {children}
        <div className="mis-actions">
          {actions.map((a) => (a.href !== undefined
            ? <a key={a.libelle} href={a.href} className={`svv-btn ${a.principal ? 'svv-btn-primary' : 'svv-btn-outline'} gst-btn mis-action`} {...(a.repere ? { [`data-${a.repere}`]: '' } : {})}>{a.libelle}</a>
            : <button key={a.libelle} type="button" onClick={a.onClick} className={`svv-btn ${a.principal ? 'svv-btn-primary' : 'svv-btn-outline'} gst-btn mis-action`}
                {...(a.repere ? { [`data-${a.repere}`]: '' } : {})}>{a.libelle}</button>))}
        </div>
      </div>
    </div>
  );
  // Dans `.svv-adm-root` (enfant direct du corps, sans transform : vérifié, cf. InfoBien) — c'est LUI qui porte les jetons du
  // thème : rendue dans <body>, la modale resterait claire en thème Sombre.
  return typeof document === 'undefined' ? contenu : createPortal(contenu, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement ; cibles de 44 px ; plein ecran au telephone. */
export const CSS_MODALE_ISSUE = `
.mis-voile{position:fixed;inset:0;z-index:90;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.mis-boite{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:20px;width:min(560px,100%);max-height:calc(100vh - 48px);overflow-y:auto;padding:22px 24px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;border:2px solid var(--color-svv-line);box-shadow:0 30px 60px -20px color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.mis-boite--succes{border-color:var(--color-svv-green-ink)}
.mis-boite--erreur{border-color:var(--color-svv-red);border-width:3px}
.mis-boite--attention{border-color:var(--color-svv-amber)}
.mis-titre{margin:0;font-size:1.3rem;font-weight:800;line-height:1.3;overflow-wrap:anywhere}
.mis-boite--succes .mis-titre{color:var(--color-svv-green-ink)}
.mis-boite--erreur .mis-titre{color:var(--color-svv-red)}
.mis-boite--attention .mis-titre{color:var(--color-svv-amber)}
.mis-echec,.mis-resume{margin:0;display:flex;flex-direction:column;gap:10px}
.mis-echec dt,.mis-resume dt{font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.mis-echec dd,.mis-resume dd{margin:2px 0 0;font-size:1rem;line-height:1.45;overflow-wrap:anywhere}
.mis-echec{border-left:4px solid var(--color-svv-red);padding-left:12px}
.mis-conserve{margin:0;font-weight:700;color:var(--color-svv-ink)}
.mis-note{margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-amber);color:var(--color-svv-ink);background:var(--color-svv-amber-soft);overflow-wrap:anywhere}
.mis-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;padding-top:4px}
.mis-actions .mis-action{box-sizing:border-box;min-height:48px;width:auto;margin:0;padding:10px 18px;line-height:1.25;font-size:.98rem;display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none}
@media (max-width:640px){
  .mis-voile{padding:0;align-items:flex-end}
  .mis-boite{width:100%;max-height:100vh;border-radius:20px 20px 0 0;padding:20px 16px calc(16px + env(safe-area-inset-bottom))}
  .mis-actions{flex-direction:column-reverse;align-items:stretch}
  .mis-actions .mis-action{width:100%}
}
`;
