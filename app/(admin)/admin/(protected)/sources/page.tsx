'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import { TableauSources, GrilleCouverture, LigneContexte, SectionReingestion, SectionMorphologie } from './SourcesRendu';
import type { LigneSource } from '../../../../lib/admin/sourcesFraicheur';
import type { MorphologieDisque } from '../../../../lib/admin/morphologieDisque';

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
  | { statut: 'ok'; lignes: LigneSource[]; cheminDepot: string; morphologie: MorphologieDisque };

export default function PageSources() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  // Ref d'indirection : rompt l'auto-référence effet↔setState (même idiome que TuilePermisActions, lint-clean).
  const chargerRef = useRef<() => Promise<void>>(async () => {});

  const charger = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sources', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { lignes: LigneSource[]; cheminDepot: string; morphologie: MorphologieDisque };
      setEtat({ statut: 'ok', lignes: d.lignes, cheminDepot: d.cheminDepot, morphologie: d.morphologie });
    } catch {
      setEtat({ statut: 'erreur' });
    }
  }, []);

  useEffect(() => {
    chargerRef.current = charger;
    void (async () => { await chargerRef.current(); })(); // chargement à l'ouverture (via la ref → pas de setState direct en effet)
  }, [charger]);

  // Réglage par source : bascule la surveillance puis relit l'état (aucune ingestion, aucun téléchargement).
  const basculer = useCallback(async (source: string, actif: boolean) => {
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reglage_detection', source, actif }),
      });
      if (res.ok) await chargerRef.current();
    } catch { /* réglage indisponible : l'état affiché reste inchangé */ }
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
          <TableauSources lignes={etat.lignes} onToggle={basculer} />
          <LigneContexte lignes={etat.lignes} />
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 8px' }}>
              Couverture par département
            </h2>
            <GrilleCouverture lignes={etat.lignes} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>
              Réingestion
            </h2>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-svv-muted)' }}>
              La tuile n’exécute rien : elle prépare une commande à copier dans un terminal. À vous de la lancer et d’en suivre la progression.
            </p>
            <SectionReingestion lignes={etat.lignes} cheminDepot={etat.cheminDepot} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>
              Espace disque par source
            </h2>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-svv-muted)' }}>
              Répartition réelle du disque occupé. Vue d’ensemble seulement — aucune suppression proposée.
            </p>
            <SectionMorphologie morphologie={etat.morphologie} />
          </div>
        </div>
      )}
    </section>
  );
}
