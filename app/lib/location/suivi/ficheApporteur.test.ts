import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changementsFiche, ficheDe, verifierFiche } from './ficheApporteur';
import { sectionApporteurs, totauxApporteurs, type ActiviteCalcul } from './tableauBord';
import type { Apporteur } from './suivi';

/**
 * 🔴 Arno (24/10/2026) — LE PANNEAU « FICHE » D'UN APPORTEUR (migration 421) et LA FIN DU COÛT FIXE MENSUEL.
 * La fiche : lecture, vérification, le récapitulatif des SEULS champs modifiés ; au serveur, le conflit (rien n'est écrit), une ligne de
 * journal par champ (compte, session, écran), un interne refusé. Le coût fixe : plus aucun calcul ne le lit. Base simulée, données fictives.
 */
const { appels, etat } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[], etat: { version: '2026-10-20 10:00:00+00', interne: false, rowCount: 1 } }));
vi.mock('server-only', () => ({}));
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  appels.push({ sql: s, params });
  if (s.includes('AS externe')) return { rows: [{ externe: !etat.interne, rattache: true }], rowCount: 1 };
  if (s.includes('gestion_journal_entite_chk')) return { rows: [{ def: "CHECK ((entite = ANY (ARRAY['location_apporteur'::text])))" }], rowCount: 1 };
  if (s.startsWith('SELECT id, nom, type')) {
    return { rows: [{ id: '4', nom: 'Léa Fictive', type: 'partenaire', archive_le: null, societe: 'Fictive Conseil', telephone: '06 00 00 00 04', email: 'lea@exemple.fr',
      nom_famille: 'Fictive', prenom: 'Léa', compte_id: etat.interne ? '2' : null, civilite: null, adresse: null, notes: null, telephones_autres: [], emails_autres: [],
      version: etat.version, compte_libelle: null, compte_identifiant: null }], rowCount: 1 };
  }
  if (s.startsWith('SELECT modifie_par_libelle AS par')) return { rows: [{ par: 'Paul Collègue', quand: '2026-10-24 12:05:00+00' }], rowCount: 1 };
  if (s.startsWith('UPDATE')) return { rows: [], rowCount: etat.rowCount };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { enregistrerFicheApporteur } = await import('./suiviRepo');
const { avecTrace } = await import('../../gestion/traceJournal');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const LEA = { civilite: '', nomFamille: 'Fictive', prenom: 'Léa', societe: 'Fictive Conseil', type: 'partenaire', telephone: '06 00 00 00 04', telephonesAutres: [],
  email: 'lea@exemple.fr', emailsAutres: [], adresse: '', notes: '' };
const ecrit = () => appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql));
beforeEach(() => { appels.length = 0; Object.assign(etat, { version: '2026-10-20 10:00:00+00', interne: false, rowCount: 1 }); });

describe('🔴 la fiche : lecture, vérification, récapitulatif', () => {
  it('les seuls champs modifiés, dans l’ordre de la fiche, en clair', () => {
    const a = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, baremes: [], nomFamille: 'Fictive', prenom: 'Léa', societe: 'Fictive Conseil' } as Apporteur;
    const avant = ficheDe(a);
    expect(changementsFiche(avant, { ...avant, civilite: 'Mme', telephonesAutres: ['01 00 00 00 01'], notes: 'Rencontrée au salon' }).map((c) => `${c.champ} : ${c.avant} → ${c.apres}`))
      .toEqual(['Civilité : — → Mme', 'Autres téléphones : — → 01 00 00 00 01', 'Notes : — → Rencontrée au salon']);
    expect(changementsFiche(avant, avant)).toEqual([]);
  });
  it('un e-mail mal écrit (principal ou autre), une civilité hors liste, un prénom sans nom : refusés', () => {
    expect(verifierFiche({ ...LEA, emailsAutres: ['pas-un-mail'] })).toEqual({ ok: false, motif: 'L’e-mail « pas-un-mail » est mal écrit (ex. nom@exemple.fr).' });
    expect(verifierFiche({ ...LEA, civilite: 'Dr' }).ok).toBe(false);
    expect(verifierFiche({ ...LEA, nomFamille: '' }).ok).toBe(false);
    expect(verifierFiche({ ...LEA, telephonesAutres: [' ', '01 02'] })).toMatchObject({ ok: true, fiche: { telephonesAutres: ['01 02'] } });
  });
});

