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

/** 🔴🔴 (demande du 28/11/2026, migration 522) « « 7 r. » et « 7 rue » doivent être reconnus comme la même adresse pour la règle « une adresse = une seule copropriété ». » */
describe('🔴 522 — les abréviations du type de voie, écrites en entier dans la clé de comparaison', () => {
  it('r./rue, av./ave/avenue, bd/boul./boulevard, pl./place, all./allée, imp./impasse, ch./chemin, sq./square, quai — collées ou non au point, majuscules ou non', () => {
    const memes: [string, string][] = [
      ['7 r. _TEST Deux Adresses', '7 rue _TEST Deux Adresses'], ['7 R _TEST deux-adresses', '7 Rue _TEST Deux Adresses'],
      ['12 av. Foch', '12 avenue Foch'], ['12 Ave Foch', '12 Avenue Foch'], ['3 bd Haussmann', '3 boulevard Haussmann'], ['3 boul. Haussmann', '3 Boulevard Haussmann'],
      ['3 Bld Haussmann', '3 boulevard Haussmann'], ['5 pl. de la Mairie', '5 place de la Mairie'], ['8 all. des Roses', '8 allée des Roses'],
      ['2 imp. du Puits', '2 impasse du Puits'], ['9 ch. Vert', '9 chemin Vert'], ['1 sq. Monge', '1 square Monge'], ['4 qu. de Seine', '4 quai de Seine'],
    ];
    for (const [a, b] of memes) expect(cleComparable(a), `${a} = ${b}`).toBe(cleComparable(b));
  });
  it('bis / ter / quater collés ou non, avec une abréviation derrière ; sans numéro, en tête', () => {
    expect(new Set(['40bis r. Baudin', '40 bis rue Baudin', '40 B Rue Baudin', '40 Bis, R  Baudin'].map(cleComparable))).toEqual(new Set(['40 bis rue baudin']));
    expect(cleComparable('12ter av Foch')).toBe('12 ter avenue foch');
    expect(cleComparable('r de la Paix')).toBe(cleComparable('rue de la Paix'));
  });
  it('seulement JUSTE APRÈS le numéro (ou en tête) : un mot au milieu n’est jamais touché ; un autre numéro reste une autre adresse', () => {
    expect(cleComparable('10 rue de la Place')).toBe('10 rue de la place');
    expect(cleComparable('Résidence Les Tilleuls')).toBe('residence les tilleuls');
    expect(cleComparable('40 boulevard Baudin')).toBe('40 boulevard baudin');
    expect(cleComparable('7 rues Neuves')).toBe('7 rues neuves');
    expect(cleComparable('7 r. Baudin')).not.toBe(cleComparable('8 rue Baudin'));
  });
  it('la MÊME liste, dans le même ordre, côté serveur, dans la migration 522 et dans le contrôle en lecture seule', async () => {
    const { readFileSync } = await import('node:fs');
    const { ABREVIATIONS_VOIE } = await import('./adresseCoproExclusivite');
    const serveur = Object.entries(ABREVIATIONS_VOIE);
    const migration = readFileSync('db/migrations/522_gestion_cle_adresse_abreviations.sql', 'utf8');
    expect([...migration.matchAll(/WHEN '([a-z]+)' THEN '([a-z]+)'/g)].map((m) => [m[1], m[2]])).toEqual(serveur);
    expect(migration).toContain(`(${Object.keys(ABREVIATIONS_VOIE).join('|')})\\M`);
    const code = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/current_database\(\)|svav_recette/); // aucune garde « recette seulement »
    // le contrôle en LECTURE SEULE de la production (à lancer par Arno) : la même liste, en VALUES
    const controle = readFileSync('db/controles/522_doublons_lecture_seule.sql', 'utf8');
    expect([...controle.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)].map((m) => [m[1], m[2]])).toEqual(serveur);
    expect(controle).toContain(`(${Object.keys(ABREVIATIONS_VOIE).join('|')})\\M`);
    expect(controle.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('--'))[0]).toBe('BEGIN READ ONLY;');
  });
});
