'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ToucheReact, type FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  descriptifDuBien, descriptifHorsLigne, AUCUN_DETAIL_SUPPLEMENTAIRE, type LigneDescriptif,
} from '../../../../lib/gestion/descriptifBien';
import { placerLaBulle, type PlaceBulle } from '../../../../lib/gestion/placerLaBulle';
import { texteFiche } from '../../../../lib/gestion/ecranUrl';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LA PASTILLE « i », ET CE QU'ELLE OUVRE ══════════════════════════════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « À côté du titre de chaque bien, une petite pastille “i”. Un clic (ou le survol
 * plus Entrée au clavier) ouvre une petite fenêtre flottante ancrée au bien, avec TOUT le descriptif connu du
 * bien […]. Lien “Ouvrir la fiche du bien” dans la fenêtre. Fermeture par la croix, par Échap ou par un clic à
 * l'extérieur. Cliquer la pastille ne coche ni ne décoche le bien. »
 *
 * ═══ 🔴🔴 LOT BULLE-INFO-ET-S12 — LES DEUX DÉFAUTS QU'ARNO A VUS À L'ÉCRAN, ET CE QUI LES CORRIGE ════════════════
 *
 * (a) « Dans la modale, la bulle est COUPÉE par le bord de son bloc. » Elle était posée en `position:absolute`
 *     dans le libellé de la case à cocher : tout conteneur à `overflow` la rognait, et la modale en a plusieurs.
 *     → ELLE PASSE MAINTENANT PAR UN PORTAIL vers `document.body`, en `position:fixed`, et c'est le module pur
 *       `placerLaBulle` qui choisit son côté pour qu'elle reste ENTIÈREMENT visible.
 *
 * (b) « Dès que la souris quitte le picto, la bulle se ferme, donc le lien “Ouvrir la fiche du bien” est
 *     INATTEIGNABLE. » C'était la conséquence directe du portail à venir — et déjà du fait que le picto et la
 *     bulle sont deux endroits, séparés par un écart de quelques pixels.
 *     → LA BULLE RESTE OUVERTE tant que la souris est sur le PICTO **OU** sur la BULLE, avec un DÉLAI DE GRÂCE de
 *       200 ms qui couvre la traversée de l'écart. Elle se ferme en sortant des deux, avec Échap, ou par un clic
 *       ailleurs.
 *
 * ⚠️ UN PORTAIL CHANGE DEUX RAISONNEMENTS, et les oublier ferait une bulle inutilisable :
 *   ① « le clic est-il à l'extérieur ? » ne peut plus se tester sur la seule racine — la bulle n'y est plus. On
 *      interroge donc les DEUX éléments (voir `dedans`) ;
 *   ② la TABULATION ne descend plus naturellement du picto vers la bulle, puisqu'ils sont à deux endroits du
 *      document. On la conduit à la main (voir `auClavierDuPicto`), sans quoi le lien serait atteignable à la
 *      souris et perdu au clavier — exactement le défaut (b), déplacé.
 *
 * ⚠️ LA FENÊTRE NE CHARGE QU'À L'OUVERTURE. Une modale montre parfois quarante biens : charger quarante fiches
 * pour des pastilles que personne n'ouvrira ferait quarante requêtes à chaque recherche.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : `FicheLot` passe par `import type`, effacé à la compilation.
 */

/**
 * 🔴 LE COURT DÉLAI DU SURVOL, demandé par Arno : « environ 150 ms ». Il n'est pas un confort — il est ce qui
 * empêche une traversée de liste d'ouvrir (et de CHARGER) quarante fenêtres au passage de la souris.
 */
export const DELAI_SURVOL_MS = 150;
/**
 * 🔴 LE DÉLAI DE GRÂCE, demandé par Arno : « ~200 ms ». C'est le temps laissé à la souris pour franchir les 8 px
 * qui séparent le picto de la bulle. Sans lui, le lien « Ouvrir la fiche du bien » est inatteignable : la bulle se
 * referme pendant le trajet. C'est le défaut (b) de l'encadré ci-dessus, et ce nombre est son correctif.
 */
