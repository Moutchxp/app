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

  /** 🔴 LA CLÔTURE EST PROPOSÉE, JAMAIS APPLIQUÉE (Arno : « jamais automatique »). */
  it('🔴 la clôture est une proposition, et elle passe par la porte existante', () => {
    expect(FRISE).toContain('Clôturer cet événement ?');
    expect(FRISE).toContain('onProposerCloture');
    /* 🔴 DANS LA CARTE, elle emprunte `agir({ etat: 'traite' })` — le même journal que le bouton d'état. */
    expect(CARTE).toContain("onProposerCloture={() => void agir({ etat: 'traite' }");
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
   */
  it('🔴🔴 la bulle est rendue sous la frise, hors du conteneur qui défile', () => {
    expect(FRISE).toContain('<div className="fav-zone"');
    /* 🔴 ET PAS DANS LA PISTE : aucune bulle en position absolue à l'intérieur. */
    expect(FRISE).not.toMatch(/\.fav-bulle\{position:absolute/);
    /* ⚠️ UNE HAUTEUR RÉSERVÉE MÊME VIDE : sinon la page saute à chaque survol d'un point. */
    expect(FRISE).toMatch(/\.fav-zone\{min-height:\d+px/);
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
    expect(BLOC).toContain('setDeplies(new Set(evenements.filter((e) => !e.clos).map((e) => e.id)));');
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
    expect(FRISE).toContain('const liste = forme === \'etape\' ? TYPES_RESERVOIR : TYPES_INFORMATION;');
    expect(FRISE).toContain('<button type="button" className="fav-carre fav-carre--reserve"');
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
    expect(FRISE).toContain("if (e.key === 'Escape') fermerReservoir();");
    expect(FRISE).toContain('if (reservoir === null && !ajout) return undefined;');
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

  /** 🔴 ET LA PROPOSITION DE CLÔTURE EST INCHANGÉE (Arno, point 5) : jamais automatique. */
  it('🔴 la proposition de clôture n’a pas bougé', () => {
    expect(FRISE).toContain('vue.d.proposerCloture === true');
    expect(ROUTE_FRISE).toContain('proposerCloture: proposerCloture(etapes, traite)');
  });

  /**
   * 🔴🔴 MÊMES RÈGLES DANS LES DEUX ÉCRANS (Arno, point 6) : la vue de l'événement et le bloc « Événements » de
   * la fiche bien rendent le MÊME composant. Un second rendu aurait fini par diverger sur le réservoir.
   */
  it('🔴🔴 un seul composant pour les deux écrans', () => {
    for (const [nom, src] of [['CarteVive', CARTE], ['EvenementsDuBien', BLOC]] as const) {
      expect(src, nom).toContain('<FriseAvancement');
    }
  });
});
