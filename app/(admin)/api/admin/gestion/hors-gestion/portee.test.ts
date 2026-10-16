import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT TRACE-ONE-SHOT (migration 342) — « INTERNE » ET « HORS GESTION » ENREGISTRENT LA PORTÉE CHOISIE ══════
 *
 * Décision d'Arno (11/10/2026) : « À partir de maintenant, les boutons “Interne” et “Hors gestion” enregistrent la
 * portée choisie (“ce mail uniquement” ou “toute la conversation”). » Et pour « ce mail uniquement », la photo du suivi
 * de fond JUSTE AVANT le geste.
 *
 * Ce qui est éprouvé ici, route par route, dépôts simulés :
 *   ① la portée reçue arrive jusqu'au dépôt ;
 *   ② « ce mail uniquement » prend la photo du fond, et la prend AVANT toute écriture ;
 *   ③ une portée de fond ne prend pas de photo ; un appelant d'avant ce lot (sans portée) écrit comme avant.
 */

const ordre: string[] = [];
const appels: Record<string, unknown[]> = {};
const noter = (nom: string) => (o: unknown) => { ordre.push(nom); (appels[nom] ??= []).push(o); };

vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
/* 🔴 LOT GESTION-FENETRES-SUIVI — la conversation n'a pas de fenêtre lisible ici : la route garde sa découpe d'avant. */
vi.mock('../../../../../lib/gestion/periodeRepo', () => ({
  fenetresDuMail: async () => null, poserClassement: async () => ({ ok: true, projetes: 0 }), fermerFenetresInterne: async () => 0,
}));
vi.mock('../../../../../lib/gestion/traceOneShotRepo', () => ({
  photoDuFondEnBase: async (m: number) => { noter('photo')(m); return { fenetre: null, interneEchange: false, le: 'T' }; },
}));
vi.mock('../../../../../lib/gestion/horsGestionRepo', () => ({
  marquerHorsGestion: async (o: unknown) => { noter('marquerHorsGestion')(o); return { ok: true, nb: 1 }; },
  annulerHorsGestion: async () => ({ ok: true, nb: 1 }),
  historiqueHorsGestion: async () => [], lireHorsGestion: async () => new Map(),
}));
vi.mock('../../../../../lib/gestion/schema', () => ({
  horsGestionDisponible: async () => true, interneDisponible: async () => true, interneDuMessageDisponible: async () => true,
}));
vi.mock('../../../../../lib/gestion/interneRepo', () => ({
  marquerInterne: async (o: unknown) => { noter('marquerInterne')(o); return { ok: true, nb: 1 }; },
  annulerInterne: async (o: unknown) => { noter('annulerInterne')(o); return { ok: true, nb: 1 }; },
  lireInterne: async () => new Map(),
  biensADetacher: async () => [], detacherBiensApresInterne: async () => [], remettreBiensDetaches: async () => 0,
  mailsInternesParmi: async () => [], remettreInterneApresAnnulation: async () => 0,
  retirerBiensApresAnnulationLevee: async () => 0,
}));
vi.mock('../../../../../lib/gestion/interneMessageRepo', () => ({
  marquerInterneDesMessages: async (o: unknown) => { noter('marquerInterneDesMessages')(o); return { ok: true, nb: 1 }; },
  annulerInterneDesMessages: async (o: unknown) => { noter('annulerInterneDesMessages')(o); return { ok: true, nb: 1 }; },
  lireInterneDesMessages: async () => new Map(),
  /* 🔴 LOT RATTACHEMENT-CONVERSATION — « la suite » posée sur un mail du milieu protège d'abord les mails plus anciens. */
  declarerNonInterneDesMessages: async (o: unknown) => { noter('declarerNonInterneDesMessages')(o); return { ok: true, nb: 1 }; },
}));

const { POST: posterHorsGestion } = await import('./route');
const { POST: posterInterne, DELETE: retirerInterne } = await import('../interne/route');

const requete = (corps: unknown) => new Request('http://localhost/x', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});

beforeEach(() => { ordre.length = 0; for (const k of Object.keys(appels)) delete appels[k]; });

