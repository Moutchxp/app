import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (19/11/2026) — « Envoyer maintenant le lien du compte rendu » (remplace « Dans 2 minutes ») : sur un préavis de TEST seulement, le mail de
 * l'heure de début part TOUT DE SUITE à chaque destinataire du rendez-vous — et, préavis de test, uniquement vers son créateur (Arno), jamais au vrai
 * collègue. Base et transport simulés ; le filtrage du périmètre de test est le VRAI.
 */
const h = vi.hoisted(() => ({ test: true, partis: [] as { a: string[]; objet: string }[], maj: [] as string[] }));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('FROM gestion_location_previsite s JOIN gestion_tache t')) return { rows: [{ id: '7', tache_id: '34', occupation_ids: ['553'], recu_le: '2026-11-01' }] };
    if (s.startsWith('UPDATE gestion_location_previsite SET cr_invitation_le')) { h.maj.push(s); return { rows: [] }; }
    return { rows: [] };
  },
  withTransaction: async (f: (q: unknown) => unknown) => f(async () => ({ rows: [] })),
}));
vi.mock('./preavisTestRepo', () => ({ perimetreDuGeste: async () => ({ ok: true, perimetre: h.test ? { testId: 1, createurEmail: 'a.jorel@sansvisavis.com' } : null }) }));
vi.mock('./previsiteBase', async (orig) => ({
  ...(await orig<typeof import('./previsiteBase')>()),
  previsiteDisponible: async () => true,
  rdvDuSuivi: () => ({ jour: '2026-11-20', heure: '10:00', dureeMinutes: 30 }),
  reponsesDesTaches: async () => new Map([[34, [
    { collaborateurId: 2, libelle: 'Arnaud Jorel', email: 'a.jorel@sansvisavis.com', statut: 'acceptee' },
    { collaborateurId: 6, libelle: 'Cédric JULLIEN', email: 'cedric@sansvisavis.com', statut: 'en_attente' },
  ]]]),
  contexte: async () => ({ adresse: '1 rue du Préavis de Test (FICTIF)', lotId: 11, locataires: [], expediteur: 'gestion@criterimmo.fr', qui: { email: null, nom: '' }, brute: '',
    signature: { html: '', texte: '' } }),
}));
vi.mock('./mailsPreavisSortieRepo', async (orig) => {
  const { perimetreCourant, filtrerPourTest } = await import('./perimetreTest');
  return {
    ...(await orig<typeof import('./mailsPreavisSortieRepo')>()),
    mailsAvisDisponibles: async () => true,
    envoyerSerie: async (mails: { a: string[]; cc: string[]; objet: string; sorte: string; texte: string }[]) => mails.map((m) => {
      const p = perimetreCourant();
      const f = p === null ? null : filtrerPourTest({ ...m, cci: [] }, p);
      const a = f === null ? m.a : f.ok ? f.message.a : [];
      h.partis.push({ a, objet: f !== null && f.ok ? f.message.objet : m.objet });
      return { sorte: m.sorte, objet: m.objet, a, cc: [], texte: m.texte, envoye: a.length > 0, motif: null };
    }),
  };
});
const { envoyerLienCompteRenduMaintenant } = await import('./previsiteAuto');

beforeEach(() => { h.test = true; h.partis = []; h.maj = []; });
describe('🔴 « Envoyer maintenant le lien du compte rendu »', () => {
  it('préavis de test : le mail de l’heure de début part tout de suite, UNIQUEMENT vers Arno (jamais au collègue) ; la minuterie ne le renverra pas', async () => {
    const r = await envoyerLienCompteRenduMaintenant([553], { id: 2, libelle: 'Arnaud Jorel' });
    expect(r.etat).toBe('ok');
    expect(h.partis).toHaveLength(1);
    expect(h.partis[0].a).toEqual(['a.jorel@sansvisavis.com']);
    expect(h.partis[0].objet.startsWith('[TEST]')).toBe(true);
    expect(h.maj).toHaveLength(1);
  });
  it('🔴 (19/11/2026, 2e retour) un VRAI préavis : le mail part aux collègues destinataires du rendez-vous (sans marque [TEST])', async () => {
    h.test = false;
    expect((await envoyerLienCompteRenduMaintenant([553], { id: 2, libelle: 'Arnaud Jorel' })).etat).toBe('ok');
    expect(h.partis.map((x) => x.a)).toEqual([['a.jorel@sansvisavis.com', 'cedric@sansvisavis.com']]);
    expect(h.partis[0].objet.startsWith('[TEST]')).toBe(false);
  });
});
