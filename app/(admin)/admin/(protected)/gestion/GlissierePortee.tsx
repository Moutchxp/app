'use client';

import { useEffect, useRef } from 'react';
import { POSITIONS_PORTEE, positionActive, type PositionPortee } from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA GLISSIÈRE À QUATRE POSITIONS ═══════════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Glissière horizontale avec un gros curseur déplaçable (glisser ou cliquer sur une
 * position), accessible au clavier (flèches). De gauche à droite : Origine, One shot, Ce mail + futurs échanges, Toute
 * la conversation. »
 *
 * ══ 🔴🔴 LOT GLISSIERE-PILULE — LE DESSIN « PILULE » (Arno, 11/10/2026) ════════════════════════════════════════════
 * Comportement INCHANGÉ (mêmes positions, même ordre, même logique) ; seul le dessin change : grosse piste arrondie
 * (~64 px, fond gris très clair, contour 3 px couleur du texte), curseur en pilule rouge (~104 × 50 px, contour
 * 3 px et ombre dure vers le bas couleur du texte, poignée blanche au centre), un repère gris de 12 px à chaque
 * position, glissement avec léger rebond ; libellés EXACTEMENT centrés sous leur repère (≈ 140 px, retour à la ligne
 * permis), sans numéro, 16 px ; le libellé actif en rouge gras sur pastille rouge très pâle.
 * 🔴 LOT PILULE-AFFINEE-ET-ACCOLADE-ENVELOPPANTE (Arno, 12/10/2026) — traits affinés : piste ~52 px et pilule ~92 × 40 px,
 * contours 2 px, ombre 3 px adoucie, repères 10 px, poignée en traits de 2 px. Les mesures ci-dessus sont celles d'origine.
 *
 * 🔴 ACCESSIBILITÉ (Arno : « role="radiogroup" / aria-checked conservés ou ajoutés ») : les quatre libellés sont les
 * boutons radio d'un groupe ; un seul est dans l'ordre de tabulation (celui qui est choisi), ←/→ (et ↑/↓) changent de
 * position, Début/Fin vont aux extrémités. Une position GRISÉE (aucune modification) n'est jamais prise : la flèche
 * saute à la prochaine position active, ou s'arrête.
 * 🔴 LE CLIC (repère, libellé ou piste) et LE GLISSER passent par la même règle : la position la plus proche du point
 * visé, si elle est active.
 * ⚠️ LA GLISSIÈRE NE DÉCIDE RIEN : elle DEMANDE (`onChoisir`). Le retour à Origine avec des modifications en cours passe
 * par la confirmation de la fenêtre, qui seule sait ce qu'il y aurait à abandonner.
 */

/**
 * Le retrait des positions extrêmes depuis le bord EXTÉRIEUR de la piste, en px. ⚠️ Il doit valoir au moins la
 * demi-largeur du curseur (46 px) pour que la pilule tienne dans la piste aux deux bouts (Arno) : 54 px (lot
 * PILULE-AFFINEE : piste de 52 px, pilule de 92 × 40 px — 60 px pour l'ancienne pilule de 104 px).
 * Sur petit écran, la feuille le réduit avec le curseur (`--gpo-retrait`) : la souris le relit là, jamais en double.
 */
const RETRAIT_PX = 54;
const retraitDe = (e: Element): number => {
  const v = Number.parseFloat(getComputedStyle(e).getPropertyValue('--gpo-retrait'));
  return Number.isFinite(v) ? v : RETRAIT_PX;
};

