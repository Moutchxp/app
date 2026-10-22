import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireClasseur, type ClasseurLu } from './lectureExcel';
import { controler, planifier, tableauControle, versActivite } from './planImport';
import { rapprocher, type CandidatBail } from './rapprochementImport';
import { retrocessionDuMois } from './repriseExcel';
import { tauxParApporteur } from '../../../scripts/importer-suivi-location-2026';

/** 🔴 Arno (22/10/2026) — l'import du suivi : rien n'est perdu, rien n'est doublé, et le contrôle tombe au centime. */
const mois = lireClasseur(JSON.parse(readFileSync(path.join(process.cwd(), 'app/lib/location/suivi/__fixtures__/suiviMensuel2026.anonyme.json'), 'utf8')) as ClasseurLu, 2026);
// La copie anonymisée dit « Propriétaire 12 » : sans nombre, tous les noms se ressembleraient. Un nom de lettres par ligne.
const lettres = (i: number): string => `${String.fromCharCode(65 + Math.floor(i / 26)).repeat(3)}${String.fromCharCode(65 + (i % 26)).repeat(3)}`; // ≥ 3 lettres d'écart
mois.flatMap((m) => m.lignes).forEach((l, i) => { l.proprietaire = `P${lettres(i)}${l.avenant ? ' (Avenant)' : ''}`; l.locataire = `L${lettres(i)}`; });
const lignes = mois.flatMap((m) => m.lignes);
const nego = { id: 5, libelle: 'Négociateur' };
const REGLE = [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const retro = mois.map((m) => retrocessionDuMois(m, {})).filter((r) => r !== null);
const avril8 = lignes.find((l) => l.cle === '2026-04#8')!;
const sept3 = lignes.find((l) => l.cle === '2026-09#3')!;
const C = (o: Partial<CandidatBail>): CandidatBail => ({ bailId: 1, lotId: 10, entree: '2026-04-10', proprietaireId: 4, proprietaire: avril8.proprietaire, locataires: avril8.locataire,
  locataireId: 9, avecGestion: true, parking: false, ...o });
const candidats = [C({}), C({ bailId: 2, entree: '2026-09-01', proprietaire: sept3.proprietaire, locataires: sept3.locataire, avecGestion: false })];

describe('🔴 plan d’import', () => {
  const plan = planifier(mois, rapprocher(lignes, candidats), { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux'], dejaImportees: new Set(), bauxSuivis: new Set() });
  it('les 112 lignes sont au plan ; rapprochées avec leur bail, les autres « historique non rattaché »', () => {
    expect(plan).toHaveLength(112);
    expect(plan.filter((p) => p.bailId !== null).map((p) => [p.ligne.cle, p.bailId])).toEqual([['2026-04#8', 1], ['2026-09#3', 2]]);
    expect(plan.every((p) => p.etat === 'a_importer')).toBe(true);
    expect(versActivite(plan.find((p) => p.ligne.cle === '2026-01#3')!, nego).rattachement).toBe('non_rattache');
  });
  it('avril : ventilation absente → le statut du bien rapproché, sinon « sans », et c’est dit', () => {
    const a8 = plan.find((p) => p.ligne.cle === '2026-04#8')!;
    expect([a8.avecGestion, a8.gestionSource]).toEqual([true, 'bien']);
    const a10 = plan.find((p) => p.ligne.cle === '2026-04#10')!;
    expect([a10.avecGestion, a10.gestionSource]).toEqual([false, 'inconnue']);
    expect(a10.commentaire.join()).toMatch(/compté « sans »/);
  });
  it('rejouer : une clé déjà importée n’est pas réécrite ; un bail déjà suivi dans l’outil n’est pas doublé', () => {
    const p2 = planifier(mois, rapprocher(lignes, candidats), { collaborateurs: [], dejaImportees: new Set(['CA_JBP_2026#2026-01#7']), bauxSuivis: new Set([1]) });
    expect(p2.find((p) => p.ligne.cle === '2026-01#7')!.etat).toBe('deja_importee');
    expect(p2.find((p) => p.ligne.cle === '2026-04#8')!.etat).toBe('deja_suivie');
  });
  it('le contrôle mois par mois : ✓ partout, au centime', () => {
    const c = controler(mois, plan.map((p) => versActivite(p, nego)), REGLE, retro);
    expect(c.every((x) => x.auCentime)).toBe(true);
    expect(tableauControle(c).split('\n').at(-1)).toMatch(/TOTAL\s+112\/112\s+94612,61 €\s+94612,61 €.*✓$/);
  });
  it('le contrôle VOIT un écart : une ligne retirée → ✗ sur son mois', () => {
    const c = controler(mois, plan.filter((p) => p.ligne.cle !== '2026-03#3').map((p) => versActivite(p, nego)), REGLE, retro);
    expect(c.filter((x) => !x.auCentime).map((x) => x.mois)).toEqual(['2026-03']);
  });
  it('le taux de chaque apporteur au 1er janvier : le plus fréquent du fichier', () => {
    const t = tauxParApporteur(plan);
    expect(t.get('apporteur a')).toBe(0.1);
    expect([...t.values()].every((x) => x === 0.1 || x === 0.2)).toBe(true);
  });
});
