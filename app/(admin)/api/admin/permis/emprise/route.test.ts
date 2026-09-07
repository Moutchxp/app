import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * PROJ-2 — CONTRAT front → route. On mocke la garde, le repo, la GED et le stockage ; la GÉOMÉTRIE (calageEmprise) reste RÉELLE
 * (pure) pour prouver que la route recalcule la similitude CÔTÉ SERVEUR et enregistre un anneau en LAMBERT, jamais le tracé plan
 * reçu tel quel. On vérifie le COMPORTEMENT + les paramètres liés, pas la forme d'un SQL.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ admin: { id: 1 } }) }));
vi.mock('../../../../../lib/permis/empriseReconstruiteRepo', () => ({
  listerEmprises: async () => [{ id: 1, dossierId: 11434, corpsId: 3, libelle: '2D1', anneau: [], surfaceM2: 100, pieceId: 55, page: 2, calage: null, residuM: 0, creeLe: null }],
  listerIgnorees: async () => [{ corpsId: 4, motif: 'déjà bâti' }],
  listerBatiments: vi.fn(async () => [{ corpsId: 3, repere: '2D1' }, { corpsId: 4, repere: '2D2' }]),
  enregistrerEmprise: vi.fn(async () => ({ ok: true, id: 42 })),
  ignorerProjection: vi.fn(async () => ({ ok: true })),
  retablirProjection: vi.fn(async () => ({ ok: true })),
  supprimerEmprise: vi.fn(async () => 1),
  lireContexteEmprise: async () => ({ empreinteAnneaux: [], surfaceTerrainM2: 2886.5, surfacePlancherM2: 900, batiments: [{ corpsId: 3, nbEtages: 3, empriseM2: null }] }),
  lirePolygonesEmpreinte: async () => [
    { cleabs: 'BATIMENT0001', anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], etat: 'En projet' },
    { cleabs: 'BATIMENT0002', anneau: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], etat: 'En service' },
  ],
  listerPolygonesProjetEcartes: async () => ['BATIMENT0009'],
  ecarterPolygoneProjet: vi.fn(async () => ({ ok: true })),
  retablirPolygoneProjet: vi.fn(async () => ({ ok: true })),
  mesurerDebordement: vi.fn(async () => ({ aireM2: 100, parcelleRattachee: true, aireHorsM2: 7, pctHors: 7, decalageLateralM: 0.5 })),
  apercuAdoptionEnProjet: vi.fn(async () => ({ groupes: [{ cleabs: ['B1', 'B2'], surfaceM2: 320, polygones: [{ cleabs: 'B1', surfaceM2: 200 }, { cleabs: 'B2', surfaceM2: 120 }] }, { cleabs: ['B3'], surfaceM2: 90, polygones: [{ cleabs: 'B3', surfaceM2: 90 }] }] })),
  apercuAffectations: vi.fn(async () => ({ batiments: [{ corpsId: 3, repere: '2D1', emprises: [{ surfaceM2: 320 }] }, { corpsId: 5, repere: '2D2', emprises: [{ surfaceM2: 90 }] }] })),
  adopterAffectations: vi.fn(async () => ({ ok: true, nbCreees: 2, debordement: { aireM2: 410, parcelleRattachee: true, aireHorsM2: 0, pctHors: 0, decalageLateralM: 0 }, emprises: [{ id: 9, dossierId: 11434, corpsId: 3, libelle: '2D1', anneau: [], anneaux: [], surfaceM2: 320, pieceId: null, page: null, calage: null, residuM: null, provenance: 'ign_adopte', creeLe: null }] })),
  supprimerEmprisesAdoptees: vi.fn(async () => 0),
  retoucherEmprise: vi.fn(async () => ({ ok: true, provenance: 'ign_retouche', debordement: { aireM2: 300, parcelleRattachee: true, aireHorsM2: 0, pctHors: 0, decalageLateralM: 0 }, emprises: [{ id: 9, dossierId: 11434, corpsId: 3, libelle: '2D1', anneau: [], anneaux: [], surfaceM2: 300, pieceId: null, page: null, calage: null, residuM: null, provenance: 'ign_retouche', creeLe: null }] })),
  lireProjectionValidee: vi.fn(async () => false), // SOURCE UNIQUE : projection du dossier validée ? (GET l'expose au bandeau/pastille)
  lireValideeParCorps: vi.fn(async () => ({} as Record<number, boolean>)), // validation PAR BÂTIMENT (GET l'expose pour pastille/bandeau)
  lireAltitudeValideeParCorps: vi.fn(async () => ({} as Record<number, boolean>)), // ③ altitude validée PAR BÂTIMENT (GET l'expose pour l'en-tête « Projection(s) validée(s) »)
}));
const HG = vi.hoisted(() => ({
  // PROJ-3f/3m — texte simulé d'une pièce MULTI-PAGES : p1 = cartouche titré (exclu), p2-p3 = planches. vi.fn → surchargeable par test.
  extraire: vi.fn(async () => ({ ok: true, pages: [
    'PC2 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER — bureaux d’études',
    'planche implantation éch. 1:500',
    'planche niveaux',
  ] })),
  // P1 (perfo) — listerPieces + lireObjet contrôlables (spies) : pour compter les téléchargements et simuler une mutation de GED (cache froid/chaud/invalidation). Défauts INCHANGÉS pour les tests existants.
  listerPieces: vi.fn(async () => [
    { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', typeMime: 'application/pdf', cleStockage: 'k1', tailleOctets: 1 },
    { id: 56, nomFichier: 'photo.jpg', typeMime: 'image/jpeg', cleStockage: 'k2', tailleOctets: 1 },
    { id: 57, nomFichier: 'PC4_Notice_architecturale.pdf', typeMime: 'application/pdf', cleStockage: 'k3', tailleOctets: 1 },
  ]),
  lireObjet: vi.fn(async () => Buffer.from('%PDF')),
}));
vi.mock('../../../../../lib/permis/lectureGed', () => ({
  depsReellesLectureGed: () => ({
    listerPieces: HG.listerPieces,
    lireObjet: HG.lireObjet,
    extraire: HG.extraire,
  }),
  // LOT 87 — la route lit désormais TOUJOURS la GED pour le classement par contenu. Mock surchargeable ; par défaut contenu MUET
  //   (→ classement par le NOM, comportement historique conservé pour les assertions existantes).
  lireGedPermis: vi.fn(async () => ({ pieces: [] as { id: number; pages: { page: number; texte: string; aTexte: boolean }[] }[] })),
}));
vi.mock('../../../../../lib/permis/polygoneStatutRepo', () => ({
  lireStatutsPolygones: vi.fn(async () => [{ cleabs: 'BAT_A', statut: 'preserve', etatBdtopoAuMoment: 'En projet', decidePar: 'admin:projection', decideLe: '2026-08-01T10:00:00Z', origine: 'saisie' }]),
  polygonesRecouvertsParEmprise: vi.fn(async () => []),
  poserStatutPolygone: vi.fn(async () => ({ ok: true })),
  appliquerAutoStatut: vi.fn(async () => {}), // RATT-2 — orchestration auto (best-effort) branchée sur les mutations d'emprise
}));
vi.mock('../../../../../lib/sitadel/demandeRepo', () => ({ lireCleTelechargeable: vi.fn(async () => ({ cle: 'ged/dossier/55.pdf', nomFichier: 'PC2.pdf' })) }));
vi.mock('../../../../../lib/stockage', () => ({ urlSignee: async (cle: string) => `https://signed.example/${cle}` }));
// LOT 61/92 — overrides du best-of (exclusions + inclusions). Mock pour vérifier le WIRING et l'exclusivité mutuelle des gestes.
vi.mock('../../../../../lib/permis/bestOfExclusionRepo', () => ({
  lireExclusionsBestOf: vi.fn(async () => []),
  exclurePageBestOf: vi.fn(async () => true),
  reintegrerPageBestOf: vi.fn(async () => true),
  lireInclusionsBestOf: vi.fn(async () => [{ pieceId: 57, page: 3 }]),
  inclurePageBestOf: vi.fn(async () => true),
  desinclurePageBestOf: vi.fn(async () => true),
}));

import { GET, POST } from './route';
import { _viderBestOfCache } from '../../../../../lib/permis/bestOfCache'; // P1 — purge du cache best-of entre tests (réel, non mocké)
import { exclurePageBestOf, reintegrerPageBestOf, inclurePageBestOf, desinclurePageBestOf } from '../../../../../lib/permis/bestOfExclusionRepo';
import { lireGedPermis } from '../../../../../lib/permis/lectureGed';
import { enregistrerEmprise, supprimerEmprise, ignorerProjection, retablirProjection, listerBatiments } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { poserStatutPolygone } from '../../../../../lib/permis/polygoneStatutRepo';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';

const get = (q: string) => GET(new Request(`http://test.local/api/admin/permis/emprise${q}`));
const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/emprise', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { vi.clearAllMocks(); _viderBestOfCache(); }); // P1 — chaque test part CACHE FROID (sinon un test lirait le best-of mémoïsé d'un précédent)

