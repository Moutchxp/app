/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT FRISE-HORODATAGE-SECONDE-ET-PICTOS (08/10/2026) — L'HEURE À LA SECONDE, ET TROIS PICTOS EN BAS ══════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   A. « Chaque carré ET chaque point d'information porte un horodatage de création à la seconde près (date +
 *      heure:minute:seconde, fuseau Europe/Paris), posé automatiquement par le serveur au moment de la création. »
 *      « L'ordre chronologique de référence = cet horodatage de création (à la seconde), carrés et points mêlés. »
 *      « La couleur de la ligne sous la carte compare la place réelle à cette référence : VERT si le carré est à
 *      sa place chronologique, ORANGE s'il a été déplacé hors de sa place. »
 *      « La ligne verte/orange sous chaque carte affiche désormais : “créée le JJ/MM/AAAA · HH:MM:SS”. »
 *      « Cartes existantes : rien ne doit bouger à l'écran. »
 *   B. « En bas de chaque carré, une rangée de 3 pictos centrée […] ① ✎ crayon = modifier les infos du carré ;
 *      ② “i” = au SURVOL, affichage INSTANTANÉ (sans délai) d'une bulle avec le texte saisi dans le champ
 *      “Texte” de la carte ; si le texte est vide, “i” grisé et bulle “Aucun commentaire” ; ③ “…” = le menu
 *      actuel, inchangé. » « Même rangée de 3 pictos sur Ouverture, Clôture, Réouverture et Clôture Monga. »
 *      « Tous les textes du carré au-dessus des pictos sont CENTRÉS, ligne par ligne. »
 *
 * 🔴 CE QUE CE FICHIER TIENT, ET QUE LE RESTE DE LA SUITE NE TIENT PAS : les règles qui vivent dans le BALISAGE
 * et la FEUILLE de l'écran — une rangée dans le flux, un crayon qui n'existe que là où il mène quelque part, une
 * bulle rendue hors du conteneur qui coupe. Les règles PURES (la mention à la seconde, la suite chronologique)
 * sont éprouvées dans `app/lib/gestion/frise.test.ts`, sur les fonctions elles-mêmes.
 *
 * ⚠️ POURQUOI ON LIT LE FICHIER SOURCE. Ce composant est un `'use client'` de 2 300 lignes qui tire la frise
 * d'une route : le monter demanderait un navigateur et un serveur. On éprouve donc ce qui est VÉRIFIABLE sans
 * eux — la présence de la règle, et l'endroit où elle est posée —, et l'écran lui-même est vérifié à la main,
 * capture à l'appui (`app/.captures/frise-horodatage-pictos/`). C'est la méthode déjà suivie par
 * `friseCouleursDates.test.ts` et `friseOrdrePose.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
/** La feuille de l'écran, isolée : plusieurs épreuves y cherchent une règle précise. */
const FEUILLE = (/const CSS_FRISE_AVANCEMENT = `([\s\S]*?)\n`;/.exec(FRISE)?.[1] ?? '');

describe('🔴🔴 ① l’horodatage de création, à la seconde et dans le bon fuseau', () => {
  /**
   * 🔴🔴 LE FUSEAU EST NOMMÉ EN SQL, ET C'EST LÀ QU'IL DOIT L'ÊTRE. Arno dit « fuseau Europe/Paris » ; un
   * `cree_le::text` rend l'horodatage dans le fuseau de la SESSION — Europe/Paris sur ce poste (`SHOW TimeZone`
   * vérifié le 08/10/2026), mais UTC sur un serveur ordinaire, soit deux heures d'écart l'été. L'heure que
   * l'internaute lit ne doit pas dépendre de la configuration de la connexion.
   *
   * ⚠️ ET SURTOUT PAS DANS LE NAVIGATEUR : un `Date` construit côté écran rendrait l'heure du poste qui regarde.
   */
  it('🔴🔴 le dépôt rend l’heure de création en Europe/Paris, à la seconde', () => {
    expect(REPO).toContain("to_char(e.cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS cree_le");
    /* ⚠️ ET LE TRI DU SELECT RESTE CELUI DE LA POSE : l'horodatage est la RÉFÉRENCE, pas l'ordre affiché. */
    expect(REPO).toContain('ORDER BY e.rang_pose NULLS LAST, e.survenu_le, e.id');
  });

  /**
   * 🔴🔴 CARRÉS **ET** POINTS, MÊLÉS — et c'est une correction, pas un ajout. Le calcul du vert et de l'orange
   * ne portait que sur les cartes : un carré glissé par-dessus un point paraissait donc à sa place. Les points
   * n'affichent pas la mention, mais ils OCCUPENT UN RANG, et les ignorer faisait mentir leurs voisins.
   *
   * ⚠️ `etapes` PORTE LES DEUX : `construireFrise` sépare ensuite majeures et repères, mais la table est la
   * même (`gestion_monga_etape`), et c'est d'elle qu'on part.
   */
  it('🔴🔴 la référence chronologique mêle les carrés et les points', () => {
    expect(FRISE).toContain('const deplacees = cartesHorsChronologie(');
    expect(FRISE).toContain("[...etapes].filter((x) => x.certitude !== 'ecartee').sort(parOrdreDePose)");
    expect(FRISE).toContain('.map((x) => ({ cle: `e${x.id}`, creeLe: x.creeLe })));');
  });

  /**
   * 🔴 « Toute nouvelle carte ou point se place selon lui, donc au bout à droite » (point 2) — et c'est le
   * dépôt qui le garantit, en donnant à la nouvelle ligne le rang de pose le plus haut de l'ÉVÉNEMENT, points
   * compris. Rien de neuf dans ce lot : la règle vient du lot FRISE-ORDRE-POSE-ET-GLISSER, et ce cas la TIENT.
   */
  it('🔴 une carte posée prend le dernier rang, carrés et points confondus', () => {
    expect(REPO).toContain('(SELECT coalesce(max(x.rang_pose), 0) + 1 FROM gestion_monga_etape x');
  });
});

describe('🔴🔴 ② la rangée de trois pictos, en bas et centrée', () => {
  /**
   * 🔴🔴 DANS LE FLUX, ET NON EN ABSOLU — c'est ce qui garantit qu'elle ne recouvre jamais le texte. Le menu
   * « … » était `position:absolute` dans le coin haut droit ; c'est précisément ce qui empêchait de centrer le
   * titre (lot FRISE-ORDRE-POSE-ET-GLISSER : « une marge à droite, et elle est nécessaire »).
   *
   * ⚠️ LE CONTENEUR DE TEXTE POUSSE (`flex:1 1 auto`) : la rangée reste collée au BAS du carré, qu'il y ait une
   * ligne de titre ou trois. Sans cela, elle remonterait contre le texte sur une carte courte.
   */
  it('🔴🔴 la rangée est dans le flux, centrée, et poussée en bas du carré', () => {
    expect(FEUILLE).toContain('.fav-pictos{display:flex;align-items:center;justify-content:center;');
    expect(FEUILLE).not.toContain('.fav-pictos{position:absolute');
    expect(FEUILLE).toContain('flex:1 1 auto;\n  font:inherit;text-align:center;');
  });

  /**
   * 🔴🔴 LES TROIS, DANS L'ORDRE D'ARNO : ✎ puis « i » puis « … ». L'ordre est celui du balisage, et il se lit.
   */
  it('🔴🔴 les trois pictos sont là, dans l’ordre ✎ puis « i » puis « … »', () => {
    const rangee = FRISE.slice(FRISE.indexOf('<span className="fav-pictos">'));
    const fin = rangee.indexOf('</span>\n      </div>');
    const bloc = rangee.slice(0, fin);
    expect(bloc.indexOf('✎')).toBeGreaterThan(-1);
    expect(bloc.indexOf('>i</button>')).toBeGreaterThan(bloc.indexOf('✎'));
    expect(bloc.indexOf('>…</button>')).toBeGreaterThan(bloc.indexOf('>i</button>'));
  });

  /**
   * 🔴🔴 LE MENU « … » GARDE EXACTEMENT SON ACTION, et c'est la condition d'Arno : « le menu actuel, inchangé »,
   * « aucune de leurs actions n'est retirée ni modifiée ». Seule sa PLACE change, et son accord porte sur ce
   * déplacement, nommément.
   *
   * ⚠️ `aria-expanded` RESTE DESSUS : il dit au lecteur d'écran que ce bouton déplie quelque chose.
   */
  it('🔴🔴 le « … » ouvre toujours le détail de l’étape, et le dit', () => {
    expect(FRISE).toContain('onClick={() => onOuvrir(detailOuvert ? null : `c${e.id}`)}>…</button>');
    expect(FRISE).toContain('<button type="button" className="fav-picto-b" aria-expanded={detailOuvert}');
    /* ⚠️ ET LA CLASSE DU BOUTON ABSOLU A DISPARU AVEC LUI : une règle de feuille sans balisage est du code mort. */
    expect(FRISE).not.toContain('className="fav-menu"');
    expect(FEUILLE).not.toContain('.fav-menu{');
  });

  /**
   * 🔴🔴 LE CRAYON N'EXISTE QUE LÀ OÙ IL MÈNE QUELQUE PART. « Les étapes Monga restent non modifiables » (lot
   * ATTENTION-ET-MODIFIER), et le dépôt refuse en SQL : un crayon sur une carte Monga serait une invitation à
   * découvrir un refus. Il ouvre LE MÊME formulaire que le lien « Modifier » de la bulle — `onModifier` est la
   * même propriété, passée au même endroit, donc aucune seconde porte d'édition.
   *
   * ⚠️ ET LA PLACE RESTE TENUE QUAND IL N'EST PAS LÀ : sans ce gabarit, les deux pictos restants se
   * recentreraient, et les carrés n'auraient plus la même rangée d'un bout à l'autre de la frise.
   */
  it('🔴🔴 le crayon n’est que sur une étape manuelle, et sa place reste tenue sinon', () => {
    expect(FRISE).toContain("{e.source === 'manuelle' && onModifier !== undefined ? (");
    /* ⚠️ LE BOUTON PORTE DEUX ATTRIBUTS DE PLUS (lot FRISE-PICTOS-PLUS-GRANDS…, point 2) : `aria-pressed` et
       un titre qui change, parce que le crayon est devenu une BASCULE. Le geste, lui, est le même. */
    expect(FRISE).toContain('onClick={() => onModifier(e)}>✎</button>');
    expect(FRISE).toContain(') : <span className="fav-picto-b fav-picto-b--vide" aria-hidden="true" />}');
    /* 🔴 LE MÊME GESTE QUE « Modifier » DANS LA BULLE : une seule porte, un seul formulaire — et il porte
       désormais un NOM (`crayonDeLaCarte`, lot FRISE-PICTOS-PLUS-GRANDS…), parce qu'il est devenu une bascule
       et qu'une bascule écrite trois fois aurait fini par s'ouvrir d'un côté et se fermer de l'autre. */
    expect(FRISE).toContain('onModifier={crayonDeLaCarte}');
    expect(FRISE).toContain('const crayonDeLaCarte = useCallback((e: EtapeAAfficher): void => {');
  });

  /**
   * 🔴🔴 ET SUR LES BORNES AUSSI (point 8) — « Ouverture, Clôture, Réouverture et Clôture Monga ». Les quatre
   * sont des ÉTAPES enregistrées : elles passent par la même branche, qui porte la rangée. Rien ne les en
   * exclut, et c'est exactement ce que ce cas vérifie : il n'existe AUCUNE condition de type autour de la
   * rangée, là où le reste du composant en pose à chaque ligne (`dateAuCentre`, `couleurDeLaCarte`).
   *
   * ⚠️ LA RÈGLE DE LA DATE EST INTACTE : le crayon d'une borne ouvre le formulaire où la date n'est pas
   * modifiable, et la route la relit et la réécrit à l'identique — tenu par `friseOrdrePose.test.ts`.
   */
  it('🔴🔴 aucune carte d’étape n’échappe à la rangée, bornes comprises', () => {
    const avant = FRISE.lastIndexOf('{aConfirmer && (', FRISE.indexOf('<span className="fav-pictos">'));
    const bloc = FRISE.slice(avant, FRISE.indexOf('<span className="fav-pictos">'));
    /* ⚠️ RIEN QUI RESSEMBLE À UNE CONDITION DE TYPE juste avant la rangée : ni borne, ni couleur, ni centrage. */
    expect(bloc).not.toContain('dateAuCentre');
    expect(bloc).not.toContain('TYPES_BORNE');
    expect(FRISE).toContain('aria-label={`Modifier la carte ${c.mot}`}');
  });
});

describe('🔴🔴 ③ le « i » : une bulle instantanée, et un aveu quand il n’y a rien', () => {
  /**
   * 🔴🔴 UNE BULLE À NOUS, ET NON L'ATTRIBUT `title` DU NAVIGATEUR. Arno écrit « affichage INSTANTANÉ (sans
   * délai) » : `title` attend environ une seconde avant de paraître, et ce délai n'est pas réglable. C'est donc
   * un élément rendu par l'écran, posé au survol.
   */
  it('🔴🔴 la bulle est à nous, et elle paraît au survol sans délai', () => {
    expect(FRISE).toContain('onMouseEnter={(ev) => onCommentaire?.(e, ev.currentTarget)}');
    expect(FRISE).toContain('onMouseLeave={() => onCommentaire?.(null, null)}');
    /* ⚠️ LA BALISE PORTE DEUX ATTRIBUTS DE PLUS DEPUIS LE LOT FRISE-BULLE-ET-ENREGISTRER (le survol de la
       bulle elle-même) : on en exige donc l'ouverture, et non la ligne entière. */
    expect(FRISE).toContain('<div className="fav-commentaire" style={{ left: `${commentaire.x}px` }} role="status"');
    /**
     * ⚠️ AUCUNE TEMPORISATION À L'OUVERTURE : un `setTimeout` ici serait précisément le délai qu'Arno refuse.
     *
     * 🔴 ET LA FERMETURE, ELLE, EN A UNE DEPUIS LE LOT FRISE-BULLE-ET-ENREGISTRER (300 ms, pour laisser
     * atteindre la bulle) — c'est l'autre demande d'Arno, et les deux ne se contredisent pas : on PARAÎT sans
     * délai, on DISPARAÎT avec. Le minuteur vit dans `useBulleSurvol`, jamais ici.
     */
    const bloc = FRISE.slice(FRISE.indexOf('onCommentaire={(x, ancre) => {'), FRISE.indexOf('saisie={carteSaisie}'));
    expect(bloc).not.toContain('setTimeout');
    expect(bloc).toContain('bulleTexte.entrerCible(`i${x.id}`);');
  });

  /**
   * 🔴🔴 LE SURVOL **ET** LE FOCUS. Une bulle qui ne vient qu'à la souris n'existe pas au clavier ni au tactile
   * (CLAUDE.md §15 : « pas d'interaction dépendant du survol seul »). Le même couple ouvre et ferme.
   */
  it('🔴🔴 elle vient aussi au clavier, pas seulement à la souris', () => {
    expect(FRISE).toContain('onFocus={(ev) => onCommentaire?.(e, ev.currentTarget)}');
    expect(FRISE).toContain('onBlur={() => onCommentaire?.(null, null)}');
    expect(FRISE).toContain('aria-label={`Commentaire de la carte ${c.mot}`}');
  });

  /**
   * 🔴🔴 « si le texte est vide, “i” grisé et bulle “Aucun commentaire” » (Arno) — LES DEUX, et pas l'un sans
   * l'autre. Le gris annonce, la bulle confirme.
   *
   * ⚠️ GRISÉ MAIS ATTEIGNABLE : ce n'est PAS un `disabled`. Un bouton désactivé ne prend pas le focus, donc ne
   * dirait jamais « aucun commentaire » au clavier — et c'est une information, pas un vide.
   */
  it('🔴🔴 sans texte, le « i » est grisé et la bulle l’avoue', () => {
    expect(FRISE).toContain("className={`fav-picto-b${(e.texte ?? '').trim() === '' ? ' fav-picto-b--muet' : ''}`}");
    expect(FRISE).toContain('<span className="fav-commentaire-vide">Aucun commentaire</span>');
    expect(FEUILLE).toContain('.fav-picto-b--muet{opacity:.45}');
    /* 🔴 ET IL RESTE ATTEIGNABLE : le `i` ne porte pas `disabled`, contrairement au crayon quand l'écran est occupé. */
    const bloc = FRISE.slice(FRISE.indexOf("? ' fav-picto-b--muet'"), FRISE.indexOf('>i</button>'));
    expect(bloc).not.toContain('disabled');
  });

  /**
   * 🔴🔴 RENDUE DANS LE CADRE, JAMAIS DANS LA PISTE. En CSS, `overflow-x:auto` force l'autre axe à `auto` : tout
   * ce qui dépasse de la piste est COUPÉ — défaut mesuré au lot FRISE-HORIZONTALE, 132 px de texte tronqués.
   * Une bulle posée sous une carte dépasse par construction.
   *
   * ══ 🔴🔴 CE CAS EXIGEAIT AUSSI `pointer-events:none`, ET LE VERDICT A CHANGÉ ════════════════════════════
   *
   * IL LE JUSTIFIAIT AINSI : « ⚠️ ET ELLE NE SE CLIQUE PAS : sous la souris, elle masquerait le picto suivant
   * et empêcherait de le survoler. » La crainte était raisonnable — et mesurable, donc mesurée depuis : cette
   * bulle est posée à `top:100%` du CADRE, c'est-à-dire sous la frise entière. Elle ne recouvre aucun picto.
   *
   * 🔴 ET ARNO DEMANDE L'INVERSE AU LOT SUIVANT : « Même comportement pour la bulle du “i” des carrés », donc
   * elle doit rester ouverte quand la souris passe dessus — ce que `pointer-events:none` rendait impossible.
   * Ce que ce cas protège vraiment, en revanche, n'a pas bougé : elle est rendue HORS de la piste qui coupe.
   */
  it('🔴🔴 la bulle est hors de la piste qui coupe, et se laisse survoler', () => {
    const piste = FRISE.indexOf('<ol className="fav-piste"');
    const fermeture = FRISE.indexOf('</ol>', piste);
    const bulle = FRISE.indexOf('<div className="fav-commentaire"');
    expect(bulle).toBeGreaterThan(fermeture);
    const regle = FEUILLE.slice(FEUILLE.indexOf('.fav-commentaire{'), FEUILLE.indexOf('.fav-commentaire-vide'));
    expect(regle).toContain('position:absolute;top:100%;');
    expect(regle).not.toContain('pointer-events:none');
  });
});

describe('🔴🔴 ④ tous les textes centrés, et rien de perdu au passage', () => {
  /**
   * 🔴🔴 LE CENTRAGE EST POSÉ UNE FOIS, SUR LE CONTENEUR, et chaque ligne en hérite — titre, date, montant,
   * référence. Arno : « Tous les textes du carré au-dessus des pictos […] sont CENTRÉS, ligne par ligne. »
   * Une classe par ligne aurait fini par en oublier une : avant ce lot, seules les bornes centraient leur titre
   * et leur date, par deux modificateurs à part.
   */
  it('🔴🔴 le centrage vient du conteneur, pas d’une classe par ligne', () => {
    expect(FEUILLE).toContain('text-align:center;background:none;border:0;cursor:pointer');
    /* ⚠️ ET LES DEUX MODIFICATEURS DE BORNE NE GARDENT QUE CE QUI LEUR EST PROPRE : le gras. */
    expect(FEUILLE).toContain('.fav-titre--centree{font-weight:700}');
    expect(FEUILLE).toContain('.fav-date--centree{font-weight:700;text-align:center;color:var(--color-svv-ink)}');
  });

  /**
   * 🔴🔴 « Un titre long passe à la ligne et reste centré, sans être coupé par les pictos » (Arno). Deux
   * propriétés le tiennent : le retour à la ligne (`overflow-wrap:anywhere`, déjà là), et une GOUTTIÈRE
   * SYMÉTRIQUE de 18 px — la poignée ⠿ occupe le coin haut gauche, et un titre centré lui passerait dessous.
   *
   * ⚠️ SYMÉTRIQUE, ET C'EST LE POINT : une gouttière d'un seul côté décalerait le centre de 9 px, ce qui se voit
   * sur un carré de 124 px. L'ancien `.fav-titre--poignee{padding-left:18px}` ne valait que parce que le titre
   * était calé à gauche.
   */
  it('🔴🔴 un titre long reste centré et ne passe pas sous la poignée', () => {
    expect(FEUILLE).toContain('overflow-wrap:break-word;padding:0 11px}');
    expect(FEUILLE).not.toContain('.fav-titre--poignee{padding-left:18px}');
    expect(FEUILLE).toContain('.fav-poignee{position:absolute;left:3px;top:2px');
  });

  /**
   * 🔴🔴 CE QUI ÉTAIT DANS LE BAS DU CARRÉ Y EST TOUJOURS — et c'est le garde-fou de CLAUDE.md, pris au mot :
   * « comparer le rendu des écrans touchés avec l'état précédent et lister tout élément disparu ». Les deux
   * boutons ✓ / ✕ d'une étape « à confirmer » étaient posés en absolu à 4 px du bas ; la rangée de pictos
   * occupe désormais cette bande. Ils ne sont NI retirés NI masqués : ils remontent d'une rangée, à 24 px.
   *
   * ⚠️ ET LEURS DEUX GESTES SONT INTACTS : `confirmer` et `ecarter`, la même route, le même appel.
   */
  it('🔴🔴 les boutons ✓ / ✕ sont toujours là, remontés d’une rangée', () => {
    /* ⚠️ 30 px ET NON 24 : la rangée de pictos a grandi de 30 % (26 px de haut au lieu de 20), donc les deux
       boutons remontent d'autant. Ils ne sont toujours NI retirés NI masqués — c'est tout l'objet du cas. */
    expect(FEUILLE).toContain('.fav-doute{position:absolute;right:4px;bottom:30px;display:flex;gap:3px}');
    expect(FRISE).toContain("onClick={() => onConfirmer(e.id, 'confirmer')}>✓");
    expect(FRISE).toContain("onClick={() => onConfirmer(e.id, 'ecarter')}>✕");
  });

  /**
   * 🔴🔴 LE CARRÉ GRANDIT DE LA HAUTEUR DE LA RANGÉE, et tous les carrés gardent LA MÊME taille — règle posée
   * au lot FRISE-HORIZONTALE. 92 px + 20 de picto + 2 de marge = 112. Sans ces vingt pixels, la rangée aurait
   * mangé la deuxième ligne d'un titre long, c'est-à-dire exactement ce que le point 9 interdit.
   */
  it('🔴🔴 le carré a la place de la rangée, et tous la même', () => {
    /* ⚠️ 118 px ET 29 × 26 : les pictos ont grandi de 30 % au lot FRISE-PICTOS-PLUS-GRANDS, et le carré a pris
       les 6 px de hauteur correspondants — « augmente légèrement sa hauteur plutôt que de rogner un texte »
       (Arno). La LARGEUR ne bouge pas : 3 × 29 + 2 × 8 = 103 px dans 124, il reste 10 px de chaque côté. */
    expect(FEUILLE).toContain('width:124px;min-height:118px;');
    expect(FEUILLE).toContain('.fav-picto-b{width:29px;height:26px;');
  });

  /**
   * ⚠️ ET LA CARTE VERTE PLEINE REPEINT LES TROIS PICTOS. Ils portent `--color-svv-muted`, un gris illisible sur
   * le vert plein d'une clôture. La liste groupée de `.fav-carre--close` les nomme — une seule classe couvre
   * les trois, là où elle ne nommait que `.fav-menu`.
   */
  it('⚠️ sur la carte de clôture, les pictos passent à l’encre claire', () => {
    expect(FEUILLE).toContain('.fav-carre--close .fav-picto-b{color:var(--color-svv-bg)}');
  });
});
