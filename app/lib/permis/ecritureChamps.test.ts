import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N5-E — dépôt d'écriture généralisé. `db/client` mocké (routé par fragment SQL). On éprouve : ATTRIBUTION (0 crée un corps · 1
 * écrit · ≥2 n'écrit pas + alerte), INVARIANT réutilisé (saisie non écrasée → journal 'ecartee' avec motif), JOURNAL complet
 * (retenue pour l'écrit, ecartee AVEC MOTIF pour le non-écrit), et RECOMPUTE idempotent (purge du journal auto avant réécriture).
 * On asserte le COMPORTEMENT et les paramètres LIÉS, jamais la forme d'un SQL émis.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { corps: [] as { id: number }[], origineCorps: {} as Record<string, unknown>, insertCorpsId: 100 };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/json_agg/i.test(sql)) return { rows: [{ global: null, corps: state.corps }] };
    if (/INSERT\s+INTO\s+permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.insertCorpsId }] };
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [state.origineCorps] };
    return { rows: [] };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireChamps, MOTIF_SAISIE_PRIORITAIRE, MOTIF_AMBIGU_CORPS } from './ecritureChamps';
import type { DecisionChamp, DecisionChamps } from './decisionChamps';
import type { Observation } from './decisionSommet';

const RESERVE = 'la cote la plus haute peut appartenir à un bâtiment voisin';
const obs = (pieceId: number, page = 2): Observation => ({ provenance: { pieceId, pieceNom: `p${pieceId}.pdf`, page }, texteBrut: 'NGF +89.46' });
const ecritChamp = (champ: string, cle: string, valeur: number, reserve: string | null = null): DecisionChamp =>
  ({ champ, portee: 'corps', statut: 'ecrit', cle: cle as never, valeur, unite: 'ngf', confiance: 'a_verifier', reserve, observations: [obs(1), obs(2)] });
const nonEcrit = (champ: string, motif: string, portee: 'corps' | 'global' = 'corps'): DecisionChamp => ({ champ, portee, statut: 'non_ecrit', motif });

const decision = (champs: DecisionChamp[], candidatsNiveauFini: DecisionChamps['candidatsNiveauFini'] = []): DecisionChamps => ({ champs, candidatsNiveauFini });
const base = () => decision([
  ecritChamp('altitude_sommet_ngf', 'altitudeSommetNgf', 89.46, RESERVE),
  nonEcrit('hauteur_relative_m', 'aucun candidat trouvé dans le corpus'),
  nonEcrit('parking', 'libellés Cerfa présents mais valeurs non extractibles de la couche texte', 'global'),
]);

// index params journal : 0 dossier 1 corps 2 champ 3 valeur 4 unite 5 role 6 confiance 7 reserve 8 motif 9 piece 10 page 11 extrait
const journal = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql)).map((a) => a.params);
const insertsCorps = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_corps_batiment/i.test(a.sql));
const updatesCorps = () => H.appels.filter((a) => /UPDATE\s+permis_corps_batiment/i.test(a.sql));
const deletesJournal = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql));

beforeEach(() => { H.appels.length = 0; H.state.corps = []; H.state.origineCorps = {}; H.state.insertCorpsId = 100; });

