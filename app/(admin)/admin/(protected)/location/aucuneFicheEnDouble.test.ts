import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 RÈGLE D'ARNO (17/10/2026) — UNE SEULE FICHE DANS TOUTE L'APPLICATION : « il ne doit exister QU'UN SEUL type de fiche
 * propriétaire, de fiche locataire et de fiche bien (avec son historique) : celles du module Gestion. Il ne faut pas créer
 * de pages de fiche propres à la Location. »
 * Cette épreuve ÉCHOUE si un composant de fiche propriétaire / locataire / bien est défini sous location/, ou si une page
 * de fiche de la Location monte autre chose que la fiche commune.
 */
const RACINE = 'app/(admin)/admin/(protected)/location';

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.(tsx|ts)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Un composant (fonction, constante ou classe) dont le nom dit « fiche / vue » d'un propriétaire, locataire, bien ou lot. */
const COMPOSANT_FICHE = /\b(?:function|const|class)\s+((?:Fiche|Vue)\w*(?:Proprietaire|Locataire|Bien|Lot)\w*)/g;

describe('🔴 aucune fiche propriétaire / locataire / bien en double sous /admin/location', () => {
  const liste = fichiers(RACINE);
  it('les fichiers de la Location sont bien lus', () => {
    expect(liste.length).toBeGreaterThanOrEqual(10);
  });
  it.each(liste)('%s ne définit aucun composant de fiche', (f) => {
    const src = readFileSync(f, 'utf8');
    expect([...src.matchAll(COMPOSANT_FICHE)].map((m) => m[1]), f).toEqual([]);
    // Ni les briques d'une fiche de la Gestion recopiées à la main (cartes de personnes, historique du bien).
    expect(src, f).not.toMatch(/\bCartePersonne\b|\bHistoriqueDuBien\b|\bVueLot\b|\bVueProprietaire\b|\bVueLocataire\b/);
  });
  it('le détecteur attrape bien un doublon (et pas les formulaires de création)', () => {
    const exemple = 'export function FicheBienLocation() {}\nfunction VueLocataireX() {}\nexport function CreationProprietaireBien() {}';
    expect([...exemple.matchAll(COMPOSANT_FICHE)].map((m) => m[1])).toEqual(['FicheBienLocation', 'VueLocataireX']);
  });
  it.each(['proprietaire', 'locataire', 'bien'])('la page /admin/location/%s/[id] monte LA fiche commune de la Gestion', (sorte) => {
    const page = readFileSync(join(RACINE, sorte, '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain("import { FicheCommuneLocation } from '../../../gestion/FicheCommune';");
    expect(page).toContain('<FicheCommuneLocation fiche=');
  });
  it('la fiche commune monte le composant `Annuaire` de la Gestion, sans rédaction ni « Écrire »', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/FicheCommune.tsx', 'utf8');
    expect(src).toContain("import { Annuaire } from './Annuaire';");
    expect(src).toMatch(/<Annuaire fiche=\{fiche\} onFiche=\{onFiche\} onRetour=\{onRetour\} redaction=\{null\} sansEntete=\{sansBarreAnnuaire\} \/>/);
    expect(src).not.toMatch(/onEcrire=|onOuvrirFil=|onGesteMail=/);
  });
});
