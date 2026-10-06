import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etiquettesVisibles, type EtiquetteAffichee } from './PleinEcranBoite';
import { etiquettesDeLEcran } from './GestionVue';
import { ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION, type Etiquette } from '../../../../lib/gestion/ecranUrl';
import type { EtatEcran } from '../../../../lib/gestion/fileRepo';

/**
 * LOT 5-FUSION — LA COLONNE D'ÉTIQUETTES. Ce qu'elle doit tenir, et ce qui arrive sinon :
 *   ① aucun compteur n'est RECALCULÉ ici : deux calculs pour une même chose finissent par donner deux chiffres, et
 *      c'est toujours l'écran le moins regardé qui garde le faux ;
 *   ② pas d'étiquette vide — sur 50 cartes, une colonne de zéros fait défiler pour rien ;
 *   ③ …SAUF celle qu'on regarde : une étiquette qui disparaît sous les pieds de qui vient de la choisir est un bug
 *      qu'on ne comprend jamais du premier coup.
 */

const ecran = (o: Partial<EtatEcran> = {}): EtatEcran => ({
  file: [], filsTotal: 442, fenetreJours: 30, filsTropAnciens: 12,
  sansSuite: [], sansSuiteTotal: 7, evenements: [], evenementsTotal: 0,
  messagesCaptures: 56000, messagesExclus: 40000, derniereReleveLe: '2026-09-24T10:00:00Z',
  // LOT VEILLE-VIVE — l'heure du dernier MAIL, distincte de celle de la dernière PASSE.
  dernierMailLe: '2026-09-24T09:42:00Z',
  // LOT 5-VEILLE — l'état de la relève AUTOMATIQUE fait partie de l'écran depuis ce lot ; il n'entre pas dans le
  //   calcul des étiquettes, mais un écran de doublure doit rester un écran COMPLET.
  veille: {
    derniereLe: '2026-09-24T10:00:00Z', resultat: 'ok', erreur: null,
    intervalleS: 60, toleranceIntervalles: 10,
  },
  // LOT RATTACHEMENT-2 — idem pour l'enchaînement qui suit la relève : il n'entre pas dans le calcul des étiquettes,
  //   mais un écran de doublure doit rester COMPLET, sinon le test ne prouve plus rien de l'écran réel.
  suite: { resultat: 'ok', detail: 'rien de nouveau à rattacher', ms: 5 },
  // LOT COPIE-SURV — l'état de la COPIE des pièces vers le Drive : `derniere: null` rend le bandeau MUET, ce qui est
  //   l'état d'un écran de doublure. Il doit y figurer quand même — un écran de doublure incomplet ne prouve plus rien.
  copie: { derniere: null, restantes: null, motifs: [] },
  ...o,
});
const carte = (id: number, nbFils: number) => ({
  evenementId: id, reference: `GES-2026-${String(id).padStart(6, '0')}`, objet: `Dossier ${id}`,
  demandeur: null, adresseLibre: null, etat: 'a_traiter' as const, ouvertLe: '2026-09-01T10:00:00Z',
  dernierEchangeLe: null, nbFils, nbMailsDeplaces: 0, attend: false,
  /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — la dernière carte d'étape de la frise ; `null` ici, ces épreuves ne
     portent que sur les ÉTIQUETTES de la colonne, qui ne la lisent pas. */
  derniereEtape: null,
  /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — l'effet « mis à jour par Monga » est la comparaison de ces deux dates.
     `null` des deux côtés = aucune étape Monga, jamais vu : rien ne s'allume. */
  mongaMajLe: null, vuLe: null,
});
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311, aClasser: 1234 };
const par = (l: EtiquetteAffichee[], sorte: string) => l.find((e) => e.etiquette.sorte === sorte);

