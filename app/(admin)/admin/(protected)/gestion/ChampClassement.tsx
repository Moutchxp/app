'use client';

import { useEffect, useState } from 'react';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
import { resumeBiensRattaches } from '../../../../lib/gestion/classementBoutons';

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
 *   ① RIEN N'EST DÉCIDÉ → les deux cases. Le mail partira « à classer », comme avant ce lot.
 *   ② DES BIENS SONT COCHÉS → UNE case VERTE « Rattaché », avec la liste courte dessous. Un clic la rouvre.
 *   ③ « INTERNE » → UNE case VERTE « Interne ».
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
  cibles, interne, onRattacher, onInterne, onReinitialiser, interneDisponible = true, persistant = true,
}: {
  cibles: readonly CibleBrouillon[];
  /** « Interne » a-t-il été choisi pour ce brouillon ? */
  interne: boolean;
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
}) {
  const biens = cibles.filter((c) => c.sorte === 'lot');
  const rattache = biens.length > 0;

  /**
   * ══ 🔴 L'ANIMATION D'« INTERNE » (demande d'Arno) ═════════════════════════════════════════════════════════
   *
   * « la case blanche s'étend sur toute la largeur et vire au vert ». On tient l'instant où le clic a eu lieu :
   * pendant ce temps, la case porte une classe de plus, et la feuille de style fait le reste.
   *
   * ⚠️ ELLE NE RETARDE RIEN. Le choix est posé TOUT DE SUITE ; l'animation accompagne un état déjà vrai. Une
   * animation qui retiendrait la décision ferait perdre un clic à qui referme la fenêtre dans la foulée.
   *
   * ⚠️ ET ELLE RESPECTE `prefers-reduced-motion` (exigence transverse du dépôt) : la feuille de style la réduit à
   * rien pour qui l'a demandé, sans que ce composant ait à le savoir.
   */
  const [anime, setAnime] = useState(false);
  useEffect(() => {
    if (!anime) return undefined;
    const t = setTimeout(() => setAnime(false), 420);
    return () => clearTimeout(t);
  }, [anime]);

  const motifRattacher = onRattacher === undefined
    ? 'Ajoutez d’abord un destinataire : les biens se déduisent de lui.'
    : undefined;
  const motifInterne = interneDisponible
    ? undefined
    : 'Mise à jour de la base à appliquer (migration 281) : le statut « Interne » n’est pas encore installé.';

  return (
    <div className="ccl">
      <span className="red-label" id="ccl-label">Classer ce mail</span>

      {/* ══ ② ET ③ — UNE SEULE CASE VERTE, ET LE MOT DIT LAQUELLE ═══════════════════════════════════════════ */}
      {(rattache || interne) ? (
        <>
          {rattache ? (
            /* 🔴 CLIQUABLE : « Un clic sur la case verte rouvre la modale avec les choix en cours ». La case
               « Interne », elle, n'a rien à rouvrir — c'est « Réinitialiser » qui la défait. */
            <button type="button" className="ccl-case ccl-case--verte ccl-case--pleine"
              onClick={onRattacher} disabled={onRattacher === undefined}
              title="Revoir ou modifier les biens rattachés">
              <span className="ccl-case-mot">Rattaché</span>
              <span className="ccl-case-detail">{resumeBiensRattaches(biens.map((b) => b.libelle))}</span>
            </button>
          ) : (
            <p className={`ccl-case ccl-case--verte ccl-case--pleine ccl-case--fixe${anime ? ' ccl-case--anime' : ''}`}
              role="status">
              <span className="ccl-case-mot">Interne</span>
              <span className="ccl-case-detail">Échange entre collègues — aucun bien ne sera rattaché.</span>
            </p>
          )}

          {/* 🔴 « RÉINITIALISER », PETIT ET SOUS LA CASE (demande d'Arno). Il défait, il ne décide pas : le
              mettre en avant inviterait à annuler plutôt qu'à classer. */}
          <p className="ccl-refaire">
            <button type="button" className="gst-lien-bouton" onClick={onReinitialiser}>
              Réinitialiser
            </button>
          </p>
        </>
      ) : (
        /* ══ ① — LES DEUX CASES, MOITIÉ-MOITIÉ, MÊME HAUTEUR ═════════════════════════════════════════════════ */
        <div className="ccl-deux">
          <button type="button" className="ccl-case ccl-case--rouge"
            onClick={onRattacher} disabled={onRattacher === undefined} title={motifRattacher}>
            <span className="ccl-case-mot">Rattacher</span>
            <span className="ccl-case-detail">à un logement</span>
          </button>
          <button type="button" className="ccl-case ccl-case--blanche"
            disabled={!interneDisponible} title={motifInterne}
            onClick={() => { setAnime(true); onInterne(); }}>
            <span className="ccl-case-mot">Interne</span>
            <span className="ccl-case-detail">entre collègues</span>
          </button>
        </div>
      )}

      {/* ⚠️ LES MOTIFS SE LISENT, ils ne se survolent pas : sur un téléphone, une infobulle n'existe pas. */}
      {motifRattacher !== undefined && !rattache && !interne && (
        <p className="ccl-note">{motifRattacher}</p>
      )}
      {motifInterne !== undefined && !rattache && !interne && <p className="ccl-note">{motifInterne}</p>}
      {!persistant && (
        <p className="ccl-note">
          Mise à jour de la base à appliquer (migration 285) : ce choix vaut pour cet envoi, mais il ne sera pas
          retrouvé si vous fermez la fenêtre.
        </p>
      )}
      {!rattache && !interne && (
        <p className="ccl-note">Sans choix, ce message partira « à classer ».</p>
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

/* ══ L'ANIMATION D'« INTERNE » : la case s'etend sur toute la largeur et vire au vert ════════════════════════ */
@keyframes ccl-etendre{
  from{transform:scaleX(.5);background:var(--color-svv-surface);color:var(--color-svv-ink)}
  to{transform:scaleX(1);background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
}
.ccl-case--anime{animation:ccl-etendre .4s ease-out;transform-origin:right center}
/* EXIGENCE TRANSVERSE DU DEPOT : qui demande moins de mouvement n'en recoit aucun. L'etat, lui, ne change pas. */
@media (prefers-reduced-motion: reduce){
  .ccl-case--anime{animation:none}
  .ccl-case{transition:none}
}

.ccl-refaire{margin:0}
.ccl-note{margin:0;font-size:.78rem;color:var(--color-svv-muted)}

/* Sous 380 px, deux cases cote a cote deviennent illisibles : elles s'empilent, sans rien perdre. */
@media (max-width:380px){
  .ccl-deux{grid-template-columns:1fr}
}
`;
