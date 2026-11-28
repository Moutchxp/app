import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 14h00, point 2 ; décisions « 1A » et « 2A ») — LES COORDONNÉES DU CABINET D'UN SYNDIC, EN LISTE (524), ET « CE QUI CHANGE ».
 * Téléphones et e-mails illimités, chacun avec son libellé (« Standard », « Contact » par défaut) ; ajouter, modifier, retirer — un retrait marque la ligne
 * (retire_le), il ne l'efface jamais ; les colonnes d'avant (telephone, telephone_2, email) restent tenues à jour ; une adresse incomplète est refusée ;
 * sans la 524, au-delà de deux téléphones ou d'un e-mail : refus AVANT toute écriture. Et, avant « Enregistrer », la liste de ce qui change.
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], table: true, existantes: [] as { id: string }[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.includes("to_regclass('public.gestion_syndic_coordonnee_cabinet')")) return { rows: [{ ok: h.table }] };
  if (s.startsWith('SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) return { rows: [{ id: String(p[0]) }] };
  if (s.startsWith('SELECT nom, ville FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) return { rows: [{ nom: 'CABINET _TEST', ville: 'Paris' }] };
  if (s.startsWith('SELECT id::text FROM gestion_syndic_coordonnee_cabinet WHERE syndic_id = $1 AND retire_le IS NULL FOR UPDATE')) return { rows: h.existantes };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: [] }) }));
