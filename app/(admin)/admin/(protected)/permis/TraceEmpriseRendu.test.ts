import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, fmtM2, affichageTrace, SelecteurPiecePlan, grouperPieces, etiquettePiecePlan, construireBandePlans, bornerIndex, cibleBestOf, indexSuivant, indexPrecedent, libellePlan, travailEnCours, BandePlans, bornerPage, NavPieceLibre, libelleFamille, messageVerrou, noteFamille, polygonesVisibles, OptionsVisibiliteSchema, LegendeSchemaProjection, SelectionPolygonesProjet, attribuerReperes, RotationSchema, ZoomPdf, guidageTrace, GuidageTraceBox, RepereQualiteCalage, AdoptionGroupes, ConfirmationAdoption, libelleProvenance, empriseRetouchable, FILTRES_SCHEMA_DEFAUT, StatutPolygonesExistants, couleurStatutPolygone, polygonesConfigProjetee, MiniConfigProjetee, CaseConfigOfficielle, BlocProjetRepliable, BlocExistantsRepliable, aireAnneauM2, polygonesProjetParBatiment, type FiltresSchema, type PiecePlan, type Plan } from './TraceEmpriseRendu';
import { statutCourantParCleabs, type LigneStatutPolygone } from '../../../../lib/permis/polygoneStatut';
import type { VerdictCalage, VerdictVraisemblance, Boite } from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments } from '../../../../lib/permis/projectionBatiments';

const RING = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const emprise = (over: Partial<EmpriseReconstruite> = {}): EmpriseReconstruite => ({
  id: 1, dossierId: 11434, corpsId: 1, libelle: '2D1', anneau: RING, anneaux: [RING],
  surfaceM2: 100, pieceId: 55, page: 2, calage: null, residuM: 0.3, provenance: 'trace_manuel', creeLe: null, ...over,
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

  it('ListeEmprises : ORIGINE lisible (tracé à la main vs IGN), surface, résidu (tracé seulement) ; vide → message', () => {
    expect(renderToStaticMarkup(h(ListeEmprises, { emprises: [] }))).toContain('Aucune emprise pour ce bâtiment');
    // tracé manuel : « tracé à la main » + résidu
    const manuel = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise()] }));
    expect(manuel).toContain('2D1');
    expect(manuel).toContain('tracé à la main');
    expect(manuel).toContain('100 m²');
    expect(manuel).toContain('résidu');
    // PROJ-3q — adoptée IGN : « issue de l’IGN », JAMAIS « reconstitution », pas de résidu
    const ign = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise({ provenance: 'ign_adopte' })] }));
    expect(ign).toContain('issue de l’IGN');
    expect(ign).toContain('donnée source IGN');
    expect(ign).not.toContain('reconstitution');
    expect(ign).not.toContain('résidu');
  });

  it('statutBatiment : tracée prime sur ignorée, sinon en attente', () => {
    const emprises = [emprise({ corpsId: 1 })];
    expect(statutBatiment(1, emprises, [])).toBe('tracee');
    expect(statutBatiment(2, emprises, [{ corpsId: 2, motif: 'x' }])).toBe('ignoree');
    expect(statutBatiment(3, emprises, [])).toBe('attente');
    expect(statutBatiment(1, emprises, [{ corpsId: 1, motif: 'x' }])).toBe('tracee'); // tracée l'emporte
  });

  it('BandeauProjection : bloquant nomme le manquant ; passant en vert', () => {
    const bloque = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }, { corpsId: 2, repere: '2D2' }], [{ corpsId: 1, provenance: 'trace_manuel' }], []);
    const hb = renderToStaticMarkup(h(BandeauProjection, { verdict: bloque }));
    expect(hb).toContain('data-peut-valider="false"');
    expect(hb).toContain('1 emprise (1 tracée à la main) · 1 en attente');
    expect(hb).toContain('2D2'); // le manquant nommé
    const passe = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }], [{ corpsId: 1, provenance: 'trace_manuel' }], []);
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

  it('SUITE — construireBandePlans porte les NIVEAUX d’une planche d’étage ; BandePlans les affiche', () => {
    const b = construireBandePlans([{ id: 80, nomFichier: 'plan_etage.pdf', propose: true, famille: 'etage', planches: [{ page: 1, echelle: '1:100', famille: 'etage', tracable: true }], confirme: true, niveaux: ['R+1', 'R+2', 'R+3', 'R+4'] }]);
    expect(b[0].niveaux).toEqual(['R+1', 'R+2', 'R+3', 'R+4']);
    const html = renderToStaticMarkup(h(BandePlans, { bande: b, index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(html).toContain('plan d’étage');
    expect(html).toContain('niveaux : R+1, R+2, R+3, R+4'); // une planche multi-niveaux entre UNE fois, mais on SAIT ses niveaux
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
    expect(libellePlan({ page: 4, nomFichier: 'PC2.pdf', echelle: '1:500' })).toBe('PC2.pdf — page 4 · échelle 1:500');
    expect(libellePlan({ page: 2, nomFichier: 'PC2.pdf', echelle: null })).toBe('PC2.pdf — page 2');
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

describe('LOT PROV-1 (point 1) — cibleBestOf : « revenir au best-of » n’est jamais un bouton mort', () => {
  const plan = (pieceId: number, page: number): Plan => ({ pieceId, page, nomFichier: `p${pieceId}.pdf`, echelle: null, confirme: true, famille: 'masse', tracable: true, ambigu: false });

  it('bande VIDE (aucun plan proposé, ex. 531) → repasse quand même en best-of, sans plan (bouton VIVANT)', () => {
    expect(cibleBestOf([], 0)).toEqual({ nav: 'bestof', plan: null });
    // 🔑 le régression : avant, l’appelant sortait tôt sur bande vide → nav restait 'piece' → on restait sur la pièce courante.
  });
  it('bande NON vide → repasse en best-of ET restaure le plan `cible` (pièce + page)', () => {
    const bande = [plan(10, 1), plan(20, 3)];
    expect(cibleBestOf(bande, 1)).toEqual({ nav: 'bestof', plan: { index: 1, pieceId: 20, page: 3 } });
  });
  it('index hors bornes → borné dans la bande (jamais un accès undefined)', () => {
    const bande = [plan(10, 1)];
    expect(cibleBestOf(bande, 9)).toEqual({ nav: 'bestof', plan: { index: 0, pieceId: 10, page: 1 } });
  });
});

describe('PROJ-3h/3i — options, repères, sélection des polygones « en projet »', () => {
  const polys = [
    { cleabs: 'A1', anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], etat: 'En projet' },
    { cleabs: 'B2', anneau: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], etat: 'En service' },
    { cleabs: 'C3', anneau: [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 8 }], etat: 'En construction' },
  ];
  it('⓪ polygonesVisibles : UN filtre « futur bâti » (En projet + En construction) vs existant ; tout éteint → rien', () => {
    expect(polygonesVisibles(polys, { existant: true, futur: true }).length).toBe(3);
    expect(polygonesVisibles(polys, { existant: false, futur: true }).map((p) => p.etat)).toEqual(['En projet', 'En construction']);
    expect(polygonesVisibles(polys, { existant: true, futur: false }).map((p) => p.etat)).toEqual(['En service']);
    expect(polygonesVisibles(polys, { existant: false, futur: false }).length).toBe(0);
  });
  it('① attribuerReperes : A, B, C… dans l’ordre reçu (déterministe serveur)', () => {
    expect(attribuerReperes(polys).map((p) => p.repere)).toEqual(['A', 'B', 'C']);
  });
  it('SchemaParcelleTrace : futur bâti distinct, emprise, repères, écarté grisé, PLUS de croisillon (⓪)', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const filtres: FiltresSchema = { existant: true, futur: true, reperes: true, emprises: true };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }]], emprises: [emprise()], polygones: attribuerReperes(polys), filtres, ecartes: ['A1'], calageLambert: [] }));
    expect(html).toContain('data-futur="true"');
    expect(html).toContain('data-emprise="1"');
    expect(html).toContain('data-repere="A"');
    expect(html).toContain('data-ecarte');                 // A1 écarté → grisé
    expect(html).not.toContain('url(#hachure-projection)'); // ⓪ croisillon supprimé
  });
  it('SchemaParcelleTrace : tout éteint masque tout', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const filtres: FiltresSchema = { existant: false, futur: false, reperes: false, emprises: false };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]], emprises: [emprise()], polygones: attribuerReperes(polys), filtres, ecartes: [], calageLambert: [] }));
    expect(html).not.toContain('data-futur');
    expect(html).not.toContain('data-emprise');
    expect(html).not.toContain('data-repere');
  });
  it('OptionsVisibiliteSchema : UN filtre futur bâti (⓪) + repères (①) + libellés d’origine ; plus de doublon', () => {
    const html = renderToStaticMarkup(h(OptionsVisibiliteSchema, { filtres: FILTRES_SCHEMA_DEFAUT, onFiltres: () => {}, nbFutur: 4, nbExistant: 12 }));
    expect(html).toContain('Afficher le bâti existant (BD TOPO)');
    expect(html).toContain('Afficher les polygones en projet (futur bâti)');
    expect(html).toContain('Afficher les repères (A, B, C…)'); // ① repris du Rattachement
    expect(html).toContain('Afficher la projection');
    expect(html).not.toContain('Signaler le futur bâti');      // ⓪ toggle en doublon supprimé
    expect(html).toContain('(4)');
  });
  it('③ SelectionPolygonesProjet : seuls les futurs bâtis, par repère, tout retenu par défaut', () => {
    const html = renderToStaticMarkup(h(SelectionPolygonesProjet, { polygones: attribuerReperes(polys), ecartes: ['A1'], onToggle: () => {} }));
    expect(html).toContain('Polygone <strong>A</strong>'); // En projet
    expect(html).toContain('Polygone <strong>C</strong>'); // En construction (futur bâti)
    expect(html).not.toContain('Polygone <strong>B</strong>'); // existant → pas listé
    expect(html).toContain('— écarté');                        // A1 écarté
  });
  it('③ SelectionPolygonesProjet : aucun futur bâti → rien', () => {
    const html = renderToStaticMarkup(h(SelectionPolygonesProjet, { polygones: attribuerReperes([{ cleabs: 'X', anneau: [], etat: 'En service' }]), ecartes: [], onToggle: () => {} }));
    expect(html).toBe('');
  });
  it('④ LegendeSchemaProjection : 3 catégories + picto « i » (explication)', () => {
    const html = renderToStaticMarkup(h(LegendeSchemaProjection, {}));
    expect(html).toContain('Bâti existant (BD TOPO)');
    expect(html).toContain('En projet (donnée IGN)');
    expect(html).toContain('reconstitution — jamais une mesure');
    expect(html).toContain('Que veut dire chaque catégorie');
    expect(html).toContain('pas encore construits');
    // RATT-3 — deux entrées de DÉCISION (jamais des faits) : préservé (vert) / détruit (orange).
    expect(html).toContain('Décidé « préservé » (prévision)');
    expect(html).toContain('Décidé « détruit » (prévision)');
    expect(html).toContain('sans décision reste gris');
  });
});

