'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CarteEvenement, EtatEcran, LigneFile } from '../../../../lib/gestion/fileRepo';
import {
  depuis, formaterDateFr, libelleEtat, LIBELLE_CLASSER, mentionTroncature, messageErreurHttp, messageEvenementsVide,
  messageFileVide, messageReleve,
} from '../../../../lib/gestion/ecran';
import {
  ecrireEtatUrl, ETAT_DEFAUT, ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION, lireEtatUrl, memeEtat,
  type EtatEcranUrl,
} from '../../../../lib/gestion/ecranUrl';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { InfoBulle, INFOBULLE_CSS } from '../InfoBulle';
import { useReleveGestion } from './useReleveGestion';
import { PanneauAffecter } from './PanneauAffecter';
import { CarteVive } from './CarteVive';
import { Conversation } from './Conversation';
import { ColonneMode } from './ColonneMode';
import { PleinEcranBoite, type EtiquetteAffichee } from './PleinEcranBoite';
import type { ContexteRedactionEcran } from './Redaction';

/**
 * LOT 2/3/4b — l'écran à deux côtés, et les DEUX GESTES.
 *
 * Chaque geste est RÉVERSIBLE DEPUIS CET ÉCRAN, et c'est une exigence, pas un confort : ce qui se fait d'un clic doit se
 * défaire d'un clic. « Classer sans suite » a son pendant « Rouvrir », dans une section qui reste visible — sans quoi
 * écarter un échange serait une suppression déguisée.
 *
 * La FILE ne montre que ce qui a bougé récemment (fenêtre réglée en base, 30 jours par défaut). Les échanges plus
 * anciens ne sont NI supprimés NI masqués en silence : leur nombre est annoncé en toutes lettres.
 *
 * MOBILE D'ABORD (exigence transverse §15) : une seule colonne sous 900 px, LA FILE D'ABORD — et c'est l'ordre du DOM
 * qui le garantit, jamais un `order` CSS qui mentirait au clavier et aux lecteurs d'écran. Aucun débordement horizontal
 * (les objets et adresses cassent en fin de ligne), aucune interaction au survol seul, cibles tactiles ≥ 44 px.
 *
 * COULEURS : uniquement des jetons `--color-svv-*`. L'attente d'une réponse est signalée par un MOT (« attend une
 * réponse »), pas par une couleur seule — elle reste lisible en niveaux de gris comme aux daltoniens.
 */

type Chargement = { etat: 'charge' } | { etat: 'ok'; data: EtatEcran } | { etat: 'erreur'; message: string };


/**
 * LOT 5-FUSION — LES TROIS ÉCRANS, ET LA DISPARITION DES DEUX ONGLETS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES ONGLETS « POSTE DE TRI » / « BOÎTE MAIL » N'EXISTENT PLUS. C'est le SEUL retrait de ce lot, et c'est une
 * décision d'Arno : deux onglets obligeaient à choisir entre « ce que j'ai à faire » et « ce qui existe », alors que
 * les deux servent au même geste. Il n'y a plus qu'une boîte, augmentée : l'écran partagé pour travailler, et le plein
 * écran pour chercher.
 *
 * AUCUNE FONCTION N'A DISPARU AVEC EUX. Ce que montrait l'onglet « Boîte mail » est devenu l'étiquette « Réception »
 * de la boîte en plein écran, avec sa recherche, ses filtres, son interrupteur de courrier automatique et sa
 * pagination. Ce que montrait l'onglet « Poste de tri » est resté l'écran d'arrivée, inchangé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'ÉTAT DE L'ÉCRAN VIT DANS L'ADRESSE (`ecranUrl.ts`, module pur) : recharger la page revient où l'on était, le
 * bouton « Précédent » du navigateur refait le chemin en arrière au lieu de quitter le module, et un écran se copie
 * à quelqu'un d'autre. On empile une entrée d'historique quand l'écran CHANGE, on remplace sinon — sans quoi trois
 * clics sur la même étiquette demanderaient trois « Précédent ».
 */