vi.mock('./journalSyndicCopro', () => ({ journaliserLienSyndic: async () => {} }));
import {
  changementsSyndic, coordonneesDuCabinet, MOTIF_ADRESSE_INCOMPLETE, validerSyndic, versFormulaire, versSaisie, type FicheSyndic,
} from './syndics';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ADRESSE = { adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris' };
const valide = (b: Record<string, unknown>) => {
  const v = validerSyndic({ nom: 'CABINET _TEST', ...ADRESSE, immeubles: [], confirmeDoublons: true, doublonsSyndicIgnores: [], ...b });
  if (!v.ok) throw new Error(v.motif);
  return v.syndic;
};
const FICHE = (cabinet?: FicheSyndic['coordonneesCabinet']): FicheSyndic => ({
  id: 54, nom: 'CABINET _TEST', ...ADRESSE, telephone: '0140000000', telephone2: null, email: 'syndic@test.invalid', note: null,
  contacts: [], coproprietes: [], ...(cabinet !== undefined ? { coordonneesCabinet: cabinet } : {}),
} as unknown as FicheSyndic);
const repo = async () => { vi.resetModules(); return import('./syndicRepo'); };
beforeEach(() => { h.sql = []; h.table = true; h.existantes = []; });

describe('la saisie (serveur) : la liste, ses libellés, ses formats, les colonnes d’avant qui en sont déduites', () => {
  it('un 3e téléphone et un 2e e-mail : gardés dans l’ordre ; libellé vide ⇒ « Standard » / « Contact » ; téléphone, second téléphone et e-mail déduits', () => {
    const s = valide({ coordonneesCabinet: [
      { id: 1, sorte: 'telephone', libelle: '', valeur: '0140000000' }, { id: 2, sorte: 'telephone', libelle: 'Ligne directe', valeur: '0140000001' },
      { id: null, sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' },
      { id: 3, sorte: 'email', libelle: '', valeur: 'syndic@test.invalid' }, { id: null, sorte: 'email', libelle: 'Email service', valeur: 'service@test.invalid' }] });
    expect(s.coordonneesCabinet?.map((k) => [k.sorte, k.libelle, k.valeur])).toEqual([
      ['telephone', 'Standard', '0140000000'], ['telephone', 'Ligne directe', '0140000001'], ['telephone', 'Portable', '0611223344'],
      ['email', 'Contact', 'syndic@test.invalid'], ['email', 'Email service', 'service@test.invalid']]);
    expect([s.telephone, s.telephone2, s.email]).toEqual(['0140000000', '0140000001', 'syndic@test.invalid']);
  });
  it('un e-mail illisible dans la liste est refusé', () => {
    const v = validerSyndic({ nom: 'CABINET _TEST', ...ADRESSE, immeubles: [], coordonneesCabinet: [{ id: null, sorte: 'email', libelle: '', valeur: 'pas-un-mail' }] });
    expect(v).toEqual({ ok: false, motif: 'E-mail du cabinet illisible : « pas-un-mail ».' });
  });
  it('une adresse incomplète (rue, code postal à 5 chiffres, ville) est refusée', () => {
    for (const manque of [{ adresse: '' }, { codePostal: '7500' }, { ville: '' }]) {
      expect(validerSyndic({ nom: 'CABINET _TEST', ...ADRESSE, ...manque, immeubles: [], coordonneesCabinet: [] })).toEqual({ ok: false, motif: MOTIF_ADRESSE_INCOMPLETE });
    }
  });
  it('la fenêtre : toujours au moins un champ de téléphone et un d’e-mail (vides, rien ne s’enregistre ni ne « change »)', () => {
    const f = versFormulaire(FICHE([{ id: 9, sorte: 'email', libelle: 'Contact', valeur: 'x@test.invalid' }]));
    expect(f.cabinet?.map((k) => [k.sorte, k.valeur])).toEqual([['telephone', ''], ['email', 'x@test.invalid']]);
    expect(versSaisie(f).coordonneesCabinet).toEqual([{ id: 9, sorte: 'email', libelle: 'Contact', valeur: 'x@test.invalid' }]);
    expect(changementsSyndic(f, f)).toEqual([]);
  });
  it('la lecture : la liste quand elle existe, sinon les colonnes d’avant avec les libellés par défaut', () => {
    expect(coordonneesDuCabinet(FICHE()).map((k) => [k.sorte, k.libelle, k.valeur])).toEqual([['telephone', 'Standard', '0140000000'], ['email', 'Contact', 'syndic@test.invalid']]);
    expect(coordonneesDuCabinet(FICHE([{ id: 9, sorte: 'email', libelle: 'Email direct', valeur: 'x@test.invalid' }]))).toEqual([{ id: 9, sorte: 'email', libelle: 'Email direct', valeur: 'x@test.invalid' }]);
  });
});

describe('🔴 « 2A » — « Ce qui change », avant « Enregistrer »', () => {
  const cabinet = [{ id: 1, sorte: 'telephone' as const, libelle: 'Standard', valeur: '0140000000' }, { id: 2, sorte: 'email' as const, libelle: 'Contact', valeur: 'syndic@test.invalid' }];
  it('rien de changé : aucune ligne', () => {
    const f = versFormulaire(FICHE(cabinet));
    expect(changementsSyndic(f, f)).toEqual([]);
  });
  it('ajouter un 3e téléphone et un 2e e-mail, changer un libellé, retirer un numéro, changer l’adresse et la note : chaque changement, en mots', () => {
    const avant = versFormulaire(FICHE([...cabinet, { id: 3, sorte: 'telephone', libelle: 'Standard', valeur: '0140000001' }]));
    const cab = avant.cabinet ?? [];
    const tel = cab.find((k) => k.id === 1)!; const mail = cab.find((k) => k.id === 2)!;
    const apres = { ...avant, adresse: '2 rue _TEST', note: 'Accueil le matin',
      cabinet: [{ ...tel, choix: 'Ligne directe' }, { ...tel, id: null, cle: 'n1', choix: 'Portable', valeur: '06 11 22 33 44' }, mail,
        { ...mail, id: null, cle: 'n2', choix: 'Email service', valeur: 'service@test.invalid' }] };
    expect(changementsSyndic(avant, apres)).toEqual([
      'Adresse : « 1 rue _TEST, 75001 Paris » → « 2 rue _TEST, 75001 Paris »',
      'Note ajoutée : « Accueil le matin »',
      'Téléphone du cabinet modifié : 01 40 00 00 00 (Standard) → 01 40 00 00 00 (Ligne directe)',
      'Téléphone du cabinet ajouté : 06 11 22 33 44 (Portable)',
      'E-mail du cabinet ajouté : service@test.invalid (Email service)',
      'Téléphone du cabinet retiré : 01 40 00 00 01 (Standard)',
    ]);
  });
});

describe('l’écriture (enregistrerSyndic, la porte unique de la Gestion) : ajout, modification, RETRAIT jamais effacé', () => {
  it('avec la 524 : la ligne gardée est mise à jour, la neuve insérée, l’absente RETIRÉE (retire_le) ; aucun DELETE ; colonnes d’avant tenues à jour', async () => {
    h.existantes = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const { enregistrerSyndic } = await repo();
    const r = await enregistrerSyndic(54, valide({ coordonneesCabinet: [
      { id: 1, sorte: 'telephone', libelle: 'Standard', valeur: '0140000009' }, { id: null, sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' },
      { id: 2, sorte: 'email', libelle: 'Contact', valeur: 'syndic@test.invalid' }] }), AUTEUR);
    expect(r).toMatchObject({ ok: true });
    const cab = h.sql.filter((x) => x.s.includes('gestion_syndic_coordonnee_cabinet') && !x.s.startsWith('SELECT'));
    expect(cab.map((x) => x.s.split(' ').slice(0, 2).join(' '))).toEqual(['UPDATE gestion_syndic_coordonnee_cabinet', 'INSERT INTO', 'UPDATE gestion_syndic_coordonnee_cabinet', 'UPDATE gestion_syndic_coordonnee_cabinet']);
    expect(cab[0].p).toEqual([1, 'telephone', 'Standard', '0140000009', 0]);
    expect(cab[1].p).toEqual([54, 'telephone', 'Portable', '0611223344', 1, AUTEUR.libelle]);
    expect(cab[3].s).toContain('SET retire_le = now()');
    expect(cab[3].p).toEqual([[3], AUTEUR.libelle]);
    expect(h.sql.some((x) => /\bDELETE\b/.test(x.s) && x.s.includes('coordonnee_cabinet'))).toBe(false);
    const maj = h.sql.find((x) => x.s.startsWith('UPDATE gestion_syndic SET'));
    expect(maj?.p).toEqual(expect.arrayContaining(['0140000009', '0611223344', 'syndic@test.invalid']));
  });
  it('sans la 524 : trois téléphones ⇒ REFUS, et rien n’est écrit', async () => {
    h.table = false;
    const { enregistrerSyndic } = await repo();
    const r = await enregistrerSyndic(54, valide({ coordonneesCabinet: ['0140000000', '0140000001', '0140000002'].map((valeur) => ({ id: null, sorte: 'telephone', libelle: '', valeur })) }), AUTEUR);
    expect(r).toEqual({ ok: false, motif: 'Plus de deux téléphones ou d’un e-mail pour le cabinet : la base doit d’abord être mise à jour (migration 524).' });
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)\b/.test(x.s))).toBe(false);
  });
  it('sans la 524 : deux téléphones et un e-mail passent par les colonnes d’avant, comme avant', async () => {
    h.table = false;
    const { enregistrerSyndic } = await repo();
    const r = await enregistrerSyndic(54, valide({ coordonneesCabinet: [{ id: null, sorte: 'telephone', libelle: '', valeur: '0140000000' }, { id: null, sorte: 'email', libelle: '', valeur: 'a@test.invalid' }] }), AUTEUR);
    expect(r).toMatchObject({ ok: true });
    expect(h.sql.some((x) => x.s.includes('gestion_syndic_coordonnee_cabinet') && !x.s.includes('to_regclass'))).toBe(false);
  });
  it('le formulaire envoie la liste (versSaisie) : ce que la fenêtre écrit est ce que le serveur reçoit', () => {
    const f = versFormulaire(FICHE([{ id: 1, sorte: 'telephone', libelle: 'Standard', valeur: '0140000000' }]));
    expect(versSaisie(f).coordonneesCabinet).toEqual([{ id: 1, sorte: 'telephone', libelle: 'Standard', valeur: '0140000000' }]);
  });
});

