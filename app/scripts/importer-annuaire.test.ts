import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { construirePlan } from '../lib/gestion/annuaireImport';
import { COMPTES_VIDES } from '../lib/gestion/annuaireRepo';
import type { FeuilleLue } from '../lib/gestion/xlsxLecture';
import { FICHIERS, lireOptions, lireSources, rendreRapport } from './importer-annuaire';

/**
 * LOT ANNUAIRE-1 — LA COMMANDE D'IMPORT, PAR SES PARTIES PURES.
 *
 * 🔴 CE QU'AUCUN TEST NE FERA ICI : toucher la base, lire un vrai export, ou partir sur le réseau. La preuve que
 * l'écriture se comporte bien — idempotence, disparus marqués, homonymes non fusionnés, append-only — se fait sur un
 * CLUSTER JETABLE (`npm run gestion:annuaire:epreuve`), parce que c'est PostgreSQL qui la tient, pas nous.
 *
 * 🔒 Aucun nom, aucun numéro, aucune adresse réels.
 */

const feuille = (entetes: string[], lignes: string[][]): FeuilleLue => ({ entetes, lignes });

describe('la ligne de commande', () => {
  it('sans option : le dossier par défaut, et la SIMULATION', () => {
    const o = lireOptions([], '/defaut');
    expect(o).toEqual({ dossier: '/defaut', appliquer: false });
  });

  it('« --appliquer » est la SEULE façon d’écrire, et elle est explicite', () => {
    expect(lireOptions(['--appliquer'], '/defaut').appliquer).toBe(true);
    // Rien d'autre ne doit l'activer — surtout pas une faute de frappe voisine.
    for (const presque of ['--appliquez', '-appliquer', 'appliquer', '--appliquer=1']) {
      expect(lireOptions([presque], '/defaut').appliquer, presque).toBe(false);
    }
  });

  it('« --dossier= » choisit où lire, et accepte un chemin qui contient des espaces', () => {
    expect(lireOptions(['--dossier=/un/deux'], '/defaut').dossier).toBe('/un/deux');
    expect(lireOptions(['--dossier=/un deux/trois'], '/defaut').dossier).toBe('/un deux/trois');
  });

  it('les trois fichiers attendus sont nommés, et nommés une seule fois', () => {
    expect(Object.values(FICHIERS)).toEqual(['Bailleurs.xlsx', 'Lots.xlsx', 'Locataires.xlsx']);
  });
});

describe('🔴 un fichier manquant arrête TOUT', () => {
  it('parce qu’importer deux fichiers sur trois marquerait « disparu » l’intégralité du troisième', () => {
    const lire = (chemin: string): Buffer => {
      if (chemin.endsWith('Locataires.xlsx')) throw new Error('absent');
      throw new Error('absent');
    };
    expect(() => lireSources('/nulle/part', lire)).toThrow(/introuvable ou illisible/);
  });

  it('le message nomme le CHEMIN complet : c’est la seule chose qui permette de corriger', () => {
    try {
      lireSources('/nulle/part', () => { throw new Error('absent'); });
    } catch (e) {
      expect((e as Error).message).toContain('/nulle/part/Bailleurs.xlsx');
    }
  });

  it('un fichier présent mais illisible est refusé en nommant le fichier ET le motif', () => {
    const lire = (): Buffer => Buffer.from('ceci n’est pas un classeur', 'utf8');
    try {
      lireSources('/quelque/part', lire);
    } catch (e) {
      expect((e as Error).message).toContain('Bailleurs.xlsx');
      expect((e as Error).message).toContain('n’est pas un classeur');
    }
  });
});

