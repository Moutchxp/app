import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 14h00, point 3) — LES CONTACTS DU SYNDIC, PAR LA PORTE UNIQUE DE LA GESTION (enregistrerSyndic) : ajouter, modifier, retirer.
 * « Retirer ce contact » ne supprime JAMAIS ses mails ni son historique : le contact est marqué retiré (retire_le), ses affectations fermées (motif), et
 * le geste est JOURNALISÉ — une ligne à chaque copropriété où il était affecté, et une ligne au contact qui les nomme toutes. Aucun DELETE, aucune
 * écriture sur les mails, leurs rattachements ou leurs pièces.
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], existants: [] as Record<string, unknown>[], aff: [] as Record<string, unknown>[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) return { rows: [{ id: String(p[0]) }] };
  if (s.startsWith('SELECT nom, ville FROM gestion_syndic WHERE id = $1')) return { rows: [{ nom: 'CABINET _TEST', ville: 'Paris' }] };
  if (s.startsWith('SELECT id::text, parti_le::text AS parti_le, parti_le IS NOT NULL AS parti FROM gestion_syndic_contact')) return { rows: h.existants };
  if (s.startsWith('INSERT INTO gestion_syndic_contact (')) return { rows: [{ id: '90' }] };
  if (s.startsWith('SELECT a.contact_id::text AS contact, c.id::text AS copro')) return { rows: h.aff };
  if (s.startsWith('SELECT id::text, btrim(concat_ws(')) return { rows: (p[0] as number[]).map((id) => ({ id: String(id), nom: id === 7 ? 'Mme Léa DURAND' : `contact ${id}` })) };
  if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete WHERE id = $1')) {
    return { rows: [{ id: String(p[0]), cle: p[0] === '157' ? '80 rue de normandie' : '1 place raphael', libelle: p[0] === '157' ? '80 rue de Normandie' : '1 place Raphaël', cp: '92400', commune: 'Courbevoie' }] };
  }
  // sans la 506, la ligne d'une copropriété va à chacun de ses biens : un bien par copropriété
  if (s.startsWith('SELECT id::text, immeuble, adresse FROM gestion_annuaire_lot')) return { rows: [{ id: '1', immeuble: null, adresse: '80 rue de Normandie' }, { id: '2', immeuble: null, adresse: '1 place Raphaël' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: [] }) }));
