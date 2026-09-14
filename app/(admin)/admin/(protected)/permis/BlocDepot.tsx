'use client';

import { useEffect, useRef, useState } from 'react';
import { CarteDepot, BoutonAnnulerDepot, type DepotAffiche } from './DemandesRendu';
import { creerPlanificateurReleve, type PlanificateurReleve } from './planifieReleveDepot'; // LOT 34 : relève déclenchée par le clic « copier »

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
  // LOT 34 — RELÈVE DÉCLENCHÉE par le clic « copier » : délai (config), retour d'écran, planificateur dédupliqué (une seule relève).
  const [releveMsg, setReleveMsg] = useState<string | null>(null);
  // CARROUSEL (présentation, ce lot) — index de la carte courante + réf. de la piste défilante (rendu plus bas).
  const [index, setIndex] = useState(0);
  const pisteRef = useRef<HTMLDivElement | null>(null);
  const delaiSecRef = useRef(60);          // délai courant (config), lu au clic → jamais figé
  const planifRef = useRef<PlanificateurReleve | null>(null);
  const onChangementRef = useRef(onChangement); // dernière valeur du callback, sans recréer le planificateur
  useEffect(() => { onChangementRef.current = onChangement; }, [onChangement]);

  // Planificateur créé UNE fois au montage (refs lues seulement ici, jamais pendant le rendu). Cleanup = annule un timer en attente.
  useEffect(() => {
    const planif = creerPlanificateurReleve({
      delaiMs: () => Math.max(1, delaiSecRef.current) * 1000,          // délai FRAIS à chaque clic → suit la config
      programmer: (cb, ms) => setTimeout(cb, ms),
      annuler: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      avantAttente: () => setReleveMsg(`La boîte sera relevée dans ~${delaiSecRef.current}s (lecture seule, sans envoi)…`),
      executer: () => {
        setReleveMsg('Relève de la boîte en cours…');
        void (async () => {
          try {
            const res = await fetch('/api/admin/permis/relever-depot', { method: 'POST' }); // LECTURE SEULE côté serveur
            const d = (await res.json().catch(() => ({}))) as { resultat?: string; message?: string; compteurs?: { retenus?: number; referencesCaptees?: number; rattaches?: number } };
            if (d.resultat === 'ok' && d.compteurs) {
              const c = d.compteurs;
              setReleveMsg(`Boîte relevée : ${c.retenus ?? 0} message(s) retenu(s), ${c.referencesCaptees ?? 0} référence(s) mairie captée(s), ${c.rattaches ?? 0} rattaché(s).`);
              onChangementRef.current(); // une référence captée peut faire évoluer l'état (file + vues sœurs)
            } else setReleveMsg(d.message ?? 'Relève terminée.');
          } catch { setReleveMsg('Relève impossible (réseau) — la relève ordinaire prendra le relais.'); }
        })();
      },
    });
    planifRef.current = planif;
    return () => { planif.annuler(); planifRef.current = null; }; // démontage : pas de relève fantôme
  }, []);
  const programmerReleve = (): void => planifRef.current?.demander(); // DÉDUP interne : deux clics rapprochés → une seule relève

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/depot', { cache: 'no-store' });
        if (!annule && res.ok) {
          const d = (await res.json()) as { demandes: DepotAffiche[]; releveDelaiSecondes?: number };
          setDemandes(d.demandes ?? []);
          if (typeof d.releveDelaiSecondes === 'number') delaiSecRef.current = d.releveDelaiSecondes; // LOT 34 : délai piloté par config
        }
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

  // CARROUSEL — navigation. `pos` = index BORNÉ (une carte retirée après dépôt/annulation ne laisse jamais « 4 sur 3 »).
  //   Défilement natif (swipe) + boutons ; `scrollTo` respecte prefers-reduced-motion (non animé si l'utilisateur le refuse).
  const pos = Math.min(index, Math.max(0, demandes.length - 1));
  const comportementScroll = (): ScrollBehavior =>
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const allerA = (i: number): void => {
    const piste = pisteRef.current;
    if (!piste || piste.children.length === 0) return;
    const cible = Math.max(0, Math.min(i, piste.children.length - 1));
    const carte = piste.children[cible] as HTMLElement | undefined;
    piste.scrollTo?.({ left: carte ? carte.offsetLeft : 0, behavior: comportementScroll() });
    setIndex(cible);
  };
  // La carte courante SUIT le défilement manuel (swipe) : on retient celle dont le bord gauche est le plus proche du scroll.
  const onScrollPiste = (): void => {
    const piste = pisteRef.current;
    if (!piste) return;
    const enfants = Array.from(piste.children) as HTMLElement[];
    if (enfants.length === 0) return;
    let plusProche = 0, meilleur = Infinity;
    enfants.forEach((c, i) => { const d = Math.abs(c.offsetLeft - piste.scrollLeft); if (d < meilleur) { meilleur = d; plusProche = i; } });
    setIndex((cur) => (cur === plusProche ? cur : plusProche));
  };

  if (demandes.length === 0) return null;

  return (
    <section role="group" aria-label="Demandes à déposer à la main (téléservice)" className="flex flex-col gap-2">
      <div style={{ fontSize: 13 }}>
        <strong>{demandes.length} demande(s) à déposer à la main</strong> — ces communes n’acceptent que leur téléservice. Ouvrez le formulaire, collez le texte, puis marquez la demande déposée.
      </div>
      {/* U3 — retour de l'annulation : la carte concernée a disparu de la file, le retour reste visible au niveau de la section. */}
      {retourAnnul && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{retourAnnul}</div>}
      {/* LOT 34 — état de la relève déclenchée par « copier » : « relevée dans un instant » puis résultat. Jamais silencieux. */}
      {releveMsg && <div role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>{releveMsg}</div>}
      {/* CARROUSEL (présentation) — barre de navigation : Précédent / position EN TEXTE / Suivant (tous focusables au clavier). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem', minHeight: 40 }}
          onClick={() => allerA(pos - 1)} disabled={pos <= 0} aria-label="Carte précédente"><span aria-hidden="true">‹</span> Précédent</button>
        <span role="status" aria-live="polite" style={{ fontSize: 13, fontWeight: 600, minWidth: '5.5rem', textAlign: 'center' }}>{pos + 1} sur {demandes.length}</span>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem', minHeight: 40 }}
          onClick={() => allerA(pos + 1)} disabled={pos >= demandes.length - 1} aria-label="Carte suivante">Suivant <span aria-hidden="true">›</span></button>
      </div>
      {/* PISTE — une carte à la fois (flex: 0 0 100%), défilement horizontal + scroll-snap (swipe natif). Hauteur = celle de la
          carte la PLUS HAUTE (la piste flex adopte la hauteur de son plus grand item) → AUCUN saut vertical d'une carte à l'autre ;
          overflow-Y masqué (pas de débordement vertical parasite). CarteDepot INCHANGÉE (mêmes props, mêmes gestes, mêmes enfants). */}
      <div ref={pisteRef} onScroll={onScrollPiste} role="group" aria-label="Cartes de dépôt à faire (défilement horizontal)"
        style={{ display: 'flex', gap: '.6rem', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', position: 'relative', alignItems: 'flex-start', WebkitOverflowScrolling: 'touch' }}>
        {demandes.map((d) => (
          <div key={d.id} style={{ flex: '0 0 100%', minWidth: 0, boxSizing: 'border-box', scrollSnapAlign: 'start' }}>
            <CarteDepot d={d}
              onCopieTexte={() => { signalerDepot(d.id, 'texte'); programmerReleve(); }} onCopieRef={() => { signalerDepot(d.id, 'ref'); programmerReleve(); }}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
