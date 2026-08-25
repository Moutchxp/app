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
}));
const HG = vi.hoisted(() => ({
  // PROJ-3f/3m — texte simulé d'une pièce MULTI-PAGES : p1 = cartouche titré (exclu), p2-p3 = planches. vi.fn → surchargeable par test.
  extraire: vi.fn(async () => ({ ok: true, pages: [
    'PC2 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER — bureaux d’études',
    'planche implantation éch. 1:500',
    'planche niveaux',
  ] })),
}));
vi.mock('../../../../../lib/permis/lectureGed', () => ({
  depsReellesLectureGed: () => ({
    listerPieces: async () => [
      { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', typeMime: 'application/pdf', cleStockage: 'k1', tailleOctets: 1 },
      { id: 56, nomFichier: 'photo.jpg', typeMime: 'image/jpeg', cleStockage: 'k2', tailleOctets: 1 },
      { id: 57, nomFichier: 'PC4_Notice_architecturale.pdf', typeMime: 'application/pdf', cleStockage: 'k3', tailleOctets: 1 },
    ],
    lireObjet: async () => Buffer.from('%PDF'),
    extraire: HG.extraire,
  }),
}));
vi.mock('../../../../../lib/sitadel/demandeRepo', () => ({ lireCleTelechargeable: vi.fn(async () => ({ cle: 'ged/dossier/55.pdf', nomFichier: 'PC2.pdf' })) }));
vi.mock('../../../../../lib/stockage', () => ({ urlSignee: async (cle: string) => `https://signed.example/${cle}` }));

import { GET, POST } from './route';
import { enregistrerEmprise, supprimerEmprise, ignorerProjection, retablirProjection, listerBatiments } from '../../../../../lib/permis/empriseReconstruiteRepo';
import { lireCleTelechargeable } from '../../../../../lib/sitadel/demandeRepo';

const get = (q: string) => GET(new Request(`http://test.local/api/admin/permis/emprise${q}`));
const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/emprise', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { vi.clearAllMocks(); });

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