export const DELAI_GRACE_MS = 200;

/**
 * 🔴🔴 UNE SEULE BULLE OUVERTE À LA FOIS (demande d'Arno), et c'est un registre de MODULE, non un état React.
 *
 * Deux pastilles ne partagent aucun parent commun qu'on puisse faire porter cet état : elles vivent dans des
 * lignes différentes, parfois dans des écrans différents. Le registre est donc la seule place honnête — et il reste
 * minuscule : une fonction de fermeture, remplacée à chaque ouverture.
 */
let fermerLaBulleOuverte: (() => void) | null = null;

/**
 * 🔴🔴 OÙ LE PORTAIL POSE LA BULLE — ET POURQUOI PAS `document.body`.
 *
 * MESURÉ À L'ÉCRAN LE 01/10/2026, EN THÈME SOMBRE : la bulle sortait BLANCHE sur une application noire. Les jetons
 * de couleur de l'administration ne sont pas définis sur `:root` mais sur `.svv-adm-root[data-theme=…]`
 * (`globals.css`) — c'est un choix du dépôt, pour que le thème ne déborde jamais sur le site public. Une bulle
 * posée dans `document.body` tombe DEHORS de cette portée et retombe sur les valeurs claires par défaut.
 *
 * ⚠️ `.svv-adm-root` EST UN ENFANT DIRECT DU CORPS, sans `transform`, `filter` ni `contain` (vérifié) : un
 * `position:fixed` s'y repère donc toujours sur la fenêtre, et rien n'y rogne la bulle. Le repli sur `body` reste,
 * pour un écran futur qui n'aurait pas cette racine : mieux vaut une bulle mal colorée qu'aucune bulle.
 */
export function hoteDeLaBulle(): HTMLElement {
  return document.querySelector<HTMLElement>('.svv-adm-root') ?? document.body;
}

