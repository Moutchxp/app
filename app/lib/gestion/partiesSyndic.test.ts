import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  avecSyndical, categorieAvecSyndical, reconnaitreSyndical, roleCabinet, roleContactSyndic, roleImmeuble,
  syndicalPrimeSur, syndicauxDepuisJson, syndicauxDesAdresses, TITRE_SYNDIC_IMMEUBLE, type PersonneSyndicale,
} from './partiesSyndic';
import { tonDeLExpediteur, grouperParCategorie, type CategoriePartie } from './historiqueBien';
import { famillesDestinataires } from './familleDestinataire';

/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — LA FAMILLE « SYNDIC & IMMEUBLE » ═════════════════════════════════════════
 *
 * CONSTAT D'ARNO (12/10/2026) : le syndic du 25 rue Edith Cavell (TEST ARNAUD), ses contacts et l'habitant de
 * l'immeuble tombaient en « Tiers indépendant » dans les PARTIES du bien. Le banc reprend SA fiche syndic, telle
 * qu'elle est en base : cabinet arnaud.jorel@gmail.com / 06 13 86 18 77 ; M. Arnaud JOREL (même e-mail,
 * 07 60 20 10 10) et M. Augustin JOREL, Responsables de copropriété ; Augustin JOREL parti le 10/10/2026 23:36 ;
 * M. Norbert GREG, « Contact » du carnet de l'immeuble (téléphone seul). 🔒 Rien n'est lu ni écrit en base.
 */
const PARTI_LE = '2026-10-10 23:36:10.199902+02';
const FICHE: PersonneSyndicale[] = [
  { sorte: 'cabinet', role: roleCabinet('TEST ARNAUD'), nom: 'TEST ARNAUD', emails: ['arnaud.jorel@gmail.com'], telephones: ['0613861877'], partiLe: null },
  { sorte: 'contact_syndic', role: roleContactSyndic('Responsable de copropriété'), nom: 'M. Arnaud JOREL', emails: ['arnaud.jorel@gmail.com'], telephones: ['0760201010'], partiLe: null },
  { sorte: 'contact_syndic', role: roleContactSyndic('Responsable de copropriété'), nom: 'M. Augustin JOREL', emails: ['arnaud@travelnkeys.com'], telephones: [], partiLe: null },
  { sorte: 'contact_syndic', role: roleContactSyndic('Service comptabilité'), nom: 'M. Mathis BERCIER', emails: ['compta@cabinet.test'], telephones: [], partiLe: PARTI_LE },
  { sorte: 'immeuble', role: roleImmeuble('personnalise', 'Contact'), nom: 'M. Norbert GREG', emails: [], telephones: ['0613861877'], partiLe: null },
  { sorte: 'immeuble', role: roleImmeuble('gardien', null), nom: 'M. Hervé DEGREMONT', emails: ['gardien@immeuble.test'], telephones: [], partiLe: null },
];

describe('🔴 les rôles, dans les mots d’Arno', () => {
  it('« Syndic — <cabinet> », « Syndic — <rôle saisi> », « Gardien », « Habitant », « Contact immeuble »', () => {
    expect(roleCabinet('TEST ARNAUD')).toBe('Syndic — TEST ARNAUD');
    expect(roleContactSyndic('Responsable de copropriété')).toBe('Syndic — Responsable de copropriété');
    expect(roleContactSyndic('')).toBe('Syndic — Contact');
    expect(roleImmeuble('gardien', null)).toBe('Gardien');
    expect(roleImmeuble('conseil_syndical', null)).toBe('Conseil syndical');
    expect(roleImmeuble('personnalise', 'habitant')).toBe('Habitant');
    expect(roleImmeuble('personnalise', 'Contact')).toBe('Contact immeuble');
    expect(roleImmeuble('personnalise', '')).toBe('Contact immeuble');
    expect(TITRE_SYNDIC_IMMEUBLE).toBe('Syndic & immeuble');
  });
});

