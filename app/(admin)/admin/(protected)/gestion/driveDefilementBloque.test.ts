import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fenetreVisible, HAUTEUR_LIGNE, SEUIL_VIRTUALISATION } from '../../../../lib/gestion/finderDrive';
import { defilementPourCentrer } from '../../../../lib/gestion/arriveeArbre';

/**
 * ══ 🔴🔴 LOT DRIVE-DEFILEMENT-BLOQUE (09/10/2026) — LA TROISIÈME FOIS N'AURA PAS LIEU ═══════════════════════════
 *
 * CONSTAT D'ARNO : « dans le panneau de droite, la molette est bloquée : impossible de descendre jusqu'au bas de
 * la liste. Ce défaut avait déjà été corrigé ; il est revenu. »
 *
 * ══ 🔴🔴 CE QUE LA MESURE A TROUVÉ, ET QUI N'EST PAS CE QU'ON CROYAIT ══════════════════════════════════════════
 *
 * Rejoué le 09/10/2026 sur la fiche d'un bien, fenêtre « Ranger une pièce », branche dépliée par la loupe :
 *   · le conteneur DÉFILE — 10 crans de molette RÉELS (CDP) déplacent de 1 000 px, sans retour en arrière ;
 *   · `scrollTop = scrollHeight` atteint **le dernier élément** ;
 *   · mais le contenu fait **28 940 px**, soit **1 054 lignes** → **290 crans** pour atteindre le bas, et une
 *     poignée de barre qui occupe **2 %** du rail.
 *
 * 🔴 RIEN N'EST DONC « BLOQUÉ » AU SENS TECHNIQUE, et il faut le dire plutôt que de prétendre avoir réparé un
 * blocage : la liste est devenue trop longue pour la molette, et il n'existait AUCUN moyen d'y sauter.
 *
 * 🔴 DEUX MANQUES RÉELS, MESURÉS, ET CE LOT LES FERME :
 *   ① LA ZONE N'ÉTAIT PAS FOCALISABLE (`tabIndex = -1`, mesuré) : Fin, Début, Page suiv. ne faisaient RIEN,
 *      puisque c'est le navigateur qui fait défiler une zone, et seulement si elle peut recevoir le focus ;
 *   ② LA LOUPE NE DÉFILAIT PAS jusqu'à la ligne qu'elle désigne — elle dépliait la branche et laissait la vue
 *      en haut d'une liste de mille lignes.
 *
 * ⚠️ CE QUE CES CAS NE PEUVENT PAS TENIR : jsdom n'a pas de mise en page — `scrollHeight` et `clientHeight` y
 * valent toujours 0, et aucune assertion de défilement RÉEL n'y a de sens. Ils tiennent donc les deux choses
 * dont dépend le défilement et qui, elles, se lisent : le CONTRAT CSS de la zone, et la GÉOMÉTRIE de la
 * virtualisation sur une longue liste. La preuve à l'écran, elle, est dans
 * `app/.captures/drive-defilement-bloque/mesures.md`.
 */

