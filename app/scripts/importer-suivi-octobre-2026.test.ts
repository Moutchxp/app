import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══ CLI `location:importer-octobre-2026` — À BLANC, IL N'ÉCRIT RIEN ; `--appliquer` REFUSE CE QUI NE CORRESPOND PAS À L'ATTENDU ══════
 * Les dépôts sont simulés : aucune base. La lecture du fichier d'Arno (gardé hors du dépôt, dans `.captures/import-octobre/`) n'est
 * éprouvée que là où il est présent — le comportement complet a été rejoué sur la base JETABLE (rapport du lot).
 */
const repo = {
  importDisponible: vi.fn(), lireCandidats: vi.fn(), lireComptes: vi.fn(), lireExistants: vi.fn(), ecrireImport: vi.fn(),
};
const oct = {
  empreintes2026: vi.fn(), lireLignesOctobre: vi.fn(), lireNumerosDesLots: vi.fn(), lignesDeCetImport: vi.fn(),
  journaliserAjouts: vi.fn(), annulerCetImport: vi.fn(),
};
vi.mock('../lib/location/suivi/importSuiviRepo', () => repo);
vi.mock('../lib/location/suivi/importOctobreRepo', () => oct);
vi.mock('../lib/db/client', () => ({ closePool: async () => {}, query: vi.fn(), withTransaction: vi.fn() }));

import { principal } from './importer-suivi-octobre-2026';

const FICHIER = join(process.cwd(), '.captures/import-octobre/CA_JBP_2026_octobre.xlsx');
let dossier: string;
const SAISIES = [
  { id: 1, proprietaire: 'BLANCO Ana', locataire: 'BELAHRECH', hp: 0, hl: 230.48, source: 'saisie', importCle: null },
  { id: 2, proprietaire: 'CHALAH', locataire: 'REIFHI', hp: 0, hl: 0, source: 'saisie', importCle: null },
  { id: 3, proprietaire: 'COHEN Samuel', locataire: 'HANNARD', hp: 0, hl: 214.59, source: 'saisie', importCle: null },
  { id: 4, proprietaire: 'LATHAM Marine', locataire: 'MAS-LEVY', hp: 491.73, hl: 491.73, source: 'saisie', importCle: null },
];

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'import-octobre-'));
  for (const f of [...Object.values(repo), ...Object.values(oct)]) f.mockReset();
  repo.importDisponible.mockResolvedValue(true);
  repo.lireCandidats.mockResolvedValue([]);
  repo.lireComptes.mockResolvedValue([{ id: 7, prenom: 'Jean-Baptiste', libelle: 'Jean-Baptiste Pons' }]);
  repo.lireExistants.mockResolvedValue({ dejaImportees: new Set(), bauxSuivis: new Set(), bauxPris: new Set(),
    apporteurs: new Map([['frédéric rousseau', 1], ['hélène beketov', 2]]), noms: ['Frédéric Rousseau', 'Hélène Beketov'], regles: [] });
  repo.ecrireImport.mockResolvedValue({ activites: 12 });
  oct.empreintes2026.mockResolvedValue([{ mois: '2026-10', lignes: 4, montantHt: 1428.53, controle: 'x' }]);
  oct.lireLignesOctobre.mockResolvedValue(SAISIES);
  oct.lireNumerosDesLots.mockResolvedValue(new Map());
  oct.lignesDeCetImport.mockResolvedValue([]);
  oct.journaliserAjouts.mockResolvedValue(12);
  oct.annulerCetImport.mockResolvedValue([]);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.exitCode = 0;
});
afterEach(() => { rmSync(dossier, { recursive: true, force: true }); vi.restoreAllMocks(); process.exitCode = 0; });
const rapport = () => `--rapport=${dossier}/`;

describe('--annuler', () => {
  it('à blanc : liste, ne désactive rien', async () => {
    oct.lignesDeCetImport.mockResolvedValue([{ id: 9, cle: 'CA_JBP_2026#2026-10#3', annule: false }]);
    await principal(['--annuler', rapport()]);
    expect(oct.annulerCetImport).not.toHaveBeenCalled();
  });
  it('avec --appliquer : désactive (le dépôt pose annule_le, jamais de suppression)', async () => {
    oct.lignesDeCetImport.mockResolvedValue([{ id: 9, cle: 'CA_JBP_2026#2026-10#3', annule: false }]);
    oct.annulerCetImport.mockResolvedValue([{ id: 9, cle: 'CA_JBP_2026#2026-10#3' }]);
    await principal(['--annuler', '--appliquer', rapport()]);
    expect(oct.annulerCetImport).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!existsSync(FICHIER))('le fichier d’Arno (présent sur ce poste)', () => {
  it('à blanc : 4 déjà saisies, 12 à ajouter, rien n’est écrit', async () => {
    await principal([`--fichier=${FICHIER}`, rapport()]);
    expect(repo.ecrireImport).not.toHaveBeenCalled();
    expect(oct.journaliserAjouts).not.toHaveBeenCalled();
    const texte = (console.log as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]).join('\n');
    expect(texte).toContain('DÉJÀ SAISIES, NON MODIFIÉES (4)');
    expect(texte).toMatch(/TOTAL AJOUTÉ : 12 ligne\(s\), 9\s749,24\s€ HT/u);
    expect(texte).toContain('CONFORME');
  });
  it('--appliquer : seules les 12 lignes partent à l’écriture de la reprise, sans règle, rétrocession, perte ni note', async () => {
    await principal([`--fichier=${FICHIER}`, '--appliquer', rapport()]);
    expect(repo.ecrireImport).toHaveBeenCalledTimes(1);
    const o = repo.ecrireImport.mock.calls[0][0];
    expect(o.plan.filter((p: { etat: string }) => p.etat === 'a_importer')).toHaveLength(12);
    expect(o).toMatchObject({ retrocessions: [], auteur: expect.stringMatching(/^import fichier octobre 2026 du \d\d\/\d\d$/) });
    expect(o.regles ?? []).toEqual([]);
    expect(o.pertes ?? []).toEqual([]);
    expect(o.notes ?? []).toEqual([]);
  });
  it('--appliquer refuse quand les lignes déjà saisies manquent en base (16 au lieu de 12) : rien n’est écrit, code 2', async () => {
    oct.lireLignesOctobre.mockResolvedValue([]);
    await principal([`--fichier=${FICHIER}`, '--appliquer', rapport()]);
    expect(repo.ecrireImport).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
  it('--appliquer refuse si un apporteur est absent de l’annuaire (aucun n’est créé)', async () => {
    repo.lireExistants.mockResolvedValue({ dejaImportees: new Set(), bauxSuivis: new Set(), bauxPris: new Set(), apporteurs: new Map(), noms: [], regles: [] });
    await principal([`--fichier=${FICHIER}`, '--appliquer', rapport()]);
    expect(repo.ecrireImport).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
