import { describe, it, expect } from 'vitest';
import { examinerMessage } from './rattachement';
import type { AdresseEchange } from './propositionTri';
import type { BienConnu } from './propositionsBien';
import { extraitDeLObjet } from './propositionsBien';
import {
  ajouterMois, dansLesMoisApresSortie, estSuiviAutomatique, motSuiviAutomatique, reglesDuMail, suiviAutomatiqueDuMail,
  AUTEUR_SUIVI_AUTOMATIQUE, type ReglesDuMail,
} from './reglesRattachement';
import { complementReconnaissance } from './adressesMessage';
import { motParLe } from './suiviOneShot';
import type { AnnuaireContenu } from './personnesDansLeTexte';

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET — UNE ÉPREUVE PAR RÈGLE (moteur pur) ══════════
 * Chaque règle est jouée SOUS les nouvelles règles (mail reçu après la mise en service) et, quand elle change quelque
 * chose, AUSSI sous l'ancien régime — qui doit rendre exactement ce qu'il rendait (décision C : rien sur l'existant).
 * L'écriture (suivi de fond, mail sorti du suivi, lien retiré) est éprouvée sur une base de TEST :
 * `app/scripts/rattachement-auto-epreuve.ts`. 🔒 Données inventées.
 */
const NOUVELLES: ReglesDuMail = { actives: true, ancienLocataireMois: 15, dateMail: '2026-10-31T10:00:00.000Z' };
const ANCIENNES: ReglesDuMail = { actives: false, ancienLocataireMois: 15, dateMail: '2026-10-31T10:00:00.000Z' };

const BIENS: BienConnu[] = [
  { cle: '101', numero: '101', adresse: '67 rue de Normandie', commune: 'COURBEVOIE', proprietaireCle: 'P1', proprietaireNom: 'UNBIEN Paul' },
  { cle: '201', numero: '201', adresse: '1 avenue Foch', commune: 'PUTEAUX', proprietaireCle: 'P2', proprietaireNom: 'MULTI Anne' },
  { cle: '202', numero: '202', adresse: '2 avenue Foch', commune: 'PUTEAUX', proprietaireCle: 'P2', proprietaireNom: 'MULTI Anne' },
  { cle: '203', numero: '203', adresse: '3 avenue Foch', commune: 'PUTEAUX', proprietaireCle: 'P2', proprietaireNom: 'MULTI Anne' },
  { cle: '301', numero: '301', adresse: '9 rue Danton', commune: 'NANTERRE', proprietaireCle: 'P3', proprietaireNom: 'AUTRE Luc' },
];
const MSG = 500;
const adr = (adresse: string, r: Partial<AdresseEchange['reconnaissance']>, plus: Partial<AdresseEchange> = {}, messageId = MSG): AdresseEchange => ({
  adresse, messageId, interne: false,
  reconnaissance: { partie: null, proprietaireCle: null, locataireId: null, lotCle: null, motif: '', ...r },
  ...plus,
});
const locataire = (adresse: string, lot: string, prop: string) => adr(adresse, { partie: 'locataire', lotCle: lot, proprietaireCle: prop, locataireId: 7 });
const proprio = (adresse: string, prop: string, plus: Partial<AdresseEchange> = {}) => adr(adresse, { partie: 'proprietaire', proprietaireCle: prop }, plus);
const gestion = adr('gestion@criterimmo.fr', {}, { interne: true });

const examiner = (adresses: AdresseEchange[], regles: ReglesDuMail, objet = 'Question', extra: Partial<Parameters<typeof examinerMessage>[0]> = {}) =>
  examinerMessage({ messageId: MSG, adressesEchange: adresses, biens: BIENS, textes: { objet, corps: '', pieces: [] },
    sens: 'recu', regles, lectureObjet: regles.actives, ...extra });
const cles = (cs: { cible: { cle: string | null } }[]) => cs.map((c) => c.cible.cle).sort();

describe('R1 — l’expéditeur est LOCATAIRE ACTUEL d’un bien', () => {
  it('rattaché automatiquement à ce bien', () => {
    const e = examiner([locataire('loc@x.fr', '301', 'P3'), gestion], NOUVELLES);
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible.cle).toBe('301');
  });
  it('🔴 en copie d’un propriétaire à PLUSIEURS biens : l’adresse du locataire tranche, les autres biens restent proposés (non cochés)', () => {
    const adresses = [locataire('loc@x.fr', '201', 'P2'), proprio('multi@x.fr', 'P2'), gestion];
    const e = examiner(adresses, NOUVELLES);
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible.cle).toBe('201');
    expect(cles(e.candidats)).toEqual(['202', '203']);
    /* Ancien régime : exactement ce qu'il faisait (« à trancher », mesuré dans RECON_RATTACHEMENT_AUTO §3.3). */
    expect(examiner(adresses, ANCIENNES).issue).toBe('a_trier');
  });
});

