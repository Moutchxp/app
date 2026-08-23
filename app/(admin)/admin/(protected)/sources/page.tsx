'use client';

import { useEffect, useState } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import { TableauSources, GrilleCouverture, LigneContexte } from './SourcesRendu';
import type { LigneSource } from '../../../../lib/admin/sourcesFraicheur';

/**
 * FRAÎCHEUR DES DONNÉES — écran (lot 1/3). Client PUR : consomme `GET /api/admin/sources` (gardé côté serveur) et
 * l'affiche. Ne touche JAMAIS la base ; ne lance RIEN (ni ingestion, ni détection : lots 2 et 3). L'accès effectif
 * est garanti par le garde serveur — un non-administrateur reçoit 403 → état « indisponible ». Mobile-first, focus
 * rouge, aucun bleu, prefers-reduced-motion.
 */

const CSS_SOURCES = `
.svv-sources :is(a,button):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (prefers-reduced-motion: reduce){ .svv-sources *{transition:none!important;animation:none!important} }
`;

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'ok'; lignes: LigneSource[] };

export default function PageSources() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/sources', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as { lignes: LigneSource[] };
        if (vivant) setEtat({ statut: 'ok', lignes: d.lignes });
      } catch {
        if (vivant) setEtat({ statut: 'erreur' });
      }
    })();
    return () => { vivant = false; };
  }, []);

  return (
    <section className="svv-sources">
      <style>{CSS_SOURCES}</style>
      <EnTetePage
        titre="Sources de données"
        intro="L’état de fraîcheur des données qui font fonctionner l’outil : millésime en base, âge, surveillance, couverture."
      />
      {etat.statut === 'chargement' && (
        <p style={{ color: 'var(--color-svv-muted)', fontSize: 14 }}>Chargement…</p>
      )}
      {etat.statut === 'erreur' && (
        <div className="svv-card" style={{ padding: '28px 16px', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, color: 'var(--color-svv-ink)', marginBottom: 4 }}>État indisponible</div>
          <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>
            Impossible de lire l’état des sources pour le moment.
          </p>
        </div>
      )}
      {etat.statut === 'ok' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <TableauSources lignes={etat.lignes} />
          <LigneContexte lignes={etat.lignes} />
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 8px' }}>
              Couverture par département
            </h2>
            <GrilleCouverture lignes={etat.lignes} />
          </div>
        </div>
      )}
    </section>
  );
}
