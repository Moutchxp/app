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
 * DISPOSITION (exigence Arno) : navigation de PAGES SOUS l'image — « ‹ page précédente » à l'EXTRÊME GAUCHE, « page suivante › » à
 * l'EXTRÊME DROITE (space-between), l'indicateur « page i sur N · échelle » ENTRE les deux.
 */
export interface BarreVisionneusePiecesProps {
  pieceId: number | null;
  nomCourant: string;
  page: number;
  nbPagesPiece: number;
  echelle?: string | null;
  onOuvrirDocument: () => void;          // LIEN vers le document source (nouvel onglet) — url_piece
  onPagePrecedente: () => void;
  onPageSuivante: () => void;
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
  pieceId, nomCourant, page, nbPagesPiece, echelle, onOuvrirDocument, onPagePrecedente, onPageSuivante,
  pageDansBestOf, onRetirerBestOf, onAjouterBestOf, statutPage, resumePages, pleinPagesAnalysees, onTogglePleinPages,
  runCourant, lectureCourante, reperEnCours, lectureEnCours, onAnalyseFichier, onAnalysePage, reperMsg, lectureRes, onAnnulerValeur,
}: BarreVisionneusePiecesProps) {
  if (pieceId === null) return null;
  const btnPage = (actif: boolean): React.CSSProperties => ({ cursor: actif ? 'pointer' : 'default', opacity: actif ? 1 : 0.4, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', minHeight: 36, padding: '.3rem .6rem', fontSize: 12 });
  const btnBestOf: React.CSSProperties = { alignSelf: 'flex-start', cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', minHeight: 36, padding: '.3rem .6rem', fontSize: 12, fontWeight: 600 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {/* LIEN VERS LE DOCUMENT SOURCE (nouvel onglet). Suit la page affichée ; signé AU CLIC (url_piece). */}
      <button type="button" className="svv-link" onClick={onOuvrirDocument} aria-label={`Ouvrir ${nomCourant} dans un nouvel onglet`}
        style={{ width: 'auto', minHeight: 32, padding: '.2rem .1rem', fontSize: 12, textAlign: 'left', textDecoration: 'underline', wordBreak: 'break-word' }}>
        Ouvrir « {nomCourant} »{page > 0 ? ` (page ${page})` : ''} dans un nouvel onglet ↗
      </button>
      <div style={{ paddingTop: '.4rem', borderTop: '1px solid var(--color-svv-line)', display: 'flex', flexDirection: 'column', gap: '.4rem', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
        {/* ① NAVIGATION DE PAGES SOUS L'IMAGE — « précédent » à l'extrême GAUCHE, « suivant » à l'extrême DROITE (space-between). */}
        {nbPagesPiece > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap' }}>
            <button type="button" aria-label="Page précédente du fichier" disabled={page <= 1} onClick={onPagePrecedente} style={btnPage(page > 1)}>‹ page précédente</button>
            <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>page {page} sur {nbPagesPiece}{echelle ? ` · échelle ${echelle}` : ''}</span>
            <button type="button" aria-label="Page suivante du fichier" disabled={page >= nbPagesPiece} onClick={onPageSuivante} style={btnPage(page < nbPagesPiece)}>page suivante ›</button>
          </div>
        )}
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