describe('PROJ-2 — GET', () => {
  it('PROJ-3d — propose les plans de masse (tri par nom + confirmation page/échelle), JPG écartée, clé jamais exposée', async () => {
    const res = await get('?dossierId=11434');
    expect(res.status).toBe(200);
    const j = await res.json();
    // JPG (56) écartée car non-PDF ; clé de stockage jamais exposée
    expect(j.pieces.map((p: { id: number }) => p.id)).toEqual([55, 57]); // proposé (PC2 plan de masse) d'abord, autre (notice) ensuite
    expect(j.pieces.every((p: object) => !('cleStockage' in p))).toBe(true);
    // ① tri par nom + ② confirmation page-level : PC2 → proposé famille « masse », ÉCLATÉ en planches (cartouche p1 EXCLU, p2-p3 gardées)
    expect(j.pieces[0]).toMatchObject({ id: 55, propose: true, famille: 'masse', confirme: true });
    // PROJ-3m — chaque planche porte sa traçabilité PAR PAGE (PC2 = masse → toutes traçables)
    expect(j.pieces[0].planches).toEqual([
      { page: 2, echelle: '1:500', tracable: true, famille: 'masse', ambigu: false },
      { page: 3, echelle: null, tracable: true, famille: 'masse', ambigu: false },
    ]);
    expect(j.pieces[0].score).toBeGreaterThan(0);
    // la notice n'est d'AUCUNE famille (null), non proposée, mais reste ATTEIGNABLE (repli garanti)
    expect(j.pieces[1]).toMatchObject({ id: 57, propose: false, famille: null, confirme: false });
    expect(j.pieces[1].planches).toEqual([]);
    expect(j.emprises).toHaveLength(1);
    expect(j.emprises[0].corpsId).toBe(3);                 // PROJ-2b — emprise liée à son bâtiment
    expect(j.ignores).toEqual([{ corpsId: 4, motif: 'déjà bâti' }]); // projections ignorées exposées
    expect(j.batiments).toEqual([{ corpsId: 3, repere: '2D1' }, { corpsId: 4, repere: '2D2' }]); // bâtiments du permis (self-contained)
    expect(j.contexte.surfaceTerrainM2).toBe(2886.5);
    // PROJ-3h — polygones BD TOPO (∩ empreinte) exposés avec leur état IGN + cleabs (PROJ-3i), pour l'affichage
    expect(j.polygones).toHaveLength(2);
    expect(j.polygones[0]).toMatchObject({ cleabs: 'BATIMENT0001', etat: 'En projet' });
    expect(j.polygones[1].etat).toBe('En service');
    // PROJ-3i — sélection persistée : cleabs des polygones « en projet » écartés
    expect(j.polygonesEcartes).toEqual(['BATIMENT0009']);
  });

  it('LOT 87 — le classement par CONTENU tourne TOUJOURS : une pièce à nom OPAQUE (PC4 notice) dont le contenu est un plan de masse entre dans le best-of', async () => {
    // Contenu : la pièce 57 (nom → aucune famille) porte le cartouche réglementaire d'un plan de masse → familleDeContenu = masse.
    vi.mocked(lireGedPermis).mockResolvedValueOnce({ pieces: [
      { id: 57, pages: [{ page: 1, texte: 'PC2 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER', aTexte: true }] },
    ] } as unknown as Awaited<ReturnType<typeof lireGedPermis>>);
    const res = await get('?dossierId=11434');
    expect(res.status).toBe(200);
    const j = await res.json();
    const p57 = j.pieces.find((p: { id: number }) => p.id === 57);
    expect(p57).toMatchObject({ id: 57, propose: true, famille: 'masse' }); // classée par le CONTENU seul → dans le best-of (avant, elle restait dehors)
    // les deux plans de masse (55 par le nom, 57 par le contenu) sont proposés AVANT toute autre famille.
    expect(j.pieces.filter((p: { propose: boolean }) => p.propose).map((p: { id: number }) => p.id)).toEqual([55, 57]);
  });

  it('PROJ-3i — écarter / rétablir un polygone « en projet » (persisté, tracé), renvoie la liste à jour', async () => {
    const res = await post({ action: 'ecarter_polygone', dossierId: 11434, cleabs: 'BATIMENT0001' });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.polygonesEcartes).toEqual(['BATIMENT0009']); // renvoie la liste (mockée)
    // cleabs manquant → 400
    expect((await post({ action: 'ecarter_polygone', dossierId: 11434 })).status).toBe(400);
  });
  it('dossierId absent/invalide → 400', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?dossierId=abc')).status).toBe(400);
  });

  it('PROJ-3b-fix — une source défaillante ne fait PAS tomber la réponse : batiments [] MAIS flag « batiments » (indisponible ≠ vide)', async () => {
    vi.mocked(listerBatiments).mockRejectedValueOnce(new Error('column "nb_etages" does not exist'));
    const res = await get('?dossierId=11434');
    expect(res.status).toBe(200);          // plus de 503
    const j = await res.json();
    expect(j.batiments).toEqual([]);       // repli sûr
    expect(j.indisponibles).toContain('batiments'); // distinguable d'une vraie liste vide
    expect(j.emprises).toHaveLength(1);    // les autres sources tiennent
  });
});

