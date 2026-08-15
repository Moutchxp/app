'use client';

import { useCallback, useEffect, useState } from 'react';
// ⚠️ Bundle client (piège du 13/08) : de `caracteristiquesRepo` / `journalLecture` (modules serveur, pg) on n'importe QUE des `type`, jamais une valeur.
import type { CorpsBatiment, GlobalPermis, OrigineValeur, ValeursCorps } from '../../../../lib/permis/caracteristiquesRepo';
import type { JournalRetenuParCorps } from '../../../../lib/permis/journalLecture';
import type { BornesParColonne } from '../../../../lib/sitadel/reglagesVeille';
import {
  MESURES, construireCorps, valeurVersInput,
  type EditionCorps, type EditionGlobal, type ErreursCorps, type FaitsPermis,
} from './caracteristiquesForm';
import { FaitsPermisBloc, EditeurParking, ChampMesureEditeur, PastilleOrigineValeur, MESSAGE_AUCUN_CORPS } from './CaracteristiquesRendu';

interface EtatCharge { faits: FaitsPermis; global: GlobalPermis | null; corps: CorpsBatiment[]; bornes: BornesParColonne; journal: JournalRetenuParCorps }

const editionDepuisCorps = (c: CorpsBatiment): EditionCorps => ({
  repere: c.repere ?? '',
  nbEtages: valeurVersInput(c.nbEtages), nbNiveauxSousSol: valeurVersInput(c.nbNiveauxSousSol),
  altitudeDernierPlancherNgf: valeurVersInput(c.altitudeDernierPlancherNgf), altitudeSommetNgf: valeurVersInput(c.altitudeSommetNgf),
  hauteurRelativeM: valeurVersInput(c.hauteurRelativeM), altitudeTerrainNaturelNgf: valeurVersInput(c.altitudeTerrainNaturelNgf),
});
const origineCorps = (c: CorpsBatiment, cle: string): OrigineValeur | null => (c as unknown as Record<string, OrigineValeur | null>)[`${cle}Origine`] ?? null;
const parkingVersEdition = (g: GlobalPermis | null): '' | 'oui' | 'non' => (g?.parking === true ? 'oui' : g?.parking === false ? 'non' : '');

const styleLabel = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' } as const;
const styleAide = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 } as const;
const styleInput = { width: '100%', boxSizing: 'border-box' as const, padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };

/**
 * N3-C — bloc « Caractéristiques du bâtiment » du panneau déplié d'un permis (Archives). Charge l'état (GET), édite le global
 * (parking tri-état + commentaire) et les CORPS (repère + mesures), ajoute/supprime un corps. Toute écriture est en mode 'saisie'
 * (le serveur ne pose jamais 'extraite' depuis ici). Bornes LUES de la base, validation AVANT l'appel, message au niveau du champ.
 */
