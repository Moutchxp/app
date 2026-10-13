'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  compterEnAttenteBien, compterTaches, filtrerParPastille, type PastilleFiltre, motEnAttenteBouton, ORDRE_COULEURS, phraseEnAttenteBien, repartirTaches,
  type Tache,
} from '../../../../lib/gestion/taches';
import { CSS_TACHES, LigneTache, PastillesFiltres, useLignesDepliees, useMaintenant } from './LigneTache';
/* 🔴 LOT FICHE-CARTE-TACHE — les encadrés de contacts des cartes, et la fiche d'aujourd'hui pour « Mettre à jour ». */
import { CSS_CONTACTS_TACHE } from './ContactsTache';
import { MOT_AUCUNE_TACHE_FILTRE, useZoneStable } from './defilementFige';
import type { ContactSource } from '../../../../lib/gestion/contactsTache';
import { FenetreTache } from './FenetreTache';
import { demanderDepliageBien, ecouterDepliageBien, ecouterTaches, lireContactsDuBien, lireTaches } from './tachesClient';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES EN HAUT DE LA FICHE DU BIEN ══════════════════════════════════════════════════
 *
 * Arno : « un bouton “+ Tâche”, à côté de “Dossier Drive ↗”, sans rien déplacer ni retirer ; juste en dessous, le
 * récapitulatif des tâches DE CE BIEN avec le code couleur ; quand le bien n'a aucune tâche ouverte, seul le
 * bouton s'affiche. »
 *
 * 🔴 DEUX COMPOSANTS, PARCE QUE CE SONT DEUX ENDROITS DE LA FICHE : le bouton vit dans la zone d'actions de
 * l'en-tête (`.ann-tete-actions`), le récapitulatif sous l'en-tête. Ils ne partagent aucun état : le signal des
 * tâches (`tachesClient.ts`) fait relire le récapitulatif quand le bouton crée une tâche.
 *
 * ⚠️ SANS LA MIGRATION 346, NI L'UN NI L'AUTRE NE REND RIEN : la fiche est exactement celle d'avant ce lot.
 *
 * ══ 🔴🔴 LOT FICHE-TACHES-EN-ATTENTE (Arno, 13/10/2026) ═══════════════════════════════════════════════════════════
 *   · « + Tâche » : dès 1 tâche en attente sur le bien, fond ROUGE, texte blanc, et « 2 en attente » en petit SOUS le
 *     libellé ; à 0, inchangé. Le clic ouvre toujours la fenêtre de création ;
 *   · « Tâches de ce bien » : REPLIÉ PAR DÉFAUT sur une ligne rouge (« 2 tâches en attente sur ce bien », pastilles,
 *     ▸) ; un clic déplie le bloc tel qu'il était, un autre le replie. Replié à chaque ouverture de fiche ; reste
 *     déplié après une création (signal du bouton), une modification, « Faite » ou « Décaler » faits depuis la fiche
 *     (ces gestes se font DANS le bloc déplié, et rien ne le replie en se relisant) ;
 *   · le nombre vient de `compterEnAttenteBien`, la MÊME fonction pour le bouton et le bloc.
 * ⚠️ ROUGE FIXE #a30402 (pas le jeton, qui passe à #ff6b6b en Sombre) : le blanc dessus tient le contraste dans les
 * deux thèmes.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/** Le bouton « + Tâche » et sa fenêtre de création. Ne rend rien tant que les tâches ne sont pas installées. */
