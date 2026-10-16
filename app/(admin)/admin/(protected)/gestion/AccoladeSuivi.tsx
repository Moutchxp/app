'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { estSuiviAutomatique, motSuiviAutomatique } from '../../../../lib/gestion/reglesRattachement';
import { AIDE_PASTILLE_REPERE, motMailsCouverts, titreModaleChangement } from '../../../../lib/gestion/repereFenetre';
import { PHRASE_SUITE, SUFFIXE_SUITE } from '../../../../lib/gestion/avantApres';
import type { Classement } from '../../../../lib/gestion/periodesConversation';
/* 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — le « i » ouvre la fenêtre en deux colonnes, commune avec la pastille. */
import { ModaleAvantApres } from './ModaleAvantApres';
import { CSS_COMPTEUR_BIENS, ContenuBulleBiens, lireBiensDesCles, lireBiensDuMail, useBiensRattaches } from './CompteurBiensMail';
import { motBiensRattaches } from '../../../../lib/gestion/changementsSuivi';
import { createPortal } from 'react-dom';
import { hoteDeLaBulle } from './InfoBien';
import { fermerQuandLaPagePerdLeFocus } from './fermetureMenu';
import { placerBulleBiens, type BienDeLaBulle } from '../../../../lib/gestion/bulleBiensMail';
import {
  AUCUN_RATTACHEMENT, SOUS_TITRE_AVANT_LISERE, TITRE_APRES_LISERE, TITRE_AVANT_LISERE, motAvantSansBien, type SignauxAvant,
} from '../../../../lib/gestion/lisereSuivi';

/** Le mail qui ouvre le changement, pour la ligne « Sur le mail » de la fenêtre. */
export interface MailDuRepere {
  de: string;
  deNom: string | null;
  recuLe: string;
  objet: string | null;
}

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — L'ACCOLADE ROUGE D'UN CHANGEMENT DE SUIVI RÉCURRENT, LE MODÈLE UNIQUE ═════════════════
 *
 * DÉCISION D'ARNO (11/10/2026) : « Ce visuel EXACT, sans aucune retouche graphique, est le modèle unique pour signaler
 * un changement de suivi récurrent […]. Il s'affiche partout où les mails concernés sont listés. »
 *
 * 🔴 CE COMPOSANT EST `LigneRepere` DE LA VUE CONVERSATION, DÉPLACÉ TEL QUEL — même JSX, mêmes classes (`cnv-repere…`),
 * même feuille (`CSS_ACCOLADE_SUIVI`, coupée de `CSS_CONVERSATION` sans un caractère de différence). Seul ce qu'il
 * AFFICHE devient un paramètre : le libellé après « À partir d'ici : », qui, quand, et l'avant / après de son « i ».
 * C'est ce qui le rend identique partout : il n'y a qu'un dessin.
 *
 * ⚠️ IL EST UN `<li>` ET MESURE SON VOISIN : posé dans une liste de mails (`ol`/`ul`), ses deux bras longent le mail
 * d'à côté jusqu'à mi-hauteur. Au-dessus du mail (`dessus`) le voisin est le SUIVANT, en dessous le PRÉCÉDENT.
 */