describe('RATT-3 — couleur de statut sur le schéma + configuration projetée', () => {
  // Une couleur ne traduit QUE l'existence d'une décision en base ; une prévision non enregistrée reste grise.
  it('couleurStatutPolygone : preserve → vert, detruit → orange, revoque/absent → aucune couleur', () => {
    expect(couleurStatutPolygone('preserve')?.stroke).toBe('var(--color-svv-green-ink)');
    expect(couleurStatutPolygone('detruit')?.stroke).toBe('#c26a00');
    expect(couleurStatutPolygone(null)).toBeNull();       // 'revoque' → statut courant null → gris
    expect(couleurStatutPolygone(undefined)).toBeNull();  // aucune ligne de statut → gris
  });

  it('RATT-6 — couleurStatutPolygone(« mixte ») : gris (survit, visible) + tireté, JAMAIS l’orange du détruit', () => {
    const m = couleurStatutPolygone('mixte');
    expect(m?.fill).toBe('rgba(0,0,0,.06)');       // gris d'origine → le bâtiment reste visible
    expect(m?.dash).toBe('3 2');                    // trait tireté distinctif
    expect(m?.stroke).not.toBe('#c26a00');          // pas l'orange du détruit
  });

  // Registre append-only → statut COURANT par cleabs (même chemin que la Vue).
  const statuts = statutCourantParCleabs([
    { cleabs: 'B2', statut: 'detruit', etatBdtopoAuMoment: 'En service', decidePar: 'a', decideLe: '2026-08-01T10:00:00.000Z', origine: 'saisie' },
    { cleabs: 'D4', statut: 'preserve', etatBdtopoAuMoment: 'En service', decidePar: 'a', decideLe: '2026-08-01T10:00:00.000Z', origine: 'saisie' },
    { cleabs: 'E5', statut: 'detruit', etatBdtopoAuMoment: 'En service', decidePar: 'a', decideLe: '2026-08-01T10:00:00.000Z', origine: 'auto_recouvrement' },
    { cleabs: 'E5', statut: 'revoque', etatBdtopoAuMoment: 'En service', decidePar: 'a', decideLe: '2026-08-02T10:00:00.000Z', origine: 'auto_revocation' },
  ] as LigneStatutPolygone[]);

  it('polygonesConfigProjetee : les « détruit » sont exclus ; préservé, révoqué, sans statut et futur bâti restent', () => {
    const polys = attribuerReperes([
      { cleabs: 'A1', anneau: [{ x: 0, y: 0 }], etat: 'En projet' },    // futur bâti → reste
      { cleabs: 'B2', anneau: [{ x: 0, y: 0 }], etat: 'En service' },   // détruit → RETIRÉ
      { cleabs: 'D4', anneau: [{ x: 0, y: 0 }], etat: 'En service' },   // préservé → reste
      { cleabs: 'E5', anneau: [{ x: 0, y: 0 }], etat: 'En service' },   // détruit puis révoqué → reste
      { cleabs: 'F6', anneau: [{ x: 0, y: 0 }], etat: 'En service' },   // sans statut → reste
    ]);
    expect(polygonesConfigProjetee(polys, statuts).map((p) => p.cleabs)).toEqual(['A1', 'D4', 'E5', 'F6']);
  });

  it('RATT-6 — polygonesConfigProjetee GARDE un « mixte » (il survit en partie) ; seul « detruit » est retiré', () => {
    const st = statutCourantParCleabs([
      { cleabs: 'M', statut: 'mixte', etatBdtopoAuMoment: 'En service', decidePar: 'auto', decideLe: '2026-08-01T10:00:00.000Z', origine: 'auto_mixte' },
      { cleabs: 'X', statut: 'detruit', etatBdtopoAuMoment: 'En service', decidePar: 'auto', decideLe: '2026-08-01T10:00:00.000Z', origine: 'auto_recouvrement' },
    ] as LigneStatutPolygone[]);
    const polys = attribuerReperes([
      { cleabs: 'M', anneau: [{ x: 0, y: 0 }], etat: 'En service' },
      { cleabs: 'X', anneau: [{ x: 0, y: 0 }], etat: 'En service' },
    ]);
    expect(polygonesConfigProjetee(polys, st).map((p) => p.cleabs)).toEqual(['M']); // M (mixte) reste, X (detruit) part
  });

  it('RATT-6 — SchemaParcelleTrace : un existant « mixte » est tireté (strokeDasharray) et non orange', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const st = statutCourantParCleabs([
      { cleabs: 'M', statut: 'mixte', etatBdtopoAuMoment: 'En service', decidePar: 'auto', decideLe: '2026-08-01T10:00:00.000Z', origine: 'auto_mixte' },
    ] as LigneStatutPolygone[]);
    const polys = attribuerReperes([{ cleabs: 'M', anneau: [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }], etat: 'En service' }]);
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]], emprises: [], polygones: polys, calageLambert: [], statuts: st }));
    expect(html).toContain('data-statut="mixte"');
    expect(html).toContain('stroke-dasharray="3 2"'); // tireté distinctif
    expect(html).not.toContain('#c26a00');             // jamais l'orange du détruit
  });

  it('SchemaParcelleTrace : colore l’existant selon la décision (preserve vert / detruit orange) ; futur bâti jamais coloré', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const polys = attribuerReperes([
      { cleabs: 'A1', anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], etat: 'En projet' },   // recouvrable mais FUTUR → jamais coloré
      { cleabs: 'B2', anneau: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], etat: 'En service' },
      { cleabs: 'D4', anneau: [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }], etat: 'En service' },
    ]);
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]], emprises: [], polygones: polys, calageLambert: [], statuts }));
    expect(html).toContain('data-statut="detruit"');                 // B2 décidé détruit → orange
    expect(html).toContain('data-statut="preserve"');                // D4 décidé préservé → vert
    expect(html).toContain('#c26a00');                               // trait orange présent
    expect(html).not.toContain('data-futur="true" data-statut');     // le futur bâti (A1) n'est jamais coloré par un statut
  });

  it('SchemaParcelleTrace : sans map de statuts, l’existant reste gris (aucune data-statut)', () => {
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 30, minY: 0, maxY: 30 } };
    const polys = attribuerReperes([{ cleabs: 'B2', anneau: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], etat: 'En service' }]);
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]], emprises: [], polygones: polys, calageLambert: [] }));
    expect(html).not.toContain('data-statut');
  });

  it('MiniConfigProjetee : MÊME viewBox que l’origine, détruit ABSENT, gris (aucun vert/orange), emprise en rouge', () => {
    // AFF-2 — la projetée est dessinée dans le MÊME schéma (transform de l'origine) → même viewBox « 0 0 largeur hauteur ».
    const schema = {
      largeur: 320, hauteur: 240, empreintePath: 'M0,0 L30,0 L30,30 Z', motif: null,
      transform: { minX: 0, minY: 0, scale: 1, padX: 0, padY: 0, hauteur: 240 },
      polygones: [
        { repere: 'A', cleabs: 'B2', path: 'M20,20 L30,20 L30,30 Z', cx: 25, cy: 25, horsEmpreinte: false }, // détruit → retiré
        { repere: 'B', cleabs: 'D4', path: 'M2,2 L8,2 L8,8 Z', cx: 5, cy: 5, horsEmpreinte: false },          // reste, GRIS
      ],
    };
    const html = renderToStaticMarkup(h(MiniConfigProjetee, { schema, statuts, emprises: [{ anneau: [[0, 0], [5, 0], [5, 5]] as [number, number][] }] }));
    expect(html).toContain('Configuration projetée');
    expect(html).toContain('viewBox="0 0 320 240"');  // MÊME cadrage que « Configuration d'origine » (SchemaEmpreinteSvg)
    expect(html).toContain('data-repere="B"');        // D4 dessiné
    expect(html).not.toContain('data-repere="A"');    // B2 (détruit) retiré
    expect(html).not.toContain('#c26a00');            // pas d'orange
    expect(html).not.toContain('var(--color-svv-green-ink)'); // pas de vert
    expect(html).toContain('data-emprise-projetee="0"'); // emprise projetée dessinée (rouge)
  });

  it('MiniConfigProjetee : schéma dégénéré (motif / pas de transform) → message, jamais un crash', () => {
    const schema = { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: 'parcelle absente', transform: null };
    const html = renderToStaticMarkup(h(MiniConfigProjetee, { schema, statuts: new Map(), emprises: [] }));
    expect(html).toContain('Configuration projetée');
    expect(html).toContain('parcelle absente');
  });

  it('CaseConfigOfficielle : grisée, non cliquable, mention d’attente + millésime (ou « non renseigné »)', () => {
    const avec = renderToStaticMarkup(h(CaseConfigOfficielle, { millesime: '2024' }));
    expect(avec).toContain('Configuration officielle');
    expect(avec).toContain('en attente de la mise à jour par l’administration');
    expect(avec).toContain('BD TOPO courant : 2024');
    expect(avec).toContain('aria-disabled="true"');
    expect(renderToStaticMarkup(h(CaseConfigOfficielle, { millesime: null }))).toContain('non renseigné');
  });
});

