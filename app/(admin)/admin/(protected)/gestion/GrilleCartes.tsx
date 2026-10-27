'use client';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE, PARTIE B (Arno, 27/10/2026) — LA GRILLE DE BOUTONS-CARTES, UNE SEULE FOIS ══════════════════════════════
 *
 * « Dans la bulle d'un point (lien “Transformer en étape”) ET dans le panneau “Corriger ce point d'information” (bouton “Transformer
 * en carte d'étape”), remplacer la liste de liens par le MÊME panneau que “Ajouter une carte” du “+” : la même grille de
 * boutons-cartes, même source de données, même ordre, même style […]. Un seul composant partagé, aucune liste recopiée. » (accord
 * explicite d'Arno pour remplacer la liste de liens par cette grille).
 *
 * 🔴 LA LISTE SE CALCULE ICI, ET NULLE PART AILLEURS : `cartesDuReservoir` (étape) ou `informationsDuReservoir` (point), selon l'état
 * ouvert / clos de l'événement. Le « + » (réservoir) et les deux portes de la transformation rendent ce composant : ils ne peuvent
 * pas proposer deux listes différentes.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (garde `clientBoundary.guard.test.ts`). Les classes `fav-*` viennent de la feuille de la frise, qui
 * enveloppe tous les endroits où cette grille s'affiche.
 */
import { useState } from 'react';
import { cartesDuReservoir, informationsDuReservoir, motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';
import {
  estBorne, gesteTransformerEnEtape, gesteTransformerEnPoint, MOT_BORNE_NON_TRANSFORMABLE, parcoursDeBorne, TITRE_MAX,
} from '../../../../lib/gestion/correctionEtape';
import type { EtapeAAfficher } from '../../../../lib/gestion/frise';

/** Le geste de correction qu'une transformation envoie (même forme que `GesteCorrection` du panneau de correction). */
export type GesteTransformation = { geste: 'corriger'; type: TypeEtape; titre: string | null; jour: string | null };

/** Les cartes proposées, dans l'ordre de la grille. PUR, et exporté pour que les épreuves comparent les deux portes à la source. */
export function cartesDeLaGrille(forme: 'etape' | 'information', evenementOuvert: boolean): TypeEtape[] {
  return forme === 'etape' ? cartesDuReservoir(evenementOuvert) : informationsDuReservoir(evenementOuvert);
}

export function GrilleCartes({ forme, evenementOuvert, onChoisir, occupe = false, porte }: {
  forme: 'etape' | 'information';
  evenementOuvert: boolean;
  onChoisir: (t: TypeEtape) => void;
  occupe?: boolean;
  /** D'où la grille est ouverte : le « + » (`ajout`) ou une transformation (`transformer`). Repère d'épreuve, rien d'autre. */
  porte: 'ajout' | 'transformer';
}) {
  return (
    <ul className="fav-reserve-liste" data-grille-cartes={porte}>
      {cartesDeLaGrille(forme, evenementOuvert).map((t) => (
        <li key={t}>
          {/* 🔴 LOT CLOTURE-REOUVERTURE / FRISE-COULEURS-DATES — « Réouverture » au trait plus marqué, « Clôture » seule carte à
              contour vert de la grille (Arno). La couleur ne dit jamais seule : le mot est écrit dans le bouton. */}
          <button type="button" disabled={occupe} data-carte-grille={t}
            className={`fav-carre fav-carre--reserve${t === 'reouverture' ? ' fav-carre--reouverture' : ''}`
              + (t === 'cloture' ? ' fav-carre--reserve-close' : '')}
            onClick={() => onChoisir(t)}>
            <span className="fav-titre">{motEtape(t)}</span>
            {t === 'autre' && <span className="fav-date">titre à saisir</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * ══ 🔴🔴 B1-B2 — « TRANSFORMER EN ÉTAPE » : LA GRILLE DU « + », ET CE QUE CHAQUE CHOIX FAIT ═══════════════════════════════════════════
 *
 * Rendu par la bulle d'un point ET par le panneau « Corriger ce point d'information » — le même composant aux deux portes.
 *   · une carte ordinaire (ou Facture) ⇒ le geste de correction existant, à la date du point, le lien vers le mail conservé ;
 *   · « Carte libre » ⇒ son titre se saisit (« titre à saisir »), prérempli du nom du point, puis la même correction ;
 *   · « Clôture » / « Réouverture » ⇒ le MÊME parcours de clôture que depuis le « + » (formulaire et modale) : `onParcoursBorne`.
 *     Le point, lui, reste sur la frise — rien n'est retiré sans qu'on le demande.
 * « Annuler » referme la grille sans rien écrire.
 */
export function PanneauTransformerEnEtape({ point, evenementOuvert, occupe, onCorriger, onParcoursBorne, onAnnuler }: {
  point: EtapeAAfficher;
  evenementOuvert: boolean;
  occupe: boolean;
  onCorriger: (g: GesteTransformation) => void;
  onParcoursBorne: (t: 'cloture' | 'reouverture') => void;
  onAnnuler: () => void;
}) {
  const nomDuPoint = point.titre !== null && point.titre.trim() !== '' ? point.titre.trim() : motEtape(point.type);
  const [libre, setLibre] = useState(false);
  const [titre, setTitre] = useState(nomDuPoint);
  const choisir = (t: TypeEtape): void => {
    if (parcoursDeBorne(t)) { onParcoursBorne(t as 'cloture' | 'reouverture'); return; }
    if (t === 'autre') { setLibre(true); return; }
    onCorriger(gesteTransformerEnEtape(point, t));
  };
  return (
    <div className="fav-transformer" role="group" aria-label="Transformer en étape : choisir la carte" data-liste-transformer={point.id}>
      <p className="fav-ajout-titre">Transformer en étape</p>
      <p className="fav-bulle-pose">Choisir la carte — elle prend la date du point et garde le lien vers le mail d’origine. « Clôture » ouvre la clôture de l’événement, comme depuis le « + ».</p>
      <GrilleCartes porte="transformer" forme="etape" evenementOuvert={evenementOuvert} onChoisir={choisir} occupe={occupe} />
      {libre && (
        <div className="fav-ajout-ligne" data-titre-carte-libre={point.id}>
          <label className="fav-label" htmlFor={`fav-titre-libre-${point.id}`}>Titre de la carte libre</label>
          <input id={`fav-titre-libre-${point.id}`} className="fav-champ fav-champ--texte" value={titre} maxLength={TITRE_MAX}
            onChange={(ev) => setTitre(ev.target.value)} />
          <button type="button" className="fav-btn fav-btn--fort" disabled={occupe || titre.trim() === ''}
            onClick={() => onCorriger(gesteTransformerEnEtape(point, 'autre', titre))}>Transformer en carte libre</button>
          {titre.trim() === '' && <span className="fav-perdu" role="status">Une carte libre demande un titre.</span>}
        </div>
      )}
      <div className="fav-ajout-ligne">
        <button type="button" className="fav-btn" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/**
 * ══ 🔴🔴 B3 — « TRANSFORMER EN POINT D'INFORMATION », DEPUIS UNE CARTE ══════════════════════════════════════════════════════════════
 *
 * Sur une borne (Ouverture, Clôture, Réouverture), le bouton RESTE visible ; un clic dit pourquoi il ne transforme pas (Arno : « dis-le
 * dans une bulle plutôt que de masquer le bouton »). `classe` : la classe de bouton de l'endroit qui le rend (bulle ou panneau).
 */
export function BoutonTransformerEnPoint({ carte, occupe, disponible, onCorriger, classe }: {
  carte: EtapeAAfficher; occupe: boolean; disponible: boolean; onCorriger: (g: GesteTransformation) => void; classe: string;
}) {
  const [explique, setExplique] = useState(false);
  const borne = estBorne(carte.type);
  return (
    <>
      <button type="button" className={classe} disabled={occupe || !disponible} data-transformer-en-point={carte.id}
        aria-expanded={borne ? explique : undefined}
        title={borne ? MOT_BORNE_NON_TRANSFORMABLE : 'Le point garde la date, le titre et le lien vers le mail d’origine.'}
        onClick={() => { if (borne) { setExplique(!explique); return; } onCorriger(gesteTransformerEnPoint(carte)); }}>
        Transformer en point d’information
      </button>
      {borne && explique && <span className="fav-bulle-borne" role="note" data-borne-non-transformable={carte.id}>{MOT_BORNE_NON_TRANSFORMABLE}</span>}
    </>
  );
}
