'use client';

import { useCallback, useEffect, useState } from 'react';
// Purs (aucun import serveur) → utilisables côté client pour pré-remplir « Re: » et pré-contrôler le texte.
import { objetReponse, problemeTexteComplement } from '../../../../lib/permis/complementPieces';

/**
 * FIL-A/FIL-B — HISTORIQUE des échanges e-mail d'un permis (lecture) + RÉPONSE à un message choisi. Replié par défaut, du plus récent
 * au plus ancien. Filtre tout/reçus/envoyés (masque, ne réordonne pas). « Répondre » uniquement sur un message REÇU répondable ;
 * le mail part dans le fil DE CE message, verbatim. 🔒 Demande multi-dossiers → aucun fil, aucun bouton (garde stricte).
 */
interface FilEntree { le: string; sens: 'recu' | 'envoye' | 'declare'; interlocuteur: string | null; objet: string | null; corps: string | null; corpsConnu: boolean; reponseId?: number | null; repliable?: boolean; horsOutil?: boolean }
type Fil = { statut: 'multi' } | { statut: 'vide' } | { statut: 'ok'; entrees: FilEntree[] };
type Filtre = 'tout' | 'recus' | 'envoyes';

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleChamp: React.CSSProperties = { width: '100%', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, boxSizing: 'border-box' };
const SENS: Record<FilEntree['sens'], string> = { recu: 'reçu de la mairie', envoye: 'envoyé par nous', declare: 'déclaré par Arno' };
const dateHeure = (le: string): string => (le.length > 10 ? `${le.slice(0, 10)} ${le.slice(11, 16)}` : le.slice(0, 10));
const gardeFiltre = (e: FilEntree, f: Filtre): boolean => f === 'tout' || (f === 'recus' ? e.sens === 'recu' : e.sens !== 'recu'); // envoyés = envois + déclarations