describe('PROJ-2 — POST enregistrer : géométrie recalculée SERVEUR (plan → Lambert)', () => {
  it('similitude ×2 : tracé plan 5×5 → anneau Lambert 10×10 (aire 100 m²), enregistré en Lambert', async () => {
    const body = {
      action: 'enregistrer', dossierId: '11434', corpsId: 3, libelle: '2D1', pieceId: 55, page: 2,
      // calage : (0,0)→(0,0) et (1,0)→(2,0) ⇒ échelle ×2, sans rotation
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
      ratioDeclare: null,
    };
    const res = await post(body);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.id).toBe(42);
    expect(j.surfaceM2).toBeCloseTo(100, 6); // 5×5 pt × échelle² (4) = 100 m²
    expect(j.vraisemblance.empriseVsPlancher).toBe('petite'); // attendu ~300 m² (900/3), tolérance ±40 % → [180;420] ; 100 < 180
    expect(j.debordement).toMatchObject({ parcelleRattachee: true, pctHors: 7 }); // repère de débordement joint à la réponse
    // l'anneau PASSÉ au repo est en LAMBERT (×2), pas le tracé plan
    const arg = (enregistrerEmprise as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { anneau: { x: number; y: number }[]; dossierId: number; corpsId: number };
    expect(arg.dossierId).toBe(11434);              // chaîne bigint acceptée et coercée
    expect(arg.corpsId).toBe(3);                    // PROJ-2b — l'emprise est liée au bâtiment
    expect(arg.anneau[1]).toEqual({ x: 10, y: 0 }); // 5 pt × 2 = 10 m
  });

  it('PROJ-3g/3m — VERROU serveur PAR PAGE : une planche classée COUPE est refusée', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/x.pdf', nomFichier: 'PC3_2D_PDM.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['COUPE AA sur le terrain naturel'] }); // la page 1 est une coupe
    const res = await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: '2D1', pieceId: 99, page: 1,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/vue en plan/);
    expect(enregistrerEmprise).not.toHaveBeenCalled();
  });

  it('PROJ-3m ① — une planche « plan du R » d’une pièce PC3 (coupe) est TRAÇABLE (défaut corrigé)', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/y.pdf', nomFichier: 'PC3_2D_PDM.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['a', 'b', 'c', 'd', 'PC3.3.2 Plan du R01 éch 1:200'] }); // page 5 = plan de niveau
    const res = await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: '2D1', pieceId: 88, page: 5,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect(enregistrerEmprise).toHaveBeenCalled();
  });

  it('PROJ-3n — une planche de niveau à graphie « Accord du gestionnaire … étage » (pièce PC3) est TRAÇABLE côté serveur', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/z.pdf', nomFichier: 'PC3_2D_PDM.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'Accord du gestionnaire 6e étage 1/200E _ 2D2 PLN R06 PC3.3.12'] }); // page 15 = plan de niveau (graphie réelle 11434)
    const res = await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: '2D1', pieceId: 77, page: 15,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect(enregistrerEmprise).toHaveBeenCalled();
  });

  it('PROJ-3j — un PLAN D’ÉTAGE (nom explicite) est traçable sans ouvrir la page', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/e.pdf', nomFichier: 'ANNEXE_6_Plan_du_R_1.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    const res = await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: '2D1', pieceId: 42, page: 2,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect(enregistrerEmprise).toHaveBeenCalled();
  });

  it('BUG PROV — un PLAN DE MASSE à NOM OPAQUE (familleDeNom null) est TRAÇABLE par son CONTENU (fix : la garde suivait le NOM et rejetait à tort)', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/o.pdf', nomFichier: 'PC 075 120 25 V0006_202508010945120206.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['1/100 N PROJET Cour commune S = 123.40m² 98.95 102.37'] }); // titre graphique, mais vocabulaire de site → masse
    const res = await post({ action: 'enregistrer', dossierId: 531, corpsId: 4, libelle: 'bâtiment 4', pieceId: 120, page: 1,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect(enregistrerEmprise).toHaveBeenCalled();
  });

  it('SUITE — un PLAN D’ÉTAGE à NOM OPAQUE est TRAÇABLE par son CONTENU (la garde serveur accepte etage — pas de régression du bug)', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/e.pdf', nomFichier: 'PC 075 120 25 V0006_202508010945119787.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['PLAN ÉTAGE COURANT - R+4 1/100 APPT 105 APPT 102'] }); // cartouche de niveau → etage
    const res = await post({ action: 'enregistrer', dossierId: 531, corpsId: 4, libelle: 'bâtiment 4', pieceId: 119, page: 1,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect(enregistrerEmprise).toHaveBeenCalled();
  });

  it('BUG PROV — un nom OPAQUE dont le CONTENU n’est PAS un plan (notice) reste refusé 400', async () => {
    vi.mocked(lireCleTelechargeable).mockResolvedValueOnce({ cle: 'ged/dossier/n.pdf', nomFichier: 'PC 075 120 25 V0006_202508010945999999.pdf' } as Awaited<ReturnType<typeof lireCleTelechargeable>>);
    HG.extraire.mockResolvedValueOnce({ ok: true, pages: ['Notice de sécurité — article 5 circulations intérieures'] }); // aucun signal de plan
    const res = await post({ action: 'enregistrer', dossierId: 531, corpsId: 4, libelle: 'bâtiment 4', pieceId: 121, page: 1,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/vue en plan/);
    expect(enregistrerEmprise).not.toHaveBeenCalled();
  });

  it('contour < 3 sommets → 400, aucun enregistrement', async () => {
    const res = await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: 'X', anneauPlan: [{ x: 0, y: 0 }, { x: 1, y: 1 }], paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 1, y: 0 } }] });
    expect(res.status).toBe(400);
    expect(enregistrerEmprise).not.toHaveBeenCalled();
  });

  it('sans corpsId → 400 (une emprise par bâtiment est obligatoire)', async () => {
    const res = await post({ action: 'enregistrer', dossierId: 11434, libelle: 'X', anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }] });
    expect(res.status).toBe(400);
    expect(enregistrerEmprise).not.toHaveBeenCalled();
  });

  it('calage insuffisant (points confondus) → 400', async () => {
    const res = await post({ action: 'enregistrer', dossierId: 11434, libelle: 'X', anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], paires: [{ plan: { x: 2, y: 2 }, lambert: { x: 0, y: 0 } }, { plan: { x: 2, y: 2 }, lambert: { x: 9, y: 9 } }] });
    expect(res.status).toBe(400);
  });
});

