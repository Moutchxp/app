'use client';

import { useEffect, useRef } from 'react';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import {
  lignesComparatif, motMailsCouverts, titreModaleChangement,
  type ComparatifRepere,
} from '../../../../lib/gestion/repereFenetre';

/**
 * ══ 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES, POINT 2 — LA MODALE « CHANGEMENT DE SUIVI » ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « La pastille s'ouvre au CLIC (et à Entrée ou Espace au clavier), plus au survol.
 * Bulle “Voir le détail du changement” au survol seulement. Modale “Changement de suivi — <date>” : DEUX colonnes,
 * “Avant” à gauche, “Après” à droite, lignes alignées pour comparer : statut (Classé / Interne / Hors gestion / À
 * classer), bien(s) (adresse, type, lot), personnes concernées (avec rôle), choix de suivi ; les lignes qui
 * DIFFÈRENT sont mises en évidence (fond léger, marque “modifié”) ; en pied : qui, quand, sur quel mail
 * (expéditeur, date, objet), et le nombre de mails couverts par la nouvelle fenêtre ; bouton Fermer, Échap, clic à
 * l'extérieur ; mêmes jetons de couleur que les autres modales, lisible en Clair et en Sombre ; en mobile,
 * colonnes empilées. Données identiques à celles de la bulle actuelle (même source). Aucune écriture. »
 *
 * ═══ 🔴🔴 CE QUI EST TENU ICI, ET POURQUOI AINSI ══════════════════════════════════════════════════════════════════
 *
 * ① LA COMPARAISON EST UNE GRILLE, PAS DEUX LISTES. Les deux colonnes partagent les MÊMES lignes
 *    (`lignesComparatif`, module pur) : « Statut » d'avant est strictement en regard de « Statut » d'après. Deux
 *    listes côte à côte se décalent dès qu'un côté a une valeur de plus — et c'est exactement ce qu'on vient
 *    comparer. L'intitulé vit dans une TROISIÈME colonne, étroite, qui n'est pas une colonne de données : c'est
 *    l'axe de la grille.
 *
 * ② LES QUATRE LIGNES SONT TOUJOURS LÀ, même identiques. Ce sont les lignes MODIFIÉES qui se signalent (fond léger
 *    + marque « modifié »), jamais les autres qui disparaissent : on lit une grille stable, pas un diff.
 *
 * ③ 🔴 AUCUNE ÉCRITURE, AUCUNE REQUÊTE. La modale ne reçoit que ce que la ligne du repère savait déjà — le
 *    comparatif composé par le module pur, et le mail voisin que l'écran tient en main. Elle n'a ni `fetch`, ni
 *    `method:`, ni état à sauver. C'est une fenêtre de LECTURE, et le garde de ce lot le vérifie.
 *
 * ④ TROIS PORTES POUR SORTIR, parce qu'on n'entre ici que pour lire : le bouton « Fermer », Échap, et le clic à
 *    côté. C'est le contrat de toutes les fenêtres du module (`.mrt-voile`), et on le reprend au lieu d'en écrire
 *    un quatrième.
 *
 * ⚠️ EN MOBILE LES COLONNES S'EMPILENT, et chaque valeur reprend son étiquette (« Avant » / « Après ») : empilées
 * sans étiquette, deux valeurs l'une sous l'autre ne se distinguent plus. L'étiquette est posée par le CSS
 * (`::before` sur `data-cote`), donc elle n'existe que là où elle sert.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le mail qui ouvre la fenêtre, tel que le pied l'annonce. Rien de plus que ce que l'écran a déjà. */
export interface MailDuRepere {
  de: string;
  deNom: string | null;
  recuLe: string;
  objet: string | null;
}

