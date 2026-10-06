import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bandeauxDesEvenements, bornesSurLaFrise, coteDeLEtiquette, moisDeLaFrise, reperesDoccupation,
  MARGE_ETIQUETTE, MOIS_VISIBLES_PAR_DEFAUT, type MailDeLaFrise,
} from '../../../../lib/gestion/friseBien';

/**
 * ══ 🔴🔴 LOT FRISES-REPARATION — LA GÉOMÉTRIE DES DEUX FRISES, ET LEUR SÉPARATION ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (06/10/2026, capture) : sur la frise chronologique des mails, la zone orange d'un événement ne
 * couvrait que la moitié haute, les repères d'entrée/sortie paraissaient coupés, les traits de mails commençaient
 * à mi-hauteur, et la flèche « ‹ » était posée SUR la frise.
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE — UNE COLLISION DE FEUILLES, ET NON QUATRE DÉFAUTS ══════════════════════════════════
 *
 * `FriseAvancement` (lot FRISE-HORIZONTALE, le mien) employait le préfixe `frs-`, celui de `FriseDuBien`
 * (lots 17-18). Les deux frises coexistent sur la fiche d'un bien, et TROIS sélecteurs se recouvraient :
 * `.frs`, `.frs-piste`, `.frs-fleche`.
 *
 * MESURÉ SUR LOT-237 (un événement, donc les deux feuilles présentes) :
 *   · la piste des mails : **132 px au lieu de 88** (`min-height:132px`, `padding:10px/30px`, `display:flex`,
 *     `overflow-x:auto` — tout venu de la feuille d'avancement) ;
 *   · la zone orange gardait 62 px → **47 %** de la hauteur ;
 *   · les traits commençaient à **54 px sur 132** → à mi-hauteur, le haut vide ;
 *   · les repères gardaient 62 px sur 132 → trait d'apparence coupée ;
 *   · la flèche passait en **z-index 6** (contre 2) et à `top:50%` d'une boîte de 132 → posée sur les traits.
 *
 * 🔴 LA PREUVE PAR LE TÉMOIN : sur LOT-146, qui n'a aucun événement, le bloc « Événements » ne rend rien, la
 * feuille d'avancement n'est pas injectée — et la frise des mails mesurait **88 px, traits à 10 px, repères à
 * 62 px**. Parfaitement saine. C'est la coexistence qui cassait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const MAILS = readFileSync('app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx', 'utf8');
const AVANC = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');

/** Les classes d'une feuille, commentaires retirés — ce sont les SÉLECTEURS qui comptent, pas les explications. */
function classesDeLaFeuille(src: string): Set<string> {
  const i = src.indexOf('const CSS_');
  const feuille = src.slice(i).replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...feuille.matchAll(/\.([a-zA-Z][-a-zA-Z0-9_]*)/g)].map((m) => m[1]));
}

describe('① les deux feuilles ne se touchent plus JAMAIS', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DE CE LOT. Deux composants qui vivent sur la même page ne peuvent pas partager un
   * préfixe de classe : il n'y a pas de portée en CSS, et la dernière feuille injectée gagne — ce qui dépend de
   * l'ordre de rendu, donc de rien de stable.
   *
   * ⚠️ ELLE COMPARE LES CLASSES, PAS LES PRÉFIXES : un `.fav-piste` qui redeviendrait `.frs-piste` serait
   * attrapé, mais aussi un `.gst-truc` que l'une des deux inventerait alors que l'autre le porte déjà.
   */
  it('🔴🔴 aucune classe commune entre la frise des mails et celle d’avancement', () => {
    const a = classesDeLaFeuille(MAILS);
    const b = classesDeLaFeuille(AVANC);
    const communes = [...a].filter((c) => b.has(c)).sort();
    expect(communes, `classes en collision : ${communes.join(', ')}`).toEqual([]);
  });

  /** 🔴 LA FRISE DES MAILS GARDE `frs-`, c'est la plus ancienne ; l'avancement prend `fav-`. */
  it('🔴 chacune garde son préfixe, et un seul', () => {
    for (const c of classesDeLaFeuille(MAILS)) expect(c.startsWith('frs'), c).toBe(true);
    for (const c of classesDeLaFeuille(AVANC)) expect(c.startsWith('fav'), c).toBe(true);
  });

  /** ⚠️ ET DANS LE BALISAGE AUSSI : une classe posée en JSX sans règle de feuille échapperait à l'épreuve. */
  it('⚠️ le balisage d’avancement ne pose plus aucune classe `frs-`', () => {
    expect(AVANC).not.toMatch(/className="[^"]*\bfrs-/);
    expect(AVANC).not.toMatch(/className=\{`[^`]*\bfrs-/);
  });
});

