'use client';

import { useState } from 'react';

/**
 * LOT BOITE-INTERNE-CORBEILLE — L'EN-TÊTE DE LA CORBEILLE : ce qu'on sélectionne, et les deux gestes.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE COMPOSANT NE VA RIEN CHERCHER ET NE DÉCIDE RIEN. Il montre l'état de la sélection et appelle le parent —
 * même règle que tout l'écran depuis le lot 5a : l'appel réseau vit dans `gestesLigne.ts`, jamais dans une vue.
 *
 * ═══ 🔴🔴 DEUX GESTES, DEUX TRAITEMENTS OPPOSÉS, ET C'EST TOUT LE SUJET ══════════════════════════════════════════
 *
 * « RÉINTÉGRER » ne demande RIEN. Il se défait d'un clic (le bandeau « Annuler » de 10 s), et il ne détruit rien :
 * le mail retrouve simplement sa place. Poser une question devant un geste réversible n'apprend qu'une chose —
 * cliquer « oui » sans lire. Et c'est précisément ce qui rendrait la question suivante inutile.
 *
 * « SUPPRIMER DÉFINITIVEMENT » demande une confirmation ÉCRITE, avec le NOMBRE DE MAILS et le mot
 * « irréversible ». C'est le seul geste de tout le module qui ne se défait pas, ni ici, ni dans Gmail, ni en base.
 *
 * 🔴 LE NOMBRE ANNONCÉ EST CELUI DES MAILS, PAS DES LIGNES COCHÉES. Une ligne est un ÉCHANGE, et un échange peut
 * porter plusieurs mails à la corbeille : annoncer « 3 » avant d'en effacer 7 serait pire qu'une absence de
 * question. Le compte vient du serveur, avec la liste (`nbCorbeille`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La phrase d'Arno, mot pour mot, et à un seul endroit. */
export const MENTION_30_JOURS =
  'Les mails sont supprimés automatiquement par Gmail après 30 jours dans la corbeille.';

/**
 * LA PHRASE DE CONFIRMATION. PURE, et exportée pour être éprouvée sans écran : c'est le dernier texte que quelqu'un
 * lit avant un geste irréversible, et il doit dire le nombre exact.
 */
export function motConfirmation(nbMails: number): string {
  return `${nbMails} mail${nbMails > 1 ? 's' : ''} ser${nbMails > 1 ? 'ont' : 'a'} supprimé`
    + `${nbMails > 1 ? 's' : ''} définitivement de Gmail. Cette action est irréversible.`;
}

/** Ce que dit le lien « tout sélectionner », selon qu'on a déjà pris toute la corbeille ou seulement la page. */
export function motToutSelectionner(nbCorbeille: number): string {
  return `Sélectionner les ${nbCorbeille} échange${nbCorbeille > 1 ? 's' : ''} de la Corbeille`;
}

