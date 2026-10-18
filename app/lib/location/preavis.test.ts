import { describe, it, expect } from 'vitest';
import {
  ajouterMois, dateMaxPreavis, dureeProposee, enZoneTendue, lireTri, mentionCourtePreavis, mentionPreavis, statutPreavis, trierPreavis,
  TRI_DEFAUT, verifierEtatDesLieux, verifierPreavis, type LignePreavisAccueil, type RegleZoneTendue,
} from './preavis';

/** LE PRÉAVIS DU LOCATAIRE (Arno, 18/10/2026) — les règles, sans base. */
const JOUR = '2026-10-19';
const REGLES: RegleZoneTendue[] = [
  { portee: 'departement', code: '75', commune: null },
  { portee: 'departement', code: '92', commune: null },
  { portee: 'commune', code: '95100', commune: 'Argenteuil' },
];

describe('la durée proposée', () => {
  it('meublé → 1 mois ; vide en zone tendue → 1 mois ; vide hors zone → 3 mois ; meublé inconnu = vide', () => {
    expect(dureeProposee({ meuble: true, zoneTendue: false })).toEqual({ duree: 1, raison: 'logement meublé' });
    expect(dureeProposee({ meuble: false, zoneTendue: true })).toEqual({ duree: 1, raison: 'logement vide en zone tendue' });
    expect(dureeProposee({ meuble: false, zoneTendue: false })).toEqual({ duree: 3, raison: 'logement vide hors zone tendue' });
    expect(dureeProposee({ meuble: null, zoneTendue: false }).duree).toBe(3);
  });
});

describe('la date maximale de sortie', () => {
  it('réception + 1 mois (meublé) / + 1 mois (vide, zone tendue) / + 3 mois (vide, hors zone)', () => {
    expect(dateMaxPreavis('2026-10-15', { mode: 'mois', duree: 1 })).toBe('2026-11-15');
    expect(dateMaxPreavis('2026-10-15', { mode: 'mois', duree: 3 })).toBe('2027-01-15');
  });
  it('fin de mois : le 31/01 + 1 mois = le dernier jour de février', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29');
    expect(ajouterMois('2026-11-30', 3)).toBe('2027-02-28');
  });
  it('durée CORRIGÉE à la main : 3 mois au lieu de 1, ou date maximale saisie', () => {
    expect(dateMaxPreavis('2026-10-15', { mode: 'mois', duree: 3 })).toBe('2027-01-15');
    expect(dateMaxPreavis('2026-10-15', { mode: 'date_manuelle', dateMax: '2026-12-01' })).toBe('2026-12-01');
  });
});

describe('le contrôle du préavis', () => {
  const ok = { recuLe: '2026-10-15', choix: { mode: 'mois' as const, duree: 1 as const }, entrees: ['2022-09-01'] };
  it('réception obligatoire, valide, jamais dans le futur ni avant l’entrée', () => {
    expect(verifierPreavis({ ...ok, recuLe: '' }, JOUR)).toEqual({ ok: false, motif: 'Saisissez la date de réception du recommandé' });
    expect(verifierPreavis({ ...ok, recuLe: '2026-02-30' }, JOUR).ok).toBe(false);
    expect(verifierPreavis({ ...ok, recuLe: '2026-10-20' }, JOUR)).toEqual({ ok: false, motif: 'La date de réception ne peut pas être dans le futur' });
    expect(verifierPreavis({ ...ok, recuLe: '2022-08-01' }, JOUR).ok).toBe(false);
  });
  it('date maximale saisie : obligatoire et jamais avant la réception', () => {
    expect(verifierPreavis({ ...ok, choix: { mode: 'date_manuelle', dateMax: '' } }, JOUR).ok).toBe(false);
    expect(verifierPreavis({ ...ok, choix: { mode: 'date_manuelle', dateMax: '2026-10-01' } }, JOUR).ok).toBe(false);
  });
  it('accepté : rend la date maximale', () => {
    expect(verifierPreavis(ok, JOUR)).toEqual({ ok: true, dateMax: '2026-11-15' });
  });
});

describe('le statut et sa mention (avec le mot, jamais la couleur seule)', () => {
  it('en préavis jusqu’à la date maximale (incluse), échu au-delà', () => {
    expect(statutPreavis({ dateMax: JOUR }, JOUR)).toBe('en_preavis');
    expect(mentionPreavis({ dateMax: '2026-11-15' }, JOUR)).toBe('en préavis — sortie au plus tard le 15/11/2026');
    expect(statutPreavis({ dateMax: '2026-10-18' }, JOUR)).toBe('echu');
    expect(mentionPreavis({ dateMax: '2026-10-18' }, JOUR)).toBe('Préavis échu — sortie à saisir (au plus tard le 18/10/2026)');
  });
});