describe('🔴 « Ce qui change » des contacts (Arno, 28/11/2026, 14h00, point 3)', () => {
  const avecContact = (immeubles: string[]) => versFormulaire({ ...FICHE(), coproprietes: [
    { id: 1, cle: '41 rue x', libelle: '41 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-01-01', lots: [] },
    { id: 2, cle: '42 rue x', libelle: '42 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-01-01', lots: [] }],
    contacts: [{ id: 91, titre: null, prenom: 'Essai', nom: '_TEST Contact', civilite: null, tousImmeubles: false, immeubles, coordonnees: [] }] } as unknown as FicheSyndic);
  it('affecté / plus affecté : dit copropriété par copropriété, sans « Contact modifié » quand rien d’autre ne change', () => {
    const avant = avecContact(['41 rue x']);
    const apres = { ...avant, contacts: avant.contacts.map((c) => ({ ...c, immeubles: ['42 rue x'] })) };
    expect(changementsSyndic(avant, apres)).toEqual(['Contact Essai _TEST CONTACT affecté à 42 rue X', 'Contact Essai _TEST CONTACT n’est plus affecté à 41 rue X']);
  });
  it('retiré de la fiche : avec ses affectations, qui seront retirées', () => {
    const avant = avecContact(['41 rue x', '42 rue x']);
    expect(changementsSyndic(avant, { ...avant, contacts: [] })).toEqual(['Contact retiré de la fiche : Essai _TEST CONTACT (affecté à 41 rue X, 42 rue X : ces affectations seront retirées)']);
  });
});
