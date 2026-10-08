import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { couleurDeLaCarte, dateAuCentre, mentionCreation } from '../../../../lib/gestion/frise';
import { TYPES_RESERVOIR } from '../../../../lib/gestion/mongaEtape';

/**
 * ══ 🔴🔴 LOT FRISE-COULEURS-DATES — CE QU'UNE CARTE DIT PAR SA COULEUR, ET LA DATE QU'ELLE PORTE ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026). Elle CORRIGE la partie couleurs du lot CLOTURE-REOUVERTURE :
 *
 *   1. GRILLE « Ajouter une carte » : « “Clôture” : SEULE carte à contour VERT. Toutes les autres cartes (Prise
 *      de rendez-vous… Carte libre, Réouverture) : contour ROUGE, comme aujourd'hui. »
 *   2. FRISE : « Carte “Clôture” (et “Clôture Monga” une fois validée) : ENTIÈREMENT verte, contour ET fond (vert
 *      plein, texte blanc ou lisible) […] Cartes “Ouverture” et “Réouverture” : contour ROUGE. Toutes les autres
 *      cartes : contour VERT (comme aujourd'hui). Jetons du thème uniquement, lisibles en Clair et en Sombre. »
 *   3. DATES : « Cartes “Ouverture”, “Clôture” et “Réouverture” : leur date (date de la carte) est écrite en
 *      GRAS, CENTRÉE dans la carte. Pas de date de création en dessous. Toutes les autres cartes : sous la carte
 *      (en dehors du cadre, centré sous elle), en petit et en VERT, la date à laquelle la carte a été CRÉÉE […]
 *      “créée le 08/10/2026”. […] n'invente pas de date : affiche “date de création inconnue” en gris […] La
 *      frise garde son alignement : la ligne des dates de création ne doit pas décaler les connecteurs (+). »
 *
 * ⚠️ LES RÈGLES PURES (quelle couleur, quelle date, comment elle s'écrit) sont éprouvées dans `frise.test.ts`,
 * sections ⑭ et ⑮, sur le module. Ce fichier-ci tient le CÂBLAGE : le balisage et la feuille.
 *
 * 🔒 Aucun réseau, aucune base, aucun événement RÉEL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');

/** La feuille seule, commentaires retirés : ce sont les RÈGLES qui comptent, pas les explications. */
const FEUILLE = FRISE.slice(FRISE.indexOf('const CSS_FRISE_AVANCEMENT')).replace(/\/\*[\s\S]*?\*\//g, '');

/** La position d'une règle dans la feuille — en CSS, à spécificité égale, c'est l'ORDRE qui tranche. */
function rang(selecteur: string): number {
  const i = FEUILLE.indexOf(selecteur);
  expect(i, `règle absente de la feuille : ${selecteur}`).toBeGreaterThan(-1);
  return i;
}

describe('🔴🔴 ① la grille : « Clôture » est la seule carte verte', () => {
  /**
   * 🔴🔴 LE VERT EST POSÉ SUR LA SEULE « CLÔTURE », par le TYPE et non par sa position dans la liste : le
   * réservoir se réordonne (il l'a déjà fait au lot CLOTURE-REOUVERTURE), et un index aurait verdi son voisin.
   */
  it('🔴🔴 le bouton « Clôture » de la grille porte le modificateur vert', () => {
    expect(FRISE).toContain("(t === 'cloture' ? ' fav-carre--reserve-close' : '')");
    expect(FEUILLE).toContain('.fav-carre--reserve-close{border-color:var(--color-svv-green)}');
  });

  /**
   * 🔴🔴 ET LE VERT GAGNE VRAIMENT, CE QUI N'EST PAS ACQUIS. Les deux règles du réservoir reposent le ROUGE sur
   * toutes ses cartes, au repos (`.fav-carre--reserve`) comme au survol — écrite avant elles, la règle verte
   * aurait existé sans jamais se voir. C'est exactement le piège que `.fav-carre--reouverture` documente déjà,
   * et il se joue ici dans l'autre sens.
   */
  it('🔴🔴 sa règle passe APRÈS le rouge du réservoir, au repos et au survol', () => {
    expect(rang('.fav-carre--reserve-close{')).toBeGreaterThan(rang('.fav-carre--reserve{'));
    expect(rang('.fav-carre--reserve-close:hover{')).toBeGreaterThan(rang('.fav-carre--reserve:hover{'));
  });

  /** 🔴 « Toutes les autres cartes : contour ROUGE, comme aujourd'hui » — le rouge du réservoir n'a pas bougé. */
  it('🔴 les douze autres cartes de la grille restent rouges', () => {
    expect(FEUILLE).toMatch(/\.fav-carre--reserve\{[^}]*border-color:var\(--color-svv-red\)/);
    /* 🔴 ET « RÉOUVERTURE » GARDE SON TRAIT PLUS ÉPAIS, nommément : Arno écrit « comme aujourd'hui ». */
    expect(FEUILLE).toContain('.fav-carre--reserve.fav-carre--reouverture{border-width:2px}');
    expect(FRISE).toContain("t === 'reouverture' ? ' fav-carre--reouverture' : ''");
  });

  /**
   * ⚠️ LES DEUX MODIFICATEURS NE SE RENCONTRENT JAMAIS SUR LA MÊME CARTE, et c'est l'état de l'événement qui
   * l'assure : `cartesDuReservoir` n'offre « Clôture » que si le dossier est ouvert, « Réouverture » que s'il
   * est clos. L'épreuve le redit ici pour que personne ne « simplifie » les deux règles en une.
   */
  it('⚠️ « Clôture » et « Réouverture » ne sont jamais proposées ensemble', () => {
    expect(TYPES_RESERVOIR).toContain('cloture');
    expect(TYPES_RESERVOIR).toContain('reouverture');
  });
});

describe('🔴🔴 ② la frise : Clôture pleine verte, Ouverture et Réouverture rouges', () => {
  /**
   * 🔴🔴 LA RÈGLE EST PURE, ET LE BALISAGE NE FAIT QUE NOMMER LA CLASSE. Une table de trois entrées, lue par
   * les DEUX cartes de la frise (la réelle et l'ouverture dérivée) : deux écritures séparées auraient fini par
   * en laisser une au vert.
   */
  it('🔴🔴 une seule table relie la règle pure aux classes de la feuille', () => {
    expect(FRISE).toContain("debut: ' fav-carre--debut',");
    expect(FRISE).toContain("cloture: ' fav-carre--close',");
    expect(FRISE).toContain("ordinaire: '',");
    /* 🔴 ET LES DEUX CARTES LA LISENT, chacune par `couleurDeLaCarte` — jamais par un test de type écrit sur place. */
    expect(FRISE).toContain('CLASSE_COULEUR[couleurDeLaCarte(c.type)]');
    expect(FRISE).toContain('CLASSE_COULEUR[couleurDeLaCarte(e.type)]');
  });

  /** 🔴🔴 « Cartes “Ouverture” et “Réouverture” : contour ROUGE. » */
  it('🔴🔴 les deux cartes de début portent un contour rouge', () => {
    expect(couleurDeLaCarte('ouverture')).toBe('debut');
    expect(couleurDeLaCarte('reouverture')).toBe('debut');
    expect(FEUILLE).toContain('.fav-carre--debut{border-color:var(--color-svv-red)}');
    expect(FEUILLE).toContain('.fav-carre--debut:hover,.fav-carre--debut:focus-within{');
  });

  /**
   * 🔴🔴 « ENTIÈREMENT verte, contour ET fond (vert plein, texte blanc ou lisible) » (Arno). Les trois à la
   * fois : la bordure, le fond, et la couleur du texte — un fond vert sous un titre en encre sombre serait
   * illisible en thème Clair, et c'est le défaut qu'une règle de fond seule aurait laissé passer.
   */
  it('🔴🔴 la clôture est verte en contour, en fond ET en texte', () => {
    expect(couleurDeLaCarte('cloture')).toBe('cloture');
    const regle = /\.fav-carre--close\{([^}]*)\}/.exec(FEUILLE)?.[1] ?? '';
    expect(regle).toContain('border-color:var(--color-svv-green-ink)');
    expect(regle).toContain('background:var(--color-svv-green-ink)');
    expect(regle).toContain('color:var(--color-svv-bg)');
  });

  /**
   * 🔴🔴 TOUS LES TEXTES DU CARRÉ SUIVENT, ET IL FAUT LES NOMMER UN PAR UN. Chacun porte sa propre couleur —
   * l'encre pour le titre, le gris pour la date et le menu « … », le ROUGE pour le picto de source — et une
   * couleur héritée ne les atteint pas. Un gris ou un rouge laissé sur du vert plein serait illisible.
   */
  it('🔴🔴 aucun texte de la carte verte ne reste dans sa couleur d’origine', () => {
    const bloc = FEUILLE.slice(FEUILLE.indexOf('.fav-carre--close .fav-carre-clic'));
    const regle = /^([\s\S]*?)\{([^}]*)\}/.exec(bloc);
    expect(regle).not.toBeNull();
    for (const c of ['fav-carre-clic', 'fav-titre', 'fav-date', 'fav-montant', 'fav-ref',
      'fav-picto', 'fav-menu']) {
      expect(regle?.[1], c).toContain(`.fav-carre--close .${c}`);
    }
    expect(regle?.[2]).toContain('color:var(--color-svv-bg)');
  });

  /**
   * 🔴🔴 « ET “CLÔTURE MONGA” UNE FOIS VALIDÉE » — la parenthèse d'Arno, et elle borne le vert plein. Une
   * clôture lue dans un mail mais pas encore confirmée garde son AMBRE : la peindre en vert plein affirmerait
   * une clôture acquise. Mesuré le 08/10/2026 : **5 clôtures Monga** sont dans cet état.
   *
   * ⚠️ ET SEULE LA CLÔTURE EST AINSI BORNÉE : Arno n'assortit Ouverture ni Réouverture d'aucune condition, et
   * leurs cartes « à confirmer » gardent par ailleurs leurs deux boutons ✓ / ✕, qui sont ambre et disent l'état
   * sans la bordure.
   */
  it('🔴🔴 une clôture « à confirmer » reste ambre, et ne devient verte qu’une fois validée', () => {
    expect(FRISE).toContain("(aConfirmer && e.type === 'cloture' ? '' : CLASSE_COULEUR[couleurDeLaCarte(e.type)])");
    /* 🔴 L'AMBRE EST TOUJOURS POSÉE, et ses deux boutons sont toujours là. */
    expect(FRISE).toContain("`fav-carre fav-carre--dans${aConfirmer ? ' fav-carre--doute' : ''}`");
    expect(FRISE).toContain("onConfirmer(e.id, 'confirmer')");
    expect(FRISE).toContain("onConfirmer(e.id, 'ecarter')");
  });

  /** 🔴 « Toutes les autres cartes : contour VERT (comme aujourd'hui) » — `--dans`, sans condition de type. */
  it('🔴 les autres cartes gardent le vert de la frise', () => {
    expect(FEUILLE).toContain('.fav-carre--dans{border-color:var(--color-svv-green)');
  });

  /**
   * 🔴 L'ORDRE DÉCIDE, ET C'EST LA SEULE CHOSE QUI REND CES RÈGLES VISIBLES. Posées avant `.fav-carre--dans`,
   * le vert les recouvrirait ; posées avant les survols de `--dans`, passer la souris sur une Ouverture
   * repeindrait son contour en vert.
   */
  it('🔴🔴 les deux règles passent après le vert de la frise, au repos et au survol', () => {
    for (const sel of ['.fav-carre--debut{', '.fav-carre--close{']) {
      expect(rang(sel), sel).toBeGreaterThan(rang('.fav-carre--dans{'));
    }
    for (const sel of ['.fav-carre--debut:hover', '.fav-carre--close:hover']) {
      expect(rang(sel), sel).toBeGreaterThan(rang('.fav-carre--dans:hover'));
    }
  });

  /**
   * ⚠️ JETONS DU THÈME UNIQUEMENT (Arno : « Jetons du thème uniquement, lisibles en Clair et en Sombre »), et
   * c'est aussi la règle de cette feuille : un garde du dépôt refuse un hexadécimal ou un `rgba()` ici.
   *
   * 🔴 ET LE COUPLE CHOISI EST LISIBLE DANS LES DEUX THÈMES, par construction : `--color-svv-green-ink` en fond
   * et `--color-svv-bg` en texte donnent du blanc sur vert foncé en Clair (contraste mesuré 5,4:1) et de
   * l'encre sombre sur vert clair en Sombre (11,7:1). Les deux au-delà du seuil AA.
   */
  it('⚠️ aucune couleur en dur dans les règles de ce lot', () => {
    for (const sel of ['.fav-carre--debut', '.fav-carre--close', '.fav-carre--reserve-close',
      '.fav-date--centree', '.fav-cree']) {
      const regle = new RegExp(`\\${sel}\\{([^}]*)\\}`).exec(FEUILLE)?.[1] ?? '';
      expect(regle, sel).not.toBe('');
      expect(regle, sel).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(regle, sel).not.toContain('rgba(');
      expect(regle, sel).not.toContain('rgb(');
    }
  });
});

