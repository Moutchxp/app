import { describe, expect, it } from 'vitest';
import {
  baremeEnVigueur, calculerHonorairesProprietaire, eurosAffiches, lignesHonoraires, lireDecimal, MOTIF_SURFACE_MANQUANTE, texteExact,
  totalDesHonoraires, verifierBareme, zoneDuBien, refusVersionBareme, type Bareme, type RegleZone, type VersionBareme,
} from './honorairesProprietaire';

/** Arno (20/10/2026) — « Honoraires propriétaire » : surface Carrez/Boutin × barème DATÉ de la zone. La règle pure. */
const B2026: Bareme = { id: 1, depuis: '2026-01-01', tresTendue: '12.10', tendue: '10.09', autre: '8.07', etatDesLieux: '3.03', source: 'Arrêté du 17/07/2025' };
const REGLES: RegleZone[] = [
  { portee: 'departement', code: '75', commune: null, tresTendue: true },
  { portee: 'departement', code: '92', commune: null, tresTendue: true },
  { portee: 'commune', code: '95100', commune: 'Argenteuil', tresTendue: false },
];
const d = (s: string) => lireDecimal(s)!;

describe('🔴 la zone — lue dans la table des zones (comme le préavis), « très tendue » l’emporte', () => {
  it('Paris et 92 : très tendue ; une commune tendue (code postal ET nom, sans accents ni casse) : tendue ; ailleurs : autre', () => {
    expect(zoneDuBien({ codePostal: '75011', commune: 'PARIS' }, REGLES)).toBe('tres_tendue');
    expect(zoneDuBien({ codePostal: '92800', commune: 'PUTEAUX' }, REGLES)).toBe('tres_tendue');
    expect(zoneDuBien({ codePostal: '95100', commune: 'ARGENTEUIL' }, REGLES)).toBe('tendue');
    expect(zoneDuBien({ codePostal: '95100', commune: 'Autre commune' }, REGLES)).toBe('autre');
    expect(zoneDuBien({ codePostal: '69001', commune: 'LYON' }, REGLES)).toBe('autre');
    expect(zoneDuBien({ codePostal: null, commune: 'PARIS' }, REGLES)).toBe('autre');
    // Sans la colonne « très tendue » (migration 392 absente) : une règle reste « tendue ».
    expect(zoneDuBien({ codePostal: '75011', commune: 'PARIS' }, REGLES.map((r) => ({ ...r, tresTendue: false })))).toBe('tendue');
  });
});

describe('🔴 le barème DATÉ — celui en vigueur à la date d’entrée', () => {
  const B2027: Bareme = { ...B2026, id: 2, depuis: '2027-01-01', tresTendue: '12.50' };
  const B2027bis: Bareme = { ...B2027, id: 3, tresTendue: '12.60' };
  it('avant le premier barème : aucun ; ensuite le plus récent dont la date ne dépasse pas l’entrée ; à égalité le dernier saisi', () => {
    expect(baremeEnVigueur([B2026, B2027], '2025-12-31')).toBeNull();
    expect(baremeEnVigueur([B2026, B2027], '2026-01-01')?.id).toBe(1);
    expect(baremeEnVigueur([B2027, B2026], '2026-12-31')?.id).toBe(1);
    expect(baremeEnVigueur([B2026, B2027], '2027-01-01')?.id).toBe(2);
    expect(baremeEnVigueur([B2026, B2027, B2027bis], '2027-06-01')?.id).toBe(3);
  });
  it('le calcul prend le barème de la date : 2026 → 12,10 €/m², 2027 → 12,50 €/m² ; avant 2026 → pas de calcul, dit', () => {
    const calc = (date: string) => calculerHonorairesProprietaire({ surface: '10', zone: 'tres_tendue', baremes: [B2026, B2027], date, dateSupposee: false });
    expect(calc('2026-06-01')).toMatchObject({ etat: 'ok', tarifZone: '12.1', visiteBail: '121' });
    expect(calc('2027-03-01')).toMatchObject({ etat: 'ok', tarifZone: '12.5', visiteBail: '125' });
    expect(calc('2025-06-01')).toEqual({ etat: 'sans_bareme', zone: 'tres_tendue', date: '2025-06-01', dateSupposee: false, motif: 'Aucun barème d’honoraires en vigueur au 01/06/2025' });
  });
});