export function EnteteCorbeille({
  nbPage, nbSelection, nbMailsSelection, totalCorbeille, toutePageCochee, occupe, suppressionPossible,
  motSuppressionImpossible, onToutePage, onToutLaCorbeille, onReintegrer, onSupprimer,
}: {
  /** Combien de lignes la liste montre en ce moment (page courante + « Voir plus »). */
  nbPage: number;
  nbSelection: number;
  /** Combien de MAILS ces lignes portent à la corbeille — c'est CE nombre que la confirmation annonce. */
  nbMailsSelection: number;
  /** Le total de la corbeille, pour le lien « tout sélectionner ». `null` = pas encore connu. */
  totalCorbeille: number | null;
  toutePageCochee: boolean;
  /** Un geste est en cours : les boutons ne doivent pas pouvoir partir deux fois. */
  occupe: boolean;
  /**
   * 🔴 LE DROIT GOOGLE PERMET-IL D'EFFACER ? `false` aujourd'hui : la portée `https://mail.google.com/` n'est pas
   * accordée (vérifié sur le vrai compte). Le bouton est alors DÉSACTIVÉ et dit pourquoi — il n'est ni caché
   * (on ne devinerait pas que la fonction existe) ni menteur (rien n'est effacé « chez nous seulement »).
   */
  suppressionPossible: boolean;
  motSuppressionImpossible: string;
  onToutePage: (coche: boolean) => void;
  onToutLaCorbeille: () => void;
  onReintegrer: () => void;
  onSupprimer: () => void;
}) {
  /** La confirmation vit ICI, et nulle part ailleurs : une seule peut être ouverte, par construction. */
  const [confirme, setConfirme] = useState(false);
  const rien = nbSelection === 0;

  return (
    <div className="ecb">
      <style>{CSS_ENTETE_CORBEILLE}</style>

      {/* 🔴 LA MENTION EST AU-DESSUS DE TOUT, pas en bas de page : c'est une échéance, et une échéance se lit avant
          d'agir. Elle n'est pas une alerte — nous n'y pouvons rien, Gmail fait le ménage tout seul. */}
      <p className="ecb-mention">{MENTION_30_JOURS}</p>

      <div className="ecb-barre">
        <label className="ecb-tout">
          <input type="checkbox" checked={toutePageCochee} disabled={nbPage === 0}
            onChange={(e) => onToutePage(e.target.checked)} />
          <span>Tout sélectionner</span>
        </label>

        {/* ⚠️ LE LIEN NE PARAÎT QUE S'IL AJOUTE QUELQUE CHOSE : la page entière cochée, et la corbeille plus
            grande que la page. Le montrer toujours ferait cliquer sur un geste sans effet. */}
        {toutePageCochee && totalCorbeille !== null && totalCorbeille > nbPage && (
          <button type="button" className="gst-lien-bouton ecb-lien" onClick={onToutLaCorbeille}>
            {motToutSelectionner(totalCorbeille)}
          </button>
        )}

        <span className="ecb-compte" role="status">
          {rien
            ? 'Aucune sélection'
            : `${nbSelection} sélectionné${nbSelection > 1 ? 's' : ''}`
              + (nbMailsSelection > nbSelection ? ` — ${nbMailsSelection} mails` : '')}
        </span>

        <span className="ecb-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn"
            disabled={rien || occupe} onClick={onReintegrer}>
            Réintégrer
          </button>
          {/* 🔴 DÉSACTIVÉ, PAS ABSENT — et l'info-bulle dit POURQUOI. Un bouton manquant se lit « cette application
              ne sait pas faire » ; un bouton grisé qui s'explique se lit « il manque un droit », ce qui est vrai
              et réparable. `title` ET `aria-describedby` : l'info-bulle ne suffit pas au clavier. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn ecb-danger"
            disabled={rien || occupe || !suppressionPossible}
            title={suppressionPossible ? undefined : motSuppressionImpossible}
            aria-describedby={suppressionPossible ? undefined : 'ecb-droit'}
            onClick={() => setConfirme(true)}>
            Supprimer définitivement
          </button>
        </span>
      </div>

      {!suppressionPossible && (
        <p className="ecb-droit" id="ecb-droit" role="note">{motSuppressionImpossible}</p>
      )}

      {/* ══ LA CONFIRMATION ══ `role="alertdialog"` : c'est le seul endroit du module qui interrompt à dessein.
          Le bouton « Annuler » vient EN PREMIER dans le document — c'est lui qu'on atteint d'abord au clavier,
          et c'est la réponse la plus sûre. */}
      {confirme && (
        <div className="ecb-confirme" role="alertdialog" aria-labelledby="ecb-confirme-texte">
          <p id="ecb-confirme-texte" className="ecb-confirme-texte">{motConfirmation(nbMailsSelection)}</p>
          <span className="ecb-confirme-actions">
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => setConfirme(false)}>
              Annuler
            </button>
            <button type="button" className="svv-btn gst-btn ecb-danger-plein" disabled={occupe}
              onClick={() => { setConfirme(false); onSupprimer(); }}>
              Supprimer
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/* Aucun accent grave dans ce littéral : un seul le terminerait. Piège consigné sept fois dans ce dépôt. */
export const CSS_ENTETE_CORBEILLE = `
.ecb{display:flex;flex-direction:column;gap:8px;margin:0 0 .7rem}
.ecb-mention{margin:0;font-size:.82rem;color:var(--color-svv-muted);line-height:1.45}
.ecb-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 10px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.ecb-tout{display:inline-flex;align-items:center;gap:.45rem;font-size:.85rem;color:var(--color-svv-ink);
  min-height:44px;cursor:pointer}
.ecb-tout input{width:18px;height:18px;accent-color:var(--color-svv-red);cursor:pointer}
.ecb-lien{font-size:.82rem}
.ecb-compte{font-size:.82rem;color:var(--color-svv-muted);margin-inline-start:auto}
.ecb-boutons{display:inline-flex;flex-wrap:wrap;gap:8px}
/* 🔴 UN BOUTON INACTIF DOIT SE VOIR — défaut constaté à l'écran le 29/09/2026, en Clair comme en Sombre : les
   deux boutons avaient exactement la même apparence, qu'ils soient cliquables ou non (opacité 1, même couleur).
   « Supprimer définitivement » paraissait donc disponible alors que le droit Google manque, et « Réintégrer »
   paraissait cliquable sans sélection. Un bouton qui a l'air actif et ne répond pas se lit « l'application est
   cassée » — pas « ce n'est pas possible pour l'instant ».
   Le curseur le dit aussi : l'information ne tient pas à la seule couleur. */
.ecb-boutons>.gst-btn:disabled{opacity:.45;cursor:not-allowed}
.ecb-danger:not(:disabled){color:var(--color-svv-red);border-color:var(--color-svv-red)}
.ecb-danger-plein{background:var(--color-svv-red);border-color:var(--color-svv-red);color:#fff}
.ecb-droit{margin:0;font-size:.8rem;line-height:1.45;color:var(--color-svv-ink);padding:8px 10px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.ecb-confirme{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:10px 12px;border-radius:10px;
  border:2px solid var(--color-svv-red);background:var(--color-svv-field)}
.ecb-confirme-texte{margin:0;flex:1 1 16rem;font-size:.88rem;font-weight:700;color:var(--color-svv-ink);
  line-height:1.45}
.ecb-confirme-actions{display:inline-flex;flex-wrap:wrap;gap:8px}
@media (max-width:640px){
  .ecb-compte{margin-inline-start:0;flex-basis:100%}
  .ecb-boutons{flex-basis:100%}
  .ecb-boutons>.gst-btn{flex:1 1 10rem}
}
`;
