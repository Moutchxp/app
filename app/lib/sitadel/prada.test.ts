import { describe, it, expect } from 'vitest';
import {
  parserAnnuaireCada, AnnuaireInvalideError, EN_TETE_CADA, COLONNES_BRUTES,
  millesimeDepuisNomFichier, extraireLienCsv, rapportDepartements, codeDepartementDe,
  sqlUpsertPradaImport, sqlUpsertPradaMillesime,
} from './prada';

const BOM = '﻿';
const ENTETE = EN_TETE_CADA.map((c) => `"${c}"`).join(',');
/** Flux async à partir de morceaux (permet de couper au milieu d'un champ multi-ligne pour tester le streaming). */
async function* flux(...morceaux: string[]): AsyncGenerator<string> { for (const m of morceaux) yield m; }

describe('S14b — parserAnnuaireCada', () => {
  it('BOM en tête + en-tête valide + lignes simples → tableau de lignes de 8 champs', async () => {
    const csv = `${BOM}${ENTETE}\n` +
      `"1","75","Mairie de Paris","Jean","Dupont","jean@paris.fr","6 rue X","75001 PARIS"\n` +
      `"2","92","Mairie de Nanterre","Marie","Martin","marie@nanterre.fr","2 av Y","92000 NANTERRE"`;
    const lignes = await parserAnnuaireCada(flux(csv));
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toEqual(['1', '75', 'Mairie de Paris', 'Jean', 'Dupont', 'jean@paris.fr', '6 rue X', '75001 PARIS']);
    expect(lignes[1][2]).toBe('Mairie de Nanterre');
  });

  it('adresse MULTI-LIGNE entre guillemets (coupée entre deux morceaux) → conservée verbatim, une seule ligne', async () => {
    const lignes = await parserAnnuaireCada(flux(
      `${BOM}${ENTETE}\n"3","78","Mairie","Marie","Martin","m@x.fr","2 rue A\n`,
      `BP 5","78000 VERSAILLES"\n`,
    ));
    expect(lignes).toHaveLength(1);
    expect(lignes[0][6]).toBe('2 rue A\nBP 5');
    expect(lignes[0][7]).toBe('78000 VERSAILLES');
  });

  it('guillemets DOUBLÉS dans un champ → dé-échappés', async () => {
    const lignes = await parserAnnuaireCada(flux(
      `${BOM}${ENTETE}\n"1","75","Mairie ""centre""","J","D","j@x.fr","addr","75001 PARIS"`,
    ));
    expect(lignes[0][2]).toBe('Mairie "centre"');
  });

  it('courriel VIDE → chaîne vide acceptée (verbatim), pas de rejet', async () => {
    const lignes = await parserAnnuaireCada(flux(
      `${BOM}${ENTETE}\n"1","93","Mairie","J","D","","addr","93000 BOBIGNY"`,
    ));
    expect(lignes[0][5]).toBe('');
  });

  it('ligne à 7 champs → REJET du fichier entier (AnnuaireInvalideError nommant l’écart)', async () => {
    const csv = `${BOM}${ENTETE}\n"1","75","Mairie","J","D","j@x.fr","addr"`; // 7 champs
    await expect(parserAnnuaireCada(flux(csv))).rejects.toThrow(AnnuaireInvalideError);
    await expect(parserAnnuaireCada(flux(csv))).rejects.toThrow(/7 champ\(s\) au lieu de 8/);
  });

  it('en-tête non conforme → REJET du fichier entier', async () => {
    const mauvais = `${BOM}"Colonne A","B","C","D","E","F","G","H"\n"1","2","3","4","5","6","7","8"`;
    await expect(parserAnnuaireCada(flux(mauvais))).rejects.toThrow(/En-tête annuaire CADA inattendu/);
  });
});

