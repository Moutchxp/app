import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vente } from '../transaction/modele';

/**
 * ══ 🔴🔴 MON ESPACE — CLOISONNEMENT (Arno, 05/11/2026) : chaque collaborateur voit TOUTES ses affaires et UNIQUEMENT les siennes ══════════
 * Les VRAIES fonctions (`lireMesAffaires`, la route `affaires`) sur des ventes simulées ; le rapprochement libellé → compte est LE vrai
 * (`comptesRapprochesDesLibelles` simulé ici par la règle d'Arno). Le filtre est fait CÔTÉ SERVEUR : la réponse ne contient pas les
 * affaires des autres, et aucun paramètre ne permet de lire l'espace d'un autre.
 */
const h = vi.hoisted(() => ({
  ventes: [] as unknown[], retros: [] as unknown[], comptes: [] as { id: number; identifiant: string; prenom: string; nom: string; role: string }[],
  session: 8 as number | null,
}));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query: vi.fn(async () => ({ rows: [] })), withTransaction: vi.fn() }));
vi.mock('./compteRepo', () => ({
  titulaireDuCompte: async (id: number) => ({ id, prenom: h.comptes.find((c) => c.id === id)?.prenom ?? null,
    administrateur: h.comptes.find((c) => c.id === id)?.role === 'administrateur', associe: false, couts: false }),
  estAdministrateur: async (id: number) => h.comptes.find((c) => c.id === id)?.role === 'administrateur',
}));
vi.mock('../admin/schemaDroits', async (orig) => ({
  ...(await orig<object>()), mandatDisponible: async () => false, personneTypeDisponible: async () => false, prixVenteDisponible: async () => false,
  repartitionDisponible: async () => true, uniteCommissionDisponible: async () => false,
}));
vi.mock('../transaction/repo', async () => {
  const { rattacherLibelle } = await import('../location/suivi/negociateurIdentite');
  const { comptesDeLOnglet } = await import('../transaction/societeNegociateur');
  return {
    transactionDisponible: async () => true,
    lireVentes: async () => h.ventes,
    lireRetrocessions: async () => h.retros,
    lireStatutsNegociateurs: async () => ({}),
    nomsAffichesNegociateurs: async () => ({}),
    libellesDePaye: () => [],
    // La règle réelle : alias / nom exact / adresse d'un seul compte, puis le prénom d'un seul compte.
    comptesRapprochesDesLibelles: async (libelles: string[]) => Object.fromEntries(libelles.map((l) => {
      const r = rattacherLibelle(l, h.comptes, []);
      let id = r.sorte === 'auto' || r.sorte === 'alias' || r.sorte === 'compte' ? r.compteId : null;
      if (id === null) { const cs = comptesDeLOnglet(l, h.comptes); if (cs.length === 1) id = cs[0].id; }
      const c = h.comptes.find((x) => x.id === id);
      return [l, c === undefined ? null : { id: c.id, nom: `${c.prenom} ${c.nom}`, prenom: c.prenom, nomFamille: c.nom }];
    })),
  };
});
vi.mock('../admin/garde', () => ({ exigerAdministrateur: async () => ({ auteurId: h.session }), exigerModule: async () => ({ auteurId: h.session }) }));
const { lireMesAffaires } = await import('./mesAffairesRepo');
const { GET } = await import('../../(admin)/api/admin/mon-espace/affaires/route');

const ligne = (id: number, negociateur: string, compteId?: number) => ({ id, negociateur, role: 'negociateur' as const, montantTtc: 1000, nature: 'vente' as const,
  compte: true, origine: 'import' as const, sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...(compteId === undefined ? {} : { compteId }) });
const vente = (id: number, lignes: ReturnType<typeof ligne>[], o: Partial<Vente> = {}): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000,
  statut: 'vendue', annee: 2026, mois: 7, dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null,
  sourceLigne: id, lignes, double: null, ...o });