describe('PROJ-2 — POST signer_piece / supprimer', () => {
  it('signer_piece → URL signée inline (clé jamais exposée au client)', async () => {
    const res = await post({ action: 'signer_piece', pieceId: 55 });
    const j = await res.json();
    expect(j.url).toBe('https://signed.example/ged/dossier/55.pdf');
  });
  it('supprimer → scopé au dossier', async () => {
    const res = await post({ action: 'supprimer', dossierId: 11434, id: 42 });
    expect(res.status).toBe(200);
    expect(supprimerEmprise).toHaveBeenCalledWith(42, 11434);
  });
});

describe('PROJ-2b — POST ignorer / retablir la projection', () => {
  it('ignorer → passe corpsId + motif ; renvoie emprises + ignores', async () => {
    const res = await post({ action: 'ignorer', dossierId: '11434', corpsId: 4, motif: 'déjà bâti' });
    expect(res.status).toBe(200);
    expect(ignorerProjection).toHaveBeenCalledWith(11434, 4, 'déjà bâti', 'admin:projection');
    const j = await res.json();
    expect(j.ignores).toEqual([{ corpsId: 4, motif: 'déjà bâti' }]);
  });
  it('retablir → passe corpsId', async () => {
    const res = await post({ action: 'retablir', dossierId: 11434, corpsId: 4 });
    expect(res.status).toBe(200);
    expect(retablirProjection).toHaveBeenCalledWith(11434, 4, 'admin:projection');
  });
  it('ignorer sans corpsId → 400', async () => {
    expect((await post({ action: 'ignorer', dossierId: 11434, motif: 'x' })).status).toBe(400);
  });
});

