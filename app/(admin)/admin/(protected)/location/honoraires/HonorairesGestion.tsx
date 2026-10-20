'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  calculerHonoraires, formaterEuros, formaterTaux, LIBELLE_BASE, MOT_LOYER_A_SAISIR, nombrePourSaisie,
  PHRASE_THEORIQUE, tvaEnVigueur, type BaseHonoraires, type LocationPourHonoraires, type ResultatHonoraires,
} from '../../../../../lib/gestion/honorairesGestion';
import { baremeEnVigueur, tarifAffiche, lireDecimal, ZERO, type Bareme } from '../../../../../lib/location/honorairesProprietaire';

/**
 * ══ 🔴🔴 LOT L1 — L'ÉCRAN « HONORAIRES DE GESTION » (administrateurs) ═════════════════════════════════════════════
 *
 * Demande d'Arno (17/10/2026) : « les HONORAIRES DE GESTION générés par chaque lot = loyer × taux, avec une vue par
 * lot, par propriétaire et en total agence, mensuelle et annuelle ». Les locations de l'année viennent de la route ;
 * le CALCUL est celui du module pur `honorairesGestion.ts`, le même que le serveur.
 *
 * 🔴 ÉCRAN DE LA TUILE LOCATION (correction d'Arno du 17/10/2026 : les écrans de la Location vivent dans /admin/location).
 * 🔴 LES LOYERS ABSENTS NE SONT PAS INVENTÉS : exclus des totaux, comptés, et chaque lot concerné dit « loyer de départ
 * à saisir » avec un lien vers sa fiche. 🔴 MONTANT THÉORIQUE : la phrase le dit en tête.
 * 📱 MOBILE : les tableaux se replient en cartes sous 640 px (exigence transverse), jamais un débordement horizontal.
 */
type Vue = 'lot' | 'proprietaire' | 'agence';
type Etat =
  | { etat: 'charge' }
  | { etat: 'erreur'; message: string }
  | { etat: 'sans_schema' }
  | { etat: 'ok'; annee: number; locations: LocationPourHonoraires[]; reglages: Reglages; baremes?: Bareme[]; baremesDisponibles?: boolean };
interface Reglages {
  tauxDefautHt: number; baseDefaut: BaseHonoraires;
  tva: { valeur: number; depuis: string; saisiLe: string; saisiPar: string }[];
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
  'novembre', 'décembre'];
const lienFiche = (lotId: number): string => `/admin/location/bien/${lotId}`;
const ttcOuTiret = (n: number | null): string => (n === null ? '—' : formaterEuros(n));