export function ModaleChangementSuivi({ comparatif: c, mail, nbMails, onFermer }: {
  comparatif: ComparatifRepere;
  /** `null` = le mail n'a pas été retrouvé dans la vue : le pied le dit, il ne l'invente pas. */
  mail: MailDuRepere | null;
  nbMails: number;
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement | null>(null);
  const lignes = lignesComparatif(c);

  /**
   * 🔴 ÉCHAP FERME, OÙ QUE SOIT LE FOCUS. Un `onKeyDown` sur la boîte ne verrait rien tant que le focus est
   * ailleurs (la pastille reste focalisée juste après le clic) : on écoute donc le document, et on se retire en
   * partant.
   */
  useEffect(() => {
    const auClavier = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onFermer(); }
    };
    document.addEventListener('keydown', auClavier, true);
    boite.current?.focus();
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [onFermer]);

  return (
    <div className="mcs-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_MODALE_CHANGEMENT_SUIVI}</style>
      {/* ⚠️ `aria-modal` ET un titre NOMMÉ : sans les deux, un lecteur d'écran continue de lire la page derrière. */}
      <div className="mcs" role="dialog" aria-modal="true" aria-labelledby="mcs-titre" tabIndex={-1} ref={boite}>
        <h2 className="mcs-titre" id="mcs-titre">{titreModaleChangement(c.quand === null ? null : dateHeureComplete(c.quand))}</h2>

        {/* ══ 🔴🔴 LA GRILLE — TROIS COLONNES À L'ÉCRAN, DEUX COLONNES DE DONNÉES ════════════════════════════════
            L'en-tête nomme les deux côtés une seule fois, en haut : le répéter sur chaque ligne aurait triplé le
            texte sans rien apprendre. */}
        <div className="mcs-grille" role="table" aria-label="Avant et après le changement">
          <div className="mcs-tete" role="row">
            <span className="mcs-axe" role="columnheader" />
            <span className="mcs-col" role="columnheader">Avant</span>
            <span className="mcs-col" role="columnheader">Après</span>
          </div>
          {lignes.map((l) => (
            <div key={l.libelle} role="row"
              className={l.modifie ? 'mcs-ligne mcs-ligne--modifiee' : 'mcs-ligne'}>
              <span className="mcs-axe" role="rowheader">
                {l.libelle}
                {/* 🔴 LA MARQUE « MODIFIÉ », ÉCRITE. Le fond léger ne se lit ni en niveaux de gris, ni au lecteur
                    d'écran : la couleur SIGNALE, le mot INFORME. */}
                {l.modifie && <span className="mcs-marque">modifié</span>}
              </span>
              <span className="mcs-val" role="cell" data-cote="Avant">{l.avant}</span>
              <span className="mcs-val mcs-val--apres" role="cell" data-cote="Après">{l.apres}</span>
            </div>
          ))}
        </div>

        {/* ══ LE PIED : QUI, QUAND, SUR QUEL MAIL, ET CE QUE LA FENÊTRE COUVRE ═══════════════════════════════════
            ⚠️ CHAQUE LIGNE N'APPARAÎT QUE SI ELLE A QUELQUE CHOSE À DIRE : « par — » et « le — » n'informent de
            rien, et un pied à moitié vide se lit moins bien qu'un pied court. */}
        <dl className="mcs-pied">
          {c.qui !== null && <Ligne intitule="Décidé par" valeur={c.qui} />}
          {c.quand !== null && <Ligne intitule="Le" valeur={dateHeureComplete(c.quand)} />}
          {mail !== null && (
            <Ligne intitule="Sur le mail"
              valeur={`${mail.deNom ?? mail.de} · ${dateHeureComplete(mail.recuLe)} · ${mail.objet ?? '(sans objet)'}`} />
          )}
          <Ligne intitule="Portée" valeur={motMailsCouverts(nbMails)} />
        </dl>

        <div className="mcs-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/** Une ligne du pied : intitulé à gauche, valeur à droite. */
function Ligne({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="mcs-pied-ligne">
      <dt>{intitule}</dt>
      <dd>{valeur}</dd>
    </div>
  );
}

/**
 * ══ LA FEUILLE — LES MÊMES JETONS QUE LES AUTRES FENÊTRES DU MODULE ══════════════════════════════════════════════
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le litteral de gabarit (piege vu 11 fois dans ce depot).
 *
 * 🔴 AUCUNE COULEUR EN DUR : voile, surface, trait, encre et sourdine viennent des jetons, qui basculent seuls en
 * Clair et en Sombre. La mise en evidence d'une ligne modifiee est un aplat du ROUGE de la marque, a tres faible
 * opacite : il reste lisible sur les deux fonds, la ou un gris clair disparait en Sombre.
 */
export const CSS_MODALE_CHANGEMENT_SUIVI = `
/* ⚠️ LE CALAGE A GAUCHE N'EST PAS UN ORNEMENT : la modale est rendue DANS la phrase du repere, qui est centree
   (.cnv-repere-phrase). Sans "text-align:left", les deux colonnes heritaient du centrage et chaque valeur flottait
   au milieu de la sienne — l'oeil ne pouvait plus suivre une colonne du regard. Releve a l'ecran le 03/10/2026.
   ⚠️ AUCUN ACCENT GRAVE ICI : il fermerait le litteral de gabarit (piege vu 12 fois dans ce depot). */
.mcs-voile{position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45);text-align:left}
.mcs{width:min(46rem,100%);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:.7rem;
  padding:16px;border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 12px 40px rgba(17,19,24,.25)}
.mcs:focus{outline:none}
.mcs-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}

/* LA GRILLE. Un seul gabarit de colonnes pour l'en-tete ET les lignes : c'est ce qui garantit l'alignement. */
.mcs-grille{display:flex;flex-direction:column;gap:2px;font-size:.82rem}
.mcs-tete,.mcs-ligne{display:grid;grid-template-columns:9.5rem 1fr 1fr;gap:.6rem;align-items:baseline;
  padding:7px 10px;border-radius:8px}
.mcs-tete{padding-bottom:2px;font-weight:700;color:var(--color-svv-muted)}
.mcs-ligne{background:var(--color-svv-field)}
.mcs-ligne--modifiee{background:color-mix(in srgb, var(--color-svv-red) 12%, var(--color-svv-field));
  box-shadow:inset 2px 0 0 var(--color-svv-red)}
.mcs-axe{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-weight:700;color:var(--color-svv-muted);
  min-width:0}
.mcs-col{color:var(--color-svv-muted)}
.mcs-val{min-width:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mcs-val--apres{font-weight:600}
.mcs-marque{flex:0 0 auto;padding:0 .35rem;border-radius:999px;border:1px solid var(--color-svv-red);
  font-size:.68rem;font-weight:700;color:var(--color-svv-red);white-space:nowrap}

/* LE PIED, meme fiche que les autres fenetres du module. */
.mcs-pied{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);font-size:.78rem}
.mcs-pied-ligne{display:flex;align-items:baseline;gap:.5rem;margin:0 0 .2rem}
.mcs-pied-ligne:last-child{margin-bottom:0}
.mcs-pied dt{flex:0 0 7.5rem;font-weight:700;color:var(--color-svv-muted)}
.mcs-pied dt::after{content:' :'}
.mcs-pied dd{flex:1 1 auto;margin:0;min-width:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mcs-boutons{display:flex;justify-content:flex-end;gap:8px}

/* ⚠️ EN MOBILE LES COLONNES S'EMPILENT, et chaque valeur reprend son etiquette : sans elle, deux valeurs l'une
   sous l'autre ne se distinguent plus. L'en-tete des colonnes disparait, il ne surplombe plus rien. */
@media (max-width:640px){
  .mcs-tete{display:none}
  .mcs-ligne{grid-template-columns:1fr;gap:.2rem}
  .mcs-val::before{content:attr(data-cote) ' : ';font-weight:700;color:var(--color-svv-muted)}
  .mcs-pied-ligne{flex-direction:column;gap:.1rem}
  .mcs-pied dt{flex:0 0 auto}
}
`;