describe('S14b — millesimeDepuisNomFichier', () => {
  it('annuaire_07_26_0.csv → 2026-07 ; annuaire_07_26.csv → 2026-07', () => {
    expect(millesimeDepuisNomFichier('annuaire_07_26_0.csv')).toBe('2026-07');
    expect(millesimeDepuisNomFichier('annuaire_07_26.csv')).toBe('2026-07');
    expect(millesimeDepuisNomFichier('annuaire_12_25_3.csv')).toBe('2025-12');
  });
  it('nom inattendu ou mois hors 01-12 → jette', () => {
    expect(() => millesimeDepuisNomFichier('annuaire.csv')).toThrow(/inattendu/);
    expect(() => millesimeDepuisNomFichier('data.xlsx')).toThrow(/inattendu/);
    expect(() => millesimeDepuisNomFichier('annuaire_13_26.csv')).toThrow(/Mois invalide/);
  });
});

describe('S14b — extraireLienCsv', () => {
  it('exactement un lien .csv → URL absolue résolue', () => {
    const html = '<a href="/sites/default/files/annuaire_07_26_0.csv">Télécharger</a>';
    expect(extraireLienCsv(html, 'https://www.cada.fr/lacada/annuaire-des-prada'))
      .toBe('https://www.cada.fr/sites/default/files/annuaire_07_26_0.csv');
  });
  it('zéro lien .csv → échec explicite (jamais deviner)', () => {
    expect(() => extraireLienCsv('<p>rien</p>', 'https://www.cada.fr/')).toThrow(/Aucun lien \.csv/);
  });
  it('plusieurs liens .csv distincts → échec explicite', () => {
    const html = '<a href="a.csv">a</a><a href="b.csv">b</a>';
    expect(() => extraireLienCsv(html, 'https://www.cada.fr/')).toThrow(/Plusieurs liens \.csv/);
  });
  it('le MÊME lien répété deux fois compte pour un seul', () => {
    const html = '<a href="x.csv">1</a> ... <a href="x.csv">2</a>';
    expect(extraireLienCsv(html, 'https://www.cada.fr/')).toBe('https://www.cada.fr/x.csv');
  });
});

describe('S14b — rapportDepartements', () => {
  const L = (dep: string, courriel: string): string[] => ['1', dep, 'Mairie', 'J', 'D', courriel, 'addr', '00000 X'];
  it('répartition brute + cibles 75/78/92/93 + courriels vides', () => {
    const r = rapportDepartements([L('75', 'a@x'), L('75', ''), L('92 - Hauts-de-Seine', 'c@x'), L('61', '')]);
    expect(r.cibles['75']).toBe(2);
    expect(r.cibles['92']).toBe(1);
    expect(r.cibles['93']).toBe(0);
    expect(r.courrielsVides).toBe(2);
    expect(r.parDepartement[0]).toEqual(['75', 2]); // trié par effectif décroissant
  });
  it('codeDepartementDe extrait le code (2 chiffres / 2A-2B), sinon null', () => {
    expect(codeDepartementDe('78 - Yvelines')).toBe('78');
    expect(codeDepartementDe('Corse-du-Sud (2A)')).toBe('2A');
    expect(codeDepartementDe('Sans chiffre')).toBeNull();
  });
});

describe('S14b — invariant d’upsert (ré-import NON destructif)', () => {
  it('prada_import DO UPDATE ne touche NI code_insee NI rapprochement, et met à jour les 8 brutes', () => {
    const sql = sqlUpsertPradaImport();
    const set = sql.slice(sql.indexOf('DO UPDATE SET'));
    expect(set).not.toContain('code_insee');       // le rattachement de commune est préservé
    expect(set).not.toContain('rapprochement');    // l’état de revue manuelle est préservé
    for (const c of COLONNES_BRUTES) expect(set).toContain(`${c} = EXCLUDED.${c}`);
    expect(sql).toContain('ON CONFLICT (millesime, ligne)');
    expect(sql).toContain('(xmax = 0) AS insere'); // distingue insertion vs mise à jour
  });
  it('prada_millesime upsert sur (code)', () => {
    expect(sqlUpsertPradaMillesime()).toContain('ON CONFLICT (code) DO UPDATE');
  });
});