export function HonorairesGestion() {
  const maintenant = new Date();
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState<number | null>(maintenant.getMonth() + 1);
  const [vue, setVue] = useState<Vue>('lot');
  const [etat, setEtat] = useState<Etat>({ etat: 'charge' });
  const [rafraichi, setRafraichi] = useState(0);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/location/honoraires?annee=${annee}`, { cache: 'no-store' });
        if (res.status === 403) { if (vivant) setEtat({ etat: 'erreur', message: 'Écran réservé aux administrateurs.' }); return; }
        const d = await res.json() as Etat & { message?: string };
        if (vivant) setEtat(d.etat === 'ok' || d.etat === 'sans_schema' ? d : { etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
      } catch {
        if (vivant) setEtat({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' });
      }
    })();
    return () => { vivant = false; };
  }, [annee, rafraichi]);

  const resultat: ResultatHonoraires | null = useMemo(() => (etat.etat === 'ok'
    ? calculerHonoraires(etat.locations ?? [], { annee: etat.annee, mois }, etat.reglages?.tva ?? []) : null), [etat, mois]);
  const parMois = useMemo(() => (etat.etat === 'ok'
    ? MOIS.map((_, i) => calculerHonoraires(etat.locations ?? [], { annee: etat.annee, mois: i + 1 }, etat.reglages?.tva ?? []))
    : []), [etat]);

  const libellePeriode = mois === null ? `année ${annee}` : `${MOIS[mois - 1]} ${annee}`;

  const exporter = useCallback(() => {
    if (resultat === null) return;
    const lignes: string[][] = vue === 'proprietaire'
      ? [['Propriétaire', 'Lots', 'Indivision', 'HT', 'TTC'],
        ...resultat.parProprietaire.map((p) => [p.nom, String(p.lots), p.indivision ? 'oui' : 'non',
          String(p.ht), p.ttc === null ? '' : String(p.ttc)])]
      : vue === 'agence'
        ? [['Mois', 'HT', 'TTC', 'Locations comptées', 'Sans loyer de départ'],
          ...parMois.map((r, i) => [`${MOIS[i]} ${annee}`, String(r.totalHt), r.totalTtc === null ? '' : String(r.totalTtc),
            String(r.comptees), String(r.manquantes)])]
        : [['Lot', 'Bien', 'Locataire(s)', 'Loyer HC', 'Provisions', 'Taux HT', 'Base', 'HT', 'TTC', 'Sans loyer de départ'],
          ...resultat.parLot.map((l) => [l.lotNumero, l.lotLibelle, l.locataires.join(' / '),
            l.loyerHc === null ? '' : String(l.loyerHc), l.provisions === null ? '' : String(l.provisions),
            l.tauxHt === null ? '' : String(l.tauxHt), l.base ?? '', String(l.ht), l.ttc === null ? '' : String(l.ttc),
            String(l.manquantes)])];
    const csv = lignes.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `honoraires-gestion-${vue}-${mois === null ? annee : `${annee}-${String(mois).padStart(2, '0')}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultat, parMois, vue, mois, annee]);

  return (
    <div className="hon">
      <style>{CSS_HONORAIRES}</style>
      <p className="hon-retour"><a href="/admin/location">← Location</a></p>
      <p className="hon-theorique">{PHRASE_THEORIQUE}</p>

      <div className="hon-barre" role="toolbar" aria-label="Vue et période">
        <span className="hon-seg" role="group" aria-label="Vue">
          {(['lot', 'proprietaire', 'agence'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={vue === v} className={vue === v ? 'on' : ''} onClick={() => setVue(v)}>
              {v === 'lot' ? 'Lot' : v === 'proprietaire' ? 'Propriétaire' : 'Agence'}
            </button>
          ))}
        </span>
        <span className="hon-seg" role="group" aria-label="Période">
          <button type="button" aria-pressed={mois !== null} className={mois !== null ? 'on' : ''}
            onClick={() => setMois(mois ?? maintenant.getMonth() + 1)}>Mois</button>
          <button type="button" aria-pressed={mois === null} className={mois === null ? 'on' : ''}
            onClick={() => setMois(null)}>Année</button>
        </span>
        {mois !== null && (
          <select className="hon-champ" aria-label="Mois" value={mois} onChange={(e) => setMois(Number(e.target.value))}>
            {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        <input className="hon-champ hon-annee" aria-label="Année" type="number" min={2000} max={2100} value={annee}
          onChange={(e) => { const n = Number(e.target.value); if (n >= 2000 && n <= 2100) setAnnee(n); }} />
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={exporter} disabled={resultat === null}>
          ⬇ Tableur
        </button>
      </div>

      {etat.etat === 'charge' && <p className="gst-info" role="status">Chargement…</p>}
      {etat.etat === 'erreur' && <p className="gst-erreur" role="alert">{etat.message}</p>}
      {etat.etat === 'sans_schema' && (
        <p className="gst-info" role="status">Les honoraires de gestion ne sont pas encore installés (migration 370).</p>
      )}

      {resultat !== null && etat.etat === 'ok' && (
        <>
          <div className="hon-totaux">
            <div className="hon-total" data-total-agence>
              <span className="hon-total-mot">Total agence · {libellePeriode}</span>
              <span className="hon-total-valeur">{formaterEuros(resultat.totalHt)} HT</span>
              <span className="hon-total-sous">{ttcOuTiret(resultat.totalTtc)} TTC · {resultat.comptees} location{resultat.comptees > 1 ? 's' : ''} comptée{resultat.comptees > 1 ? 's' : ''}</span>
            </div>
            <div className={`hon-total${resultat.manquantes > 0 ? ' hon-total--manque' : ''}`} data-manquantes>
              <span className="hon-total-mot">Sans loyer de départ</span>
              <span className="hon-total-valeur">{resultat.manquantes} location{resultat.manquantes > 1 ? 's' : ''}</span>
              <span className="hon-total-sous">
                {resultat.manquantes > 0
                  ? 'exclues des totaux — à compléter sur la fiche du bien dans la Location (lots marqués ci-dessous)'
                  : 'toutes les locations de la période ont un loyer de départ'}
              </span>
            </div>
          </div>

          {vue === 'lot' && (
            <table className="hon-table">
              <thead><tr><th>Lot</th><th>Locataire(s)</th><th className="num">Loyer de départ</th><th className="num">Taux HT</th>
                <th className="num">HT</th><th className="num">TTC</th></tr></thead>
              <tbody>
                {resultat.parLot.length === 0 && <tr><td colSpan={6} className="hon-vide">Aucune location sur la période.</td></tr>}
                {resultat.parLot.map((l) => (
                  <tr key={l.lotId}>
                    <td data-mot="Lot"><a href={lienFiche(l.lotId)}>{l.lotLibelle || `Lot ${l.lotNumero}`}</a>
                      <span className="hon-num"> · lot {l.lotNumero}</span></td>
                    <td data-mot="Locataire(s)">{l.locataires.join(' / ')}</td>
                    <td data-mot="Loyer de départ" className="num">
                      {l.loyerHc === null ? <span className="hon-a-saisir">{MOT_LOYER_A_SAISIR}</span>
                        : <>{formaterEuros(l.loyerHc)}{l.provisions === null ? '' : ` + ${formaterEuros(l.provisions)}`}</>}
                      {l.manquantes > 0 && l.loyerHc !== null && (
                        <span className="hon-a-saisir"> · {l.manquantes} sans loyer</span>)}
                    </td>
                    <td data-mot="Taux HT" className="num">
                      {l.tauxHt === null ? '—' : formaterTaux(l.tauxHt)}
                      {l.base !== null && <span className="hon-num"> {LIBELLE_BASE[l.base]}</span>}
                    </td>
                    {/* Un lot dont aucune location n'a de loyer : « — », pas « 0,00 € » (il est exclu, pas nul). */}
                    <td data-mot="HT" className="num">{l.manquantes > 0 && l.loyerHc === null ? '—' : formaterEuros(l.ht)}</td>
                    <td data-mot="TTC" className="num">{l.manquantes > 0 && l.loyerHc === null ? '—' : ttcOuTiret(l.ttc)}</td>
                  </tr>
                ))}
              </tbody>
              {resultat.parLot.length > 0 && (
                <tfoot><tr><th colSpan={4}>Total</th><th className="num">{formaterEuros(resultat.totalHt)}</th>
                  <th className="num">{ttcOuTiret(resultat.totalTtc)}</th></tr></tfoot>
              )}
            </table>
          )}

          {vue === 'proprietaire' && (
            <>
              <table className="hon-table">
                <thead><tr><th>Propriétaire</th><th className="num">Lots</th><th className="num">HT</th><th className="num">TTC</th></tr></thead>
                <tbody>
                  {resultat.parProprietaire.length === 0 && <tr><td colSpan={4} className="hon-vide">Aucun propriétaire sur la période.</td></tr>}
                  {resultat.parProprietaire.map((p) => (
                    <tr key={p.id}>
                      <td data-mot="Propriétaire">{p.nom}{p.indivision && <span className="hon-indiv">indivision</span>}</td>
                      <td data-mot="Lots" className="num">{p.lots}</td>
                      <td data-mot="HT" className="num">{formaterEuros(p.ht)}</td>
                      <td data-mot="TTC" className="num">{ttcOuTiret(p.ttc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hon-note">Un lot en indivision compte entier sur la fiche de chacun de ses propriétaires, marqué
                « indivision », jamais réparti au jugé ; le total agence ne le compte qu’une fois.</p>
            </>
          )}

          {vue === 'agence' && (
            <table className="hon-table">
              <thead><tr><th>Mois</th><th className="num">HT</th><th className="num">TTC</th><th className="num">Comptées</th>
                <th className="num">Sans loyer</th></tr></thead>
              <tbody>
                {parMois.map((r, i) => (
                  <tr key={MOIS[i]} className={mois === i + 1 ? 'hon-ligne-active' : ''}>
                    <td data-mot="Mois">{MOIS[i]} {annee}</td>
                    <td data-mot="HT" className="num">{formaterEuros(r.totalHt)}</td>
                    <td data-mot="TTC" className="num">{ttcOuTiret(r.totalTtc)}</td>
                    <td data-mot="Comptées" className="num">{r.comptees}</td>
                    <td data-mot="Sans loyer" className="num">{r.manquantes}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>Année {annee}</th>
                <th className="num">{formaterEuros(parMois.reduce((s, r) => s + r.totalHt, 0))}</th>
                <th className="num">{parMois.some((r) => r.totalTtc === null) ? '—'
                  : formaterEuros(parMois.reduce((s, r) => s + (r.totalTtc ?? 0), 0))}</th>
                <th colSpan={2} /></tr></tfoot>
            </table>
          )}

          <ReglagesHonoraires reglages={etat.reglages} onEnregistre={() => setRafraichi((n) => n + 1)} />
          <BaremesLocation baremes={etat.baremes ?? []} disponible={etat.baremesDisponibles === true} onEnregistre={() => setRafraichi((n) => n + 1)} />
        </>
      )}
    </div>
  );
}

/** Les réglages modifiables sans code : taux et base par défaut, TVA datée (ajout seul). */
function ReglagesHonoraires({ reglages, onEnregistre }: { reglages: Reglages; onEnregistre: () => void }) {
  const [taux, setTaux] = useState(nombrePourSaisie(reglages.tauxDefautHt));
  const [base, setBase] = useState<BaseHonoraires>(reglages.baseDefaut);
  const [tva, setTva] = useState('');
  const [depuis, setDepuis] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const tvaDuJour = tvaEnVigueur(reglages.tva ?? [], aujourdhui);

  const envoyer = async (corps: Record<string, unknown>): Promise<void> => {
    try {
      const res = await fetch('/api/admin/location/honoraires', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = await res.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat === 'ok') { setMessage('Enregistré.'); onEnregistre(); return; }
      setMessage(d.motif ?? d.message ?? 'Enregistrement refusé.');
    } catch {
      setMessage('Enregistrement impossible : le serveur n’a pas répondu.');
    }
  };

  return (
    <details className="hon-reglages">
      <summary>Réglages des honoraires de gestion</summary>
      <form className="hon-reglages-ligne" onSubmit={(e) => { e.preventDefault(); void envoyer({ action: 'reglages', tauxDefautHt: taux, baseDefaut: base }); }}>
        <label>Taux par défaut (% HT)
          <input className="hon-champ" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} /></label>
        <label>Base par défaut
          <select className="hon-champ" value={base} onChange={(e) => setBase(e.target.value === 'hc' ? 'hc' : 'cc')}>
            <option value="cc">{LIBELLE_BASE.cc}</option><option value="hc">{LIBELLE_BASE.hc}</option>
          </select></label>
        <button type="submit" className="svv-btn gst-btn">Enregistrer</button>
      </form>
      <p className="hon-note">TVA sur honoraires en vigueur aujourd’hui : <strong>{tvaDuJour === null ? 'aucune' : formaterTaux(tvaDuJour)}</strong>.
        Historique : {(reglages.tva ?? []).map((t) => `${formaterTaux(t.valeur)} depuis le ${t.depuis.split('-').reverse().join('/')}`).join(' · ') || 'aucun'}.</p>
      <form className="hon-reglages-ligne" onSubmit={(e) => { e.preventDefault(); void envoyer({ action: 'tva', valeur: tva, depuis }); }}>
        <label>Nouvelle TVA (%)
          <input className="hon-champ" inputMode="decimal" value={tva} onChange={(e) => setTva(e.target.value)} placeholder="ex. 20" /></label>
        <label>À compter du
          <input className="hon-champ" type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} /></label>
        <button type="submit" className="svv-btn svv-btn-outline gst-btn">Ajouter</button>
      </form>
      {message !== null && <p className="hon-note" role="status">{message}</p>}
    </details>
  );
}

/**
 * Arno (20/10/2026) — LE BARÈME DATÉ des honoraires de location à la charge du bailleur (€ TTC/m², migration 392) : celui
 * en vigueur, l'historique, et « Ajouter » un nouveau barème avec sa date d'effet. Les anciens ne sont JAMAIS écrasés : un
 * bail prend le barème en vigueur à sa date d'entrée.
 */
function BaremesLocation({ baremes, disponible, onEnregistre }: { baremes: Bareme[]; disponible: boolean; onEnregistre: () => void }) {
  const [f, setF] = useState({ depuis: '', tresTendue: '', tendue: '', autre: '', etatDesLieux: '', source: '' });
  const [message, setMessage] = useState<string | null>(null);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const enVigueur = baremeEnVigueur(baremes, aujourdhui);
  const t = (x: string): string => tarifAffiche(lireDecimal(x) ?? ZERO);
  const resume = (b: Bareme): string => `très tendue ${t(b.tresTendue)} · tendue ${t(b.tendue)} · autres ${t(b.autre)} · état des lieux ${t(b.etatDesLieux)}`;
  const envoyer = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/location/honoraires', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bareme', ...f }) });
      const d = await res.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat === 'ok') { setMessage('Barème ajouté.'); setF({ depuis: '', tresTendue: '', tendue: '', autre: '', etatDesLieux: '', source: '' }); onEnregistre(); return; }
      setMessage(d.etat === 'sans_schema' ? 'Mise à jour de la base à appliquer (migration 392).' : d.motif ?? d.message ?? 'Enregistrement refusé.');
    } catch {
      setMessage('Enregistrement impossible : le serveur n’a pas répondu.');
    }
  };
  const champ = (k: keyof typeof f, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{mot}<input className="hon-champ" value={f[k]} onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v })); }} {...props} /></label>
  );
  return (
    <details className="hon-reglages" data-baremes-location>
      <summary>Barème des honoraires de location (propriétaire, € TTC/m²)</summary>
      {!disponible ? <p className="hon-note">Mise à jour de la base à appliquer (migration 392).</p> : (
        <>
          <p className="hon-note">En vigueur aujourd’hui : <strong>{enVigueur === null ? 'aucun' : `${resume(enVigueur)} (depuis le ${enVigueur.depuis.split('-').reverse().join('/')})`}</strong>.</p>
          <ul className="hon-note" style={{ margin: 0 }}>
            {baremes.map((b) => <li key={b.id}>Depuis le {b.depuis.split('-').reverse().join('/')} : {resume(b)} — {b.source}</li>)}
          </ul>
          <form className="hon-reglages-ligne" onSubmit={(e) => { e.preventDefault(); void envoyer(); }}>
            {champ('depuis', 'À compter du', { type: 'date' })}
            {champ('tresTendue', 'Zone très tendue', { inputMode: 'decimal', placeholder: 'ex. 12,10' })}
            {champ('tendue', 'Zone tendue', { inputMode: 'decimal', placeholder: 'ex. 10,09' })}
            {champ('autre', 'Autres zones', { inputMode: 'decimal', placeholder: 'ex. 8,07' })}
            {champ('etatDesLieux', 'État des lieux', { inputMode: 'decimal', placeholder: 'ex. 3,03' })}
            {champ('source', 'Source (arrêté, décret…)')}
            <button type="submit" className="svv-btn svv-btn-outline gst-btn">Ajouter</button>
          </form>
        </>
      )}
      {message !== null && <p className="hon-note" role="status">{message}</p>}
    </details>
  );
}

const CSS_HONORAIRES = `
.hon{display:flex;flex-direction:column;gap:14px}
.hon-retour{margin:0}
.hon-theorique{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:.92rem}
.hon-barre{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.hon-seg{display:inline-flex;border:1px solid var(--color-svv-line);border-radius:10px;overflow:hidden}
.hon-seg button{border:0;background:transparent;padding:0 14px;min-height:44px;font:inherit;font-weight:600;cursor:pointer;color:inherit}
.hon-seg button+button{border-left:1px solid var(--color-svv-line)}
.hon-seg button.on{background:var(--color-svv-red);color:var(--color-svv-surface)}
.hon-champ{min-height:44px;border:1px solid var(--color-svv-line);border-radius:9px;padding:0 10px;font:inherit;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.hon-annee{width:7rem}
.hon-barre .svv-btn{width:auto}
.hon-totaux{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.hon-total{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.hon-total--manque{background:var(--color-svv-amber-soft);border-color:var(--color-svv-amber);color:var(--color-svv-amber)}
.hon-total--manque .hon-total-mot,.hon-total--manque .hon-total-sous{color:var(--color-svv-amber)}
.hon-total-mot{font-size:.82rem;color:var(--color-svv-muted)}
.hon-total-valeur{font-size:1.45rem;font-weight:800}
.hon-total-sous{font-size:.85rem;color:var(--color-svv-muted)}
.hon-table{width:100%;border-collapse:collapse;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:14px;overflow:hidden;font-size:.93rem;color:var(--color-svv-ink)}
.hon-table th,.hon-table td{padding:9px 10px;border-bottom:1px solid var(--color-svv-line);text-align:left;vertical-align:top}
.hon-table .num{text-align:right;font-variant-numeric:tabular-nums}
.hon-table tfoot th{background:var(--color-svv-field)}
.hon-ligne-active td{background:var(--color-svv-red-soft)}
.hon-vide{color:var(--color-svv-muted);font-style:italic}
.hon-num{color:var(--color-svv-muted);font-size:.85em}
.hon-a-saisir{color:var(--color-svv-amber);font-style:italic;font-weight:600}
.hon-indiv{margin-left:8px;font-size:.75rem;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-muted)}
.hon-note{margin:0;font-size:.85rem;color:var(--color-svv-muted)}
.hon-reglages{border:1px solid var(--color-svv-line);border-radius:14px;padding:10px 14px;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.hon-reglages summary{cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center}
.hon-reglages-ligne{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:8px 0}
.hon-reglages-ligne label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--color-svv-muted)}
@media (max-width:640px){
  .hon-table,.hon-table tbody,.hon-table tr,.hon-table td,.hon-table tfoot,.hon-table th{display:block;width:100%}
  .hon-table thead{display:none}
  .hon-table tr{border-bottom:1px solid var(--color-svv-line);padding:6px 0}
  .hon-table td{border:0;padding:3px 10px;text-align:left}
  .hon-table td.num{text-align:left}
  .hon-table td[data-mot]::before{content:attr(data-mot) " : ";color:var(--color-svv-muted);font-size:.85em}
  .hon-table tfoot tr{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;padding:8px 10px;background:var(--color-svv-field)}
  .hon-table tfoot th{width:auto;padding:0;border:0}
}
`;
