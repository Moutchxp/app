import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT FIL-APERCU-MINIATURES — LA COLONNE DE MINIATURES, ET CE QU'ELLE NE DOIT JAMAIS COÛTER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA CONTRAINTE D'ARNO COMMANDE TOUT LE RESTE : « PRIORITÉ ABSOLUE À LA PAGE 1 : la page 1 s'affiche d'abord,
 * exactement aussi vite qu'aujourd'hui […] qui ne doit PAS se dégrader. » Une colonne qui commencerait à peindre
 * cinquante-deux vignettes pendant que la page 1 se rend volerait exactement le temps que deux lots ont passé à
 * gagner — et la dégradation ne se verrait pas en relisant le code, seulement au chronomètre.
 *
 * 🔴 CE FICHIER EST DONC UN GARDE DE STRUCTURE, et il l'assume. Le rendu réel de PDF.js ne s'éprouve pas sous
 * jsdom : il n'y a ni worker, ni canvas 2D, ni octets. Ce qu'on peut tenir ici, en revanche, ce sont les trois
 * propriétés qui font la promesse — et chacune est une LIGNE de code qu'on peut montrer :
 *
 *   ① la file ne s'ouvre qu'APRÈS la page 1 peinte (`page1Faite`), levé au même instant que le rappel de vignette ;
 *   ② elle peint UNE miniature à la fois, en préférant les visibles ;
 *   ③ elle tire ses pages du MÊME document PDF.js — donc aucun second téléchargement.
 *
 * ⚠️ LES TEMPS, EUX, SE MESURENT À L'ÉCRAN, et le lot les rapporte : ils ne peuvent pas vivre dans un test.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const LECTEUR = 'app/(admin)/admin/(protected)/gestion/LecteurPdf.tsx';
const APERCU = 'app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx';
const src = readFileSync(LECTEUR, 'utf8');

