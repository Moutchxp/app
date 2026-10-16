import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Adresse de résidence principale DU COMPTE (lot COORDONNEES-CONNU-REEL, migration 364) : règles pures, écriture
 * (`declarerResidence`) et effacement avec l'identité. Base simulée par SQL ; aucun accès réel.
 */
const { withTransaction, query } = vi.hoisted(() => ({ withTransaction: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ withTransaction, query }));

import { normaliserAdresse, residenceDeclaree, LONGUEUR_MAX_ADRESSE } from './residenceCompte';
import { declarerResidence, effacerInternaute } from './cycleVie';

const BIEN = { adresseSaisie: '8 rue Denfert', adresseNormalisee: '8 Rue Denfert - Rochereau, Asnières-sur-Seine', payload: {} };

describe('ce qu’une analyse déclare comme résidence principale', () => {
  it('« Oui » → l’adresse du bien analysé (normalisée, sinon saisie)', () => {
    expect(residenceDeclaree({ ...BIEN, residencePrincipale: true })).toEqual({ adresse: '8 Rue Denfert - Rochereau, Asnières-sur-Seine', source: 'tunnel_bien_analyse' });
    expect(residenceDeclaree({ ...BIEN, adresseNormalisee: null, residencePrincipale: true })).toEqual({ adresse: '8 rue Denfert', source: 'tunnel_bien_analyse' });
  });
  it('« Non » → l’adresse saisie, jamais celle du bien', () => {
    expect(residenceDeclaree({ ...BIEN, residencePrincipale: false, payload: { adresseResidence: '  12 Rue de la Paix\n75002 Paris ' } }))
      .toEqual({ adresse: '12 Rue de la Paix 75002 Paris', source: 'tunnel_adresse_saisie' });
  });
  it('pas de réponse, adresse vide ou démesurée → rien', () => {
    expect(residenceDeclaree({ ...BIEN, residencePrincipale: null })).toBeNull();
    expect(residenceDeclaree({ ...BIEN, residencePrincipale: false, payload: { adresseResidence: '   ' } })).toBeNull();
    expect(residenceDeclaree({ ...BIEN, adresseNormalisee: null, adresseSaisie: null, residencePrincipale: true })).toBeNull();
    expect(normaliserAdresse('x'.repeat(LONGUEUR_MAX_ADRESSE + 1))).toBeNull();
    expect(normaliserAdresse(42)).toBeNull();
  });
});

describe('declarerResidence — la plus récente remplace la précédente, chaque changement journalisé', () => {
  let ecrits: { sql: string; params: unknown[] }[];
  const installer = (avant: { adresse_residence: string | null } | null) => {
    ecrits = [];
    const q = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/^\s*SELECT adresse_residence/.test(sql)) return { rows: avant ? [avant] : [] };
      ecrits.push({ sql: sql.replace(/\s+/g, ' '), params });
      return { rows: [] };
    });
    withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
    return q;
  };
  beforeEach(() => { withTransaction.mockReset(); });

  it('nouvelle adresse → UPDATE de la colonne du compte + journal « rectification » SANS l’adresse', async () => {
    installer({ adresse_residence: '1 Ancienne Rue' });
    expect(await declarerResidence('uuid-1', '12 Rue de la Paix 75002 Paris', 'tunnel_adresse_saisie', 'tunnel')).toEqual({ change: true });
    const [maj, journal] = ecrits;
    expect(maj.sql).toContain('UPDATE internaute SET adresse_residence = $2');
    expect(maj.params).toEqual(['uuid-1', '12 Rue de la Paix 75002 Paris', 'tunnel_adresse_saisie']);
    expect(journal.sql).toContain('INSERT INTO internaute_cycle_vie_log');
    expect(journal.params[1]).toBe('rectification');
    const details = JSON.parse(String(journal.params[3]));
    expect(details).toEqual({ champs: ['adresse_residence'], source: 'tunnel_adresse_saisie', efface: false, canal: 'tunnel' });
    expect(JSON.stringify(journal.params)).not.toContain('Paix'); // jamais l'adresse au journal
  });

  it('même adresse → aucune écriture, aucun faux changement au journal', async () => {
    installer({ adresse_residence: '12 Rue de la Paix 75002 Paris' });
    expect(await declarerResidence('uuid-1', '12 Rue de la Paix 75002 Paris', 'tunnel_bien_analyse', 'tunnel')).toEqual({ change: false });
    expect(ecrits).toEqual([]);
  });

  it('profil effacé ou inconnu → rien', async () => {
    installer(null);
    expect(await declarerResidence('uuid-1', '12 Rue X', 'espace_client', 'espace_client')).toEqual({ change: false });
    expect(ecrits).toEqual([]);
  });

  it('« Mon compte », champ vidé → adresse effacée (null), journalisée comme telle', async () => {
    installer({ adresse_residence: '12 Rue X' });
    expect(await declarerResidence('uuid-1', null, 'espace_client', 'espace_client')).toEqual({ change: true });
    expect(ecrits[0].params).toEqual(['uuid-1', null, 'espace_client']);
    expect(JSON.parse(String(ecrits[1].params[3]))).toMatchObject({ efface: true, canal: 'espace_client' });
  });
});

describe('effacement de l’identité : l’adresse de résidence part avec le reste (PII)', () => {
  it('anonymisation → adresse_residence (et sa date, sa source) remises à NULL', async () => {
    const sqls: string[] = [];
    const q = vi.fn(async (sql: string) => { sqls.push(sql.replace(/\s+/g, ' ')); return { rows: /SELECT 1 FROM internaute/.test(sql) ? [{}] : [] }; });
    withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
    await effacerInternaute('uuid-1', 1, 'admin');
    const anonymisation = sqls.find((s) => s.includes('efface_a = now()'))!;
    for (const c of ['adresse_residence = NULL', 'adresse_residence_maj_a = NULL', 'adresse_residence_source = NULL']) expect(anonymisation).toContain(c);
  });
});

describe('le certificat ne dépend pas de l’adresse de résidence (facultative, décision d’Arno du 16/10/2026)', () => {
  it('PDF, émission et mails ne lisent jamais l’adresse de résidence (seul le Oui/Non donne « Habitation principale/secondaire »)', () => {
    const racine = process.cwd();
    const fichiers = ['app/lib/pdf/certificatPdf.ts', 'app/lib/pdf/publierCertificatPdf.ts', 'app/lib/db/certificatEmission.ts',
      ...readdirSync(path.join(racine, 'app/lib/email')).filter((f) => f.endsWith('.ts') && !f.includes('.test.')).map((f) => `app/lib/email/${f}`)];
    for (const f of fichiers) expect(readFileSync(path.join(racine, f), 'utf8'), f).not.toMatch(/adresseResidence|adresse_residence/);
    expect(readFileSync(path.join(racine, 'app/lib/pdf/publierCertificatPdf.ts'), 'utf8'))
      .toContain("r.residence_principale === null ? null : r.residence_principale ? 'Habitation principale' : 'Habitation secondaire'");
  });
});

