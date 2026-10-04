import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LA MIGRATION 301 AVAIT CASSÉ LES DEUX ÉCRIVAINS DU REGISTRE DES COPIES ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI S'EST PASSÉ, MESURÉ À L'ÉCRAN LE 04/10/2026, EN DÉPOSANT UNE PIÈCE DANS « Test ».
 *
 * Le fichier est arrivé chez Google. Et l'écran a affiché, en anglais, l'erreur BRUTE de PostgreSQL :
 *   « there is no unique or exclusion constraint matching the ON CONFLICT specification »
 * Le registre, lui, n'a rien enregistré : un fichier déposé dont l'application ne savait plus rien.
 *
 * ═══ 🔴🔴 LA CAUSE, ET C'EST UNE RÈGLE DE POSTGRESQL, PAS UN BOGUE ═══════════════════════════════════════════════
 *
 * La migration 301 — appliquée au point 0 de ce même lot, avec l'accord d'Arno — a remplacé l'index unique
 * `gestion_piece_drive_unique_idx` (sur `piece_id, drive_dossier_id`, TOUTES les lignes) par
 * `gestion_piece_drive_unique_vivantes_idx`, le MÊME couple mais PARTIEL (`WHERE disparu_le IS NULL`). C'était le
 * correctif nécessaire : une ligne MORTE bloquait la réécriture d'un emplacement corrigé.
 *
 * 🔴 OR POUR VISER UN INDEX PARTIEL, UN `ON CONFLICT` DOIT RÉPÉTER SON PRÉDICAT. Sans lui, il ne désigne plus
 * AUCUN index, et PostgreSQL refuse la requête entière. Les deux écrivains du registre étaient donc morts :
 *   · `driveRepo.memoriserDepot` — le dépôt manuel, celui d'« Déposer ici » et du glisser-déposer ;
 *   · `copiePiecesReel.enregistrerCopie` — la copie automatique de nuit.
 *
 * ⚠️ AUCUN TEST NE POUVAIT LE VOIR AVANT : les tests de ces deux modules vérifient le SQL ÉMIS, et le SQL émis
 * était inchangé. C'est la BASE qui avait changé d'avis. Seule une écriture réelle pouvait le dire — et c'est
 * exactement ce qu'Arno demandait au point 5 : « éprouve-les pour de vrai ».
 *
 * ═══ 🔴 CE QUE CE FICHIER FIGE ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Le prédicat est CALCULÉ, jamais écrit en dur : avec la 301 il est obligatoire, sans elle il est INTERDIT (il ne
 * correspondrait pas à l'ancien index total, et l'on aurait la même erreur en miroir). Une base où la 301 n'est
 * pas appliquée doit continuer d'émettre le SQL d'avant, mot pour mot. C'est la discipline des sondes de schéma de
 * ce module, appliquée pour la première fois à un INDEX et non à une colonne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const appels: { sql: string; params: unknown[] }[] = [];
let indexPartielPresent = true;

vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    appels.push({ sql, params });
    /* La sonde d'index : c'est elle qui décide du prédicat, et le test la pilote. */
    if (sql.includes('FROM pg_indexes')) {
      return { rows: [{ n: indexPartielPresent ? 1 : 0 }], rowCount: 1 };
    }
    if (sql.includes('information_schema')) return { rows: [{ n: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }),
}));

beforeEach(() => {
  appels.length = 0;
  vi.resetModules();
});

describe('🔴🔴 ① le prédicat suit l’index réellement présent', () => {
  /**
   * 🔴 AVEC LA 301 : le prédicat est là, et il est écrit EXACTEMENT comme celui de l'index. Un `WHERE` qui dirait
   * la même chose autrement (`disparu_le is null` en minuscules passerait, mais `coalesce(disparu_le, …)` non) ne
   * serait pas reconnu : PostgreSQL compare les expressions, pas les intentions.
   */
  it('🔴🔴 index partiel présent ⇒ `ON CONFLICT (…) WHERE disparu_le IS NULL`', async () => {
    indexPartielPresent = true;
    const { sqlConflitCopieVivante } = await import('./copieDisparueSql');
    expect(await sqlConflitCopieVivante()).toBe(' WHERE disparu_le IS NULL');
  });

  /**
   * 🔴🔴 SANS LA 301 : AUCUN PRÉDICAT. C'est la moitié de la règle qu'on oublie — et elle est aussi importante
   * que l'autre, parce qu'un prédicat de trop produit la MÊME erreur, en miroir, sur une base plus ancienne.
   */
  it('🔴🔴 index partiel absent ⇒ aucun prédicat, le SQL d’avant mot pour mot', async () => {
    indexPartielPresent = false;
    const { sqlConflitCopieVivante } = await import('./copieDisparueSql');
    expect(await sqlConflitCopieVivante()).toBe('');
  });

  /** ⚠️ LA SONDE LIT LE CATALOGUE, PAS LA TABLE : elle répond juste même sur une table vide. */
  it('⚠️ la sonde interroge `pg_indexes` par le NOM de l’index', async () => {
    indexPartielPresent = true;
    const { uniciteCopiesVivantesDisponible } = await import('./schema');
    expect(await uniciteCopiesVivantesDisponible()).toBe(true);
    const sonde = appels.find((a) => a.sql.includes('pg_indexes'));
    expect(sonde).toBeDefined();
    expect(sonde?.params).toEqual(['gestion_piece_drive_unique_vivantes_idx']);
    expect(sonde?.sql).toContain("schemaname = 'public'");
  });
});

