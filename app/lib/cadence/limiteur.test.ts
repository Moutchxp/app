import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Limiteur de cadence — comportement, sans base réelle : `query` est mocké et l'on observe les PARAMÈTRES LIÉS
 * (jamais la forme du SQL, cf. AGENTS.md). Prouve : sous le seuil → passe ; au seuil → refus + Retry-After ;
 * un COMPTE n'a aucune limite journalière ni totale ; les seuils viennent de la CONFIGURATION ; une base en
 * panne laisse passer (le limiteur n'ajoute jamais de panne).
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/client', () => ({ query }));

import { verifierCadence, purgerCadence, RETENTION_H } from './limiteur';
import { CADENCE_DEFAUT } from './config';

/** Réponse de `lireSeuilsCadence` (1re requête), puis une réponse de comptage par fenêtre. */
function base(seuils: Partial<typeof CADENCE_DEFAUT> = {}) {
  query.mockReset();
  query.mockResolvedValueOnce({
    rows: [{
      visiteur_analyses_par_10min: seuils.visiteurAnalysesPar10min ?? 3,
      visiteur_analyses_par_24h: seuils.visiteurAnalysesPar24h ?? 10,
      compte_analyses_par_10min: seuils.compteAnalysesPar10min ?? 10,
      compte_analyses_par_heure: seuils.compteAnalysesParHeure ?? 40,
      creation_compte_par_heure: seuils.creationComptreParHeure ?? 3,
      actif: seuils.actif ?? true,
    }],
  });
}

/** Comptage rendu pour la fenêtre suivante. */
const comptage = (n: number, ilYaSecondes = 0) =>
  query.mockResolvedValueOnce({ rows: [{ n: String(n), plus_ancienne: new Date(Date.now() - ilYaSecondes * 1000) }] });

beforeEach(() => query.mockReset());

describe('visiteur SANS compte — 3 / 10 min et 10 / 24 h', () => {
  it('SOUS le seuil → autorisé, et l’action est ENREGISTRÉE', async () => {
    base(); comptage(2); comptage(5); query.mockResolvedValueOnce({ rows: [] }); // insertion
    const v = await verifierCadence('analyse', '203.0.113.7', null);
    expect(v.autorise).toBe(true);
    expect(v.sansCompte).toBe(true);
    // Dernière requête = l'insertion, portée 'ip', sujet = l'adresse.
    expect(query.mock.calls.at(-1)?.[1]).toEqual(['analyse', 'ip', '203.0.113.7']);
  });

  it('AU seuil des 10 min → refusé, Retry-After = ce qu’il reste de la fenêtre, RIEN n’est enregistré', async () => {
    base(); comptage(3, 240); // 3 actions, la plus ancienne il y a 240 s sur une fenêtre de 600 s
    const v = await verifierCadence('analyse', '203.0.113.7', null);
    expect(v.autorise).toBe(false);
    expect(v.code).toBe('cadence_depassee');
    expect(v.retryApresS).toBe(360); // 600 - 240
    expect(v.sansCompte).toBe(true);
    expect(query).toHaveBeenCalledTimes(2); // config + 1 comptage, AUCUNE insertion
  });

  it('AU seuil des 24 h → refusé aussi (le visiteur, lui, a bien une limite journalière)', async () => {
    base(); comptage(0); comptage(10, 3600);
    const v = await verifierCadence('analyse', '203.0.113.7', null);
    expect(v.autorise).toBe(false);
    expect(v.retryApresS).toBe(86400 - 3600);
  });

  it('Retry-After ne descend JAMAIS sous 1 s', async () => {
    base(); comptage(3, 599.9);
    expect((await verifierCadence('analyse', 'x', null)).retryApresS).toBeGreaterThanOrEqual(1);
  });
});

describe('TITULAIRE DE COMPTE — rythme borné, AUCUNE limite journalière ni totale', () => {
  it('compté par COMPTE, jamais par adresse', async () => {
    base(); comptage(1); comptage(1); query.mockResolvedValueOnce({ rows: [] });
    const v = await verifierCadence('analyse', '203.0.113.7', 'internaute-A');
    expect(v.autorise).toBe(true);
    expect(v.sansCompte).toBe(false);
    expect(query.mock.calls.at(-1)?.[1]).toEqual(['analyse', 'compte', 'internaute-A']);
  });

  it('LE TEST DU LOT — 39 analyses dans l’heure et 500 dans la journée : TOUJOURS autorisé', async () => {
    base(); comptage(9); comptage(39); query.mockResolvedValueOnce({ rows: [] });
    expect((await verifierCadence('analyse', 'ip', 'A')).autorise).toBe(true);
    // Seules DEUX fenêtres sont interrogées (10 min, 1 h) : aucune fenêtre de 24 h n'existe pour un compte.
    const fenetres = query.mock.calls.slice(1, -1).map((c) => (c[1] as unknown[])[3]);
    expect(fenetres).toEqual([600, 3600]);
    expect(fenetres).not.toContain(86400);
  });

  it('au seuil du rythme (10 / 10 min) → refusé, mais c’est bien une limite de CADENCE', async () => {
    base(); comptage(10, 60);
    const v = await verifierCadence('analyse', 'ip', 'A');
    expect(v.autorise).toBe(false);
    expect(v.retryApresS).toBe(540);
    expect(v.sansCompte).toBe(false); // → le front n'invite PAS un titulaire à créer un compte
  });
});

describe('création de compte — 3 / heure par adresse', () => {
  it('au seuil → refusé', async () => {
    base(); comptage(3, 600);
    const v = await verifierCadence('creation_compte', '203.0.113.7', null);
    expect(v.autorise).toBe(false);
    expect(v.retryApresS).toBe(3000);
  });

  it('une seule fenêtre (1 h), portée adresse', async () => {
    base(); comptage(0); query.mockResolvedValueOnce({ rows: [] });
    await verifierCadence('creation_compte', '203.0.113.7', null);
    expect(query.mock.calls[1][1]).toEqual(['creation_compte', 'ip', '203.0.113.7', 3600]);
  });
});

describe('les seuils viennent de la CONFIGURATION, pas du code', () => {
  it('un seuil abaissé à 1 en base refuse dès la 1re action déjà comptée', async () => {
    base({ visiteurAnalysesPar10min: 1 }); comptage(1, 0);
    expect((await verifierCadence('analyse', 'ip', null)).autorise).toBe(false);
  });

  it('un seuil relevé en base laisse passer ce que le défaut aurait refusé', async () => {
    base({ visiteurAnalysesPar10min: 50, visiteurAnalysesPar24h: 500 }); comptage(20); comptage(20); query.mockResolvedValueOnce({ rows: [] });
    expect((await verifierCadence('analyse', 'ip', null)).autorise).toBe(true);
  });

  it('interrupteur `actif = false` → plus aucune limite, et aucun comptage', async () => {
    base({ actif: false });
    const v = await verifierCadence('analyse', 'ip', null);
    expect(v.autorise).toBe(true);
    expect(query).toHaveBeenCalledTimes(1); // la lecture de configuration, rien d'autre
  });
});

describe('le limiteur n’ajoute JAMAIS de panne', () => {
  it('base en panne → la requête PASSE (jamais de 429 par accident)', async () => {
    base(); // la configuration se lit ; c'est le COMPTAGE qui tombe
    query.mockImplementationOnce(async () => { throw new Error('relation cadence_evenement does not exist'); });
    expect((await verifierCadence('analyse', 'ip', null)).autorise).toBe(true);
  });

  it('purge best-effort : une erreur ne remonte pas', async () => {
    query.mockReset();
    query.mockImplementationOnce(async () => { throw new Error('db down'); });
    await expect(purgerCadence()).resolves.toBeUndefined();
  });

  it('la purge garde une marge au-delà de la plus longue fenêtre (24 h)', async () => {
    query.mockReset();
    query.mockImplementation(async () => ({ rows: [] }));
    await purgerCadence();
    expect(RETENTION_H).toBeGreaterThan(24);
    expect(query.mock.calls[0][1]).toEqual([RETENTION_H]);
  });
});