describe('R2 — le PROPRIÉTAIRE d’UN SEUL bien', () => {
  it('rattaché automatiquement à ce bien', () => {
    const e = examiner([proprio('unbien@x.fr', 'P1'), gestion], NOUVELLES);
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible.cle).toBe('101');
  });
  it('🔴 avec une carte de contact sur ce bien : la règle propriétaire passe AVANT la carte', () => {
    const adresses = [proprio('unbien@x.fr', 'P1', { cartesLots: ['101'] }), gestion];
    expect(examiner(adresses, NOUVELLES).issue).toBe('automatique');
    expect(examiner(adresses, NOUVELLES).certain?.regle).toBe('a');
    /* Ancien régime : la carte (f) « à trancher » prenait la place (cas kharrat, lot 504). */
    expect(examiner(adresses, ANCIENNES).issue).toBe('a_trier');
  });
});

describe('R3 — le PROPRIÉTAIRE de PLUSIEURS biens (inchangé)', () => {
  it('reste « À classer », TOUS ses biens proposés, aucun coché — dans les deux régimes', () => {
    for (const regles of [NOUVELLES, ANCIENNES]) {
      const e = examiner([proprio('multi@x.fr', 'P2'), gestion], regles);
      expect(e.issue).toBe('a_trier');
      expect(cles(e.candidats)).toEqual(['201', '202', '203']);
      expect(e.candidats.every((c) => c.regle === 'c')).toBe(true);
    }
  });
});

describe('A — LOCATAIRE d’un bien ET PROPRIÉTAIRE d’un autre', () => {
  it('🔴 AUCUN rattachement automatique : « À classer », les deux biens proposés, décochés', () => {
    const e = examiner([proprio('double@x.fr', 'P1', { aussiLocataireDe: ['301'] }), gestion], NOUVELLES);
    expect(e.issue).toBe('a_trier');
    expect(cles(e.candidats)).toEqual(['101', '301']);
    expect(e.candidats.every((c) => c.confiance !== 'haute')).toBe(true);
  });
  it('le complément de reconnaissance trouve le second rôle à la date du mail (même annuaire que la relève)', () => {
    const contacts = [
      { email: 'Double@x.fr', role: 'proprietaire' as const, sujetId: 1, proprietaireCle: 'P1' },
      { email: 'double@x.fr', role: 'locataire' as const, sujetId: 9 },
    ];
    const occupations = [{ locataireId: 9, lotCle: '301', proprietaireCle: 'P3', entree: '2024-01-01', sortie: null }];
    expect(complementReconnaissance('double@x.fr', contacts, occupations, '2026-10-31').aussiLocataireDe).toEqual(['301']);
  });
});

describe('B — l’ANCIEN LOCATAIRE qui écrit après son départ', () => {
  const ancien = (date: string) => examiner(
    [adr('ancien@x.fr', { partie: 'locataire', locataireId: 8 }, { dernierBail: { lotCle: '301', sortie: '2025-08-31' } }), gestion],
    { ...NOUVELLES, dateMail: date });
  it('🔴 à 14 mois après la sortie : rattaché automatiquement à son dernier bien, la durée dite dans le motif', () => {
    const e = ancien('2026-10-31T09:00:00.000Z');
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible.cle).toBe('301');
    expect(e.certain?.motif).toContain('sorti le 31/08/2025');
    expect(e.certain?.motif).toContain('pendant 15 mois après la sortie');
  });
  it('🔴 à 16 mois : seulement proposé, avec la durée', () => {
    const e = ancien('2026-12-31T09:00:00.000Z');
    expect(e.issue).toBe('a_trier');
    expect(e.candidats[0].cible.cle).toBe('301');
    expect(e.candidats[0].motif).toContain('au-delà de 15 mois après la sortie : proposé seulement');
  });
  it('la durée est réglable', () => {
    const e = examiner(
      [adr('ancien@x.fr', { partie: 'locataire', locataireId: 8 }, { dernierBail: { lotCle: '301', sortie: '2025-08-31' } })],
      { actives: true, ancienLocataireMois: 24, dateMail: '2026-12-31T09:00:00.000Z' });
    expect(e.issue).toBe('automatique');
  });
  it('le complément trouve le DERNIER bien quitté, et rien pour un locataire en place', () => {
    const contacts = [{ email: 'ancien@x.fr', role: 'locataire' as const, sujetId: 8 }];
    const occupations = [
      { locataireId: 8, lotCle: '201', proprietaireCle: 'P2', entree: '2019-01-01', sortie: '2022-06-30' },
      { locataireId: 8, lotCle: '301', proprietaireCle: 'P3', entree: '2022-07-01', sortie: '2025-08-31' },
    ];
    expect(complementReconnaissance('ancien@x.fr', contacts, occupations, '2026-10-31').dernierBail)
      .toEqual({ lotCle: '301', sortie: '2025-08-31' });
    expect(complementReconnaissance('ancien@x.fr', contacts, occupations, '2025-05-01').dernierBail).toBeNull();
  });
  it('mois civils : 31/08/2025 + 15 mois = 30/11/2026', () => {
    expect(ajouterMois('2025-08-31', 15)).toBe('2026-11-30');
    expect(dansLesMoisApresSortie('2025-08-31', '2026-11-30', 15)).toBe(true);
    expect(dansLesMoisApresSortie('2025-08-31', '2026-12-01', 15)).toBe(false);
  });
});

