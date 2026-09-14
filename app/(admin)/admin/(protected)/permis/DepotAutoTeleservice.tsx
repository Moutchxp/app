'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PropositionDepotTeleservice } from '../../../../lib/sitadel/demandeRepo';

/**
 * MODE AUTOMATIQUE (téléservice) — AFFICHAGE AUTOMATIQUE : pour chaque commune LIBRE, une carte de dépôt est PROPOSÉE sans aucun
 * geste (aucun bouton « Préparer les demandes » à cliquer d'abord). Libre = pas de verrou de référence vivant + cap mensuel non
 * atteint + ≥ 1 permis éligible — tout calculé côté serveur par `propositionsDepotTeleservice` (réutilise le filtre 77b1800, ne le
 * redéfinit pas). UNE carte par commune (un dépôt à la fois). Préparer une carte réutilise le chemin EXISTANT (POST …/demandes avec
 * un lot) → la demande rejoint le carrousel, la commune quitte les propositions ; quand la référence est captée (verrou levé), la
 * carte réapparaît d'elle-même au rafraîchissement. Session expirée → « reconnecte-toi ». Mobile-first (cibles ≥ 40 px).
 */
export function DepotAutoTeleservice({ signalRafraichir, onChangement }: {
  signalRafraichir: number;
  onChangement: () => void;
}) {
  const [propositions, setPropositions] = useState<PropositionDepotTeleservice[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [preparant, setPreparant] = useState<string | null>(null);          // codeInsee en cours de préparation
  const [retour, setRetour] = useState<{ texte: string; ok: boolean } | null>(null);

  const charger = useCallback(async (annule?: () => boolean): Promise<void> => {
    try {
      const r = await fetch('/api/admin/permis/demandes/depot-auto', { cache: 'no-store' });
      if (annule?.()) return;
      if (r.ok) { const d = (await r.json()) as { propositions: PropositionDepotTeleservice[] }; setPropositions(d.propositions ?? []); setErreur(''); }
      else setErreur(r.status === 401 || r.status === 403 ? 'Session expirée — reconnecte-toi.' : 'Propositions indisponibles.');
    } catch { if (!annule?.()) setErreur('Propositions indisponibles.'); }
  }, []);

  // Chargement au montage ET à chaque signal (préparation / dépôt / annulation / capture de référence) → une commune libérée
  //   réapparaît, une commune préparée disparaît, sans rechargement de page.
  useEffect(() => {
    let annule = false;
    void (async () => { await charger(() => annule); })(); // IIFE async : le setState de `charger` reste POST-await (jamais synchrone dans l'effet)
    return () => { annule = true; };
  }, [charger, signalRafraichir]);

  // PRÉPARE la demande de la commune (le premier lot proposé), par le chemin EXISTANT (POST …/demandes avec `lots`). Succès → la
  //   demande rejoint le carrousel (onChangement rafraîchit tout) ; la commune quitte les propositions au rechargement.
  async function preparer(p: PropositionDepotTeleservice): Promise<void> {
    setPreparant(p.codeInsee); setRetour(null);
    try {
      const r = await fetch('/api/admin/permis/demandes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lots: [{ cle: p.cle, communeNom: p.communeNom }] }),
      });
      const d = (await r.json().catch(() => ({}))) as { demandesCreees?: number; lotsInvalides?: { raison?: string }[]; erreur?: string };
      if (r.ok && (d.demandesCreees ?? 0) >= 1) {
        setRetour({ texte: `Demande préparée pour ${p.communeNom} — elle apparaît dans le carrousel ci-dessus.`, ok: true });
        onChangement();
      } else if (r.ok) {
        setRetour({ texte: `Préparation impossible : ${d.lotsInvalides?.[0]?.raison ?? 'proposition modifiée depuis l’affichage'}.`, ok: false });
        void charger(); // la proposition a bougé → recharge la liste
      } else {
        setRetour({ texte: r.status === 401 || r.status === 403 ? 'Session expirée — reconnecte-toi.' : (d.erreur ? `Refusé : ${d.erreur}.` : 'Préparation impossible.'), ok: false });
      }
    } catch { setRetour({ texte: 'Préparation impossible (réseau).', ok: false }); }
    finally { setPreparant(null); }
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <strong style={{ fontSize: 13 }}>Communes libres — une carte de dépôt par commune</strong>
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        Proposées automatiquement : chaque commune sans demande en attente d’accusé, sous son cap mensuel et avec au moins un permis
        éligible. Prépare-la pour envoyer sa carte dans le carrousel ci-dessus.
      </p>

      {erreur && <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>{erreur}</p>}
      {retour && <p role="status" aria-live="polite" style={{ fontSize: 12, margin: 0, color: retour.ok ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>{retour.texte}</p>}

      {propositions !== null && !erreur && (
        propositions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-svv-muted)', margin: 0 }}>
            Aucune commune libre à proposer pour l’instant (toutes en attente d’accusé, au plafond mensuel, déjà préparées, ou sans permis éligible).
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {propositions.map((p) => (
              <li key={p.codeInsee} style={{ borderBottom: '1px solid var(--color-svv-line)', paddingBottom: '.35rem' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{p.communeNom}</span>
                  <span style={{ color: 'var(--color-svv-muted)' }}> · {p.permis.map((x) => `${x.type ?? ''} ${x.numDau}`.trim()).join(', ')}{p.nbDossiers > p.permis.length ? ` (+${p.nbDossiers - p.permis.length})` : ''}</span>
                </div>
                <div style={{ marginTop: '.2rem' }}>
                  <button type="button" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.35rem .8rem' }}
                    disabled={preparant === p.codeInsee} onClick={() => void preparer(p)}>
                    {preparant === p.codeInsee ? 'Préparation…' : 'Préparer cette demande'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
