import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * C (lot 5b) — ALERTE « une saisine CADA est partie », canal E-MAIL. Ce hook vit DANS envoyerSaisinesCada (apply-mode), lequel
 * passe par le vrai transport (obtenirTransporteur/envoyerDemande de '../email'). On mocke donc '../email' ICI, dans un fichier
 * DÉDIÉ, pour ne PAS casser les tests de emettreUneSaisine (envoiSaisineCada.test.ts) qui pilotent leur transport à la main.
 *
 * On vérifie les 4 exigences : émise APRÈS un envoi confirmé · JAMAIS sur échec d'envoi · l'échec de l'alerte n'annule pas la
 * saisine (isolation) · UNE SEULE alerte par saisine.
 */
const { envoyerDemandeMock } = vi.hoisted(() => ({
  envoyerDemandeMock: vi.fn(async () => ({ messageId: '<c@svav>', retourFournisseur: '250 OK' })),
}));
vi.mock('../email', () => ({
  obtenirTransporteur: () => ({ sendMail: async () => ({ messageId: '<c@svav>', response: '250 OK' }) }),
  lireCompteSmtp: () => ({ host: 'h', port: 587, user: 'u', pass: 'p' }),
  lireConfigEmail: () => ({ host: 'h', port: 587, user: 'u', pass: 'p', from: 'a.jorel@sansvisavis.com' }),
  envoyerDemande: envoyerDemandeMock,
}));
vi.mock('../db/client', () => ({
  query: async () => ({ rows: [] }),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async () => ({ rows: [] })),
  pool: {}, closePool: async () => undefined,
}));

import { envoyerSaisinesCada, type SaisineAEnvoyer, type DepsEnvoiSaisine } from './envoiSaisineCada';

const ENVOI = new Date('2026-03-14T10:00:00Z');       // refus tacite 14 avr → forclusion 14 juin
const DANS_FENETRE = new Date('2026-05-10T12:00:00Z');

const S = (over: Partial<SaisineAEnvoyer> = {}): SaisineAEnvoyer => ({
  saisineId: 7, demandeId: 42, profil: 'entreprise', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine',
  objet: 'Saisine — réf. SVAV-DEM-2026-000042', corps: 'Corps de saisine propre', envoyeLe: ENVOI,
  demandeDestEmail: 'urba@asnieres.fr', demandeCorps: 'Corps figé de la demande initiale', numeros: ['PC0920042500001'], ...over,
});

function deps(over: Partial<DepsEnvoiSaisine> = {}): DepsEnvoiSaisine {
  return {
    cadaEmail: async () => 'cada@cada.fr',
    cadaUrlFormulaire: async () => 'https://www.cada.fr/formulaire-de-saisine',
    caps: async () => ({ capParRun: 10, capParJour: 25 }),
    candidats: async () => [S()],
    adresses: async () => ({ entreprise: 'a.jorel@sansvisavis.com', personne: 'arnaud.jorel@gmail.com' }),
    comptes: () => ({ entreprise: { host: 'h', port: 587, user: 'u', pass: 'p' }, personne: null }),
    emisAujourdhui: async () => 0,
    produireCopie: async () => Buffer.from('%PDF-1.7 copie'),
    emettreAlerte: vi.fn(async () => undefined),
    maintenant: () => DANS_FENETRE,
    ...over,
  };
}
const spyDe = (d: DepsEnvoiSaisine) => (d as unknown as { emettreAlerte: ReturnType<typeof vi.fn> }).emettreAlerte;

beforeEach(() => { envoyerDemandeMock.mockClear(); envoyerDemandeMock.mockResolvedValue({ messageId: '<c@svav>', retourFournisseur: '250 OK' }); });

describe('C (lot 5b) — alerte « saisine partie » (canal e-mail)', () => {
  it('envoi CONFIRMÉ → alerte émise UNE fois, vers demandeId, avec commune + numéros + canal e-mail + forclusion', async () => {
    const d = deps();
    const r = await envoyerSaisinesCada({ appliquer: true, auteur: 'admin' }, d);
    expect(r.resultats.map((x) => x.issue)).toEqual(['envoye']);
    const spy = spyDe(d);
    expect(spy).toHaveBeenCalledTimes(1); // une seule alerte par saisine
    const [info, demandeId] = spy.mock.calls[0];
    expect(demandeId).toBe(42);
    expect(info).toMatchObject({ communeNom: 'Asnières-sur-Seine', numeros: ['PC0920042500001'], canal: 'email' });
    expect((info as { forclusionLe: Date }).forclusionLe.toISOString().slice(0, 10)).toBe('2026-06-14'); // refus tacite + 2 mois
  });

  it('SIMULATION (appliquer défaut) → aucune alerte (rien n’est réellement parti)', async () => {
    const d = deps();
    await envoyerSaisinesCada({}, d);
    expect(spyDe(d)).not.toHaveBeenCalled();
  });

  it('envoi qui ÉCHOUE (transport en erreur) → JAMAIS d’alerte', async () => {
    envoyerDemandeMock.mockRejectedValue(new Error('timeout'));
    const d = deps();
    const r = await envoyerSaisinesCada({ appliquer: true, auteur: 'admin' }, d);
    expect(r.resultats.every((x) => x.issue !== 'envoye')).toBe(true);
    expect(spyDe(d)).not.toHaveBeenCalled();
  });

  it('ISOLATION : une alerte qui LÈVE n’annule pas la saisine (l’envoi reste confirmé)', async () => {
    const d = deps({ emettreAlerte: vi.fn(async () => { throw new Error('alerte SMTP down'); }) });
    const r = await envoyerSaisinesCada({ appliquer: true, auteur: 'admin' }, d);
    expect(r.resultats.map((x) => x.issue)).toEqual(['envoye']); // la saisine est partie malgré l’échec d’alerte
    expect(spyDe(d)).toHaveBeenCalledTimes(1);
  });

  it('DEUX saisines envoyées → exactement DEUX alertes (une par saisine, jamais en double)', async () => {
    const d = deps({ candidats: async () => [S({ saisineId: 7, demandeId: 42 }), S({ saisineId: 8, demandeId: 43 })] });
    const r = await envoyerSaisinesCada({ appliquer: true, auteur: 'admin' }, d);
    expect(r.resultats.filter((x) => x.issue === 'envoye')).toHaveLength(2);
    expect(spyDe(d)).toHaveBeenCalledTimes(2);
  });
});