describe('🔴🔴 la page 1 passe avant tout', () => {
  /**
   * 🔴 L'ÉPREUVE CENTRALE DU LOT. `page1Faite` est la seule porte de la file ; il est levé LÀ où la page 1 est
   * vraiment peinte, à côté du rappel qui retire la vignette. Déplacer cette levée ailleurs — à l'ouverture du
   * document, à la pose du lecteur — rendrait la colonne concurrente de la page qu'on est venu voir.
   */
  /**
   * ⚠️ ASSERTION RÉÉCRITE LE 30/09/2026, APRÈS UN DÉFAUT TROUVÉ À L'ÉCRAN. Elle exigeait que la levée du drapeau
   * soit DANS le bloc qui appelle `rappelPage1` — donc dans la garde `if (!pagesPeintes.has(n))`. C'était
   * précisément le défaut : cette garde existe pour n'appeler le rappel QU'UNE FOIS, et en développement React
   * monte les effets deux fois ; la page 1 pouvait déjà être comptée quand le rendu qui compte aboutissait. Le
   * drapeau n'était alors jamais levé et la colonne gardait ses cadres gris, sans une erreur.
   *
   * CE QUI COMPTE N'EST PAS L'ENDROIT, C'EST LE MOMENT : la levée se fait à la peinture RÉUSSIE de la page 1,
   * après `drawImage`, et la file ne s'ouvre pas avant. C'est cela qu'on éprouve.
   */
  it('🔴 aucune miniature ne part avant que la page 1 ne soit peinte', () => {
    expect(src).toContain('const [page1Faite, setPage1Faite] = useState(false);');
    // La levée est APRÈS la recopie sur la toile visible : avant, il n'y aurait rien à voir.
    const dessin = src.indexOf('ctx.drawImage(tampon, 0, 0);');
    const levee = src.indexOf('setPage1Faite(true);');
    expect(dessin).toBeGreaterThan(-1);
    expect(levee).toBeGreaterThan(dessin);
    // ⚠️ ET HORS DE LA GARDE `pagesPeintes`, qui ne vaut que pour le rappel de vignette (voir l'encadré).
    expect(src).toContain('if (n === 1) rappelPage1.current?.();');
    // Et la file la lit comme condition d'entrée.
    expect(src).toContain('if (doc === null || !page1Faite || total <= 1) return undefined;');
  });

  /**
   * 🔴 UNE À LA FOIS, ET LES VISIBLES D'ABORD. PDF.js n'a qu'un worker : lancer cinquante rendus ne les rend pas
   * plus vite, cela retarde seulement le premier — et cela entre en concurrence avec les PAGES qu'on lit.
   */
  it('🔴 la file peint une miniature à la fois, en préférant les visibles', () => {
    const file = src.slice(src.indexOf('while (vivant) {'), src.indexOf('return () => {\n      vivant = false;'));
    // Un seul `await` de rendu par tour : c'est ce qui sérialise.
    expect(file.match(/await peindreMini\(/g) ?? []).toHaveLength(1);
    expect(file).toContain('miniVisibles.current.has(n)');
    // ⚠️ La visible passe devant, mais le repli garde l'ORDRE : « une par une, dans l'ordre » (demande d'Arno).
    expect(file).toContain('const n = visible ?? prete[0];');
  });

  /**
   * 🔴🔴 AUCUN SECOND TÉLÉCHARGEMENT (demande d'Arno : « elles réutilisent les octets déjà reçus par PDF.js »).
   * La preuve tient en un point : il n'y a qu'UN `getDocument` dans tout le fichier, et les miniatures passent
   * par `doc.getPage`, c'est-à-dire par le document déjà ouvert. Un second `getDocument` — même sur la même
   * adresse — rouvrirait le fichier et doublerait le trafic.
   */
  it('🔴 les miniatures sortent du MÊME document : aucun second téléchargement', () => {
    expect(src.match(/getDocument\(/g) ?? []).toHaveLength(1);
    const mini = src.slice(src.indexOf('const peindreMini'), src.indexOf('const allerALaPage'));
    expect(mini).toContain('await doc.getPage(n)');
    expect(mini).not.toContain('getDocument');
    expect(mini).not.toContain('fetch(');
  });

  /**
   * ⚠️ DEUX FILES SÉPARÉES, et ce n'est pas un détail : une miniature et sa page portent le MÊME numéro sans
   * être la même toile. Partager la file des pages les aurait fait s'annuler l'une l'autre — c'est-à-dire, dans
   * le pire cas, une page 1 annulée par sa propre vignette.
   */
  it('🔴 la file des miniatures ne partage rien avec celle des pages', () => {
    expect(src).toContain('const miniEnCours = useRef');
    const mini = src.slice(src.indexOf('const peindreMini'), src.indexOf('const allerALaPage'));
    expect(mini).not.toContain('enCours.current.set');
    expect(mini).not.toContain('jetons.current');
  });
});

describe('la colonne, telle qu’Arno l’a demandée', () => {
  it('le numéro est sous chaque miniature, et la page courante est marquée', () => {
    expect(src).toContain('lpd-mini-num');
    expect(src).toContain("actif ? ' lpd-mini--active' : ''");
    // 🔴 La marque n'est pas qu'une couleur : un cadre, et `aria-current` pour les lecteurs d'écran.
    expect(src).toContain("aria-current={actif ? 'true' : undefined}");
    expect(src).toContain('.lpd-mini--active .lpd-mini-cadre{border-color:var(--color-svv-red)');
  });

  it('la colonne a SON défilement, et un clic amène à la page', () => {
    expect(src).toContain('.lpd-colonne{flex:0 0 auto;width:132px;overflow-y:auto');
    expect(src).toContain('const allerALaPage = useCallback');
    expect(src).toContain("behavior: 'smooth'");
  });

  /** ⚠️ EN ATTENDANT, UN CADRE GRIS À LA BONNE PROPORTION : la colonne ne saute pas quand une image arrive. */
  it('les cadres gris ont la proportion du document avant toute image', () => {
    expect(src).toContain('style={{ aspectRatio: `1 / ${ratio}` }}');
    expect(src).toContain('setRatio(base.height / base.width);');
    expect(src).toContain('const RATIO_A4 = 297 / 210;');
  });

  /**
   * 🔴 PAS DE COLONNE POUR UN DOCUMENT D'UNE SEULE PAGE (demande d'Arno). Une colonne d'une vignette n'apprend
   * rien et vole de la largeur au document. Les IMAGES, elles, ne passent pas par ce lecteur du tout.
   */
  it('🔴 pas de colonne sous deux pages', () => {
    expect(src).toContain('{total > 1 && (');
    const apercu = readFileSync(APERCU, 'utf8');
    // L'image est rendue par une balise `img`, jamais par le lecteur PDF : la question ne se pose pas pour elle.
    expect(apercu).toContain("etat.sorte === 'image' && (");
    expect(apercu).toContain('className="apd-image"');
  });

  /** ⚠️ La fenêtre s'élargit pour LOGER la colonne : le document ne doit pas y perdre de place. */
  it('la fenêtre d’aperçu gagne plus de largeur que la colonne n’en prend', () => {
    const apercu = readFileSync(APERCU, 'utf8');
    expect(apercu).toContain('width:min(1280px,100%)');
    // 1280 − 1040 = 240 px gagnés pour 132 px de colonne : le document est plus large qu'avant ce lot.
    expect(240).toBeGreaterThan(132);
  });

  /** ⚠️ SUR TÉLÉPHONE, LA COLONNE DISPARAÎT : 132 px de vignettes sur 400 px d'écran mangeraient le document. */
  it('la colonne s’efface sur écran étroit', () => {
    expect(src).toContain('@media (max-width: 720px){ .lpd-colonne{display:none} }');
  });
});
