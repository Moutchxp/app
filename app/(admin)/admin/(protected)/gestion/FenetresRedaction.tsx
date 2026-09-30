'use client';

import { useState } from 'react';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import {
  celleEnPlein, changerEtat, decalageDepuisLaDroite, fermer as fermerFenetre, ouvrir,
  type EtatFenetre, type FenetreRedaction,
} from '../../../../lib/gestion/fenetresRedaction';
import type { Rapport } from './gestesMail';

/**
 * LOT REDACTION-GMAIL — LES FENÊTRES FLOTTANTES DE RÉDACTION, ANCRÉES EN BAS À DROITE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI UNE FENÊTRE, ET PAS UN ÉCRAN. Écrire un message ne doit pas faire perdre ce qu'on regardait : on
 * répond souvent EN LISANT autre chose — une fiche, une autre conversation, la liste. C'est ce que fait Gmail, et
 * c'est la demande d'Arno. La liste reste derrière, vivante et défilable.
 *
 * 🔴 DEUX AU PLUS, CÔTE À CÔTE. Une fenêtre ouverte est un message NON ENVOYÉ ; au-delà de deux on en oublie une
 * derrière l'autre. Superposées, la seconde masquerait la première — elles sont donc décalées, chacune visible.
 * La règle (combien, où, quoi refuser) vit dans un module PUR, éprouvé sans écran : `fenetresRedaction.ts`.
 *
 * 🔴 TROIS ÉTATS, ET LE BROUILLON VIT DANS LES TROIS :
 *   · OUVERTE — ancrée en bas à droite ;
 *   · RÉDUITE — repliée sur sa barre de titre. Elle COMPTE toujours dans la limite de deux : ne pas la compter
 *     permettrait d'en réduire deux, d'en ouvrir deux autres, et de perdre les premières de vue ;
 *   · PLEIN ÉCRAN — centrée sur fond assombri, pour un long message. Une seule à la fois : deux voiles empilés
 *     rendraient la fenêtre du dessous inatteignable au clavier.
 *
 * ⚠️ LE COMPOSANT `Redaction` N'EST PAS DUPLIQUÉ : c'est le MÊME éditeur, avec la même barre d'outils, les mêmes
 * pièces jointes, le même compte à rebours d'annulation et le même enregistrement automatique. Cette fenêtre ne
 * fait que l'encadrer. Un second éditeur « pour les fenêtres » aurait divergé du premier au premier correctif.
 *
 * ⚠️ IL N'EST JAMAIS DÉMONTÉ QUAND ON RÉDUIT : on le CACHE (`hidden`). Le démonter perdrait l'état en cours —
 * texte non encore enregistré, pièce en cours de dépôt, compte à rebours d'envoi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un brouillon et la fenêtre qui le porte. La clé est celle de la fenêtre : stable tant qu'elle vit. */
export interface FenetreAvecBrouillon {
  cle: string;
  brouillon: BrouillonEcran;
}

