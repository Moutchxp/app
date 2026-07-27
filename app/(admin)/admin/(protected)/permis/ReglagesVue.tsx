'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { ConfigVeille } from '../../../../lib/sitadel/veilleConfig';
import { ETIQUETTE_PROFIL, type ConfigDemandeur, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import {
  champsPourProfil, PARAMS_VEILLE, type BornesParColonne, type ErreurReglage,
} from '../../../../lib/sitadel/reglagesVeille';
import { BandeauIdentite, PlageParam } from './ReglagesRendu';

/**
 * Écran « Réglages » de la tuile Permis (chantier S7d / S7e). Édite les DEUX identités de demandeur (Société / Personne
 * physique), chacune avec son bandeau et SES champs (le profil 'personne' n'affiche que nom/adresse/e-mail), et les
 * paramètres du moteur (dont le profil par défaut). Motif Pilotage Moteur : validation server-side, message d'erreur au
 * niveau du champ. Mobile-first (accordéon). AUCUN ENVOI.
 */
interface Reglages {
  demandeur: Record<ProfilDemandeur, ConfigDemandeur>;
  profilDefaut: ProfilDemandeur;
  veille: ConfigVeille;
  bornes: BornesParColonne;
  problemesIdentite: Record<ProfilDemandeur, string[]>;
}
type ReponsePatch = ({ ok: true } & Reglages) | { erreurs: ErreurReglage[] };
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ReglagesVue() {
  const [data, setData] = useState<Reglages | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');

  // Brouillons : identité par profil puis par clé ; paramètres par colonne.
  const [idDraft, setIdDraft] = useState<Record<ProfilDemandeur, Record<string, string>>>({ entreprise: {}, personne: {} });
  const [veDraft, setVeDraft] = useState<Record<string, string>>({});
  const [idErreurs, setIdErreurs] = useState<Record<ProfilDemandeur, Record<string, string>>>({ entreprise: {}, personne: {} });
  const [idMsg, setIdMsg] = useState<Record<ProfilDemandeur, string>>({ entreprise: '', personne: '' });
  const [veErreurs, setVeErreurs] = useState<Record<string, string>>({});
  const [veMsg, setVeMsg] = useState<Record<string, string>>({});

  function hydrater(r: Reglages) {
    setData(r);
    const id: Record<ProfilDemandeur, Record<string, string>> = { entreprise: {}, personne: {} };
    for (const p of PROFILS) for (const c of champsPourProfil(p)) id[p][c.cle] = String(r.demandeur[p][c.cle] ?? '');
    setIdDraft(id);
    setVeDraft(Object.fromEntries(PARAMS_VEILLE.map((param) => [param.colonne, String(r.veille[param.cle] ?? '')])));
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
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, []);

  async function enregistrerIdentite(profil: ProfilDemandeur) {
    setIdMsg((m) => ({ ...m, [profil]: '' })); setIdErreurs((m) => ({ ...m, [profil]: {} }));
    const demandeur = Object.fromEntries(champsPourProfil(profil).map((c) => [c.cle, idDraft[profil][c.cle] ?? '']));
    const res = await fetch('/api/admin/permis/reglages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profil, demandeur }),
    });
    const rep = (await res.json()) as ReponsePatch;
    if (res.ok && 'ok' in rep) { hydrater(rep); setIdMsg((m) => ({ ...m, [profil]: 'Identité enregistrée.' })); return; }
    const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne: '', message: 'écriture refusée' }];
    setIdErreurs((m) => ({ ...m, [profil]: Object.fromEntries(erreurs.filter((e) => e.colonne).map((e) => [e.colonne, e.message])) }));
    const globales = erreurs.filter((e) => !e.colonne).map((e) => e.message);
    setIdMsg((m) => ({ ...m, [profil]: `Aucune modification : ${(globales.length ? globales : erreurs.map((e) => e.message)).join(' ; ')}.` }));
  }

  async function enregistrerParam(colonne: string, type: 'entier' | 'texte' | 'enum') {
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
      {/* ── Section A : identités (accordéon, un bloc par profil) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Identités du demandeur</h2>
        <p style={styleAide}>Deux profils pour exercer le droit d’accès : « Société » (identité complète) ou « Personne physique » (nom, adresse, e-mail — sans exposer la société). Chaque demande porte l’un des deux ; l’identité correspondante doit être complète pour passer « prête ».</p>
        {PROFILS.map((profil) => {
          const complet = data.problemesIdentite[profil].length === 0;
          return (
            <details key={profil} open={!complet} style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.6rem', background: 'var(--color-svv-field)' }}>
              <summary style={{ cursor: 'pointer', padding: '.6rem .8rem', fontWeight: 700, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                {ETIQUETTE_PROFIL[profil]}
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: complet ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>
                  {complet ? '● complète' : '● incomplète'}
                </span>
              </summary>
              <div className="flex flex-col gap-3" style={{ padding: '.2rem .8rem .8rem' }}>
                <BandeauIdentite problemes={data.problemesIdentite[profil]} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.75rem' }}>
                  {champsPourProfil(profil).map((c) => (
                    <label key={c.cle} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                      <span style={styleLabel}>{cap(c.libelle)}{c.cle === 'telephone' ? ' (facultatif)' : ''}</span>
                      {c.multiligne
                        ? <textarea value={idDraft[profil][c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [profil]: { ...d[profil], [c.cle]: e.target.value } }))} rows={2} style={styleInput} />
                        : <input value={idDraft[profil][c.cle] ?? ''} onChange={(e) => setIdDraft((d) => ({ ...d, [profil]: { ...d[profil], [c.cle]: e.target.value } }))} style={styleInput} />}
                      <span style={styleAide}>{c.aide}</span>
                      {idErreurs[profil][c.colonne] && <span role="alert" style={styleErreur}>{idErreurs[profil][c.colonne]}</span>}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .9rem' }} onClick={() => void enregistrerIdentite(profil)}>Enregistrer {ETIQUETTE_PROFIL[profil].toLowerCase()}</button>
                  {idMsg[profil] && <span role="status" style={{ fontSize: 13 }}>{idMsg[profil]}</span>}
                </div>
              </div>
            </details>
          );
        })}
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
                  {p.type === 'enum'
                    ? <select value={veDraft[p.colonne] ?? ''} onChange={(e) => setVeDraft((d) => ({ ...d, [p.colonne]: e.target.value }))} style={styleInput} aria-label={p.libelle}>
                        {(p.optionsEnum ?? []).map((o) => <option key={o} value={o}>{o === 'entreprise' || o === 'personne' ? ETIQUETTE_PROFIL[o] : o}</option>)}
                      </select>
                    : p.type === 'entier'
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