describe('🔴🔴 la reconnaissance : l’e-mail, puis le téléphone ; la personne nommée avant le générique', () => {
  it('l’e-mail générique du cabinet AUSSI porté par un contact ⇒ c’est le CONTACT (décision du 11/10/2026)', () => {
    expect(reconnaitreSyndical(FICHE, { email: 'Arnaud.Jorel@Gmail.com' }, '2026-10-01T10:00:00Z'))
      .toMatchObject({ role: 'Syndic — Responsable de copropriété', nom: 'M. Arnaud JOREL', par: 'email' });
  });
  it('un contact du syndic, par son e-mail', () => {
    expect(reconnaitreSyndical(FICHE, { email: 'arnaud@travelnkeys.com' }, null)?.nom).toBe('M. Augustin JOREL');
  });
  it('une personne de l’immeuble, par son e-mail', () => {
    expect(reconnaitreSyndical(FICHE, { email: 'gardien@immeuble.test' }, null)?.role).toBe('Gardien');
  });
  it('🔴 par le TÉLÉPHONE de la signature quand l’e-mail ne dit rien — « 06 13 86 18 77 » = « +33 6 13 86 18 77 »', () => {
    /* Le numéro est celui du standard ET de Norbert GREG : la personne nommée de l'immeuble passe avant le cabinet. */
    expect(reconnaitreSyndical(FICHE, { email: 'inconnu@x.test', telephone: '+33 6 13 86 18 77' }, null))
      .toMatchObject({ role: 'Contact immeuble', nom: 'M. Norbert GREG', par: 'telephone' });
    expect(reconnaitreSyndical(FICHE, { email: 'inconnu@x.test', telephone: '07 60 20 10 10' }, null)?.nom)
      .toBe('M. Arnaud JOREL');
  });
  it('🔴 une personne EN POSTE passe avant une personne partie, même d’une autre rubrique (cas réel du 06 13 86 18 77)', () => {
    /* En base, Augustin JOREL (parti le 10/10) avait noté le standard du cabinet ; Norbert GREG, toujours là, l'a aussi. */
    const avecParti: PersonneSyndicale[] = [
      ...FICHE,
      { sorte: 'contact_syndic', role: 'Syndic — Responsable de copropriété', nom: 'Augustin JOREL', emails: [], telephones: ['0613861877'], partiLe: PARTI_LE },
    ];
    expect(reconnaitreSyndical(avecParti, { telephone: '06 13 86 18 77' }, '2026-10-05T09:30:00Z')?.nom).toBe('M. Norbert GREG');
  });
  it('rien ne correspond ⇒ null (et un numéro trop court ne désigne personne)', () => {
    expect(reconnaitreSyndical(FICHE, { email: 'inconnu@x.test' }, null)).toBeNull();
    expect(reconnaitreSyndical(FICHE, { email: 'inconnu@x.test', telephone: '1877' }, null)).toBeNull();
    expect(reconnaitreSyndical([], { email: 'arnaud.jorel@gmail.com' }, null)).toBeNull();
  });
});

describe('🔴🔴 « Ne travaille plus ici » : reconnu AVANT son départ, plus APRÈS', () => {
  it('un mail antérieur au départ ⇒ syndic ; postérieur ⇒ rien ; un mail qu’on écrit aujourd’hui ⇒ rien', () => {
    expect(reconnaitreSyndical(FICHE, { email: 'compta@cabinet.test' }, '2026-09-01T10:00:00Z')?.role)
      .toBe('Syndic — Service comptabilité');
    expect(reconnaitreSyndical(FICHE, { email: 'compta@cabinet.test' }, '2026-10-11T10:00:00Z')).toBeNull();
    expect(reconnaitreSyndical(FICHE, { email: 'compta@cabinet.test' }, null)).toBeNull();
  });
  it('la date de départ voyage avec l’adresse, et la puce d’un mail POSTÉRIEUR retombe dans sa catégorie d’avant', () => {
    const s = syndicauxDepuisJson(syndicauxDesAdresses(FICHE, [
      { adresse: 'compta@cabinet.test', premierMail: '2026-09-01T10:00:00Z' },
    ]));
    expect(s.get('compta@cabinet.test')?.partiLe).toBe(PARTI_LE);
    const cats = new Map<string, CategoriePartie>([['compta@cabinet.test', 'independant']]);
    expect(tonDeLExpediteur({ sens: 'recu', de: 'compta@cabinet.test', recuLe: '2026-09-01T10:00:00Z' }, cats, s)).toBe('rose');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'compta@cabinet.test', recuLe: '2026-10-11T10:00:00Z' }, cats, s)).toBe('bleu');
    /* Dans le bloc PARTIES (lecture à l'adresse), la personne reste du syndic : elle l'était pour ce bien. */
    expect(avecSyndical(cats, s).get('compta@cabinet.test')).toBe('syndic_immeuble');
  });
  it('lue à la date de son PREMIER mail : une adresse apparue après le départ n’est pas reconnue', () => {
    expect(syndicauxDesAdresses(FICHE, [{ adresse: 'compta@cabinet.test', premierMail: '2026-10-11T10:00:00Z' }])).toEqual([]);
  });
});

