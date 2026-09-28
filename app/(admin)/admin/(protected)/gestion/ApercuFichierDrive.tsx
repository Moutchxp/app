'use client';

import { useEffect, useRef, useState } from 'react';
import { messageSansApercu, sorteApercu } from '../../../../lib/gestion/apercuDrive';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — « VISUALISER » : VOIR UN FICHIER DU DRIVE SANS LE JOINDRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE ÇA RÉPARE. Avant, pour savoir si « Devis 2.pdf » était le bon devis, il fallait le JOINDRE, envoyer, et
 * voir. Ou ouvrir le Drive dans un autre onglet, retrouver le dossier, revenir. On joignait donc au hasard, et l'on
 * s'en apercevait chez le destinataire.
 *
 * 🔴🔴 L'APERÇU NE FERME PAS LA NAVIGATION, ET C'EST LE POINT LE PLUS IMPORTANT DE CE COMPOSANT. Il est rendu À CÔTÉ
 * du sélecteur (frère, pas enfant), par-dessus lui : le sélecteur n'est pas démonté, donc rien de son état ne bouge —
 * le même dossier, la même recherche, le même compteur, les mêmes « ✓ ajouté ». Fermer l'aperçu ne « revient » pas au
 * dossier : on n'en était jamais parti.
 *
 * ⚠️ FRÈRE ET NON ENFANT, POUR UNE SECONDE RAISON. Le sélecteur ferme sur Échap et sur un clic hors de lui. Placé
 * DANS son voile, l'aperçu aurait fait remonter ses propres Échap et ses propres clics jusqu'à lui : une croix qui
 * ferme deux fenêtres au lieu d'une.
 *
 * 🔒 LECTURE SEULE, ET RIEN NE RESTE. Les octets viennent de notre route, jamais de Google directement (le jeton ne
 * quitte pas le serveur), et vivent dans un `blob:` que l'on RÉVOQUE à la fermeture. Aucune copie dans le Drive,
 * aucun fichier sur le disque. Sous « Documents clients scannés », la route refuse — et l'aperçu affiche son motif,
 * exactement comme « Joindre » aujourd'hui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface FichierAVoir {
  id: string;
  nom: string;
  typeMime: string;
  lien: string | null;
}

type Etat =
  | { e: 'charge' }
  /** `url` est un `blob:` local — jamais une adresse Google, jamais un chemin de disque. */
  | { e: 'pret'; url: string; sorte: 'pdf' | 'image' | 'texte' }
  /**
   * `regle` distingue LES DEUX RAISONS de ne rien montrer, et ce n'est pas une nuance d'affichage :
   *   · un format dont on ne sait pas faire d'aperçu — on peut tout de même le JOINDRE ;
   *   · « Documents clients scannés » — on ne peut RIEN en faire, et proposer « Joindre ce fichier » juste sous la
   *     phrase « son contenu n'est jamais lu » serait se contredire d'une ligne à l'autre.
   *
   * ⚠️ LE CAS ARRIVE VRAIMENT : dans des résultats de recherche, l'écran ne connaît pas l'emplacement des fichiers
   * (ils viennent de tout le Drive), donc il propose les trois liens et c'est le SERVEUR qui tranche au clic.
   * Mesuré à l'écran le 28/09/2026 sur « 5_trois dernières quittances de loyer.pdf ».
   */
  | { e: 'sans'; message: string; regle: boolean };

