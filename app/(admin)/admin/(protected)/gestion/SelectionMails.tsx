'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * ══ 🔴🔴 Arno (28/11/2026, 12h17, point 2) — ÉCRIRE À PLUSIEURS ADRESSES D'UN SYNDIC À LA FOIS ═════════════════════════════════════════════════════════
 * « Un bouton "Écrire depuis gestion@" en face de chaque adresse mail ; pouvoir sélectionner plusieurs adresses mail pour écrire simultanément à toutes les
 * adresses sélectionnées. » Une case à cocher sur chaque ligne d'e-mail ; dès qu'une est cochée, « Écrire aux adresses sélectionnées (N) » ouvre UN seul
 * mail, toutes les adresses cochées en destinataires (contacts du même cabinet : ce ne sont pas des clients). Le geste est celui d'« Écrire depuis
 * gestion@ » (même module, même droit d'envoi — 7b5715a6 —, même journal) : sans droit d'envoi, ni case ni bouton. La même sélection pour la fiche
 * syndic de la Gestion et celle de la Location.
 */
export interface SelectionMails { coches: readonly string[]; basculer: (email: string) => void; vider: () => void }

const Contexte = createContext<SelectionMails | null>(null);

/** L'état d'une sélection : les adresses cochées, dans l'ordre où on les a cochées, sans doublon (majuscules ignorées). */
export function useEtatSelectionMails(): SelectionMails {
  const [coches, setCoches] = useState<string[]>([]);
  const basculer = useCallback((email: string) => {
    const e = email.trim();
    if (e === '') return;
    setCoches((l) => (l.some((x) => x.toLowerCase() === e.toLowerCase()) ? l.filter((x) => x.toLowerCase() !== e.toLowerCase()) : [...l, e]));
  }, []);
  const vider = useCallback(() => setCoches([]), []);
  return useMemo(() => ({ coches, basculer, vider }), [coches, basculer, vider]);
}

export function FournisseurSelectionMails({ selection, children }: { selection: SelectionMails; children: ReactNode }) {
  return <Contexte.Provider value={selection}>{children}</Contexte.Provider>;
}
export const useSelectionMails = (): SelectionMails | null => useContext(Contexte);

/** La case d'une ligne d'e-mail (rien hors d'une sélection). */
export function CaseMail({ email }: { email: string }) {
  const s = useSelectionMails();
  if (s === null) return null;
  const e = email.trim();
  const coche = s.coches.some((x) => x.toLowerCase() === e.toLowerCase());
  return (
    <label className="slm-case" title="Sélectionner cette adresse pour écrire à plusieurs">
      <input type="checkbox" checked={coche} onChange={() => s.basculer(e)} aria-label={`Sélectionner ${e}`} data-case-mail={e} />
    </label>
  );
}

/** « Écrire aux adresses sélectionnées (N) » : visible dès qu'une adresse est cochée ; ouvre UN mail à toutes. */
export function BoutonEcrireSelection({ onEcrire }: { onEcrire: (emails: string[]) => void }) {
  const s = useSelectionMails();
  if (s === null || s.coches.length === 0) return null;
  return (
    <p className="slm-barre" role="group" aria-label="Écrire aux adresses sélectionnées">
      <button type="button" className="svv-btn svv-btn-primary gst-btn slm-ecrire" data-ecrire-selection={s.coches.length}
        onClick={() => { onEcrire([...s.coches]); s.vider(); }}>Écrire aux adresses sélectionnées ({s.coches.length})</button>
      <button type="button" className="svv-btn svv-btn-outline gst-btn slm-vider" onClick={s.vider}>Tout décocher</button>
    </p>
  );
}

/* Jetons --color-svv-* uniquement. AUCUN ACCENT GRAVE dans ce littéral. */
export const CSS_SELECTION_MAILS = `
.slm-case{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;flex:0 0 auto;cursor:pointer}
.slm-case input{width:18px;height:18px;margin:0;accent-color:var(--color-svv-red);cursor:pointer}
.slm-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:.4rem 0;padding:8px 10px;border:1px solid var(--color-svv-line-strong);
  border-radius:10px;background:var(--color-svv-field)}
.slm-ecrire,.slm-vider{min-height:44px;width:auto}
`;
