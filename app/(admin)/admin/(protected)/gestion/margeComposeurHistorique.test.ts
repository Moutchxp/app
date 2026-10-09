import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT MARGE-COMPOSEUR-HISTORIQUE (09/10/2026) ═══════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO : « le module de réponse colle au liseré vert gauche de la capsule du mail, alors que le contenu
 * du mail reçu juste au-dessus (De, À, texte, pièces jointes, boutons) est décalé par une marge intérieure. »
 *
 * ═══ 🔴 LA CAUSE, EN UNE LIGNE ══════════════════════════════════════════════════════════════════════════════════
 *
 * Le détail du mail portait son retrait dans SON `padding` (`10px 12px 12px 26px`), et le composeur est son
 * FRÈRE — pas son enfant : il n'en héritait rien. Deux blocs du même intérieur, deux retraits.
 *
 * MESURÉ dans le DOM, avant / après (lot de TEST, capsule de 1198 px) :
 *   · texte du mail            : gauche 304 — droite 1462
 *   · composeur AVANT          : gauche **278** — droite **1474**   (26 px et 12 px hors ligne)
 *   · composeur APRÈS          : gauche **304** — droite **1462**   (écart 0)
 * Le tableau complet — huit blocs, thème Clair et Sombre, largeur pleine et réduite — est dans
 * `app/.captures/marge-composeur-historique/mesures.md`.
 *
 * ═══ 🔴 CE QUE CES CAS TIENNENT ═════════════════════════════════════════════════════════════════════════════════
 *
 * Un alignement se MESURE à l'écran, et il l'a été. Ce que ces cas-ci tiennent est l'autre moitié, celle qu'une
 * mesure ne tient pas : qu'il n'y ait **qu'un seul jeu de marges**, écrit à un seul endroit, et que les deux
 * blocs le LISENT au lieu d'en recopier la valeur. C'est la recopie qui a produit le défaut ; c'est elle qu'on
 * ferme.
 */

const VDB = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
/** La feuille seule : un commentaire qui cite une valeur ne doit pas passer pour une règle appliquée. */
const FEUILLE = VDB.slice(VDB.indexOf('export const CSS_VIE_DU_BIEN')).replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('🔴🔴 un seul jeu de marges pour tout l’intérieur de la capsule', () => {
  /** 🔴 LES DEUX MARGES SONT DÉCLARÉES UNE FOIS, SUR LA CAPSULE — c'est d'elle que tout l'intérieur hérite. */
  it('🔴🔴 elles sont posées sur `.vdb-item`, et nulle part ailleurs', () => {
    expect(FEUILLE).toContain('.vdb-item{--vdb-marge-g:26px;--vdb-marge-d:12px;');
    /* Une seule déclaration de chacune : une seconde serait une seconde vérité. */
    expect(FEUILLE.match(/--vdb-marge-g\s*:/g)).toHaveLength(1);
    expect(FEUILLE.match(/--vdb-marge-d\s*:/g)).toHaveLength(1);
  });

  /** 🔴🔴 LES DEUX BLOCS LES LISENT — aucun ne réécrit « 26px » ni « 12px » de son côté. */
  it('🔴🔴 le détail du mail et le composeur lisent les mêmes variables', () => {
    expect(FEUILLE).toContain('padding:10px var(--vdb-marge-d) 12px var(--vdb-marge-g);');
    expect(FEUILLE).toContain('.vdb-composeur{padding:0 var(--vdb-marge-d) 12px var(--vdb-marge-g)}');
  });

  /**
   * 🔴🔴 ET LA VALEUR N'EST PLUS RECOPIÉE NULLE PART : c'est le garde du lot. Si quelqu'un réécrit un jour
   * « padding-left:26px » de son côté, ce cas rougit AVANT que les retraits ne se remettent à diverger.
   *
   * 🔴 TROUVÉ EN ÉCRIVANT CE CAS : le chiffre vivait à DEUX endroits — la marge, et la largeur du triangle.
   * Ce n'était pas un hasard, c'est la même mesure : le retrait du détail vaut exactement la colonne du
   * triangle, pour que le texte du mail tombe sous le texte de la rangée. Le triangle lit donc la variable lui
   * aussi, et l'alignement tient désormais par construction.
   */
  it('🔴🔴 « 26px » n’est écrit qu’à un seul endroit de la feuille', () => {
    const occurrences = FEUILLE.match(/26px/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(FEUILLE).toContain('--vdb-marge-g:26px');
    expect(FEUILLE).toContain('.vdb-triangle{flex:0 0 auto;display:flex;align-items:center;'
      + 'justify-content:center;width:var(--vdb-marge-g);');
  });

  /** 🔴 L'ENVELOPPE EXISTE, et c'est elle qui porte le retrait — le composeur lui-même n'est pas touché. */
  it('🔴 le composeur est enveloppé par la classe qui porte les marges', () => {
    expect(VDB).toContain('<div className="vdb-composeur" hidden={!ouvert}>{composeur}</div>');
  });

  /**
   * ⚠️ LA RANGÉE DES TROIS BOUTONS ÉTAIT DÉJÀ DANS LE DÉTAIL, donc déjà alignée (mesuré : 304 / 1462 avant comme
   * après). Ce cas le FIGE : la sortir du détail la décalerait de 26 px sans que rien d'autre ne rougisse.
   */
  it('⚠️ les trois boutons restent À L’INTÉRIEUR du détail', () => {
    const detail = VDB.slice(VDB.indexOf('<div className="vdb-detail">'), VDB.indexOf('{composeur !== null'));
    expect(detail).toContain('<BoutonsRepondre className="vdb-repondre"');
    expect(detail).toContain('</div>');
  });

  /**
   * 🔒 RIEN D'AUTRE NE CHANGE (Arno). L'enveloppe ne pose QUE du retrait : pas de fond, pas de filet, pas de
   * hauteur — sans quoi la capsule changerait d'aspect en plus de s'aligner.
   */
  it('🔒 l’enveloppe ne pose que du retrait', () => {
    const regle = FEUILLE.slice(FEUILLE.indexOf('.vdb-composeur{'));
    const corps = regle.slice(0, regle.indexOf('}') + 1);
    expect(corps).toContain('padding:');
    for (const interdit of ['background', 'border', 'margin', 'height', 'color']) {
      expect(corps, interdit).not.toContain(interdit);
    }
  });

  /**
   * 🔒 ET LA BOÎTE MAIL PLEIN ÉCRAN N'EST PAS TOUCHÉE : les marges de ce lot vivent sous le préfixe `vdb-`, qui
   * n'existe que dans la vie du bien et dans l'historique. La conversation garde les siennes (`cnv-`).
   */
  it('🔒 la boîte mail garde ses propres marges', () => {
    const CONVERSATION = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(CONVERSATION).not.toContain('--vdb-marge');
    expect(CONVERSATION).not.toContain('vdb-composeur');
  });
});
