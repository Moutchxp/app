import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filtresLignes, LIBELLE_STATUT_LIGNE, lignePasseFiltre, rangStatutLigne, statutLigne, statutsLigne, STATUTS_LIGNE, type FaitsLigne } from './statutLignePreavis';
import { issueSortie } from './sortieLocataires';

/** 🔴🔴 Arno (15/11/2026) — le statut d'une ligne de préavis (arbre validé par Arno) : un seul, calculé, le geste le plus avancé l'emporte. */
const EDLS = { edlsId: 1, tacheId: 2, jour: '2026-12-01', heure: '10:00', dureeMinutes: 60, confieA: 'X', confieAId: 3, statut: 'en_attente' };
const pv = (statut: 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee') => ({ statut });

describe('le statut d’une ligne de préavis', () => {
  it('les libellés de l’arbre, dans son ordre', () => {
    expect(STATUTS_LIGNE.map((s) => LIBELLE_STATUT_LIGNE[s])).toEqual(['En préavis', 'RDV pré-visite fixé', 'Refus / absence pré-visite', 'Pré-visite effectuée', 'RDV état des lieux fixé', 'État des lieux + CR effectués']);
  });
  it('chaque transition : 1 → 2a → 3 → 4 → 5', () => {
    expect(statutLigne({ previsite: pv('recu') })).toBe('en_preavis');
    expect(statutLigne({ previsite: pv('alerte') })).toBe('en_preavis'); // l'alerte n'est pas un statut
    expect(statutLigne({ previsite: null })).toBe('en_preavis'); // sans la 464
    expect(statutLigne({ previsite: pv('programmee') })).toBe('rdv_previsite'); // un déplacement garde « programmée »
    expect(statutLigne({ previsite: pv('effectuee') })).toBe('previsite_effectuee');
    expect(statutLigne({ previsite: pv('effectuee'), edls: EDLS })).toBe('rdv_edl');
    expect(statutLigne({ previsite: pv('effectuee'), edls: EDLS, sortieValidee: true })).toBe('edl_effectue');
  });
  it('la branche refus : 1 → 2b → 4 → 5', () => {
    expect(statutLigne({ previsite: pv('refusee') })).toBe('refus_previsite');
    expect(statutLigne({ previsite: pv('refusee'), edls: EDLS })).toBe('rdv_edl');
    expect(statutLigne({ previsite: pv('refusee'), edls: null, sortieValidee: true })).toBe('edl_effectue');
  });
  it('un état des lieux planifié puis annulé (tâche annulée : plus d’« edls ») : la ligne revient au statut de sa pré-visite', () => {
    expect(statutLigne({ previsite: pv('refusee'), edls: null })).toBe('refus_previsite');
  });
  it('UNE seule valeur par ligne, quelle que soit la combinaison des faits — SAUF pré-visite programmée + état des lieux planifié (16/11/2026)', () => {
    const faits: FaitsLigne[] = [];
    for (const s of ['alerte', 'recu', 'programmee', 'effectuee', 'refusee'] as const) for (const e of [null, EDLS]) for (const v of [false, true]) faits.push({ previsite: pv(s), edls: e, sortieValidee: v });
    for (const f of faits) {
      const s = statutLigne(f);
      expect(STATUTS_LIGNE).toContain(s);
      const deux = f.previsite?.statut === 'programmee' && f.edls !== null && f.sortieValidee !== true;
      expect(statutsLigne(f)).toEqual(deux ? ['rdv_previsite', 'rdv_edl'] : [s]);
      expect(STATUTS_LIGNE.filter((x) => lignePasseFiltre(f, new Set([x])))).toEqual(statutsLigne(f)); // les filtres de ses statuts, eux seuls
    }
  });
  it('les filtres : statuts 1 à 4 avec leur compteur, « Alerte préavis » en plus s’il y en a ; filtres cumulés ; vide = tout, aucune ligne perdue', () => {
    const lignes: FaitsLigne[] = [{ previsite: pv('alerte') }, { previsite: pv('recu') }, { previsite: pv('programmee') }, { previsite: pv('refusee') },
      { previsite: pv('effectuee') }, { previsite: pv('refusee'), edls: EDLS }];
    expect(filtresLignes(lignes).map((f) => [f.filtre, f.nombre])).toEqual([['en_preavis', 2], ['rdv_previsite', 1], ['refus_previsite', 1], ['previsite_effectuee', 1], ['rdv_edl', 1], ['alerte', 1]]);
    expect(filtresLignes(lignes).reduce((n, f) => n + (f.filtre === 'alerte' ? 0 : f.nombre), 0)).toBe(lignes.length);
    expect(filtresLignes([{ previsite: pv('recu') }]).some((f) => f.filtre === 'alerte')).toBe(false);
    expect(lignes.filter((l) => lignePasseFiltre(l, new Set())).length).toBe(6);
    expect(lignes.filter((l) => lignePasseFiltre(l, new Set(['refus_previsite', 'rdv_edl'])))).toHaveLength(2);
    expect(lignes.filter((l) => lignePasseFiltre(l, new Set(['alerte'])))).toEqual([lignes[0]]);
  });
  it('le tri par statut : l’alerte d’abord, puis l’ordre de l’arbre', () => {
    const r = [{ previsite: pv('effectuee') }, { previsite: pv('recu') }, { previsite: pv('alerte') }, { previsite: pv('refusee'), edls: EDLS }].map(rangStatutLigne);
    expect(r).toEqual([6, 1, 0, 8]);
  });
});

describe('après « Valider la sortie » (statut 5)', () => {
  it('la ligne quitte la liste des préavis actifs : seules les occupations SANS sortie y sont lues', () => {
    const sql = readFileSync('app/lib/location/preavisRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE p.remplace_le IS NULL AND p.annule_le IS NULL AND o.sortie IS NULL');
  });
  it('le logement devient vacant quand tous les locataires sortent (calculé, comme avant)', () => {
    const bail = { locataires: [{ occupationId: 11, nom: 'A' }, { occupationId: 12, nom: 'B' }], autresOccupants: [] } as unknown as Parameters<typeof issueSortie>[0];
    expect(issueSortie(bail, [11, 12])).toEqual({ vacant: true, restants: [] });
    expect(issueSortie(bail, [11])).toEqual({ vacant: false, restants: ['B'] });
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 01h04) — « Alerte préavis » compte aussi les deux alertes de rendez-vous dépassé ══ */
describe('🔴 01h04 — le filtre « Alerte préavis » et son compteur : 11e jour, compte rendu à faire, sortie à valider', () => {
  const MAINT = '2026-11-28 01:10';
  const pvr = (statut: 'programmee' | 'effectuee', jour: string) => ({ statut, rdv: { jour, heure: '10:00' } });
  const LIGNES: FaitsLigne[] = [
    { previsite: pv('alerte') },                                                       // 11e jour
    { previsite: pvr('programmee', '2026-11-13') },                                    // compte rendu à faire
    { previsite: pvr('effectuee', '2026-11-10'), edls: { ...EDLS, jour: '2026-11-18' } }, // sortie à valider
    { previsite: pvr('programmee', '2026-11-16'), edls: { ...EDLS, jour: '2026-11-20' } }, // les deux : comptée UNE fois
    { previsite: pvr('programmee', '2026-12-10') },                                    // à venir : pas d'alerte
    { previsite: pvr('effectuee', '2026-11-10'), edls: { ...EDLS, jour: '2026-12-04' } }, // à venir : pas d'alerte
  ];
  it('le compteur : 4 lignes en alerte sur 6 (une ligne à deux alertes ne compte qu’une fois)', () => {
    expect(filtresLignes(LIGNES, MAINT).find((f) => f.filtre === 'alerte')).toEqual({ filtre: 'alerte', libelle: 'Alerte préavis', nombre: 4 });
  });
  it('le filtre : les mêmes 4 lignes', () => {
    expect(LIGNES.map((l) => lignePasseFiltre(l, new Set(['alerte']), MAINT))).toEqual([true, true, true, true, false, false]);
  });
  it('sans moment présent (appel d’avant) : la seule règle du 11e jour, comme avant', () => {
    expect(filtresLignes(LIGNES).find((f) => f.filtre === 'alerte')?.nombre).toBe(1);
    expect(LIGNES.map((l) => lignePasseFiltre(l, new Set(['alerte'])))).toEqual([true, false, false, false, false, false]);
  });
  it('après le compte rendu (effectuée) puis la sortie validée : plus d’alerte', () => {
    expect(lignePasseFiltre({ previsite: pvr('effectuee', '2026-11-13') }, new Set(['alerte']), MAINT)).toBe(false);
    expect(lignePasseFiltre({ previsite: pvr('effectuee', '2026-11-10'), edls: { ...EDLS, jour: '2026-11-18' }, sortieValidee: true }, new Set(['alerte']), MAINT)).toBe(false);
  });
  it('un état des lieux sans jour lisible n’est pas un rendez-vous (aucune alerte inventée)', () => {
    expect(lignePasseFiltre({ previsite: pvr('effectuee', '2026-11-10'), edls: { tacheId: 1 } }, new Set(['alerte']), MAINT)).toBe(false);
  });
});