export function BlocFilEchanges({ dossierId }: { dossierId: number }) {
  const [fil, setFil] = useState<Fil | null>(null);
  const [erreur, setErreur] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [repondA, setRepondA] = useState<number | null>(null); // reponseId du message auquel on répond
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const chargerFil = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/permis/fil?dossierId=${dossierId}`, { cache: 'no-store' });
      if (res.ok) { setFil((await res.json()) as Fil); setErreur(false); } else setErreur(true);
    } catch { setErreur(true); }
  }, [dossierId]);
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

  const ouvrirReponse = (e: FilEntree) => { setRepondA(e.reponseId ?? null); setObjet(objetReponse(e.objet)); setCorps(''); setMessage(null); };
  const abandonner = () => { setRepondA(null); setMessage(null); };

  const envoyer = useCallback(async () => {
    if (repondA === null) return;
    const pb = problemeTexteComplement(objet, corps); // pré-contrôle client (le serveur revalide)
    if (pb !== null) { setMessage(`Envoi refusé : ${pb}.`); return; }
    setEnvoi(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/repondre', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reponseId: repondA, objet, corps }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; destinataire?: string; erreur?: string };
      if (res.ok && d.ok) { setMessage(`Réponse envoyée à ${d.destinataire}.`); setRepondA(null); await chargerFil(); }
      else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'réponse impossible'));
    } catch { setMessage('réponse impossible'); } finally { setEnvoi(false); }
  }, [repondA, objet, corps, chargerFil]);

  const peutEnvoyer = objet.trim() !== '' && corps.trim() !== '' && !envoi;

  return (
    <div className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
      {/* PERF-1 : le titre « Historique des échanges » est porté par l'en-tête dépliable (BlocRepliable) — pas de doublon ici. */}
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Historique indisponible.</span>}
      {fil === null && !erreur && <span style={muted} aria-live="polite">Chargement…</span>}
      {fil?.statut === 'multi' && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>Les échanges de cette demande couvrent <strong>plusieurs permis</strong> : ils ne peuvent pas être attribués de façon sûre à celui-ci. Aucun historique n’est affiché ici.</p>
      )}
      {fil?.statut === 'vide' && <span style={muted}>Aucun échange enregistré pour ce permis.</span>}
      {fil?.statut === 'ok' && (() => {
        const affichees = fil.entrees.filter((e) => gardeFiltre(e, filtre));
        return (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>
              {fil.entrees.length} échange{fil.entrees.length > 1 ? 's' : ''} — dernier le {dateHeure(fil.entrees[0].le)}
            </summary>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', margin: '.4rem 0 .2rem' }}>
              {([['tout', 'Tout'], ['recus', 'Reçus de la mairie'], ['envoyes', 'Envoyés par nous']] as [Filtre, string][]).map(([v, lib]) => (
                <button key={v} type="button" className={`svv-btn ${filtre === v ? 'svv-btn-primary' : 'svv-btn-outline'}`} style={{ width: 'auto', padding: '.15rem .5rem', fontSize: 12 }} aria-pressed={filtre === v} onClick={() => setFiltre(v)}>{lib}</button>
              ))}
              <span style={{ ...muted, alignSelf: 'center' }}>{affichees.length} affiché{affichees.length > 1 ? 's' : ''} sur {fil.entrees.length}</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {affichees.map((x, i) => (
                <li key={x.reponseId ?? `x-${i}`} style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem' }}>
                  <div style={{ fontSize: 12 }}><strong>{dateHeure(x.le)}</strong> · {SENS[x.sens]}{x.horsOutil ? ' (depuis la boîte, hors outil)' : ''}{x.interlocuteur ? ` · ${x.interlocuteur}` : ''}</div>
                  {x.objet && <div style={{ fontSize: 13, fontWeight: 600 }}>{x.objet}</div>}
                  {x.corpsConnu
                    ? (x.corps && x.corps.trim() !== ''
                      ? <details style={{ marginTop: '.15rem' }}><summary style={{ cursor: 'pointer', ...muted }}>voir le message</summary>
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'inherit', margin: '.2rem 0 0' }}>{x.corps}</pre></details>
                      : <span style={muted}>(sans corps)</span>)
                    : <span style={muted}>contenu non connu du système</span>}
                  {/* FIL-B — répondre UNIQUEMENT sur un message reçu répondable (jamais un envoi, une déclaration, ou un no-reply). */}
                  {x.sens === 'recu' && x.reponseId != null && x.repliable && repondA !== x.reponseId && (
                    <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} onClick={() => ouvrirReponse(x)}>Répondre à ce message</button>
                  )}
                  {x.sens === 'recu' && x.reponseId != null && !x.repliable && <span style={{ ...muted, display: 'block' }}>expéditeur non répondable</span>}
                  {repondA != null && repondA === x.reponseId && (
                    <div className="flex flex-col gap-2" style={{ marginTop: '.3rem', padding: '.4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
                      <span style={muted}>Répondre dans le fil de ce message. Le texte envoyé sera EXACTEMENT ce qui est affiché.</span>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}><span style={muted}>Objet</span>
                        <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} style={styleChamp} aria-label="Objet de la réponse" /></label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}><span style={muted}>Message</span>
                        <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={10} style={{ ...styleChamp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} aria-label="Corps de la réponse" /></label>
                      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className={`svv-btn ${peutEnvoyer ? 'svv-btn-primary' : 'svv-btn-outline'}`} style={{ width: 'auto', padding: '.3rem .7rem' }} disabled={!peutEnvoyer} onClick={() => void envoyer()}>{envoi ? 'Envoi…' : 'Envoyer la réponse'}</button>
                        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.3rem .7rem' }} onClick={abandonner}>Abandonner</button>
                      </div>
                      {(objet.trim() === '' || corps.trim() === '') && <span style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>L’objet et le message ne peuvent pas être vides.</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-ink)', marginTop: '.3rem' }}>{message}</div>}
          </details>
        );
      })()}
    </div>
  );
}
