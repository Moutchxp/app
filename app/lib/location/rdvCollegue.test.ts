import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (18/11/2026, 2e lot) — le COLLÈGUE d'un rendez-vous de préavis (pré-visite ET état des lieux) : mécanisme des tâches, PARTAGÉ et inchangé.
 *  · confié à soi-même → confirmé d'office, aucun mail ; confié à un autre → invitation « Accepter / Refuser », cartouche « En attente… » ;
 *  · il accepte → cartouche « Confirmé » (vert), et l'INITIATEUR (qui a fixé ou déplacé le rendez-vous) reçoit le mail ;
 *  · il refuse → cartouche « Refusé… » (rouge), et l'initiateur reçoit AUSSI le mail.
 * Base et transport simulés : on regarde ce qui part et à qui.
 */
const h = vi.hoisted(() => ({
  demande: { tache_id: 60, statut: 'acceptee', automatique: false, destinataire_id: 3, destinataire_libelle: 'Collègue ESSAI' },
  envoyes: [] as { a: string[] }[],
}));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('FROM gestion_tache_reglage')) return { rows: [{ e: true, d: 7, le: new Date(), par: 'x' }] };
    if (s.includes('FROM gestion_tache_demande WHERE id = $1')) return { rows: [{ ...h.demande }] };
    return { rows: [] };
  },
  withTransaction: vi.fn(),
}));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));
vi.mock('../gestion/mailTacheRepo', async (orig) => ({
  ...(await orig<typeof import('../gestion/mailTacheRepo')>()),
  // l'INITIATEUR : celui qui a posé la demande (à la création, ou en déplaçant le rendez-vous : la demande est relancée en son nom)
  adresseDuDemandeur: async () => ({ email: 'initiateur@sansvisavis.com', libelle: 'Initiateur ESSAI' }),
  messageDeLaDemande: async (o: { a: string[] }) => ({ ok: true, m: { message: { a: o.a } } }),
}));
vi.mock('../gestion/envoiDemandeTache', () => ({
  transportParDefaut: () => ({ envoyer: async (m: { a: string[] }) => { h.envoyes.push(m); return { ok: true, factice: false }; } }),
  avecVerrouTest: (t: unknown) => t,
}));
vi.mock('./previsiteMailTache', () => ({ journaliserMailTachePrevisite: async () => {} }));

import { envoyerConfirmationAcceptation } from '../gestion/acceptationRepo';
import { acceptationInitiale } from '../gestion/acceptationTache';
import { LIBELLE_ETAT_MISSION, missionDeLigne } from './triRdvPreavis';
import { CSS_PREAVIS_ACCUEIL } from '../../(admin)/admin/(protected)/location/PreavisAccueil';

beforeEach(() => { h.envoyes = []; });

const ligne = (sorte: 'previsite' | 'edl', statut: string | null) => (sorte === 'edl'
  ? { edls: { confieA: 'Collègue ESSAI', statut } }
  : { previsite: { collegues: [{ libelle: 'Collègue ESSAI', statut }] } }) as Parameters<typeof missionDeLigne>[0];

describe.each(['previsite', 'edl'] as const)('🔴 le collègue d’un rendez-vous de %s', (sorte) => {
  it('confié à soi-même : confirmé d’office (aucun mail ne part, même pas à l’initiateur)', async () => {
    expect(acceptationInitiale(2, 2)).toBe('acceptee');
    h.demande = { ...h.demande, statut: 'acceptee', automatique: true };
    expect(await envoyerConfirmationAcceptation(1)).toBeNull();
    expect(h.envoyes).toEqual([]);
    expect(missionDeLigne(ligne(sorte, 'acceptee'), sorte)?.etat).toBe('confirme');
  });
  it('confié à un autre collègue : invitation (demande en attente), cartouche « En attente de confirmation »', () => {
    expect(acceptationInitiale(3, 2)).toBe('en_attente');
    const m = missionDeLigne(ligne(sorte, 'en_attente'), sorte)!;
    expect(m).toEqual({ qui: 'Collègue ESSAI', etat: 'attente' });
    expect(LIBELLE_ETAT_MISSION[m.etat]).toBe('En attente de confirmation');
  });
  it('il accepte : cartouche « Confirmé » (vert), et l’initiateur reçoit le mail', async () => {
    h.demande = { ...h.demande, statut: 'acceptee', automatique: false };
    expect(await envoyerConfirmationAcceptation(1)).toBe('envoye');
    expect(h.envoyes.map((m) => m.a)).toEqual([['gestion@criterimmo.fr', 'initiateur@sansvisavis.com']]);
    const m = missionDeLigne(ligne(sorte, 'acceptee'), sorte)!;
    expect(LIBELLE_ETAT_MISSION[m.etat]).toBe('Confirmé');
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-etat-mission--confirme\{[^}]*var\(--color-svv-green/);
  });
  it('il refuse : cartouche « Refusé — à réattribuer » (rouge), et l’initiateur reçoit AUSSI le mail', async () => {
    h.demande = { ...h.demande, statut: 'refusee', automatique: false };
    expect(await envoyerConfirmationAcceptation(1)).toBe('envoye');
    expect(h.envoyes.map((m) => m.a)).toEqual([['gestion@criterimmo.fr', 'initiateur@sansvisavis.com']]);
    const m = missionDeLigne(ligne(sorte, 'refusee'), sorte)!;
    expect(LIBELLE_ETAT_MISSION[m.etat]).toBe('Refusé — à réattribuer');
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-etat-mission--refuse\{[^}]*color:var\(--color-svv-red\)/);
  });
});
