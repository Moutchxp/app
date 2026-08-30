import { describe, it, expect } from 'vitest';
import { executerAlerteLienPeremption, composerAlerteLiens, type LienPerissableCandidat, type DepsAlerteLienPeremption } from './alerteLienPeremptionAuto';

const cand = (lienId: number, recuLe: string, numDau = `PC${lienId}`): LienPerissableCandidat => ({ lienId, recuLe: new Date(recuLe), url: `https://mairie.test/dl/${lienId}`, numDau, communeNom: 'Aubervilliers' });

// Fenêtre d'envoi (envoiOuvre) lue en heure LOCALE → on construit `now` en heure locale (jamais en UTC 'Z', dépendant du fuseau).
const JEUDI_10H = new Date(2026, 8, 3, 10, 0, 0);   // jeudi 3 sept. 2026, 10 h LOCAL (ouvré, dans 9-11)
const DIMANCHE_10H = new Date(2026, 7, 30, 10, 0, 0); // dimanche 30 août 2026, 10 h LOCAL (non ouvré)

/** Deps de test : config réglable, candidats fournis, `envoyer`/`marquerAlertes` tracés. */
function deps(over: {
  candidats: LienPerissableCandidat[]; active?: boolean; email?: string; validite?: number; alerteAvant?: number;
  now?: Date; debut?: number; fin?: number; envoiErreur?: boolean;
}): { deps: DepsAlerteLienPeremption; envois: { to: string; sujet: string; corps: string }[]; marques: number[] } {
  const envois: { to: string; sujet: string; corps: string }[] = [];
  const marques: number[] = [];
  return {
    envois, marques,
    deps: {
      maintenant: () => over.now ?? JEUDI_10H,
      lireConfig: async () => ({ active: over.active ?? true, email: over.email ?? 'a.jorel@sansvisavis.com', validiteJours: over.validite ?? 7, alerteAvantJours: over.alerteAvant ?? 3, envoiHeureDebut: over.debut ?? 9, envoiHeureFin: over.fin ?? 11 }),
      candidats: async () => over.candidats,
      envoyer: async (to, sujet, corps) => { if (over.envoiErreur) throw new Error('SMTP KO'); envois.push({ to, sujet, corps }); },
      marquerAlertes: async (ids) => { marques.push(...ids); },
    },
  };
}

describe('PART-D — executerAlerteLienPeremption', () => {
  it('opt-in OFF ou adresse vide → rien', async () => {
    const off = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z')], active: false });
    expect((await executerAlerteLienPeremption(off.deps)).envoyes).toBe(0);
    const sansMail = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z')], email: '  ' });
    expect((await executerAlerteLienPeremption(sansMail.deps)).envoyes).toBe(0);
  });

  it('aucun lien au seuil → rien envoyé, rien marqué', async () => {
    const d = deps({ candidats: [cand(1, '2026-09-02T10:00:00Z')], now: JEUDI_10H }); // 1 j < seuil 4
    const bilan = await executerAlerteLienPeremption(d.deps);
    expect(bilan.dus).toBe(0); expect(d.envois).toEqual([]); expect(d.marques).toEqual([]);
  });

  it('liens au seuil, fenêtre ouverte → UN e-mail groupé + marquage de tous les liens dus', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-20T10:00:00Z'), cand(2, '2026-08-28T10:00:00Z'), cand(3, '2026-09-02T10:00:00Z')], now: JEUDI_10H });
    const bilan = await executerAlerteLienPeremption(d.deps);
    expect(bilan.envoyes).toBe(2);          // liens 1 et 2 au seuil (≥ 4 j) ; lien 3 (1 j) non
    expect(d.envois).toHaveLength(1);        // UN SEUL e-mail groupé
    expect(d.envois[0].to).toBe('a.jorel@sansvisavis.com');
    expect(d.marques.sort()).toEqual([1, 2]); // idempotence : seuls les dus marqués
  });

  it('hors fenêtre d’envoi (jour/heure) → REPORTE : rien envoyé, rien marqué (retenté plus tard)', async () => {
    // dimanche → non ouvré
    const d = deps({ candidats: [cand(1, '2026-08-20T10:00:00Z')], now: DIMANCHE_10H });
    const bilan = await executerAlerteLienPeremption(d.deps);
    expect(bilan.reporte).toBe(true); expect(bilan.envoyes).toBe(0);
    expect(d.envois).toEqual([]); expect(d.marques).toEqual([]);
  });

  it('échec d’envoi → remonte, AUCUN marquage (retenté)', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-20T10:00:00Z')], now: JEUDI_10H, envoiErreur: true });
    await expect(executerAlerteLienPeremption(d.deps)).rejects.toThrow();
    expect(d.marques).toEqual([]);
  });
});

describe('PART-D — composerAlerteLiens (honnêteté : « reçu il y a N jours », hypothèse nommée, jamais « expire dans »)', () => {
  it('groupe, dit le fait mesuré et l’hypothèse, liste les URL', () => {
    const { sujet, corps } = composerAlerteLiens([cand(1, '2026-08-26T10:00:00Z'), cand(2, '2026-08-20T10:00:00Z')], new Date('2026-08-30T10:00:00Z'), 7);
    expect(sujet).toContain('(2)');
    expect(corps).toContain('reçu il y a 4 jours');
    expect(corps).toContain('reçu il y a 10 jours');
    expect(corps).toContain('validité présumée : 7 jours, hypothèse');
    expect(corps).not.toContain('expire dans');
    expect(corps).toContain('https://mairie.test/dl/1');
  });
});