export function FenetresRedaction({
  fenetres, brouillons, contexte, fermetures, onChange, onFermer, onDemanderFermeture, onGeste, onEnvoye, onEtat,
}: {
  fenetres: readonly FenetreRedaction[];
  brouillons: ReadonlyMap<string, BrouillonEcran>;
  contexte: ContexteRedactionEcran;
  /** Combien de fois la croix de chaque fenêtre a été pressée. C'est ce compteur qui atteint l'éditeur. */
  fermetures: ReadonlyMap<string, number>;
  onChange: (cle: string, b: BrouillonEcran) => void;
  onFermer: (cle: string) => void;
  /**
   * 🔴🔴 LA CROIX DEMANDE, ELLE NE FERME PAS. Elle appelait `onFermer` directement : la fenêtre disparaissait sans
   * que l'éditeur ait son mot à dire, donc sans que la règle « un brouillon resté vide est abandonné » s'applique.
   * C'est de là que venaient les brouillons vides. Elle prévient désormais l'éditeur, qui ferme par sa propre porte.
   */
  onDemanderFermeture: (cle: string) => void;
  onGeste: Rapport;
  onEnvoye: (cle: string) => void;
  /** Réduire, agrandir, rétablir. La RÈGLE (une seule en plein écran) vit dans le module pur. */
  onEtat: (cle: string, etat: EtatFenetre) => void;
}) {
  const plein = celleEnPlein(fenetres);

  return (
    <>
      <style>{CSS_FENETRES}</style>
      {/* LE VOILE DU PLEIN ÉCRAN, posé UNE fois. Cliquer à côté ne ferme PAS : on perdrait un message en cours
          d'écriture d'un clic malheureux. On revient par le bouton « Réduire la fenêtre ». */}
      {plein !== null && <div className="fre-voile" aria-hidden="true" />}

      {fenetres.map((f) => {
        const b = brouillons.get(f.cle);
        if (b === undefined) return null;
        // 🔴 Le décalage vient des largeurs RÉELLES des voisins de droite : une pastille réduite n'occupe pas la
        //   place d'une fenêtre ouverte, et un rang multiplié par une largeur unique les faisait se chevaucher.
        const decalage = decalageDepuisLaDroite(fenetres, f.cle);
        const titre = titreFenetre(b);
        return (
          <section
            key={f.cle}
            className={`fre fre--${f.etat}`}
            style={f.etat === 'plein' ? undefined : { right: `${decalage}px` }}
            aria-label={titre}
          >
            {/* ══ 🔴🔴 LA BARRE DE TITRE — ET POURQUOI ELLE A ÉTÉ REFAITE ═══════════════════════════════════════
                DÉFAUT D'ARNO, REPRODUIT ET MESURÉ LE 29/09/2026 : en rouvrant le brouillon « Re: État des lieux de
                sortie » (qui porte des Cc, donc un contenu plus haut), la barre de titre n'était plus visible —
                il n'en restait qu'un ruban de 3 px. On ne pouvait ni réduire ni fermer la fenêtre.
                LA CAUSE : la fenêtre est ancrée en bas (`bottom:0`) avec une hauteur maximale ET `overflow:hidden`.
                Quand le contenu dépassait, la barre se retrouvait HORS de la boîte rognée, et disparaissait.
                LE CORRECTIF est dans le style : une grille à deux rangées (`auto 1fr`) où la barre a sa rangée à
                elle, que rien ne peut comprimer — cf. `CSS_FENETRES`.

                Elle RÉDUIT au clic sur le titre, comme dans Gmail. Les trois boutons sont ceux de Gmail, dans
                l'ordre de Gmail : réduire (–), plein écran (⤢), fermer (×). Chacun porte un mot en toutes lettres,
                parce qu'une icône muette est inutilisable au lecteur d'écran. */}
            <div className="fre-titre">
              <button type="button" className="fre-titre-mot"
                aria-expanded={f.etat !== 'reduite'}
                title={f.etat === 'reduite' ? 'Rétablir la fenêtre' : 'Réduire la fenêtre'}
                onClick={() => onEtat(f.cle, f.etat === 'reduite' ? 'ouverte' : 'reduite')}>
                {titre}
              </button>
              <span className="fre-boutons">
                <button type="button" className="fre-bouton"
                  aria-label={f.etat === 'reduite' ? 'Rétablir la fenêtre' : 'Réduire la fenêtre'}
                  title={f.etat === 'reduite' ? 'Rétablir la fenêtre' : 'Réduire la fenêtre'}
                  onClick={() => onEtat(f.cle, f.etat === 'reduite' ? 'ouverte' : 'reduite')}>
                  {/* ⚠️ LE TIRET DE GMAIL, pas un chevron : c'est la forme qu'on reconnaît sans lire. Rétablir
                      remonte la fenêtre, et l'icône le dit alors par un chevron vers le haut. */}
                  <span aria-hidden="true" className="fre-icone">{f.etat === 'reduite' ? '⌃' : '—'}</span>
                </button>
                <button type="button" className="fre-bouton"
                  aria-label={f.etat === 'plein' ? 'Quitter le plein écran' : 'Passer en plein écran'}
                  title={f.etat === 'plein' ? 'Quitter le plein écran' : 'Passer en plein écran'}
                  onClick={() => onEtat(f.cle, f.etat === 'plein' ? 'ouverte' : 'plein')}>
                  <span aria-hidden="true" className="fre-icone">{f.etat === 'plein' ? '⤡' : '⤢'}</span>
                </button>
                {/* ⚠️ FERMER NE SUPPRIME PAS : le brouillon est conservé s'il contient quelque chose — c'est la
                    règle du lot BROUILLON-SILENCIEUX, et `Redaction` la tient déjà. Supprimer se demande
                    expressément, par la corbeille de la barre du bas.
                    🔴🔴 ET C'EST L'ÉDITEUR QUI FERME, pas cette croix : elle fermait la fenêtre elle-même, ce qui
                    court-circuitait justement cette règle et laissait la ligne vide en base. */}
                {/**
                  * ══ 🔴🔴 LOT BANDEAU-ET-BROUILLONS — FERMER NE DOIT PAS FABRIQUER CE QU'IL VA GARDER ══════════
                  *
                  * CONSTAT D'ARNO, mesuré en base le 30/09/2026 : cinq brouillons du jour (66, 68, 72, 73, 74)
                  * n'avaient NI objet, NI autre corps que la signature — seulement un destinataire. Reproduit à
                  * l'écran : ouvrir « Nouveau message », taper une adresse, cliquer cette croix → brouillon 75,
                  * de la même forme exactement.
                  *
                  * 🔴 LA CAUSE : le champ « À » valide ce qu'on a tapé À LA PERTE DE FOCUS, ce qui est la bonne
                  * règle quand on passe au champ suivant. Mais cliquer ici fait AUSSI perdre le focus, et dans
                  * cet ordre : le clic pose le focus sur la croix, `onBlur` transforme le texte à moitié tapé en
                  * destinataire, l'éditeur se croit « touché », enregistre, PUIS ferme. Le geste qui dit « je ne
                  * veux pas de ce message » fabriquait lui-même le seul contenu qui le rendait digne d'être gardé.
                  *
                  * ⚠️ LE MÊME REMÈDE QUE POUR LES SUGGESTIONS (encadré en tête de `Redaction.tsx`, 24/09/2026) :
                  * on annule le comportement par défaut du `mousedown`, donc LE FOCUS NE QUITTE PAS LE CHAMP et
                  * `onBlur` ne se déclenche pas. On ne désarme PAS la validation au focus perdu — elle reste
                  * juste quand on passe à « Objet ». On enlève seulement au geste de fermeture le pouvoir de
                  * valider à la place de la personne.
                  *
                  * 🔒 RIEN N'EST PERDU : tout ce qui a été VALIDÉ (Entrée, virgule, choix dans la liste) est déjà
                  * dans l'état, et `fermer` le garde comme avant. Seule la frappe jamais confirmée ne survit pas,
                  * ce qui est précisément ce que « jamais confirmée » veut dire.
                  */}
                <button type="button" className="fre-bouton" aria-label="Fermer la fenêtre" title="Fermer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onDemanderFermeture(f.cle)}>
                  <span aria-hidden="true" className="fre-icone">✕</span>
                </button>
              </span>
            </div>

            {/* 🔴 CACHÉ, JAMAIS DÉMONTÉ : démonter perdrait le texte non encore enregistré et un envoi en cours. */}
            <div className="fre-corps" hidden={f.etat === 'reduite'}>
              <Redaction
                dansFenetre
                reduite={f.etat === 'reduite'}
                fermetureDemandee={fermetures.get(f.cle) ?? 0}
                brouillon={b}
                contexte={contexte}
                onChange={(maj) => onChange(f.cle, maj)}
                onFerme={() => onFermer(f.cle)}
                onEnvoye={() => onEnvoye(f.cle)}
                onGeste={onGeste} />
            </div>
          </section>
        );
      })}
    </>
  );

}