describe('PROJ — action apercu_debordement : Lambert recalculé SERVEUR, lecture seule, jamais bloquant', () => {
  const paires = [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }];
  it('contour fermé (≥3) + calage valide → renvoie le repère de débordement (via mesurerDebordement)', async () => {
    const res = await post({ action: 'apercu_debordement', dossierId: 11434, corpsId: 3, paires, anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.debordement).toMatchObject({ parcelleRattachee: true, pctHors: 7 });
  });
  it('contour NON fermé (<3 sommets) → { debordement: null } sans toucher la base', async () => {
    const res = await post({ action: 'apercu_debordement', dossierId: 11434, corpsId: 3, paires, anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).debordement).toBeNull();
  });
  it('calage insuffisant (0 paire) → { debordement: null }', async () => {
    const res = await post({ action: 'apercu_debordement', dossierId: 11434, corpsId: 3, paires: [], anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).debordement).toBeNull();
  });
});

describe('PROJ-3q/3r — adoption des polygones « en projet » via la route', () => {
  it('apercu_adoption → groupes automatiques + aires (lecture seule)', async () => {
    const res = await post({ action: 'apercu_adoption', dossierId: 11434 });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.apercu.groupes).toHaveLength(2);
    expect(j.apercu.groupes[0].surfaceM2).toBe(320);
  });
  it('apercu_affectations → aperçu PAR BÂTIMENT (nombre d’emprises + aires) pour l’affectation donnée', async () => {
    const { apercuAffectations } = await import('../../../../../lib/permis/empriseReconstruiteRepo');
    const res = await post({ action: 'apercu_affectations', dossierId: 11434, affectations: [{ cleabs: 'B1', corpsId: 3 }, { cleabs: 'B3', corpsId: 5 }] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.apercu.batiments.map((b: { corpsId: number }) => b.corpsId)).toEqual([3, 5]);
    expect(apercuAffectations).toHaveBeenCalledWith(11434, [{ cleabs: 'B1', corpsId: 3 }, { cleabs: 'B3', corpsId: 5 }]);
  });
  it('adopter → passe les AFFECTATIONS au repo ; ok, nbCreees, emprises IGN et débordement joints', async () => {
    const { adopterAffectations } = await import('../../../../../lib/permis/empriseReconstruiteRepo');
    const aff = [{ cleabs: 'B1', corpsId: 3 }, { cleabs: 'B2', corpsId: 3 }, { cleabs: 'B3', corpsId: 5 }];
    const res = await post({ action: 'adopter', dossierId: 11434, affectations: aff });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.nbCreees).toBe(2);
    expect(j.emprises[0].provenance).toBe('ign_adopte');
    expect(j.debordement).toMatchObject({ parcelleRattachee: true });
    expect(adopterAffectations).toHaveBeenCalledWith(11434, aff, 'admin:adoption');
  });
  it('EXCLUSIVITÉ : enregistrer un tracé manuel retire les emprises adoptées du bâtiment', async () => {
    const { supprimerEmprisesAdoptees } = await import('../../../../../lib/permis/empriseReconstruiteRepo');
    await post({ action: 'enregistrer', dossierId: 11434, corpsId: 3, libelle: '2D1', pieceId: 55, page: 2,
      paires: [{ plan: { x: 0, y: 0 }, lambert: { x: 0, y: 0 } }, { plan: { x: 1, y: 0 }, lambert: { x: 2, y: 0 } }],
      anneauPlan: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] });
    expect(supprimerEmprisesAdoptees).toHaveBeenCalledWith(11434, 3);
  });
});