describe('Syndic, carnet d’immeuble, tiers indépendant : jamais de rattachement automatique', () => {
  it('une adresse que l’annuaire des clients ne connaît pas (syndic, carnet) ne rattache rien', () => {
    const e = examiner([adr('syndic@cabinet.fr', {}), gestion], NOUVELLES);
    expect(e.issue).toBe('sans_candidat');
  });
  it('🔴 une adresse rangée « tiers indépendant » ne déclenche jamais de rattachement automatique (règle branchée)', () => {
    const e = examiner([proprio('unbien@x.fr', 'P1', { independant: true }), gestion], NOUVELLES);
    expect(e.issue).toBe('a_trier');
    expect(e.candidats[0].motif).toContain('tiers indépendant');
  });
});

describe('Interne : comportement inchangé', () => {
  it('un mail marqué interne n’a aucun bien, dans les deux régimes', () => {
    for (const regles of [NOUVELLES, ANCIENNES]) {
      expect(examiner([locataire('loc@x.fr', '301', 'P3')], regles, 'x', { interne: true }).issue).toBe('sans_candidat');
    }
  });
});

describe('LECTURE DE L’OBJET — proposition seulement, JAMAIS de rattachement automatique', () => {
  const CONTENU: AnnuaireContenu = { personnes: [{ cle: 'locataire|9', role: 'locataire', nom: 'KASSAR Marnie', nomFamille: 'KASSAR', lots: ['202'] }] };
  it('🔴 objet avec une ADRESSE : le bien proposé, motif « l’objet cite “…” », décoché, jamais rattaché', () => {
    /* Le propriétaire à plusieurs biens écrit pour un AUTRE bien que les siens : l'objet le cite. */
    const e = examiner([proprio('multi@x.fr', 'P2')], NOUVELLES, 'Fuite d’eau au 67 R. de Normandie');
    expect(e.issue).toBe('a_trier');
    const o = e.candidats.find((c) => c.cible.cle === '101');
    expect(o?.regle).toBe('o');
    expect(o?.motif).toBe('proposé : l’objet cite “67 R. de Normandie”');
    expect(o?.confiance).toBe('basse');
  });
  it('🔴 même SEULE correspondance, l’objet ne rattache jamais : sans adresse connue, le bien reste à trancher', () => {
    const e = examiner([adr('inconnu@y.fr', {})], NOUVELLES, 'Fuite d’eau au 67 R. de Normandie');
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => c.cible.cle)).toEqual(['101']);
    /* La citation d'adresse du cas (d) existait déjà : le motif de l'objet s'y AJOUTE, sans doublon. */
    expect(e.candidats[0].motif).toContain('proposé : l’objet cite “67 R. de Normandie”');
  });
  it('🔴 objet avec un NOM connu : ses biens proposés, motif avec le nom cité', () => {
    const e = examiner([adr('inconnu@y.fr', {})], NOUVELLES, 'Départ locataire - Mme KASSAR Marnie', { contenu: CONTENU });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => c.cible.cle)).toEqual(['202']);
    expect(e.candidats[0].motif).toContain('proposé : l’objet cite “');
    expect(e.candidats[0].motif).toContain('KASSAR');
  });
  it('objet AMBIGU : une voie sans numéro, un nom court ou courant → aucune proposition', () => {
    expect(examiner([adr('inconnu@y.fr', {})], NOUVELLES, 'Rue de Normandie : travaux').issue).toBe('sans_candidat');
    const courant: AnnuaireContenu = { personnes: [{ cle: 'locataire|1', role: 'locataire', nom: 'MARTIN Luc', nomFamille: 'MARTIN', lots: ['301'] }] };
    expect(examiner([adr('inconnu@y.fr', {})], NOUVELLES, 'Message de Martin', { contenu: courant }).issue).toBe('sans_candidat');
  });
  it('🔴 un bien déjà donné par l’e-mail n’est pas dupliqué : le motif s’ajoute, et le rattachement reste automatique', () => {
    const e = examiner([locataire('loc@x.fr', '101', 'P1')], NOUVELLES, 'Quittance 67 rue de Normandie');
    expect(e.issue).toBe('automatique');
    expect(e.candidats).toHaveLength(0);
    expect(e.certain?.motif).toContain('locataire en place');
    expect(e.certain?.motif).toContain('proposé : l’objet cite “67 rue de Normandie”');
  });
  it('ancien régime : l’objet n’ajoute rien (le moteur d’avant, à la lettre)', () => {
    const e = examiner([locataire('loc@x.fr', '301', 'P3')], ANCIENNES, 'Fuite au 67 rue de Normandie');
    expect(e.issue).toBe('automatique');
    expect(e.candidats).toHaveLength(0);
  });
  it('l’extrait est celui de l’objet, tel que l’expéditeur l’a écrit', () => {
    expect(extraitDeLObjet('RE: dégât des eaux — 67, Rue de NORMANDIE (Courbevoie)', BIENS[0])).toBe('67, Rue de NORMANDIE');
  });
});

