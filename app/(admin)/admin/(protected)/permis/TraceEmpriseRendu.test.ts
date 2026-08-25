import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, fmtM2, affichageTrace, SelecteurPiecePlan, grouperPieces, etiquettePiecePlan, construireBandePlans, bornerIndex, indexSuivant, indexPrecedent, libellePlan, travailEnCours, BandePlans, bornerPage, NavPieceLibre, libelleFamille, messageVerrou, polygonesVisibles, OptionsVisibiliteSchema, LegendeSchemaProjection, FILTRES_SCHEMA_DEFAUT, type FiltresSchema, type PiecePlan } from './TraceEmpriseRendu';
import type { VerdictCalage, VerdictVraisemblance, Boite } from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments } from '../../../../lib/permis/projectionBatiments';

const emprise = (over: Partial<EmpriseReconstruite> = {}): EmpriseReconstruite => ({
  id: 1, dossierId: 11434, corpsId: 1, libelle: '2D1', anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  surfaceM2: 100, pieceId: 55, page: 2, calage: null, residuM: 0.3, creeLe: null, ...over,
});

describe('PROJ-2 — rendu pur', () => {
  it('BandeauCalage : sans calage → invite ; douteux → affiche « douteux » + raisons + résidu (jamais masqué)', () => {
    expect(renderToStaticMarkup(h(BandeauCalage, { calage: null, nbPaires: 0 }))).toContain('posez 2 points');
    const vc: VerdictCalage = { residuFitM: 0, ratioImplicite: 100, ratioDeclare: 1000, residuEchelleM: 3.2, ecartEchelleRelatif: 0.9, douteux: true, raisons: ['échelle du calage (1:100) éloignée de l’échelle déclarée (1:1000) de 90 %'] };
    const html = renderToStaticMarkup(h(BandeauCalage, { calage: vc, nbPaires: 2 }));
    expect(html).toContain('douteux');
    expect(html).toContain('data-douteux="true"');
    expect(html).toContain('1:100');
    expect(html).toContain('éloignée de l’échelle déclarée');
    expect(html).toContain('calage exact sur 2 points'); // on DIT que le résidu de fit est nul par construction
  });

  it('BandeauVraisemblance : 🔴 dépassement du terrain rendu en évidence, aire vive', () => {
    const v: VerdictVraisemblance = { depasseTerrain: true, empriseVsPlancher: 'grande', empriseAttendueM2: 300, messages: ['🔴 emprise 3000 m² SUPÉRIEURE au terrain 2887 m² : impossible, à revoir'] };
    const html = renderToStaticMarkup(h(BandeauVraisemblance, { aireM2: 3000, v }));
    expect(html).toContain(fmtM2(3000));
    expect(html).toContain('SUPÉRIEURE au terrain');
  });

  it('ListeEmprises : étiquette « reconstitution » + surface + résidu ; vide → message', () => {
    expect(renderToStaticMarkup(h(ListeEmprises, { emprises: [] }))).toContain('Aucune emprise reconstituée');
    const html = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise()] }));
    expect(html).toContain('2D1');
    expect(html).toContain('reconstitution');   // 🔴 jamais présentée comme une mesure
    expect(html).toContain('100 m²');
    expect(html).toContain('résidu');
  });

  it('statutBatiment : tracée prime sur ignorée, sinon en attente', () => {
    const emprises = [emprise({ corpsId: 1 })];
    expect(statutBatiment(1, emprises, [])).toBe('tracee');
    expect(statutBatiment(2, emprises, [{ corpsId: 2, motif: 'x' }])).toBe('ignoree');
    expect(statutBatiment(3, emprises, [])).toBe('attente');
    expect(statutBatiment(1, emprises, [{ corpsId: 1, motif: 'x' }])).toBe('tracee'); // tracée l'emporte
  });

  it('BandeauProjection : bloquant nomme le manquant ; passant en vert', () => {
    const bloque = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }, { corpsId: 2, repere: '2D2' }], [1], []);
    const hb = renderToStaticMarkup(h(BandeauProjection, { verdict: bloque }));
    expect(hb).toContain('data-peut-valider="false"');
    expect(hb).toContain('1 emprise tracée · 1 en attente');
    expect(hb).toContain('2D2'); // le manquant nommé
    const passe = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }], [1], []);
    expect(renderToStaticMarkup(h(BandeauProjection, { verdict: passe }))).toContain('data-peut-valider="true"');
  });

  it('SchemaParcelleTrace : parcelle + emprise dessinées ; parcelle absente → motif', () => {
    expect(renderToStaticMarkup(h(SchemaParcelleTrace, { boite: null, parcelle: [], emprises: [], calageLambert: [] }))).toContain('Parcelle du permis absente');
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]], emprises: [emprise()], calageLambert: [{ x: 5, y: 5 }] }));
    expect(html).toContain('<svg');
    expect(html).toContain('data-emprise="1"'); // l'emprise reconstituée est tracée
    expect((html.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2); // parcelle + emprise
  });
});

