import { describe, expect, it } from 'vitest';
import { cleComparable, codesPostauxCompatibles, motifExclusiviteAdresse, MOTIF_EXCLUSIVITE_GENERIQUE, libelleOuiDeplacer, motifPrincipaleAilleurs, texteConflit, type ConflitAdresse } from './adresseCoproExclusivite';

/** 🔴🔴 Arno (26/11/2026, 12h50, point 2) — la comparaison des adresses (normalisation) et les textes de la fenêtre du conflit. */
describe('la clé de comparaison d’une adresse', () => {
  it('majuscules, accents, ponctuation ignorés ; l’indice bis / ter / quater écrit en entier et détaché', () => {
    expect(cleComparable('40 Rue Baudin COURBEVOIE')).toBe(cleComparable('40 rue Baudin Courbevoie'));
    expect(new Set(['40bis rue Baudin', '40 bis rue Baudin', '40 B rue Baudin', '40 Bis, Rue  Baudin'].map(cleComparable))).toEqual(new Set(['40 bis rue baudin']));
    expect(cleComparable('12ter rue X')).toBe('12 ter rue x');
    expect(cleComparable('40 rue Baudin')).not.toBe(cleComparable('40 bis rue Baudin'));
    expect(cleComparable('40 boulevard Baudin')).toBe('40 boulevard baudin'); // « b » d'un mot n'est pas un indice
  });
  it('codes postaux compatibles : égaux, ou l’un inconnu', () => {
    expect([codesPostauxCompatibles('92400', '92400'), codesPostauxCompatibles('92400', null), codesPostauxCompatibles('92400', '92800')]).toEqual([true, true, false]);
  });
});

describe('les textes de la fenêtre', () => {
  const C: ConflitAdresse = { cle: 'x', ecrite: '40 rue Baudin, 92400 Courbevoie', copropriete: { id: 3, cle: 'y', libelle: '38 rue Baudin', nom: null, syndic: 'Cabinet A / Paris' }, principale: false, biens: [], digicodes: [] };
  it('le nom (sinon l’adresse principale) et le syndic ; les boutons ; la principale', () => {
    expect(texteConflit(C)).toBe('Cette adresse appartient déjà à la copropriété 38 rue Baudin (syndic Cabinet A / Paris).');
    expect(libelleOuiDeplacer({ ...C, copropriete: { ...C.copropriete, nom: '_TEST Copro Baudin' } })).toBe('Oui, la rattacher ici et la retirer de _TEST Copro Baudin');
    expect(motifPrincipaleAilleurs(C)).toBe('C’est l’adresse principale de 38 rue Baudin : changez d’abord son adresse principale.');
    expect(texteConflit({ ...C, copropriete: { ...C.copropriete, syndic: null } })).toBe('Cette adresse appartient déjà à la copropriété 38 rue Baudin (sans syndic).');
  });
});

/** 🔴🔴 Décision d'Arno (26/11/2026, migration 520) — « Le code traduit le refus de la base en message clair (« Cette adresse appartient déjà à … »), jamais en erreur technique ». */
describe('le refus de la base, en mots', () => {
  const erreur = (o: Record<string, unknown>) => Object.assign(new Error(String(o.message ?? '')), o);
  it('le déclencheur : son message clair, relayé tel quel', () => {
    expect(motifExclusiviteAdresse(erreur({ code: '23505', constraint: 'gestion_copropriete_adresse_exclusive', message: 'Cette adresse appartient déjà à la copropriété X : « 5 Rue Gérhard ». Rien n’est enregistré.' })))
      .toBe('Cette adresse appartient déjà à la copropriété X : « 5 Rue Gérhard ». Rien n’est enregistré.');
  });
  it('l’index unique (message technique) : une phrase claire ; une autre contrainte, une autre erreur, rien : null', () => {
    expect(motifExclusiviteAdresse(erreur({ code: '23505', constraint: 'gestion_copropriete_adresse_exclusive_ouverte', message: 'duplicate key value violates unique constraint' }))).toBe(MOTIF_EXCLUSIVITE_GENERIQUE);
    expect(motifExclusiviteAdresse(erreur({ code: '23505', constraint: 'gestion_copropriete_adresse_exclusive', message: 'texte inattendu' }))).toBe(MOTIF_EXCLUSIVITE_GENERIQUE);
    expect(motifExclusiviteAdresse(erreur({ code: '23505', constraint: 'gestion_copropriete_cle_immeuble_key' }))).toBeNull();
    expect(motifExclusiviteAdresse(erreur({ code: '57P01' }))).toBeNull();
    expect([motifExclusiviteAdresse(null), motifExclusiviteAdresse('x'), motifExclusiviteAdresse(undefined)]).toEqual([null, null, null]);
  });
});