const PIERRE = { id: 8, identifiant: 'p.thevenin@sansvisavis.com', prenom: 'Pierre', nom: 'Thevenin', role: 'collaborateur' };
const JB = { id: 5, identifiant: 'jb.pons@sansvisavis.com', prenom: 'Jean-Baptiste', nom: 'PONS', role: 'collaborateur' };
const ARNO = { id: 2, identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel', role: 'administrateur' };
const VIDE = { id: 4, identifiant: 'nouveau@sansvisavis.com', prenom: 'Augustin', nom: 'Jorel', role: 'collaborateur' };

beforeEach(() => {
  h.comptes = [PIERRE, JB, ARNO, VIDE];
  h.session = 8;
  h.ventes = [
    vente(1, [ligne(1, 'PIERRE')]),                                    // à Pierre (prénom d'un seul compte : la règle existante)
    vente(2, [ligne(2, 'Pierre Thevenin', 8)]),                       // à Pierre (compte posé, 458)
    vente(3, [ligne(3, 'Jean-Baptiste PONS')]),                       // à JB seul
    vente(4, [ligne(4, 'Pierre Thevenin', 8), ligne(5, 'jb.pons@sansvisavis.com')]), // PARTAGÉE Pierre + JB
    vente(5, [ligne(6, 'CEDRIC')], { statut: 'compromis', mois: null }), // à personne de ces comptes
  ];
  h.retros = [];
});
const ids = (a: Awaited<ReturnType<typeof lireMesAffaires>>) => a.ventes.map((v) => v.id).sort((x, y) => x - y);

describe('🔴 A ne voit que SES affaires, B les siennes ; une vente partagée chez les deux', () => {
  it('Pierre : 1, 2 et la partagée 4 — jamais la 3 (JB) ni la 5', async () => {
    expect(ids(await lireMesAffaires(8, '2026-11-05'))).toEqual([1, 2, 4]);
  });
  it('Jean-Baptiste : 3 et la partagée 4 ; sur la 4, la commission de Pierre est retirée de ce qu’il reçoit', async () => {
    const a = await lireMesAffaires(5, '2026-11-05');
    expect(ids(a)).toEqual([3, 4]);
    expect(a.ventes.find((v) => v.id === 4)!.lignes.map((l) => l.negociateur)).toEqual(['jb.pons@sansvisavis.com']);
  });
  it('un administrateur garde tout (le mode « tout voir »)', async () => {
    expect(ids(await lireMesAffaires(2, '2026-11-05'))).toEqual([1, 2, 3, 4, 5]);
  });
  it('un collaborateur sans aucune donnée : un espace vide (le message clair est à l’écran), aucune affaire d’un autre', async () => {
    const a = await lireMesAffaires(4, '2026-11-05');
    expect(a.ventes).toEqual([]);
    expect(a.disponible).toBe(true);
  });
});

describe('🔴 le doublon de compte (un second « Pierre Thevenin ») ne vide plus l’espace pour les lignes qui portent le compte', () => {
  it('le libellé devient ambigu, mais les lignes rattachées au compte 8 restent à Pierre ; aucune ne passe au doublon', async () => {
    h.comptes = [...h.comptes, { id: 11, identifiant: 'pierre.thevenin@exemple.test', prenom: 'Pierre', nom: 'THEVENIN', role: 'collaborateur' }];
    expect(ids(await lireMesAffaires(8, '2026-11-05'))).toEqual([2, 4]);
    expect(ids(await lireMesAffaires(11, '2026-11-05'))).toEqual([]);
  });
});

describe('🔴 la route : l’espace lu est TOUJOURS celui de la session ; aucun paramètre ne permet de lire celui d’un autre', () => {
  const lire = async (url: string) => (await (await GET(new Request(url))).json()) as { etat: string; data?: { ventes: { id: number }[]; titulaire: { id: number } } };
  it('Pierre connecté qui demande ?compte=5, ?titulaire=5, ?id=5 : toujours SES affaires', async () => {
    for (const p of ['compte=5', 'titulaire=5', 'id=5', 'compteId=5', 'negociateur=jb.pons@sansvisavis.com']) {
      const r = await lire(`http://x/api/admin/mon-espace/affaires?${p}`);
      expect(r.data!.titulaire.id).toBe(8);
      expect(r.data!.ventes.map((v) => v.id).sort()).toEqual([1, 2, 4]);
    }
  });
  it('un collaborateur qui demande le mode agence : 403, rien n’est rendu', async () => {
    const res = await GET(new Request('http://x/api/admin/mon-espace/affaires?agence=tous'));
    expect(res.status).toBe(403);
  });
});
