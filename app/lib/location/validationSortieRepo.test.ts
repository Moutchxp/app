import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (11/11/2026, lot 4) — « Valider l'état des lieux de sortie », le serveur : refus AVANT toute écriture, un mail par destinataire, historiques. */
const h = vi.hoisted(() => ({
  query: vi.fn(), enregistrerSortie: vi.fn(), envoyerSerie: vi.fn(), sans467: false,
}));
vi.mock('../db/client', () => ({ query: h.query }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'arno@exemple.test', nom: 'Arno Test' }) }));
vi.mock('./mailNouvelleLocationRepo', () => ({ lireDestinatairesDefaut: async () => [] }));
vi.mock('./mailsPreavisSortieRepo', () => ({
  MOTIF_SANS_457: 'sans 457', mailsAvisDisponibles: async () => true, proprietairesDuMailDisponible: async () => !h.sans467,
  signatureEcran: async () => ({ brute: '', ecran: { html: '', texte: '' } }), envoyerSerie: h.envoyerSerie,
  logementDe: async () => ({ lotId: 7, adresse: '4 rue Fictive', proprietaire: 'DUPONT Jean', enGestion: false, copropriete: false }),
}));
const BAIL = { lotId: 7, adresse: '4 rue Fictive', locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' }], annexes: [] };
vi.mock('./sortieLocatairesRepo', () => ({
  lireBail: async () => BAIL, enregistrerSortie: h.enregistrerSortie, donneesMailSortie: () => ({}),
  sortiePrevue: (b: typeof BAIL, s: number[], date: string) => ({ bail: b, date, sortants: b.locataires.filter((l) => s.includes(l.occupationId)), occupationIds: s, vacant: s.length === 2, restants: [], annexes: [] }),
  encartDuBail: async () => ({ lotId: 7, proprietaire: { id: 5, nom: 'DUPONT Jean' }, coordonnees: {
    proprietaire: null,
    proprietaires: [{ id: 5, nom: 'DUPONT Jean', telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] }],
    locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: [], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] }] } }),
}));
import { apercuValidationSortie, MOTIF_SANS_467, validerSortieEdls } from './validationSortieRepo';

const AUTEUR = { id: 1, libelle: 'Arno Test' };
const DEMANDE = { occupationId: 11, realise: true, date: '2026-11-10', sortants: [11, 12], compteRendu: 'Logement rendu propre.', destinataires: ['loc-11', 'pro-5', 'pro-99'], informerPartenaires: true };
beforeEach(() => {
  h.sans467 = false;
  h.query.mockReset().mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : { rows: [] }));
  h.enregistrerSortie.mockReset().mockResolvedValue({ etat: 'ok', data: { bail: BAIL, date: '2026-11-10', sortants: BAIL.locataires, occupationIds: [11, 12], vacant: true, restants: [], annexes: [] } });
  h.envoyerSerie.mockReset().mockImplementation(async (mails: { sorte: string; objet: string; a: string[]; cc: string[] }[]) => mails.map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, envoye: true, motif: null })));
});

describe('l’aperçu', () => {
  it('lecture seule : rien n’est écrit ni envoyé ; une clé inconnue (pro-99) est ignorée ; locataire, propriétaire, puis copie interne', async () => {
    const r = await apercuValidationSortie(DEMANDE, AUTEUR);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.mails.map((m) => [m.famille, m.a])).toEqual([['locataire', ['alice@exemple.test']], ['proprietaire', ['jean@exemple.test']], ['interne', ['gestion@exemple.test', 'arno@exemple.test']]]);
    expect(r.data.alertes).toEqual([]);
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect(h.envoyerSerie).not.toHaveBeenCalled();
  });
});

describe('la validation', () => {
  it('🔴 coordonnées d’un tiers dans le compte rendu : REFUS, la sortie n’est pas écrite, rien ne part', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, compteRendu: 'Clés remises à M. Dupont (06 11 22 33 44).' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus', champ: 'compteRendu' });
    expect((r as { motif: string }).motif).toContain('Attention : ce texte contient les coordonnées de Jean DUPONT (nom, téléphone).');
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect(h.envoyerSerie).not.toHaveBeenCalled();
  });
  it('date dans le futur, case « réalisé » décochée, sans la 467 : refus, rien n’est écrit', async () => {
    expect(await validerSortieEdls({ ...DEMANDE, date: '2026-11-12' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await validerSortieEdls({ ...DEMANDE, realise: false }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'realise' });
    h.sans467 = true;
    expect(await validerSortieEdls(DEMANDE, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_SANS_467 });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
  });
  it('avec destinataires : la sortie, PUIS un envoi par mail, chacun rangé dans l’historique de SON destinataire (locataire, propriétaire) ; la copie interne dans tous', async () => {
    const r = await validerSortieEdls(DEMANDE, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(h.enregistrerSortie).toHaveBeenCalledWith({ occupationId: 11, sortants: [11, 12], date: '2026-11-10' }, AUTEUR);
    expect(h.enregistrerSortie.mock.invocationCallOrder[0]).toBeLessThan(h.envoyerSerie.mock.invocationCallOrder[0]);
    const appels = h.envoyerSerie.mock.calls.map(([mails, , o]) => ({ sorte: mails[0].sorte, a: mails[0].a, cc: mails[0].cc, occ: o.occupationIds, pro: o.proprietaireIds, lot: o.lotId }));
    expect(appels).toEqual([
      { sorte: 'sortie_edls_locataire', a: ['alice@exemple.test'], cc: [], occ: [11], pro: [], lot: 7 },
      { sorte: 'sortie_edls_proprietaire', a: ['jean@exemple.test'], cc: [], occ: [], pro: [5], lot: 7 },
      { sorte: 'sortie_edls_interne', a: ['gestion@exemple.test', 'arno@exemple.test'], cc: [], occ: [11, 12], pro: [5], lot: 7 },
    ]);
    // Le compte rendu entre au journal du bien.
    expect(h.query.mock.calls.some(([sql, p]) => String(sql).includes('location_edls_realise') && String(p[2]).includes('Logement rendu propre.'))).toBe(true);
  });
  it('sans destinataire : la sortie et la copie interne SEULE', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, destinataires: [] }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(h.envoyerSerie.mock.calls.map(([m]) => m[0].sorte)).toEqual(['sortie_edls_interne']);
  });
});