describe('🔴 le calcul — par zone, EXACT (aucun arrondi), affiché au centime', () => {
  it('41,8 m² : très tendue 505,78 + EDL 126,654 = 632,434 € (exacts) ; affichés 505,78 / 126,65 / 632,43 €', () => {
    const c = calculerHonorairesProprietaire({ surface: '41.8', zone: 'tres_tendue', baremes: [B2026], date: '2026-11-01', dateSupposee: false });
    expect(c).toMatchObject({ etat: 'ok', surface: '41.8', visiteBail: '505.78', etatDesLieux: '126.654', total: '632.434', baremeId: 1, baremeDepuis: '2026-01-01' });
    expect(lignesHonoraires(c).map((l) => `${l.mot} : ${l.valeur}${l.detail ? ` (${l.detail})` : ''}`.replace(/\s/g, ' '))).toEqual([
      'Visite, dossier, rédaction du bail : 505,78 € (41,8 m² × 12,10 €/m² (zone très tendue))',
      'État des lieux d’entrée : 126,65 € (41,8 m² × 3,03 €/m²)',
      'Total honoraires propriétaire : 632,43 €',
    ]);
  });
  it('les trois zones : tendue 10,09, autre 8,07 ; l’état des lieux ne dépend pas de la zone', () => {
    const z = (zone: 'tendue' | 'autre') => calculerHonorairesProprietaire({ surface: '50', zone, baremes: [B2026], date: '2026-02-01', dateSupposee: false });
    expect(z('tendue')).toMatchObject({ visiteBail: '504.5', etatDesLieux: '151.5', total: '656' });
    expect(z('autre')).toMatchObject({ visiteBail: '403.5', etatDesLieux: '151.5', total: '555' });
  });
  it('décimales exactes, jamais de flottant (0,1 + 0,2) ; l’affichage arrondit au demi supérieur', () => {
    expect(texteExact({ n: BigInt(1) + BigInt(2), echelle: 1 })).toBe('0.3');
    expect(eurosAffiches(d('0.005')).replace(/\s/g, ' ')).toBe('0,01 €');
    expect(eurosAffiches(d('0.004')).replace(/\s/g, ' ')).toBe('0,00 €');
    expect(eurosAffiches(d('1234567.891')).replace(/\s/g, ' ')).toBe('1 234 567,89 €');
  });
  it('SURFACE MANQUANTE (ou nulle) : pas de calcul inventé, le motif est dit', () => {
    for (const surface of [null, '', '0', 'abc']) {
      expect(calculerHonorairesProprietaire({ surface, zone: 'autre', baremes: [B2026], date: '2026-02-01', dateSupposee: true }))
        .toEqual({ etat: 'surface_manquante', zone: 'autre', date: '2026-02-01', dateSupposee: true, motif: MOTIF_SURFACE_MANQUANTE });
    }
    expect(MOTIF_SURFACE_MANQUANTE).toBe('Surface Carrez/Boutin manquante dans la fiche du bien');
  });
  it('TOTAL DES HONORAIRES = honoraires agence (locataire) + total propriétaire ; l’un ou l’autre seul ; aucun → rien', () => {
    const c = calculerHonorairesProprietaire({ surface: '41.8', zone: 'tres_tendue', baremes: [B2026], date: '2026-11-01', dateSupposee: false });
    expect(texteExact(totalDesHonoraires(45000, c)!)).toBe('1082.434');
    expect(texteExact(totalDesHonoraires(null, c)!)).toBe('632.434');
    expect(texteExact(totalDesHonoraires(45000, null)!)).toBe('450');
    const manque = calculerHonorairesProprietaire({ surface: null, zone: 'autre', baremes: [B2026], date: '2026-11-01', dateSupposee: false });
    expect(texteExact(totalDesHonoraires(45000, manque)!)).toBe('450');
    expect(totalDesHonoraires(null, null)).toBeNull();
  });
});

