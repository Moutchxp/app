'use client';

import { useEffect, useState } from 'react';
import { CarteDepot, BoutonAnnulerDepot, type DepotAffiche } from './DemandesRendu';

/**
 * File « À déposer à la main » de l'onglet Demandes (S16) : les demandes en canal 'formulaire' (téléservice). Trois gestes par
 * carte — « Copier le texte » / « Copier le numéro de permis » (dans la carte) puis « Marquer comme déposée » (→ 'envoyee').
 * Mobile-first (cartes). AUCUN envoi automatique.
 *
 * DEPOT-1 — RAFRAÎCHISSEMENT : la file se recharge sur `signalRafraichir` (incrémenté par le parent APRÈS une création dans
 * « À demander »), donc une demande téléservice fraîchement préparée apparaît SANS rechargement de page. Symétriquement, un dépôt
 * ou une annulation appelle `onChangement()` → le parent réincrémente le signal → les vues sœurs (compteurs, « À demander »)
 * se remettent à jour. Le retrait OPTIMISTE fait disparaître la carte immédiatement ; le rechargement confirme.
 */

// LOT A — trace BEST-EFFORT du clic « copier » (signal d'intention de dépôt téléservice). Détachée À DESSEIN : jamais
//   attendue, jamais rethrow → la copie clipboard d'Arno (déjà faite) n'est bloquée par rien, même si le serveur échoue.
function signalerDepot(demandeId: number, bouton: 'texte' | 'ref'): void {
  void fetch('/api/admin/permis/depot-presume', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, bouton }),
  }).catch(() => undefined);
}

export function BlocDepot({ signalRafraichir, onChangement }: { signalRafraichir: number; onChangement: () => void }) {
  const [demandes, setDemandes] = useState<DepotAffiche[]>([]);
  const [msg, setMsg] = useState<Record<number, string>>({});  // retour (ok/échec) par carte
  const [refs, setRefs] = useState<Record<number, string>>({}); // P1 — référence mairie saisie par carte (facultative)
  const [annulerOuverts, setAnnulerOuverts] = useState<Set<number>>(new Set()); // U3 — confirmations « Annuler cette demande » ouvertes
  const [retourAnnul, setRetourAnnul] = useState('');                            // U3 — retour de niveau SECTION (la carte annulée disparaît → retour visible ailleurs)

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/depot', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { demandes: DepotAffiche[] }; setDemandes(d.demandes ?? []); }
      } catch { /* file de dépôt indisponible : le reste de l'écran reste utilisable */ }
    })();
    return () => { annule = true; };
  }, [signalRafraichir]); // DEPOT-1 — se recharge à chaque signal du parent (création, dépôt, annulation)

  const poser = (id: number, texte: string): void => setMsg((s) => ({ ...s, [id]: texte }));

  async function marquerDeposee(id: number): Promise<void> {
    poser(id, '');
    try {
      // P1 — référence FACULTATIVE : envoyée seulement si saisie (le dépôt reste possible sans).
      const reference = (refs[id] ?? '').trim();
      const res = await fetch('/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reference === '' ? { id } : { id, reference }) });
      if (res.ok) {
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        onChangement();                                         // DEPOT-1 — recharge la file + les vues sœurs (pas de page à rafraîchir)
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
        onChangement();                                         // DEPOT-1 — recharge la file + les vues sœurs
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
          <CarteDepot key={d.id} d={d}
            onCopieTexte={() => signalerDepot(d.id, 'texte')} onCopieRef={() => signalerDepot(d.id, 'ref')}>
            {/* P1 — référence renvoyée par la mairie (accusé de réception). Facultative : ne bloque jamais le dépôt. */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
              Référence mairie (accusé de réception) — facultatif
              <input value={refs[d.id] ?? ''} onChange={(e) => setRefs((s) => ({ ...s, [d.id]: e.target.value }))}
                placeholder="ex. SLC260810440700"
                style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
            </label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
