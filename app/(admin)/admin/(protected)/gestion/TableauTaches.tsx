'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
/* 🔴 LOT FILTRE-ECRAN-FIXE — l'écran ne bouge pas quand on change de filtre. */
import { estClicDansLeVide, MOT_AUCUNE_TACHE_FILTRE, useZoneStable } from './defilementFige';
import {
  compterTaches, compterTachesUrgentes, filtrerParPastille, termineesRecentes, TITRE_TERMINEES, type PastilleFiltre, repartirTaches, type Tache,
} from '../../../../lib/gestion/taches';
import { CSS_TACHES, LigneTache, PastillesFiltres, useLignesDepliees, useMaintenant } from './LigneTache';
import {
  compterEnAttente, filtrerParAcceptation, MOTS_QUI, ORDRE_FILTRES_QUI, MOTS_STATUT, type FiltreQui, type FiltreStatut,
} from '../../../../lib/gestion/acceptationTache';
import { FenetreTache } from './FenetreTache';
import { ecouterTaches, lireTaches } from './tachesClient';
import { CSS_BLOC_REPLIE } from './blocReplie';
import {
  chercherTaches, collaborateursDesTaches, ECHEANCES, filtrerTachesPleinePage, lirePreferencesTaches, MOTS_ECHEANCE, MOTS_STATUT_PLEINE_PAGE,
  STATUTS_PLEINE_PAGE, trierTachesPleinePage, TRI_TACHES_DEFAUT, FILTRES_TACHES_VIDES, type FiltresTaches, type TriTaches,
} from '../../../../lib/gestion/tachesPleinePage';

/** 🔴 Arno (10/11/2026) — la pleine page « Tâches » : son tri et ses filtres, conservés d'une visite à l'autre (préférence locale). */
export const CLE_TACHES_PLEINE_PAGE = 'svav.gestion.taches.plein';

/** 🔴 Arno (10/11/2026) — la relecture du bloc replié de l'écran partagé : toutes les 30 secondes (comme les préavis). */
export const INTERVALLE_RELECTURE_MS = 30_000;

