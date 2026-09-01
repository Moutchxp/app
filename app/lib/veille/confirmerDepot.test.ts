import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmerDepot, type DepsConfirmerDepot } from './confirmerDepot';

/**
 * LOT 35 — le geste qui manquait : à la confirmation « Oui, déposée », la RÉFÉRENCE mairie portée par l'accusé déclencheur doit
 * être écrite. On rejoue le CAS RÉEL 161 (accusé arrivé AVANT le dépôt → attribuerReferenceAccuse n'avait pas pu jouer, la demande
 * n'étant pas encore 'envoyee'). PUR par injection : aucune base.
 */
function harness(over: Partial<DepsConfirmerDepot> = {}) {
  const marque: { demandeId: number; reference: string | null; envoyeLe: string }[] = [];
  const rattaches: [number, number][] = [];
  const deps: DepsConfirmerDepot = {
    lireReference: vi.fn(async () => 'SLC260901542604'),
    marquerDeposee: vi.fn(async (demandeId: number, reference: string | null, envoyeLe: string) => { marque.push({ demandeId, reference, envoyeLe }); }),
    rattacher: vi.fn(async (reponseId: number, demandeId: number) => { rattaches.push([reponseId, demandeId]); }),
    ...over,
  };
  return { deps, marque, rattaches };
}

describe('confirmerDepot — la confirmation attribue la référence de l’accusé', () => {
  it('CAS RÉEL 161 (accusé AVANT le dépôt) : référence SLC extraite du message → ÉCRITE, demande déposée, message rattaché', async () => {
    const h = harness();
    const r = await confirmerDepot(h.deps, { reponseId: 17, demandeId: 161, envoyeLe: '2026-09-01' });
    expect(r.referenceCaptee).toBe('SLC260901542604');
    // 🔴 le bug corrigé : marquerDeposee reçoit la RÉFÉRENCE (avant : null), donc demande_reference_externe est écrite.
    expect(h.marque).toEqual([{ demandeId: 161, reference: 'SLC260901542604', envoyeLe: '2026-09-01' }]);
    expect(h.rattaches).toEqual([[17, 161]]);
  });

  it('ORDRE DES CLICS INDIFFÉRENT : la référence vient du MESSAGE (lireReference(reponseId)), jamais du statut de la demande', async () => {
    const h = harness();
    await confirmerDepot(h.deps, { reponseId: 5, demandeId: 42, envoyeLe: '2026-09-01' });
    expect(h.deps.lireReference).toHaveBeenCalledWith(5); // lue depuis l'accusé déclencheur — aucune dépendance à un statut/relève
    expect(h.marque[0].reference).toBe('SLC260901542604');
  });

  it('accusé SANS référence exploitable → marquerDeposee reçoit null + referenceCaptee=null (échec VISIBLE à l’écran)', async () => {
    const h = harness({ lireReference: vi.fn(async () => null) });
    const r = await confirmerDepot(h.deps, { reponseId: 9, demandeId: 7, envoyeLe: '2026-09-01' });
    expect(r.referenceCaptee).toBeNull();
    expect(h.marque[0].reference).toBeNull(); // dépôt confirmé quand même, mais l'écran dira « aucune référence détectée »
  });

  it('marquerDeposee est appelé AVANT rattacher (la demande doit être envoyée pour autoriser le rattachement)', async () => {
    const ordre: string[] = [];
    const h = harness({
      marquerDeposee: vi.fn(async () => { ordre.push('deposee'); }),
      rattacher: vi.fn(async () => { ordre.push('rattache'); }),
    });
    await confirmerDepot(h.deps, { reponseId: 1, demandeId: 2, envoyeLe: '2026-09-01' });
    expect(ordre).toEqual(['deposee', 'rattache']);
  });
});

describe('LOT 35 — pas d’écrasement d’une référence déjà présente (contrat de marquerDeposee)', () => {
  it('marquerDeposee écrit la référence en ON CONFLICT DO NOTHING (jamais d’écrasement)', () => {
    const src = readFileSync(join(process.cwd(), 'app/lib/sitadel/demandeRepo.ts'), 'utf8');
    // On borne à la fonction marquerDeposee (jusqu'au prochain `export`) pour viser SON insert de référence, pas un autre écrivain.
    const debut = src.indexOf('export async function marquerDeposee');
    const suite = src.indexOf('\nexport ', debut + 1);
    const fn = src.slice(debut, suite === -1 ? undefined : suite).replace(/\s+/g, ' ');
    expect(fn).toContain('INSERT INTO demande_reference_externe');
    expect(fn).toContain("'accuse_reception'");                          // source de la réf. captée au dépôt
    expect(fn).toContain('ON CONFLICT (demande_id, reference) DO NOTHING'); // une référence déjà là n'est jamais remplacée
  });
});