describe('PROJ-3s — retoucher une emprise via la route', () => {
  const anneau = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it('retoucher → passe (id, sommets) au repo ; renvoie emprises, débordement recalculé et provenance', async () => {
    const { retoucherEmprise } = await import('../../../../../lib/permis/empriseReconstruiteRepo');
    const res = await post({ action: 'retoucher', dossierId: 11434, id: 9, anneau });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.provenance).toBe('ign_retouche');
    expect(j.debordement).toMatchObject({ parcelleRattachee: true });
    expect(retoucherEmprise).toHaveBeenCalledWith(11434, 9, anneau, 'admin:retouche');
  });
  it('retoucher sans emprise (id) → 400', async () => {
    expect((await post({ action: 'retoucher', dossierId: 11434, anneau })).status).toBe(400);
  });
  it('géométrie refusée par le repo (auto-intersection) → 400 avec le message serveur', async () => {
    const { retoucherEmprise } = await import('../../../../../lib/permis/empriseReconstruiteRepo');
    vi.mocked(retoucherEmprise).mockResolvedValueOnce({ ok: false, motif: 'contour invalide : des bords se croisent — ajustez les sommets avant de valider' });
    const res = await post({ action: 'retoucher', dossierId: 11434, id: 9, anneau });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/bords se croisent/);
  });
});