export function InfoBien({ cle, titre, surLaLigne }: {
  /** La clé WIPPIMMO du lot. C'est tout ce que les écrans de rattachement connaissent du bien. */
  cle: string;
  /** Le titre affiché à côté, repris dans l'en-tête de la fenêtre : on doit savoir de quel bien on parle. */
  titre: string;
  /**
   * 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — TOUT CE QUI EST DÉJÀ VISIBLE À CÔTÉ DE LA PASTILLE : le titre, et les
   * parties écrites dessous. La fenêtre n'en répète rien (voir `descriptifHorsLigne`).
   *
   * ⚠️ ABSENT ⇒ ON NE RETIRE RIEN. Un écran qui ne dit pas ce qu'il affiche ne doit pas faire disparaître une
   * information : le doute profite à ce qui se voit.
   */
  surLaLigne?: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<
    { v: 'repos' } | { v: 'charge' } | { v: 'ok'; fiche: FicheLot } | { v: 'erreur'; message: string }
  >({ v: 'repos' });
  /** La place calculée. `null` = pas encore mesurée : la bulle est alors rendue INVISIBLE (voir `useLayoutEffect`). */
  const [place, setPlace] = useState<PlaceBulle | null>(null);

  const racine = useRef<HTMLSpanElement | null>(null);
  const picto = useRef<HTMLButtonElement | null>(null);
  const bulle = useRef<HTMLDivElement | null>(null);
  /** Le compte à rebours du survol (ouverture) et celui de la grâce (fermeture). Deux `ref` : ils ne redessinent rien. */
  const delai = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ⚠️ AU TOUCHER, IL N'Y A PAS DE SURVOL — mais le navigateur en SIMULE un. Sur un écran tactile, un appui émet
   * `pointerdown`, puis `mouseenter`, puis `click` : sans ce drapeau, le `mouseenter` armerait une ouverture au
   * survol qui se battrait avec l'appui. Un appui doit faire UNE chose.
   */
  const auToucher = useRef(false);
  /**
   * ⚠️ MA PROPRE FONCTION DE FERMETURE, GARDÉE : c'est elle qu'on compare au registre. Sans cette comparaison,
   * fermer une bulle effacerait le registre d'une AUTRE qui vient de s'ouvrir, et deux bulles pourraient coexister.
   */
  const monFermeur = useRef<(() => void) | null>(null);
  /**
   * 🔴🔴 LE REFUS D'OUVRIR AU FOCUS QUI SUIT UNE FERMETURE VOULUE — et sans lui, « Échap » ne ferme rien.
   *
   * MESURÉ À L'ESSAI : Échap (comme la croix) rend le focus au picto, pour ne pas perdre sa place au clavier. Or le
   * focus du picto OUVRE la bulle. Fermer la rouvrait donc dans la même image, et la bulle paraissait indestructible.
   * Ce drapeau fait sauter exactement UNE ouverture au focus ; la sortie du picto le remet à zéro, donc une
   * tabulation ultérieure ouvre comme elle doit.
   */
  const refuserLeFocus = useRef(false);

  const annuler = useCallback((): void => {
    if (delai.current !== null) { clearTimeout(delai.current); delai.current = null; }
    if (grace.current !== null) { clearTimeout(grace.current); grace.current = null; }
  }, []);

  /** Fermer, puis rendre le focus au picto SANS rouvrir (voir `refuserLeFocus`). */
  const fermerEtRendreLeFocus = useCallback((fermeture: () => void): void => {
    refuserLeFocus.current = true;
    fermeture();
    picto.current?.focus();
  }, []);

  const fermer = useCallback((): void => {
    annuler();
    setOuvert(false);
    setPlace(null);
    if (fermerLaBulleOuverte === monFermeur.current) fermerLaBulleOuverte = null;
  }, [annuler]);

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/annuaire?lotCle=${encodeURIComponent(cle)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: FicheLot };
      if (d.etat !== 'ok' || d.data === undefined) {
        setEtat({ v: 'erreur', message: 'La fiche de ce bien n’a pas pu être lue.' });
        return;
      }
      setEtat({ v: 'ok', fiche: d.data });
    } catch {
      setEtat({ v: 'erreur', message: 'La fiche de ce bien n’a pas pu être lue.' });
    }
  }, [cle]);

  /**
   * 🔴 OUVRIR FERME CELLE D'AVANT : c'est tout le registre « une seule bulle à la fois ».
   *
   * 🔴🔴 ET OUVRIR CE QUI EST DÉJÀ OUVERT NE FAIT RIEN — mesuré au navigateur le 01/10/2026, c'est ce qui rendait
   * le lien inactivable. Sans cette sortie, un second appel remettait `place` à `null` : la bulle repartait une
   * image dans le coin de l'écran pour être remesurée, et le relâchement de la souris tombait dans le vide. Le
   * clic n'activait alors plus le lien, il atteignait le voile de la modale.
   */
  const ouvrir = useCallback((): void => {
    annuler();
    if (ouvert) return;
    if (fermerLaBulleOuverte !== null) fermerLaBulleOuverte();
    monFermeur.current = () => { setOuvert(false); setPlace(null); };
    fermerLaBulleOuverte = monFermeur.current;
    setOuvert(true);
    if (etat.v === 'repos') void charger();
  }, [annuler, charger, etat.v, ouvert]);

  // ⚠️ UN COMPTE À REBOURS QUI SURVIT AU COMPOSANT OUVRIRAIT UNE BULLE DÉMONTÉE : on les coupe au démontage.
  useEffect(() => annuler, [annuler]);

  /**
   * ══ 🔴🔴 LA MESURE, PUIS LA PLACE ═══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ `useLayoutEffect` ET NON `useEffect` : la bulle est dessinée une image AVANT d'être placée (le temps de la
   * mesurer). Avec un effet ordinaire, cette image serait PEINTE — on verrait la bulle sauter du coin de l'écran
   * jusqu'à sa place. En effet de disposition, le navigateur n'a encore rien peint.
   *
   * 🔴 ELLE SE RECALCULE AU DÉFILEMENT ET AU REDIMENSIONNEMENT, parce qu'Arno demande une bulle « rattachée à son
   * picto au défilement ». En `position:fixed`, c'est le seul moyen : le point de référence, lui, bouge.
   *
   * ⚠️ L'ÉCOUTE DU DÉFILEMENT EST EN CAPTURE : un défilement se produit dans un conteneur intérieur (la liste de
   * la modale), et ces événements NE REMONTENT PAS jusqu'au document. En phase de bulle, on ne verrait rien bouger.
   */
  useLayoutEffect(() => {
    if (!ouvert) return undefined;
    const mesurer = (): void => {
      const p = picto.current?.getBoundingClientRect();
      const b = bulle.current?.getBoundingClientRect();
      if (p === undefined || b === undefined) return;
      setPlace(placerLaBulle({
        picto: { gauche: p.left, haut: p.top, largeur: p.width, hauteur: p.height },
        // ⚠️ LA HAUTEUR NATURELLE, et non celle déjà bornée par `max-height` : sinon la bulle, une fois réduite,
        //   se croirait à l'aise et reprendrait sa place du dessus à l'image suivante (oscillation).
        bulle: { largeur: b.width, hauteur: bulle.current?.scrollHeight ?? b.height },
        fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
      }));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    document.addEventListener('scroll', mesurer, true);
    return () => {
      window.removeEventListener('resize', mesurer);
      document.removeEventListener('scroll', mesurer, true);
    };
    // ⚠️ `etat` EST DANS LES DÉPENDANCES : la bulle grandit quand la fiche arrive, et sa place doit suivre.
  }, [ouvert, etat]);

  /** Le geste est-il DANS la pastille ou DANS la bulle ? Les deux comptent — elles ne sont plus au même endroit. */
  const dedans = useCallback((n: Node | null): boolean =>
    n !== null && ((racine.current?.contains(n) ?? false) || (bulle.current?.contains(n) ?? false)), []);

  /**
   * ══ 🔴 LES TROIS SORTIES D'ARNO : la croix, « Échap », et un clic à l'extérieur ═══════════════════════════
   *
   * ⚠️ `mousedown` ET NON `click` POUR L'EXTÉRIEUR : au `click`, le navigateur a déjà activé ce qui se trouvait
   * sous le doigt — une case à cocher, par exemple. En écoutant l'enfoncement, la fenêtre se referme avant.
   *
   * ⚠️ EN PHASE DE CAPTURE : la modale de rattachement arrête certains événements sur son propre voile ; un
   * écouteur en phase de bulle ne les verrait jamais, et la fenêtre resterait ouverte.
   *
   * 🔴 ÉCHAP REND LE FOCUS AU PICTO. Fermer en laissant le focus dans un élément qu'on vient de retirer du
   * document renverrait la tabulation au début de la page — au clavier, on aurait perdu sa place.
   */
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e: MouseEvent): void => { if (!dedans(e.target as Node)) fermer(); };
    const echap = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fermerEtRendreLeFocus(fermer);
    };
    document.addEventListener('mousedown', dehors, true);
    /**
     * ⚠️ ET LE `click` AUSSI, EN PLUS DU `mousedown`. Un geste qui n'émet pas d'enfoncement — une activation au
     * clavier, un clic simulé, un appui au doigt — laisserait sinon DEUX fenêtres ouvertes en même temps.
     */
    document.addEventListener('click', dehors, true);
    document.addEventListener('keydown', echap, true);
    return () => {
      document.removeEventListener('mousedown', dehors, true);
      document.removeEventListener('click', dehors, true);
      document.removeEventListener('keydown', echap, true);
    };
  }, [ouvert, dedans, fermer, fermerEtRendreLeFocus]);

  /* ══ 🔴🔴 « CLIQUER LA PASTILLE NE COCHE NI NE DÉCOCHE LE BIEN » — LE POINT DÉLICAT ════════════════════════════
     La pastille vit DANS le libellé d'une case à cocher. Or un clic sur un `<label>` coche la case qu'il désigne :
     c'est le comportement du navigateur, pas une option. Sans précaution, consulter un descriptif aurait coché le
     bien — l'exact contraire de ce qu'Arno demande, et une erreur qu'on ne remarquerait qu'après avoir validé.

     🔴 ON ARRÊTE DONC L'ÉVÉNEMENT AUX DEUX ENDROITS, et il en faut deux :
       ① `onMouseDown` avec `preventDefault` — certains navigateurs activent le label dès l'enfoncement, et le
          `click` arriverait trop tard pour l'empêcher. C'est la même précaution que la liste de suggestions
          d'adresses du lot REDACTION (correctif du 24/09/2026), et pour exactement la même raison ;
       ② `preventDefault` + `stopPropagation` sur le CLIC — pour que rien ne remonte au label ni à la ligne.

     🔴 ET SEUL LE CLIC BASCULE. L'enfoncement se contente d'empêcher : faire basculer les DEUX reviendrait à
     basculer deux fois par clic de souris (enfoncement puis clic), c'est-à-dire à ne rien faire du tout. */

  const retenir = (e: { preventDefault: () => void; stopPropagation: () => void }): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  const basculer = (e: { preventDefault: () => void; stopPropagation: () => void }): void => {
    retenir(e);
    // ⚠️ MÊME GARDE AU CLIC : un navigateur qui donne le focus au bouton malgré `preventDefault` rouvrirait sinon.
    if (ouvert) { refuserLeFocus.current = true; fermer(); } else ouvrir();
  };

  /* ══ 🔴🔴 LE SURVOL, ET LE DÉLAI DE GRÂCE ══════════════════════════════════════════════════════════════════════
     DEMANDE D'ARNO : « Ouverture au survol (~150 ms) ; RESTE OUVERTE tant que la souris est sur le picto OU sur la
     bulle (délai de grâce ~200 ms) ; se ferme en sortant de la bulle, avec Échap, ou par un clic ailleurs. »

     ⚠️ LA FERMETURE EST TOUJOURS DIFFÉRÉE, et l'entrée dans l'un des deux éléments l'annule. C'est ce qui remplace
     l'ancien `onMouseLeave` de la racine : avec un portail, il n'y a plus de racine commune à surveiller. */

  const ouvrirApresDelai = (): void => {
    if (auToucher.current) return;   // au doigt, c'est l'appui qui décide — pas le survol simulé
    annuler();
    delai.current = setTimeout(ouvrir, DELAI_SURVOL_MS);
  };

  const fermerApresGrace = (): void => {
    annuler();
    grace.current = setTimeout(fermer, DELAI_GRACE_MS);
  };

  /** Entrer dans la bulle annule la fermeture en cours : c'est elle qui rend le lien atteignable. */
  const resterOuverte = (): void => { annuler(); };

  /**
   * 🔴 LE FOCUS CLAVIER OUVRE SANS DÉLAI. Un délai au clavier n'aurait aucun sens : on ne « traverse » pas une
   * liste à la tabulation, on s'arrête sur un élément.
   */
  const auFocus = (e: FocusEvent<HTMLElement>): void => {
    /**
     * 🔴🔴 UN FOCUS QUI ARRIVE DANS LA BULLE N'EST PAS UN FOCUS SUR LE PICTO — et le distinguer est obligatoire.
     *
     * Les événements de focus TRAVERSENT LE PORTAIL : React les fait remonter par l'arbre des composants, pas par
     * celui du document. Cliquer le lien de la bulle donnait donc le focus au lien, qui remontait jusqu'ici comme
     * si l'on venait d'atteindre le picto — et rouvrait une bulle déjà ouverte. Mesuré au navigateur : c'est ce
     * qui empêchait le lien « Ouvrir la fiche du bien » de s'ouvrir.
     */
    if (bulle.current?.contains(e.target) === true) return;
    if (refuserLeFocus.current) { refuserLeFocus.current = false; return; }
    ouvrir();
  };

  /**
   * 🔴🔴 LA TABULATION DU PICTO VERS LA BULLE, CONDUITE À LA MAIN. Le portail a déplacé la bulle en fin de
   * document : la tabulation naturelle irait au champ suivant de la modale, et le lien « Ouvrir la fiche du bien »
   * serait perdu au clavier. On l'y envoie donc, et Maj+Tab depuis la bulle revient au picto (voir `auClavierBulle`).
   */
  const auClavierDuPicto = (e: ToucheReact<HTMLButtonElement>): void => {
    if (e.key !== 'Tab' || e.shiftKey || !ouvert) return;
    const premier = bulle.current?.querySelector<HTMLElement>('a[href], button');
    if (premier === null || premier === undefined) return;
    e.preventDefault();
    premier.focus();
  };

  /** Maj+Tab depuis le premier élément de la bulle revient au picto : la boucle reste fermée, on ne se perd pas. */
  const auClavierBulle = (e: ToucheReact<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const focusables = [...(bulle.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])];
    const actif = document.activeElement as HTMLElement | null;
    if (e.shiftKey && actif === focusables[0]) { e.preventDefault(); picto.current?.focus(); return; }
    if (!e.shiftKey && actif === focusables[focusables.length - 1]) { e.preventDefault(); picto.current?.focus(); }
  };

  const fiche = etat.v === 'ok' ? etat.fiche : null;
  const lignes: LigneDescriptif[] = fiche === null ? [] : descriptifDuBien({
    cle: fiche.numero,
    nature: fiche.nature, typeBien: fiche.typeBien, immeuble: fiche.immeuble,
    adresse: fiche.adresse, codePostal: fiche.codePostal, commune: fiche.commune,
    gestionDebut: fiche.debut, gestionFin: fiche.fin,
    // ⚠️ `surfaceM2` EST TOUJOURS `null` EN BASE (aucune colonne de surface n'existe) : la ligne ne s'affiche
    //   donc jamais aujourd'hui, et s'affichera d'elle-même le jour où l'import la portera.
    surface: fiche.surfaceM2 === null ? null : `${fiche.surfaceM2} m²`,
    proprietaires: fiche.proprietaires.length > 0
      ? fiche.proprietaires.map((p) => p.nom)
      : [fiche.proprietaireNom],
    // 🔴 LES OCCUPANTS EN PLACE, c'est-à-dire ceux dont l'occupation n'a pas de date de sortie. L'historique
    //   complet est dans la fiche du bien — cette fenêtre dit QUI EST LÀ, pas qui est passé.
    occupants: fiche.occupations.filter((o) => (o.sortie ?? '') === '')
      .map((o) => ({ nom: o.nom, depuis: o.entree })),
    driveDossierId: fiche.driveDossierId,
  });

  /** 🔴 CE QUI N'EST PAS DÉJÀ SOUS LES YEUX — et rien d'autre (demande d'Arno, point 3). */
  const horsLigne = descriptifHorsLigne(lignes, surLaLigne ?? null);

  const contenuBulle = (
    <div className="ifb-bulle" role="dialog" aria-label={`Descriptif — ${titre}`} ref={bulle}
      data-cote={place?.cote ?? 'mesure'}
      style={place === null
        // ⚠️ L'IMAGE DE MESURE : rendue hors écran et INVISIBLE, jamais `display:none` — un élément masqué ainsi
        //   n'a aucune dimension, et il n'y aurait rien à mesurer.
        ? { visibility: 'hidden', left: 0, top: 0 }
        : { left: `${place.gauche}px`, top: `${place.haut}px`, maxHeight: `${place.hauteurMax}px` }}
      onMouseEnter={resterOuverte} onMouseLeave={fermerApresGrace}
      onKeyDown={auClavierBulle}
      // ⚠️ UN CLIC DANS LA BULLE NE DOIT PAS REMONTER : elle flotte au-dessus de la modale, mais le clic, lui,
      //   suit l'arbre du document — et le lien ne doit rien cocher au passage.
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="ifb-tete">
        <span className="ifb-titre">{titre}</span>
        <button type="button" className="ifb-croix" aria-label="Fermer le descriptif"
          onMouseDown={retenir}
          onClick={(e) => { retenir(e); fermerEtRendreLeFocus(fermer); }}>
          ×
        </button>
      </div>

      {etat.v === 'charge' && <span className="ifb-note" role="status">Lecture de la fiche…</span>}
      {etat.v === 'erreur' && <span className="ifb-note" role="alert">{etat.message}</span>}

      {fiche !== null && (
        <>
          <dl className="ifb-liste">
            {horsLigne.map((l) => (
              <div className="ifb-ligne" key={`${l.libelle}-${l.valeur}`}>
                <dt className="ifb-libelle">{l.libelle}</dt>
                <dd className="ifb-valeur">{l.valeur}</dd>
              </div>
            ))}
          </dl>
          {/* 🔴 « S'il ne reste rien : “Aucun détail supplémentaire — compléter la fiche du bien”, avec le
              lien » (Arno). Le lien est juste dessous, et il reste affiché dans tous les cas. */}
          {horsLigne.length === 0 && <span className="ifb-note">{AUCUN_DETAIL_SUPPLEMENTAIRE}</span>}
          {/* ⚠️ UN VRAI LIEN, dans un nouvel onglet : on consulte une fiche sans perdre le classement en
              cours. Un bouton qui NAVIGUERAIT ferait refermer la modale et oublier les cases cochées. */}
          <a className="ifb-fiche" target="_blank" rel="noreferrer"
            href={`/admin/gestion?ecran=annuaire&fiche=${encodeURIComponent(
              texteFiche({ sorte: 'lot', id: fiche.id }))}`}>
            Ouvrir la fiche du bien
          </a>
        </>
      )}
    </div>
  );

  return (
    <span className="ifb" ref={racine}
      onMouseEnter={ouvrirApresDelai} onMouseLeave={fermerApresGrace}
      /* ⚠️ `onBlur` SUR LA RACINE, pas sur le bouton : passer du picto au lien de la bulle ne doit pas refermer ce
         qu'on vient d'ouvrir. React fait remonter `blur` (c'est `focusout`), donc la racine le voit — et comme la
         bulle est dans un portail, c'est `dedans` qui tranche, pas `currentTarget.contains`. */
      onFocus={auFocus}
      onBlur={(e) => {
        // ⚠️ LA SORTIE REMET LE DRAPEAU À ZÉRO : sans cela, la tabulation suivante n'ouvrirait plus rien.
        refuserLeFocus.current = false;
        if (!dedans(e.relatedTarget as Node | null)) fermerApresGrace();
      }}>
      {/* 🔴 LA FEUILLE DE STYLE N'EST PAS MONTÉE ICI, ET C'EST VOULU. La pastille vit DANS le libellé d'une case
          à cocher : un élément `style` à cet endroit entre dans le `textContent` du titre — mesuré, une épreuve
          y lisait le texte de la feuille collé au nom du bien. L'écran qui emploie la pastille monte
          `CSS_INFO_BIEN`, comme il monte déjà les autres feuilles du module. */}
      {/* ⚠️ `type="button"` : dans un formulaire, un bouton sans type SOUMET — et la modale se refermerait.
          🔴 PLUS D'ATTRIBUT `title` (demande d'Arno) : l'infobulle du navigateur se SUPERPOSAIT à la bulle, en
          doublant son nom. L'`aria-label` dit la même chose aux lecteurs d'écran, sans rien dessiner. */}
      <button type="button" className="ifb-pastille" ref={picto} aria-expanded={ouvert}
        aria-label={`Descriptif du bien — ${titre}`}
        onPointerDown={(e) => { auToucher.current = e.pointerType !== 'mouse'; }}
        onMouseDown={retenir} onClick={basculer} onKeyDown={auClavierDuPicto}>
        <span aria-hidden="true">i</span>
      </button>

      {/* 🔴🔴 LE PORTAIL : la bulle naît hors de sa ligne, AU-DESSUS de tout, et aucun conteneur à `overflow` ne
          peut plus la couper. Sans `document` (rendu serveur), on ne rend rien : la bulle n'existe que sur un
          geste de l'utilisateur, donc jamais au premier rendu. */}
      {ouvert && typeof document !== 'undefined' && createPortal(contenuBulle, hoteDeLaBulle())}
    </span>
  );
}

