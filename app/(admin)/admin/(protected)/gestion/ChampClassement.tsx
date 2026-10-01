'use client';

import { useEffect, useRef, useState } from 'react';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
// 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — « 1 logement + 1 parking » remplace l'adresse dans la case verte.
import { resumeParCategorie } from '../../../../lib/gestion/categorieBien';
// 🔴 LOT CLASSER-AVANT-ENVOI — l'état du bloc et les durées de l'animation : décidés dans un module PUR.
import {
  ANIM_COURBE_ELASTIQUE, ANIM_EFFACER_MS, ANIM_ETENDRE_MS, ANIM_REBOND_MS, ANIM_TOTAL_MS,
  coteDeLaCase, etapesAnimation, etatClassement,
  type EtapeAnimation, type EtatClassement,
} from '../../../../lib/gestion/classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — « CLASSER CE MAIL », EN DEUX GESTES ET TROIS ÉTATS ════════════════════════
 *
 * CE QU'IL Y AVAIT, ET QUE LA DEMANDE REMPLACE : une phrase grise (« Aucun classement — ce message partira à
 * classer ») suivie de deux liens en petit. Trois façons de dire la même chose, aucune qui se voie, et le geste
 * principal — rattacher ce mail à un bien — caché dans un lien de la taille d'une note de bas de page.
 *
 * 🔴 LA DEMANDE D'ARNO, MOT POUR MOT : « deux grandes cases côte à côte, chacune sur la moitié de la largeur, de
 * même hauteur ; à gauche un bouton ROUGE plein “Rattacher”, à droite un bouton BLANC “Interne” ».
 *
 * ═══ LES TROIS ÉTATS, ET CE QUI LES DISTINGUE ═══════════════════════════════════════════════════════════════════
 *
 *   ① RIEN N'EST DÉCIDÉ → les deux cases. 🔴 LOT CLASSER-AVANT-ENVOI : le mail ne part PLUS du tout dans cet
 *      état — « Envoyer » est inactif tant que ce bloc n'est pas une case verte.
 *   ② DES BIENS SONT COCHÉS → UNE case VERTE « Rattaché », avec la liste courte dessous. Un clic la rouvre.
 *   ③ « INTERNE » → UNE case VERTE « Interne ».
 *   ④ 🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION » → UNE case VERTE, HÉRITÉE et jamais choisie ici. Elle
 *      n'apparaît qu'en répondant dans une conversation déjà marquée ainsi (demande d'Arno). Il n'y a pas de
 *      quatrième bouton : on ne propose pas de POSER un état qu'on ne fait que reprendre.
 *
 * 🔴 LES DEUX RÉPONSES S'EXCLUENT, et c'est pour cela qu'il n'y a jamais deux cases vertes : « interne » veut dire
 * qu'il n'y a pas de bien à rattacher. Les afficher ensemble enregistrerait une contradiction.
 *
 * 🔴 « RÉINITIALISER » REVIENT À ① — pas à un quatrième état « annulé ». Rien n'est gardé : ni rattachement, ni
 * « interne ». C'est ce que demande Arno (« comme si rien n'avait été cliqué »), et c'est la seule façon de
 * pouvoir se tromper sans conséquence.
 *
 * ⚠️ LE VERT ET LE ROUGE SONT CEUX DE LA CHARTE, et le MOT porte toujours l'information : « Rattaché », « Interne »
 * se lisent en niveaux de gris comme ils se lisent par un daltonien. La couleur n'est qu'un renfort — règle de
 * tout le module.
 */
