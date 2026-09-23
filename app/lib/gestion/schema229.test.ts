import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 3-bis — garde-fous STATIQUES de la migration 229 : on ÉTEINT les deux règles de domaine interne, parce qu'un
 * collègue du service location TRANSFÈRE à la gestion des mails de locataires — l'expéditeur devient alors une adresse
 * interne, et ces messages sont de vraies demandes.
 *
 * Ce que ces tests protègent, et qui ne se corrige pas après coup : que la migration n'ÉTEIGNE QUE ces deux règles (le
 * gabarit prouvé doit rester actif), qu'elle ne SUPPRIME rien, et qu'elle soit rejouable sans doubler le journal.
 *
 * `code` = la migration SANS ses lignes de commentaire `--`. `prose` = le fichier entier.
 */
const prose = readFileSync('db/migrations/229_gestion_regles_domaines_internes.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('229 — ce qu’elle éteint, et rien d’autre', () => {
  it('ne vise QUE les deux domaines internes, et uniquement des règles de domaine', () => {
    expect(code).toContain("WHERE type = 'domaine_expediteur'");
    expect(code).toContain("lower(valeur) IN ('criterimmo.fr', 'sansvisavis.com')");
  });

  it('LAISSE ACTIVE la règle « Document CRITERIMMO » — c’est le bruit prouvé par la sonde', () => {
    expect(code).not.toContain('gabarit_objet');
    expect(code).not.toContain('Document CRITERIMMO');
  });

  it('ne rallume AUCUNE des neuf règles de signal d’en-tête (elles écarteraient MONGA)', () => {
    expect(code).not.toContain('signal_entete');
    expect(/SET[^;]*actif\s*=\s*true/i.test(code)).toBe(false);
  });

  it('ÉTEINT, date et nomme l’auteur — jamais une suppression', () => {
    expect(/SET\s+actif = false/.test(code)).toBe(true);
    expect(code).toContain('desactive_le = now()');
    expect(code).toContain("desactive_par_libelle = 'migration 229'");
    expect(/DELETE\s+FROM|DROP\s+/i.test(code)).toBe(false);
  });

  it('réécrit le MOTIF pour qu’il dise l’état ET sa raison (c’est ce texte que l’écran montrera)', () => {
    expect(code).toContain('ÉTEINTE');
    expect(code).toContain('TRANSFÈRE');
    expect(code).toMatch(/VRAIES demandes/);
  });
});

describe('229 — éteindre une règle rend ce qu’elle avait écarté', () => {
  it('remet les trois marques d’exclusion à NULL (la contrainte de cohérence l’exige ensemble)', () => {
    expect(code).toContain('SET exclu_le = NULL, exclu_par_regle_id = NULL, exclu_motif = NULL');
  });

  it('ne rend QUE les messages écartés par une règle de domaine interne', () => {
    const partie2 = code.slice(code.indexOf('WITH rendus'));
    expect(partie2).toContain('r.id = m.exclu_par_regle_id');
    expect(partie2).toContain("r.type = 'domaine_expediteur'");
  });

  it('ne touche NI le fil, NI son état : classer sans suite est une décision humaine', () => {
    expect(/UPDATE\s+gestion_fil/i.test(code)).toBe(false);
  });

  it('la prose dit que cet UPDATE touchera 0 ligne aujourd’hui, et POURQUOI il existe quand même', () => {
    expect(prose).toContain('0 ligne');
    expect(prose).toContain('DOIT pouvoir rendre ses messages');
  });
});

describe('229 — les deux gestes sont journalisés, et la migration est rejouable', () => {
  it('journalise le changement d’état de chaque règle ET le retour de chaque message', () => {
    expect(code).toContain("'regle', maj.id, 'changement_etat', 'actif', 'inactif'");
    expect(code).toContain("'message', rendus.id, 'retour_file', 'exclu', 'dans la file'");
  });

  it('les lignes de journal sont liées à ce qui a RÉELLEMENT changé (CTE RETURNING) → aucun doublon au rejeu', () => {
    expect(code).toContain('RETURNING id, valeur');
    expect(code).toContain('FROM maj');
    expect(code).toContain('FROM rendus');
    expect(/AND actif\s*\n?\s*RETURNING/.test(code)).toBe(true); // le garde d'idempotence de la partie 1
  });

  it('aucune DDL : ni table, ni colonne, ni index, ni trigger', () => {
    expect(/CREATE\s+(TABLE|INDEX|TRIGGER|TYPE|FUNCTION)|ALTER\s+TABLE/i.test(code)).toBe(false);
  });

  it('une seule transaction, et un bloc de vérification en fin de fichier', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
  });

  it('est livrée NON APPLIQUÉE, avec sa commande d’application', () => {
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/229_gestion_regles_domaines_internes.sql');
  });
});

describe('229 — le module Permis n’est touché d’aucune façon', () => {
  it('n’écrit que dans les tables du module gestion', () => {
    const cibles = [...code.matchAll(/(?:UPDATE|INSERT INTO)\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
    expect(cibles.length).toBeGreaterThan(0);
    for (const t of cibles) expect(t.startsWith('gestion_')).toBe(true);
  });
});

describe('229 — le LOT ULTÉRIEUR est écrit noir sur blanc, pas seulement pensé', () => {
  it('la migration décrit la lecture de l’auteur d’origine d’un transfert', () => {
    expect(prose).toContain('Message transféré');
    expect(prose).toContain('LOT ULTÉRIEUR');
    expect(prose).toContain('jamais au jugé');
  });

  it('et le code le rappelle là où quelqu’un tombera dessus en l’implémentant', () => {
    // Espaces normalisés : le commentaire est replié sur plusieurs lignes, la phrase ne doit pas dépendre de la coupure.
    const src = readFileSync('app/lib/gestion/capture.ts', 'utf8').replace(/\s*\n\s*\*\s*/g, ' ');
    expect(src).toContain('LOT ULTÉRIEUR');
    expect(src).toContain('Message transféré');
    expect(src).toContain('migration 229');
  });
});