describe('PROJ-3j — rotation du schéma (affichage seulement)', () => {
  it('RotationSchema : curseur, valeur d’angle visible, retour à 0', () => {
    const html = renderToStaticMarkup(h(RotationSchema, { angle: 37, onAngle: () => {} }));
    expect(html).toContain('type="range"');
    expect(html).toContain('37°');
    expect(html).toContain('Remettre à 0');
  });
  it('RotationSchema : « Remettre à 0 » désactivé à 0°', () => {
    const html = renderToStaticMarkup(h(RotationSchema, { angle: 0, onAngle: () => {} }));
    expect(html).toContain('0°');
    expect(html).toMatch(/disabled/);
  });
  it('ZoomPdf : niveau visible, « − » désactivé à 100 %, « Ajuster » désactivé à 100 %', () => {
    const h100 = renderToStaticMarkup(h(ZoomPdf, { zoom: 1, onDezoom: () => {}, onZoom: () => {}, onAjuster: () => {} }));
    expect(h100).toContain('100 %');
    expect(h100).toMatch(/disabled[^>]*aria-label="Dézoomer"|aria-label="Dézoomer"[^>]*disabled/);
    const h200 = renderToStaticMarkup(h(ZoomPdf, { zoom: 2, onDezoom: () => {}, onZoom: () => {}, onAjuster: () => {} }));
    expect(h200).toContain('200 %');
    expect(h200).toContain('Ajuster');
    expect(h200).not.toMatch(/disabled[^>]*aria-label="Dézoomer"/); // dézoom actif à 200 %
  });
  it('SchemaParcelleTrace : un angle produit un transform rotate autour du centre ; 0° = pas de rotation', () => {
    const boite: Boite = { largeur: 300, hauteur: 230, marge: 12, cadre: { minX: 0, maxX: 100, minY: 0, maxY: 80 } };
    const parcelle = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }]];
    expect(renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle, emprises: [], polygones: [], calageLambert: [], angle: 37 }))).toContain('rotate(37 150 115)');
    expect(renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle, emprises: [], polygones: [], calageLambert: [], angle: 0 }))).not.toContain('rotate(');
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
  it('libelleFamille : le mot de chaque famille (dont Cerfa, PROV-2 a)', () => {
    expect(libelleFamille('masse')).toBe('plan de masse');
    expect(libelleFamille('etage')).toBe('plan d’étage');
    expect(libelleFamille('coupe')).toBe('coupe / élévation');
    expect(libelleFamille('cerfa')).toBe('Cerfa (formulaire)');
  });
  it('messageVerrou (PROJ-3j / PROV-2 a) : null si traçable (masse OU étage) ; message pour coupe/façade ET Cerfa', () => {
    expect(messageVerrou('masse')).toBeNull();
    expect(messageVerrou('etage')).toBeNull();                 // ① étage traçable → aucun verrou
    expect(messageVerrou('coupe')).toMatch(/coupe ou une façade|vue en plan/);
    expect(messageVerrou('cerfa')).toMatch(/formulaire Cerfa|consulter/); // PROV-2 (a) : formulaire, jamais traçable
    expect(messageVerrou(null)).toMatch(/vue en plan/);
  });
  it('noteFamille (PROJ-3j) : rappel informatif sur « étage » (jamais un blocage), null ailleurs', () => {
    expect(noteFamille('etage')).toMatch(/rez-de-chaussée|retraits|porte-à-faux/);
    expect(noteFamille('masse')).toBeNull();
    expect(noteFamille('coupe')).toBeNull();
  });
  // PROJ-3m ① — une pièce PC3 (famille « coupe ») contient À LA FOIS des coupes et des plans de niveau : la traçabilité est PAR PAGE.
  //   La planche « plan du R01 » devient traçable (famille etage) SANS déverrouiller les vraies élévations (coupe/façade restent bloquées).
  it('construireBandePlans : traçabilité PAR PAGE d’une pièce PC3 (planche de niveau traçable, coupe verrouillée)', () => {
    const b = construireBandePlans([{
      id: 7, nomFichier: 'PC3_2D_PDM.pdf', propose: true, famille: 'coupe', confirme: true,
      planches: [
        { page: 1, echelle: '1:200', tracable: false, famille: 'coupe', ambigu: false },   // coupe → verrouillée
        { page: 5, echelle: '1:200', tracable: true, famille: 'etage', ambigu: false },     // « Plan du R01 » → traçable
        { page: 14, echelle: null, tracable: true, famille: 'coupe', ambigu: true },        // classement incertain → traçable + mention
      ],
    }]);
    expect(b.map((p) => ({ page: p.page, tracable: p.tracable, famille: p.famille, ambigu: p.ambigu }))).toEqual([
      { page: 1, tracable: false, famille: 'coupe', ambigu: false },
      { page: 5, tracable: true, famille: 'etage', ambigu: false },
      { page: 14, tracable: true, famille: 'coupe', ambigu: true },
    ]);
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

describe('PROJ-3m ② — guidage du geste de tracé (pur) : étape, quoi cliquer, combien restent, où', () => {
  it('calage, 0 point : dit de cliquer sur le PLAN et combien restent', () => {
    const g = guidageTrace('calage', 0, false, 0, true);
    expect(g.sur).toBe('plan');
    expect(g.titre).toContain('Étape 1');
    expect(g.titre).toContain('0/2');
    expect(g.instruction).toMatch(/PLAN/);
    expect(g.instruction).toMatch(/2 point/);
  });
  it('calage, point plan posé : bascule le guidage SUR LE SCHÉMA (le prochain clic va à droite)', () => {
    const g = guidageTrace('calage', 0, true, 0, true);
    expect(g.sur).toBe('schema');
    expect(g.instruction).toMatch(/schéma/);
  });
  it('calage, 2 paires : invite à passer au tracé (calage suffisant)', () => {
    const g = guidageTrace('calage', 2, false, 0, true);
    expect(g.sur).toBe('plan');
    expect(g.titre).toContain('✓');
    expect(g.instruction).toMatch(/Tracé/);
  });
  it('tracé, < 3 sommets : compte les sommets restants pour fermer', () => {
    const g = guidageTrace('trace', 2, false, 1, true);
    expect(g.titre).toContain('Étape 2');
    expect(g.instruction).toMatch(/encore 2/);
  });
  it('tracé, ≥ 3 sommets : contour fermé, dit comment enregistrer / revenir en arrière', () => {
    const g = guidageTrace('trace', 2, false, 4, true);
    expect(g.instruction).toMatch(/Enregistrer/);
    expect(g.instruction).toMatch(/Annuler dernier|Reprendre/);
  });
  it('vue non traçable : le guidage le DIT (pas de geste possible)', () => {
    const g = guidageTrace('trace', 0, false, 0, false);
    expect(g.instruction).toMatch(/pas une vue en plan|indisponible/i);
  });
  it('GuidageTraceBox rend le titre et l’instruction', () => {
    const html = renderToStaticMarkup(h(GuidageTraceBox, { g: guidageTrace('calage', 0, false, 0, true) }));
    expect(html).toContain('Étape 1');
    expect(html).toMatch(/PLAN/);
  });
});

describe('PROJ — RepereQualiteCalage : écart d’échelle (réutilisé) + débordement (serveur), repères jamais bloquants', () => {
  const base = { ecartEchelleRelatif: 0.015, ratioImplicite: 197, ratioDeclare: 200 };
  it('écart d’échelle affiché en % (implicite vs déclarée) — réutilise ecartEchelleRelatif du pavé de calage', () => {
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ...base, debordement: null, contourFerme: false, parcelleRattachee: true }));
    expect(html).toContain('1,5 %');
    expect(html).toContain('1:197');
    expect(html).toContain('1:200');
  });
  it('échelle déclarée ABSENTE → indicateur d’écart indisponible (aucune valeur inventée)', () => {
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ecartEchelleRelatif: null, ratioImplicite: 197, ratioDeclare: null, debordement: null, contourFerme: true, parcelleRattachee: true }));
    expect(html).toMatch(/non saisie|indisponible/);
  });
  it('CONTOUR NON FERMÉ → débordement annoncé comme disponible une fois le contour fermé', () => {
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ...base, debordement: null, contourFerme: false, parcelleRattachee: true }));
    expect(html).toMatch(/contour fermé/);
  });
  it('PAS DE PARCELLE rattachée → débordement indisponible, disponible une fois la parcelle rattachée', () => {
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ...base, debordement: null, contourFerme: true, parcelleRattachee: false }));
    expect(html).toMatch(/aucune parcelle rattachée/);
  });
  it('emprise ENTIÈREMENT dans la parcelle → « hors parcelle 0 % »', () => {
    const deb = { aireM2: 700, parcelleRattachee: true, aireHorsM2: 0, pctHors: 0, decalageLateralM: 0 };
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ...base, debordement: deb, contourFerme: true, parcelleRattachee: true }));
    expect(html).toMatch(/0\s*%/);
    expect(html).toMatch(/entièrement dans la parcelle/);
  });
  it('emprise DÉBORDANTE → % + m² + décalage, AVEC la mention « débordement peut être légitime » (jamais « faux »)', () => {
    const deb = { aireM2: 709, parcelleRattachee: true, aireHorsM2: 49.6, pctHors: 6.99, decalageLateralM: 0.82 };
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ...base, debordement: deb, contourFerme: true, parcelleRattachee: true }));
    expect(html).toContain('7,0 %');            // arrondi d'affichage seulement
    expect(html).toMatch(/m²/);
    expect(html).toMatch(/décalage latéral/);
    expect(html).toMatch(/légitime/);           // porte-à-faux / balcon / une des parcelles
    expect(html).toMatch(/reconstitution/);     // jamais « mesure »
    expect(html).not.toMatch(/erroné|erreur|incorrect/i); // jamais un verdict de faute (« porte-à-faux » reste un terme légitime)
  });
});