export function ChampClassement({
  cibles, interne, horsGestion = false, onRattacher, onInterne, onReinitialiser,
  interneDisponible = true, persistant = true, persistantHorsGestion = true,
  compact = false, titre = 'Classer ce mail',
}: {
  cibles: readonly CibleBrouillon[];
  /** « Interne » a-t-il été choisi pour ce brouillon ? */
  interne: boolean;
  /**
   * 🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION », HÉRITÉ de la conversation. Jamais posé depuis ce bloc : il n'a
   * pas de bouton, seulement une case verte — qu'un clic défait.
   */
  horsGestion?: boolean;
  /**
   * Ouvre la modale « Rattacher ce mail à… ». Absent ⇒ la case rouge est inerte, avec son motif : c'est le cas
   * tant qu'aucun destinataire n'est validé, puisque le moteur n'aurait alors rien à déduire.
   */
  onRattacher?: () => void;
  /** Choisir « Interne ». L'appelant lève les biens : les deux réponses s'excluent. */
  onInterne: () => void;
  /** Revenir à l'état initial — ni biens, ni « interne ». */
  onReinitialiser: () => void;
  /** La migration 281 est-elle là ? Sinon la case « Interne » est inerte, avec son motif. */
  interneDisponible?: boolean;
  /**
   * 🔴 LA MIGRATION 285 EST-ELLE LÀ ? Sinon le choix VIT LE TEMPS DE LA FENÊTRE et ne sera pas retrouvé à la
   * réouverture du brouillon. On le DIT : laisser croire qu'un travail de classement est gardé alors qu'il est
   * perdu est exactement le genre de silence que ce module refuse.
   */
  persistant?: boolean;
  /**
   * 🔴 LA MIGRATION 289 EST-ELLE LÀ ? Même règle, même phrase que `persistant` ci-dessus — mais une sonde à part :
   * les colonnes peuvent diverger si une migration est appliquée à moitié, et l'écran ne doit annoncer que ce
   * qu'il sait. Faux ⇒ l'héritage « Hors gestion » vaut pour cet envoi, sans survivre à la fermeture.
   */
  persistantHorsGestion?: boolean;
  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA VERSION COMPACTE, POUR LE BLOC GRIS D'UN MAIL ═══════════════════
   *
   * Demande d'Arno : « place à l'extrémité DROITE le même composant que dans la fenêtre de rédaction […]
   * Version compacte, à la hauteur du bloc. »
   *
   * 🔴 LE MÊME COMPOSANT, ET NON UN SECOND. Deux implémentations du même geste finiraient par deux
   * comportements — c'est la règle du module, et elle a déjà servi pour « Hors gestion ». Ce qui change ici est
   * une AFFAIRE DE PLACE : cases plus basses, détail sur une ligne, titre et notes retirés (le bloc gris porte
   * déjà son propre titre, et la place manque au-dessus de chaque mail).
   *
   * ⚠️ RIEN N'EST RETIRÉ DE LA FONCTION : les mêmes états, les mêmes gestes, la même animation.
   */
  compact?: boolean;
  /**
   * Le titre au-dessus des cases. Retiré en version compacte (le bloc gris le porte déjà). Changé nulle part
   * ailleurs : un seul mot pour un seul geste.
   */
  titre?: string;
}) {
  const biens = cibles.filter((c) => c.sorte === 'lot');

  const etat = etatClassement({ cibles, interne, horsGestion });

  /**
   * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — L'ANIMATION « D — ÉLASTIQUE », VALIDÉE PAR ARNO ════════════════════════
   *
   * « Clic sur “Interne” : la case blanche s'étend vers la GAUCHE sur toute la largeur et passe au vert.
   *   “Valider” dans la modale : la case rouge s'étend vers la DROITE sur toute la largeur et passe au vert
   *   “Rattaché”. […] la case choisie passe de la moitié à toute la largeur en 300 ms […] l'autre case s'efface
   *   en 180 ms […] puis rebond simple de 260 ms […] Total ≈ 560 ms. »
   *
   * ═══ 🔴 POURQUOI L'ANIMATION SE DÉCLENCHE SUR L'ÉTAT, ET NON SUR LE CLIC ═════════════════════════════════
   *
   * Les deux sens n'arrivent PAS par le même chemin : « Interne » est un bouton DE CE BLOC, « Rattaché » est le
   * résultat d'un « Valider » dans une AUTRE fenêtre. Déclencher au clic aurait demandé un signal venu du
   * parent pour le second cas — donc deux mécanismes pour une animation qu'Arno veut « identique dans les deux
   * sens ». On observe donc le PASSAGE de « rien » à une case verte : il est vrai dans les deux cas, et il n'est
   * vrai qu'une fois.
   *
   * ⚠️ RIEN N'EST ANIMÉ À L'OUVERTURE. Une réponse dans une conversation déjà classée naît verte : la mémoire du
   * dernier état part de l'état COURANT, pas de « rien », et aucune animation ne se joue. Sans cela, chaque
   * ouverture de fenêtre aurait déclenché un mouvement que personne n'a demandé.
   *
   * ⚠️ ELLE NE RETARDE RIEN. « Le choix est enregistré au clic, sans attendre la fin de l'animation » — c'est
   * vrai par construction ici : l'animation RÉAGIT à un état déjà posé par le parent.
   *
   * ⚠️ ET « RÉINITIALISER » EST INSTANTANÉ (demande d'Arno) : le retour à « rien » n'anime rien, et il coupe net
   * une animation en cours.
   *
   * ⚠️ `prefers-reduced-motion` : la feuille de style réduit le mouvement à rien, et l'état final est là
   * immédiatement — exigence transverse du dépôt.
   */
  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — UNE FILE D'ÉTAPES, ET NON UN SEUL ÉTAT ═══════════════
   *
   * Il fallait une FILE parce qu'un passage direct de « Rattaché » à « Interne » en demande DEUX : la scission de
   * l'ancienne case, puis la réunion de la nouvelle (demande d'Arno). Un seul état n'aurait pu en porter qu'une,
   * et le mouvement aurait sauté l'autre.
   *
   * ⚠️ PAS DE DOUBLE ANIMATION QUAND LA LISTE SE RAFRAÎCHIT : `etapesAnimation` rend une liste VIDE quand l'état
   * ne change pas, et on ne touche alors pas à la file. Un parent qui redessine trente fois ne joue rien.
   */
  const [file, setFile] = useState<EtapeAnimation[]>([]);
  const precedent = useRef<EtatClassement>(etat);
  useEffect(() => {
    const avant = precedent.current;
    precedent.current = etat;
    // ⚠️ RIEN À L'OUVERTURE : la mémoire part de l'état COURANT, donc la première comparaison est toujours nulle.
    const etapes = etapesAnimation(avant, etat);
    if (etapes.length > 0) setFile(etapes);
  }, [etat]);

  /** La file se vide d'elle-même, une étape tous les `ANIM_TOTAL_MS`. */
  useEffect(() => {
    if (file.length === 0) return undefined;
    const t = setTimeout(() => setFile((f) => f.slice(1)), ANIM_TOTAL_MS);
    return () => clearTimeout(t);
  }, [file]);

  const etape = file[0] ?? null;
  /** VRAI tant que la case verte n'est pas encore partie : on montre alors les DEUX boutons, en train de naître. */
  const enScission = etape?.geste === 'scission';
  const anime = etape?.geste === 'reunion' ? etape.etat : null;

  /** La case choisie s'étend vers la GAUCHE pour « Interne » (elle était à droite), vers la DROITE sinon. */
  const sens = anime === 'rattache' ? 'droite' : 'gauche';
  /** Ce qui s'efface : l'AUTRE case, celle qu'on n'a pas choisie. Elle garde sa couleur en disparaissant. */
  const fantome = anime === null ? null : anime === 'rattache'
    ? { classe: 'ccl-case--blanche', cote: 'ccl-fantome--droite', mot: 'Interne', detail: 'entre collègues' }
    : { classe: 'ccl-case--rouge', cote: 'ccl-fantome--gauche', mot: 'Rattacher', detail: 'à un logement' };
  const classeAnimee = anime === null ? '' : ` ccl-case--elastique ccl-case--vers-${sens} ccl-depuis-${
    anime === 'rattache' ? 'rouge' : 'blanc'}`;

  /**
   * ══ 🔴🔴 LE MOUVEMENT MIROIR : CE QUE LA SCISSION RENVERSE ═════════════════════════════════════════════════
   *
   * Pendant la scission, la case verte n'est plus dans l'arbre — ce sont les deux boutons qui y sont. On rend
   * donc d'elle un FANTÔME, pleine largeur, qui se rétracte vers sa moitié et reprend sa couleur d'origine ;
   * l'AUTRE bouton, celui que le fantôme découvre, réapparaît en fondu. Les deux reçoivent le rebond final.
   */
  const cote = enScission && etape !== null ? coteDeLaCase(etape.etat) : null;

  const motifRattacher = onRattacher === undefined
    ? 'Ajoutez d’abord un destinataire : les biens se déduisent de lui.'
    : undefined;
  const motifInterne = interneDisponible
    ? undefined
    : 'Mise à jour de la base à appliquer (migration 281) : le statut « Interne » n’est pas encore installé.';

  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE RÉSUMÉ PAR CATÉGORIE, décidé dans le module pur. « 1 logement +
   * 1 parking » remplace l'adresse : au-dessus d'un mail, l'adresse est déjà écrite en entier juste à gauche,
   * et la répéter tronquée dans la case verte la faisait lire deux fois, mal la seconde.
   */
  const resume = resumeParCategorie(biens);

  /** La case verte qui s'en va, telle qu'on la voit pendant la scission : son mot, son détail, et son côté. */
  const vertQuiPart = !enScission || etape === null ? null : {
    cote,
    vers: cote === 'gauche' ? 'rouge' : 'blanc',
    mot: etape.etat === 'rattache' ? 'Rattaché' : etape.etat === 'interne' ? 'Interne' : 'Hors gestion',
    detail: etape.etat === 'rattache' ? resume : etape.etat === 'interne'
      ? 'Échange entre collègues — aucun bien ne sera rattaché.'
      : 'Ce courrier ne concerne aucun bien.',
  };

  return (
    <div className={`ccl${compact ? ' ccl--compact' : ''}`}>
      {!compact && <span className="red-label" id="ccl-label">{titre}</span>}

      {/* ══ ②, ③ ET ④ — UNE SEULE CASE VERTE, ET LE MOT DIT LAQUELLE ════════════════════════════════════════
          🔴 LOT CLASSER-AVANT-ENVOI — LA CASE VIT DANS UN CONTENEUR POSITIONNÉ (`ccl-anim`) : pendant les
          560 ms de l'animation, l'AUTRE case y est rendue en fantôme, à la place exacte qu'elle occupait, et
          s'efface en 180 ms. Sans ce fantôme, « l'autre case s'efface » n'aurait rien à effacer — elle aurait
          déjà disparu du DOM au rendu précédent. */}
      {/* ⚠️ PENDANT LA SCISSION, ON MONTRE LES DEUX BOUTONS MÊME SI L'ÉTAT EST DÉJÀ VERT. C'est le cas du passage
          direct « Rattaché » → « Interne » : l'état d'arrivée est posé, mais le mouvement commence par défaire
          l'ancien. Rendre tout de suite la nouvelle case verte sauterait la moitié du geste. */}
      {etat !== 'rien' && !enScission ? (
        <>
          <div className="ccl-anim">
            {etat === 'rattache' && (
              /* 🔴 CLIQUABLE : « Un clic sur la case verte rouvre la modale avec les choix en cours ». Les deux
                 autres cases vertes n'ont rien à rouvrir : un clic les DÉFAIT (voir plus bas). */
              <button type="button" className={`ccl-case ccl-case--verte ccl-case--pleine${classeAnimee}`}
                onClick={onRattacher} disabled={onRattacher === undefined}
                title="Revoir ou modifier les biens rattachés">
                <span className="ccl-case-mot">Rattaché</span>
                <span className="ccl-case-detail">{resume}</span>
              </button>
            )}
            {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — « INTERNE » ET « HORS GESTION » SONT CLIQUABLES ═══════
                Demande d'Arno : « Clic sur la case verte “Interne” (ou “Hors gestion”) → retour immédiat aux
                deux boutons rouge et blanc, prêts à reclasser. Pour un mail reçu, le statut repasse à
                “À classer” tant qu'un nouveau choix n'est pas fait. »

                🔴 ELLES ÉTAIENT DES PARAGRAPHES (`role="status"`), et c'était juste tant qu'elles ne faisaient
                rien : seul un lien « Réinitialiser » les défaisait. Elles sont des BOUTONS, et depuis le lot
                BLOC-CLASSER-COMPACT elles sont LE SEUL chemin — le lien a été retiré, avec l'accord d'Arno,
                parce que deux portes pour un même geste finissent par ne plus faire la même chose. */}
            {etat === 'interne' && (
              <button type="button"
                className={`ccl-case ccl-case--verte ccl-case--pleine${classeAnimee}`}
                onClick={onReinitialiser} title="Revenir aux deux boutons pour reclasser ce mail">
                <span className="ccl-case-mot">Interne</span>
                <span className="ccl-case-detail">Échange entre collègues — aucun bien ne sera rattaché.</span>
              </button>
            )}
            {etat === 'hors_gestion' && (
              /* 🔴 HÉRITÉ, ET LA CASE LE DIT. On ne laisse pas croire qu'un choix a été fait dans cette
                 fenêtre : il vient de la conversation, et un clic suffit à ne pas le reprendre. */
              <button type="button"
                className={`ccl-case ccl-case--verte ccl-case--pleine${classeAnimee}`}
                onClick={onReinitialiser} title="Revenir aux deux boutons pour reclasser ce mail">
                <span className="ccl-case-mot">Hors gestion</span>
                <span className="ccl-case-detail">Ce courrier ne concerne aucun bien.</span>
              </button>
            )}
            {/* ⚠️ `aria-hidden` ET AUCUNE CIBLE DE CLIC : c'est une image de ce qui vient de disparaître, pas un
                bouton. L'annoncer ferait lire deux fois le même choix à un lecteur d'écran. */}
            {fantome !== null && (
              <span className={`ccl-fantome ${fantome.cote}`} aria-hidden="true">
                <span className={`ccl-case ${fantome.classe} ccl-case--fixe`}>
                  <span className="ccl-case-mot">{fantome.mot}</span>
                  <span className="ccl-case-detail">{fantome.detail}</span>
                </span>
              </span>
            )}
          </div>

          {/* ══ 🔴🔴 LOT BLOC-CLASSER-COMPACT — « RÉINITIALISER » A ÉTÉ RETIRÉ (accord explicite d'Arno) ══════
              CE QU'IL Y AVAIT : un lien « Réinitialiser » sous la case verte, qui défaisait le classement.

              🔴 POURQUOI IL PART : il faisait DOUBLON avec la case elle-même depuis que celle-ci est cliquable.
              « Interne » et « Hors gestion » se défont d'un clic sur la case ; « Rattaché » ouvre la modale, où
              l'on décoche et où « Valider — aucun bien » ramène les deux boutons. Deux chemins pour un même
              geste finissent par ne plus faire la même chose — et celui-ci coûtait une ligne sous CHAQUE mail.

              ⚠️ LE GESTE N'EST PAS PERDU, il a une seule porte : `onReinitialiser` est toujours là, appelé par
              la case verte. C'est la propriété, pas le lien, qui portait la fonction. */}
        </>
      ) : (
        /* ══ ① — LES DEUX CASES, MOITIÉ-MOITIÉ, MÊME HAUTEUR ═════════════════════════════════════════════════ */
        <div className={`ccl-deux${enScission ? ' ccl-deux--scission' : ''}`}>
          {/* ⚠️ `ccl-case--reparait` NE VA QU'À CELUI QUE LE FANTÔME DÉCOUVRE : l'autre est révélé par la
              rétractation elle-même, et le faire aussi apparaître en fondu le ferait clignoter. */}
          <button type="button"
            className={`ccl-case ccl-case--rouge${enScission ? ' ccl-case--rebondit' : ''}${
              cote === 'droite' ? ' ccl-case--reparait' : ''}`}
            onClick={onRattacher} disabled={onRattacher === undefined} title={motifRattacher}>
            <span className="ccl-case-mot">Rattacher</span>
            <span className="ccl-case-detail">à un logement</span>
          </button>
          {/* ⚠️ LE CLIC NE FAIT QU'UNE CHOSE : poser le choix. L'animation se déclenche toute seule, en voyant
              l'état passer de « rien » à une case verte — même mécanisme que « Valider » dans la modale. */}
          <button type="button"
            className={`ccl-case ccl-case--blanche${enScission ? ' ccl-case--rebondit' : ''}${
              cote === 'gauche' ? ' ccl-case--reparait' : ''}`}
            disabled={!interneDisponible} title={motifInterne}
            onClick={onInterne}>
            <span className="ccl-case-mot">Interne</span>
            <span className="ccl-case-detail">entre collègues</span>
          </button>
          {/* ══ 🔴🔴 LE FANTÔME VERT DE LA SCISSION ══════════════════════════════════════════════════════════
              Il est l'image de la case qui s'en va : pleine largeur, il se rétracte vers SA moitié et reprend la
              couleur du bouton qu'il redevient. Comme le fantôme de la réunion, il n'est pas un bouton — il ne
              s'annonce pas, et on ne peut pas le cliquer. */}
          {vertQuiPart !== null && (
            <span className={`ccl-scinde ccl-scinde--${vertQuiPart.cote}`} aria-hidden="true">
              <span className={`ccl-case ccl-case--verte ccl-case--fixe ccl-retracte ccl-vers-${
                vertQuiPart.vers}`}>
                <span className="ccl-case-mot">{vertQuiPart.mot}</span>
                <span className="ccl-case-detail">{vertQuiPart.detail}</span>
              </span>
            </span>
          )}
        </div>
      )}

      {/* ⚠️ LES MOTIFS SE LISENT, ils ne se survolent pas : sur un téléphone, une infobulle n'existe pas.
          🔴 SAUF EN VERSION COMPACTE : ce bloc-ci surplombe CHAQUE mail d'une conversation qui en porte parfois
          trente. Quatre lignes de notes par mail rendraient le fil illisible — et les mêmes phrases sont déjà
          écrites, en entier, dans la fenêtre de rédaction. Les infobulles des boutons, elles, restent. */}
      {!compact && motifRattacher !== undefined && etat === 'rien' && (
        <p className="ccl-note">{motifRattacher}</p>
      )}
      {!compact && motifInterne !== undefined && etat === 'rien' && <p className="ccl-note">{motifInterne}</p>}
      {!compact && !persistant && (
        <p className="ccl-note">
          Mise à jour de la base à appliquer (migration 285) : ce choix vaut pour cet envoi, mais il ne sera pas
          retrouvé si vous fermez la fenêtre.
        </p>
      )}
      {/* 🔴 LA MÊME FRANCHISE POUR L'HÉRITAGE, et seulement quand il sert : annoncer la 289 sur un brouillon qui
          n'a rien hérité ferait chercher un problème là où il n'y en a pas. */}
      {!compact && etat === 'hors_gestion' && !persistantHorsGestion && (
        <p className="ccl-note">
          Mise à jour de la base à appliquer (migration 289) : ce classement vaut pour cet envoi, mais il ne sera
          pas retrouvé si vous fermez la fenêtre, et la marque ne sera pas reportée sur le message envoyé.
        </p>
      )}
      {/* 🔴🔴 LOT CLASSER-AVANT-ENVOI — CE QUI REMPLACE « Sans choix, ce message partira à classer ».
          La phrase d'avant décrivait une CONSÉQUENCE acceptée ; ce n'en est plus une — l'envoi est bloqué. Lui
          laisser dire le contraire aurait été la seule phrase de l'écran à mentir sur ce qui va se passer. */}
      {!compact && etat === 'rien' && (
        <p className="ccl-note">Un mail ne part plus sans classement : choisissez « Rattacher » ou « Interne ».</p>
      )}
    </div>
  );
}