describe('DÉCISION C — quand les nouvelles règles jouent', () => {
  const reglage = { miseEnService: '2026-10-14T08:00:00.000Z', ancienLocataireMois: 15 };
  it('seulement pour un mail REÇU à partir de la mise en service', () => {
    expect(reglesDuMail({ sens: 'recu', recuLe: '2026-10-14T08:00:00.000Z' }, reglage).actives).toBe(true);
    expect(reglesDuMail({ sens: 'recu', recuLe: '2026-10-14T07:59:59.000Z' }, reglage).actives).toBe(false);
    expect(reglesDuMail({ sens: 'envoye', recuLe: '2026-10-20T08:00:00.000Z' }, reglage).actives).toBe(false);
    expect(reglesDuMail({ sens: 'recu', recuLe: '2026-10-20T08:00:00.000Z' }, null).actives).toBe(false);
  });
});

describe('R4 — la signature du suivi de fond posé par l’automate', () => {
  it('un auteur dédié, distinct d’un humain et de la reprise, jamais « automatique » tout court (refusé par la base)', () => {
    expect(AUTEUR_SUIVI_AUTOMATIQUE).toBe('suivi de fond posé automatiquement');
    expect(AUTEUR_SUIVI_AUTOMATIQUE.trim().toLowerCase()).not.toBe('automatique');
    expect(estSuiviAutomatique('a.jorel@sansvisavis.com')).toBe(false);
    expect(estSuiviAutomatique('reprise des périodes')).toBe(false);
  });
  it('« suivi de fond posé automatiquement le … », dans l’accolade, la fenêtre avant / après et la fenêtre de rattachement', () => {
    expect(motSuiviAutomatique('13/10/2026 à 14:02')).toBe('suivi de fond posé automatiquement le 13/10/2026 à 14:02');
    expect(motParLe(AUTEUR_SUIVI_AUTOMATIQUE, '2026-10-13T12:02:00.000Z')).toBe('Suivi de fond posé automatiquement le 13/10/2026 à 14:02');
    expect(motParLe('a.jorel@sansvisavis.com', '2026-10-13T12:02:00.000Z')).toBe('Par a.jorel@sansvisavis.com, le 13/10/2026 à 14:02');
    const periodes = [{ depuisMessageId: 2, parLibelle: AUTEUR_SUIVI_AUTOMATIQUE, le: '2026-10-13T12:02:00.000Z' }];
    expect(suiviAutomatiqueDuMail([1, 2, 3], periodes, 3)).toBe('2026-10-13T12:02:00.000Z');
    expect(suiviAutomatiqueDuMail([1, 2, 3], periodes, 1)).toBeNull();
  });
});