describe('PROJ-3d — sélecteur de pièce : plans de masse proposés en tête, repli garanti', () => {
  const pieces: PiecePlan[] = [
    { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', propose: true, planches: [{ page: 1, echelle: '1:1000' }], confirme: true },
    { id: 60, nomFichier: 'PC2.2_Plan_de_masse_existant.pdf', propose: true, planches: [{ page: 1, echelle: null }], confirme: true },
    { id: 70, nomFichier: 'PC4_Notice.pdf', propose: false },
    { id: 71, nomFichier: 'CERFA.pdf', propose: false },
  ];
  it('grouperPieces sépare proposées / autres', () => {
    const { proposees, autres } = grouperPieces(pieces);
    expect(proposees.map((p) => p.id)).toEqual([55, 60]);
    expect(autres.map((p) => p.id)).toEqual([70, 71]);
  });
  it('etiquettePiecePlan : nom + nombre de planches détectées', () => {
    expect(etiquettePiecePlan(pieces[0])).toBe('PC2.1_Plan_de_masse_projet.pdf — 1 planche');
    expect(etiquettePiecePlan(pieces[2])).toBe('PC4_Notice.pdf'); // pas de planche → nom seul
  });
  it('rend DEUX optgroups ; TOUTES les pièces restent présentes (repli)', () => {
    const html = renderToStaticMarkup(h(SelecteurPiecePlan, { pieces, pieceId: 55, onChoisir: () => {} }));
    expect(html).toContain('Plans de masse proposés');
    expect(html).toContain('Toutes les autres pièces');
    // le nombre de planches figure dans le libellé de la pièce proposée
    expect(html).toContain('1 planche');
    // aucune pièce n'est masquée : les 4 ids sont là
    for (const id of [55, 60, 70, 71]) expect(html).toContain(`value="${id}"`);
    // le plan de masse est bien AVANT la notice dans le markup (proposées en tête)
    expect(html.indexOf('value="55"')).toBeLessThan(html.indexOf('value="70"'));
  });
  it('liste vide → option « aucune pièce PDF »', () => {
    const html = renderToStaticMarkup(h(SelecteurPiecePlan, { pieces: [], pieceId: null, onChoisir: () => {} }));
    expect(html).toContain('aucune pièce PDF');
  });
});

describe('PROJ-3e — bande de plans : feuilleter (fonctions pures)', () => {
  const pieces: PiecePlan[] = [
    // pièce MULTI-PAGES (forme mesurée sur 07512025V0035) : cartouche exclu → 2 planches (pages 4 et 6)
    { id: 55, nomFichier: 'PC2_2D_PDM.pdf', propose: true, planches: [{ page: 4, echelle: '1:200' }, { page: 6, echelle: null }], confirme: true },
    // pièce proposée NON confirmée (texte illisible) → repli sur la page 1
    { id: 60, nomFichier: 'PC2.2_Plan_de_masse.pdf', propose: true, planches: [], confirme: false },
    { id: 70, nomFichier: 'PC4_Notice.pdf', propose: false },
  ];
  it('construireBandePlans : une entrée PAR PLANCHE (pièce multi-pages éclatée), repli page 1 si non confirmée', () => {
    const b = construireBandePlans(pieces);
    expect(b.map((p) => `${p.pieceId}:${p.page}`)).toEqual(['55:4', '55:6', '60:1']); // 2 planches de PC2 + repli page 1
    expect(b[0].confirme).toBe(true);
    expect(b[2].confirme).toBe(false);                     // pièce non confirmée → page 1
    expect(b.some((p) => p.pieceId === 70)).toBe(false);   // la notice (non proposée) n'est PAS dans la bande
  });
  it('navigation bornée : premier, suivant, précédent, un seul plan, liste vide', () => {
    expect(indexSuivant(0, 7)).toBe(1);
    expect(indexSuivant(6, 7)).toBe(6);                     // borne haute
    expect(indexPrecedent(0, 7)).toBe(0);                   // borne basse
    expect(indexPrecedent(3, 7)).toBe(2);
    expect(bornerIndex(5, 1)).toBe(0);                      // un seul plan
    expect(bornerIndex(0, 0)).toBe(0);                      // liste vide
  });
  it('libellePlan : nom + n° de page + échelle si présente', () => {
    expect(libellePlan({ pieceId: 1, page: 4, nomFichier: 'PC2.pdf', echelle: '1:500', confirme: true, famille: 'masse' })).toBe('PC2.pdf — page 4 · échelle 1:500');
    expect(libellePlan({ pieceId: 1, page: 2, nomFichier: 'PC2.pdf', echelle: null, confirme: true, famille: 'masse' })).toBe('PC2.pdf — page 2');
  });
  it('travailEnCours : un calage OU un tracé commencé ⇒ confirmation requise', () => {
    expect(travailEnCours(0, 0)).toBe(false);
    expect(travailEnCours(1, 0)).toBe(true);   // un point de calage posé
    expect(travailEnCours(0, 2)).toBe(true);   // un tracé commencé
  });
  it('BandePlans : indicateur « plan i sur n », bornes désactivées, bande vide → repli', () => {
    const bande = construireBandePlans(pieces);
    const h0 = renderToStaticMarkup(h(BandePlans, { bande, index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(h0).toContain('plan 1 sur 3'); // 2 planches de PC2 (multi-pages) + 1 repli
    expect(h0).toMatch(/‹ précédent<\/button>/);           // rendu
    // au premier plan, « précédent » est désactivé
    expect(h0).toMatch(/disabled[^>]*aria-label="Plan précédent"|aria-label="Plan précédent"[^>]*disabled/);
    const vide = renderToStaticMarkup(h(BandePlans, { bande: [], index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(vide).toContain('voir toutes les pièces du dossier');
  });
});

describe('PROJ-3f ① — navigation PIÈCE LIBRE (feuilleter les pages d’une pièce, distincte du best-of)', () => {
  it('bornerPage : bornes [1 ; nbPages], nbPages ramené à ≥ 1', () => {
    expect(bornerPage(0, 8)).toBe(1);   // borne basse
    expect(bornerPage(9, 8)).toBe(8);   // borne haute
    expect(bornerPage(4, 8)).toBe(4);
    expect(bornerPage(1, 1)).toBe(1);   // une seule page
    expect(bornerPage(3, 0)).toBe(1);   // nbPages inconnu → 1
  });
  it('NavPieceLibre : « Pièce : <nom> », « page i sur n », retour best-of, bornes désactivées', () => {
    const h1 = renderToStaticMarkup(h(NavPieceLibre, { nomFichier: 'PC3_2D_PDM.pdf', page: 1, nbPages: 18, onPagePrecedente: () => {}, onPageSuivante: () => {}, onRetourBestOf: () => {} }));
    expect(h1).toContain('Pièce : PC3_2D_PDM.pdf');
    expect(h1).toContain('page 1 sur 18');
    expect(h1).toContain('revenir au best-of');
    // page 1 → « page précédente » désactivée, « suivante » active
    expect(h1).toMatch(/disabled[^>]*aria-label="Page précédente"|aria-label="Page précédente"[^>]*disabled/);
    expect(h1).not.toMatch(/disabled[^>]*aria-label="Page suivante"|aria-label="Page suivante"[^>]*disabled/);
    // dernière page → « suivante » désactivée
    const hN = renderToStaticMarkup(h(NavPieceLibre, { nomFichier: 'X.pdf', page: 18, nbPages: 18, onPagePrecedente: () => {}, onPageSuivante: () => {}, onRetourBestOf: () => {} }));
    expect(hN).toMatch(/disabled[^>]*aria-label="Page suivante"|aria-label="Page suivante"[^>]*disabled/);
  });
});

describe('PROJ-3h — options de visibilité du schéma de projection (BD TOPO + en projet)', () => {
  const polys = [
    { anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], etat: 'En projet' },
    { anneau: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], etat: 'En service' },
    { anneau: [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 8 }], etat: 'En construction' },
  ];
  it('polygonesVisibles : toutes les combinaisons (y compris tout éteint)', () => {
    expect(polygonesVisibles(polys, { existant: true, enProjet: true }).length).toBe(3);
    expect(polygonesVisibles(polys, { existant: false, enProjet: true }).map((p) => p.etat)).toEqual(['En projet']); // seul « En projet »
    expect(polygonesVisibles(polys, { existant: true, enProjet: false }).map((p) => p.etat)).toEqual(['En service', 'En construction']); // « En construction » compte comme existant côté visibilité
    expect(polygonesVisibles(polys, { existant: false, enProjet: false }).length).toBe(0); // tout éteint → rien
  });
  it('SchemaParcelleTrace : dessine « en projet » (distinct) + existant + emprise, croisillon si futurBati', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const filtres: FiltresSchema = { existant: true, enProjet: true, futurBati: true, emprises: true };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }]], emprises: [emprise()], polygones: polys, filtres, calageLambert: [] }));
    expect(html).toContain('data-en-projet="true"');       // le polygone « en projet » est distinct (attribut)
    expect(html).toContain('data-emprise="1"');             // l'emprise reconstituée reste dessinée
    expect(html).toContain('url(#hachure-projection)');     // croisillon « futur bâti » présent (futurBati=true)
  });
  it('SchemaParcelleTrace : filtres éteints masquent les catégories concernées', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const filtres: FiltresSchema = { existant: false, enProjet: false, futurBati: false, emprises: false };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]], emprises: [emprise()], polygones: polys, filtres, calageLambert: [] }));
    expect(html).not.toContain('data-en-projet');           // en projet masqué
    expect(html).not.toContain('data-emprise');             // emprise masquée
    expect(html).not.toContain('url(#hachure-projection)'); // croisillon masqué
  });
  it('OptionsVisibiliteSchema : les 4 interrupteurs (libellés d’origine) + le filtre dédié « en projet »', () => {
    const html = renderToStaticMarkup(h(OptionsVisibiliteSchema, { filtres: FILTRES_SCHEMA_DEFAUT, onFiltres: () => {}, nbEnProjet: 4, nbExistant: 12 }));
    expect(html).toContain('Afficher le bâti existant (BD TOPO)');
    expect(html).toContain('Afficher les polygones en projet');
    expect(html).toContain('Signaler le futur bâti (en projet)'); // libellé REPRODUIT du schéma d’origine
    expect(html).toContain('Afficher la projection');             // libellé REPRODUIT du schéma d’origine
    expect(html).toContain('(4)');                                 // compteur « en projet »
  });
  it('LegendeSchemaProjection : nomme les TROIS catégories (reconstitution jamais une mesure)', () => {
    const html = renderToStaticMarkup(h(LegendeSchemaProjection, {}));
    expect(html).toContain('Bâti existant (BD TOPO)');
    expect(html).toContain('En projet (donnée IGN)');
    expect(html).toContain('reconstitution — jamais une mesure');
  });
});

