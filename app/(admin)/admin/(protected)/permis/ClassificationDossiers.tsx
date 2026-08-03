'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { PARAMS_DOSSIERS, type BornesParColonne } from '../../../../lib/sitadel/reglagesVeille';
import { CarteReglageEntier, TITRE_PARAMS_DOSSIERS, AIDE_PARAMS_DOSSIERS } from './ReglagesRendu';

/**
 * S33 — sous-bloc « Classification et affichage des dossiers » DÉPLACÉ dans l'onglet Automatisation (groupe « Mise à jour
 * des dossiers ») : ces 8 réglages (2 seuils « immeuble », 5 rangs de catégories, profondeur d'affichage) classent et
 * ordonnent la LISTE des dossiers, pas les demandes aux mairies. Le PROPRIÉTAIRE reste la route `/reglages` (validation
 * server-side, allowlist `PARAMS_VEILLE`, bornes tirées EN DIRECT des CHECK, refus = zéro écriture, écriture en
 * transaction) : on ne relocalise que le RENDU, tous les invariants de l'écran Réglages sont conservés. Mobile-first.
 */
const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };

interface PayloadReglages { veille: Record<string, unknown>; bornes: BornesParColonne }
type ReponsePatch = ({ ok: true } & PayloadReglages) | { erreurs: { colonne: string; message: string }[] };

export function ClassificationDossiers() {
  const [bornes, setBornes] = useState<BornesParColonne>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  function hydrater(p: PayloadReglages) {
    setBornes(p.bornes);
    // draft indexé par COLONNE, valeur lue de veille[cle] (même patron que ReglagesVue).
    setDraft(Object.fromEntries(PARAMS_DOSSIERS.map((par) => [par.colonne, String(p.veille[par.cle] ?? '')])));
  }

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglages', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        hydrater((await res.json()) as PayloadReglages);
        setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, []);

  async function enregistrer(colonne: string) {
    setMsg((m) => ({ ...m, [colonne]: '' })); setErr((m) => ({ ...m, [colonne]: '' }));
    const brut = draft[colonne] ?? '';
    if (brut.trim() === '') { setErr((m) => ({ ...m, [colonne]: 'Valeur requise.' })); return; }
    try {
      const res = await fetch('/api/admin/permis/reglages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veille: { [colonne]: Number(brut) } }),
      });
      const rep = (await res.json()) as ReponsePatch;
      if (res.ok && 'ok' in rep) { hydrater(rep); setMsg((m) => ({ ...m, [colonne]: 'Enregistré.' })); return; }
      const erreurs = 'erreurs' in rep ? rep.erreurs : [{ colonne, message: 'écriture refusée' }];
      const e = erreurs.find((x) => x.colonne === colonne) ?? erreurs[0];
      setErr((m) => ({ ...m, [colonne]: e?.message ?? 'écriture refusée' }));
    } catch { setErr((m) => ({ ...m, [colonne]: 'réseau indisponible' })); }
  }

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement des réglages d’affichage…</p>;
  if (etat === 'erreur') return <p role="alert" style={styleErreur}>Réglages d’affichage indisponibles.</p>;

  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{TITRE_PARAMS_DOSSIERS}</h2>
      <p style={styleAide}>{AIDE_PARAMS_DOSSIERS}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.6rem' }}>
        {PARAMS_DOSSIERS.map((p) => (
          <CarteReglageEntier key={p.colonne} param={p} bornes={bornes[p.colonne]} valeur={draft[p.colonne] ?? ''}
            onValeur={(v) => setDraft((d) => ({ ...d, [p.colonne]: v }))} onEnregistrer={() => void enregistrer(p.colonne)}
            message={msg[p.colonne]} erreur={err[p.colonne]} />
        ))}
      </div>
    </section>
  );
}