export function AccoladeSuivi({ cote, libelle, parLibelle, le, detail: c, mail, nbMails, autres = [], compteMailId, avantMail = null }: {
  cote: 'dessus' | 'dessous';
  /** Ce qui suit « À partir d'ici : » — « aucun bien », « 25 rue Edith Cavell… », « suivi de fond modifié » (ajout)… */
  libelle: string;
  parLibelle: string | null;
  le: string | null;
  /** L'avant / après du « i ». `null` = on ne sait pas le composer : la pastille ne s'affiche pas. */
  detail: { avant: Classement | null; interneEchangeAvant: boolean; apres: Classement } | null;
  /** Le mail qui ouvre la fenêtre, pour le pied de la modale. */
  mail: MailDuRepere | null;
  nbMails: number;
  /**
   * 🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — « Si deux changements portent sur le même mail, affiche le plus
   * récent et mentionne l'existence de l'autre dans la fenêtre du “i” » (Arno) : une ligne par autre changement.
   */
  autres?: readonly string[];
  /**
   * 🔴🔴 LOT ACCOLADE-TOUJOURS-VRAIE — « suivi de fond modifié — N biens rattachés » : N est lu EN DIRECT, par le même
   * compteur que celui sous la date (`useBiensRattaches`), relu après chaque geste. Tant qu'il n'est pas connu, le
   * libellé rendu par le serveur (calculé à la lecture, sur les mêmes liens) s'affiche.
   */
  compteMailId?: number;
  /**
   * 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — le mail PRÉCÉDENT dans la conversation, et ses marques : la partie
   * « Avant » de la bulle dit son rattachement EFFECTIF (ses biens, « Interne », « Hors gestion », ou « Aucun
   * rattachement »). `null` = inconnu : l'« Avant » retombe sur la fenêtre que le changement a remplacée (`detail.avant`).
   */
  avantMail?: SignauxAvant | null;
}) {
  const nEnDirect = useBiensRattaches(compteMailId);
  const libelleVrai = compteMailId !== undefined && nEnDirect !== null
    ? `suivi de fond modifié — ${motBiensRattaches(nEnDirect)}` : libelle;
  const li = useRef<HTMLLIElement | null>(null);
  const [hauteur, setHauteur] = useState(0);
  const [ouverte, setOuverte] = useState(false);

  /**
   * 🔴 LA HAUTEUR DU MAIL VOISIN, MESURÉE. Au-dessus du mail, le voisin est le SUIVANT ; en dessous, le
   * PRÉCÉDENT. On ne devine pas : on lit ce que le navigateur a disposé.
   */
  useEffect(() => {
    const noeud = li.current;
    if (noeud === null || typeof ResizeObserver !== 'function') return undefined;
    const voisin = (cote === 'dessus' ? noeud.nextElementSibling : noeud.previousElementSibling) as HTMLElement | null;
    if (voisin === null) return undefined;
    const mesurer = (): void => setHauteur(voisin.getBoundingClientRect().height);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(voisin);
    return () => obs.disconnect();
  }, [cote]);

  return (
    <li className={`cnv-repere cnv-repere--${cote}${hauteur > 0 ? ' cnv-repere--mesure' : ''}`} ref={li}
      style={{ ['--cnv-repere-h' as string]: `${Math.round(hauteur)}px` }}>
      {/* LES DEUX BRAS DU CADRE — un seul trait chacun, sans coupure à l'angle, une flèche au bout (voir la feuille). */}
      <span className="cnv-repere-bras cnv-repere-bras--gauche" aria-hidden="true" />
      <span className="cnv-repere-phrase">
        <span className="cnv-repere-mot">À partir d’ici : {libelleVrai}</span>
        {(parLibelle !== null || le !== null) && (
          <span className="cnv-repere-qui">
            {/* 🔴🔴 LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET — R4 : un suivi posé par l'automate le dit
                en toutes lettres (« suivi de fond posé automatiquement le … ») ; les autres, comme avant. */}
            {estSuiviAutomatique(parLibelle) ? motSuiviAutomatique(le === null ? null : dateHeureComplete(le)) : (
              <>
                {le !== null && dateHeureComplete(le)}
                {le !== null && parLibelle !== null ? ' · ' : ''}
                {parLibelle}
              </>
            )}
          </span>
        )}
        {/* LA PASTILLE « i » : un vrai bouton, ouvert au clic (et Entrée / Espace). Le survol ne fait que la nommer. */}
        {/* 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — au survol (et au focus clavier) : la BULLE « Avant / Après »,
            même contenu que les autres bulles de biens (un bien = une ligne). Le clic ouvre toujours la fenêtre détaillée. */}
        {c !== null && (
          <PastilleLisere ouvrirFenetre={() => setOuverte(true)} detail={c} avantMail={avantMail}
            parLibelle={parLibelle} le={le} />
        )}
        {/* ⚠️ LA MODALE EST RENDUE DANS LA LIGNE, mais son voile est `position:fixed` : centrée sur l'ÉCRAN. */}
        {c !== null && ouverte && (
          <ModaleAvantApres titre={titreModaleChangement(le === null ? null : dateHeureComplete(le))}
            gestes={[{ ...c, recalcule: false, par: parLibelle, le }]}
            suffixeApres={SUFFIXE_SUITE} phrase={PHRASE_SUITE}
            /* Gardées de la fenêtre d'avant : de quel mail on parle, et combien de mails la fenêtre couvre. */
            complements={[
              ...(mail === null ? [] : [`Sur le mail : ${mail.deNom ?? mail.de} · ${dateHeureComplete(mail.recuLe)} · ${mail.objet ?? '(sans objet)'}`]),
              `Portée : ${motMailsCouverts(nbMails)}`,
              ...autres,
            ]}
            onFermer={() => setOuverte(false)} />
        )}
      </span>
      <span className="cnv-repere-bras cnv-repere-bras--droite" aria-hidden="true" />
    </li>
  );
}

