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
  slotActions?: React.ReactNode;         // fonctions viewer-spécifiques (zoom + « agrandir l'image ») en TÊTE de la section « fonctions »
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
  lectureRes: { cle: string; texte: string; ecrit: boolean } | null;
  onAnnulerValeur: () => void;           // annuler_lecture_page
}

export function BarreVisionneusePieces({
  pieceId, nomCourant, page, nbPagesPiece, echelle, nav, slotNav, slotPieces, slotActions, onOuvrirDocument, onPagePrecedente, onPageSuivante, onRetourBestOf,
  pageDansBestOf, onRetirerBestOf, onAjouterBestOf, statutPage, resumePages, pleinPagesAnalysees, onTogglePleinPages,
  runCourant, lectureCourante, reperEnCours, lectureEnCours, onAnalyseFichier, onAnalysePage, reperMsg, lectureRes, onAnnulerValeur,
}: BarreVisionneusePiecesProps) {
  if (pieceId === null) return null;
  // DEMANDE 4 — statut d'analyse IA de LA page affichée, dérivé des données déjà en main (aucune route neuve) : une lecture au grain
  //   page prime (valeurs lues), sinon un repérage du fichier entier la couvre, sinon elle n'a pas été analysée.
  const detailIA: string | null = lectureCourante ? 'valeurs lues (page)' : runCourant ? 'fichier analysé' : null;
  const pageAnalyseeIA = detailIA !== null;
  // Pastille SOBRE (aide de lecture, jamais une alerte) : contour vert discret quand la condition est vraie, muet sinon.
  const pastille = (vrai: boolean): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, borderRadius: '.35rem', padding: '.05rem .35rem', whiteSpace: 'nowrap', border: `1px solid ${vrai ? 'var(--color-svv-green)' : 'var(--color-svv-line)'}`, color: vrai ? 'var(--color-svv-green)' : 'var(--color-svv-muted)' });
  // Flèches du contrôle de page DISCRET — volontairement PLUS PETITES et de glyphe différent (◁ ▷) que la paire de plans (‹ précédent /
  //   suivant ›), pour qu'aucun regard n'hésite entre « changer de plan » et « changer de page ».
  const btnPageMini = (actif: boolean): React.CSSProperties => ({ cursor: actif ? 'pointer' : 'default', opacity: actif ? 1 : 0.35, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', minHeight: 28, padding: '.1rem .4rem', fontSize: 12, lineHeight: 1 });
  const btnBestOf: React.CSSProperties = { alignSelf: 'flex-start', cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', minHeight: 36, padding: '.3rem .6rem', fontSize: 12, fontWeight: 600 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {/* ① NAVIGATION PRIMAIRE — l'UNIQUE paire ‹ précédent / suivant › (space-between), portée par slotNav (BandePlans / NavPieceLibre) :
          elle descend ICI, sous l'image, avec tout son bloc d'information (plan i sur n, type, nom du fichier + page + échelle). */}
      {slotNav}
      {/* ① bis — CONTRÔLE DE PAGE DISCRET (fichier multi-pages), NETTEMENT distinct de la paire de plans. Masqué en mode « pièce libre »
          (slotNav y feuillette déjà les pages → jamais deux contrôles de page). Garde l'accès à toutes les pages sans seconde grande paire. */}
      {nav !== 'piece' && nbPagesPiece > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem', flexWrap: 'wrap', fontSize: 11, color: 'var(--color-svv-muted)' }}>
          <span>pages de ce fichier :</span>
          <button type="button" aria-label="Page précédente du fichier" disabled={page <= 1} onClick={onPagePrecedente} style={btnPageMini(page > 1)}>◁</button>
          <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)' }}>page {page} / {nbPagesPiece}{echelle ? ` · échelle ${echelle}` : ''}</span>
          <button type="button" aria-label="Page suivante du fichier" disabled={page >= nbPagesPiece} onClick={onPageSuivante} style={btnPageMini(page < nbPagesPiece)}>▷</button>
        </div>
      )}
      {/* ① ter — REPÈRE « OÙ SUIS-JE » (demande 3) + QUALIFICATION DE LA PAGE (demande 4), lisible d'un coup d'œil pendant la navigation.
          SOBRE (aides de lecture, pas des alertes). L'état best-of/fichier est porté par le MOT (pageDansBestOf), jamais par la couleur seule.
          Quand on est HORS best-of (une page du fichier non retenue), un retour EXPLICITE est proposé. Données déjà en main → zéro route. */}
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', fontSize: 11, color: 'var(--color-svv-muted)' }}>
        {pageDansBestOf ? (
          <span>Vous parcourez le <strong style={{ color: 'var(--color-svv-ink)' }}>best-of des plans</strong>.</span>
        ) : (
          <>
            <span>Vous parcourez les <strong style={{ color: 'var(--color-svv-ink)' }}>pages du fichier</strong> — hors best-of.</span>
            <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem', fontSize: 11 }} onClick={onRetourBestOf} aria-label="Revenir à la sélection best-of">↩ revenir au best-of</button>
          </>
        )}
        {/* Deux qualificatifs de LA page affichée (inclusion best-of + analyse IA), réutilisant les données déjà renvoyées par GET /emprise. */}
        <span style={pastille(pageDansBestOf)} title={pageDansBestOf ? 'cette page est dans le best-of' : 'cette page n’est pas dans le best-of'}>{pageDansBestOf ? '✓ dans le best-of' : '○ hors best-of'}</span>
        <span style={pastille(pageAnalyseeIA)} title={pageAnalyseeIA ? `analysée par l’IA — ${detailIA}` : 'cette page n’a pas été analysée par l’IA'}>{pageAnalyseeIA ? `✓ analysée IA (${detailIA})` : '○ non analysée IA'}</span>
      </div>
      {/* ① quater — « voir toutes les pièces du dossier » (contenu propre à la visionneuse), descendu sous l'image comme le reste du bloc. */}
      {slotPieces}
      {/* LIEN VERS LE DOCUMENT SOURCE (nouvel onglet). Suit la page affichée ; signé AU CLIC (url_piece). */}
      <button type="button" className="svv-link" onClick={onOuvrirDocument} aria-label={`Ouvrir ${nomCourant} dans un nouvel onglet`}
        style={{ width: 'auto', minHeight: 32, padding: '.2rem .1rem', fontSize: 12, textAlign: 'left', textDecoration: 'underline', wordBreak: 'break-word' }}>
        Ouvrir « {nomCourant} »{page > 0 ? ` (page ${page})` : ''} dans un nouvel onglet ↗
      </button>
      <div style={{ paddingTop: '.4rem', borderTop: '1px solid var(--color-svv-line)', display: 'flex', flexDirection: 'column', gap: '.4rem', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
        {/* ② bis — FONCTIONS viewer-spécifiques (zoom du document + « agrandir l'image »), en TÊTE de la section fonctions (demande 2c). */}
        {slotActions}
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
        {/* ④ BEST-OF au grain PAGE : retirer si dedans, ajouter sinon (exclure/inclure_page_bestof). */}
        {pageDansBestOf ? (
          <button type="button" onClick={onRetirerBestOf} style={btnBestOf}
            aria-label={`Retirer du best-of la page ${page} de ${nomCourant} (réversible ; ne supprime pas le document)`}>✕ retirer du best-of</button>
        ) : (
          <button type="button" onClick={onAjouterBestOf} style={btnBestOf}
            aria-label={`Ajouter au best-of la page ${page} de ${nomCourant} (cette page seule, pas le fichier entier ; réversible)`}>＋ ajouter cette page au best-of</button>
        )}
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
    </div>
  );
}
