'use client';

import { useEffect, useState } from 'react';
import { CarteDepot, type DepotAffiche } from './DemandesRendu';

/**
 * File « À déposer à la main » de l'onglet Demandes (S16) : les demandes en canal 'formulaire' (téléservice). Deux clics
 * par commune — « Copier le texte » puis « Marquer comme déposée » (→ statut 'envoyee'). Retour DANS la carte, retrait
 * optimiste. Mobile-first (cartes). AUCUN envoi automatique.
 */
export function BlocDepot() {
  const [demandes, setDemandes] = useState<DepotAffiche[]>([]);
  const [msg, setMsg] = useState<Record<number, string>>({});  // retour (ok/échec) par carte
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/depot', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { demandes: DepotAffiche[] }; setDemandes(d.demandes ?? []); }
      } catch { /* file de dépôt indisponible : le reste de l'écran reste utilisable */ }
    })();
    return () => { annule = true; };
  }, [version]);

  const poser = (id: number, texte: string): void => setMsg((s) => ({ ...s, [id]: texte }));

  async function copier(d: DepotAffiche): Promise<void> {
    try {
      await navigator.clipboard.writeText(d.corps ?? '');
      poser(d.id, 'Texte copié.');
    } catch {
      poser(d.id, 'Copie impossible — sélectionnez le texte manuellement.');
    }
  }

  async function marquerDeposee(id: number): Promise<void> {
    poser(id, '');
    try {
      const res = await fetch('/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) {
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        setVersion((v) => v + 1);
      } else {
        const e = (await res.json().catch(() => ({}))) as { erreur?: string };
        poser(id, e.erreur ? `Refusé : ${e.erreur}.` : 'Action refusée.');
      }
    } catch { poser(id, 'Action impossible.'); }
  }

  if (demandes.length === 0) return null;

  return (
    <section role="group" aria-label="Demandes à déposer à la main (téléservice)" className="flex flex-col gap-2">
      <div style={{ fontSize: 13 }}>
        <strong>{demandes.length} demande(s) à déposer à la main</strong> — ces communes n’acceptent que leur téléservice. Ouvrez le formulaire, collez le texte, puis marquez la demande déposée.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '.6rem' }}>
        {demandes.map((d) => (
          <CarteDepot key={d.id} d={d}>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void copier(d)}>Copier le texte</button>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }} onClick={() => void marquerDeposee(d.id)}>Marquer comme déposée</button>
            </div>
            {msg[d.id] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{msg[d.id]}</span>}
          </CarteDepot>
        ))}
      </div>
    </section>
  );
}