describe('🔴🔴 ③ la date des trois cartes de borne : en gras, centrée', () => {
  /**
   * 🔴🔴 « Leur date (date de la carte) est écrite en GRAS, CENTRÉE dans la carte » (Arno, point 3.a). Et c'est
   * la MÊME date qu'avant, par le MÊME mot (`motDateEtape`) : seule sa mise en forme change.
   */
  it('🔴🔴 la carte réelle met sa date au centre quand c’est une borne', () => {
    expect(FRISE).toContain("`fav-date${dateAuCentre(e.type) ? ' fav-date--centree' : ''}`");
    expect(FEUILLE).toContain('.fav-date--centree{font-weight:700;text-align:center;');
  });

  /** 🔴 ET LA CARTE D'OUVERTURE DÉRIVÉE AUSSI : même classe, même rendu, pour la même carte aux yeux du lecteur. */
  it('🔴🔴 la carte d’ouverture dérivée porte la même date centrée', () => {
    expect(FRISE).toContain('<span className="fav-date fav-date--centree">');
  });

  /** 🔴 LES TROIS, ET SEULEMENT LES TROIS. La règle est pure, l'écran ne la réécrit pas. */
  it('🔴🔴 ce sont bien Ouverture, Clôture et Réouverture', () => {
    expect(dateAuCentre('ouverture')).toBe(true);
    expect(dateAuCentre('cloture')).toBe(true);
    expect(dateAuCentre('reouverture')).toBe(true);
    for (const t of ['prise_rdv', 'devis_recu', 'intervention', 'autre', 'facture'] as const) {
      expect(dateAuCentre(t), t).toBe(false);
    }
  });

  /** 🔴 « Pas de date de création en dessous » — c'est la même règle qui coupe les deux. */
  it('🔴🔴 une carte de borne n’a aucune date de création en dessous', () => {
    expect(FRISE).toContain('const creation = dateAuCentre(e.type) ? null : mentionCreation(e.creeLe);');
    expect(FRISE).toContain('{creation !== null && (');
  });
});

