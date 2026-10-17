import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assietteMensuelle, calculerHonoraires, formaterEuros, fractionDuMois, honorairesMensuels, joursDansMois, lireBaseWippimmo,
  lireNombre, lireTauxWippimmo, proposerTaux, tvaEnVigueur, verifierConditions, type LocationPourHonoraires,
} from './honorairesGestion';

/**
 * 🔴 LOT L1 (validé par Arno le 17/10/2026) — loyer de départ, taux et honoraires de gestion. Ici : la règle PURE et les
 * gardes du dépôt, qui tournent dans `npm test`. Le parcours complet (import, reprise, saisie) est éprouvé sur une base
 * jetable par `honorairesGestion.itest.ts`.
 */
const TVA = [{ valeur: 20, depuis: '2014-01-01' }];

describe('lire les nombres et les colonnes WIPPIMMO, sans rien deviner', () => {
  it('écriture française ou anglaise, espaces insécables ignorés', () => {
    expect(lireNombre('1 180,50')).toBe(1180.5);
    expect(lireNombre('1 180')).toBe(1180);
    expect(lireNombre('4.5')).toBe(4.5);
    expect(lireNombre('')).toBeNull();
    expect(lireNombre('abc')).toBeNull();
  });
  it('« Tx honos » : un pourcentage entre 0 et 100, sinon null ; « Base honos » gardée telle quelle', () => {
    expect(lireTauxWippimmo('5,83')).toBe(5.83);
    expect(lireTauxWippimmo('')).toBeNull();
    expect(lireTauxWippimmo('120')).toBeNull();
    expect(lireBaseWippimmo(' lcdta ')).toBe('LCDTA');
    expect(lireBaseWippimmo('')).toBeNull();
  });
});

describe('le taux proposé : location précédente › taux WIPPIMMO › réglage agence', () => {
  it('dans cet ordre, et dit d’où il vient', () => {
    expect(proposerTaux({ precedent: 3.75, wippimmo: 4.5, reglage: 4.5 })).toEqual({ taux: 3.75, source: 'precedente' });
    expect(proposerTaux({ precedent: null, wippimmo: 5.83, reglage: 4.5 })).toEqual({ taux: 5.83, source: 'wippimmo' });
    expect(proposerTaux({ precedent: null, wippimmo: null, reglage: 4.5 })).toEqual({ taux: 4.5, source: 'reglage' });
  });
});

describe('le calcul : (loyer HC + provisions) × taux HT, TTC par la TVA datée, sans arrondi', () => {
  it('l’exemple de l’étude : (1 180 + 90) × 4,5 % = 57,15 € HT, 68,58 € TTC', () => {
    const h = honorairesMensuels({ loyerHc: 1180, provisions: 90, base: 'cc', tauxHt: 4.5 }, 20);
    expect(h?.ht).toBeCloseTo(57.15, 10);
    expect(h?.ttc).toBeCloseTo(68.58, 10);
    expect(formaterEuros(h?.ht ?? 0)).toMatch(/^57,15\s€$/);
  });
  it('base hors charges : les provisions ne comptent pas', () => {
    expect(assietteMensuelle({ loyerHc: 1180, provisions: 90, base: 'hc' })).toBe(1180);
  });
  it('🔴 loyer absent : rien n’est inventé (null), même avec un taux', () => {
    expect(assietteMensuelle({ loyerHc: null, provisions: 90, base: 'cc' })).toBeNull();
    expect(honorairesMensuels({ loyerHc: null, provisions: null, base: 'cc', tauxHt: 4.5 }, 20)).toBeNull();
  });
  it('aucun arrondi intermédiaire : 5,83 % de 770 reste 44,891', () => {
    expect(honorairesMensuels({ loyerHc: 720, provisions: 50, base: 'cc', tauxHt: 5.83 }, null)?.ht).toBeCloseTo(44.891, 12);
  });
  it('TVA datée : la plus récente dont l’effet a commencé', () => {
    const lignes = [{ valeur: 19.6, depuis: '2000-01-01' }, { valeur: 20, depuis: '2014-01-01' }];
    expect(tvaEnVigueur(lignes, '2013-12-31')).toBe(19.6);
    expect(tvaEnVigueur(lignes, '2026-10-17')).toBe(20);
    expect(tvaEnVigueur(lignes, '1999-01-01')).toBeNull();
  });
});

describe('le prorata d’un mois', () => {
  it('mois plein, entrée en cours de mois, sortie en cours de mois (jours inclus)', () => {
    expect(joursDansMois(2026, 2)).toBe(28);
    expect(fractionDuMois(null, null, 2026, 10)).toBe(1);
    expect(fractionDuMois('2026-10-20', null, 2026, 10)).toBeCloseTo(12 / 31, 12);
    expect(fractionDuMois('2020-01-01', '2026-10-15', 2026, 10)).toBeCloseTo(15 / 31, 12);
    expect(fractionDuMois('2026-11-01', null, 2026, 10)).toBe(0);
  });
});