describe('RATT-1 (2) — POST statuer_polygone (préservé / détruit / révoquer)', () => {
  it('cleabs + statut valide → 200, poserStatutPolygone appelé, registre renvoyé', async () => {
    const res = await post({ action: 'statuer_polygone', dossierId: 531, cleabs: 'BAT_A', statut: 'preserve' });
    expect(res.status).toBe(200);
    expect(poserStatutPolygone).toHaveBeenCalledWith(531, 'BAT_A', 'preserve', 'admin:projection', 'saisie'); // RATT-2 — décision humaine
    const j = await res.json();
    expect(j.statutsPolygones[0]).toMatchObject({ cleabs: 'BAT_A', statut: 'preserve', etatBdtopoAuMoment: 'En projet' }); // source conservée à côté
  });
  it('révoquer est un statut valide', async () => {
    const res = await post({ action: 'statuer_polygone', dossierId: 531, cleabs: 'BAT_A', statut: 'revoque' });
    expect(res.status).toBe(200);
    expect(poserStatutPolygone).toHaveBeenCalledWith(531, 'BAT_A', 'revoque', 'admin:projection', 'saisie'); // RATT-2 — décision humaine
  });
  it('statut hors liste → 400, aucune écriture', async () => {
    const res = await post({ action: 'statuer_polygone', dossierId: 531, cleabs: 'BAT_A', statut: 'demoli' });
    expect(res.status).toBe(400);
    expect(poserStatutPolygone).not.toHaveBeenCalled();
  });
  it('cleabs vide → 400', async () => {
    expect((await post({ action: 'statuer_polygone', dossierId: 531, cleabs: '', statut: 'preserve' })).status).toBe(400);
  });
});

