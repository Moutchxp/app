import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryResult, QueryResultRow } from 'pg';

/**
 * FIG-1 — REGISTRE append-only versionné de l'état figé. `db/client` mocké (routé par fragment SQL) ; aucune base réelle. On éprouve :
 *   · figerVersionGel APPEND une nouvelle version (max+1) et n'émet QUE des INSERT (jamais UPDATE/DELETE) ;
 *   · une 2e capture crée la version 2 (la version 1 n'est jamais réécrite) ;
 *   · résilience : registre absent (to_regclass NULL) → NO-OP propre ;
 *   · versionGelCourante rend { id, version } ou null ; historiqueGel replie sur [] si la table manque (42P01).
 * La garantie d'immuabilité EN BASE (UPDATE/DELETE/TRUNCATE refusés) vit dans le trigger de la migration 169 (bloc de vérification).
 */
type Call = { sql: string; params: unknown[] };
const faussReq = (repond: (sql: string) => { rows?: QueryResultRow[]; rowCount?: number }) => {
  const calls: Call[] = [];
  const q = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    const r = repond(sql);
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) } as QueryResult<QueryResultRow>;
  }) as never;
  return { q, calls };
};

const H = vi.hoisted(() => {
  const state = {
    gelPresent: true as boolean,        // to_regclass('public.permis_gel')
    prochaineVersion: 1 as number,      // COALESCE(max(version),0)+1
    nouvelId: 7 as number,              // permis_gel.id renvoyé par le RETURNING
    nbParcelles: 2 as number,
    nbBati: 3 as number,
    nbCorps: 3 as number,               // B1 — lignes INSERT dans permis_gel_corps
    nbEmprises: 3 as number,            // B1 — lignes INSERT dans permis_gel_emprise
    courante: null as null | { id: number; version: number },
    historiqueThrows42P01: false as boolean,
    historiqueRows: [] as QueryResultRow[],
    calls: [] as { sql: string; params: unknown[] }[], // trace de TOUT SQL émis (routé par fragment) pour asserter la capture
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    state.calls.push({ sql, params: params ?? [] });
    if (/to_regclass\('public\.permis_gel'\)/i.test(sql)) return { rows: [{ t: state.gelPresent ? 'permis_gel' : null }] };
    if (/COALESCE\(max\(version\), 0\) \+ 1/i.test(sql)) return { rows: [{ prochaine: state.prochaineVersion }] };
    if (/INSERT INTO permis_gel \(/i.test(sql)) return { rows: [{ id: state.nouvelId }], rowCount: 1 };
    if (/INSERT INTO permis_gel_parcelle/i.test(sql)) return { rows: [], rowCount: state.nbParcelles };
    if (/INSERT INTO permis_gel_bati/i.test(sql)) return { rows: [], rowCount: state.nbBati };
    if (/INSERT INTO permis_gel_corps/i.test(sql)) return { rows: [], rowCount: state.nbCorps };     // B1
    if (/INSERT INTO permis_gel_emprise/i.test(sql)) return { rows: [], rowCount: state.nbEmprises }; // B1
    if (/SELECT id, version FROM permis_gel WHERE dossier_id/i.test(sql)) return { rows: state.courante ? [state.courante] : [] };
    if (/FROM permis_gel g WHERE g\.dossier_id/i.test(sql)) {
      if (state.historiqueThrows42P01) throw Object.assign(new Error('undefined table'), { code: '42P01' });
      return { rows: state.historiqueRows };
    }
    return { rows: [], rowCount: 0 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => H.queryMock(sql, params),
  withTransaction: async (fn: (q: unknown) => unknown) => fn((sql: string, params?: unknown[]) => H.queryMock(sql, params)),
}));

import { figerVersionGel, figerVersionValidation, versionGelCourante, versionValidationCourante, historiqueGel } from './gelRepo';
import type { RequeteTx } from '../db/client';

describe('figerVersionGel — APPEND d’une version (jamais un écrasement)', () => {
  it('registre présent, aucune version encore → APPEND la version 1 (en-tête + détails), INSERT uniquement', async () => {
    H.state.gelPresent = true; H.state.prochaineVersion = 1; H.state.nouvelId = 7; H.state.nbParcelles = 2; H.state.nbBati = 3;
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r).toMatchObject({ enregistre: true, version: 1, gelId: 7, nbParcelles: 2, nbBati: 3 });
  });

  it('une VERSION existe déjà (max=1) → une 2e capture crée la VERSION 2 (la 1 n’est jamais réécrite)', async () => {
    H.state.prochaineVersion = 2; // COALESCE(max(version),0)+1 = 2
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r.version).toBe(2);
    expect(r.enregistre).toBe(true);
  });

  it('registre ABSENT (migration 169 non appliquée) → NO-OP propre (enregistre=false), aucun crash', async () => {
    H.state.gelPresent = false;
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r.enregistre).toBe(false);
    expect(r.raison).toMatch(/migration 169/i);
  });
});