export const CSS_INFO_BIEN = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot).

   ══ 🔴 LA PASTILLE « i » ════════════════════════════════════════════════════════════════════════════════════════
   Petite, discrete, et pourtant atteignable : 18 px a l'oeil, 20 px de cible reelle, 28 px au doigt. Elle vit
   dans le libelle d'une case a cocher, donc en ligne avec le texte, jamais au-dessus. */
.ifb{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}
.ifb-pastille{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;
  margin:0 0 0 .3rem;font:inherit;font-size:.68rem;font-weight:700;font-style:italic;line-height:1;
  color:var(--color-svv-muted);background:transparent;border:1px solid var(--color-svv-line-strong);
  border-radius:50%;cursor:pointer;flex:0 0 auto}
.ifb-pastille:hover{color:var(--color-svv-ink);border-color:var(--color-svv-ink)}
.ifb-pastille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (pointer:coarse){.ifb-pastille{width:24px;height:24px;font-size:.78rem}}

/* ══ 🔴🔴 LA BULLE : AU-DESSUS DE TOUT, JAMAIS COUPEE ════════════════════════════════════════════════════════════
   Elle est rendue par un PORTAIL dans le corps du document, donc en coordonnees de FENETRE : d'ou "fixed", et
   d'ou le fait qu'aucun conteneur a "overflow" ne peut plus la rogner. Sa place (left/top) est calculee par le
   module pur "placerLaBulle" et posee en style en ligne — jamais en CSS, puisqu'elle depend de la mesure.

   ⚠️ z-index 2000 : au-dessus du voile de la modale de rattachement (80) ET de tout ce que les ecrans empilent.
      Dans le corps du document, elle n'herite plus du contexte d'empilement de la modale : il faut le dire ici. */
