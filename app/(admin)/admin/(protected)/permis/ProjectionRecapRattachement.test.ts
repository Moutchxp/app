import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { RecapProjectionRattachement } from './ProjectionRecapRattachement';
import type { EmpriseReconstruite, PolygoneBdTopo, ProvenanceEmprise } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';

// Parcelle carrée (≥ 3 sommets) → cadre calculable → schéma dessiné.
const PARCELLE = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
const carre = (dx: number, dy: number) => [{ x: dx, y: dy }, { x: dx + 20, y: dy }, { x: dx + 20, y: dy + 20 }, { x: dx, y: dy + 20 }];
// Bâti BD TOPO existant (∩ empreinte).
const POLYGONES: PolygoneBdTopo[] = [{ cleabs: 'BATI-1', anneau: carre(10, 10), etat: 'En service' }];

const emp = (over: Partial<EmpriseReconstruite> = {}): EmpriseReconstruite => ({
  id: 1, dossierId: 900, corpsId: 10, libelle: 'bâtiment A', anneau: carre(40, 40), anneaux: [carre(40, 40)],
  surfaceM2: 120, pieceId: null, page: 2, calage: null, residuM: 0.5, provenance: 'trace_manuel', creeLe: null, ...over,
});
const props = (etat: EtatSuivi, emprises: EmpriseReconstruite[], batiments = [{ corpsId: 10, repere: 'A' }]) =>
  ({ etat, emprises, parcelle: PARCELLE, polygones: POLYGONES, batiments });
const nb = (s: string, sub: string) => s.split(sub).length - 1;

describe('PROJ-4a — récap (lecture seule) de l’emprise projetée dans le Rattachement', () => {
  it('permis avec emprises « en attente de bâti » → les TROIS couches (parcelle · bâti BD TOPO · emprise) + légende', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [emp()])));
    expect(html).toContain('schéma de la parcelle, du bâti BD TOPO et des emprises reconstituées'); // le schéma est dessiné
    expect(html).toContain('data-etat="En service"');   // couche bâti BD TOPO existant
    expect(html).toContain('data-emprise="1"');           // couche emprise projetée
    // Légende reprise de l'écran de projection (les trois catégories nommées).
    expect(html).toContain('Bâti existant (BD TOPO)');
    expect(html).toContain('En projet (donnée IGN)');
    expect(html).toContain('Emprise tracée (reconstitution — jamais une mesure)');
  });

  it('permis « en attente de bâti » SANS emprise → message explicite, JAMAIS un schéma vide', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [])));
    expect(html).toContain('aucune emprise projetée n’a été enregistrée');
    expect(html).not.toContain('role="img"'); // pas de <svg> schéma
    expect(html).not.toContain('data-emprise');
  });

  it('permis HORS « en attente de bâti » (rattaché) → rien du tout', () => {
    for (const etat of ['valide', 'arbitrage_demande', 'refuse', 'suivi_aucun_signal'] as EtatSuivi[]) {
      expect(renderToStaticMarkup(h(RecapProjectionRattachement, props(etat, [emp()])))).toBe('');
    }
  });

  it('un bâtiment à PLUSIEURS emprises → toutes listées et toutes dessinées', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [
      emp({ id: 1, libelle: 'bâtiment A (1)' }), emp({ id: 2, libelle: 'bâtiment A (2)', anneau: carre(70, 70), anneaux: [carre(70, 70)] }),
    ])));
    // NOM-1 — ListeEmprises affiche le nom RÉSOLU du corps (repere « A »), qui PRIME sur le libellé stocké par emprise (vestigial).
    expect(html).not.toContain('bâtiment A (1)');
    expect(html).not.toContain('bâtiment A (2)');
    expect(html).toContain('data-emprise="1"'); // les deux emprises restent listées ET dessinées
    expect(html).toContain('data-emprise="2"');
  });

  it('emprise MULTI-PARTIES (MultiPolygon) → chaque partie est dessinée', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [
      emp({ id: 7, anneaux: [carre(40, 40), carre(70, 40)] }),
    ])));
    // Les contours dessinés portent « data-emprise="7" data-provenance » (le <li> de la liste, lui, ne porte pas data-provenance
    //   accolé) → on compte les PARTIES tracées dans le schéma, pas l'entrée de liste.
    expect(nb(html, 'data-emprise="7" data-provenance')).toBe(2); // deux contours pour la même emprise
  });

  // AFF-3 — UNE SEULE liste : la liste des emprises (provenance, orphelines) a migré dans le bloc replié `BlocProjetRepliable`, sous ce
  //   récap. Ce composant ne garde que le grand schéma + sa légende ; les emprises restent DESSINÉES (data-emprise), plus listées ici.
  it('AFF-3 — les emprises sont DESSINÉES ; la liste (provenance) a migré vers le bloc unique', () => {
    const trois: ProvenanceEmprise[] = ['trace_manuel', 'ign_adopte', 'ign_retouche'];
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati',
      trois.map((p, i) => emp({ id: i + 1, libelle: `bâtiment ${i}`, provenance: p })))));
    expect(html).toContain('data-emprise="1"');
    expect(html).toContain('data-emprise="2"');
    expect(html).toContain('data-emprise="3"');
    expect(html).not.toContain('tracé à la main'); // provenance plus listée dans ce récap
  });

  it('AFF-3 — plus de liste « non rattachées » dans le récap (elle vit dans le bloc unique)', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [emp({ id: 3, corpsId: null, libelle: 'ancienne emprise' })])));
    expect(html).toContain('data-emprise="3"');
    expect(html).not.toContain('Emprises non rattachées à un bâtiment');
    expect(html).not.toContain('ancienne emprise');
  });

  // LOT 80 — la légende par polygone reprend l'identité du schéma (Polygone A = BATI-1) et affiche le bâtiment + son altitude validée.
  it('LOT 80 — polygone adopté à un bâtiment → « Polygone A · … — <bâtiment> · altitude de sommet validée » ; unité NGF explicite', () => {
    const cal = { cleabs: ['BATI-1'] } as unknown as EmpriseReconstruite['calage'];
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, {
      etat: 'en_attente_bati' as EtatSuivi, parcelle: PARCELLE, polygones: POLYGONES,
      emprises: [emp({ id: 1, corpsId: 10, provenance: 'ign_adopte', calage: cal })],
      batiments: [{ corpsId: 10, repere: '2D1', altitudeSommetNgf: 42.5 }],
    }));
    expect(html).toContain('Par polygone');                    // titre de la légende
    expect(html).toContain('Polygone A');                       // identité = repère du schéma (BATI-1 → A)
    expect(html).toContain('2D1');                              // nom du bâtiment
    expect(html).toContain('42,50 m NGF');                      // altitude validée, unité explicite, sans arrondi trompeur
  });

  it('LOT 80 — polygone sans emprise-source → « non affecté » en toutes lettres (jamais une lettre prise pour un nom de bâtiment)', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [emp({ id: 1, calage: null })])));
    expect(html).toContain('non affecté à un bâtiment');
  });
});
