'use client';

import { useEffect, useState } from 'react';
import { construireUrl, fenetreDefaut, preset, estVide, RAPPEL_CRON, type Fenetre, type Statistiques } from './affichage';
import {
  CSS_ECRAN,
  SelecteurFenetre,
  Message,
  TuileTrafic,
  TuileAnalyses,
  TuileVerdicts,
  TuileEntonnoir,
  TuileCommunes,
  TuileProvenance,
} from './tuiles';

/**
 * M2 — LOT 5. Page-COQUILLE du tableau de bord Statistiques. CONSOMME l'API de lecture du Lot 4
 * (GET /api/admin/statistiques) et l'AFFICHE via les tuiles (`tuiles.tsx`). Ne calcule AUCUNE métrique,
 * n'accède JAMAIS à la base, ne RECONSTITUE JAMAIS un masquage k. Mobile-first 375px, focus ROUGE, AUCUN
 * bleu. La vraie garde d'accès est SERVEUR (perm_statistiques, Lot 4) ; cet écran ne fait que refléter.
 */

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'vide' }
  | { statut: 'ok'; data: Statistiques };

export default function StatistiquesPage() {
  const [fenetre, setFenetre] = useState<Fenetre>(() => fenetreDefaut());
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    let annule = false;
    void (async () => {
      // setState DANS la fonction async (synchronisation avec l'API), pas dans le corps direct de l'effet.
      setEtat({ statut: 'chargement' });
      try {
        const res = await fetch(construireUrl(fenetre));
        if (annule) return;
        if (!res.ok) {
          setEtat({ statut: 'erreur' });
          return;
        }
        const data = (await res.json()) as Statistiques;
        if (annule) return;
        setEtat(estVide(data) ? { statut: 'vide' } : { statut: 'ok', data });
      } catch {
        if (!annule) setEtat({ statut: 'erreur' });
      }
    })();
    return () => {
      annule = true;
    };
  }, [fenetre]);

  return (
    <section className="svv-stats" style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS_ECRAN}</style>
      <header>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Statistiques</h1>
        <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--color-svv-muted)' }}>{RAPPEL_CRON}</p>
      </header>

      <SelecteurFenetre fenetre={fenetre} onChange={setFenetre} presetFn={preset} />

      {etat.statut === 'chargement' && <Message titre="Chargement…" texte="Lecture des statistiques de la période." />}
      {etat.statut === 'erreur' && <Message titre="Statistiques indisponibles" texte="Impossible de charger les données. Réessayez plus tard." />}
      {etat.statut === 'vide' && (
        <Message
          titre="Aucune donnée sur cette période"
          texte="Normal en l’absence de trafic — ou si le job de maintenance (cron) n’a pas encore compacté les sessions."
        />
      )}
      {etat.statut === 'ok' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
          <TuileTrafic data={etat.data} />
          <TuileAnalyses data={etat.data} />
          <TuileVerdicts data={etat.data} />
          <TuileEntonnoir data={etat.data} />
          <TuileCommunes data={etat.data} />
          <TuileProvenance data={etat.data} />
        </div>
      )}
    </section>
  );
}