.ifb-bulle{position:fixed;z-index:2000;
  display:flex;flex-direction:column;gap:.3rem;width:min(320px, calc(100vw - 16px));overflow-y:auto;
  padding:10px 12px;font:inherit;font-size:.8rem;font-weight:400;font-style:normal;text-align:left;line-height:1.4;
  color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;box-shadow:0 10px 30px rgba(0,0,0,.22);
  cursor:default;white-space:normal;overscroll-behavior:contain}
.ifb-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem}
.ifb-titre{font-weight:700;overflow-wrap:anywhere}
.ifb-croix{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0;
  font:inherit;font-size:1.1rem;line-height:1;color:var(--color-svv-muted);background:transparent;border:0;
  border-radius:50%;cursor:pointer;flex:0 0 auto}
.ifb-croix:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.ifb-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

/* LE DESCRIPTIF : un libelle gris, une valeur foncee — la hierarchie se lit sans couleur supplementaire. */
.ifb-liste{display:flex;flex-direction:column;gap:2px;margin:0;padding:0}
.ifb-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;min-width:0}
.ifb-libelle{margin:0;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.ifb-valeur{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
.ifb-note{font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}
.ifb-fiche{align-self:flex-start;margin-top:.2rem;font-size:.78rem;font-weight:600;color:var(--color-svv-red);
  text-decoration:underline;text-underline-offset:3px}
`;