import { enregistrerSyndic } from './syndicRepo';
import { ACTION_CONTACT, ACTION_CONTACT_RETIRE_FICHE, phraseRetraitContact } from './journalSyndicCopro';
import { validerSyndic } from './syndics';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const saisie = (contacts: Record<string, unknown>[]) => {
  const v = validerSyndic({ nom: 'CABINET _TEST', adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris', immeubles: [], contacts, confirmeDoublons: true, doublonsSyndicIgnores: [] });
  if (!v.ok) throw new Error(v.motif);
  return v.syndic;
};
const LEA = { id: 7, titre: 'Gestionnaire', prenom: 'Léa', nom: 'Durand', civilite: 'Mme', immeubles: [], coordonnees: [{ id: 70, sorte: 'email', libelle: 'Email direct', valeur: 'lea@test.invalid' }] };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(x.s));
const MAILS = /gestion_message|gestion_mail|message_bien|piece_jointe|gestion_piece/;
beforeEach(() => { h.sql = []; h.existants = []; h.aff = []; });

describe('retirer un contact : marqué, ses affectations fermées, au journal avec elles ; rien d’effacé, aucun mail touché', () => {
  it('Léa (affectée à deux copropriétés) retirée de la saisie : une ligne par copropriété, une ligne au contact qui les nomme ; puis les retraits', async () => {
    h.existants = [{ id: '7', parti: false, parti_le: null }];
    h.aff = [{ contact: '7', copro: '157', libelle: '80 rue de Normandie', cp: '92400', commune: 'Courbevoie' },
      { contact: '7', copro: '158', libelle: '1 place Raphaël', cp: '92400', commune: 'Courbevoie' }];
    expect(await enregistrerSyndic(54, saisie([]), AUTEUR)).toMatchObject({ ok: true });
    const journal = h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));
    const parCopro = journal.filter((x) => x.p.includes(ACTION_CONTACT.retire));
    expect(parCopro).toHaveLength(2);
    expect(parCopro.map((x) => String(x.p[5]))).toEqual([
      expect.stringMatching(/^Contact Mme Léa DURAND \(syndic CABINET _TEST \/ Paris\) retiré de la fiche du syndic : son affectation à la copropriété 80 rue de Normandie, 92400 Courbevoie est retirée — ses mails et son historique restent/),
      expect.stringContaining('1 place Raphaël, 92400 Courbevoie est retirée')]);
    const duContact = journal.find((x) => x.s.includes(`'${ACTION_CONTACT_RETIRE_FICHE}'`));
    expect(duContact?.p.slice(0, 3)).toEqual(['7', 'Mme Léa DURAND',
      phraseRetraitContact('Mme Léa DURAND', 'CABINET _TEST / Paris', ['80 rue de Normandie, 92400 Courbevoie', '1 place Raphaël, 92400 Courbevoie'], 'la fiche syndic')]);
    expect(String(duContact?.p[2])).toContain('ses mails et son historique restent');
    // le journal AVANT les retraits (les affectations sont lues en cours)
    const iJournal = h.sql.indexOf(duContact!);
    const iRetrait = h.sql.findIndex((x) => x.s.startsWith('UPDATE gestion_syndic_contact SET retire_le = now()'));
    expect(iJournal).toBeLessThan(iRetrait);
    expect(h.sql[iRetrait].p).toEqual([[7], AUTEUR.libelle]);
    expect(ecritures().some((x) => x.s.startsWith("UPDATE gestion_syndic_contact_copropriete SET retire_le = now(), retire_par_libelle = $2, retire_motif = 'contact retiré'"))).toBe(true);
    expect(ecritures().some((x) => /^(DELETE|TRUNCATE)\b/.test(x.s))).toBe(false);
    expect(ecritures().some((x) => MAILS.test(x.s))).toBe(false);
  });
  it('sans affectation en cours : la ligne du contact le dit (« aucune affectation en cours »), aucune ligne de copropriété', async () => {
    h.existants = [{ id: '7', parti: false, parti_le: null }];
    await enregistrerSyndic(54, saisie([]), AUTEUR);
    const journal = h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));
    expect(journal).toHaveLength(1);
    expect(String(journal[0].p[2])).toContain('aucune affectation en cours');
  });
  it('ajouter un contact (INSERT) et modifier Léa (UPDATE, coordonnée gardée par son id) : ni retrait ni ligne de retrait au journal', async () => {
    h.existants = [{ id: '7', parti: false, parti_le: null }];
    await enregistrerSyndic(54, saisie([{ ...LEA, nom: 'Durand-Martin' }, { id: null, titre: '', prenom: 'Anne', nom: '_TEST Neuve', civilite: null, immeubles: [], coordonnees: [] }]), AUTEUR);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_syndic_contact ('))).toBe(true);
    expect(ecritures().find((x) => x.s.startsWith('UPDATE gestion_syndic_contact SET titre'))?.p.slice(0, 4)).toEqual([7, 'Gestionnaire', 'Léa', 'Durand-Martin']);
    expect(ecritures().some((x) => x.s.startsWith('UPDATE gestion_syndic_contact SET retire_le'))).toBe(false);
    expect(h.sql.some((x) => x.s.includes(ACTION_CONTACT_RETIRE_FICHE))).toBe(false);
    expect(ecritures().some((x) => /^(DELETE|TRUNCATE)\b/.test(x.s) || MAILS.test(x.s))).toBe(false);
  });
});