describe('LOT 61/92 — overrides du best-of par PAGE (route)', () => {
  it('GET expose inclusionsBestOf (pages ajoutées à la main)', async () => {
    const j = await (await get('?dossierId=11434')).json();
    expect(j.inclusionsBestOf).toEqual([{ pieceId: 57, page: 3 }]);
  });
  it('AJOUTER (inclure_page_bestof) : inclut la page ET annule un éventuel retrait (exclusivité mutuelle)', async () => {
    const res = await post({ action: 'inclure_page_bestof', dossierId: 470, pieceId: 481, page: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(vi.mocked(inclurePageBestOf)).toHaveBeenCalledWith(470, 481, 2, expect.anything());
    expect(vi.mocked(reintegrerPageBestOf)).toHaveBeenCalledWith(481, 2); // supprime une exclusion éventuelle
  });
  it('RETIRER une page AUTO (exclure_page_bestof) : exclut ET annule une inclusion éventuelle', async () => {
    await post({ action: 'exclure_page_bestof', dossierId: 470, pieceId: 481, page: 2 });
    expect(vi.mocked(exclurePageBestOf)).toHaveBeenCalledWith(470, 481, 2, expect.anything());
    expect(vi.mocked(desinclurePageBestOf)).toHaveBeenCalledWith(481, 2);
  });
  it('RETIRER une page AJOUTÉE (desinclure_page_bestof) : simple désinclusion, aucune exclusion résiduelle', async () => {
    await post({ action: 'desinclure_page_bestof', dossierId: 470, pieceId: 481, page: 2 });
    expect(vi.mocked(desinclurePageBestOf)).toHaveBeenCalledWith(481, 2);
    expect(vi.mocked(exclurePageBestOf)).not.toHaveBeenCalled();
  });
  it('page manquante/invalide → 400', async () => {
    expect((await post({ action: 'inclure_page_bestof', dossierId: 470, pieceId: 481 })).status).toBe(400);
    expect((await post({ action: 'inclure_page_bestof', dossierId: 470, pieceId: 481, page: 0 })).status).toBe(400);
  });
});

describe('P1 (perfo) — cache du best-of PDF : froid recalcule, chaud gratuit, mutation de GED invalide', () => {
  const ids = (j: { pieces: { id: number }[] }): number[] => j.pieces.map((p) => p.id);

  it('🔴 CHAUD = GRATUIT : 2e appel (même GED) → AUCUN nouveau téléchargement ni extraction PDF ; best-of IDENTIQUE au 1er (octet pour octet)', async () => {
    const j1 = await (await get('?dossierId=11434')).json();
    const nExtraireFroid = HG.extraire.mock.calls.length;
    const nLireObjetFroid = HG.lireObjet.mock.calls.length;
    expect(nExtraireFroid).toBeGreaterThan(0);  // FROID : extraction réelle
    expect(nLireObjetFroid).toBeGreaterThan(0);
    const j2 = await (await get('?dossierId=11434')).json();
    expect(HG.extraire.mock.calls.length).toBe(nExtraireFroid);   // 🔴 CHAUD : aucune nouvelle extraction
    expect(HG.lireObjet.mock.calls.length).toBe(nLireObjetFroid); // 🔴 CHAUD : aucun nouveau téléchargement
    expect(j2.pieces).toEqual(j1.pieces);                          // best-of froid == chaud
  });

  it('🔴 INVALIDATION (test central) : une mutation de dossier_document (pièce retirée) → RECALCUL, best-of À JOUR (jamais l’ancien caché)', async () => {
    const j1 = await (await get('?dossierId=11434')).json();
    expect(ids(j1)).toContain(57);                                 // à froid, la pièce 57 est dans la réponse
    const nLireObjetFroid = HG.lireObjet.mock.calls.length;
    HG.listerPieces.mockResolvedValueOnce([                        // MUTATION : la pièce 57 est retirée de la GED → empreinte différente
      { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', typeMime: 'application/pdf', cleStockage: 'k1', tailleOctets: 1 },
      { id: 56, nomFichier: 'photo.jpg', typeMime: 'image/jpeg', cleStockage: 'k2', tailleOctets: 1 },
    ]);
    const j2 = await (await get('?dossierId=11434')).json();
    expect(HG.lireObjet.mock.calls.length).toBeGreaterThan(nLireObjetFroid); // 🔴 RECALCUL (l’entrée cachée n’a PAS été réutilisée)
    expect(ids(j2)).not.toContain(57);                            // 🔴 best-of À JOUR : la pièce retirée a disparu (jamais l’ancien best-of)
  });

  it('🔴 ISOLATION entre dossiers : un dossier chaud ne sert JAMAIS le best-of d’un autre (fuite)', async () => {
    await get('?dossierId=11434');
    const nLireObjet1 = HG.lireObjet.mock.calls.length;
    await get('?dossierId=7424');                                  // AUTRE dossier (clé de cache différente)
    expect(HG.lireObjet.mock.calls.length).toBeGreaterThan(nLireObjet1); // recalcul pour l’autre dossier — pas de fuite
  });
});