describe('🔴 ① les compteurs viennent d’où ils sont DÉJÀ calculés, jamais d’un second calcul', () => {
  const l = etiquettesDeLEcran(ecran(), COMPTES);

  it('« Sans suite » est celui du poste de tri, mot pour mot', () => {
    expect(par(l, 'sans_suite')?.compte).toBe(7);    // = sansSuiteTotal
  });

  /**
   * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — « SANS ÉVÉNEMENT » A QUITTÉ LA COLONNE, « À CLASSER » PREND SA PLACE ═══════
   *
   * Accord explicite d'Arno (02/10/2026) : « Le dossier “Sans événement” ne me sert à rien. Il est remplacé, à la
   * même place, par un dossier “À classer”. » Ce cas disait l'inverse ; il dit maintenant ce qui est.
   *
   * ⚠️ ET SON NOMBRE NE VIENT PLUS DU POSTE DE TRI : il sort de la lecture de la boîte (`comptesBoite`), par le
   * MÊME constructeur que l'en-tête de la liste. C'est tout l'objet du lot — le compteur et la liste ne peuvent
   * plus se contredire.
   */
  it('🔴🔴 « À classer » a remplacé « Sans événement », et son nombre vient de la BOÎTE', () => {
    expect(par(l, 'a_classer_statut')?.libelle).toBe('À classer');
    expect(par(l, 'a_classer_statut')?.compte).toBe(1234);
    // 🔴 L'ANCIENNE ENTRÉE N'EST PLUS DANS LA COLONNE — c'est le retrait demandé.
    expect(par(l, 'a_classer')).toBeUndefined();
    expect(l.map((e) => e.libelle)).not.toContain('Sans événement');
  });

  it('« Réception », « Envoyés » et « Courrier automatique » sortent de l’unique lecture de la boîte', () => {
    expect(par(l, 'reception')?.compte).toBe(4944);
    expect(par(l, 'envoyes')?.compte).toBe(3311);
    expect(par(l, 'automatique')?.compte).toBe(12262);
  });

  it('🔴 compte inconnu ⇒ étiquette SANS nombre, jamais un zéro inventé — un faux chiffre fait fermer l’outil', () => {
    const sans = etiquettesDeLEcran(ecran(), null);
    expect(par(sans, 'reception')?.compte).toBeNull();
    expect(par(sans, 'envoyes')?.compte).toBeNull();
    expect(par(sans, 'sans_suite')?.compte).toBe(7); // celui-là, lui, est connu d'emblée (poste de tri)
    /**
     * 🔴🔴 LOT DOSSIER-A-CLASSER — ET « À classer » SUIT LA MÊME RÈGLE QUE « Réception » : son nombre vient de la
     * boîte, donc sans elle il vaut `null` — jamais `0`. Un « 0 » se lirait « il n'y a plus rien à classer », la
     * plus mauvaise des nouvelles à annoncer à tort.
     */
    expect(par(sans, 'a_classer_statut')?.compte).toBeNull();
  });

  /**
   * 🔴 LOT ERGO-BOITE — LES CARTES NE SONT PLUS DANS LA COLONNE, sauf celle qu'on regarde.
   * Retrait demandé par Arno : une carte n'est pas un dossier de courrier, et un long titre occupait à lui seul le
   * quart de la colonne. L'exception existe pour ne pas dégrader un chemin existant — le cartouche d'une
   * conversation classée mène à `?etiquette=carte-12`, et cette liste doit rester NOMMÉE et sélectionnée.
   */
  it('🔴 aucune carte dans la colonne… sauf celle qu’on regarde, qui garde sa référence et son nombre', () => {
    const sansOuverte = etiquettesDeLEcran(ecran({ evenements: [carte(12, 3)] }), COMPTES);
    expect(sansOuverte.some((e) => e.etiquette.sorte === 'carte')).toBe(false);

    const ouverte: Etiquette = { sorte: 'carte', evenementId: 12 };
    const avec = etiquettesDeLEcran(ecran({ evenements: [carte(12, 3)] }), COMPTES, null, null, false, ouverte);
    const c = avec.find((e) => e.etiquette.sorte === 'carte');
    expect(c).toMatchObject({ libelle: 'Dossier 12', reference: 'GES-2026-000012', compte: 3 });
    expect(c?.etiquette.evenementId).toBe(12);
    // …et UNE SEULE : les autres cartes restent hors de la colonne.
    expect(avec.filter((e) => e.etiquette.sorte === 'carte')).toHaveLength(1);
  });

  it('🔴 aucune étiquette « À traiter » : l’état par échange n’existe pas en base, elle mentirait', () => {
    expect(etiquettesDeLEcran(ecran(), COMPTES).map((e) => e.libelle)).not.toContain('À traiter');
  });
});