export function BoutonTache({ lotId, lotCle, adresse, onEcrire }: {
  lotId: number; lotCle: string; adresse: string;
  /** 🔴 LOT TACHES-1-BIS — ouvre le composeur « Nouveau message », adresse pré-remplie, sans rien envoyer. */
  onEcrire?: (email: string) => void;
}) {
  const [installe, setInstalle] = useState(false);
  /** 🔴 LOT FICHE-TACHES-EN-ATTENTE — le nombre de tâches en attente du bien (relu après chaque geste). */
  const [enAttente, setEnAttente] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  /** 🔴 La confirmation d'une création, à côté du bouton : la fenêtre se ferme, mais jamais en silence. */
  const [confirmation, setConfirmation] = useState<string | null>(null);
  useEffect(() => {
    if (confirmation === null) return;
    const t = window.setTimeout(() => setConfirmation(null), 8000);
    return () => window.clearTimeout(t);
  }, [confirmation]);
  const charger = useCallback(async () => {
    const r = await lireTaches(lotId);
    setInstalle(r.etat === 'ok');
    if (r.etat === 'ok') setEnAttente(compterEnAttenteBien(r.taches));
  }, [lotId]);
  useEffect(() => {
    let annule = false;
    void lireTaches(lotId).then((r) => {
      if (annule) return;
      setInstalle(r.etat === 'ok');
      setEnAttente(r.etat === 'ok' ? compterEnAttenteBien(r.taches) : 0);
    });
    return () => { annule = true; };
  }, [lotId]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);
  if (!installe) return null;
  return (
    <>
      <style>{CSS_BOUTON}</style>
      <button type="button" className={`svv-btn svv-btn-outline gst-btn${enAttente > 0 ? ' tch-btn-attente' : ''}`}
        data-en-attente={enAttente} onClick={() => { setConfirmation(null); setOuvert(true); }}>
        {enAttente > 0
          ? <span className="tch-btn-attente-mots"><span>+ Tâche</span><small className="tch-btn-attente-nb">{motEnAttenteBouton(enAttente)}</small></span>
          : '+ Tâche'}
      </button>
      {confirmation !== null && <span className="tch-confirmation" role="status">✓ {confirmation}</span>}
      {ouvert && (
        <FenetreTache mode={{ sorte: 'creer', lotId, lotCle, adresse }} onFermer={() => setOuvert(false)} onEcrire={onEcrire}
          onCree={(c) => { setConfirmation(c); demanderDepliageBien(lotId); }} />
      )}
    </>
  );
}

