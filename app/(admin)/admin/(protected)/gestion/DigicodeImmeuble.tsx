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

interface Valeur { digicode: boolean | null; code: string | null }
interface Batiment extends Valeur { cle: string; libelle: string; nbBiens: number; mention: string }
interface Lu extends Valeur {
  source: string | null; mention: string | null; journal?: { le: string; avant: string; apres: string; par: string; batiment?: string | null }[];
  /** Arno (21/10/2026, 399) — un code par bâtiment ; absent (ou `false`) sans la 399 : une seule ligne, comme avant. */
  parBatiment?: boolean; batiments?: Batiment[];
}

/**
 * ══ UN DIGICODE PAR BÂTIMENT (Arno, 21/10/2026, migration 399) ══ Avec la 399, la fiche montre une liste « Digicodes » : une
 * ligne par bâtiment connu à l'adresse (déduits des biens, ou ajoutés ici) et le « Code général » (biens sans bâtiment, ou dont
 * le bâtiment n'a pas de code), chacune modifiable ; « + Ajouter un bâtiment ». Sans la 399 : la ligne unique d'avant.
 */
export function DigicodeImmeuble({ voie, codePostal, commune }: { voie: string; codePostal: string | null; commune: string | null }) {
  const [lu, setLu] = useState<Lu | null>(null);
  const [absent, setAbsent] = useState(false);
  const [n, setN] = useState(0);
  const [ajouts, setAjouts] = useState<string[]>([]);
  const [nouveau, setNouveau] = useState<string | null>(null);
  const q = `voie=${encodeURIComponent(voie)}&cp=${encodeURIComponent(codePostal ?? '')}&commune=${encodeURIComponent(commune ?? '')}`;
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>).then((d) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setAbsent(true); return; }
      setLu(d.data);
    }).catch(() => { if (vivant) setAbsent(true); });
    return () => { vivant = false; };
  }, [q, n]);
  if (absent) return null;
  if (lu === null) return null;
  const relire = (): void => { setN((x) => x + 1); };
  if (lu.parBatiment !== true) {
    return (
      <div className="dgi" role="group" aria-label={`Digicode du ${voie}`} data-digicode-immeuble={voie}>
        <style>{CSS_DIGICODE_IMMEUBLE}</style>
        <LigneDigicode key="general" voie={voie} codePostal={codePostal} commune={commune} titre="Digicode" batiment={null} valeur={lu} mention={lu.mention}
          reussite="Digicode enregistré pour tous les biens de l’adresse." apres={relire} />
      </div>
    );
  }
  const connus = lu.batiments ?? [];
  const cles = new Set(connus.map((b) => cleSimple(b.libelle)));
  const enPlus = ajouts.filter((a) => !cles.has(cleSimple(a)));
  return (
    <div className="dgi-liste" role="group" aria-label={`Digicodes du ${voie}`} data-digicode-immeuble={voie} data-digicodes-batiments>
      <style>{CSS_DIGICODE_IMMEUBLE}</style>
      <div className="dgi-titre">Digicodes <span className="dgi-adresse">{voie}</span></div>
      {connus.map((b) => (
        <LigneDigicode key={b.cle} voie={voie} codePostal={codePostal} commune={commune} titre={`Bâtiment ${b.libelle}`} batiment={b.libelle} valeur={b}
          mention={b.mention} reussite={`Digicode du bâtiment ${b.libelle} enregistré pour ses biens.`} apres={relire} />
      ))}
      {enPlus.map((a) => (
        <LigneDigicode key={`+${a}`} voie={voie} codePostal={codePostal} commune={commune} titre={`Bâtiment ${a}`} batiment={a} valeur={{ digicode: null, code: null }}
          mention="Nouveau bâtiment : sans code, ses biens lisent le code général." reussite={`Digicode du bâtiment ${a} enregistré pour ses biens.`}
          apres={() => { setAjouts((x) => x.filter((y) => y !== a)); relire(); }} />
      ))}
      <LigneDigicode key="general" voie={voie} codePostal={codePostal} commune={commune} titre="Code général" batiment={null} valeur={lu} mention={lu.mention}
        reussite="Code général de l’adresse enregistré." apres={relire} />
      {nouveau === null ? (
        <button type="button" className="dgi-lien dgi-ajouter" onClick={() => setNouveau('')} data-ajouter-batiment>+ Ajouter un bâtiment</button>
      ) : (
        <span className="dgi-nouveau">
          <input value={nouveau} maxLength={60} placeholder="ex. C" aria-label="Nom du bâtiment" autoFocus onChange={(e) => setNouveau(e.target.value)} data-nom-batiment />
          <button type="button" className="svv-btn svv-btn-outline gst-btn dgi-ok" disabled={nouveau.trim() === ''}
            onClick={() => { const t = nouveau.trim(); if (t !== '') setAjouts((x) => [...x, t]); setNouveau(null); }} data-valider-batiment>Ajouter</button>
          <button type="button" className="dgi-lien" onClick={() => setNouveau(null)}>Annuler</button>
        </span>
      )}
    </div>
  );
}

