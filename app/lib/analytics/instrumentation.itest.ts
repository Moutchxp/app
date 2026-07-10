import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { majSession } from './session';
import { incrementerCompteur } from './writer';
import { communeDuPoint } from './commune';
import { queryAnalytics, fermerPoolAnalytics } from './pool';

/**
 * M2 — LOT 2. Tests d'INTÉGRATION (vraie base, 018 appliquée). Prouvent sur données RÉELLES : la session
 * éphémère (deux visites = deux identifiants distincts, non reliés), la montée d'`etape_max`, l'événement
 * `resultat` qui respecte l'anti-fingerprint (géo sans acquisition), et la dérivation « commune SANS
 * coordonnée » (le KNN ne renvoie qu'un INSEE). Données de test identifiables (sids fixes, commune test
 * 95999), nettoyées en beforeEach ET afterEach → aucun résidu.
 */
const q = (t: string, p: unknown[] = []) => queryAnalytics(t, p);

const SID_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SID_B = 'bbbbbbbb-2222-4222-9222-bbbbbbbbbbbb';
const COMMUNE_TEST = '95999'; // format INSEE valide, dept fictif → jamais une vraie ligne

async function nettoyer(): Promise<void> {
  await q(`DELETE FROM analytics_session WHERE session_id IN ($1,$2)`, [SID_A, SID_B]);
  await q(`DELETE FROM analytics_compteur_jour WHERE nom = 'resultat' AND commune_insee = $1`, [COMMUNE_TEST]);
  await q(`DELETE FROM analytics_compteur_jour WHERE nom = 'etape_atteinte' AND etape = 'axe' AND jour_paris = current_date`, []);
}

async function ligneSession(sid: string): Promise<{ etape_max: string; source: string | null; complete: boolean } | null> {
  const r = await q(
    `SELECT etape_max, source, complete FROM analytics_session WHERE session_id = $1`,
    [sid],
  );
  return (r.rows[0] as { etape_max: string; source: string | null; complete: boolean } | undefined) ?? null;
}

beforeEach(nettoyer);
afterEach(nettoyer);
afterAll(async () => {
  await fermerPoolAnalytics().catch(() => {});
});

describe('session éphémère — deux visites, deux identifiants distincts, non reliés', () => {
  it('deux sids → deux lignes de session distinctes (mesure des VISITES, pas des visiteurs)', async () => {
    await majSession(SID_A, 'intro', { source: 'insta' });
    await majSession(SID_B, 'intro', { source: 'google' });
    const a = await ligneSession(SID_A);
    const b = await ligneSession(SID_B);
    expect(a?.source).toBe('insta');
    expect(b?.source).toBe('google');
    expect(SID_A).not.toBe(SID_B); // aucun lien entre les deux visites
  });
});

describe('montée d’etape_max + complétion (le parcours du tunnel)', () => {
  it('etape_max ne recule jamais et la provenance n’est pas écrasée ; complete à resultat', async () => {
    await majSession(SID_A, 'intro', { source: 'insta', deviceType: 'mobile' });
    await majSession(SID_A, 'localisation'); // monte
    await majSession(SID_A, 'photo'); // rang inférieur (photo=2 < localisation=3) → ne redescend PAS
    let l = await ligneSession(SID_A);
    expect(l?.etape_max).toBe('localisation'); // resté au plus loin
    expect(l?.source).toBe('insta'); // provenance conservée (COALESCE)
    expect(l?.complete).toBe(false);
    await majSession(SID_A, 'resultat');
    l = await ligneSession(SID_A);
    expect(l?.etape_max).toBe('resultat');
    expect(l?.complete).toBe(true); // atteint le résultat = visite complète
  });
});

describe('événement resultat — géo SANS acquisition (anti-fingerprint réel)', () => {
  it('incrementerCompteur écrit un resultat (verdict+tranche+commune) et l’agrège (UPSERT)', async () => {
    await incrementerCompteur({ nom: 'resultat', verdict: 'SANS_VIS_A_VIS', scoreTranche: 2, communeInsee: COMMUNE_TEST });
    await incrementerCompteur({ nom: 'resultat', verdict: 'SANS_VIS_A_VIS', scoreTranche: 2, communeInsee: COMMUNE_TEST });
    const r = await q(
      `SELECT n FROM analytics_compteur_jour WHERE nom='resultat' AND verdict='SANS_VIS_A_VIS' AND score_tranche=2 AND commune_insee=$1 AND jour_paris=current_date`,
      [COMMUNE_TEST],
    );
    expect((r.rows[0] as { n: string }).n).toBe('2'); // deux résultats agrégés en une ligne
  });

  it('le CHECK 018 REJETTE toute tentative de mêler acquisition (source) et géo (verdict) sur une ligne', async () => {
    await expect(
      q(
        `INSERT INTO analytics_compteur_jour (jour_paris, nom, verdict, source, n) VALUES (current_date, 'resultat', 'SANS_VIS_A_VIS', 'insta', 1)`,
      ),
    ).rejects.toThrow(); // anti-fingerprint : impossible de stocker « provenance + verdict » ensemble
  });
});

describe('commune SANS coordonnée — le KNN ne renvoie que l’INSEE', () => {
  it('un point (Asnières, golden) → code INSEE, jamais une lat/lon', async () => {
    const insee = await communeDuPoint(48.90693182287072, 2.269431435588249);
    expect(insee).toBe('92004'); // Asnières-sur-Seine
    expect(insee).toMatch(/^\d{5}$/); // 5 chiffres, incapable de porter une coordonnée
  });
});