describe('🔴🔴 ② les DEUX écrivains du registre le portent', () => {
  /**
   * 🔴 ÉCRIT UNE SEULE FOIS, LU DEUX FOIS. Deux copies de ce fragment auraient divergé à la prochaine migration
   * d'index, et l'une des deux routes serait restée cassée sans que rien ne le dise — exactement ce qui vient
   * d'arriver, mais en pire, parce que la copie automatique tourne la nuit et que personne ne lit son journal
   * le lendemain matin.
   */
  it('🔴🔴 le dépôt manuel et la copie automatique appellent le même fragment', () => {
    const repo = readFileSync('app/lib/gestion/driveRepo.ts', 'utf8');
    const auto = readFileSync('app/lib/gestion/copiePiecesReel.ts', 'utf8');
    expect(repo).toContain('ON CONFLICT (piece_id, drive_dossier_id)${await sqlConflitCopieVivante()} DO NOTHING');
    expect(auto).toContain('ON CONFLICT (piece_id, drive_dossier_id)${await sqlConflitCopieVivante()} DO UPDATE SET');
    /* ⚠️ ON CHERCHE L'IMPORT, PAS SA FORME EXACTE : l'un des deux fichiers importe aussi `sqlCopieVivante` sur la
       même ligne, et figer l'ordre des noms importés ferait rougir ce test au premier reformatage. */
    for (const [nom, src] of [['driveRepo', repo], ['copiePiecesReel', auto]] as const) {
      expect(src, nom).toMatch(/import \{[^}]*sqlConflitCopieVivante[^}]*\} from '\.\/copieDisparueSql';/);
    }
  });

  /**
   * ⚠️ ET PLUS AUCUN `ON CONFLICT` NU SUR CE COUPLE DE COLONNES, nulle part. C'est l'assertion qui attrapera le
   * troisième écrivain, celui qu'on ajoutera dans six mois sans se souvenir de cette nuit.
   */
  it('⚠️ aucun `ON CONFLICT (piece_id, drive_dossier_id)` sans son prédicat', () => {
    for (const f of ['app/lib/gestion/driveRepo.ts', 'app/lib/gestion/copiePiecesReel.ts',
      'app/lib/gestion/nomUsageRepo.ts', 'app/lib/gestion/empreinteDriveRepo.ts']) {
      const src = readFileSync(f, 'utf8');
      const nus = [...src.matchAll(/ON CONFLICT \(piece_id, drive_dossier_id\)(?!\$\{)/g)];
      expect(nus, `${f} : ${nus.length} ON CONFLICT sans prédicat`).toHaveLength(0);
    }
  });
});

describe('🔴 ③ la migration 301 est bien celle qui a changé l’index', () => {
  /** ⚠️ ON LIT LA MIGRATION, pas un souvenir : c'est elle qui justifie la sonde, et son nom est dans la sonde. */
  it('🔴 la 301 crée l’index partiel que la sonde cherche', () => {
    const m = readFileSync('db/migrations/301_gestion_piece_drive_unique_vivantes.sql', 'utf8');
    expect(m).toContain('gestion_piece_drive_unique_vivantes_idx');
    expect(m).toContain('WHERE disparu_le IS NULL');
    /* 🔴 ET ELLE RETIRE L'ANCIEN : c'est ce qui rend le prédicat OBLIGATOIRE, et non seulement permis. */
    expect(m).toContain('gestion_piece_drive_unique_idx');
  });
});