describe('PROJ-3g — trois familles dans la bande + verrou de traçage', () => {
  it('construireBandePlans porte la FAMILLE de chaque entrée (masse / étage / coupe)', () => {
    const b = construireBandePlans([
      { id: 1, nomFichier: 'PC2.pdf', propose: true, famille: 'masse', planches: [{ page: 1, echelle: null }], confirme: true },
      { id: 2, nomFichier: 'ANNEXE_6_Plan_du_R_1.pdf', propose: true, famille: 'etage', planches: [{ page: 1, echelle: null }], confirme: true },
      { id: 3, nomFichier: 'PC3.1_Coupe_AA.pdf', propose: true, famille: 'coupe', planches: [{ page: 1, echelle: null }], confirme: true },
    ]);
    expect(b.map((p) => p.famille)).toEqual(['masse', 'etage', 'coupe']);
  });
  it('BandePlans affiche le MOT de la famille (pas la couleur seule)', () => {
    const b = construireBandePlans([{ id: 3, nomFichier: 'PC3.1_Coupe_AA.pdf', propose: true, famille: 'coupe', planches: [{ page: 1, echelle: null }], confirme: true }]);
    const html = renderToStaticMarkup(h(BandePlans, { bande: b, index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(html.toLowerCase()).toContain('coupe / élévation');
  });
  it('libelleFamille : le mot de chaque famille', () => {
    expect(libelleFamille('masse')).toBe('plan de masse');
    expect(libelleFamille('etage')).toBe('plan d’étage');
    expect(libelleFamille('coupe')).toBe('coupe / élévation');
  });
  it('messageVerrou : null sur masse (traçable), message EXPLICITE sinon', () => {
    expect(messageVerrou('masse')).toBeNull();
    expect(messageVerrou('coupe')).toMatch(/coupe.*on ne peut y tracer|vue du dessus/);
    expect(messageVerrou('etage')).toMatch(/plan d’étage|vue du dessus/);
    expect(messageVerrou(null)).toMatch(/vue du dessus/);
  });
});

describe('PROJ-3f ① — le best-of est un MODE nommé par les mots (pas la couleur)', () => {
  it('BandePlans affiche l’en-tête « Best-of des plans proposés »', () => {
    const bande = construireBandePlans([{ id: 1, nomFichier: 'PC2.pdf', propose: true, planches: [{ page: 1, echelle: null }], confirme: true }]);
    const html = renderToStaticMarkup(h(BandePlans, { bande, index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(html).toContain('Best-of des plans proposés');
  });
});

describe('PROJ-3b-fix — affichageTrace : « aucun bâtiment » n’est PAS un échec de chargement (pur)', () => {
  it('chargement en cours → jamais « 0 bâtiment »', () => {
    expect(affichageTrace('chargement', 0)).toBe('chargement');
    expect(affichageTrace('chargement', 3)).toBe('chargement');
  });
  it('échec → « indisponible », quel que soit le compte (jamais « aucun-batiment »)', () => {
    expect(affichageTrace('erreur', 0)).toBe('indisponible');
    expect(affichageTrace('erreur', 2)).toBe('indisponible');
  });
  it('succès + liste vide → « aucun-batiment » (le SEUL cas légitime)', () => {
    expect(affichageTrace('ok', 0)).toBe('aucun-batiment');
  });
  it('succès + liste non vide → « pret »', () => {
    expect(affichageTrace('ok', 2)).toBe('pret');
  });
});
