'use client';

import { useCallback, useEffect, useState } from 'react';
// Générateur + validateur PURS (aucun import serveur) → utilisables dans le bundle client pour l'aperçu et le pré-contrôle.
import { composerComplementPieces, problemeTexteComplement } from '../../../../lib/permis/complementPieces';
import type { FamillePlan } from '../../../../lib/permis/planMasse';

/**
 * PART-3a/3c — DEMANDER À LA MAIRIE LES PIÈCES MANQUANTES, en DEUX TEMPS : (1) cocher les familles → « Préparer » AFFICHE l'objet et
 * le corps dans des champs ÉDITABLES ; (2) relire/modifier, puis ENVOYER (bouton distinct) — ou abandonner. Le texte affiché est
 * EXACTEMENT ce qui part (envoi verbatim côté serveur). Recocher une case RÉGÉNÈRE le texte, avec avertissement si des modifications
 * seraient perdues. No-reply / objet vide / corps vide / entité HTML → envoi refusé, motif affiché. Mobile-first, texte porteur.
 */
const LIBELLE: Record<FamillePlan, string> = { masse: 'Plan de masse', coupe: 'Plan de coupe', etage: 'Plans d’étages', cerfa: 'Formulaire Cerfa' };

interface Etat { numDau: string | null; destinataire: string | null; repliable: boolean; motif: string | null; historique: { le: string; objet: string; corps: string }[] }
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleChamp: React.CSSProperties = { width: '100%', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, boxSizing: 'border-box' };

export function BlocDemandePieces({ dossierId, famillesManquantes }: { dossierId: number; famillesManquantes: FamillePlan[] }) {
  const [coches, setCoches] = useState<Set<FamillePlan>>(() => new Set(famillesManquantes));
  const [etat, setEtat] = useState<Etat | null>(null);
  const [mode, setMode] = useState<'cases' | 'apercu'>('cases');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [genere, setGenere] = useState<{ objet: string; corps: string }>({ objet: '', corps: '' });
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/demander-pieces?dossierId=${dossierId}`, { cache: 'no-store' });
        if (!annule && res.ok) setEtat((await res.json()) as Etat);
      } catch { /* état indisponible : le bloc reste affiché, l'envoi dira le motif */ }
    })();
    return () => { annule = true; };
  }, [dossierId]);
  const chargerEtat = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/permis/demander-pieces?dossierId=${dossierId}`, { cache: 'no-store' });
      if (res.ok) setEtat((await res.json()) as Etat);
    } catch { /* refetch best-effort */ }
  }, [dossierId]);

  const numDau = etat?.numDau ?? '';
  const repliable = etat?.repliable ?? false;
  const texteModifie = objet !== genere.objet || corps !== genere.corps;

  // Génère l'objet + le corps depuis un ensemble de familles ; met à jour l'aperçu. Retourne false si aucune famille.
  const regenerer = useCallback((fams: Set<FamillePlan>): boolean => {
    const r = composerComplementPieces(numDau, [...fams]);
    if (r === null) return false;
    setObjet(r.objet); setCorps(r.corps); setGenere({ objet: r.objet, corps: r.corps }); setMessage(null);
    return true;
  }, [numDau]);

  const preparer = () => { if (regenerer(coches)) setMode('apercu'); };

  // Recocher : si le texte a été modifié à la main, PRÉVENIR avant de perdre les modifications. Ensemble vidé → retour aux cases.
  const basculerCase = (f: FamillePlan) => {
    const suivant = new Set(coches); if (suivant.has(f)) suivant.delete(f); else suivant.add(f);
    if (mode === 'apercu' && texteModifie && !window.confirm('Vos modifications du texte seront perdues et le message sera régénéré. Continuer ?')) return;
    setCoches(suivant);
    if (mode === 'apercu') { if (suivant.size === 0) setMode('cases'); else regenerer(suivant); }
  };

  const envoyer = useCallback(async () => {
    const probleme = problemeTexteComplement(objet, corps); // pré-contrôle client (le serveur revalide)
    if (probleme !== null) { setMessage(`Envoi refusé : ${probleme}.`); return; }
    setEnvoi(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/demander-pieces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId, familles: [...coches], objet, corps }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; destinataire?: string; erreur?: string };
      if (res.ok && d.ok) { setMessage(`Demande envoyée à ${d.destinataire}.`); setMode('cases'); await chargerEtat(); }
      else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'envoi impossible'));
    } catch { setMessage('envoi impossible'); } finally { setEnvoi(false); }
  }, [dossierId, coches, objet, corps, chargerEtat]);

  const peutEnvoyer = repliable && objet.trim() !== '' && corps.trim() !== '' && !envoi;

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 0, marginTop: '.4rem', paddingTop: '.4rem', borderTop: '1px solid var(--color-svv-line)' }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Demander les pièces manquantes à la mairie</h4>
      {etat === null
        ? <span style={muted} aria-live="polite">Chargement…</span>
        : (
          <>
            {etat.destinataire && repliable && <span style={muted}>Sera envoyé dans le fil du dernier message, à {etat.destinataire}.</span>}
            {!repliable && <p role="note" style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-red)' }}>Envoi impossible : {etat.motif ?? 'destinataire non répondable'}.</p>}

            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
              <legend style={{ ...muted, padding: 0 }}>Pièces à demander (décochez ce que vous ne voulez pas) :</legend>
              {famillesManquantes.map((f) => (
                <label key={f} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={coches.has(f)} onChange={() => basculerCase(f)} disabled={!repliable} />
                  {LIBELLE[f]}
                </label>
              ))}
            </fieldset>

            {mode === 'cases' && (
              <>
                <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto', padding: '.3rem .7rem', alignSelf: 'flex-start' }}
                  disabled={!repliable || coches.size === 0} onClick={preparer}>Préparer le message</button>
                {coches.size === 0 && repliable && <span style={muted}>Cochez au moins une pièce.</span>}
              </>
            )}

            {mode === 'apercu' && (
              <div className="flex flex-col gap-2">
                <span style={muted}>Relisez et modifiez si besoin. Le message envoyé sera EXACTEMENT ce texte.</span>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>
                  <span style={muted}>Objet</span>
                  <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} style={styleChamp} aria-label="Objet du message" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>
                  <span style={muted}>Corps du message</span>
                  <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={14} style={{ ...styleChamp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} aria-label="Corps du message" />
                </label>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto', padding: '.3rem .7rem' }} disabled={!peutEnvoyer} onClick={() => void envoyer()}>
                    {envoi ? 'Envoi…' : 'Envoyer à la mairie'}
                  </button>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.3rem .7rem' }} onClick={() => { setMode('cases'); setMessage(null); }}>Abandonner</button>
                </div>
                {(objet.trim() === '' || corps.trim() === '') && <span style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>L’objet et le corps ne peuvent pas être vides.</span>}
              </div>
            )}

            {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>{message}</div>}

            {etat.historique.length > 0 && (
              <div style={{ ...muted, marginTop: '.2rem' }}>
                Demandes déjà envoyées :
                <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem' }}>
                  {etat.historique.map((h, i) => <li key={i}>{h.le.slice(0, 16).replace('T', ' ')} — {h.objet}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
    </div>
  );
}
