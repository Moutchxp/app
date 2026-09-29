'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyserTerme, formaterDateIso, messageRechercheVide, periodeOccupation, titreLogement,
} from '../../../../lib/gestion/annuaireRecherche';
import type {
  BienDuProprietaire, FicheLocataire, FicheLot, FicheProprietaire, LigneResultat,
  LogementDuLocataire, OccupationDuLot,
} from '../../../../lib/gestion/annuaireRepo';
// LOT FICHES-ANNUAIRE étape B — « la vie du bien » : tous ses mails, dans l'idiome de la boîte.
import { CSS_VIE_DU_BIEN, VieDuBien } from './VieDuBien';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import type { Cible } from '../../../../lib/gestion/rattachement';
// LOT FICHES-ANNUAIRE étape C — les personnes en CARTES côte à côte, modifiables sur place.
import { BlocCartes, CSS_CARTES, Ligne as LigneFiche, type GestesCartes, type Sujet } from './CartesPersonnes';
import { MOTIF_SANS_MIGRATION } from '../../../../lib/gestion/annuaireEdition';
// LOT FICHES-RETOUCHES — la nomenclature des coordonnées, partagée par tous les écrans de l'annuaire.
import { typeDeLibelle } from '../../../../lib/gestion/telephoneAffichage';

/**
 * LOT ANNUAIRE-1 — L'ÉCRAN « ANNUAIRE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL CHAMP DE RECHERCHE, et c'est la demande d'Arno mot pour mot : « trouver par nom, adresse, téléphone ou
 * mail qui est qui par rapport à un logement ». Quatre champs obligeraient à décider AVANT de taper dans lequel on
 * est — alors qu'on a sous les yeux un numéro sans savoir s'il est d'un propriétaire ou d'un locataire.
 *
 * 🔴 LES RÉSULTATS SONT GROUPÉS PAR LOGEMENT, parce que c'est l'unité de la question : « 12 rue X, Puteaux —
 * Propriétaire : … — Locataire actuel : … ». Chaque ligne porte le trio, et chaque nom du trio est cliquable.
 *
 * 🔴 LECTURE SEULE DANS CE LOT. Rien ne se saisit ici : WIPPIMMO fait foi, et une correction tapée dans cet écran
 * serait écrasée au prochain import sans prévenir. L'écran DIT de quand datent ses données, pour qu'on sache quoi
 * penser d'un numéro qui ne répond pas.
 *
 * 🔒 LES COORDONNÉES SONT CLIQUABLES, PAS RECOPIABLES AILLEURS : `tel:` compose, `mailto:` ouvre le courrier. Rien
 * n'est envoyé nulle part par cet écran.
 *
 * MOBILE D'ABORD (exigence transverse §15) : tout tient en une colonne à 390 px, aucune table à défilement
 * horizontal, cibles tactiles ≥ 44 px, AUCUNE interaction au seul survol — les fiches s'ouvrent au clic, et l'état
 * « locataire actuel » est dit par un MOT, jamais par une seule couleur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Reponse =
  | { etat: 'repos' }
  | { etat: 'charge' }
  | { etat: 'sans_schema' }
  | { etat: 'erreur'; message: string }
  | { etat: 'ok'; lignes: LigneResultat[]; tronque: boolean; importe: { le: string } | null };

type Fiche =
  | { etat: 'charge' }
  | { etat: 'erreur'; message: string }
  | { etat: 'proprietaire'; data: FicheProprietaire }
  | { etat: 'lot'; data: FicheLot }
  | { etat: 'locataire'; data: FicheLocataire };

/** Le temps de silence après la dernière frappe avant d'interroger. Assez court pour paraître instantané, assez
 *  long pour ne pas lancer une requête par lettre. */
const ATTENTE_FRAPPE_MS = 250;

/**
 * ══ 🔴 CE QUE « + AJOUTER » DEMANDE, SELON L'ENDROIT D'OÙ L'ON CLIQUE ═════════════════════════════════════════════
 *
 * Sur la fiche d'un propriétaire, « + Ajouter un propriétaire » veut dire CO-PROPRIÉTAIRE DU MÊME ENSEMBLE DE BIENS :
 * la personne est donc rattachée à tous les biens EN GESTION de la fiche. Sur la fiche d'un bien, elle est rattachée
 * à ce seul bien. Le même panneau sert aux deux : c'est la LISTE DES LOTS qui change, pas le geste.
 *
 * ⚠️ `lots` PEUT ÊTRE VIDE — une personne existe alors dans l'annuaire sans lien. C'est un état légitime (un bailleur
 * dont on ne gère rien encore) et la base le porte déjà : 0 lot n'est pas une erreur.
 */
interface DemandeAjout {
  sujet: Sujet;
  lots: number[];
  titre: string;
  /** Vrai pour un occupant : on demande aussi la date d'entrée, qui fait le bail. */
  avecDate: boolean;
  motDate: string;
}

