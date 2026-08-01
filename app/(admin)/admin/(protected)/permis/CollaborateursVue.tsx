'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { BandeauEligibilite, LigneCollaborateur, type CollaborateurLigne, type Eligibilite } from './CollaborateursRendu';

/**
 * Onglet « Collaborateurs » de la tuile Permis (chantier S8a) : liste avec compteurs, création validée (refus = rien
 * écrit), désactivation (jamais de suppression). Mobile-first. AUCUN ENVOI.
 */
interface EtatCollab { collaborateurs: CollaborateurLigne[]; eligibilite: Eligibilite }
type ReponseEcriture = ({ ok: true } & EtatCollab) | { erreurs: { colonne?: string; message: string }[] };

const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 };
const styleErreur: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };

export function CollaborateursVue() {
  const [data, setData] = useState<EtatCollab | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [form, setForm] = useState({ nom: '', prenom: '', fonction: '', email: '' });
  const [msg, setMsg] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/collaborateurs', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        setData((await res.json()) as EtatCollab);
        setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, []);

  async function creer() {
    setMsg(''); setErreurs([]);
    const res = await fetch('/api/admin/permis/collaborateurs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const rep = (await res.json()) as ReponseEcriture;
    if (res.ok && 'ok' in rep) { setData(rep); setForm({ nom: '', prenom: '', fonction: '', email: '' }); setMsg('Collaborateur ajouté.'); return; }
    setErreurs('erreurs' in rep ? rep.erreurs.map((e) => e.message) : ['écriture refusée']);
  }

  async function basculer(id: number, actif: boolean) {
    setMsg('');
    const res = await fetch('/api/admin/permis/collaborateurs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, actif }),
    });
    if (res.ok) { const rep = (await res.json()) as { ok: true } & EtatCollab; setData(rep); }
    else setMsg('Action impossible.');
  }

  if (etat === 'chargement') return <p style={{ fontSize: 13, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={styleErreur}>Collaborateurs indisponibles.</p>;

  return (
    <div className="flex flex-col gap-4">
      <BandeauEligibilite eligibilite={data.eligibilite} />

      {/* ── Création ── */}
      <section className="svv-card flex flex-col gap-2">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Ajouter un collaborateur</h2>
        <p style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Il signera EN SON NOM au nom de la société ; ses réponses arriveront sur son e-mail. L’identité de la société reste inchangée et figure toujours dans le courrier.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.6rem' }}>
          <input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} placeholder="Prénom" style={styleInput} aria-label="Prénom" />
          <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Nom" style={styleInput} aria-label="Nom" />
          <label className="flex flex-col gap-1" style={{ minWidth: 0 }}>
            <input value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} placeholder="Fonction (facultatif)" style={styleInput} aria-label="Fonction (facultatif)" />
            <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Facultatif : établit la qualité pour agir au nom de la société et renforce la demande si l’administration garde le silence.</span>
          </label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e-mail" style={styleInput} aria-label="e-mail" />
        </div>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .9rem' }} onClick={() => void creer()}>Ajouter</button>
          {msg && <span role="status" style={{ fontSize: 13, color: 'var(--color-svv-green-ink)' }}>{msg}</span>}
        </div>
        {erreurs.length > 0 && <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{erreurs.map((e) => <li key={e} role="alert" style={styleErreur}>{e}</li>)}</ul>}
      </section>

      {/* ── Liste ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
              {['Nom', 'Fonction', 'E-mail', 'Statut', 'Dossiers PC', 'Dossiers PD', 'En attente', ''].map((h) => <th key={h} style={{ padding: '.35rem .5rem', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.collaborateurs.map((c) => <LigneCollaborateur key={c.id} c={c} onToggle={(id, actif) => void basculer(id, actif)} />)}
            {data.collaborateurs.length === 0 && <tr><td colSpan={8} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucun collaborateur. Ajoutez-en un ci-dessus.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