/** Le récapitulatif des tâches DE CE BIEN. Rien quand il n'y a aucune tâche ouverte. */
export function RecapTachesDuBien({ lotId, onEcrire }: { lotId: number; onEcrire?: (email: string) => void }) {
  const maintenant = useMaintenant();
  const [taches, setTaches] = useState<Tache[] | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  /** 🔴 LOT FICHE-TACHES-EN-ATTENTE — replié par défaut, et de nouveau à chaque fiche ouverte. */
  const [deplie, setDeplie] = useState(false);
  /** 🔴 LOT TACHES-LIGNES-COMPACTES — les lignes dépliées (toutes repliées par défaut), et le repli des terminées. */
  const lignes = useLignesDepliees();
  const [termineesOuvertes, setTermineesOuvertes] = useState(false);
  /** 🔴 LOT PASTILLES-FILTRES — un clic sur une pastille du bandeau DÉPLIE le bloc et filtre ; re-clic : toutes. */
  const [pastille, setPastille] = useState<PastilleFiltre | null>(null);
  useEffect(() => { setPastille(null); }, [lotId]);
  /** L'écran reste fixe au changement de pastille (LOT FILTRE-ECRAN-FIXE, point 4 : le bloc a désormais des filtres). */
  const { zone: zoneListe, contenu: contenuListe, hauteurMin, changerFiltre } = useZoneStable();
  useEffect(() => { setDeplie(false); }, [lotId]);
  useEffect(() => ecouterDepliageBien(lotId, () => setDeplie(true)), [lotId]);

  const charger = useCallback(async () => {
    const r = await lireTaches(lotId);
    // UN ÉCHEC SE TAIT : ce bloc est un plus sur la fiche ; une bannière d'erreur ferait plus de mal que l'absence.
    setTaches(r.etat === 'ok' ? r.taches : []);
  }, [lotId]);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => ecouterTaches(() => { void charger(); }), [charger]);

  /* 🔴 LOT FICHE-CARTE-TACHE — la fiche d'aujourd'hui (contacts du bien), lue quand le bloc est déplié et relue après
     chaque geste : c'est elle qui dit « Coordonnées modifiées depuis » / « Mettre à jour » sur un encadré. */
  const [sources, setSources] = useState<ContactSource[] | null>(null);
  const [versionSources, setVersionSources] = useState(0);
  useEffect(() => ecouterTaches(() => setVersionSources((v) => v + 1)), []);
  useEffect(() => {
    if (!deplie) return;
    let annule = false;
    void lireContactsDuBien(lotId).then((c) => { if (!annule) setSources(c); });
    return () => { annule = true; };
  }, [lotId, deplie, versionSources]);

  /* Une tâche dépliée qui vient d'être réalisée ou annulée passe dans « Faites ou annulées » : le repli s'ouvre, pour
     qu'on voie le résultat sur la carte restée dépliée. */
  const termineeDepliee = (taches ?? []).some((t) => t.etat !== 'a_faire' && lignes.ids.has(t.id));
  useEffect(() => { if (termineeDepliee) setTermineesOuvertes(true); }, [termineeDepliee]);

  const fenetre = detail !== null && <FenetreTache mode={{ sorte: 'detail', id: detail }} onFermer={() => setDetail(null)} onEcrire={onEcrire} />;
  if (taches === null) return null;
  const { ouvertes, terminees } = repartirTaches(taches, maintenant);
  if (ouvertes.length === 0) return fenetre || null;
  const n = compterTaches(ouvertes, maintenant);
  const filtreesOuvertes = filtrerParPastille(ouvertes, pastille, maintenant);
  const filtreesTerminees = filtrerParPastille(terminees, pastille, maintenant);
  const pastilles = (
    <PastillesFiltres n={n} active={pastille} seulementNonVides
      onChoisir={(p) => changerFiltre(() => { setPastille(p); if (p !== null) setDeplie(true); })} />
  );
  /* 🔴 LOT FICHE-TACHES-EN-ATTENTE — la ligne rouge, repliée par défaut ; elle reste en tête quand le bloc est déplié
     (un nouveau clic le replie). Le contenu déplié est celui d'avant, sans rien retirer. */
  const repli = (
    /* 🔴 LOT PASTILLES-FILTRES — un élément « bouton » (role) et non un <button> : il porte désormais des pastilles qui
       sont elles-mêmes des boutons, et un bouton ne peut en contenir un autre. Clavier : Entrée / Espace. */
    <div className="tch-repli" role="button" tabIndex={0} aria-expanded={deplie} aria-controls={`tch-bien-corps-${lotId}`}
      data-repli-taches onClick={() => setDeplie((d) => !d)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDeplie((d) => !d); } }}>
      <span className="tch-repli-corps">
        <span className="tch-repli-phrase">{phraseEnAttenteBien(compterEnAttenteBien(taches))}</span>
        {pastilles}
      </span>
      <span className="tch-repli-fleche" aria-hidden="true">{deplie ? '▾' : '▸'}</span>
    </div>
  );
  if (!deplie) {
    return (
      <section className="tch-bloc-fiche tch-bloc-fiche--replie" data-taches-bien="replie">
        <style>{CSS_TACHES}{CSS_REPLI}</style>
        {repli}
      </section>
    );
  }

  return (
    <section className="tch-bloc-fiche" aria-label="Tâches de ce bien" data-taches-bien="deplie">
      <style>{CSS_TACHES}{CSS_REPLI}{CSS_CONTACTS_TACHE}</style>
      {repli}
      {/* 🔴 LOT FICHE-CARTE-TACHE, POINT 8 (accord d'Arno) — la seconde ligne « Tâches de ce bien » et ses pastilles,
          qui répétaient la ligne rouge, ne s'affichent plus : la ligne rouge reste seule en tête. */}
      <div id={`tch-bien-corps-${lotId}`} className="tch-zone-liste" ref={zoneListe} data-zone-liste
        style={hauteurMin > 0 ? { minHeight: `${hauteurMin}px` } : undefined}>
      <div ref={contenuListe}>
      {filtreesOuvertes.length === 0 && filtreesTerminees.length === 0 && pastille !== null && (
        <p className="tch-vide tch-vide-filtre" role="status">{MOT_AUCUNE_TACHE_FILTRE}</p>
      )}
      {/* 🔴 LOT TACHES-LIGNES-COMPACTES — des lignes de deux lignes, repliées par défaut ; un clic déplie la carte. */}
      <ul className="tch-liste tch-liste--cartes">
        {filtreesOuvertes.map((t) => <LigneTache key={t.id} tache={t} maintenant={maintenant} onDetail={setDetail}
          sources={sources} onEcrire={onEcrire} deplie={lignes.estDepliee(t.id)} onBasculer={() => lignes.basculer(t.id)} />)}
      </ul>
      {filtreesTerminees.length > 0 && (
        <details className="tch-terminees" open={termineesOuvertes}
          onToggle={(e) => setTermineesOuvertes((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Faites ou annulées ({filtreesTerminees.length})</summary>
          <ul className="tch-liste tch-liste--cartes">
            {filtreesTerminees.map((t) => <LigneTache key={t.id} tache={t} maintenant={maintenant} onDetail={setDetail}
              sources={sources} onEcrire={onEcrire} deplie={lignes.estDepliee(t.id)} onBasculer={() => lignes.basculer(t.id)} />)}
          </ul>
        </details>
      )}
      </div>
      </div>
      {fenetre}
    </section>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous.
   Rouge FIXE (#a30402) : le jeton passe a #ff6b6b en Sombre, ou le blanc ne tiendrait pas le contraste. */
const CSS_BOUTON = `
.svv-btn.tch-btn-attente,.svv-btn.tch-btn-attente:hover{background:#a30402;border-color:#a30402;color:#fff}
.svv-btn.tch-btn-attente:hover{background:#850302;border-color:#850302}
.svv-btn.tch-btn-attente:focus-visible{outline:2px solid #fff;outline-offset:-4px}
.tch-btn-attente-mots{display:inline-flex;flex-direction:column;align-items:center;line-height:1.1}
.tch-btn-attente-nb{font-size:.72rem;font-weight:600;opacity:.95}
`;

const CSS_REPLI = `
.tch-bloc-fiche--replie{padding:0;border:0;background:none}
.tch-repli{box-sizing:border-box;display:flex;flex-wrap:nowrap;align-items:center;gap:.7rem;width:100%;min-height:44px;margin:0;
  padding:6px 12px;border:1px solid #a30402;border-radius:.8rem;background:#a30402;color:#fff;font:inherit;
  font-size:.92rem;font-weight:700;text-align:left;cursor:pointer}
.tch-repli:hover{background:#850302;border-color:#850302}
.tch-repli:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.tch-repli-corps{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;flex:1 1 auto;min-width:0}
.tch-repli .tch-compteur{font-weight:500;background:#ffffff;color:#16202c;border-color:#ffffff}
/* LOT PASTILLES-FILTRES : sur le bandeau rouge, la pastille active (rouge) se detache par un cerne blanc. */
.tch-repli button.tch-compteur.tch-compteur--actif{border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.tch-repli-fleche{flex:0 0 auto;font-size:1rem}
.tch-bloc-fiche:not(.tch-bloc-fiche--replie) > .tch-repli{margin-bottom:8px}
.tch-bloc-fiche:not(.tch-bloc-fiche--replie){background:var(--color-svv-field)}
.tch-bloc-fiche .tch-liste--cartes{gap:6px}
`;
