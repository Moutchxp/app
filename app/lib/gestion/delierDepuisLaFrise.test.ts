import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT FRISE-CORRECTION-MANUELLE — « Délier MNG-… de cet événement » et « Relier à nouveau », depuis la frise.
 *
 * Arno : « les étapes de la référence quittent la frise, les mails restent dans l'historique du bien », journalisé, réversible.
 * Délier depuis la frise ne retire QUE le lien et les affectations posées par le classement Monga : aucun bien, aucune
 * personne n'est touché (historique inaltérable), le nom n'est pas remis. Relier à nouveau ne renomme pas.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');
const appels: { sql: string; params: unknown[] }[] = [];
const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = plat(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_monga_lien WHERE reference = $1 AND retire_le IS NULL')) {
    return { rows: [{ id: '5', evenement_id: '37', nom_avant: 'Ancien nom' }] };
  }
  if (s.includes('FROM gestion_affectation WHERE evenement_id = $1 AND actif AND message_id IS NOT NULL')) return { rows: [{ message_id: '900' }] };
  if (s.includes('SELECT count(*)::int AS n FROM gestion_affectation')) return { rows: [{ n: 2 }] };
  if (s.includes('SELECT objet, etat FROM gestion_evenement')) return { rows: [{ objet: 'Mon titre', etat: 'a_traiter' }] };
  if (s.includes('FROM gestion_monga_mail mm JOIN gestion_message m ON m.id = mm.message_id WHERE mm.reference')) {
    return { rows: [{ libelle: 'Libellé Monga', adresse: null, lien_mission: null }] };
  }
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a),
  withTransaction: (fn: (q: unknown) => unknown) => fn((...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a)),
}));
const gestes = { modifierEvenement: vi.fn(async () => ({ ok: true })), remettreMessage: vi.fn(async () => ({ ok: true })) };
vi.mock('./gestes', () => ({
  modifierEvenement: (...a: unknown[]) => (gestes.modifierEvenement as (...x: unknown[]) => unknown)(...a),
  remettreMessage: (...a: unknown[]) => (gestes.remettreMessage as (...x: unknown[]) => unknown)(...a),
  deplacerMessage: vi.fn(), deplacerMessageVersNouveau: vi.fn(),
}));
const changerStatut = vi.fn(async () => ({ ok: true }));
vi.mock('./rattachementRepo', () => ({
  changerStatut: (...a: unknown[]) => (changerStatut as (...x: unknown[]) => unknown)(...a),
  rattacher: vi.fn(), chargerLibelles: vi.fn(async () => ({})), examinerFilsPrecis: vi.fn(async () => undefined), COMPTES_VIDES: {},
}));
vi.mock('./schema', () => ({ mongaDisponible: async () => true, evenementQualifieDisponible: async () => false }));
vi.mock('./mongaRepo', () => ({
  lireEtGarderUnMail: vi.fn(), mailsDeLaReference: async () => [], mongaDuMail: vi.fn(async () => null), SQL_EST_MAIL_MONGA: 'true',
}));
vi.mock('./contactExterneRepo', () => ({ personnesDesBiens: vi.fn(async () => []), poserInterventions: vi.fn() }));
vi.mock('./mongaEtapeRepo', () => ({ enregistrerEtapesDuMail: vi.fn(), poserOuvertureDeRepli: vi.fn() }));

import { ACTION_JOURNAL_LIEN_RETIRE, delierLaReference, relierLaReference } from './mongaClassement';

const ARNO = { id: 4, libelle: 'Arnaud' };
const journaux = () => appels.filter((a) => a.sql.includes('INSERT INTO gestion_journal'));

beforeEach(() => { appels.length = 0; queryMock.mockClear(); gestes.modifierEvenement.mockClear(); gestes.remettreMessage.mockClear(); changerStatut.mockClear(); });

describe('délier depuis la frise', () => {
  it('retire le lien et les affectations du classement Monga ; ne touche ni aux biens, ni aux personnes, ni au nom ; journalisé', async () => {
    const r = await delierLaReference({ reference: 'MNG-25126', auteur: ARNO, depuisLaFrise: true, motif: 'délié depuis la frise' });
    expect(r).toMatchObject({ ok: true, mailsRemis: 1, liensRetires: 0, nomRemis: null, examensRepris: 0 });
    expect(gestes.remettreMessage).toHaveBeenCalledWith(900, ARNO);
    expect(changerStatut).not.toHaveBeenCalled();
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
    expect(appels.some((a) => a.sql.includes('FROM gestion_rattachement WHERE'))).toBe(false);
    expect(appels.some((a) => a.sql.includes('UPDATE gestion_rattachement_examen'))).toBe(false);
    const retrait = appels.find((a) => a.sql.includes('UPDATE gestion_monga_lien'));
    expect(retrait?.params).toEqual(['5', 4, 'Arnaud', 'délié depuis la frise']);
    expect(journaux()).toHaveLength(1);
    expect(journaux()[0].params).toEqual(expect.arrayContaining(['37', ACTION_JOURNAL_LIEN_RETIRE, 'MNG-25126', 4, 'Arnaud']));
    expect(String(journaux()[0].params[3])).toContain('restent dans l’historique du bien');
  });

  it('l’« Annuler » de l’encart (sans l’option) garde son comportement complet : nom remis, liens défaits', async () => {
    await delierLaReference({ reference: 'MNG-25126', auteur: ARNO });
    expect(gestes.modifierEvenement).toHaveBeenCalled();
    expect(appels.some((a) => a.sql.includes('FROM gestion_rattachement WHERE'))).toBe(true);
    expect(journaux()).toHaveLength(0);
  });
});

describe('relier à nouveau depuis la frise', () => {
  it('pose le lien SANS renommer l’événement (rien n’a été annoncé), et le journalise', async () => {
    const r = await relierLaReference({ reference: 'MNG-25126', evenementId: '37', auteur: ARNO, depuisLaFrise: true });
    expect(r).toMatchObject({ ok: true, renomme: null });
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
    const lien = appels.find((a) => a.sql.includes('INSERT INTO gestion_monga_lien'));
    expect(lien?.params[5]).toBeNull();     // nom_avant : aucun renommage
    expect(journaux()).toHaveLength(1);
    expect(journaux()[0].params).toEqual(expect.arrayContaining(['37', 'lien_monga', 'MNG-25126']));
  });

  it('le clic « Relier » de l’encart (sans l’option) garde la règle du nom annoncée', async () => {
    await relierLaReference({ reference: 'MNG-25126', evenementId: '37', auteur: ARNO });
    expect(gestes.modifierEvenement).toHaveBeenCalled();
  });
});
