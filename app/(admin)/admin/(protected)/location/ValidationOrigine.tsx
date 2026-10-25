'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { CSS_MODALE_ISSUE } from './ModaleIssue';

/**
 * ══ 🔴 Arno (25/10/2026) — LA DOUBLE VALIDATION D'UNE ORIGINE DU CONTACT (location ou propriétaire, le même composant partout) ═════════
 * Étape 1 — « Conséquences de la modification » : la liste AVANT / APRÈS de tout ce qui change en cascade, calculée par le SERVEUR sans rien
 * écrire (`charger`). Étape 2 — la case « J'ai bien compris les conséquences ci-dessus », obligatoire, puis « Confirmer la modification »
 * (inactif tant qu'elle n'est pas cochée). PREMIÈRE SAISIE (rien n'est défait) : l'étape 1 seule, sans la case. « Revenir » ramène aux
 * champs sans rien perdre. Un refus ou un conflit s'affiche ici, rien n'est écrit.
 */
export interface LigneConsequenceVue { groupe: string; libelle: string; avant: string; apres: string; sensible?: boolean }

export function ValidationOrigine({ premiere, charger, onRevenir, onConfirmer }: {
  premiere: boolean;
  charger: () => Promise<{ lignes: LigneConsequenceVue[] } | { motif: string }>;
  onRevenir: () => void;
  /** Rend `null` (enregistré) ou le motif du refus / du conflit. */
  onConfirmer: () => Promise<string | null>;
}) {
  const titre = useId();
  const [lu, setLu] = useState<{ lignes: LigneConsequenceVue[] } | { motif: string } | null>(null);
  const [compris, setCompris] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void charger().then((r) => { if (vivant) setLu(r); });
    return () => { vivant = false; };
  }, [charger]);
  const groupes = lu !== null && 'lignes' in lu ? [...new Set(lu.lignes.map((l) => l.groupe))] : [];
  const pret = lu !== null && 'lignes' in lu && (premiere || compris) && !envoi;
  const contenu = (
    <div className="mis-voile" onMouseDown={(e) => { if (e.target === e.currentTarget && !envoi) onRevenir(); }}>
      <style>{CSS_MODALE_ISSUE + CSS_VALIDATION_ORIGINE}</style>
      <div className="mis-boite vor-boite" role="dialog" aria-modal="true" aria-labelledby={titre} data-validation-origine={premiere ? 'premiere' : 'modification'}>
        <h2 id={titre} className="mis-titre">Conséquences de la modification</h2>
        {lu === null ? <p className="gst-info" role="status">Calcul des conséquences…</p>
          : 'motif' in lu ? <p className="gst-erreur" role="alert" data-consequences-refus>{lu.motif}</p> : (
            <div className="vor-liste" data-consequences>
              {groupes.map((g) => (
                <section key={g} className="vor-groupe" data-groupe-consequence={g}>
                  <h3 className="vor-groupe-titre">{g}</h3>
                  <table className="vor-table"><tbody>
                    {lu.lignes.filter((l) => l.groupe === g).map((l) => (
                      <tr key={`${g}-${l.libelle}`} data-consequence={l.libelle} data-sensible={l.sensible ? '' : undefined}>
                        <th scope="row">{l.libelle}</th><td className="vor-avant">{l.avant}</td><td className="vor-fleche" aria-hidden="true">→</td><td className="vor-apres">{l.apres}</td>
                      </tr>))}
                  </tbody></table>
                </section>))}
              {lu.lignes.length <= 1 && <p className="loc-muet" style={{ margin: 0 }}>Aucun autre chiffre ne change.</p>}
            </div>)}
        {!premiere && lu !== null && 'lignes' in lu && (
          <label className="vor-case" data-case-compris>
            <input type="checkbox" checked={compris} onChange={(e) => setCompris(e.target.checked)} data-compris />
            <span>J’ai bien compris les conséquences ci-dessus</span></label>
        )}
        {refus !== null && <p className="gst-erreur" role="alert" data-refus-origine>{refus}</p>}
        <div className="mis-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onRevenir} disabled={envoi} data-revenir-origine>Revenir</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" disabled={!pret} data-confirmer-origine
            onClick={() => { void (async () => { setEnvoi(true); setRefus(null); const m = await onConfirmer(); setEnvoi(false); if (m !== null) setRefus(m); })(); }}>
            {envoi ? 'Enregistrement…' : premiere ? 'Confirmer' : 'Confirmer la modification'}</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? contenu : createPortal(contenu, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px. */
const CSS_VALIDATION_ORIGINE = `
.vor-boite{width:min(720px,100%);max-height:calc(100vh - 32px);overflow-y:auto}
.vor-liste{display:flex;flex-direction:column;gap:10px}
.vor-groupe-titre{margin:0 0 4px;font-size:.82rem;font-weight:800;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.02em}
.vor-table{width:100%;border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
.vor-table th,.vor-table td{padding:6px 4px;border-bottom:1px solid var(--color-svv-line);text-align:left;vertical-align:top;overflow-wrap:anywhere}
.vor-table th{font-weight:600;color:var(--color-svv-ink);width:38%}
.vor-avant{color:var(--color-svv-muted);text-decoration:line-through;text-decoration-color:color-mix(in srgb, var(--color-svv-muted) 60%, transparent)}
.vor-fleche{width:1.5em;color:var(--color-svv-muted);text-align:center}
.vor-apres{font-weight:700;color:var(--color-svv-ink)}
.vor-case{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;font-weight:700}
.vor-case input{width:20px;height:20px}
@media (max-width:640px){ .vor-table th{width:auto} .vor-table tr{display:grid;grid-template-columns:1fr} .vor-fleche{display:none} }
`;
