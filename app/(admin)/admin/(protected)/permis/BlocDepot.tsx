'use client';

import { useEffect, useState } from 'react';
import { CarteDepot, BoutonAnnulerDepot, type DepotAffiche } from './DemandesRendu';

/**
 * File « À déposer à la main » de l'onglet Demandes (S16) : les demandes en canal 'formulaire' (téléservice). Deux clics
 * par commune — « Copier le texte » puis « Marquer comme déposée » (→ statut 'envoyee'). Retour DANS la carte, retrait
 * optimiste. Mobile-first (cartes). AUCUN envoi automatique.
 */
export function BlocDepot() {
  const [demandes, setDemandes] = useState<DepotAffiche[]>([]);
  const [msg, setMsg] = useState<Record<number, string>>({});  // retour (ok/échec) par carte
  const [msgRef, setMsgRef] = useState<Record<number, string>>({}); // U2 — retour du bouton « Copier » du numéro de dossier (distinct du « Copier le texte »)
  const [refs, setRefs] = useState<Record<number, string>>({}); // P1 — référence mairie saisie par carte (facultative)
  const [annulerOuverts, setAnnulerOuverts] = useState<Set<number>>(new Set()); // U3 — confirmations « Annuler cette demande » ouvertes
  const [retourAnnul, setRetourAnnul] = useState('');                            // U3 — retour de niveau SECTION (la carte annulée disparaît → retour visible ailleurs)
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

  // U2 — copie du SEUL numéro de dossier instruit (référence formatée), retour distinct de « Copier le texte ».
  async function copierRef(id: number, valeur: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(valeur);
      setMsgRef((s) => ({ ...s, [id]: 'Numéro copié.' }));
    } catch {
      setMsgRef((s) => ({ ...s, [id]: 'Copie impossible — sélectionnez le numéro manuellement.' }));
    }
  }

  async function marquerDeposee(id: number): Promise<void> {
    poser(id, '');
    try {
      // P1 — référence FACULTATIVE : envoyée seulement si saisie (le dépôt reste possible sans).
      const reference = (refs[id] ?? '').trim();
      const res = await fetch('/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reference === '' ? { id } : { id, reference }) });
      if (res.ok) {
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        setVersion((v) => v + 1);
      } else {
        const e = (await res.json().catch(() => ({}))) as { erreur?: string };
        poser(id, e.erreur ? `Refusé : ${e.erreur}.` : 'Action refusée.');
      }
    } catch { poser(id, 'Action impossible.'); }
  }

  const fermerAnnul = (id: number): void => setAnnulerOuverts((s) => { const n = new Set(s); n.delete(id); return n; });

  // U3 — ANNULER : réutilise le chemin EXISTANT (PATCH …/demandes {statut:'annulee'} → changerStatutLot), AUCUN nouvel écrivain
  //   de demande.statut. Succès → la carte quitte la file (retrait optimiste) + retour de SECTION (la carte a disparu). Refus →
  //   motif DANS la carte (jamais un échec muet). listerADeposer ne renvoie que brouillon/prête → aucune demande déposée ici.
  async function annuler(id: number): Promise<void> {
    poser(id, '');
    try {
      const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], statut: 'annulee' }) });
      if (res.ok) {
        fermerAnnul(id);
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        setRetourAnnul('Demande annulée — ses dossiers redeviennent demandables (onglet « À demander »).');
        setVersion((v) => v + 1);
      } else {
        const e = (await res.json().catch(() => ({}))) as { erreur?: string };
        poser(id, e.erreur ? `Annulation refusée : ${e.erreur}.` : 'Annulation refusée.'); // carte conservée, motif visible
      }
    } catch { poser(id, 'Annulation impossible.'); }
  }

  if (demandes.length === 0) return null;

  return (
    <section role="group" aria-label="Demandes à déposer à la main (téléservice)" className="flex flex-col gap-2">
      <div style={{ fontSize: 13 }}>
        <strong>{demandes.length} demande(s) à déposer à la main</strong> — ces communes n’acceptent que leur téléservice. Ouvrez le formulaire, collez le texte, puis marquez la demande déposée.
      </div>
      {/* U3 — retour de l'annulation : la carte concernée a disparu de la file, le retour reste visible au niveau de la section. */}
      {retourAnnul && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{retourAnnul}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '.6rem' }}>
        {demandes.map((d) => (
          <CarteDepot key={d.id} d={d} onCopierRef={(valeur) => void copierRef(d.id, valeur)} retourRef={msgRef[d.id]}>
            {/* P1 — référence renvoyée par la mairie (accusé de réception). Facultative : ne bloque jamais le dépôt. */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
              Référence mairie (accusé de réception) — facultatif
              <input value={refs[d.id] ?? ''} onChange={(e) => setRefs((s) => ({ ...s, [d.id]: e.target.value }))}
                placeholder="ex. SLC260810440700"
                style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
            </label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void copier(d)}>Copier le texte</button>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }} onClick={() => void marquerDeposee(d.id)}>Marquer comme déposée</button>
            </div>
            {msg[d.id] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{msg[d.id]}</span>}
            {/* U3 — geste SECONDAIRE, nettement séparé de « Marquer comme déposée » (bordure supérieure + zone dédiée). */}
            <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem', marginTop: '.2rem' }}>
              <BoutonAnnulerDepot ouvert={annulerOuverts.has(d.id)}
                onOuvrir={() => setAnnulerOuverts((s) => new Set(s).add(d.id))}
                onConfirmer={() => void annuler(d.id)}
                onFermer={() => fermerAnnul(d.id)} />
            </div>
          </CarteDepot>
        ))}
      </div>
    </section>
  );
}
