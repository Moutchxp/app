'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Lot } from '../../../../lib/sitadel/demande';
import type { DemandeListe, DemandeDetail } from '../../../../lib/sitadel/demandeRepo';

/**
 * Gestion des demandes de communication (chantier S7). Montre les lots PROPOSÉS avant toute écriture, la liste des
 * demandes, et le détail (texte éditable + dossiers). Transition brouillon → prête bloquée si l'identité est
 * incomplète. ⚠️ AUCUNE action d'envoi (préparation et revue seulement — l'envoi est un chantier ultérieur).
 */
const STATUT_LIBELLE: Record<string, string> = { brouillon: 'brouillon', prete: 'prête', envoyee: 'envoyée', close: 'close', abandonnee: 'abandonnée' };

export function DemandesVue() {
  const [liste, setListe] = useState<{ demandes: DemandeListe[]; identiteManquante: string[] } | null>(null);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [corps, setCorps] = useState('');
  const [msg, setMsg] = useState('');
  const [version, setVersion] = useState(0);

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes', { cache: 'no-store' });
        if (!annule && res.ok) setListe((await res.json()) as { demandes: DemandeListe[]; identiteManquante: string[] });
      } catch { /* liste indisponible */ }
    })();
    return () => { annule = true; };
  }, [version]);

  async function preparer(): Promise<void> {
    setMsg('');
    const res = await fetch('/api/admin/permis/demandes/proposition', { cache: 'no-store' });
    if (res.ok) setLots(((await res.json()) as { lots: Lot[] }).lots);
    else setMsg('Proposition indisponible.');
  }
  async function creer(): Promise<void> {
    const res = await fetch('/api/admin/permis/demandes', { method: 'POST' });
    if (res.ok) {
      const r = (await res.json()) as { crees: string[]; ignores: number };
      setMsg(`${r.crees.length} demande(s) créée(s)${r.ignores ? `, ${r.ignores} lot(s) ignoré(s)` : ''}.`);
      setLots(null); rafraichir();
    } else setMsg('Création impossible.');
  }
  async function ouvrir(id: number): Promise<void> {
    setMsg('');
    const res = await fetch(`/api/admin/permis/demandes/${id}`, { cache: 'no-store' });
    if (res.ok) { const d = (await res.json()) as DemandeDetail; setDetail(d); setCorps(d.corps ?? ''); }
  }
  async function sauverCorps(): Promise<void> {
    if (!detail) return;
    const res = await fetch(`/api/admin/permis/demandes/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ corps }),
    });
    if (res.ok) { setDetail((await res.json()) as DemandeDetail); setMsg('Texte enregistré.'); }
  }
  async function transition(id: number, statut: 'prete' | 'abandonnee'): Promise<void> {
    const res = await fetch(`/api/admin/permis/demandes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }),
    });
    if (res.ok) { setDetail((await res.json()) as DemandeDetail); rafraichir(); setMsg(statut === 'prete' ? 'Demande marquée prête.' : 'Demande abandonnée.'); return; }
    if (res.status === 409) {
      const d = (await res.json()) as { champs?: string[] };
      setMsg(`Impossible de marquer « prête » : identité du demandeur incomplète — champ(s) manquant(s) : ${(d.champs ?? []).join(', ')}. Complétez la configuration du demandeur.`);
    } else setMsg('Transition impossible.');
  }

  return (
    <div className="flex flex-col gap-4">
      {liste && liste.identiteManquante.length > 0 && (
        <div className="svv-page-note" style={{ marginTop: 0, color: 'var(--color-svv-red)' }}>
          Identité du demandeur incomplète (champ(s) : {liste.identiteManquante.join(', ')}). Une demande ne pourra pas être marquée « prête » tant que ce n&rsquo;est pas complété.
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem' }} onClick={() => void preparer()}>Préparer les demandes</button>
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </div>

      {/* Lots PROPOSÉS (avant toute écriture) */}
      {lots && (
        <div className="svv-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <strong>{lots.length} lot(s) proposé(s)</strong>
            {lots.length > 0 && <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => void creer()}>Créer ces demandes</button>}
          </div>
          {lots.length === 0 ? (
            <p style={{ color: 'var(--color-svv-muted)', margin: 0 }}>Aucun lot à proposer (rien de nouveau, ou plafonds atteints).</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 13 }}>
              {lots.map((l, i) => (
                <li key={`${l.codeInsee}-${i}`}>{l.communeNom} ({l.codeInsee}) · {l.canal} · {l.dossiers.length} dossier(s)</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Liste des demandes */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
              {['Référence', 'Commune', 'Canal', 'Dossiers', 'Statut', ''].map((h) => <th key={h} style={{ padding: '.4rem .5rem' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(liste?.demandes ?? []).map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                <td style={{ padding: '.4rem .5rem', fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.reference}</td>
                <td style={{ padding: '.4rem .5rem' }}>{d.communeNom ?? d.codeInsee}</td>
                <td style={{ padding: '.4rem .5rem' }}>{d.canal}</td>
                <td style={{ padding: '.4rem .5rem' }}>{d.nbDossiers}</td>
                <td style={{ padding: '.4rem .5rem' }}>{STATUT_LIBELLE[d.statut] ?? d.statut}</td>
                <td style={{ padding: '.4rem .5rem' }}><button type="button" className="svv-link" onClick={() => void ouvrir(d.id)}>ouvrir</button></td>
              </tr>
            ))}
            {liste && liste.demandes.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucune demande. Cliquez « Préparer les demandes ».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Détail d'une demande */}
      {detail && (
        <div className="svv-card flex flex-col gap-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{detail.reference} — {detail.communeNom ?? detail.codeInsee} — {STATUT_LIBELLE[detail.statut] ?? detail.statut}</strong>
            <button type="button" className="svv-link" onClick={() => setDetail(null)}>fermer</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>
            Destinataire figé : {detail.canal}{detail.destEmail ? ` · ${detail.destEmail}` : ''}{detail.destAdressePostale ? ` · ${detail.destAdressePostale}` : ''}{detail.destUrlFormulaire ? ` · ${detail.destUrlFormulaire}` : ''}
          </div>
          <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={16}
            readOnly={detail.statut !== 'brouillon'}
            style={{ width: '100%', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
          <div>
            <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Dossiers ({detail.dossiers.length}) : </span>
            <span style={{ fontSize: 12 }}>{detail.dossiers.map((x) => x.numDau).join(', ')}</span>
          </div>
          {detail.statut === 'brouillon' && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void sauverCorps()}>Enregistrer le texte</button>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => void transition(detail.id, 'prete')}>Marquer prête</button>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void transition(detail.id, 'abandonnee')}>Abandonner</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