export function GestionVue({ intro }: {
  /**
   * LOT 5-GMAIL — la phrase de description du module. En plein écran, l'en-tête de la page est COMPACTÉ sur une
   * ligne : la phrase passe alors dans une info-bulle CLIQUABLE (jamais au survol seul). Elle vient de la page, qui
   * la donne aussi à `EnTetePage` — une seule phrase, deux endroits, aucune divergence possible.
   */
  intro?: string;
}) {
  const [vue, setVue] = useState<Chargement>({ etat: 'charge' });
  // Instant de référence des « il y a … », figé au rendu et rafraîchi avec les données. JAMAIS calculé pendant le rendu
  //   d'une ligne : deux lignes d'une même page doivent parler du même « maintenant ».
  const [maintenant, setMaintenant] = useState<Date | null>(null);

  /**
   * LOT 4b/4c — état des GESTES. `panneau` retient l'IDENTIFIANT DE L'ÉCHANGE dont le panneau est ouvert, jamais son
   * rang dans la liste : la file change sous l'écran (relève, rattachement, classement) et un rang ne désigne alors
   * plus le même échange. Déclaré AVANT `charger`, qui le remet à zéro à chaque relecture.
   */
  const [panneau, setPanneau] = useState<number | null>(null);
  const [geste, setGeste] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [gesteEnCours, setGesteEnCours] = useState(false);
  /** LOT 5-FUSION — quel écran, quelle étiquette, quel échange ouvert. Lu et écrit dans l'adresse (voir `ecranUrl`). */
  const [etatUrl, setEtatUrl] = useState<EtatEcranUrl>(ETAT_DEFAUT);
  const [auto, setAuto] = useState(false);
  const [comptesBoite, setComptesBoite] = useState<{ lisibles: number; automatiques: number; envoyes: number } | null>(null);
  /**
   * LOT 5e — CE QUE L'ÉCRAN SAIT DE LA RÉDACTION : base à jour ? droit d'envoyer ? connexion Google ? quelle
   * signature, quel délai d'annulation. `null` = pas encore demandé. Chargé au montage, une seule fois : ces
   * réponses ne changent pas pendant qu'on lit un mail.
   */
  const [redaction, setRedaction] = useState<ContexteRedactionEcran | null>(null);
  const [brouillonsTotal, setBrouillonsTotal] = useState<number | null>(null);
  const { ecran, etiquette, filOuvert } = etatUrl;

  /**
   * L'adresse fait FOI. On la lit au montage — jamais au rendu serveur, où `window` n'existe pas et où une lecture
   * ferait diverger l'hydratation — puis à chaque « Précédent » / « Suivant » du navigateur.
   */
  useEffect(() => {
    const relire = () => setEtatUrl(lireEtatUrl(window.location.search));
    relire();
    window.addEventListener('popstate', relire);
    return () => window.removeEventListener('popstate', relire);
  }, []);

  /** Aller à un écran : on l'affiche, ET on l'écrit dans l'adresse. Les deux ensemble, toujours, ou l'un mentirait. */
  const aller = useCallback((suivant: EtatEcranUrl) => {
    setEtatUrl(suivant);
    if (typeof window === 'undefined') return;
    const url = `${window.location.pathname}${ecrireEtatUrl(suivant)}`;
    // Empiler une entrée seulement si l'écran CHANGE : sinon « Précédent » demanderait autant de clics qu'on en a
    //   donné pour rien. `pushState` (et non `router.push`) : aucun aller-retour serveur pour un changement d'écran.
    if (memeEtat(lireEtatUrl(window.location.search), suivant)) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }, []);

  /**
   * Lit l'écran et RENVOIE le résultat sans toucher à aucun état : c'est l'appelant qui décide quoi en faire. Un refus
   * (403/401) n'est pas une panne, et il est dit pour ce qu'il est — envoyer chercher un bug là où le motif est « pas
   * le droit » fait perdre une demi-journée.
   */
  const lire = useCallback(async (): Promise<Chargement> => {
    try {
      const res = await fetch('/api/admin/gestion', { cache: 'no-store' });
      if (!res.ok) return { etat: 'erreur', message: messageErreurHttp(res.status) };
      return { etat: 'ok', data: (await res.json()) as EtatEcran };
    } catch {
      return { etat: 'erreur', message: messageErreurHttp(0) };
    }
  }, []);

  // Chargement au montage. Le premier acte de l'effet est un `await` → aucun `setState` synchrone dans le corps de
  //   l'effet (cascade de rendus), et `annule` empêche d'écrire dans un composant démonté. Même patron que les autres
  //   écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await lire();
      if (annule) return;
      setMaintenant(new Date());
      setVue(r);
    })();
    return () => { annule = true; };
  }, [lire]);

  /**
   * Relecture DEMANDÉE (clic) : ici l'indicateur d'attente est attendu par celui qui vient de cliquer.
   *
   * LOT 4c — elle REFERME tout panneau ouvert, et c'est structurel, pas cosmétique : la liste qu'on vient de relire
   * n'est plus celle sur laquelle l'utilisateur avait cliqué (un échange rattaché en sort, les suivants remontent).
   * Le faire ICI plutôt qu'à chaque appelant est le seul moyen qu'aucun chemin ne l'oublie — relève automatique et
   * bouton « Rafraîchir » compris.
   */
  const charger = useCallback(async () => {
    setPanneau(null);
    setVue({ etat: 'charge' });
    const r = await lire();
    setMaintenant(new Date());
    setVue(r);
  }, [lire]);

  // LOT 3 — une passe réussie change ce qui est à l'écran : on recharge, sans recharger la page.
  const { enCours: releveEnCours, message: releveMsg, releverMaintenant } = useReleveGestion(() => { void charger(); });

  /**
   * LOT 5e — le contexte de rédaction, demandé UNE FOIS au montage. Un échec le laisse à `null` : aucun bouton
   * d'écriture ne s'affiche alors, et la conversation reste exactement celle d'avant ce lot. Se taire vaut mieux que
   * proposer un geste dont on ne sait pas s'il aboutira.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/redaction', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as ContexteRedactionEcran & { brouillons?: number };
        if (annule || typeof c.schemaPret !== 'boolean') return;
        setRedaction({
          schemaPret: c.schemaPret, peutEnvoyer: c.peutEnvoyer === true, jetonPresent: c.jetonPresent === true,
          signature: c.signature ?? '', nomExpediteur: c.nomExpediteur || 'CRITERIMMO',
          adresseGestion: c.adresseGestion || 'gestion@criterimmo.fr',
          delaiAnnulationS: typeof c.delaiAnnulationS === 'number' ? c.delaiAnnulationS : 10,
        });
        setBrouillonsTotal(typeof c.brouillons === 'number' ? c.brouillons : 0);
      } catch { /* aucun bouton d'écriture : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * LOT 5-FUSION — les nombres des trois étiquettes qui se calculent sur TOUTE la boîte. Demandés SEULEMENT en entrant
   * en plein écran : ce regroupement balaie les 56 000 messages, et le faire payer à l'écran d'accueil pour une
   * colonne qu'on n'y affiche pas serait une lenteur offerte. Un échec laisse les étiquettes SANS nombre plutôt
   * qu'avec des nombres faux — l'écran reste utilisable, il ne raconte simplement rien qu'il ne sait pas.
   */
  useEffect(() => {
    if (ecran !== 'boite' || comptesBoite !== null) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/boite/comptes', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as { lisibles?: number; automatiques?: number; envoyes?: number };
        if (!annule && typeof c.lisibles === 'number') {
          setComptesBoite({ lisibles: c.lisibles, automatiques: c.automatiques ?? 0, envoyes: c.envoyes ?? 0 });
        }
      } catch { /* étiquettes sans nombre : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, [ecran, comptesBoite]);

  /** Un geste = un appel, un compte rendu, un rechargement. Jamais un silence, succès comme échec. */
  const agir = useCallback(async (url: string, methode: 'POST' | 'DELETE', succes: string, corps?: unknown) => {
    if (gesteEnCours) return;
    setGesteEnCours(true);
    setGeste(null);
    try {
      const res = await fetch(url, {
        method: methode,
        ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !data.ok) {
        setGeste({ ton: 'erreur', texte: data.erreur ?? (res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Geste impossible.') });
        return;
      }
      setGeste({ ton: 'ok', texte: succes });
      setPanneau(null);
      await charger();
    } catch {
      setGeste({ ton: 'erreur', texte: 'Geste impossible : le serveur n’a pas répondu.' });
    } finally {
      setGesteEnCours(false);
    }
  }, [gesteEnCours, charger]);

  if (vue.etat === 'charge') return <><style>{CSS_GESTION}</style><p className="gst-info" role="status">Chargement…</p></>;
  if (vue.etat === 'erreur') {
    return (
      <>
        <style>{CSS_GESTION}</style>
        <p className="gst-erreur" role="status">{vue.message}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void charger()}>Réessayer</button>
      </>
    );
  }

  const d = vue.data;
  const ref = maintenant ?? new Date();
  const troncFile = mentionTroncature(d.file.length, d.filsTotal);
  const troncEv = mentionTroncature(d.evenements.length, d.evenementsTotal);
  /**
   * LE POSTE DE TRI, RENDU UNE SEULE FOIS, et affiché à deux endroits : dans la colonne de gauche de l'écran partagé,
   * et sous l'étiquette « À classer » du plein écran. Un seul rendu, donc un seul comportement — le recopier aurait
   * fait deux files qui divergent au premier changement.
   *
   * LOT 5-FUSION-B — le bouton dit « Classer dans une carte » PARTOUT, écran partagé compris (décision d'Arno du
   * 24/09/2026 ; il disait « Affecter à un événement »). Même bouton, même route, même journal : seul le mot change,
   * comme « Replier » avait remplacé « Fermer » au lot 4c. Deux mots pour un même geste font douter qu'il s'agisse du
   * même geste — c'est précisément ce qu'on évite.
   */
  const fileAClasser = d.file.length === 0
    ? <p className="gst-vide">{messageFileVide(d)}</p>
    : (
      <ul className="gst-liste">
        {d.file.map((f) => (
          <LigneFil key={f.filId} fil={f} maintenant={ref}
            ouvert={panneau === f.filId}
            onOuvrir={() => aller({ ...etatUrl, filOuvert: f.filId })}
            occupe={gesteEnCours}
            onAffecter={() => setPanneau(panneau === f.filId ? null : f.filId)}
            onSansSuite={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'POST', 'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', {})}
            onFait={(m) => { setGeste({ ton: 'ok', texte: m }); setPanneau(null); void charger(); }}
            onAnnuler={() => setPanneau(null)} />
        ))}
      </ul>
    );

  /** Les cartes, rendues une seule fois elles aussi : mêmes fonctions dans la colonne et en plein écran. */
  const cartes = d.evenements.map((e) => (
    <CarteVive key={e.evenementId} carte={e} maintenant={ref}
      onGeste={(message, options) => {
        setGeste({ ton: 'ok', texte: message });
        // Un détachement change AUSSI la file (l'échange y revient) : là, tout l'écran est relu. Une
        //   correction ou un changement d'état ne concernent que la carte — la relire elle seule évite
        //   de replier le dossier qu'on est en train de lire.
        if (options?.rechargerTout) void charger();
      }} />
  ));

  const etiquettes = etiquettesDeLEcran(d, comptesBoite, brouillonsTotal);

  return (
    <>
      <style>{CSS_GESTION}</style>
      <style>{INFOBULLE_CSS}</style>

      {/* BANDEAU D'ÉTAT — toujours présent : un outil qui dit depuis quand il n'a pas regardé reste honnête.
          LOT 5-GMAIL — en PLEIN ÉCRAN il devient une ligne compacte qui porte AUSSI le titre du module et sa phrase
          de description (dans une info-bulle cliquable), parce que l'en-tête de page, lui, est replié pour rendre sa
          hauteur à la liste. Rien n'est perdu : ni le titre, ni la phrase, ni l'heure de la dernière relève, ni les
          deux boutons — ce sont exactement les mêmes, sur une ligne au lieu de trois. */}
      <div className={`gst-bandeau${ecran === 'partage' ? '' : ' gst-bandeau--compact'}`} role="status">
        {ecran !== 'partage' && (
          <span className="gst-bandeau-titre">
            Gestion
            {intro && <InfoBulle libelle="Le module Gestion" texte={intro} cible="gestion-intro" />}
          </span>
        )}
        <span>{messageReleve(d, ref)}</span>
        <span className="gst-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={releveEnCours}
            onClick={() => void releverMaintenant()}>
            {releveEnCours ? 'Relève en cours…' : 'Relever maintenant'}
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={releveEnCours}
            onClick={() => void charger()}>Rafraîchir</button>
        </span>
      </div>
      {/* COMPTE RENDU de la dernière passe — succès comme échec, jamais un silence. */}
      {releveMsg && <p className={`gst-compte-rendu gst-ton-${releveMsg.ton}`} role="status">{releveMsg.texte}</p>}
      {geste && <p className={`gst-compte-rendu gst-ton-${geste.ton}`} role="status">{geste.texte}</p>}

      {/* LOT 5-FUSION — LES TROIS ÉCRANS. Une conversation ouverte occupe l'écran partagé, comme depuis le lot 5b ;
          en plein écran elle a sa propre colonne. C'est la MÊME vue dans les deux cas. */}
      {ecran === 'boite' ? (
        <PleinEcranBoite
          etiquette={etiquette} etiquettes={etiquettes} filOuvert={filOuvert} maintenant={ref}
          auto={auto} onAuto={setAuto}
          onEtiquette={(e) => { setPanneau(null); aller({ ...etatUrl, etiquette: e, filOuvert: null }); }}
          onOuvrir={(id) => aller({ ...etatUrl, filOuvert: id })}
          onFermerFil={() => aller({ ...etatUrl, filOuvert: null })}
          onRetour={() => aller({ ...ETAT_DEFAUT })}
          onGeste={(m, o) => { setGeste({ ton: 'ok', texte: m }); if (o?.rechargerTout) void charger(); }}
          redaction={redaction}
          enfantAClasser={fileAClasser} />
      ) : ecran === 'evenements' ? (
        /* ÉVÉNEMENTS EN PLEIN ÉCRAN — les MÊMES cartes, avec toutes leurs fonctions : rien n'est retiré, la largeur
           disponible sert seulement à en montrer deux de front au lieu d'une. */
        <div className="pe">
          {/* LOT 5-FUSION-B — la colonne du mode prend la place des liens de modules. ⚠️ Elle ne contient QUE ce que
              la colonne des cartes portait déjà : son titre, son compteur, la mention de troncature, et le retour.
              La colonne des cartes n'a JAMAIS eu de recherche ni de filtre (la recherche d'événement, elle, vit dans
              les panneaux « Classer dans une carte » et « Déplacer », et elle y reste) — on n'en invente donc pas. */}
          <ColonneMode actif panneauMobile="contenu" titre="Événements">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => aller({ ...ETAT_DEFAUT })}>
              ← Écran partagé
            </button>
            <h2 className="cm-titre" id="gst-titre-ev-plein">
              Événements <span className="gst-compte">{d.evenementsTotal}</span>
            </h2>
            {troncEv && <p className="cm-note">{troncEv}</p>}
          </ColonneMode>
          {filOuvert !== null && (
            <section className="gst-col">
              <Conversation filId={filOuvert} maintenant={ref} onFerme={() => aller({ ...etatUrl, filOuvert: null })}
                onGeste={(m, o) => { setGeste({ ton: 'ok', texte: m }); if (o?.rechargerTout) { aller({ ...etatUrl, filOuvert: null }); void charger(); } }} />
            </section>
          )}
          {d.evenements.length === 0
            ? <p className="gst-vide">{messageEvenementsVide()}</p>
            : <ul className="gst-liste gst-cartes-larges">{cartes}</ul>}
        </div>
      ) : filOuvert !== null ? (
        <section className="gst-col">
          <Conversation filId={filOuvert} maintenant={ref} onFerme={() => aller({ ...etatUrl, filOuvert: null })}
            onGeste={(m, o) => { setGeste({ ton: 'ok', texte: m }); if (o?.rechargerTout) { aller({ ...etatUrl, filOuvert: null }); void charger(); } }} />
        </section>
      ) : (
      /* ORDRE DU DOM = ordre mobile : la file d'abord, les événements ensuite. */
      <div className="gst-deux">
        <section className="gst-col" aria-labelledby="gst-titre-file">
          {/* LOT 5-FUSION — le plein écran de CETTE colonne, au-dessus d'elle. Il ne remplace rien : la colonne reste
              exactement ce qu'elle était, il ouvre seulement la même chose en plus grand, avec ses étiquettes. */}
          <div className="gst-entete-col">
            <h2 className="gst-titre" id="gst-titre-file">
              À classer <span className="gst-compte">{d.filsTotal}</span>
            </h2>
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { setPanneau(null); aller({ ecran: 'boite', etiquette: ETIQUETTE_ARRIVEE, filOuvert: null }); }}>
              Plein écran
            </button>
          </div>
          {troncFile && <p className="gst-tronc">{troncFile}</p>}
          {/* FENÊTRE D'ACTIVITÉ — dite en toutes lettres. Un outil qui cache sans le dire ment. */}
          {d.filsTropAnciens > 0 && (
            <p className="gst-tronc">
              {d.filsTropAnciens} échange{d.filsTropAnciens > 1 ? 's' : ''} plus ancien{d.filsTropAnciens > 1 ? 's' : ''} que {d.fenetreJours} jours
              {' '}ne {d.filsTropAnciens > 1 ? 'sont' : 'est'} pas affiché{d.filsTropAnciens > 1 ? 's' : ''} dans la file.
              {' '}Rien n’est supprimé : {d.filsTropAnciens > 1 ? 'ils restent' : 'il reste'} en base.
              {/* LOT 5a — la phrase ne change pas d'un mot ; on lui AJOUTE la sortie qui lui manquait.
                  LOT 5-FUSION — cette sortie mène désormais à l'étiquette « Réception », qui est ce que montrait
                  l'onglet supprimé : tout le courrier, sans la fenêtre de 30 jours. */}
              {' '}
              <button type="button" className="gst-lien-bouton"
                onClick={() => { setPanneau(null); aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: null }); }}>
                Les voir dans la boîte mail
              </button>
            </p>
          )}
          {fileAClasser}

          {/* CLASSÉS SANS SUITE — la contrepartie du geste : visible, et réversible d'un clic. */}
          {d.sansSuiteTotal > 0 && (
            <details className="gst-sans-suite">
              <summary className="gst-sans-suite-titre">Classés sans suite <span className="gst-compte">{d.sansSuiteTotal}</span></summary>
              <ul className="gst-liste">
                {d.sansSuite.map((f) => (
                  <li key={f.filId} className="gst-item">
                    <div className="gst-item-haut"><span className="gst-objet">{nettoyerObjet(f.objet) || '(sans objet)'}</span></div>
                    <div className="gst-item-bas">
                      <span title={formaterDateFr(f.classeLe)}>classé {depuis(f.classeLe, ref)}</span>
                      {f.classePar && <><span className="gst-sep" aria-hidden="true">·</span><span>par {f.classePar}</span></>}
                      {f.motif && <><span className="gst-sep" aria-hidden="true">·</span><span>{f.motif}</span></>}
                    </div>
                    <div className="gst-actions">
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={gesteEnCours}
                        onClick={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'DELETE', 'Échange rouvert : il est revenu dans la file.')}>
                        Rouvrir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="gst-col" aria-labelledby="gst-titre-ev">
          <div className="gst-entete-col">
            <h2 className="gst-titre" id="gst-titre-ev">
              Événements <span className="gst-compte">{d.evenementsTotal}</span>
            </h2>
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => aller({ ecran: 'evenements', etiquette, filOuvert: null })}>
              Plein écran
            </button>
          </div>
          {troncEv && <p className="gst-tronc">{troncEv}</p>}
          {d.evenements.length === 0
            ? <p className="gst-vide">{messageEvenementsVide()}</p>
            : <ul className="gst-liste">{cartes}</ul>}
        </section>
      </div>
      )}
    </>
  );
}

/**
 * LOT 5-FUSION — LA COLONNE D'ÉTIQUETTES, construite à partir de ce que l'écran SAIT DÉJÀ. PURE, donc éprouvable.
 *
 * 🔴 AUCUN COMPTEUR N'EST RECALCULÉ ICI. « À classer » et « Sans suite » sont ceux du poste de tri, mot pour mot ;
 * « Réception », « Envoyés » et « Courrier automatique » viennent de l'unique lecture `comptesBoite` ; le nombre
 * d'échanges d'une carte est celui qu'elle affiche déjà dans sa colonne. Deux calculs auraient donné, tôt ou tard,
 * deux chiffres différents pour la même chose — et c'est toujours l'écran le moins regardé qui garde le faux.
 *
 * ⚠️ AUCUNE ÉTIQUETTE « À TRAITER » : l'état par échange n'existe pas en base (il vient dans un lot dédié), et une
 * étiquette qui ne s'appuierait sur rien mentirait dès le premier clic.
 */
export function etiquettesDeLEcran(
  d: EtatEcran, comptes: { lisibles: number; automatiques: number; envoyes: number } | null,
  brouillons: number | null = null,
): EtiquetteAffichee[] {
  return [
    { etiquette: { sorte: 'a_classer', evenementId: null }, libelle: 'À classer', compte: d.filsTotal },
    { etiquette: ETIQUETTE_RECEPTION, libelle: 'Réception', compte: comptes?.lisibles ?? null },
    { etiquette: { sorte: 'envoyes', evenementId: null }, libelle: 'Envoyés', compte: comptes?.envoyes ?? null },
    { etiquette: { sorte: 'sans_suite', evenementId: null }, libelle: 'Sans suite', compte: d.sansSuiteTotal },
    { etiquette: { sorte: 'automatique', evenementId: null }, libelle: 'Courrier automatique', compte: comptes?.automatiques ?? null },
    // LOT 5e — les BROUILLONS. Comme les autres : pas d'étiquette vide, et son nombre vient d'une seule lecture.
    { etiquette: { sorte: 'brouillons', evenementId: null }, libelle: 'Brouillons', compte: brouillons },
    // Les CARTES, dans l'ordre où la colonne des événements les montre : ce qui attend une réponse depuis le plus
    //   longtemps d'abord. Deux ordres pour une même liste feraient chercher deux fois.
    ...d.evenements.map((e): EtiquetteAffichee => ({
      etiquette: { sorte: 'carte', evenementId: e.evenementId },
      libelle: e.objet,
      reference: e.reference,
      compte: e.nbFils,
    })),
  ];
}

/** Une ligne de la file = UN ÉCHANGE (pas un message) : à ce volume, six mails ne doivent pas prendre six lignes.
 *  EXPORTÉ pour être rendu en test (contrat visible : mot « attend une réponse », pluriels, jamais de couleur seule). */
export function LigneFil({ fil, maintenant, ouvert = false, occupe = false, onAffecter, onSansSuite, onFait, onAnnuler, onOuvrir }: {
  fil: LigneFile; maintenant: Date;
  ouvert?: boolean; occupe?: boolean;
  onAffecter?: () => void; onSansSuite?: () => void;
  onFait?: (message: string) => void; onAnnuler?: () => void;
  /** LOT 5b — ouvrir la CONVERSATION depuis la file de tri. Optionnel : sans lui, la ligne est exactement celle d'avant. */
  onOuvrir?: () => void;
}) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        {/* LOT 4d-C — AFFICHAGE seulement : la cascade de « Re: / TR: / Fwd: » ne dit rien de plus que l'objet,
            elle dit juste que le mail a beaucoup circulé. L'objet enregistré, lui, n'est pas touché. */}
        {/* LOT 5b — l'objet devient la porte d'entrée de la conversation, comme dans n'importe quelle messagerie.
            Sans `onOuvrir`, il reste le texte simple d'avant : aucune ligne existante ne change de comportement. */}
        {onOuvrir
          ? <button type="button" className="gst-objet gst-objet-bouton" onClick={onOuvrir}>{nettoyerObjet(fil.objet) || '(sans objet)'}</button>
          : <span className="gst-objet">{nettoyerObjet(fil.objet) || '(sans objet)'}</span>}
        {fil.attend && <span className="gst-attend">attend une réponse</span>}
      </div>
      <div className="gst-item-bas">
        <span className="gst-qui">{fil.interlocuteur ?? '(expéditeur inconnu)'}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(fil.dernierLe)}>{depuis(fil.dernierLe, maintenant)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{fil.nbMessages} message{fil.nbMessages > 1 ? 's' : ''}</span>
        {fil.nbPieces > 0 && <><span className="gst-sep" aria-hidden="true">·</span><span>{fil.nbPieces} pièce{fil.nbPieces > 1 ? 's' : ''} jointe{fil.nbPieces > 1 ? 's' : ''}</span></>}
      </div>
      {/* LES DEUX GESTES. Rendus seulement si l'appelant les fournit → la ligne reste rendable en lecture seule. */}
      {(onAffecter || onSansSuite) && (
        <div className="gst-actions">
          {onAffecter && (
            // LOT 4c — « Replier », et non « Fermer » : dans un outil de gestion locative, « fermer » se comprend
            //   comme « clore le dossier ». Le bouton ne fait que replier le panneau ; il le dit maintenant.
            <button type="button" className={`svv-btn ${ouvert ? 'svv-btn-outline' : 'svv-btn-primary'} gst-btn`}
              aria-expanded={ouvert} disabled={occupe} onClick={onAffecter}>
              {ouvert ? 'Replier' : LIBELLE_CLASSER}
            </button>
          )}
          {onSansSuite && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onSansSuite}>
              Classer sans suite
            </button>
          )}
        </div>
      )}
      {/* Le panneau porte le NOM de l'échange sur lequel il agit : après un geste la liste remonte d'un cran, et un
          panneau anonyme ouvert à la même place que le précédent ferait rattacher le mauvais échange sans rien dire. */}
      {ouvert && onFait && onAnnuler && (
        <PanneauAffecter filId={fil.filId} objet={nettoyerObjet(fil.objet) || '(sans objet)'} onFait={onFait} onAnnuler={onAnnuler} />
      )}
    </li>
  );
}

