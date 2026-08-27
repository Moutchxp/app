'use client';

import { useState } from 'react';
import { PROCESS_META, PROCESS_ORDRE, type Process } from '../../../../lib/sitadel/process';

/**
 * D5 — PANNEAU « Basculer une commune de rail », sous le commutateur (onglet Demandes). Réutilise les chemins EXISTANTS : la
 * bascule = annuler les demandes NON ENVOYÉES de la commune (chemin D1 `/demandes/annuler-lot`, aucun DELETE) PUIS changer
 * `mairie_contact.canal` (`PATCH /contact`, `ecrireContact`, journalisé avec MOTIF). Un aperçu chiffré + une confirmation EN DEUX
 * TEMPS ; jamais de bascule silencieuse. Coordonnée cible manquante → REFUS avec la raison (renvoi à la fiche contact). Mobile-first,
 * glyphes unicode aria-hidden, la couleur ne porte jamais l'info seule, pas de dark mode.
 */
interface Apercu {
  codeInsee: string; communeNom: string | null; canalActuel: string | null; cible: Process;
  ids: number[]; nbDemandes: number; nbPermis: number; raisonRefus: string | null;
  coordonnees: { email: string; urlFormulaire: string; adressePostale: string };
}

export function BasculeRail({ onBascule }: { onBascule: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [commune, setCommune] = useState('');
  const [cible, setCible] = useState<Process>('formulaire');
  const [apercu, setApercu] = useState<Apercu | null>(null); // non-null ⇒ étape « confirmer »
  const [motif, setMotif] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const reset = () => { setApercu(null); setMotif(''); setErreur(''); };

  async function chargerApercu(): Promise<void> {
    const q = commune.trim();
    if (q === '') { setErreur('Indiquez une commune (nom ou code INSEE).'); return; }
    setChargement(true); setErreur(''); setMessage('');
    try {
      const res = await fetch(`/api/admin/permis/basculer-rail?q=${encodeURIComponent(q)}&cible=${cible}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setErreur(data?.erreur ?? 'Aperçu indisponible.'); return; }
      const a = data as Apercu;
      if (a.raisonRefus) { setErreur(`Bascule impossible : ${a.raisonRefus}.`); setApercu(null); return; }
      setApercu(a); // → étape confirmation
    } catch { setErreur('Aperçu indisponible.'); }
    finally { setChargement(false); }
  }

  async function executer(): Promise<void> {
    if (!apercu) return;
    setChargement(true); setErreur('');
    try {
      // 1) Annuler les demandes NON ENVOYÉES (chemin D1 ; autoriserPrete car la commune bascule → les prêtes aussi sont sur le mauvais rail).
      if (apercu.ids.length > 0) {
        const r = await fetch('/api/admin/permis/demandes/annuler-lot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: apercu.ids, autoriserPrete: true }) });
        if (!r.ok) { setErreur('Annulation des demandes préparées impossible — rail inchangé.'); return; }
      }
      // 2) Changer le canal (coordonnées existantes préservées + motif libre journalisé). validerCanal a déjà été vérifié (aperçu).
      const p = await fetch('/api/admin/permis/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeInsee: apercu.codeInsee, canal: apercu.cible, email: apercu.coordonnees.email, urlFormulaire: apercu.coordonnees.urlFormulaire, adressePostale: apercu.coordonnees.adressePostale, motif: motif.trim() }),
      });
      if (!p.ok) {
        const d = await p.json().catch(() => ({}));
        setErreur(`${apercu.nbDemandes} demande(s) annulée(s), mais le changement de rail a échoué (${d?.erreur ?? 'erreur'}) — réessayez.`);
        return;
      }
      setMessage(`${apercu.communeNom ?? apercu.codeInsee} basculée vers ${PROCESS_META[apercu.cible].court}. ${apercu.nbDemandes} demande(s) annulée(s), ${apercu.nbPermis} permis rendu(s) au réservoir.`);
      setCommune(''); reset(); onBascule();
    } catch { setErreur('Bascule impossible.'); }
    finally { setChargement(false); }
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}
        className="svv-btn svv-btn-outline" style={{ minHeight: 34, padding: '.25rem .6rem', fontSize: '.8rem', alignSelf: 'flex-start' }}>
        <span aria-hidden="true">{ouvert ? '▾ ' : '▸ '}</span>Basculer une commune de rail
      </button>

      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', fontSize: 13 }}>
          {!apercu ? (
            <form onSubmit={(e) => { e.preventDefault(); void chargerApercu(); }} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="flex flex-col gap-1" style={{ flex: '1 1 10rem' }}>Commune (nom ou code INSEE)
                <input value={commune} onChange={(e) => setCommune(e.target.value)} placeholder="ex. Paris ou 75056"
                  style={{ minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }} />
              </label>
              <label className="flex flex-col gap-1">Rail cible
                <select value={cible} onChange={(e) => setCible(e.target.value as Process)} style={{ minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }}>
                  {PROCESS_ORDRE.map((p) => <option key={p} value={p}>{PROCESS_META[p].court}</option>)}
                </select>
              </label>
              <button type="submit" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.4rem .8rem' }} disabled={chargement}>Poursuivre</button>
            </form>
          ) : (
            // ── Étape 2 : conséquence chiffrée + motif + confirmation ──
            <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              <strong>Basculer {apercu.communeNom ?? apercu.codeInsee} vers {PROCESS_META[apercu.cible].court} ?</strong>
              <span style={{ color: 'var(--color-svv-red)' }}>
                <strong>{apercu.nbDemandes} demande(s) préparée(s) seront annulée(s)</strong>, {apercu.nbPermis} permis reviendront au réservoir (à repréparer sur le bon rail). Les demandes déjà envoyées ne bougent pas.
              </span>
              <label className="flex flex-col gap-1">Motif (pour relire dans six mois pourquoi ce changement)
                <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. la mairie est passée au téléservice"
                  style={{ minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }} />
              </label>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem', background: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} disabled={chargement} onClick={() => void executer()}>
                  Confirmer la bascule{apercu.nbDemandes > 0 ? ` (annuler ${apercu.nbDemandes})` : ''}
                </button>
                <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} disabled={chargement} onClick={reset}>Revenir</button>
              </div>
            </div>
          )}

          {chargement && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }} aria-live="polite">…</p>}
          {erreur && <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>{erreur}</p>}
          {message && <p role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)', fontWeight: 600, margin: 0 }}>{message}</p>}
        </div>
      )}
    </div>
  );
}