describe('🔴 la fiche au serveur : conflit, journal, interne', () => {
  it('une modification : UNE écriture conditionnée à la version lue, puis une ligne de journal par champ (compte, session, écran)', async () => {
    const r = await avecTrace({ sessionId: 'jti-fictif', ecran: 'Annuaire des apporteurs' },
      () => enregistrerFicheApporteur(4, { fiche: { ...LEA, civilite: 'Mme', adresse: '3 rue des Essais' }, version: etat.version }, AUTEUR));
    expect(r).toEqual({ etat: 'ok', data: { changements: [{ champ: 'Civilité', avant: '—', apres: 'Mme' }, { champ: 'Adresse', avant: '—', apres: '3 rue des Essais' }] } });
    const u = ecrit().filter((a) => a.sql.startsWith('UPDATE gestion_location_apporteur'));
    expect(u).toHaveLength(1);
    expect(u[0].sql).toContain('modifie_le::text IS NOT DISTINCT FROM');
    expect(u[0].params.at(-1)).toBe(etat.version);
    const j = ecrit().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j.map((x) => x.params)).toEqual([
      [4, '—', 'Mme', 'Fiche de l’apporteur — Civilité : — → Mme', 2, 'Arnaud Jorel', 'apporteur', 'Civilité', 'jti-fictif', 'Annuaire des apporteurs'],
      [4, '—', '3 rue des Essais', 'Fiche de l’apporteur — Adresse : — → 3 rue des Essais', 2, 'Arnaud Jorel', 'apporteur', 'Adresse', 'jti-fictif', 'Annuaire des apporteurs']]);
  });
  it('🔴 conflit : la fiche a changé depuis son ouverture — refus (qui, quand), RIEN n’est écrit', async () => {
    const r = await enregistrerFicheApporteur(4, { fiche: { ...LEA, civilite: 'Mme' }, version: '2026-10-01 08:00:00+00' }, AUTEUR);
    expect(r.etat).toBe('conflit');
    expect('motif' in r && r.motif).toMatch(/modifiée par Paul Collègue le 24\/10\/2026 à 14:05.*Rien n’a été enregistré/);
    expect(ecrit()).toEqual([]);
  });
  it('conflit au moment d’écrire (modifiée entre la lecture et l’écriture) : refus, aucun journal', async () => {
    etat.rowCount = 0;
    expect((await enregistrerFicheApporteur(4, { fiche: { ...LEA, civilite: 'Mme' }, version: etat.version }, AUTEUR)).etat).toBe('conflit');
    expect(ecrit().some((a) => a.sql.startsWith('INSERT INTO gestion_journal'))).toBe(false);
  });
  it('rien de modifié : rien n’est écrit ; un INTERNE : refusé (son identité est celle de son compte)', async () => {
    expect(await enregistrerFicheApporteur(4, { fiche: LEA, version: etat.version }, AUTEUR)).toEqual({ etat: 'ok', data: { changements: [] } });
    expect(ecrit()).toEqual([]);
    etat.interne = true;
    expect(await enregistrerFicheApporteur(4, { fiche: { ...LEA, civilite: 'Mme' }, version: etat.version }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'Un apporteur interne : son identité est celle de son compte, modifiable dans la gestion des comptes.' });
    expect(ecrit()).toEqual([]);
  });
});

describe('🔴 le coût fixe mensuel : plus aucun calcul ne le lit', () => {
  const d: ActiviteCalcul = { id: 1, type: 'bail', dateSignature: '2026-05-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 0,
    primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 3, apporteurNom: 'Kin Immo', apporteurTaux: null, commissionSaisie: null, negociateurId: 1,
    negociateurLibelle: 'JB', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null, assurance: null, parking: false,
    vacanceJours: null, rattachement: 'rattache' };
  const ap = (cout: number): Apporteur => ({ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: cout }] });
  it('les montants dus sont ceux d’avant quand il valait 0 — et ne bougent pas s’il en restait un en base', () => {
    for (const cout of [0, 250]) {
      const ctx = { regles: [], apporteurs: [ap(cout)], retrocessions: [] };
      expect(sectionApporteurs([d], ctx, { annee: 2026, mois: null }, ['2026-05', '2026-06'])).toEqual([expect.objectContaining({ ca: 600, commissions: 60, net: 540, coutParEuro: 0.1 })]);
      expect(totauxApporteurs([d], [ap(cout)], '2026-10-24')[3]).toMatchObject({ ca: 600, commission: 60 });
    }
  });
});