describe('versionGelCourante', () => {
  it('null si le registre est absent', async () => {
    const { q } = faussReq((sql) => /to_regclass/i.test(sql) ? { rows: [{ t: null }] } : { rows: [] });
    expect(await versionGelCourante(q as RequeteTx, 531)).toBeNull();
  });
  it('{ id, version } si une version existe', async () => {
    const { q } = faussReq((sql) =>
      /to_regclass/i.test(sql) ? { rows: [{ t: 'permis_gel' }] }
      : /SELECT id, version FROM permis_gel/i.test(sql) ? { rows: [{ id: '9', version: '3' }] }
      : { rows: [] });
    expect(await versionGelCourante(q as RequeteTx, 531)).toEqual({ id: 9, version: 3 });
  });
});

describe('historiqueGel', () => {
  it('replie sur [] si la table manque (42P01)', async () => {
    H.state.historiqueThrows42P01 = true;
    expect(await historiqueGel(531)).toEqual([]);
    H.state.historiqueThrows42P01 = false;
  });
  it('mappe les versions (ordre croissant, comptes de détail)', async () => {
    H.state.historiqueRows = [
      { version: '1', gele_le: new Date('2026-08-23T00:00:00Z'), gele_par: 'migration:169 (backfill v1)',
        empreinte_complete: true, empreinte_surface_m2: '263.3', empreinte_millesime: '2026-06-01',
        bati_capture: true, bati_nb_batiments: 2, nb_parcelles: '1', nb_bati: '2' },
    ];
    const h = await historiqueGel(531);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ version: 1, empreinteSurfaceM2: 263.3, empreinteMillesime: '2026-06-01', nbParcelles: 1, nbBati: 2 });
    H.state.historiqueRows = [];
  });
});

// ── B1 (RATT-EDIT) — figerVersionValidation capture désormais le DÉTAIL corps/emprise (permis_gel_corps / permis_gel_emprise) ──
// Colonnes ATTENDUES dans la copie (toutes celles de la source SAUF id/dossier_id ; l'id source devient corps_id/emprise_id, asserté à part).
const CORPS_COLS = [
  'altitude_sommet_ngf', 'altitude_sommet_ngf_origine', 'altitude_sommet_ngf_confirme_le', 'altitude_sommet_ngf_confirme_par',
  'repere', 'nb_etages', 'nb_etages_origine', 'nb_niveaux_sous_sol', 'nb_niveaux_sous_sol_origine',
  'altitude_dernier_plancher_ngf', 'altitude_dernier_plancher_ngf_origine', 'hauteur_relative_m', 'hauteur_relative_m_origine',
  'altitude_terrain_naturel_ngf', 'altitude_terrain_naturel_ngf_origine', 'hauteur_max_plu_ngf', 'hauteur_max_plu_ngf_origine',
  'altitude_plateau_nivellement_ngf', 'altitude_plateau_nivellement_ngf_origine', 'adresse', 'adresse_origine',
  'emprise', 'emprise_origine', 'cleabs_affecte', 'nom_repli',
  'emprise_validee_id', 'emprise_validee_le', 'emprise_validee_par', 'actif', 'desactive_le', 'desactive_par', 'maj_le', 'maj_par',
];
const EMPRISE_COLS = [
  'geom', 'ajustement', 'surface_m2', 'validee_le', 'validee_par',
  'libelle', 'calage', 'provenance', 'reconstitution', 'piece_id', 'page', 'residu_m', 'cree_par', 'cree_le',
];
// « alias.colonne » présent comme JETON ENTIER (borne \b : c.emprise NE matche PAS c.emprise_origine — évite le faux positif par préfixe).
const aColonne = (sql: string, alias: string, col: string) => new RegExp('\\b' + alias + '\\.' + col + '\\b').test(sql);

