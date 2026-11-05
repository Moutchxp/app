import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (05/11/2026) — LES MAILS DU PRÉAVIS DEPUIS LA FICHE COMMUNE DE LA GESTION : le MÊME aperçu (`apercu-preavis`) et le
 * MÊME « Valider et envoyer » (`enregistrer-preavis` + `envoyerMails`) que la tuile Location, par LA porte commune
 * (`enregistrerPreavisAvecMails`). Dépôts simulés : rien n'est écrit, rien ne part.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'arno@exemple.test' }) }));
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
const porte = vi.fn();
const apercu = vi.fn();
vi.mock('../../../../../../lib/location/mailsPreavisSortieRepo', () => ({
  enregistrerPreavisAvecMails: (...a: unknown[]) => porte(...a),
  apercuMailsPreavis: (...a: unknown[]) => apercu(...a),
}));
const { POST } = await import('./route');

const demande = (corps: unknown): Request => new Request('http://localhost/api/admin/gestion/annuaire/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});
const CORPS = { occupationIds: [11, '12'], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 3 } };
const AUTEUR = { id: 5, libelle: 'arno@exemple.test' };
beforeEach(() => { porte.mockReset().mockResolvedValue({ etat: 'ok', data: { dateMax: '2027-02-04', preavis: 2 }, mails: { etat: 'ok', envois: [] } }); apercu.mockReset(); });

describe('🔴 fiche de la Gestion : préavis avec ses mails', () => {
  it('l’aperçu : la même fonction que la Location, lecture seule', async () => {
    apercu.mockResolvedValue({ etat: 'ok', data: { mails: [], sansEmail: [], enGestion: true, dateFin: '2027-02-04', envoiPossible: true } });
    const r = await (await POST(demande({ action: 'apercu-preavis', ...CORPS }))).json();
    expect(r.etat).toBe('ok');
    expect(apercu).toHaveBeenCalledWith({ occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 3 } }, AUTEUR);
    expect(porte).not.toHaveBeenCalled();
  });

  it('« Valider et envoyer » : LA porte commune, mails demandés ; sans le drapeau : préavis seul, comme avant', async () => {
    const r = await (await POST(demande({ action: 'enregistrer-preavis', ...CORPS, motif: null, envoyerMails: true }))).json();
    expect(r.mails).toEqual({ etat: 'ok', envois: [] });
    expect(porte).toHaveBeenLastCalledWith({ occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 3 }, motif: null }, AUTEUR, true);
    await POST(demande({ action: 'enregistrer-preavis', ...CORPS }));
    expect(porte.mock.calls[1][2]).toBe(false);
  });
});

describe('🔴 une seule fonction d’envoi pour toutes les entrées (pas de copie de code)', () => {
  const ROUTES = ['app/(admin)/api/admin/location/route.ts', 'app/(admin)/api/admin/gestion/annuaire/location/route.ts'];
  it('les deux routes qui enregistrent un préavis passent par `enregistrerPreavisAvecMails`, jamais par `enregistrerPreavis` en direct', () => {
    for (const f of ROUTES) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/enregistrerPreavisAvecMails\(/);
      expect(src, f).toMatch(/case 'apercu-preavis'/);
      expect(src, f).not.toMatch(/\benregistrerPreavis\(/);
      expect(src, f).not.toMatch(/envoyerMailsPreavis\(/);
    }
  });
});
