import { describe, it, expect } from 'vitest';
import {
  casesParDefaut, dateMaxSortie, dateMinSortie, dateValide, descriptionLogement, htmlMailSortie, issueSortie, objetMailSortie, phraseIssue,
  messageDateSortie, phraseMail, phraseRestants, texteMailSortie, verifierCorrection, verifierSortie, type BailLogement, type DonneesMailSortie,
} from './sortieLocataires';

/** SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — les règles, sans base. */
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean',
  entree: '2022-09-01',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' },
  ],
  annexes: [{ lotId: 8, libelle: 'Cave n° 7', occupations: [{ occupationId: 21, locataireId: 101 }] }],
  autresOccupants: [],
};
const JOUR = '2026-10-19';

describe('les cases et la phrase', () => {
  it('toutes les cases sont cochées par défaut', () => {
    expect(casesParDefaut(BAIL)).toEqual([11, 12]);
  });

  it('tous cochés → « Le logement deviendra VACANT »', () => {
    expect(phraseIssue(BAIL, [11, 12])).toBe('Le logement deviendra VACANT');
    expect(issueSortie(BAIL, [11, 12])).toEqual({ vacant: true, restants: [] });
  });

  it('un décoché (rupture de couple) → « Le logement reste loué à : … »', () => {
    expect(phraseIssue(BAIL, [11])).toBe('Le logement reste loué à : BERNARD Paul');
    expect(issueSortie(BAIL, [11]).vacant).toBe(false);
  });

  it('un autre bail en cours sur le même lot : jamais vacant', () => {
    expect(issueSortie({ ...BAIL, autresOccupants: ['MARTIN Léa'] }, [11, 12])).toEqual({ vacant: false, restants: ['MARTIN Léa'] });
  });
});

describe('le contrôle de la sortie', () => {
  it('refus sans date (date obligatoire, vide par défaut)', () => {
    for (const d of ['', null, undefined]) {
      const v = verifierSortie(BAIL, [11], d, JOUR);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motif).toMatch(/obligatoire/);
    }
  });

  it('refus d’une date antérieure à la date d’entrée', () => {
    const recent = { locataires: [{ ...BAIL.locataires[0], entree: '2026-03-01' }] };
    const v = verifierSortie(recent, [11], '2026-02-28', JOUR);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toMatch(/antérieure à la date d’entrée de BERNARD Alice \(01\/03\/2026\)/);
  });

  it('🔴 décision du 18/10/2026 : refus d’une date FUTURE (le futur relève du préavis) ; aujourd’hui est accepté', () => {
    const v = verifierSortie(BAIL, [11], '2026-10-20', JOUR);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toMatch(/futur.*préavis/);
    expect(verifierSortie(BAIL, [11], JOUR, JOUR).ok).toBe(true);
    expect(dateMaxSortie(JOUR)).toBe('2027-10-19');
  });

  it('refus d’une date de plus d’un an en arrière ; un an pile est accepté', () => {
    expect(dateMinSortie(JOUR)).toBe('2025-10-19');
    expect(verifierSortie({ locataires: [{ ...BAIL.locataires[0], entree: null }] }, [11], '2025-10-18', JOUR).ok).toBe(false);
    expect(verifierSortie({ locataires: [{ ...BAIL.locataires[0], entree: null }] }, [11], '2025-10-19', JOUR).ok).toBe(true);
  });

  it('refus sans aucune case cochée, ou d’une case qui n’est pas du bail', () => {
    expect(verifierSortie(BAIL, [], '2026-10-15', JOUR).ok).toBe(false);
    expect(verifierSortie(BAIL, [99], '2026-10-15', JOUR).ok).toBe(false);
  });

  it('refus d’une date impossible', () => {
    expect(dateValide('2026-02-30')).toBe(false);
    expect(verifierSortie(BAIL, [11], '2026-02-30', JOUR).ok).toBe(false);
  });

  it('une sortie partielle ou totale bien datée passe', () => {
    expect(verifierSortie(BAIL, [11], '2026-10-15', JOUR)).toEqual({ ok: true });
    expect(verifierSortie(BAIL, [11, 12], '2026-10-01', JOUR)).toEqual({ ok: true });
  });

  it('la correction garde les mêmes bornes', () => {
    expect(verifierCorrection(['2022-09-01'], '2022-08-01', JOUR).ok).toBe(false);
    expect(verifierCorrection(['2022-09-01'], '', JOUR).ok).toBe(false);
    expect(verifierCorrection(['2022-09-01', null], '2026-10-10', JOUR).ok).toBe(true);
    expect(verifierCorrection(['2022-09-01'], '2026-11-30', JOUR).ok).toBe(false);   // jamais dans le futur
  });
});

