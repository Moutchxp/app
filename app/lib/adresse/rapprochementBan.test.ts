import { describe, expect, it } from 'vitest';
import { analyserAdresse, deciderRapprochement, libelleOfficiel, ressemblance, SEUIL_CERTAIN, type CandidatBan } from './rapprochementBan';

/** 🔴🔴 Arno (20/11/2026, lot 2) — la règle du rapprochement BAN : les cas exigés, et ce qui la justifie. */
const ban = (id: string, numero: number, nomVoie: string, suffixe: string | null = null): CandidatBan =>
  ({ id, numero, suffixe, nomVoie, insee: '92026', commune: 'Courbevoie', x: 645000, y: 6866000 });
// les adresses officielles de Courbevoie au 54 et au 56 (extrait réel de la BAN locale, plus des voisines au même numéro)
const AU_54 = [ban('92026_7184_00054', 54, 'Avenue Puvis De Chavannes'), ban('92026_0360_00054', 54, 'Rue de Bezons'), ban('92026_3450_00054', 54, 'Rue Jean Jaurès')];
const AU_56 = [ban('92026_7184_00056', 56, 'Avenue Puvis De Chavannes'), ban('92026_0360_00056', 56, 'Rue de Bezons')];
const decider = (texte: string, candidats: CandidatBan[] | null, commune = 'Courbevoie') => deciderRapprochement(analyserAdresse(texte, commune), candidats);

describe('les six écritures réelles du 54 avenue Puvis de Chavannes', () => {
  const SIX = ['54 avenue du Puvis de Chavannes / AUGIER', '54 avenue Puvis de Chavannes', '54 avenue Puvis de Chavannes (HARY)',
    '54 avenue puvis de Chavannes, 92400, Courbevoie', '54 Avneue Puvis de Chavannes', '54 Puvis de Chavannes'];
  it('→ UN SEUL identifiant officiel, certain, avec le libellé officiel', () => {
    const r = SIX.map((t) => decider(t, AU_54));
    expect(r.map((x) => x.statut)).toEqual(['certain', 'certain', 'certain', 'certain', 'certain', 'certain']);
    expect(new Set(r.map((x) => x.ban?.id))).toEqual(new Set(['92026_7184_00054']));
    expect(r[0].ban!.libelle).toBe('54 Avenue Puvis De Chavannes');
  });
  it('le 56 est une AUTRE adresse officielle : jamais le 54', () => {
    const r = decider('56 avenue Puvis de Chavannes', AU_56);
    expect([r.statut, r.ban?.id]).toEqual(['certain', '92026_7184_00056']);
    // et l'écriture du 54 ne trouve rien parmi les adresses du 56 (le numéro est obligatoire)
    expect(decider('54 avenue Puvis de Chavannes', AU_56).statut).toBe('introuvable');
  });
});