describe('🔴 ② et ③ pas d’étiquette vide, sauf celle qu’on regarde', () => {
  /**
   * ⚠️ LES CARTES SONT FOURNIES EXPLICITEMENT depuis le lot ERGO-BOITE : `etiquettesDeLEcran` ne les produit plus.
   * Ce que ces tests protègent — la règle de VISIBILITÉ de `etiquettesVisibles` — n'a pas changé et continue de
   * servir à la carte ouverte.
   */
  const brutes = (): EtiquetteAffichee[] => [
    ...etiquettesDeLEcran(ecran({ filsTotal: 0, sansSuiteTotal: 0 }), COMPTES),
    { etiquette: { sorte: 'carte', evenementId: 1 }, libelle: 'Dossier 1', reference: 'GES-2026-000001', compte: 0 },
    { etiquette: { sorte: 'carte', evenementId: 2 }, libelle: 'Dossier 2', reference: 'GES-2026-000002', compte: 5 },
  ];

  it('une carte sans échange ne prend pas une ligne dans la colonne', () => {
    const vus = etiquettesVisibles(brutes(), ETIQUETTE_RECEPTION);
    expect(vus.map((e) => e.libelle)).toContain('Dossier 2');
    expect(vus.map((e) => e.libelle)).not.toContain('Dossier 1');
  });

  it('…et les étiquettes fixes à zéro non plus', () => {
    const vus = etiquettesVisibles(brutes(), ETIQUETTE_RECEPTION);
    expect(vus.map((e) => e.libelle)).not.toContain('Sans suite');
  });

  it('🔴 SAUF celle qu’on regarde : la choisir ne doit pas la faire disparaître', () => {
    // 🔴🔴 LOT DOSSIER-A-CLASSER — l'exemple était « Sans événement », qui a quitté la colonne. La RÈGLE, elle,
    //   n'a pas changé d'un mot : on l'éprouve désormais sur « À classer », qui occupe la même place.
    const ouverte: Etiquette = { sorte: 'a_classer_statut', evenementId: null };
    const vus = etiquettesVisibles(brutes(), ouverte);
    expect(vus.map((e) => e.libelle)).toContain('À classer'); // à zéro, mais ouverte
  });

  it('un compte INCONNU laisse l’étiquette visible : on ne fait pas disparaître ce qu’on ne sait pas', () => {
    const vus = etiquettesVisibles(etiquettesDeLEcran(ecran({ filsTotal: 0, sansSuiteTotal: 0 }), null), ETIQUETTE_RECEPTION);
    expect(vus.map((e) => e.libelle)).toEqual(expect.arrayContaining(['Réception', 'Envoyés', 'Courrier automatique']));
  });

  it('une carte ouverte reste listée même vide — sinon la colonne se vide au clic', () => {
    const ouverte: Etiquette = { sorte: 'carte', evenementId: 1 };
    expect(etiquettesVisibles(brutes(), ouverte).map((e) => e.libelle)).toContain('Dossier 1');
  });
});

describe('exigences transverses des feuilles de style du plein écran', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
  const css = src.slice(src.indexOf('const CSS_PLEIN_ECRAN'));
  // LOT 5-FUSION-B — les étiquettes ont déménagé dans la barre de l'administration : leur habillage vit désormais là.
  const srcCol = readFileSync('app/(admin)/admin/(protected)/gestion/ColonneMode.tsx', 'utf8');
  const cssCol = srcCol.slice(srcCol.indexOf('const CSS_COLONNE'));

  it('AUCUNE couleur en dur : tout passe par les jetons de la charte', () => {
    expect(css.match(/#[0-9a-f]{3,8}\b|\brgba?\(/gi) ?? []).toEqual([]);
    expect(cssCol.match(/#[0-9a-f]{3,8}\b|\brgba?\(/gi) ?? []).toEqual([]);
  });

  it('AUCUN débordement horizontal : chaque panneau peut rétrécir, le texte casse', () => {
    for (const c of ['.pe-liste{min-width:0}', '.pe-lecture{min-width:0}']) expect(css).toContain(c);
    expect(cssCol).toContain('.cm{display:flex;flex-direction:column;gap:8px;min-width:0}');
    expect(cssCol).toContain('overflow-wrap:anywhere');
  });

  it('CIBLES TACTILES : une étiquette se clique au doigt', () => {
    expect(cssCol).toContain('min-height:44px');
  });

  it('l’étiquette ouverte est dite par un MOT et par la FORME, jamais par la seule couleur', () => {
    expect(src).toContain("aria-current={active ? 'true' : undefined}");
    expect(cssCol).toContain('text-decoration:underline');
  });

  it('🔴 LOT 5-GMAIL — UNE SEULE COLONNE : la liste occupe toute la largeur, sans volet de lecture permanent', () => {
    expect(css).toContain('.pe-grille{display:grid;grid-template-columns:minmax(0,1fr)');
    // Le partage à deux colonnes n'existe plus QUE pour « classer », et seulement au-delà de 1000 px.
    expect(css).toContain('@media (min-width:1000px)');
    expect(css).toContain('.pe-grille--classer{grid-template-columns:minmax(0,1fr) minmax(0,22rem)}');
  });

  it('🔴 sur TÉLÉPHONE, « classer » est un écran DE PLUS, pas une seconde colonne', () => {
    expect(css).toContain('.pe-grille--classer .pe-lecture{display:none}');
    // …et il redevient une colonne dès qu'il y a la place pour relire le mail en choisissant sa carte.
    expect(css).toContain('.pe-grille--classer .pe-lecture{display:block}');
  });

  it('🔴 la liste reste MONTÉE pendant la lecture : elle ne perd ni ses pages ni sa recherche', () => {
    expect(src).toContain('hidden={filOuvert !== null}');
    // …et sa position de défilement est rendue au retour.
    expect(src).toContain('window.scrollTo(0, y)');
  });

  it('🔴 sur TÉLÉPHONE, un retour explicite entre la colonne et la liste — et lui seulement là', () => {
    expect(src).toContain('← Étiquettes');
    expect(css).toContain('@media (min-width:768px){.pe-retour-colonne{display:none}}');
  });

  it('LA SORTIE EST LE PREMIER ÉLÉMENT DE LA COLONNE : un plein écran sans retour évident est un piège', () => {
    expect(src.indexOf('← Écran partagé')).toBeLessThan(src.indexOf('cm-liste'));
  });
});
