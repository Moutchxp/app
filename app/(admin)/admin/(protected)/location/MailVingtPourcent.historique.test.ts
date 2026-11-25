import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 Arno (25/11/2026, point 4) — « chaque mail envoyé est inscrit dans l'historique de chaque personne concernée (locataire, propriétaire, contact
 * syndic), du bien et de la copropriété, comme les autres mails de l'application (même mécanisme, journal) » ; décision 3A : bien et personnes, la
 * copropriété par ses biens (pas d'historique de mails par copropriété). Le MÊME mécanisme que les autres mails : rien d'inventé ici.
 */
vi.mock('server-only', () => ({}));
const biensDesClients = vi.fn();
vi.mock('../../../../lib/gestion/biensDesClientsRepo', () => ({ biensDesClients: (...a: unknown[]) => biensDesClients(...a) }));
const { ciblesAvecLeBien } = await import('./MailVingtPourcent');
const { ciblesCoherentes, ciblesDemandees } = await import('../../../api/admin/gestion/envois/route');

const L = { lotId: 445, lotCle: 'W445', logement: '1 rue du Préavis de Test' };

describe('🔴 le bien de la ligne part comme cible EXPLICITE', () => {
  it('ajoutée si absente ; une cible du même bien venue des adresses (« origine ») devient explicite ; les autres cibles restent', () => {
    expect(ciblesAvecLeBien([], L)).toEqual([{ sorte: 'lot', cle: 'W445', id: 445, libelle: '1 rue du Préavis de Test' }]);
    expect(ciblesAvecLeBien([{ sorte: 'lot', cle: 'W445', id: 445, libelle: 'Lot 445 — Puteaux', origine: 'client' }], L))
      .toEqual([{ sorte: 'lot', cle: 'W445', id: 445, libelle: 'Lot 445 — Puteaux' }]);
    expect(ciblesAvecLeBien([{ sorte: 'lot', cle: 'W9', id: 9, libelle: 'autre' }], L)).toEqual([
      { sorte: 'lot', cle: 'W445', id: 445, libelle: '1 rue du Préavis de Test' }, { sorte: 'lot', cle: 'W9', id: 9, libelle: 'autre' }]);
  });
  it('le filet de l’envoi (ciblesCoherentes) la GARDE, même pour un mail au seul syndic : aucune relecture des biens des destinataires', async () => {
    biensDesClients.mockReset().mockResolvedValue({});
    const r = await ciblesCoherentes(ciblesDemandees(ciblesAvecLeBien([], L)), ['syndic@exemple.test']);
    expect(r.gardees.map((c) => [c.sorte, c.cle, c.id])).toEqual([['lot', 'W445', 445]]);
    expect(biensDesClients).not.toHaveBeenCalled();
  });
});

describe('🔴 le même mécanisme que les autres mails : envoi → cible → rattachement confirmé → historique ; journal', () => {
  it('le module envoie ses cibles ; le module de la ligne les fixe sur le bien', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8')).toContain('cibles: (b.cibles ?? []).length > 0 ? b.cibles : undefined,');
    expect(readFileSync('app/(admin)/admin/(protected)/location/MailVingtPourcent.tsx', 'utf8')).toContain('cibles: ciblesAvecLeBien(b.cibles, l) as BrouillonEcran[\'cibles\']');
  });
  it('l’envoi écrit la cible (gestion_envoi_cible) et sa ligne de journal ; la capture du mail envoyé en fait un rattachement confirmé', () => {
    expect(readFileSync('app/lib/gestion/envoiReel.ts', 'utf8')).toContain('enregistrerCiblesEnvoi');
    expect(readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8')).toContain('INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle)');
    expect(readFileSync('app/lib/gestion/captureImmediateReelle.ts', 'utf8')).toContain('await c.appliquerCiblesEnAttente();');
    expect(readFileSync('app/lib/gestion/suiteReleveReel.ts', 'utf8')).toContain('const posesEnvoi = await appliquerCiblesEnAttente();');
  });
});
