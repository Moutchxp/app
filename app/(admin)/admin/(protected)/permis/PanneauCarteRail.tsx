'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bbox } from '../../../../lib/sitadel/carteProjection';
import type { CommuneGeo } from '../../../../lib/sitadel/carteRepo';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import { CarteRail } from './CarteRail';
import { BlocRepliable } from './BlocRepliable';
import {
  origineRail, diffAffectation, aDesChangements, libelleBoutonCarte, appliquerAffectations, confirmationRetraitRequise,
  type DepsAffectation, type Refus,
} from '../../../../lib/sitadel/carteRailValidation';

/**
 * Lot 3 — PANNEAU d'une carte-rail : la carte interactive (Lot 2) + le CYCLE du bouton à 3 temps + l'APPLICATION de l'exclusivité, en
 * RÉUTILISANT le geste d'affectation existant (aperçu basculer-rail + annuler-lot + PATCH /contact — AUCUN nouveau chemin d'écriture).
 * La sélection est amorcée sur l'ORIGINE (communes déjà sur ce rail) ; le bouton compare à l'origine (jamais un drapeau). Au Valider :
 * application PARTIELLE (on applique ce qui passe, on liste les refus), message de confirmation, retour au repos, RE-CHARGE des données →
 * les cartes reflètent la nouvelle réalité (exclusivité : `canal` est une seule colonne). RETRAIT = désaffecter (canal 'inconnu').
 */
const MOTIF = 'affectation depuis la carte des rails (onglet À demander)';

