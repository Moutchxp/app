'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  gesteHistorique, MOT_HISTORIQUE, sousLibelleHistorique, type BienHistorique,
} from '../../../../lib/gestion/boutonHistoriqueMail';
import { ligneDeLaBulle, MARGE_BULLE, type BienDeLaBulle } from '../../../../lib/gestion/bulleBiensMail';

/**
 * ══ 🔴🔴 LOT BOUTON-HISTORIQUE-SUR-LES-MAILS-RATTACHES — LE BOUTON « Historique » DE L'EN-TÊTE D'UN MAIL ══════════════
 *
 * DEMANDE D'ARNO (13/10/2026) : au-dessus du gros bouton vert, à droite de De / À / Cc / Date, un gros bouton blanc à
 * contour et texte rouges « Historique », avec dessous l'adresse du bien (un seul) ou « N biens ». Un bien ⇒ un clic
 * ouvre sa fiche historique ; plusieurs ⇒ une liste se déplie juste en dessous, un bien par ligne (puce, adresse, type,
 * lot, propriétaire — comme la bulle « N biens rattachés »), fermée par un clic à côté ou par Échap.
 *
 * ⚠️ LECTURE SEULE : la liste lit le détail par la même porte que la bulle (`biens-par-mail?detail=`), en GET, au premier
 * dépliage. Sans réponse, chaque ligne garde l'adresse et le numéro de lot : la liste ne reste jamais vide.
 */