/* ══ 🔴🔴 LES GARDES DE L'ÉCRITURE — prouvées sur base de test par `app/scripts/rattachement-auto-epreuve.ts`, tenues ici
   pour qu'elles ne disparaissent pas en silence. ══════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
describe('🔴 les gardes de l’écriture (code)', () => {
  const vif = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  it('🔴 un mail SORTI DU SUIVI n’est jamais rattaché de nouveau par l’héritage automatique (projection sans auteur)', () => {
    const src = vif('app/lib/gestion/periodeRepo.ts');
    expect(src).toContain('if (auteur.id === null) {');
    expect(src).toMatch(/AND statut = 'sorti' AND piece_id IS NULL`, \[mails\]\)/);
    expect(src).toContain("if (sortis.has(`${m}|${b.cle}`)) continue;");
  });
  it('🔴 seul un lien retiré PAR LE MOTEUR cesse de bloquer, et seulement sous les nouvelles règles', () => {
    const src = vif('app/lib/gestion/rattachementRepo.ts');
    expect(src).toContain("AND NOT (statut = 'retire' AND statut_par IS NULL");
    expect(src).toContain("AND statut_par_libelle = '${AUTEUR_MOTEUR.libelle}' AND statut_motif = '${MOTIF_RETRAIT_MOTEUR}')");
    expect(src).toContain('libelleCible(cand.cible, libelles), regles.actives);');
  });
  it('🔴 R4 : le suivi n’est posé que si le lien certain a réellement été écrit, et seulement sans suivi vivant', () => {
    expect(vif('app/lib/gestion/rattachementRepo.ts')).toContain('if (regles.actives && certainEcrit && certainConfirme !== undefined');
    expect(vif('app/lib/gestion/periodeRepo.ts')).toContain("'SELECT count(*)::int AS n FROM gestion_fil_periode WHERE fil_id = $1 AND remplacee_le IS NULL'");
  });
  it('la migration 345 n’ajoute qu’une table d’une ligne : aucune donnée existante touchée', () => {
    const sql = readFileSync('db/migrations/345_gestion_rattachement_reglage.sql', 'utf8').replace(/--[^\n]*/g, ' ');
    for (const v of ['UPDATE ', 'DELETE ', 'DROP ', 'ALTER TABLE gestion_rattachement ', 'gestion_fil_periode']) expect(sql, v).not.toContain(v);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gestion_rattachement_reglage');
  });
});

