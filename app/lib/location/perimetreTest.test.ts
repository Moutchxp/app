import { describe, expect, it } from 'vitest';
import { avecPerimetreTest, filtrerPourTest, horsPerimetre, perimetreCourant, type PerimetreTest } from './perimetreTest';
import { avecVerrouTest, ENVOIS_FACTICES, transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { avecVerrouAgendaTest } from '../gestion/agendaSynchro';
import type { PorteAgenda } from '../gestion/agendaGoogle';
import { horsTest, rdvDansDeuxMinutes } from './preavisTest';

/**
 * 🔴🔴 Arno (14/11/2026, 473) — LE PRÉAVIS DE TEST : AUCUN MAIL NE PEUT PARTIR AILLEURS QU'À L'ADRESSE DE SON CRÉATEUR. Partenaires (ADHOC,
 * MONGA), clients, collègues, gestion@ : retirés ; plus personne : rien ne part ; objet « [TEST] ». L'agenda : celui du créateur seul.
 */
const P: PerimetreTest = { testId: 7, createurEmail: 'a.jorel@sansvisavis.com' };
const msg = (a: string[], cc: string[] = [], cci: string[] = []) => ({ de: 'gestion@criterimmo.fr', deNom: 'Gestion', a, cc, cci, objet: 'Préavis de M. X', corps: 'c', messageId: '<m@x>' });

function espion(): TransportDemande & { recus: ReturnType<typeof msg>[] } {
  const recus: ReturnType<typeof msg>[] = [];
  return { recus, async envoyer(m) { recus.push(m as ReturnType<typeof msg>); return { ok: true, id: 'x', factice: true }; } };
}

describe('filtrerPourTest', () => {
  it('seul le créateur reste ; partenaires, gestion@, collègues, clients retirés ; objet « [TEST] »', () => {
    const f = filtrerPourTest(msg(['contact@adhoc.fr', 'A.Jorel@SansVisAVis.com'], ['gestion@criterimmo.fr', 'collegue@sansvisavis.com'], ['monga@monga.fr']), P);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.message.a).toEqual(['A.Jorel@SansVisAVis.com']);
    expect(f.message.cc).toEqual([]);
    expect(f.message.cci).toEqual([]);
    expect(f.message.objet).toBe('[TEST] Préavis de M. X');
    expect(f.retires).toBe(4);
  });
  it('le créateur seulement en copie : il devient le destinataire, rien d’autre', () => {
    const f = filtrerPourTest(msg(['contact@adhoc.fr'], ['Arno <a.jorel@sansvisavis.com>']), P);
    expect(f.ok && f.message.a).toEqual(['Arno <a.jorel@sansvisavis.com>']);
  });
  it('aucun destinataire autorisé : le mail NE PART PAS', () => {
    const f = filtrerPourTest(msg(['contact@adhoc.fr'], ['gestion@criterimmo.fr']), P);
    expect(f.ok).toBe(false);
  });
  it('une adresse qui ressemble (autre domaine, sous-adresse) n’est pas le créateur', () => {
    expect(filtrerPourTest(msg(['a.jorel@sansvisavis.com.pirate.fr', 'a.jorel+x@sansvisavis.com', 'xa.jorel@sansvisavis.com']), P).ok).toBe(false);
  });
  it('« [TEST] » n’est jamais doublé', () => {
    const f = filtrerPourTest({ ...msg([P.createurEmail]), objet: '[TEST] déjà' }, P);
    expect(f.ok && f.message.objet).toBe('[TEST] déjà');
  });
});

