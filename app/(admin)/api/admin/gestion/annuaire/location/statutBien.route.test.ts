import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026, 403) — la ROUTE de la fiche commune, action `statut-bien` :
 *   · la saisie passe telle quelle au dépôt (`changerStatutBien`) ;
 *   · le mail de portefeuille SUIT le statut : sortie de gestion → mail de sortie ; location seule → en gestion → mail d'entrée
 *     (nouveau mandat) ; ancienne gestion → en gestion → mail d'entrée « retour » ; ancienne → location seule → aucun mail ;
 *   · un refus : rendu tel quel, aucun mail.
 * Garde et dépôts simulés : rien n'est écrit, rien ne part.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'arno@exemple.test' }) }));
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
const changerStatutBien = vi.fn();
vi.mock('../../../../../../lib/gestion/statutBienRepo', async (orig) => ({
  ...(await orig<object>()), changerStatutBien: (...a: unknown[]) => changerStatutBien(...a),
}));
const evenements: unknown[] = [];
vi.mock('../../../../../../lib/location/mailPortefeuilleRepo', async (orig) => ({
  ...(await orig<object>()), avecMail: async (r: unknown, ev: unknown) => { evenements.push(ev); return r; },
}));
let avec404 = false;
const deplacerDossierDuBien = vi.fn(async (..._a: unknown[]) => ({ ok: false, motif: 'RECETTE — écriture dans le Drive non effectuée' }));
const creerDossierDuBien = vi.fn(async (..._a: unknown[]) => ({ ok: true, driveId: 'N5', geste: 'cree', place: { arbre: 'location_seule', branche: null }, crees: [] }));
vi.mock('../../../../../../lib/gestion/arbreStatutDriveRepo', () => ({
  arbreDisponible: async () => avec404,
  deplacerDossierDuBien: (...a: unknown[]) => deplacerDossierDuBien(...a),
  creerDossierDuBien: (...a: unknown[]) => creerDossierDuBien(...a),
  etatDriveDuBien: async () => null,
}));
const { POST } = await import('./route');

const demande = (corps: unknown, depuisLocation = false): Request => new Request('http://localhost/api/admin/gestion/annuaire/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(depuisLocation ? { 'x-svav-contexte': 'location' } : {}) }, body: JSON.stringify(corps),
});
const issue = (avant: string, apres: string, lots = [10, 11]) => ({ etat: 'ok', data: { avant, apres, effetLe: '2026-10-21', lots, avertissement: null } });
beforeEach(() => { changerStatutBien.mockReset(); evenements.length = 0; avec404 = false; deplacerDossierDuBien.mockClear(); creerDossierDuBien.mockClear(); });

describe('🔴 statut-bien : la route', () => {
  it('la saisie va au dépôt ; sortie de gestion → mail de SORTIE pour le bien et ses annexes suivies', async () => {
    changerStatutBien.mockResolvedValue(issue('en_gestion', 'location_seule'));
    const r = await POST(demande({ action: 'statut-bien', id: 10, vers: 'location_seule', effetLe: '2026-10-21', motif: 'résilié', mandat: null }));
    expect(await r.json()).toMatchObject({ etat: 'ok', data: { apres: 'location_seule' } });
    expect(changerStatutBien.mock.calls[0].slice(0, 2)).toEqual([10, { vers: 'location_seule', effetLe: '2026-10-21', motif: 'résilié', mandat: null }]);
    expect(evenements).toEqual([{ sens: 'sortie', proprietaireId: null, lotIds: [10, 11], origine: null }]);
  });

  it('location seule → en gestion : mail d’ENTRÉE (nouveau mandat) ; ancienne → en gestion : entrée « retour » ; ancienne → location seule : aucun', async () => {
    changerStatutBien.mockResolvedValueOnce(issue('location_seule', 'en_gestion', [10]));
    await POST(demande({ action: 'statut-bien', id: 10, vers: 'en_gestion', effetLe: '2026-10-21' }));
    changerStatutBien.mockResolvedValueOnce(issue('ancienne_gestion', 'en_gestion', [10]));
    await POST(demande({ action: 'statut-bien', id: 10, vers: 'en_gestion', effetLe: '2026-10-21' }));
    changerStatutBien.mockResolvedValueOnce(issue('ancienne_gestion', 'location_seule', [10]));
    await POST(demande({ action: 'statut-bien', id: 10, vers: 'location_seule', effetLe: '2026-10-21' }));
    expect(evenements).toEqual([
      { sens: 'entree', reactivation: false, proprietaireId: null, lotIds: [10], origine: null },
      { sens: 'entree', reactivation: true, proprietaireId: null, lotIds: [10], origine: null },
      null,
    ]);
  });

  it('un refus est rendu tel quel, sans mail ; un bien manquant : « Demande incomplète »', async () => {
    changerStatutBien.mockResolvedValue({ etat: 'refus', motif: 'Transition impossible.' });
    expect(await (await POST(demande({ action: 'statut-bien', id: 10, vers: 'ancienne_gestion', effetLe: '2026-10-21' }))).json())
      .toEqual({ etat: 'refus', motif: 'Transition impossible.' });
    expect(evenements).toEqual([]);
    const r = await POST(demande({ action: 'statut-bien', vers: 'en_gestion' }));
    expect(r.status).toBe(400);
    expect(changerStatutBien).toHaveBeenCalledTimes(1);
  });

  it('🔴 404 — après la transition, le dossier Drive du bien est DÉPLACÉ ; un échec est rendu (le statut reste) ; sans la 404, rien n’est tenté', async () => {
    changerStatutBien.mockResolvedValue(issue('en_gestion', 'location_seule'));
    expect(await (await POST(demande({ action: 'statut-bien', id: 10, vers: 'location_seule', effetLe: '2026-10-21' }))).json()).not.toHaveProperty('drive');
    expect(deplacerDossierDuBien).not.toHaveBeenCalled();
    avec404 = true;
    const r = await (await POST(demande({ action: 'statut-bien', id: 10, vers: 'location_seule', effetLe: '2026-10-21' }))).json();
    expect(deplacerDossierDuBien.mock.calls[0].slice(0, 2)).toEqual([10, 'arno@exemple.test']);
    expect(r).toMatchObject({ etat: 'ok', drive: { ok: false, motif: 'RECETTE — écriture dans le Drive non effectuée' } });
  });

  it('🔴 404 — « Créer le dossier » / « Déplacer maintenant » rejouent la création / le déplacement', async () => {
    expect(await (await POST(demande({ action: 'dossier-drive-bien', id: 12, geste: 'creer' }))).json()).toEqual({ etat: 'ok', data: { driveId: 'N5', geste: 'cree' } });
    expect(creerDossierDuBien.mock.calls[0][0]).toBe(12);
    expect(await (await POST(demande({ action: 'dossier-drive-bien', id: 12, geste: 'deplacer' }))).json()).toEqual({ etat: 'refus', motif: 'RECETTE — écriture dans le Drive non effectuée' });
    expect(deplacerDossierDuBien.mock.calls[0][0]).toBe(12);
  });
});
