import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { marqueVingtPourcent, MOTIF_DEUX_LOCATAIRES, MOTIF_LOCATAIRE_PAS_SEUL, refusUnLocataireParMail } from './mailVingtPourcent';

/** 🔴🔴 Arno (25/11/2026, décision 2A) — « un mail par locataire » : la règle, et son contrôle au serveur (adresses relues en base). */
describe('🔴🔴 refusUnLocataireParMail', () => {
  const LOCS = [['alice@exemple.test', 'alice.pro@exemple.test'], ['leo@exemple.test']];
  it('un seul locataire, à lui seul (une ou plusieurs de SES adresses, casse indifférente) : accepté', () => {
    expect(refusUnLocataireParMail(LOCS, ['Alice@Exemple.test'])).toBeNull();
    expect(refusUnLocataireParMail(LOCS, ['alice@exemple.test', 'alice.pro@exemple.test'])).toBeNull();
  });
  it('deux locataires dans le même mail (À, Cc ou Cci) : refusé', () => {
    expect(refusUnLocataireParMail(LOCS, ['alice@exemple.test', 'leo@exemple.test'])).toBe(MOTIF_DEUX_LOCATAIRES);
  });
  it('un locataire avec un autre destinataire (propriétaire, syndic, n’importe qui) : refusé — aucun client ne voit l’adresse d’un autre', () => {
    expect(refusUnLocataireParMail(LOCS, ['leo@exemple.test', 'jean@exemple.test'])).toBe(MOTIF_LOCATAIRE_PAS_SEUL);
  });
  it('aucun locataire (syndic, propriétaires, syndic avec propriétaires en copie) : pas concerné', () => {
    expect(refusUnLocataireParMail(LOCS, ['syndic@exemple.test', 'jean@exemple.test', 'sci@exemple.test'])).toBeNull();
    expect(refusUnLocataireParMail([], ['x@exemple.test'])).toBeNull();
  });
  it('la marque est lue strictement (un entier positif)', () => {
    expect(marqueVingtPourcent({ sortieId: 5 })).toEqual({ sortieId: 5 });
    for (const x of [undefined, null, 5, {}, { sortieId: '5' }, { sortieId: 0 }, { sortieId: 1.5 }]) expect(marqueVingtPourcent(x)).toBeNull();
  });
});

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/client', () => ({ query: h.query }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
const { adressesDesLocatairesDeLaSortie, refusMailVingtPourcent } = await import('./mailVingtPourcentRepo');

describe('🔴🔴 le contrôle du serveur', () => {
  it('relit en base les adresses de chaque locataire de la sortie (paramètre lié), et refuse deux locataires', async () => {
    h.query.mockResolvedValue({ rows: [{ locataire: '1', adresse: 'alice@exemple.test' }, { locataire: '1', adresse: 'alice.pro@exemple.test' }, { locataire: '2', adresse: 'leo@exemple.test' }, { locataire: '3', adresse: null }] });
    expect(await adressesDesLocatairesDeLaSortie(7)).toEqual([['alice@exemple.test', 'alice.pro@exemple.test'], ['leo@exemple.test'], []]);
    expect(h.query.mock.calls[0][1]).toEqual([7]);
    expect(String(h.query.mock.calls[0][0]).replace(/\s+/g, ' ')).toContain("c.sujet = 'locataire' AND c.sujet_id = o.locataire_id AND c.sorte = 'email'");
    expect(await refusMailVingtPourcent(7, ['alice@exemple.test', 'leo@exemple.test'])).toBe(MOTIF_DEUX_LOCATAIRES);
    expect(await refusMailVingtPourcent(7, ['leo@exemple.test'])).toBeNull();
  });
  it('la route d’envoi l’applique aux seuls mails marqués, avant la mise en file comme avant l’envoi direct', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    const i = r.indexOf('const vingt = marqueVingtPourcent(corps.vingtPourcent);');
    expect(i).toBeGreaterThan(r.indexOf('const habitantVisible = await refusEnvoiHabitants(demande);'));
    expect(i).toBeLessThan(r.indexOf('if (await fileEnvoiDisponible()) {'));
    expect(r).toContain("if (motif !== null) return Response.json({ erreur: motif, code: 'invalide' }, { status: 422 });");
  });
});