describe('le compte rendu, lisible par quelqu’un qui n’a pas écrit le code', () => {
  const BAILLEURS = feuille(
    ['Id', 'Nom prop.', 'Prénom prop.', 'Mobile', 'Email'],
    [
      ['1', 'DUPONT', 'Jean', '0699991234', 'jean@fictif.fr'],
      ['3', 'DURAND', 'Paul', '', 'p1@fictif.fr'],
      ['4', 'DURAND', 'Paul', '', 'p2@fictif.fr'],
    ],
  );
  const LOTS = feuille(
    ['Id', 'Propriétaire', 'Déb gest.', 'Adresse', 'Commune'],
    [
      ['100', 'DUPONT Jean', '19/07/2018', '4 rue Fictive', 'PUTEAUX'],
      ['101', 'INCONNU Zoé', '01/01/2020', '7 rue Fictive', 'PUTEAUX'],
    ],
  );
  const LOCATAIRES = feuille(
    ['Id', 'Locataire', 'Lot', 'Effet', 'Sortie', 'Email'],
    [['500', 'BERNARD Alice', '100', '01/09/2022', '', 'alice@fictif.fr']],
  );
  const plan = construirePlan({ bailleurs: BAILLEURS, lots: LOTS, locataires: LOCATAIRES });

  it('la SIMULATION le dit dans son premier mot, et rappelle comment appliquer', () => {
    const t = rendreRapport(plan, COMPTES_VIDES, { dossier: '/d', appliquer: false }).join('\n');
    expect(t).toContain('SIMULATION (aucune écriture)');
    expect(t).toContain('CE QUI SERAIT ÉCRIT');
    expect(t).toContain('Rien n’a été écrit');
    expect(t).toContain('--appliquer');
  });

  it('l’import APPLIQUÉ le dit aussi, et ne propose plus d’appliquer', () => {
    const t = rendreRapport(plan, COMPTES_VIDES, { dossier: '/d', appliquer: true }).join('\n');
    expect(t).toContain('IMPORT APPLIQUÉ');
    expect(t).toContain('CE QUI A ÉTÉ ÉCRIT');
    expect(t).not.toContain('Rien n’a été écrit');
  });

  it('les quatre compteurs sont donnés en créé / mis à jour / inchangé — jamais un total seul', () => {
    const t = rendreRapport(plan, { ...COMPTES_VIDES, lotsCrees: 2, lotsInchanges: 7 }, { dossier: '/d', appliquer: true }).join('\n');
    for (const quoi of ['propriétaires', 'lots', 'locataires', 'baux']) expect(t).toContain(quoi);
    expect(t).toContain('créé(s)');
    expect(t).toContain('mis à jour');
    expect(t).toContain('inchangé(s)');
  });

  it('🔴 « disparus » est annoncé comme MARQUÉ, jamais comme effacé', () => {
    const t = rendreRapport(plan, { ...COMPTES_VIDES, disparus: 3 }, { dossier: '/d', appliquer: true }).join('\n');
    expect(t).toContain('DISPARUS DU DERNIER EXPORT (marqués, JAMAIS effacés) : 3');
  });

  it('🔴 les homonymes sont listés AVEC leurs identifiants, et avec le geste qui les répare', () => {
    const t = rendreRapport(plan, COMPTES_VIDES, { dossier: '/d', appliquer: true }).join('\n');
    expect(t).toContain('HOMONYMES');
    expect(t).toContain('JAMAIS fusionnés');
    expect(t).toContain('DURAND Paul');
    expect(t).toContain('3, 4');
    expect(t).toContain('distinguer les deux fiches dans WIPPIMMO');
  });

  it('chaque rejet est rendu avec sa source, sa LIGNE de tableur et son motif', () => {
    const t = rendreRapport(plan, COMPTES_VIDES, { dossier: '/d', appliquer: true }).join('\n');
    expect(t).toContain('REJETS (1)');
    expect(t).toContain('lots ligne 3');
    expect(t).toContain('INCONNU Zoé');
  });

  it('un rapport sans homonyme ni rejet ne montre PAS ces sections — pas de bruit inutile', () => {
    const propre = construirePlan({
      bailleurs: feuille(['Id', 'Nom prop.'], [['1', 'DUPONT']]),
      lots: feuille(['Id', 'Propriétaire'], [['100', 'DUPONT']]),
      locataires: feuille(['Id', 'Locataire', 'Lot'], []),
    });
    const t = rendreRapport(propre, COMPTES_VIDES, { dossier: '/d', appliquer: true }).join('\n');
    expect(t).not.toContain('HOMONYMES');
    expect(t).not.toContain('REJETS');
  });

  it('le dossier lu est rappelé : on doit savoir CE QU’on vient d’importer', () => {
    expect(rendreRapport(plan, COMPTES_VIDES, { dossier: '/un/dossier', appliquer: false }).join('\n'))
      .toContain('dossier : /un/dossier');
  });
});

/**
 * LA MIGRATION 253, ÉPROUVÉE PAR SA FORME — jamais par un fait qui change (« appliquée », « non appliquée »).
 * Ce qu'elle DOIT contenir, et ce qu'elle ne doit surtout pas.
 */