describe('le mail de confirmation', () => {
  const D: DonneesMailSortie = {
    adresse: '4 rue Fictive, 92800 Puteaux', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: ['Cave n° 7'],
    proprietaire: 'DUPONT Jean', sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-10-31' }],
    vacant: false, restants: ['BERNARD Paul'], auteur: { nom: 'Arno Test', email: 'a.test@exemple.fr' }, quand: '2026-10-19T08:30:00Z',
  };

  it('objet : « Sortie de locataire — [adresse du logement] »', () => {
    expect(objetMailSortie(D)).toBe('Sortie de locataire — 4 rue Fictive, 92800 Puteaux');
  });

  it('les deux formulations : « VACANT après ce départ » / « reste loué à »', () => {
    expect(phraseMail({ vacant: true, restants: [] })).toBe('Le logement sera VACANT après ce départ');
    expect(phraseMail(D)).toBe('Le logement reste loué à BERNARD Paul');
    expect(texteMailSortie({ ...D, vacant: true, restants: [] })).toContain('Le logement sera VACANT après ce départ');
    expect(htmlMailSortie({ ...D, vacant: true, restants: [] })).toContain('Le logement sera VACANT après ce départ');
    expect(texteMailSortie(D)).toContain('Le logement reste loué à BERNARD Paul');
    expect(htmlMailSortie(D)).toContain('Le logement reste loué à BERNARD Paul');
  });

  it('le corps : logement (type, étage, porte, annexes), adresse, propriétaire, entrée et sortie de chaque sortant, auteur et date en pied', () => {
    const t = texteMailSortie(D);
    expect(t).toContain('Appartement · 3e étage · porte G');
    expect(t).toContain('Annexes : Cave n° 7');
    expect(t).toContain('Adresse : 4 rue Fictive, 92800 Puteaux');
    expect(t).toContain('Propriétaire : DUPONT Jean');
    expect(t).toContain('BERNARD Alice — entrée le 01/09/2022 — sortie le 31/10/2026');
    expect(t).toMatch(/Sortie enregistrée par Arno Test <a\.test@exemple\.fr> — .*2026/);
    const h = htmlMailSortie(D);
    expect(h).toContain('BERNARD Alice');
    expect(h).toContain('Arno Test');
  });

  it('le HTML échappe ce qui vient des données', () => {
    expect(htmlMailSortie({ ...D, proprietaire: '<b>X</b>' })).toContain('&lt;b&gt;X&lt;/b&gt;');
  });

  it('description du logement : rez-de-chaussée, sous-sol, étage libre', () => {
    expect(descriptionLogement({ type: null, etage: '0', porte: null })).toBe('rez-de-chaussée');
    expect(descriptionLogement({ type: 'Studio', etage: '1', porte: null })).toBe('Studio · 1er étage');
    expect(descriptionLogement({ type: null, etage: null, porte: null })).toBe('Logement');
  });
});

describe('la confirmation réduite (écran de sortie)', () => {
  const sortants = [{ entree: '2022-09-01' }, { entree: null }];
  it('les trois messages, et null quand la date va', () => {
    expect(messageDateSortie(sortants, '', JOUR)).toBe('Saisissez la date de sortie');
    expect(messageDateSortie(sortants, '2022-08-31', JOUR)).toBe('La date ne peut pas précéder l’entrée du 01/09/2022');
    expect(messageDateSortie(sortants, '2026-10-20', JOUR)).toBe('La date ne peut pas être dans le futur : enregistrez un préavis');
    expect(messageDateSortie([{ entree: null }], '2025-10-18', JOUR)).toBe('La date ne peut pas remonter à plus d’un an');
    expect(messageDateSortie(sortants, '2026-02-30', JOUR)).toBe('Saisissez une date de sortie valide');
    expect(messageDateSortie(sortants, '2026-10-15', JOUR)).toBeNull();
  });
  it('mêmes bornes que le contrôle du serveur (aucune règle affaiblie)', () => {
    for (const d of ['', '2022-08-31', '2026-10-20', '2026-10-15', JOUR]) {
      expect(messageDateSortie([{ entree: '2022-09-01' }], d, JOUR) === null, d).toBe(verifierSortie(BAIL, [11], d, JOUR).ok);
    }
  });
  it('« Il restera N locataire(s) dans le logement » : accord', () => {
    expect(phraseRestants(1)).toBe('Il restera 1 locataire dans le logement');
    expect(phraseRestants(2)).toBe('Il restera 2 locataires dans le logement');
  });
});
