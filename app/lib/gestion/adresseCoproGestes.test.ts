import { describe, expect, it } from 'vitest';
import { AUCUN_AUTRE_BIEN, biensTouchesParLeRetrait, LIBELLE_OUI_RETIRER_ADRESSE, LIBELLE_RETIRER_ADRESSE, TEXTE_RETRAIT_ADRESSE } from './adresseCoproGestes';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30) « au clic, une fenêtre s'ouvre pour expliquer que l'on va supprimer une adresse de la copropriété et l'ensemble des
 * digicodes ou bâtiments / cages d'escalier associés, dire si cela impacte d'autres biens déjà enregistrés dans cette copropriété que celui que l'on est
 * en train de créer, et demander de valider ou d'annuler. »
 */
describe('le retrait d’une adresse de la copropriété : les biens touchés', () => {
  const B = [
    { id: 1, numero: 'W1', adresse: '12 rue des Lilas', cle: '12 rue des lilas' },
    { id: 2, numero: 'W2', adresse: null, cle: '12 rue des lilas' },
    { id: 3, numero: 'W3', adresse: 'Résidence Les Tilleuls', cle: 'residence les tilleuls' },
  ];
  it('le bien d’où la fiche est ouverte est mis à part ; les AUTRES biens de CETTE adresse sont listés', () => {
    expect(biensTouchesParLeRetrait(B, '12 rue des lilas', 1)).toEqual({ ceBien: 'n° W1 (12 rue des Lilas)', autres: ['n° W2'] });
  });
  it('fiche ouverte hors d’un bien : tous les biens de l’adresse sont « autres » ; une adresse sans bien : aucun', () => {
    expect(biensTouchesParLeRetrait(B, '12 rue des lilas', null)).toEqual({ ceBien: null, autres: ['n° W1 (12 rue des Lilas)', 'n° W2'] });
    expect(biensTouchesParLeRetrait(B, '5 rue vide', 1)).toEqual({ ceBien: null, autres: [] });
  });
  it('le bien d’où l’on vient, à une AUTRE adresse : il n’est pas concerné, il n’apparaît pas', () => {
    expect(biensTouchesParLeRetrait(B, 'residence les tilleuls', 1)).toEqual({ ceBien: null, autres: ['n° W3 (Résidence Les Tilleuls)'] });
  });
  it('les mots de la fenêtre : « Valider le retrait », « aucun autre bien concerné », ce qui part avec l’adresse', () => {
    expect([LIBELLE_RETIRER_ADRESSE, LIBELLE_OUI_RETIRER_ADRESSE, AUCUN_AUTRE_BIEN]).toEqual(['Retirer cette adresse', 'Valider le retrait', 'aucun autre bien concerné']);
    expect(TEXTE_RETRAIT_ADRESSE).toContain('l’ensemble des digicodes et des bâtiments / cages d’escalier');
  });
});

describe('🔴 (Arno, 27/11/2026, 23h30) « Bâtiment / cage » devient « Bâtiment / cage d’escalier » partout à l’écran', () => {
  it('aucun texte affiché ne dit plus « bâtiment / cage » sans « d’escalier » (fiche copropriété, digicodes, création de bien, mails)', async () => {
    const { readFileSync } = await import('node:fs');
    const fichiers = ['app/(admin)/admin/(protected)/gestion/DigicodesCopropriete.tsx', 'app/(admin)/admin/(protected)/gestion/FicheCopropriete.tsx',
      'app/(admin)/admin/(protected)/location/CreationBien.tsx', 'app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'app/lib/gestion/adresseCoproGestes.ts',
      'app/lib/gestion/batimentsCopropriete.ts', 'app/lib/location/mailNouvelleLocation.ts', 'app/lib/location/sortieLocataires.ts', 'app/lib/location/encartBien.ts'];
    for (const f of fichiers) {
      // hors commentaires : les lignes de code seulement
      const code = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
      expect(code.match(/b[âa]timents? (ou (de |à la |une )?|\/ )cages?(?!s)(?! d[’'])/gi) ?? [], f).toEqual([]);
    }
    const { resumeAdresse } = await import('./adresseCoproGestes');
    expect(resumeAdresse({ commun: { digicode: null, code: null }, batiments: [{ libelle: 'A', digicode: true, code: 'a1' }] }, []).digicodes).toEqual(['bâtiment / cage d’escalier A : code A1']);
  });
});