const SFD = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
/** La feuille seule : un commentaire qui cite une règle ne doit pas passer pour la règle appliquée. */
const FEUILLE = SFD.slice(SFD.indexOf('const CSS_SELECTEUR')).replace(/\/\*[\s\S]*?\*\//g, ' ');

/** La liste d'Arno : branche dépliée, mille et quelques lignes. */
const LONGUE = 1054;

describe('🔴🔴 ① le conteneur de droite est défilant, et il le reste', () => {
  /**
   * 🔴🔴 LES TROIS PROPRIÉTÉS DONT DÉPEND LE DÉFILEMENT, ensemble et sur le MÊME élément :
   *   · `overflow-y:auto` — c'est lui qui défile ;
   *   · `flex:1 1 auto`   — il prend la hauteur restante entre l'en-tête et la barre du bas ;
   *   · `min-height:0`    — sans elle, un enfant de flex refuse de rétrécir sous son contenu, la zone grandit
   *     au lieu de défiler, et c'est la barre d'actions du bas qui sort de l'écran. C'est LE piège classique,
   *     et c'est celui qu'on verrouille ici.
   */
  it('🔴🔴 overflow-y:auto, flex:1 1 auto et min-height:0 sur la même zone', () => {
    const regle = FEUILLE.slice(FEUILLE.indexOf('.sfd-lignes{'));
    const corps = regle.slice(0, regle.indexOf('}') + 1);
    expect(corps).toContain('overflow-y:auto');
    expect(corps).toContain('flex:1 1 auto');
    expect(corps).toContain('min-height:0');
  });

  /**
   * 🔴🔴 ET ELLE EST ATTEIGNABLE AU CLAVIER — mesuré AVANT ce lot : `tabIndex` valait −1, donc Fin, Début et
   * Page suiv. ne faisaient rien du tout. C'est la moitié de la réponse à « impossible de descendre ».
   */
  it('🔴🔴 la zone peut recevoir le focus, et elle se nomme', () => {
    expect(SFD).toContain('tabIndex={0} aria-label="Contenu du dossier — liste défilante"');
  });

  /**
   * ⚠️ ET RIEN N'AVALE LES TOUCHES DE DÉFILEMENT. Le raccourci clavier de la fenêtre intercepte ⌘X/C/V, les
   * flèches (qui déplacent la SÉLECTION), Entrée et Espace — mais ni Fin, ni Début, ni Page suiv./préc., qui
   * restent au navigateur. Ce cas l'empêche de changer sans qu'on s'en aperçoive.
   */
  /**
   * ══ 🔴🔴 ET AUCUN COMMENTAIRE NE S'AFFICHE À L'ÉCRAN ════════════════════════════════════════════════════════
   *
   * CE QUI S'EST PASSÉ, le 09/10/2026, en écrivant CE lot : l'encadré posé juste au-dessus de `<div
   * className="sfd-lignes">` l'a été SANS ses accolades. Dans des enfants JSX, `/* … *​/` n'est pas un
   * commentaire : c'est du TEXTE. Il s'est affiché en gris dans la fenêtre d'Arno, et il a mangé **168 px** de
   * la hauteur de la liste (578 → 410).
   *
   * 🔴 NI `tsc` NI `vitest` NE LE VOIENT — c'est du JSX parfaitement valide. Seule la page le montre. D'où ce
   * cas, qui le voit sans navigateur : un commentaire collé devant une balise doit porter ses accolades.
   */
  it('🔴🔴 aucun commentaire ne se glisse dans le JSX sans ses accolades', () => {
    const nus: string[] = [];
    const re = /\n([ \t]{6,})(\{?)\/\*(?:(?!\*\/)[\s\S])*?\*\/[ \t]*\n[ \t]*</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(SFD)) !== null) {
      if (m[2] === '{') continue;
      /* ⚠️ UN COMMENTAIRE EN POSITION D'EXPRESSION EST LÉGITIME ET NU : `… ? (` ouvre une expression, pas des
         enfants JSX, et `/* … *​/` y est un vrai commentaire. Le discriminant est la ligne d'AVANT : elle finit
         par une parenthèse ouvrante (expression) ou par `>` / `}` (enfants). Sans cette nuance, le cas criait
         sur deux commentaires justes — et un cas qui crie faux finit par être désactivé. */
      const avant = SFD.slice(0, m.index).split('\n').filter((l) => l.trim() !== '').at(-1) ?? '';
      if (/[({]$|=>$/.test(avant.trim())) continue;
      nus.push(SFD.slice(m.index + 1, m.index + 80).split('\n')[0].trim());
    }
    expect(nus).toEqual([]);
  });

  it('⚠️ Fin, Début et Page suiv. ne sont interceptées nulle part', () => {
    const sansCommentaires = SFD.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const touche of ['End', 'Home', 'PageDown', 'PageUp']) {
      expect(sansCommentaires, touche).not.toContain(`e.key === '${touche}'`);
    }
  });
});

describe('🔴🔴 ② le dernier élément d’une longue liste est atteignable', () => {
  /** 🔴 LA LISTE EST BIEN VIRTUALISÉE à cette longueur — sinon les cales ne joueraient aucun rôle. */
  it('🔴 au-delà du seuil, la fenêtre se calcule', () => {
    expect(LONGUE).toBeGreaterThan(SEUIL_VIRTUALISATION);
  });

  /**
   * 🔴🔴 LA HAUTEUR TOTALE NE DÉPEND PAS DE L'ENDROIT OÙ L'ON EST : cale avant + lignes rendues + cale après
   * vaut la même chose en haut, au milieu et en bas. C'est ce qui donne au conteneur un `scrollHeight` stable —
   * et c'est ce qui empêche la « vibration » du défaut d'origine (lot CORBEILLE-DRIVE-REELLE-ET-SCROLL).
   */
  it('🔴🔴 la hauteur totale est la même partout dans la liste', () => {
    const hauteurVue = 578;
    const total = LONGUE * HAUTEUR_LIGNE;
    for (const scrollTop of [0, Math.round(total / 2), total - hauteurVue]) {
      const f = fenetreVisible(LONGUE, scrollTop, hauteurVue);
      const rendues = (f.fin - f.debut) * HAUTEUR_LIGNE;
      expect(f.avant + rendues + f.apres, `scrollTop=${scrollTop}`).toBe(total);
    }
  });

  /**
   * 🔴🔴 ET LA DERNIÈRE LIGNE EST VRAIMENT PEINTE QUAND ON EST EN BAS. Une cale juste ne suffit pas : encore
   * faut-il que la fenêtre rendue contienne la dernière ligne, sinon on atteint le bas d'un cadre vide.
   */
  it('🔴🔴 tout en bas, la dernière ligne fait partie des lignes rendues', () => {
    const hauteurVue = 578;
    const max = LONGUE * HAUTEUR_LIGNE - hauteurVue;
    const f = fenetreVisible(LONGUE, max, hauteurVue);
    expect(f.fin).toBe(LONGUE);
    expect(f.debut).toBeLessThan(LONGUE - 1);
    expect(f.apres).toBe(0);
  });

  /**
   * 🔴 LE SAUT VERS UNE LIGNE EST BORNÉ AUX DEUX BOUTS : la première ne demande pas un défilement négatif, la
   * dernière ne demande pas un défilement au-delà du contenu — et elle atteint EXACTEMENT le maximum.
   */
  it('🔴 sauter à la dernière ligne mène au bas, et pas plus loin', () => {
    const hauteurVue = 578;
    const max = LONGUE * HAUTEUR_LIGNE - hauteurVue;
    expect(defilementPourCentrer(LONGUE - 1, LONGUE, hauteurVue, HAUTEUR_LIGNE)).toBe(max);
    expect(defilementPourCentrer(0, LONGUE, hauteurVue, HAUTEUR_LIGNE)).toBe(0);
  });
});

describe('🔴🔴 ③ NŒUD ET ÉTAT NE SE CONTREDISENT JAMAIS — la règle, pas une réparation de plus', () => {
  /**
   * ══ 🔴🔴 C'EST LA VRAIE CAUSE DE LA RÉCIDIVE, ET CE CAS EST LE SEUL QUI L'EMPÊCHE DE REVENIR ═══════════════
   *
   * MESURÉ dans la fenêtre, le 09/10/2026 : poser `element.scrollTop` à la main n'y déclenche **AUCUN**
   * événement `scroll` (compté : 0 sur deux essais, liste de 375 lignes). L'état `scrollTop` — celui qui décide
   * des lignes rendues par `fenetreVisible` — reste donc à sa valeur d'avant, et la barre descend DEVANT UNE
   * ZONE VIDE. Vu d'Arno : « la molette est bloquée ».
   *
   * 🔴 POURQUOI b080c42d (lot CORBEILLE-DRIVE-REELLE-ET-SCROLL, point 3) N'AVAIT PAS SUFFI : il a posé la règle
   * et l'a appliquée à UN appelant, celui de l'arrivée. Les deux autres — le défilement qui suit la sélection au
   * clavier, et la remise à zéro au changement de dossier — ne l'ont jamais reçue. Ce cas les tient TOUS, y
   * compris ceux qui n'existent pas encore.
   */
  it('🔴🔴 tout `scrollTop =` posé à la main s’accompagne de `setScrollTop`', () => {
    const lignes = SFD.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
    const orphelins: string[] = [];
    lignes.forEach((l, i) => {
      if (!/\.scrollTop\s*=\s*[^=]/.test(l)) return;
      const autour = lignes.slice(Math.max(0, i - 6), i + 7).join('\n');
      if (!autour.includes('setScrollTop(')) orphelins.push(`${i + 1}: ${l.trim()}`);
    });
    expect(orphelins).toEqual([]);
  });

  /** 🔴 ET ON RELIT CE QUE LE NAVIGATEUR A FAIT : il borne la valeur au contenu du moment (encadré de b080c42d). */
  it('🔴 la valeur posée est relue sur le nœud, jamais devinée', () => {
    expect(SFD).toContain('pose = scene.current.scrollTop;');
    expect(SFD).toContain('setScrollTop(el.scrollTop);');
  });

  /** 🔴 LE CHANGEMENT DE DOSSIER REMET LES DEUX À ZÉRO — le défaut se cachait quand le dossier suivant était court. */
  it('🔴 charger un dossier remet la barre ET l’état en haut', () => {
    expect(SFD).toContain('if (scene.current !== null) scene.current.scrollTop = 0;');
  });
});

describe('🔴🔴 ④ la loupe amène sa ligne sous les yeux', () => {
  /**
   * 🔴🔴 C'EST LA VRAIE RÉPONSE AU « DÉFILEMENT BLOQUÉ » : 290 crans de molette pour atteindre le bas, mais un
   * seul geste pour aller là où est le document. Sans ce saut, la loupe dépliait la branche et laissait la vue
   * en haut d'une liste de mille lignes — ce qui se lit exactement comme un blocage.
   */
  it('🔴🔴 l’itinéraire fait défiler jusqu’à la ligne visée', () => {
    expect(SFD).toContain('const cibleLoupeVue = useRef<string>');
    expect(SFD).toContain('el.scrollTop = defilementPourCentrer(i, ordre.length, el.clientHeight, HAUTEUR_LIGNE);');
  });

  /**
   * ⚠️ UNE SEULE FOIS PAR CIBLE, ET LA MAIN GARDE LE DERNIER MOT. Sans ce garde, chaque dépliage de branche
   * aurait ramené la vue en arrière pendant qu'on explore — c'est-à-dire le défaut qu'on vient de corriger,
   * réintroduit par sa propre correction.
   */
  it('⚠️ elle ne se rejoue pas tant que la cible ne change pas', () => {
    expect(SFD).toContain('if (vise === null || vise === cibleLoupeVue.current) return;');
  });

  /** 🔴 LE MÊME CALCUL QUE L'ARRIVÉE EN ARBORESCENCE : deux façons de viser une ligne en viseraient deux. */
  it('🔴 c’est le calcul du module pur, pas un `scrollIntoView`', () => {
    const sansCommentaires = SFD.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(sansCommentaires).not.toContain('scrollIntoView');
  });
});
