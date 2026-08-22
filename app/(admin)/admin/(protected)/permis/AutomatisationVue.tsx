'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { messageDemandeManuelle, type RunVeille } from '../../../../lib/sitadel/planification';
import type { BornesParColonne, ErreurReglage } from '../../../../lib/sitadel/reglagesVeille';
import { BandeauEtat, AvertissementOrdonnanceur, AlerteEchecs, AlerteMillesimeFige, LigneHistorique } from './AutomatisationRendu';
import { ClassificationDossiers } from './ClassificationDossiers';

/**
 * Onglet « Automatisation » de la tuile Permis (chantier S11b). Pilote la veille automatique SANS code : interrupteur,
 * intervalle, rétention, et bouton « Lancer maintenant » (qui pose un drapeau consommé par l'ordonnanceur — le serveur
 * ne lance jamais l'ingestion lui-même). Mobile-first. AUCUN ENVOI.
 */
interface EtatAuto {
  autoActive: boolean;
  autoIntervalleHeures: number;
  csvRetentionJours: number;
  alerteMillesimeFigeJours: number;
  alerteEchecsConsecutifs: number;
  recomptageHeureLocale: number;
  bornes: BornesParColonne;
  millesimeBase: string | null;
  dernierRun: RunVeille | null;
  demandeEnAttente: boolean;
  prochainPassage: { dateIso: string | null; phrase: string };
  ordonnanceurSuspect: { suspect: boolean; message: string };
  alarmes: { echecs: { alerte: boolean; phrase: string }; millesimeFige: { alerte: boolean; phrase: string } };
  historique: RunVeille[];
  maintenant: string;
}
type ReponsePatch = ({ ok: true; demandeDejaEnAttente: boolean } & EtatAuto) | { erreurs: ErreurReglage[] };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };

