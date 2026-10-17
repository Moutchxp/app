import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CARACTERISTIQUES_VIDES, CLE_SESSION_REPRISE, ajouterHistoriqueSession, choisirReprise, clesAdresse, lireHistoriqueSession,
  memeAdresse, normaliserAdresse, phraseReprise, validerCaracteristiques, type EntreeReprise,
} from './repriseCaracteristiques';

/**
 * 🔴 LOT REPRISE-CARACTERISTIQUES (Arno, 17/10/2026) — même adresse → repris ; autre adresse → vides ; A → B → A →
 * critères de A ; internaute différent → vides ; champ invalide → ce champ vide.
 */
const A = clesAdresse('92004_1234_00012', '12 Rue de la République, Asnières-sur-Seine');
const B = clesAdresse('92004_5678_00003', '3 Avenue de l’Union, Asnières-sur-Seine');
const champsA1 = { typeBien: 'Appartement', surface: '62', nbPieces: 3, epoque: 'De 1970 à 1980', terrasse: false, balcon: true, jardin: false };
const champsA2 = { typeBien: 'Duplex', surface: '95', nbPieces: 4, epoque: 'De 1992 à 2000', terrasse: true, balcon: false, jardin: false };
const champsB = { typeBien: 'Maison', surface: '140', nbPieces: 6, epoque: 'Avant 1850', terrasse: true, balcon: false, jardin: true };
const entree = (cles: typeof A, c: unknown, le: string): EntreeReprise => ({ cles, caracteristiques: c, le });

describe('choisirReprise', () => {
  it('même adresse → les critères de la dernière demande à cette adresse, avec sa date', () => {
    expect(choisirReprise([entree(A, champsA1, '2026-10-15T09:00:00Z')], A)).toEqual({ caracteristiques: champsA1, le: '2026-10-15T09:00:00Z' });
  });
  it('autre adresse → rien à reprendre (champs vides)', () => {
    expect(choisirReprise([entree(A, champsA1, '2026-10-15T09:00:00Z')], B)).toBeNull();
  });
  it('A → B → A : les critères les PLUS RÉCENTS saisis pour A', () => {
    const h = [entree(A, champsA1, '2026-10-15T09:00:00Z'), entree(B, champsB, '2026-10-16T09:00:00Z'), entree(A, champsA2, '2026-10-17T07:00:00Z')];
    expect(choisirReprise(h, A)?.caracteristiques).toEqual(champsA2);
    expect(choisirReprise(h, B)?.caracteristiques).toEqual(champsB);
    // l'ordre de l'historique ne compte pas : seule la date
    expect(choisirReprise([...h].reverse(), A)?.caracteristiques).toEqual(champsA2);
  });
  it('champ invalide → CE champ vide, les autres repris', () => {
    const abime = { ...champsA1, typeBien: 'Péniche', epoque: 'De 1900 à 1910', surface: '-3', nbPieces: 2.5, balcon: 'oui' };
    expect(choisirReprise([entree(A, abime, '2026-10-15T09:00:00Z')], A)?.caracteristiques).toEqual({
      typeBien: '', surface: '', nbPieces: 0, epoque: '', terrasse: false, balcon: null, jardin: false,
    });
  });
  it('tout invalide → rien à reprendre (et donc pas de ligne)', () => {
    expect(choisirReprise([entree(A, { typeBien: 42, surface: 'abc' }, '2026-10-15T09:00:00Z')], A)).toBeNull();
  });
});

describe('même adresse : identifiant BAN, à défaut adresse normalisée, jamais les coordonnées', () => {
  it('normalisation : accents, casse, ponctuation, apostrophes', () => {
    expect(normaliserAdresse('12, Rue de l’Église — ASNIÈRES')).toBe(normaliserAdresse('12 rue de l eglise asnieres'));
  });
  it('les deux portent un identifiant BAN : c’est lui qui décide', () => {
    expect(memeAdresse(clesAdresse('X1', '12 rue A'), clesAdresse('x1', '12, Rue A'))).toBe(true);
    expect(memeAdresse(clesAdresse('X1', '12 rue A'), clesAdresse('X2', '12 rue A'))).toBe(false);
  });
  it('un seul identifiant BAN connu (demande d’avant ce lot) : l’adresse normalisée décide', () => {
    expect(memeAdresse(clesAdresse(null, '12, Rue A'), clesAdresse('X1', '12 rue a'))).toBe(true);
  });
  it('aucune adresse : jamais « même adresse »', () => {
    expect(memeAdresse(clesAdresse(null, ''), clesAdresse(null, null))).toBe(false);
  });
});

describe('session de l’appareil (non connecté)', () => {
  const memoire = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('la demande validée est retrouvée à la même adresse, pas à une autre', () => {
    const s = memoire();
    ajouterHistoriqueSession(s, entree(A, champsA1, '2026-10-17T07:00:00Z'));
    expect(choisirReprise(lireHistoriqueSession(s), A)?.caracteristiques).toEqual(champsA1);
    expect(choisirReprise(lireHistoriqueSession(s), B)).toBeNull();
  });
  it('🔴 internaute différent (autre appareil, autre session) → historique vide, champs vides', () => {
    const autre = memoire();
    expect(choisirReprise(lireHistoriqueSession(autre), A)).toBeNull();
  });
  it('stockage interdit ou abîmé : lecture et écriture protégées, repli sur des champs vides', () => {
    const interdit = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => ajouterHistoriqueSession(interdit, entree(A, champsA1, '2026-10-17T07:00:00Z'))).not.toThrow();
    expect(lireHistoriqueSession(interdit)).toEqual([]);
    expect(lireHistoriqueSession({ getItem: () => '{pas du json', setItem: () => {} })).toEqual([]);
    expect(lireHistoriqueSession(null)).toEqual([]);
    expect(CLE_SESSION_REPRISE).toBe('svav.repriseCaracteristiques.v1');
  });
});

describe('affichage', () => {
  it('« Caractéristiques reprises de votre analyse du JJ/MM — vérifiez-les » (jour de Paris)', () => {
    expect(phraseReprise('2026-10-16T22:30:00Z')).toBe('Caractéristiques reprises de votre analyse du 17/10 — vérifiez-les');
  });
  it('un champ vide reste aux valeurs exactes de l’écran neuf', () => {
    expect(validerCaracteristiques(null)).toEqual(CARACTERISTIQUES_VIDES);
  });
});

describe('câblage de la page', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('clé : identifiant BAN de l’adresse choisie, sinon son libellé ; route du compte, sinon session de l’appareil', () => {
    expect(page).toContain('const cleBanChoisie = adressesAlt.find((a) => a.libelle === adresseChoisie)?.cle ?? null;');
    expect(page).toContain('fetch(`/api/internaute/caracteristiques?${q}`');
    expect(page).toContain('r = choisirReprise(lireHistoriqueSession(sessionAppareil()), cles);');
    expect(page).toContain('cleAdresseBan: cleBanChoisie,');
  });
  it('une saisie n’est jamais écrasée ; la session n’est écrite que pour un non connecté ; ligne seulement si repris', () => {
    expect(page).toContain('if (!memesCaracteristiques(caracteristiquesRef.current, caracteristiquesPosees.current)) { setReprise(null); return; }');
    expect(page).toContain('if (compte === null) { ajouterHistoriqueSession(sessionAppareil(),');
    expect(page).toContain('{reprise !== null && !sontVides(caracteristiques) && ( <p data-reprise-caracteristiques');
  });
});
