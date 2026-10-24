import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoriePrimeImport, MOTS_PARKING } from './repriseExcel';
import { planReparationCategorie, texteReparationCategorie, type LigneACategoriser } from './reparationCategorie';

/**
 * 🔴 Arno (24/10/2026, validé) — la catégorie de prime des lignes reprises : « parking » seulement par le libellé ou par le lot
 * rattaché ; une prime < 150 € ne suffit plus. Le script de réparation corrige ZHIVULINA-KOROTICH, laisse les vrais parkings et
 * SIGNALE LEBRETON (rien pour décider). Données des lignes : celles de la base de dev (lecture), sans autre donnée personnelle.
 */
describe('🔴 la règle d’import', () => {
  it('une prime < 150 € ne suffit plus : « logement » sauf libellé ou lot parking', () => {
    expect(categoriePrimeImport({ prime: 50, libelleParking: false })).toBe('logement');
    expect(categoriePrimeImport({ prime: 15, libelleParking: true })).toBe('parking');
    expect(categoriePrimeImport({ prime: 150, libelleParking: false, lotParking: true })).toBe('parking');
    expect(categoriePrimeImport({ prime: 150, libelleParking: false, lotParking: false })).toBe('logement');
    expect(categoriePrimeImport({ prime: 0, libelleParking: true })).toBeNull();
  });
  it('les mots du libellé : parking, park, box, garage, stationnement (mots entiers)', () => {
    for (const t of ['SCI CAP FORTIUS (Parking)', 'HAMZAOUI-KORT (Park)', 'PERRET-DINAND (Box)', 'DUPONT garage', 'Place de stationnement'])
      expect(MOTS_PARKING.test(t)).toBe(true);
    for (const t of ['ZHIVULINA-KOROTICH', 'BOXER', 'PARKINSON']) expect(MOTS_PARKING.test(t)).toBe(false);
  });
});

const l = (o: Partial<LigneACategoriser>): LigneACategoriser => ({ id: 1, mois: '2026-09', proprietaire: 'X', locataire: 'Y', prime: 150, ca: 1000, categorie: 'logement', lotParking: null, ...o });

describe('🔴 le plan de réparation', () => {
  const lignes = [
    l({ id: 97, proprietaire: 'ZHIVULINA-KOROTICH', prime: 50, ca: 1866.04, categorie: 'parking' }),
    l({ id: 196, proprietaire: 'LEBRETON', prime: 75, ca: 0, categorie: 'parking' }),
    l({ id: 16, proprietaire: 'SCI CAP FORTIUS (Parking)', prime: 15, ca: 133.34, categorie: 'parking', lotParking: true }),
    l({ id: 68, proprietaire: 'AKHROUF (Parking)', prime: 15, ca: 133.34, categorie: 'parking', lotParking: true }),
    l({ id: 31, proprietaire: 'BARAKATE-MARGHICHE', prime: 15, ca: 200, categorie: 'parking', lotParking: true }),
    l({ id: 770, proprietaire: 'TALLEC', prime: 15, ca: 133.34, categorie: 'parking' }),
    l({ id: 413, proprietaire: 'AFONSO', prime: 150, ca: 511.38, categorie: 'logement', lotParking: true }),
    l({ id: 5, proprietaire: 'DUPONT', prime: 150, categorie: 'logement' }),
    l({ id: 6, proprietaire: 'LOCAL SHOP', prime: 50, categorie: 'local' }),
  ];
  const plan = planReparationCategorie(lignes);
  it('ZHIVULINA-KOROTICH (ligne 97) → Logement, prime gardée', () => {
    expect(plan.filter((d) => d.sorte === 'change').map((d) => [d.ligne.id, d.sorte === 'change' && d.nouvelle])).toEqual([[97, 'logement']]);
  });
  it('les vrais parkings et les lignes justes ne sont pas touchés ; « local » jamais', () => {
    for (const id of [16, 68, 31, 5, 6]) expect(plan.some((d) => d.ligne.id === id)).toBe(false);
  });
  it('LEBRETON signalé « à vérifier à la main » (ni bien ni honoraires) ; indices opposés aussi (TALLEC, AFONSO)', () => {
    const v = plan.filter((d) => d.sorte === 'a_verifier');
    expect(v.map((d) => d.ligne.id).sort((a, b) => a - b)).toEqual([196, 413, 770]);
    expect(v.find((d) => d.ligne.id === 196)?.raison).toMatch(/ni bien rattaché ni honoraires/);
  });
  it('le rapport : essai, avant → après ligne par ligne, et la liste à vérifier', () => {
    const t = texteReparationCategorie(plan, { reel: false, base: 'svav_test', lues: lignes.length });
    expect(t).toContain('ESSAI (aucune écriture)');
    expect(t).toContain('ligne 97 — 2026-09 — ZHIVULINA-KOROTICH / Y — prime 50,00 €, CA 1866,04 € : Parking → Logement');
    expect(t).toContain('serait corrigée');
    expect(t).toMatch(/À VÉRIFIER À LA MAIN[\s\S]*ligne 196 — 2020-12|À VÉRIFIER À LA MAIN[\s\S]*LEBRETON/);
    expect(texteReparationCategorie(plan, { reel: true, base: 'b', lues: 9, ecrites: 1 })).toContain('corrigées : 1');
  });
  it('le script : essai par défaut, `--reel` seul écrit, journalise chaque changement, refuse sans la 418 ; rapport dans .captures', () => {
    const src = readFileSync('app/scripts/reparer-categorie-prime.ts', 'utf8');
    expect(src).toContain("const reel = argv.includes('--reel');");
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') })");
    expect(src).toContain("INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)");
    expect(src).toContain("'location_activite'");
    expect(src).toContain('migration 418 absente');
    expect(src).toContain("WHERE a.source = 'import'");
    expect(readFileSync('package.json', 'utf8')).toContain('"location:reparer-categorie-prime": "tsx app/scripts/reparer-categorie-prime.ts"');
  });
});
