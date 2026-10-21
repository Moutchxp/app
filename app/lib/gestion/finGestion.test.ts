import { describe, expect, it } from 'vitest';
import {
  aArchiver, ajouterMois, dossiersAnnuelsActifs, dureeMois, echeanceArchivage, etapeFinGestion, phraseArchivage, texteBandeauGestionTerminee, verifierDelai,
} from './finGestion';
import { etatDossierBien, placeDuStatut, planDossierBien } from './arbreStatutDrive';
import { planBrancheBail } from '../location/brancheBailDrive';

/** 🔴 Arno (21/10/2026, 405) — la fin de gestion en deux temps : « Gestion terminée », puis archivage à fin + délai. PUR. */
describe('🔴 les étapes et l’échéance', () => {
  const termine = { statut: 'ancienne_gestion' as const, archiveLe: null, fin: '2026-10-21' };
  it('en gestion → active ; ancienne non archivée → terminée ; archivée → archivée ; location seule → hors gestion', () => {
    expect(etapeFinGestion({ statut: 'en_gestion', archiveLe: null })).toBe('active');
    expect(etapeFinGestion(termine)).toBe('terminee');
    expect(etapeFinGestion({ ...termine, archiveLe: '2028-10-21T05:15:00Z' })).toBe('archivee');
    expect(etapeFinGestion({ statut: 'location_seule', archiveLe: null })).toBe('hors_gestion');
  });

  it('archivage à J + 24 mois (horloge simulée) : pas la veille, le jour même et après', () => {
    expect(echeanceArchivage(termine, 24)).toBe('2028-10-21');
    expect(aArchiver(termine, 24, '2027-10-21')).toBe(false);   // J + 1 an
    expect(aArchiver(termine, 24, '2028-10-20')).toBe(false);
    expect(aArchiver(termine, 24, '2028-10-21')).toBe(true);
    expect(aArchiver(termine, 24, '2031-01-01')).toBe(true);
  });

  it('jamais pour un bien repris en gestion, passé en location seule, ou déjà archivé ; le délai réglé s’applique', () => {
    expect(aArchiver({ ...termine, statut: 'en_gestion' }, 24, '2030-01-01')).toBe(false);
    expect(aArchiver({ ...termine, statut: 'location_seule' }, 24, '2030-01-01')).toBe(false);
    expect(aArchiver({ ...termine, archiveLe: '2028-10-21T05:15:00Z' }, 24, '2030-01-01')).toBe(false);
    expect(echeanceArchivage(termine, 12)).toBe('2027-10-21');
    expect(echeanceArchivage({ ...termine, fin: null }, 24)).toBeNull();
  });

  it('les mois : fin de mois tenue, années bissextiles', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2026-02-29'.replace('29', '28'), 24)).toBe('2028-02-28');
    expect(ajouterMois('2027-12-15', 2)).toBe('2028-02-15');
    expect(ajouterMois('2026-03-31', 23)).toBe('2028-02-29');
  });

  it('les mots : bandeau, Historique, durée ; le délai saisi est un entier de 1 à 240 mois', () => {
    expect(texteBandeauGestionTerminee('2026-10-21')).toBe('Gestion terminée le 21/10/2026 — plus en gestion active');
    expect(phraseArchivage('2026-10-21', 24)).toBe('Archivage automatique : fin de gestion le 21/10/2026 + 2 ans');
    expect([dureeMois(12), dureeMois(18), dureeMois(36)]).toEqual(['1 an', '18 mois', '3 ans']);
    expect(verifierDelai('24')).toEqual({ ok: true, mois: 24 });
    expect(verifierDelai(0)).toMatchObject({ ok: false });
    expect(verifierDelai('2,5')).toMatchObject({ ok: false });
    expect(verifierDelai(241)).toMatchObject({ ok: false });
  });
});

describe('🔴 dès la date de fin : plus de dossiers annuels, le dossier Drive reste à sa place ; archivé : « Inactifs »', () => {
  it('les dossiers annuels : oui en gestion (et en location seule) ; non en ancienne gestion', () => {
    expect([dossiersAnnuelsActifs('en_gestion'), dossiersAnnuelsActifs('location_seule'), dossiersAnnuelsActifs('ancienne_gestion')]).toEqual([true, true, false]);
    const base = { place: placeDuStatut('en_gestion'), annee: 2027, proprietaire: { id: 1, nom: 'X' }, adresse: { cle: 'a:1:A:x', nom: 'A' },
      bien: { teteId: 9, nom: 'B' }, parentN3: 'N2', existants: new Map<string, string>() };
    const avec = planDossierBien(base); const sans = planDossierBien({ ...base, annuels: false });
    if (!avec.ok || !sans.ok) throw new Error();
    expect(avec.creations.filter((c) => c.sorte === 'annee').map((c) => c.cle)).toEqual(['y:pr:9:0:2027', 'y:pr:9:1:2027']);
    expect(sans.creations.filter((c) => c.sorte === 'annee')).toEqual([]);
    const bail = (annuels: boolean) => planBrancheBail({ bailId: 5, annee: 2027, entree: '2026-01-01', nomN7: 'BAIL', proprietaire: { id: 1, nom: 'X' },
      bien: { teteId: 9, nom: 'B' }, adresse: { cle: 'a:1:A:x', nom: 'A' }, n2: 'N2', existants: new Map(), annuels });
    const b1 = bail(true); const b2 = bail(false);
    if (!b1.ok || !b2.ok) throw new Error();
    expect(b1.creations.filter((c) => c.sorte === 'annee').length).toBe(4);
    expect(b2.creations.filter((c) => c.sorte === 'annee')).toEqual([]);
  });

  it('« Gestion terminée » : le dossier ne bouge pas (Actifs ou déjà Inactifs) ; archivé : « Inactifs » ; repris : « Actifs »', () => {
    expect(etatDossierBien('ancienne_gestion', { arbre: 'locative', branche: 'Actifs' }, false)).toEqual({ etat: 'ok' });
    expect(etatDossierBien('ancienne_gestion', { arbre: 'locative', branche: 'Inactifs' }, false)).toEqual({ etat: 'ok' });
    expect(etatDossierBien('ancienne_gestion', { arbre: 'locative', branche: 'Actifs' }, true))
      .toEqual({ etat: 'a_deplacer', depuis: { arbre: 'locative', branche: 'Actifs' }, vers: { arbre: 'locative', branche: 'Inactifs' } });
    expect(etatDossierBien('en_gestion', { arbre: 'locative', branche: 'Inactifs' })).toMatchObject({ etat: 'a_deplacer', vers: { branche: 'Actifs' } });
    expect(placeDuStatut('ancienne_gestion', false)).toEqual({ arbre: 'locative', branche: 'Actifs' });
    expect(placeDuStatut('ancienne_gestion', true)).toEqual({ arbre: 'locative', branche: 'Inactifs' });
  });
});