describe('② la géométrie de la frise des mails', () => {
  /**
   * 🔴🔴 LA ZONE D'UN ÉVÉNEMENT COUVRE TOUTE LA HAUTEUR HAUTE (constat ① d'Arno). `height:var(--frs-haut)` et
   * `top:0` : ni un pourcentage, ni une valeur en dur, ni une hauteur calculée au rendu — la variable EST la
   * hauteur haute, et les deux ne peuvent pas diverger.
   */
  it('🔴🔴 la zone orange fait exactement la hauteur haute, depuis le haut', () => {
    expect(MAILS).toMatch(/\.frs-evt\{position:absolute;top:0;height:var\(--frs-haut\)/);
  });

  /** 🔴 LES REPÈRES AUSSI : toute la hauteur haute, depuis le haut (constat ②). */
  it('🔴 un repère d’entrée ou de sortie fait toute la hauteur haute', () => {
    expect(MAILS).toMatch(/\.frs-repere\{position:absolute;top:0;height:var\(--frs-haut\)/);
    /* 🔴 ET SON TRAIT COURT SUR TOUTE CETTE HAUTEUR : `top:0;bottom:0`, jamais une hauteur à part. */
    expect(MAILS).toMatch(/\.frs-repere::before\{[^}]*top:0;bottom:0/);
  });

  /**
   * 🔴🔴 LES TRAITS DE MAILS OCCUPENT LA HAUTEUR HAUTE, À UNE PETITE MARGE PRÈS (constat ③). La marge est
   * NOMMÉE dans la règle : `calc(var(--frs-haut) - …)`, de sorte qu'elle suive la hauteur haute si elle change.
   * Une hauteur en dur se serait désalignée au premier ajustement — c'est ce qu'a fait le lot 18 en réduisant
   * la partie haute de 20 %.
   */
  it('🔴🔴 un trait de mail part du bas de la partie haute et la remplit presque', () => {
    expect(MAILS).toMatch(/\.frs-trait\{position:absolute;bottom:var\(--frs-bas\);[^}]*height:calc\(var\(--frs-haut\) - \d+px\)/);
    /* ⚠️ LA MARGE RESTE PETITE : au-delà, « le haut est vide » redeviendrait vrai. */
    const m = /height:calc\(var\(--frs-haut\) - (\d+)px\)/.exec(MAILS);
    expect(Number(m?.[1] ?? 99)).toBeLessThanOrEqual(12);
  });

  /**
   * 🔴🔴 LA PISTE NE FAIT QUE LA SOMME DES DEUX PARTIES, et rien d'autre : ni `min-height`, ni `padding`
   * vertical. C'est exactement ce que la collision avait ajouté, et c'est ce qui décalait tout.
   */
  it('🔴🔴 la piste des mails ne porte aucune hauteur ni marge parasite', () => {
    const r = /\.frs-piste\{([^}]*)\}/.exec(MAILS);
    expect(r).not.toBeNull();
    const regle = r?.[1] ?? '';
    expect(regle).toContain('height:calc(var(--frs-haut) + var(--frs-bas))');
    expect(regle).not.toContain('min-height');
    expect(regle).not.toContain('padding');
    /* 🔴 ET ELLE NE DÉFILE PAS : c'est `.frs-cadre` qui défile, et lui seul (voir ③). */
    expect(regle).not.toContain('overflow');
  });
});

describe('③ un seul conteneur qui défile, et les flèches hors du dessin', () => {
  /**
   * 🔴🔴 DEUX CONTENEURS IMBRIQUÉS QUI DÉFILENT, C'EST UN DÉFILEMENT QUI NE RÉPOND PLUS. La collision avait
   * posé `overflow-x:auto` sur la piste, DANS un cadre qui défile déjà : le geste partait dans l'un ou l'autre
   * selon l'endroit du curseur.
   */
  it('🔴🔴 la frise des mails : seul le cadre défile', () => {
    expect(MAILS).toMatch(/\.frs-cadre\{overflow-x:auto/);
    expect(/\.frs-piste\{([^}]*)\}/.exec(MAILS)?.[1] ?? '').not.toContain('overflow');
  });

  it('🔴🔴 la frise d’avancement : seule la piste défile', () => {
    expect(AVANC).toMatch(/\.fav-piste\{[^}]*overflow-x:auto/);
    /* ⚠️ LE CADRE QUI LA PORTE NE DÉFILE PAS : il ne sert qu'à ancrer les flèches. */
    expect(/\.fav-piste-cadre\{([^}]*)\}/.exec(AVANC)?.[1] ?? '').not.toContain('overflow');
  });

  /**
   * 🔴 LES FLÈCHES NE MASQUENT AUCUN TRAIT (constat ④). Sur la frise des mails elles sont posées à la hauteur
   * du MILIEU de la partie haute, hors de la zone des traits, et leur `z-index` reste bas.
   */
  it('🔴 la flèche des mails reste au-dessus de la partie haute, en z-index bas', () => {
    expect(MAILS).toMatch(/\.frs-fleche\{position:absolute;top:calc\(var\(--frs-haut\) \/ 2 - 16px\);z-index:2/);
  });

  /** 🔴 ET ELLES N'APPARAISSENT QUE S'IL RESTE DU CHEMIN — une flèche morte s'apprend. */
  it('🔴 les deux frises n’affichent une flèche que s’il reste à voir', () => {
    expect(MAILS).toContain('{aGauche && (');
    expect(MAILS).toContain('{aDroite && (');
    expect(AVANC).toContain('{bords.gauche && (');
    expect(AVANC).toContain('{bords.droite && (');
  });
});

describe('④ ce que le lot 18 a posé est toujours juste', () => {
  /**
   * 🔴 LA RÉDUCTION DE 20 % DE LA PARTIE HAUTE (lot 18). 62 px est le résultat : 78 × 0,8 = 62,4. L'épreuve
   * fige la VALEUR plutôt que le calcul, parce que c'est elle qu'on lit à l'écran — et elle borne aussi la
   * partie basse, qui ne doit pas avoir bougé.
   */
  it('🔴 la partie haute vaut 62 px, la basse 26 px', () => {
    expect(MAILS).toMatch(/--frs-haut:62px/);
    expect(MAILS).toMatch(/--frs-bas:26px/);
  });

  /** 🔴 ET LES 12 MOIS PAR DÉFAUT SONT TOUJOURS LES MÊMES DANS LA FEUILLE ET DANS LE MODULE PUR. */
  it('🔴 les 12 mois visibles ne divergent pas entre la feuille et le module', () => {
    expect(MOIS_VISIBLES_PAR_DEFAUT).toBe(12);
    expect(MAILS).toContain(`/ ${MOIS_VISIBLES_PAR_DEFAUT})`);
  });

  /**
   * 🔴🔴 LA PROLONGATION DE PÉRIODE PAR UN ÉVÉNEMENT (lot 18). Un événement OUVERT court jusqu'à aujourd'hui :
   * son bandeau ne doit pas s'arrêter à sa date d'ouverture, sinon il devient un trait et non une zone.
   */
  it('🔴🔴 un événement ouvert court jusqu’à aujourd’hui', () => {
    const maintenant = new Date('2026-10-06T12:00:00Z');
    const b = bandeauxDesEvenements([{
      reference: 'GES-1', objet: 'fuite', ouvert: true,
      ouvertLe: '2026-09-23T10:00:00Z', closLe: null,
    }], maintenant);
    expect(b).toHaveLength(1);
    expect(b[0].du.slice(0, 10)).toBe('2026-09-23');
    expect(b[0].au.slice(0, 10)).toBe('2026-10-06');
  });

  /** 🔴 UN ÉVÉNEMENT CLOS S'ARRÊTE À SA CLÔTURE, et pas à aujourd'hui. */
  it('🔴 un événement clos s’arrête à sa date de clôture', () => {
    const b = bandeauxDesEvenements([{
      reference: 'GES-2', objet: 'travaux', ouvert: false,
      ouvertLe: '2026-08-01T10:00:00Z', closLe: '2026-08-20T10:00:00Z',
    }], new Date('2026-10-06T12:00:00Z'));
    expect(b[0].au.slice(0, 10)).toBe('2026-08-20');
  });

  /**
   * 🔴 ET SA ZONE A UNE LARGEUR RÉELLE SUR LA FRISE : `bornesSurLaFrise` rend deux positions distinctes, sinon
   * le fond orange serait un trait de zéro pixel — ce que l'écran compense par un plancher, mais qui dirait
   * faux.
   */
  it('🔴 la zone d’un événement a une largeur, pas un point', () => {
    const mails: MailDeLaFrise[] = [
      { messageId: 1, recuLe: '2026-08-01T10:00:00Z', de: 'a@b.fr', objet: null, sens: 'recu' } as MailDeLaFrise,
      { messageId: 2, recuLe: '2026-10-01T10:00:00Z', de: 'a@b.fr', objet: null, sens: 'recu' } as MailDeLaFrise,
    ];
    const mois = moisDeLaFrise(mails, new Date('2026-10-06T12:00:00Z'));
    const p = bornesSurLaFrise('2026-09-23T10:00:00Z', '2026-10-06T12:00:00Z', mois);
    expect(p).not.toBeNull();
    expect((p?.a ?? 0) - (p?.de ?? 0)).toBeGreaterThan(0.1);
  });
});

describe('⑤ les repères d’occupation, entrée ET sortie', () => {
  /**
   * 🔴 CONSTAT ② D'ARNO : « Aucun repère “Entrée” n'est visible. » Le module pur en rend bien deux par
   * occupation bornée — c'était l'affichage qui les écrasait, pas le calcul. L'épreuve le fige.
   */
  it('🔴 une occupation bornée donne une entrée ET une sortie', () => {
    /* ⚠️ LA VRAIE FORME : `libelle` / `depuis` / `jusqua`. Un `as never` m'avait laissé passer des clés
       inventées, et la fonction lisait alors `undefined` comme une date — l'épreuve annonçait un défaut qui
       n'existait pas. Les types disent la forme : on ne les contourne pas pour écrire un test. */
    const r = reperesDoccupation([{ libelle: 'MARTIN', depuis: '2025-01-15', jusqua: '2025-10-22' }]);
    expect(r.map((x) => x.sorte)).toEqual(['entree', 'sortie']);
  });

  /** ⚠️ UNE OCCUPATION EN COURS N'A PAS DE SORTIE : on ne dessine pas un départ qui n'a pas eu lieu. */
  it('⚠️ une occupation en cours n’a qu’une entrée', () => {
    const r = reperesDoccupation([{ libelle: 'DURAND', depuis: '2026-05-01', jusqua: null }]);
    expect(r.map((x) => x.sorte)).toEqual(['entree']);
  });

  /**
   * 🔴🔴 UNE RELOCATION LE MÊME JOUR : la SORTIE avant l'ENTRÉE. C'est le cas de lot-146 le 22/10/2025, et
   * c'est ce qui fait lire l'histoire dans le bon sens.
   */
  it('🔴🔴 le même jour, la sortie précède l’entrée', () => {
    const r = reperesDoccupation([
      { libelle: 'BRASSET', depuis: '2025-10-22', jusqua: null },
      { libelle: 'VAGLIO', depuis: '2024-01-01', jusqua: '2025-10-22' },
    ]);
    const du22 = r.filter((x) => x.quand === '2025-10-22');
    expect(du22.map((x) => x.sorte)).toEqual(['sortie', 'entree']);
  });
});

describe('⑥ l’étiquette d’un repère ne sort jamais de la frise', () => {
  /**
   * 🔴🔴 CONSTAT ② D'ARNO, MESURÉ SUR LOT-237 : une sortie posée à 44 px du bord gauche d'une piste de 1 995 px
   * voyait son étiquette s'étendre de **−5 px** à 41 — elle sortait de la frise, et le trait paraissait coupé.
   * Après correction, mesuré : **47 → 93**, à l'intérieur.
   */
  it('🔴🔴 près du bord GAUCHE, l’étiquette part à droite — même pour une sortie', () => {
    expect(coteDeLEtiquette(0.2, 24, 'sortie')).toBe('droite');
    expect(coteDeLEtiquette(0.2, 24, 'entree')).toBe('droite');
  });

  it('🔴🔴 près du bord DROIT, elle part à gauche — même pour une entrée', () => {
    expect(coteDeLEtiquette(23.8, 24, 'entree')).toBe('gauche');
    expect(coteDeLEtiquette(23.8, 24, 'sortie')).toBe('gauche');
  });

  /**
   * ⚠️ AU MILIEU, LA CONVENTION TIENT, et il le faut : c'est elle qui sépare les deux drapeaux quand une sortie
   * et une entrée tombent le même jour (lot-146, le 22/10/2025). La corriger partout aurait fait se recouvrir
   * les deux étiquettes d'une relocation.
   */
  it('⚠️ au milieu, la sortie reste à gauche et l’entrée à droite', () => {
    expect(coteDeLEtiquette(12, 24, 'sortie')).toBe('gauche');
    expect(coteDeLEtiquette(12, 24, 'entree')).toBe('droite');
  });

  /** ⚠️ LE SEUIL EST EN FRACTION, pas en pixels : le module pur ne connaît pas la largeur à l'écran. */
  it('⚠️ la marge est une fraction de la piste, et elle est modeste', () => {
    expect(MARGE_ETIQUETTE).toBeGreaterThan(0);
    expect(MARGE_ETIQUETTE).toBeLessThanOrEqual(0.1);
  });

  /** ⚠️ UNE FRISE VIDE NE DIVISE PAS PAR ZÉRO. */
  it('⚠️ zéro mois ne casse rien', () => {
    expect(coteDeLEtiquette(0, 0, 'sortie')).toBe('droite');
  });

  /** 🔴 ET LA FEUILLE POSE LE CÔTÉ PAR LA CLASSE, non plus en le déduisant de la sorte. */
  it('🔴 le côté vient d’une classe, et la sorte ne porte plus que la couleur', () => {
    expect(MAILS).toContain('.frs-repere-picto--gauche{right:3px}');
    expect(MAILS).toContain('.frs-repere-picto--droite{left:3px}');
    expect(MAILS).not.toMatch(/\.frs-repere--sortie \.frs-repere-picto\{right:/);
  });
});