describe('PROJ-3q — adoption IGN : aperçu, provenance, repère « qualité » adapté', () => {
  it('libelleProvenance : IGN vs tracé (jamais « reconstitution » pour une donnée IGN)', () => {
    expect(libelleProvenance('ign_adopte')).toBe('issue de l’IGN');
    expect(libelleProvenance('ign_retouche')).toBe('IGN retouchée à la main');
    expect(libelleProvenance('trace_manuel')).toBe('tracé à la main');
  });
  const BATS = [{ corpsId: 3, repere: '2D1' }, { corpsId: 5, repere: '2D2' }];
  // repères = mêmes noms que la liste des polygones et le schéma (C, D, I) ; jamais « Groupe 1/2/3 ».
  const REP = { B1: 'C', B2: 'D', B3: 'I' };
  const G = [
    { cleabs: ['B1', 'B2'], surfaceM2: 320, polygones: [{ cleabs: 'B1', surfaceM2: 200 }, { cleabs: 'B2', surfaceM2: 120 }] }, // groupe MULTI-polygones (C + D)
    { cleabs: ['B3'], surfaceM2: 90, polygones: [{ cleabs: 'B3', surfaceM2: 90 }] },                                          // groupe d'un seul (I)
  ];
  const props = (over: Record<string, unknown>) => ({ groupes: G, batiments: BATS, reperes: REP, affectation: { B1: 3, B2: 3, B3: 3 }, scindes: [] as number[], onAffecter: () => {}, onScinder: () => {}, onRegrouper: () => {}, onAdopter: () => {}, onReinitialiser: () => {}, ...over });

  // groupes tout DISJOINTS (cas courant) : deux lignes d'un seul polygone chacune → pour tester regroupement/feedback.
  const GSEP = [
    { cleabs: ['B1'], surfaceM2: 100, polygones: [{ cleabs: 'B1', surfaceM2: 100 }] }, // Polygone C
    { cleabs: ['B3'], surfaceM2: 90, polygones: [{ cleabs: 'B3', surfaceM2: 90 }] },   // Polygone I
  ];
  it('AdoptionGroupes : 0 groupe → rien ; lignes NOMMÉES par les polygones (jamais « Groupe 1/2/3 »)', () => {
    expect(renderToStaticMarkup(h(AdoptionGroupes, props({ groupes: [] })))).toBe('');
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({})));
    expect(html).toContain('320 m²');
    expect(html).not.toMatch(/Groupe\s*\d/);                        // plus de numérotation
    expect(html).toContain('Polygone I');                          // groupe d'un seul → « Polygone I »
    expect(html).toContain('2D1'); expect(html).toContain('2D2');   // sélecteur : bâtiments déclarés, en toutes lettres
    expect(html).toMatch(/Revenir à la proposition automatique/);
  });
  // PROJ-3t (A) — l'intro NOMME les deux gestes manuels, en français simple (pas de jargon).
  it('AdoptionGroupes : l’intro nomme « rattacher ensemble » et « Séparer » (aucun jargon)', () => {
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({})));
    expect(html).toMatch(/même bâtiment à plusieurs polygones pour les rattacher ensemble/);
    expect(html).toMatch(/« Séparer » les détache/);
    expect(html).not.toMatch(/composante connexe|groupement/i);
  });
  // PROJ-3t (C) — feedback contextuel : ≥ 2 polygones sur le MÊME bâtiment → retour affiché ; un seul par bâtiment → rien.
  it('AdoptionGroupes : deux polygones sur le MÊME bâtiment → « Rattaché au bâtiment … avec Polygone … »', () => {
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({ groupes: GSEP, affectation: { B1: 3, B3: 3 } })));
    expect(html).toContain('data-regroupe="true"');
    expect(html).toMatch(/Rattaché au 2D1 avec Polygone I/);   // ligne C : rattachée avec I
    expect(html).toMatch(/Rattaché au 2D1 avec Polygone C/);   // ligne I : rattachée avec C
  });
  it('AdoptionGroupes : un seul polygone par bâtiment → AUCUN feedback de regroupement', () => {
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({ groupes: GSEP, affectation: { B1: 3, B3: 5 } })));
    expect(html).not.toContain('data-regroupe');
    expect(html).not.toMatch(/Rattaché au .* avec Polygone/);
  });
  // PROJ-3r-fix — cas NON exercé par le dossier courant : un groupe qui contient PLUSIEURS polygones doit rester lisible.
  it('AdoptionGroupes : un groupe de PLUSIEURS polygones → « Polygones C + D » + « réunis en une seule emprise »', () => {
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({})));
    expect(html).toContain('Polygones C + D');                     // agrégation montrée avec les vrais noms
    expect(html).toMatch(/réunis en une seule emprise/);
    expect(html).toContain('Séparer les polygones');               // action de scission, seulement sur un groupe multi
  });
  it('AdoptionGroupes : groupe SÉPARÉ → un sélecteur par polygone (« Polygone C », « Polygone D ») + « regrouper »', () => {
    const html = renderToStaticMarkup(h(AdoptionGroupes, props({ affectation: { B1: 3, B2: 5, B3: 3 }, scindes: [0] })));
    expect(html).toContain('data-scinde="true"');
    expect(html).toContain('data-cleabs="B1"'); expect(html).toContain('data-cleabs="B2"');
    expect(html).toContain('Polygone C'); expect(html).toContain('Polygone D');
    expect(html).toContain('regrouper');
    expect((html.match(/<select/g) ?? []).length).toBe(3);         // 2 polygones séparés + 1 groupe → 3 sélecteurs
  });
  it('ConfirmationAdoption : null → rien ; répartition PAR BÂTIMENT (nombre + aires) + avertissement de remplacement', () => {
    expect(renderToStaticMarkup(h(ConfirmationAdoption, { apercu: null, remplaceExistant: false, onConfirmer: () => {}, onAnnuler: () => {} }))).toBe('');
    const ap = { batiments: [{ corpsId: 3, repere: '2D1', emprises: [{ surfaceM2: 2647 }, { surfaceM2: 721 }] }, { corpsId: 5, repere: '2D2', emprises: [{ surfaceM2: 115 }] }] };
    const html = renderToStaticMarkup(h(ConfirmationAdoption, { apercu: ap, remplaceExistant: true, onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(html).toContain('2D1'); expect(html).toContain('2 emprises');
    expect(html).toContain(fmtM2(2647)); expect(html).toContain(fmtM2(115));
    expect(html).toMatch(/3 emprises issues de l’IGN/);          // total
    expect(html).toMatch(/remplacées/);                          // exclusivité
    expect(html).not.toContain('reconstitution');
  });
  it('RepereQualiteCalage origineIgn : calage/échelle « sans objet » ; débordement conservé', () => {
    const deb = { aireM2: 410, parcelleRattachee: true, aireHorsM2: 20, pctHors: 4.9, decalageLateralM: 0.3 };
    const html = renderToStaticMarkup(h(RepereQualiteCalage, { ecartEchelleRelatif: null, ratioImplicite: null, ratioDeclare: null, debordement: deb, contourFerme: true, parcelleRattachee: true, origineIgn: true }));
    expect(html).toMatch(/sans objet pour une emprise issue de l’IGN/);
    expect(html).toMatch(/hors parcelle/);        // le débordement reste pertinent
    expect(html).toMatch(/issue de l’IGN/);        // jamais « reconstitution »
    expect(html).not.toContain('reconstitution');
  });
});

describe('PROJ-3s — retouche : liste (retoucher / multi-parties) + poignées sur le schéma', () => {
  const RING2 = [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 25, y: 30 }];
  it('empriseRetouchable : mono-polygone → true ; multi-parties → false', () => {
    expect(empriseRetouchable(emprise())).toBe(true);
    expect(empriseRetouchable(emprise({ anneaux: [RING, RING2] }))).toBe(false);
  });
  it('ListeEmprises : mono-polygone → bouton « retoucher » ; multi-parties → « retouche indisponible », pas de bouton', () => {
    const mono = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise()], onRetoucher: () => {}, onSupprimer: () => {} }));
    expect(mono).toContain('retoucher');
    const multi = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise({ anneaux: [RING, RING2] })], onRetoucher: () => {}, onSupprimer: () => {} }));
    expect(multi).toMatch(/retouche indisponible/);
    expect(multi).not.toContain('>retoucher<');
  });
  it('ListeEmprises : l’emprise EN RETOUCHE est marquée « en cours de retouche » et n’offre plus « retoucher »', () => {
    const html = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise()], onRetoucher: () => {}, empriseEnRetouche: 1 }));
    expect(html).toContain('data-en-retouche="true"');
    expect(html).toMatch(/en cours de retouche/);
    expect(html).not.toContain('>retoucher<');
  });
  it('SchemaParcelleTrace : en retouche → contour éditable + une poignée par sommet + points de bord ; sommet sélectionné marqué', () => {
    const boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]], emprises: [], calageLambert: [], retoucheAnneau: RING, sommetSelectionne: 1 }));
    expect(html).toContain('data-retouche="true"');
    expect((html.match(/data-sommet="/g) ?? []).length).toBe(RING.length);   // une poignée par sommet
    expect(html).toContain('data-bord="0"');                                  // point milieu de bord (insertion)
    expect(html).toContain('data-selectionne="true"');                        // sommet 1 sélectionné
  });
});