describe('les règles', () => {
  it('« 142 avenue Gambetta » / « 142 Rue Gambetta » : type de voie contradictoire → JAMAIS certain (à vérifier, proposé)', () => {
    const r = deciderRapprochement(analyserAdresse('142 avenue Gambetta', 'Suresnes'), [{ ...ban('92073_3880_00142', 142, 'Rue Gambetta'), insee: '92073', commune: 'Suresnes' }]);
    expect(r.statut).toBe('a_verifier');
    expect(r.motif).toMatch(/Type de voie contradictoire/);
    expect(r.ban?.id).toBe('92073_3880_00142');
    // le même nom, le même type : certain
    expect(decider('5 rue de Bezons', [ban('92026_0360_00005', 5, 'Rue de Bezons')]).statut).toBe('certain');
  });
  it('une plage de numéros → TOUJOURS à vérifier, même quand la voie est identique', () => {
    for (const t of ['28-32 avenue Marceau', '3 - 5 avenue Marceau', '12bis-14 avenue Marceau']) {
      const a = analyserAdresse(t);
      expect(a.plage).toBe(true);
      const r = deciderRapprochement(a, [ban('92026_6120_00028', 28, 'Avenue Marceau'), ban('92026_6120_00003', 3, 'Avenue Marceau'), ban('92026_6120_00012_bis', 12, 'Avenue Marceau', 'bis')]);
      expect(r.statut).toBe('a_verifier');
      expect(r.motif).toMatch(/Plage de numéros/);
    }
  });
  it('bis et ter distincts : l’indice est obligatoire, des deux côtés (« t » de la BAN = ter, « 12ter » collé)', () => {
    const au12 = [ban('92062_7140_00012', 12, 'Rue des Pavillons'), ban('92062_7140_00012_bis', 12, 'Rue des Pavillons', 'bis'), ban('92062_7140_00012_ter', 12, 'Rue des Pavillons', 't')];
    expect(decider('12 ter rue des Pavillons', au12).ban?.id).toBe('92062_7140_00012_ter');
    expect(decider('12ter rue des Pavillons', au12).ban?.id).toBe('92062_7140_00012_ter');
    expect(decider('12 bis rue des Pavillons', au12).ban?.id).toBe('92062_7140_00012_bis');
    expect(decider('12 rue des Pavillons', au12).ban?.id).toBe('92062_7140_00012');
    expect(decider('12 ter rue des Pavillons', [au12[0], au12[1]]).statut).toBe('introuvable');
  });
  it('le seuil 0,90 : un nom trop différent est à vérifier ; les pièges mesurés en recette ne sont pas certains', () => {
    expect(SEUIL_CERTAIN).toBe(0.9);
    expect(decider('1 rue des Lilas', [ban('92026_5500_00001', 1, 'Rue Des Lilas D\'Espagne')]).statut).toBe('a_verifier');
    expect(decider('7 Rue François Lépine', [ban('75118_3700_00007', 7, 'Rue Jean-François Lépine')]).statut).toBe('a_verifier');
    expect(decider('18 Rue Pierre Curie', [ban('92062_7500_00018', 18, 'rue pierre et marie curie')]).statut).toBe('a_verifier');
    // ce qui ne distingue pas deux voies ne compte pas : petits mots, accents, abréviations, fautes de type
    expect(decider('156 boulevard Magenta', [ban('75110_5800_00156', 156, 'Boulevard de Magenta')]).statut).toBe('certain');
    expect(decider('17 rue des Fusillés de la Résistance', [ban('92062_3600_00017', 17, 'Rue Fusilles de la Resistance')]).statut).toBe('certain');
    expect(decider('6 bd St Denis', [ban('75110_8600_00006', 6, 'Boulevard Saint-Denis')]).statut).toBe('certain');
  });
  it('deux adresses officielles qui se ressemblent au-dessus du seuil : à vérifier (on ne choisit pas au hasard)', () => {
    expect(decider('3 rue Victor Hugo', [ban('a', 3, 'Rue Victor Hugo'), ban('b', 3, 'Rue Victor-Hugo')]).statut).toBe('a_verifier');
    // le type écrit départage deux voies homonymes (cas réel de Suresnes : « Rue du Ratrait » et « Place du Ratrait » au 3) ; sans type, à vérifier
    const ratrait = [ban('92073_8121_00003', 3, 'Place du Ratrait'), ban('92073_8120_00003', 3, 'Rue du Ratrait')];
    expect([decider('3 rue du Ratrait', ratrait).statut, decider('3 rue du Ratrait', ratrait).ban?.id]).toEqual(['certain', '92073_8120_00003']);
    expect(decider('3 place du Ratrait', ratrait).ban?.id).toBe('92073_8121_00003');
    expect(decider('3 du Ratrait', ratrait).statut).toBe('a_verifier');
  });
  it('🔴 (lot 3 bis) sous 0,50 de ressemblance : AUCUNE proposition — à vérifier, « aucune proposition fiable » (cas témoins du rapport du 20/11)', () => {
    const vide = (texte: string, candidats: CandidatBan[], commune = 'Courbevoie') => {
      const r = decider(texte, candidats, commune);
      expect([r.statut, r.ban, r.propositions, r.motif]).toEqual(['a_verifier', null, [], 'Aucune proposition fiable (ressemblance de la voie sous 0.50).']);
    };
    vide('12ter Rue De L\'Abreuvoir', [ban('92026_4400_00012_ter', 12, 'Square De L\'Hôtel De Ville', 'ter')]);
    vide('6 allée Hector Berlioz', [{ ...ban('95252_1220_00006', 6, 'Rue Victor Basch'), insee: '95252', commune: 'Franconville' }], 'Franconville');
    // le 99 rue Jean-Pierre Timbaud (Paris 11e) : la BAN locale du 11e est incomplète (410 adresses), la rue n'y est pas — rien d'absurde n'est proposé
    vide('99 rue Jean Pierre Timbaud', [{ ...ban('75111_3420_00099', 99, 'Rue du Faubourg Saint-Antoine'), insee: '75111', commune: 'Paris 11e Arrondissement' }], 'Paris');
    // une proposition à 0,50 ou plus reste proposée, à vérifier (« Pierre Curie » → « pierre et marie curie », 0,76)
    const curie = decider('18 Rue Pierre Curie', [ban('92062_7500_00018', 18, 'rue pierre et marie curie')]);
    expect([curie.statut, curie.propositions.length]).toEqual(['a_verifier', 1]);
  });
  it('🔴 (lot 3 bis) le motif d’une plage cite ses numéros', () => {
    expect(analyserAdresse('33-35 rue Pergolèse 75116 Paris').plageTexte).toBe('33-35');
    expect(analyserAdresse('126 - 128 rue de Villiers').plageTexte).toBe('126-128');
    expect(decider('28-32 avenue Marceau', [ban('92026_6120_00028', 28, 'Avenue Marceau')]).motif).toBe('Plage de numéros (28-32) : un immeuble à plusieurs adresses officielles, à vérifier par un humain.');
  });
  it('introuvables : sans numéro, commune absente de la BAN locale, aucune adresse à ce numéro', () => {
    expect(decider('rue camille deschanel', AU_54)).toMatchObject({ statut: 'introuvable', motif: expect.stringMatching(/sans numéro/) });
    expect(decider('12 Rue Louis Beaunier', null, 'Melun')).toMatchObject({ statut: 'introuvable', motif: expect.stringMatching(/Commune absente/) });
    expect(decider('99 avenue Puvis de Chavannes', AU_54)).toMatchObject({ statut: 'introuvable', motif: expect.stringMatching(/Aucune adresse officielle au 99/) });
  });
});

describe('les mesures', () => {
  it('la ressemblance est celle de pg_trgm (trigrammes « ␣␣mot␣ ») : identique = 1, sans rien de commun = 0', () => {
    expect(ressemblance('puvis chavannes', 'puvis chavannes')).toBe(1);
    expect(ressemblance('foch', 'gambetta')).toBe(0);
    // la valeur mesurée par PostgreSQL pour ce couple (similarity('word', 'two words') = 0,363636…)
    expect(ressemblance('word', 'two words')).toBeCloseTo(4 / 11, 10);
  });
  it('le libellé officiel : numéro, indice en entier, nom de la voie', () => {
    expect(libelleOfficiel({ numero: 362, suffixe: 't', nomVoie: 'Rue de Vaugirard' })).toBe('362 ter Rue de Vaugirard');
  });
});
