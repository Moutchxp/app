'use client';

import { jourParisISO } from '../../../../lib/permis/horodatageParis';
import { PastilleStatutPage, libelleStatutPage, type StatutPage, type ResumePagesAnalysees } from './TraceEmpriseRendu';
import type { RunReperageAffiche } from '../../../../lib/permis/reperePlanchesRepo';
import type { LecturePageAffiche } from '../../../../lib/permis/lectureValeursPageRepo';

/**
 * BARRE de commandes de la VISIONNEUSE de pièces — composant PRÉSENTATIONNEL PARTAGÉ (une seule vérité), monté SOUS le canvas par
 * `LiseusePieces` (planche cadastrale) ET par `BlocTraceEmprise` (« Bâtiments et projection »). Extraite pour éviter toute divergence
 * (deux copies se seraient désynchronisées — le mal qu'on vient de corriger). 🔴 N'AFFICHE RIEN qui touche au rendu pdf.js / au calage :
 * elle vit AUTOUR du canvas. Chaque appelant lui passe état + handlers ; les actions serveur restent celles des repos (reperer_planches,
 * lire_valeurs_page, annuler_lecture_page, exclure/inclure_page_bestof, url_piece). Aucune I/O ici : pur affichage.
 *
 * DISPOSITION (exigence Arno, révisée) : UNE SEULE paire ‹ précédent / suivant › visible SOUS l'image, à l'extrême gauche/droite —
 * c'est la navigation entre PLANS du best-of (portée par `slotNav` = BandePlans / NavPieceLibre, en space-between). Tout le BLOC
 * D'INFORMATION (plan i sur n, type, nom du fichier + page + échelle) et « voir toutes les pièces » (`slotPieces`) descendent ici,
 * sous l'image. La navigation entre PAGES d'un fichier multi-pages reste ACCESSIBLE mais sous forme d'un CONTRÔLE DISCRET, nettement
 * distinct de la paire de plans (petit, centré, libellé « pages de ce fichier », flèches ◁ ▷) : on ne confond jamais « changer de
 * plan » et « changer de page ». Les DEUX visionneuses passent les mêmes slots → disposition identique (aucune re-divergence).
 */
export interface BarreVisionneusePiecesProps {
  pieceId: number | null;
  nomCourant: string;
  page: number;
  nbPagesPiece: number;
  echelle?: string | null;
  nav: 'bestof' | 'piece';               // mode courant : en 'piece', slotNav feuillette déjà les pages → pas de contrôle de page en double
  slotNav: React.ReactNode;              // navigation PRIMAIRE (unique paire ‹/›) : BandePlans (best-of) ou NavPieceLibre (pièce libre)
  slotPieces: React.ReactNode;           // « voir toutes les pièces du dossier » (contenu propre à chaque visionneuse) descendu sous l'image
  onOuvrirDocument: () => void;          // LIEN vers le document source (nouvel onglet) — url_piece
  onPagePrecedente: () => void;
  onPageSuivante: () => void;
  onRetourBestOf: () => void;            // revenir à la sélection best-of (depuis une page du fichier hors best-of) — demande « où suis-je »
  pageDansBestOf: boolean;
  onRetirerBestOf: () => void;           // exclure_page_bestof / desinclure_page_bestof
  onAjouterBestOf: () => void;           // inclure_page_bestof
  statutPage: StatutPage;
  resumePages: ResumePagesAnalysees;
  pleinPagesAnalysees: boolean;
  onTogglePleinPages: () => void;
  runCourant?: RunReperageAffiche;
  lectureCourante?: LecturePageAffiche;
  reperEnCours: boolean;
  lectureEnCours: boolean;
  onAnalyseFichier: () => void;          // reperer_planches (fichier complet)
  onAnalysePage: () => void;             // lire_valeurs_page (une page)
  reperMsg: string | null;
  lectureRes: { cle: string; texte: string; ecrit: boolean; echec?: boolean } | null; // `echec` : la DERNIÈRE analyse de cette page a échoué (transitoire) → capsule « analyse échouée »
  onAnnulerValeur: () => void;           // annuler_lecture_page
}