describe('🔴🔴 ④ la date de création, sous les autres cartes', () => {
  /**
   * 🔴🔴 « sous la carte (en dehors du cadre, centré sous elle), en petit et en VERT » (Arno, point 3.b).
   *
   * 🔴 « EN DEHORS DU CADRE » SE VÉRIFIE DANS LE BALISAGE : la mention est rendue après la fermeture du
   * `div.fav-carre`, dans le `li`. Dedans, elle aurait mangé 15 px des 92 px du carré et poussé le montant hors
   * de la vue.
   */
  it('🔴🔴 la mention est rendue hors du cadre, dans l’élément de la rangée', () => {
    /* ⚠️ LA **SECONDE** OCCURRENCE : la première est la carte d'ouverture dérivée, qui n'a pas de mention. */
    const premier = FRISE.indexOf('<li className="fav-el fav-el--carre" ref={moi}>');
    const i = FRISE.indexOf('<li className="fav-el fav-el--carre" ref={moi}>', premier + 1);
    const j = FRISE.indexOf('{creation !== null && (', i);
    const k = FRISE.indexOf('</li>', i);
    expect(i).toBeGreaterThan(premier);
    expect(j).toBeGreaterThan(i);
    expect(j).toBeLessThan(k);
    /* ⚠️ ET HORS DU CADRE : le `</div>` qui ferme le carré vient entre l'ouverture du `li` et la mention. */
    expect(FRISE.lastIndexOf('</div>', j)).toBeGreaterThan(i);
  });

  /** 🔴 EN PETIT, CENTRÉE, ET EN VERT — l'encre verte, lisible sur le fond de page dans les deux thèmes. */
  it('🔴🔴 elle est petite, centrée et verte', () => {
    const regle = /\.fav-cree\{([^}]*)\}/.exec(FEUILLE)?.[1] ?? '';
    expect(regle).toContain('text-align:center');
    expect(regle).toContain('color:var(--color-svv-green-ink)');
    expect(regle).toMatch(/font-size:\.\d+rem/);
    /* ⚠️ L'ENCRE VERTE ET NON LE VERT DES CONTOURS : celui-ci tombe à 3,4:1 sur le fond en thème Clair. */
    expect(regle).not.toContain('color:var(--color-svv-green)');
  });

  /** 🔴🔴 « n'invente pas de date : affiche “date de création inconnue” EN GRIS » (Arno). */
  it('🔴🔴 une date manquante s’avoue, en gris, et rien n’est fabriqué', () => {
    expect(mentionCreation(null)).toEqual({ mot: 'date de création inconnue', connue: false });
    expect(FRISE).toContain("`fav-cree${creation.connue ? '' : ' fav-cree--inconnue'}`");
    expect(FEUILLE).toContain('.fav-cree--inconnue{color:var(--color-svv-muted)}');
  });

  /**
   * 🔴🔴 ET AUCUNE DATE N'EST FABRIQUÉE NULLE PART : pas de migration, pas de repli sur aujourd'hui, pas de
   * `now()` écrit par ce lot. Arno : « Pas de migration qui fabrique des dates. »
   *
   * 🔴 MESURE DU 08/10/2026 : **0 carte** sur les 162 de `gestion_monga_etape` est sans `cree_le` — la colonne
   * est `NOT NULL DEFAULT now()` depuis sa création. La branche « inconnue » couvre le type `string | null` que
   * le dépôt rend, et elle restera juste si une donnée importée arrivait un jour sans date.
   */
  it('🔴🔴 la mention ne se replie jamais sur une date d’aujourd’hui', () => {
    expect(FRISE).not.toContain('mentionCreation(e.creeLe ?? aujourdhui');
    expect(FRISE).not.toContain('creeLe ?? aujourdhui');
    /* ⚠️ ET LA MENTION DU SURVOL EST INCHANGÉE : `motAjout` dit toujours « ajoutée le … par … » dans la bulle. */
    expect(FRISE).toContain('const pose = motAjout(e.creeLe, e.creeParLibelle);');
    expect(FRISE).toContain('<p className="fav-bulle-pose">{motAjout(e.creeLe, e.creeParLibelle)}</p>');
  });
});

