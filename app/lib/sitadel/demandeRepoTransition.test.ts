import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * S41 — non-régression de la transition de statut brouillon → prete (`changerStatut`/`changerStatutLot`).
 *
 * Bug corrigé : l'UPDATE `SET statut = $2 … WHERE id = $1` recevait ses paramètres dans l'ordre `[nouveau, id]`
 * au lieu de `[id, nouveau]`. PostgreSQL liait alors la CHAÎNE de statut ('prete') au placeholder `WHERE id`
 * (bigint) → 22P02 « invalid input syntax for type bigint: "prete" », avalé en 503 côté route. Aucun test ne
 * couvrait la transition de statut : ce fichier ferme le trou.
 *
 * On mocke `../db/client` (modèle : demandeRepoCast.test.ts) et on FAIT tourner le callback de `withTransaction`
 * avec un `q` qui enregistre chaque (sql, params) — on assère le COMPORTEMENT (statut posé, journal écrit) et la
 * LIAISON réelle des paramètres, jamais la forme complète d'un WHERE par regex.
 */
const { lectures, ecritures, queryMock, withTransactionMock } = vi.hoisted(() => {
  const lectures: { sql: string; params: unknown[] }[] = [];
  const ecritures: { sql: string; params: unknown[] }[] = [];
  // Identité 'personne' COMPLÈTE (nom ≥3, adresse ≥8, e-mail valide) → le garde d'identité laisse passer la transition.
  const CONFIG_PERSONNE = {
    raison_sociale: '', forme_juridique: '', siege_adresse: '191 avenue Charles de Gaulle 92200 Neuilly-sur-Seine',
    representant_nom: 'Arnaud JOREL', representant_qualite: '', email_contact: 'a.jorel@sansvisavis.com', telephone: '',
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    lectures.push({ sql, params: params ?? [] });
    if (/profil_demandeur AS profil/.test(sql)) return { rows: [{ profil: 'personne' }] };
    if (/FROM config_demandeur/.test(sql)) return { rows: [CONFIG_PERSONNE] };
    return { rows: [] as unknown[] };
  };
  // Exécute VRAIMENT le callback transactionnel : chaque requête émise est capturée (sql + params liés).
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    const tx = async (sql: string, params?: unknown[]) => {
      ecritures.push({ sql, params: params ?? [] });
      if (/SELECT statut FROM demande/.test(sql)) return { rows: [{ statut: 'brouillon' }] };
      return { rows: [] as unknown[] };
    };
    return fn(tx);
  };
  return { lectures, ecritures, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
  pool: {},
  closePool: async () => undefined,
}));

import { changerStatut } from './demandeRepo';

beforeEach(() => { lectures.length = 0; ecritures.length = 0; });

const norm = (s: string) => s.replace(/\s+/g, ' ');

describe('S41 — transition brouillon → prete : liaison des paramètres (régression 22P02)', () => {
  it('lie l’id au placeholder « WHERE id » et le statut au placeholder « SET statut »', async () => {
    await changerStatut(154, 'prete', 'auteur-test');

    const upd = ecritures.find((e) => /UPDATE demande SET statut/.test(e.sql));
    expect(upd, 'un UPDATE de statut doit être émis').toBeDefined();
    const sql = norm(upd!.sql);

    // Fragments sémantiques (jamais la forme complète du WHERE).
    expect(sql).toContain('SET statut = $2');
    expect(sql).toContain('WHERE id = $1');

    // COMPORTEMENT : la valeur liée au placeholder « WHERE id » est l'id (bigint), pas le statut.
    // C'est exactement ce qui échouait (params = ['prete', 154] → $1 = 'prete' → 22P02).
    const idxId = Number(/WHERE id = \$(\d+)/.exec(sql)![1]) - 1;
    const idxStatut = Number(/SET statut = \$(\d+)/.exec(sql)![1]) - 1;
    expect(upd!.params[idxId]).toBe(154);
    expect(upd!.params[idxStatut]).toBe('prete');
  });

  it('écrit le journal de transition brouillon → prete', async () => {
    await changerStatut(154, 'prete', 'auteur-test');

    const jrn = ecritures.find((e) => /INSERT INTO demande_journal/.test(e.sql));
    expect(jrn, 'la transition doit être journalisée').toBeDefined();
    // Colonnes : (demande_id, statut_avant, statut_apres, motif, auteur) — cf. demandeRepo.
    expect(jrn!.params[0]).toBe(154);          // demande_id
    expect(jrn!.params[1]).toBe('brouillon');  // statut_avant (lu par le SELECT statut préalable)
    expect(jrn!.params[2]).toBe('prete');      // statut_apres
    expect(jrn!.params[4]).toBe('auteur-test');
  });

  it('n’altère pas demande_dossier lors d’un passage en prete (seule l’annulation le fait)', async () => {
    await changerStatut(154, 'prete', 'auteur-test');
    expect(ecritures.some((e) => /UPDATE demande_dossier/.test(e.sql))).toBe(false);
  });
});

describe('Q7 — annulation d’une demande : libère TOUJOURS ses dossiers (de nouveau proposables)', () => {
  it('changerStatut(…, "annulee") pose statut = "annulee" ET émet UPDATE demande_dossier SET actif = false (id lié)', async () => {
    await changerStatut(154, 'annulee', 'auteur-test');

    // 1) le statut posé est bien la NOUVELLE valeur (jamais 'abandonnee')
    const upd = ecritures.find((e) => /UPDATE demande SET statut/.test(e.sql));
    expect(upd, 'un UPDATE de statut doit être émis').toBeDefined();
    const sql = norm(upd!.sql);
    const idxStatut = Number(/SET statut = \$(\d+)/.exec(sql)![1]) - 1;
    expect(upd!.params[idxStatut]).toBe('annulee');

    // 2) les dossiers sont libérés (actif=false) → l'index partiel actif ne les retient plus → reproposables
    const lib = ecritures.find((e) => /UPDATE demande_dossier SET actif = false/.test(e.sql));
    expect(lib, 'l’annulation doit libérer les dossiers').toBeDefined();
    expect(lib!.params[0]).toBe(154); // demande_id lié
  });
});
