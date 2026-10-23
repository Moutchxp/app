import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  casGestionDuBien, cleTotauxOrigine, libelleOrigineContact, motPrimeDejaVersee, originesProposees, preremplissageGestion,
  sqlPorteUnePrime, verifierActivite, verifierCommercial,
} from './suivi';
import { primeDe, type ActiviteCalcul } from './tableauBord';

/**
 * 🔴 Arno (24/10/2026) — « Suivi commercial » : la situation du bien, UNE seule prime de nouvelle gestion par bien (y compris après
 * sortie et retour en gestion), les cases exclusives, l'origine « Personnalisé ». Base simulée : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
const appels: { sql: string; params: unknown[] }[] = [];
let primeExistante: { date_signature: string; bail: string } | null = null;
let colonnes411 = true;
let entree: string | null = '2026-09-01';
let dejaLoue = false;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('SELECT apporteur_id, lot_id FROM gestion_location_activite WHERE id = $1 FOR UPDATE')) return { rows: [{ apporteur_id: null, lot_id: '7' }] };
  if (s.includes('AS bail FROM gestion_location_activite a')) return { rows: primeExistante === null ? [] : [primeExistante] };
  if (s.includes('FROM gestion_annuaire_lot WHERE id = $1')) return { rows: [{ statut_bien: 'en_gestion', categorie: 'logement', proprietaire_id: null }] };
  if (s.includes("apres = 'en_gestion' AND effet_le <= $2")) return { rows: entree === null ? [] : [{ effet_le: entree }] };
  if (s.includes('AS deja')) return { rows: [{ deja: dejaLoue }] };
  if (s.includes('FROM gestion_bail b JOIN gestion_annuaire_lot l')) return { rows: [{ lot_id: '7', proprietaire_id: null, proprio: 'P', categorie: 'logement' }] };
  if (s.includes('INSERT INTO gestion_location_activite')) return { rows: [{ id: '40' }] };
  return { rows: [] };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'origine_contact_precision' ? colonnes411 : true) }));
const repo = await import('./suiviRepo');
beforeEach(() => { appels.length = 0; primeExistante = null; colonnes411 = true; entree = '2026-09-01'; dejaLoue = false; });
const AUTEUR = { id: 5, libelle: 'Jean-Baptiste PONS' };

describe('🔴 la situation du bien, et ce qu’elle pré-remplit (pur)', () => {
  it('nouveau mandat / relocation / prime déjà versée / hors gestion', () => {
    expect(casGestionDuBien({ enGestion: true, dejaLoueEnGestion: false, primeDejaVersee: false })).toBe('nouveau_mandat');
    expect(casGestionDuBien({ enGestion: true, dejaLoueEnGestion: true, primeDejaVersee: false })).toBe('relocation');
    expect(casGestionDuBien({ enGestion: true, dejaLoueEnGestion: false, primeDejaVersee: true })).toBe('deja_prime');
    expect(casGestionDuBien({ enGestion: false, dejaLoueEnGestion: true, primeDejaVersee: true })).toBe('hors_gestion');
    expect(preremplissageGestion('nouveau_mandat')).toEqual({ mandatGestion: true, avecGestion: false, primeMode: 'regle', origineRelocation: false });
    expect(preremplissageGestion('relocation')).toEqual({ mandatGestion: false, avecGestion: true, primeMode: 'aucune', origineRelocation: true });
    expect(preremplissageGestion('deja_prime')).toEqual({ mandatGestion: false, avecGestion: true, primeMode: 'aucune', origineRelocation: false });
    expect(preremplissageGestion('hors_gestion')).toEqual({ mandatGestion: false, avecGestion: false, primeMode: 'aucune', origineRelocation: false });
    expect(motPrimeDejaVersee({ date: '2025-03-12', bail: 'DUPONT' })).toBe('Prime déjà versée le 12/03/2025 (bail DUPONT)');
  });
  it('« porte une prime » en SQL dit la même chose que primeDe (Aucune, Personnalisé, montant saisi, mandat, 150 €)', () => {
    const sql = sqlPorteUnePrime('a', true).replace(/\s+/g, ' ');
    expect(sql).toContain("a.prime_mode IS DISTINCT FROM 'aucune'");
    expect(sql).toContain("WHEN a.prime_mode = 'personnalise' THEN coalesce(a.prime_gestion_saisie, 0) > 0");
    expect(sql).toContain('ELSE (a.mandat_gestion OR a.prime_mode = \'regle\') END');
    const base = { primeSaisie: null, mandatGestion: true, categoriePrime: 'logement', parking: false, dateSignature: '2026-10-24', primeMode: null } as unknown as ActiviteCalcul;
    const regles = [{ depuis: '2026-01-01', tauxNegociateur: 0.1, primeLogement: 150, primeParking: 50 }];
    expect(primeDe(base, regles)).toBe(150);
    expect(primeDe({ ...base, primeMode: 'aucune' }, regles)).toBe(0);
    expect(primeDe({ ...base, mandatGestion: false }, regles)).toBe(0);
  });
  it('les deux cases sont exclusives (le serveur refuse les deux à la fois)', () => {
    const v = verifierActivite({ dateSignature: '2026-10-24', mandatGestion: true, avecGestion: true, origineContact: 'internet' });
    expect(v.ok).toBe(false);
    expect(verifierActivite({ dateSignature: '2026-10-24', mandatGestion: true, avecGestion: false, origineContact: 'internet' }).ok).toBe(true);
  });
});

describe('🔴 UNE seule prime de nouvelle gestion par bien — le serveur refuse la seconde', () => {
  const activite = { dateSignature: '2026-10-24', origineContact: 'internet', mandatGestion: true, primeMode: 'regle', honoProprietaireHt: '', honoLocataireHt: '', apporteurTaux: '' };
  it('aucune prime sur ce bien : le bail s’enregistre avec sa prime', async () => {
    expect(await repo.enregistrerActiviteBail(99, activite, AUTEUR)).toEqual({ etat: 'ok', data: { id: 40 } });
  });
  it('une prime déjà comptée (bail importé ou saisi, même après sortie puis retour en gestion) : refus, RIEN n’est écrit', async () => {
    primeExistante = { date_signature: '2025-03-12', bail: 'DUPONT' };
    const r = await repo.enregistrerActiviteBail(99, activite, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Prime déjà versée le 12/03/2025 (bail DUPONT) : un bien ne génère qu’une seule prime de nouvelle gestion dans toute sa vie de gestion.' });
    expect(appels.some((a) => a.sql.includes('INSERT INTO gestion_location_activite'))).toBe(false);
    // la recherche porte sur TOUT le bien, hors ce bail : toutes les périodes de gestion comptent
    const recherche = appels.find((a) => a.sql.includes('AS bail FROM gestion_location_activite a'))!;
    expect(recherche.params).toEqual([7, 99, null]);
    expect(recherche.sql).not.toContain('effet_le');
  });
  it('sans prime (relocation, « Aucune ») : rien à vérifier, le bail s’enregistre', async () => {
    primeExistante = { date_signature: '2025-03-12', bail: 'DUPONT' };
    expect((await repo.enregistrerActiviteBail(99, { ...activite, mandatGestion: false, avecGestion: true, primeMode: 'aucune' }, AUTEUR)).etat).toBe('ok');
  });
  it('la feuille du mois aussi : une seconde prime posée par correction est refusée', async () => {
    primeExistante = { date_signature: '2025-03-12', bail: 'DUPONT' };
    const r = await repo.modifierActivite(12, { origineContact: 'internet', primeMode: 'regle' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
  });
});

describe('🔴 la proposition : déjà loué par nous depuis l’entrée en gestion ?', () => {
  it('jamais reloué depuis l’entrée en gestion, aucune prime : nouveau mandat', async () => {
    const r = await repo.proposerActivite(7, [], '2026-10-24');
    expect(r).toMatchObject({ etat: 'ok', data: { cas: 'nouveau_mandat', entreeGestion: '2026-09-01', dejaLoueEnGestion: false, primeDejaVersee: null } });
    const deja = appels.find((a) => a.sql.includes('AS deja'))!;
    expect(deja.sql).toContain('b.entree <= $2::date AND ($3::date IS NULL OR b.entree >= $3::date)');   // un locataire en place avant le mandat ne compte pas
    expect(deja.sql).toContain("a.type = 'bail' AND a.date_signature <= $2::date AND ($3::date IS NULL OR a.date_signature >= $3::date)");
    expect(deja.params).toEqual([7, '2026-10-24', '2026-09-01']);
  });
  it('déjà loué dans le portefeuille de gestion : relocation', async () => {
    dejaLoue = true;
    expect((await repo.proposerActivite(7, [], '2026-10-24'))).toMatchObject({ data: { cas: 'relocation' } });
  });
  it('prime déjà versée dans une vie de gestion antérieure : pas de seconde prime', async () => {
    primeExistante = { date_signature: '2021-05-02', bail: 'MARTIN' };
    expect((await repo.proposerActivite(7, [], '2026-10-24'))).toMatchObject({ data: { cas: 'deja_prime', primeDejaVersee: { date: '2021-05-02', bail: 'MARTIN' } } });
  });
});

describe('🔴 l’origine « Personnalisé »', () => {
  it('un texte obligatoire, 80 caractères au plus, gardé tel quel (espaces resserrés)', () => {
    expect(verifierCommercial({ origineContact: 'personnalise' }).ok).toBe(false);
    expect(verifierCommercial({ origineContact: 'personnalise', origineContactPrecision: 'x'.repeat(81) }).ok).toBe(false);
    const v = verifierCommercial({ origineContact: 'personnalise', origineContactPrecision: '  Salon   de l’immobilier ' });
    expect(v.ok && v.valeurs.origineContactPrecision).toBe('Salon de l’immobilier');
    const autre = verifierCommercial({ origineContact: 'internet', origineContactPrecision: 'ignoré' });
    expect(autre.ok && autre.valeurs.origineContactPrecision).toBeNull();
  });
  it('affiché tel quel ; regroupé sous « Personnalisé » ; proposé seulement avec la 411', () => {
    expect(libelleOrigineContact('personnalise', 'Salon de l’immobilier')).toBe('Personnalisé : Salon de l’immobilier');
    expect(libelleOrigineContact('internet', null)).toBe('Internet');
    expect(cleTotauxOrigine('personnalise')).toBe('personnalise');
    expect(originesProposees(false)).not.toContain('personnalise');
    expect(originesProposees(true).at(-1)).toBe('personnalise');
  });
  it('écrit avec la 411 ; refusé sans elle (la base refuserait la valeur)', async () => {
    expect(await repo.modifierActivite(12, { origineContact: 'personnalise', origineContactPrecision: 'Salon', primeMode: 'aucune' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(appels.find((a) => a.sql.includes('SET origine_contact_precision'))!.params).toEqual([12, 'Salon']);
    colonnes411 = false;
    expect(await repo.modifierActivite(12, { origineContact: 'personnalise', origineContactPrecision: 'Salon', primeMode: 'aucune' }, AUTEUR))
      .toMatchObject({ etat: 'refus', motif: 'L’origine « Personnalisé » demande la mise à jour de la base (migration 411).' });
  });
  it('la feuille du mois et l’export l’affichent ; la migration 411 est un ajout rejouable', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8')).toContain('libelleOrigineContact(a.origineContact, a.origineContactPrecision)');
    expect(readFileSync('app/lib/location/suivi/exportXlsx.ts', 'utf8')).toContain('row.getCell(13).value = libelleOrigineContact(a.origineContact, a.origineContactPrecision);');
    const m = readFileSync('db/migrations/411_location_origine_personnalisee.sql', 'utf8');
    expect(m).toContain('ADD COLUMN IF NOT EXISTS origine_contact_precision text');
    expect(m).toContain("'campagne', 'personnalise'");
    expect(m).not.toMatch(/\b(DELETE|TRUNCATE|DROP\s+(TABLE|COLUMN))\b/i);
  });
});