describe('la zone tendue : une DONNÉE (règles en base)', () => {
  it('un département couvre ses codes postaux ; une commune se reconnaît à son code postal ET à son nom', () => {
    expect(enZoneTendue({ codePostal: '75011', commune: 'Paris' }, REGLES)).toBe(true);
    expect(enZoneTendue({ codePostal: '92800', commune: 'PUTEAUX' }, REGLES)).toBe(true);
    expect(enZoneTendue({ codePostal: '95100', commune: 'ARGENTEUIL' }, REGLES)).toBe(true);
    expect(enZoneTendue({ codePostal: '95100', commune: 'Autre' }, REGLES)).toBe(false);
    expect(enZoneTendue({ codePostal: '78000', commune: 'Versailles' }, REGLES)).toBe(false);
    expect(enZoneTendue({ codePostal: null, commune: 'Paris' }, REGLES)).toBe(false);
    expect(enZoneTendue({ codePostal: '75011', commune: 'Paris' }, [])).toBe(false);   // sans règle en base : hors zone
  });
});

describe('l’accueil « Locataires en préavis » (Arno, 18/10/2026)', () => {
  it('mention courte : « en préavis » ; date passée → « Préavis échu — sortie à saisir »', () => {
    expect(mentionCourtePreavis({ dateMax: '2026-10-19' }, '2026-10-19')).toBe('en préavis');
    expect(mentionCourtePreavis({ dateMax: '2026-10-18' }, '2026-10-19')).toBe('Préavis échu — sortie à saisir');
  });

  it('état des lieux : vide = effacer ; jamais avant la réception ; au plus 6 mois après la fin (sur le groupe)', () => {
    const g = [{ recuLe: '2026-10-01', dateMax: '2026-11-01' }, { recuLe: '2026-10-05', dateMax: '2026-11-05' }];
    expect(verifierEtatDesLieux('', g)).toEqual({ ok: true, date: null });
    expect(verifierEtatDesLieux(null, g)).toEqual({ ok: true, date: null });
    expect(verifierEtatDesLieux('2026-13-01', g).ok).toBe(false);
    expect(verifierEtatDesLieux('2026-10-04', g).ok).toBe(false);
    expect(verifierEtatDesLieux('2026-10-05', g)).toEqual({ ok: true, date: '2026-10-05' });
    expect(verifierEtatDesLieux('2027-05-05', g)).toEqual({ ok: true, date: '2027-05-05' });
    const trop = verifierEtatDesLieux('2027-05-06', g);
    expect(trop).toEqual({ ok: false, motif: 'L’état des lieux ne peut pas dépasser de plus de 6 mois la fin du préavis (au plus tard le 05/05/2027)' });
  });

  const l = (cle: string, dateMax: string, edl: string | null): LignePreavisAccueil => ({
    cle, lotId: 1, adresse: null, occupationId: 1, occupationIds: [1], locataires: [], recuLe: '2026-01-01', dateMax, etatDesLieuxLe: edl,
  });
  const L = [l('a', '2026-12-01', '2026-12-10'), l('b', '2026-11-01', null), l('c', '2027-01-01', '2026-11-20'), l('d', '2026-10-01', null)];
  const cles = (t: Parameters<typeof trierPreavis>[1]): string[] => trierPreavis(L, t).map((x) => x.cle);

  it('tri par défaut = fin de préavis la plus proche d’abord ; les 4 sens ; sans état des lieux TOUJOURS en dernier', () => {
    expect(TRI_DEFAUT).toEqual({ cle: 'fin', sens: 'asc' });
    expect(cles({ cle: 'fin', sens: 'asc' })).toEqual(['d', 'b', 'a', 'c']);
    expect(cles({ cle: 'fin', sens: 'desc' })).toEqual(['c', 'a', 'b', 'd']);
    expect(cles({ cle: 'edl', sens: 'asc' })).toEqual(['c', 'a', 'd', 'b']);
    expect(cles({ cle: 'edl', sens: 'desc' })).toEqual(['a', 'c', 'd', 'b']);
    expect(L.map((x) => x.cle)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('préférence mémorisée : lue si reconnue, sinon le tri par défaut', () => {
    expect(lireTri('edl:desc')).toEqual({ cle: 'edl', sens: 'desc' });
    expect(lireTri(null)).toEqual(TRI_DEFAUT);
    expect(lireTri('n’importe:quoi')).toEqual(TRI_DEFAUT);
  });
});
