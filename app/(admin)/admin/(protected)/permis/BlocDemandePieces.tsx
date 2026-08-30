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

interface LigneHisto { id: number; le: string; mode: 'envoye' | 'declare'; dateRelance: string | null; objet: string | null; familles: string[] }
interface Etat { numDau: string | null; destinataire: string | null; repliable: boolean; motif: string | null; historique: LigneHisto[] }
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleChamp: React.CSSProperties = { width: '100%', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, boxSizing: 'border-box' };

/** Libellé lisible d'une réponse d'erreur. La barrière d'accès émet 401 (session expirée, via le proxy) OU 403 (compte
 * révoqué / non-admin / changement de mot de passe requis, via la garde de route) : les DEUX doivent inviter à se reconnecter,
 * JAMAIS afficher le code machine brut (« INTERDIT », « ACCES_REVOQUE »…). Tout autre statut → message métier de la route, sinon repli. */
function libelleErreur(status: number, erreur: string | undefined, repli: string): string {
  if (status === 401 || status === 403) return 'Session expirée ou accès non autorisé : reconnectez-vous, puis recommencez.';
  return erreur ?? repli;
}

export function BlocDemandePieces({ dossierId, famillesManquantes }: { dossierId: number; famillesManquantes: FamillePlan[] }) {
  const [coches, setCoches] = useState<Set<FamillePlan>>(() => new Set(famillesManquantes));
  const [etat, setEtat] = useState<Etat | null>(null);
  const [mode, setMode] = useState<'cases' | 'apercu'>('cases');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [genere, setGenere] = useState<{ objet: string; corps: string }>({ objet: '', corps: '' });
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // PART-3e — DÉCLARATION d'une relance faite hors outil (aucun envoi) : sélection + date propres au constat.
  const [cochesDecl, setCochesDecl] = useState<Set<FamillePlan>>(() => new Set(famillesManquantes));
  const [dateDecl, setDateDecl] = useState('');
  const [enCoursDecl, setEnCoursDecl] = useState(false);
  const [messageDecl, setMessageDecl] = useState<string | null>(null);

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
      else setMessage(libelleErreur(res.status, d.erreur, 'envoi impossible'));
    } catch { setMessage('envoi impossible'); } finally { setEnvoi(false); }
  }, [dossierId, coches, objet, corps, chargerEtat]);

  const peutEnvoyer = repliable && objet.trim() !== '' && corps.trim() !== '' && !envoi;

  const basculerCaseDecl = (f: FamillePlan) => setCochesDecl((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  // DÉCLARER une relance faite hors outil : AUCUN envoi (action 'declarer'). On pose date + familles ; le serveur valide les bornes.
  const declarer = useCallback(async () => {
    setEnCoursDecl(true); setMessageDecl(null);
    try {
      const res = await fetch('/api/admin/permis/demander-pieces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'declarer', dossierId, familles: [...cochesDecl], dateRelance: dateDecl }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (res.ok && d.ok) { setMessageDecl('Relance déclarée (aucun e-mail envoyé).'); await chargerEtat(); }
      else setMessageDecl(libelleErreur(res.status, d.erreur, 'déclaration impossible'));
    } catch { setMessageDecl('déclaration impossible'); } finally { setEnCoursDecl(false); }
  }, [dossierId, cochesDecl, dateDecl, chargerEtat]);

  // ANNULER une relance déclarée (réversibilité).
  const annulerDecl = useCallback(async (journalId: number) => {
    if (!window.confirm('Annuler cette relance déclarée ?')) return;
    try {
      const res = await fetch('/api/admin/permis/demander-pieces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annuler', journalId }),
      });
      if (res.ok) await chargerEtat(); else setMessageDecl('annulation impossible');
    } catch { setMessageDecl('annulation impossible'); }
  }, [chargerEtat]);

  const peutDeclarer = dateDecl.trim() !== '' && cochesDecl.size > 0 && !enCoursDecl;

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

            {/* PART-3e — DÉCLARER une relance faite HORS de l'outil : visuellement DISTINCT (fond neutre encadré), et sans envoi. */}
            <div style={{ marginTop: '.5rem', padding: '.5rem', border: '1px dashed var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)' }}>
              <strong style={{ fontSize: 12 }}>Déclarer une relance déjà envoyée (hors outil)</strong>
              <p style={{ ...muted, margin: '.15rem 0' }}>Constat, pas un envoi : aucun e-mail ne part. Enregistre une relance que vous avez faite vous-même depuis votre boîte.</p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12, maxWidth: 220 }}>
                <span style={muted}>Date de la relance</span>
                <input type="date" value={dateDecl} onChange={(e) => setDateDecl(e.target.value)} style={styleChamp} aria-label="Date de la relance déjà envoyée" />
              </label>
              <fieldset style={{ border: 0, margin: '.3rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                <legend style={{ ...muted, padding: 0 }}>Pièces alors demandées :</legend>
                {famillesManquantes.map((f) => (
                  <label key={f} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={cochesDecl.has(f)} onChange={() => basculerCaseDecl(f)} />
                    {LIBELLE[f]}
                  </label>
                ))}
              </fieldset>
              {/* POLISH (Arno) : fond PLEIN dès qu'une date valide rend le geste cliquable ; fond clair tant qu'il est inactif. Libellé inchangé. */}
              <button type="button" className={`svv-btn ${peutDeclarer ? 'svv-btn-primary' : 'svv-btn-outline'}`} style={{ width: 'auto', padding: '.3rem .7rem', marginTop: '.3rem' }}
                disabled={!peutDeclarer} onClick={() => void declarer()}>{enCoursDecl ? 'Enregistrement…' : 'Déclarer cette relance'}</button>
              {dateDecl.trim() === '' && <span style={{ ...muted, display: 'block', marginTop: '.2rem' }}>Indiquez la date de la relance.</span>}
              {messageDecl && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-ink)', marginTop: '.2rem' }}>{messageDecl}</div>}
            </div>

            {etat.historique.length > 0 && (
              <div style={{ ...muted, marginTop: '.2rem' }}>
                Relances déjà tracées :
                <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem' }}>
                  {etat.historique.map((h) => (
                    <li key={h.id}>
                      {(h.dateRelance ?? h.le.slice(0, 10))} —{' '}
                      {h.mode === 'declare'
                        ? <><strong>déclarée</strong> (contenu non connu du système){h.familles.length > 0 ? ` — ${h.familles.join(', ')}` : ''}{' '}
                            <button type="button" className="svv-link" style={{ width: 'auto', padding: '0 .3rem', color: 'var(--color-svv-red)' }} onClick={() => void annulerDecl(h.id)}>annuler</button></>
                        : <><strong>envoyée par l’outil</strong>{h.objet ? ` — ${h.objet}` : ''}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
    </div>
  );
}
