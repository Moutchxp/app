'use client';

import { useState, type ReactNode } from 'react';
import { BoiteMail } from './BoiteMail';
import { ColonneMode, type PanneauMobile } from './ColonneMode';
import { Conversation } from './Conversation';
import type { Rapport } from './gestesMail';
import { memeEtiquette, type Etiquette } from '../../../../lib/gestion/ecranUrl';

/**
 * LOT 5-FUSION / 5-FUSION-B — LA BOÎTE EN PLEIN ÉCRAN, façon messagerie.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS UNE SECONDE BOÎTE MAIL. La liste EST `BoiteMail` (lot 5a), avec sa recherche, ses filtres, son
 * interrupteur de courrier automatique et sa pagination par curseur ; la lecture EST `Conversation` (lot 5b), la vue
 * unique du module. Ce fichier ne fait que les DISPOSER et leur dire quelle étiquette regarder. Deux vues du même
 * courrier finiraient par diverger — et c'est toujours celle qu'on regarde le moins qui garde le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * LOT 5-FUSION-B — LES ÉTIQUETTES ONT DÉMÉNAGÉ DANS LA BARRE DE L'ADMINISTRATION (`ColonneMode`), à la place des liens
 * de modules. La liste et la conversation récupèrent toute la largeur ainsi libérée : deux panneaux côte à côte dès
 * 1000 px, là où il en fallait 1200 quand les étiquettes mangeaient 230 px du contenu.
 *
 * 🔴 UNE ÉTIQUETTE N'EST QU'UN FILTRE. Rien n'est écrit en base, aucune colonne : « Envoyés », « Sans suite » ou une
 * carte se DÉRIVENT à la lecture (voir `boiteRepo`). Changer l'état d'un échange change son étiquette sans qu'aucun
 * code ne s'en occupe.
 *
 * ⚠️ « À CLASSER » N'EST PAS UNE LISTE DE PLUS : c'est le poste de tri LUI-MÊME, passé en `enfantAClasser` par l'écran
 * qui le possède déjà — avec ses gestes, son panneau et son compteur. Le recoder ici aurait donné deux files qui se
 * contredisent au premier changement de règle.
 *
 * MOBILE D'ABORD : sous 768 px il n'y a pas trois colonnes mais TROIS ÉCRANS — les étiquettes, la liste, la
 * conversation — avec un retour explicite à chaque niveau. Cibles ≥ 44 px, aucune interaction au survol seul, jetons
 * `--color-svv-*` uniquement, et l'étiquette ouverte dite par un MOT (`aria-current`) autant que par la forme.
 */

/** Une entrée de la colonne de gauche. `reference` n'est renseignée que pour les cartes (GES-…). */
export interface EtiquetteAffichee {
  etiquette: Etiquette;
  libelle: string;
  /** `null` = on ne sait pas encore (le compte n'est pas revenu). Une étiquette sans nombre vaut mieux qu'un faux. */
  compte: number | null;
  reference?: string;
}

/**
 * Les étiquettes à AFFICHER. 🔴 Pas d'étiquette vide — une colonne remplie de zéros ne renseigne sur rien et fait
 * défiler pour rien. Seule exception, et elle est nécessaire : celle qu'on REGARDE reste listée même à zéro, sinon
 * elle disparaîtrait sous les pieds de celui qui vient de la choisir. PUR.
 */
export function etiquettesVisibles(
  toutes: readonly EtiquetteAffichee[], ouverte: Etiquette,
): EtiquetteAffichee[] {
  return toutes.filter((e) => e.compte === null || e.compte > 0 || memeEtiquette(e.etiquette, ouverte));
}

