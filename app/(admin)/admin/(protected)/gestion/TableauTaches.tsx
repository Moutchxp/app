'use client';

import { useCallback, useEffect, useState } from 'react';
/* 🔴 LOT FILTRE-ECRAN-FIXE — l'écran ne bouge pas quand on change de filtre. */
import { MOT_AUCUNE_TACHE_FILTRE, useZoneStable } from './defilementFige';
import {
  compterTaches, filtrerParPastille, type PastilleFiltre, repartirTaches, type Tache,
} from '../../../../lib/gestion/taches';
import { CSS_TACHES, LigneTache, PastillesFiltres, useLignesDepliees, useMaintenant } from './LigneTache';
import {
  compterEnAttente, filtrerParAcceptation, MOTS_QUI, ORDRE_FILTRES_QUI, MOTS_STATUT, type FiltreQui, type FiltreStatut,
} from '../../../../lib/gestion/acceptationTache';
import { FenetreTache } from './FenetreTache';
import { ecouterTaches, lireTaches } from './tachesClient';

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
export function TableauTaches({ onOuvrirBien, onEcrire }: {
  onOuvrirBien: (lotId: number) => void;
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

  if (!installe || donnees === null) return null;
  const visibles = filtrerParAcceptation(donnees.taches, qui, statut, donnees.moi);
  // 🔴 ORDRE CHRONOLOGIQUE STRICT : l'échéance la plus proche en haut (en retard compris), la plus lointaine en bas.
  const toutes = repartirTaches(visibles, maintenant);
  // Les compteurs des pastilles suivent « qui » et « statut », pas la pastille elle-même.
  const n = compterTaches(toutes.ouvertes, maintenant);
  const enAttente = compterEnAttente(toutes.ouvertes);
  const ouvertes = filtrerParPastille(toutes.ouvertes, pastille, maintenant);
  const terminees = filtrerParPastille(toutes.terminees, pastille, maintenant);

  return (
    <section className="tch-tableau" aria-labelledby="tch-tableau-titre">
      <style>{CSS_TACHES}{CSS_TABLEAU}</style>
      <div className="tch-tableau-tete">
        <h2 className="gst-titre" id="tch-tableau-titre">
          Tâches <span className="gst-compte">{ouvertes.length}</span>
        </h2>
        <div className="tch-filtres">
          <div className="tch-filtre" role="group" aria-label="Quelles tâches">
            {ORDRE_FILTRES_QUI.map((f) => (
              <button key={f} type="button" aria-pressed={qui === f} data-filtre-qui={f}
                className={`tch-filtre-btn${qui === f ? ' tch-filtre-btn--actif' : ''}`} onClick={() => changerFiltre(() => setQui(f))}>
                {MOTS_QUI[f]}
              </button>
            ))}
          </div>
          <div className="tch-filtre" role="group" aria-label="Quel statut">
            {(['toutes', 'en_attente', 'acceptee', 'refusee'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={statut === f} data-filtre-statut={f}
                className={`tch-filtre-btn${statut === f ? ' tch-filtre-btn--actif' : ''}`} onClick={() => changerFiltre(() => setStatut(f))}>
                {MOTS_STATUT[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* 🔴 LOT PASTILLES-FILTRES — les pastilles sont des filtres (écran fixe, comme les autres). */}
      <PastillesFiltres n={n} enAttente={enAttente} active={pastille} onChoisir={(p) => changerFiltre(() => setPastille(p))} />
      <ReglageEnvoi />
      {donnees.tronque && <p className="gst-tronc">La liste est tronquée : toutes les tâches ne sont pas affichées.</p>}
      <div className="tch-zone-liste" ref={zoneListe} data-zone-liste style={hauteurMin > 0 ? { minHeight: `${hauteurMin}px` } : undefined}>
      <div ref={contenuListe}>
      {ouvertes.length === 0 && terminees.length === 0 && (qui !== 'toutes' || statut !== 'toutes' || pastille !== null)
        ? <p className="tch-vide tch-vide-filtre" role="status">{MOT_AUCUNE_TACHE_FILTRE}</p>
        : ouvertes.length === 0
        ? <p className="tch-vide">{qui === 'confiees' ? 'Aucune tâche à faire ne vous est confiée.' : qui === 'collaborateurs' ? 'Aucune tâche à faire confiée à un collaborateur.' : qui === 'commandees' ? 'Aucune tâche commandée par vous.' : 'Aucune tâche à faire.'} Une tâche se crée depuis la fiche d’un bien (« + Tâche »).</p>
        : (
          <ul className="tch-liste">
            {ouvertes.map((t) => (
              <LigneTache key={t.id} tache={t} maintenant={maintenant} avecAdresse onOuvrirBien={onOuvrirBien}
                onDetail={setDetail} onEcrire={onEcrire} deplie={lignes.estDepliee(t.id)} onBasculer={() => lignes.basculer(t.id)} />
            ))}
          </ul>
        )}
      {terminees.length > 0 && (
        <details className="tch-terminees" open={termineesOuvertes}
          onToggle={(e) => setTermineesOuvertes((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Faites ou annulées ({terminees.length})</summary>
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
`;