describe('RATT-1 (2) — StatutPolygonesExistants : source BD TOPO + ma décision côte à côte', () => {
  const poly = (cleabs: string, etat: string | null, repere: string) => ({ cleabs, anneau: [], etat, repere });
  const ligne = (cleabs: string, statut: LigneStatutPolygone['statut'], etat: string | null): LigneStatutPolygone => ({ cleabs, statut, etatBdtopoAuMoment: etat, decidePar: 'admin', decideLe: '2026-08-01T10:00:00Z', origine: 'saisie' });

  it('RATT-2 — liste TOUS les existants (recouverts COMPRIS ; seul « en projet » exclu) ; affiche BD TOPO ET ma décision ; source conservée si préservé prime', () => {
    const polygones = [poly('A', 'En service', 'A'), poly('B', 'En projet', 'B'), poly('C', 'En service', 'C')];
    const statuts = statutCourantParCleabs([ligne('A', 'preserve', 'En projet')]); // BD TOPO disait « En projet », j'ai décidé préservé
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones, recouverts: [{ cleabs: 'C', tauxPct: 100 }], statuts, onStatuer: () => {} }));
    expect(html).toContain('Polygone A');
    expect(html).not.toContain('Polygone B'); // « en projet » (futur bâti) exclu (relève de l'adoption)
    expect(html).toContain('Polygone C'); // RATT-2 — recouvert par l'emprise projetée : DÉSORMAIS listé (détruit par défaut, basculable)
    expect(html).toContain('recouvert à 100 % par l’emprise projetée — statut détruit par défaut'); // recouvrement TOTAL → détruit par défaut (RATT-5/6)
    expect(html).toContain('BD TOPO');
    expect(html).toContain('bâtiment préservé');
    expect(html).toContain('BD TOPO disait « En projet »'); // 🔴 la source reste lisible ; ma décision prime sans l'écraser
  });

  it('RATT-4 — un « en projet » RECOUVERT entre dans la liste (mention rouge + 2 boutons) ; un « en projet » NON recouvert reste exclu', () => {
    const polygones = [poly('B', 'En projet', 'B'), poly('D', 'En projet', 'D')];
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones, recouverts: [{ cleabs: 'D', tauxPct: 100 }], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toContain('Polygone D');                     // « en projet » RECOUVERT (total) → listé
    expect(html).not.toContain('Polygone B');                 // « en projet » NON recouvert → hors liste
    expect(html).toContain('recouvert à 100 % par l’emprise projetée — statut détruit par défaut'); // recouvrement total → détruit
    expect(html).toContain('bâtiment préservé');              // bouton actif (basculable)
    expect(html).toContain('bâtiment détruit');               // bouton actif
  });

  it('RATT-5 — un « En service » SOUS le seuil (absent de recouverts) reste listé SANS mention ; au-dessus, mention avec son taux', () => {
    const polygones = [poly('A', 'En service', 'A'), poly('B', 'En service', 'B')];
    // A est au-dessus du seuil (présent avec 55 %), B est sous le seuil (absent de recouverts, comme le renvoie le repo filtré).
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones, recouverts: [{ cleabs: 'A', tauxPct: 55 }], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toContain('Polygone A');
    expect(html).toContain('Polygone B');                     // existant sous le seuil → TOUJOURS listé (statuable à la main)
    expect(html).toContain('recouvert à 55 % par l’emprise projetée'); // A : mention avec son taux
    // B (sous le seuil) : une seule mention en tout, donc pas de seconde occurrence pour B.
    expect(html.match(/recouvert à/g) ?? []).toHaveLength(1);
  });

  it('RATT-6 — recouvert PARTIEL (80 %) → mention « partiellement détruit » + les deux boutons DÉSACTIVÉS (aria-disabled)', () => {
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('A', 'En service', 'A')], recouverts: [{ cleabs: 'A', tauxPct: 80 }], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toContain('partiellement détruit — recouvert à 80 % par l’emprise projetée');
    expect(html).not.toContain('statut détruit par défaut');       // pas la mention du détruit total
    expect(html).toContain('non modifiable à la main');            // POURQUOI c'est grisé (accessibilité/compréhension)
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(2); // préservé + détruit désactivés
    expect(html).not.toContain('annuler ma décision');            // pas de révocation d'un fait géométrique
  });

  it('RATT-6 — recouvert TOTAL (100 %) → mention « détruit par défaut », boutons ACTIFS (pas de mixte)', () => {
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('A', 'En service', 'A')], recouverts: [{ cleabs: 'A', tauxPct: 100 }], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toContain('recouvert à 100 % par l’emprise projetée — statut détruit par défaut');
    expect(html).not.toContain('partiellement détruit');
    expect(html).not.toContain('aria-disabled="true"'); // boutons actifs (détruit total est basculable)
  });

  it('RATT-6 — statut « mixte » STOCKÉ (auto) → boutons désactivés même sans info de recouvrement passée', () => {
    const statuts = statutCourantParCleabs([{ cleabs: 'A', statut: 'mixte', etatBdtopoAuMoment: 'En service', decidePar: 'auto', decideLe: '2026-08-01T10:00:00Z', origine: 'auto_mixte' }] as LigneStatutPolygone[]);
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('A', 'En service', 'A')], recouverts: [], statuts, onStatuer: () => {} }));
    expect(html).toContain('partiellement détruit (fait géométrique)'); // libellé de la décision courante
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(2);
  });

  it('« détruit » est signalé comme une PRÉVISION à confirmer à la mise à jour cadastrale', () => {
    const statuts = statutCourantParCleabs([ligne('A', 'detruit', 'En service')]);
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('A', 'En service', 'A')], recouverts: [], statuts, onStatuer: () => {} }));
    expect(html).toMatch(/Prévision/);
    expect(html).toContain('mise à jour de la planche cadastrale');
    expect(html).toContain('annuler ma décision'); // révocable
  });

  it('l’HISTORIQUE de mes décisions est repliable (audit qui/quand)', () => {
    const statuts = statutCourantParCleabs([ligne('A', 'preserve', 'En service'), { cleabs: 'A', statut: 'detruit', etatBdtopoAuMoment: 'En service', decidePar: 'admin', decideLe: '2026-08-02T10:00:00Z', origine: 'saisie' }]);
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('A', 'En service', 'A')], recouverts: [], statuts, onStatuer: () => {} }));
    expect(html).toContain('historique de mes décisions (2)');
  });

  it('aucun polygone statuable → rien affiché', () => {
    const html = renderToStaticMarkup(h(StatutPolygonesExistants, { polygones: [poly('B', 'En projet', 'B')], recouverts: [], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toBe('');
  });
});

describe('AFF-1 — encart réorganisé en blocs repliés', () => {
  const carre = (d: number) => [{ x: 0, y: 0 }, { x: d, y: 0 }, { x: d, y: d }, { x: 0, y: d }]; // aire = d²
  const cal = (cleabs: string[]) => ({ adoptionIgn: true, cleabs }) as unknown as EmpriseReconstruite['calage'];

  it('polygonesProjetParBatiment : regroupe les « en projet » affectés par bâtiment, repère + aire par polygone', () => {
    const polygones = attribuerReperes([
      { cleabs: 'P1', anneau: carre(10), etat: 'En projet' },   // A, 100 m²
      { cleabs: 'P2', anneau: carre(20), etat: 'En projet' },   // B, 400 m²
      { cleabs: 'Q', anneau: carre(5), etat: 'En service' },    // existant → ignoré
    ]);
    const emprises = [
      emprise({ id: 1, corpsId: 3, provenance: 'ign_adopte', calage: cal(['P1']) }),
      emprise({ id: 2, corpsId: 3, provenance: 'ign_adopte', calage: cal(['P2']) }),
    ];
    const { groupes, total } = polygonesProjetParBatiment(emprises, polygones, [{ corpsId: 3, repere: null, nomRepli: 'BP' }]);
    expect(total).toBe(2);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].nom).toBe('bâtiment en projet');
    expect(groupes[0].polygones.map((p) => p.repere)).toEqual(['A', 'B']); // repères DISTINCTS
    expect(aireAnneauM2(carre(10))).toBe(100);
  });

  it('BlocProjetRepliable : FERMÉ par défaut ; résumé = titre + décompte ; ouvert = bâtiment + repères distincts (jamais le nom répété)', () => {
    const polygones = attribuerReperes([
      { cleabs: 'P1', anneau: carre(10), etat: 'En projet' },
      { cleabs: 'P2', anneau: carre(20), etat: 'En projet' },
      { cleabs: 'P3', anneau: carre(30), etat: 'En projet' },
    ]);
    const emprises = [
      emprise({ id: 1, corpsId: 3, provenance: 'ign_adopte', calage: cal(['P1']) }),
      emprise({ id: 2, corpsId: 3, provenance: 'ign_adopte', calage: cal(['P2']) }),
      emprise({ id: 3, corpsId: 3, provenance: 'ign_adopte', calage: cal(['P3']) }),
    ];
    const html = renderToStaticMarkup(h(BlocProjetRepliable, { emprises, polygones, batiments: [{ corpsId: 3, repere: null, nomRepli: 'BP' }] }));
    expect(html).toMatch(/<details/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);           // FERMÉ par défaut
    expect(html).toContain('Bâtiment(s) au statut « projet » en base BD TOPO affecté(s) au projet de bâtiment');
    expect(html).toContain('— 3 polygones');                   // décompte sur la ligne fermée
    expect(html).toContain('bâtiment en projet');              // nom du bâtiment (une fois, en tête de groupe)
    expect(html).toContain('Polygone A');                      // repères DISTINCTS par ligne
    expect(html).toContain('Polygone B');
    expect(html).toContain('Polygone C');
    expect(html).toContain('100 m²');                          // aire du polygone A (10×10)
  });

  it('BlocProjetRepliable : aucun polygone affecté → rien', () => {
    expect(renderToStaticMarkup(h(BlocProjetRepliable, { emprises: [], polygones: [], batiments: [] }))).toBe('');
  });

  it('BlocExistantsRepliable : FERMÉ par défaut ; résumé = titre + décompte ; ouvert = StatutPolygonesExistants', () => {
    const polygones = attribuerReperes([{ cleabs: 'X', anneau: carre(10), etat: 'En service' }]);
    const html = renderToStaticMarkup(h(BlocExistantsRepliable, { polygones, recouverts: [], statuts: new Map(), onStatuer: () => {} }));
    expect(html).toMatch(/<details/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('Affectation (préservé/détruit) des bâtiments existants de la ou des parcelles du permis');
    expect(html).toContain('— 1 bâtiment');
    expect(html).toContain('bâtiment préservé');               // contenu StatutPolygonesExistants présent
    expect(html).not.toContain('Bâtiments existants du site'); // titre interne masqué (porté par le résumé)
  });

  it('BlocExistantsRepliable : aucun statuable → rien', () => {
    expect(renderToStaticMarkup(h(BlocExistantsRepliable, { polygones: [], recouverts: [], statuts: new Map(), onStatuer: () => {} }))).toBe('');
  });
});
