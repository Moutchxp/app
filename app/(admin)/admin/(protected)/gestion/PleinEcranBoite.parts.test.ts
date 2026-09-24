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
  messagesCaptures: 56000, messagesExclus: 40000, derniereReleveLe: '2026-09-24T10:00:00Z', ...o,
});
const carte = (id: number, nbFils: number) => ({
  evenementId: id, reference: `GES-2026-${String(id).padStart(6, '0')}`, objet: `Dossier ${id}`,
  demandeur: null, adresseLibre: null, etat: 'a_traiter' as const, ouvertLe: '2026-09-01T10:00:00Z',
  dernierEchangeLe: null, nbFils, nbMailsDeplaces: 0, attend: false,
});
const COMPTES = { lisibles: 4944, automatiques: 12262, envoyes: 3311 };
const par = (l: EtiquetteAffichee[], sorte: string) => l.find((e) => e.etiquette.sorte === sorte);

describe('🔴 ① les compteurs viennent d’où ils sont DÉJÀ calculés, jamais d’un second calcul', () => {
  const l = etiquettesDeLEcran(ecran(), COMPTES);

  it('« À classer » et « Sans suite » sont ceux du poste de tri, mot pour mot', () => {
    expect(par(l, 'a_classer')?.compte).toBe(442);   // = filsTotal
    expect(par(l, 'sans_suite')?.compte).toBe(7);    // = sansSuiteTotal
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
    expect(par(sans, 'a_classer')?.compte).toBe(442); // celui-là, lui, est connu d'emblée
  });

  it('une carte porte sa RÉFÉRENCE, son titre et son nombre d’échanges — ceux de sa colonne', () => {
    const avec = etiquettesDeLEcran(ecran({ evenements: [carte(12, 3)] }), COMPTES);
    const c = avec.find((e) => e.etiquette.sorte === 'carte');
    expect(c).toMatchObject({ libelle: 'Dossier 12', reference: 'GES-2026-000012', compte: 3 });
    expect(c?.etiquette.evenementId).toBe(12);
  });

  it('🔴 aucune étiquette « À traiter » : l’état par échange n’existe pas en base, elle mentirait', () => {
    expect(etiquettesDeLEcran(ecran(), COMPTES).map((e) => e.libelle)).not.toContain('À traiter');
  });
});

describe('🔴 ② et ③ pas d’étiquette vide, sauf celle qu’on regarde', () => {
  const brutes = (): EtiquetteAffichee[] => etiquettesDeLEcran(
    ecran({ filsTotal: 0, sansSuiteTotal: 0, evenements: [carte(1, 0), carte(2, 5)] }), COMPTES);

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
    const vus = etiquettesVisibles(brutes(), ETIQUETTE_ARRIVEE);
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

  it('MOBILE D’ABORD : un seul panneau par défaut, deux quand la largeur le permet', () => {
    expect(css).toContain('.pe-grille{display:grid;grid-template-columns:minmax(0,1fr)');
    // 1000 px et non 1200 : les étiquettes ayant quitté le contenu, deux panneaux tiennent 200 px plus tôt.
    expect(css).toContain('@media (min-width:1000px)');
    // …et sur un écran étroit, l'échange ouvert REMPLACE la liste au lieu de la comprimer.
    expect(css).toContain('.pe-grille--lecture .pe-liste{display:none}');
  });

  it('🔴 sur TÉLÉPHONE, un retour explicite entre la colonne et la liste — et lui seulement là', () => {
    expect(src).toContain('← Étiquettes');
    expect(css).toContain('@media (min-width:768px){.pe-retour-colonne{display:none}}');
  });

  it('LA SORTIE EST LE PREMIER ÉLÉMENT DE LA COLONNE : un plein écran sans retour évident est un piège', () => {
    expect(src.indexOf('← Écran partagé')).toBeLessThan(src.indexOf('cm-liste'));
  });
});