describe('🔴🔴 la priorité d’Arno : propriétaire et locataire l’emportent, « Syndic & immeuble » passe avant le tiers', () => {
  const s = syndicauxDepuisJson([
    { adresse: 'syndic@x.test', role: 'Syndic — X', nom: 'X', partiLe: null },
    { adresse: 'proprio@x.test', role: 'Syndic — Responsable', nom: 'P', partiLe: null },
    { adresse: 'loc@x.test', role: 'Gardien', nom: 'L', partiLe: null },
    { adresse: 'tiers@x.test', role: 'Gardien', nom: 'T', partiLe: null },
  ]);
  const cats = new Map<string, CategoriePartie>([
    ['proprio@x.test', 'proprietaire'], ['loc@x.test', 'locataire'], ['tiers@x.test', 'independant'],
  ]);
  it('les rôles de client gagnent ; tiers indépendant, non affecté et inconnu deviennent « Syndic & immeuble »', () => {
    expect(categorieAvecSyndical('proprio@x.test', cats, s)).toBe('proprietaire');
    expect(categorieAvecSyndical('loc@x.test', cats, s)).toBe('locataire');
    expect(categorieAvecSyndical('tiers@x.test', cats, s)).toBe('syndic_immeuble');
    expect(categorieAvecSyndical('syndic@x.test', cats, s)).toBe('syndic_immeuble');
    expect(categorieAvecSyndical('autre@x.test', cats, s)).toBeUndefined();
    expect(syndicalPrimeSur('ancien_locataire')).toBe(false);
    expect(syndicalPrimeSur('independant')).toBe(true);
    expect(syndicalPrimeSur(undefined)).toBe(true);
  });
  it('le bloc PARTIES : une bande rose, entre les encarts et le tiers indépendant', () => {
    const inter = (adresse: string) => ({ adresse, nom: null, nbMails: 1, aEcrit: 1, enCopie: 0, interne: false });
    const { groupes } = grouperParCategorie(
      ['proprio@x.test', 'tiers@x.test', 'syndic@x.test', 'autre@x.test'].map(inter), avecSyndical(cats, s));
    const g = Object.fromEntries(groupes.map((x) => [x.cle, x.interlocuteurs.map((i) => i.adresse)]));
    expect(g.syndic_immeuble).toEqual(['tiers@x.test', 'syndic@x.test']);
    expect(g.independant).toEqual([]);
    expect(g.proprietaire).toEqual(['proprio@x.test']);
    expect(g.a_repartir).toEqual(['autre@x.test']);
    expect(groupes.find((x) => x.cle === 'syndic_immeuble')?.ton).toBe('rose');
  });
  it('les capsules d’envoi des pièces : « Envoyé au syndic & immeuble », rose', () => {
    const r = famillesDestinataires(
      { sens: 'envoye', a: [{ nom: null, adresse: 'tiers@x.test' }], cc: [], recuLe: '2026-10-01T10:00:00Z' },
      cats, { estInterne: () => false, adresseBoite: 'gestion@criterimmo.fr' }, s);
    expect(r.map((f) => [f.famille, f.mot, f.ton])).toEqual([['syndic_immeuble', 'Envoyé au syndic & immeuble', 'rose']]);
  });
});

describe('🔒 calculé à l’affichage, jamais stocké', () => {
  it('le dépôt ne fait que lire, et la catégorie stockée reste celle de la contrainte de la base', () => {
    const repo = readFileSync('app/lib/gestion/partiesSyndicRepo.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').toUpperCase();
    for (const v of ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE']) expect(repo, v).not.toContain(v);
    const pur = readFileSync('app/lib/gestion/partieCategorie.ts', 'utf8');
    expect(pur).toContain("export type Categorie = 'proprietaire' | 'locataire' | 'ancien_locataire' | 'independant' | 'a_repartir';");
    expect(pur).toContain("export type CategorieAffichee = Categorie | 'syndic_immeuble';");
    /* Jamais posable à la main. */
    const route = readFileSync('app/(admin)/api/admin/gestion/historique/parties/route.ts', 'utf8');
    expect(route).toContain("['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'a_repartir'];");
  });
  it('⚠️ aucun accent grave ni accent dans le SQL du dépôt (piège du lot 19d3c67d)', () => {
    const src = readFileSync('app/lib/gestion/partiesSyndicRepo.ts', 'utf8');
    for (const sql of src.match(/`[^`]*`/g) ?? []) expect(sql, sql.slice(0, 60)).not.toMatch(/[À-ÿ]/);
  });
});