export function AutomatisationVue() {
  const [data, setData] = useState<EtatAuto | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [intervalle, setIntervalle] = useState('');
  const [retention, setRetention] = useState('');
  const [figeJours, setFigeJours] = useState('');
  const [echecsSeuil, setEchecsSeuil] = useState('');
  const [recompteHeure, setRecompteHeure] = useState('');
  const [msg, setMsg] = useState('');
  const [erreur, setErreur] = useState('');

  function hydrater(e: EtatAuto) {
    setData(e);
    setIntervalle(String(e.autoIntervalleHeures));
    setRetention(String(e.csvRetentionJours));
    setFigeJours(String(e.alerteMillesimeFigeJours));
    setEchecsSeuil(String(e.alerteEchecsConsecutifs));
    setRecompteHeure(String(e.recomptageHeureLocale));
  }

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/automatisation', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        hydrater((await res.json()) as EtatAuto);
        setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, []);

  async function patch(corps: Record<string, unknown>): Promise<ReponsePatch | null> {
    setMsg(''); setErreur('');
    try {
      const res = await fetch('/api/admin/permis/automatisation', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const rep = (await res.json()) as ReponsePatch;
      if (res.ok && 'ok' in rep) { hydrater(rep); return rep; }
      setErreur('erreurs' in rep ? rep.erreurs.map((e) => e.message).join(' ; ') : 'écriture refusée');
      return null;
    } catch { setErreur('réseau indisponible'); return null; }
  }

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={styleErreur}>Automatisation indisponible.</p>;

  const bInt = data.bornes.auto_intervalle_heures;
  const bRet = data.bornes.csv_retention_jours;
  const bFige = data.bornes.alerte_millesime_fige_jours;
  const bEchecs = data.bornes.alerte_echecs_consecutifs;
  const bRecompte = data.bornes.recomptage_heure_locale;

  return (
    <div className="flex flex-col gap-4">
      {/* S13 — dire d'emblée ce que cet écran automatise (mise à jour des dossiers depuis Sitadel), pas les demandes. */}
      <p style={styleAide}>Cette automatisation met à jour les dossiers de permis en récupérant régulièrement le dernier millésime Sitadel. Elle ne prépare ni n’envoie aucune demande aux mairies — c’est le groupe « Demandes aux mairies » qui s’en charge.</p>
      {/* Alarmes par ORDRE DE GRAVITÉ : échecs (rouge) → ordonnanceur (rouge) → millésime figé (orange). */}
      <AlerteEchecs alerte={data.alarmes.echecs.alerte} phrase={data.alarmes.echecs.phrase} />
      <AvertissementOrdonnanceur suspect={data.ordonnanceurSuspect.suspect} message={data.ordonnanceurSuspect.message} />
      <AlerteMillesimeFige alerte={data.alarmes.millesimeFige.alerte} phrase={data.alarmes.millesimeFige.phrase} />
      <BandeauEtat autoActive={data.autoActive} dernierRun={data.dernierRun} prochainPhrase={data.prochainPassage.phrase} millesimeBase={data.millesimeBase} />

      {/* Interrupteur + « Lancer maintenant » */}
      <section className="svv-card flex flex-col gap-3">
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
          <input type="checkbox" checked={data.autoActive} onChange={(e) => void patch({ autoActive: e.target.checked })} />
          Automatisation active
        </label>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .9rem' }}
            disabled={data.demandeEnAttente}
            onClick={async () => { const r = await patch({ lancerMaintenant: true }); if (r && 'ok' in r) setMsg(messageDemandeManuelle(r.demandeDejaEnAttente)); }}>
            {data.demandeEnAttente ? 'Demande déjà en attente' : 'Lancer maintenant'}
          </button>
          <span style={styleAide}>Le travail ne démarre pas à l’instant : la demande est prise au prochain passage de l’ordonnanceur (un quart d’heure au plus).</span>
        </div>
        {msg && <p role="status" style={{ fontSize: 13, color: 'var(--color-svv-green-ink)' }}>{msg}</p>}
      </section>

      {/* Réglages intervalle / rétention */}
      <section className="svv-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.75rem' }}>
        <label className="flex flex-col gap-1">
          <span style={styleLabel}>Intervalle entre deux passages (heures)</span>
          <input type="number" value={intervalle} min={bInt?.min} max={bInt?.max} step={1} onChange={(e) => setIntervalle(e.target.value)} style={styleInput} />
          <span style={styleAide}>{bInt ? `Plage autorisée : ${bInt.min} – ${bInt.max} h.` : 'Plage indisponible.'}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void patch({ autoIntervalleHeures: Number(intervalle) })}>Enregistrer</button>
        </label>
        <label className="flex flex-col gap-1">
          <span style={styleLabel}>Rétention des CSV antérieurs (jours)</span>
          <input type="number" value={retention} min={bRet?.min} max={bRet?.max} step={1} onChange={(e) => setRetention(e.target.value)} style={styleInput} />
          <span style={styleAide}>{bRet ? `Plage autorisée : ${bRet.min} – ${bRet.max} j. Le millésime en base n’est jamais supprimé.` : 'Plage indisponible.'}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void patch({ csvRetentionJours: Number(retention) })}>Enregistrer</button>
        </label>
        <label className="flex flex-col gap-1">
          <span style={styleLabel}>Alarme « millésime figé » (jours)</span>
          <input type="number" value={figeJours} min={bFige?.min} max={bFige?.max} step={1} onChange={(e) => setFigeJours(e.target.value)} style={styleInput} />
          <span style={styleAide}>{bFige ? `Plage autorisée : ${bFige.min} – ${bFige.max} j. Au-delà, l’écran invite à vérifier la source (information, pas panne).` : 'Plage indisponible.'}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void patch({ alerteMillesimeFigeJours: Number(figeJours) })}>Enregistrer</button>
        </label>
        <label className="flex flex-col gap-1">
          <span style={styleLabel}>Alarme « échecs consécutifs »</span>
          <input type="number" value={echecsSeuil} min={bEchecs?.min} max={bEchecs?.max} step={1} onChange={(e) => setEchecsSeuil(e.target.value)} style={styleInput} />
          <span style={styleAide}>{bEchecs ? `Plage autorisée : ${bEchecs.min} – ${bEchecs.max}. Au-delà, alarme rouge (changement d’identifiant/endpoint DiDo probable).` : 'Plage indisponible.'}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void patch({ alerteEchecsConsecutifs: Number(echecsSeuil) })}>Enregistrer</button>
        </label>
        {/* PASTILLES — heure du recomptage QUOTIDIEN des compteurs « actions en attente ». Aide SANS AMBIGUÏTÉ : ne lit pas la boîte mail. */}
        <label className="flex flex-col gap-1">
          <span style={styleLabel}>Heure du recomptage des compteurs (0–23)</span>
          <input type="number" value={recompteHeure} min={bRecompte?.min ?? 0} max={bRecompte?.max ?? 23} step={1} onChange={(e) => setRecompteHeure(e.target.value)} style={styleInput} />
          <span style={styleAide}>Rafraîchit une fois par jour, à cette heure, les pastilles « actions en attente » des onglets — <strong>uniquement si l’écran est resté ouvert</strong>. Cela <strong>ne relève AUCUN message</strong> : la boîte mail n’est pas consultée. Sinon, ouvrir un onglet recompte déjà. {bRecompte ? `Plage : ${bRecompte.min} – ${bRecompte.max} h.` : 'Réglable une fois la migration appliquée.'}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void patch({ recomptageHeureLocale: Number(recompteHeure) })}>Enregistrer</button>
        </label>
      </section>

      {erreur && <p role="alert" style={styleErreur}>{erreur}</p>}

      {/* S33 — « Classification et affichage des dossiers » : ces 8 réglages classent/ordonnent la LISTE des dossiers ;
          ils relèvent donc de ce groupe (« Mise à jour des dossiers »), pas de l'onglet Réglages (« Demandes aux mairies »)
          où ils vivaient. Propriétaire inchangé : la route /reglages (mêmes invariants). */}
      <ClassificationDossiers />

      {/* Historique des 20 derniers passages */}
      <section className="flex flex-col gap-2">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>20 derniers passages</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                {['Date', 'Déclencheur', 'Statut', 'Millésime', 'Nouveaux', 'Durée', 'Message'].map((h) => <th key={h} style={{ padding: '.35rem .5rem' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.historique.map((run, i) => <LigneHistorique key={`${run.demarreLe}-${i}`} run={run} />)}
              {data.historique.length === 0 && <tr><td colSpan={7} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucun passage enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