describe('« Hors gestion » enregistre la portée', () => {
  it('🔴 « ce mail uniquement » : la portée arrive au dépôt, avec la photo prise AVANT l’écriture', async () => {
    const r = await posterHorsGestion(requete({ messageIds: [57235], portee: 'mail' }));
    expect(r.status).toBe(200);
    expect(ordre).toEqual(['photo', 'marquerHorsGestion']);
    expect(appels.photo).toEqual([57235]);
    expect(appels.marquerHorsGestion?.[0]).toMatchObject({
      messageIds: [57235], portee: 'mail', fondAvant: { fenetre: null, interneEchange: false },
    });
  });

  it('« toute la conversation » : la portée est enregistrée, sans photo', async () => {
    await posterHorsGestion(requete({ messageIds: [1, 2, 3], portee: 'conversation' }));
    expect(appels.photo).toBeUndefined();
    expect(appels.marquerHorsGestion?.[0]).toMatchObject({ portee: 'conversation' });
    expect(appels.marquerHorsGestion?.[0]).not.toHaveProperty('fondAvant');
  });

  it('⚠️ un appelant d’avant ce lot (sans portée) : rien de plus n’est transmis', async () => {
    await posterHorsGestion(requete({ messageIds: [7] }));
    expect(appels.photo).toBeUndefined();
    expect(appels.marquerHorsGestion?.[0]).not.toHaveProperty('portee');
  });

  it('⚠️ une portée inconnue est ignorée, jamais devinée', async () => {
    await posterHorsGestion(requete({ messageIds: [7], portee: 'tout' }));
    expect(appels.marquerHorsGestion?.[0]).not.toHaveProperty('portee');
  });
});

describe('« Interne » enregistre la portée', () => {
  /**
   * 🔴🔴 LOT INTERNE-CE-MAIL-UNIQUEMENT (11/10/2026) — « ce mail uniquement » NE POSE PLUS LA MARQUE D'ÉCHANGE : elle
   * servait de repli à tous les mails du fil, qui basculaient en Interne. Seul ce mail est marqué (décision d'Arno).
   */
  it('🔴 « ce mail uniquement » : photo, puis portée et photo sur la marque du mail — et AUCUNE marque d’échange', async () => {
    const r = await posterInterne(requete({ filIds: [36594], messageId: 57300, mails: [57299, 57300, 57301], choix: 'mail' }));
    expect(r.status).toBe(200);
    expect(ordre).toEqual(['photo', 'marquerInterneDesMessages']);
    expect(appels.marquerInterne).toBeUndefined();
    expect(appels.marquerInterneDesMessages?.[0]).toMatchObject({
      messageIds: [57300], portee: 'mail', fondAvant: { fenetre: null },
    });
  });

  it('« ce mail et la conversation à venir » / « toute la conversation » : portée enregistrée, sans photo', async () => {
    await posterInterne(requete({ filIds: [36594], messageId: 57300, mails: [57299, 57300, 57301], choix: 'suite' }));
    expect(appels.photo).toBeUndefined();
    expect(appels.marquerInterneDesMessages?.[0]).toMatchObject({ messageIds: [57300, 57301], portee: 'suite' });
    await posterInterne(requete({ filIds: [36594], messageId: 57300, mails: [57299, 57300, 57301], choix: 'conversation' }));
    expect(appels.marquerInterneDesMessages?.[1]).toMatchObject({ messageIds: [57299, 57300, 57301], portee: 'conversation' });
    expect(appels.marquerInterneDesMessages?.[1]).not.toHaveProperty('fondAvant');
  });
});

describe('🔴🔴 LOT INTERNE-CE-MAIL-UNIQUEMENT — la marque d’échange ne bouge qu’avec les portées de fond', () => {
  it('« la suite » et « toute la conversation » posent toujours la marque d’échange (inchangé)', async () => {
    await posterInterne(requete({ filIds: [9], messageId: 2, mails: [1, 2, 3], choix: 'suite' }));
    await posterInterne(requete({ filIds: [9], messageId: 2, mails: [1, 2, 3], choix: 'conversation' }));
    expect(appels.marquerInterne).toHaveLength(2);
  });
  it('la case du bandeau (sans mail désigné) garde son sens : l’échange entier', async () => {
    await posterInterne(requete({ filIds: [9] }));
    expect(appels.marquerInterne).toHaveLength(1);
  });
  it('🔴 retirer « Interne » de ce mail seul ne retire pas la marque d’échange ; « toute la conversation » si', async () => {
    await retirerInterne(new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filIds: [9], messageId: 2, mails: [1, 2, 3], choix: 'mail' }) }));
    expect(appels.annulerInterne).toBeUndefined();
    expect(appels.annulerInterneDesMessages?.[0]).toMatchObject({ messageIds: [2] });
    await retirerInterne(new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filIds: [9], messageId: 2, mails: [1, 2, 3], choix: 'conversation' }) }));
    expect(appels.annulerInterne).toHaveLength(1);
  });
  it('🔴 « Hors gestion » ce mail uniquement ne marque que ce mail (aucune marque d’échange n’existe pour lui)', async () => {
    await posterHorsGestion(requete({ messageIds: [2], portee: 'mail' }));
    expect(appels.marquerHorsGestion?.[0]).toMatchObject({ messageIds: [2], portee: 'mail' });
    expect(appels.marquerInterne).toBeUndefined();
  });
});