/** Une comparaison grossière des noms de bâtiment, côté écran (le serveur fait foi : `cleBatiment`). */
const cleSimple = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^\s*(batiments?|bat|bt)\b[\s.]*/, '').replace(/[\s.]+/g, ' ').trim();

/** Une ligne « Digicode » : Oui / Non, le code, « Enregistrer » quand il a changé, la mention. */
function LigneDigicode({ voie, codePostal, commune, titre, batiment, valeur, mention, reussite, apres }: {
  voie: string; codePostal: string | null; commune: string | null; titre: string; batiment: string | null; valeur: Valeur; mention: string | null;
  reussite: string; apres: () => void;
}) {
  const [digicode, setDigicode] = useState<boolean | null>(valeur.digicode);
  const [code, setCode] = useState(valeur.code ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Relue après un enregistrement : la ligne reprend la valeur du serveur (le message, lui, reste affiché).
  useEffect(() => { setDigicode(valeur.digicode); setCode(valeur.code ?? ''); }, [valeur.digicode, valeur.code]);
  const change = digicode !== valeur.digicode || (digicode === true ? code.trim() : '') !== (valeur.code ?? '');
  const enregistrer = async (): Promise<void> => {
    setEnvoi(true); setMessage(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voie, cp: codePostal, commune, digicode, code: digicode === true ? code : null, ...(batiment === null ? {} : { batiment }) }) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat === 'ok') { setMessage(reussite); apres(); } else setMessage(d.motif ?? d.message ?? 'Enregistrement refusé.');
    } catch {
      setMessage('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className="dgi" role="group" aria-label={`${titre} — ${voie}`} data-ligne-digicode={batiment ?? ''}>
      <span className="dgi-mot">{titre}</span>
      <span className="dgi-choix" role="group" aria-label={titre}>
        {([[true, 'Oui'], [false, 'Non']] as const).map(([v, mot]) => (
          <button key={mot} type="button" aria-pressed={digicode === v} onClick={() => { setDigicode(digicode === v ? null : v); setMessage(null); }}>{mot}</button>
        ))}
      </span>
      <input className="dgi-code" value={digicode === true ? code : ''} maxLength={8} placeholder="code" disabled={digicode !== true} aria-label={`Code — ${titre}`}
        onChange={(e) => { setCode(e.target.value.slice(0, 8)); setMessage(null); }} data-code-digicode />
      {change && <button type="button" className="svv-btn svv-btn-primary gst-btn dgi-ok" disabled={envoi} onClick={() => { void enregistrer(); }} data-enregistrer-digicode>Enregistrer</button>}
      {mention && <span className="dgi-mention" data-mention-digicode>{mention}</span>}
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
.dgi-liste{display:flex;flex-direction:column;gap:.15rem;padding:.35rem 0 .5rem;border-bottom:1px solid var(--color-svv-line)}
.dgi-titre{font-weight:800;font-size:.92rem;color:var(--color-svv-ink)}
.dgi-adresse{font-weight:600;color:var(--color-svv-muted);margin-left:.35rem}
.dgi-liste .dgi .dgi-mot{min-width:8.5rem}
.dgi-lien{border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-size:.88rem;font-weight:700;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 .2rem}
.dgi-ajouter{align-self:flex-start}
.dgi-nouveau{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem}
.dgi-nouveau input{width:9rem;min-height:44px;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;background:var(--color-svv-surface);color:var(--color-svv-ink)}
`;
