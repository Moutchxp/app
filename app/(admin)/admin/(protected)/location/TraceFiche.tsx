'use client';

import { useCallback, useEffect, useState } from 'react';
import { dateHeureParis, mentionDerniereModification, type EcranTrace } from '../../../../lib/gestion/traceFiche';

/**
 * ══ 🔴 Arno (24/10/2026, 417) — LA TRACE D'UNE FICHE OUVERTE DEPUIS « SUIVI DU MOIS » ═══════════════════════════════════════════
 * « Dernière modification : <nom>, le <date> à <heure> », et l'historique (déroulant) des modifications de CETTE fiche : qui, quand,
 * champ, ancienne valeur → nouvelle valeur, écran. Le REPÈRE du journal lu à l'ouverture accompagne l'enregistrement : une
 * modification faite entre-temps par quelqu'un d'autre fait refuser l'enregistrement (rien n'est écrasé).
 */
export interface LigneTrace { id: number; quand: string; par: string; champ: string | null; avant: string | null; apres: string | null; texte: string; ecran: string | null }
export interface EtatTrace { repere: number | null; historique: LigneTrace[]; derniere: LigneTrace | null; lu: boolean }

export const TRACE_SUIVI: { ecran: EcranTrace } = { ecran: 'Suivi du mois' };

/** `actif` faux : rien n'est lu (l'écran n'est pas tracé). */
export function useTraceFiche(sujet: 'lot' | 'locataire', id: number, actif = true): EtatTrace & { relire: () => void } {
  const [etat, setEtat] = useState<EtatTrace>({ repere: null, historique: [], derniere: null, lu: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    void fetch(`/api/admin/gestion/annuaire/location?traceFiche=${sujet}:${id}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; data?: { repere: number; historique: LigneTrace[]; derniere: LigneTrace | null } }>)
      .then((d) => {
        if (!vivant) return;
        const x = d.etat === 'ok' ? d.data : undefined;
        // Une réponse sans historique lisible : « aucune modification » (et pas de repère : le contrôle de conflit n'est pas posé).
        if (x !== undefined && Array.isArray(x.historique)) setEtat({ repere: typeof x.repere === 'number' ? x.repere : null, historique: x.historique, derniere: x.historique[0] ?? null, lu: true });
        else setEtat((e) => ({ ...e, lu: true }));
      })
      .catch(() => { if (vivant) setEtat((e) => ({ ...e, lu: true })); });
    return () => { vivant = false; };
  }, [sujet, id, n, actif]);
  const relire = useCallback(() => setN((x) => x + 1), []);
  return { ...etat, relire };
}

export function BlocTraceFiche({ trace }: { trace: EtatTrace }) {
  if (!trace.lu) return <p className="trf-mention loc-muet" role="status">Lecture de l’historique…</p>;
  return (
    <div className="trf" data-trace-fiche>
      <p className="trf-mention" data-derniere-modification>{mentionDerniereModification(trace.derniere)}</p>
      {trace.historique.length > 0 && (
        <details className="trf-historique" data-historique-fiche>
          <summary>Historique des modifications ({trace.historique.length})</summary>
          <ol className="trf-liste">
            {trace.historique.map((l) => {
              const { date, heure } = dateHeureParis(l.quand);
              return (
                <li key={l.id} data-ligne-historique={l.id}>
                  <span className="trf-quand">{date} à {heure}</span> · <strong>{l.par}</strong>{l.ecran ? <span className="trf-ecran"> · {l.ecran}</span> : null}
                  <span className="trf-quoi">{l.champ !== null ? `${l.champ} : ${l.avant ?? '(vide)'} → ${l.apres ?? '(vide)'}` : l.texte}</span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_TRACE_FICHE = `
.trf{display:flex;flex-direction:column;gap:6px;margin:0 0 12px;padding:10px 14px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.trf-mention{margin:0;font-size:.9rem;color:var(--color-svv-ink);font-weight:700}
.trf-historique summary{cursor:pointer;min-height:32px;display:flex;align-items:center;color:var(--color-svv-muted);font-weight:700;font-size:.88rem}
.trf-liste{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:.86rem;max-height:260px;overflow-y:auto}
.trf-quand{color:var(--color-svv-muted);font-variant-numeric:tabular-nums}
.trf-ecran{color:var(--color-svv-muted)}
.trf-quoi{display:block;overflow-wrap:anywhere;white-space:pre-line}
`;