describe('🔴 un nouveau barème (administrateur)', () => {
  it('date, quatre tarifs lisibles et une source exigés ; les tarifs gardés exacts', () => {
    expect(verifierBareme({ depuis: '2027-01-01', tresTendue: '12,50', tendue: '10,2', autre: '8', etatDesLieux: '3,1', source: ' Arrêté X ' }))
      .toEqual({ ok: true, valeurs: { depuis: '2027-01-01', tresTendue: '12.5', tendue: '10.2', autre: '8', etatDesLieux: '3.1', source: 'Arrêté X' } });
    expect(verifierBareme({ tresTendue: '12', tendue: '10', autre: '8', etatDesLieux: '3', source: 'x' })).toEqual({ ok: false, motif: 'La date d’effet est obligatoire (JJ/MM/AAAA).' });
    expect(verifierBareme({ depuis: '2027-01-01', tresTendue: 'douze', tendue: '10', autre: '8', etatDesLieux: '3', source: 'x' }).ok).toBe(false);
    expect(verifierBareme({ depuis: '2027-01-01', tresTendue: '12', tendue: '10', autre: '8', etatDesLieux: '3', source: '' }).ok).toBe(false);
  });
});

/** 🔴 Arno (21/10/2026, 395) — LES VERSIONS DU BARÈME : jamais antérieure à la précédente ; utilisée = figée ; future inutilisée = corrigeable. */
describe('refusVersionBareme — la règle des versions', () => {
  const V = (id: number, depuis: string, baux: number): VersionBareme => ({ id, depuis, tresTendue: '12.1', tendue: '10.09', autre: '8.07', etatDesLieux: '3.03', source: 's',
    saisiLe: '2026-01-01', saisiPar: 'x', corrigeLe: null, corrigePar: null, baux });
  const versions = [V(1, '2026-01-01', 4), V(2, '2026-12-01', 0)];
  it('une NOUVELLE version : aujourd’hui ou après la plus récente ; jamais antérieure', () => {
    expect(refusVersionBareme({ depuis: '2026-12-01', versions, aujourdhui: '2026-10-21' })).toBeNull();
    expect(refusVersionBareme({ depuis: '2027-01-01', versions, aujourdhui: '2026-10-21' })).toBeNull();
    expect(refusVersionBareme({ depuis: '2026-10-21', versions, aujourdhui: '2026-10-21' }))
      .toBe('La date « Applicable à partir du » ne peut pas être antérieure à celle de la version précédente (01/12/2026).');
  });
  it('une version UTILISÉE par un bail ne se corrige pas', () => {
    expect(refusVersionBareme({ depuis: '2027-01-01', versions, aujourdhui: '2026-10-21', corrigee: versions[0] }))
      .toBe('Cette version est utilisée par 4 baux : elle ne se modifie pas. Enregistrez une nouvelle version.');
  });
  it('une version déjà EN VIGUEUR (même sans bail) ne se corrige pas', () => {
    expect(refusVersionBareme({ depuis: '2027-01-01', versions: [V(1, '2026-01-01', 0)], aujourdhui: '2026-10-21', corrigee: V(1, '2026-01-01', 0) }))
      .toMatch(/^Seule une version future se corrige : celle-ci s’applique depuis le 01\/01\/2026/);
  });
  it('une version FUTURE jamais utilisée se corrige, reste future, et pas avant la précédente', () => {
    expect(refusVersionBareme({ depuis: '2026-11-15', versions, aujourdhui: '2026-10-21', corrigee: versions[1] })).toBeNull();
    expect(refusVersionBareme({ depuis: '2026-10-21', versions, aujourdhui: '2026-10-21', corrigee: versions[1] })).toBe('Une version corrigée reste future : choisissez une date après le 21/10/2026.');
    expect(refusVersionBareme({ depuis: '2026-11-15', versions: [V(1, '2026-01-01', 0), V(3, '2026-12-01', 0), V(4, '2027-01-01', 0)], aujourdhui: '2026-10-21', corrigee: V(4, '2027-01-01', 0) }))
      .toBe('La date « Applicable à partir du » ne peut pas être antérieure à celle de la version précédente (01/12/2026).');
  });
});