type Lu = { v: 'charge' } | { v: 'ok'; liste: BienDeLaBulle[] } | { v: 'erreur' };
let fermerLaBulleLisere: (() => void) | null = null;

/**
 * ══ 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — LA PASTILLE « i » DU LISERÉ ET SA BULLE « AVANT / APRÈS » ════════
 * « Avant » : le rattachement EFFECTIF du mail précédent dans la conversation (ses biens, ou « Interne », ou « Aucun
 * rattachement » s'il est À classer). « Après » : la dernière configuration de suivi de fond validée sur ce mail (biens,
 * ou « Interne »), avec qui et quand. MÊME COMPOSANT que les autres bulles (`ContenuBulleBiens`, un bien = une ligne),
 * posé dans un portail et gardé dans l'écran (`placerBulleBiens`).
 * ⚠️ LE CLIC OUVRE TOUJOURS LA FENÊTRE DÉTAILLÉE (`ModaleAvantApres`) : rien n'est retiré. La bulle s'ouvre au survol de la
 * souris et au focus CLAVIER seulement — un toucher ouvre la fenêtre, comme avant.
 */
function PastilleLisere({ ouvrirFenetre, detail, avantMail, parLibelle, le }: {
  ouvrirFenetre: () => void;
  detail: { avant: Classement | null; apres: Classement };
  avantMail: SignauxAvant | null;
  parLibelle: string | null;
  le: string | null;
}) {
  const declencheur = useRef<HTMLButtonElement | null>(null);
  const bulle = useRef<HTMLDivElement | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ouverte, setOuverte] = useState(false);
  const [place, setPlace] = useState<ReturnType<typeof placerBulleBiens> | null>(null);
  const [avantLu, setAvantLu] = useState<Lu>({ v: 'charge' });
  const [apresLu, setApresLu] = useState<Lu>({ v: 'charge' });
  const clesApres = detail.apres.sorte === 'biens' ? detail.apres.biens.map((b) => b.cle) : [];
  /* Sans le mail précédent, l'« Avant » est la fenêtre remplacée : ses biens par leurs clés. */
  const clesAvantRepli = avantMail === null && detail.avant?.sorte === 'biens' ? detail.avant.biens.map((b) => b.cle) : [];

  const annuler = (): void => { if (minuteur.current !== null) { clearTimeout(minuteur.current); minuteur.current = null; } };
  const fermer = useCallback((): void => { annuler(); setOuverte(false); setPlace(null); }, []);
  const ouvrir = (): void => {
    annuler();
    if (ouverte) return;
    if (fermerLaBulleLisere !== null && fermerLaBulleLisere !== fermer) fermerLaBulleLisere();
    fermerLaBulleLisere = fermer;
    setOuverte(true);
  };
  const fermerBientot = (): void => { annuler(); minuteur.current = setTimeout(fermer, 180); };

  /* LES BIENS, LUS À L'OUVERTURE — mêmes lectures et même mémoire que la bulle « N biens rattachés ». */
  useEffect(() => {
    if (!ouverte) return undefined;
    let vivant = true;
    const lu = (l: BienDeLaBulle[] | null): Lu => (l === null ? { v: 'erreur' } : { v: 'ok', liste: l });
    if (avantMail !== null) void lireBiensDuMail(avantMail.messageId).then((l) => { if (vivant) setAvantLu(lu(l)); });
    else void lireBiensDesCles(clesAvantRepli).then((l) => { if (vivant) setAvantLu(lu(l)); });
    void lireBiensDesCles(clesApres).then((l) => { if (vivant) setApresLu(lu(l)); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- les clés sont relues à chaque ouverture
  }, [ouverte, avantMail?.messageId]);

  useLayoutEffect(() => {
    if (!ouverte) return undefined;
    const mesurer = (): void => {
      const d = declencheur.current?.getBoundingClientRect();
      const b = bulle.current;
      if (d === undefined || b === null) return;
      setPlace(placerBulleBiens({
        declencheur: { gauche: d.left, haut: d.top, largeur: d.width, hauteur: d.height },
        bulle: { largeur: b.offsetWidth, hauteur: b.scrollHeight },
        fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
      }));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    document.addEventListener('scroll', mesurer, true);
    return () => { window.removeEventListener('resize', mesurer); document.removeEventListener('scroll', mesurer, true); };
  }, [ouverte, avantLu, apresLu]);

  useEffect(() => {
    if (!ouverte) return undefined;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer(); };
    const ailleurs = (e: PointerEvent): void => {
      const n = e.target as Node | null;
      if (n !== null && (declencheur.current?.contains(n) || bulle.current?.contains(n))) return;
      fermer();
    };
    document.addEventListener('keydown', clavier, true);
    document.addEventListener('pointerdown', ailleurs, true);
    const lacher = fermerQuandLaPagePerdLeFocus(fermer);
    return () => {
      document.removeEventListener('keydown', clavier, true);
      document.removeEventListener('pointerdown', ailleurs, true);
      lacher();
    };
  }, [ouverte, fermer]);
  useEffect(() => () => { annuler(); if (fermerLaBulleLisere === fermer) fermerLaBulleLisere = null; }, [fermer]);

  const motApres = detail.apres.sorte === 'interne' ? 'Interne' : detail.apres.sorte === 'hors_gestion' ? 'Hors gestion' : 'Aucun bien';
  const motAvant = avantMail !== null ? motAvantSansBien(avantMail)
    : detail.avant === null ? AUCUN_RATTACHEMENT
      : detail.avant.sorte === 'interne' ? 'Interne' : detail.avant.sorte === 'hors_gestion' ? 'Hors gestion' : AUCUN_RATTACHEMENT;
  const quiQuand = [le === null ? null : dateHeureComplete(le), parLibelle].filter((x): x is string => x !== null && x !== '').join(' · ');
  const idBulle = useRef(`cnv-lisere-bulle-${Math.random().toString(36).slice(2)}`).current;

  const contenu = (
    <div className="cbm-bulle cnv-lisere-bulle" id={idBulle} role="tooltip" ref={bulle}
      style={place === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: place.gauche, top: place.haut, maxHeight: place.hauteurMax }}
      onMouseEnter={annuler} onMouseLeave={fermerBientot} onClick={(e) => e.stopPropagation()}>
      <style>{CSS_COMPTEUR_BIENS}</style>
      <div className="cnv-lisere-partie cnv-lisere-partie--avant">
        <ContenuBulleBiens titre={TITRE_AVANT_LISERE} etat={avantLu.v} biens={avantLu.v === 'ok' ? avantLu.liste : []}
          sansBien={motAvant} />
        {avantMail !== null && <p className="cbm-bulle-lot">{SOUS_TITRE_AVANT_LISERE}</p>}
      </div>
      <div className="cbm-bulle-pied cnv-lisere-partie cnv-lisere-partie--apres">
        <ContenuBulleBiens titre={TITRE_APRES_LISERE} etat={clesApres.length === 0 ? 'ok' : apresLu.v}
          biens={clesApres.length > 0 && apresLu.v === 'ok' ? apresLu.liste : []} sansBien={motApres} />
        {quiQuand !== '' && <p className="cbm-bulle-lot cnv-lisere-qui">Validé le {quiQuand}</p>}
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className="cnv-repere-i" aria-haspopup="dialog" ref={declencheur}
        title={AIDE_PASTILLE_REPERE} aria-label={AIDE_PASTILLE_REPERE} aria-describedby={ouverte ? idBulle : undefined}
        onMouseEnter={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') ouvrir(); }}
        onMouseLeave={fermerBientot}
        onFocus={(e) => { let clavier = false; try { clavier = e.currentTarget.matches(':focus-visible'); } catch { clavier = false; } if (clavier) ouvrir(); }}
        onBlur={fermerBientot}
        onClick={() => { fermer(); ouvrirFenetre(); }}>
        <span aria-hidden="true">i</span>
      </button>
      {ouverte && typeof document !== 'undefined' && createPortal(contenu, hoteDeLaBulle())}
    </>
  );
}

/* ⚠️ COUPE TELLE QUELLE DE CSS_CONVERSATION (lot ACCOLADE-PARTOUT) : aucune retouche graphique. */
export const CSS_ACCOLADE_SUIVI = `
/* ══ 🔴🔴 LE REPERE ENCADRE SON MAIL — UN SEUL TRAIT PAR COTE, ANGLES ARRONDIS ═══════════════════════════════════
   Demande d'Arno (lot VISUALISER-MAIL-ET-REPERE-FENETRE, puis BROUILLON-REPONSE-ET-REPERE) : « phrase en ROUGE,
   CENTREE ; de chaque cote part un lisere rouge fin, qui longe le mail concerne et s'arrete a MI-HAUTEUR de la
   ligne de ce mail », et « lisere CONTINU, sans coupure aux angles, avec des angles ARRONDIS ».

   🔴 CHAQUE BRAS EST UNE SEULE BOITE, et c'est ce qui supprime la coupure. Elle porte DEUX bordures — celle du
   haut (ou du bas) et celle du cote — plus un rayon sur l'angle qui les joint : le trait est continu PAR
   CONSTRUCTION, et arrondi. La version d'avant dessinait quatre traits independants, et il restait un decroche
   d'un pixel au coin, visible a l'oeil.

   🔴 LES BRAS NE PESENT RIEN DANS LA MISE EN PAGE : hauteur zero, et c'est leur ::before qui deborde. Sans cela,
   une boite de la moitie de la hauteur d'un mail deplie ferait une ligne de repere haute de plusieurs centimetres.

   ⚠️ LE SENS SUIT LE COTE : au-dessus du mail le trait DESCEND (bordure du haut, boite vers le bas), en dessous
   il MONTE. Un seul dessin aurait encadre le mauvais mail dans l'un des deux tris.

   ⚠️ --cnv-repere-h PORTE LA HAUTEUR MESUREE DU MAIL (voir le ResizeObserver de LigneRepere) : un mail deplie
   fait dix fois la hauteur d'un mail replie, et une valeur figee aurait trace un trait trop court ou debordant.

   ⚠️ COULEUR : var(--color-svv-red), un JETON — lisible en Clair comme en Sombre, jamais une couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
/* 🔴 LE REPERE SE SERRE : il remplace un trait de 1 px, il ne vient pas s'ajouter a lui. Les marges d'avant
   (.6rem / .4rem) creusaient un trou la ou il n'y avait qu'une ligne. */
.cnv-repere{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  margin:.1rem 0;padding:0;list-style:none;--cnv-repere-h:0px;--cnv-repere-deborde:9px;--cnv-repere-part:.6}
.cnv-repere-phrase{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:.2rem .5rem;
  padding:0 .6rem;text-align:center;min-width:0}
/* 🔴 LA PHRASE EST ROUGE, et le reste de la mention la suit en plus discret : c'est une seule information. */
.cnv-repere-mot{font-size:.76rem;font-weight:700;letter-spacing:.01em;color:var(--color-svv-red);
  overflow-wrap:anywhere}
.cnv-repere-qui{font-size:.72rem;color:var(--color-svv-red);opacity:.75}
/* 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — LA PASTILLE "i" EST UN BOUTON, et elle OUVRE une fenetre.
   Meme dessin que la pastille des biens (.ifb-pastille), au rouge du repere pres : c'est la meme promesse ("il y a
   plus a lire ici"), donc le meme objet a l'oeil. Elle n'est plus une bulle au survol : voir ModaleAvantApres. */
.cnv-repere-i{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;
  margin:0 0 0 .1rem;font:inherit;font-size:.68rem;font-weight:700;font-style:italic;line-height:1;
  color:var(--color-svv-red);background:transparent;border:1px solid var(--color-svv-red);border-radius:50%;
  cursor:pointer;flex:0 0 auto;opacity:.8}
.cnv-repere-i:hover{opacity:1}
.cnv-repere-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;opacity:1}
/* ⚠️ CIBLE TACTILE : 24 px au doigt, comme partout dans le module. */
@media (pointer:coarse){.cnv-repere-i{width:24px;height:24px;font-size:.78rem}}
/* Les bras : hauteur zero dans la grille, le trace vit dans leur ::before. */
.cnv-repere-bras{position:relative;height:0;min-width:0}
.cnv-repere-bras::before{content:"";position:absolute;left:0;right:0;
  height:calc(var(--cnv-repere-h) * var(--cnv-repere-part));border:0 solid var(--color-svv-red)}
/* ══ 🔴🔴 LOT PILULE-AFFINEE-ET-ACCOLADE-ENVELOPPANTE — L'ACCOLADE PORTE LE MAIL COMME UN BERCEAU ══════════════════
   Demande d'Arno (12/10/2026) : « Les deux retours verticaux passent legerement A L'EXTERIEUR du cadre du mail,
   environ 8 a 10 px a gauche et a droite. Ils remontent le long de ses flancs, et les fleches pointent un peu
   au-dessus de la moitie du mail. Ne pas decaler ni retrecir le cadre du mail. Rien n'est rogne, y compris sur
   telephone (reduire le debord a ~4 px si la place manque). »
   🔴 LE CADRE DU MAIL NE BOUGE PAS : seul le trace du bras deborde (left / right negatifs du ::before), la ligne
   de l'accolade garde la largeur du mail. La partie horizontale s'allonge d'autant et rejoint le retour par son
   arrondi. --cnv-repere-part : la part de la hauteur du mail que longe le retour (0,6 = un peu au-dessus de la
   moitie). Un seul dessin, partout ou l'accolade apparait (conversation, historique, Interne, entree, sortie). */
.cnv-repere-bras--gauche::before{left:calc(-1 * var(--cnv-repere-deborde))}
.cnv-repere-bras--droite::before{right:calc(-1 * var(--cnv-repere-deborde))}
@media (max-width:640px){.cnv-repere{--cnv-repere-deborde:4px}}
/* AU-DESSUS DU MAIL : le trait part de la phrase et DESCEND le long du mail. */
.cnv-repere--dessus .cnv-repere-bras::before{top:0;border-top-width:1px}
.cnv-repere--dessus .cnv-repere-bras--gauche::before{border-left-width:1px;border-top-left-radius:10px}
.cnv-repere--dessus .cnv-repere-bras--droite::before{border-right-width:1px;border-top-right-radius:10px}
/* EN DESSOUS DU MAIL : le trait part de la phrase et MONTE le long du mail. */
.cnv-repere--dessous .cnv-repere-bras::before{bottom:0;border-bottom-width:1px}
.cnv-repere--dessous .cnv-repere-bras--gauche::before{border-left-width:1px;border-bottom-left-radius:10px}
.cnv-repere--dessous .cnv-repere-bras--droite::before{border-right-width:1px;border-bottom-right-radius:10px}
/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 3 — UNE PETITE FLECHE AU BOUT DE CHAQUE BRANCHE ═════════════
   Demande d'Arno (04/10/2026) : « tout reste identique. Ajoute seulement une petite fleche rouge a l'extremite de
   chaque branche (gauche et droite), qui pointe vers le cote de la conversation concerne par le changement. Les
   fleches suivent l'ordre d'affichage : elles s'inversent avec Plus recent d'abord / Plus ancien d'abord. »

   🔴 LES FLECHES NE CONNAISSENT PAS LE TRI, ET C'EST TOUT L'INTERET. Elles pendent des memes variantes --dessus /
   --dessous que le trace, et c'est deja coteDuRepere(ordre) qui decide de ce cote : l'inversion est donc acquise
   PAR CONSTRUCTION. Une seconde regle qui aurait relu l'ordre d'affichage aurait fait une deuxieme verite a tenir,
   et le point 4 de ce meme lot dit assez ce que deux verites coutent (la modale disait le contraire de la liste).

   🔴 LA FLECHE POINTE DANS LE SENS OU LA BRANCHE VA : vers le BAS quand le repere est au-dessus du mail (sa
   branche descend le long de ce mail), vers le HAUT quand il est en dessous. C'est donc toujours le mail concerne
   par le changement qu'elle designe, dans les deux tris, sans cas particulier.

   LE DESSIN : le triangle CSS — une boite de taille nulle, quatre bordures transparentes, une seule coloree. Le
   ::before du bras portant deja le trace de la branche, c'est son ::after qui porte la pointe.

   ⚠️ LA POINTE TOMBE EXACTEMENT AU BOUT DU TRAIT. Un triangle de bordure a son sommet au CENTRE de la boite, pas
   sur son bord : la boite commence donc 5 px (sa demi-taille) avant la mi-hauteur du mail. Sans ce retrait, la
   fleche depassait la branche de 5 px.
   ⚠️ ELLE EST CENTREE SUR LE TRAIT D'1 PX : -4,5 px, soit la demi-largeur du triangle moins la demi-bordure. A
   gauche on compte depuis le bord gauche du bras, a droite depuis son bord droit — d'ou les deux regles.

   ⚠️ ET CE CENTRAGE DEBORDE DE 4,5 PX DE CHAQUE COTE DE LA COLONNE, c'est assume et c'est mesure. Un trait pose
   sur le bord d'une boite ne peut pas porter une pointe SYMETRIQUE sans la depasser d'une demi-largeur : la seule
   autre facon etait de rentrer la fleche de 5 px, et a l'ecran elle se lit alors comme un fanion accroche a cote
   du trait, plus comme une pointe. Mesure sur le fil 3490 (fleche seule, retiree puis remise) : la colonne passe
   de 1232 a 1237 px de contenu, et la PAGE ne defile pas pour autant (scrollWidth = clientWidth = 1512). En
   largeur telephone, le debordement mesure est le MEME avec et sans la fleche : elle n'en ajoute aucun.
   ⚠️ ELLE N'APPARAIT QU'AVEC SA BRANCHE (.cnv-repere--mesure) : voir le commentaire du JSX.
   ⚠️ COULEUR : var(--color-svv-red), le MEME jeton que le trace — lisible en Clair comme en Sombre, jamais une
   couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-repere-bras::after{content:"";position:absolute;width:0;height:0;border:5px solid transparent}
.cnv-repere--mesure.cnv-repere--dessus .cnv-repere-bras::after{top:calc(var(--cnv-repere-h) * var(--cnv-repere-part) - 5px);
  border-top-color:var(--color-svv-red)}
.cnv-repere--mesure.cnv-repere--dessous .cnv-repere-bras::after{bottom:calc(var(--cnv-repere-h) * var(--cnv-repere-part) - 5px);
  border-bottom-color:var(--color-svv-red)}
.cnv-repere-bras--gauche::after{left:calc(-4.5px - var(--cnv-repere-deborde))}
.cnv-repere-bras--droite::after{right:calc(-4.5px - var(--cnv-repere-deborde))}
`;
