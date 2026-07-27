'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { ConfigVeille } from '../../../../lib/sitadel/veilleConfig';
import type { ConfigDemandeur } from '../../../../lib/sitadel/demande';
import {
  CHAMPS_IDENTITE, PARAMS_VEILLE, type BornesParColonne, type ErreurReglage,
} from '../../../../lib/sitadel/reglagesVeille';
import { BandeauIdentite, PlageParam } from './ReglagesRendu';

/**
 * Écran « Réglages » de la tuile Permis (chantier S7d) : édite l'IDENTITÉ du demandeur (config_demandeur) et les
 * PARAMÈTRES du moteur de veille (config_veille), sans jamais passer par psql. Motif calqué sur « Pilotage Moteur » :
 * lecture au montage, validation server-side à l'enregistrement, message d'erreur au niveau du champ. AUCUN ENVOI.
 */
interface Reglages {
  demandeur: ConfigDemandeur;
  veille: ConfigVeille;
  bornes: BornesParColonne;
  problemesIdentite: string[];
}
type ReponsePatch = { ok: true; demandeur: ConfigDemandeur; veille: ConfigVeille; problemesIdentite: string[] } | { erreurs: ErreurReglage[] };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };

export function ReglagesVue() {
  const [data, setData] = useState<Reglages | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');

  // Brouillons locaux (chaînes) — identité par clé camel, paramètres par colonne snake.
  const [idDraft, setIdDraft] = useState<Record<string, string>>({});
  const [veDraft, setVeDraft] = useState<Record<string, string>>({});
  const [idErreurs, setIdErreurs] = useState<Record<string, string>>({});
  const [veErreurs, setVeErreurs] = useState<Record<string, string>>({});
  const [idMsg, setIdMsg] = useState('');
  const [veMsg, setVeMsg] = useState<Record<string, string>>({});

  // Le GET fournit les bornes (issues des CHECK) ; le PATCH ne les renvoie pas → on conserve celles déjà chargées.
  function hydrater(r: { demandeur: ConfigDemandeur; veille: ConfigVeille; problemesIdentite: string[]; bornes?: BornesParColonne }) {
    setData((prev) => ({ demandeur: r.demandeur, veille: r.veille, problemesIdentite: r.problemesIdentite, bornes: r.bornes ?? prev?.bornes ?? {} }));
    setIdDraft(Object.fromEntries(CHAMPS_IDENTITE.map((c) => [c.cle, String(r.demandeur[c.cle] ?? '')])));
    setVeDraft(Object.fromEntries(PARAMS_VEILLE.map((p) => [p.colonne, String(r.veille[p.cle] ?? '')])));
  }

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglages', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        hydrater((await res.json()) as Reglages);
        setEtat('ok');
      } catch {
        if (!annule) setEtat('erreur');
      }
    })();
    return () => { annule = true; };
  }, []);

  async function enregistrerIdentite() {
    setIdMsg(''); setIdErreurs({});
    const demandeur = Object.fromEntries(CHAMPS_IDENTITE.map((c) => [c.cle, idDraft[c.cle] ?? '']));
    const res = await fetch('/api/admin/permis/reglages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeur }),
    });
    const rep = (await res.json()) as ReponsePatch;
    if (res.ok && 'ok' in rep) { hydrater(rep); setIdMsg('Identité enregistrée.'); return; }
    const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne: '', message: 'écriture refusée' }];
    setIdErreurs(Object.fromEntries(erreurs.filter((e) => e.colonne).map((e) => [e.colonne, e.message])));
    const globales = erreurs.filter((e) => !e.colonne).map((e) => e.message);
    setIdMsg(`Aucune modification : ${(globales.length ? globales : erreurs.map((e) => e.message)).join(' ; ')}.`);
  }

  async function enregistrerParam(colonne: string, type: 'entier' | 'texte') {
    setVeMsg((m) => ({ ...m, [colonne]: '' })); setVeErreurs((m) => ({ ...m, [colonne]: '' }));
    const brut = veDraft[colonne] ?? '';
    if (type === 'entier' && brut.trim() === '') { setVeErreurs((m) => ({ ...m, [colonne]: 'Valeur requise.' })); return; }
    const valeur: number | string = type === 'entier' ? Number(brut) : brut;
    const res = await fetch('/api/admin/permis/reglages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veille: { [colonne]: valeur } }),
    });
    const rep = (await res.json()) as ReponsePatch;
    if (res.ok && 'ok' in rep) { hydrater(rep); setVeMsg((m) => ({ ...m, [colonne]: 'Enregistré.' })); return; }
    const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne, message: 'écriture refusée' }];
    const e = erreurs.find((x) => x.colonne === colonne) ?? erreurs[0];
    setVeErreurs((m) => ({ ...m, [colonne]: e?.message ?? 'écriture refusée' }));
  }

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement des réglages…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={styleErreur}>Réglages indisponibles.</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Section A : identité du demandeur ── */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Identité du demandeur</h2>
        <p style={styleAide}>Ces informations constituent l’en-tête et la signature des demandes de communication adressées aux mairies. Une identité complète est requise pour qu’une demande passe en « prête ».</p>
        <BandeauIdentite problemes={data.problemesIdentite} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.75rem' }}>
          {CHAMPS_IDENTITE.map((c) => (
            <label key={c.cle} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
              <span style={styleLabel}>{c.libelle.charAt(0).toUpperCase() + c.libelle.slice(1)}{c.cle === 'telephone' ? ' (facultatif)' : ''}</span>
              {c.multiligne
                ? <textarea value={idDraft[c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [c.cle]: e.target.value }))} rows={2} style={styleInput} />
                : <input value={idDraft[c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [c.cle]: e.target.value }))} style={styleInput} />}
              <span style={styleAide}>{c.aide}</span>
              {idErreurs[c.colonne] && <span role="alert" style={styleErreur}>{idErreurs[c.colonne]}</span>}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .9rem' }} onClick={() => void enregistrerIdentite()}>Enregistrer l’identité</button>
          {idMsg && <span role="status" style={{ fontSize: 13 }}>{idMsg}</span>}
        </div>
      </section>

      {/* ── Section B : paramètres du moteur ── */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Paramètres du moteur de veille</h2>
        <p style={styleAide}>Chaque paramètre est appliqué immédiatement. Les plages autorisées proviennent des contraintes de la base de données.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem' }}>
          {PARAMS_VEILLE.map((p) => {
            const b = data.bornes[p.colonne];
            return (
              <article key={p.colonne} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
                <span style={styleLabel}>{p.libelle}</span>
                <span style={styleAide}>{p.aide}</span>
                <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
                  {p.type === 'entier'
                    ? <input type="number" value={veDraft[p.colonne] ?? ''} min={b?.min} max={b?.max} step={1}
                        onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />
                    : <input value={veDraft[p.colonne] ?? ''} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle} />}
                  <PlageParam param={p} bornes={b} />
                </label>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void enregistrerParam(p.colonne, p.type)}>Enregistrer</button>
                  {veMsg[p.colonne] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{veMsg[p.colonne]}</span>}
                </div>
                {veErreurs[p.colonne] && <span role="alert" style={styleErreur}>{veErreurs[p.colonne]}</span>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
