'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  anneeAEcrire, bandeauxDesEvenements, bornesSurLaFrise, coteDeLEtiquette, moisDeLaFrise, mailsRecus,
  motDetailDuMois,
  motDuMois, motFriseTronquee, motRepere, motSurvolMail, MOT_PLUS_ANCIEN, MOIS_VISIBLES_PAR_DEFAUT,
  motCourtRepere, positionSurLaFrise, reperesDoccupation, totauxParMois, type MailDeLaFrise,
} from '../../../../lib/gestion/friseBien';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { tonDeLExpediteur, type CategoriePartie, type OccupationPeriode }
  from '../../../../lib/gestion/historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LA FRISE CHRONOLOGIQUE DE LA VIE DU BIEN ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), à la place de l'ancienne légende, pleine largeur. Les sept pièces de sa demande :
 *   ① 12 derniers mois par défaut, aujourd'hui à DROITE, défilement vers le passé à GAUCHE ;
 *   ② partie haute (3/4) : un trait fin par MAIL REÇU, à sa date et à son heure, dans la couleur de sa catégorie ;
 *   ③ repères d'entrée et de sortie de chaque locataire, sur toute la hauteur, nom au survol ;
 *   ④ la période d'un événement colore le fond en ORANGE clair, titre au survol ;
 *   ⑤ partie basse (1/4) : un bloc par mois avec le TOTAL, détail « N reçus · N envoyés » au survol ;
 *   ⑥ la frise suit les parties cochées, et la période retenue est surlignée ;
 *   ⑦ survol d'un trait : expéditeur, date et heure, objet. Clic : le listing défile et surligne le mail.
 *
 * ═══ 🔴 CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS ═════════════════════════════════════════════════════════
 *
 * Il place et il peint. Aucune date n'est calculée ici : les mois, les positions, les totaux, les repères, les
 * bandeaux et tous les mots viennent de `friseBien.ts`, qui est pur et éprouvé à part. C'est la règle du module
 * depuis le lot 1, et elle compte double ici — une frise est un calcul de dates déguisé en dessin.
 *
 * ═══ 🔴🔴 POURQUOI DES COLONNES DE MOIS, ET NON UNE ÉCHELLE CONTINUE ════════════════════════════════════════════
 *
 * La partie basse d'Arno est « un bloc par MOIS ». Les deux parties doivent donc partager la MÊME échelle, sans
 * quoi un trait ne tomberait pas au-dessus de son mois. On pose donc une largeur de mois FIXE (une variable de la
 * feuille), et tout se place en « index de mois + fraction » — le module pur rend ce nombre, l'écran le multiplie.
 * Une échelle continue (pixels par jour) aurait rendu les mois de 28 et de 31 jours de largeurs différentes, et
 * la partie basse serait devenue illisible.
 *
 * ⚠️ ET C'EST CE QUI REND LE DÉFILEMENT NATUREL : la frise est simplement plus large que son cadre. Le glisser, la
 * molette horizontale et les deux flèches agissent tous sur le MÊME `scrollLeft`, celui du navigateur. Aucune
 * position n'est recalculée à la main — donc rien ne peut diverger entre les trois gestes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function FriseDuBien({
  mails, occupations, evenements, maintenant, categories, bornes, onMail, tronqueeParLaLecture = false,
}: {
  /** TOUS les mails de la sélection — pas la page. Voir la route `/historique/frise`. */
  mails: readonly MailDeLaFrise[];
  occupations: readonly OccupationPeriode[];
  evenements: readonly {
    reference: string; objet: string | null; ouvert: boolean; ouvertLe: string | null; closLe: string | null;
  }[];
  maintenant: Date;
  /** La catégorie de chaque adresse, pour le ton d'un trait. LA MÊME carte que les liserés du listing. */
  categories: ReadonlyMap<string, CategoriePartie>;
  /** Les bornes de la période retenue, à surligner. `null` de part et d'autre = aucune borne. */
  bornes: { du: string | null; au: string | null };
  /** Clic sur un trait : le listing défile jusqu'à ce mail et le surligne. */
  onMail: (messageId: number) => void;
  /** La lecture a-t-elle dû renoncer à des mails ? L'écran le DIT plutôt que de mentir par omission. */
  tronqueeParLaLecture?: boolean;
}) {
  const cadre = useRef<HTMLDivElement | null>(null);
  const [aGauche, setAGauche] = useState(false);
  const [aDroite, setADroite] = useState(false);

  const mois = useMemo(() => moisDeLaFrise(mails, maintenant), [mails, maintenant]);
  const recus = useMemo(() => mailsRecus(mails), [mails]);
  const totaux = useMemo(() => totauxParMois(mails), [mails]);
  const reperes = useMemo(() => reperesDoccupation(occupations), [occupations]);
  const bandeaux = useMemo(() => bandeauxDesEvenements(evenements, maintenant), [evenements, maintenant]);
  const tronquee = useMemo(() => motFriseTronquee(mails, mois), [mails, mois]);

  /**
   * ══ 🔴🔴 « AUJOURD'HUI À DROITE » — ET C'EST UN EFFET DE MISE EN PAGE, PAS UN EFFET ORDINAIRE ════════════════
   *
   * `useLayoutEffect` court APRÈS la mise en page et AVANT la peinture : la frise n'est jamais vue au début de
   * son histoire avant de sauter à la fin. Avec un `useEffect`, on apercevait 2019 un instant.
   *
   * ⚠️ IL SE REJOUE QUAND LES MOIS CHANGENT (une partie cochée, une période) : la frise se redessine, et sa
   * largeur avec. Rester où l'on était aurait laissé le cadre au milieu d'un passé qui n'a plus la même étendue.
   */
  useLayoutEffect(() => {
    const el = cadre.current;
    if (el === null) return;
    el.scrollLeft = el.scrollWidth;
  }, [mois.length]);

  /* Les deux flèches ne s'affichent que s'il reste quelque chose de ce côté-là : une flèche morte s'apprend. */
  useEffect(() => {
    const el = cadre.current;
    if (el === null) return undefined;
    const relire = (): void => {
      setAGauche(el.scrollLeft > 4);
      setADroite(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    relire();
    el.addEventListener('scroll', relire, { passive: true });
    return () => el.removeEventListener('scroll', relire);
  }, [mois.length]);

  const glisser = (sens: -1 | 1): void => {
    const el = cadre.current;
    if (el === null) return;
    /* Un cran = la moitié de ce qu'on voit : on garde un repère commun entre avant et après. */
    el.scrollBy({ left: sens * Math.max(120, el.clientWidth / 2), behavior: 'smooth' });
  };

  /**
   * ══ 🔴 LE GLISSER À LA SOURIS, SANS BIBLIOTHÈQUE ═══════════════════════════════════════════════════════════
   *
   * ⚠️ `onPointerDown` ET NON `onMouseDown` : le même code sert alors le doigt, le stylet et la souris. Et la
   * capture du pointeur évite que le glisser ne s'arrête quand le curseur sort du cadre — défaut classique.
   *
   * ⚠️ LE CLIC SUR UN TRAIT RESTE POSSIBLE : on ne « prend » le glisser qu'au-delà de quelques pixels, sinon un
   * clic net aurait été avalé par un déplacement de zéro pixel.
   */
  const tire = useRef<{ x: number; depart: number; bouge: boolean } | null>(null);
  const surDescente = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = cadre.current;
    if (el === null) return;
    tire.current = { x: e.clientX, depart: el.scrollLeft, bouge: false };
  };
  const surDeplacement = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = cadre.current;
    const t = tire.current;
    if (el === null || t === null) return;
    const d = e.clientX - t.x;
    if (!t.bouge && Math.abs(d) < 4) return;
    if (!t.bouge) { t.bouge = true; e.currentTarget.setPointerCapture(e.pointerId); }
    el.scrollLeft = t.depart - d;
  };
  const surMontee = (): void => { tire.current = null; };

  if (mois.length === 0) return null;

  const periode = bornes.du === null && bornes.au === null
    ? null
    : bornesSurLaFrise(bornes.du ?? `${mois[0]}-01T00:00:00Z`,
      bornes.au ?? maintenant.toISOString(), mois);

  return (
    <section className="frs" aria-label="Frise chronologique du bien">
      {/* ⚠️ LES DEUX FLÈCHES SONT DE VRAIS BOUTONS, et elles portent un libellé : « ‹ » n'est pas un mot, et le
          défilement au clavier passe par elles. Elles n'apparaissent que s'il reste du chemin de ce côté. */}
      {aGauche && (
        <button type="button" className="frs-fleche frs-fleche--gauche" aria-label="Voir plus ancien"
          onClick={() => glisser(-1)}>‹</button>
      )}
      {aDroite && (
        <button type="button" className="frs-fleche frs-fleche--droite" aria-label="Voir plus récent"
          onClick={() => glisser(1)}>›</button>
      )}
      {/* 🔴 L'INDICATION D'ARNO, et seulement quand elle est vraie : « Une petite indication "← plus ancien"
          apparaît quand il reste du passé. » */}
      {aGauche && <span className="frs-plus-ancien" aria-hidden="true">{MOT_PLUS_ANCIEN}</span>}

      <div
        className="frs-cadre"
        ref={cadre}
        onPointerDown={surDescente}
        onPointerMove={surDeplacement}
        onPointerUp={surMontee}
        onPointerCancel={surMontee}>
        {/* 🔴 LE NOMBRE DE MOIS VOYAGE EN VARIABLE : la piste s'en sert pour sa largeur, et chaque élément
            absolu pour se placer en fraction d'elle. Voir l'encadré de la feuille sur la circularité. */}
        <div className="frs-piste"
          style={{ ['--frs-n' as string]: String(mois.length) } as React.CSSProperties}>

          {/* ══ ④ LE FOND ORANGE DES ÉVÉNEMENTS — SOUS les traits, pour ne rien cacher ═══════════════════════ */}
          {bandeaux.map((b) => {
            const p = bornesSurLaFrise(b.du, b.au, mois);
            if (p === null) return null;
            return (
              <span key={`${b.du}-${b.titre}`} className="frs-evt" title={b.titre}
                style={{ left: `calc(${p.de} / var(--frs-n) * 100%)`,
                  width: `calc(${Math.max(0.02, p.a - p.de)} / var(--frs-n) * 100%)` }} />
            );
          })}

          {/* ══ ⑥ LA PÉRIODE RETENUE, UN LÉGER CADRE ════════════════════════════════════════════════════════ */}
          {periode !== null && (
            <span className="frs-periode" aria-hidden="true"
              style={{ left: `calc(${periode.de} / var(--frs-n) * 100%)`,
                width: `calc(${Math.max(0.02, periode.a - periode.de)} / var(--frs-n) * 100%)` }} />
          )}

          {/* ══ ② UN TRAIT PAR MAIL REÇU, À SA DATE ET À SON HEURE ══════════════════════════════════════════
              🔴 LE TON VIENT DE `tonDeLExpediteur`, LA MÊME FONCTION QUE LES LISERÉS DU LISTING : un mail ne
              peut donc pas être rouge dans la frise et vert trois lignes plus bas. */}
          {recus.map((m) => {
            const x = positionSurLaFrise(m.recuLe, mois);
            if (x === null) return null;
            const ton = tonDeLExpediteur({ sens: 'recu', de: m.de }, categories);
            return (
              <button
                key={m.messageId}
                type="button"
                className={`frs-trait frs-trait--${ton}`}
                style={{ left: `calc(${x} / var(--frs-n) * 100%)` }}
                title={motSurvolMail(m, dateHeureComplete(m.recuLe))}
                aria-label={motSurvolMail(m, dateHeureComplete(m.recuLe))}
                onClick={() => onMail(m.messageId)} />
            );
          })}

          {/* ══ ③ LES REPÈRES D'ENTRÉE ET DE SORTIE, SUR TOUTE LA HAUTEUR DE LA PARTIE HAUTE ════════════════ */}
          {reperes.map((r) => {
            const x = positionSurLaFrise(r.quand, mois);
            if (x === null) return null;
            return (
              <span key={`${r.sorte}-${r.quand}-${r.libelle}`}
                className={`frs-repere frs-repere--${r.sorte}`}
                style={{ left: `calc(${x} / var(--frs-n) * 100%)` }}
                title={motRepere(r)}>
                {/**
                  * 🔴 LE MOT COURT D'ARNO, et non un picto seul : « ▶ » ne dit rien à qui ne l'a pas appris.
                  *
                  * 🔴🔴 LOT FRISES-REPARATION — LE CÔTÉ VIENT DU MODULE PUR. Mesuré sur lot-237 : l'étiquette
                  * d'une sortie posée à 44 px du bord gauche s'étendait de −5 px à 41 — elle SORTAIT de la
                  * frise. Près d'un bord, elle se décale vers l'intérieur ; au milieu, la convention tient
                  * (sortie à gauche, entrée à droite) pour qu'une relocation du même jour reste lisible.
                  */}
                <span className={`frs-repere-picto frs-repere-picto--${coteDeLEtiquette(x, mois.length, r.sorte)}`}>
                  <span aria-hidden="true">{r.sorte === 'entree' ? '▶' : '■'}</span>
                  {motCourtRepere(r.sorte)}
                </span>
              </span>
            );
          })}

          {/* ══ ⑤ LA PARTIE BASSE : UN BLOC PAR MOIS, AVEC SON TOTAL ════════════════════════════════════════ */}
          <div className="frs-mois-ligne">
            {mois.map((c, i) => {
              const t = totaux.get(c);
              return (
                <div key={c} className="frs-mois" title={motDetailDuMois(c, t)}>
                  <span className="frs-mois-nom">{motDuMois(c, anneeAEcrire(mois, i))}</span>
                  <span className="frs-mois-total">{t?.total ?? 0}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ⚠️ CE QUE LA FRISE NE MONTRE PAS, ELLE LE DIT. Deux cas distincts : la lecture a été tronquée par sa
          borne, ou le bien a du courrier plus ancien que les mois dessinés. */}
      {(tronquee !== null || tronqueeParLaLecture) && (
        <p className="gst-note frs-note" role="status">
          {tronqueeParLaLecture
            ? 'La frise ne porte qu’une partie du courrier de ce bien : la lecture a atteint sa borne.'
            : tronquee}
        </p>
      )}
    </section>
  );
}

/**
 * ══ 🔴 L'HABILLAGE — TROIS QUARTS EN HAUT, UN QUART EN BAS, ET AUCUNE COULEUR EN DUR ════════════════════════════
 *
 * Arno : « PARTIE HAUTE (3/4 de la hauteur) […] PARTIE BASSE (1/4) ». Les deux hauteurs sont donc dérivées d'une
 * seule variable, et le rapport ne peut pas diverger : `--frs-haut` vaut trois fois `--frs-bas`.
 *
 * 🔴 LES CINQ TONS SONT CEUX DES LISERÉS (`--color-svv-red`, `-green`, `-blue`, `-line-strong`), pris aux jetons
 * du dépôt. Un `#rrggbb` écrit ici aurait donné la même teinte dans les deux thèmes — ce que le garde de ce
 * fichier interdit, et il a raison : le bleu du mode Clair est illisible sur le fond du mode Sombre.
 *
 * ⚠️ LES TRAITS SONT DES BOUTONS DE 3 px DE LARGE AVEC UNE CIBLE PLUS LARGE QU'EUX (un `::after` débordant) :
 * viser trois pixels à la souris est déjà difficile, au doigt c'est impossible. La cible déborde le dessin, elle
 * ne le grossit pas — sans quoi deux mails du même jour se seraient recouverts.
 *
 * ⚠️ `overscroll-behavior-x: contain` : arriver au bout de la frise ne doit pas emporter la page (ni déclencher
 * le « retour arrière » du navigateur sur un pavé tactile).
 */
export const CSS_FRISE_DU_BIEN = `
/* ══ 🔴🔴 « LES 12 DERNIERS MOIS » EST TENU PAR LA LARGEUR D'UN MOIS, ET NON PAR UN CALCUL ════════════════════
   DEMANDE D'ARNO : « Affichage par défaut : les 12 derniers mois, aujourd'hui à droite. »

   🔴 UN MOIS VAUT DONC UN DOUZIEME DU CADRE : douze mois remplissent exactement la largeur disponible, a
   n'importe quelle taille d'ecran, et le treizieme commence hors champ. Compter les mois visibles en JavaScript
   aurait demande de mesurer le cadre, donc de redessiner a chaque redimensionnement — et d'etre faux le temps
   d'une image au premier rendu.

   ⚠️ UN PLANCHER DE 56 px : sur un telephone, un douzieme de 390 px ferait 32 px, ou le nom du mois ne tient
   pas. En dessous de ce plancher la frise defile — c'est le comportement voulu sur ecran etroit, et le nombre
   de mois visibles cede avant la lisibilite.

   ⚠️ LE NOMBRE 12 EST ICI **ET** DANS LE MODULE PUR (MOIS_VISIBLES_PAR_DEFAUT) : une feuille de style ne peut
   pas lire une constante TypeScript. Une epreuve verifie qu'ils ne divergent pas. */
.frs{position:relative;margin:.5rem 0 .2rem;min-width:0;
  --frs-mois:max(56px, calc((100% - 2px) / 12));--frs-bas:26px;--frs-haut:62px}
.frs-cadre{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin;
  border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-surface);
  cursor:grab;touch-action:pan-x}
.frs-cadre:active{cursor:grabbing}
/* ══ 🔴🔴 LA CIRCULARITE DES POURCENTAGES, ET COMMENT ELLE EST EVITEE ════════════════════════════════════════
   🔴 DEFAUT MESURE A L'ECRAN (lot-146) : un mois faisait 166 px au lieu d'un douzieme du cadre, et seuls six
   mois etaient visibles au lieu de douze. La cause : --frs-mois vaut un pourcentage, et il servait A LA FOIS
   a la largeur de la PISTE (pourcentage du cadre, sain) et a celle de chaque BLOC DE MOIS (pourcentage de la
   piste — qui depend elle-meme de ce calcul). Le navigateur resout cette boucle comme il peut, et le resultat
   n'a aucune raison d'etre celui qu'on croit.

   🔴 LA SORTIE : un seul pourcentage, celui de la PISTE, et plus aucun en dessous.
     · la piste vaut « nombre de mois x un douzieme du cadre » ;
     · les blocs de mois sont une GRILLE de N colonnes egales — aucune largeur a calculer ;
     · tout ce qui est absolu se place en fraction de la piste, dont la largeur est alors connue.
   --frs-n (le nombre de mois) est pose en ligne par le composant : c'est la seule donnee que la feuille ne
   peut pas deviner. */
.frs-piste{position:relative;height:calc(var(--frs-haut) + var(--frs-bas));min-width:100%;
  width:calc(var(--frs-n) * var(--frs-mois))}

/* ── ④ LE FOND ORANGE D'UN EVENEMENT, SOUS TOUT LE RESTE ── C'est le jeton AMBRE du depot, celui que porte deja
   la capsule « Evenement en cours » au-dessus du tableau de bord : le meme evenement garde la meme couleur d'un
   bout a l'autre de l'ecran. Eclairci par un color-mix, qui suit le fond du theme — aucune couleur en dur. */
.frs-evt{position:absolute;top:0;height:var(--frs-haut);
  background:color-mix(in srgb, var(--color-svv-amber) 16%, transparent);pointer-events:auto}

/* ── ⑥ LA PERIODE RETENUE : un cadre leger, jamais un fond — il cacherait les traits. */
.frs-periode{position:absolute;top:0;height:var(--frs-haut);pointer-events:none;
  border-left:1px dashed var(--color-svv-ink-soft);border-right:1px dashed var(--color-svv-ink-soft);
  background:color-mix(in srgb, var(--color-svv-ink) 4%, transparent)}

/* ── ② UN TRAIT PAR MAIL RECU ── 3 px de dessin, une cible de 11 px qui le deborde. */
.frs-trait{position:absolute;bottom:var(--frs-bas);width:3px;height:calc(var(--frs-haut) - 10px);
  padding:0;border:0;border-radius:1px;background:var(--color-svv-line-strong);cursor:pointer}
.frs-trait::after{content:"";position:absolute;inset:-4px}
.frs-trait:hover{filter:brightness(1.15)}
.frs-trait:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.frs-trait--rouge{background:var(--color-svv-red)}
.frs-trait--vert{background:var(--color-svv-green)}
.frs-trait--bleu{background:var(--color-svv-blue)}
.frs-trait--gris{background:var(--color-svv-line-strong)}
/* « nous » n'apparait pas dans la partie haute (elle ne porte que les RECUS), mais le ton existe : si un envoi
   y entrait un jour, il serait gris neutre comme sa barre dans le listing, et non invisible. */
.frs-trait--nous{background:var(--color-svv-line)}

/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 2 — LES REPERES D'ENTREE ET DE SORTIE, BEAUCOUP PLUS VISIBLES ══════════
   DEMANDE D'ARNO : « trait EPAIS sur toute la hauteur haute, petit drapeau en tete avec le texte court
   "Entree" (vert) / "Sortie" (gris fonce), et le nom au survol. Bien distincts des traits de mails. »

   🔴 TROIS CHOSES LES DISTINGUENT D'UN TRAIT DE MAIL, ET IL EN FALLAIT TROIS : l'EPAISSEUR (3 px contre 3 px de
   mail, mais pleine hauteur contre une hauteur reduite), le DRAPEAU en tete — un mail n'en a pas — et le MOT
   qu'il porte. La couleur seule n'aurait pas suffi : le vert d'une entree est celui d'un mail de locataire.

   🔴 LE DRAPEAU EST **AU-DESSUS** DE LA PARTIE HAUTE, pas dedans : il se lit sans recouvrir le moindre trait de
   mail. C'est ce qui permet de le grossir sans rien cacher.

   ⚠️ ENTREE ET SORTIE LE MEME JOUR (une relocation — c'est le cas de lot-146 le 22/10/2025) : la SORTIE se
   decale a gauche et l'ENTREE a droite. Sans ce decalage, les deux drapeaux se recouvraient exactement et l'on
   n'en lisait qu'un. Le trait, lui, reste a sa date — c'est le drapeau qui s'ecarte. */
.frs-repere{position:absolute;top:0;height:var(--frs-haut);width:0;z-index:1}
.frs-repere::before{content:"";position:absolute;top:0;bottom:0;left:-1.5px;width:3px;border-radius:1px}
.frs-repere--entree::before{background:var(--color-svv-green)}
.frs-repere--sortie::before{background:var(--color-svv-ink)}
.frs-repere-picto{position:absolute;top:1px;display:inline-flex;align-items:center;gap:2px;
  font-size:.58rem;font-weight:700;line-height:1;padding:2px 4px;border-radius:3px;white-space:nowrap;
  border:1px solid currentColor}
/* 🔴 LE DECALAGE QUI EMPECHE LE CHEVAUCHEMENT : la sortie pose son drapeau a GAUCHE de son trait, l'entree a
   DROITE. Le meme jour, les deux se lisent cote a cote. */
/* 🔴🔴 LES JETONS DU BADGE « EN PLACE » (lot 13, point 3), ET NON le vert des traits : MESURE A L'ECRAN, le vert
   de trait sur un fond vert pale ne donnait que 2,99 de contraste en Clair — sous le seuil de lisibilite AA.
   La paire -green-soft / -green-ink existe justement pour ce cas, et elle est deja mesuree a 4,75 en Clair et
   9,01 en Sombre. Le trait, lui, garde le vert vif : c'est un trait, pas un texte. */
/* ══ 🔴🔴 LOT FRISES-REPARATION — LE COTE EST UNE CLASSE, PLUS UNE DEDUCTION DE LA SORTE ══════════════════════
   Mesure sur lot-237 : l'etiquette d'une sortie posee a 44 px du bord gauche s'etendait de -5 px a 41. Elle
   SORTAIT de la frise, et le trait paraissait coupe. C'est coteDeLEtiquette (module pur) qui tranche
   desormais : pres d'un bord elle rentre, au milieu la convention tient. */
.frs-repere-picto--gauche{right:3px}
.frs-repere-picto--droite{left:3px}
.frs-repere--entree .frs-repere-picto{color:var(--color-svv-green-ink);
  background:var(--color-svv-green-soft)}
.frs-repere--sortie .frs-repere-picto{color:var(--color-svv-ink);
  background:color-mix(in srgb, var(--color-svv-ink) 10%, var(--color-svv-surface))}

/* ── ⑤ LA PARTIE BASSE : UN BLOC PAR MOIS ── */
.frs-mois-ligne{position:absolute;left:0;right:0;bottom:0;height:var(--frs-bas);
  display:grid;grid-template-columns:repeat(var(--frs-n), 1fr);
  border-top:1px solid var(--color-svv-line)}
.frs-mois{display:flex;align-items:center;min-width:0;
  justify-content:center;gap:.3rem;font-size:.66rem;color:var(--color-svv-muted);
  border-right:1px solid var(--color-svv-line);overflow:hidden;white-space:nowrap}
.frs-mois:last-child{border-right:0}
.frs-mois-total{font-weight:700;color:var(--color-svv-ink)}

/* ── LES DEUX FLECHES ET L'INDICATION ── posees SUR le cadre, elles ne prennent aucune largeur a la frise. */
.frs-fleche{position:absolute;top:calc(var(--frs-haut) / 2 - 16px);z-index:2;width:28px;height:32px;
  display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;
  border:1px solid var(--color-svv-line);border-radius:.35rem;background:var(--color-svv-surface);
  color:var(--color-svv-ink);font:inherit;font-size:1rem;line-height:1}
.frs-fleche--gauche{left:2px}
.frs-fleche--droite{right:2px}
.frs-fleche:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.frs-plus-ancien{position:absolute;left:34px;top:2px;z-index:2;font-size:.64rem;
  color:var(--color-svv-muted);background:var(--color-svv-surface);padding:0 .2rem;border-radius:2px}
.frs-note{margin:.2rem 0 0}
`;