export function PleinEcranBoite({
  etiquette, etiquettes, onEtiquette, filOuvert, onOuvrir, onFermerFil, maintenant, onGeste, onRetour,
  enfantAClasser, auto, onAuto,
}: {
  etiquette: Etiquette;
  etiquettes: readonly EtiquetteAffichee[];
  onEtiquette: (e: Etiquette) => void;
  filOuvert: number | null;
  onOuvrir: (filId: number) => void;
  onFermerFil: () => void;
  maintenant: Date;
  onGeste: Rapport;
  onRetour: () => void;
  /** Le poste de tri, rendu par l'écran qui le possède. Affiché sous l'étiquette « À classer », et seulement là. */
  enfantAClasser: ReactNode;
  auto: boolean;
  onAuto: (v: boolean) => void;
}) {
  // Sur téléphone, on arrive sur les ÉTIQUETTES : c'est le sommaire, et on ne tombe pas au milieu d'une liste sans
  //   savoir laquelle. Au montage, donc à chaque entrée en plein écran. Sur grand écran, l'attribut ne change rien.
  const [panneauMobile, setPanneauMobile] = useState<PanneauMobile>('colonne');

  const visibles = etiquettesVisibles(etiquettes, etiquette);
  const ouverte = visibles.find((e) => memeEtiquette(e.etiquette, etiquette));
  const titre = ouverte?.libelle ?? 'Boîte mail';
  const aClasser = etiquette.sorte === 'a_classer';
  // Le nombre d'échanges tenus hors de la file par une règle : il vient de l'étiquette qui les rassemble, pas d'un
  //   second calcul. `null` = pas encore connu — on se tait alors, plutôt que d'annoncer un zéro qu'on n'a pas mesuré.
  const comptesAutomatiques = etiquettes.find((e) => e.etiquette.sorte === 'automatique')?.compte ?? null;

  return (
    <div className="pe">
      <style>{CSS_PLEIN_ECRAN}</style>

      {/* ══ LA COLONNE, POSÉE DANS LA BARRE DE L'ADMINISTRATION ═══════════════════════════════════════════════════ */}
      <ColonneMode actif panneauMobile={panneauMobile} titre="Étiquettes de la boîte">
        {/* LA SORTIE, EN PREMIER ET EN TOUTES LETTRES. Un plein écran sans retour évident est un piège ; celui-ci est
            le premier élément de la colonne, donc la première chose qu'atteignent le clavier et un lecteur d'écran. */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        <h2 className="cm-titre">Boîte mail</h2>
        <ul className="cm-liste">
          {visibles.map((e) => {
            const active = memeEtiquette(e.etiquette, etiquette);
            return (
              <li key={`${e.etiquette.sorte}-${e.etiquette.evenementId ?? 0}`}>
                <button type="button" className={`cm-entree${active ? ' cm-entree--active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => { onEtiquette(e.etiquette); setPanneauMobile('contenu'); }}>
                  <span className="cm-nom">
                    {/* La référence d'une carte passe DEVANT son titre : c'est elle qu'on cherche des yeux, et c'est
                        elle qu'on retrouve dans un mail ou dans un échange déjà classé. */}
                    {e.reference && <span className="gst-ref">{e.reference}</span>}
                    <span className="cm-texte">{e.libelle}</span>
                  </span>
                  {e.compte !== null && <span className="gst-compte">{e.compte}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </ColonneMode>

      {/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */}
      <button type="button" className="svv-btn svv-btn-outline gst-btn pe-retour-colonne"
        onClick={() => setPanneauMobile('colonne')}>
        ← Étiquettes
      </button>

      <div className={`pe-grille${filOuvert !== null ? ' pe-grille--lecture' : ''}`}>
        <section className="pe-liste" aria-label={`Échanges — ${titre}`}>
          {/* SOUS « À CLASSER », C'EST LE POSTE DE TRI QUI S'AFFICHE, tel qu'il est : mêmes gestes, même panneau,
              même compteur. Sous toutes les autres étiquettes, c'est la boîte du lot 5a, filtrée. */}
          {aClasser ? (
            <>
              <h3 className="gst-titre">
                {titre} {ouverte?.compte !== null && ouverte !== undefined && <span className="gst-compte">{ouverte.compte}</span>}
              </h3>
              {/* CE QUE CETTE LISTE NE MONTRE PAS, dit en toutes lettres, avec la sortie — comme partout dans le
                  module depuis le lot 4b. Le poste de tri n'a jamais montré le courrier automatique ; maintenant il
                  DIT où le trouver, au lieu de le taire. */}
              {comptesAutomatiques !== null && comptesAutomatiques > 0 && (
                <p className="gst-tronc">
                  Le poste de tri n’a jamais montré le courrier automatique : {comptesAutomatiques} échange
                  {comptesAutomatiques > 1 ? 's' : ''} rest{comptesAutomatiques > 1 ? 'ent' : 'e'} hors de cette liste.
                  Rien n’est supprimé.{' '}
                  <button type="button" className="gst-lien-bouton"
                    onClick={() => onEtiquette({ sorte: 'automatique', evenementId: null })}>
                    Voir l’étiquette « Courrier automatique »
                  </button>
                </p>
              )}
              {enfantAClasser}
            </>
          ) : (
            <BoiteMail etiquette={etiquette} titre={titre} total={ouverte?.compte ?? null}
              auto={auto} onAuto={onAuto} filSelectionne={filOuvert} onOuvrir={onOuvrir} />
          )}
        </section>

        <section className="pe-lecture" aria-label="Conversation">
          {filOuvert !== null ? (
            <Conversation filId={filOuvert} maintenant={maintenant} onFerme={onFermerFil}
              onGeste={(m, o) => { if (o?.rechargerTout) onFermerFil(); onGeste(m, o); }} />
          ) : (
            <p className="gst-vide">Choisissez un échange dans la liste pour le lire ici.</p>
          )}
        </section>
      </div>
    </div>
  );
}

const CSS_PLEIN_ECRAN = `
.pe{display:flex;flex-direction:column;gap:12px;min-width:0}
/* ÉTROIT PAR DÉFAUT : un seul panneau, et l'échange ouvert REMPLACE la liste — sur un téléphone, deux colonnes de
   180 px ne sont pas deux colonnes, c'est deux colonnes illisibles. */
.pe-grille{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.pe-liste{min-width:0}
.pe-lecture{min-width:0}
.pe-grille--lecture .pe-liste{display:none}
.pe-grille:not(.pe-grille--lecture) .pe-lecture{display:none}
/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */
.pe-retour-colonne{align-self:flex-start}
@media (min-width:768px){.pe-retour-colonne{display:none}}
/* Les étiquettes ayant quitté le contenu, deux panneaux tiennent dès 1000 px — contre 1200 px auparavant. */
@media (min-width:1000px){
  .pe-grille{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
  .pe-grille--lecture .pe-liste{display:block}
  .pe-grille:not(.pe-grille--lecture) .pe-lecture{display:block}
}
`;
