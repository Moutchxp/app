'use client';

import type { ReactNode } from 'react';
import { BoiteMail } from './BoiteMail';
import { Conversation } from './Conversation';
import type { Rapport } from './gestesMail';
import { memeEtiquette, type Etiquette } from '../../../../lib/gestion/ecranUrl';

/**
 * LOT 5-FUSION — LA BOÎTE EN PLEIN ÉCRAN, façon messagerie : les étiquettes à gauche, les échanges au milieu, la
 * conversation à droite.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS UNE SECONDE BOÎTE MAIL. La liste du milieu EST `BoiteMail` (lot 5a), avec sa recherche, ses filtres,
 * son interrupteur de courrier automatique et sa pagination par curseur ; la colonne de droite EST `Conversation`
 * (lot 5b), la vue unique du module. Ce fichier ne fait que les DISPOSER et leur dire quelle étiquette regarder. Deux
 * vues du même courrier finiraient par diverger — et c'est toujours celle qu'on regarde le moins qui garde le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 UNE ÉTIQUETTE N'EST QU'UN FILTRE. Rien n'est écrit en base, aucune colonne n'est ajoutée : « Envoyés », « Sans
 * suite » ou une carte se DÉRIVENT à la lecture (voir `boiteRepo`). Changer l'état d'un échange change son étiquette
 * sans qu'aucun code ne s'en occupe, et sans rattrapage à faire nulle part.
 *
 * ⚠️ « À CLASSER » N'EST PAS UNE LISTE DE PLUS : c'est le poste de tri LUI-MÊME, passé en `enfantAClasser` par l'écran
 * qui le possède déjà — avec ses gestes, son panneau d'affectation et son compteur. Le recoder ici aurait donné deux
 * files qui se contredisent au premier changement de règle.
 *
 * MOBILE D'ABORD : sous 900 px il n'y a qu'UNE colonne, les étiquettes deviennent un ruban qui défile SEUL (jamais la
 * page), et ouvrir un échange remplace la liste au lieu de la comprimer. Cibles ≥ 44 px, aucune interaction au survol
 * seul, jetons `--color-svv-*` uniquement, et l'étiquette ouverte est dite par un MOT (`aria-current`) autant que par
 * la forme.
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
 * Les étiquettes à AFFICHER. 🔴 Pas d'étiquette vide — une colonne de gauche remplie de zéros ne renseigne sur rien et
 * fait défiler pour rien. Seule exception, et elle est nécessaire : celle qu'on REGARDE reste listée même à zéro,
 * sinon elle disparaîtrait sous les pieds de celui qui vient de la choisir. PUR.
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

      {/* LE RETOUR, EN PREMIER ET EN TOUTES LETTRES. Un plein écran sans sortie évidente est un piège : celle-ci est
          le premier élément du DOM, donc la première chose qu'atteignent le clavier et un lecteur d'écran. */}
      <div className="pe-barre">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>
          ← Écran partagé
        </button>
        <h2 className="gst-titre pe-titre">Boîte mail</h2>
      </div>

      <div className={`pe-grille${filOuvert !== null ? ' pe-grille--lecture' : ''}`}>
        <nav className="pe-etiquettes" aria-label="Étiquettes de la boîte">
          <ul className="pe-etiq-liste">
            {visibles.map((e) => {
              const active = memeEtiquette(e.etiquette, etiquette);
              return (
                <li key={`${e.etiquette.sorte}-${e.etiquette.evenementId ?? 0}`}>
                  <button type="button" className={`pe-etiq${active ? ' pe-etiq--active' : ''}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onEtiquette(e.etiquette)}>
                    <span className="pe-etiq-nom">
                      {/* La référence d'une carte passe DEVANT son titre : c'est elle qu'on cherche des yeux, et
                          c'est elle qu'on retrouve dans un mail ou dans un échange déjà classé. */}
                      {e.reference && <span className="gst-ref">{e.reference}</span>}
                      <span className="pe-etiq-texte">{e.libelle}</span>
                    </span>
                    {e.compte !== null && <span className="gst-compte">{e.compte}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

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
            <p className="gst-vide">Choisissez un échange à gauche pour le lire ici.</p>
          )}
        </section>
      </div>
    </div>
  );
}

const CSS_PLEIN_ECRAN = `
.pe{display:flex;flex-direction:column;gap:12px;min-width:0}
.pe-barre{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.pe-titre{margin:0}
/* ÉTROIT PAR DÉFAUT : une seule colonne de contenu, et l'échange ouvert REMPLACE la liste — sur un téléphone, deux
   colonnes de 180 px ne sont pas deux colonnes, c'est deux colonnes illisibles. */
.pe-grille{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.pe-etiquettes{min-width:0}
.pe-liste{min-width:0}
.pe-lecture{min-width:0}
.pe-grille--lecture .pe-liste{display:none}
.pe-grille:not(.pe-grille--lecture) .pe-lecture{display:none}
/* Le ruban d'étiquettes défile SEUL sur téléphone : c'est son propre conteneur de débordement, jamais la page. */
.pe-etiq-liste{list-style:none;margin:0;padding:0 0 4px;display:flex;gap:6px;overflow-x:auto}
@media (min-width:900px){
  .pe-grille{grid-template-columns:minmax(180px,220px) minmax(0,1fr)}
  .pe-etiq-liste{flex-direction:column;overflow-x:visible;padding-bottom:0}
}
/* Au-delà de 1200 px, les trois colonnes tiennent : on lit la conversation SANS perdre la liste de vue. */
@media (min-width:1200px){
  .pe-grille{grid-template-columns:minmax(190px,230px) minmax(0,1fr) minmax(0,1.15fr)}
  .pe-grille--lecture .pe-liste{display:block}
  .pe-grille:not(.pe-grille--lecture) .pe-lecture{display:block}
}
.pe-etiq{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;min-height:44px;
  padding:.5rem .7rem;text-align:left;font:inherit;font-size:.85rem;color:var(--color-svv-ink);cursor:pointer;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.6rem;white-space:nowrap}
@media (min-width:900px){.pe-etiq{white-space:normal}}
.pe-etiq:hover{border-color:var(--color-svv-line-strong)}
.pe-etiq:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'étiquette ouverte : soulignée et encadrée, pas seulement colorée — lisible en niveaux de gris et aux daltoniens. */
.pe-etiq--active{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);font-weight:700;
  text-decoration:underline;text-underline-offset:4px}
.pe-etiq-nom{display:flex;flex-direction:column;gap:1px;min-width:0}
.pe-etiq-texte{overflow-wrap:anywhere}
`;