/**
 * ══ 🔴🔴 LOT TACHES-1 — LE RÉCAPITULATIF GÉNÉRAL, SUR L'ÉCRAN PARTAGÉ DE LA TUILE GESTION ═══════════════════════
 *
 * Arno : « un tableau de TOUTES les tâches de TOUS les biens, avec le même code couleur. Chaque ligne : couleur,
 * date (et heure), objet, adresse du bien (cliquable vers la fiche), personne à qui la tâche est confiée. Filtre
 * “Toutes / Les miennes” (Toutes par défaut). Compteurs en tête : en retard / du jour / 2 jours / plus tard. »
 *
 * 🔴 POSÉ TOUT EN BAS DE L'ÉCRAN PARTAGÉ, SOUS « Échanges sans événement » : c'est la seule place qui ne déplace,
 * ne rétrécit ni ne masque rien (boîte mail à gauche, événements à droite, annuaire au-dessus restent au pixel
 * près). Le placer plus haut aurait poussé les deux colonnes vers le bas.
 *
 * 🔴 LA LIGNE EST `LigneTache`, LA MÊME QUE SUR LA FICHE DU BIEN : même couleur, mêmes gestes, même signal. Une tâche
 * marquée faite ici se grise aussi sur la fiche ouverte ailleurs.
 *
 * ⚠️ SANS LA MIGRATION 346, NE REND RIEN. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export function TableauTaches({ onOuvrirBien, onEcrire, retour = null, repliable = false, plein = false, pleinePage }: {
  onOuvrirBien: (lotId: number) => void;
  /**
   * 🔴 Arno (10/11/2026, accord explicite pour CE repli, écran partagé seulement) — REPLIÉ à chaque ouverture de la page ; un clic sur la ligne
   * de titre l'ouvre ou le ferme (▸ / ▾). Fermé : « Tâches · N » et le repère rouge des urgentes (absent à zéro). Ouvert : exactement comme
   * avant. Les compteurs sont ceux de l'intérieur (mêmes données, mêmes fonctions), relus toutes les 30 s, au retour sur l'onglet et après
   * chaque geste. Absent (page pleine « Tâches ») : rien ne change.
   */
  repliable?: boolean;
  /**
   * 🔴 Arno (10/11/2026) — la PLEINE PAGE « Tâches » : la liste complète, recherche, tris dans les deux sens, filtres cumulables (échéance,
   * statut, collaborateur, avec ou sans bien), en plus des pastilles et filtres du bloc ; tri et filtres conservés. Même source, mêmes gestes.
   */
  plein?: boolean;
  /** 🔴 Arno (10/11/2026) — le lien « Ouvrir en pleine page », en bout de la ligne de titre (comme celui des préavis). */
  pleinePage?: () => void;
  /** 🔴 LOT GESTION-TACHES-PAGE — sur la page pleine « Tâches » : le bouton de retour, en tête. Absent sur l'écran partagé. */
  retour?: ReactNode;
  /** 🔴 LOT TACHES-1-BIS — ouvre le composeur « Nouveau message », adresse pré-remplie, sans rien envoyer. */
  onEcrire?: (email: string) => void;
}) {
  const maintenant = useMaintenant();
  const [donnees, setDonnees] = useState<{ taches: Tache[]; moi: number | null; tronque: boolean } | null>(null);
  const [installe, setInstalle] = useState(true);
  /* 🔴 LOT TACHES-ACCEPTATION — deux filtres combinables. « Confiées à moi » est l'ancien « Les miennes » (même règle :
     les tâches confiées à la personne connectée), désormais à côté de « Commandées par moi ». */
  const [qui, setQui] = useState<FiltreQui>('toutes');
  const [statut, setStatut] = useState<FiltreStatut>('toutes');
  /** 🔴 LOT PASTILLES-FILTRES — la pastille active (une seule), combinée avec « qui » et « statut » ; `null` = toutes. */
  const [pastille, setPastille] = useState<PastilleFiltre | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  /* 🔴 LOT GESTION-TACHES-SANS-BIEN — « Créer une tâche » : la fenêtre de création, SANS bien ; et sa confirmation. */
  const [creation, setCreation] = useState(false);
  const [cree, setCree] = useState<string | null>(null);
  /* 🔴 LOT FILTRE-ECRAN-FIXE — la zone de la liste garde la plus grande hauteur atteinte depuis l'ouverture, et la
     position de défilement est notée au clic sur un filtre puis rétablie après le rendu. */
  const { zone: zoneListe, contenu: contenuListe, hauteurMin, changerFiltre } = useZoneStable();
  /** 🔴 LOT TACHES-LIGNES-COMPACTES — lignes repliées par défaut ; le repli des terminées s'ouvre sur une carte dépliée. */
  const lignes = useLignesDepliees();
  const [termineesOuvertes, setTermineesOuvertes] = useState(false);
  const termineeDepliee = (donnees?.taches ?? []).some((t) => t.etat !== 'a_faire' && lignes.ids.has(t.id));
  useEffect(() => { if (termineeDepliee) setTermineesOuvertes(true); }, [termineeDepliee]);

  const charger = useCallback(async () => {
    const r = await lireTaches(null);
    if (r.etat === 'sans_schema') { setInstalle(false); return; }
    if (r.etat === 'ok') setDonnees({ taches: r.taches, moi: r.moi, tronque: r.tronque });
    else setDonnees((d) => d ?? { taches: [], moi: null, tronque: false });
  }, []);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);
  const [ouvert, setOuvert] = useState(false);
  // 🔴 Arno (10/11/2026) — la pleine page : tri, filtres cumulables, recherche ; tri et filtres relus APRÈS le montage (rendu identique).
  const [tri, setTri] = useState<TriTaches>(TRI_TACHES_DEFAUT);
  const [filtres, setFiltres] = useState<FiltresTaches>(FILTRES_TACHES_VIDES);
  const [recherche, setRecherche] = useState('');
  const [prefsLues, setPrefsLues] = useState(false);
  useEffect(() => {
    if (!plein) return;
    let brut: string | null = null;
    try { brut = window.localStorage.getItem(CLE_TACHES_PLEINE_PAGE); } catch { /* sans stockage : les choix par défaut */ }
    const p = lirePreferencesTaches(brut);
    /* eslint-disable react-hooks/set-state-in-effect */
    setTri(p.tri); setFiltres(p.filtres); setQui(p.qui); setStatut(p.statut); setPastille(p.pastille); setPrefsLues(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [plein]);
  useEffect(() => {
    if (!plein || !prefsLues) return;
    try { window.localStorage.setItem(CLE_TACHES_PLEINE_PAGE, JSON.stringify({ tri, filtres, qui, statut, pastille })); } catch { /* préférence seulement */ }
  }, [plein, prefsLues, tri, filtres, qui, statut, pastille]);
  // 🔴 Arno (10/11/2026) — le bloc replié (écran partagé) : relu toutes les 30 s et au retour sur l'onglet, comme le bloc des préavis.
  useEffect(() => {
    if (!repliable && !plein) return undefined;
    const relire = (): void => { if (document.visibilityState !== 'hidden') void charger(); };
    const minuterie = window.setInterval(relire, INTERVALLE_RELECTURE_MS);
    document.addEventListener('visibilitychange', relire);
    return () => { window.clearInterval(minuterie); document.removeEventListener('visibilitychange', relire); };
  }, [repliable, plein, charger]);

  if (!installe || donnees === null) return null;
  const visibles = filtrerParAcceptation(donnees.taches, qui, statut, donnees.moi);
  // 🔴 ORDRE CHRONOLOGIQUE STRICT : l'échéance la plus proche en haut (en retard compris), la plus lointaine en bas.
  const toutes = repartirTaches(visibles, maintenant);
  // Les compteurs des pastilles suivent « qui » et « statut », pas la pastille elle-même.
  const n = compterTaches(toutes.ouvertes, maintenant);
  const enAttente = compterEnAttente(toutes.ouvertes);
  const ouvertes = filtrerParPastille(toutes.ouvertes, pastille, maintenant);
  // 🔴 LOT TERMINEES-7-JOURS — affichage seulement : les terminées des 7 derniers jours.
  const terminees = termineesRecentes(filtrerParPastille(toutes.terminees, pastille, maintenant), maintenant);
  /* 🔴 Arno (10/11/2026) — LA PLEINE PAGE : les filtres cumulables, la recherche et le tri s'ajoutent à ceux du bloc. Les terminées
     entrent dans la liste quand on les demande (statut « Faite » ou « Annulée »). */
  const avecTerminees = plein && filtres.statuts.some((x) => x === 'faite' || x === 'annulee');
  const listePlein = plein ? trierTachesPleinePage(chercherTaches(filtrerTachesPleinePage(
    avecTerminees ? [...ouvertes, ...filtrerParPastille(toutes.terminees, pastille, maintenant)] : ouvertes, filtres, maintenant), recherche), tri, maintenant) : ouvertes;
  const collaborateurs = plein ? collaborateursDesTaches(donnees.taches) : [];
  const filtresActifs = plein && (recherche.trim() !== '' || filtres.echeances.length > 0 || filtres.statuts.length > 0 || filtres.collaborateur !== null || filtres.bien !== 'tous');
  const basculer = <T,>(l: readonly T[], v: T): T[] => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const urgentes = compterTachesUrgentes(ouvertes, maintenant);
  const lien = pleinePage !== undefined && (
    <button type="button" className="tch-plein" onClick={(e) => { e.stopPropagation(); pleinePage(); }} data-pleine-page-taches>Ouvrir en pleine page</button>
  );
  const titre = (
    <h2 className={`gst-titre${repliable && !ouvert ? ' blr-titre' : ''}`} id="tch-tableau-titre">
      {repliable ? (
        <button type="button" className={`tch-repli${!ouvert ? ' blr-repli' : ''}`} aria-expanded={ouvert} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }} data-repli-taches>
          <span aria-hidden="true" className={`tch-fleche${!ouvert ? ' blr-fleche' : ''}`}>{ouvert ? '▾' : '▸'}</span>
          {ouvert ? <>Tâches <span className="gst-compte">{ouvertes.length}</span></> : <>Tâches · <span data-total-taches>{ouvertes.length}</span></>}
        </button>
      ) : <>Tâches <span className="gst-compte" data-nombre-taches>{listePlein.length}</span></>}
      {repliable && !ouvert && urgentes > 0 && (
        <span className="tch-urgentes blr-alerte" data-urgentes-taches>● {urgentes} urgente{urgentes > 1 ? 's' : ''}</span>
      )}
    </h2>
  );
  if (repliable && !ouvert) {
    return (
      <section className="tch-tableau tch-tableau--replie blr-bloc" aria-labelledby="tch-tableau-titre" data-bloc-taches="replie">
        <style>{CSS_TACHES}{CSS_TABLEAU}{CSS_BLOC_REPLIE}</style>
        <div className="tch-tableau-tete">{titre}{lien}</div>
      </section>
    );
  }

  return (
    /* 🔴 LOT SORTIR-DU-FILTRE — trois sorties du filtre de pastille : re-clic sur la pastille active, « Toutes » (qui ou
       statut), et un clic dans une zone vide du bloc. Toutes à écran fixe. */
    <section className="tch-tableau" aria-labelledby="tch-tableau-titre"{...(repliable ? { 'data-bloc-taches': 'ouvert' } : {})}
      onClick={(e) => { if (pastille !== null && estClicDansLeVide(e.target, e.currentTarget)) changerFiltre(() => setPastille(null)); }}>
      <style>{CSS_TACHES}{CSS_TABLEAU}</style>
      <div className="tch-tableau-tete">
        {retour !== null && <div className="tch-retour">{retour}</div>}
        {titre}
        {lien}
        {/* 🔴 LOT GESTION-TACHES-SANS-BIEN (Arno, 17/10/2026) — création simple, sans bien : la MÊME fenêtre que « + Tâche ». */}
        <button type="button" className="svv-btn svv-btn-primary gst-btn tch-btn tch-creer" data-action="creer-tache"
          onClick={(e) => { e.stopPropagation(); setCree(null); setCreation(true); }}>
          + Créer une tâche
        </button>
        <div className="tch-filtres">
          <div className="tch-filtre" role="group" aria-label="Quelles tâches">
            {ORDRE_FILTRES_QUI.map((f) => (
              <button key={f} type="button" aria-pressed={qui === f} data-filtre-qui={f}
                className={`tch-filtre-btn${qui === f ? ' tch-filtre-btn--actif' : ''}`} onClick={() => changerFiltre(() => { setQui(f); if (f === 'toutes') setPastille(null); })}>
                {MOTS_QUI[f]}
              </button>
            ))}
          </div>
          <div className="tch-filtre" role="group" aria-label="Quel statut">
            {(['toutes', 'en_attente', 'acceptee', 'refusee'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={statut === f} data-filtre-statut={f}
                className={`tch-filtre-btn${statut === f ? ' tch-filtre-btn--actif' : ''}`} onClick={() => changerFiltre(() => { setStatut(f); if (f === 'toutes') setPastille(null); })}>
                {MOTS_STATUT[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* 🔴 LOT PASTILLES-FILTRES — les pastilles sont des filtres (écran fixe, comme les autres). */}
      {cree !== null && <p className="tch-message" role="status">{cree}</p>}
      <PastillesFiltres n={n} enAttente={enAttente} active={pastille} onChoisir={(p) => changerFiltre(() => setPastille(p))} />
      {plein && (
        <div className="tch-plein-outils" data-outils-pleine-page>
          <label className="tch-plein-champ">
            <span className="tch-plein-mot">Rechercher</span>
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. plombier, 12 rue des Lilas, Dupont, Claire" data-recherche-taches />
          </label>
          <div className="tch-filtre" role="group" aria-label="Trier les tâches">
            <span className="tch-plein-mot">Trier</span>
            {([['defaut:asc', 'Ordre du bloc'], ['echeance:asc', 'Date : plus proche'], ['echeance:desc', 'Date : plus lointaine'],
              ['creation:asc', 'Création : plus ancienne'], ['creation:desc', 'Création : plus récente'], ['statut:asc', 'Statut ↑'], ['statut:desc', 'Statut ↓']] as const).map(([cle, mot]) => {
              const [c, sens] = cle.split(':') as [TriTaches['cle'], TriTaches['sens']];
              const actif = tri.cle === c && (c === 'defaut' || tri.sens === sens);
              return <button key={cle} type="button" aria-pressed={actif} data-tri-taches={cle}
                className={`tch-filtre-btn${actif ? ' tch-filtre-btn--actif' : ''}`} onClick={() => changerFiltre(() => setTri({ cle: c, sens }))}>{mot}</button>;
            })}
          </div>
          <div className="tch-filtre" role="group" aria-label="Échéance">
            <span className="tch-plein-mot">Échéance</span>
            {ECHEANCES.map((e) => (
              <button key={e} type="button" aria-pressed={filtres.echeances.includes(e)} data-filtre-echeance={e}
                className={`tch-filtre-btn${filtres.echeances.includes(e) ? ' tch-filtre-btn--actif' : ''}`}
                onClick={() => changerFiltre(() => setFiltres((f) => ({ ...f, echeances: basculer(f.echeances, e) })))}>{MOTS_ECHEANCE[e]}</button>
            ))}
          </div>
          <div className="tch-filtre" role="group" aria-label="Statut">
            <span className="tch-plein-mot">Statut</span>
            {STATUTS_PLEINE_PAGE.map((x) => (
              <button key={x} type="button" aria-pressed={filtres.statuts.includes(x)} data-filtre-statut-plein={x}
                className={`tch-filtre-btn${filtres.statuts.includes(x) ? ' tch-filtre-btn--actif' : ''}`}
                onClick={() => changerFiltre(() => setFiltres((f) => ({ ...f, statuts: basculer(f.statuts, x) })))}>{MOTS_STATUT_PLEINE_PAGE[x]}</button>
            ))}
          </div>
          <label className="tch-plein-champ">
            <span className="tch-plein-mot">Collaborateur</span>
            <select value={filtres.collaborateur ?? ''} onChange={(e) => { const v = e.target.value; changerFiltre(() => setFiltres((f) => ({ ...f, collaborateur: v === '' ? null : v }))); }} data-filtre-collaborateur>
              <option value="">Tous</option>
              {collaborateurs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="tch-plein-champ">
            <span className="tch-plein-mot">Bien</span>
            <select value={filtres.bien} onChange={(e) => { const v = e.target.value as FiltresTaches['bien']; changerFiltre(() => setFiltres((f) => ({ ...f, bien: v }))); }} data-filtre-bien>
              <option value="tous">Avec ou sans bien</option>
              <option value="avec">Avec un bien</option>
              <option value="sans">Sans bien</option>
            </select>
          </label>
          <button type="button" className="tch-filtre-btn" data-reinitialiser-taches
            onClick={() => changerFiltre(() => { setFiltres(FILTRES_TACHES_VIDES); setTri(TRI_TACHES_DEFAUT); setQui('toutes'); setStatut('toutes'); setPastille(null); setRecherche(''); })}>
            Réinitialiser</button>
        </div>
      )}
      <ReglageEnvoi />
      {donnees.tronque && <p className="gst-tronc">La liste est tronquée : toutes les tâches ne sont pas affichées.</p>}
      <div className="tch-zone-liste" ref={zoneListe} data-zone-liste style={hauteurMin > 0 ? { minHeight: `${hauteurMin}px` } : undefined}>
      <div ref={contenuListe}>
      {listePlein.length === 0 && terminees.length === 0 && (qui !== 'toutes' || statut !== 'toutes' || pastille !== null || filtresActifs)
        ? <p className="tch-vide tch-vide-filtre" role="status">{MOT_AUCUNE_TACHE_FILTRE}</p>
        : listePlein.length === 0 && filtresActifs
        ? <p className="tch-vide tch-vide-filtre" role="status">{MOT_AUCUNE_TACHE_FILTRE}</p>
        : listePlein.length === 0
        ? <p className="tch-vide">{qui === 'confiees' ? 'Aucune tâche à faire ne vous est confiée.' : qui === 'collaborateurs' ? 'Aucune tâche à faire confiée à un collaborateur.' : qui === 'commandees' ? 'Aucune tâche commandée par vous.' : 'Aucune tâche à faire.'} Une tâche se crée par « + Créer une tâche », ou depuis la fiche d’un bien (« + Tâche »).</p>
        : (
          <ul className="tch-liste">
            {listePlein.map((t) => (
              <LigneTache key={t.id} tache={t} maintenant={maintenant} avecAdresse onOuvrirBien={onOuvrirBien}
                onDetail={setDetail} onEcrire={onEcrire} deplie={lignes.estDepliee(t.id)} onBasculer={() => lignes.basculer(t.id)} />
            ))}
          </ul>
        )}
      {terminees.length > 0 && !avecTerminees && (
        <details className="tch-terminees" open={termineesOuvertes}
          onToggle={(e) => setTermineesOuvertes((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{TITRE_TERMINEES} ({terminees.length})</summary>
          <ul className="tch-liste">
            {terminees.map((t) => (
              <LigneTache key={t.id} tache={t} maintenant={maintenant} avecAdresse onOuvrirBien={onOuvrirBien}
                onDetail={setDetail} onEcrire={onEcrire} deplie={lignes.estDepliee(t.id)} onBasculer={() => lignes.basculer(t.id)} />
            ))}
          </ul>
        </details>
      )}
      </div>
      </div>
      {detail !== null && <FenetreTache mode={{ sorte: 'detail', id: detail }} onFermer={() => setDetail(null)} onEcrire={onEcrire} />}
      {creation && (
        <FenetreTache mode={{ sorte: 'creer', lotId: null, lotCle: null, adresse: '' }} onFermer={() => setCreation(false)}
          onEcrire={onEcrire} onCree={(m) => { setCree(m); void charger(); }} />
      )}
    </section>
  );
}

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — LE RÉGLAGE « ENVOYER LES DEMANDES D'ACCEPTATION PAR MAIL » ═════════════════════
 * Désactivé par défaut. Visible de tous (on sait si les mails partent), modifiable par un ADMINISTRATEUR seulement.
 */
function ReglageEnvoi() {
  const [r, setR] = useState<{ envoiMail: boolean; modifiable: boolean; modifieParLibelle: string | null; agendaInstalle: boolean; envoiAgenda: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    let annule = false;
    void fetch('/api/admin/gestion/taches/reglage', { cache: 'no-store' }).then((x) => x.json()).then((d) => {
      if (!annule && d?.etat === 'ok') setR({ envoiMail: d.envoiMail === true, modifiable: d.modifiable === true, modifieParLibelle: d.modifieParLibelle ?? null, agendaInstalle: d.agendaInstalle === true, envoiAgenda: d.envoiAgenda === true });
    }).catch(() => {});
    return () => { annule = true; };
  }, []);
  if (r === null) return null;
  /* 🔴 LOT TACHES-AGENDA — deux interrupteurs, la même porte : `envoiMail` (demandes par mail) ou `envoiAgenda`. */
  const basculer = async (cle: 'envoiMail' | 'envoiAgenda' = 'envoiMail') => {
    setOccupe(true);
    const res = await fetch('/api/admin/gestion/taches/reglage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [cle]: !r[cle] }),
    }).catch(() => null);
    const d = res === null ? null : await res.json().catch(() => null) as { message?: string; erreur?: string } | null;
    if (res !== null && res.ok) setR({ ...r, [cle]: !r[cle] });
    setMessage(d?.message ?? d?.erreur ?? 'Le serveur ne répond pas.');
    setOccupe(false);
  };
  return (
    <details className="tch-reglage">
      <summary>Réglage — envoi des demandes par mail : <b>{r.envoiMail ? 'activé' : 'désactivé'}</b>
        {r.agendaInstalle && <> · agenda Google : <b data-reglage-agenda>{r.envoiAgenda ? 'activé' : 'désactivé'}</b></>}</summary>
      <label className="tch-reglage-case">
        <input type="checkbox" checked={r.envoiMail} disabled={!r.modifiable || occupe} onChange={() => void basculer()} />
        Envoyer les demandes d’acceptation par mail (depuis gestion@)
      </label>
      {r.agendaInstalle && (
        <label className="tch-reglage-case">
          <input type="checkbox" checked={r.envoiAgenda} disabled={!r.modifiable || occupe} data-case-agenda
            onChange={() => void basculer('envoiAgenda')} />
          Envoyer les tâches dans l’agenda Google (agenda de la personne concernée, après son acceptation)
        </label>
      )}
      {!r.modifiable && <p className="tch-vide">Seul un administrateur peut changer ce réglage.</p>}
      {message && <p className="tch-vide" role="status">{message}</p>}
    </details>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_TABLEAU = `
/* Arno (10/11/2026) — la ligne de titre repliable (ecran partage) : toute la ligne se clique, cible de 44 px ; le repere rouge, avec le mot. */
.tch-repli{appearance:none;border:0;background:none;padding:0;margin:0;min-height:44px;font:inherit;color:inherit;display:inline-flex;align-items:center;gap:.4rem;cursor:pointer}
.tch-fleche{display:inline-block;width:1em}
.tch-urgentes{margin-left:.6rem;font-size:.9rem;font-weight:800;color:var(--color-svv-red)}
/* Arno (10/11/2026) — le lien « Ouvrir en pleine page » en bout de ligne (comme celui des preavis) ; les outils de la pleine page. */
.tch-plein{margin-left:auto;display:inline-flex;align-items:center;min-height:44px;padding:0 4px;border:0;background:none;font:inherit;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.blr-bloc .tch-tableau-tete{flex-wrap:nowrap}
.tch-plein-outils{display:flex;flex-direction:column;gap:8px}
.tch-plein-outils{align-items:flex-start}
.tch-plein-outils .tch-filtre{display:flex;flex-wrap:wrap;align-items:center;width:fit-content;max-width:100%;box-sizing:border-box}
.tch-plein-outils .tch-filtre > .tch-plein-mot{padding:0 10px}
.tch-plein-outils .tch-plein-champ{align-self:stretch}
.tch-plein-outils [data-reinitialiser-taches]{border:1px solid var(--color-svv-line-strong);border-radius:999px;min-height:44px}
.tch-plein-champ{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.tch-plein-champ input,.tch-plein-champ select{min-height:44px;box-sizing:border-box;flex:1 1 240px;max-width:480px;padding:0 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;font:inherit;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.tch-plein-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
/* LOT GESTION-TACHES-PAGE — le retour de la page pleine : sur sa ligne, a sa largeur naturelle. */
.tch-retour{flex:0 0 100%}
.tch-retour .svv-btn{width:auto}
.tch-filtres{display:flex;flex-wrap:wrap;gap:8px}
/* LOT FILTRE-ECRAN-FIXE : la zone ne se retracte pas (hauteur minimale posee par l'ecran) et n'ancre pas le defilement ;
   le message d'un filtre vide est centre dans la zone. */
.tch-zone-liste{position:relative;overflow-anchor:none}
.tch-vide-filtre{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;
  font-size:.95rem}
.tch-compteur--attente{border-style:dashed}
.tch-reglage{font-size:.85rem;color:var(--color-svv-muted)}
.tch-reglage > summary{cursor:pointer;min-height:32px;display:flex;align-items:center;gap:.3rem}
.tch-reglage-case{display:flex;align-items:center;gap:.5rem;min-height:40px;color:var(--color-svv-ink)}
.tch-tableau{display:flex;flex-direction:column;gap:8px;margin:18px 0 8px;padding:14px;
  border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.tch-tableau-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.tch-tableau-tete .gst-titre{margin:0}
.tch-filtre{display:inline-flex;border:1px solid var(--color-svv-line-strong);border-radius:999px;overflow:hidden}
.tch-filtre-btn{min-height:40px;padding:0 .9rem;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);
  font:inherit;font-size:.85rem;cursor:pointer}
/* LOT FILTRE-COLLABORATEURS : le filtre choisi prend NOTRE rouge, celui du bouton « + Tache » et du bandeau (#a30402,
   variable --tch-rouge-plein), texte blanc : le jeton --color-svv-red passe a #ff6b6b en Sombre, ou le blanc ne se lirait pas. */
.tch-filtre-btn--actif{background:var(--tch-rouge-plein);color:#ffffff;font-weight:700}
.tch-filtre-btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* LOT GESTION-STATUTS-TACHES : sur telephone, chaque groupe de filtres prend la largeur et ses boutons passent a la
   ligne dans le cadre, au lieu de depasser de l ecran. Grand ecran : inchange. */
@media (max-width:640px){
  .tch-filtres{flex:1 1 100%;min-width:0}
  .tch-filtre{display:flex;flex-wrap:wrap;width:100%;box-sizing:border-box;border-radius:14px}
  .tch-filtre-btn{flex:1 1 auto}
}
`;
