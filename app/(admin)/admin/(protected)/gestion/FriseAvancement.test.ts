import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jourFr } from './EvenementsDuBien';
/**
 * ⚠️ `motNbReperes` VIVAIT DANS LE COMPOSANT ; il est devenu `motGroupeMessages` dans le module PUR au lot
 * FRISE-HORIZONTALE — les points sont désormais groupés entre deux carrés, et c'est le module qui les groupe.
 * Le verdict de l'épreuve ne change pas : le compteur s'accorde.
 */
import { motGroupeMessages } from '../../../../lib/gestion/frise';
/* 🔴 LOT FRISE-CONSTRUCTIBLE — la liste du réservoir vient du module PUR, jamais recopiée dans une épreuve. */
import { TYPES_RESERVOIR as RESERVOIR_TYPES } from '../../../../lib/gestion/mongaEtape';
/* 🔴 LOT URGENCE-EVENEMENT, POINT 4 — on éprouve l'adresse PRODUITE et RELUE, et non la forme de son code. */
import { ecrireEtatUrl, ETAT_DEFAUT, lireEtatUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINTS 3 ET 4 — CE QUE LES DEUX ÉCRANS DOIVENT TENIR ═══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce fichier éprouve les RÈGLES des deux composants — ce qu'ils affichent, ce qu'ils refusent, et la frontière
 * client/serveur qu'ils ne doivent jamais franchir. Le rendu lui-même est vérifié à l'écran, dans le navigateur,
 * et les mesures sont consignées dans les captures.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
/* 🔴 LE DÉFILEMENT A DÉMÉNAGÉ DANS UN CROCHET PARTAGÉ (lot FRISES-REPARATION, B.3) : les épreuves qui le
   concernent lisent désormais CE fichier, puisqu'il est le seul chemin des DEUX frises. */
const SOURCE_CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useDefilementFrise.ts', 'utf8');
const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const ROUTE_FRISE = readFileSync(
  'app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const ROUTE_ETAPE = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');
/* 🔴 LOT FRISE-COMPACTE, POINT 4 — le meme grand cadre rouge existait sur la frise des MAILS, depuis le meme
   lot et pour la meme raison : les deux frises partagent leur defilement, donc sa signaletique. */
const MAILS_FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx', 'utf8');
/* 🔴 LOT VIGNETTE-EVENEMENT — l'écran partagé et le plein écran rendent la MÊME carte, avec un argument de
   différence : c'est `GestionVue` qui le passe, et c'est là qu'on le vérifie. */
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

describe('① la frontière client/serveur', () => {
  /**
   * 🔴🔴 LA RÈGLE DU DÉPÔT DEPUIS L'INCIDENT DU 24/09/2026 : un composant `'use client'` qui importe un dépôt
   * remonte jusqu'à `pg`, donc `dns`, et webpack refuse de construire TOUTE l'application — page de connexion
   * comprise, avec 8 800 tests au vert. Le garde de graphe l'attrape aussi ; ceci le dit à l'endroit où l'on
   * écrirait l'import de trop.
   */
  it('🔴🔴 aucun des deux écrans n’importe un dépôt', () => {
    for (const [nom, src] of [['FriseAvancement', FRISE], ['EvenementsDuBien', BLOC]] as const) {
      expect(src.startsWith("'use client';"), nom).toBe(true);
      expect(src, nom).not.toMatch(/from '.*mongaEtapeRepo'/);
      expect(src, nom).not.toMatch(/^import .*Repo';$/m);
      expect(src, nom).not.toContain("from 'pg'");
    }
  });
});

describe('② la frise : ce qu’Arno a demandé, pièce par pièce', () => {
  /**
   * ══ 🔴🔴 CE QUE CETTE ÉPREUVE DISAIT AVANT, ET POURQUOI LE VERDICT A CHANGÉ ════════════════════════════════
   *
   * Elle s'appelait « les étapes attendues s'affichent en carré pointillé » et vérifiait la classe
   * `fav-carre--attendue` et sa bordure `dashed`. Arno a fait retirer ces carrés, en toutes lettres : « ACCORD
   * D'ARNO : les carrés “attendue” en pointillé sont supprimés. »
   *
   * 🔴 LE VERDICT EST MAINTENANT L'INVERSE, ET IL EST AUSSI STRICT : la classe ne doit plus exister nulle part,
   * ni dans le balisage ni dans la feuille. Un reste de règle CSS orpheline aurait fini par être recâblé « parce
   * qu'elle est encore là ».
   */
  it('🔴🔴 plus aucun carré « attendue » : ni classe, ni règle, ni mot', () => {
    expect(FRISE).not.toContain('fav-carre--attendue');
    expect(FRISE).not.toContain('fav-carre--posable');
    expect(FRISE).not.toContain('fav-attendue');
  });

  /**
   * 🔴🔴 TROIS COULEURS, ET CHACUNE DIT UN ÉTAT (lot FRISE-CONSTRUCTIBLE) : ROUGE = à poser (le réservoir, les
   * « + ») · VERT = dans la frise (Monga comme manuelle, Arno points 2 et 5) · AMBRE = Monga « à confirmer ».
   */
  it('🔴🔴 une carte dans la frise est VERTE, une carte du réservoir ROUGE', () => {
    expect(FRISE).toContain('.fav-carre--dans{border-color:var(--color-svv-green)');
    expect(FRISE).toContain('.fav-carre--reserve');
    expect(FRISE).toMatch(/\.fav-carre--reserve\{[^}]*border-color:var\(--color-svv-red\)/);
    /* 🔴 ET L'AMBRE RESTE CELLE DE MONGA-2 : « à confirmer », avec ses deux boutons. */
    expect(FRISE).toContain('.fav-carre--doute{border-color:var(--color-svv-amber)');
  });

  /**
   * 🔴🔴 « tous les carrés de la frise réagissent pareil au survol (contour accentué, curseur main). Aujourd'hui
   * seul “Acceptation du devis” le fait » — Arno, point 5.
   *
   * 🔴 LE DÉFAUT VENAIT DE LÀ : la seule règle de survol du fichier portait sur `.fav-carre--posable`, le carré
   * pointillé « Acceptation du devis ». Les carrés atteints n'en avaient aucune — rien ne disait qu'ils étaient
   * cliquables. La règle porte donc maintenant sur `.fav-carre` ENTIER, et non sur un modificateur.
   */
  it('🔴🔴 le survol et le curseur main portent sur TOUS les carrés', () => {
    expect(FRISE).toMatch(/\.fav-carre\{cursor:pointer/);
    expect(FRISE).toContain('.fav-carre:hover,.fav-carre:focus-within{box-shadow:');
  });

  /**
   * 🔴🔴 LA TAILLE DES CARRÉS EST LA MÊME POUR TOUS (Arno : « même taille pour tous, environ 120 × 90 px »).
   * Un carré qui grandit avec son texte ferait onduler la ligne et casserait l'alignement du trait.
   */
  it('🔴🔴 tous les carrés font la même taille', () => {
    expect(FRISE).toMatch(/\.fav-carre\{[^}]*width:124px/);
    expect(FRISE).toMatch(/\.fav-carre\{[^}]*min-height:92px/);
  });

  /** 🔴 LE TRAIT FIN QUI RELIE LES CARRÉS, et il est décoratif : posé en CSS, jamais dans le balisage. */
  it('🔴 un trait relie les carrés, et il est décoratif', () => {
    expect(FRISE).toContain('.fav-el::before');
    expect(FRISE).toContain('background:var(--color-svv-line)');
  });

  /**
   * ══ 🔴🔴 CE QUE CETTE ÉPREUVE DISAIT AVANT, ET CE QU'ELLE DIT MAINTENANT ═══════════════════════════════════
   *
   * Elle s'appelait « seul le carré pointillé “Acceptation du devis” est cliquable » : c'était la décision
   * d'Arno du 06/10 — « Le bouton “Le devis est accepté” devient un clic sur le carré pointillé “Acceptation du
   * devis” (même effet) » —, le seul moyen de poser une étape qui n'arrive JAMAIS par mail (0 cas mesuré
   * sur 120).
   *
   * 🔴 LA POSSIBILITÉ N'EST PAS PERDUE, ELLE EST GÉNÉRALISÉE : « Acceptation du devis » est une carte du
   * RÉSERVOIR, posable en deux clics comme les treize autres — et désormais posable PLUSIEURS FOIS, ce que le
   * carré pointillé unique ne permettait pas. C'est ce que vérifie l'épreuve maintenant.
   */
  it('🔴🔴 « Acceptation du devis » reste posable, par le réservoir', () => {
    expect(RESERVOIR_TYPES).toContain('devis_accepte');
    /* 🔴 ET LE RÉSERVOIR EST BIEN CE QUI S'OUVRE : un clic sur une de ses cartes mène au formulaire. */
    expect(FRISE).toContain('onChoisir={(t) => { setTypePose(t); setAjout(true); }}');
  });

  /**
   * 🔴🔴 LE MONTANT SE COMPLÈTE À LA MAIN, SUR UNE ÉTAPE MONGA. L'audit a mesuré qu'il n'est jamais dans le mail
   * (2 sur 120, et ce sont des phrases humaines) ; le mail « Devis envoyé » dit seulement que le devis est
   * disponible derrière le lien.
   */
  it('🔴🔴 une case de devis porte un champ de montant', () => {
    expect(FRISE).toContain("e.type === 'devis_recu' && (");
    expect(FRISE).toContain('Montant du devis');
    /* ⚠️ EN CENTIMES, ARRONDIS : un montant en flottant finirait par afficher 885,4999999. */
    expect(FRISE).toContain('Math.round(v * 100)');
  });

  /**
   * 🔴 LES DEUX BOUTONS SONT DEVENUS DEUX PETITS SIGNES ✓ / ✕ (Arno : « les petits boutons confirmer ✓ /
   * écarter ✕ »), et la bordure du carré passe à l'ambre. Le verdict ne change pas : les deux gestes sont là.
   *
   * ⚠️ CHACUN PORTE SON MOT POUR LE LECTEUR D'ÉCRAN : un ✓ seul ne se lit pas.
   */
  it('🔴 les étapes « à confirmer » portent leur bordure ambre et les deux gestes', () => {
    expect(FRISE).toContain('fav-carre--doute');
    expect(FRISE).toContain('border-color:var(--color-svv-amber)');
    expect(FRISE).toContain("onConfirmer(e.id, 'confirmer')");
    expect(FRISE).toContain("onConfirmer(e.id, 'ecarter')");
    expect(FRISE).toContain('<span className="fav-sr"> confirmer</span>');
    expect(FRISE).toContain('<span className="fav-sr"> écarter</span>');
  });

  /** 🔴 LA PHRASE QUI JUSTIFIE TOUT LE POINT 2 — elle vient du module pur, elle n'est pas réécrite ici. */
  it('🔴🔴 « mail supprimé — étape conservée » vient du module pur', () => {
    expect(FRISE).toContain('motMailDOrigine');
    /**
     * ⚠️ COMMENTAIRES RETIRÉS AVANT LA VÉRIFICATION. Un encadré a le droit de CITER la phrase pour expliquer
     * pourquoi un seul composant sert les points et les carrés ; ce qui est interdit, c'est de la RÉÉCRIRE dans
     * du code rendu. Sans ce retrait, l'épreuve interdisait d'expliquer la règle qu'elle protège.
     */
    const code = FRISE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('mail supprimé — étape conservée');
    const pur = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(pur).toContain('mail supprimé — étape conservée');
  });

  /**
   * ══ 🔴🔴 ÉPREUVE RENVERSÉE LE 08/10/2026 — LOT CLOTURE-REOUVERTURE ════════════════════════════════════════
   *
   * ELLE EXIGEAIT la ligne « Clôturer cet événement ? » et sa propriété `onProposerCloture` — c'est-à-dire la
   * fermeture EN UN CLIC. ARNO : « Retire la ligne ou le bouton qui permettait de fermer un événement en un seul
   * clic (ailleurs que par la carte Clôture). »
   *
   * 🔴 CE QU'ELLE PROTÉGEAIT — « la clôture est une PROPOSITION, jamais automatique » — est RENFORCÉ, et c'est
   * ce que ce cas vérifie désormais : on ferme toujours à la main, mais par une carte qui demande confirmation
   * et qui RESTE sur la frise. Et la fermeture emprunte toujours `changerEtatEvenement`, la seule fonction du
   * dépôt qui écrive l'état.
   */
  it('🔴🔴 on ne ferme plus en un clic : la clôture passe par une carte, et par la porte existante', () => {
    /* ⚠️ ON INTERDIT LE CODE, PAS LA MENTION : les encadrés qui expliquent ce retrait nomment forcément la
       ligne et sa propriété, et ils doivent pouvoir le faire. C'est le RENDU et la PROPRIÉTÉ qu'on bannit. */
    expect(FRISE).not.toContain('className="fav-proposition"');
    expect(FRISE).not.toContain('onProposerCloture?:');
    expect(FRISE).not.toContain('onProposerCloture !== undefined');
    expect(BLOC).not.toContain('onProposerCloture={');
    /* 🔴 ET C'EST LA ROUTE DE LA FRISE QUI APPLIQUE L'ÉTAT, par la fonction qui existait déjà. */
    expect(ROUTE_FRISE).toContain('const issue = await changerEtatEvenement(evenementId, etatVoulu, auteur);');
    expect(ROUTE_FRISE).toContain('const etatVoulu = etatApresCarte(type);');
  });

  /**
   * 🔴 LA PROPOSITION DE PASSAGE EN FIABLE (Arno) : « propose-moi (sans l'appliquer) ». Le mot « rien n'est
   * appliqué » est à l'écran, pour qu'on ne croie pas que le clic a changé quelque chose.
   */
  it('🔴 le passage en automatique fiable est proposé, et le dit', () => {
    expect(FRISE).toContain('passagesEnFiableProposes');
    expect(FRISE).toContain('rien n’est appliqué');
  });

  /**
   * ⚠️ AUCUNE FONCTION AU SURVOL SEUL (CLAUDE.md §15). Les repères RÉVÈLENT un texte au survol, mais ce sont des
   * `<button>` : le clavier et le tactile y accèdent par un clic.
   */
  /**
   * ══ 🔴🔴 LES REPÈRES SONT DEVENUS DES POINTS SUR LE TRAIT (Arno) ═══════════════════════════════════════════
   *
   * « petits points discrets posés sur le trait ENTRE les carrés, à leur place chronologique. Au survol (et au
   * clic au clavier), une bulle affiche la date, l'auteur et le texte. »
   *
   * ⚠️ LE VERDICT EST LE MÊME, ET IL COMPTE PLUS QU'AVANT : un `<button>`, pas une zone de survol. Arno demande
   * explicitement « et au clic au clavier » — une info-bulle au seul survol est invisible au tactile et au
   * clavier (CLAUDE.md §15).
   */
  it('⚠️ les points sont des boutons, pas de simples zones de survol', () => {
    expect(FRISE).toContain('fav-point fav-point--${m.type}');
    expect(FRISE).toMatch(/type="button"[\s\S]{0,160}fav-point/);
    expect(FRISE).toContain('aria-expanded={actif}');
    /**
     * 🔴🔴 LE SURVOL MONTRE, LE CLIC FIXE — et le FOCUS aussi, ce qui est le point d'Arno (« au survol et au
     * clic au clavier »). Les trois chemins passent par les mêmes rappels, et c'est l'état `apercu` / `fixe`
     * qui décide — plus un `:hover` CSS, depuis que la bulle vit hors du conteneur qui défile.
     */
    expect(FRISE).toContain('onMouseEnter={() => onSurvol(`p${m.id}`)}');
    expect(FRISE).toContain('onFocus={() => onSurvol(`p${m.id}`)}');
    expect(FRISE).toContain('const ouvert = fixe ?? apercu;');
  });

  /**
   * ══ 🔴🔴 LA BULLE VIT **HORS** DE LA PISTE — DÉFAUT MESURÉ À L'ÉCRAN LE 06/10/2026 ═══════════════════════════
   *
   * En CSS, `overflow-x:auto` force l'autre axe à `auto` : la piste devient un conteneur de défilement VERTICAL,
   * et tout ce qui en dépasse est COUPÉ. Mesuré : **132 px de texte tronqués**, puis encore 34 px après avoir
   * réservé de la place sous la rangée — la hauteur visible de la piste (182 px) ne suit pas celle de son
   * contenu (274 px). C'est une impasse : on ne peut pas réserver assez.
   *
   * 🔴 D'OÙ UNE ZONE SOUS LA FRISE. Cette épreuve interdit de l'y remettre.
   *
   * ══ 🔴🔴 CE QUE CETTE ÉPREUVE EXIGEAIT EN PLUS, ET POURQUOI C'EST L'INVERSE MAINTENANT ══════════════════════
   *
   * Elle tenait `.fav-zone{min-height:92px}` — « une hauteur réservée même vide : sinon la page saute à chaque
   * survol d'un point ». Le raisonnement était juste, la réponse ne l'était pas : ces 92 px de vide sont la
   * « deuxième ligne » qu'Arno voit à l'ouverture de chaque événement (mesuré sur lot-237 : conteneur 234 px =
   * 132 de piste + 10 de marge + 92 de vide), et ils étaient là même sans aucune bulle.
   *
   * 🔴 LA RÉPONSE EST DE SORTIR LE SURVOL DU FLUX, PAS DE RÉSERVER LE VIDE. La bulle de survol est flottante
   * (`.fav-flottante`, `position:absolute`) : elle ne pousse rien, donc rien ne saute. La zone ne reste que pour
   * la bulle FIXÉE par un clic, et elle n'existe que tant qu'elle est là.
   */
  it('🔴🔴 la bulle est rendue sous la frise, hors du conteneur qui défile', () => {
    expect(FRISE).toContain('<div className="fav-zone"');
    /* 🔴 ET PAS DANS LA PISTE : aucune bulle en position absolue à l'intérieur. */
    expect(FRISE).not.toMatch(/\.fav-bulle\{position:absolute/);
  });

  /**
   * 🔴🔴 LOT FRISE-COMPACTE, POINT 1 — AUCUNE ZONE VIDE EN DESSOUS.
   *
   * « PAR DÉFAUT : seuls l'en-tête de l'événement […] et UNE rangée de cartes de la frise sont affichés, sans
   * aucune zone vide en dessous. La hauteur du conteneur = la hauteur des cartes + les marges normales. »
   */
  it('🔴🔴 la zone du bas ne réserve plus aucune hauteur', () => {
    expect(FRISE).not.toMatch(/\.fav-zone\{[^}]*min-height/);
    /* 🔴 ET ELLE N'EST RENDUE QUE S'IL Y A UNE BULLE FIXÉE : un conteneur vide garderait sa marge. */
    expect(FRISE).toContain('{detailFixe !== null && (');
  });

  /**
   * 🔴🔴 LE SURVOL NE DÉPLOIE RIEN : il flotte. Sans cela, passer la souris sur la frise ferait sauter de
   * 92 px tout ce qui est en dessous — l'historique du bien — à chaque fois qu'on l'effleure.
   */
  it('🔴🔴 la bulle de survol flotte, et ne prend aucune place', () => {
    expect(FRISE).toContain('{detailApercu !== null && (');
    expect(FRISE).toMatch(/\.fav-flottante\{position:absolute/);
    /* ⚠️ ET ELLE NE SE CLIQUE PAS : sous la souris, elle masquerait la carte suivante. */
    expect(FRISE).toMatch(/\.fav-flottante\{[^}]*pointer-events:none/);
    /* 🔴 DANS LE CADRE POSITIONNÉ, JAMAIS DANS LA PISTE, qui coupe ce qui dépasse. */
    const iPiste = FRISE.indexOf('<ol className="fav-piste"');
    const iFin = FRISE.indexOf('</ol>', iPiste);
    expect(FRISE.indexOf('className="fav-flottante"')).toBeGreaterThan(iFin);
  });

  /**
   * 🔴🔴 LE BAS DES CARRÉS NE PASSE PAS SOUS LA BARRE DE DÉFILEMENT. Mesuré : la piste se rendait à 88 px alors
   * que son contenu en demande 132, et les boutons ✓ / ✕ étaient rognés de 14 px. Aucun ancêtre ne la
   * contraignait — c'est le conteneur de défilement lui-même qui ne prend pas la hauteur de ses enfants.
   */
  it('🔴🔴 la piste réserve la hauteur d’un carré et de sa barre de défilement', () => {
    expect(FRISE).toMatch(/\.fav-piste\{[\s\S]*?min-height:132px/);
    expect(FRISE).toMatch(/\.fav-piste\{[\s\S]*?box-sizing:border-box/);
  });

  /**
   * 🔴🔴 LES POINTS NE SE CHEVAUCHENT PAS (Arno : « Plusieurs messages rapprochés : petits points qui ne se
   * chevauchent pas »). Ils sont posés dans une rangée en `flex` avec un écart — jamais en position absolue
   * calculée à partir d'une date, ce qui les ferait se superposer dès que deux messages tombent le même jour.
   */
  it('🔴🔴 des messages rapprochés ne se superposent pas', () => {
    expect(FRISE).toMatch(/\.fav-points\{[^}]*display:flex/);
    expect(FRISE).toMatch(/\.fav-points\{[^}]*gap:4px/);
  });

  /** 🔴 LA FRISE EST UNE SÉQUENCE : une liste ORDONNÉE, et c'est ce qu'un lecteur d'écran doit entendre. */
  it('🔴 la frise reste une liste ORDONNÉE, même en ligne', () => {
    /* 🔴 UNE FRISE EST UNE SÉQUENCE : c'est ce qu'un lecteur d'écran doit entendre, horizontale ou non. */
    expect(FRISE).toContain('<ol className="fav-piste"');
  });

  /**
   * ══ 🔴🔴 LE DÉFILEMENT NE DOIT JAMAIS PIÉGER LA PAGE ═══════════════════════════════════════════════════════
   *
   * ═══ ⚠️ CE QUE CETTE ÉPREUVE DISAIT AVANT, ET POURQUOI LE VERDICT A CHANGÉ ══════════════════════════════════
   *
   * Elle figeait deux lignes : « const horizontal = e.shiftKey || … » et « if (!horizontal) return; », et elle
   * portait pour titre « seule la molette horizontale (ou Maj) déplace la frise ». C'était la bonne INTENTION —
   * ne pas piéger la page — servie par la plus grossière des mises en œuvre : la molette verticale n'était pas
   * convertie DU TOUT, jamais, même au milieu d'une frise qui avait encore 80 px à montrer.
   *
   * 🔴 ARNO A TRANCHÉ AUTREMENT (lot FRISES-REPARATION, B.2) : « molette verticale convertie en horizontal
   * UNIQUEMENT tant que la frise peut défiler, puis la page reprend la main ». L'intention est tenue — on ne
   * reste pas coincé dans le bloc — mais la molette sert enfin à quelque chose tant qu'il reste à voir.
   *
   * 🔴 ET LA RÈGLE A CHANGÉ DE MAISON : elle est dans `defilementMolette`, module PUR, éprouvé cas par cas dans
   * `defilementFrise.test.ts`. Ici, on vérifie seulement qu'il n'y a plus de SECOND CHEMIN dans le composant.
   */
  it('🔴🔴 aucun gestionnaire de molette n’est écrit dans le composant', () => {
    expect(FRISE).not.toContain('onWheel');
    expect(FRISE).not.toContain('deltaY');
    /* 🔴 LE DÉFILEMENT VIENT DU CROCHET PARTAGÉ, et les gestes sont étalés tels quels. */
    expect(FRISE).toContain("import { useDefilementFrise } from './useDefilementFrise';");
    expect(FRISE).toContain('{...defilement.attaches}');
  });

  /**
   * 🔴🔴 LA CAUSE MESURÉE DU POINT B, ET LE GARDE QUI L'EMPÊCHE DE REVENIR.
   *
   * Sur lot-237 (82 px de défilement disponible), `scroll-behavior:smooth` dans la feuille rendait CHAQUE geste
   * à 0 — molette 0, Maj+molette 0, trackpad 0, et jusqu'à `scrollLeft = 9999` qui rendait 0 après 600 ms :
   * « smooth » fait de toute affectation une animation, que l'affectation suivante annule. Les mêmes gestes
   * rendent 82 sans elle. La douceur est posée en JavaScript, sur les FLÈCHES seules.
   */
  it('🔴🔴 « scroll-behavior » n’est plus dans la feuille de la frise', () => {
    /* ⚠️ LA FEUILLE SANS SES COMMENTAIRES : l'encadré qui raconte pourquoi la propriété a été retirée la cite,
       évidemment. Ce sont les DÉCLARATIONS qui s'appliquent, pas les explications. */
    /* ⚠️ `(?<!over)` : « overscroll-behavior-x » CONTIENT « scroll-behavior », et il doit rester — il empêche
       le bout de la frise d'emporter la page. Deux propriétés différentes, un nom qui se recouvre. */
    const feuille = FRISE.slice(FRISE.indexOf('const CSS_')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(feuille).not.toMatch(/(?<!over)scroll-behavior/);
  });

  /**
   * 🔴 LES FLÈCHES N'APPARAISSENT QUE S'IL RESTE DU CONTENU CACHÉ (Arno).
   *
   * ⚠️ LA MESURE A DÉMÉNAGÉ : elle était écrite ici (`el.scrollLeft + el.clientWidth < el.scrollWidth - 1`),
   * elle est maintenant dans `bordsVisibles` — partagée avec la frise des mails, qui avait sa propre version
   * avec une marge de 4 px au lieu de 1. Deux mesures du même fait finissent toujours par se contredire.
   */
  it('🔴 les flèches ‹ › ne s’affichent que s’il reste à voir', () => {
    expect(FRISE).toContain('{bords.gauche && (');
    expect(FRISE).toContain('{bords.droite && (');
    expect(FRISE).toContain('const { bords } = defilement;');
  });

  /**
   * 🔴🔴 « À l'ouverture, la frise est positionnée pour montrer la dernière étape atteinte » (Arno).
   *
   * ⚠️ UNE SEULE FOIS : sans verrou, chaque relecture (après un confirmer, un ajout, un montant) ramènerait la
   * frise à la dernière étape atteinte — et l'on perdrait l'endroit qu'on regardait, juste après avoir agi
   * dessus. Arno, B.2 : « UNE SEULE FOIS à l'ouverture, puis plus jamais ».
   *
   * ⚠️ LE VERROU A DÉMÉNAGÉ, LUI AUSSI : il s'appelait `cale` et vivait ici ; il est dans `useDefilementFrise`,
   * porté par `calerSurUneFois`, et la frise des mails s'en sert pour son propre calage « aujourd'hui à droite ».
   */
  it('🔴🔴 elle s’ouvre sur la dernière étape atteinte, une seule fois', () => {
    expect(FRISE).toContain('cleDOuverture');
    expect(FRISE).toContain('calerSurUneFois(moi.current);');
    const i = SOURCE_CROCHET.indexOf('const calerSurUneFois');
    expect(SOURCE_CROCHET.slice(i, i + 400)).toContain('if (cale.current');
    expect(SOURCE_CROCHET).toContain("cible.scrollIntoView({ block: 'nearest', inline: 'center' })");
  });

  /** 🔴 « + Ajouter une étape » est TOUJOURS offert — c'est lui qui rend la frise utilisable sans Monga. */
  /**
   * ══ 🔴🔴 LE FORMULAIRE EST REPRIS PAR LE « + » (Arno, accordé explicitement) ════════════════════════════════
   *
   * « Le formulaire “Ajouter une étape” toujours visible sous la frise disparaît, puisqu'il est repris par le
   * “+”. » C'est la SEULE chose retirée de ce lot, et elle l'est avec l'accord d'Arno. Le verdict de l'épreuve
   * d'origine survit : le geste d'ajout existe toujours, sans condition de Monga.
   */
  it('🔴 le carré « + » ouvre le réservoir, sans condition de Monga', () => {
    expect(FRISE).toContain('fav-carre--plus');
    expect(FRISE).toContain('Ajouter une étape ou une information');
    /* 🔴 LOT FRISE-CONSTRUCTIBLE : le « + » n'ouvre plus le formulaire directement, il ouvre le RÉSERVOIR —
       « un clic sur le “+” ouvre, JUSTE EN DESSOUS de la frise, un réservoir de carrés » (Arno, point 2). Le
       formulaire vient après, quand une carte est choisie. Le geste d'ajout existe toujours, en deux temps. */
    expect(FRISE).toContain('onClick={() => p.onAjouter(p.aujourdhui)}');
    expect(FRISE).toContain('listeTypes.map((t) => <option key={t} value={t}>{motEtape(t)}</option>)');
  });

  /**
   * 🔴🔴 « ÉTAPE » OU « SIMPLE INFORMATION » (Arno) : une étape s'affiche en carré, une information en point.
   * Le choix ne fait que changer la LISTE des types proposés — il n'y a pas deux chemins d'écriture, et c'est
   * `estRepere` qui tranche la forme à l'affichage.
   */
  it('🔴🔴 les deux formes sont offertes, par deux listes de types', () => {
    expect(FRISE).toContain("useState<'etape' | 'information'>('etape')");
    expect(FRISE).toContain('Étape (carré)');
    expect(FRISE).toContain('Simple information (point)');
    /* ⚠️ LA LISTE DES ÉTAPES EST DEVENUE `TYPES_RESERVOIR` (lot FRISE-CONSTRUCTIBLE) : c'est la liste qu'Arno a
       dictée carte par carte. `TYPES_AJOUTABLES` reste la garde des ROUTES, et elle en est le sur-ensemble. */
    expect(FRISE).toContain("forme === 'etape' ? TYPES_RESERVOIR : TYPES_INFORMATION");
  });

  /**
   * ⚠️ CHANGER DE FORME CHANGE LE TYPE s'il ne convient plus : sinon on poserait une « Clôture » en point.
   *
   * 🔴 ET LE TYPE DE L'ÉTAPE QU'ON MODIFIE EST TOUJOURS DANS LA LISTE : `ouverture` n'est pas au réservoir, mais
   * des étapes d'ouverture MANUELLES existent en base depuis MONGA-2. Sans cet ajout, rouvrir l'une d'elles pour
   * corriger son texte aurait changé son TYPE en silence — une correction qui casse ce qu'elle corrige.
   */
  it('⚠️ changer de forme corrige un type devenu impossible, sans trahir celui qu’on modifie', () => {
    expect(FRISE).toContain('if (!listeTypes.includes(type)) setType(listeTypes[0]);');
    expect(FRISE).toContain('return sien !== undefined && !base.includes(sien) ? [sien, ...base] : base;');
  });
});

describe('②bis « Modifier » dans la bulle (lot ATTENTION-ET-MODIFIER)', () => {
  /**
   * ══ 🔴🔴 DEMANDE D'ARNO (06/10/2026) ═══════════════════════════════════════════════════════════════════════
   *
   * « dans la bulle d'une étape ou d'une information ajoutée à la main, ajoute “Modifier”, à côté de “Retirer”.
   * Il rouvre le même formulaire prérempli (type, date, heure, texte) et passe par la route PATCH existante.
   * Les étapes Monga restent non modifiables. »
   */
  it('🔴 « Modifier » est offert à côté de « Retirer », sur une étape MANUELLE seulement', () => {
    expect(FRISE).toContain('onClick={() => onModifier(e)}');
    expect(FRISE).toMatch(/onModifier\(e\)\}>\s*\n\s*Modifier\s*\n/);
    /* 🔴 LES DEUX GESTES SONT GARDÉS PAR LA MÊME CONDITION. */
    const i = FRISE.indexOf('onClick={() => onModifier(e)}');
    expect(FRISE.slice(Math.max(0, i - 300), i)).toContain("e.source === 'manuelle'");
  });

  /**
   * 🔴🔴 LE MÊME FORMULAIRE, ET NON UN SECOND. Un panneau d'édition écrit à part aurait fini par proposer
   * d'autres types que l'ajout, ou par oublier la bascule « Étape / Simple information ».
   */
  it('🔴🔴 c’est le MÊME panneau, prérempli', () => {
    expect(FRISE).toContain('modifie: EtapeAAfficher | null;');
    expect(FRISE).toContain("setForme(estRepere(modifie.type) ? 'information' : 'etape');");
    expect(FRISE).toContain('setJour(modifie.survenuLe.slice(0, 10));');
    expect(FRISE).toContain("setHeure(modifie.heureConnue ? modifie.survenuLe.slice(11, 16) : '');");
    expect(FRISE).toContain("setTexte(modifie.texte ?? '');");
  });

  /**
   * ⚠️ LE PRÉREMPLISSAGE NE DÉPEND QUE DE L'IDENTIFIANT. Sans cela, chaque frappe dans le champ « texte »
   * redéclencherait l'effet et réécrirait ce qu'on vient de taper.
   */
  it('⚠️ le préremplissage ne se rejoue pas à chaque frappe', () => {
    expect(FRISE).toContain('}, [modifie?.id]);');
  });

  /** 🔴 LA ROUTE PATCH EXISTANTE, et le POST reste pour l'ajout : deux portes déjà écrites, aucune nouvelle. */
  it('🔴 modifier passe par PATCH /etapes/[id], ajouter par POST /frise', () => {
    expect(FRISE).toContain("method: 'PATCH', headers: { 'Content-Type': 'application/json' }");
    expect(FRISE).toContain("geste: 'modifier'");
    expect(FRISE).toContain('const res = modifie === null');
  });

  /**
   * ⚠️ LE MONTANT N'EST JAMAIS PERDU — et le CHEMIN a changé, pas le verdict. Il était RECOPIÉ tel quel depuis
   * l'étape (`montantCents: modifie.montantCents`), parce que le formulaire ne le portait pas. Il le porte
   * maintenant (Arno, point 2 : « montant pour un devis ») : il est donc préchargé à l'ouverture, puis renvoyé
   * depuis le champ. Omettre la clé l'effacerait toujours, et c'est ce que l'épreuve tient.
   */
  it('⚠️ modifier ne perd pas le montant', () => {
    expect(FRISE).toContain('montantCents: montantEnCents() ?? null');
    expect(FRISE).toContain(
      "setMontant(modifie.montantCents === null ? '' : String(modifie.montantCents / 100).replace('.', ','));");
  });

  /**
   * ⚠️ LA PIÈCE NE SE MODIFIE PAS : `modifierEtapeManuelle` ne la touche pas, et un champ qui ne s'enregistre
   * pas est pire qu'un champ absent. Elle reste offerte à l'AJOUT.
   */
  it('⚠️ le champ « pièce jointe » disparaît en modification', () => {
    expect(FRISE).toContain('{modifie === null && <div className="fav-ajout-ligne">');
  });
});

describe('③ le bloc « Événements » de la fiche du bien', () => {
  /**
   * 🔴🔴 « UNIQUEMENT SI LE BIEN A AU MOINS UN ÉVÉNEMENT » + « Rien d'autre ne bouge dans la fiche (preuve
   * d'empreintes sur une fiche sans événement : identique) ».
   *
   * Le composant rend `null` — rien, pas même un conteneur vide — tant que la liste est vide OU en cours de
   * lecture. Un `<section>` vide, même sans texte, déplacerait ce qui suit d'une marge.
   */
  it('🔴🔴 rien du tout sur un bien sans événement, ni pendant la lecture', () => {
    expect(BLOC).toContain('if (evenements === null || evenements.length === 0) return null;');
  });

  /** 🔴 LES EN COURS DÉPLIÉS, LES CLOS REPLIÉS (Arno). */
  it('🔴 les événements en cours arrivent dépliés', () => {
    expect(BLOC).toContain('const ouverts = new Set(evenements.filter((e) => !e.clos).map((e) => e.id));');
  });

  /** 🔴 UNE LIGNE POUR UN CLOS : titre, dates, dernière étape. */
  it('🔴 la ligne repliée porte le titre, les dates et la dernière étape', () => {
    expect(BLOC).toContain('evb-objet');
    expect(BLOC).toContain('ouvert le {jourFr(e.ouvertLe)}');
    expect(BLOC).toContain('clos le {jourFr(e.traiteLe)}');
    expect(BLOC).toContain('motEtape(e.derniereEtapeType)');
  });

  /**
   * 🔴🔴 IL EST POSÉ **HORS** DE `ancreVie`, et c'est une nécessité : cette enveloppe est la cible de
   * `?bloc=vie` et du cartouche « Événement en cours ». Y glisser un second bloc ferait viser le défilement
   * au-dessus du moteur, et « on arrive sur l'historique » cesserait de tenir.
   */
  it('🔴🔴 il est juste AU-DESSUS du moteur, et hors de son ancre', () => {
    const i = ANNUAIRE.indexOf('<EvenementsDuBien');
    const j = ANNUAIRE.indexOf('<div ref={ancreVie}>');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(0);
    expect(i, 'le bloc précède le moteur').toBeLessThan(j);
  });

  it('🔴 la date se découpe, elle ne passe pas par un objet Date', () => {
    expect(jourFr('2026-09-23T17:02:00+02:00')).toBe('23/09/2026');
    expect(BLOC).not.toContain('new Date(');
  });
});

describe('④ les routes', () => {
  /**
   * 🔴 LE TYPE EST VÉRIFIÉ CONTRE LA LISTE DU MODULE PUR, et non contre le `CHECK` de la base. Les deux listes
   * ne disent pas la même chose : la base accepte `commentaire` (Monga en écrit), la main ne doit pas pouvoir en
   * poser. Se fier au `CHECK` aurait laissé passer un commentaire fabriqué.
   */
  it('🔴🔴 un type d’étape ajouté à la main est borné par TYPES_AJOUTABLES', () => {
    expect(ROUTE_FRISE).toContain('TYPES_AJOUTABLES.includes(type)');
    expect(ROUTE_ETAPE).toContain('TYPES_AJOUTABLES.includes(type)');
  });

  it('🔒 les deux routes exigent un compte actif et ne se mettent pas en cache', () => {
    for (const [nom, src] of [['frise', ROUTE_FRISE], ['etapes', ROUTE_ETAPE]] as const) {
      expect(src, nom).toContain("exigerCompteActif(request, 'gestion')");
      expect(src, nom).toContain("export const runtime = 'nodejs'");
    }
    expect(ROUTE_FRISE).toContain("'Cache-Control': 'private, no-store'");
  });

  /**
   * 🔴 LE REFUS DIT LA RÈGLE, et ne se contente pas d'un code : c'est ainsi qu'on apprend qu'une étape Monga ne
   * se modifie pas, au lieu de croire à une panne.
   */
  it('🔴 un refus de modification explique pourquoi', () => {
    expect(ROUTE_ETAPE).toContain('une étape venue de Monga ne se modifie pas');
    expect(ROUTE_ETAPE).toContain('une étape venue de Monga ne se retire pas');
  });

  /** ⚠️ `null` EST UNE VALEUR POUR LE MONTANT : effacer un montant saisi par erreur doit être possible. */
  it('⚠️ le montant accepte d’être effacé', () => {
    expect(ROUTE_ETAPE).toContain('Montant retiré.');
  });
});

describe('⑤ les mots', () => {
  it('🔴 le compteur de messages s’accorde', () => {
    expect(motGroupeMessages(0)).toBe('0 message');
    expect(motGroupeMessages(1)).toBe('1 message');
    expect(motGroupeMessages(12)).toBe('12 messages');
  });
});

describe('⑥ la feuille', () => {
  /**
   * 🔴 AUCUNE COULEUR EN DUR : jetons `--color-svv-*` uniquement, commentaires compris. C'est ce qui fait que
   * Clair et Sombre suivent sans une ligne de plus — et le garde de feuille du dépôt le refuse de toute façon.
   */
  it('🔴🔴 ni hexadécimal ni rgba dans les deux feuilles', () => {
    for (const [nom, src] of [['FriseAvancement', FRISE], ['EvenementsDuBien', BLOC]] as const) {
      const i = src.indexOf('const CSS_');
      const feuille = src.slice(i);
      expect(feuille, nom).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(feuille, nom).not.toContain('rgba(');
      expect(feuille, nom).toContain('var(--color-svv-');
    }
  });

  /**
   * ⚠️ CIBLES TACTILES ≥ 44 px sur ce qui porte une action principale, et un écran étroit qui tasse au lieu de
   * déborder (exigence transverse du dépôt, CLAUDE.md §15).
   */
  /**
   * ⚠️ ÉCRAN ÉTROIT : « la frise défile, rien ne se superpose » (Arno). Les bulles et le détail se recadrent au
   * lieu de sortir de l'écran, et le panneau d'ajout passe en colonne.
   */
  it('⚠️ l’écran étroit est prévu, et rien ne s’y superpose', () => {
    expect(FRISE).toContain('@media (max-width:600px)');
    /**
     * ⚠️ LA BULLE PASSE EN PLEINE LARGEUR, elle ne se rétrécit plus à 13 rem : depuis qu'elle vit SOUS la frise
     * et non plus collée au point, elle a toute la largeur du bloc et n'a plus à être recadrée.
     */
    expect(FRISE).toMatch(/@media \(max-width:600px\)\{[\s\S]*\.fav-bulle\{max-width:100%\}/);
    /* 🔴 LA PISTE DÉFILE : c'est ce qui remplace tout repli. */
    expect(FRISE).toMatch(/\.fav-piste\{[^}]*overflow-x:auto/);
    expect(BLOC).toContain('min-height:44px');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — CE QU'ARNO A DEMANDÉ, POINT PAR POINT ═══════════════════════════════════════

   « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se CONSTRUIT avec les vraies étapes, dans
   l'ordre réel (ex. rendez-vous → devis refusé → nouveau rendez-vous → nouveau devis…). »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑫ le réservoir (Arno, point 2)', () => {
  /**
   * 🔴🔴 « un clic sur le “+” ouvre, JUSTE EN DESSOUS de la frise, un réservoir de carrés à contour ROUGE ».
   *
   * 🔴 SOUS LA FRISE, ET NON DEDANS : la piste est un conteneur de défilement, et `overflow-x:auto` force
   * l'autre axe à `auto` — tout ce qui dépasse est COUPÉ (mesuré à 132 px au lot FRISE-HORIZONTALE). Quatorze
   * cartes y seraient illisibles, et elles défileraient latéralement avec la frise.
   */
  it('🔴🔴 le réservoir est rendu APRÈS la piste, hors du conteneur qui défile', () => {
    const iPiste = FRISE.indexOf('<ol className="fav-piste"');
    const iFinPiste = FRISE.indexOf('</ol>', iPiste);
    const iReservoir = FRISE.indexOf('className="fav-reservoir"');
    expect(iPiste).toBeGreaterThan(0);
    expect(iReservoir).toBeGreaterThan(iFinPiste);
  });

  /** 🔴 UNE CARTE PAR TYPE, et la liste vient du module pur : deux listes du même ensemble divergent toujours. */
  it('🔴🔴 une carte par type du réservoir, depuis le module pur', () => {
    /* ⚠️ LA LISTE DÉPEND DÉSORMAIS DE L'ÉTAT (lot CLOTURE-REOUVERTURE) : « Clôture » si l'événement est ouvert,
       « Réouverture » s'il est clos. C'est toujours le module PUR qui la rend — `cartesDuReservoir`. */
    expect(FRISE).toContain(
      "const liste = forme === 'etape' ? cartesDuReservoir(evenementOuvert) : TYPES_INFORMATION;");
    expect(FRISE).toContain('className={`fav-carre fav-carre--reserve${t === \'reouverture\'');
    /* ⚠️ AUCUNE LISTE RECOPIÉE DANS LE COMPOSANT : il n'énumère aucun type en dur. */
    for (const t of RESERVOIR_TYPES) {
      if (t === 'autre') continue;
      expect(FRISE, t).not.toContain(`'${t}',`);
    }
  });

  /** 🔴 LA CARTE LIBRE DIT CE QU'ELLE DEMANDE, et son titre est exigé — à l'écran comme à la route. */
  it('🔴🔴 la carte libre demande un titre, et les deux portes l’exigent', () => {
    expect(FRISE).toContain('titre à saisir');
    expect(FRISE).toContain("const titreManquant = type === 'autre' && titre.trim() === '';");
    expect(FRISE).toContain('Une carte libre demande un titre.');
    for (const [nom, src] of [['POST frise', ROUTE_FRISE], ['PATCH étape', ROUTE_ETAPE]] as const) {
      expect(src, nom).toContain("if (type === 'autre' && titreBrut === '') {");
      expect(src, nom).toContain('Une carte libre demande un titre.');
    }
  });

  /** 🔴 « Plus un choix “Simple information” (posée en point, pas en carré) » — Arno. */
  it('🔴 le réservoir offre aussi la simple information', () => {
    const i = FRISE.indexOf('function Reservoir(');
    const bloc = FRISE.slice(i, FRISE.indexOf('\n}\n', i));
    expect(bloc).toContain('Simple information (point)');
    expect(bloc).toContain('TYPES_INFORMATION');
  });

  /** 🔴🔴 « Échap ou “Fermer” referme le réservoir » (Arno) — les deux, et l'écouteur ne vit que tant qu'il est ouvert. */
  it('🔴🔴 Échap et « Fermer » referment tous deux le réservoir', () => {
    /* 🔴 LOT FRISE-COMPACTE : une SEULE porte de fermeture, pour les quatre chemins qu'Arno nomme (Échap,
       « Fermer », clic à côté, validation). Avant, Échap ne fermait que le réservoir, et la bulle n'avait aucun
       moyen de se refermer autrement qu'en recliquant exactement la carte qui l'avait ouverte. */
    expect(FRISE).toContain("if (e.key === 'Escape') toutRefermer();");
    expect(FRISE).toContain('if (!quelqueChoseEstOuvert) return undefined;');
    expect(FRISE).toContain('<button type="button" className="fav-btn" onClick={onFermer}>Fermer</button>');
  });

  /** 🔴 LE FORMULAIRE PART AVEC LA DATE PROPOSÉE, et elle reste modifiable (Arno, points 2 et 4). */
  it('🔴 la date part remplie, et le champ reste modifiable', () => {
    expect(FRISE).toContain('const [jour, setJour] = useState(jourDefaut);');
    expect(FRISE).toContain('jourDefaut={reservoir?.jour ?? aujourdhui}');
    expect(FRISE).toContain('onChange={(e) => setJour(e.target.value)}');
  });

  /**
   * ⚠️ AUJOURD'HUI SE LIT EN LOCAL, JAMAIS PAR `toISOString()` — piège déjà payé dans ce dépôt : il rend l'UTC,
   * et à 23 h à Paris en hiver il écrit DÉJÀ le lendemain. Un formulaire qui propose « demain » un soir sur deux
   * fabrique des dates fausses sans que personne ne le remarque.
   */
  it('⚠️ « aujourd’hui » est lu en local, pas en UTC', () => {
    expect(FRISE).toContain('function aujourdhuiLocal()');
    /* ⚠️ COMMENTAIRES RETIRÉS : l'encadré qui met en garde contre `toISOString` le NOMME, évidemment. C'est le
       CODE qui ne doit pas l'appeler, pas l'explication qui dit pourquoi. */
    const code = FRISE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('toISOString');
  });
});

describe('⑬ les « + » intercalaires (Arno, point 4)', () => {
  /** 🔴🔴 « un petit “+” encapsulé (petit cercle discret sur le trait, plus marqué au survol) ». */
  it('🔴🔴 un petit cercle sur le trait, plus marqué au survol', () => {
    expect(FRISE).toContain("if (p.el.sorte === 'plus-entre')");
    expect(FRISE).toContain('fav-entre-rond');
    expect(FRISE).toContain('.fav-entre:hover .fav-entre-rond,.fav-entre:focus-visible .fav-entre-rond{');
  });

  /**
   * ⚠️ DISCRET N'EST PAS MINUSCULE : le bouton fait 24 px, le cercle 14. Une commande qu'on ne peut atteindre
   * qu'à la souris précise n'existe pas sur un portable (CLAUDE.md §15).
   */
  it('⚠️ la cible tactile reste atteignable au doigt', () => {
    expect(FRISE).toMatch(/\.fav-entre\{[^}]*width:24px/);
    expect(FRISE).toMatch(/\.fav-entre-rond\{[^}]*width:14px/);
  });

  /** 🔴 IL OUVRE LE MÊME RÉSERVOIR, avec la date proposée entre les deux voisines. */
  it('🔴 il ouvre le même réservoir, avec sa date', () => {
    expect(FRISE).toContain('onClick={() => p.onAjouter(jour)}');
    expect(FRISE).toContain('const jour = p.el.jourPropose ?? p.aujourdhui;');
  });
});

describe('⑭ l’ouverture, et ce qu’une carte raconte (Arno, points 1, 3 et 5)', () => {
  /**
   * 🔴🔴 « AU DÉPART : la frise montre seulement le carré “Ouverture” (date d'ouverture de l'événement,
   * modifiable) ». La date voyage avec la frise, depuis la route.
   */
  it('🔴🔴 la date d’ouverture de l’événement porte la première carte', () => {
    expect(ROUTE_FRISE).toContain('ouvertLe: rows[0].ouvert_le');
    expect(FRISE).toContain('construireFrise(etapes, vue.d.ouvertLe ?? null)');
  });

  /**
   * 🔴🔴 ET ELLE EST MODIFIABLE, SUR UNE SEULE VÉRITÉ : le geste écrit `gestion_evenement.ouvert_le`, journalisé,
   * et non une étape d'ouverture copiée à côté — qui aurait pu diverger de l'événement qu'elle prétend dater.
   */
  it('🔴🔴 la corriger corrige l’ÉVÉNEMENT, et le journalise', () => {
    expect(FRISE).toContain("{ geste: 'ouverture', survenuLe: j }");
    expect(ROUTE_FRISE).toContain("if (String(corps.geste ?? '') !== 'ouverture')");
    expect(ROUTE_FRISE).toContain('deplacerOuvertureEvenement(evenementId, jour, auteur)');
    const gestes = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    const i = gestes.indexOf('export async function deplacerOuvertureEvenement');
    const bloc = gestes.slice(i, gestes.indexOf('\n}\n', i));
    expect(bloc).toContain('UPDATE gestion_evenement SET ouvert_le');
    expect(bloc).toContain("journaliser(q, 'evenement', evenementId, 'ouverture', auteur");
    /* ⚠️ LIRE AVANT D'ÉCRIRE : `withTransaction` commite au retour, donc un refus rendu après une écriture
       serait un refus qui a écrit. Piège déjà consigné dans ce dépôt. */
    expect(bloc).toContain('FOR UPDATE');
    /* ⚠️ MIDI, ET NON MINUIT : minuit en heure locale bascule la veille vu d'un fuseau en retard. */
    expect(bloc).toContain("time '12:00'");
  });

  /**
   * 🔴🔴 « Chaque carte enregistre aussi la date et l'heure de sa création et son auteur (“ajoutée le 06/10 à
   * 22:31 par Arnaud”), visibles au survol » — Arno, point 3.
   */
  it('🔴🔴 « ajoutée le … par … » se lit au survol et dans la bulle', () => {
    expect(FRISE).toContain('const pose = motAjout(e.creeLe, e.creeParLibelle);');
    expect(FRISE).toContain('title={pose ?? undefined}');
    expect(FRISE).toContain('<p className="fav-bulle-pose">{motAjout(e.creeLe, e.creeParLibelle)}</p>');
    /* 🔴 ET LA DONNÉE VIENT BIEN DU DÉPÔT : sans `cree_le`, la mention serait toujours vide. */
    const repo = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
    expect(repo).toContain('e.cree_le::text');
    expect(repo).toContain('creeLe: r.cree_le');
  });

  /**
   * 🔴🔴 LES CARTES MONGA SONT INCHANGÉES (Arno, point 5) : contour vert et pictogramme, ajoutées
   * automatiquement à leur date, NON MODIFIABLES — la garde est dans le dépôt, pas dans l'écran.
   */
  it('🔴🔴 une carte Monga reste non modifiable, et le dépôt le tient', () => {
    expect(FRISE).toContain("{e.source === 'manuelle' && (");
    const repo = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
    const i = repo.indexOf('export async function modifierEtapeManuelle');
    expect(repo.slice(i, i + 900)).toContain("source = 'manuelle'");
  });

  /**
   * ⚠️ ÉPREUVE RENVERSÉE — LOT CLOTURE-REOUVERTURE. Elle exigeait que la proposition de clôture « n'ait pas
   * bougé » ; Arno l'a retirée. Ce que la route rend désormais à sa place est ce dont la GRILLE a besoin :
   * l'événement est-il ouvert ? C'est la même donnée (`traite`), déjà lue, et aucune requête de plus.
   */
  it('🔴🔴 la proposition de clôture a été retirée, et la route dit l’état à la place', () => {
    expect(FRISE).not.toContain('vue.d.proposerCloture');
    expect(ROUTE_FRISE).not.toContain('proposerCloture: proposerCloture(etapes, traite)');
    /* 🔴 ET LA FONCTION PURE ELLE-MÊME A DISPARU : une règle orpheline finit par être recâblée. */
    expect(readFileSync('app/lib/gestion/mongaEtape.ts', 'utf8'))
      .not.toContain('export function proposerCloture(');
    expect(ROUTE_FRISE).toContain('ouvert: !traite,');
    expect(ROUTE_FRISE).toContain('typesReservoir: cartesDuReservoir(!traite),');
  });

  /**
   * ══ 🔴🔴 ÉPREUVE AMENDÉE LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ═══════════════════════════════════
   *
   * ELLE EXIGEAIT la frise dans DEUX écrans — la vue de l'événement et la fiche du bien (lot FRISE-COMPACTE,
   * point 6). La carte dépliée ne porte plus de frise : « tout ce qui s'y affichait en plus des infos manquantes
   * et du bouton rouge disparaît » (Arno), et la frise a été retrouvée dans la fiche avant d'être retirée.
   *
   * 🔴 CE QUE LA RÈGLE PROTÉGEAIT TIENT : la frise reste UN SEUL composant, jamais recopié. Elle n'a plus qu'un
   * appelant, et l'épreuve vérifie les deux faces.
   */
  it('🔴🔴 un seul composant, et il n’a plus qu’un appelant : la fiche du bien', () => {
    expect(BLOC).toContain('<FriseAvancement');
    expect(CARTE).not.toContain('<FriseAvancement');
    expect(CARTE).not.toContain("from './FriseAvancement'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-COMPACTE — CE QU'ARNO A DEMANDÉ, POINT PAR POINT ═══════════════════════════════════════════

   « à l'ouverture, l'événement prend aujourd'hui la hauteur de deux lignes (la frise, puis une zone vide ou une
   bulle ouverte en dessous). »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑮ par défaut, une seule rangée (Arno, point 1)', () => {
  /**
   * 🔴🔴 AUCUNE BULLE OUVERTE D'OFFICE. Les deux états partent à `null` : rien n'est survolé, rien n'est fixé.
   * Un état initial non nul aurait déployé la zone dès le premier rendu, ce qu'Arno interdit en toutes lettres.
   */
  it('🔴🔴 rien n’est ouvert au premier rendu', () => {
    expect(FRISE).toContain("const [apercu, setApercu] = useState<string | null>(null);");
    expect(FRISE).toContain("const [fixe, setFixe] = useState<string | null>(null);");
    expect(FRISE).toContain('const [reservoir, setReservoir] = useState<{ jour: string } | null>(null);');
    expect(FRISE).toContain('const [ajout, setAjout] = useState(false);');
  });

  /**
   * 🔴🔴 LA HAUTEUR PAR DÉFAUT EST CELLE DES CARTES ET DES MARGES, ET RIEN D'AUTRE. Mesuré sur lot-237 avant ce
   * lot : conteneur **234 px** = 132 (piste) + 10 (marge) + **92 de vide réservé**. La règle qui réservait ces
   * 92 px est retirée ; la piste, elle, garde sa hauteur minimale, qui n'est pas du vide mais la place des
   * cartes et de leur barre de défilement.
   */
  it('🔴🔴 plus un seul pixel réservé sous la frise', () => {
    expect(FRISE).not.toMatch(/\.fav-zone\{[^}]*min-height/);
    /* ⚠️ MAIS LA PISTE GARDE LA SIENNE : 132 px = 10 de marge + 92 de carré + 30 de barre. Ce n'est pas du
       vide, et la retirer ferait rogner le bas des carrés — défaut déjà mesuré au lot FRISE-HORIZONTALE. */
    expect(FRISE).toMatch(/\.fav-piste\{[^}]*min-height:132px/);
  });
});

describe('⑯ l’espace ne se déploie qu’à la demande, et se replie (Arno, point 2)', () => {
  /** 🔴🔴 LES QUATRE ACTIONS QUI DÉPLOIENT : la bulle fixée, le réservoir, le formulaire d'ajout, celui de modification. */
  it('🔴🔴 chacune des quatre actions, et elle seule, déploie l’espace', () => {
    /* ① bulle de détail, fixée par un clic */
    expect(FRISE).toContain('{detailFixe !== null && (');
    /* ②③④ réservoir, ajout, modification — un seul conteneur, ouvert par l'un ou l'autre */
    expect(FRISE).toContain('{(reservoir !== null || ajout) && (');
  });

  /**
   * 🔴🔴 LES QUATRE FAÇONS DE REPLIER, par une SEULE porte (Arno : « Échap, “Fermer”, clic à côté,
   * validation »). Quatre chemins vers la même fin écrits quatre fois : l'un d'eux oublie toujours quelque chose.
   */
  it('🔴🔴 Échap, « Fermer », clic à côté et validation passent par la même porte', () => {
    expect(FRISE).toContain('const toutRefermer = useCallback((): void => {');
    expect(FRISE).toContain("if (e.key === 'Escape') toutRefermer();");
    expect(FRISE).toContain("document.addEventListener('pointerdown', surClicAilleurs);");
    /* « Fermer » sur la bulle fixée, et sur le réservoir. */
    expect(FRISE).toContain('<button type="button" className="fav-lien" onClick={onFermer}>Fermer</button>');
    expect(FRISE).toContain('<button type="button" className="fav-btn" onClick={onFermer}>Fermer</button>');
    /**
     * La validation referme : `onFait` appelle `fermerReservoir`.
     *
     * ⚠️ LOT MARQUES-EVENEMENT-EN-COURS — `onFait` REÇOIT DÉSORMAIS UN SECOND ARGUMENT (« l'état de l'événement
     * a-t-il changé ? »), pour que la fiche du bien relise sa bande orange après une Clôture ou une Réouverture.
     * La fermeture et le rechargement de la frise, eux, sont inchangés : c'est ce que ces deux lignes gardent.
     */
    expect(FRISE).toContain('onFait={(m, etatChange) => {');
    expect(FRISE).toContain('fermerReservoir();');
    expect(FRISE).toContain('void charger();');
  });

  /**
   * ⚠️ `pointerdown` ET NON `click` POUR LE « CLIC À CÔTÉ » : un `click` naît à la MONTÉE du pointeur, après
   * nos propres gestionnaires — et un glisser de la frise terminé hors du bloc aurait refermé la zone qu'on
   * venait d'ouvrir. La descente dit l'intention au bon moment.
   */
  it('⚠️ le « clic à côté » s’écoute à la descente, et épargne l’intérieur du bloc', () => {
    expect(FRISE).toContain('const surClicAilleurs = (e: PointerEvent): void => {');
    expect(FRISE).toContain('if (cible instanceof Node && moi.current !== null && moi.current.contains(cible)) return;');
    /* ⚠️ ET L'ÉCOUTEUR NE VIT QUE TANT QU'UNE ZONE EST OUVERTE : sinon il écouterait chaque clic de la page. */
    expect(FRISE).toContain('if (!quelqueChoseEstOuvert) return undefined;');
  });

  /**
   * 🔴🔴 UNE SEULE ZONE À LA FOIS (Arno). Ouvrir le réservoir ferme la bulle, et fixer une bulle ferme le
   * réservoir : deux panneaux déployés l'un sous l'autre rendraient au bloc la hauteur qu'on vient de lui
   * retirer.
   */
  it('🔴🔴 une seule zone ouverte à la fois', () => {
    const iRes = FRISE.indexOf('const ouvrirReservoir = useCallback(');
    expect(FRISE.slice(iRes, iRes + 300)).toContain('setFixe(null); setApercu(null);');
    const iFix = FRISE.indexOf('const setOuvert = useCallback(');
    expect(FRISE.slice(iFix, iFix + 300)).toContain('setReservoir(null); setAjout(false);');
  });

  /**
   * 🔴 LE SURVOL NE DÉPLOIE PAS, ET LA PRIORITÉ EST ÉCRITE : quand on vient de cliquer, la souris n'a pas encore
   * quitté la carte, et c'est la bulle DÉPLOYÉE qui doit rester — pas la flottante par-dessus.
   */
  it('🔴 la bulle fixée l’emporte sur la survolée', () => {
    expect(FRISE).toContain('const detailApercu = detailFixe !== null ? null : etapeDe(apercu);');
  });
});

describe('⑰ le grand cadre rouge (Arno, point 4)', () => {
  /**
   * ══ 🔴🔴 DIAGNOSTIC, ÉTABLI EN LISANT LES FEUILLES APPLIQUÉES DANS LA PAGE ═════════════════════════════════
   *
   * C'était un CONTOUR DE FOCUS CLAVIER, et non un état « sélectionné ». Deux règles, et deux seulement,
   * pouvaient peindre un grand cadre rouge autour d'une frise — relevées en parcourant toutes les feuilles de
   * la page et en ne gardant que celles qui portent `svv-red`, un `outline`, et un sélecteur de frise :
   *
   *     .fav-piste:focus-visible { outline: 2px solid var(--color-svv-red); outline-offset: -2px }
   *     .frs-cadre:focus-visible { outline: 2px solid var(--color-svv-red); outline-offset: -2px }
   *
   * Les deux ont été posées au lot FRISES-REPARATION (B), en même temps que le `tabIndex: 0` qui rend ces
   * régions atteignables aux flèches ← → du clavier. C'est le traitement de focus des PETITS BOUTONS de
   * l'application appliqué à une RÉGION de 1074 × 132 px — d'où un cadre qui crève l'écran.
   *
   * 🔴 CE QUI LE REMPLACE : un liseré rouge de 3 px sur le bord gauche, l'accent déjà employé par
   * `.fav-proposition` et `.fav-bulle` dans cette même feuille. Discret, cohérent, visible au seul clavier.
   */
  it('🔴🔴 plus aucun contour rouge pleine largeur sur une région', () => {
    for (const [nom, src] of [['avancement', FRISE], ['mails', MAILS_FRISE]] as const) {
      const feuille = src.slice(src.indexOf('const CSS_')).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(feuille, nom).not.toMatch(/focus-visible\{outline:2px solid var\(--color-svv-red\);outline-offset:-2px\}/);
    }
  });

  /** 🔴 L'INDICATEUR RESTE, DISCRET, ET SUR LES DEUX FRISES — elles partagent leur défilement, donc sa signalétique. */
  it('🔴🔴 un liseré discret le remplace, sur les deux frises', () => {
    expect(FRISE).toContain('.fav-piste:focus-visible{outline:2px solid transparent;outline-offset:-2px;');
    expect(FRISE).toContain('box-shadow:inset 3px 0 0 0 var(--color-svv-red)}');
    expect(MAILS_FRISE).toContain('.frs-cadre:focus-visible{outline:2px solid transparent;outline-offset:-2px;');
    expect(MAILS_FRISE).toContain('box-shadow:inset 3px 0 0 0 var(--color-svv-red)}');
  });

  /**
   * ⚠️ `:focus-visible` ET JAMAIS `:focus` — « visible uniquement au clavier » (Arno). Un `:focus` nu
   * rallumerait l'indicateur à chaque clic de souris dans la frise, ce qui est exactement ce qui faisait croire
   * à un « état sélectionné ».
   */
  it('⚠️ l’indicateur ne s’allume qu’au clavier', () => {
    for (const [nom, src] of [['avancement', FRISE], ['mails', MAILS_FRISE]] as const) {
      const feuille = src.slice(src.indexOf('const CSS_')).replace(/\/\*[\s\S]*?\*\//g, '');
      /* ⚠️ `:focus` SEUL, sans `-visible` derrière : c'est lui qu'on interdit. */
      expect(feuille, nom).not.toMatch(/:focus(?!-visible)[^-a-z]/);
    }
  });

  /**
   * ⚠️ UN CONTOUR TRANSPARENT EST CONSERVÉ : en mode contraste forcé, les ombres ne sont pas peintes, et c'est
   * le contour que le système repeint. Sans lui, l'indicateur disparaîtrait pour ceux qui en ont le plus besoin.
   */
  it('⚠️ le contraste forcé garde un contour à repeindre', () => {
    expect(FRISE).toContain('outline:2px solid transparent');
    expect(MAILS_FRISE).toContain('outline:2px solid transparent');
  });
});

describe('⑱ les événements clos restent repliés (Arno, point 3)', () => {
  /** 🔴🔴 « Seuls les événements EN COURS ont leur frise ouverte par défaut. » */
  it('🔴🔴 seuls les en cours s’ouvrent d’office', () => {
    expect(BLOC).toContain('const ouverts = new Set(evenements.filter((e) => !e.clos).map((e) => e.id));');
  });

  /**
   * 🔴 L'EXCEPTION, ET ELLE EST VOULUE (lot VIGNETTE-EVENEMENT, point 1) : l'événement VISÉ par le gros bouton
   * de l'écran partagé est déplié même s'il est clos. On vient de cliquer un bouton qui promet de l'ouvrir ;
   * le laisser replié parce qu'il est clos tiendrait la lettre de la règle contre son esprit.
   */
  it('🔴 l’événement visé par le bouton est déplié, même clos', () => {
    expect(BLOC).toContain(
      'if (evenementVise !== null && evenements.some((e) => e.id === evenementVise)) ouverts.add(evenementVise);');
  });

  /**
   * ⚠️ POSÉ UNE FOIS, À L'ARRIVÉE DES DONNÉES — et non recalculé à chaque rendu, sans quoi replier un événement
   * en cours le rouvrirait aussitôt.
   */
  it('⚠️ replier un en cours ne le rouvre pas', () => {
    /* ⚠️ LA DÉPENDANCE A GAGNÉ `evenementVise` (lot VIGNETTE-EVENEMENT) : l'effet doit se rejouer quand
       l'adresse désigne un autre événement. Elle NE CONTIENT TOUJOURS PAS `deplies` — c'est elle qui ferait
       rouvrir aussitôt ce qu'on vient de replier. */
    const i = BLOC.indexOf('const ouverts = new Set(evenements.filter');
    const fin = BLOC.indexOf('}, [', i);
    expect(BLOC.slice(fin, fin + 40)).toContain('}, [evenements, evenementVise]);');
    expect(BLOC.slice(fin, fin + 40)).not.toContain('deplies');
  });

  /** 🔴 UN CLOS SE DÉPLIE AU CLIC : une ligne repliée n'est pas une ligne morte. */
  it('🔴 un clos se déplie au clic, et dit son état', () => {
    expect(BLOC).toContain('aria-expanded={ouvert}');
    expect(BLOC).toContain("{e.clos ? 'clos' : 'en cours'}");
    /* 🔴 ET LA LIGNE REPLIÉE PORTE TITRE, DATES ET DERNIÈRE ÉTAPE (Arno). */
    expect(BLOC).toContain('className="evb-objet"');
    expect(BLOC).toContain('ouvert le {jourFr(e.ouvertLe)}');
    expect(BLOC).toContain('className="evb-etape"');
  });

  /**
   * 🔴 ET LA FRISE N'EST MONTÉE QUE SI L'ÉVÉNEMENT EST DÉPLIÉ : un clos ne coûte aucune requête.
   *
   * ⚠️ LA FENÊTRE DE LECTURE S'EST ÉLARGIE (lot URGENCE-EVENEMENT, point 3b) : le sélecteur d'urgence est
   * désormais la PREMIÈRE chose sous l'en-tête, et la frise vient juste après — « près de l'en-tête de
   * l'événement » (Arno). Ce qui est éprouvé ne change pas d'un cran : la frise est DANS le `{ouvert && …}`, donc
   * elle n'est pas montée tant que la carte est repliée.
   */
  it('🔴 la frise d’un événement replié n’est pas montée', () => {
    expect(BLOC).toContain('{ouvert && (');
    const i = BLOC.indexOf('{ouvert && (');
    const fin = BLOC.indexOf('</>)}', i);
    expect(fin).toBeGreaterThan(i);
    expect(BLOC.slice(i, fin)).toContain('<FriseAvancement');
    /* 🔴 ET LE SÉLECTEUR D'URGENCE EST DEDANS AUSSI, AVANT ELLE : il ne coûte rien sur un événement replié. */
    expect(BLOC.slice(i, fin)).toContain('<SelecteurUrgence ');
    expect(BLOC.slice(i, fin).indexOf('<SelecteurUrgence '))
      .toBeLessThan(BLOC.slice(i, fin).indexOf('<FriseAvancement'));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — L'ÉTAT DÉMÉNAGE, LE GROS BOUTON LE REMPLACE ════════════════════════

   ACCORD D'ARNO (06/10/2026) : « BLOC “À traiter / En cours / Traité” : il est retiré de l'écran partagé. Sa
   fonction n'est pas perdue : elle est ajoutée dans l'en-tête de l'événement sur la fiche du bien (bloc
   Événements) et dans la vue de l'événement, même porte d'écriture. À sa place, dans l'écran partagé : un GROS
   bouton pleine largeur “Ouvrir la fiche du bien sur cet événement →”. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑲ l’état quitte l’écran partagé, sans perdre sa fonction', () => {
  /**
   * 🔴🔴 UN SEUL ARGUMENT SÉPARE LES DEUX RENDUS. La carte est écrite une seule fois (« rendues une seule fois »,
   * `GestionVue`) : un second composant aurait fini par diverger sur tout le reste du dossier.
   */
  it('🔴🔴 la même carte, deux rendus : partagé sans état, plein écran avec', () => {
    /* ⚠️ LOT FILTRES-EVENEMENTS-NEW — `cartesDe` part désormais de la liste RANGÉE (`evenementsRanges`) et non
       de `d.evenements` : le tri se fait UNE fois, en amont, et les deux listes lisent le même tableau. Ce que ce
       cas éprouve ne change pas d'un cran : une seule fonction rend les deux écrans. */
    expect(VUE).toContain('const cartesDe = (partage: boolean) => evenementsRanges.map((e) => (');
    /* 🔴 PLEIN ÉCRAN : `partage` faux, l'état reste. ÉCRAN PARTAGÉ : `partage` vrai, le bouton le remplace. */
    expect(VUE).toContain('<ul className="gst-liste gst-cartes-larges">{cartesDe(false)}</ul>');
    expect(VUE).toContain('<ul className="gst-liste">{cartesDe(true)}</ul>');
  });

  /**
   * ══ 🔴🔴 ÉPREUVE RENVERSÉE LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ═════════════════════════════════
   *
   * ELLE EXIGEAIT « L'UN OU L'AUTRE, JAMAIS LES DEUX » : le gros bouton dans l'écran partagé, les trois boutons
   * d'état en plein écran (lot VIGNETTE-EVENEMENT, point 1). ARNO tranche l'inverse le 08/10/2026 : « RÈGLE
   * UNIQUE […] IDENTIQUE sur les deux écrans », et le bouton rouge fait partie de ce que la carte dépliée montre
   * TOUJOURS.
   *
   * 🔴 LE BOUTON EST DONC SUR LES DEUX ÉCRANS, sans condition. Les trois boutons d'état, eux, restent en plein
   * écran SEULEMENT — l'unique exception du lot, parce qu'ils n'existent nulle part ailleurs et qu'Arno demande
   * de ne pas retirer ce qui serait alors perdu. Voir l'encadré de `CorpsCarte`.
   */
  it('🔴🔴 le bouton rouge est sur les deux écrans ; l’état reste l’exception du plein écran', () => {
    expect(CARTE).toContain('<OuvrirLaFicheDuBien biens={d.biens ?? []}');
    expect(CARTE).not.toContain('{partage\n        ? <OuvrirLaFicheDuBien');
    expect(CARTE).toContain('{partage ? null : (\n        <EtatCarte etat={d.etat}');
  });

  /**
   * ══ 🔴🔴 CE QUE CES TROIS ÉPREUVES TENAIENT, ET POURQUOI ELLES ONT DISPARU ═════════════════════════════════
   *
   * Elles vérifiaient les boutons « À traiter / En cours / Traité » dans l'en-tête de l'événement sur la fiche
   * du bien — ajoutés au lot VIGNETTE-EVENEMENT (point 1), et la MÊME porte d'écriture que la carte.
   *
   * ACCORD D'ARNO (07/10/2026), lot EVENEMENT-MINIMALISTE : « retire les boutons “À traiter / En cours /
   * Traité” (ils ne servent à rien) […] L'état existant en base n'est pas modifié. »
   *
   * 🔴 CE QUI LES REMPLACE N'EST PAS RIEN : l'épreuve ci-dessous tient le fait inverse — plus aucun bouton
   * d'état, ni classe, ni règle de feuille — ce qui est une garde aussi stricte. Et le recensement donné à Arno
   * avant le retrait (onze lectures de l'état, dont quatre tris et deux filtres) reste vrai : aucune lecture
   * n'a perdu sa donnée, et la porte d'écriture de la vue de l'événement en plein écran est intacte.
   */
  it('🔴🔴 plus aucun bouton d’état sur la fiche du bien : ni classe, ni règle, ni porte', () => {
    /* ⚠️ LU COMMENTAIRES RETIRÉS : l'encadré qui dit que ces règles ont été retirées les NOMME, évidemment. */
    const code = BLOC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('evb-etats');
    expect(code).not.toContain('evb-etat');
    expect(code).not.toContain('changerEtat');
    /* 🔴 ET LA PORTE D'ÉCRITURE DE LA VUE DE L'ÉVÉNEMENT RESTE : l'état n'est pas devenu immuable. */
    expect(CARTE).toContain("onEtat={(e) => void agir({ etat: e }");
  });
});

describe('⑳ le gros bouton « Ouvrir la fiche du bien sur cet événement »', () => {
  /** 🔴🔴 PLEINE LARGEUR, et il dit où il mène — mot pour mot celui d'Arno. */
  it('🔴🔴 le bouton existe, pleine largeur, avec le libellé d’Arno', () => {
    expect(CARTE).toContain('Ouvrir la fiche du bien sur cet événement →');
    expect(CARTE).toContain('className="svv-btn svv-btn-primary gst-ouvrir-fiche"');
  });

  /** 🔴 UN SEUL BIEN : il y va directement. « Petit choix du bien d'abord » ne vaut qu'au pluriel (Arno). */
  it('🔴 un seul bien : pas de choix intermédiaire', () => {
    expect(CARTE).toContain('if (ouvrables.length === 1 && biens.length === 1) {');
    expect(CARTE).toContain('onClick={() => onOuvrirBien(ouvrables[0].cle, evenementId)}');
  });

  /** 🔴 PLUSIEURS BIENS : le choix s'ouvre, et chaque ligne dit l'adresse — « 315 ou 457 ? » n'est pas une question. */
  it('🔴 plusieurs biens : un choix, et chaque ligne porte son adresse', () => {
    expect(CARTE).toContain('<ul className="gst-choix-biens" aria-label="Choisir le bien">');
    expect(CARTE).toContain('const lieu = [b.adresse, b.commune].filter');
  });

  /**
   * ⚠️ AUCUN BIEN : on le DIT. Un bouton qui ne mène nulle part s'apprend, et l'on cesse de le regarder.
   * ⚠️ UNE CLÉ NON NUMÉRIQUE EST LISTÉE QUAND MÊME, avec son impossibilité écrite : une fiche de bien s'adresse
   * par sa clé WIPPIMMO (`bien-<nombre>`), et taire ce bien ferait croire que l'événement ne le concerne pas.
   */
  it('⚠️ aucun bien, ou une clé non adressable : c’est dit, jamais tu', () => {
    expect(CARTE).toContain('Cet événement n’est rattaché à aucun bien');
    expect(CARTE).toContain('fiche non adressable (clé non numérique)');
  });

  /**
   * 🔴🔴 LA NAVIGATION PASSE PAR L'ADRESSE, et non par un état de composant : ce que le bouton promet doit
   * survivre à un rechargement et à un lien envoyé à un collègue (même arbitrage que `bloc`).
   */
  /**
   * ⚠️ ÉPREUVE RÉÉCRITE EN **COMPORTEMENT** (lot URGENCE-EVENEMENT, point 4). Elle figeait trois lignes de
   * `ecranUrl.ts` mot pour mot ; le point 4 d'Arno les a élargies (`evenement=` vaut désormais aussi sur
   * `ecran=evenements`), et l'épreuve est tombée sans qu'aucune promesse ne soit rompue. On éprouve donc ce qui
   * compte : l'adresse PRODUITE, et ce qu'une adresse RELUE rend — ce qu'un collègue reçoit dans un lien.
   */
  it('🔴🔴 l’événement visé voyage dans l’adresse, avec sa fiche', () => {
    expect(VUE).toContain("aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte: 'bien', id: n }, evenementVise: evenementId });");
    const url = readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8');
    expect(url).toContain('evenementVise?: number | null;');
    /* 🔴 L'ADRESSE PORTE LES DEUX, et elle se relit à l'identique : c'est l'aller-retour qui compte. */
    const ecrite = ecrireEtatUrl({
      ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte: 'bien', id: 315 }, evenementVise: 7,
    });
    expect(ecrite).toContain('fiche=bien-315');
    expect(ecrite).toContain('evenement=7');
    expect(lireEtatUrl(ecrite).evenementVise).toBe(7);
    /* ⚠️ DANS L'ANNUAIRE, ÉCRIT ET LU UNIQUEMENT AVEC SA FICHE : un `?evenement=` orphelin n'y désigne rien. */
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: null, evenementVise: 7 }))
      .not.toContain('evenement=');
    expect(lireEtatUrl('?ecran=annuaire&evenement=7').evenementVise).toBeNull();
  });

  /**
   * 🔴 ET LE CENTRAGE SUR LA DERNIÈRE ÉTAPE EST DÉJÀ TENU : `FriseAvancement` cale sur `cleDOuverture` — la
   * dernière carte réelle — UNE SEULE FOIS à son montage. Déplier l'événement monte la frise, et la frise se
   * cale. Un second calage écrit dans le bloc l'aurait fait deux fois.
   */
  it('🔴 le bloc se pose sur l’événement, une seule fois, et laisse la frise se caler', () => {
    expect(BLOC).toContain("el.scrollIntoView({ block: 'start' });");
    /* ⚠️ ET SEULEMENT UNE FOIS L'ÉVÉNEMENT DÉPLIÉ : sa frise se monte alors, et la page cesse de bouger sous le
       défilement. Mesuré sans cette garde : on arrivait 30 px trop bas, le titre du bloc rogné. */
    expect(BLOC).toContain(
      'if (pose.current || evenementVise === null || evenements === null || !deplies.has(evenementVise)) return;');
    expect(BLOC).toContain('pose.current = true;');
    /* ⚠️ LU COMMENTAIRES RETIRÉS pour les deux interdits qui suivent : les encadrés qui expliquent POURQUOI on
       les a retirés les citent forcément. C'est le CODE qui ne doit pas les porter. */
    const code = BLOC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* ⚠️ SANS DOUCEUR, ET C'EST MESURÉ : avec `behavior:'smooth'`, le défilement partait de 0 et s'arrêtait à
       459 px pour une cible à 1078 — à mi-chemin. Le bouton PROMET d'arriver sur l'événement. */
    expect(code).not.toContain("behavior: 'smooth'");
    /* ⚠️ ET LE BLOC NE CALE PAS LA FRISE LUI-MÊME : un seul code pour un seul geste. */
    expect(code).not.toContain('cleDOuverture');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA VIGNETTE ET SA MINIATURE ════════════════════════════════════════

   « Retire la capsule “attend une réponse”. Garde toutes les autres informations actuelles (titre, référence,
   état, nombre d'échanges, dernier échange). Ajoute À DROITE de la vignette une miniature de la DERNIÈRE carte
   d'étape de sa frise. […] Sans aucune étape : “Ouverture” et sa date. Le titre se coupe proprement avec “…”. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('㉑ la vignette d’un événement', () => {
  /**
   * 🔴🔴 LA CAPSULE EST RETIRÉE DE LA VIGNETTE D'UN ÉVÉNEMENT (accord d'Arno) — et d'elle seule.
   *
   * ⚠️ ELLE RESTE SUR LES ÉCHANGES (`LigneFil`), où elle dit autre chose : un fil qui attend une réponse de notre
   * part. La retirer là aussi aurait supprimé une fonction qu'Arno n'a pas accordée.
   */
  it('🔴🔴 plus de capsule « attend une réponse » sur un événement, elle reste sur un échange', () => {
    /* La vignette vivante est le titre de `CarteVive` : plus aucune capsule dans tout le fichier sauf sur un fil. */
    const titres = CARTE.slice(CARTE.indexOf('<span className="gst-carte-titre'), CARTE.indexOf('</BlocRepliable>'));
    expect(titres).not.toContain('gst-attend');
    /* ⚠️ ET ELLE SURVIT LÀ OÙ ELLE DIT ENCORE QUELQUE CHOSE : sur un ÉCHANGE de la FILE (`GestionVue`).
       ⚠️ PLUS DANS `CarteVive` : la liste des échanges rattachés a quitté la carte dépliée au lot
       CARTES-EVENEMENT-MEME-GESTE, et la capsule est partie avec elle. C'est le seul endroit qu'elle perd — la
       file, qui est l'écran où l'on cherche ce qui attend, la garde intacte. */
    expect(CARTE).not.toContain('gst-attend');
    expect(VUE).toContain('{fil.attend && <span className="gst-attend">attend une réponse</span>}');
  });

  /** 🔴 TOUT LE RESTE EST GARDÉ (Arno) : titre, référence, état, nombre d'échanges, dernier échange. */
  /**
   * ══ 🔴🔴 CE CAS A CHANGÉ DE VERDICT — LOT CARTE-EVENEMENT-EPUREE (07/10/2026) ═════════════════════════════════
   *
   * IL EXIGEAIT QUE LA VIGNETTE GARDE LA RÉFÉRENCE, L'ÉTAT ET « dernier échange » sur sa ligne. ACCORD D'ARNO :
   * la référence (« GES-2026-000001 ») et l'état (« En cours ») QUITTENT la carte — ils restent sur la fiche du
   * bien et dans la fenêtre de l'événement — et « dernier échange » ne s'écrit plus qu'une fois, dans la ligne
   * « Ouvert depuis N jours · dernier échange il y a N jours » juste en dessous.
   *
   * 🔴 CE QUI RESTE EST ÉPROUVÉ ICI, et le reste l'est À L'ÉCRAN : `CarteVive.epuree.test.ts` monte le composant
   * et lit ce qu'il rend, plutôt que la forme de son texte source.
   */
  it('🔴🔴 la vignette ne porte plus ni la référence, ni l’état, ni le compteur d’échanges', () => {
    expect(CARTE).not.toContain('<span className="gst-ref">{carte.reference}</span>');
    expect(CARTE).not.toContain('<span>{libelleEtat(etat)}</span>');
    /* 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 5 — le compteur « N échange(s) » part à son tour (accord d'Arno).
       Ce qui reste de l'activité du dossier, c'est « Ouvert depuis N jours · dernier échange il y a N jours ». */
    expect(CARTE).not.toContain("{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}");
    expect(CARTE).toContain('dernier échange il y a {motJours(dernier)}');
  });

  /**
   * 🔴🔴 LA MINIATURE, À DROITE, AU MÊME DESSIN QUE LA FRISE : contour VERT, ambre si « à confirmer »,
   * pictogramme Monga. Les trois couleurs du lot FRISE-CONSTRUCTIBLE, pour qu'on reconnaisse la carte en ouvrant
   * le dossier.
   */
  it('🔴🔴 la miniature reprend le dessin et les couleurs de la frise', () => {
    expect(CARTE).toContain('<MiniatureEtape etape={carte.derniereEtape} ouvertLe={carte.ouvertLe}');
    expect(VUE).toContain('.gst-mini{');
    expect(VUE).toMatch(/\.gst-mini\{[^}]*border:2px solid var\(--color-svv-green\)/);
    expect(VUE).toContain('.gst-mini--doute{border-color:var(--color-svv-amber)}');
    expect(CARTE).toContain('{deMonga && <span className="gst-mini-picto" aria-hidden="true"> ◆</span>}');
  });

  /**
   * ⚠️ LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE : « à confirmer » est écrit, et la source est dite au
   * lecteur d'écran. Règle du dépôt, et elle vaut ici comme sur la frise.
   */
  it('⚠️ ni le doute ni la source ne se disent par la couleur seule', () => {
    expect(CARTE).toContain('{doute && <span className="gst-mini-doute">à confirmer</span>}');
    expect(CARTE).toContain("`dernière étape : ${mot} du ${date}, ${deMonga ? 'venue de Monga' : 'posée à la main'}`");
  });

  /**
   * 🔴🔴 SANS AUCUNE ÉTAPE : « Ouverture » et sa date (Arno). C'est exactement ce que la frise montre dans le
   * même cas — sa carte d'ouverture dérivée de `gestion_evenement.ouvert_le`. Les deux écrans lisent la même
   * donnée, donc ils ne peuvent pas se contredire.
   */
  it('🔴🔴 sans étape : « Ouverture » et la date d’ouverture de l’événement', () => {
    expect(CARTE).toContain("const mot = etape === null\n    ? motEtape('ouverture')");
    expect(CARTE).toContain("const quand = (etape?.survenuLe ?? ouvertLe ?? '').slice(0, 10);");
  });

  /**
   * ══ 🔴🔴 RÈGLE RENVERSÉE LE 07/10/2026 — LOT EVENEMENTS-CARTES-PLEINES, POINT 2 ═════════════════════════════
   *
   * ELLE EXIGEAIT LA COUPURE : « Le titre se coupe proprement avec “…” pour laisser la place [à la miniature] »,
   * c'était la demande du lot VIGNETTE-EVENEMENT. ARNO LA REMPLACE : « Plus aucun texte coupé par “…” dans la
   * carte : le titre complet […]. Les textes longs passent à la ligne au lieu d'être tronqués, et la carte
   * grandit en hauteur. »
   *
   * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT TIENT TOUJOURS, ET C'EST LA MOITIÉ QUI COMPTE : la miniature garde sa
   * place, c'est le TEXTE qui cède. Les deux dernières assertions ne bougent donc pas d'un caractère — elles
   * sont même ce qui empêche la nouvelle règle de faire déborder la colonne de droite.
   */
  it('🔴🔴 le titre est ENTIER, et c’est la hauteur qui cède, jamais la miniature', () => {
    expect(CARTE).toContain('<span className="gst-objet gst-objet--entier" title={objet}>{objet}</span>');
    expect(VUE).toContain('.gst-objet--entier{display:block;white-space:normal;overflow-wrap:anywhere}');
    /* 🔴 PLUS AUCUNE COUPURE : ni la classe d'avant, ni sa règle. */
    expect(CARTE).not.toContain('gst-objet--coupe');
    expect(VUE).not.toContain('.gst-objet--coupe{');
    /* 🔴 ET C'EST LE TEXTE QUI RÉTRÉCIT, PAS LA MINIATURE : `min-width:0` sur la colonne de texte (sans quoi un
       enfant en flex refuse de passer sous sa largeur de contenu), `flex:0 0 auto` sur la miniature. */
    expect(VUE).toMatch(/\.gst-carte-texte\{[^}]*flex:1 1 auto;min-width:0/);
    expect(VUE).toMatch(/\.gst-mini\{flex:0 0 auto/);
  });

  /**
   * 🔴 LA DERNIÈRE ÉTAPE VIENT DES **DEUX** SOURCES DE LA FRISE — l'événement ET ses références Monga reliées —
   * et les REPÈRES en sont écartés : un commentaire ou un rappel ne sont pas des étapes (règle de MONGA-2).
   */
  it('🔴🔴 la lecture suit les mêmes règles que la frise', () => {
    const repo = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
    expect(repo).toContain('OR x.reference IN (SELECT reference FROM gestion_monga_lien');
    expect(repo).toContain("x.type NOT IN ('facture','rappel_devis','contact_injoignable','commentaire','note')");
    /* ⚠️ LA DERNIÈRE PAR DATE, puis par identifiant — exactement l'ordre de `construireFrise`. */
    expect(repo).toContain('ORDER BY x.survenu_le DESC, x.id DESC');
    expect(repo).toContain("x.statut = 'vif'");
  });

  /**
   * ⚠️ LA MINIATURE A SON PROPRE PRÉFIXE DE CLASSE. La feuille de la frise n'est pas injectée sur l'écran
   * partagé, et deux composants ne partagent JAMAIS un préfixe — il n'y a pas de portée en CSS (leçon mesurée au
   * lot FRISES-REPARATION, où `.frs` partagé cassait la frise des mails).
   */
  it('⚠️ la miniature n’emprunte aucune classe de la frise', () => {
    const i = CARTE.indexOf('function MiniatureEtape');
    const bloc = CARTE.slice(i, CARTE.indexOf('\n}\n', i));
    expect(bloc).not.toContain('fav-');
    expect(bloc).not.toContain('frs-');
  });
});

describe('㉑-bis la miniature ne peut pas emporter l’écran', () => {
  /**
   * ══ 🔴🔴 DÉFAUT MESURÉ PENDANT CE LOT, ET CORRIGÉ ═════════════════════════════════════════════════════════
   *
   * Premier jet : `etape === null`. La suite a rendu `TypeError: Cannot read properties of undefined (reading
   * 'type')` sur **14 épreuves** de `GestionVue.fusion`. Ce n'était pas un artefact d'épreuve : le champ arrive
   * d'une réponse JSON, et il est ABSENT — pas `null` — dès qu'un appelant ne le pose pas (une page encore
   * ouverte pendant un déploiement, un écran qui construit une carte à la main, un cache).
   *
   * 🔴 LA CONSÉQUENCE ÉTAIT TOTALE : la vignette jetait, donc la liste, donc l'écran partagé. Une miniature est
   * un ORNEMENT ; elle ne doit jamais pouvoir emporter l'écran qui la porte.
   */
  it('🔴🔴 une dernière étape ABSENTE se lit comme une absence, pas comme une panne', () => {
    expect(CARTE).toContain('etape: DerniereEtapeVignette | null | undefined;');
    expect(CARTE).toContain('const etape = brut ?? null;');
  });

  /** ⚠️ ET LA DATE RÉSISTE AUSSI À UNE CHAÎNE ABSENTE : une carte sans `ouvertLe` ne doit pas davantage jeter. */
  it('⚠️ une date absente rend un tiret, jamais une exception', () => {
    expect(CARTE).toContain("const quand = (etape?.survenuLe ?? ouvertLe ?? '').slice(0, 10);");
    expect(CARTE).toContain("? `${quand.slice(8, 10)}/${quand.slice(5, 7)}/${quand.slice(0, 4)}` : '—';");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — « MIS À JOUR PAR MONGA » ═══════════════════════════════════════════

   « Quand l'automatisation Monga AJOUTE ou MODIFIE une étape d'un événement (jamais pour un geste manuel), la
   vignette est mise en avant : liseré vert lumineux qui pulse doucement, plus un petit badge “Mis à jour par
   Monga · <heure>” sur la miniature. […] L'effet reste PAR COLLABORATEUR jusqu'à ce que CE collaborateur clique
   sur la vignette, OU ouvre la fiche du bien concerné (par n'importe quel chemin), OU ouvre la vue de
   l'événement. Il ne s'éteint pas chez un autre collaborateur. Il se rallume à la prochaine mise à jour Monga. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('㉒ l’effet « mis à jour par Monga »', () => {
  const REPO_FILE = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
  const REPO_VU = readFileSync('app/lib/gestion/evenementVuRepo.ts', 'utf8');
  const ROUTE_VUS = readFileSync('app/(admin)/api/admin/gestion/evenements/vus/route.ts', 'utf8');

  /**
   * 🔴🔴 UNE ÉTAPE MONGA ALLUME, UNE ÉTAPE MANUELLE N'ALLUME RIEN — « jamais pour un geste manuel » (Arno). La
   * règle est en SQL, pas à l'écran : une règle tenue par l'écran seul serait contournée par la deuxième lecture
   * qui l'oublie.
   */
  it('🔴🔴 seule une étape de SOURCE Monga compte', () => {
    const i = REPO_FILE.indexOf('const SQL_DERNIERE_MAJ_MONGA');
    const bloc = REPO_FILE.slice(i, REPO_FILE.indexOf('`;', i));
    expect(bloc).toContain("y.source = 'monga'");
    /* 🔴 ET LES DEUX SOURCES DE LA FRISE : l'événement, ET ses références Monga reliées. */
    expect(bloc).toContain('y.evenement_id = e.id');
    expect(bloc).toContain('OR y.reference IN (SELECT reference FROM gestion_monga_lien');
  });

  /**
   * 🔴🔴 « AJOUTE **OU MODIFIE** » : `greatest(cree_le, maj_le)`, et non `survenu_le`. La date de l'étape est
   * celle du FAIT (un rendez-vous de la semaine prochaine) ; ce qu'on veut est le moment où l'automatisation a
   * ÉCRIT. Les confondre allumerait l'effet pour un rendez-vous futur enregistré il y a trois semaines.
   */
  it('🔴🔴 c’est la date d’ÉCRITURE qui compte, pas celle du fait', () => {
    const i = REPO_FILE.indexOf('const SQL_DERNIERE_MAJ_MONGA');
    const bloc = REPO_FILE.slice(i, REPO_FILE.indexOf('`;', i));
    expect(bloc).toContain('max(greatest(y.cree_le, y.maj_le))');
    expect(bloc).not.toContain('survenu_le');
  });

  /**
   * 🔴🔴 L'EFFET EST UNE COMPARAISON DE DEUX DATES, ET NON UN DRAPEAU. Un booléen aurait demandé de l'éteindre
   * chez TOUS les collaborateurs à chaque relève — autant d'écritures que de comptes, à la minute. Ici une étape
   * Monga n'écrit RIEN dans la table des vues : elle rallume l'effet d'elle-même.
   */
  it('🔴🔴 allumé = la mise à jour Monga est postérieure à MA dernière vue', () => {
    expect(CARTE).toContain(
      "const misAJour = !eteint && majMonga !== null && (carte.vuLe === null || carte.vuLe === undefined");
    expect(CARTE).toContain('|| majMonga > carte.vuLe);');
  });

  /**
   * 🔴🔴 PAR COLLABORATEUR, ET LA CLÉ EST ÉCRITE UNE SEULE FOIS. Deux endroits qui la fabriqueraient finiraient
   * par ne plus désigner la même personne — et l'effet s'éteindrait chez l'un sans s'éteindre chez l'autre, ce
   * qui est exactement le défaut qu'Arno veut éviter.
   */
  it('🔴🔴 la clé du collaborateur est écrite une seule fois, et porte la voie de secours', () => {
    const auteur = readFileSync('app/lib/gestion/auteur.ts', 'utf8');
    expect(auteur).toContain('export function cleCollaborateur(auteur: Auteur): string {');
    /* ⚠️ L'IDENTIFIANT DE CONNEXION, et non l'identifiant numérique : la voie de secours n'a pas de compte et
       doit pouvoir éteindre son propre effet. */
    expect(auteur).toContain('const net = auteur.libelle.trim();');
    /* 🔴 ET LA TABLE A POUR CLÉ PRIMAIRE LE COUPLE : rien ne s'éteint chez un autre, par construction. */
    const mig = readFileSync('db/migrations/316_gestion_evenement_vu.sql', 'utf8');
    expect(mig).toContain('PRIMARY KEY (evenement_id, compte_cle)');
  });

  /**
   * 🔴🔴 LES TROIS CHEMINS D'EXTINCTION PASSENT PAR LA MÊME PORTE (`POST /evenements/vus`). Trois routes auraient
   * fini par écrire trois dates différentes, et l'effet se serait éteint ici sans s'éteindre là.
   */
  it('🔴🔴 les trois chemins d’extinction, une seule porte', () => {
    /* ① le clic sur la vignette.
       ⚠️ RANG MIS À JOUR LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT : le gestionnaire de capture s'appelle
       désormais `auClic` et APPELLE `marquerVu` en premier, parce qu'il porte une seconde chose (le clic sur la
       capsule « Type à définir »). L'extinction n'a pas bougé : elle part toujours au premier clic sur la ligne,
       et avant tout le reste. */
    expect(CARTE).toContain('const marquerVu = (): void => {');
    expect(CARTE).toContain('onClickCapture={auClic}');
    expect(CARTE).toMatch(/const auClic = \(e: React\.MouseEvent<HTMLLIElement>\): void => \{\s*\n\s*marquerVu\(\);/);
    /* ② l'ouverture de la vue de l'événement — ce corps n'est monté qu'au dépliage (chargement paresseux) */
    expect(CARTE).toContain("body: JSON.stringify({ ids: [evenementId] }),");
    /* ③ l'ouverture de la fiche du bien, par n'importe quel chemin */
    expect(BLOC).toContain("void fetch('/api/admin/gestion/evenements/vus', {");
    /* 🔴 ET C'EST BIEN LA MÊME ADRESSE DANS LES TROIS CAS. */
    expect((CARTE.match(/'\/api\/admin\/gestion\/evenements\/vus'/g) ?? []).length).toBe(2);
    expect((BLOC.match(/'\/api\/admin\/gestion\/evenements\/vus'/g) ?? []).length).toBe(1);
  });

  /**
   * 🔴 UN **POST**, ET NON UN EFFET DE BORD SUR UNE LECTURE. Cacher le marquage dans le GET de la fiche l'aurait
   * déclenché à chaque rafraîchissement automatique, y compris sur un onglet laissé ouvert que personne ne
   * regarde — c'est-à-dire exactement le cas où l'effet doit rester allumé.
   */
  it('🔴 marquer vu est une écriture, et elle a son verbe', () => {
    expect(ROUTE_VUS).toContain('export async function POST(request: Request): Promise<Response> {');
    expect(ROUTE_VUS).toContain("exigerCompteActif(request, 'gestion')");
    /* ⚠️ UNE LISTE BORNÉE : un appel fabriqué n'a pas à pouvoir demander une écriture de masse. */
    expect(ROUTE_VUS).toContain('corps.ids.slice(0, 200)');
  });

  /**
   * ⚠️ SANS LA MIGRATION 316, L'ÉCRAN EST EXACTEMENT CELUI D'AVANT : aucune requête ne nomme la table absente,
   * rien ne s'allume, et le geste répond poliment qu'il n'y a rien à marquer. Un effet qui ne pourrait jamais
   * s'éteindre serait pire que pas d'effet du tout.
   */
  it('⚠️ la migration absente ne casse rien, et n’allume rien', () => {
    expect(REPO_VU).toContain('if (!(await evenementVuDisponible())) return false;');
    expect(REPO_VU).toContain('if (!(await evenementVuDisponible())) return 0;');
    expect(REPO_FILE).toContain('const avecVues = (await evenementVuDisponible()) && compteCle !== null;');
    /* 🔴 ET LA REQUÊTE NE NOMME PAS LA TABLE quand elle n'est pas disponible. */
    expect(REPO_FILE).toContain(": 'NULL::text'} AS vu_le");
  });

  /**
   * ══ 🔴🔴 CE QUE CES DEUX ÉPREUVES TENAIENT, ET POURQUOI ELLES ONT CHANGÉ DE COULEUR ════════════════════════
   *
   * Elles vérifiaient un liseré VERT en ombre EXTÉRIEURE, posé au lot VIGNETTE-EVENEMENT (point 3). Arno a
   * tranché autrement au lot EVENEMENT-MINIMALISTE (point 4) : « TOUTE la vignette de l'événement est cerclée de
   * ROUGE (au lieu du liseré vert) ». Et la mesure a imposé l'ombre INTÉRIEURE — l'extérieure était coupée sur
   * trois côtés par le conteneur qui défile.
   *
   * 🔴 LES DEUX FAITS QUI COMPTAIENT SONT TENUS À L'IDENTIQUE, dans le groupe ㉖ : ce n'est pas une bordure
   * (elle déplacerait la vignette), et « réduire les animations » garde l'indicateur en retirant le mouvement.
   */


  /**
   * 🔴🔴 L'EFFET NE PORTE JAMAIS L'INFORMATION SEUL : le badge l'ÉCRIT sur la miniature, et le lecteur d'écran
   * l'entend. Un liseré vert tout seul ne dit rien à qui ne le voit pas.
   */
  it('🔴🔴 le badge écrit ce que le liseré montre', () => {
    expect(CARTE).toContain('Mis à jour par Monga · {heureParis(misAJourLe)}');
    expect(CARTE).toContain('` — mis à jour par Monga à ${heureParis(misAJourLe)}`');
  });

  /**
   * ══ 🔴🔴 DÉFAUT MESURÉ À L'ÉCRAN, ET CORRIGÉ ═══════════════════════════════════════════════════════════════
   *
   * Le premier jet découpait l'heure dans la chaîne ISO (`misAJourLe.slice(11, 16)`). La route rend l'heure en
   * UTC : le badge affichait **17:28** pour une écriture faite à **19:28**. Deux heures d'écart, et rien à
   * l'écran pour s'en apercevoir. `heureParis` la rend en heure de Paris, comme tout le reste du module.
   */
  it('🔴🔴 l’heure du badge est celle de Paris, jamais l’UTC découpé', () => {
    /* ⚠️ LU COMMENTAIRES RETIRÉS : l'encadré qui explique le défaut cite forcément le découpage fautif. */
    const code = CARTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('misAJourLe.slice(11, 16)');
    const ecran = readFileSync('app/lib/gestion/ecran.ts', 'utf8');
    expect(ecran).toContain('export function heureParis(iso: string | null | undefined): string {');
    expect(ecran).toContain('return champsParis(d).heure;');
  });

  /**
   * ⚠️ ET LE BADGE NE SE FAIT PLUS COUPER. Mesuré : `white-space:nowrap` était HÉRITÉ de la vignette, et le
   * badge s'affichait « Mis à jour par Monga · 19: » — l'heure amputée (135 px de texte pour 116 de place).
   */
  it('⚠️ le badge tient sur deux lignes plutôt que de perdre son heure', () => {
    expect(VUE).toMatch(/\.gst-mini-monga\{[^}]*white-space:normal/);
  });

  /**
   * ⚠️ L'EXTINCTION EST IMMÉDIATE À L'ŒIL, ET L'ÉCRITURE SUIT. Sans l'état local, la vignette resterait allumée
   * jusqu'à la relecture suivante de l'écran — on cliquerait, et rien ne se passerait.
   *
   * ⚠️ ET L'ÉCHEC SE TAIT : marquer vu est un geste de confort. Une bannière d'erreur parce qu'on vient de
   * cliquer une vignette ferait bien plus de mal que l'effet qui reste allumé une minute de plus.
   */
  it('⚠️ l’extinction se voit tout de suite, et un échec ne crie pas', () => {
    expect(CARTE).toContain('const [eteint, setEteint] = useState(false);');
    expect(CARTE).toContain('setEteint(true);');
    expect(CARTE).toContain('}).catch(() => undefined);');
  });

  /** 🔴 LA LECTURE RESTE UNE LECTURE : `lireEvenements` ne fait que comparer, elle n'écrit jamais. */
  it('🔴 lire l’écran n’écrit aucune vue', () => {
    expect(REPO_FILE).not.toMatch(/INSERT INTO gestion_evenement_vu/);
  });
});

describe('㉓ la vignette « MONGA » (lot EVENEMENT-MINIMALISTE, point 1)', () => {
  /**
   * 🔴🔴 « si l'événement est suivi par Monga (au moins une référence MNG reliée) : une vignette “MONGA” bien
   * visible, fond vert, texte blanc, avec la référence au survol » — Arno. Et « même vignette dans la vue de
   * l'événement ».
   */
  it('🔴🔴 la vignette existe aux DEUX endroits, au même dessin', () => {
    expect(BLOC).toContain('<span className="evb-monga"');
    /* 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — MÊME CLASSE, MÊME DESSIN : seule sa POSE a changé (elle est
       passée sous la miniature, et elle dit la dernière étape Monga). Le modificateur `--sous` ne porte que le
       placement et le retour à la ligne. */
    expect(CARTE).toContain('className="gst-monga-vignette gst-monga-vignette--sous"');
    for (const [nom, src, cls] of [['fiche du bien', BLOC, '.evb-monga'],
      ['vue de l’événement', VUE, '.gst-monga-vignette']] as const) {
      expect(src, nom).toContain(`${cls}{display:inline-block`);
      expect(src, nom).toContain('background:var(--color-svv-green)');
      /* ⚠️ LE TEXTE EST `--color-svv-bg` ET NON UN BLANC EN DUR : en thème Sombre, « blanc » est le fond de la
         page, et c'est lui qui donne le contraste contre le vert. */
      expect(src, nom).toContain('color:var(--color-svv-bg)');
    }
  });

  /** 🔴 ELLE NE S'AFFICHE QUE S'IL Y A UNE RÉFÉRENCE : un événement sans Monga est le cas ordinaire. */
  it('🔴 aucune référence, aucune vignette', () => {
    expect(BLOC).toContain('{(e.mongaRefs ?? []).length > 0 && (');
    expect(CARTE).toContain('{(carte.mongaRefs ?? []).length > 0 && (');
  });

  /**
   * ⚠️ LA RÉFÉRENCE N'EXISTE PAS QU'AU SURVOL. Un renseignement réservé au survol n'existe ni au tactile ni au
   * clavier (CLAUDE.md §15) : elle est donc aussi lue à voix haute. Le survol est un CONFORT, jamais le seul
   * chemin.
   */
  it('⚠️ la référence est lue, pas seulement survolée', () => {
    expect(BLOC).toContain('title={(e.mongaRefs ?? []).join(\', \')}');
    expect(BLOC).toContain('<span className="evb-sr"> — suivi par Monga, {(e.mongaRefs ?? []).join(\', \')}</span>');
    /* 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — la bulle porte maintenant les références ET la dernière étape
       Monga, et le lecteur d'écran les lit toutes les deux. Le survol reste un confort, jamais le seul chemin. */
    expect(CARTE).toContain('(carte.mongaRefs ?? []).join(\', \')');
    expect(CARTE).toContain('— suivi par Monga, {(carte.mongaRefs ?? []).join(\', \')}');
  });

  /** 🔴 ET LA DONNÉE VIENT DES DEUX LECTURES, par la même règle : les références NON retirées. */
  it('🔴 les références reliées viennent du dépôt, et les retirées ne comptent pas', () => {
    const repoEtape = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
    const repoFile = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
    for (const [nom, src] of [['fiche du bien', repoEtape], ['liste des événements', repoFile]] as const) {
      expect(src, nom).toContain('FROM gestion_monga_lien');
      /* 🔴 LES RÉFÉRENCES RETIRÉES NE COMPTENT PAS : délier une référence doit éteindre la vignette. */
      expect(src, nom).toMatch(/WHERE evenement_id = e\.id AND retire_le IS NULL\) \w+\) AS monga_refs/);
    }
  });
});

describe('㉔ la vignette enrichie (lot EVENEMENT-MINIMALISTE, point 2)', () => {
  const REPO_FILE = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 RÈGLE RÉÉCRITE LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT, POINT 2 ═════════════════════════════════
   *
   * ELLE FIGEAIT LA LISTE MOT POUR MOT (`export const CATEGORIES_EVENEMENT = ['travaux', …] as const;`) pour
   * prouver qu'aucune migration n'avait été nécessaire au lot EVENEMENT-MINIMALISTE. Elle avait raison ce
   * jour-là, et elle est devenue un VERROU : figer le texte d'une déclaration interdit de la DÉRIVER.
   *
   * ARNO (07/10/2026) : « Il faut UNE seule source de vérité pour la liste des types, lue par TOUS ces
   * endroits. » La liste vivait à trois endroits — le tableau de clés, la chaîne de `if` de `motCategorie`, et
   * la contrainte en base. Elle n'en a plus qu'un, `TYPES_EVENEMENT`, dont les deux premiers SORTENT.
   *
   * 🔴 CE QUE LA RÈGLE PROTÉGEAIT EST ÉPROUVÉ, ET PLUS FORT QU'AVANT : les quatre types sont toujours là, mot
   * pour mot, et c'est désormais `typeEvenement.test.ts` qui exige en plus que la base dise la même chose.
   */
  it('🔴🔴 les deux formulaires et la carte lisent la MÊME source', () => {
    const qualite = readFileSync('app/lib/gestion/evenementQualite.ts', 'utf8');
    /* 🔴 UNE SEULE DÉCLARATION, et les clés en sortent au lieu d'être réécrites. */
    expect(qualite).toContain('export const TYPES_EVENEMENT: readonly TypeEvenement[] = [');
    expect(qualite).toContain('export const CATEGORIES_EVENEMENT: readonly string[] = TYPES_EVENEMENT.map((t) => t.cle);');
    /* 🔴 ET LE LIBELLÉ AUSSI : plus de chaîne de `if` qui réécrivait les mêmes quatre clés. */
    expect(qualite).toContain("return TYPES_EVENEMENT.find((t) => t.cle === c)?.mot ?? 'Non précisée';");
    /* 🔴 LA CARTE : le type reconnu, et sa capsule. */
    expect(CARTE).toContain('const typeEvenement = categorieValide(detail?.categorie ?? carte.categorie);');
    expect(CARTE).toContain('{typeEvenement === null ? MOT_TYPE_A_DEFINIR : motCategorie(typeEvenement)}');
    /* 🔴 LES DEUX FORMULAIRES — création ET modification — parcourent la source, de la même manière. */
    const bloc = readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8');
    for (const src of [bloc, CARTE]) {
      expect(src).toContain('{TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.mot}</option>)}');
    }
  });

  /**
   * ══ 🔴🔴 RÈGLE RENVERSÉE LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT, POINT 1 ════════════════════════════════
   *
   * ELLE EXIGEAIT QUE RIEN NE S'AFFICHE SANS TYPE, et c'était la demande du lot CARTE-EVENEMENT-EPUREE. Arno la
   * remplace, mot pour mot : « Cette règle remplace “pas de type → rien” […] : Arno veut toujours voir
   * l'information. » La capsule est là dans tous les cas, et dit « Type à définir » quand il manque.
   *
   * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT TIENT TOUJOURS : on n'écrit JAMAIS « Non précisée » sur une carte —
   * un libellé qui se lit comme un type alors qu'il n'y en a pas. C'est éprouvé ici, et à l'écran dans
   * `CarteVive.epuree.test.ts`.
   */
  it('🔴🔴 sans type, la capsule reste et dit quoi faire', () => {
    /* 🔴 LE MOT VIENT DE LA SOURCE, et n'est pas retapé dans la carte. */
    const qualite = readFileSync('app/lib/gestion/evenementQualite.ts', 'utf8');
    expect(qualite).toContain("export const MOT_TYPE_A_DEFINIR = 'Type à définir';");
    expect(CARTE).toContain('MOT_TYPE_A_DEFINIR');
    expect(CARTE).not.toContain("'Type à définir'");
    /* 🔴 LA LIGNE DE GAUCHE NE PORTE PLUS LE TYPE : il est DÉPLACÉ, pas doublé. */
    expect(CARTE).not.toContain('<span className="gst-carte-type">');
    expect(CARTE).not.toContain('{carte.categorie !== null && carte.categorie !== undefined && <>');
    /* 🔴 ET LA CAPSULE EST RENDUE SANS CONDITION, dans la colonne de droite.
       ⚠️ SA CLASSE S'ÉCRIT AUTREMENT DEPUIS LE LOT URGENCE-EVENEMENT (point 1) : elle porte DEUX axes — le fond
       vient du niveau d'urgence, le bord pointillé de l'absence de type — et se compose donc par une liste plutôt
       que par une interpolation. Ce qui est éprouvé reste le même : la capsule est là, type ou pas. */
    expect(CARTE).toContain("'gst-type-capsule',");
    expect(CARTE).toContain("typeEvenement === null ? 'gst-type-capsule--vide' : '',");
  });

  /** 🔴🔴 « Ouvert depuis N jours » ET « dernier échange il y a N jours » (Arno), accordés au singulier.
   *  🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 5 — c'est désormais la SEULE ligne qui dise « dernier échange ». */
  it('🔴🔴 les deux anciennetés, en jours, accordées', () => {
    expect(CARTE).toContain('Ouvert depuis {motJours(ouvertDepuis)}');
    expect(CARTE).toContain('dernier échange il y a {motJours(dernier)}');
    expect(CARTE).toContain("return n <= 1 ? `${n} jour` : `${n} jours`;");
    /* ⚠️ L'INSTANT DE RÉFÉRENCE EST INJECTÉ, jamais `Date.now()` caché dedans : toutes les lignes d'une même
       page doivent dire la même heure. Même règle que `depuis`. */
    expect(CARTE).toContain('function enJours(iso: string | null, maintenant: Date): number | null {');
    /* ⚠️ ET UNE DATE FUTURE (horloges désaccordées) VAUT ZÉRO, jamais un nombre négatif. */
    expect(CARTE).toContain('return jours < 0 ? 0 : jours;');
  });

  /**
   * ══ 🔴🔴 CE CAS A CHANGÉ DE VERDICT — LOT CARTE-EVENEMENT-EPUREE, POINT 6 ═════════════════════════════════════
   *
   * IL EXIGEAIT « l'adresse du bien AVEC LE LOT » (le numéro identifie le bien, deux adresses se ressemblent).
   * ACCORD D'ARNO : « lot 315 — 67 rue de Normandie, COURBEVOIE » devient « 67 rue de Normandie, COURBEVOIE ».
   *
   * ⚠️ LE LOT RESTE LE SEUL NOM D'UN BIEN SANS ADRESSE — sans lieu à écrire, « lot 315 » demeure, sans quoi la
   * ligne disparaîtrait avec le seul moyen de savoir de quel bien on parle.
   */
  it('🔴🔴 l’adresse ne porte plus le numéro de lot devant', () => {
    expect(CARTE).not.toContain('`lot ${b.cle} — ${lieu}`');
    expect(CARTE).toContain('`lot ${b.cle}` : lieu)');
  });

  /**
   * 🔴 LE BIEN VIENT DES **DEUX AXES**, comme partout : parties déclarées ET rattachements confirmés des mails.
   * N'en lire qu'un ferait une vignette muette sur la moitié des dossiers — l'événement 1 de lot-237 n'a aucune
   * partie déclarée, et son bien ne vient que de ses mails.
   */
  it('🔴🔴 le bien se lit par les deux axes', () => {
    const i = REPO_FILE.indexOf('function sqlBienDeLEvenement');
    const bloc = REPO_FILE.slice(i, REPO_FILE.indexOf('\n}', i));
    expect(bloc).toContain('FROM gestion_evenement_partie p');
    expect(bloc).toContain('FROM gestion_affectation aa');
    /* 🔴 ET LE LOCATAIRE « EN PLACE » EST CELUI SANS SORTIE — la même règle que l'annuaire, au mot près. */
    expect(bloc).toContain('WHERE o.lot_wippimmo_id = c.cle AND o.sortie IS NULL');
  });

  /**
   * ⚠️ PLUSIEURS BIENS : on montre le premier et l'on DIT qu'il y en a d'autres. Les lister tous rendrait la
   * liste illisible ; taire le nombre serait mentir par omission.
   */
  it('⚠️ un événement multi-biens dit combien il en porte', () => {
    expect(CARTE).toContain('{carte.nbBiens > 1 && <>');
    expect(CARTE).toContain('autre${carte.nbBiens > 2 ? \'s\' : \'\'} bien');
  });

  /** 🔴 LE PROPRIÉTAIRE, LE LOCATAIRE EN PLACE, ET « Demandé par <nom> » — chacun se tait s'il n'a rien à dire. */
  it('🔴 les trois personnes, et chacune se tait si elle manque', () => {
    expect(CARTE).toContain("`Propriétaire : ${b.proprietaire}`");
    expect(CARTE).toContain("`Locataire en place : ${b.locataire}`");
    expect(CARTE).toContain("gens.push(`Demandé par ${carte.demandeur}`)");
    expect(CARTE).toContain('{gens.length > 0 && <span className="gst-carte-ligne">');
  });

  /**
   * ══ 🔴🔴 RÈGLE RENVERSÉE LE 07/10/2026 — LOT EVENEMENTS-CARTES-PLEINES, POINT 2 ═════════════════════════════
   *
   * ELLE EXIGEAIT LA COUPURE (« le texte se coupe proprement », lot EVENEMENT-MINIMALISTE), avec un repli sur
   * écran étroit où il passait à la ligne. ARNO : « la ligne “Propriétaire : … · Demandé par …” complète,
   * l'adresse complète ». Ce qui n'était vrai que sous 600 px devient donc la règle à TOUTES les largeurs, et la
   * media query qui la rétablissait n'a plus lieu d'être.
   *
   * 🔴 CE QUE LA RÈGLE PROTÉGEAIT — « il ne déborde jamais » — EST TENU PAR `overflow-wrap:anywhere`, qui coupe
   * même une référence sans espace. C'était déjà lui qui le tenait sur écran étroit.
   */
  it('🔴🔴 chaque ligne est ENTIÈRE, et ne déborde jamais', () => {
    expect(VUE).toMatch(/\.gst-carte-ligne\{[^}]*white-space:normal;overflow-wrap:anywhere\}/);
    expect(VUE).not.toMatch(/\.gst-carte-ligne\{[^}]*text-overflow:ellipsis/);
    /* ⚠️ ET PLUS DE RÈGLE D'ÉCRAN ÉTROIT QUI RÉTABLIRAIT CE QUI EST DÉSORMAIS LE DÉFAUT. */
    expect(VUE).not.toContain('@media (max-width:600px){\n  .gst-carte-ligne');
  });

  /** ⚠️ SANS LA MIGRATION 268, aucune requête ne nomme la colonne absente, et l'écran est celui d'avant. */
  it('⚠️ la catégorie absente ne casse rien', () => {
    /* ⚠️ LA MÊME SONDE SERT MAINTENANT AUX **DEUX** COLONNES DE LA 268 (lot URGENCE-EVENEMENT, point 1) :
       `categorie` et `urgence` viennent de la même migration, et deux témoins pour un seul fait finiraient par se
       contredire le jour où l'un serait oublié. */
    expect(REPO_FILE).toContain(
      "${avecCategorie ? 'e.categorie, e.urgence' : 'NULL::text AS categorie, NULL::text AS urgence'}");
    /* ⚠️ LE MÊME TÉMOIN QUE `gestes.ts`, et non un second : table et colonnes viennent de la MÊME migration. */
    expect(REPO_FILE).toContain('const avecCategorie = await evenementQualifieDisponible();');
  });
});

describe('㉔-bis la lecture du bien ne peut pas faire tomber l’écran', () => {
  /**
   * ══ 🔴🔴 DÉFAUT ATTRAPÉ PAR UNE GARDE DU DÉPÔT, PENDANT CE LOT ═════════════════════════════════════════════
   *
   * Le premier jet de `sqlBienDeLEvenement` nommait `aa.message_id` sans condition. Cette colonne n'existe que
   * depuis la migration 234, et la garde « NON appliquée → le SQL ne nomme JAMAIS la colonne absente (sinon
   * tout l'écran tombe) » l'a refusé. Ce n'est pas une précaution théorique : c'est le même genre de panne
   * totale que l'incident du 24/09/2026.
   *
   * 🔴 SANS LA MIGRATION, UNE AFFECTATION COUVRE FORCÉMENT TOUT LE FIL — c'est le comportement d'avant 234 —,
   * et la jointure se réduit à `mm.fil_id = aa.fil_id`. Rien n'est perdu, rien n'est deviné.
   */
  it('🔴🔴 la colonne `message_id` n’est nommée que si la migration 234 est là', () => {
    const repo = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
    expect(repo).toContain('function sqlBienDeLEvenement(avecMessageId: boolean): string {');
    expect(repo).toContain("    : 'ON mm.fil_id = aa.fil_id';");
    expect(repo).toContain('${sqlBienDeLEvenement(ctx.deplacements)}');
  });
});

describe('㉕ l’écran partagé est minimaliste (lot EVENEMENT-MINIMALISTE, point 3)', () => {
  /**
   * 🔴🔴 ACCORD D'ARNO : « sous la vignette dépliée, retire le titre “Avancement” et tout ce qui est en dessous
   * (alerte de clôture, frise, bloc Quoi / Qui demande / Adresse / Ouvert / Modifier). Il ne reste que la
   * vignette et le gros bouton “Ouvrir la fiche du bien sur cet événement →”. »
   */
  /**
   * ══ 🔴🔴 ÉPREUVE ÉLARGIE LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ═══════════════════════════════════
   *
   * ELLE DISAIT « dans l'écran PARTAGÉ, le corps s'arrête au gros bouton ». Ce n'est plus seulement l'écran
   * partagé : Arno étend la règle aux DEUX écrans. « SIMPLE CLIC → la carte se déplie et montre UNIQUEMENT : les
   * informations absentes de la carte repliée ; le bouton rouge. »
   */
  it('🔴🔴 sur les DEUX écrans, le corps s’arrête aux infos manquantes et au gros bouton', () => {
    expect(CARTE).toContain('<OuvrirLaFicheDuBien biens={d.biens ?? []}');
    expect(CARTE).toContain('<PartiesManquantes parties={d.parties}');
    /* 🔴 ET LE GRAND `{partage ? null : (<>` QUI ENCADRAIT TOUT LE DÉTAIL N'EXISTE PLUS : il n'y a plus de
       détail à encadrer. */
    expect(CARTE).not.toContain('{partage ? null : (<>');
  });

  /**
   * ══ 🔴🔴 ÉPREUVE RENVERSÉE — LE PLEIN ÉCRAN NE « GARDE » PLUS TOUT ════════════════════════════════════════
   *
   * ELLE EXIGEAIT que le plein écran conserve la frise, Monga, le résumé et les échanges (« L'écran partagé est
   * une LISTE — on y choisit un dossier, on ne le travaille pas »). ARNO revient dessus : le plein écran devient
   * lui aussi une liste, et le dossier se travaille sur la FICHE DU BIEN.
   *
   * 🔴 CHAQUE MORCEAU A ÉTÉ RETROUVÉ AILLEURS AVANT D'ÊTRE RETIRÉ — c'est la condition qu'Arno a posée, et elle
   * est vérifiée pièce par pièce par le cas suivant et par `CarteVive.test.ts`.
   */
  it('🔴🔴 le plein écran ne garde plus ni frise, ni Monga, ni résumé, ni échanges', () => {
    for (const morceau of ['<h3 className="gst-sous-titre">Avancement</h3>', '<FriseAvancement',
      'className="gst-monga"', '<ResumeCarte detail={d}', 'Échanges rattachés']) {
      expect(CARTE, morceau).not.toContain(morceau);
    }
  });

  /**
   * 🔴🔴 CE QUI EST RETIRÉ RESTE DISPONIBLE SUR LA FICHE DU BIEN — c'est la condition qu'Arno a posée, et elle
   * est vérifiée pièce par pièce.
   */
  it('🔴🔴 la frise, la clôture et le « Modifier » sont sur la fiche du bien', () => {
    /* ① la frise y était déjà, depuis le lot MONGA-2. */
    expect(BLOC).toContain('<FriseAvancement');
    /**
     * ② LA CLÔTURE Y EST TOUJOURS, MAIS ELLE A CHANGÉ DE GESTE (lot CLOTURE-REOUVERTURE). Ce cas exigeait
     * `onProposerCloture` — le lien « Clôturer cet événement ? », retiré sur demande d'Arno. On ferme désormais
     * en posant une carte « Clôture » DANS cette même frise, et c'est la route de la frise qui applique l'état.
     * La promesse de ce cas — « tout ce qui est retiré de l'écran partagé reste disponible sur la fiche » —
     * tient donc toujours, par un autre chemin.
     */
    expect(BLOC).not.toContain('onProposerCloture={');
    const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
    expect(ROUTE).toContain('const etatVoulu = etatApresCarte(type);');
    /* ③ le « Modifier » des informations : AJOUTÉ, et c'est LE MÊME formulaire, importé et non recopié. */
    expect(BLOC).toContain("import { FormulaireCarte } from './CarteVive';");
    expect(BLOC).toContain('Modifier les informations de l’événement');
    expect(CARTE).toContain('export function FormulaireCarte(');
  });

  /**
   * 🔴 LA MÊME PORTE D'ÉCRITURE QUE LA VUE DE L'ÉVÉNEMENT : `PATCH /evenements/[id]`. Deux portes auraient écrit
   * deux histoires différentes dans le journal.
   */
  it('🔴 les deux gestes rapatriés passent par la porte existante', () => {
    expect(BLOC).toContain('const ecrire = useCallback(async (id: number, corps: unknown, succes: string)');
    expect(BLOC).toContain("method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),");
  });

  /**
   * ⚠️ LE DÉTAIL N'EST LU QU'AU CLIC SUR « MODIFIER » — chargement paresseux, comme la carte vivante depuis le
   * lot 4c. Une fiche de bien n'a pas à payer une requête par événement pour un formulaire que personne
   * n'ouvrira.
   */
  it('⚠️ ouvrir « Modifier » est le seul moment où le détail se lit', () => {
    expect(BLOC).toContain('const ouvrirModification = useCallback(async (id: number)');
    expect(BLOC).toContain("onClick={() => void ouvrirModification(e.id)}");
  });
});

describe('㉖ « mis à jour par Monga » : rouge, et en tête (lot EVENEMENT-MINIMALISTE, point 4)', () => {
  const REPO_FILE = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 CE QUE C'ÉTAIT, ET POURQUOI LE ROUGE ═════════════════════════════════════════════════════════════
   *
   * Arno (07/10/2026) : « Le message “Mis à jour par Monga · <heure>” s'écrit en ROUGE, et TOUTE la vignette de
   * l'événement est cerclée de rouge (au lieu du liseré vert). »
   *
   * 🔴 LE VERT DISAIT DÉJÀ AUTRE CHOSE : « dans la frise » (les cartes d'étape, la vignette MONGA). Une couleur
   * ne peut pas dire deux choses dans le même écran. Le rouge est la couleur d'attention du dépôt, et elle ne
   * sert à rien d'autre ici.
   */
  it('🔴🔴 le cercle et le badge sont rouges, plus aucun vert', () => {
    expect(VUE).toMatch(/\.gst-item--monga\{[^}]*box-shadow:inset 0 0 0 2px var\(--color-svv-red\)/);
    expect(VUE).toMatch(/\.gst-mini-monga\{[^}]*color:var\(--color-svv-red\)/);
    /* ⚠️ ET PLUS AUCUNE TRACE DU VERT DANS L'EFFET : une règle orpheline finit par être recâblée. */
    const feuille = VUE.slice(VUE.indexOf('const CSS_')).replace(/\/\*[\s\S]*?\*\//g, '');
    const i = feuille.indexOf('.gst-item--monga{');
    expect(feuille.slice(i, feuille.indexOf('}', i))).not.toContain('green');
  });

  /**
   * ══ 🔴🔴 DÉFAUT MESURÉ À L'ÉCRAN : LE CERCLE ÉTAIT COUPÉ SUR TROIS CÔTÉS ═══════════════════════════════════
   *
   * Premier jet : une ombre EXTÉRIEURE. Mesure sur l'écran partagé — la vignette est collée aux bords de
   * `.gst-corps-partage` (marges 0 en haut, à gauche, à droite), et ce conteneur défile donc porte
   * `overflow:auto`. Seul le BAS du cercle se voyait. Arno demande que « TOUTE la vignette soit cerclée » ; un
   * cercle coupé sur trois côtés n'est pas un cercle.
   *
   * 🔴 UNE OMBRE `inset` SE DESSINE À L'INTÉRIEUR DE LA BOÎTE : rien ne peut la rogner.
   */
  it('🔴🔴 le cercle est une ombre INTÉRIEURE, donc jamais rognée', () => {
    expect(VUE).toContain('box-shadow:inset 0 0 0 2px var(--color-svv-red),inset 0 0 12px 0 var(--color-svv-red)');
    /* ⚠️ ET PAS UNE BORDURE : elle déplacerait la vignette de 2 px en s'allumant, et la liste sauterait. */
    expect(VUE).not.toMatch(/\.gst-item--monga\{[^}]*border:/);
  });

  /** 🔴 « EFFET DISCRET SI “RÉDUIRE LES ANIMATIONS” EST ACTIVÉ » : le trait reste, le halo et le mouvement partent. */
  it('🔴🔴 « réduire les animations » laisse le cercle, sans halo ni mouvement', () => {
    expect(VUE).toContain('.gst-item--monga{animation:none;box-shadow:inset 0 0 0 2px var(--color-svv-red)}');
  });

  /**
   * 🔴🔴 LA REMONTÉE EN TÊTE EST LE **MÊME CALCUL** QUE L'EFFET : « la dernière écriture de Monga est postérieure
   * à MA dernière vue ». Un second critère aurait pu allumer la vignette sans la faire remonter, ou l'inverse.
   */
  it('🔴🔴 le tri remonte exactement ce que l’effet allume', () => {
    expect(REPO_FILE).toContain('function triMongaDAbord(avecVues: boolean): string {');
    expect(REPO_FILE).toContain(
      'const allumee = `(mg.le IS NOT NULL AND (${vue} IS NULL OR mg.le > ${vue}))`;');
    expect(REPO_FILE).toContain('ORDER BY ${triMongaDAbord(avecVues)}(e.traite_le IS NOT NULL) ASC,');
  });

  /**
   * ══ 🔴🔴 DÉFAUT MESURÉ À L'ÉCRAN : VUE, LA VIGNETTE NE REPRENAIT PAS SA PLACE ══════════════════════════════
   *
   * Premier jet : `mg.le DESC NULLS LAST` tout court, donc appliqué à TOUTES les vignettes. Essai — l'événement
   * 2, remonté parce qu'allumé, Y RESTAIT après avoir été vu : son `mg.le` récent le faisait passer devant
   * l'événement 1, qui n'a aucune référence Monga (`mg.le` nul). Arno demande l'inverse : « Une fois vue, elle
   * reprend sa place NORMALE. »
   *
   * 🔴 LE `CASE` BORNE LE SECOND CRITÈRE AUX ALLUMÉES : éteinte, la date ne pèse plus rien.
   */
  it('🔴🔴 le second critère ne vaut qu’entre vignettes allumées', () => {
    expect(REPO_FILE).toContain('CASE WHEN ${allumee} THEN mg.le END DESC NULLS LAST');
    expect(REPO_FILE).not.toContain('mg.le DESC NULLS LAST,\n               `;');
  });

  /**
   * ⚠️ SANS COLLABORATEUR — ou sans la migration 316 — LE CRITÈRE DISPARAÎT DE LA REQUÊTE, et la liste retrouve
   * son ordre d'avant, exactement. Un tri par vue qui s'appliquerait sans savoir QUI lit serait un tri faux.
   */
  it('⚠️ sans collaborateur, le tri est celui de tout le monde', () => {
    expect(REPO_FILE).toContain("  if (!avecVues) return '';");
  });

  /**
   * ⚠️ L'EXPLICATION VIT EN COMMENTAIRE JAVASCRIPT, PAS DANS LE LITTÉRAL SQL — et c'est une épreuve de ce
   * fichier qui l'a imposé. Un bloc de commentaire à l'intérieur d'un gabarit n'est pas un commentaire : c'est
   * du TEXTE, qui partait dans la requête à chaque appel.
   */
  it('⚠️ aucun pavé de commentaire ne part dans le SQL', () => {
    const i = REPO_FILE.indexOf('function triMongaDAbord');
    const corps = REPO_FILE.slice(i, REPO_FILE.indexOf('\n}', i));
    /* Les commentaires de ce corps sont AVANT le `return`, jamais dans la chaîne rendue. */
    expect(corps.slice(corps.indexOf('return `'))).not.toContain('/*');
  });
});

describe('㉗ « Événement ouvert » : la seconde voie (lot EVENEMENT-MINIMALISTE, point 5)', () => {
  const REPO_H = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 LA CAUSE, MESURÉE AVANT D'ÉCRIRE UNE LIGNE ════════════════════════════════════════════════════════
   *
   * L'ancienne règle ne connaissait qu'UNE voie : le FIL du mail porte une affectation active vers un événement
   * non traité. Elle ne regardait NI le bien, NI la date. Les trois mails qu'Arno signale sont rattachés au bien
   * 315 et tombent dans la fenêtre de l'événement 1 (ouvert le 23/09, toujours ouvert), mais leur fil n'a AUCUNE
   * affectation — d'où l'étiquette absente.
   *
   * 🔴 L'ANCIENNE VOIE EST CONSERVÉE : les deux s'unissent. Un mail affecté garde son étiquette même hors
   * fenêtre (il a été classé là exprès) ; un mail du bien la gagne dans la fenêtre. Remplacer l'une par l'autre
   * aurait RETIRÉ l'étiquette à des mails qui l'avaient — la simulation a mesuré 4 gagnés, 0 perdu.
   */
  it('🔴🔴 les deux voies s’unissent, l’ancienne n’est pas remplacée', () => {
    expect(REPO_H).toContain('export function sqlEvenementsDesFils(fils: string): string {');
    expect(REPO_H).toContain('export function sqlEvenementsDesMessages(avecMessageId: boolean, messages: string): string {');
    expect(REPO_H).toContain('evenements: unirEvenements(');
  });

  /** 🔴🔴 LA FENÊTRE : de l'ouverture à la clôture, bornes comprises — la règle d'Arno, mot pour mot. */
  it('🔴🔴 la fenêtre va de l’ouverture à la clôture', () => {
    const i = REPO_H.indexOf('export function sqlEvenementsDesMessages');
    const bloc = REPO_H.slice(i, REPO_H.indexOf('\n}', i));
    /* ⚠️ L'ALIAS INTERNE S'APPELLE `msg` DEPUIS LE LOT FILTRE-COMME-ETIQUETTE, et non `m` : glissée dans le
       filtre, une seconde déclaration de `m` aurait masqué la table des messages de la requête porteuse et rendu
       la borne `ARRAY[m.id]` tautologique. Voir l'encadré de `sqlFiltreEvenementOuvert`. */
    expect(bloc).toContain('AND msg.recu_le >= ev.ouvert_le');
    expect(bloc).toContain('AND (ev.traite_le IS NULL OR msg.recu_le <= ev.traite_le)');
    /* 🔴 ET LE BIEN DU MAIL EST CELUI DE L'ÉVÉNEMENT, par les DEUX axes — l'événement 1 n'a aucune partie
       déclarée, son bien ne vient que de ses mails : ne lire qu'un axe n'aurait rien réparé. */
    expect(bloc).toContain('FROM gestion_evenement_partie p');
    expect(bloc).toContain('FROM gestion_affectation aa');
  });

  /**
   * ⚠️ CLÉ = LE MESSAGE, ET NON LE FIL, pour la nouvelle voie : c'est une date de MAIL qui décide, et deux mails
   * d'un même fil peuvent tomber de part et d'autre d'une ouverture. L'ancienne voie, elle, reste par fil.
   */
  it('⚠️ la nouvelle voie raisonne par MAIL, l’ancienne par fil', () => {
    /* ⚠️ L'ENSEMBLE DE MESSAGES EST DÉSORMAIS UN PARAMÈTRE (lot FILTRE-COMME-ETIQUETTE) : l'étiquette le borne
       à la page (`$1::bigint[]`), le filtre au mail courant (`ARRAY[m.id]`). La clé reste le message. */
    expect(REPO_H).toContain('WHERE r.message_id = ANY(${messages})');
    expect(REPO_H).toContain('evenementsParBien.get(Number(r.message_id)) ?? []');
    expect(REPO_H).toContain('evenements.get(Number(r.fil_id)) ?? []');
  });

  /**
   * 🔴🔴 UN ÉVÉNEMENT N'APPARAÎT QU'UNE FOIS PAR MAIL, MÊME EN UNISSANT. C'est la règle du lot
   * HISTORIQUE-BIEN-5 (le message 57188 rendait `[1,1,1,1,1]` et l'écran criait « two children with the same
   * key »). Les deux voies désignent souvent LE MÊME événement : sans ce dédoublonnage, le défaut reviendrait
   * par la porte d'à côté.
   *
   * 🔴 ET LA VOIE DU FIL GAGNE À INFORMATION ÉGALE : c'est l'affectation qu'un humain a posée, la voie du bien
   * est une déduction.
   */
  it('🔴🔴 pas de doublon, et l’affectation humaine l’emporte', () => {
    expect(REPO_H).toContain('function unirEvenements(');
    expect(REPO_H).toContain('for (const e of [...parFil, ...parBien]) {');
    expect(REPO_H).toContain('if (vus.has(e.id)) continue;');
  });

  /**
   * ⚠️ `aa.message_id` N'EXISTE QUE DEPUIS LA MIGRATION 234, et une garde du dépôt l'a déjà rappelé au point 2
   * de ce lot : sans elle, nommer la colonne fait tomber l'écran. La seconde voie prend donc le même témoin.
   */
  it('⚠️ la colonne `message_id` n’est nommée que si la migration 234 est là', () => {
    expect(REPO_H).toContain("    : 'ON mm.fil_id = aa.fil_id';");
    expect(REPO_H).toContain("sqlEvenementsDesMessages(await deplacementsDeMailsDisponibles(), '$1::bigint[]')");
  });

  /**
   * ══ 🔴🔴 L'ÉCART EST FERMÉ — LOT FILTRE-COMME-ETIQUETTE (07/10/2026) ═══════════════════════════════════════
   *
   * CE QUE CE TEST DISAIT AU POINT 5, ET POURQUOI IL DIT MAINTENANT LE CONTRAIRE. Il tenait l'état délibéré de
   * l'époque — « le filtre reste par fil, et l'écart est consigné » — avec la question posée à Arno : veut-il
   * que le filtre suive la même règle que l'étiquette ? SA RÉPONSE : « aligne le filtre sur la même règle que
   * l'étiquette (même code, pas de second chemin) : le filtre montre exactement les mails qui portent
   * l'étiquette. » Le verdict change donc parce que la DÉCISION a changé, pas parce que la mesure était fausse.
   *
   * 🔴 ET LA CONDITION D'AVANT NE DOIT PLUS EXISTER NULLE PART : c'était la seconde écriture de la règle, celle
   * qui pouvait se périmer seule. Le détail de l'alignement est éprouvé par `filtreCommeEtiquette.test.ts`.
   */
  it('🔴🔴 le filtre ne réécrit plus la règle : l’ancienne condition a disparu du dépôt', () => {
    expect(REPO_H).not.toContain('EXISTS (SELECT 1 FROM gestion_affectation af\n');
    expect(REPO_H).not.toContain("WHERE af.fil_id = m.fil_id AND af.actif AND ev.etat <> 'traite')");
    // Le filtre est désormais FAIT des deux requêtes de l'étiquette, bornées au mail courant.
    expect(REPO_H).toContain("sqlEvenementsDesFils('ARRAY[m.fil_id]')");
    expect(REPO_H).toContain("sqlEvenementsDesMessages(avecMessageId, 'ARRAY[m.id]')");
  });
});