export const CSS_CHAMP_CLASSEMENT = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot). */
.ccl{display:flex;flex-direction:column;gap:6px;min-width:0}

/* ══ LES DEUX CASES : MOITIE-MOITIE, MEME HAUTEUR ══════════════════════════════════════════════════════════════
   1fr 1fr, et non flex:1 — deux libelles de longueurs differentes donneraient deux largeurs differentes.
   align-items:stretch porte la promesse « de meme hauteur » meme si l'un des deux passe sur deux lignes. */
.ccl-deux{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch;min-width:0}

.ccl-case{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  min-height:56px;padding:10px 12px;border-radius:.6rem;font:inherit;text-align:center;cursor:pointer;
  border:1px solid transparent;min-width:0;width:100%;
  transition:background-color .18s ease, color .18s ease, border-color .18s ease}
.ccl-case-mot{font-size:.95rem;font-weight:700;line-height:1.2}
.ccl-case-detail{font-size:.75rem;opacity:.85;overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}

/* Le ROUGE de la charte, plein : c'est le geste principal. */
.ccl-case--rouge{color:#fff;background:var(--color-svv-red);border-color:var(--color-svv-red)}
.ccl-case--rouge:hover:not(:disabled){background:color-mix(in srgb, var(--color-svv-red) 88%, #000)}
/* Le BLANC : bordure fine, texte fonce. En sombre, « blanc » veut dire « la surface de la page ». */
.ccl-case--blanche{color:var(--color-svv-ink);background:var(--color-svv-surface);
  border-color:var(--color-svv-line-strong)}
.ccl-case--blanche:hover:not(:disabled){background:var(--color-svv-field)}
/* Le VERT de la charte. Le jeton « ink » est calcule pour le contraste AA sur le fond « soft », en clair
   comme en sombre : on ne choisit pas une couleur ici, on reprend celle de la charte. */
.ccl-case--verte{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);
  border-color:color-mix(in srgb, var(--color-svv-green-ink) 35%, transparent)}
.ccl-case--pleine{width:100%}
/* La case « Interne » n'est pas un bouton : elle ne doit pas se comporter comme si elle ouvrait quelque chose. */
.ccl-case--fixe{margin:0;cursor:default}

.ccl-case:disabled{opacity:.55;cursor:not-allowed}
.ccl-case:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ══ 🔴🔴 L'ANIMATION « D — ELASTIQUE », VALIDEE PAR ARNO ════════════════════════════════════════════════════
   « la case choisie passe de la moitie a toute la largeur en ${ANIM_ETENDRE_MS} ms, easing
   ${ANIM_COURBE_ELASTIQUE} (leger depassement) ; l'autre case s'efface en ${ANIM_EFFACER_MS} ms ; puis rebond
   simple de ${ANIM_REBOND_MS} ms, ease-out, sur l'echelle : 1 -> 1.04 -> 0.986 -> 1. Total ${ANIM_TOTAL_MS} ms. »

   🔴 LES DUREES VIENNENT DU MODULE PUR, INTERPOLEES ICI. Elles sont ecrites une seule fois : le composant attend
   exactement le temps que la feuille de style consomme, et les deux ne peuvent plus diverger d'une dizaine de
   millisecondes — un ecart qui laisse la case figee dans son etat d'arrivee, une fois sur dix.

   🔴 DEUX JEUX D'IMAGES-CLES, UN PAR SENS, et la difference n'est pas que l'origine : la case choisie PASSE AU
   VERT depuis SA couleur de depart. « Interne » part du blanc, « Rattacher » part du rouge plein. Une seule
   image-cle aurait fait virer le rouge au vert en passant par le blanc, ou l'inverse.

   ⚠️ LA PROPRIETE ABSENTE DU « to » REPREND LA VALEUR DE L'ELEMENT — c'est-a-dire le vert de la case. On ne
   recopie donc pas les jetons verts ici : une seule definition du vert, celle de .ccl-case--verte. */
.ccl-anim{position:relative;min-width:0}

@keyframes ccl-elastique-blanc{
  from{transform:scaleX(.5);background:var(--color-svv-surface);color:var(--color-svv-ink);
    border-color:var(--color-svv-line-strong)}
  to{transform:scaleX(1)}
}
@keyframes ccl-elastique-rouge{
  from{transform:scaleX(.5);background:var(--color-svv-red);color:#fff;border-color:var(--color-svv-red)}
  to{transform:scaleX(1)}
}
/* LE REBOND : simple, sur l'echelle, et il commence quand l'extension finit. */
@keyframes ccl-rebond{
  0%{transform:scale(1)}
  40%{transform:scale(1.04)}
  70%{transform:scale(.986)}
  100%{transform:scale(1)}
}
@keyframes ccl-effacer{ from{opacity:1} to{opacity:0} }

.ccl-case--elastique{animation-duration:${ANIM_ETENDRE_MS}ms, ${ANIM_REBOND_MS}ms;
  animation-timing-function:${ANIM_COURBE_ELASTIQUE}, ease-out;
  animation-delay:0ms, ${ANIM_ETENDRE_MS}ms;animation-fill-mode:both, none}
/* VERS LA GAUCHE = la case etait a DROITE (« Interne ») : elle grandit en restant accrochee a droite. */
.ccl-case--vers-gauche{transform-origin:right center}
.ccl-case--vers-droite{transform-origin:left center}
.ccl-depuis-blanc{animation-name:ccl-elastique-blanc, ccl-rebond}
.ccl-depuis-rouge{animation-name:ccl-elastique-rouge, ccl-rebond}

/* LE FANTOME : l'autre case, a la place exacte qu'elle occupait, le temps de s'effacer. La moitie moins la
   moitie de l'ecart de 8 px de la grille — sans quoi elle serait decalee de 4 px au moment ou on la regarde. */
.ccl-fantome{position:absolute;top:0;bottom:0;width:calc(50% - 4px);pointer-events:none;
  animation:ccl-effacer ${ANIM_EFFACER_MS}ms ease-out forwards}
.ccl-fantome--gauche{left:0}
.ccl-fantome--droite{right:0}
.ccl-fantome>.ccl-case{height:100%}

/* ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — LA SCISSION, MIROIR DE LA REUNION ════════════════════════
   « le vert “Rattache” se retracte vers la moitie GAUCHE et redevient le bouton rouge ; le vert “Interne” se
   retracte vers la moitie DROITE et redevient le bouton blanc ; l'autre bouton reapparait en fondu ; meme courbe,
   memes durees, petit rebond final sur les deux boutons. » (Arno, 01/10/2026)

   🔴 POURQUOI LA RETRACTATION ANIME LA LARGEUR, LA OU L'EXTENSION ANIME L'ECHELLE. La reunion part d'une case qui
   occupe DEJA une moitie de la grille : scaleX(.5)->scaleX(1) la fait grandir exactement a sa place. La scission,
   elle, part de la pleine largeur et doit ATTERRIR sur une moitie de grille — c'est-a-dire calc(50% - 4px), la
   moitie moins la moitie de l'ecart. Un scaleX(.5) l'aurait posee 4 px trop a droite, et ces 4 px de vert se
   seraient vus par-dessus la gouttiere a l'instant precis ou le fantome disparait. La courbe et les durees, elles,
   sont les memes au millieme pres.

   ⚠️ LE FANTOME COUVRE LE BOUTON QU'IL REDEVIENT, et le decouvre en se retractant — c'est ce qui fait que ce
   bouton-la n'a PAS besoin de fondu. Seul l'autre en recoit un. */
.ccl-deux--scission{position:relative}

@keyframes ccl-retracte-rouge{
  from{width:100%}
  to{width:calc(50% - 4px);background:var(--color-svv-red);color:#fff;border-color:var(--color-svv-red)}
}
@keyframes ccl-retracte-blanc{
  from{width:100%}
  to{width:calc(50% - 4px);background:var(--color-svv-surface);color:var(--color-svv-ink);
    border-color:var(--color-svv-line-strong)}
}
@keyframes ccl-reparait{ from{opacity:0} to{opacity:1} }

/* Le fantome vert tient TOUTE la rangee, accroche du cote ou il va se poser. */
.ccl-scinde{position:absolute;top:0;bottom:0;pointer-events:none}
.ccl-scinde--gauche{left:0;right:0}
.ccl-scinde--droite{left:0;right:0;display:flex;justify-content:flex-end}
.ccl-scinde>.ccl-case{height:100%}
.ccl-retracte{animation-duration:${ANIM_ETENDRE_MS}ms;animation-timing-function:${ANIM_COURBE_ELASTIQUE};
  animation-fill-mode:forwards}
.ccl-vers-rouge{animation-name:ccl-retracte-rouge}
.ccl-vers-blanc{animation-name:ccl-retracte-blanc}
/* L'AUTRE bouton : un fondu de la meme duree que l'effacement de la reunion. */
.ccl-case--reparait{animation:ccl-reparait ${ANIM_EFFACER_MS}ms ease-out both}
/* LE REBOND FINAL, SUR LES DEUX BOUTONS : meme image-cle, meme duree, et il commence quand la retractation finit. */
.ccl-case--rebondit{animation:ccl-rebond ${ANIM_REBOND_MS}ms ease-out ${ANIM_ETENDRE_MS}ms}
/* Quand le bouton porte les deux (fondu + rebond), on les enchaine dans la meme declaration. */
.ccl-case--reparait.ccl-case--rebondit{
  animation:ccl-reparait ${ANIM_EFFACER_MS}ms ease-out both,
            ccl-rebond ${ANIM_REBOND_MS}ms ease-out ${ANIM_ETENDRE_MS}ms}

/* EXIGENCE TRANSVERSE DU DEPOT : qui demande moins de mouvement n'en recoit aucun. L'etat final, lui, est la
   immediatement — c'est exactement ce qu'Arno demande (« prefers-reduced-motion : pas d'animation, etat final
   direct »). Les fantomes DISPARAISSENT au lieu de s'effacer : ils n'ont plus rien a raconter. */
@media (prefers-reduced-motion: reduce){
  .ccl-case--elastique{animation:none}
  .ccl-fantome,.ccl-scinde{display:none}
  .ccl-case--reparait,.ccl-case--rebondit,.ccl-case--reparait.ccl-case--rebondit{animation:none;opacity:1}
  .ccl-case{transition:none}
}


/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA VERSION COMPACTE, POUR LE BLOC GRIS D'UN MAIL ══════════════════════
   « Version compacte, a la hauteur du bloc » (Arno). Le bloc gris surplombe CHAQUE mail d'une conversation qui
   en porte parfois trente : la hauteur y coute, et elle coute trente fois.

   🔴 ON NE RETIRE QUE DU VIDE ET DE LA REDONDANCE : le titre (le bloc gris porte deja le sien), les notes (les
   memes phrases sont ecrites en entier dans la fenetre de redaction), et la hauteur des cases. Les MOTS des
   cases, eux, ne bougent pas — c'est la regle du module depuis la premiere capsule.

   ⚠️ LA CIBLE TACTILE RESTE ATTEIGNABLE : 44 px au doigt (pointer:coarse), 38 px a la souris. On gagne sur le
   vide, jamais sur la possibilite de cliquer. */
/* 🔴🔴 LOT BLOC-CLASSER-COMPACT — MÊME LARGEUR DANS LES DEUX ÉTATS, et une hauteur qui suit le bloc.
   « Même largeur pour l'état “deux boutons” et l'état “case verte”, pour qu'il n'y ait pas de saut a
   l'animation » (Arno) : la largeur est portee par le CONTENEUR, jamais par son contenu — c'est ce qui garantit
   qu'une case verte etroite et deux boutons larges occupent exactement la meme place.
   « La hauteur des boutons s'adapte au bloc » : le conteneur s'etire (align-self:stretch, pose par la rangee)
   et les cases remplissent ce qu'il leur donne. */
.ccl--compact{gap:3px;width:clamp(210px, 30%, 320px);flex:0 0 auto;
  display:flex;flex-direction:column;justify-content:center}
/* ⚠️ LA HAUTEUR SUIT LE BLOC, MAIS ELLE EST BORNEE. Mesure a l'ecran : deplie, le bloc passe a 184 px et la
   case verte devenait un pave de 160 px — « s'adapte au bloc » veut dire « epouse les DEUX lignes », pas
   « grandit sans fin ». 72 px couvrent largement les deux lignes (70 px mesures) ; au-dela, le module reste
   centre et garde sa taille. */
.ccl--compact>.ccl-anim,.ccl--compact>.ccl-deux{flex:1 1 auto;max-height:72px}
.ccl--compact .ccl-case{min-height:38px;height:100%;padding:4px 8px;gap:0;border-radius:.5rem}
@media (pointer:coarse){.ccl--compact .ccl-case{min-height:44px}}
.ccl--compact .ccl-case-mot{font-size:.82rem}
.ccl--compact .ccl-case-detail{font-size:.7rem;-webkit-line-clamp:1}
.ccl--compact .ccl-deux{gap:6px}
/* Sous 560 px, le bloc gris s'empile : la version compacte reprend toute la largeur plutot que de s'etrangler. */
@media (max-width:560px){
  .ccl--compact{width:100%}
}
.ccl-note{margin:0;font-size:.78rem;color:var(--color-svv-muted)}

/* Sous 380 px, deux cases cote a cote deviennent illisibles : elles s'empilent, sans rien perdre. */
@media (max-width:380px){
  .ccl-deux{grid-template-columns:1fr}
}
`;