/** Le titre de la fenêtre : l'objet quand il existe, sinon la voie. C'est ce qu'on lit quand elle est réduite. */
export function titreFenetre(b: BrouillonEcran): string {
  const objet = (b.objet ?? '').trim();
  if (objet !== '') return objet;
  if (b.voie === 'nouveau') return 'Nouveau message';
  if (b.voie === 'transferer' || b.voie === 'transferer_piece') return 'Transférer';
  return b.voie === 'repondre_tous' ? 'Répondre à tous' : 'Répondre';
}

/** La largeur d'une fenêtre ancrée, et la hauteur de sa zone. Écrites ici, employées par le style et par le décalage. */
export const CSS_FENETRES = `
:root{--fre-largeur:min(520px, calc(100vw - 32px))}
/* Le voile du plein ecran. Il n'intercepte PAS le clic (pointer-events:none) : cliquer a cote ne doit pas fermer
   une fenetre ou l'on est en train d'ecrire. On revient par le bouton, jamais par megarde. */
.fre-voile{position:fixed;inset:0;z-index:58;background:color-mix(in srgb, var(--color-svv-ink) 42%, transparent);pointer-events:none}
/* ══ 🔴🔴 UNE GRILLE A DEUX RANGEES, ET NON PLUS UNE COLONNE FLEX ══════════════════════════════════════════════
   DEFAUT D'ARNO, REPRODUIT LE 29/09/2026 : sur un brouillon un peu haut (des Cc, une citation), la barre de titre
   disparaissait — il n'en restait qu'un ruban de 3 px, et l'on ne pouvait plus ni reduire ni fermer la fenetre.
   La fenetre est ancree en bas avec une hauteur MAXIMALE et overflow:hidden ; quand le contenu depassait, la
   barre se retrouvait hors de la boite rognee.
   La grille (grid-template-rows: auto minmax(0,1fr)) donne a la barre une rangee qui lui appartient : elle est
   dimensionnee AVANT le corps, et le corps prend ce qui reste.

   ══ 🔴🔴 LE MEME DEFAUT EST REVENU LE 30/09/2026, ET « auto 1fr » NE SUFFISAIT PAS ═══════════════════════════
   Constat d'Arno, sur le fil 36529 : « il ne reste qu'un mince trait noir au-dessus de De : » — plus de titre,
   plus de boutons, donc plus moyen de reduire, d'agrandir ni de fermer.

   MESURE A L'ECRAN, qui donne la cause exacte :
       .fre         y=164  hauteur=580   overflow:hidden   scrollTop=42   scrollHeight=678
       .fre-titre   y=123  hauteur=44                      <- 41 px AU-DESSUS de sa propre fenetre
   La barre etait bien rendue, avec ses trois boutons : elle etait SORTIE DE LA BOITE PAR LE HAUT, et rognee.

   POURQUOI. Une rangee « 1fr » a min-height:auto : elle ne borne RIEN, elle grandit avec son contenu. Le corps
   depassait donc la fenetre (678 contre 580), ce qui rendait .fre DEFILABLE — et un conteneur overflow:hidden
   reste defilable PAR PROGRAMME. A l'ouverture, le champ « A » prend le focus, le navigateur fait defiler tous
   ses ancetres pour le rendre visible, et la barre de titre part par le haut. C'est le pendant vertical du
   min-width:0 deja consigne dans ce depot pour la troncature.

   LE CORRECTIF TIENT EN DEUX PIECES, ET LES DEUX SERVENT — c'est la mesure qui le dit, pas la theorie :
     ① minmax(0,1fr) BORNE la rangee du corps. Mesure apres correction : grille « 44px 535.875px », corps de
        536 px pour 799 px de contenu, qu'il defile LUI-MEME (overflow-y:auto). C'etait le vrai defaut : sans
        cette borne, le corps poussait la barre hors de la fenetre.
     ② LA BARRE EST STICKY au sommet. Elle reste necessaire : mesure apres correction, .fre porte encore un
        scrollHeight de 678 pour 580 de haut, donc un defilement residuel est toujours possible. Le sticky
        garantit alors que la barre reste visible au lieu de disparaitre en silence.
   ⚠️ NE PAS RETIRER L'UNE EN CROYANT QUE L'AUTRE SUFFIT : sans la borne, le corps repousse la barre ; sans le
   sticky, le defilement residuel la cache de nouveau. Le defaut est deja revenu une fois par cette porte.
   (Pas d'accent grave dans ce bloc : il fermerait le litteral de style — piege deja rencontre trois fois.) */
.fre{position:fixed;z-index:60;display:grid;grid-template-rows:auto minmax(0,1fr);width:var(--fre-largeur);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:.7rem .7rem 0 0;box-shadow:0 -2px 22px color-mix(in srgb, var(--color-svv-ink) 20%, transparent);overflow:hidden}
.fre--ouverte,.fre--reduite{bottom:0}
.fre--ouverte{max-height:min(78vh, 720px)}
/* ══ REDUITE : UNE PASTILLE ARRONDIE, comme dans Gmail ═════════════════════════════════════════════════════════
   Le titre et les trois icones, et rien d'autre. Les pastilles s'alignent cote a cote en bas a droite (le decalage
   est pose par l'ecran, qui sait leur rang). Le brouillon vit toujours derriere : l'editeur est CACHE, jamais
   demonte. La rangee du corps est mise a zero pour qu'elle ne reserve aucune hauteur. */
.fre--reduite{max-height:none;width:min(280px, calc(100vw - 32px));grid-template-rows:auto 0;
  border-radius:.7rem .7rem 0 0}
.fre--reduite .fre-titre{border-radius:.6rem .6rem 0 0}
/* PLEIN ECRAN : centree, large, au-dessus du voile. */
.fre--plein{top:4vh;bottom:4vh;left:50%;transform:translateX(-50%);width:min(900px, calc(100vw - 32px));
  border-radius:.7rem;z-index:60}
/* ⚠️ LE position:sticky EST LA CEINTURE, PAS LA CORRECTION (voir l'encadre de .fre) : la bretelle est le
   minmax(0,1fr) de la grille. AUCUN ACCENT GRAVE ICI : ce commentaire vit dans un litteral de gabarit. */
.fre-titre{position:sticky;top:0;z-index:1;
  display:flex;align-items:center;gap:2px;padding:4px 6px 4px 14px;min-height:44px;
  background:var(--color-svv-ink);color:var(--color-svv-surface)}
.fre-titre-mot{flex:1 1 auto;min-width:0;padding:0;font:inherit;font-size:.85rem;font-weight:600;text-align:left;
  color:inherit;background:none;border:0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-boutons{display:flex;gap:0;flex:0 0 auto}
.fre-bouton{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;padding:0;
  font:inherit;color:inherit;background:transparent;border:0;border-radius:.3rem;cursor:pointer}
/* Les trois icones ont la MEME boite et la meme taille optique : c'est ce qui les fait lire comme une rangee. */
.fre-icone{display:block;font-size:.95rem;line-height:1}
.fre-bouton:hover{background:color-mix(in srgb, var(--color-svv-surface) 18%, transparent)}
.fre-bouton:focus-visible{outline:2px solid var(--color-svv-surface);outline-offset:-2px}
.fre-corps{min-height:0;overflow-y:auto;padding:10px 12px 12px}
/* ⚠️ SUR TELEPHONE, une fenetre flottante n'a pas de sens : elle prend tout l'ecran, comme dans Gmail. */
@media (max-width: 640px){
  .fre--ouverte,.fre--plein{inset:0;width:100%;max-height:none;transform:none;border-radius:0}
  .fre--reduite{left:0;right:0;width:100%}
}
@media (prefers-reduced-motion: reduce){ .fre{transition:none} }
`;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE CROCHET QUI TIENT L'ÉTAT DES FENÊTRES. Il vit ICI, à côté du composant, parce que les deux répondent à la
   même question ; la RÈGLE, elle, reste dans le module pur `fenetresRedaction.ts`, où elle s'éprouve sans écran.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export function useFenetresRedaction() {
  const [fenetres, setFenetres] = useState<FenetreRedaction[]>([]);
  const [brouillons, setBrouillons] = useState<Map<string, BrouillonEcran>>(new Map());
  /**
   * 🔴 LES DEMANDES DE FERMETURE, COMPTÉES PAR FENÊTRE. Un compteur et non un booléen : on peut recliquer la croix,
   * et un booléen déjà posé ne redéclencherait rien. C'est l'ÉDITEUR qui ferme pour de bon, par `onFerme`.
   */
  const [fermetures, setFermetures] = useState<Map<string, number>>(new Map());

  /**
   * OUVRIR une fenêtre. Rend le MOTIF du refus quand il y en a déjà deux — jamais `false` muet : un clic sans
   * effet et sans explication se lit comme une panne, et on reclique.
   */
  const ouvrirFenetre = (cle: string, brouillon: BrouillonEcran): string | null => {
    const r = ouvrir(fenetres, cle);
    if (!r.ok) return r.motif;
    setFenetres(r.fenetres);
    setBrouillons((m) => (m.has(cle) ? m : new Map(m).set(cle, brouillon)));
    return null;
  };

  const majBrouillon = (cle: string, b: BrouillonEcran): void => {
    setBrouillons((m) => new Map(m).set(cle, b));
  };

  const fermerLa = (cle: string): void => {
    setFenetres((f) => fermerFenetre(f, cle));
    setBrouillons((m) => { const n = new Map(m); n.delete(cle); return n; });
    setFermetures((m) => { const n = new Map(m); n.delete(cle); return n; });
  };

  /** La croix a été pressée : on le DIT à l'éditeur, qui fermera par sa propre porte (et abandonnera s'il faut). */
  const demanderFermeture = (cle: string): void => {
    setFermetures((m) => new Map(m).set(cle, (m.get(cle) ?? 0) + 1));
  };

  const changerLEtat = (cle: string, etat: EtatFenetre): void => {
    setFenetres((f) => changerEtat(f, cle, etat));
  };

  return { fenetres, brouillons, fermetures, ouvrirFenetre, majBrouillon, fermerLa, demanderFermeture, changerLEtat };
}
