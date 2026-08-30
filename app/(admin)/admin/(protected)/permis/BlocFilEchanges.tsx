'use client';

import { useEffect, useState } from 'react';

/**
 * FIL-A — HISTORIQUE des échanges e-mail d'un permis, en LECTURE SEULE. REPLIÉ par défaut (une ligne : nombre + date du plus récent),
 * dépliable, du plus récent au plus ancien. Fusionne reçus + envois + compléments + déclarations (côté serveur). Information portée
 * par le TEXTE (sens écrit en toutes lettres), pas la couleur seule. Mobile-first.
 *
 * 🔒 Si la demande couvre plusieurs permis (statut 'multi'), AUCUN fil : une phrase honnête le dit (mieux vaut rien qu'un fil faux).
 */
interface FilEntree { le: string; sens: 'recu' | 'envoye' | 'declare'; interlocuteur: string | null; objet: string | null; corps: string | null; corpsConnu: boolean }
type Fil = { statut: 'multi' } | { statut: 'vide' } | { statut: 'ok'; entrees: FilEntree[] };

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const SENS: Record<FilEntree['sens'], string> = { recu: 'reçu de la mairie', envoye: 'envoyé par nous', declare: 'déclaré par Arno' };
const dateHeure = (le: string): string => (le.length > 10 ? `${le.slice(0, 10)} ${le.slice(11, 16)}` : le.slice(0, 10));

export function BlocFilEchanges({ dossierId }: { dossierId: number }) {
  const [fil, setFil] = useState<Fil | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/fil?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setFil((await res.json()) as Fil); else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [dossierId]);

  return (
    <div className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Historique des échanges</h4>
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Historique indisponible.</span>}
      {fil === null && !erreur && <span style={muted} aria-live="polite">Chargement…</span>}
      {fil?.statut === 'multi' && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>Les échanges de cette demande couvrent <strong>plusieurs permis</strong> : ils ne peuvent pas être attribués de façon sûre à celui-ci. Aucun historique n’est affiché ici.</p>
      )}
      {fil?.statut === 'vide' && <span style={muted}>Aucun échange enregistré pour ce permis.</span>}
      {fil?.statut === 'ok' && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>
            {fil.entrees.length} échange{fil.entrees.length > 1 ? 's' : ''} — dernier le {dateHeure(fil.entrees[0].le)}
          </summary>
          <ul style={{ margin: '.4rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {fil.entrees.map((x, i) => (
              <li key={i} style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem' }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{dateHeure(x.le)}</strong> · {SENS[x.sens]}{x.interlocuteur ? ` · ${x.interlocuteur}` : ''}
                </div>
                {x.objet && <div style={{ fontSize: 13, fontWeight: 600 }}>{x.objet}</div>}
                {x.corpsConnu
                  ? (x.corps && x.corps.trim() !== ''
                    ? <details style={{ marginTop: '.15rem' }}><summary style={{ cursor: 'pointer', ...muted }}>voir le message</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'inherit', margin: '.2rem 0 0' }}>{x.corps}</pre></details>
                    : <span style={muted}>(sans corps)</span>)
                  : <span style={muted}>contenu non connu du système</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