describe('la migration 253', () => {
  const sql = readFileSync('db/migrations/253_gestion_annuaire.sql', 'utf8');
  const sansCommentaires = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée les six tables de l’annuaire', () => {
    for (const t of [
      'gestion_annuaire_proprietaire', 'gestion_annuaire_lot', 'gestion_annuaire_locataire',
      'gestion_annuaire_occupation', 'gestion_annuaire_contact', 'gestion_annuaire_import',
    ]) {
      expect(sansCommentaires, t).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('🔴 porte une clé d’import UNIQUE partout : c’est elle qui rend le ré-import idempotent', () => {
    expect(sansCommentaires).toMatch(/wippimmo_id\s+text\s+NOT NULL UNIQUE/);
    expect(sansCommentaires).toMatch(/cle_personne\s+text\s+NOT NULL UNIQUE/);
  });

  it('🔴 porte `absent_le` sur tout ce qui peut disparaître d’un export — rien n’est jamais effacé', () => {
    expect((sansCommentaires.match(/absent_le\s+timestamptz/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('réserve la colonne du dossier Drive, SANS l’alimenter', () => {
    expect(sansCommentaires).toContain('drive_dossier_id text');
    // Aucune écriture : la colonne attend le lot suivant.
    expect(sansCommentaires).not.toMatch(/drive_dossier_id\s*=/);
  });

  it('élargit le journal du module à l’entité « annuaire », sans en retirer aucune', () => {
    expect(sansCommentaires).toContain("ADD CONSTRAINT gestion_journal_entite_chk");
    for (const e of ['message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
      'envoi', 'piece_drive', 'compte_google', 'annuaire']) {
      expect(sansCommentaires, e).toContain(`'${e}'`);
    }
  });

  it('garantit l’append-only du journal d’import EN BASE, par un trigger', () => {
    expect(sansCommentaires).toContain('gestion_annuaire_import_append_only');
    expect(sansCommentaires).toContain('BEFORE UPDATE OR DELETE ON gestion_annuaire_import');
    expect(sansCommentaires).toContain('BEFORE TRUNCATE ON gestion_annuaire_import');
  });

  it('🔴 n’EXIGE pas `pg_trgm` : les index de fragment sont conditionnels, le SQL de recherche est le même sans elle', () => {
    expect(sansCommentaires).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(sansCommentaires).toContain("WHERE extname = 'pg_trgm'");
    // Un repli existe pour le cas où l'extension manque.
    expect(sansCommentaires).toContain('gestion_annuaire_proprietaire_nom_idx');
  });

  it('donne la commande exacte pour l’appliquer, et celle pour revenir en arrière', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/253_gestion_annuaire.sql');
    expect(sql).toContain('DROP TABLE IF EXISTS gestion_annuaire_contact');
  });

  it('🔒 ne contient AUCUNE donnée : elle crée des tables vides', () => {
    expect(sansCommentaires).not.toMatch(/INSERT\s+INTO\s+gestion_annuaire_(proprietaire|lot|locataire|occupation|contact)/i);
    expect(sansCommentaires).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('s’exécute en UNE transaction : ou tout, ou rien', () => {
    expect(sansCommentaires.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(sansCommentaires.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});

/**
 * L'ÉPREUVE SUR CLUSTER JETABLE, éprouvée par sa FORME elle aussi : ce qui compte est qu'elle REFUSE de tourner
 * ailleurs — elle efface l'annuaire, et lancée par mégarde sur la base de travail elle détruirait le vrai.
 */
describe('le garde de l’épreuve jetable', () => {
  const src = readFileSync('app/scripts/annuaire-epreuve.ts', 'utf8');

  it('le nom de base autorisé est unique, et le garde compare la base RÉELLE', () => {
    expect(src).toContain("export const BASE_JETABLE = 'gestion_jetable'");
    expect(src).toContain('SELECT current_database()');
    expect(src).toContain('base !== BASE_JETABLE');
  });

  it('il refuse AVANT de vider quoi que ce soit', () => {
    expect(src.indexOf('base !== BASE_JETABLE')).toBeLessThan(src.indexOf('TRUNCATE'));
  });

  it('aucune option ne le contourne', () => {
    expect(src).not.toMatch(/--force|--quand-meme|ignorer/i);
  });

  it('🔒 elle n’imprime aucune donnée personnelle : que des comptes et des verdicts', () => {
    expect(src).toContain('AUCUNE DONNÉE PERSONNELLE');
    expect(src).not.toMatch(/console\.log\([^)]*\b(nom|email|telephone|adresse)\b\s*\)/);
  });
});