export function Annuaire({ fiche, onFiche, onRetour, onEcrire, onHistorique, maintenant, onOuvrirFil }: {
  fiche: FicheUrl | null;
  onFiche: (f: FicheUrl | null) => void;
  onRetour: () => void;
  /**
   * 🔴 LOT FICHES-ANNUAIRE étape B — l'heure de référence de l'écran, pour que « il y a 3 h » soit le même partout.
   * Par défaut, maintenant : une fiche ouverte sans référence n'a pas à afficher des dates fausses.
   */
  maintenant?: Date;
  /** Ouvre l'échange d'un mail de la « vie du bien ». Absent = la ligne reste lisible, sans ce chemin. */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /** Ouvre « Nouveau message » de la tuile avec ce destinataire. Absent = le lien `mailto:` du système. */
  onEcrire?: (email: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique des échanges d'un logement ou d'un propriétaire. Absent = le bouton
   * ne s'affiche pas : la fiche reste exactement celle du lot ANNUAIRE-1.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  const [terme, setTerme] = useState('');
  /**
   * ⚠️ UNE SEULE RÉFÉRENCE DE TEMPS POUR TOUT L'ÉCRAN, figée au montage : recalculer `new Date()` à chaque rendu
   * ferait glisser les « il y a 3 min » d'une ligne à l'autre, et l'on croirait à des mails différents.
   */
  const [refTemps] = useState(() => maintenant ?? new Date());
  const [reponse, setReponse] = useState<Reponse>({ etat: 'repos' });
  const [detail, setDetail] = useState<Fiche | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  /**
   * ══ 🔴 LOT FICHES-ANNUAIRE (étape C) — CE QUI FAIT RELIRE LA FICHE APRÈS UNE MODIFICATION ═══════════════════════
   *
   * Un compteur, et il entre dans les dépendances du chargement. Après un enregistrement, on RELIT tout depuis la
   * base plutôt que de rapiécer l'état local.
   *
   * 🔴 POURQUOI RELIRE ET NON RAPIÉCER. Le serveur ne fait pas que ranger ce qu'on lui envoie : il recompose le nom
   * affiché, réveille une coordonnée archivée qui revient, réordonne les cartes, pose des verrous. Un état local
   * mis à jour à la main finirait par montrer autre chose que la base — et c'est précisément ce genre d'écart qui
   * fait douter de tout l'écran. Une lecture de plus, c'est une requête ; une divergence, c'est un bogue.
   */
  const [rafraichi, setRafraichi] = useState(0);
  const recharger = useCallback(() => setRafraichi((n) => n + 1), []);
  const [ajout, setAjout] = useState<DemandeAjout | null>(null);
  /**
   * ══ 🔴 LOT FICHES-RETOUCHES — « HISTORIQUE » OUVRE LA FICHE DU BIEN, POSÉE SUR SA « VIE DU BIEN » ═══════════════
   *
   * Le bouton d'une carte de bien mène à la fiche de ce bien, et la fait s'ouvrir AU BON ENDROIT — sur la liste de
   * ses échanges, qui est ce qu'on venait voir.
   *
   * 🔴 UN ÉTAT, ET NON UN MORCEAU D'ADRESSE. L'adresse d'une fiche est `?ecran=annuaire&fiche=lot-312` : lui
   * ajouter une ancre obligerait `ecranUrl` à porter une notion d'« endroit dans la page », que rien d'autre
   * n'utilise. Cette intention ne survit d'ailleurs PAS à un rechargement — et c'est voulu : revenir sur la fiche
   * par son adresse doit la montrer par le haut, comme n'importe quelle fiche.
   */
  const [vieDuBienVisee, setVieDuBienVisee] = useState<number | null>(null);
  const ouvrirVieDuBien = useCallback((lotId: number) => {
    setVieDuBienVisee(lotId);
    onFiche({ sorte: 'lot', id: lotId });
  }, [onFiche]);

  // ── LA RECHERCHE ────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = terme.trim();
    if (t === '') { setReponse({ etat: 'repos' }); return; }
    let vivant = true;
    setReponse({ etat: 'charge' });
    const minuterie = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; data?: { lignes?: LigneResultat[]; tronque?: boolean }; importe?: { le: string } | null;
          };
          if (!vivant) return;
          if (d.etat === 'sans_schema') { setReponse({ etat: 'sans_schema' }); return; }
          if (d.etat !== 'ok') { setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti.' }); return; }
          setReponse({
            etat: 'ok', lignes: d.data?.lignes ?? [], tronque: d.data?.tronque === true, importe: d.importe ?? null,
          });
        } catch {
          if (vivant) setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti : le serveur n’a pas répondu.' });
        }
      })();
    }, ATTENTE_FRAPPE_MS);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [terme]);

  // ── LA FICHE OUVERTE, QUI VIT DANS L'ADRESSE ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fiche === null) { setDetail(null); return; }
    let vivant = true;
    setDetail({ etat: 'charge' });
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/annuaire?${fiche.sorte}=${fiche.id}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: unknown };
        if (!vivant) return;
        if (d.etat === 'inconnu') { setDetail({ etat: 'erreur', message: 'Cette fiche n’existe pas (ou plus) dans l’annuaire.' }); return; }
        if (d.etat !== 'ok') { setDetail({ etat: 'erreur', message: 'Fiche illisible.' }); return; }
        if (fiche.sorte === 'proprietaire') setDetail({ etat: 'proprietaire', data: d.data as FicheProprietaire });
        else if (fiche.sorte === 'lot') setDetail({ etat: 'lot', data: d.data as FicheLot });
        else setDetail({ etat: 'locataire', data: d.data as FicheLocataire });
      } catch {
        if (vivant) setDetail({ etat: 'erreur', message: 'Fiche illisible : le serveur n’a pas répondu.' });
      }
    })();
    return () => { vivant = false; };
  }, [fiche, rafraichi]);

  const ouvrir = useCallback((sorte: FicheUrl['sorte'], id: number) => onFiche({ sorte, id }), [onFiche]);

  /**
   * ══ 🔴🔴 LES GESTES D'ÉCRITURE — UNE SEULE PORTE, UN SEUL TRAITEMENT DE REFUS ════════════════════════════════════
   *
   * Chaque geste rend `null` quand tout va bien, ou LE MOTIF DU REFUS, que la carte affiche là où on a cliqué.
   *
   * 🔴 UN REFUS N'EST PAS UNE ERREUR TECHNIQUE, et les deux ne se disent pas de la même façon : « cette adresse est
   * l'une des nôtres » est une phrase à lire et à corriger ; « la base n'a pas répondu » est une panne. Les
   * confondre ferait chercher un bogue là où il n'y a qu'une faute de frappe.
   *
   * ⚠️ `sans_schema` SE DIT AUSSI, avec son motif écrit : la migration 278 n'est pas appliquée. Il ne peut arriver
   * que si la migration disparaît entre le chargement de la fiche et le clic — mais il se dirait alors clairement,
   * plutôt que de laisser le bouton tourner dans le vide.
   */
  const envoyer = useCallback(async (corps: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/gestion/annuaire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { etat?: string; motif?: string; message?: string; data?: unknown };
      if (d.etat === 'ok') { recharger(); return null; }
      if (d.etat === 'sans_schema') return MOTIF_SANS_MIGRATION;
      if (d.etat === 'inconnu') return 'Cette fiche n’existe plus dans l’annuaire.';
      return d.motif ?? d.message ?? 'Enregistrement refusé.';
    } catch {
      return 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.';
    }
  }, [recharger]);

  const modifiable = detail !== null && detail.etat !== 'charge' && detail.etat !== 'erreur'
    && detail.data.modifiable;

  const gestes: GestesCartes = {
    modifiable,
    onEnregistrer: (sujet, id, champs) => envoyer({ action: 'modifier', sujet, id, champs }),
    onArchiver: (sujet, id, archiver) => envoyer({ action: archiver ? 'archiver' : 'restaurer', sujet, id }),
    onSeparer: (sujet, id, o) => envoyer({ action: 'separer', sujet, id, ...o }),
    onOrdonner: (sujet, ids) => envoyer({ action: 'ordonner', sujet, ids }),
    onAjouter: () => { /* remplacé par fiche : chaque vue sait à quel bien rattacher la personne */ },
    onEcrire,
  };

  /**
   * ══ 🔴🔴 CRÉER UNE PERSONNE, PUIS LA RATTACHER — EN DEUX TEMPS, ET C'EST VOULU ═══════════════════════════════════
   *
   * Arno : « ajouter un co-propriétaire », « ajouter un occupant ». Une personne neuve n'existe nulle part : il faut
   * d'abord la CRÉER (elle reçoit une clé « app-… », puisque WIPPIMMO ne la connaît pas), puis la RATTACHER au ou aux
   * biens concernés.
   *
   * 🔴 SI LE RATTACHEMENT ÉCHOUE, LA PERSONNE RESTE — et on le DIT. La défaire serait une suppression, et il n'y en a
   * pas dans ce module ; la taire laisserait une fiche orpheline que personne ne chercherait. On nomme donc les deux
   * moitiés du geste : « la fiche est créée, mais le rattachement au bien a échoué ».
   */
  const creerEtRattacher = useCallback(async (
    d: DemandeAjout, saisie: { civilite: string; nom: string; date: string },
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/gestion/annuaire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'creer', sujet: d.sujet, civilite: saisie.civilite, nom: saisie.nom }),
      });
      const cree = (await res.json()) as { etat?: string; motif?: string; data?: { id?: number } };
      if (cree.etat === 'sans_schema') return MOTIF_SANS_MIGRATION;
      if (cree.etat !== 'ok' || typeof cree.data?.id !== 'number') {
        return cree.motif ?? 'La fiche n’a pas pu être créée.';
      }
      const id = cree.data.id;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(saisie.date) ? saisie.date : null;
      for (const lotId of d.lots) {
        const motif = await envoyer(d.sujet === 'proprietaire'
          ? { action: 'ajouter-proprietaire', lotId, proprietaireId: id, depuis: date }
          : { action: 'ajouter-occupant', lotId, locataireId: id, entree: date });
        if (motif !== null) {
          recharger();
          return `La fiche « ${saisie.nom} » est créée, mais son rattachement au bien a échoué : ${motif}`;
        }
      }
      recharger();
      return null;
    } catch {
      return 'Création impossible : le serveur n’a pas répondu.';
    }
  }, [envoyer, recharger]);

  return (
    <div className="ann">
      <style>{CSS_ANNUAIRE}</style>
      <style>{CSS_VIE_DU_BIEN}</style>
      <style>{CSS_CARTES}</style>

      {/* ══ 🔴🔴 LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE : UN RETOUR, ET LA RECHERCHE ════════════════════════
          Arno, sur la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ». La fiche
          commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas — titre du module, sa
          description, le bandeau de relève, « Relève automatique », « Copie des pièces ». Ils sont retirés de CET
          écran (voir `GestionVue`), et restent là où ils servent : la page de la boîte.

          🔴 CE QU'ON GARDE, ET RIEN D'AUTRE : un fil de retour, et le champ de recherche — compact quand une
          fiche est ouverte, parce qu'on y cherche la personne SUIVANTE, pas la page où l'on est. */}
      <div className="ann-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-retour-haut"
          onClick={() => (fiche !== null ? onFiche(null) : onRetour())}>
          ← Retour
        </button>
        {fiche === null && <h2 className="ann-titre">Annuaire</h2>}
        {/* LE CHAMP. `type="search"` pour la croix d'effacement native. Son étiquette reste VISIBLE tant qu'on est
            sur les résultats ; sur une fiche elle devient l'invite du champ, faute de quoi elle ferait une ligne
            de plus au-dessus de ce qu'on est venu lire. */}
        {fiche !== null && (
          <input
            type="search" className="ann-champ ann-champ--compact" value={terme} autoComplete="off"
            aria-label="Chercher un propriétaire, un lot, un locataire"
            onChange={(e) => setTerme(e.target.value)}
            placeholder="Chercher une autre personne, un lot, une adresse…"
          />
        )}
      </div>

      {fiche === null && (
      <div className="ann-chercher">
        <label className="ann-label" htmlFor="ann-q">Chercher un propriétaire, un lot, un locataire</label>
        <input
          id="ann-q" ref={champ} type="search" className="ann-champ" value={terme} autoComplete="off"
          onChange={(e) => setTerme(e.target.value)}
          placeholder="nom, adresse, commune, téléphone, e-mail, n° de lot"
        />
        <p className="ann-aide">
          Tout est accepté&nbsp;: accents ou non, majuscules ou non, téléphone avec espaces, points ou +33.
        </p>
      </div>
      )}

      {/* 🔴 TAPER DANS LE CHAMP D'UNE FICHE RAMÈNE AUX RÉSULTATS. Sans cela, on taperait sans rien voir venir :
          les résultats sont rendus à la place de la fiche, et la fiche est encore ouverte. */}
      {fiche !== null && terme.trim() !== '' && (
        <p className="ann-bascule">
          <button type="button" className="ann-lien ann-lien--fort" onClick={() => onFiche(null)}>
            Voir les résultats pour « {terme.trim()} » →
          </button>
        </p>
      )}

      {/* LA FICHE OUVERTE PREND LA PLACE DE LA LISTE — pas de colonne à côté : à 390 px il n'y en a pas deux. Le
          bouton de retour ramène à la liste, qui n'a pas bougé (le texte tapé est resté). */}
      {fiche !== null ? (
        <section className="ann-fiche" aria-live="polite">
          {/* ⚠️ PLUS DE SECOND BOUTON DE RETOUR ICI : il est en haut de page, au-dessus de tout, et il ramène aux
              résultats comme celui-ci le faisait. En garder deux ferait deux chemins pour un même geste. */}
          {/* 🔴 LE PANNEAU D'AJOUT EST EN HAUT DE LA FICHE, jamais une fenêtre par-dessus : à 390 px une fenêtre
              modale cacherait ce qu'on est en train de remplir, et le clavier virtuel le reste. */}
          {ajout !== null && (
            <PanneauAjout d={ajout} onAnnuler={() => setAjout(null)}
              onCreer={async (saisie) => {
                const motif = await creerEtRattacher(ajout, saisie);
                if (motif === null) setAjout(null);
                return motif;
              }} />
          )}
          {detail === null || detail.etat === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
            : detail.etat === 'erreur' ? <p className="gst-erreur" role="status">{detail.message}</p>
              : detail.etat === 'proprietaire'
                ? <VueProprietaire f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique}
                  gestes={gestes} onAjout={setAjout} onHistoriqueDuBien={ouvrirVieDuBien} />
                : detail.etat === 'lot'
                  ? <VueLot f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique} onEcrire={onEcrire}
                    maintenant={refTemps} onOuvrirFil={onOuvrirFil} gestes={gestes} onAjout={setAjout}
                    poserSurVieDuBien={vieDuBienVisee === detail.data.id}
                    onVieDuBienPosee={() => setVieDuBienVisee(null)}
                    onDepart={(occupationId, sortie) => envoyer({ action: 'depart', occupationId, sortie })} />
                  : <VueLocataire f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique}
                    gestes={gestes} maintenant={refTemps} onOuvrirFil={onOuvrirFil}
                    onHistoriqueDuBien={ouvrirVieDuBien} />}
        </section>
      ) : (
        <Resultats reponse={reponse} terme={terme} ouvrir={ouvrir} />
      )}
    </div>
  );
}

/**
 * ══ 🔴 AJOUTER UNE PERSONNE — LE MINIMUM, ET RIEN DE PLUS ═════════════════════════════════════════════════════════
 *
 * Civilité, nom, et la date quand elle fait le bail. Tout le reste (téléphones, e-mails, qualité, note) se saisit
 * ENSUITE, sur la carte, avec le crayon : demander dix champs avant de créer ferait abandonner le geste à mi-chemin,
 * et une fiche à moitié remplie vaut mieux qu'une fiche jamais créée.
 */