/** Les paliers de zoom de l'image. Le PDF, lui, a le zoom du navigateur, qui est meilleur que tout ce qu'on écrirait. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

export function ApercuFichierDrive({ fichier, joindreAutorise, deja, onJoindre, onFermer }: {
  fichier: FichierAVoir;
  /** Faux sous « Documents clients scannés » : le bouton « Joindre » de l'aperçu n'y est pas non plus. */
  joindreAutorise: boolean;
  /** Déjà ajouté au message : on le DIT plutôt que de laisser cliquer une seconde fois. */
  deja: boolean;
  onJoindre: () => void;
  onFermer: () => void;
}) {
  const [etat, setEtat] = useState<Etat>({ e: 'charge' });
  const [zoom, setZoom] = useState(1);
  const croix = useRef<HTMLButtonElement | null>(null);

  /**
   * ══ LA LECTURE. Un `fetch`, puis un `blob:` — et non l'URL de la route directement dans le cadre. ══════════════
   *
   * 🔴 POURQUOI PASSER PAR UN `fetch`. Mis directement en `src`, un refus (403 « Documents clients scannés ») ou un
   * « pas d'aperçu » (415) s'afficherait comme du JSON brut DANS le cadre — illisible, et pris pour une panne. Avec
   * un `fetch`, on lit le motif et on l'affiche en français. La contrepartie (les octets passent par la mémoire de
   * la page) est sans conséquence : ils y passaient déjà pour être joints.
   */
  useEffect(() => {
    const sorte = sorteApercu(fichier.typeMime);
    if (sorte === 'aucun') {
      setEtat({ e: 'sans', message: messageSansApercu(fichier.typeMime), regle: false });
      return undefined;
    }

    let annule = false;
    let objet: string | null = null;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/drive/apercu?fichier=${encodeURIComponent(fichier.id)}`,
          { cache: 'no-store' });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { message?: string };
          // 403 = LA RÈGLE (« Documents clients scannés »), et non un format sans aperçu : rien n'est proposé après.
          if (!annule) {
            setEtat({ e: 'sans', message: d.message ?? 'Aperçu impossible pour ce fichier.', regle: res.status === 403 });
          }
          return;
        }
        const blob = await res.blob();
        if (annule) return;
        objet = URL.createObjectURL(blob);
        // `export_pdf` (document Google exporté) s'affiche comme un PDF : c'en est un.
        setEtat({ e: 'pret', url: objet, sorte: sorte === 'image' ? 'image' : sorte === 'texte' ? 'texte' : 'pdf' });
      } catch {
        if (!annule) {
          setEtat({ e: 'sans', message: 'Le Drive n’a pas répondu : aperçu impossible pour le moment.', regle: false });
        }
      }
    })();
    // 🔒 LA RÉVOCATION : sans elle, les octets du document d'un client resteraient en mémoire de l'onglet.
    return () => { annule = true; if (objet !== null) URL.revokeObjectURL(objet); };
  }, [fichier.id, fichier.typeMime]);

  /**
   * ÉCHAP FERME — même quand le focus est DANS le cadre de l'aperçu.
   *
   * ⚠️ UN ÉCOUTEUR SUR LA FENÊTRE, pas seulement sur la boîte : le lecteur PDF du navigateur prend le focus, et un
   * `onKeyDown` de React ne verrait jamais la touche. `capture` pour passer avant tout le reste.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onFermer();
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [onFermer]);

  useEffect(() => { croix.current?.focus(); }, []);

  const iZoom = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);

  return (
    <div className="apd-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_APERCU}</style>
      <div className="apd" role="dialog" aria-modal="true" aria-label={`Aperçu de ${fichier.nom}`}>
        <header className="apd-tete">
          <span className="apd-nom" title={fichier.nom}>
            <span aria-hidden="true">👁</span> {fichier.nom}
          </span>
          {/* Le ZOOM n'existe que pour l'image : le cadre du PDF a le sien, et du texte se lit à sa taille. */}
          {etat.e === 'pret' && etat.sorte === 'image' && (
            <span className="apd-zoom">
              <button type="button" className="gst-lien-bouton" disabled={iZoom <= 0}
                onClick={() => setZoom(ZOOMS[Math.max(0, iZoom - 1)])} aria-label="Réduire">−</button>
              <span className="apd-zoom-mot">{Math.round(zoom * 100)} %</span>
              <button type="button" className="gst-lien-bouton" disabled={iZoom >= ZOOMS.length - 1}
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, iZoom + 1)])} aria-label="Agrandir">+</button>
            </span>
          )}
          <button ref={croix} type="button" className="apd-croix" onClick={onFermer}
            aria-label="Fermer l’aperçu">×</button>
        </header>

        <div className={`apd-scene${etat.e === 'pret' && etat.sorte === 'image' ? ' apd-scene--image' : ''}`}>
          {etat.e === 'charge' && <p className="gst-info" role="status">Lecture du fichier…</p>}
          {/* 🔴 « Aperçu indisponible » EST UNE RÉPONSE, PAS UNE PANNE : le mot le dit, et la sortie est juste à côté. */}
          {etat.e === 'sans' && <p className="apd-sans" role="status">{etat.message}</p>}
          {etat.e === 'pret' && etat.sorte === 'image' && (
            <img className="apd-image" src={etat.url} alt={fichier.nom}
              style={{ width: `${zoom * 100}%` }} />
          )}
          {etat.e === 'pret' && etat.sorte !== 'image' && (
            // Le cadre du navigateur apporte le défilement et le zoom du PDF — meilleurs que tout équivalent écrit ici.
            <iframe className="apd-cadre" src={etat.url} title={`Aperçu de ${fichier.nom}`} />
          )}
        </div>

        <footer className="apd-pied">
          {/* 🔴 « JOINDRE » EST DANS L'APERÇU (demande d'Arno) : on regarde, on reconnaît, on joint — sans refermer.
              ⚠️ SAUF QUAND C'EST LA RÈGLE QUI A REFUSÉ L'APERÇU : le proposer une ligne sous « son contenu n'est
              jamais lu » se contredirait, et le clic serait refusé par le serveur de toute façon. */}
          {joindreAutorise && !(etat.e === 'sans' && etat.regle) && (
            deja
              ? <span className="sfd-ajoute">✓ ajouté</span>
              : (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onJoindre}>
                  Joindre ce fichier
                </button>
              )
          )}
          <button type="button" className="svv-btn gst-btn" onClick={onFermer}>Fermer l’aperçu</button>
        </footer>
      </div>
    </div>
  );
}

export const CSS_APERCU = `
/* Au-dessus du sélecteur (z-index 70), jamais dedans : voir l'en-tête du composant. */
.apd-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px;
  background:color-mix(in srgb, var(--color-svv-ink) 62%, transparent)}
.apd{display:flex;flex-direction:column;gap:8px;width:min(1040px,100%);height:min(92vh,100%);padding:12px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 12px 48px color-mix(in srgb, var(--color-svv-ink) 34%, transparent)}
.apd-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.apd-nom{flex:1 1 12rem;min-width:0;font-size:.92rem;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.apd-zoom{display:flex;align-items:center;gap:8px;font-size:.82rem}
.apd-zoom-mot{min-width:3.4rem;text-align:center;color:var(--color-svv-muted)}
.apd-croix{min-width:44px;min-height:44px;padding:0;font:inherit;font-size:1.4rem;line-height:1;
  color:var(--color-svv-ink);background:none;border:0;border-radius:.4rem;cursor:pointer}
.apd-croix:hover{background:var(--color-svv-field)}
.apd-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* La scène prend toute la hauteur restante : un aperçu qui n'occupe pas la place ne sert à rien. */
.apd-scene{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;overflow:auto;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.5rem}
/* Zoomée, l'image déborde : elle s'aligne en haut à gauche pour qu'on puisse la parcourir. */
.apd-scene--image{align-items:flex-start;justify-content:flex-start}
.apd-cadre{width:100%;height:100%;border:0;background:var(--color-svv-surface)}
.apd-image{display:block;height:auto;max-width:none}
.apd-sans{margin:0;padding:14px 16px;max-width:34rem;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
.apd-pied{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px}
@media (max-width:520px){
  .apd{height:100%;padding:10px}
  .apd-nom{flex-basis:100%}
}
`;