/** Une carte d'événement : qui demande, quoi, depuis quand, dernier échange, état. EXPORTÉE pour être rendue en test. */
export function CarteEv({ carte, maintenant }: { carte: CarteEvenement; maintenant: Date }) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        <span className="gst-objet">{carte.objet}</span>
        {carte.attend && <span className="gst-attend">attend une réponse</span>}
      </div>
      <div className="gst-item-bas">
        <span className="gst-ref">{carte.reference}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{libelleEtat(carte.etat)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(carte.ouvertLe)}>ouvert {depuis(carte.ouvertLe, maintenant)}</span>
      </div>
      <div className="gst-item-bas">
        {carte.demandeur && <><span className="gst-qui">{carte.demandeur}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        {carte.adresseLibre && <><span>{carte.adresseLibre}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        <span>{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}</span>
        {carte.dernierEchangeLe && <>
          <span className="gst-sep" aria-hidden="true">·</span>
          <span title={formaterDateFr(carte.dernierEchangeLe)}>dernier échange {depuis(carte.dernierEchangeLe, maintenant)}</span>
        </>}
      </div>
    </li>
  );
}

const CSS_GESTION = `
/* DEUX CÔTÉS au-dessus de 900 px ; UNE colonne en dessous, la file d'abord — par l'ordre du DOM, jamais par un order CSS. */
/* ── LOT 5-GMAIL : LA PAGE, ET SON EN-TÊTE REPLIÉ EN PLEIN ÉCRAN ───────────────────────────────────────────────── */
/* La largeur de confort de l'écran partagé ; en plein écran, la boîte prend toute la place disponible. */
.gst-page{max-width:1120px}
:root[data-gst-plein="1"] .gst-page{max-width:none}
/* L'en-tête de page (titre + phrase) se replie : son titre et sa phrase repassent dans le bandeau compact, qui les
   porte l'un à côté de l'autre. Rien n'est retiré — c'est un déménagement, et il est réversible au clic sur retour. */
:root[data-gst-plein="1"] .svv-page-head{display:none}
.gst-bandeau--compact{padding:6px 10px;margin-bottom:.6rem;gap:.5rem}
.gst-bandeau-titre{display:inline-flex;align-items:center;gap:.4rem;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
/* LOT 5-FUSION — L'EN-TÊTE D'UNE COLONNE : son titre, et son bouton « Plein écran » au bout. Il passe à la ligne sur
   téléphone plutôt que de comprimer le titre — un bouton de 44 px et un titre lisible ne tiennent pas sur 320 px. */
.gst-entete-col{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .5rem}
.gst-entete-col .gst-titre{margin:0}
.gst-deux{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
/* Les cartes en plein écran : deux de front quand la largeur le permet, une seule sinon. Aucune fonction n'y change.
   Point de rupture en max-width, comme tout le reste de cette feuille : c'est la convention du fichier, et elle évite
   qu'une largeur minimale en dur se glisse dans une règle. */
.gst-cartes-larges{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}
@media (max-width:1099px){.gst-cartes-larges{grid-template-columns:1fr}}
@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}
.gst-col{min-width:0}  /* sans ça, une grille laisse un enfant déborder de sa colonne */
.gst-titre{display:flex;align-items:center;gap:.5rem;font-size:15px;font-weight:700;color:var(--color-svv-ink);margin:0 0 .5rem}
.gst-compte{display:inline-block;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px}
.gst-bandeau{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;margin:0 0 1rem;font-size:.85rem;color:var(--color-svv-ink);line-height:1.45}
.gst-btn{width:auto;flex-shrink:0;min-height:44px;padding:.55rem 1rem;font-size:.85rem;border-radius:.6rem}
.gst-actions{display:flex;flex-wrap:wrap;gap:.5rem;flex-shrink:0}
/* Compte rendu de passe : le TON est porté par un mot dans le texte autant que par la couleur (jamais la couleur seule). */
.gst-compte-rendu{font-size:.85rem;line-height:1.5;margin:0 0 1rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-ton-erreur{border-color:var(--color-svv-red);color:var(--color-svv-red);font-weight:600}
.gst-ton-info{color:var(--color-svv-muted)}
.gst-info,.gst-vide,.gst-tronc{font-size:.85rem;color:var(--color-svv-muted);line-height:1.5;margin:0 0 .5rem}
.gst-vide{background:var(--color-svv-surface);border:1px dashed var(--color-svv-line-strong);border-radius:10px;padding:14px 16px}
.gst-erreur{font-size:.9rem;font-weight:600;color:var(--color-svv-red);margin:0 0 .6rem}
.gst-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Cible tactile confortable ; tout casse en fin de ligne → jamais de débordement horizontal, même sur un objet sans espace. */
.gst-item{min-height:44px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;overflow-wrap:anywhere}
.gst-item-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
.gst-item-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted);margin-top:4px}
.gst-objet-bouton{background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;color:inherit;font:inherit;font-weight:inherit;min-height:44px;text-decoration:underline;text-underline-offset:3px}
.gst-objet-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gst-objet{font-weight:700;font-size:.92rem;color:var(--color-svv-ink);line-height:1.35}
.gst-qui{font-weight:600;color:var(--color-svv-ink)}
.gst-ref{font-variant-numeric:tabular-nums;font-weight:600;color:var(--color-svv-ink)}
.gst-sep{color:var(--color-svv-line-strong)}
/* L'attente est dite par un MOT, jamais par la seule couleur (lisible en niveaux de gris et aux daltoniens). */
.gst-attend{flex-shrink:0;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--color-svv-red);border:1px solid var(--color-svv-red);border-radius:999px;padding:2px 8px}
/* PANNEAU d'affectation, ouvert sous la ligne. */
.gst-panneau{margin-top:10px;padding:12px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;display:flex;flex-direction:column;gap:10px}
/* Sur QUOI on agit, rappelé dans le panneau : la liste bouge sous l'écran, pas la mémoire de celui qui clique. */
.gst-panneau-titre{margin:0;font-size:.8rem;color:var(--color-svv-muted);line-height:1.4}
.gst-voies{display:flex;flex-wrap:wrap;gap:.5rem}
.gst-voie{min-height:44px;padding:.5rem .9rem;font-size:.85rem;font-weight:600;border-radius:.6rem;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.gst-voie--active{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.gst-voie:disabled{opacity:.5;cursor:not-allowed}
.gst-champs{display:flex;flex-direction:column;gap:10px}
.gst-champ{display:flex;flex-direction:column;gap:4px}
/* 16px minimum : en dessous, les navigateurs mobiles zooment à la mise au point du champ. */
.gst-saisie{min-height:44px;width:100%;box-sizing:border-box;padding:.5rem .7rem;font-size:16px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-note{margin:0;font-size:.78rem;line-height:1.4;color:var(--color-svv-muted)}
/* ── LOT 4c : LA CARTE VIVANTE ─────────────────────────────────────────────────────────────────────────────────── */
/* La ligne de titre d'un bloc repliable est un vrai bouton : on la laisse occuper toute la largeur et respirer. */
.gst-repli{align-items:flex-start;padding:.6rem .7rem}
.gst-carte-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;min-width:0}
.gst-carte-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;flex-basis:100%;font-size:.8rem;font-weight:400;color:var(--color-svv-muted)}
.gst-corps{display:flex;flex-direction:column;gap:12px;padding:12px 2px 2px}
.gst-bloc{display:flex;flex-direction:column;gap:8px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px}
.gst-sous-titre{margin:.25rem 0 0;font-size:13px;font-weight:700;color:var(--color-svv-ink);display:flex;align-items:center;gap:.5rem}
/* Fiche d'une carte : deux colonnes au large, une seule sur mobile — jamais un tableau qui déborde. */
.gst-fiche{display:grid;grid-template-columns:auto 1fr;gap:.35rem .75rem;margin:0;font-size:.85rem}
.gst-fiche dt{font-weight:700;color:var(--color-svv-muted)}
.gst-fiche dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.gst-fiche{grid-template-columns:1fr;gap:.1rem}.gst-fiche dd{margin-bottom:.4rem}}
/* Une donnée absente est DITE absente — un blanc laisserait croire à un oubli d'affichage. */
.gst-absent{color:var(--color-svv-muted);font-style:italic}
.gst-item--fil{background:var(--color-svv-field)}
.gst-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Un message : le sens est porté par un MOT (« reçu de » / « nous avons écrit »), la bordure ne fait que l'appuyer. */
.gst-msg{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-line-strong);border-radius:8px;padding:8px 10px}
.gst-msg--envoye{border-left-color:var(--color-svv-green)}
.gst-msg-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.78rem;color:var(--color-svv-muted)}
/* pre-wrap : le texte du mail garde ses paragraphes ; anywhere : une URL à rallonge ne fait pas déborder l'écran. */
.gst-msg-corps{margin:.4rem 0 0;font-size:.85rem;line-height:1.5;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.gst-etiquette{font-size:11px;font-weight:700;color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong);border-radius:999px;padding:1px 7px}
.gst-pieces{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.gst-piece{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted)}
/* Cible tactile : un lien de pièce jointe se clique au doigt comme un bouton. */
.gst-lien{min-height:44px;display:inline-flex;align-items:center;font-weight:600;color:var(--color-svv-red);text-decoration:underline}
/* ── LOT 4d : LE MENU DISCRET, ET LA RECHERCHE D'ÉVÉNEMENT ─────────────────────────────────────────────────────── */
/* Le menu se pose dans le coin de l'élément, SANS entrer dans le bouton de titre (un bouton dans un bouton n'existe pas). */
.gst-coin{position:absolute;top:6px;right:6px;z-index:2}
/* …et le titre lui réserve sa place, pour qu'aucun texte ne passe sous le menu. */
.gst-repli--avec-menu{padding-right:52px}
.gst-item--fil{position:relative}
.gst-menu{position:relative;display:inline-block}
/* DISCRET AU REPOS, jamais introuvable : le glyphe est pâle, mais la cible fait 44 px et le focus est très visible. */
.gst-menu-bouton{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;
  font-size:18px;line-height:1;color:var(--color-svv-muted);background:transparent;border:1px solid transparent;
  border-radius:.5rem;cursor:pointer}
.gst-menu-bouton:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line)}
.gst-menu-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;color:var(--color-svv-ink)}
.gst-menu-bouton[aria-expanded="true"]{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.gst-menu-bouton:disabled{opacity:.4;cursor:not-allowed}
.gst-menu-liste{position:absolute;top:100%;right:0;z-index:5;min-width:min(260px,80vw);display:flex;flex-direction:column;
  /* Pas d'ombre portée : elle exigerait une couleur en dur, et la charte n'en a pas. Une bordure franche suffit à
     détacher le menu du fond, et reste lisible en contraste élevé. */
  background:var(--color-svv-surface);border:2px solid var(--color-svv-line-strong);border-radius:.6rem;overflow:hidden}
.gst-menu-entree{min-height:44px;padding:.6rem .8rem;text-align:left;font-size:.85rem;color:var(--color-svv-ink);
  background:transparent;border:0;border-bottom:1px solid var(--color-svv-line);cursor:pointer}
.gst-menu-entree:last-child{border-bottom:0}
/* LOT 5-FIDÈLE — les séparateurs et les sections de Gmail. Un trait, un titre : on vise sans lire. */
.gst-menu-groupe{border-top:2px solid var(--color-svv-line-strong)}
.gst-menu-section{margin:0;padding:.45rem .8rem .1rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--color-svv-muted)}
.gst-menu-entree{display:flex;flex-direction:column;gap:2px}
.gst-menu-aide{font-size:.72rem;line-height:1.35;color:var(--color-svv-muted);white-space:normal}
/* SUR TÉLÉPHONE, le menu est une FEUILLE PLEINE LARGEUR : un menu de 260 px collé à droite déborde de l'écran. */
@media (max-width:599px){
  .gst-menu-liste{position:fixed;left:0;right:0;bottom:0;top:auto;min-width:0;width:100%;max-height:75vh;
    overflow-y:auto;border-radius:.9rem .9rem 0 0;border-width:2px 0 0}
}
.gst-menu-entree:hover,.gst-menu-entree:focus-visible{background:var(--color-svv-field)}
/* Défaire n'est pas dangereux dans ce module : la teinte est SOBRE, jamais un rouge d'alerte qui ferait hésiter. */
.gst-menu-entree--discrete{color:var(--color-svv-muted)}
/* RECHERCHE D'ÉVÉNEMENT — la même partout : file, déplacement d'un échange, déplacement d'un mail. */
.gst-choix{display:flex;flex-direction:column;gap:8px}
.gst-resultats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;max-height:min(46vh,340px);overflow-y:auto}
.gst-resultat{width:100%;min-height:44px;display:flex;flex-direction:column;gap:2px;padding:.5rem .6rem;text-align:left;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.5rem;cursor:pointer}
.gst-resultat:hover,.gst-resultat:focus-visible{border-color:var(--color-svv-line-strong)}
.gst-resultat--choisi{border-color:var(--color-svv-red)}
.gst-resultat--nouveau{font-weight:700;color:var(--color-svv-ink);border-style:dashed}
.gst-resultat-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;justify-content:space-between}
.gst-resultat-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.78rem;color:var(--color-svv-muted)}
/* LOT 4d-B2 — LES MAILS PARTIS d'un échange : annoncés, et remis d'un clic. Discret, mais jamais tu. */
.gst-partis{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.gst-parti{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;font-size:.8rem;color:var(--color-svv-muted);
  border-left:3px solid var(--color-svv-line-strong);padding:.25rem .5rem}
.gst-lien-bouton{min-height:44px;padding:0;font-size:.8rem;font-weight:600;color:var(--color-svv-red);background:transparent;
  border:0;text-decoration:underline;cursor:pointer}
/* Le menu d'un message se range au bout de sa ligne d'en-tête, sans pousser le texte. */
.gst-msg-menu{margin-left:auto}
/* LOT 4d-C — le texte CITÉ et les images de signature : présents, repliés, jamais supprimés. */
.gst-cite{margin-top:.4rem}
.gst-cite-titre{min-height:44px;display:flex;align-items:center;font-size:.78rem;font-weight:600;color:var(--color-svv-muted);cursor:pointer}
.gst-cite-corps{color:var(--color-svv-muted);border-left:2px solid var(--color-svv-line-strong);padding-left:.6rem}
/* CLASSÉS SANS SUITE — replié par défaut : présent sans encombrer. */
.gst-sans-suite{margin-top:1rem;border-top:1px solid var(--color-svv-line);padding-top:.75rem}
.gst-sans-suite-titre{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:13px;font-weight:700;color:var(--color-svv-ink);cursor:pointer}
`;
