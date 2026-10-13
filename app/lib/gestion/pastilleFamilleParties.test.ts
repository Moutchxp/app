import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tonDeLaFamille, type TonSuggestion } from './suggestionsBien';
import {
  categoriesDeLaFiche, famillesDesParties, fusionnerCategories, rangementsDesParties, type FicheAvecParties,
} from './familleDestinataire';
import { avecSyndical, syndicauxDepuisJson } from './partiesSyndic';
import { classesPuce, famillesDesSuggestions } from './familleAdresse';
import { rangerSuggestions } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT PASTILLE-TIERS-INDEPENDANT-DANS-LES-SUGGESTIONS — UNE SEULE VÉRITÉ : LA FAMILLE DES PARTIES ═════════════════
 * RÈGLE D'ARNO : « la pastille d'une adresse dans les suggestions À / Cc / Cci porte TOUJOURS la couleur de la famille où
 * cette personne est rangée dans les PARTIES du bien, avec le même calcul et la même source ». PUR, données inventées.
 */
const c = (valeur: string) => ({ id: 1, sorte: 'email', valeur, affichage: valeur, absent: false }) as never;
const FICHE: FicheAvecParties = {
  proprietaires: [{ contacts: [c('proprio@x.fr')] }], proprietaireContacts: [c('notaire@x.fr')],
  occupants: [{ contacts: [c('loc@x.fr')] }],
  occupations: [{ sortie: null, contacts: [c('loc@x.fr')] }, { sortie: '2020-01-31', contacts: [c('ancien@x.fr')] }],
};
const PARTIES = [
  { adresse: 'Tiers@X.fr ', categorie: 'independant' }, { adresse: 'range-loc@x.fr', categorie: 'locataire' },
  { adresse: 'flou@x.fr', categorie: 'a_repartir' }, { adresse: 'vide@x.fr', categorie: null },
  /* La fiche l'emporte sur un rangement : un client n'est jamais un contact. */
  { adresse: 'proprio@x.fr', categorie: 'independant' },
];
const SYNDICAUX = syndicauxDepuisJson([
  { adresse: 'syndic@cab.fr', role: 'Syndic — Cabinet', nom: 'Cabinet', partiLe: null },
  { adresse: 'tiers@x.fr', role: 'Gardien', nom: 'Rose', partiLe: null },
]);

describe('la couleur de chaque famille des PARTIES', () => {
  it('propriétaire rouge, locataire vert, ancien locataire violet, syndic & immeuble rose, tiers indépendant BLEU, non affecté gris', () => {
    const attendu: Array<[string | null | undefined, TonSuggestion]> = [
      ['proprietaire', 'proprietaire'], ['locataire', 'locataire'], ['ancien_locataire', 'ancien_locataire'],
      ['syndic_immeuble', 'syndic'], ['independant', 'independant'], [undefined, 'neutre'], [null, 'neutre'], ['a_repartir', 'neutre'],
    ];
    for (const [famille, ton] of attendu) expect(tonDeLaFamille(famille), String(famille)).toBe(ton);
  });
  it('les jetons : le bleu de la légende des PARTIES pour l’indépendant, pastille de suggestion ET puce', () => {
    const redaction = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    const hdb = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(hdb).toContain('.hdb-legende-pastille--bleu{border-left-color:var(--color-svv-blue);border-right-color:var(--color-svv-blue)}');
    expect(redaction).toContain('.red-sugg-pastille--independant{--red-sugg-ton:var(--color-svv-blue)}');
    expect(redaction).toContain('.red-pastille--independant{--red-puce-ton:var(--color-svv-blue)}');
  });
});

describe('🔴 un seul calcul : celui du bloc PARTIES', () => {
  it('rangementsDesParties : seuls propriétaire, locataire et indépendant sont des groupes ; « non affectée » n’est jamais posée', () => {
    expect([...rangementsDesParties(PARTIES)]).toEqual([
      ['tiers@x.fr', 'independant'], ['range-loc@x.fr', 'locataire'], ['proprio@x.fr', 'independant']]);
  });
  it('famillesDesParties = la chaîne de HistoriqueDuBien (fiche ⊕ rangements, puis syndic & immeuble), adresse par adresse', () => {
    const rangees = rangementsDesParties(PARTIES);
    const ecran = avecSyndical(fusionnerCategories(categoriesDeLaFiche(FICHE), rangees), SYNDICAUX);   // categoriesParties
    expect([...famillesDesParties(FICHE, rangees, SYNDICAUX)]).toEqual([...ecran]);
    const f = famillesDesParties(FICHE, rangees, SYNDICAUX);
    expect(Object.fromEntries(['proprio@x.fr', 'notaire@x.fr', 'loc@x.fr', 'ancien@x.fr', 'range-loc@x.fr', 'syndic@cab.fr', 'tiers@x.fr', 'flou@x.fr']
      .map((a) => [a, tonDeLaFamille(f.get(a))]))).toEqual({
      'proprio@x.fr': 'proprietaire', 'notaire@x.fr': 'proprietaire', 'loc@x.fr': 'locataire', 'ancien@x.fr': 'ancien_locataire',
      'range-loc@x.fr': 'locataire', 'syndic@cab.fr': 'syndic', 'tiers@x.fr': 'syndic', 'flou@x.fr': 'neutre',
    });
    /* Sans fiche syndic, l'indépendant reste bleu. */
    expect(tonDeLaFamille(famillesDesParties(FICHE, rangees, new Map()).get('tiers@x.fr'))).toBe('independant');
  });
  it('HistoriqueDuBien lit ses rangements par la MÊME règle pure (plus de copie en ligne)', () => {
    const hdb = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(hdb).toContain('const m = rangementsDesParties(d.data?.parties ?? []);');
    expect(hdb).not.toMatch(/m\.set\(cle, x\.categorie\)/);
    const repo = readFileSync('app/lib/gestion/suggestionsBienRepo.ts', 'utf8');
    expect(repo).toContain('ton: tonDeLaFamille(familles.get(v.adresse.trim().toLowerCase())),');
    expect(repo).not.toMatch(/du bien`, ton: 'neutre'/);
  });
});

describe('la puce d’une adresse déjà saisie prend la même couleur (elle lit la famille de la liste du bien)', () => {
  it('un tiers indépendant ajouté en À : puce bleue', () => {
    const g = rangerSuggestions({ autres: [{ adresse: 'tiers@x.fr', nom: 'Tiers', role: 'vue dans 1 mail du bien', ton: 'independant',
      propre: true, civilite: null, nomFamille: null }] });
    expect(classesPuce(famillesDesSuggestions(g)['tiers@x.fr'])).toBe(' red-pastille--famille red-pastille--independant');
  });
});
