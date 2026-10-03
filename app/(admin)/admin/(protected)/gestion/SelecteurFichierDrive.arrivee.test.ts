import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE — LE CÂBLAGE DE L'ARRIVÉE ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CALCUL est éprouvé dans `lib/gestion/arriveeArbre.test.ts`, avec des doublures et sans réseau. CE FICHIER
 * éprouve ce que seul le câblage peut dire : que la fenêtre part bien de la racine, qu'elle ne montre l'arbre
 * qu'une fois la branche entière en main, qu'elle demande le défilement, et — le plus important — QU'ELLE N'A
 * RIEN CHANGÉ POUR LES AUTRES POINTS D'ENTRÉE.
 *
 * 🔴 POURQUOI STATIQUEMENT, ET NON EN MONTANT LE COMPOSANT. Cette fenêtre fait 5 300 lignes, parle à quatre
 * routes Drive, lit `sessionStorage` et mesure des rectangles. La monter demanderait de doubler tout cela pour
 * éprouver UNE prop — et le doublage finirait par être ce qu'on éprouve. Les propriétés visées ici sont des
 * propriétés DU CODE (« la liste part de la racine », « le squelette couvre le dépliage ») : elles se lisent, et
 * ce sont elles qui ont cassé quand je me suis trompé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SFD = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';