export function BarreVisionneusePieces({
  pieceId, nomCourant, page, nbPagesPiece, echelle, nav, slotNav, slotPieces, onOuvrirDocument, onPagePrecedente, onPageSuivante, onRetourBestOf,
  pageDansBestOf, onRetirerBestOf, onAjouterBestOf, statutPage, resumePages, pleinPagesAnalysees, onTogglePleinPages,
  runCourant, lectureCourante, reperEnCours, lectureEnCours, onAnalyseFichier, onAnalysePage, reperMsg, lectureRes, onAnnulerValeur,
}: BarreVisionneusePiecesProps) {
  // BUG « voir toutes les pièces VIDE » — RÉGRESSION de la factorisation : la barre faisait `return null` quand AUCUNE pièce n'est
  //   ouverte (pieceId null), ce qui masquait AUSSI l'échappatoire `slotPieces` (« voir toutes les pièces ») et la nav `slotNav` — donc
  //   plus aucun moyen de CHOISIR une pièce quand aucune n'est auto-sélectionnée (dossier avec bâtiments mais sans pièce PDF auto-ouverte).
  //   Avant la factorisation, le sélecteur était rendu INCONDITIONNELLEMENT. On rétablit : `slotNav` + `slotPieces` TOUJOURS rendus ;
  //   seules les commandes LIÉES À LA PAGE (nav page, lien, statut, best-of, analyses) restent gardées par `pageOuverte`.
  const pageOuverte = pieceId !== null;
  // CAPSULE IA — QUATRE ÉTATS (la VÉRITÉ de l'analyse de LA page affichée, y compris hors best-of) :
  //   • echec (transitoire : la DERNIÈRE analyse de cette page a échoué) → « analyse échouée », jamais silencieux ;
  //   • valeurs (lecture envoyée + ≥ 1 valeur écrite) → « Page analysée IA », FOND BLEU + texte BLANC (demande Arno) ;
  //   • sans_valeur (lecture faite mais AUCUNE valeur exploitable, ou page non envoyée par précaution) → registre NEUTRE (jamais rouge) ;
  //   • fichier (à défaut de lecture de page : le fichier entier a été repéré) ; • aucune (jamais analysée).
  // Une lecture de PAGE (audit `permis_page_lecture`) PRIME le repérage de fichier. La distinction valeurs/sans_valeur lève le bug
  //   « cerfa analysé → non analysée » : envoyee=true & nb_valeurs=0 est « analysée, aucune valeur », PAS « non analysée ».
  const echecCourant = lectureRes?.cle === `${pieceId}:${page}` && lectureRes.echec === true;
  const etatIA: 'echec' | 'valeurs' | 'sans_valeur' | 'fichier' | 'aucune' =
    echecCourant ? 'echec'
      : (lectureCourante && lectureCourante.envoyee && lectureCourante.nbValeurs > 0) ? 'valeurs'
        : lectureCourante ? 'sans_valeur'
          : runCourant ? 'fichier'
            : 'aucune';
  const detailIA: string | null = lectureCourante
    ? (lectureCourante.envoyee ? (lectureCourante.nbValeurs > 0 ? 'valeur écrite' : (lectureCourante.resume ?? 'aucune valeur exploitable sur cette page')) : (lectureCourante.motif ? `non envoyée : ${lectureCourante.motif}` : 'non envoyée par précaution'))
    : runCourant ? 'fichier repéré' : null;
  // Rendu par état. Couleurs FIXES pour « valeurs » (bleu #1a4d8f / blanc) et « échec » (ambre #8a5a00 / blanc) → lisibles clair ET
  //   sombre, indépendantes du thème (chip pleine). Les états neutres utilisent des tokens (fond = celui, thématisé, de la ligne).
  const capsuleBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, borderRadius: '.35rem', padding: '.1rem .45rem', whiteSpace: 'nowrap', flex: '0 0 auto' };
  const CAPSULE_IA: Record<typeof etatIA, { texte: string; style: React.CSSProperties }> = {
    echec: { texte: 'analyse échouée', style: { background: '#8a5a00', color: '#fff', border: '1px solid #8a5a00' } },
    valeurs: { texte: 'Page analysée IA', style: { background: '#1a4d8f', color: '#fff', border: '1px solid #1a4d8f' } },
    sans_valeur: { texte: 'analysée, aucune valeur', style: { border: '1px solid var(--color-svv-line)', color: 'var(--color-svv-muted)' } },
    fichier: { texte: 'fichier analysé', style: { border: '1px solid var(--color-svv-green)', color: 'var(--color-svv-green)' } },
    aucune: { texte: 'non analysée IA', style: { border: '1px solid var(--color-svv-line)', color: 'var(--color-svv-muted)' } },
  };
  // LOT « ligne de statut » — TITRE + éléments alignés à sa suite. `titre` selon le mode ; `montrerRetour` = hors sélection (mode pièce OU
  //   image hors best-of). Chips SOBRES et compactes, cohérentes avec la barre ; couleurs THÉMATISÉES (lisibles clair ET sombre).
  const titre = nav === 'bestof' ? 'Best-of des plans proposés' : `Pièce : ${nomCourant}`;
  const montrerRetour = nav === 'piece' || !pageDansBestOf;
  const chipBtn: React.CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', padding: '.1rem .45rem', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flex: '0 0 auto' };
  // Statut de L'IMAGE : « Image best-of » (bleu thématisé) / « Image fichier » (muet). Bleu = même repère que le best-of de la liste (lot 4423e4a).
  const chipStatutImage = (best: boolean): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, borderRadius: '.35rem', padding: '.1rem .45rem', whiteSpace: 'nowrap', flex: '0 0 auto', border: `1px solid ${best ? 'var(--color-svv-blue)' : 'var(--color-svv-line)'}`, color: best ? 'var(--color-svv-blue)' : 'var(--color-svv-muted)' });
  // Flèches du contrôle de page DISCRET — volontairement PLUS PETITES et de glyphe différent (◁ ▷) que la paire de plans (‹ précédent /
  //   suivant ›), pour qu'aucun regard n'hésite entre « changer de plan » et « changer de page ».
  const btnPageMini = (actif: boolean): React.CSSProperties => ({ cursor: actif ? 'pointer' : 'default', opacity: actif ? 1 : 0.35, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', minHeight: 28, padding: '.1rem .4rem', fontSize: 12, lineHeight: 1 });
  // DISSOCIER VISUELLEMENT les deux modules de navigation sous l'image (demande Arno). Deux CONTENEURS (on ENCADRE l'existant : rien
  //   n'est déplacé, retiré ni réordonné à l'intérieur). BEST-OF = liseré BLEU, MÊME token que la capsule « Image best-of »
  //   (`var(--color-svv-blue)`) → lien visuel immédiat. FICHIER = liseré GRIS neutre (`var(--color-svv-line)`), registre sobre. Compacts
  //   (bordure 1px, padding léger : on ne rouvre pas le vide comblé au lot précédent), theme-aware (tokens clair/sombre). La distinction
  //   NE repose PAS sur la seule couleur : deux blocs séparés + `role="group"`/`aria-label` + libellés internes portent déjà le sens.
  const capsuleBestOf: React.CSSProperties = { border: '1px solid var(--color-svv-blue)', borderRadius: '.5rem', padding: '.4rem .5rem' };
  const capsuleFichier: React.CSSProperties = { border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.4rem .5rem', display: 'flex', flexDirection: 'column', gap: '.4rem' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {/* ① LIGNE DE STATUT — UNE SEULE LIGNE sous l'image, sur la ligne du TITRE. Ordre imposé : [titre en tête] · [retour au best-of,
          seulement hors sélection] · [statut de l'IMAGE : « Image best-of » / « Image fichier »] · [capsule IA] · [bascule best-of COMPACTE].
          Remplace l'ancien bandeau « Vous parcourez… » (doublon du statut d'image). `nowrap` : le TITRE se raccourcit (ellipsis), pas les libellés. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'nowrap', minWidth: 0 }}>
        <strong style={{ fontSize: 12, fontWeight: 700, flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titre}>{titre}</strong>
        {pageOuverte && montrerRetour && (
          <button type="button" onClick={onRetourBestOf} aria-label="Revenir à la sélection best-of" style={chipBtn}>↩ revenir au best-of</button>
        )}
        {pageOuverte && (
          <span style={chipStatutImage(pageDansBestOf)} title={pageDansBestOf ? 'l’image affichée fait partie du best-of' : 'l’image affichée ne fait pas partie du best-of'}>{pageDansBestOf ? 'Image best-of' : 'Image fichier'}</span>
        )}
        {pageOuverte && (
          <span style={{ ...capsuleBase, ...CAPSULE_IA[etatIA].style }} title={detailIA ? `analyse de la page : ${detailIA}` : (etatIA === 'echec' ? (lectureRes?.texte ?? 'la dernière analyse a échoué') : 'cette image n’a pas été analysée par l’IA')}>{CAPSULE_IA[etatIA].texte}</span>
        )}
        {pageOuverte && (
          <button type="button" onClick={pageDansBestOf ? onRetirerBestOf : onAjouterBestOf} style={chipBtn}
            aria-label={pageDansBestOf ? `Retirer du best-of la page ${page} de ${nomCourant} (réversible)` : `Ajouter au best-of la page ${page} de ${nomCourant} (cette page seule, réversible)`}>{pageDansBestOf ? '✕ retirer du best-of' : '＋ ajouter au best-of'}</button>
        )}
      </div>
      {/* ② MODULE BEST-OF — capsule à LISERÉ BLEU (même bleu que « Image best-of ») : l'UNIQUE paire ‹ précédent / suivant › + « plan i
          sur n » + type + « nom.pdf — page N · échelle 1:X », portés par slotNav (BandePlans / NavPieceLibre). Conteneur : rien n'est déplacé. */}
      <div role="group" aria-label="Navigation du best-of des plans" style={capsuleBestOf}>
        {slotNav}
      </div>
      {/* ③④ + LIEN = MODULE FICHIER — capsule GRISE neutre (var(--color-svv-line)) : contrôle de page discret, « voir toutes les pièces
          du dossier », lien « Ouvrir … dans un nouvel onglet ». CONTENEUR : rien n'est déplacé/retiré ; `slotPieces` reste TOUJOURS
          rendu (échappatoire même sans pièce ouverte), le lien reste gardé par `pageOuverte`. */}
      <div role="group" aria-label="Pages et pièces du fichier" style={capsuleFichier}>
        {/* ③ CONTRÔLE DE PAGE DISCRET (fichier multi-pages), NETTEMENT distinct de la paire de plans. Masqué en mode « pièce libre ». */}
        {pageOuverte && nav !== 'piece' && nbPagesPiece > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', flexWrap: 'wrap', fontSize: 11, color: 'var(--color-svv-muted)' }}>
            <span>pages de ce fichier :</span>
            <button type="button" aria-label="Page précédente du fichier" disabled={page <= 1} onClick={onPagePrecedente} style={btnPageMini(page > 1)}>◁</button>
            <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)' }}>page {page} / {nbPagesPiece}{echelle ? ` · échelle ${echelle}` : ''}</span>
            <button type="button" aria-label="Page suivante du fichier" disabled={page >= nbPagesPiece} onClick={onPageSuivante} style={btnPageMini(page < nbPagesPiece)}>▷</button>
          </div>
        )}
        {/* ④ « voir toutes les pièces du dossier » (ÉCHAPPATOIRE, contenu propre à la visionneuse) : TOUJOURS rendu, même sans pièce ouverte. */}
        {slotPieces}
        {/* LIEN VERS LE DOCUMENT SOURCE (nouvel onglet). Suit la page affichée ; signé AU CLIC (url_piece). Gardé par `pageOuverte`. */}
        {pageOuverte && (
          <button type="button" className="svv-link" onClick={onOuvrirDocument} aria-label={`Ouvrir ${nomCourant} dans un nouvel onglet`}
            style={{ width: 'auto', minHeight: 32, padding: '.2rem .1rem', fontSize: 12, textAlign: 'left', textDecoration: 'underline', wordBreak: 'break-word' }}>
            Ouvrir « {nomCourant} »{page > 0 ? ` (page ${page})` : ''} dans un nouvel onglet ↗
          </button>
        )}
      </div>
      {/* SECTION FONCTIONS (statut de la page, vue d'ensemble des pages analysées, analyses IA) — HORS des deux capsules, n'a de sens
          qu'avec une PAGE ouverte → gardée par `pageOuverte`. */}
      {pageOuverte && (
      <div style={{ paddingTop: '.4rem', borderTop: '1px solid var(--color-svv-line)', display: 'flex', flexDirection: 'column', gap: '.4rem', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
        {/* ② STATUT DE LA PAGE (pastille NATURE·ORIGINE + libellé). 'non identifiée' → rien. */}
        {statutPage.etat !== 'non_identifiee' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
            <PastilleStatutPage s={statutPage} />
            <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }} title={statutPage.derive ? 'statut déduit de l’analyse du fichier, pas d’une mesure page par page' : undefined}>
              {libelleStatutPage(statutPage)}{statutPage.derive ? ' (d’après l’analyse du fichier)' : ''}
            </span>
          </div>
        )}
        {/* ③ VUE D'ENSEMBLE des pages déjà analysées (repli si longue). */}
        {(resumePages.fichier || resumePages.pagesIndividuelles.length > 0) && (
          <div style={{ fontSize: 11, color: 'var(--color-svv-muted)', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            {resumePages.fichier && <span>Fichier entier déjà analysé (repérage){resumePages.dateFichier ? ` le ${resumePages.dateFichier}` : ''}.</span>}
            {resumePages.pagesIndividuelles.length > 0 && (
              resumePages.pagesIndividuelles.length <= 10 ? (
                <span>Page{resumePages.pagesIndividuelles.length > 1 ? 's' : ''} déjà analysée{resumePages.pagesIndividuelles.length > 1 ? 's' : ''} individuellement : {resumePages.pagesIndividuelles.join(', ')}.</span>
              ) : (
                <>
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 11, color: 'var(--color-svv-muted)', alignSelf: 'flex-start' }}
                    aria-expanded={pleinPagesAnalysees} onClick={onTogglePleinPages}>
                    {resumePages.pagesIndividuelles.length} pages déjà analysées individuellement {pleinPagesAnalysees ? '▲' : '▾'}
                  </button>
                  {pleinPagesAnalysees && <span>Pages : {resumePages.pagesIndividuelles.join(', ')}.</span>}
                </>
              )
            )}
          </div>
        )}
        {/* ④ BEST-OF au grain PAGE : la BASCULE ajouter/retirer a été REMONTÉE dans la LIGNE DE STATUT (en tête), restylée en chip compacte. */}
        {/* ⑤ ANALYSES IA : fichier complet (reperer_planches) + page (lire_valeurs_page). Même verrou serveur → l'une désactive l'autre. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 36, padding: '.3rem .6rem', fontSize: 12 }}
            disabled={reperEnCours || lectureEnCours} aria-busy={reperEnCours} onClick={onAnalyseFichier}>
            {reperEnCours ? 'Analyse des images en cours…' : (runCourant ? 'ré-analyser le fichier complet' : 'analyse du fichier complet')}
          </button>
          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 36, padding: '.3rem .6rem', fontSize: 12 }}
            disabled={reperEnCours || lectureEnCours} aria-busy={lectureEnCours} onClick={onAnalysePage}>
            {lectureEnCours ? 'Lecture de la page en cours…' : (lectureCourante ? 'ré-analyser cette page' : 'analyse de la page')}
          </button>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>
          « analyse du fichier complet » fait analyser les images de <strong style={{ color: 'var(--color-svv-ink)', wordBreak: 'break-word' }}>{nomCourant}</strong> par un service payant (de l’ordre de 2 centimes pour une vingtaine de pages) pour trouver les plans encastrés que le repérage par le texte ne voit pas. « analyse de la page » n’envoie que <strong style={{ color: 'var(--color-svv-ink)' }}>la page affichée (page {page})</strong> — de l’ordre de 0,1 centime — pour y lire l’<strong style={{ color: 'var(--color-svv-ink)' }}>altitude de sommet NGF</strong> (utile sur une coupe ou une façade) et remplir ce champ s’il est vide. Rien de lisible → c’est dit ; valeur douteuse → proposée « à vérifier », jamais écrite ; valeur écrite → annulable ci-dessous.
          {runCourant && <> <strong style={{ color: 'var(--color-svv-ink)' }}>Cette pièce a déjà été analysée (fichier complet)</strong> — relancer refera une analyse payante.</>}
          {lectureCourante && <> <strong style={{ color: 'var(--color-svv-ink)' }}>Cette page a déjà été analysée</strong> le {lectureCourante.creeLe ? jourParisISO(lectureCourante.creeLe) : ''} — relancer refera une analyse payante.</>}
        </span>
        {(reperMsg || runCourant) && (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', padding: '.4rem .5rem', borderRadius: '.4rem', background: 'var(--color-svv-field)', borderLeft: `3px solid ${reperMsg && reperMsg.includes('reconnectez') ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}` }}>
            {reperMsg && <span style={{ fontSize: 12, fontWeight: 600, color: reperMsg.includes('reconnectez') ? 'var(--color-svv-red)' : 'var(--color-svv-ink)' }}>{reperMsg}</span>}
            {runCourant && (
              <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>
                {runCourant.nbPlanches} planche{runCourant.nbPlanches > 1 ? 's' : ''} repérée{runCourant.nbPlanches > 1 ? 's' : ''} par image dans cette pièce.
                {runCourant.incertaines.length > 0 && ` ${runCourant.incertaines.length} page${runCourant.incertaines.length > 1 ? 's' : ''} incertaine${runCourant.incertaines.length > 1 ? 's' : ''} (${runCourant.incertaines.map((n) => `p${n}`).join(', ')}) — hors best-of.`}
                {runCourant.pagesEcartees.length > 0 && ` ${runCourant.pagesEcartees.length} page${runCourant.pagesEcartees.length > 1 ? 's' : ''} non envoyée${runCourant.pagesEcartees.length > 1 ? 's' : ''} par précaution : ${runCourant.pagesEcartees.map((e) => `p${e.page} (${e.motif})`).join(' ; ')}.`}
              </span>
            )}
          </div>
        )}
        {lectureRes && lectureRes.cle === `${pieceId}:${page}` && (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', padding: '.4rem .5rem', borderRadius: '.4rem', background: 'var(--color-svv-field)', borderLeft: `3px solid ${lectureRes.texte.includes('reconnectez') ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: lectureRes.texte.includes('reconnectez') ? 'var(--color-svv-red)' : 'var(--color-svv-ink)' }}>{lectureRes.texte}</span>
            {lectureRes.ecrit && (
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem', alignSelf: 'flex-start' }} onClick={onAnnulerValeur}>
                annuler la valeur écrite (remettre le champ à vide)
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