describe('ecrireChamps — attribution', () => {
  it('0 corps → crée UN corps, écrit les valeurs, journalise retenue + ecartee(motif)', async () => {
    const r = await ecrireChamps(1, base(), 'auto');
    expect(r).toMatchObject({ statut: 'traite', corpsCree: true, corpsId: 100 });
    expect((r as { champsEcrits: string[] }).champsEcrits).toContain('altitudeSommetNgf');
    expect(insertsCorps()).toHaveLength(1);
    expect(updatesCorps()).toHaveLength(1);
    expect(deletesJournal()).toHaveLength(1); // recompute idempotent
    const retenue = journal().find((p) => p[2] === 'altitude_sommet_ngf' && p[5] === 'retenue')!;
    expect(retenue[1]).toBe(100); expect(retenue[6]).toBe('a_verifier'); expect(retenue[7]).toBe(RESERVE);
    const ecarteeHauteur = journal().find((p) => p[2] === 'hauteur_relative_m')!;
    expect(ecarteeHauteur[5]).toBe('ecartee'); expect(ecarteeHauteur[8]).toBe('aucun candidat trouvé dans le corpus');
  });

  it('1 corps → écrit dessus, aucun corps créé', async () => {
    H.state.corps = [{ id: 42 }];
    const r = await ecrireChamps(1, base(), 'auto');
    expect(r).toMatchObject({ statut: 'traite', corpsCree: false, corpsId: 42 });
    expect(insertsCorps()).toHaveLength(0);
    expect(journal().find((p) => p[2] === 'altitude_sommet_ngf' && p[5] === 'retenue')![1]).toBe(42);
  });

  it('≥2 corps → aucune écriture, journal ecartee (motif ambiguïté pour ce qui aurait pu être écrit) + alerte', async () => {
    H.state.corps = [{ id: 1 }, { id: 2 }];
    const r = await ecrireChamps(1, base(), 'auto');
    expect(r).toEqual({ statut: 'ambigu_plusieurs_corps', nbCorps: 2 });
    expect(insertsCorps()).toHaveLength(0);
    expect(updatesCorps()).toHaveLength(0);
    // recompute inoffensif (N8-B) : la purge du journal est BORNÉE à methode='motifs' → elle ne touche jamais nos lignes 'enonce'.
    expect(deletesJournal().every((a) => /methode\s*=\s*'motifs'/i.test(a.sql))).toBe(true);
    const sommet = journal().find((p) => p[2] === 'altitude_sommet_ngf')!;
    expect(sommet[5]).toBe('ecartee'); expect(sommet[8]).toBe(MOTIF_AMBIGU_CORPS); expect(sommet[1]).toBeNull();
  });
});

describe('ecrireChamps — invariant saisie & motifs', () => {
  it("champ déjà 'saisie' → non écrasé, journal 'ecartee' avec le motif « saisie prioritaire »", async () => {
    H.state.corps = [{ id: 42 }];
    H.state.origineCorps = { altitudeSommetNgf: 'saisie' };
    const r = await ecrireChamps(1, base(), 'auto');
    expect((r as { champsIgnoresSaisie: string[] }).champsIgnoresSaisie).toContain('altitudeSommetNgf');
    expect(updatesCorps()).toHaveLength(0); // rien réécrit
    const sommet = journal().find((p) => p[2] === 'altitude_sommet_ngf')!;
    expect(sommet[5]).toBe('ecartee'); expect(sommet[8]).toBe(MOTIF_SAISIE_PRIORITAIRE); expect(sommet[1]).toBe(42);
  });

  it('un champ non écrit ne pose AUCUNE valeur, seulement une ligne ecartee avec son motif', async () => {
    H.state.corps = [{ id: 42 }];
    const d = decision([nonEcrit('nb_etages', 'gabarit à plage annoncé pour plusieurs corps, valeur non attribuable')]);
    const r = await ecrireChamps(1, d, 'auto');
    expect((r as { champsEcrits: string[] }).champsEcrits).toEqual([]);
    expect(updatesCorps()).toHaveLength(0); // rien écrit sur le corps
    const l = journal().find((p) => p[2] === 'nb_etages')!;
    expect(l[5]).toBe('ecartee'); expect(l[3]).toBeNull(); // aucune valeur
    expect(l[8]).toContain('valeur non attribuable');
  });

  it('candidats « niveau fini » journalisés en role=candidat', async () => {
    H.state.corps = [{ id: 42 }];
    const d = decision([nonEcrit('altitude_sommet_ngf', 'aucune cote « acrotère » dans le corpus')],
      [{ valeur: 66.92, observations: [obs(3, 26)] }]);
    await ecrireChamps(1, d, 'auto');
    const nf = journal().filter((p) => p[2] === 'niveau_fini');
    expect(nf).toHaveLength(1); expect(nf[0][5]).toBe('candidat');
  });
});
