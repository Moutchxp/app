import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleDossier, COMPTE_DEFAUT, lireOptions } from './copier-pieces-drive';
import { processusVivant } from './etat-copie-drive';

/**
 * LOT DRIVE-2 — LES COMMANDES PAR LEURS PARTIES PURES, ET LA MIGRATION PAR SA FORME.
 *
 * 🔒 Aucune donnée réelle.
 */

describe('la ligne de commande', () => {
  it('sans option : le compte de gestion, à blanc, sans limite', () => {
    expect(lireOptions([])).toEqual({ compte: COMPTE_DEFAUT, appliquer: false, limite: null });
  });

  it('🔴 « --appliquer » est la SEULE façon de copier, et rien d’approchant ne l’active', () => {
    expect(lireOptions(['--appliquer']).appliquer).toBe(true);
    for (const presque of ['--appliquez', '-appliquer', 'appliquer', '--appliquer=1', '--APPLIQUER']) {
      expect(lireOptions([presque]).appliquer, presque).toBe(false);
    }
  });

  it('« --limite= » n’accepte qu’un entier strictement positif', () => {
    expect(lireOptions(['--limite=20']).limite).toBe(20);
    for (const mauvais of ['--limite=0', '--limite=-5', '--limite=abc', '--limite=', '--limite=2.5']) {
      expect(lireOptions([mauvais]).limite, mauvais).toBeNull();
    }
  });

  it('« --compte= » choisit au nom de qui écrire', () => {
    expect(lireOptions(['--compte=a.jorel@sansvisavis.com']).compte).toBe('a.jorel@sansvisavis.com');
  });
});

describe('🔴 le dossier d’arrivée d’une décision', () => {
  it('un BIEN mène à SON « En attente », jamais au dossier du bien lui-même', () => {
    expect(cleDossier({ sorte: 'bien', cle: '315' })).toEqual({ sorte: 'en_attente', cle: 'bien|315' });
  });

  it('un PROPRIÉTAIRE mène au sien', () => {
    expect(cleDossier({ sorte: 'proprietaire', cle: '223' })).toEqual({ sorte: 'en_attente', cle: 'prop|223' });
  });

  it('🔴 aucune décision ne mène à « Travaux », « Assurances » ni « Litige »', () => {
    for (const d of [{ sorte: 'bien' as const, cle: '1' }, { sorte: 'proprietaire' as const, cle: '2' }]) {
      const c = cleDossier(d);
      expect(JSON.stringify(c)).not.toMatch(/Travaux|Assurances|Litige|Locataires/);
      expect(c?.sorte).toBe('en_attente');
    }
  });

  it('« 00 Non rattachés » n’a pas de clé fixe : ses dossiers AAAA/MM se créent à la demande', () => {
    expect(cleDossier({ sorte: 'non_rattache', annee: '2024', mois: '06' })).toBeNull();
  });
});

describe('🔴 le verrou, vu par la commande de suivi', () => {
  it('un processus vivant sur CETTE machine est reconnu', () => {
    expect(processusVivant(process.pid, 'ici', 'ici')).toBe(true);
  });

  it('un pid qui n’existe plus est reconnu mort', () => {
    // 2^22 - 1 : au-delà du pid_max usuel, donc jamais attribué.
    expect(processusVivant(4_194_303, 'ici', 'ici')).toBe(false);
  });

  it('🔴 sur une AUTRE machine, on répond « je ne sais pas » — jamais « mort »', () => {
    expect(processusVivant(1234, 'autre-mac', 'ici')).toBeNull();
    expect(processusVivant(null, 'ici', 'ici')).toBeNull();
    expect(processusVivant(1234, null, 'ici')).toBeNull();
  });
});

/** LA MIGRATION 255, éprouvée par sa FORME — jamais par un fait qui change. */
describe('la migration 255', () => {
  const sql = readFileSync('db/migrations/255_gestion_copie_pieces.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('🔴 ÉTEND la table du lot 5-PJ-B au lieu d’en créer une seconde', () => {
    expect(code).toContain('ALTER TABLE gestion_piece_drive');
    expect(code).not.toMatch(/CREATE TABLE IF NOT EXISTS gestion_piece_drive\b/);
  });

  it('exige les migrations 245 et 254', () => {
    expect(code).toContain("to_regclass('public.gestion_piece_drive')");
    expect(code).toContain("to_regclass('public.gestion_drive_arbre')");
    expect((code.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('🔴 « vérifié » exige une PREUVE : md5 et taille', () => {
    expect(code).toContain('gestion_piece_drive_verifie_chk');
    expect(code).toContain('CHECK (verifie_le IS NULL OR (md5 IS NOT NULL AND taille_octets IS NOT NULL))');
  });

  it('🔴 le VERROU est tenu par la base : une seule passe appliquée ouverte', () => {
    expect(code).toContain('gestion_drive_copie_passe_verrou');
    expect(code).toContain("WHERE termine_le IS NULL AND mode = 'applique'");
  });

  it('le journal des passes est append-only, mais une passe EN COURS se met à jour', () => {
    expect(code).toContain('gestion_drive_copie_passe_append_only');
    expect(code).toContain('IF TG_OP = \'UPDATE\' AND OLD.termine_le IS NULL THEN RETURN NEW; END IF;');
    expect(code).toContain('BEFORE TRUNCATE ON gestion_drive_copie_passe');
  });

  it('élargit le journal du module à « copie_piece », sans en retirer aucune entité', () => {
    for (const e of ['message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
      'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece']) {
      expect(code, e).toContain(`'${e}'`);
    }
  });

  it('est IDEMPOTENTE : les contraintes ne sont posées que si elles manquent', () => {
    expect(code).toContain("WHERE conname = 'gestion_piece_drive_origine_chk'");
    expect(code).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('donne la commande exacte, et dit ce que le retour en arrière NE fait PAS', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/255_gestion_copie_pieces.sql');
    expect(sql).toContain('ne supprime rien dans Drive');
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_piece_drive/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});

/** LA COMMANDE elle-même : ce qu'elle ne doit jamais faire. */
describe('🔴 les garanties de la commande de copie', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  const cli = sansCommentaires(readFileSync('app/scripts/copier-pieces-drive.ts', 'utf8'));

  it('aucun identifiant Drive écrit en dur', () => {
    expect(cli).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');
    expect(cli).not.toMatch(/'0A[A-Za-z0-9_-]{15,}'/);
    expect(cli).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  it('🔴 un refus du garde-fou ARRÊTE la passe — ce n’est pas un échec ordinaire', () => {
    expect(cli).toContain('le garde-fou a refusé une écriture : on s’arrête, c’est une anomalie');
  });

  it('elle pose un verrou avant d’écrire, et le libère en se clôturant', () => {
    expect(cli).toContain('INSERT INTO gestion_drive_copie_passe');
    expect(cli).toContain('Une copie est DÉJÀ en cours');
    expect(cli).toContain('termine_le = now()');
  });

  it('elle n’écrit rien en base hors ce qu’exige le lot', () => {
    const tables = [...cli.matchAll(/(?:INSERT INTO|UPDATE)\s+(gestion_\w+)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(['gestion_drive_copie_passe', 'gestion_journal']));
  });
});
