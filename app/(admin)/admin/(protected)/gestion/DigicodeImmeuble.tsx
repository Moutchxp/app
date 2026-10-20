'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴🔴 LE DIGICODE DE L'IMMEUBLE, DANS LA FICHE IMMEUBLE / SYNDIC (rose) (Arno, 21/10/2026, migration 396) ═════════════════
 * Un champ « Digicode » (Oui / Non, et le code) par ADRESSE POSTALE de la copropriété, avec la mention « Commun à tous les biens
 * du … (N biens) ». Il est porté par l'IMMEUBLE de l'adresse, jamais par le syndic : le modifier ici le change sur toutes les
 * fiches de biens de cette adresse, et changer de syndic n'y touche pas. Autonome : sa propre lecture, son propre « Enregistrer »
 * (`/api/admin/gestion/immeubles/digicode`), sans rien changer au formulaire du syndic.
 */
const API = '/api/admin/gestion/immeubles/digicode';

interface Lu { digicode: boolean | null; code: string | null; source: string | null; mention: string | null; journal?: { le: string; avant: string; apres: string; par: string }[] }

export function DigicodeImmeuble({ voie, codePostal, commune }: { voie: string; codePostal: string | null; commune: string | null }) {
  const [lu, setLu] = useState<Lu | null>(null);
  const [absent, setAbsent] = useState(false);
  const [digicode, setDigicode] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [n, setN] = useState(0);
  const q = `voie=${encodeURIComponent(voie)}&cp=${encodeURIComponent(codePostal ?? '')}&commune=${encodeURIComponent(commune ?? '')}`;
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>).then((d) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setAbsent(true); return; }
      setLu(d.data); setDigicode(d.data.digicode); setCode(d.data.code ?? '');
    }).catch(() => { if (vivant) setAbsent(true); });
    return () => { vivant = false; };
  }, [q, n]);
  if (absent) return null;
  if (lu === null) return null;
  const change = digicode !== lu.digicode || (digicode === true ? code.trim() : '') !== (lu.code ?? '');
  const enregistrer = async (): Promise<void> => {
    setEnvoi(true); setMessage(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voie, cp: codePostal, commune, digicode, code: digicode === true ? code : null }) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string };
      setMessage(d.etat === 'ok' ? 'Digicode enregistré pour tous les biens de l’adresse.' : d.motif ?? d.message ?? 'Enregistrement refusé.');
      if (d.etat === 'ok') setN((x) => x + 1);
    } catch {
      setMessage('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className="dgi" role="group" aria-label={`Digicode du ${voie}`} data-digicode-immeuble={voie}>
      <style>{CSS_DIGICODE_IMMEUBLE}</style>
      <span className="dgi-mot">Digicode</span>
      <span className="dgi-choix" role="group" aria-label="Digicode">
        {([[true, 'Oui'], [false, 'Non']] as const).map(([v, mot]) => (
          <button key={mot} type="button" aria-pressed={digicode === v} onClick={() => { setDigicode(digicode === v ? null : v); setMessage(null); }}>{mot}</button>
        ))}
      </span>
      <input className="dgi-code" value={digicode === true ? code : ''} maxLength={8} placeholder="code" disabled={digicode !== true} aria-label="Code du digicode"
        onChange={(e) => { setCode(e.target.value.slice(0, 8)); setMessage(null); }} data-code-digicode />
      {change && <button type="button" className="svv-btn svv-btn-primary gst-btn dgi-ok" disabled={envoi} onClick={() => { void enregistrer(); }} data-enregistrer-digicode>Enregistrer</button>}
      {lu.mention && <span className="dgi-mention" data-mention-digicode>{lu.mention}</span>}
      {message !== null && <span className="dgi-message" role="status">{message}</span>}
    </div>
  );
}

/** Jetons du thème ; cibles ≥ 44 px ; le choix retenu porte la coche, texte centré (même règle que les pilules). */
export const CSS_DIGICODE_IMMEUBLE = `
.dgi{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem;padding:.35rem 0;font-size:.9rem;color:var(--color-svv-ink)}
.dgi-mot{font-weight:700}
.dgi-choix{display:inline-flex;border:1px solid var(--color-svv-line-strong);border-radius:10px;overflow:hidden}
.dgi-choix button{position:relative;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:0 calc(12px + 1em);min-height:44px;font:inherit;font-weight:600;cursor:pointer}
.dgi-choix button + button{border-left:1px solid var(--color-svv-line-strong)}
.dgi-choix button[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface)}
.dgi-choix button::before{content:"✓";position:absolute;left:12px;top:50%;transform:translateY(-50%);visibility:hidden}
.dgi-choix button[aria-pressed="true"]::before{visibility:visible}
.dgi-code{width:7rem;min-height:44px;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-weight:700;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.dgi-code:disabled{background:var(--color-svv-field);color:var(--color-svv-muted)}
.dgi-ok{min-height:44px}
.dgi-mention{flex:1 1 100%;color:var(--color-svv-muted);font-size:.82rem}
.dgi-message{flex:1 1 100%;font-weight:700;color:var(--color-svv-green-ink)}
`;