export function CaracteristiquesBloc({ dossierId }: { dossierId: number }) {
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [data, setData] = useState<EtatCharge | null>(null);
  const [edGlobal, setEdGlobal] = useState<EditionGlobal>({ parking: '', commentaire: '' });
  const [edCorps, setEdCorps] = useState<Record<number, EditionCorps>>({});
  const [erreursCorps, setErreursCorps] = useState<Record<number, ErreursCorps>>({});
  const [message, setMessage] = useState<string>('');
  const [enCours, setEnCours] = useState(false);

  const appliquer = useCallback((d: EtatCharge) => {
    setData(d);
    setEdGlobal({ parking: parkingVersEdition(d.global), commentaire: d.global?.commentaire ?? '' });
    setEdCorps(Object.fromEntries(d.corps.map((c) => [c.id, editionDepuisCorps(c)])));
    setErreursCorps({});
    setEtat('ok');
  }, []);

  // Rechargement (appelé par les handlers APRÈS une écriture) : réaligne valeurs + origines depuis la base.
  const rafraichir = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/permis/caracteristiques?dossierId=${dossierId}`, { cache: 'no-store' });
      if (!res.ok) { setEtat('erreur'); return; }
      appliquer((await res.json()) as EtatCharge);
    } catch { setEtat('erreur'); }
  }, [dossierId, appliquer]);

  // Chargement INITIAL (motif ArchivesVue : IIFE async + garde d'annulation ; setState hors chemin synchrone de l'effet).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/permis/caracteristiques?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        appliquer((await res.json()) as EtatCharge);
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId, appliquer]);

  const poster = useCallback(async (corps: Record<string, unknown>): Promise<{ ok: boolean; erreur?: string }> => {
    setMessage('');
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const rep = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || rep.erreur) return { ok: false, erreur: rep.erreur ?? 'écriture refusée' };
      return { ok: true };
    } catch { return { ok: false, erreur: 'le serveur n’a pas répondu' }; }
  }, []);

  const enregistrerGlobal = useCallback(async () => {
    setEnCours(true);
    // On envoie l'édition BRUTE (parking tri-état + commentaire) ; la route la repasse par `construireGlobal` (’’ → null).
    const r = await poster({ action: 'global', dossierId, parking: edGlobal.parking, commentaire: edGlobal.commentaire });
    if (r.ok) { await rafraichir(); setMessage('Global enregistré.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, dossierId, edGlobal, rafraichir]);

  const enregistrerCorps = useCallback(async (corpsId: number) => {
    const ed = edCorps[corpsId];
    if (!ed) return;
    const { valeurs, erreurs, valide } = construireCorps(ed, data?.bornes ?? {});
    setErreursCorps((m) => ({ ...m, [corpsId]: erreurs }));
    if (!valide) { setMessage('Corrigez les champs signalés avant d’enregistrer.'); return; }
    setEnCours(true);
    const r = await poster({ action: 'corps', corpsId, repere: ed.repere, valeurs: valeurs as ValeursCorps });
    if (r.ok) { await rafraichir(); setMessage('Corps enregistré.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [edCorps, data, poster, rafraichir]);

  const ajouterCorps = useCallback(async () => {
    setEnCours(true);
    const r = await poster({ action: 'creer', dossierId, repere: '' });
    if (r.ok) { await rafraichir(); setMessage('Corps ajouté.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, dossierId, rafraichir]);

  const supprimer = useCallback(async (corpsId: number, repere: string | null) => {
    if (!window.confirm(`Supprimer le corps « ${repere ?? 'sans nom'} » et toutes ses valeurs ? Cette action est définitive.`)) return;
    setEnCours(true);
    const r = await poster({ action: 'supprimer', corpsId });
    if (r.ok) { await rafraichir(); setMessage('Corps supprimé.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, rafraichir]);

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement des caractéristiques…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>Caractéristiques indisponibles.</p>;

  const majChamp = (corpsId: number, cle: keyof EditionCorps, v: string) => setEdCorps((m) => ({ ...m, [corpsId]: { ...m[corpsId], [cle]: v } }));

  return (
    <div className="flex flex-col gap-3" style={{ marginTop: '.6rem' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-svv-ink)' }}>Caractéristiques du bâtiment</h3>
      <FaitsPermisBloc faits={data.faits} />

      {/* ── Global : parking (tri-état) + commentaire ── */}
      <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.6rem' }}>
          <EditeurParking valeur={edGlobal.parking} origine={data.global?.parkingOrigine ?? null} onValeur={(v) => setEdGlobal((g) => ({ ...g, parking: v }))} />
          <label className="flex flex-col gap-1" style={{ minWidth: 0 }}>
            <span style={styleLabel}>Commentaire</span>
            <textarea value={edGlobal.commentaire} rows={2} onChange={(e) => setEdGlobal((g) => ({ ...g, commentaire: e.target.value }))} style={styleInput} aria-label="Commentaire" />
          </label>
        </div>
        <div>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} disabled={enCours} onClick={() => void enregistrerGlobal()}>Enregistrer le global</button>
        </div>
      </div>

      {/* ── Corps de bâtiment ── */}
      {data.corps.length === 0 && <p style={styleAide}>{MESSAGE_AUCUN_CORPS}</p>}
      {data.corps.map((c) => {
        const ed = edCorps[c.id];
        const err = erreursCorps[c.id] ?? {};
        if (!ed) return null;
        return (
          <div key={c.id} className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="flex flex-col gap-1" style={{ minWidth: 0, flex: '1 1 160px' }}>
                <span style={styleLabel}>Repère du corps</span>
                <input value={ed.repere} placeholder="A1, 2D1…" onChange={(e) => majChamp(c.id, 'repere', e.target.value)} style={styleInput} aria-label="Repère du corps" />
              </label>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.2rem .5rem', color: 'var(--color-svv-red)' }} disabled={enCours} onClick={() => void supprimer(c.id, c.repere)}>supprimer ce corps</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.6rem' }}>
              {MESURES.map((m) => (
                <ChampMesureEditeur key={m.cle} mesure={m} bornes={data.bornes[m.colonne]} valeur={ed[m.cle]} origine={origineCorps(c, m.cle)}
                  erreur={err[m.cle]} journal={data.journal[c.id]?.[m.colonne]} onValeur={(v) => majChamp(c.id, m.cle, v)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} disabled={enCours} onClick={() => void enregistrerCorps(c.id)}>Enregistrer ce corps</button>
              <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><span style={styleAide}>saisie ici :</span><PastilleOrigineValeur origine="saisie" /></span>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} disabled={enCours} onClick={() => void ajouterCorps()}>+ ajouter un corps de bâtiment</button>
        {message && <span role="status" style={{ fontSize: 12 }}>{message}</span>}
      </div>
    </div>
  );
}
