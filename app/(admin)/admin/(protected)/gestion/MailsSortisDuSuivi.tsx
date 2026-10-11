'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴🔴 LOT INVARIANT-HISTORIQUE-INALTERABLE — « MAILS SORTIS DU SUIVI (N) ▸ », EN BAS DE L'HISTORIQUE D'UN BIEN ═════
 *
 * ARNO : « En bas de l'historique du bien : une ligne repliée “Mails sortis du suivi (N) ▸”, avec un bouton
 * “Restaurer” par mail. Tout est historisé (date, auteur). »
 *
 * 🔴 RIEN N'EST PERDU QUAND ON SORT UN MAIL DU SUIVI : il est ici, avec qui l'a sorti et quand, et « Restaurer » le
 * rend à l'historique tel qu'il était (la marque est levée, le lien n'avait jamais été défait).
 *
 * ⚠️ AUCUN MAIL SORTI ⇒ RIEN N'EST AFFICHÉ : une ligne « (0) » permanente sur chaque bien serait du bruit.
 */

export interface MailSortiAffiche {
  messageId: number; objet: string | null; de: string | null; deNom: string | null; recuLe: string;
  sortiLe: string; sortiPar: string | null; motif: string | null;
}

const jour = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
};

export function MailsSortisDuSuivi({ lotCle, version = 0, onRestaure }: {
  /** La clé WIPPIMMO du bien (« 219 »). */
  lotCle: string;
  /** Incrémenté par l'écran à chaque sortie : la liste se relit. */
  version?: number;
  /** Prévenu après une restauration : l'historique se relit, le mail y revient. */
  onRestaure?: () => void;
}) {
  const [mails, setMails] = useState<MailSortiAffiche[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [relire, setRelire] = useState(0);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/historique/sortis?cible=${encodeURIComponent(`lot-${lotCle}`)}`, { cache: 'no-store' });
        const d = (await res.json().catch(() => ({}))) as { etat?: string; mails?: MailSortiAffiche[] };
        if (vivant) setMails(d.etat === 'ok' ? (d.mails ?? []) : []);
      } catch { if (vivant) setMails([]); }
    })();
    return () => { vivant = false; };
  }, [lotCle, version, relire]);

  if (mails === null || mails.length === 0) return null;

  const restaurer = async (messageId: number): Promise<void> => {
    if (enCours !== null) return;
    setEnCours(messageId);
    setRefus(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/sortis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restaurer', messageId, cible: `lot-${lotCle}` }),
      });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || r.ok !== true) { setRefus(r.erreur ?? 'Ce mail n’a pas pu être restauré.'); return; }
      setRelire((n) => n + 1);
      onRestaure?.();
    } catch {
      setRefus('Ce mail n’a pas pu être restauré : le serveur n’a pas répondu.');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <section className="mss" aria-label="Mails sortis du suivi">
      <style>{CSS_MAILS_SORTIS}</style>
      <button type="button" className="mss-titre" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
        Mails sortis du suivi ({mails.length}) <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
      </button>
      {ouvert && (
        <ul className="mss-liste">
          {mails.map((m) => (
            <li key={m.messageId} className="mss-mail">
              <span className="mss-texte">
                <span className="mss-objet">{(m.objet ?? '').trim() || '(sans objet)'}</span>
                <span className="mss-de">{m.deNom ? `${m.deNom} <${m.de ?? ''}>` : (m.de ?? '')} · reçu le {jour(m.recuLe)}</span>
                <span className="mss-sorti">
                  Sorti du suivi le {jour(m.sortiLe)}{m.sortiPar ? ` par ${m.sortiPar}` : ''}{m.motif ? ` — ${m.motif}` : ''}
                </span>
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn mss-restaurer" disabled={enCours !== null}
                onClick={() => { void restaurer(m.messageId); }}>
                {enCours === m.messageId ? 'Restauration…' : 'Restaurer'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {refus !== null && <p className="gst-erreur" role="status">{refus}</p>}
    </section>
  );
}

/* AUCUN ACCENT GRAVE dans cette feuille : elle vit dans une chaine de gabarit. */
export const CSS_MAILS_SORTIS = `
.mss{margin:1rem 0 .4rem;border-top:1px solid var(--color-svv-line);padding-top:.6rem}
.mss-titre{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .2rem;font:inherit;font-size:.85rem;
  font-weight:600;color:var(--color-svv-muted);background:transparent;border:0;cursor:pointer}
.mss-titre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:.3rem}
.mss-liste{list-style:none;margin:.2rem 0 0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.mss-mail{display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.5rem .7rem;
  border:1px dashed var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface)}
.mss-texte{display:flex;flex-direction:column;min-width:0;gap:.1rem}
.mss-objet{color:var(--color-svv-ink);font-weight:600;overflow-wrap:anywhere}
.mss-de,.mss-sorti{color:var(--color-svv-muted);font-size:.8rem;overflow-wrap:anywhere}
.mss-restaurer{flex:0 0 auto;min-height:44px}
@media (max-width:640px){.mss-mail{flex-direction:column;align-items:stretch}}
`;