/** 🔴 Arno (21/10/2026, 402) — LE MONTANT SAISI À LA MAIN : exact, au centime au plus ; dit « saisi à la main » ; compté au total. */
describe('honoraires propriétaire saisis à la main', () => {
  it('montantHonorairesSaisi : euros au centime au plus → texte EXACT ; vide → null ; illisible → false', async () => {
    const { montantHonorairesSaisi } = await import('./honorairesProprietaire');
    expect(montantHonorairesSaisi('935,03')).toBe('935.03');
    expect(montantHonorairesSaisi('1 200')).toBe('1200');
    expect(montantHonorairesSaisi('935.03 €')).toBe('935.03');
    expect(montantHonorairesSaisi('0')).toBe('0');
    expect(montantHonorairesSaisi('')).toBeNull();
    expect(montantHonorairesSaisi('   ')).toBeNull();
    expect(montantHonorairesSaisi(undefined)).toBeNull();
    expect(montantHonorairesSaisi('935,034')).toBe(false);
    expect(montantHonorairesSaisi('abc')).toBe(false);
    expect(montantHonorairesSaisi('-5')).toBe(false);
  });
  it('montantPourChamp : le calcul pré-rempli au centime (affichage seulement) ; rien sans montant', async () => {
    const { montantPourChamp } = await import('./honorairesProprietaire');
    const ok = calculerHonorairesProprietaire({ surface: '61.8', zone: 'tres_tendue', baremes: [{ id: 1, depuis: '2026-01-01', tresTendue: '12.1', tendue: '10.09', autre: '8.07', etatDesLieux: '3.03', source: 's' }], date: '2026-11-01', dateSupposee: false });
    expect(ok.etat === 'ok' ? ok.total : null).toBe('935.034');
    expect(montantPourChamp(ok)).toBe('935,03');
    expect(montantPourChamp({ etat: 'saisi', zone: 'autre', date: '2026-11-01', dateSupposee: false, total: '1200' })).toBe('1200,00');
    expect(montantPourChamp(null)).toBe('');
    expect(montantPourChamp({ etat: 'surface_manquante', zone: 'autre', date: '2026-11-01', dateSupposee: false, motif: MOTIF_SURFACE_MANQUANTE })).toBe('');
  });
  it('lignesHonoraires : « 935,03 € (saisi à la main) », sans surface ni barème ; total des honoraires = agence + saisi', () => {
    const s = { etat: 'saisi' as const, zone: 'autre' as const, date: '2026-11-01', dateSupposee: false, total: '935.03' };
    expect(lignesHonoraires(s)).toEqual([{ mot: 'Total honoraires propriétaire', valeur: '935,03 € (saisi à la main)' }]);
    expect(eurosAffiches(totalDesHonoraires(10000, s)!)).toBe('1\u202f035,03 €');
  });
});

describe('honorairesAEnregistrer — à l’enregistrement du locataire (Arno, 21/10/2026, 402)', () => {
  const OK = calculerHonorairesProprietaire({ surface: '61.8', zone: 'tres_tendue', baremes: [{ id: 1, depuis: '2026-01-01', tresTendue: '12.1', tendue: '10.09', autre: '8.07', etatDesLieux: '3.03', source: 's' }], date: '2026-11-01', dateSupposee: false });
  it('rien de saisi (absent ou vide) : le calcul, inchangé', async () => {
    const { honorairesAEnregistrer } = await import('./honorairesProprietaire');
    expect(honorairesAEnregistrer(OK, undefined, '2026-11-01', '2026-10-21')).toEqual({ ok: true, honoraires: OK, saisi: false });
    expect(honorairesAEnregistrer(OK, '  ', '2026-11-01', '2026-10-21')).toEqual({ ok: true, honoraires: OK, saisi: false });
  });
  it('saisi : remplace le calcul (zone et date du calcul), montant EXACT ; sans calcul : zone « autre », date d’entrée', async () => {
    const { honorairesAEnregistrer } = await import('./honorairesProprietaire');
    expect(honorairesAEnregistrer(OK, '1 000,5', '2026-11-01', '2026-10-21')).toEqual({ ok: true, saisi: true,
      honoraires: { etat: 'saisi', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, total: '1000.5' } });
    expect(honorairesAEnregistrer(null, '935,03', '2026-11-01', '2026-10-21')).toEqual({ ok: true, saisi: true,
      honoraires: { etat: 'saisi', zone: 'autre', date: '2026-11-01', dateSupposee: false, total: '935.03' } });
  });
  it('illisible : refus dit', async () => {
    const { honorairesAEnregistrer, MOTIF_MONTANT_SAISI } = await import('./honorairesProprietaire');
    expect(honorairesAEnregistrer(OK, '12,345', '2026-11-01', '2026-10-21')).toEqual({ ok: false, motif: MOTIF_MONTANT_SAISI });
  });
});
