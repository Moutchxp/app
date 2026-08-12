import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * T2 — lecture d'agrégation `chargerCumulsRuns`. On mocke `../db/client` (modèle demandeReponseRepo.test.ts) et on capture le
 * (sql, params) émis. Protocole : COMPORTEMENT (valeurs de retour, paramètres LIÉS) + SQL par FRAGMENTS sémantiques sur une
 * chaîne whitespace-normalisée, jamais la forme exacte du WHERE.
 */
const { appels, etat, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    return { rows: etat.rows, rowCount: etat.rows.length };
  };
  return { appels, etat, queryMock };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: vi.fn(), pool: {}, closePool: async () => undefined }));

import { chargerCumulsRuns, chargerSuiviReponses } from './reponsesSuivi';
import { bornesFenetres } from './fenetresCumul';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const MAINTENANT = new Date('2026-08-09T12:00:00.000Z');
const JOUR = 24 * 3_600_000;

beforeEach(() => { appels.length = 0; etat.rows = []; });

describe('B2 — chargerSuiviReponses : la date d’envoi (échéance à l’écran) se lit QUEL QUE SOIT le canal', () => {
  it('la jointure d’acheminement (ancre envoye_le) ne filtre PLUS canal=email → un dépôt formulaire est vu à l’écran', async () => {
    etat.rows = [];
    await chargerSuiviReponses();
    // la requête « suivi » = celle qui agrège min(a.envoye_le) en joignant demande_acheminement
    const dem = appels.find((a) => /min\(a\.envoye_le\)::text AS envoye_le/.test(a.sql));
    expect(dem, 'la requête suivi doit joindre l’acheminement pour l’ancre envoye_le').toBeDefined();
    const s = norm(dem!.sql);
    expect(s).toContain('LEFT JOIN demande_acheminement a ON a.demande_id = d.id');
    // B2 : plus AUCUN prédicat a.canal (le filtre e-mail est levé → la ligne canal='formulaire' de 119 est jointe → envoye_le lu)
    expect(s).not.toContain('a.canal');
  });
});

describe('T2 — le détail des dossiers ne liste QUE les dus (les obtenus vivent dans Archives, jamais dans les deux onglets)', () => {
  it('la requête de détail exige satisfait_le IS NULL (dossier dû) + dd.actif', async () => {
    await chargerSuiviReponses();
    const doss = appels.find((a) => norm(a.sql).includes('ORDER BY dd.demande_id, s.num_dau'));
    expect(doss, 'la requête de détail des dossiers doit être émise').toBeDefined();
    const s = norm(doss!.sql);
    expect(s).toContain('dd.satisfait_le IS NULL'); // seuls les dossiers DUS sont listés sous la demande
    expect(s).toContain('dd.actif');
  });
});

describe('T2 — chargerCumulsRuns : une requête, six fenêtres', () => {
  it('émet les cinq fenêtres bornées (FILTER + param lié) et le total sans borne', async () => {
    etat.rows = [{}];
    await chargerCumulsRuns(MAINTENANT);
    expect(appels).toHaveLength(1); // un seul aller-retour
    const sql = norm(appels[0].sql);
    expect(sql).toContain('FROM releve_run');
    // fenêtre bornée (24h = $1) : somme et comptage filtrés
    expect(sql).toContain('coalesce(sum(vus) FILTER (WHERE demarre_le >= $1), 0)::int AS w0_vus');
    expect(sql).toContain("count(demarre_le) FILTER (WHERE demarre_le >= $1 AND resultat = 'erreur')::int AS w0_err");
    // total (w5) SANS borne : ni FILTER de fenêtre sur la somme, ni sur le comptage de relèves
    expect(sql).toContain('coalesce(sum(vus), 0)::int AS w5_vus');
    expect(sql).toContain('count(demarre_le)::int AS w5_nb');
    // cumule aussi les compteurs de bruit et d'événement (échantillon)
    expect(sql).toContain('sum(rebonds_etrangers)');
    expect(sql).toContain('sum(pieces_deposees)');
    // cinq bornes LIÉES (24h,7j,30j,90j,365j), la total n'en consomme aucune
    const bornes = bornesFenetres(MAINTENANT);
    expect(appels[0].params).toEqual([
      bornes[0].depuis!.toISOString(), bornes[1].depuis!.toISOString(), bornes[2].depuis!.toISOString(),
      bornes[3].depuis!.toISOString(), bornes[4].depuis!.toISOString(),
    ]);
    expect(appels[0].params[0]).toBe(new Date(MAINTENANT.getTime() - JOUR).toISOString());
    expect(appels[0].params[4]).toBe(new Date(MAINTENANT.getTime() - 365 * JOUR).toISOString());
  });

  it('livre les SIX fenêtres en une seule charge → changer de période n’exige aucun rechargement', async () => {
    etat.rows = [{}];
    const cumuls = await chargerCumulsRuns(MAINTENANT);
    expect(Object.keys(cumuls).sort()).toEqual(['24h', '30j', '365j', '7j', '90j', 'total']);
  });

  it('reshape : chaque alias wN_col est remis sur la bonne fenêtre et la bonne propriété', async () => {
    etat.rows = [{
      w0_nb: 3, w0_err: 1, w0_vus: 30, w0_deja_connus: 5, w0_retenus: 2, w0_rebonds_etrangers: 9, w0_pieces_non_deposees: 4,
      w5_nb: 100, w5_err: 7, w5_vus: 1000, w5_enregistrees: 12, w5_pieces_deposees: 8,
    }];
    const cumuls = await chargerCumulsRuns(MAINTENANT);
    expect(cumuls['24h']).toMatchObject({ nbReleves: 3, nbErreurs: 1, vus: 30, dejaConnus: 5, retenus: 2, rebondsEtrangers: 9, piecesNonDeposees: 4 });
    expect(cumuls['24h'].rattaches).toBe(0); // alias absent du row → 0, jamais NULL
    expect(cumuls.total).toMatchObject({ nbReleves: 100, nbErreurs: 7, vus: 1000, enregistrees: 12, piecesDeposees: 8 });
  });

  it('aucune relève (row vide ou absent) → cumuls à zéro, jamais NULL', async () => {
    etat.rows = [{}];
    const c1 = await chargerCumulsRuns(MAINTENANT);
    expect(c1['7j']).toMatchObject({ nbReleves: 0, nbErreurs: 0, vus: 0, retenus: 0, enregistrees: 0 });
    etat.rows = []; // pas même une ligne d'agrégat
    const c2 = await chargerCumulsRuns(MAINTENANT);
    expect(c2.total.nbReleves).toBe(0);
    expect(c2.total.vus).toBe(0);
  });
});
