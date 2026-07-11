import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../analytics/lecture/requete', () => ({ lireGrandLivre: vi.fn().mockResolvedValue([]) }));

import { audit, seuilPic, detecterPics, type PointAudit } from './lecture';
import { lireGrandLivre } from '../analytics/lecture/requete';

const q = lireGrandLivre as unknown as ReturnType<typeof vi.fn>;
const F = { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' as const };

beforeEach(() => q.mockReset());

describe('seuilPic — seuil de pic ADAPTATIF (pur)', () => {
  it('max(plancher, médiane des non-nuls · facteur)', () => {
    expect(seuilPic([1, 2, 3], 20, 3)).toBe(20); // médiane 2·3=6 < plancher 20
    expect(seuilPic([10, 30, 50], 20, 3)).toBe(90); // médiane 30·3=90
    expect(seuilPic([], 20, 3)).toBe(20); // aucune donnée → plancher
    expect(seuilPic([0, 0], 20, 3)).toBe(20); // que des zéros → plancher (ignorés)
  });
});

describe('detecterPics — tranches anormales (pur)', () => {
  it('ne retient que les buckets échecs > 0 ET ≥ seuil', () => {
    const serie: PointAudit[] = [
      { bucket: '2026-01-01', succes: 5, echecs: 3 },
      { bucket: '2026-01-02', succes: 2, echecs: 25 },
      { bucket: '2026-01-03', succes: 0, echecs: 0 },
    ];
    expect(detecterPics(serie, 20)).toEqual([{ bucket: '2026-01-02', echecs: 25 }]);
  });
});

describe('audit — agrégats depuis analytics_admin_jour, STRICTEMENT sans identité', () => {
  it('fusionne succès/échecs par bucket + totaux ; lit UNIQUEMENT analytics_admin_jour', async () => {
    q.mockResolvedValueOnce([
      { bucket: '2026-01-01', nom: 'admin_connexion', n: '5' },
      { bucket: '2026-01-01', nom: 'admin_connexion_echec', n: '2' },
      { bucket: '2026-01-02', nom: 'admin_connexion_echec', n: '30' },
    ]).mockResolvedValueOnce([
      { cle: 'audit_pic_min', valeur: '20' },
      { cle: 'audit_pic_facteur', valeur: '3' },
    ]);
    const r = await audit(F);
    expect(r.serie).toEqual([
      { bucket: '2026-01-01', succes: 5, echecs: 2 },
      { bucket: '2026-01-02', succes: 0, echecs: 30 },
    ]);
    expect(r.totaux).toEqual({ succes: 5, echecs: 32 });
    expect(q.mock.calls[0][0]).toMatch(/analytics_admin_jour/);
    expect(q.mock.calls[0][0]).not.toMatch(/login_echec|identifiant/); // JAMAIS l'état de throttle ni un identifiant
  });

  it('AUCUN champ par-personne / IP dans la sortie (RGPD agrégé — Q-C=1)', async () => {
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', nom: 'admin_connexion', n: '3' }]).mockResolvedValueOnce([]);
    const json = JSON.stringify(await audit(F)).toLowerCase();
    for (const interdit of ['identifiant', 'ip', 'adresse', 'sub', 'utilisateur', 'login_echec']) {
      expect(json.includes(interdit), `la réponse ne doit pas contenir « ${interdit} »`).toBe(false);
    }
  });
});