/* ══ 🔴🔴 LOT REGLE-OBJET-QUI-CONTREDIT-L-EXPEDITEUR — RÈGLE V (moteur pur) ════════════════════════════════════════════ */
import { proposerBiens, type AdresseVue } from './propositionsBien';
describe('🔴 RÈGLE V — l’objet cite le bien d’un AUTRE propriétaire que l’expéditeur reconnu', () => {
  const B: BienConnu[] = [
    ...BIENS,
    { cle: '801', numero: '801', adresse: '39 bis rue Rousselle', commune: 'PARIS', proprietaireCle: 'P8', proprietaireNom: 'LATHAM Marine' },
    { cle: '802', numero: '802', adresse: '39 bis rue Rousselle', commune: 'PARIS', proprietaireCle: 'P8', proprietaireNom: 'LATHAM Marine' },
    { cle: '901', numero: '901', adresse: '54 avenue Puvis', commune: 'COURBEVOIE', proprietaireCle: 'P9', proprietaireNom: 'NEUF Ida' },
    { cle: '902', numero: '902', adresse: '54 avenue Puvis', commune: 'COURBEVOIE', proprietaireCle: 'P3', proprietaireNom: 'TROIS Léa' },
  ];
  const vue = (a: Partial<AdresseVue> & { adresse: string }): AdresseVue => ({
    interne: false, partie: null, lotCle: null, proprietaireCle: null, duMail: true, expediteur: true, ...a,
  });
  const examen = (adresses: AdresseVue[], objet: string, v = true) => proposerBiens({
    adresses, biens: B, textes: { objet, corps: '', pieces: [] }, regles: NOUVELLES, lectureObjet: true, objetContreExpediteur: v,
  });
  const LIONEL = vue({ adresse: 'unbien@x.fr', partie: 'proprietaire', proprietaireCle: 'P1' });
  it('🔴 le cas LATHAM : aucun rattachement automatique, ses biens « bien de l’expéditeur », le bien cité « — bien de LATHAM Marine », rien de coché', () => {
    const e = examen([LIONEL], 'Studio Marine - 39 bis rue rousselle');
    expect(e.issue).toBe('a_trancher');
    expect(e.propositions.every((p) => !p.preCoche)).toBe(true);
    const p = Object.fromEntries(e.propositions.map((x) => [x.cle, x.motif]));
    expect(p['101']).toMatch(/^bien de l’expéditeur/);
    expect(p['801']).toBe('proposé : l’objet cite “39 bis rue rousselle” — bien de LATHAM Marine');
    expect(p['802']).toBe('proposé : l’objet cite “39 bis rue rousselle” — bien de LATHAM Marine');
  });
  it('l’objet cite un bien DE l’expéditeur : comportement normal (R2)', () => {
    expect(examen([LIONEL], 'Fuite au 67 rue de Normandie').issue).toBe('automatique');
  });
  it('l’objet ne cite aucune adresse : comportement normal', () => {
    expect(examen([LIONEL], 'Question sur la régularisation').issue).toBe('automatique');
  });
  it('l’objet cite deux biens d’AUTRES propriétaires : les deux proposés, aucun automatique', () => {
    const e = examen([LIONEL], 'Travaux 1 avenue Foch et 9 rue Danton');
    expect(e.issue).toBe('a_trancher');
    expect(e.propositions.map((p) => p.cle).sort()).toEqual(['101', '201', '301']);
    expect(e.propositions.find((p) => p.cle === '201')?.motif).toContain('— bien de MULTI Anne');
    expect(e.propositions.find((p) => p.cle === '301')?.motif).toContain('— bien de AUTRE Luc');
  });
  it('un LOCATAIRE dont l’objet cite un autre bien : aucun automatique', () => {
    const e = examen([vue({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '301', proprietaireCle: 'P3' })], 'Clés du 39 bis rue Rousselle');
    expect(e.issue).toBe('a_trancher');
    expect(e.propositions.find((p) => p.cle === '301')?.motif).toMatch(/^bien de l’expéditeur/);
  });
  it('un ANCIEN LOCATAIRE (règle B) dont l’objet cite un autre bien : aucun automatique', () => {
    const e = examen([vue({ adresse: 'ancien@x.fr', partie: 'locataire', dernierBail: { lotCle: '301', sortie: '2026-01-31' } })], 'Dépôt de garantie 67 rue de Normandie');
    expect(e.issue).toBe('a_trancher');
    expect(e.propositions.map((p) => p.cle).sort()).toEqual(['101', '301']);
  });
  it('C — l’objet cite une adresse d’immeuble qui couvre AUSSI un bien de l’expéditeur : pas de contradiction', () => {
    const e = examen([vue({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '902', proprietaireCle: 'P3' })], 'Ascenseur 54 avenue Puvis');
    expect(e.issue).toBe('automatique');
  });
  it('A — un expéditeur NON reconnu (cas lionel@ekamai.fr : seulement une carte de contact) : la règle V ne joue pas', () => {
    const e = examen([vue({ adresse: 'lionel@ekamai.fr', cartesLots: ['301'] })], 'Studio Marine - 39 bis rue rousselle');
    expect(e.propositions.some((p) => p.motif.includes('bien de l’expéditeur'))).toBe(false);
    expect(e.propositions.find((p) => p.cle === '801')?.motif).toBe('proposé : l’objet cite “39 bis rue rousselle”');
  });
  it('B — sans la règle (mail envoyé, ou reçu avant la mise en service) : rien ne change', () => {
    expect(examen([LIONEL], 'Studio Marine - 39 bis rue rousselle', false).issue).toBe('automatique');
  });
  it('la règle V passe par examinerMessage : uniquement sous les nouvelles règles, et pour l’expéditeur de CE mail', () => {
    const mailLionel = proprio('unbien@x.fr', 'P1', { expediteur: true });
    const e = examinerMessage({ messageId: MSG, adressesEchange: [mailLionel], biens: B, textes: { objet: 'Studio Marine - 39 bis rue rousselle' },
      sens: 'recu', regles: NOUVELLES, lectureObjet: true });
    expect(e.issue).toBe('a_trier');
    const ancien = examinerMessage({ messageId: MSG, adressesEchange: [mailLionel], biens: B, textes: { objet: 'Studio Marine - 39 bis rue rousselle' },
      sens: 'recu', regles: ANCIENNES, lectureObjet: false });
    expect(ancien.issue).toBe('automatique');
  });
});
