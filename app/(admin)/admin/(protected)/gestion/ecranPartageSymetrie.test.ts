import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — LES DEUX COLONNES DE L'ÉCRAN PARTAGÉ SE RÉPONDENT ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « même largeur (50/50), même hauteur d'en-tête (titre + compteur + filtres alignés
 * sur une même ligne de base), mêmes marges, même hauteur de ligne de liste, mêmes pieds (pagination alignée),
 * défilement indépendant mais même hauteur visible. Aucune fonction retirée ni masquée. Clair et Sombre, et à
 * toutes les largeurs (sur écran étroit, une colonne sous l'autre). »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER TIENT, ET POURQUOI IL LIT LA FEUILLE ════════════════════════════════════════════════
 *
 * La symétrie se MESURE à l'écran, et elle l'a été : colonnes 552 × 577 aux deux, en-têtes 73 px, corps 448 px
 * commençant à la même hauteur, pieds 48 px se terminant sur la même ligne. Mais une mesure faite une fois ne
 * protège de rien : ce fichier fige les RÈGLES qui la produisent, celles qu'un ajustement futur casserait sans
 * le dire.
 *
 * ⚠️ L'ÉCRAN ÉTROIT N'A PAS PU ÊTRE MESURÉ, et c'est dit ici plutôt que tu dans un coin : le navigateur piloté ne
 * change pas la largeur du DOCUMENT quand on redimensionne sa fenêtre (limite déjà consignée au lot
 * CORBEILLE-SANS-STATUT). Ce qui se tient sans lui, c'est que les hauteurs fixes vivent TOUTES dans une media
 * query `min-width:901px`, et que la règle d'empilement existe — c'est exactement ce que ces épreuves exigent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const BRC = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');

/** La feuille de l'écran, sans ses commentaires : on éprouve des RÈGLES, pas des explications. */
const FEUILLE = VUE.slice(VUE.indexOf('.gst-deux{'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('① les mêmes trois rangées, des deux côtés', () => {
  /**
   * 🔴 LA MÊME STRUCTURE DANS LES DEUX FICHIERS. La colonne de gauche est rendue par `BoiteReception`, celle de
   * droite par `GestionVue` : deux fichiers, et donc deux occasions d'oublier une rangée. Les trois classes
   * doivent se trouver dans les deux.
   */
  it('🔴🔴 en-tête (titre + outils), corps, pied — dans les DEUX colonnes', () => {
    for (const [nom, src] of [['colonne des mails', BRC], ['colonne des événements', VUE]] as const) {
      expect(src, nom).toContain('className="gst-tete-partage"');
      expect(src, nom).toContain('className="gst-tete-partage-titre"');
      expect(src, nom).toContain('gst-tete-partage-outils');
      expect(src, nom).toContain('className="gst-corps-partage"');
      expect(src, nom).toContain('className="gst-pied-partage"');
    }
  });

  /**
   * 🔴 « Plein écran » OCCUPE LA SECONDE RANGÉE DES DEUX CÔTÉS. C'est ce qui évite une rangée vide à droite :
   * à gauche elle porte les filtres ET ce bouton, à droite ce bouton seul. Sans ce déplacement, il aurait fallu
   * réserver 44 px de vide dans la colonne des événements pour que les deux en-têtes fassent la même hauteur.
   */
  it('🔴 « Plein écran » est dans la rangée des outils, poussé à droite, dans les deux', () => {
    for (const [nom, src] of [['colonne des mails', BRC], ['colonne des événements', VUE]] as const) {
      expect(src, nom).toContain('gst-btn gst-plein');
    }
    expect(FEUILLE).toContain('.gst-tete-partage-outils .gst-plein{margin-left:auto}');
  });
});

describe('② même largeur, même hauteur visible, défilement indépendant', () => {
  /**
   * ══ ⚠️ GOUTTIÈRE MISE À JOUR LE 07/10/2026 — LOT ECRAN-PARTAGE-PLEINE-LARGEUR, POINT 2 ═══════════════════════
   *
   * ELLE FIGEAIT LA DÉCLARATION ENTIÈRE, gouttière comprise (`gap:16px`). Les deux colonnes sont devenues des
   * ZONES ENCADRÉES, et chacune porte un anneau de 3 px : il mangeait 6 des 16 px, et « un espace net entre les
   * deux zones » (Arno) serait devenu 10 px entre deux bords lumineux. La gouttière passe donc à 24 px.
   *
   * 🔴 CE QUE LA RÈGLE PROTÈGE — LE RAPPORT 50/50 — N'A PAS BOUGÉ D'UN POUCE, et c'est lui qu'on éprouve
   * désormais, séparément de la gouttière : `grid-template-columns:1fr 1fr`. Figer les deux ensemble faisait
   * échouer la garantie de largeur au premier réglage d'espacement.
   */
  it('🔴 la grille reste 50/50', () => {
    expect(FEUILLE).toContain('.gst-deux{display:grid;grid-template-columns:1fr 1fr;');
    /* 🔴 DEUX PARTS ÉGALES, ET AUCUNE LARGEUR EN DUR : ni px, ni %, ni minmax qui ferait pencher la grille. */
    const regle = FEUILLE.match(/\.gst-deux\{([^}]*)\}/)?.[1] ?? '';
    expect(regle).toContain('grid-template-columns:1fr 1fr');
    expect(regle).not.toMatch(/grid-template-columns:[^;]*(px|%|minmax)/);
  });

  it('🔴🔴 les colonnes s’étirent à la même hauteur, et c’est la GRILLE qui l’impose', () => {
    expect(FEUILLE).toMatch(/@media \(min-width:901px\)\{[\s\S]*\.gst-deux\{align-items:stretch\}/);
    expect(FEUILLE).toMatch(/\.gst-deux > \.gst-col\{display:flex;flex-direction:column;min-height:0\}/);
  });

  it('🔴🔴 le CORPS a une hauteur FIXE et commune, et défile pour lui-même', () => {
    /**
     * 🔴 FIXE, ET NON PLAFONNÉE. Avec un `max-height`, la colonne des événements (deux cartes) serait plus courte
     * que celle des mails, et les deux pieds ne s'aligneraient plus — ce qui est précisément le défaut à
     * corriger. `max()` donne un plancher : sur un écran bas, la liste reste utilisable.
     */
    expect(FEUILLE).toContain('.gst-deux .gst-corps-partage{flex:1 1 auto;min-height:0;'
      + 'height:max(22rem,52vh);overflow-y:auto}');
  });

  it('🔴 le PIED reste en bas, et fait la même hauteur des deux côtés', () => {
    expect(FEUILLE).toContain('.gst-deux .gst-pied-partage{margin-top:auto}');
    /* ⚠️ 48 px, mesuré : un bouton de 44 px dans une rangée centrée en occupe 48. 44 laissait 4 px d'écart. */
    expect(FEUILLE).toMatch(/\.gst-pied-partage\{[^}]*min-height:48px/);
  });
});

describe('③ le même rythme de ligne, sans jamais rogner un contenu', () => {
  it('🔴 même hauteur MINIMALE et mêmes marges internes dans les deux listes', () => {
    expect(FEUILLE).toContain('.gst-deux .brc-li,\n.gst-deux .gst-item{min-height:var(--gst-ligne,106px)}');
    expect(FEUILLE).toMatch(/\.gst-deux \.gst-item\{[^}]*padding:8px 4px\}/);
  });

  /**
   * 🔴🔴 UN MINIMUM, PAS UN PLAFOND — ET C'EST LA MOITIÉ QUI COMPTE. Arno demande l'harmonie ET « aucune fonction
   * retirée ni masquée », dans la même phrase. Une carte d'événement qui porte une pastille « attend une
   * réponse » dépasse les 106 px ; la rogner masquerait du contenu. Entre un pixel identique et un contenu
   * entier, c'est le contenu qui gagne.
   */
  it('🔴🔴 AUCUNE hauteur maximale sur une ligne de liste : rien n’est rogné', () => {
    expect(FEUILLE).not.toMatch(/\.gst-deux[^{]*\{[^}]*max-height:[^}]*\}[^]*?\.(brc-li|gst-item)/);
    for (const regle of FEUILLE.split('}')) {
      if (/\.(brc-li|gst-item)/.test(regle)) expect(regle).not.toContain('max-height');
      if (/\.(brc-li|gst-item)/.test(regle)) expect(regle).not.toContain('overflow:hidden');
    }
  });
});

describe('④ l’écran étroit : une colonne sous l’autre, et plus aucune hauteur fixe', () => {
  /**
   * 🔴🔴 LE PIÈGE QUE CETTE ÉPREUVE FERME. Deux boîtes à défilement empilées dans un petit écran enferment le
   * lecteur : la page ne défile plus, chaque liste défile pour elle, et l'on ne voit jamais le bas. Toutes les
   * hauteurs fixes doivent donc vivre DANS la media query large, sans exception.
   */
  it('🔴🔴 toutes les hauteurs fixes sont DANS `@media (min-width:901px)`', () => {
    const i = FEUILLE.indexOf('@media (min-width:901px){');
    expect(i).toBeGreaterThan(0);
    const avant = FEUILLE.slice(0, i);
    const dedans = FEUILLE.slice(i, FEUILLE.indexOf('\n}', i));
    /* Avant la media query : aucune hauteur imposée au corps, aucun défilement propre. */
    expect(avant).not.toContain('.gst-corps-partage{flex');
    expect(avant).not.toContain('overflow-y:auto');
    /* Dedans : les deux. */
    expect(dedans).toContain('height:max(22rem,52vh)');
    expect(dedans).toContain('overflow-y:auto');
  });

  it('🔴 la règle d’empilement existe toujours, et elle est sous 901 px', () => {
    expect(FEUILLE).toContain('@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}');
  });
});

describe('⑤ rien n’est retiré ni masqué', () => {
  /**
   * 🔴🔴 LE BLOC « ÉCHANGES SANS ÉVÉNEMENT » A CHANGÉ DE PLACE, PAS DE NATURE. Il vivait DANS la colonne de
   * gauche, sous son pied — ce qui empêchait les deux colonnes de se terminer sur la même ligne (mesuré : pied
   * de gauche à 922 px, pied de droite à 967). Il est désormais SOUS les deux, sur toute la largeur, avec son
   * titre, son compteur, son « Plein écran », sa fenêtre d'activité, ses gestes et son repli par défaut.
   */
  it('🔴 le bloc « Échanges sans événement » est hors de la grille, et complet', () => {
    const grille = VUE.slice(VUE.indexOf('<div className="gst-deux">'), VUE.indexOf('CE BLOC EST PASSÉ'));
    expect(grille).not.toContain('gst-file-echanges');
    expect(VUE).toContain('<details className="gst-file-echanges">');
    expect(VUE).toContain('Échanges sans événement <span className="gst-compte">{d.filsTotal}</span>');
    expect(VUE).toContain('gst-titre-file');
  });

  /** 🔴 LES DEUX GESTES DU PIED DE GAUCHE SONT LÀ, côte à côte : aucun n'a disparu avec la mise en rangée. */
  it('🔴 le pied de la colonne des mails garde ses deux gestes', () => {
    expect(BRC).toContain('Voir les mails plus anciens');
    expect(BRC).toContain('File des échanges sans événement');
    expect(BRC).toContain('onClick={onFileEchanges}');
  });

  /** ⚠️ ET LES FILTRES AUSSI : les quatre sont toujours rendus, dans la rangée des outils. */
  it('⚠️ les quatre filtres de la colonne des mails sont intacts', () => {
    for (const mot of ['Tous', 'À classer', 'Classés', 'Hors gestion']) {
      expect(BRC).toContain(`mot: '${mot}'`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT ECRAN-PARTAGE-PLEINE-LARGEUR — LA PAGE VA AU BORD, ET CHAQUE COLONNE EST UNE ZONE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═══ MESURÉ LE 07/10/2026, DANS LE VRAI NAVIGATEUR ═════════════════════════════════════════════════════════════
   Marge droite = marge gauche = 20 px, À TOUTES LES LARGEURS ÉPROUVÉES (1600, 1512, 1000, 820, 420). Colonnes
   648/648 à 1600 px, 604/604 à 1512 (contre 552/552 avant le lot), 348/348 à 1000 ; empilées sous 900 px, et
   aucun défilement horizontal nulle part. Gouttière 24 px, anneaux 3 px.
   Et SEUL l'écran partagé est élargi : à 1600 px, `?ecran=annuaire` et `?ecran=a_trier` gardent leurs 1120 px.

   ⚠️ L'ÉCRAN ÉTROIT A ÉTÉ MESURÉ CETTE FOIS, contrairement au lot ACCUEIL-GESTION (voir l'encadré du haut) : le
   navigateur piloté ne change toujours pas la largeur du DOCUMENT quand on redimensionne sa fenêtre, mais un
   cadre de MÊME ORIGINE, lui, a son propre viewport — et donc ses propres media queries. La limite consignée
   reste vraie ; elle se contourne.

   ARNO (07/10/2026) : « Il reste une marge vide à droite […] Le contenu de la page Gestion doit utiliser toute la
   largeur disponible jusqu'au bord droit, avec seulement la marge intérieure habituelle (la même que celle de
   gauche entre le menu et le contenu). […] Chaque colonne devient une zone encadrée […] même style de cadre que le
   bloc Annuaire, pour un ensemble cohérent. Un espace net entre les deux zones. »
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const SIDEBAR = readFileSync('app/(admin)/admin/(protected)/Sidebar.tsx', 'utf8');
/**
 * ⚠️ LA FEUILLE **ENTIÈRE**, et non celle qui commence à `.gst-deux{` : les règles de ce lot vivent AVANT ce
 * point (`.gst-page`, `.gst-bloc-annuaire`). `FEUILLE` ci-dessus reste bornée aux règles des deux colonnes, ce qui
 * est exactement ce que les épreuves du lot ACCUEIL-GESTION veulent lire — on n'élargit donc pas la sienne.
 */
const FEUILLE_ENTIERE = VUE.slice(VUE.indexOf('const CSS_GESTION = `')).replace(/\/\*[\s\S]*?\*\//g, '');

describe('🔴🔴 ⑥ la page va jusqu’au bord droit', () => {
  /**
   * ══ 🔴🔴 RÈGLE GÉNÉRALISÉE LE 07/10/2026 — LOT ADMIN-PLEINE-LARGEUR ═════════════════════════════════════════
   *
   * ELLE EXIGEAIT UNE LEVÉE CONDITIONNELLE, bornée à l'écran partagé : `.gst-page{max-width:1120px}` restait la
   * règle, et une seconde règle la défaisait pour ce seul écran. C'était juste tant que l'annuaire et
   * « À rattacher » n'étaient pas dans la demande.
   *
   * ARNO ÉTEND LA RÈGLE À TOUTE L'ADMINISTRATION (son exemple : la fiche du bien, sur l'écran annuaire). Le
   * plafond du module est donc SUPPRIMÉ, et la levée conditionnelle avec lui — elle n'avait plus rien à lever.
   *
   * 🔴 CE QUE LA RÈGLE PROTÈGE — « l'écran partagé va jusqu'au bord droit » — est tenu plus simplement qu'avant,
   * et c'est ce qu'on éprouve : plus aucun plafond nulle part dans le module, et la largeur vient de la règle
   * commune de l'administration.
   */
  it('🔴🔴 le module ne pose plus aucun plafond de largeur', () => {
    /* ⚠️ SANS LES COMMENTAIRES : les encadrés de retrait CITENT les règles d'avant pour dire ce qu'elles
       faisaient, et une lecture brute tomberait sur la mémoire du lot au lieu du code. */
    const code = VUE.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('.gst-page{max-width:');
    expect(code).not.toContain("<style>{'.gst-page{max-width:none}'}</style>");
    /* 🔴 ET C'EST LA COQUILLE DE L'ADMINISTRATION QUI DONNE LA LARGEUR, sans plafond. */
    expect(SIDEBAR).toContain('.svv-adm-main{flex:1;padding:1.25rem;min-width:0}');
    expect(SIDEBAR.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.svv-adm-main\{[^}]*max-width/);
  });

  /**
   * 🔴🔴 LA MARGE DE DROITE EST CELLE DE GAUCHE, et elle n'est écrite nulle part dans ce lot : `.svv-adm-main`
   * porte un `padding` UNIFORME sur ses quatre côtés. C'est ce qui rend la demande d'Arno — « seulement la marge
   * intérieure habituelle, la même que celle de gauche » — vraie par construction plutôt que par réglage.
   */
  it('🔴🔴 la marge intérieure est la même des quatre côtés', () => {
    expect(SIDEBAR).toContain('.svv-adm-main{flex:1;padding:1.25rem;min-width:0}');
  });

  /**
   * 🔴🔴 LE MENU LATÉRAL N'EST PAS TOUCHÉ (Arno : « même largeur, même aspect »). Sa largeur vit dans sa propre
   * feuille, et ce lot n'écrit pas une ligne dedans.
   */
  it('🔴🔴 le menu latéral garde sa largeur', () => {
    expect(SIDEBAR).toContain('.svv-adm-sidebar{width:240px;flex:0 0 240px;');
    /* 🔴 ET L'ÉCRAN NE REDÉFINIT AUCUNE RÈGLE DU MENU : aucune classe `svv-adm-` dans la feuille de l'écran. */
    expect(FEUILLE).not.toContain('.svv-adm-sidebar');
    expect(FEUILLE).not.toContain('.svv-adm-shell');
    expect(FEUILLE).not.toContain('.svv-adm-main');
  });

  /**
   * ⚠️ AUCUNE LARGEUR MINIMALE EN DUR DANS LA GRILLE : c'est ce qui garantit l'absence de défilement horizontal
   * quand la fenêtre rétrécit. Les colonnes portent `min-width:0` (sans quoi un enfant en grille refuse de
   * rétrécir sous la largeur de son contenu), et sous 900 px elles s'empilent.
   */
  it('⚠️ rien ne peut déborder en largeur', () => {
    expect(FEUILLE).toContain('.gst-col{min-width:0}');
    expect(FEUILLE).toContain('@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}');
    /* 🔴 ET LA PAGE ELLE-MÊME NE SE DONNE JAMAIS UNE LARGEUR : seulement un plafond, qu'on lève. */
    expect(FEUILLE).not.toMatch(/\.gst-page\{[^}]*(^|;)width:/);
    expect(FEUILLE).not.toMatch(/\.gst-page\{[^}]*min-width:[^0]/);
  });
});

describe('🔴🔴 ⑦ deux zones encadrées, et un espace net entre elles', () => {
  /**
   * 🔴🔴 LE CADRE EST CELUI DU BLOC ANNUAIRE, AU CARACTÈRE PRÈS. C'est la demande (« même style de cadre que le
   * bloc Annuaire, pour un ensemble cohérent »), et c'est ce qui fait lire trois zones d'une même famille plutôt
   * que deux cadres et un troisième qui leur ressemble. On lit donc les DEUX règles et l'on exige les mêmes
   * valeurs, plutôt que de recopier des nombres dans l'épreuve.
   */
  it('🔴🔴 la colonne porte exactement le cadre du bloc Annuaire', () => {
    const declarations = (selecteur: string): Set<string> => {
      const corps = FEUILLE_ENTIERE.match(new RegExp(`${selecteur}\\{([^}]*)\\}`))?.[1] ?? '';
      return new Set(corps.split(';').map((d) => d.trim()).filter(Boolean));
    };
    const colonne = declarations('\\.gst-deux > \\.gst-col');
    const annuaire = declarations('\\.gst-bloc-annuaire');
    expect(colonne.size).toBeGreaterThan(0);
    expect(annuaire.size).toBeGreaterThan(0);
    /* 🔴 BORDURE, RAYON, FOND, ANNEAU, MARGE INTÉRIEURE : les cinq, identiques. */
    for (const d of ['padding:14px', 'border:1px solid var(--color-svv-line-strong)', 'border-radius:14px',
      'background:var(--color-svv-surface)', 'box-shadow:0 0 0 3px var(--color-svv-field)']) {
      expect(colonne, d).toContain(d);
      expect(annuaire, d).toContain(d);
    }
  });

  /**
   * 🔴 LE CADRE NE VISE QUE LES DEUX COLONNES DE L'ÉCRAN PARTAGÉ. `.gst-col` sert AUSSI à la conversation de
   * l'écran « Événements » en plein écran : l'encadrer partout l'aurait emportée avec, sans qu'Arno l'ait demandé.
   */
  it('🔴 la conversation du plein écran n’est pas encadrée au passage', () => {
    /* La règle du cadre est bien bornée aux enfants directs de la grille. */
    expect(FEUILLE).toMatch(/\.gst-deux > \.gst-col\{padding:14px;/);
    /* Et aucune règle ne donne de cadre à `.gst-col` tout court. */
    for (const regle of FEUILLE.split('}')) {
      if (/(^|[\s,])\.gst-col\{/.test(`${regle}{`) && !regle.includes('.gst-deux')) {
        expect(regle, regle).not.toMatch(/border:|border-radius:|box-shadow:/);
      }
    }
  });

  /**
   * 🔴🔴 « UN ESPACE NET ENTRE LES DEUX ZONES ». L'anneau de 3 px de chaque côté mange 6 px de gouttière : une
   * gouttière de 16 px n'aurait laissé que 10 px entre deux bords lumineux. Elle doit donc dépasser nettement la
   * somme des deux anneaux — ce que cette épreuve exige, au lieu de figer un nombre choisi au hasard.
   */
  it('🔴🔴 la gouttière reste nettement plus large que les deux anneaux réunis', () => {
    const gap = Number(/\.gst-deux\{[^}]*gap:(\d+)px/.exec(FEUILLE)?.[1] ?? '0');
    const anneau = Number(/\.gst-deux > \.gst-col\{[^}]*box-shadow:0 0 0 (\d+)px/.exec(FEUILLE)?.[1] ?? '0');
    expect(anneau).toBeGreaterThan(0);
    expect(gap).toBeGreaterThanOrEqual(anneau * 2 + 12);
  });

  /**
   * 🔴 LES CARTES D'ÉVÉNEMENT GARDENT LEUR PROPRE CADRE À L'INTÉRIEUR DE LA ZONE (Arno). Il est porté par la ligne
   * de titre du repli — la même que partout ailleurs dans l'administration —, et ce lot n'y touche pas.
   */
  it('🔴 les cartes d’événement gardent leur cadre dans la zone', () => {
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    expect(GLOBALS).toMatch(/\.svv-repli-titre\{[^}]*border:1px solid var\(--color-svv-line\)/);
    expect(GLOBALS).toMatch(/\.svv-repli-titre\{[^}]*border-radius:\.5rem/);
    /* ⚠️ ET RIEN DANS CE LOT NE LE RETIRE : la règle qui aplatit les lignes de la grille ne vise que `.gst-item`,
       l'élément de liste, et laisse la ligne de titre intacte. */
    expect(FEUILLE).toMatch(/\.gst-deux \.gst-item\{border-radius:0;border:0;/);
    expect(FEUILLE).not.toMatch(/\.gst-deux[^{]*\.svv-repli-titre/);
  });

  /**
   * ⚠️ LISIBLE EN CLAIR, EN SOMBRE ET EN SYSTÈME (Arno) : aucune couleur en dur dans le cadre, et chaque jeton
   * employé porte ses trois définitions dans le thème.
   */
  it('⚠️ le cadre ne tire que des jetons, et chacun existe en Clair comme en Sombre', () => {
    const corps = FEUILLE.match(/\.gst-deux > \.gst-col\{([^}]*)\}/)?.[1] ?? '';
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}/i);
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    for (const jeton of corps.match(/--color-svv-[a-z-]+/g) ?? []) {
      expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, jeton).toBeGreaterThanOrEqual(2);
    }
  });
});