const loc = (o: Partial<LocationPourHonoraires> & { occupationId: number; lotId: number }): LocationPourHonoraires => ({
  lotNumero: String(o.lotId), lotLibelle: `lot ${o.lotId}`, locataire: `L${o.occupationId}`, entree: '2020-01-01',
  sortie: null, conditions: null, proprietaires: [{ id: 1, nom: 'P1' }], ...o,
});

describe('la vue des honoraires : par lot, par propriétaire, agence ; loyers absents exclus et comptés', () => {
  const locations = [
    loc({ occupationId: 1, lotId: 10, conditions: { loyerHc: 1180, provisions: 90, tauxHt: 4.5, base: 'cc' } }),
    loc({ occupationId: 2, lotId: 20, conditions: { loyerHc: null, provisions: null, tauxHt: 4.5, base: 'cc' } }),
    loc({ occupationId: 3, lotId: 30, conditions: null }),
    loc({ occupationId: 4, lotId: 40, conditions: { loyerHc: 1000, provisions: 0, tauxHt: 5, base: 'cc' },
      proprietaires: [{ id: 1, nom: 'P1' }, { id: 2, nom: 'P2' }] }),
  ];
  it('mois : total = lots avec loyer ; 2 locations « à saisir », exclues et dites', () => {
    const r = calculerHonoraires(locations, { annee: 2026, mois: 10 }, TVA);
    expect(r.totalHt).toBeCloseTo(57.15 + 50, 10);
    expect(r.totalTtc).toBeCloseTo((57.15 + 50) * 1.2, 10);
    expect(r.comptees).toBe(2);
    expect(r.manquantes).toBe(2);
    expect(r.parLot.find((l) => l.lotId === 20)?.manquantes).toBe(1);
    expect(r.parLot.find((l) => l.lotId === 20)?.ht).toBe(0);
  });
  it('année : la somme des 12 mois', () => {
    const r = calculerHonoraires(locations, { annee: 2026, mois: null }, TVA);
    expect(r.totalHt).toBeCloseTo((57.15 + 50) * 12, 8);
  });
  it('🔴 indivision : le lot compte entier pour chaque propriétaire, une seule fois pour l’agence', () => {
    const r = calculerHonoraires(locations, { annee: 2026, mois: 10 }, TVA);
    const p1 = r.parProprietaire.find((p) => p.id === 1);
    const p2 = r.parProprietaire.find((p) => p.id === 2);
    expect(p2?.ht).toBeCloseTo(50, 10);
    expect(p2?.indivision).toBe(true);
    expect(p1?.ht).toBeCloseTo(57.15 + 50, 10);
    expect(r.totalHt).toBeCloseTo(57.15 + 50, 10);
  });
  it('changement de locataire en cours de mois : chacun au prorata, l’historique des deux compte', () => {
    const r = calculerHonoraires([
      loc({ occupationId: 5, lotId: 50, entree: '2020-01-01', sortie: '2026-10-15',
        conditions: { loyerHc: 1000, provisions: 0, tauxHt: 3, base: 'cc' } }),
      loc({ occupationId: 6, lotId: 50, entree: '2026-10-16',
        conditions: { loyerHc: 1200, provisions: 0, tauxHt: 4.5, base: 'cc' } }),
    ], { annee: 2026, mois: 10 }, TVA);
    expect(r.totalHt).toBeCloseTo(30 * 15 / 31 + 54 * 16 / 31, 10);
    expect(r.parLot).toHaveLength(1);
    expect(r.parLot[0].tauxHt).toBe(4.5);
  });
  it('cooccupants d’un même bail (même lot, même entrée) : le loyer saisi sur une carte couvre les autres', () => {
    const r = calculerHonoraires([
      loc({ occupationId: 7, lotId: 70, entree: '2026-01-01', conditions: { loyerHc: 1000, provisions: 0, tauxHt: 5, base: 'cc' } }),
      loc({ occupationId: 8, lotId: 70, entree: '2026-01-01', conditions: null }),
    ], { annee: 2026, mois: 10 }, TVA);
    expect(r.totalHt).toBeCloseTo(50, 10);
    expect(r.manquantes).toBe(0);
  });
  it('une location hors de la période ne compte pas', () => {
    const r = calculerHonoraires([loc({ occupationId: 9, lotId: 90, entree: '2027-01-01',
      conditions: { loyerHc: 1000, provisions: 0, tauxHt: 5, base: 'cc' } })], { annee: 2026, mois: null }, TVA);
    expect(r.comptees + r.manquantes).toBe(0);
  });
});