const code = readFileSync(SFD, 'utf8');
/** Le source SANS ses commentaires : une règle doit être dans le CODE, pas seulement racontée au-dessus. */
const vif = code.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 ON PART DE LA RACINE — et un seul « où l'on est »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’arrivée en arborescence part de la racine', () => {
  /** 🔴 LE DÉFAUT EST `'dossier'` : tous les points d'entrée d'avant ce lot se comportent à l'identique. */
  it('🔴 le mode par défaut est l’arrivée d’avant ce lot', () => {
    expect(vif).toContain("arrivee = 'dossier',");
    expect(vif).toContain("const enArborescence = arrivee === 'arborescence' && dossierDepart !== null;");
  });

  /**
   * 🔴🔴 LES DEUX ENSEMBLE, ET C'EST LE CŒUR DU LOT. `histo` décide du fil d'Ariane et de « où l'on est » ;
   * `departInitial` décide de la liste qu'on charge. En poser un sans l'autre aurait donné une fenêtre qui dit
   * « racine » et affiche le dossier, ou l'inverse.
   */
  it('🔴🔴 l’historique ET la liste partent de la racine', () => {
    expect(vif).toContain('dossierDepart === null || enArborescence');
    expect(vif).toContain("departInitial = useRef<string>(enArborescence ? '' : (dossierDepart?.id ?? ''));");
  });

  /**
   * ══ 🔴🔴 LE FIL D'ARIANE N'EST PAS DÉTOURNÉ, ET C'EST UNE PROPRIÉTÉ DE SÛRETÉ ═════════════════════════════════
   *
   * Arno demandait « le fil d'Ariane en haut indique le chemin complet ». Il est affiché en haut, dans son propre
   * bandeau. Le fil d'Ariane, lui, continue de dire OÙ L'ON EST — parce que tout en dépend : « Déposer ici », le
   * lâcher dans la zone vide, « Nouveau dossier », et `joindreAutorise`, que le serveur rend POUR LE DOSSIER
   * AFFICHÉ.
   *
   * 🔴 LE PIÈGE ÉVITÉ, NOMMÉMENT : en arborescence la liste montre la racine. Faire dire au fil d'Ariane
   * « Drives partagés › Test › _MESURE » aurait appliqué le droit de joindre de `_MESURE` à des lignes venues de
   * « COMPTABILITE » — c'est-à-dire proposé « Joindre » sur un fichier de « Documents clients scannés » parce
   * qu'un AUTRE dossier le permettait. Ce test interdit que quelqu'un « corrige » cela un jour.
   */
  it('🔴🔴 le fil d’Ariane reste branché sur le chemin courant, pas sur celui du document', () => {
    expect(vif).toContain('const parents = bandeauParents(chemin,');
    expect(vif).toContain('const chemin = cheminCourant(histo);');
    // 🔴 `bandeauParents` ne voit JAMAIS le chemin de l'arrivée.
    expect(vif).not.toContain('bandeauParents(etatArrivee');
    // 🔴 ET LE DÉPÔT DANS LE VIDE SUIT LE DOSSIER COURANT, pas le document.
    expect(vif).toContain('const depotDansLeVide = dossierCourant !== null');
  });

  /** 🔴 LE CHEMIN COMPLET EST BIEN AFFICHÉ, dans son bandeau, et chaque cran navigue normalement. */
  it('🔴 le chemin complet est affiché et cliquable', () => {
    expect(vif).toContain('{MOT_CHEMIN_DOCUMENT}');
    expect(vif).toContain('onClick={() => allerA(etatArrivee.chemin.slice(0, i + 1))}');
  });

  /**
   * ══ ⚠️ LE BANDEAU RESTE APRÈS NAVIGATION, ET C'EST DÉLIBÉRÉ ══════════════════════════════════════════════════
   *
   * J'avais d'abord écrit le contraire dans le commentaire du composant — « le bandeau disparaît, on n'est plus
   * en arrivée » — et l'écran a montré qu'il restait. Le commentaire mentait, pas le code ; c'est le commentaire
   * qui a été corrigé, après avoir tranché.
   *
   * 🔴 CE BANDEAU N'EST PAS UN « OÙ SUIS-JE », c'est un FAIT sur le document cliqué, et ce fait reste vrai où
   * qu'on aille — il est même utile quand on part regarder ailleurs. L'éteindre aurait demandé de le faire dans
   * les QUATRE portes de navigation de cette fenêtre, et il suffit d'en oublier une pour qu'il survive par
   * endroits et pas par d'autres. Un état qu'on n'éteint jamais ne peut pas s'éteindre à moitié.
   *
   * ⚠️ CE TEST EXISTE POUR QUE LE CHOIX RESTE UN CHOIX : si quelqu'un ajoute l'extinction un jour, qu'il le
   * fasse dans les quatre portes, pas dans une.
   */
  it('⚠️ aucune porte de navigation n’éteint l’arrivée à moitié', () => {
    for (const porte of ['const allerA = useCallback', 'const pasArriere = ()', 'const pasAvant = ()',
      'const entrerDepuisRecherche = ']) {
      expect(vif, porte).toContain(porte);
    }
    /* 🔴 AUCUNE des quatre ne touche à `etatArrivee` : l'extinction est absente PARTOUT, donc jamais partielle. */
    const nav = vif.slice(vif.indexOf('const allerA = useCallback'), vif.indexOf('const revenirAuxResultats'));
    expect(nav).not.toContain('setEtatArrivee');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 « NE FAIS PAS APPARAÎTRE L'ARBRE À MOITIÉ DÉPLIÉ »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’état déplié n’apparaît qu’une fois entier', () => {
  /** 🔴 LE SQUELETTE COUVRE LE DÉPLIAGE : c'est la demande d'Arno, mot pour mot, et c'est cette ligne qui la tient. */
  it('🔴 le squelette couvre le dépliage de la branche', () => {
    expect(vif).toContain("vue.v === 'charge' || etatArrivee.e === 'deplie' ?");
    /**
     * ⚠️ ET C'EST LE SQUELETTE QUI EXISTAIT DÉJÀ. La propriété voulue n'est pas « il n'apparaît qu'une fois » —
     * c'est « il n'y a qu'UN DESSIN d'attente dans cette fenêtre ». J'avais d'abord écrit le compte, et le lot
     * CORBEILLE-DRIVE-REELLE-ET-SCROLL l'a fait rougir en réutilisant LE MÊME squelette pour la liste de la
     * corbeille : c'était pourtant exactement le comportement voulu. On éprouve donc la règle, pas le compte.
     */
    expect(vif).toContain('<ul className="sfd-squelette"');
    const classesDAttente = new Set((vif.match(/className="sfd-[a-z-]*squelette[a-z-]*"/g) ?? []));
    expect([...classesDAttente]).toEqual(['className="sfd-squelette"']);
  });

  /**
   * 🔴🔴 LA BRANCHE EST POSÉE D'UN SEUL COUP, APRÈS `Promise.all`. Un `setOuverts` par ancêtre, au fil des
   * réponses, aurait fait pousser l'arbre par saccades — et le défilement aurait couru après le document à chaque
   * nouveau cran.
   */
  it('🔴🔴 les ancêtres sont lus en parallèle, et dépliés ensuite', () => {
    expect(vif).toContain('await Promise.all(a.chemin.map(');
    expect(vif).toContain('setOuverts(new Set(atteints));');
    // 🔴 UN SEUL `setOuverts` dans tout l'effet d'arrivée : on ne déplie pas deux fois.
    const effet = vif.slice(vif.indexOf('const arriveeLancee'), vif.indexOf('}, [enArborescence]);'));
    expect((effet.match(/setOuverts\(/g) ?? []).length).toBe(1);
  });

  /**
   * 🔴🔴 `setOuverts` REMPLACE, IL N'AJOUTE PAS. L'arbre est retenu d'une ouverture à l'autre
   * (`sessionStorage`) : fusionner aurait laissé ouverts des dossiers d'un classement précédent à côté de la
   * branche — alors qu'Arno demande justement les autres dossiers REPLIÉS, pour qu'on voie la branche.
   */
  it('🔴🔴 la branche remplace le dépliage retenu, elle ne s’y ajoute pas', () => {
    const effet = vif.slice(vif.indexOf('const arriveeLancee'), vif.indexOf('}, [enArborescence]);'));
    expect(effet).toContain('setOuverts(new Set(atteints));');
    // 🔴 La forme fusionnante (`(o) => new Set([...o, …])`) serait le défaut : on l'interdit en négatif.
    expect(effet).not.toContain('setOuverts((o)');
  });

  /**
   * 🔴 LE CONTENU EST POSÉ AVEC L'ÉTAT, et c'est le défaut du 29/09/2026 qu'on refuse de rejouer : des dossiers
   * marqués ouverts (triangle ▾) et RIEN dessous, qu'un premier clic REFERMAIT.
   */
  it('🔴 le contenu des ancêtres est posé en même temps que leur état', () => {
    const effet = vif.slice(vif.indexOf('const arriveeLancee'), vif.indexOf('}, [enArborescence]);'));
    expect(effet).toContain('setEnfants((m) =>');
    expect(effet).toContain('cache.current.set(e.id, r);');
    expect(effet).toContain('enfantsDemandes.current.add(e.id);');
  });

  /**
   * 🔴🔴 LA BORNE DE PROFONDEUR EST DESSERRÉE POUR LA BRANCHE. Le Drive du cabinet fait treize niveaux : sans
   * cela, l'aplatissement se serait arrêté AVANT le document sur tout chemin de plus de six crans — et sans
   * rien dire, puisque chaque cran reste marqué « déplié ».
   */
  it('🔴🔴 la profondeur de la branche desserre la borne de l’aplatissement', () => {
    expect(vif).toContain("{ profondeurMax: etatArrivee.e === 'pose' ? etatArrivee.profondeur : 0 }");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 L'ÉLÉMENT SURLIGNÉ — un seul dessin, celui de la loupe
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le document est surligné', () => {
  /**
   * 🔴 LE REPÈRE EST CELUI DE LA LOUPE, et ce lot n'en ajoute AUCUN. C'est lui qui donne la barre ambrée à
   * gauche, le fond doré et la petite loupe qu'Arno décrit — ils existaient déjà
   * (`.sfd-ligne--trouve`, `.sfd-repere`). Un second dessin aurait dû cohabiter avec le premier dans le même
   * arbre, et l'un des deux aurait fini par mentir.
   */
  it('🔴 c’est le surlignage existant, sur le document ET sur ses dossiers', () => {
    expect(vif).toContain('void basculerLoupe(`evidence:${id}`, id);');
    expect(vif).toContain("surlignage.fichiers.has(f.id) ? ' sfd-ligne--trouve' : ''");
    expect(vif).toContain("surlignage.reperes.has(f.id) && !surlignage.fichiers.has(f.id) ? ' sfd-ligne--chemin'");
    // ⚠️ AUCUNE CLASSE DE SURLIGNAGE NEUVE : la liste des dessins de mise en évidence n'a pas bougé.
    expect(vif).not.toContain('sfd-ligne--arrivee');
  });

  /**
   * 🔴 LE SURLIGNAGE SUIT LES LIGNES RÉELLEMENT AFFICHÉES : c'est ce qui fait descendre le repère tout seul
   * jusqu'au document quand la branche se déplie, sans qu'on ait à le recalculer pour l'arrivée.
   */
  it('🔴 il se recale sur les lignes affichées', () => {
    expect(vif).toContain('const affichees = new Set<string>(lignes.map((l) => l.entree.id));');
    expect(vif).toContain('return surlignageDe(occurrences, affichees);');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LE DÉFILEMENT DEMANDÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la liste défile jusqu’au document', () => {
  /**
   * 🔴🔴 PAS `scrollIntoView`, ET C'EST UNE CONTRAINTE, PAS UN GOÛT. La liste est VIRTUALISÉE : la ligne du
   * document n'existe pas dans le document HTML tant qu'on n'a pas défilé jusqu'à elle. Il n'y a rien sur quoi
   * appeler `scrollIntoView` — c'est la première chose que j'ai essayée.
   */
  it('🔴🔴 le défilement est CALCULÉ, pas délégué au navigateur', () => {
    expect(vif).toContain('defilementPourCentrer(i, lignes.length, hauteurVue, HAUTEUR_LIGNE)');
    expect(vif).not.toContain('scrollIntoView');
  });

  /**
   * ⚠️ LES DEUX ENSEMBLE : le nœud (qui fait défiler pour de vrai) et l'état (qui décide de la fenêtre
   * virtualisée). L'un sans l'autre aurait soit défilé devant une liste qui ne rend pas les bonnes lignes, soit
   * rendu les bonnes lignes sans bouger la barre.
   */
  it('⚠️ le nœud ET l’état de défilement sont posés', () => {
    /* ⚠️ RECADRÉ PAR LE POINT 3 DU LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL : on pose la valeur dans le nœud, PUIS
       on relit ce que le navigateur a vraiment retenu (il borne au contenu existant), et c'est cette lecture qui
       part dans l'état. Voir l'épreuve « l'état reçoit ce que le navigateur a VRAIMENT posé ». */
    expect(vif).toContain('scene.current.scrollTop = y;');
    expect(vif).toContain('setScrollTop(pose);');
  });

  /** ⚠️ UNE SEULE FOIS : `lignes` est un tableau neuf à chaque rendu, sans garde la vue serait ramenée sans cesse. */
  it('⚠️ il ne se rejoue pas à chaque rendu', () => {
    expect(vif).toContain('if (etatArrivee.e !== \'pose\' || defilementArriveeFait.current) return;');
    expect(vif).toContain('defilementArriveeFait.current = true;');
  });

  /** ⚠️ ET IL ATTEND QUE LA LIGNE EXISTE : elle n'apparaît qu'au rendu où les enfants du dernier cran sont posés. */
  it('⚠️ il ne force rien quand la ligne n’est pas encore là', () => {
    expect(vif).toContain('if (i < 0) return;');
  });

  /**
   * ══ 🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL, POINT 3 — LA MAIN DE LA PERSONNE A TOUJOURS RAISON ══════════════
   *
   * RÈGLE D'ARNO : « le centrage se fait UNE SEULE FOIS par arrivée, et il est ABANDONNÉ dès que l'utilisateur
   * agit (molette, trackpad, toucher, clavier, glisser la barre). »
   *
   * CE QUE CELA RÉPARE, ET POURQUOI C'ÉTAIT INÉVITABLE SANS ÇA : le centrage ATTEND que la ligne du document
   * existe, donc une à deux secondes après le clic. Si la personne défile pendant ce temps, le centrage arrivait
   * APRÈS et ramenait la vue de force. Du siège de celui qui tient la souris, cela se voit exactement comme
   * « ça vibre, puis ça se fige » : la liste se bat contre la main.
   *
   * MESURÉ À L'ÉCRAN, les deux sens :
   *   · sans geste            → scrollTop 134, document centré (272 px contre 255 de centre de zone) ;
   *   · molette pendant l'arrivée → scrollTop 0, AUCUN centrage. Le geste a gagné.
   */
  it('🔴🔴 les cinq gestes abandonnent le centrage', () => {
    for (const geste of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      expect(vif, geste).toContain(`el.addEventListener('${geste}', abandonner, o)`);
      expect(vif, `${geste} / retiré`).toContain(`el.removeEventListener('${geste}', abandonner, o)`);
    }
    /* 🔴 ET L'ABANDON DÉCLARE L'ARRIVÉE FINIE : le préchargement reporté démarre, au lieu d'attendre un centrage
       qui n'aura plus lieu. On ne suspend pas une fonction sur une attente qu'on vient d'annuler. */
    expect(vif).toContain('defilementArriveeFait.current = true;\n      setArriveeAchevee(true);');
  });

  /** ⚠️ ON N'EMPÊCHE RIEN ET ON NE RETARDE RIEN : écouteurs passifs, en capture. */
  it('⚠️ les écouteurs sont passifs — ils apprennent, ils n’interviennent pas', () => {
    expect(vif).toContain('const o = { passive: true, capture: true } as const;');
    const ecoute = vif.slice(vif.indexOf('const abandonner = (): void =>'), vif.indexOf("el.addEventListener('wheel'"));
    expect(ecoute).not.toContain('preventDefault');
    expect(ecoute).not.toContain('stopPropagation');
  });

  /**
   * ══ 🔴🔴 L'ÉTAT ET LE NŒUD NE PEUVENT PLUS SE CONTREDIRE ══════════════════════════════════════════════════════
   *
   * On posait la même valeur dans le nœud ET dans l'état. Mais le navigateur BORNE un `scrollTop` au contenu qui
   * existe à cet instant — et à l'arrivée, le contenu grandit encore. Le nœud se retrouvait donc à une position
   * et l'état à une autre. Or c'est l'ÉTAT qui décide des lignes rendues (`fenetreVisible`) : la liste calculait
   * sa fenêtre pour un endroit où la barre n'était pas, et l'on voyait une zone VIDE à la place des lignes.
   *
   * ⚠️ DEVINER LA BORNE (`scrollHeight - clientHeight`) AURAIT RECOPIÉ UNE RÈGLE DU NAVIGATEUR. On la lui demande.
   */
  it('🔴🔴 l’état reçoit ce que le navigateur a VRAIMENT posé', () => {
    expect(vif).toContain('pose = scene.current.scrollTop;');
    expect(vif).toContain('setScrollTop(pose);');
    /* 🔴 ET PLUS LA VALEUR VOULUE : c'est le défaut qu'on vient de retirer. */
    expect(vif).not.toContain('setScrollTop(y);');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ bis 🔴🔴 LE PRÉCHARGEMENT EST REPORTÉ, JAMAIS BRIDÉ (arbitrage d'Arno, 04/10/2026)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le préchargement attend la fin de l’arrivée', () => {
  /**
   * ARBITRAGE D'ARNO, après la mesure du lot précédent : « le préchargement à l'arrivée par le picto n'est ni
   * retiré ni bridé. Il est REPORTÉ jusqu'à ce que l'arrivée soit finie (arbre déplié + document centré). Ensuite
   * il démarre normalement. »
   *
   * CE QUI AVAIT ÉTÉ MESURÉ : 4 `files.list` pour la branche, et 38 de plus de préchargement — partis PENDANT que
   * l'arrivée se montait, donc en concurrence du réseau avec la branche qu'on attend.
   */
  it('🔴 l’effet de préchargement est gardé par la fin de l’arrivée', () => {
    expect(vif).toContain('if (!arriveeAchevee) return;');
    expect(vif).toContain('for (const [, liste] of enfants) prechargerLesSousDossiers(liste);');
    expect(vif).toContain('}, [enfants, prechargerLesSousDossiers, arriveeAchevee]);');
  });

  /**
   * 🔴 RIEN N'EST RETIRÉ : hors arrivée en arborescence, l'état vaut VRAI dès le premier rendu, donc les autres
   * points d'entrée de la fenêtre ne voient aucune différence. C'est ce que « ni retiré ni bridé » exige.
   */
  it('🔴 hors arborescence, rien n’attend', () => {
    expect(vif).toContain('useState<boolean>(!enArborescence)');
  });

  /**
   * 🔴 L'ARRIVÉE SE TERMINE AU CENTRAGE, et aussi quand il n'y a RIEN à centrer. Sans ce second cas,
   * `arriveeAchevee` resterait faux pour la vie de la fenêtre et le préchargement ne repartirait jamais — on ne
   * suspend pas une fonction sur une attente qui n'aura pas lieu.
   */
  it('🔴🔴 l’arrivée se termine aussi quand il n’y a rien à centrer', () => {
    expect(vif).toContain("if (id === '' || etatArrivee.message !== null) {");
    /**
     * ⚠️ TROIS SORTIES POSENT LA FIN DE L'ARRIVÉE, et il faut les trois : le centrage lui-même, le cas « rien à
     * centrer », et — ajouté au point 3 — l'ABANDON quand la personne agit. En oublier une suspendrait le
     * préchargement pour toute la vie de la fenêtre.
     */
    expect((vif.match(/setArriveeAchevee\(true\);/g) ?? []).length).toBe(3);
  });

  /** ⚠️ UN ÉTAT, ET NON UNE RÉFÉRENCE : une référence ne provoque pas de rendu, donc l'effet ne repartirait pas. */
  it('⚠️ c’est un état, pas une référence', () => {
    expect(vif).toContain('const [arriveeAchevee, setArriveeAchevee] = useState');
    expect(vif).not.toContain('arriveeAchevee.current');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LE REPLI — « pas d'écran vide »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ce qui se passe quand on ne peut pas tout déplier', () => {
  const effet = vif.slice(vif.indexOf('const arriveeLancee'), vif.indexOf('}, [enArborescence]);'));

  /**
   * 🔴 LE REPLI EST LE COMPORTEMENT QUI MARCHAIT DÉJÀ : on se pose DANS le dossier, exactement comme avant ce
   * lot. « Pas d'écran vide » (règle d'Arno) — et jamais un écran de secours à part, qu'il faudrait éprouver en
   * plus et que personne ne verrait jamais.
   */
  it('🔴 le repli se pose dans le dossier, comme avant le lot', () => {
    expect(effet).toContain('const seReplier = (message: string): void => {');
    expect(effet).toContain('setHisto(naviguerVers(HISTORIQUE_DEPART, [cible]));');
    expect(effet).toContain('void charger(cible.id);');
  });

  /**
   * 🔴🔴 LES TROIS CAUSES SONT DISTINGUÉES, et chacune a sa phrase (voir `arriveeArbre`) : un ancêtre refusé est
   * une question de DROITS, un document absent est un déplacement, une chaîne irremontable est un chemin qu'on
   * ne sait pas situer. Un seul message « ça n'a pas marché » aurait fait chercher la panne au mauvais endroit.
   */
  it('🔴🔴 chaque cause de repli dit laquelle elle est', () => {
    expect(effet).toContain('messageRacineInconnue(cible.nom)');
    expect(effet).toContain('messageAncetreInaccessible(branche.premierManquant.nom)');
    expect(effet).toContain('messageDocumentAbsent(');
  });

  /** 🔴 LE DOCUMENT ABSENT EST CONSTATÉ, pas supposé : on regarde s'il est dans le contenu qu'on vient de lire. */
  it('🔴 « le fichier n’existe plus » se constate sur le contenu lu', () => {
    expect(effet).toContain('(contenus.get(dernier.id) ?? []).some((f) => f.id === documentId)');
  });

  /** ⚠️ ET UN SEUL CRAN LU SUFFIT À DÉPLIER : on n'exige pas la branche entière pour montrer quelque chose. */
  it('⚠️ une branche partielle est montrée, pas jetée', () => {
    expect(effet).toContain('brancheAtteignable(a.chemin, lus)');
    expect(effet).toContain('if (branche.atteints.length === 0) {');
  });

  /**
   * ══ 🔴🔴 LE DÉFAUT QUE J'AI INTRODUIT, ET QUE L'ÉCRAN A ATTRAPÉ — 04/10/2026 ═══════════════════════════════════
   *
   * J'avais écrit le réflexe : un `let annule = false`, mis à `true` par la fonction de nettoyage, testé avant
   * chaque `setState`. LA FENÊTRE EST RESTÉE SUR SON SQUELETTE, INDÉFINIMENT, sur « test gigout.pdf ». Trouvé en
   * lisant les appels réseau : le dossier du document ET la racine étaient lus, puis plus rien — aucun appel pour
   * les ancêtres, aucun message, aucune erreur.
   *
   * LA CAUSE : React monte DEUX FOIS en développement. Premier montage, l'effet part et pose la référence ;
   * nettoyage, `annule = true` ; second montage, la référence dit « déjà lancé » et l'effet ne fait rien. La
   * lecture du premier montage se terminait bien, et JETAIT son résultat. Les deux gardes, chacune raisonnable,
   * s'annulaient l'une l'autre.
   *
   * 🔴 CE TEST INTERDIT LE RÉFLEXE DE REVENIR : la référence est la seule garde, et elle suffit — elle survit au
   * remontage, donc la branche n'est lue qu'une fois, ce qui est exactement ce qu'on veut (ce sont des appels à
   * Google). Un `setState` sur un composant démonté est un non-événement sous React 19.
   */
  it('🔴🔴 aucun drapeau d’annulation ne peut jeter la branche lue', () => {
    expect(effet).toContain('if (!enArborescence || dossierDepart === null || arriveeLancee.current) return;');
    expect(effet).toContain('arriveeLancee.current = true;');
    for (const reflexe of ['let annule', 'if (annule)', 'annule = true']) {
      expect(effet, reflexe).not.toContain(reflexe);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔒🔒 CE QUE LE LOT N'A PAS CHANGÉ — « ne retire, ne masque et ne conditionne rien d'existant »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 rien d’existant n’est retiré ni conditionné', () => {
  /**
   * 🔒🔒 LES AUTRES POINTS D'ENTRÉE GARDENT L'ARRIVÉE « dossier ». Arno : « c'est seulement le mode d'ARRIVÉE par
   * le picto ». `RattachementsDuFil` ouvre la fenêtre sur le dossier du bien, et il ne doit RIEN voir de ce lot.
   */
  it('🔒🔒 seuls les deux écrans du picto demandent l’arborescence', () => {
    const avec = ['PiecesJointes', 'Conversation']
      .map((f) => readFileSync(`app/(admin)/admin/(protected)/gestion/${f}.tsx`, 'utf8'));
    for (const src of avec) expect(src).toContain('arrivee="arborescence"');
    const rattachements = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(rattachements).not.toContain('arrivee=');
  });

  /** 🔒 LA VUE LISTE, LE DÉPLIAGE À LA MAIN ET LA NAVIGATION SONT INTACTS : aucun geste n'est désactivé. */
  it('🔒 les gestes de la fenêtre ne sont pas conditionnés par l’arrivée', () => {
    expect(vif).toContain('const basculerDepliage = useCallback((f: Fichier) => {');
    // 🔒 AUCUN GESTE N'EST GARDÉ PAR L'ÉTAT D'ARRIVÉE : il ne sert qu'à l'affichage et au défilement.
    for (const garde of [
      "etatArrivee.e === 'pose' && basculer", "etatArrivee.e !== 'pose' ? undefined",
      'disabled={etatArrivee', 'etatArrivee.e === \'deplie\' ? undefined',
    ]) {
      expect(vif, garde).not.toContain(garde);
    }
  });

  /**
   * 🔒 LE RETRAIT DE 20 px ET LES TRAITS PAR NIVEAU DU LOT PRÉCÉDENT SONT CONSERVÉS (demande d'Arno) : ils
   * viennent du module pur, et ce lot n'y touche pas.
   */
  it('🔒 le retrait et les guides de niveau sont toujours ceux du module', () => {
    expect(vif).toContain('retraitLigne(profondeur)');
    expect(vif).toContain('guidesNiveaux(');
    const finder = readFileSync('app/lib/gestion/finderDrive.ts', 'utf8');
    expect(finder).toContain('export const RETRAIT_NIVEAU_PX = 20;');
  });

  /**
   * 🔴 LE BANDEAU EST LISIBLE EN CLAIR ET EN SOMBRE, et c'est la méthode qui l'assure : aucune couleur de texte
   * ni de fond en dur, et l'ambre MÉLANGÉ au fond courant (`color-mix`) comme le fait déjà la ligne surlignée.
   * Une teinte opaque aurait été juste dans un thème et illisible dans l'autre.
   */
  it('🔴 le bandeau du chemin suit le thème', () => {
    const bloc = code.slice(code.indexOf('.sfd-chemin-doc{'), code.indexOf('.sfd-outils-droite{'));
    expect(bloc).toContain('color-mix(in srgb, #f0a202 12%, transparent)');
    expect(bloc).toContain('color:var(--color-svv-ink)');
    expect(bloc).toContain('color:var(--color-svv-muted)');
    // ⚠️ Aucune couleur de TEXTE en dur : seules les teintes d'accent (l'ambre du repère) sont nommées.
    expect(bloc.match(/color:#/g)).toBeNull();
  });

  /**
   * ⚠️ LE PIÈGE DU DÉPÔT, VU DOUZE FOIS : un accent grave dans un commentaire CSS termine le littéral de
   * gabarit et casse la compilation (TS1005). Le bloc neuf est vérifié ici, à côté de la règle qu'il porte.
   */
  it('⚠️ aucun accent grave dans le bloc CSS neuf', () => {
    const bloc = code.slice(code.indexOf('LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE — LE BANDEAU'),
      code.indexOf('.sfd-outils-droite{'));
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc).not.toContain('`');
  });
});
