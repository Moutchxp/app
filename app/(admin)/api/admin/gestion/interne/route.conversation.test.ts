import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interneDuMail, mailsAnterieursAProteger } from '../../../../../lib/gestion/interneDuMail';

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-CONVERSATION (16/10/2026) — « INTERNE » SUR UN MAIL DU MILIEU NE REMONTE PAS DANS LE PASSÉ ══
 *
 * LE CAS EXACT DU DÉFAUT : conversation de quatre mails, tous « À classer », aucune marque. « Interne » est posé sur le
 * 3ᵉ mail avec la portée par défaut du panneau (« Ce mail + futurs échanges »). Avant ce lot, la marque d'échange
 * posée par la route servait de REPLI aux mails 1 et 2 (aucune ligne par mail) : toute la conversation passait en
 * Interne. La base est SIMULÉE en mémoire, avec la sémantique des dépôts (vivantes, nées retirées, `NOT EXISTS`) ; le
 * statut est relu par la VRAIE règle `interneDuMail`.
 */
const base = vi.hoisted(() => ({
  filMarque: false,
  lignes: new Map<number, { vivante: boolean }[]>(),
  ordre: [] as string[],
}));

vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
vi.mock('../../../../../lib/gestion/schema', () => ({ interneDisponible: async () => true, interneDuMessageDisponible: async () => true }));
/* 🔴 LOT GESTION-FENETRES-SUIVI — la conversation n'a pas de fenêtre lisible ici : la route garde sa découpe d'avant. */
vi.mock('../../../../../lib/gestion/periodeRepo', () => ({
  fenetresDuMail: async () => null, poserClassement: async () => ({ ok: true, projetes: 0 }), fermerFenetresInterne: async () => 0,
}));
vi.mock('../../../../../lib/gestion/traceOneShotRepo', () => ({ photoDuFondEnBase: async () => null }));
vi.mock('../../../../../lib/gestion/interneRepo', () => ({
  lireInterne: async () => (base.filMarque ? new Map([[1, {}]]) : new Map()),
  marquerInterne: async () => { base.ordre.push('echange'); base.filMarque = true; return { ok: true, nb: 1 }; },
  annulerInterne: async () => { base.filMarque = false; return { ok: true, nb: 1 }; },
  biensADetacher: async () => [], detacherBiensApresInterne: async () => [], remettreBiensDetaches: async () => 0,
  mailsInternesParmi: async () => [], remettreInterneApresAnnulation: async () => 0, retirerBiensApresAnnulationLevee: async () => 0,
}));
vi.mock('../../../../../lib/gestion/interneMessageRepo', () => ({
  lireInterneDesMessages: async () => new Map(),
  marquerInterneDesMessages: async ({ messageIds }: { messageIds: number[] }) => {
    for (const m of messageIds) base.lignes.set(m, [...(base.lignes.get(m) ?? []), { vivante: true }]);
    return { ok: true, nb: messageIds.length };
  },
  annulerInterneDesMessages: async ({ messageIds }: { messageIds: number[] }) => {
    for (const m of messageIds) for (const l of base.lignes.get(m) ?? []) l.vivante = false;
    return { ok: true, nb: messageIds.length };
  },
  declarerNonInterneDesMessages: async ({ messageIds }: { messageIds: number[] }) => {
    base.ordre.push('anterieurs');
    let nb = 0;
    for (const m of messageIds) if (!base.lignes.has(m)) { base.lignes.set(m, [{ vivante: false }]); nb += 1; }
    return { ok: true, nb };
  },
}));

import { POST, DELETE } from './route';

const MAILS = [101, 102, 103, 104]; // ordre chronologique
const statut = (m: number) => interneDuMail({
  marqueDuMailVivante: (base.lignes.get(m) ?? []).some((l) => l.vivante),
  marqueDuMailConnue: base.lignes.has(m),
  marqueDeLEchange: base.filMarque,
});
const appel = (verbe: typeof POST, corps: object) => verbe(new Request('http://x/api/admin/gestion/interne', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
}));

beforeEach(() => { base.filMarque = false; base.lignes.clear(); base.ordre.length = 0; });

describe('🔴🔴 le cas exact du défaut : « Interne » sur le 3ᵉ mail d’une conversation « À classer »', () => {
  it('🔴🔴 « Ce mail + futurs échanges » : les mails 1 et 2 restent « À classer », 3 et 4 passent en Interne', async () => {
    const r = await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    expect(r.status).toBe(200);
    expect(MAILS.map(statut)).toEqual([false, false, true, true]);
  });

  it('🔴 et une réponse qui arrive ensuite (aucune ligne propre) hérite bien d’Interne, par la marque d’échange', async () => {
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    expect(statut(105)).toBe(true);
  });

  it('🔴 les anciens mails sont protégés AVANT la pose de la marque d’échange (aucun instant ne les montre en Interne)', async () => {
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    expect(base.ordre).toEqual(['anterieurs', 'echange']);
  });

  it('🔴 « Toute la conversation » : tous les mails, anciens compris — c’est ce qu’elle annonce', async () => {
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'conversation' });
    expect(MAILS.map(statut)).toEqual([true, true, true, true]);
  });

  it('🔴 « One shot » : ce mail seul', async () => {
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'mail' });
    expect(MAILS.map(statut)).toEqual([false, false, true, false]);
    expect(statut(105)).toBe(false);
  });

  it('🔴 premier mail (principe A) : toute la conversation et la suite', async () => {
    await appel(POST, { filIds: [1], messageId: 101, mails: MAILS, choix: 'suite' });
    expect(MAILS.map(statut)).toEqual([true, true, true, true]);
    expect(statut(105)).toBe(true);
  });

  it('⚠️ « Annuler » juste après : la conversation revient exactement « À classer »', async () => {
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    await appel(DELETE, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    expect([...MAILS, 105].map(statut)).toEqual([false, false, false, false, false]);
  });
});

describe('🔴 conversation qui a DÉJÀ un suivi de fond « Interne » (principe B) : rien ne change', () => {
  it('⚠️ marque d’échange déjà vivante : les anciens mails, déjà Interne par le repli, ne sont pas touchés', async () => {
    base.filMarque = true;
    await appel(POST, { filIds: [1], messageId: 103, mails: MAILS, choix: 'suite' });
    expect(base.ordre).not.toContain('anterieurs');
    expect(MAILS.map(statut)).toEqual([true, true, true, true]);
  });
});

describe('la règle pure', () => {
  it('ne protège que pour « suite », hors premier mail, et sans marque d’échange déjà vivante', () => {
    expect(mailsAnterieursAProteger({ choix: 'suite', mails: MAILS, messageId: 103, echangeVivantAvant: false })).toEqual([101, 102]);
    expect(mailsAnterieursAProteger({ choix: 'suite', mails: MAILS, messageId: 101, echangeVivantAvant: false })).toEqual([]);
    expect(mailsAnterieursAProteger({ choix: 'suite', mails: MAILS, messageId: 103, echangeVivantAvant: true })).toEqual([]);
    expect(mailsAnterieursAProteger({ choix: 'conversation', mails: MAILS, messageId: 103, echangeVivantAvant: false })).toEqual([]);
    expect(mailsAnterieursAProteger({ choix: 'mail', mails: MAILS, messageId: 103, echangeVivantAvant: false })).toEqual([]);
    expect(mailsAnterieursAProteger({ choix: 'suite', mails: MAILS, messageId: 999, echangeVivantAvant: false })).toEqual([]);
    expect(mailsAnterieursAProteger({ choix: 'suite', mails: MAILS, messageId: null, echangeVivantAvant: false })).toEqual([]);
  });
});