describe('figerVersionValidation — APPEND une version de VALIDATION + capture le DÉTAIL corps/emprise (B1)', () => {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const sqlDe = (re: RegExp) => norm(H.state.calls.map((c) => c.sql).find((s) => re.test(s)) ?? '');
  const reset = () => {
    H.state.gelPresent = true; H.state.prochaineVersion = 1; H.state.nouvelId = 7;
    H.state.nbParcelles = 2; H.state.nbBati = 3; H.state.nbCorps = 3; H.state.nbEmprises = 3; H.state.calls = [];
  };

  it('registre présent → APPEND (gele_par préfixé « validation: »), fige gel_corps + gel_emprise, renvoie nbCorps/nbEmprises', async () => {
    reset();
    const r = await figerVersionValidation(7424, 'admin:decision');
    expect(r).toMatchObject({ enregistre: true, version: 1, gelId: 7, nbParcelles: 2, nbBati: 3, nbCorps: 3, nbEmprises: 3 });
    // Le préfixe voyage en PARAMÈTRE LIÉ (jamais figé dans le texte SQL).
    const enTete = H.state.calls.find((c) => /INSERT INTO permis_gel \(/i.test(c.sql));
    expect(enTete?.params).toContain('validation:admin:decision');
    // Les deux nouveaux INSERT de détail sont bien émis.
    expect(sqlDe(/INSERT INTO permis_gel_corps/i)).not.toBe('');
    expect(sqlDe(/INSERT INTO permis_gel_emprise/i)).not.toBe('');
  });

  it('CAPTURE CORPS champ par champ : toutes les colonnes de permis_corps_batiment sauf id/dossier_id (id → corps_id)', async () => {
    reset();
    await figerVersionValidation(7424, 'admin:decision');
    const sql = sqlDe(/INSERT INTO permis_gel_corps/i);
    // TOUS les corps du dossier (actif OU inactif : aucun filtre `actif`, aucune LIMIT) → un corps supprimé reste restaurable.
    expect(sql).toContain('FROM permis_corps_batiment c WHERE c.dossier_id = $1');
    expect(sql).not.toMatch(/c\.actif\s*(=|is)/i);
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(aColonne(sql, 'c', 'id')).toBe(true);          // id source → corps_id (référence historique)
    for (const col of CORPS_COLS) expect(aColonne(sql, 'c', col), `colonne corps manquante: c.${col}`).toBe(true);
  });

  it('CAPTURE EMPRISE champ par champ : toutes les colonnes de permis_emprise_reconstruite sauf id/dossier_id (id → emprise_id)', async () => {
    reset();
    await figerVersionValidation(7424, 'admin:decision');
    const sql = sqlDe(/INSERT INTO permis_gel_emprise/i);
    // TOUTES les emprises du dossier (l'ENSEMBLE → restaure aussi suppressions/ajouts) — aucune LIMIT.
    expect(sql).toContain('FROM permis_emprise_reconstruite e WHERE e.dossier_id = $1');
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(aColonne(sql, 'e', 'id')).toBe(true);          // id source → emprise_id
    expect(aColonne(sql, 'e', 'corps_id')).toBe(true);    // corps porteur conservé
    for (const col of EMPRISE_COLS) expect(aColonne(sql, 'e', col), `colonne emprise manquante: e.${col}`).toBe(true);
  });

  it('« 3 corps → 3 emprises » : les comptes suivent le nombre de lignes source (cas du dossier 7424)', async () => {
    reset();
    const r = await figerVersionValidation(7424, 'admin:decision');
    expect(r.nbCorps).toBe(3);
    expect(r.nbEmprises).toBe(3);
  });

  it('deux validations successives → version 1 puis 2, la 1re jamais réécrite (INSERT only : aucun UPDATE/DELETE/TRUNCATE)', async () => {
    reset(); H.state.prochaineVersion = 1;
    const r1 = await figerVersionValidation(7424, 'admin:decision');
    expect(r1.version).toBe(1);
    H.state.prochaineVersion = 2; H.state.calls = [];
    const r2 = await figerVersionValidation(7424, 'admin:decision');
    expect(r2.version).toBe(2);
    // AUCUN ordre destructif sur QUELQUE table que ce soit dans le chemin de validation (corps/emprise compris).
    for (const c of H.state.calls) expect(c.sql, `SQL destructif inattendu: ${c.sql}`).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('COMPORTEMENT ANTÉRIEUR PRÉSERVÉ : émet toujours l’en-tête permis_gel + gel_parcelle + gel_bati (SQL inchangé)', async () => {
    reset();
    await figerVersionValidation(7424, 'admin:decision');
    expect(sqlDe(/INSERT INTO permis_gel \(/i)).not.toBe('');
    expect(sqlDe(/INSERT INTO permis_gel_parcelle/i)).toContain("FROM permis_parcelle pp WHERE pp.dossier_id = $1 AND pp.role = 'origine'");
    const bati = sqlDe(/INSERT INTO permis_gel_bati/i);
    expect(bati).toContain('ST_Multi(ST_Force2D(b.geom))');
    expect(bati).toContain('ST_Intersects(b.geom, pe.geom)');
  });

  it('registre ABSENT (migration 169 non appliquée) → NO-OP propre, aucun INSERT gel_corps/gel_emprise émis', async () => {
    reset(); H.state.gelPresent = false;
    const r = await figerVersionValidation(7424, 'admin:decision');
    expect(r.enregistre).toBe(false);
    expect(r.raison).toMatch(/migration 169/i);
    expect(sqlDe(/INSERT INTO permis_gel_corps/i)).toBe('');
    expect(sqlDe(/INSERT INTO permis_gel_emprise/i)).toBe('');
  });
});

describe('versionValidationCourante — référence de la validation d’origine (lecture pour C1)', () => {
  it('null si le registre est absent', async () => {
    const { q } = faussReq((sql) => /to_regclass/i.test(sql) ? { rows: [{ t: null }] } : { rows: [] });
    expect(await versionValidationCourante(q as RequeteTx, 7424)).toBeNull();
  });
  it('null si AUCUNE version de validation (permis sans gel = 100 % des permis actuels) → C1 : rien à restaurer, pas d’erreur', async () => {
    const { q } = faussReq((sql) => /to_regclass/i.test(sql) ? { rows: [{ t: 'permis_gel' }] } : { rows: [] });
    expect(await versionValidationCourante(q as RequeteTx, 7424)).toBeNull();
  });
  it('{ id, version } de la validation la plus récente, filtrée sur le préfixe « validation: »', async () => {
    const { q, calls } = faussReq((sql) =>
      /to_regclass/i.test(sql) ? { rows: [{ t: 'permis_gel' }] }
      : /SELECT id, version FROM permis_gel/i.test(sql) ? { rows: [{ id: '12', version: '4' }] }
      : { rows: [] });
    expect(await versionValidationCourante(q as RequeteTx, 7424)).toEqual({ id: 12, version: 4 });
    const sel = calls.find((c) => /SELECT id, version FROM permis_gel/i.test(c.sql));
    expect(sel?.sql).toMatch(/gele_par LIKE/i);
    expect(sel?.params).toContain('validation:%');
  });
});

// ── GARDE append-only (défense SECONDAIRE ; la vraie garantie est le trigger en base, migration 169) ──────────────────────
describe('GARDE append-only du registre de gel — aucun chemin d’écriture destructif dans le dépôt', () => {
  const TABLES = ['permis_gel', 'permis_gel_parcelle', 'permis_gel_bati', 'permis_gel_corps', 'permis_gel_emprise'];
  const interdits = TABLES.flatMap((t) => [
    new RegExp('UPDATE\\s+' + t + '\\b', 'i'),
    new RegExp('DELETE\\s+FROM\\s+' + t + '\\b', 'i'),
    new RegExp('TRUNCATE\\s+' + t + '\\b', 'i'),
  ]);
  // ROBUSTE à la concurrence : un AUTRE test (gardeImports.test.ts) crée puis SUPPRIME un fichier temporaire dans app/lib/svv/ pendant
  //   qu'il tourne. Les workers vitest s'exécutent en parallèle → une entrée peut disparaître ENTRE le readdir et le stat/read (ENOENT).
  //   Un fichier volatil d'un autre test n'est de toute façon pas du code applicatif à auditer → on l'IGNORE, jamais un échec de course.
  const fichiersTs = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
      } catch { /* entrée disparue en cours de scan (temp d'un test concurrent) → ignorée */ }
    }
    return out;
  };
  it('aucun UPDATE/DELETE/TRUNCATE sur les tables de gel dans le code applicatif (.ts hors tests)', () => {
    const coupables: string[] = [];
    for (const f of fichiersTs(join(process.cwd(), 'app'))) {
      let src: string;
      try { src = readFileSync(f, 'utf8'); } catch { continue; } // fichier disparu entre le scan et la lecture (temp concurrent) → ignoré
      if (interdits.some((re) => re.test(src))) coupables.push(f);
    }
    expect(coupables, `écriture destructive sur une table de gel détectée (append-only) : ${coupables.join(', ')}`).toEqual([]);
  });
});
