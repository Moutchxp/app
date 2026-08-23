'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import { TableauSources, GrilleCouverture, LigneContexte, LigneDepliable, ResumeMisesAJour, SectionReingestion, SectionPerimeesSansProcedure, SectionMorphologie, SectionProtocoles, SectionAutomatisation } from './SourcesRendu';
import { PastilleActions } from '../permis/PastilleActions';
import { resumeCouverture, type LigneSource } from '../../../../lib/admin/sourcesFraicheur';
import { formaterOctets, type MorphologieDisque } from '../../../../lib/admin/morphologieDisque';
import { sourcesAvecProcedure, compterMisesAJourActionnables, misesAJourActionnables } from '../../../../lib/admin/pastilleSources';
import type { AffichageProtocoles } from '../../../../lib/admin/protocolesReingestion';
import type { EtatAutomatisation } from '../../../../lib/veille/ingestionAuto';

/**
 * FRAÎCHEUR DES DONNÉES — écran (lot 1/3). Client PUR : consomme `GET /api/admin/sources` (gardé côté serveur) et
 * l'affiche. Ne touche JAMAIS la base ; ne lance RIEN (ni ingestion, ni détection : lots 2 et 3). L'accès effectif
 * est garanti par le garde serveur — un non-administrateur reçoit 403 → état « indisponible ». Mobile-first, focus
 * rouge, aucun bleu, prefers-reduced-motion.
 */

const CSS_SOURCES = `
.svv-sources :is(a,button,summary):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Lignes dépliables : on masque le marqueur natif (un chevron unicode le remplace) ; rotation INSTANTANÉE (aucune transition). */
.svv-sources .svv-depliable summary{list-style:none}
.svv-sources .svv-depliable summary::-webkit-details-marker{display:none}
.svv-sources .svv-depliable-chevron{display:inline-block;transition:none}
.svv-sources .svv-depliable[open] .svv-depliable-chevron{transform:rotate(90deg)}
@media (prefers-reduced-motion: reduce){ .svv-sources *{transition:none!important;animation:none!important} }
`;

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'ok'; lignes: LigneSource[]; cheminDepot: string; morphologie: MorphologieDisque; protocoles: AffichageProtocoles; automatisation: EtatAutomatisation };

export default function PageSources() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  // Ref d'indirection : rompt l'auto-référence effet↔setState (même idiome que TuilePermisActions, lint-clean).
  const chargerRef = useRef<() => Promise<void>>(async () => {});

  const charger = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sources', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { lignes: LigneSource[]; cheminDepot: string; morphologie: MorphologieDisque; protocoles: AffichageProtocoles; automatisation: EtatAutomatisation };
      setEtat({ statut: 'ok', lignes: d.lignes, cheminDepot: d.cheminDepot, morphologie: d.morphologie, protocoles: d.protocoles, automatisation: d.automatisation });
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

  // F6 — poser un réglage d'automatisation puis relire l'état. La route NE LANCE RIEN (l'ingestion part la nuit, dans la veille).
  const reglerAuto = useCallback(async (corps: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      if (res.ok) await chargerRef.current();
    } catch { /* réglage indisponible : l'état affiché reste inchangé */ }
  }, []);
  const basculerAuto = useCallback((source: string, actif: boolean) => reglerAuto({ action: 'reglage_ingestion_auto', source, actif }), [reglerAuto]);
  const reglerFenetre = useCallback((debut: number, fin: number) => reglerAuto({ action: 'reglage_fenetre_nocturne', debut, fin }), [reglerAuto]);

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
      {etat.statut === 'ok' && (() => {
        const { lignes, morphologie, protocoles, automatisation } = etat;
        // Chiffres de synthèse (calculés depuis des modules PURS) affichés à droite de chaque ligne repliée.
        const rc = resumeCouverture(lignes);
        const presentes = protocoles.sections.filter((s) => s.present);
        const outillees = sourcesAvecProcedure(protocoles).size;
        const auto = automatisation.sources.filter((s) => s.automatisable);
        const actives = auto.filter((s) => s.actif).length;
        const f = automatisation.fenetre;
        // MISES À JOUR — une SEULE source de vérité, la même que la tuile home (route /pastille) : compterMisesAJourActionnables.
        // `total===null` = mesure indisponible (protocoles illisibles) ; `setMaj` (le jeu de sources) n'est calculé QUE si le
        // compte est établi, pour que cumul, capsules et haut de page portent exactement le même nombre.
        const total = compterMisesAJourActionnables(lignes, protocoles);
        const setMaj = total === null ? new Set<string>() : new Set(misesAJourActionnables(lignes, protocoles).map((l) => l.cle));
        const synthEspace = morphologie.indisponible ? 'indisponible' : formaterOctets(morphologie.totalBase ?? 0);
        const synthCouv = `bâti ${rc.departementsBati.length} dépts · verdict ${rc.departementsLidar.join('/') || '—'}`;
        const synthReingTexte = `${outillees} outillées · ${presentes.length - outillees} sans procédure`;
        const synthReing = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {total !== null && total > 0 && <PastilleActions n={total} ariaLabel={`${total} mise${total > 1 ? 's' : ''} à jour de base de données disponible${total > 1 ? 's' : ''}`} />}
            {synthReingTexte}
          </span>
        );
        const synthAuto = `${actives}/${auto.length} actives · ${f.debut}h–${f.fin}h`;
        const synthProto = protocoles.fichierAbsent ? 'non documenté' : `${presentes.length} sources documentées`;
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Niveau 2 (G3) — visible immédiatement, sans dérouler : combien de bases sont prêtes à être mises à jour. */}
            <ResumeMisesAJour total={total} />
            <TableauSources lignes={lignes} onToggle={basculer} />
            {/* Le fait le plus important de la page : TOUJOURS visible, jamais replié. */}
            <LigneContexte lignes={lignes} />

            <LigneDepliable titre="Espace occupé par base" synthese={synthEspace}>
              <SectionMorphologie morphologie={morphologie} />
            </LigneDepliable>

            <LigneDepliable titre="Couverture par département" synthese={synthCouv}>
              <GrilleCouverture lignes={lignes} />
            </LigneDepliable>

            <LigneDepliable titre="Réingestion" synthese={synthReing}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-svv-muted)' }}>
                L’écran n’exécute rien : il prépare une commande à copier dans un terminal.
              </p>
              <SectionReingestion lignes={lignes} cheminDepot={etat.cheminDepot} actionnables={setMaj} />
              <div style={{ marginTop: 8 }}>
                <SectionPerimeesSansProcedure lignes={lignes} protocoles={protocoles} />
              </div>
            </LigneDepliable>

            <LigneDepliable titre="Automatisation nocturne" synthese={synthAuto}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-svv-muted)' }}>
                Pour les sources entièrement outillées, la mise à jour peut se faire seule, la nuit. Désactivé par défaut. L’ingestion part dans la veille, pas d’ici.
              </p>
              <SectionAutomatisation automatisation={automatisation} onToggleAuto={basculerAuto} onFenetre={reglerFenetre} />
            </LigneDepliable>

            <LigneDepliable titre="Protocoles de réingestion" synthese={synthProto}>
              <SectionProtocoles protocoles={protocoles} />
            </LigneDepliable>
          </div>
        );
      })()}
    </section>
  );
}