describe('🔴🔴 ⑤ l’alignement de la frise ne bouge pas d’un pixel', () => {
  /**
   * 🔴🔴 LA CONDITION D'ARNO : « La frise garde son alignement : la ligne des dates de création ne doit pas
   * décaler les connecteurs (+) entre les cartes. »
   *
   * 🔴 ELLE TIENT À UNE PROPRIÉTÉ DÉJÀ POSÉE, ET QU'ON NE TOUCHE PAS : `.fav-piste{align-items:flex-start}`.
   * La rangée aligne ses éléments par le HAUT — un élément plus haut que ses voisins pousse donc vers le BAS, et
   * tout ce qui compte depuis le haut (le trait à 44 px, les « + » à 32 px, les points à 38 px) reste en place.
   *
   * ⚠️ `center` OU `stretch` LA CASSERAIENT : les deux recentreraient les carrés sur une hauteur qui dépend
   * désormais de la présence d'une date de création, c'est-à-dire du TYPE de la carte.
   */
  it('🔴🔴 la rangée aligne toujours par le haut', () => {
    expect(FEUILLE).toMatch(/\.fav-piste\{[^}]*align-items:flex-start/);
    expect(FEUILLE).not.toMatch(/\.fav-piste\{[^}]*align-items:center/);
  });

  /** 🔴 LES TROIS REPÈRES VERTICAUX N'ONT PAS CHANGÉ D'UN PIXEL — c'est eux qu'on mesure, pas une intention. */
  it('🔴🔴 le trait, les « + » intercalaires et les points gardent leur hauteur', () => {
    expect(FEUILLE).toMatch(/\.fav-el::before\{[^}]*top:44px/);
    expect(FEUILLE).toMatch(/\.fav-el--entre\{[^}]*padding-top:32px/);
    expect(FEUILLE).toMatch(/\.fav-el--points\{[^}]*padding-top:38px/);
  });

  /**
   * 🔴 SEULS LES CARRÉS S'EMPILENT, par un modificateur à eux. `.fav-el` reste en ligne : les groupes de points
   * et les « + » intercalaires n'ont rien à empiler, et leur passer la colonne aurait déplacé leur `padding-top`.
   */
  it('🔴🔴 la colonne est posée sur le carré seul, jamais sur toute la rangée', () => {
    expect(FEUILLE).toContain('.fav-el--carre{flex-direction:column;align-items:stretch}');
    expect(FEUILLE).toMatch(/\.fav-el\{position:relative;display:flex;align-items:flex-start/);
    expect(FEUILLE).not.toMatch(/\.fav-el\{[^}]*flex-direction:column/);
    /* 🔴 ET LES DEUX CARTES DE LA FRISE LE PORTENT : la réelle et l'ouverture dérivée. */
    expect(FRISE).toContain('<li className="fav-el fav-el--carre" ref={moi}>');
    expect(FRISE.match(/className="fav-el fav-el--carre"/g)?.length).toBe(2);
  });

  /**
   * ⚠️ LA PISTE N'A PAS DE HAUTEUR FIXE, et c'est ce qui laisse la place à la nouvelle ligne : `min-height` est
   * un PLANCHER (132 px = 10 de marge + 92 de carré + 30 de barre de défilement), pas une hauteur. La piste
   * grandit donc d'elle-même des ~21 px de la mention, sans rien rogner.
   *
   * 🔴 UNE `height` FIXE ICI SERAIT LE RETOUR DU DÉFAUT DU LOT FRISES-REPARATION : c'est la feuille des MAILS
   * qui en posait une (88 px) par collision de préfixe, et elle rognait le bas des carrés de 14 px.
   */
  it('🔴🔴 la piste garde un plancher, jamais une hauteur fixe', () => {
    const regle = /\.fav-piste\{([^}]*)\}/.exec(FEUILLE)?.[1] ?? '';
    expect(regle).toContain('min-height:132px');
    expect(regle).not.toMatch(/(^|;)height:/);
  });
});