export function BoutonHistoriqueMail({ messageId, biens, onOuvrir }: {
  messageId: number;
  biens: readonly BienHistorique[];
  /** Ouvre la fiche historique du bien de cette clé WIPPIMMO. */
  onOuvrir: (cle: string) => void;
}) {
  const [ouverte, setOuverte] = useState(false);
  /** Lire le détail : au premier dépliage, ou dès le survol / le focus, pour que la liste arrive complète. */
  const [aLire, setALire] = useState(false);
  const [detail, setDetail] = useState<BienDeLaBulle[] | null>(null);
  const racine = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const geste = gesteHistorique(biens);
  const idListe = `bhm-liste-${messageId}`;

  /* LE DÉTAIL, une seule fois : au premier survol, focus ou dépliage (jamais pour un bien seul, qui n'a pas de liste). */
  useEffect(() => {
    if (!(ouverte || aLire) || detail !== null) return undefined;
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/gestion/biens-par-mail?detail=${messageId}`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { etat?: string; biens?: BienDeLaBulle[] };
        if (vivant && r.ok && j.etat === 'ok') setDetail(j.biens ?? []);
      } catch { /* les lignes gardent l'adresse et le lot */ }
    })();
    return () => { vivant = false; };
  }, [ouverte, aLire, detail, messageId]);

  /* SORTIES : Échap (le focus revient au bouton), et un clic ou un toucher à côté. */
  useEffect(() => {
    if (!ouverte) return undefined;
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOuverte(false);
      bouton.current?.focus();
    };
    const ailleurs = (e: PointerEvent): void => {
      const n = e.target as Node | null;
      if (n !== null && racine.current?.contains(n)) return;
      setOuverte(false);
    };
    document.addEventListener('keydown', clavier, true);
    document.addEventListener('pointerdown', ailleurs, true);
    return () => {
      document.removeEventListener('keydown', clavier, true);
      document.removeEventListener('pointerdown', ailleurs, true);
    };
  }, [ouverte]);

  /**
   * LA PLACE DE LA LISTE : son bord droit sur celui du bouton, puis glissée vers la droite si elle sortait de l'écran à
   * gauche. Elle reste DANS le DOM du bouton (ordre de tabulation juste) : seul son décalage est calculé. Elle s'élargit
   * jusqu'à la largeur de l'écran moins une marge, pour qu'un bien tienne sur une ligne (comme la bulle).
   */
  const liste = useRef<HTMLUListElement | null>(null);
  const [gauche, setGauche] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!ouverte) { setGauche(null); return undefined; }
    const placer = (): void => {
      const r = racine.current?.getBoundingClientRect();
      const l = liste.current;
      if (r === undefined || l === null) return;
      const largeur = Math.min(l.offsetWidth, window.innerWidth - 2 * MARGE_BULLE);
      const voulue = r.right - largeur;
      const permise = Math.max(MARGE_BULLE, Math.min(voulue, window.innerWidth - MARGE_BULLE - largeur));
      setGauche(permise - r.left);
    };
    placer();
    window.addEventListener('resize', placer);
    return () => window.removeEventListener('resize', placer);
  }, [ouverte, detail]);

  if (geste === 'aucun') return null;

  const ligneDe = (b: BienHistorique): { bien: string; proprietaire: string | null } => {
    const d = detail?.find((x) => x.cle === b.cle);
    return d !== undefined ? ligneDeLaBulle(d) : { bien: `${b.adresse} — lot ${b.cle}`, proprietaire: null };
  };

  return (
    <div className="bhm" ref={racine}>
      <button type="button" className="bhm-bouton" ref={bouton}
        aria-expanded={geste === 'liste' ? ouverte : undefined}
        aria-controls={geste === 'liste' && ouverte ? idListe : undefined}
        title={geste === 'direct'
          ? `Ouvrir l’historique — ${biens[0].adresse}`
          : 'Choisir le bien dont ouvrir l’historique'}
        onPointerEnter={geste === 'liste' ? () => setALire(true) : undefined}
        onFocus={geste === 'liste' ? () => setALire(true) : undefined}
        onClick={() => {
          if (geste === 'direct') { onOuvrir(biens[0].cle); return; }
          setOuverte((o) => !o);
        }}>
        <span className="bhm-mot">{MOT_HISTORIQUE}</span>
        <span className="bhm-detail">{sousLibelleHistorique(biens)}</span>
      </button>
      {geste === 'liste' && ouverte && (
        <ul className="bhm-liste" id={idListe} aria-label="Biens dont ouvrir l’historique" ref={liste}
          style={gauche === null ? { visibility: 'hidden', left: 0 } : { left: gauche }}>
          {biens.map((b) => {
            const l = ligneDe(b);
            return (
              <li key={b.cle}>
                <button type="button" className="bhm-ligne"
                  onClick={() => { setOuverte(false); onOuvrir(b.cle); }}>
                  <span className="bhm-puce" aria-hidden="true" />
                  <span className="bhm-bien">{l.bien}</span>
                  {l.proprietaire !== null && <span className="bhm-proprio">{l.proprietaire}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * LE BLOC DE DROITE DE L'EN-TÊTE : le bouton « Historique » puis les carrés étoile / corbeille, INCHANGÉS. Sans bouton
 * « Historique », les carrés sont rendus exactement comme avant ce lot, sans enveloppe.
 */
export function EnteteDroite({ historique, children }: { historique: ReactNode; children: ReactNode }) {
  if (historique === null || historique === undefined || historique === false) return <>{children}</>;
  return <div className="cnv-entete-droite">{historique}{children}</div>;
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre).
   🔴 MEME TYPOGRAPHIE, MEME ARRONDI ET MEME HAUTEUR QUE LA CASE VERTE COMPACTE (.ccl--compact .ccl-case) : .82rem gras
   pour le mot, .7rem pour le detail, rayon .5rem, 68 px de haut (celle des carres voisins, a 2 px de la case verte).
   🔴 LA LARGEUR : le bloc de droite de l'en-tete (.cnv-entete-droite = ce bouton + les carres) prend la largeur de la case
   verte augmentee de l'ecart entre les deux blocs (5 px) : son bord gauche tombe donc sur celui de la case verte, et le
   bouton prend tout ce qui reste a gauche des carres. ⚠️ PAS de min-width:min-content : le sous-libelle ne passe pas a
   la ligne, sa largeur minimale est donc l'adresse entiere, qui elargissait le bloc (mesure : 33 px trop a gauche).
   Si la place manque, min-width le garde lisible et c'est le texte
   De / A / Date qui se resserre ; rien ne deborde. Sous 560 px (la case verte passe en pleine largeur), le bouton
   passe sur sa propre ligne, pleine largeur, sous De / A / Date — les carres ne bougent pas. */
export const CSS_BOUTON_HISTORIQUE_MAIL = `
.cnv-entete-droite{flex:0 0 auto;display:flex;align-items:center;gap:8px;
  width:clamp(215px, calc(30% + 2px), 325px);min-width:calc(9rem + 150px)}
.cnv-entete-droite>.bhm{flex:1 1 0;min-width:9rem}
.cnv-entete-droite>.bhm:only-child{min-width:0}
.cnv-entete-droite>.bhm:only-child{margin-right:5px}
.bhm{position:relative;align-self:center}
.bhm-bouton{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;width:100%;
  height:68px;padding:4px 8px;font:inherit;text-align:center;cursor:pointer;border-radius:.5rem;
  color:var(--color-svv-red);background:var(--color-svv-surface);border:1px solid var(--color-svv-red);
  transition:background-color .18s ease}
.bhm-bouton:hover{background:color-mix(in srgb, var(--color-svv-red) 7%, var(--color-svv-surface))}
.bhm-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bhm-mot{font-size:.82rem;font-weight:700;line-height:1.2}
.bhm-detail{max-width:100%;font-size:.7rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bhm-liste{position:absolute;z-index:60;top:calc(100% + 6px);margin:0;padding:6px;list-style:none;
  box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);
  display:flex;flex-direction:column;gap:2px;font-size:.8rem;line-height:1.4;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:.6rem;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.bhm-ligne{display:flex;align-items:baseline;gap:.6rem;width:100%;min-height:36px;padding:6px 8px;font:inherit;
  text-align:left;color:inherit;background:transparent;border:0;border-radius:.4rem;cursor:pointer}
.bhm-ligne:hover,.bhm-ligne:focus-visible{background:var(--color-svv-field)}
.bhm-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.bhm-puce{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--color-svv-red);
  align-self:center}
.bhm-bien{min-width:0;overflow-wrap:anywhere}
.bhm-proprio{flex:0 1 auto;margin-left:auto;padding-left:1rem;text-align:right;font-weight:600;overflow-wrap:anywhere}
@media (pointer:coarse){.bhm-ligne{min-height:44px}}
@media (prefers-reduced-motion: reduce){.bhm-bouton{transition:none}}
@media (max-width:560px){
  .cnv-entete-bloc--historique{flex-wrap:wrap}
  .cnv-entete-bloc--historique>.cnv-entete{flex:1 1 0}
  .cnv-entete-droite{display:contents}
  .cnv-entete-droite>.bhm,.cnv-entete-droite>.bhm:only-child{order:3;flex:1 1 100%;margin:0 5px}
  .bhm-bouton{height:auto;min-height:44px}
  .bhm-ligne{display:grid;grid-template-columns:7px minmax(0,1fr);column-gap:.6rem;row-gap:2px;align-items:baseline}
  .bhm-proprio{grid-column:2;margin-left:0;padding-left:0;text-align:left;overflow-wrap:normal}
}
`;
