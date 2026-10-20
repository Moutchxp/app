import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anciensLocataires, parEntreeLaPlusRecente } from '../gestion/historiqueBien';
import { dateEntreeDuDossierBail, ordonnerBauxDuContenu } from '../gestion/drive';

/** 🔴 Arno (20/10/2026) — PARTOUT où l'application liste les baux : du plus récent au plus ancien, selon la date d'entrée. */
describe('parEntreeLaPlusRecente — l’ordre des baux', () => {
  it('l’entrée la plus récente d’abord ; une entrée inconnue en dernier ; à entrée égale, le départ le plus récent', () => {
    const xs = [
      { nom: 'ANCIEN', entree: '2019-09-01', sortie: '2024-06-30' },
      { nom: 'INCONNU', entree: null, sortie: null },
      { nom: 'RECENT', entree: '2024-09-01', sortie: null },
      { nom: 'MEME-A', entree: '2021-01-01', sortie: '2021-12-31' },
      { nom: 'MEME-B', entree: '2021-01-01', sortie: '2023-12-31' },
    ];
    expect([...xs].sort(parEntreeLaPlusRecente).map((x) => x.nom)).toEqual(['RECENT', 'MEME-B', 'MEME-A', 'ANCIEN', 'INCONNU']);
  });
  it('un bail entré plus tard mais sorti plus tôt passe quand même avant (c’est l’ENTRÉE qui ordonne)', () => {
    const court = { nom: 'COURT', entree: '2023-01-01', sortie: '2023-03-31' };
    const long = { nom: 'LONG', entree: '2020-01-01', sortie: '2024-12-31' };
    expect([long, court].sort(parEntreeLaPlusRecente).map((x) => x.nom)).toEqual(['COURT', 'LONG']);
  });
  it('les anciens locataires de l’encart Parties suivent le même ordre', () => {
    const c = (libelle: string, depuis: string, jusqua: string) => ({ libelle, depuis, jusqua, enPlace: false }) as never;
    expect(anciensLocataires([c('LONG', '2020-01-01', '2024-12-31'), c('COURT', '2023-01-01', '2023-03-31')]).map((x: { libelle: string }) => x.libelle))
      .toEqual(['COURT', 'LONG']);
  });
});

describe('la liste des dossiers Drive dans l’application : « 6 Locataires » du plus récent au plus ancien', () => {
  it('la date se lit dans le nom (nouveau « BAIL 01/09/2024 … » et ancien « Bail 01/09/2022 – … »)', () => {
    expect(dateEntreeDuDossierBail('BAIL 01/09/2024 MARTIN')).toBe('2024-09-01');
    expect(dateEntreeDuDossierBail('Bail 01/09/2022 – HIRSCH Thibaut')).toBe('2022-09-01');
    expect(dateEntreeDuDossierBail('Bail date inconnue – X')).toBeNull();
    expect(dateEntreeDuDossierBail('3 Photos')).toBeNull();
  });
  it('les dossiers de bail en tête, du plus récent au plus ancien ; le reste garde son ordre ; aucun nom n’est changé', () => {
    const f = (nom: string, dossier = true) => ({ nom, dossier });
    const lu = [f('Bail 01/09/2022 – HIRSCH Thibaut'), f('BAIL 01/09/2024 MARTIN'), f('Bail 15/03/2019 – DUPONT Jean'), f('Divers'), f('note.pdf', false)];
    expect(ordonnerBauxDuContenu(lu).map((x) => x.nom)).toEqual(['BAIL 01/09/2024 MARTIN', 'Bail 01/09/2022 – HIRSCH Thibaut', 'Bail 15/03/2019 – DUPONT Jean', 'Divers', 'note.pdf']);
    const autre = [f('1 Propriétaire'), f('6 Locataires')];
    expect(ordonnerBauxDuContenu(autre)).toEqual(autre);
  });
});

describe('les écrans emploient cet ordre (fiche bien, fiche locataire, « Ses locations »)', () => {
  const lire = (f: string) => readFileSync(f, 'utf8');
  it('fiche bien : historique des locataires et liste « Loyer de départ » ; fiche locataire : ses logements et « Ses locations »', () => {
    const ann = lire('app/(admin)/admin/(protected)/gestion/Annuaire.tsx');
    expect(ann).toContain('const anciens = [...passes].sort((a, b) => parEntreeLaPlusRecente(');
    expect(ann).toContain('const enCours = f.logements.filter(estLocataireEnPlace).sort(parEntreeLaPlusRecente);');
    expect(ann).toContain('const passes = f.logements.filter(estAncienLocataire).sort(parEntreeLaPlusRecente);');
    const sec = lire('app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx');
    expect(sec).toContain('const occupations = [...liste(f.occupations)].sort(parEntreeLaPlusRecente);');
    expect(sec).toContain('{[...liste(d.locations)].sort(parEntreeLaPlusRecente).map((l) => (');
  });
  it('la lecture d’un dossier Drive passe par l’ordre des baux', () => {
    expect(lire('app/lib/gestion/drive.ts').match(/fichiers: ordonnerBauxDuContenu\(fichiers\)/g)).toHaveLength(2);
  });
});
