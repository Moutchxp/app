'use client';

import { useEffect, useState } from 'react';
import {
  construireUrl,
  fenetreDefaut,
  preset,
  estVide,
  RAPPEL_CRON,
  URL_GEO,
  type Fenetre,
  type Statistiques,
  type FiltreCommune,
  type RefCommunes,
} from './affichage';
import {
  CSS_ECRAN,
  SelecteurFenetre,
  Message,
  SerieTemporelle,
  TuileTrafic,
  TuileAnalyses,
  TuileVerdicts,
  TuileEntonnoir,
  TuileCommunes,
  TuileProvenance,
} from './tuiles';

/**
 * M2 — LOT 6. Page-COQUILLE du tableau de bord. CONSOMME l'API de lecture (GET /api/admin/statistiques,
 * + /api/admin/geo/communes pour le fond de carte) et l'AFFICHE. Ne calcule AUCUNE métrique, n'accède JAMAIS
 * à la base, ne RECONSTITUE JAMAIS un masquage k. Filtre carte : sélectionner une commune (VISIBLE, k-safe)
 * refetch les verdicts SCOPÉS (k re-passé serveur) et grise les métriques non ventilables par commune
 * (session/acquisition — anti-fingerprint). La série temporelle reste GLOBALE. Mobile-first 375px, focus ROUGE,
 * AUCUN bleu. La vraie garde d'accès est SERVEUR (perm_statistiques) ; cet écran ne fait que refléter.
 */

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'vide' }
  | { statut: 'ok'; data: Statistiques };

export default function StatistiquesPage() {
  const [fenetre, setFenetre] = useState<Fenetre>(() => fenetreDefaut());
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });
  const [communeSel, setCommuneSel] = useState<string | null>(null);
  const [filtreScope, setFiltreScope] = useState<FiltreCommune | null>(null);
  const [refGeo, setRefGeo] = useState<RefCommunes | null>(null);
  const [reduitMouvement, setReduitMouvement] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  // prefers-reduced-motion : valeur initiale lue au 1er rendu client (lazy), puis suivie sur changement.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduitMouvement(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Référentiel cartographique (une fois) — pure géo (centroïdes), API admin, jamais la base côté client.
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(URL_GEO);
        if (annule || !res.ok) return;
        setRefGeo((await res.json()) as RefCommunes);
      } catch {
        /* la carte se dégrade en liste seule si le référentiel est indisponible */
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Données GLOBALES de la fenêtre (jamais scindées par commune). Un changement de fenêtre RÉINITIALISE le filtre.
  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat({ statut: 'chargement' });
      setCommuneSel(null);
      setFiltreScope(null);
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

  // Filtre carte : verdicts SCOPÉS à la commune (fetch SÉPARÉ → n'efface pas le tableau de bord global).
  // Pas de désélection à effacer ici : `filtreScope` obsolète est neutralisé à l'affichage par le garde
  // `filtreScope.commune === communeSel` (et remis à null au changement de fenêtre) → aucun setState synchrone.
  useEffect(() => {
    if (!communeSel) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(construireUrl(fenetre, communeSel));
        if (annule || !res.ok) return;
        const data = (await res.json()) as Statistiques;
        if (!annule) setFiltreScope(data.filtreCommune);
      } catch {
        /* best-effort : le tableau global reste affiché */
      }
    })();
    return () => {
      annule = true;
    };
  }, [communeSel, fenetre]);

  const filtreActif = communeSel !== null;

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
      {etat.statut === 'ok' &&
        (() => {
          const data = etat.data;
          const selInfo = communeSel ? data.communes.visibles.find((x) => x.commune_insee === communeSel) : undefined;
          const nomSel = communeSel ? refGeo?.[communeSel]?.nom ?? communeSel : undefined;
          const filtre = filtreScope && filtreScope.commune === communeSel ? filtreScope : null;
          const voileSession = filtreActif
            ? 'Métrique de session, sans dimension commune (anti-fingerprint : la géo ne croise jamais l’acquisition). Chiffres globaux.'
            : undefined;
          const voileAnalyses = filtreActif ? 'Analyses lancées : métrique globale, non ventilable par commune. Chiffres globaux.' : undefined;
          const voileProvenance = filtreActif ? 'Provenance : non filtrable par commune (anti-fingerprint). Chiffres globaux.' : undefined;
          // Filtre posé mais verdicts scopés pas encore revenus (ou en échec) → on NE présente PAS le global
          // comme s'il était scopé : note explicite « chiffres globaux » (constat R4), jamais muet.
          const voileVerdicts = filtreActif && !filtre ? `Verdicts de ${nomSel ?? 'la commune'} en cours — chiffres globaux affichés.` : undefined;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <SerieTemporelle serie={data.serie} />
              </div>
              <TuileTrafic data={data} voile={voileSession} />
              <TuileAnalyses data={data} voile={voileAnalyses} />
              <TuileVerdicts data={data} filtre={filtre} nomCommune={nomSel} resultatsCommune={selInfo?.n} voile={voileVerdicts} />
              <TuileEntonnoir data={data} voile={voileSession} />
              <div style={{ gridColumn: '1 / -1' }}>
                <TuileCommunes data={data} refGeo={refGeo} selection={communeSel} onSelect={setCommuneSel} reducedMotion={reduitMouvement} />
              </div>
              <TuileProvenance data={data} voile={voileProvenance} />
            </div>
          );
        })()}
    </section>
  );
}