describe('la saisie : écran et serveur appellent la même vérification', () => {
  it('loyer facultatif, taux obligatoire, base fermée', () => {
    expect(verifierConditions({ loyerHc: '1 180', provisions: '90', tauxHt: '4,5', base: 'cc' }))
      .toEqual({ ok: true, valeurs: { loyerHc: 1180, provisions: 90, tauxHt: 4.5, base: 'cc' } });
    expect(verifierConditions({ loyerHc: '', tauxHt: '4,5', base: 'hc' }))
      .toEqual({ ok: true, valeurs: { loyerHc: null, provisions: null, tauxHt: 4.5, base: 'hc' } });
    expect(verifierConditions({ tauxHt: '', base: 'cc' }).ok).toBe(false);
    expect(verifierConditions({ tauxHt: '150', base: 'cc' }).ok).toBe(false);
    expect(verifierConditions({ loyerHc: 'mille', tauxHt: '4', base: 'cc' }).ok).toBe(false);
    expect(verifierConditions({ tauxHt: '4', base: 'autre' }).ok).toBe(false);
  });
});

describe('🔴 gardes du lot L1', () => {
  const norm = (f: string): string => readFileSync(f, 'utf8').replace(/\s+/g, ' ');
  it('le module de calcul est pur (aucun accès base) et donc importable par l’écran', () => {
    const src = readFileSync('app/lib/gestion/honorairesGestion.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\.\/db\//);
    expect(src).not.toMatch(/from 'pg'/);
  });
  it('les conditions s’écrivent par INSERT seulement (ajout seul), jamais UPDATE ni DELETE', () => {
    const repo = norm('app/lib/gestion/honorairesGestionRepo.ts');
    expect(repo).toContain('INSERT INTO gestion_location_conditions');
    expect(repo).not.toMatch(/UPDATE gestion_location_conditions|DELETE FROM gestion_location_conditions/);
  });
  it('l’import écrit le taux WIPPIMMO dans une passe À PART, sans toucher à l’empreinte ni aux compteurs des lots', () => {
    const repo = norm('app/lib/gestion/annuaireRepo.ts');
    const lots = repo.slice(repo.indexOf('async function ecrireLots('), repo.indexOf('async function ecrireTauxHonos('));
    expect(lots).not.toContain('taux_honos_wippimmo');
    expect(repo).toContain('await ecrireTauxHonos(q, plan, options.appliquer, c);');
    const passe = repo.slice(repo.indexOf('async function ecrireTauxHonos('), repo.indexOf('async function ecrireLocataires('));
    expect(passe).toContain('UPDATE gestion_annuaire_lot SET taux_honos_wippimmo = $2, base_honos_wippimmo = $3');
    expect(passe).not.toMatch(/lotsMajs|lotsInchanges|absent_le|importe_le/);
  });
  it('l’écran des honoraires vit dans la TUILE LOCATION et est réservé aux administrateurs (route ET page)', () => {
    const route = readFileSync('app/(admin)/api/admin/location/honoraires/route.ts', 'utf8');
    expect(route.match(/exigerAdministrateur\(request\)/g)).toHaveLength(2);
    const page = readFileSync('app/(admin)/admin/(protected)/location/honoraires/page.tsx', 'utf8');
    expect(page).toContain("session?.role === 'administrateur'");
  });
  /* 🔴 Règle d'Arno du 17/10/2026 (« une seule fiche ») : le loyer de départ et le taux rejoignent la FICHE COMMUNE, dans
     sa section repliable « Location » (`SectionsLocationFiche.tsx`, route `annuaire/location`). L'ÉCRAN « Honoraires de
     gestion », lui, reste dans les Outils de suivi de la Location : ni écran, ni route, ni lien d'honoraires dans la
     Gestion, et le corps des écrans de la Gestion ne s'en charge pas lui-même. */
  it('🔴 l’écran « Honoraires » reste dans la Location ; la fiche commune porte loyer et taux dans sa seule section repliable', () => {
    const sections = readFileSync('app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'utf8');
    expect(sections).toContain('LocationCarte');
    expect(sections).not.toMatch(/lienHonoraires|\/honoraires/);
    expect(existsSync('app/(admin)/admin/(protected)/gestion/honoraires')).toBe(false);
    expect(existsSync('app/(admin)/api/admin/gestion/honoraires')).toBe(false);
    for (const f of ['Annuaire.tsx', 'GestionVue.tsx', 'PleinEcranBoite.tsx', 'page.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
      expect(src, f).not.toMatch(/LocationCarte|lienHonoraires|honoraires|conditions-location/i);
    }
    expect(readFileSync('app/(admin)/api/admin/gestion/annuaire/route.ts', 'utf8')).not.toContain('conditions-location');
  });
});
