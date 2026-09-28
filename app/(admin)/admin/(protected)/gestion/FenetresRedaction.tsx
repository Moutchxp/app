'use client';

import { useState } from 'react';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import {
  celleEnPlein, changerEtat, fermer as fermerFenetre, ouvrir, rangDepuisLaDroite,
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
        const rang = rangDepuisLaDroite(fenetres, f.cle);
        const titre = titreFenetre(b);
        return (
          <section
            key={f.cle}
            className={`fre fre--${f.etat}`}
            style={f.etat === 'plein' ? undefined : { right: `calc(16px + ${rang} * (var(--fre-largeur) + 12px))` }}
            aria-label={titre}
          >
            {/* ══ LA BARRE DE TITRE ══ Elle RÉDUIT au clic, comme dans Gmail — c'est le geste qu'on fait sans
                réfléchir. Les trois boutons sont à droite, chacun nommé en toutes lettres. */}
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
                  <span aria-hidden="true">{f.etat === 'reduite' ? '▴' : '▾'}</span>
                </button>
                <button type="button" className="fre-bouton"
                  aria-label={f.etat === 'plein' ? 'Quitter le plein écran' : 'Passer en plein écran'}
                  title={f.etat === 'plein' ? 'Quitter le plein écran' : 'Passer en plein écran'}
                  onClick={() => onEtat(f.cle, f.etat === 'plein' ? 'ouverte' : 'plein')}>
                  <span aria-hidden="true">{f.etat === 'plein' ? '⤡' : '⤢'}</span>
                </button>
                {/* ⚠️ FERMER NE SUPPRIME PAS : le brouillon est conservé s'il contient quelque chose — c'est la
                    règle du lot BROUILLON-SILENCIEUX, et `Redaction` la tient déjà. Supprimer se demande
                    expressément, par la corbeille de la barre du bas.
                    🔴🔴 ET C'EST L'ÉDITEUR QUI FERME, pas cette croix : elle fermait la fenêtre elle-même, ce qui
                    court-circuitait justement cette règle et laissait la ligne vide en base. */}
                <button type="button" className="fre-bouton" aria-label="Fermer la fenêtre" title="Fermer"
                  onClick={() => onDemanderFermeture(f.cle)}>
                  <span aria-hidden="true">✕</span>
                </button>
              </span>
            </div>

            {/* 🔴 CACHÉ, JAMAIS DÉMONTÉ : démonter perdrait le texte non encore enregistré et un envoi en cours. */}
            <div className="fre-corps" hidden={f.etat === 'reduite'}>
              <Redaction
                dansFenetre
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
.fre{position:fixed;z-index:60;display:flex;flex-direction:column;width:var(--fre-largeur);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:.7rem .7rem 0 0;box-shadow:0 -2px 22px color-mix(in srgb, var(--color-svv-ink) 20%, transparent);overflow:hidden}
.fre--ouverte,.fre--reduite{bottom:0}
.fre--ouverte{max-height:min(78vh, 720px)}
/* REDUITE : la barre de titre, et rien d'autre. Le brouillon vit toujours derriere. */
.fre--reduite{max-height:none}
/* PLEIN ECRAN : centree, large, au-dessus du voile. */
.fre--plein{top:4vh;bottom:4vh;left:50%;transform:translateX(-50%);width:min(900px, calc(100vw - 32px));
  border-radius:.7rem;z-index:60}
.fre-titre{display:flex;align-items:center;gap:4px;padding:6px 6px 6px 12px;
  background:var(--color-svv-ink);color:var(--color-svv-surface)}
.fre-titre-mot{flex:1 1 auto;min-width:0;padding:0;font:inherit;font-size:.85rem;font-weight:600;text-align:left;
  color:inherit;background:none;border:0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-boutons{display:flex;gap:0}
.fre-bouton{display:inline-flex;align-items:center;justify-content:center;min-width:34px;min-height:34px;padding:0;
  font:inherit;color:inherit;background:transparent;border:0;border-radius:.3rem;cursor:pointer}
.fre-bouton:hover{background:color-mix(in srgb, var(--color-svv-surface) 18%, transparent)}
.fre-bouton:focus-visible{outline:2px solid var(--color-svv-surface);outline-offset:-2px}
.fre-corps{flex:1 1 auto;min-height:0;overflow-y:auto;padding:10px 12px 12px}
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