describe('🔴 le verrou du transport (dernier point avant le réseau)', () => {
  it('hors périmètre : le mail part tel quel', async () => {
    const t = espion();
    await avecVerrouTest(t).envoyer(msg(['client@exemple.fr'], ['gestion@criterimmo.fr']));
    expect(t.recus[0].a).toEqual(['client@exemple.fr']);
  });
  it('dans le périmètre : au seul créateur ; refusé si le créateur n’est pas destinataire (rien ne part)', async () => {
    const t = espion();
    await avecPerimetreTest(P, async () => {
      const r1 = await avecVerrouTest(t).envoyer(msg([P.createurEmail], ['gestion@criterimmo.fr', 'contact@adhoc.fr']));
      const r2 = await avecVerrouTest(t).envoyer(msg(['contact@adhoc.fr', 'monga@monga.fr'], ['gestion@criterimmo.fr']));
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(false);
    });
    expect(t.recus).toHaveLength(1);
    expect([...t.recus[0].a, ...t.recus[0].cc, ...t.recus[0].cci]).toEqual([P.createurEmail]);
  });
  it('le transport PAR DÉFAUT est verrouillé (factice sous les tests)', async () => {
    const avant = ENVOIS_FACTICES.length;
    await avecPerimetreTest(P, () => transportParDefaut().envoyer(msg(['locataire@client.fr', P.createurEmail], ['partenaire@adhoc.fr'])));
    const m = ENVOIS_FACTICES[ENVOIS_FACTICES.length - 1];
    expect(ENVOIS_FACTICES.length).toBe(avant + 1);
    expect([...m.a, ...m.cc, ...m.cci]).toEqual([P.createurEmail]);
  });
  it('le périmètre SUIT le travail asynchrone du geste (minuterie, promesse) ; `horsPerimetre` en sort', async () => {
    const t = espion();
    await avecPerimetreTest(P, () => new Promise<void>((ok) => setTimeout(async () => { await avecVerrouTest(t).envoyer(msg(['x@client.fr', P.createurEmail])); ok(); }, 5)));
    expect(t.recus[0].a).toEqual([P.createurEmail]);
    await avecPerimetreTest(P, () => horsPerimetre(() => { expect(perimetreCourant()).toBeNull(); }));
  });
  it('deux tests dans un même geste : refusé', () => {
    expect(() => avecPerimetreTest(P, () => avecPerimetreTest({ testId: 8, createurEmail: 'b@x.fr' }, () => 1))).toThrow(/Deux préavis de test/);
  });
});

describe('🔴 le verrou de l’agenda', () => {
  const porte = (): PorteAgenda & { ecrits: string[] } => {
    const ecrits: string[] = [];
    return { ecrits, creer: async (a) => { ecrits.push(a); return { ok: true, id: 'e' }; }, modifier: async (a) => { ecrits.push(a); return { ok: true, id: 'e' }; },
      supprimer: async (a) => { ecrits.push(a); return { ok: true }; }, chercher: async () => ({ ok: true, ids: [] }), listerNotres: async () => ({ ok: true, evenements: [] }) };
  };
  it('dans le périmètre : seul l’agenda du créateur est écrit', async () => {
    const p = porte(); const v = avecVerrouAgendaTest(p);
    const ev = {} as Parameters<PorteAgenda['creer']>[2];
    await avecPerimetreTest(P, async () => {
      expect((await v.creer('collegue@sansvisavis.com', 1, ev)).ok).toBe(false);
      expect((await v.modifier('gestion@criterimmo.fr', 'x', 1, ev)).ok).toBe(false);
      expect((await v.creer('A.JOREL@sansvisavis.com', 1, ev)).ok).toBe(true);
    });
    expect(p.ecrits).toEqual(['A.JOREL@sansvisavis.com']);
  });
  it('hors périmètre : inchangé', async () => {
    const p = porte();
    await avecVerrouAgendaTest(p).creer('collegue@sansvisavis.com', 1, {} as Parameters<PorteAgenda['creer']>[2]);
    expect(p.ecrits).toEqual(['collegue@sansvisavis.com']);
  });
});

describe('préavis de test — pur', () => {
  it('« Dans 2 minutes » : minute pleine suivante + 2, heure de Paris, 15 minutes', () => {
    expect(rdvDansDeuxMinutes(new Date('2026-11-14T16:25:30Z'))).toEqual({ jour: '2026-11-14', debut: '17:28', fin: '17:43' });
    expect(rdvDansDeuxMinutes(new Date('2026-11-14T22:50:00Z'))).toEqual({ jour: '2026-11-14', debut: '23:52', fin: '23:59' });
  });
  it('les lignes de test ne comptent pas', () => {
    expect(horsTest([{ test: true }, {}, { test: false }])).toHaveLength(2);
  });
});
