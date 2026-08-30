import { describe, it, expect, vi } from 'vitest';
import { fusionnerFil, lireFil, type DepsFil, type FilEntree } from './filPermis';

const e = (le: string, sens: FilEntree['sens'], over: Partial<FilEntree> = {}): FilEntree =>
  ({ le, sens, interlocuteur: null, objet: null, corps: sens === 'declare' ? null : 'corps', corpsConnu: sens !== 'declare', ...over });

describe('fusionnerFil', () => {
  it('trie du plus récent au plus ancien', () => {
    const out = fusionnerFil([e('2026-08-04T21:21:00Z', 'envoye'), e('2026-08-28T15:04:00Z', 'recu'), e('2026-08-26T09:09:00Z', 'envoye')]);
    expect(out.map((x) => x.le)).toEqual(['2026-08-28T15:04:00Z', '2026-08-26T09:09:00Z', '2026-08-04T21:21:00Z']);
  });
  it('une déclaration (date seule) se place au bon jour', () => {
    const out = fusionnerFil([e('2026-08-28T15:04:00Z', 'recu'), e('2026-08-27', 'declare'), e('2026-08-26T09:09:00Z', 'envoye')]);
    expect(out.map((x) => x.le)).toEqual(['2026-08-28T15:04:00Z', '2026-08-27', '2026-08-26T09:09:00Z']);
  });
});

function deps(over: Partial<DepsFil> = {}): DepsFil {
  return {
    demandesDuDossier: vi.fn(async () => [{ demandeId: 154, nbDossiers: 1 }]),
    entreesDesDemandes: vi.fn(async () => [e('2026-08-04T21:21:00Z', 'envoye'), e('2026-08-28T15:04:00Z', 'recu')]),
    ...over,
  };
}

describe('lireFil', () => {
  it('mono-dossier → fil OK, reçus et envois mêlés, décroissant', async () => {
    const r = await lireFil(deps(), 7424);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') { expect(r.entrees.map((x) => x.sens)).toEqual(['recu', 'envoye']); }
  });

  it('demande MULTI-dossiers → aucun fil (statut multi), on ne lit même pas les entrées', async () => {
    const entreesDesDemandes = vi.fn(async () => [e('2026-08-28T15:04:00Z', 'recu')]);
    const r = await lireFil(deps({ demandesDuDossier: vi.fn(async () => [{ demandeId: 200, nbDossiers: 3 }]), entreesDesDemandes }), 999);
    expect(r.statut).toBe('multi');
    expect(entreesDesDemandes).not.toHaveBeenCalled();
  });

  it('aucune demande → vide ; aucun échange → vide', async () => {
    expect((await lireFil(deps({ demandesDuDossier: vi.fn(async () => []) }), 1)).statut).toBe('vide');
    expect((await lireFil(deps({ entreesDesDemandes: vi.fn(async () => []) }), 1)).statut).toBe('vide');
  });

  it('une déclaration n’a jamais de corps (corpsConnu=false, corps=null)', async () => {
    const r = await lireFil(deps({ entreesDesDemandes: vi.fn(async () => [e('2026-08-27', 'declare')]) }), 1);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') { expect(r.entrees[0].corps).toBeNull(); expect(r.entrees[0].corpsConnu).toBe(false); }
  });

  it('FIL-C — un sortant hors outil (envoye, horsOutil) s’ordonne correctement parmi les autres entrées', async () => {
    const entrees = vi.fn(async () => [
      e('2026-08-04T21:21:00Z', 'envoye'),
      e('2026-08-20T10:00:00Z', 'envoye', { horsOutil: true, objet: 'Re: complément' }),
      e('2026-08-28T15:04:00Z', 'recu'),
    ]);
    const r = await lireFil(deps({ entreesDesDemandes: entrees }), 154);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') {
      expect(r.entrees.map((x) => x.le)).toEqual(['2026-08-28T15:04:00Z', '2026-08-20T10:00:00Z', '2026-08-04T21:21:00Z']);
      expect(r.entrees[1]).toMatchObject({ sens: 'envoye', horsOutil: true }); // capturé, mêlé chronologiquement
    }
  });

  it('FIL-C — demande MULTI-dossiers → aucun fil, donc AUCUN sortant hors outil affiché (garde entière)', async () => {
    const entreesDesDemandes = vi.fn(async () => [e('2026-08-20T10:00:00Z', 'envoye', { horsOutil: true })]);
    const r = await lireFil(deps({ demandesDuDossier: vi.fn(async () => [{ demandeId: 154, nbDossiers: 2 }]), entreesDesDemandes }), 154);
    expect(r.statut).toBe('multi');
    expect(entreesDesDemandes).not.toHaveBeenCalled();
  });
});