/** Deps RÉELLES = exactement les endpoints du geste existant (aucun nouveau). */
function depsReelles(): DepsAffectation {
  return {
    apercu: async (code, cible) => {
      const r = await fetch(`/api/admin/permis/basculer-rail?q=${encodeURIComponent(code)}&cible=${cible}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = (await r.json()) as { raisonRefus?: string | null; ids?: number[]; coordonnees?: { email: string; urlFormulaire: string; adressePostale: string }; communeNom?: string | null };
      return { raisonRefus: d.raisonRefus ?? null, ids: d.ids ?? [], coordonnees: d.coordonnees ?? { email: '', urlFormulaire: '', adressePostale: '' }, communeNom: d.communeNom ?? null };
    },
    annulerLot: async (ids) => (await fetch('/api/admin/permis/demandes/annuler-lot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, autoriserPrete: true }) })).ok,
    patchContact: async (code, canal, coords, motif) => (await fetch('/api/admin/permis/contact', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeInsee: code, canal, email: coords.email, urlFormulaire: coords.urlFormulaire, adressePostale: coords.adressePostale, motif }) })).ok,
  };
}

export function PanneauCarteRail({ rail, departement = null, onApplique, deps, onOuvrirCommune, signalRecharge }: {
  rail: Process; departement?: string | null; onApplique?: () => void;
  /** Deps INJECTABLES (test) ; en prod, les endpoints réels du geste existant. */
  deps?: DepsAffectation;
  /** Lot C — PORTE 1 : ouverture de la fiche contact d'une commune (transmise à CarteRail ; active au REPOS seulement). */
  onOuvrirCommune?: (code: string) => void;
  /** Lot C — SIGNAL de recharge (incrémenté quand une fiche contact est enregistrée ailleurs) : recharge la carte, mais JAMAIS pendant une édition (différé jusqu'à la sortie d'édition → sélection préservée). */
  signalRecharge?: number;
}) {
  const [data, setData] = useState<{ communes: CommuneGeo[]; bbox: Bbox } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [edition, setEdition] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const [refus, setRefus] = useState<Refus[]>([]);
  // GARDE-FOU retrait en masse : diff EN ATTENTE de confirmation (null = aucune). Stocke le diff calculé AU MOMENT du clic « Valider » → on
  //   applique EXACTEMENT ce qui a été annoncé. Toute modif de sélection l'annule (voir onToggle / la bascule).
  const [confirmation, setConfirmation] = useState<{ adds: string[]; removes: string[] } | null>(null);
  const depsEff = useMemo(() => deps ?? depsReelles(), [deps]);

  const charger = useCallback(async () => { // RE-CHARGE après validation (appelé depuis onBouton, jamais synchrone dans un effet)
    try {
      const res = await fetch('/api/admin/permis/carte', { cache: 'no-store' });
      if (!res.ok) { setErreur(true); return; }
      setData((await res.json()) as { communes: CommuneGeo[]; bbox: Bbox });
    } catch { setErreur(true); }
  }, []);
  // Chargement initial : IIFE async INLINE (motif du dossier ; setData déféré après await → pas de setState synchrone en effet).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/carte', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setErreur(true); return; }
        setData((await res.json()) as { communes: CommuneGeo[]; bbox: Bbox });
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // Lot C — RECHARGE sur signal externe (une fiche contact vient d'être enregistrée depuis la carte au repos ou le bloc « Hors
  //   process »). GARDE-FOU anti-clobber : pendant une ÉDITION de rail, l'amorce (plus bas) réinitialiserait la sélection en cours
  //   à chaque changement de `data` → on NE recharge PAS pendant l'édition, on DIFFÈRE. `void charger()` (setData APRÈS await, jamais
  //   synchrone en effet) ; refs (pas de setState synchrone). La valeur initiale du signal est ignorée (montage).
  const rechargeEnAttente = useRef(false);
  const signalVu = useRef(signalRecharge ?? 0);
  useEffect(() => {
    const s = signalRecharge ?? 0;
    if (s === signalVu.current) return;            // montage ou re-rendu sans NOUVEAU signal
    signalVu.current = s;
    if (edition) { rechargeEnAttente.current = true; return; } // édition en cours → différer (sélection préservée)
    void (async () => { await charger(); })();     // setState dans la fonction async (jamais synchrone dans le corps de l'effet)
  }, [signalRecharge, edition, charger]);
  // Drain de la recharge DIFFÉRÉE à la sortie d'édition (quelle que soit la voie : Garder / Valider). Idempotent (GET no-store).
  useEffect(() => {
    if (edition || !rechargeEnAttente.current) return;
    rechargeEnAttente.current = false;
    void (async () => { await charger(); })();
  }, [edition, charger]);

  const origine = useMemo(() => (data ? origineRail(data.communes, rail) : new Set<string>()), [data, rail]);
  // Liste des communes RÉELLEMENT sur ce rail (= origine, la réalité validée ; PAS la sélection en cours). Se met à jour au re-chargement (après validation).
  const communesDuRail = useMemo(
    () => (data ? data.communes.filter((c) => origine.has(c.code)).map((c) => ({ code: c.code, nom: c.nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : []),
    [data, origine],
  );

  // AMORCE de la sélection sur l'ORIGINE (ajustement d'état pendant le rendu, pas un effet → converge quand la clé ne change plus). Se
  //   ré-amorce à chaque changement de données/rail (chargement initial, changement de rail, RE-CHARGE après validation). Pas de clobber en
  //   édition : les données ne changent PAS pendant l'édition (aucun fetch).
  const [cleAmorce, setCleAmorce] = useState<string | null>(null);
  const cle = data ? `${rail}|${[...origine].sort().join(',')}` : null;
  if (cle !== null && cle !== cleAmorce) { setSelection(new Set(origine)); setCleAmorce(cle); }

  const changements = aDesChangements(selection, origine);
  const libelle = libelleBoutonCarte(edition, changements);

  const onToggle = useCallback((code: string) => {
    if (!edition) return; // repos : carte non modifiable
    setConfirmation(null); // toute modif de sélection annule une confirmation de retrait en attente (le diff annoncé n'est plus valable)
    setSelection((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  }, [edition]);

  // APPLICATION effective (RÉUTILISE le geste existant, INCHANGÉE) — appelée directement (peu de retraits) OU après confirmation (retrait en masse).
  const appliquer = useCallback(async (adds: readonly string[], removes: readonly string[]) => {
    setConfirmation(null);
    setEnCours(true);
    const res = await appliquerAffectations(depsEff, { adds, removes, rail, motif: MOTIF });
    setRefus(res.refusees);
    setMessage(`${res.appliquees.length} commune(s) affectée(s) au rail ${PROCESS_META[rail].court}${res.refusees.length ? ` — ${res.refusees.length} refusée(s)` : ''}.`);
    await charger();                                                                // RE-CHARGE → origine change → sélection ré-amorcée → cartes à jour (exclusivité)
    setEdition(false);
    setEnCours(false);
    onApplique?.();
  }, [depsEff, rail, charger, onApplique]);

  const onBouton = useCallback(async () => {
    if (enCours) return;
    if (!edition) { setEdition(true); setMessage(''); setRefus([]); setConfirmation(null); return; } // repos → édition
    if (!changements) { setEdition(false); setConfirmation(null); return; }                          // « Garder la sélection » : referme, rien à appliquer
    const { adds, removes } = diffAffectation(selection, origine);
    // GARDE-FOU : au-delà du seuil de retraits, on DEMANDE confirmation AVANT d'appliquer quoi que ce soit (aucune écriture ici).
    if (confirmationRetraitRequise(removes.length)) { setConfirmation({ adds, removes }); return; }
    await appliquer(adds, removes);
  }, [enCours, edition, changements, selection, origine, appliquer]);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Carte indisponible.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <CarteRail rail={rail} selection={selection} onToggle={onToggle} departement={departement} donnees={data} editable={edition} onOuvrir={onOuvrirCommune} />

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem' }} disabled={enCours || !data} onClick={() => void onBouton()}>
          {libelle}
        </button>
        {/* POINT 2 — bascule TOUT désélectionner / TOUT resélectionner (édition seule : la sélection n'est modifiable qu'en édition). Ne modifie
            QUE la sélection LOCALE (aucune écriture). Vider = Set() ; restaurer = l'ORIGINE (état à l'entrée). Les hors-process ne sont jamais
            dans la sélection → jamais touchés. Le libellé dit ce que fera le PROCHAIN clic. Le cycle « Valider/Garder » suit tout seul (comparaison à l'origine). */}
        {edition && (
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} disabled={enCours}
            onClick={() => { setConfirmation(null); setSelection(selection.size === 0 ? new Set(origine) : new Set()); }}>
            {selection.size === 0 ? 'Tout resélectionner' : 'Tout désélectionner'}
          </button>
        )}
        {edition && <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Cliquez les communes à mettre sur ce rail (un 2e clic les retire).</span>}
      </div>

      {/* GARDE-FOU — CONFIRMATION de retrait EN MASSE (> seuil). N'apparaît qu'au clic « Valider » quand trop de communes quittent le rail.
          Confirmer → applique le diff ANNONCÉ ; Annuler → RIEN appliqué, sélection préservée, carte toujours en édition (on peut réajuster). */}
      {confirmation && (
        <div className="svv-card" role="alertdialog" aria-label="Confirmer le retrait en masse" style={{ borderColor: 'var(--color-svv-red)', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <strong>{confirmation.removes.length} commune(s) vont être retirées du rail {PROCESS_META[rail].court}.</strong>
          <span style={{ fontSize: 13, color: 'var(--color-svv-muted)' }}>
            Elles quittent ce rail et repassent « hors process » : le process d’obtention de permis ne s’appliquera plus à elles (ni demande
            ni relance automatique) jusqu’à une nouvelle affectation.
          </span>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem', background: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }}
              disabled={enCours} onClick={() => void appliquer(confirmation.adds, confirmation.removes)}>
              Confirmer le retrait de {confirmation.removes.length} commune(s)
            </button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} disabled={enCours} onClick={() => setConfirmation(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && <p role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)', fontWeight: 600, margin: 0 }}>{message}</p>}
      {refus.length > 0 && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>
          <strong>Non appliquées ({refus.length})</strong> — corrigez la coordonnée dans la fiche contact puis revalidez :
          <ul style={{ margin: '.2rem 0 0', paddingLeft: '1.1rem' }}>
            {refus.map((r) => <li key={r.code}>{r.nom ?? r.code} : {r.raison}</li>)}
          </ul>
        </div>
      )}

      {/* LISTE dépliable des communes du rail (nom + décompte, cohérent avec les autres en-têtes). Reflète la réalité VALIDÉE (origine) ;
          se met à jour au re-chargement après validation. Repliée par défaut ; corps lazy (render-prop). */}
      <BlocRepliable titre={<>Communes sur ce rail <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}>({communesDuRail.length})</span></>}>
        {() => (communesDuRail.length === 0
          ? <p style={{ margin: '.2rem 0 0', fontSize: 12, color: 'var(--color-svv-muted)' }}>Aucune commune sur ce rail.</p>
          : <ul style={{ margin: '.2rem 0 0', paddingLeft: '1.1rem', fontSize: 13, columns: '2 12rem', listStyle: 'disc' }} aria-label={`Communes du rail ${PROCESS_META[rail].court}`}>
              {communesDuRail.map((c) => <li key={c.code}>{c.nom}</li>)}
            </ul>)}
      </BlocRepliable>
    </div>
  );
}