export function GlissierePortee({
  position, modification, onChoisir, origineInterdite = null, positions, libelleGroupe = 'Portée du suivi de ce mail',
  desactivee = false,
}: {
  /**
   * 🔴 LOT INTERNE-GLISSIERE-ET-STATUT-COHERENT — LES POSITIONS OFFERTES, dans l'ordre de `POSITIONS_PORTEE`. Absent ⇒ les
   * quatre. Le panneau « Interne » n'en offre que trois (One shot, Ce mail + futurs échanges, Toute la conversation) :
   * même composant, même dessin, la piste se répartit sur le nombre de positions.
   */
  positions?: readonly PositionPortee[];
  /** Le nom du groupe pour les lecteurs d'écran. */
  libelleGroupe?: string;
  /** Tout est figé (une requête est en cours). */
  desactivee?: boolean;
  /**
   * 🔴 LOT RATTACHEMENT-CONVERSATION (Arno, 16/10/2026) — `null` = AUCUNE position présélectionnée (mail qui n'est pas le
   * premier, conversation sans suivi de fond) : le curseur n'est pas dessiné, aucun libellé n'est coché, et le premier
   * libellé actif reste atteignable au clavier. Le premier clic choisit.
   */
  position: PositionPortee | null;
  /** Y a-t-il une modification dans les blocs du dessus ? Sans elle, les trois autres positions sont grisées. */
  modification: boolean;
  onChoisir: (p: PositionPortee) => void;
  /**
   * 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE (accord d'Arno) — au PREMIER rattachement, « Origine » reste visible mais
   * GRISÉE et non sélectionnable (souris, glisser, clavier). La valeur est la bulle de survol ; `null` = Origine normale.
   * ⚠️ `aria-disabled` ET NON `disabled` : un bouton désactivé ne reçoit plus le survol, et la bulle ne s'afficherait pas.
   */
  origineInterdite?: string | null;
}) {
  /** Une position est-elle choisissable ? La règle d'avant, moins « Origine » quand elle est interdite. */
  const actif = (cle: PositionPortee): boolean =>
    !desactivee && positionActive(cle, modification) && !(origineInterdite !== null && cle === 'origine');
  const LISTE = positions === undefined ? POSITIONS_PORTEE : POSITIONS_PORTEE.filter((p) => positions.includes(p.cle));
  const piste = useRef<HTMLDivElement | null>(null);
  const groupe = useRef<HTMLDivElement | null>(null);
  const glisse = useRef(false);
  /** Le clavier a-t-il demandé ce changement ? Alors le focus suit le bouton choisi (radio « itinérant »). */
  const auClavier = useRef(false);
  const index = LISTE.findIndex((p) => p.cle === position);
  const n = LISTE.length;

  useEffect(() => {
    if (!auClavier.current) return;
    auClavier.current = false;
    groupe.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [position]);

  const choisirIndex = (i: number): void => {
    const p = LISTE[Math.max(0, Math.min(n - 1, i))];
    if (p !== undefined && actif(p.cle) && p.cle !== position) onChoisir(p.cle);
  };
  const indexAuPoint = (clientX: number): number => {
    const e = piste.current;
    if (e === null) return index;
    const r = e.getBoundingClientRect();
    const retrait = retraitDe(e);
    const utile = r.width - 2 * retrait;
    if (utile <= 0) return index;
    return Math.round(((clientX - r.left - retrait) / utile) * (n - 1));
  };
  /** La flèche saute les positions grisées : elle va à la prochaine position ACTIVE dans ce sens, ou ne bouge pas. */
  const pas = (sens: 1 | -1): void => {
    for (let i = index < 0 ? (sens > 0 ? 0 : n - 1) : index + sens; i >= 0 && i < n; i += sens) {
      if (actif(LISTE[i].cle)) { auClavier.current = true; choisirIndex(i); return; }
    }
  };
  /** La place d'une position sur la piste : de 0 (Origine) à 1 (Toute la conversation). */
  const fraction = (i: number): string => String(i / (n - 1));

  return (
    <div className="gpo">
      <div className="gpo-piste" ref={piste} aria-hidden="true"
        onPointerDown={(e) => {
          glisse.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          choisirIndex(indexAuPoint(e.clientX));
        }}
        onPointerMove={(e) => { if (glisse.current) choisirIndex(indexAuPoint(e.clientX)); }}
        onPointerUp={() => { glisse.current = false; }}
        onPointerCancel={() => { glisse.current = false; }}>
        {LISTE.map((p, i) => (
          <span key={p.cle}
            className={`gpo-cran${actif(p.cle) ? '' : ' gpo-cran--grise'}`}
            style={{ ['--gpo-x' as string]: fraction(i) }} />
        ))}
        {index >= 0 && (<div className="gpo-curseur" style={{ ['--gpo-x' as string]: fraction(Math.max(0, index)) }}>
          {/* 🔴 LOT PILULE-TROIS-TRAITS — LA POIGNÉE : trois traits verticaux blancs, celui du milieu plus grand (18 px,
              12 px sur les côtés), 3 px d'épaisseur, bouts arrondis, 5 px d'écart. En SVG : net, identique dans les
              deux thèmes, et réduit avec la pilule sur téléphone. */}
          {/* 🔴 LOT PILULE-AFFINEE (Arno) — traits de 2 px, hauteurs 10 / 15 / 10 px, toujours 5 px d'écart. */}
          <svg className="gpo-poignee" viewBox="0 0 16 15" width="16" height="15" aria-hidden="true" focusable="false">
            <rect x="0" y="2.5" width="2" height="10" rx="1" />
            <rect x="7" y="0" width="2" height="15" rx="1" />
            <rect x="14" y="2.5" width="2" height="10" rx="1" />
          </svg>
        </div>)}
      </div>
      {/* Les quatre libellés, centrés sous leur repère : ce sont les boutons radio du groupe (cibles tactiles pleines). */}
      <div className="gpo-libelles" role="radiogroup" aria-label={libelleGroupe} ref={groupe}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pas(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pas(-1); }
          else if (e.key === 'Home') {
            e.preventDefault();
            for (let i = 0; i < n; i += 1) {
              if (actif(LISTE[i].cle)) { auClavier.current = true; choisirIndex(i); break; }
            }
          }
          else if (e.key === 'End') {
            e.preventDefault();
            for (let i = n - 1; i >= 0; i -= 1) {
              if (actif(LISTE[i].cle)) { auClavier.current = true; choisirIndex(i); break; }
            }
          }
        }}>
        {LISTE.map((p, i) => {
          const active = actif(p.cle);
          const choisi = p.cle === position;
          const interdite = origineInterdite !== null && p.cle === 'origine';
          return (
            <button key={p.cle} type="button" role="radio" aria-checked={choisi} tabIndex={choisi || (index < 0 && p.cle === LISTE.find((q) => actif(q.cle))?.cle) ? 0 : -1}
              disabled={!active && !interdite}
              aria-disabled={interdite ? true : undefined}
              title={interdite ? origineInterdite : undefined}
              className={`gpo-libelle${choisi ? ' gpo-libelle--choisi' : ''}${interdite ? ' gpo-libelle--interdite' : ''}`}
              style={{ ['--gpo-x' as string]: fraction(i) }}
              onClick={() => choisirIndex(i)}>
              {p.libelle}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre), SAUF la poignee blanche du
   curseur (trois traits). LOT PILULE-ROUGE-MAISON : le curseur prend NOTRE rouge, celui du bouton « Valider la
   modification du suivi » (.svv-btn-primary), par la meme variable --color-svv-red ; plus de #FA5252. La poignee
   blanche fait partie du curseur dans les deux themes.
   LA GEOMETRIE : une position i est a  retrait + x * (largeur - 2 * retrait), x = i / 3 (variable --gpo-x). Les
   pourcentages se lisent sur la largeur du bloc qui contient (la piste, ou la rangee des libelles : meme largeur).
   LOT MARGES-MODALE (Arno) : la pastille d un libelle reste DANS le bloc (clamp entre 0 et 100 % - sa largeur) — calee a
   gauche pour Origine, a droite pour Toute la conversation ; centree sous son repere tant que la place le permet. Le
   contour de focus se trace vers l interieur. */
export const CSS_GLISSIERE_PORTEE = `
.gpo{--gpo-retrait:${RETRAIT_PX}px;display:flex;flex-direction:column;gap:10px;min-width:0;padding:6px 0 0}
/* LOT PILULE-AFFINEE-ET-ACCOLADE-ENVELOPPANTE (Arno) : moins « playschool » — contours 2 px, ombre 3 px adoucie (70 %),
   piste 52 px, pilule 92 x 40 px, reperes 10 px. Couleurs, rebond, libelles et comportement inchanges. */
.gpo-piste{position:relative;height:52px;box-sizing:border-box;border:2px solid var(--color-svv-ink);
  border-radius:999px;background:var(--color-svv-field);touch-action:none;cursor:pointer}
.gpo-cran{position:absolute;top:50%;width:10px;height:10px;border-radius:50%;
  left:calc(var(--gpo-retrait) - 2px + var(--gpo-x) * (100% + 4px - 2 * var(--gpo-retrait)));
  transform:translate(-50%,-50%);background:var(--color-svv-line-strong-hover)}
.gpo-cran--grise{opacity:.45}
.gpo-curseur{position:absolute;top:50%;width:92px;height:40px;box-sizing:border-box;border-radius:999px;
  left:calc(var(--gpo-retrait) - 2px + var(--gpo-x) * (100% + 4px - 2 * var(--gpo-retrait)));
  transform:translate(-50%,calc(-50% - 1.5px));background:var(--color-svv-red);border:2px solid var(--color-svv-ink);
  box-shadow:0 3px 0 color-mix(in srgb, var(--color-svv-ink) 70%, transparent);cursor:grab;transition:left .42s cubic-bezier(.34,1.56,.64,1)}
.gpo-curseur:active{cursor:grabbing}
.gpo-poignee{position:absolute;top:50%;left:50%;width:16px;height:15px;transform:translate(-50%,-50%);
  fill:#fff;display:block}
@media (prefers-reduced-motion:reduce){.gpo-curseur{transition:none}}
.gpo-libelles{display:grid;min-width:0}
.gpo-libelle{--gpo-l:min(140px, calc((100% - 2 * var(--gpo-retrait)) / 3 - 6px));grid-area:1/1;justify-self:start;
  align-self:start;width:var(--gpo-l);box-sizing:border-box;min-height:44px;padding:4px 6px;
  margin-left:clamp(0px, calc(var(--gpo-retrait) + var(--gpo-x) * (100% - 2 * var(--gpo-retrait)) - var(--gpo-l) / 2), calc(100% - var(--gpo-l)));
  font:inherit;font-size:16px;line-height:1.25;text-align:center;color:var(--color-svv-gray);background:transparent;
  border:0;border-radius:.6rem;cursor:pointer;overflow-wrap:anywhere}
.gpo-libelle--choisi{font-weight:700;color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.gpo-libelle:disabled{color:var(--color-svv-muted);opacity:.55;cursor:not-allowed}
/* LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — Origine interdite au premier rattachement : meme gris, mais survolable (bulle). */
.gpo-libelle--interdite{color:var(--color-svv-muted);opacity:.55;cursor:not-allowed}
.gpo-libelle:focus-visible{outline:3px solid var(--color-svv-ink);outline-offset:-3px}
/* PETIT ECRAN (telephone) : quatre libelles de 140 px ne tiennent pas cote a cote. Ils restent EXACTEMENT centres sous
   leur repere et en 16 px, mais sur deux rangees decalees (Origine et Ce mail + futurs echanges en haut, One shot et
   Toute la conversation dessous) : chacun dispose ainsi de deux intervalles. Le curseur et son retrait raccourcissent
   pour garder de la place entre les reperes, la pilule tenant toujours dans la piste. */
@media (max-width:560px){
  .gpo{--gpo-retrait:42px}
  .gpo-curseur{width:72px;height:32px}
  .gpo-poignee{width:13px;height:12px}
  .gpo-libelle{--gpo-l:min(140px, calc((100% - 2 * var(--gpo-retrait)) * 2 / 3 - 6px))}
  .gpo-libelle:nth-child(even){grid-area:2/1}
}
`;