function PanneauAjout({ d, onCreer, onAnnuler }: {
  d: DemandeAjout;
  onCreer: (saisie: { civilite: string; nom: string; date: string }) => Promise<string | null>;
  onAnnuler: () => void;
}) {
  const [civilite, setCivilite] = useState('');
  const [nom, setNom] = useState('');
  const [date, setDate] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  return (
    <form className="ann-bloc cp-form" onSubmit={(e) => {
      e.preventDefault();
      if (nom.trim() === '') { setRefus('Le nom est obligatoire.'); return; }
      setEnvoi(true);
      void (async () => { setRefus(await onCreer({ civilite, nom, date })); setEnvoi(false); })();
    }}>
      <p className="cp-form-titre">{d.titre}</p>
      <label className="cp-champ">
        <span className="cp-champ-mot">Civilité</span>
        <input className="cp-saisie" value={civilite} onChange={(e) => setCivilite(e.target.value)}
          placeholder="M. / Mme / SCI…" />
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Nom</span>
        <input className="cp-saisie" value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
      </label>
      {d.avecDate && (
        <label className="cp-champ">
          <span className="cp-champ-mot">{d.motDate}</span>
          {/* ⚠️ LA DATE PEUT RESTER VIDE : la base l'accepte (283 occupations sans date d'entrée), et inventer
              « aujourd'hui » écrirait un fait faux dans l'historique du bien. */}
          <input className="cp-saisie" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
      <div className="cp-form-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="svv-btn gst-btn" disabled={envoi}>
          {envoi ? 'Création…' : 'Créer la fiche'}
        </button>
      </div>
    </form>
  );
}

// ══ LA LISTE ════════════════════════════════════════════════════════════════════════════════════════════════════

function Resultats({ reponse, terme, ouvrir }: {
  reponse: Reponse; terme: string; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
}) {
  if (reponse.etat === 'repos') {
    return (
      <p className="gst-vide">
        Tapez un nom, une adresse, une commune, un téléphone, un e-mail ou un numéro de lot.
        {' '}L’annuaire répond par LOGEMENT&nbsp;: l’adresse, son propriétaire, son locataire actuel.
      </p>
    );
  }
  if (reponse.etat === 'charge') return <p className="gst-info" role="status">Recherche…</p>;
  if (reponse.etat === 'erreur') return <p className="gst-erreur" role="status">{reponse.message}</p>;
  if (reponse.etat === 'sans_schema') {
    return (
      <p className="gst-vide">
        <strong>L’annuaire n’est pas encore installé.</strong> Une mise à jour de la base est nécessaire
        (migration 253), puis un premier import des exports WIPPIMMO. Rien d’autre n’est affecté&nbsp;: le reste du
        module fonctionne normalement.
      </p>
    );
  }
  if (reponse.lignes.length === 0) {
    return <p className="gst-vide" role="status">{messageRechercheVide(analyserTerme(terme))}</p>;
  }
  return (
    <>
      {/* 🔴 UNE LISTE COUPÉE LE DIT. Mesuré le 26/09/2026 sur la vraie base : « puvis » correspond à 76 logements,
          l'écran en montrait 60 et annonçait « 60 résultats » — 16 disparaissaient sans un mot. C'est exactement ce
          que le module s'interdit ailleurs (la fenêtre de 30 jours de la file annonce ce qu'elle laisse de côté). */}
      <p className="ann-compte" role="status">
        {reponse.tronque
          ? <>
            <strong>{reponse.lignes.length} premiers résultats</strong>
            {' — d’autres correspondent. Précisez votre recherche (une adresse plus complète, une commune, '}
            {'un nom) pour tous les voir.'}
          </>
          : <>{reponse.lignes.length} résultat{reponse.lignes.length > 1 ? 's' : ''}</>}
        {reponse.importe && <> · annuaire importé le {formaterDateIso(reponse.importe.le)}</>}
      </p>
      <ul className="ann-liste">
        {reponse.lignes.map((l, i) => (
          <li key={`${l.lotId ?? 'x'}-${l.proprietaireId ?? 'x'}-${l.locataireId ?? 'x'}-${i}`} className="ann-item">
            <div className="ann-item-titre">
              {l.lotId !== null ? (
                <button type="button" className="ann-lien ann-lien--fort" onClick={() => ouvrir('lot', l.lotId as number)}>
                  {titreLogement(l.adresse, l.commune)}
                </button>
              ) : <span className="ann-sans-lot">Sans lot en gestion</span>}
              {l.nature && <span className="ann-etiq">{l.nature}{l.typeBien ? ` · ${l.typeBien}` : ''}</span>}
              {/* « absent du dernier export » est dit par un MOT : lisible en niveaux de gris comme aux daltoniens. */}
              {l.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
            </div>
            <div className="ann-item-ligne">
              <span className="ann-role">Propriétaire</span>
              {l.proprietaireId !== null ? (
                <button type="button" className="ann-lien" onClick={() => ouvrir('proprietaire', l.proprietaireId as number)}>
                  {l.proprietaireNom || '(sans nom)'}
                </button>
              ) : <span className="ann-inconnu">{l.proprietaireNom || 'non rattaché'}</span>}
            </div>
            <div className="ann-item-ligne">
              <span className="ann-role">Locataire actuel</span>
              {l.locataireId !== null ? (
                <>
                  <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', l.locataireId as number)}>
                    {l.locataireNom}
                  </button>
                  {l.locataireDepuis && <span className="ann-gris">depuis le {formaterDateIso(l.locataireDepuis)}</span>}
                </>
              ) : <span className="ann-inconnu">aucun bail en cours</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ══ 🔴 RETIRÉ LE 29/09/2026 — LOT FICHES-ANNUAIRE, ÉTAPE C ════════════════════════════════════════════════════
   Ici vivait `Contacts`, la liste plate des coordonnées d'une personne (« Aucune coordonnée dans WIPPIMMO. »).
   Son seul appelant était l'ancienne fiche locataire ; celle-ci porte désormais des CARTES (`BlocCartes`), où
   chaque coordonnée est une ligne alignée avec son libellé et son bouton Copier.
   Il n'est pas conservé en dormance : un composant que rien n'appelle finit par diverger de celui qui sert, et
   l'on corrige alors le mauvais. La règle qu'il portait, elle, est tenue — et éprouvée — dans `CartesPersonnes` :
   une absence de coordonnée se DIT, jamais un blanc. */

// ══ LES TROIS FICHES ════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 COPIER UNE COORDONNÉE ══════════════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « chaque téléphone et chaque e-mail avec son libellé et un bouton Copier ». Un numéro se
 * recopie dix fois par jour dans un autre outil — le lire à voix haute à soi-même est exactement le moment où
 * l'on inverse deux chiffres.
 *
 * ⚠️ LE PRESSE-PAPIERS PEUT REFUSER (navigateur ancien, page non sécurisée). On le DIT sur le bouton plutôt que
 * de laisser croire que c'est copié — un « ✓ » menteur ferait coller autre chose.
 */
function BoutonCopier({ valeur, quoi }: { valeur: string; quoi: string }) {
  const [etat, setEtat] = useState<'repos' | 'fait' | 'refus'>('repos');
  useEffect(() => {
    if (etat === 'repos') return;
    const t = setTimeout(() => setEtat('repos'), 1800);
    return () => clearTimeout(t);
  }, [etat]);
  return (
    <button type="button" className="ann-copier" title={`Copier ${quoi}`} aria-label={`Copier ${quoi}`}
      onClick={() => {
        void (async () => {
          try { await navigator.clipboard.writeText(valeur); setEtat('fait'); }
          catch { setEtat('refus'); }
        })();
      }}>
      {etat === 'fait' ? '✓ copié' : etat === 'refus' ? 'copie refusée' : 'Copier'}
    </button>
  );
}

/* ══ 🔴🔴 REMPLACÉ LE 29/09/2026 — LOT FICHES-ANNUAIRE, ÉTAPE C ════════════════════════════════════════════════
   Ici vivait `BlocCoordonnees`, le premier bloc de la fiche propriétaire écrit à l'étape A. Il est remplacé par
   `BlocCartes` (fichier `CartesPersonnes`) pour DEUX raisons, toutes deux dites par Arno :

   ① IL N'AFFICHAIT QU'UNE PERSONNE, alors que le bloc doit porter « le ou les propriétaires du même ensemble de
      biens », côte à côte, chacun avec son crayon « Modifier » et son menu « ⋯ ».

   ② SON `<dl>` NE POUVAIT PAS ALIGNER UN LIBELLÉ SUR SA VALEUR — « des écarts de niveaux partout ». Les `<dt>` et
      les `<dd>` vivent dans deux flux séparés : une valeur portant deux capsules et un bouton était plus haute
      que son libellé, qui remontait. Chaque ligne d'une carte est maintenant une grille de deux colonnes centrées
      verticalement, ce qui rend l'alignement mécanique plutôt qu'espéré.

   ⚠️ LA DEMANDE D'ORIGINE N'A PAS CHANGÉ, et les cartes la tiennent entièrement : « civilité, nom, qualité,
   adresse postale, chaque téléphone et chaque e-mail avec son libellé et un bouton Copier, une note libre ».
   Ce qu'on a mesuré alors reste vrai : civilité 302/307, adresse postale 304/307, 354 e-mails et 287 téléphones
   tous porteurs de leur libellé d'origine. « Qualité » et « note » n'existaient dans AUCUNE colonne — c'est la
   migration 278 qui les apporte, et sans elle l'écran écrit encore « non renseignée ».

   Le code n'est pas gardé en dormance : un bloc que rien n'appelle diverge de celui qui sert, et l'on finit par
   corriger le mauvais. Ce qu'il garantissait est éprouvé sur les cartes, dans `annuaireEdition.test.ts`. */

/** Ce qu'une carte de bien affiche d'une date : la date seule, ou le mot qui dit qu'on ne l'a pas. */
function DateOuRien({ iso, sinon }: { iso: string | null; sinon: string }) {
  return iso === null ? <span className="ann-inconnu">{sinon}</span> : <>{formaterDateIso(iso)}</>;
}

const DRIVE_DOSSIER = 'https://drive.google.com/drive/folders/';

/**
 * ══ 🔴🔴 UNE CARTE DE BIEN ════════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « les BIENS en gestion […] sous forme de CARTES cliquables : adresse, lot, type, surface ou “non
 * renseignée”, locataire en place ou “Vacant”, nombre de mails, dernier échange, événements ouverts, lien vers le
 * dossier Drive du lot ».
 *
 * 🔴 LA CARTE ENTIÈRE EST LE BOUTON, et les deux liens qui en sortent (le locataire, le Drive) s'arrêtent au clic
 * (`stopPropagation`). Un bouton dans un bouton serait du HTML invalide : le lien du Drive est donc un vrai
 * `<a>`, posé À CÔTÉ du bouton dans le flux, et la carte est une grille — pas une imbrication.
 *
 * ⚠️ « SURFACE : NON RENSEIGNÉE » EST UN FAIT, PAS UN TROU. Mesuré le 29/09/2026 : aucune colonne de surface
 * n'existe dans le schéma. On ne la déduit pas du type (« Type 2 » ne dit pas des mètres carrés).
 */
function CarteBien({ b, ouvrir, onHistoriqueDuBien }: {
  b: BienDuProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  /**
   * 🔴 LOT FICHES-RETOUCHES — « Historique » ouvre la fiche DE CE BIEN, posée sur sa « vie du bien ».
   *
   * Pourquoi la fiche du bien, et non un écran de plus : la « vie du bien » existe déjà, avec ses filtres, ses
   * capsules et ses pièces jointes. En écrire une seconde version dans la carte, c'est deux endroits à corriger
   * le jour où l'on change une ligne — et deux réponses possibles à la même question.
   */
  onHistoriqueDuBien: (lotId: number) => void;
}) {
  return (
    <li className={`ann-carte${b.fin !== null ? ' ann-carte--ancien' : ''}`}>
      <button type="button" className="ann-carte-corps" onClick={() => ouvrir('lot', b.id)}>
        <span className="ann-carte-tete">
          <span className="ann-carte-titre">{titreLogement(b.adresse, b.commune)}</span>
          <span className="ann-carte-sous">
            <span className="ann-etiq">lot {b.numero}</span>
            {b.nature && <span className="ann-etiq">{b.nature}</span>}
            {b.typeBien && <span className="ann-etiq">{b.typeBien}</span>}
          </span>
        </span>
        <span className="ann-carte-faits">
          <span className="ann-fait">
            <span className="ann-fait-mot">Surface</span>
            {b.surfaceM2 === null
              ? <span className="ann-inconnu">non renseignée</span>
              : <span>{b.surfaceM2} m²</span>}
          </span>
          {/* 🔴 LE LOCATAIRE EN PLACE EST MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */}
          <span className={`ann-fait${b.locataire !== null ? ' ann-fait--locataire' : ''}`}>
            <span className="ann-fait-mot">Locataire</span>
            {b.locataire === null
              ? <span className="ann-vacant">Vacant</span>
              : <span className="ann-fait-valeur">{b.locataire}</span>}
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Mails</span>
            <span>{b.mails}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Dernier échange</span>
            <DateOuRien iso={b.dernierEchange} sinon="aucun" />
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Événements ouverts</span>
            <span>{b.evenementsOuverts === 0 ? 'aucun' : b.evenementsOuverts}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">{b.fin === null ? 'En gestion depuis' : 'Sorti de gestion le'}</span>
            <DateOuRien iso={b.fin ?? b.debut} sinon="non renseigné" />
          </span>
        </span>
      </button>
      {/* ══ 🔴🔴 LOT FICHES-RETOUCHES — LE PIED DE CARTE EN BOUTONS ═══════════════════════════════════════════
          Arno : « “Fiche du locataire →” et “Dossier Drive du lot ↗” sont aujourd'hui deux liens soulignés mal
          alignés. Ils deviennent deux BOUTONS côte à côte sur la même ligne, de même hauteur et de même largeur,
          avec la même présentation que le bouton “Dossier Drive ↗” de l'en-tête. […] “Historique” […] DANS chaque
          carte de bien, sur toute la largeur de la carte, AU-DESSUS des deux boutons. »

          🔴 MÊME CLASSE QUE L'EN-TÊTE (`svv-btn svv-btn-outline gst-btn`), et non une imitation : deux boutons
          qui se ressemblent à un pixel près se mettent à diverger au premier ajustement de la charte. Ici, c'est
          littéralement le même bouton.

          🔴 UNE GRILLE À DEUX COLONNES ÉGALES pour la rangée du bas — `1fr 1fr`, et non un `flex` qui donnerait
          à chaque bouton la largeur de son texte. « Même hauteur et même largeur » est la demande, et c'est la
          grille qui la tient, y compris quand un des deux manque.

          ⚠️ LE PIED SORT DU BOUTON DE LA CARTE, et c'est structurel : un bouton dans un bouton est du HTML
          invalide et injouable au clavier. */}
      <span className="ann-carte-pied">
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large"
          onClick={() => onHistoriqueDuBien(b.id)}>
          Historique
        </button>
        <span className="ann-carte-duo">
          {b.locataireId !== null && b.locataire !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              onClick={() => ouvrir('locataire', b.locataireId as number)}>
              Fiche du locataire →
            </button>
          )}
          {b.driveDossierId !== null ? (
            <a className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              href={`${DRIVE_DOSSIER}${b.driveDossierId}`} target="_blank" rel="noreferrer">
              Dossier Drive du lot ↗
            </a>
          ) : (
            /* ⚠️ L'ABSENCE SE DIT, à la place du bouton : un dossier pas encore construit n'est pas une panne,
               et un bouton grisé sans motif enverrait chercher pourquoi il ne marche pas. */
            <span className="ann-inconnu ann-carte-sans">dossier Drive non construit</span>
          )}
        </span>
      </span>
    </li>
  );
}

function VueProprietaire({ f, ouvrir, onHistorique, gestes, onAjout, onHistoriqueDuBien }: {
  f: FicheProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistorique?: (cible: Cible) => void;
  /** Ouvre la fiche d'un bien, posée sur sa « vie du bien ». Voir `CarteBien`. */
  onHistoriqueDuBien: (lotId: number) => void;
  gestes: GestesCartes;
  onAjout: (d: DemandeAjout) => void;
}) {
  const [anciensOuverts, setAnciensOuverts] = useState(false);
  const enGestion = f.biens.filter((b) => b.fin === null);
  const anciens = f.biens.filter((b) => b.fin !== null);
  return (
    <>
      {/* ══ 🔴 L'EN-TÊTE DE FICHE — un bandeau sobre : le nom en grand, le rôle en capsule, les actions à droite.
          Demande d'Arno : « en-tête de fiche distinct ». Il remplace un titre et une ligne grise qui se
          confondaient avec le reste de la page. */}
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.civilite ? `${f.civilite} ` : ''}{f.nom}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Propriétaire</span>
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
            {/* ══ 🔴🔴 LOT FICHES-RETOUCHES — L'HISTORIQUE COMPLET DU PROPRIÉTAIRE, ET QUAND IL SERT ═══════════
                Arno : « l'historique complet du propriétaire reste accessible depuis l'en-tête de la fiche, en
                lien discret, SI CE N'EST PAS REDONDANT ».

                ═══ CE QUI A ÉTÉ MESURÉ, LE 29/09/2026, AVANT DE TRANCHER ═════════════════════════════════════
                Sur 32 938 rattachements confirmés, **tous** visent un LOT : AUCUN ne vise un propriétaire (c'est
                la règle centrale du module, « la cible est toujours un bien »). L'historique d'un propriétaire
                est donc, exactement, l'UNION des historiques de ses biens — pas un mail de plus.

                🔴 D'OÙ LA RÈGLE RETENUE : le lien n'apparaît QUE si le propriétaire a PLUSIEURS biens. À un seul
                bien, il rendrait mot pour mot la même liste que le bouton « Historique » de l'unique carte — deux
                chemins vers la même page, dont on finit par se demander lequel montre autre chose. À plusieurs
                biens, il répond à une question que les cartes ne savent pas poser : « tout ce qui s'est dit avec
                cette personne, tous biens confondus ». */}
            {f.biens.length > 1 && onHistorique !== undefined && (
              <button type="button" className="ann-lien ann-tete-histo"
                onClick={() => onHistorique({ sorte: 'proprietaire', cle: f.cle, id: null })}>
                Historique, tous biens confondus →
              </button>
            )}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      {/* ══ 🔴🔴 LE BLOC « COORDONNÉES » : DES CARTES, CÔTE À CÔTE, MODIFIABLES ════════════════════════════════
          Demande d'Arno (complément à l'étape C) : « chaque propriétaire est une CARTE, et les cartes se suivent de
          gauche à droite […] à la fin de la rangée, une carte “+ Ajouter un propriétaire” ».

          🔴 L'ANCIEN `BlocCoordonnees` RESTE DANS CE FICHIER, mais il n'est plus appelé ici : il servait UN seul
          propriétaire, dans un `<dl>` dont les libellés ne pouvaient pas s'aligner sur leurs valeurs — le défaut
          qu'Arno a signalé (« des écarts de niveaux partout »). La raison de son remplacement est écrite sur lui.

          ⚠️ « + AJOUTER UN PROPRIÉTAIRE » VEUT DIRE CO-PROPRIÉTAIRE DU MÊME ENSEMBLE DE BIENS : la personne créée
          est rattachée à tous les biens EN GESTION de cette fiche, ce qui est exactement ce que le bloc annonce. */}
      <BlocCartes titre="Coordonnées" id="ann-coord" personnes={f.personnes} role="Propriétaire"
        motAjouter="Ajouter un propriétaire"
        gestes={{
          ...gestes,
          onAjouter: (sujet) => onAjout({
            sujet, lots: enGestion.map((b) => b.id), avecDate: true,
            titre: `Ajouter un co-propriétaire${enGestion.length > 0
              ? ` sur ${enGestion.length} bien${enGestion.length > 1 ? 's' : ''} en gestion` : ''}`,
            motDate: 'Propriétaire depuis le (facultatif)',
          }),
        }} />

      <p className="ann-depuis">
        {f.relationDepuis
          ? <>Début de collaboration : <strong>le {formaterDateIso(f.relationDepuis)}</strong>{' '}
            <span className="ann-gris">— début de gestion du plus ancien lot</span></>
          : <>Début de collaboration : <span className="ann-inconnu">non renseigné</span>{' '}
            <span className="ann-gris">— aucun lot en gestion ne porte de date de début</span></>}
      </p>

      <section className="ann-bloc" aria-labelledby="ann-biens">
        <h4 className="ann-bloc-titre" id="ann-biens">
          Biens en gestion <span className="gst-compte">{enGestion.length}</span>
        </h4>
        {enGestion.length === 0 ? <p className="ann-gris">Aucun bien en gestion.</p> : (
          <ul className="ann-cartes">
            {enGestion.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir}
              onHistoriqueDuBien={onHistoriqueDuBien} />)}
          </ul>
        )}
      </section>

      {/* ⚠️ « ANCIENS BIENS » EST REPLIÉ, jamais retiré : un bien sorti de gestion garde ses mails et son
          historique, et c'est souvent pour EUX qu'on ouvre la fiche. Replié, il ne noie pas les biens vivants. */}
      {anciens.length > 0 && (
        <section className="ann-bloc">
          <button type="button" className="ann-repli" aria-expanded={anciensOuverts}
            onClick={() => setAnciensOuverts((v) => !v)}>
            <span aria-hidden="true" className={`ann-repli-triangle${anciensOuverts ? ' ann-repli-triangle--ouvert' : ''}`}>▸</span>
            Anciens biens <span className="gst-compte">{anciens.length}</span>
          </button>
          {anciensOuverts && (
            <ul className="ann-cartes">
              {anciens.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir}
                onHistoriqueDuBien={onHistoriqueDuBien} />)}
            </ul>
          )}
        </section>
      )}


    </>
  );
}

/**
 * ══ 🔴🔴 ENREGISTRER UN DÉPART ════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « enregistrer un départ (date de sortie → historique) ». C'est le geste le plus lourd de conséquences de
 * la fiche d'un bien : il fait passer un locataire EN PLACE dans l'HISTORIQUE, et le logement devient vacant.
 *
 * 🔴 IL DEMANDE UNE DATE, ET CONFIRMATION. Sans date, le serveur prendrait aujourd'hui — ce qui est souvent faux :
 * on enregistre un départ une semaine après. La date est donc posée d'abord, visible, et modifiable.
 *
 * ⚠️ RIEN N'EST SUPPRIMÉ : l'occupation est DATÉE. Le locataire garde sa fiche, ses coordonnées et ses mails, et
 * l'historique du bien le montre avec ses deux dates. C'est ce que dit la phrase du panneau.
 */
function BoutonDepart({ nom, occupationId, modifiable, onDepart }: {
  nom: string; occupationId: number; modifiable: boolean;
  onDepart: (occupationId: number, sortie: string | null) => Promise<string | null>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!ouvert) {
    return (
      <>
        <button type="button" className="cp-copier" disabled={!modifiable}
          title={modifiable ? undefined : MOTIF_SANS_MIGRATION} onClick={() => setOuvert(true)}>
          Enregistrer un départ…
        </button>
        {refus !== null && <span className="cp-rien">{refus}</span>}
      </>
    );
  }
  return (
    <span className="ann-depart">
      <span className="cp-rien">{nom} quitte le logement le :</span>
      <input className="cp-saisie" type="date" value={date} aria-label="Date de sortie"
        onChange={(e) => setDate(e.target.value)} />
      <button type="button" className="cp-copier" onClick={() => { setOuvert(false); setRefus(null); }}>
        Annuler
      </button>
      <button type="button" className="cp-copier" disabled={envoi} onClick={() => {
        setEnvoi(true);
        void (async () => {
          const motif = await onDepart(occupationId, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);
          setEnvoi(false);
          if (motif === null) setOuvert(false); else setRefus(motif);
        })();
      }}>{envoi ? 'Enregistrement…' : 'Enregistrer le départ'}</button>
      {refus !== null && <span className="cp-refus">{refus}</span>}
    </span>
  );
}

/**
 * ══ 🔴 UN OCCUPANT, AVEC SES COORDONNÉES COMPLÈTES ════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : les occupants « avec coordonnées complètes, date d'entrée et liens vers leur fiche » — et,
 * pour l'historique, « les occupants, la date d'entrée, la date de sortie et les coordonnées ». Le même bloc
 * sert aux deux : ce qu'on veut savoir d'un ancien locataire est ce qu'on veut savoir d'un actuel.
 */
function BlocOccupant({ o, ouvrir, onEcrire }: {
  o: OccupationDuLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
}) {
  const tels = o.contacts.filter((c) => c.sorte === 'telephone');
  const mails = o.contacts.filter((c) => c.sorte === 'email');
  const adresse = titreLogement(o.adresse, [o.codePostal, o.commune].filter((x) => x).join(' '));
  return (
    <article className={`ann-personne${o.encours ? '' : ' ann-personne--passe'}`}>
      <div className="ann-personne-tete">
        <p className="ann-personne-nom">
          <button type="button" className="ann-lien ann-lien--fort"
            onClick={() => ouvrir('locataire', o.locataireId)}>{o.nom}</button>
        </p>
        <span className="ann-personne-actions">
          <span className="ann-role-capsule">{o.encours ? 'En place' : 'Parti'}</span>
        </span>
      </div>
      <dl className="ann-champs">
        <dt>{o.encours ? 'Entré le' : 'Occupation'}</dt>
        <dd>
          {o.entree === null && o.sortie === null
            ? <span className="ann-inconnu">dates non renseignées</span>
            : periodeOccupation(o.entree, o.sortie)}
        </dd>
        <dt>Adresse postale</dt>
        <dd>{adresse !== '' ? adresse : <span className="ann-inconnu">non renseignée</span>}</dd>
        <dt>Téléphone{tels.length > 1 ? 's' : ''}</dt>
        <dd>
          {tels.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
            <ul className="ann-coords">
              {tels.map((c) => (
                <li key={c.valeur} className="ann-coord">
                  <a className="ann-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
                  {/* 🔴 LOT FICHES-RETOUCHES — même nomenclature que les cartes : Mobile / Fixe / E-mail. */}
                  <span className="ann-libelle">{typeDeLibelle(c.libelle, c.sorte).mot}</span>
                  <BoutonCopier valeur={c.affichage} quoi="ce numéro" />
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>E-mail{mails.length > 1 ? 's' : ''}</dt>
        <dd>
          {mails.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
            <ul className="ann-coords">
              {mails.map((c) => (
                <li key={c.valeur} className="ann-coord">
                  {onEcrire
                    ? <button type="button" className="ann-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
                    : <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
                  <span className="ann-libelle">{typeDeLibelle(c.libelle, c.sorte).mot}</span>
                  <BoutonCopier valeur={c.valeur} quoi="cette adresse" />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </article>
  );
}

/**
 * ══ 🔴🔴 LA FICHE D'UN BIEN — ÉTAPE B ═════════════════════════════════════════════════════════════════════════
 *
 * Arno : « En-tête : adresse, lot, type, surface, propriétaire(s) (liens vers leur fiche), dossier Drive.
 * LOCATAIRE(S) EN PLACE […] HISTORIQUE DES LOCATAIRES […] VIE DU BIEN ».
 *
 * ═══ « LES OCCUPANTS DU MÊME BAIL », ET CE QUE LA BASE EN SAIT ════════════════════════════════════════════════
 * Un bail n'existe pas comme objet : il n'y a que des OCCUPATIONS (une personne, un lot, deux dates). Deux
 * personnes d'un même foyer feraient donc deux occupations de MÊMES DATES — mesuré le 29/09/2026 : il n'y en a
 * AUCUNE dans la base, et 116 fiches de locataires sur 510 nomment pourtant deux personnes dans leur nom
 * (« ABGRALL CAYREY Chloé et Romain »).
 *
 * 🔴 ON NE DÉCOUPE PAS CES NOMS — rien ne dit quelle coordonnée est à qui. L'écran GROUPE donc par PÉRIODE : le
 * jour où deux personnes partageront une date d'entrée, elles s'afficheront ensemble, sans qu'une ligne change.
 * 🔭 L'étape C ouvre l'ajout d'un occupant : c'est là que le groupe en portera plusieurs, pour de vrai.
 */
function VueLot({
  f, ouvrir, onHistorique, onEcrire, maintenant, onOuvrirFil, gestes, onAjout, onDepart,
  poserSurVieDuBien, onVieDuBienPosee,
}: {
  f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onHistorique?: (cible: Cible) => void;
  onEcrire?: (email: string) => void;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  gestes: GestesCartes;
  onAjout: (d: DemandeAjout) => void;
  /** Enregistre un départ. Rend le motif du refus, ou `null`. */
  onDepart: (occupationId: number, sortie: string | null) => Promise<string | null>;
  /** Vrai quand on arrive ici par « Historique » : la fiche se pose alors sur la « vie du bien ». */
  poserSurVieDuBien: boolean;
  /** Prévient le parent que c'est fait — sans quoi la fiche redescendrait à chaque rendu. */
  onVieDuBienPosee: () => void;
}) {
  const actuels = f.occupations.filter((o) => o.encours);
  const passes = f.occupations.filter((o) => !o.encours);
  /** Les occupations passées, groupées par PÉRIODE : un même bail rassemble ses occupants. */
  const baux = grouperParPeriode(passes);

  /**
   * ══ 🔴 SE POSER SUR LA « VIE DU BIEN » QUAND ON ARRIVE PAR « HISTORIQUE » ════════════════════════════════════
   *
   * ⚠️ `scrollIntoView` DANS UN EFFET, ET UNE SEULE FOIS. Le faire au rendu serait un effet de bord pendant le
   * rendu (ce que le compilateur React refuse, à raison) ; le refaire à chaque rendu ramènerait la page vers le
   * bas dès qu'on déplie un message — exactement l'inverse de ce qu'on veut.
   *
   * ⚠️ `behavior: 'smooth'` EST ÉCARTÉ : la liste se remplit encore quand on arrive, et une animation lancée sur
   * une page qui grandit finit ailleurs que là où elle visait. Un saut net atterrit juste.
   */
  const ancreVie = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!poserSurVieDuBien) return;
    ancreVie.current?.scrollIntoView({ block: 'start' });
    onVieDuBienPosee();
  }, [poserSurVieDuBien, onVieDuBienPosee]);

  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{titreLogement(f.adresse, f.commune)}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Bien</span>
            <span className="ann-etiq">lot {f.numero}</span>
            {f.nature && <span className="ann-etiq">{f.nature}</span>}
            {f.typeBien && <span className="ann-etiq">{f.typeBien}</span>}
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      <section className="ann-bloc">
        <div className="ann-personne">
          <dl className="ann-champs">
            <dt>Adresse</dt>
            <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
            {f.immeuble && <><dt>Immeuble</dt><dd>{f.immeuble}</dd></>}
            <dt>Type</dt>
            <dd>
              {[f.nature, f.typeBien].filter((x) => x).join(' · ') || <span className="ann-inconnu">non renseigné</span>}
            </dd>
            <dt>Surface</dt>
            {/* 🔴 AUCUNE COLONNE DE SURFACE n'existe dans le schéma : on le DIT, on ne devine pas depuis le type. */}
            <dd>{f.surfaceM2 === null ? <span className="ann-inconnu">non renseignée</span> : `${f.surfaceM2} m²`}</dd>
            {/* 🔴 LE PROPRIÉTAIRE N'EST PLUS DÉTAILLÉ ICI : il a sa CARTE, juste en dessous, avec son crayon et
                toutes ses coordonnées alignées. Répéter ses numéros dans l'en-tête donnerait deux endroits à
                corriger, dont un seul modifiable — la meilleure façon d'en laisser un se périmer. */}
            {f.proprietaireId === null && (
              <>
                <dt>Propriétaire</dt>
                <dd>
                  <span className="ann-inconnu">
                    {f.proprietaireNom || 'non rattaché'} — nom porté par plusieurs fiches WIPPIMMO, non tranché
                  </span>
                </dd>
              </>
            )}
            <dt>En gestion</dt>
            <dd>
              {f.debut ? <>depuis le {formaterDateIso(f.debut)}</> : <span className="ann-inconnu">date non renseignée</span>}
              {f.fin && <> · <strong>fin de gestion le {formaterDateIso(f.fin)}</strong></>}
            </dd>
          </dl>
        </div>
      </section>

      {/* ══ 🔴 LES PROPRIÉTAIRES DU BIEN, EN CARTES — avec « Remplacer » pour une vente ═══════════════════════════ */}
      <BlocCartes titre={`Propriétaire${f.proprietaires.length > 1 ? 's' : ''}`} id="ann-prop"
        personnes={f.proprietaires} role="Propriétaire" motAjouter="Ajouter un propriétaire"
        gestes={{
          ...gestes,
          onAjouter: (sujet) => onAjout({
            sujet, lots: [f.id], avecDate: true, titre: `Ajouter un propriétaire au lot ${f.numero}`,
            motDate: 'Propriétaire depuis le (facultatif)',
          }),
          /* ⚠️ « REMPLACER » MÈNE À LA FICHE DE LA PERSONNE : c'est là que le geste a un sens, puisqu'il faut
             d'abord désigner le NOUVEAU propriétaire. Le proposer ici sans savoir par qui remplacer ouvrirait un
             formulaire qui n'aurait rien à dire. */
          onRemplacer: (sujet, id) => ouvrir(sujet === 'proprietaire' ? 'proprietaire' : 'locataire', id),
        }} />

      {/* ══ 🔴 LES OCCUPANTS EN PLACE, EN CARTES — chacun avec ses dates et « Enregistrer un départ » ══════════════
          Arno : « LOCATAIRE(S) EN PLACE : tous les occupants du même bail […] avec coordonnées complètes, date
          d'entrée et liens vers leur fiche » ; et pour l'étape C : « enregistrer un départ (date de sortie →
          historique), enregistrer un nouveau locataire (date d'entrée) ». */}
      <BlocCartes titre={`Locataire${actuels.length > 1 ? 's' : ''} en place`} id="ann-occ"
        personnes={f.occupants} role="En place" motAjouter="Ajouter un occupant"
        gestes={{
          ...gestes,
          onAjouter: (sujet) => onAjout({
            sujet: sujet === 'locataire' ? 'locataire' : 'locataire', lots: [f.id], avecDate: true,
            titre: `Ajouter un occupant au lot ${f.numero}`, motDate: 'Entré le (facultatif)',
          }),
        }}
        dessous={(p) => {
          const occ = actuels.find((o) => o.locataireId === p.id);
          if (occ === undefined) return null;
          return (
            <>
              <LigneFiche libelle="Entré le">
                {occ.entree === null ? <span className="cp-rien">non renseignée</span> : formaterDateIso(occ.entree)}
              </LigneFiche>
              <LigneFiche libelle="Sa fiche">
                <button type="button" className="cp-lien" onClick={() => ouvrir('locataire', p.id)}>
                  Ouvrir la fiche du locataire →
                </button>
              </LigneFiche>
              <LigneFiche libelle="Départ">
                <BoutonDepart nom={p.nomAffiche} occupationId={occ.occupationId} modifiable={gestes.modifiable}
                  onDepart={onDepart} />
              </LigneFiche>
            </>
          );
        }} />
      {actuels.length === 0 && <p className="ann-gris">Aucun bail en cours — le logement est vacant.</p>}

      {/* ⚠️ L'HISTORIQUE EST TOUJOURS LÀ, jamais derrière un survol : c'est la question qu'on pose juste après
          « qui habite ici ? » — « et avant ? ». Chaque occupation passée porte ses coordonnées, comme demandé. */}
      <section className="ann-bloc" aria-labelledby="ann-histo-loc">
        <h4 className="ann-bloc-titre" id="ann-histo-loc">
          Historique des locataires <span className="gst-compte">{passes.length}</span>
        </h4>
        {baux.length === 0 ? <p className="ann-gris">Aucun locataire passé connu.</p> : baux.map((bail, i) => (
          <div key={`bail-${i}`} className="ann-bail">
            {bail.length > 1 && (
              <p className="ann-bail-mot">{bail.length} occupants du même bail</p>
            )}
            {bail.map((o) => (
              <BlocOccupant key={`p-${o.locataireId}-${o.entree ?? ''}-${o.sortie ?? ''}`}
                o={o} ouvrir={ouvrir} onEcrire={onEcrire} />
            ))}
          </div>
        ))}
      </section>

      <div ref={ancreVie}>
        <VieDuBien lotCle={f.numero} maintenant={maintenant} onOuvrirFil={onOuvrirFil} />
      </div>

      <p className="ann-discret">
        <BoutonHistorique cible={{ sorte: 'lot', cle: f.numero, id: null }} onHistorique={onHistorique} />
      </p>
    </>
  );
}

/**
 * ══ 🔴 GROUPER LES OCCUPATIONS PAR BAIL ═══════════════════════════════════════════════════════════════════════
 *
 * Un « bail » se reconnaît à ses DATES : deux personnes entrées le même jour et sorties le même jour occupaient
 * le même logement ensemble. C'est la seule lecture que la base permette — elle ne porte pas d'objet « bail ».
 *
 * ⚠️ AUCUN GROUPE AUJOURD'HUI, et c'est mesuré : zéro couple (lot, entrée) porté par deux personnes au
 * 29/09/2026. Le groupement est écrit quand même, parce que l'étape C va créer ces cas — et qu'un écran qui
 * n'aurait pas prévu deux occupants les afficherait comme deux baux successifs, ce qui serait faux. PUR.
 */
function grouperParPeriode(occupations: readonly OccupationDuLot[]): OccupationDuLot[][] {
  const groupes: OccupationDuLot[][] = [];
  const index = new Map<string, number>();
  for (const o of occupations) {
    const cle = `${o.entree ?? '?'}|${o.sortie ?? '?'}`;
    const place = index.get(cle);
    if (place === undefined) { index.set(cle, groupes.length); groupes.push([o]); }
    else groupes[place].push(o);
  }
  return groupes;
}

/**
 * ══ 🔴🔴 LA FICHE D'UN LOCATAIRE — ÉTAPE C ═════════════════════════════════════════════════════════════════════
 *
 * Arno : « ÉTAPE C — FICHE LOCATAIRE : plus légère (coordonnées, le logement en carte vers la fiche bien, les
 * dates, le propriétaire, et ses mails) ». Et la RÈGLE qui la gouverne : « chercher un locataire montre TOUS les
 * occupants du même logement ».
 *
 * 🔴 « PLUS LÉGÈRE » NE VEUT PAS DIRE PLUS PAUVRE. On y trouve tout ce qu'on vient y chercher — qui appeler, où il
 * habite, depuis quand, à qui est le logement, ce qui s'est dit — et rien de plus : ni l'historique complet du
 * bien (il est sur la fiche du bien), ni ses anciens co-occupants (ils sont dans son historique).
 *
 * 🔴 LES CARTES PORTENT LE FOYER, PAS LA SEULE PERSONNE DEMANDÉE. C'est la règle d'Arno prise au mot : appeler un
 * logement, c'est pouvoir joindre l'un ou l'autre. Ne montrer qu'un des deux conjoints ferait rater l'autre
 * numéro — le défaut même de l'annuaire d'avant.
 *
 * ⚠️ « SES MAILS » RÉUTILISE `VieDuBien`, avec la clé de son LOGEMENT EN COURS. Un mail n'est jamais rattaché à une
 * personne mais à un BIEN (règle centrale du module : « la cible est toujours un bien ») : les mails d'un
 * locataire sont donc ceux de son logement, et l'écran le DIT plutôt que de laisser croire à un tri par personne.
 */
function VueLocataire({ f, ouvrir, onHistorique, gestes, maintenant, onOuvrirFil, onHistoriqueDuBien }: {
  f: FicheLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistorique?: (cible: Cible) => void;
  onHistoriqueDuBien: (lotId: number) => void;
  gestes: GestesCartes;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  const enCours = f.logements.filter((o) => o.encours);
  const passes = f.logements.filter((o) => !o.encours);
  /** Le logement dont on montre les échanges : celui qu'il occupe. Le plus récent s'il en occupe plusieurs. */
  const logementDesMails = enCours[0] ?? null;
  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.nom}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">{enCours.length > 0 ? 'Locataire en place' : 'Ancien locataire'}</span>
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
      </header>

      {/* ══ 🔴 TOUS LES OCCUPANTS DU MÊME LOGEMENT, EN CARTES — la règle d'Arno, à l'écran ═══════════════════════ */}
      <BlocCartes titre="Coordonnées" id="ann-coord-loc" personnes={f.personnes} motAjouter="Ajouter un occupant"
        role={(p) => (p.id === f.id ? 'Locataire' : 'Même logement')}
        gestes={{
          ...gestes,
          // ⚠️ On rattache au logement EN COURS. Sans logement en cours, la personne est créée sans lien : rien à
          //    quoi la rattacher, et inventer un bail serait écrire un fait faux.
          onAjouter: (sujet) => gestes.onAjouter(sujet),
        }} />
      {f.personnes.length > 1 && (
        <p className="ann-gris">
          Les cartes ci-dessus portent <strong>tous les occupants du même logement</strong>, et pas seulement la
          personne cherchée.
        </p>
      )}

      {/* ══ 🔴 LE LOGEMENT EN CARTE, VERS LA FICHE DU BIEN, avec les dates et le propriétaire ════════════════════ */}
      <section className="ann-bloc" aria-labelledby="ann-log">
        <h4 className="ann-bloc-titre" id="ann-log">
          {enCours.length > 1 ? 'Ses logements' : 'Son logement'} <span className="gst-compte">{enCours.length}</span>
        </h4>
        {enCours.length === 0
          ? <p className="ann-gris">Aucun logement en cours — cette personne a quitté son ou ses logements.</p>
          : <ul className="ann-cartes">{enCours.map((o) => (
            <CarteLogement key={`e-${o.lotId ?? o.numero}-${o.entree ?? ''}`} o={o} ouvrir={ouvrir}
              onHistoriqueDuBien={onHistoriqueDuBien} />
          ))}</ul>}
      </section>

      {passes.length > 0 && (
        <section className="ann-bloc" aria-labelledby="ann-log-p">
          <h4 className="ann-bloc-titre" id="ann-log-p">
            Logements précédents <span className="gst-compte">{passes.length}</span>
          </h4>
          <ul className="ann-cartes">{passes.map((o) => (
            <CarteLogement key={`p-${o.lotId ?? o.numero}-${o.entree ?? ''}-${o.sortie ?? ''}`} o={o}
              ouvrir={ouvrir} onHistoriqueDuBien={onHistoriqueDuBien} />
          ))}</ul>
        </section>
      )}

      {/* ══ 🔴 SES MAILS — CEUX DE SON LOGEMENT, et c'est dit en toutes lettres ══════════════════════════════════ */}
      {logementDesMails !== null && !logementDesMails.horsGestion ? (
        <>
          <p className="ann-gris">
            Les échanges ci-dessous sont ceux <strong>du logement</strong> {titreLogement(logementDesMails.adresse,
              logementDesMails.commune)} : un mail est rattaché à un bien, jamais à une personne.
          </p>
          <VieDuBien lotCle={logementDesMails.numero} maintenant={maintenant} onOuvrirFil={onOuvrirFil} />
        </>
      ) : (
        <p className="ann-gris">
          Aucun logement en gestion pour cette personne : il n’y a donc pas d’échange rattaché à lui montrer.
        </p>
      )}

      {/* LOT RATTACHEMENT-2 — un LOCATAIRE n'est pas une cible de rattachement (il déménage ; le logement, non) :
          l'entrée de l'historique passe donc par son logement, et jamais par lui. */}
      {logementDesMails !== null && !logementDesMails.horsGestion && (
        <p className="ann-discret">
          <BoutonHistorique cible={{ sorte: 'lot', cle: logementDesMails.numero, id: null }}
            onHistorique={onHistorique} />
        </p>
      )}
    </>
  );
}

/**
 * ══ 🔴 LE LOGEMENT D'UN LOCATAIRE, EN CARTE ═══════════════════════════════════════════════════════════════════
 *
 * Même langage visuel que les cartes de biens de la fiche propriétaire (`CarteBien`) : ce sont les mêmes objets,
 * vus d'un autre côté. Deux apparences pour un même bien obligeraient à réapprendre la lecture d'un écran à l'autre.
 *
 * ⚠️ UN LOT « HORS GESTION » N'EST PAS CLIQUABLE, et le DIT : l'occupation le nomme par une clé que l'annuaire des
 * lots ne porte pas. Un lien vers une fiche inexistante est pire qu'une absence de lien.
 */
function CarteLogement({ o, ouvrir, onHistoriqueDuBien }: {
  o: LogementDuLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistoriqueDuBien: (lotId: number) => void;
}) {
  const corps = (
    <>
      <span className="ann-carte-tete">
        <span className="ann-carte-titre">
          {o.lotId === null ? `Lot n° ${o.numero}` : titreLogement(o.adresse, o.commune)}
        </span>
        <span className="ann-carte-sous">
          <span className="ann-etiq">lot {o.numero}</span>
          {o.nature && <span className="ann-etiq">{o.nature}</span>}
          {o.typeBien && <span className="ann-etiq">{o.typeBien}</span>}
          {o.horsGestion && <span className="ann-etiq ann-etiq--absent">hors gestion</span>}
        </span>
      </span>
      <span className="ann-carte-faits">
        <span className="ann-fait">
          <span className="ann-fait-mot">Occupation</span>
          <span className="ann-fait-valeur">{periodeOccupation(o.entree, o.sortie)}</span>
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Surface</span>
          {o.surfaceM2 === null ? <span className="ann-inconnu">non renseignée</span> : <span>{o.surfaceM2} m²</span>}
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Propriétaire</span>
          {o.proprietaireNom === null || o.proprietaireNom === ''
            ? <span className="ann-inconnu">non renseigné</span>
            : <span className="ann-fait-valeur">{o.proprietaireNom}</span>}
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Mails</span>
          <span>{o.mails}</span>
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Dernier échange</span>
          <DateOuRien iso={o.dernierEchange} sinon="aucun" />
        </span>
      </span>
    </>
  );
  return (
    <li className={`ann-carte${o.encours ? '' : ' ann-carte--ancien'}`}>
      {o.lotId === null
        ? <span className="ann-carte-corps">{corps}</span>
        : <button type="button" className="ann-carte-corps" onClick={() => ouvrir('lot', o.lotId as number)}>
          {corps}
        </button>}
      {/* 🔴 LOT FICHES-RETOUCHES — MÊME PIED QUE LA CARTE DE BIEN : deux boutons de même largeur, et
          « Historique » au-dessus quand le lot est dans l'annuaire. Deux cartes qui montrent le même objet ne
          peuvent pas se présenter de deux façons — on réapprendrait à lire d'un écran à l'autre. */}
      <span className="ann-carte-pied">
        {o.lotId !== null && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large"
            onClick={() => onHistoriqueDuBien(o.lotId as number)}>
            Historique
          </button>
        )}
        <span className="ann-carte-duo">
          {o.proprietaireId !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              onClick={() => ouvrir('proprietaire', o.proprietaireId as number)}>
              Fiche du propriétaire →
            </button>
          )}
          {o.driveDossierId !== null ? (
            <a className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              href={`${DRIVE_DOSSIER}${o.driveDossierId}`} target="_blank" rel="noreferrer">
              Dossier Drive du lot ↗
            </a>
          ) : (
            <span className="ann-inconnu ann-carte-sans">dossier Drive non construit</span>
          )}
        </span>
      </span>
    </li>
  );
}

/**
 * LOT RATTACHEMENT-2 — LE POINT D'ENTRÉE DE L'HISTORIQUE, sur une fiche.
 *
 * ⚠️ IL NE S'AFFICHE QUE SI LE PARENT SAIT OÙ ALLER (`onHistorique` fourni) et si la cible a une clé. Un bouton qui
 * n'irait nulle part est pire qu'un bouton absent : on clique, rien ne se passe, et on cherche la panne.
 */
function BoutonHistorique({ cible, onHistorique }: { cible: Cible; onHistorique?: (c: Cible) => void }) {
  if (onHistorique === undefined || cible.cle === null || cible.cle === '') return null;
  return (
    <button type="button" className="svv-btn svv-btn-outline gst-btn ann-histo"
      onClick={() => onHistorique(cible)}>
      Tout l’historique des échanges →
    </button>
  );
}

export const CSS_ANNUAIRE = `
/* MOBILE D'ABORD : une seule colonne, aucune table, aucun débordement horizontal — tout casse en fin de ligne. */
.ann{display:flex;flex-direction:column;gap:.75rem;min-width:0}
.ann-histo{align-self:flex-start;margin:.2rem 0 .4rem}
.ann-entete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-titre{margin:0;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
.ann-chercher{display:flex;flex-direction:column;gap:.3rem}
/* L'étiquette est VISIBLE : un intitulé qui n'existe que dans le texte d'invite disparaît dès qu'on tape. */
.ann-label{font-size:.78rem;font-weight:600;color:var(--color-svv-ink)}
.ann-champ{min-height:44px;padding:.5rem .7rem;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.95rem;width:100%}
.ann-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-aide{margin:0;font-size:.74rem;color:var(--color-svv-muted);line-height:1.4}
.ann-compte{margin:0;font-size:.78rem;color:var(--color-svv-muted)}
.ann-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ann-item{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:10px 12px;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:3px}
/* Un bail terminé est plus discret, mais reste parfaitement lisible : on ne cache pas l'historique. */
.ann-item--passe{background:var(--color-svv-field)}
.ann-item-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem}
.ann-item-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem}
/* Le RÔLE est écrit en toutes lettres devant chaque valeur : « Propriétaire », « Locataire actuel », « Téléphone ».
   Sans lui, deux noms l'un sous l'autre ne disent pas lequel est lequel. */
.ann-role{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted);
  flex:0 0 auto;min-width:6.5rem}
.ann-gris{font-size:.78rem;color:var(--color-svv-muted)}
/* ══ « NON RENSEIGNE » : UN FAIT, DIT EN ITALIQUE ET PLUS CLAIR QUE LA VALEUR — jamais un vide, qui se lirait
   comme un oubli d'affichage.
   🔴 LE GRIS EST celui de --color-svv-muted (#5c6573), PAS --color-svv-label (#8a929e). Arno demande « gris clair » ET
   « contraste AA verifie » : mesure sur fond blanc, label tombe a 3,0:1 — sous les 4,5:1 exiges pour un texte de
   cette taille. Muted tient 6,4:1, reste nettement plus clair que l'encre des valeurs (#16202c, 15,3:1), et
   l'ITALIQUE fait le reste du travail de distinction. Un contraste qu'on ne peut pas lire n'est pas une nuance. */
.ann-inconnu{font-size:.85rem;color:var(--color-svv-muted);font-style:italic}
.ann-sans-lot{font-weight:700;color:var(--color-svv-ink)}
/* Un lien est un BOUTON souligné : cible tactile pleine hauteur, et jamais une couleur seule pour dire qu'il agit. */
.ann-lien{background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;color:var(--color-svv-ink);
  font:inherit;font-size:.88rem;text-decoration:underline;text-underline-offset:3px;min-height:44px}
.ann-lien--fort{font-weight:700;font-size:.95rem}
.ann-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-etiq{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:1px 8px;white-space:nowrap}
.ann-etiq--passe{opacity:.85}
/* « absent du dernier export » : le MOT porte l'information ; la bordure ne fait que la redire. */
.ann-etiq--absent{border-color:var(--color-svv-red);color:var(--color-svv-ink)}
.ann-fiche{display:flex;flex-direction:column;gap:.5rem;min-width:0}
.ann-retour{align-self:flex-start}
/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FICHES-ANNUAIRE — LE LANGAGE VISUEL DES FICHES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Arno : « beaucoup trop blanc, il faut plus de contraste et de relief, tout en restant dans le style global du
   site, sans etre extravagant ».

   CE QUI CHANGE, ET RIEN D'AUTRE :
     · un FOND DE PAGE legerement teinte (le gris de la charte) sous la fiche, pour que les blocs BLANCS s'en
       detachent — c'est le relief, et il ne coute aucune couleur nouvelle ;
     · chaque bloc et chaque carte : surface blanche, bordure fine, ombre douce ;
     · un EN-TETE de fiche distinct : le nom en grand, le role en capsule, les actions a droite ;
     · des titres de section porteurs d'un FILET a la couleur de la charte ;
     · des libelles en gris moyen, des valeurs en encre appuyee, « non renseigne » en italique clair.

   🔴 AUCUNE COULEUR NOUVELLE. Tout sort des jetons existants (--color-svv-*), y compris en Sombre, ou les
   surfaces sont GRADUEES (bg < field < surface) plutot que posees sur du noir plat.
   🔴 LE ROUGE NE DECORE JAMAIS : il ne sert qu'aux actions, aux filets de titre et a l'anneau de focus.

   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}

/* LE FOND TEINTE de la fiche. En clair, le gris de la charte ; en sombre, le fond de page, plus SOMBRE que la
   surface des blocs — dans les deux cas, les blocs se detachent par la LUMINOSITE, jamais par une teinte. */
.ann-fiche{background:var(--color-svv-field);border-radius:14px;padding:14px;
  display:flex;flex-direction:column;gap:.9rem;min-width:0}
.svv-adm-root[data-theme='dark'] .ann-fiche{background:var(--color-svv-bg)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-fiche{background:var(--color-svv-bg)}
}

/* ── L'EN-TETE DE FICHE ───────────────────────────────────────────────────────────────────────────────────────
   Un bandeau sobre : le nom en grand a gauche, le role en capsule dessous, les actions a droite. */
.ann-tete{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.8rem;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05),0 6px 16px rgba(22,32,44,.05);padding:14px 16px}
.svv-adm-root[data-theme='dark'] .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
}
.ann-tete-mots{flex:1 1 16rem;min-width:0;display:flex;flex-direction:column;gap:.35rem}
.ann-tete-nom{margin:0;font-size:1.35rem;line-height:1.2;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.ann-tete-sous{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0}
/* LE ROLE EN CAPSULE — un MOT dans une pastille, jamais une couleur seule. */
.ann-role-capsule{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:var(--color-svv-muted);background:var(--color-svv-field);border:1px solid var(--color-svv-line);
  border-radius:999px;padding:.12rem .6rem}
.ann-tete-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-left:auto}

/* ── LES BLOCS ────────────────────────────────────────────────────────────────────────────────────────────── */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:0}
/* LE FILET de la charte devant chaque titre de section : deux pixels de rouge, et rien de plus. */
.ann-bloc-titre{margin:0;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);display:flex;align-items:center;gap:.5rem}
.ann-bloc-titre::before{content:"";flex:0 0 auto;width:3px;height:1em;border-radius:2px;
  background:var(--color-svv-red)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);padding:14px 16px;display:flex;flex-direction:column;gap:.6rem}
.svv-adm-root[data-theme='dark'] .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
}
/* L'EN-TETE D'UN BLOC DE PERSONNE : son nom a gauche, ses actions (Modifier) a droite. */
.ann-personne-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;flex:1 1 auto;min-width:0}
.ann-personne-actions{display:flex;flex-wrap:wrap;gap:.4rem;margin-left:auto}
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .9rem;margin:0}
/* LIBELLE en gris moyen, VALEUR en encre appuyee : c'est ce qui donne le contraste demande. */
.ann-champs dt{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);margin-top:.4rem}
.ann-champs dd{margin:0;font-size:.92rem;font-weight:500;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9.5rem 1fr}
  .ann-champs dt{margin-top:.22rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.ann-libelle{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  padding:.15rem .5rem;font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* LOT FICHES-ANNUAIRE etape C — le petit formulaire « enregistrer un depart », POSE DANS LA LIGNE de la carte :
   il se plie en colonne des que la carte est etroite, pour que la date et ses deux boutons restent atteignables. */
.ann-depart{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0}
.ann-depart .cp-saisie{min-height:2rem;width:auto;flex:0 1 9.5rem}
/* Un occupant PARTI reste parfaitement lisible : il est seulement pose sur le gris de la page, pas efface. */
.ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
.svv-adm-root[data-theme='dark'] .ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
/* UN BAIL = un groupe d'occupants. Quand il en porte plusieurs, un mot le DIT — jamais un simple alignement. */
.ann-bail{display:flex;flex-direction:column;gap:.4rem}
.ann-bail+.ann-bail{margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--color-svv-line)}
.ann-bail-mot{margin:0;font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}

/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────── */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);display:flex;flex-direction:column;overflow:hidden;min-width:0;
  transition:box-shadow .15s ease,transform .15s ease,border-color .15s ease}
/* LE SURVOL SOULEVE LA CARTE — l'elevation est un APPUI, jamais l'information : tout reste ecrit. */
.ann-carte:hover{box-shadow:0 2px 4px rgba(22,32,44,.07),0 10px 24px rgba(22,32,44,.09);
  border-color:var(--color-svv-line-strong);transform:translateY(-1px)}
@media (prefers-reduced-motion:reduce){.ann-carte{transition:none}.ann-carte:hover{transform:none}}
.svv-adm-root[data-theme='dark'] .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
.svv-adm-root[data-theme='dark'] .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .svv-adm-root:not([data-theme='light']) .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
}
.ann-carte--ancien{background:var(--color-svv-field)}
.ann-carte-corps{display:flex;flex-direction:column;gap:0;align-items:stretch;text-align:left;
  background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'EN-TETE DE CARTE, TEINTE : il porte l'adresse et les etiquettes, et separe la carte de son contenu. */
.ann-carte-tete{display:flex;flex-direction:column;gap:.35rem;padding:11px 14px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line)}
.ann-carte--ancien .ann-carte-tete{background:var(--color-svv-surface)}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.2rem;padding:11px 14px 8px}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:7.4rem}
/* LE LOCATAIRE EN PLACE est MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */
.ann-fait--locataire{background:var(--color-svv-green-soft);border-radius:.4rem;margin:.1rem -.35rem;
  padding:.2rem .35rem}
.ann-fait--locataire .ann-fait-valeur{font-weight:700;color:var(--color-svv-green-ink)}
/* « Vacant » est un MOT, jamais une couleur seule : il se lit en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.2rem 0 0}
/* ══ LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE, ET LES CARTES DE BIENS ════════════════════════════════════════
   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
/* Le champ compact d'une fiche : il prend la place qui reste, sans pousser la fiche vers le bas. */
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}
/* Un BLOC de fiche : un titre, un cadre discret, et de l'air. C'est l'unite de lecture de la fiche. */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:.2rem}
.ann-bloc-titre{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:12px 14px;display:flex;flex-direction:column;gap:.5rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
/* Deux colonnes des 520 px, une seule en dessous : un intitule au-dessus de sa valeur reste lisible au telephone. */
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .8rem;margin:0}
.ann-champs dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);margin-top:.35rem}
.ann-champs dd{margin:0;font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9rem 1fr}
  .ann-champs dt{margin-top:.2rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.2rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
/* Le LIBELLE d'origine (« Mobile », « Email »). Il dit LEQUEL des trois numeros on regarde. */
.ann-libelle{font-size:.72rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:none;border:1px solid var(--color-svv-line);border-radius:.4rem;padding:.15rem .5rem;
  font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────────
   Une grille qui se remplit toute seule : une colonne au telephone, deux ou trois sur un grand ecran. */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:10px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  display:flex;flex-direction:column;overflow:hidden;min-width:0}
.ann-carte--ancien{background:var(--color-svv-field)}
/* LA CARTE ENTIERE EST LE BOUTON. Les deux liens qui en sortent sont DANS LE PIED, a cote — jamais dedans :
   un bouton dans un bouton est du HTML invalide et injouable au clavier. */
.ann-carte-corps{display:flex;flex-direction:column;gap:.45rem;align-items:stretch;text-align:left;
  background:none;border:0;padding:12px 14px 8px;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:hover{background:var(--color-svv-field)}
.ann-carte--ancien .ann-carte-corps:hover{background:var(--color-svv-surface)}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.15rem}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:8.5rem}
/* « Vacant » est un MOT, jamais une couleur seule : c'est un fait, et il doit se lire en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.4rem 0 0}
.ann-fiche-titre{margin:.2rem 0 0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-fiche-sous{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.ann-sstitre{margin:.6rem 0 .2rem;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
/* La liste de définitions se replie en une colonne sous 520 px : deux colonnes serrées rendent l'adresse illisible. */
.ann-dl{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.25rem .7rem;margin:0;font-size:.85rem}
.ann-dl dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ann-dl dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.ann-dl{grid-template-columns:1fr;gap:.1rem}.ann-dl dd{margin-bottom:.35rem}}
.ann-contacts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.ann-contact{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-height:44px}

/* ══ 🔴🔴 LOT FICHES-RETOUCHES — LE PIED DE LA CARTE DE BIEN, EN BOUTONS ═══════════════════════════════════════
   Arno : « deux BOUTONS cote a cote sur la meme ligne, de meme hauteur et de meme largeur, avec la meme
   presentation que le bouton “Dossier Drive ↗” de l'en-tete » ; et « Historique » AU-DESSUS, sur toute la largeur.

   🔴 UNE GRILLE DE DEUX COLONNES EGALES (1fr 1fr), ET NON UN FLEX. En flex, chaque bouton prendrait la largeur de
   son texte : « Fiche du locataire → » serait deux fois plus large que « Dossier Drive du lot ↗ », et la promesse
   « meme largeur » serait fausse a l'oeil des la premiere carte. La grille la tient par construction.

   ⚠️ CES REGLES SONT EN FIN DE FEUILLE, EXPRES : ce fichier porte deux definitions successives de .ann-carte-pied
   (une premiere version, puis celle du lot esthetique). En cascade, c'est la DERNIERE qui gagne — s'inserer plus
   haut serait etre ecrase sans un mot.

   AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave terminerait —
   piege consigne TREIZE fois dans ce depot, et treize fois dans un commentaire. */
.ann-carte-pied{display:flex;flex-direction:column;gap:.4rem;padding:0 14px 12px;align-items:stretch}
.ann-carte-duo{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;align-items:stretch}
/* Un seul des deux ? Il prend toute la ligne — une demi-ligne vide se lirait comme un bouton manquant. */
.ann-carte-duo:has(> :only-child){grid-template-columns:1fr}
/* Le bouton de carte : c'est .svv-btn-outline de la charte, centre et calibre pour une grille. */
.ann-carte-bouton{display:inline-flex;align-items:center;justify-content:center;text-align:center;
  width:100%;min-height:36px;padding:.35rem .5rem;font-size:.78rem;line-height:1.15;
  text-decoration:none;overflow-wrap:anywhere}
.ann-carte-bouton--large{width:100%}
/* L'absence de dossier Drive se DIT, a la place du bouton, et reste centree sur la meme ligne de base. */
.ann-carte-sans{display:inline-flex;align-items:center;justify-content:center;text-align:center;
  min-height:36px;font-size:.76rem}
/* Le lien discret de l'en-tete : l'historique tous biens confondus, quand il n'est pas redondant. */
.ann-tete-histo{font-size:.78rem}
`;
