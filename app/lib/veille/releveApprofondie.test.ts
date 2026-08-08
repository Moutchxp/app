import { describe, it, expect, vi, beforeEach } from 'vitest';

// La relève approfondie réelle passe par la base : on mocke le client DB pour éprouver le SQL émis (fragments sémantiques)
// sans connexion. Les tests d'orchestration/relève utilisent l'INJECTION (aucun accès DB réel).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn(async (fn: (q: unknown) => unknown) => fn(vi.fn())) }));

import { query } from '../db/client';
import {
  releverApprofondie, executerApprofondieAuto, depsReellesApprofondie,
  type ClientApprofondi, type CibleApprofondie, type DepsApprofondie, type DemandeSuivie, type RapportApprofondi,
} from './releveApprofondie';
import type { MessageBoite } from './releveReponses';
import type { MessageEntrant } from './rattachementReponse';

const queryMock = vi.mocked(query as unknown as (...a: unknown[]) => Promise<{ rows: unknown[] }>);

beforeEach(() => { queryMock.mockReset(); });

// ── Fabriques ─────────────────────────────────────────────────────────────────
function msg(uid: number, m: Partial<MessageEntrant> & { messageId: string; deAdresse: string }): MessageBoite {
  return { uid, message: { ...m }, recuLe: new Date('2026-04-18T09:00:00Z'), deNom: null, pieces: [], partiesRapport: undefined };
}

/** Client multi-boîtes FACTICE : mémorise les boîtes ouvertes ; `chercher` renvoie les uid de la boîte courante (le `from` est ignoré, la restriction se fait côté client). */
function clientFactice(contenu: Record<string, { uids: number[]; messages: Record<number, MessageBoite> }>) {
  const ouvertes: string[] = [];
  let courante = '';
  const client: ClientApprofondi = {
    ouvrir: vi.fn(async () => {}),
    listerBoites: vi.fn(async () => Object.keys(contenu)),
    ouvrirBoite: vi.fn(async (c: string) => { ouvertes.push(c); courante = c; }),
    chercher: vi.fn(async () => contenu[courante]?.uids ?? []),
    telechargerMessage: vi.fn(async (uid: number) => contenu[courante].messages[uid]),
    fermer: vi.fn(async () => {}),
  };
  return { client, ouvertes };
}

const CIBLE: CibleApprofondie = {
  demandeId: 42, reference: 'SAVV-2026-000042', destEmail: 'urba@mairie-x.fr', profil: 'entreprise',
  envoyeLe: new Date('2026-03-15T10:00:00Z'), messageIdsEmis: ['<emis-1@sansvisavis.com>'],
};

describe('R6 — releverApprofondie : explore TOUS les dossiers, restreint à la demande', () => {
  it('ouvre INBOX ET les autres dossiers (indésirables), ne retient que le mail lié à la demande', async () => {
    const contenu = {
      INBOX: { uids: [], messages: {} },
      Junk: {
        uids: [10, 11],
        messages: {
          10: msg(10, { messageId: '<rep-mairie@mairie-x.fr>', inReplyTo: '<emis-1@sansvisavis.com>', deAdresse: 'agent@mairie-x.fr', objet: 'RE: votre demande' }), // réponse attendue, tombée dans les indésirables
          11: msg(11, { messageId: '<pub@evil.com>', deAdresse: 'spammer@evil.com', objet: 'Promo' }), // étranger : ni référence ni domaine → ignoré
        },
      },
    };
    const { client, ouvertes } = clientFactice(contenu);

    const rapport = await releverApprofondie({ client, cible: CIBLE }); // simulation (appliquer défaut false)

    expect(ouvertes).toEqual(['INBOX', 'Junk']);          // les dossiers autres qu'INBOX sont bien OUVERTS
    expect(rapport.boitesExplorees).toEqual(['INBOX', 'Junk']);
    expect(rapport.retenus).toBe(1);                       // seul le mail lié est retenu (l'étranger est écarté)
    expect(rapport.rattaches).toBe(1);
    expect(rapport.lignes[0]).toMatchObject({ demandeId: 42, methode: 'message_id', rebond: false });
    expect(rapport.mode).toBe('simulation');
  });

  it('fenêtre = envoi − 1 jour (et non la fenêtre courante)', async () => {
    const { client } = clientFactice({ INBOX: { uids: [], messages: {} } });
    const chercher = client.chercher as unknown as ReturnType<typeof vi.fn>;
    await releverApprofondie({ client, cible: CIBLE });
    // 15 mars 10:00 − 1 j = 14 mars 10:00
    expect(chercher).toHaveBeenCalledWith(expect.objectContaining({ depuis: new Date('2026-03-14T10:00:00Z') }));
  });
});

// ── Orchestration (garde 1/jour + journal), par INJECTION ─────────────────────
function rapportApprofondi(over: Partial<RapportApprofondi> = {}): RapportApprofondi {
  return { mode: 'applique', demandeId: 42, boitesExplorees: ['INBOX'], vus: 1, retenus: 1, rattaches: 1, rebondsRattaches: 0, ecrites: 1, lignes: [], ...over };
}

const DEMANDE_DEPASSEE: DemandeSuivie = {
  demandeId: 42, reference: 'SAVV-2026-000042', destEmail: 'urba@mairie-x.fr',
  envoyeLe: new Date('2026-03-15T10:00:00Z'), statutAcheminement: 'envoye', dossiersActifs: 1, dossiersSatisfaits: 0,
  messageIdsEmis: ['<emis-1@sansvisavis.com>'],
};

function makeDeps(over: Partial<DepsApprofondie> = {}): DepsApprofondie {
  return {
    maintenant: () => new Date('2026-04-20T12:00:00Z'),                            // échéance 15 avril → dépassée
    lireReglages: vi.fn(async () => ({ echeanceAlerteJours: 7, releveFraicheurHeures: 48, profil: 'entreprise' as const })),
    derniereReleveOkLe: vi.fn(async () => new Date('2026-04-20T06:00:00Z')),       // relève fraîche (6 h)
    lireDemandesSuivies: vi.fn(async () => [DEMANDE_DEPASSEE]),
    profilActif: vi.fn(async () => true),
    approfondieFaiteAujourdHui: vi.fn(async () => false),
    releverCible: vi.fn(async () => rapportApprofondi()),
    insererRun: vi.fn(async () => 99),
    finaliserRun: vi.fn(async () => {}),
    ...over,
  };
}

describe('R6 — executerApprofondieAuto : sélection, garde 1/jour, journal', () => {
  it('demande dépassée (relève fraîche) → insererRun (profil, demande_id) puis finaliserRun « ok »', async () => {
    const insererRun = vi.fn(async () => 99);
    const finaliserRun = vi.fn(async () => {});
    const bilan = await executerApprofondieAuto(makeDeps({ insererRun, finaliserRun }));

    expect(bilan).toMatchObject({ examinees: 1, lancees: 1, ignorees: 0, erreurs: 0 });
    expect(insererRun).toHaveBeenCalledWith('entreprise', 42);   // demande_id porté par la ligne releve_run
    expect(finaliserRun).toHaveBeenCalledWith(99, expect.objectContaining({ resultat: 'ok' }));
  });

  it('GARDE : deuxième appel le même jour → ignoré (ni relève ni ligne releve_run)', async () => {
    const releverCible = vi.fn(async () => rapportApprofondi());
    const insererRun = vi.fn(async () => 99);
    const bilan = await executerApprofondieAuto(makeDeps({
      approfondieFaiteAujourdHui: vi.fn(async () => true), releverCible, insererRun,
    }));

    expect(bilan).toMatchObject({ examinees: 1, lancees: 0, ignorees: 1 });
    expect(releverCible).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('état NI dépassé NI proche (loin de l’échéance) → non examiné, aucune relève', async () => {
    const insererRun = vi.fn(async () => 99);
    const bilan = await executerApprofondieAuto(makeDeps({
      maintenant: () => new Date('2026-04-01T12:00:00Z'), // échéance 15 avril, 14 j > seuil 7 → en_cours
      insererRun,
    }));
    expect(bilan.examinees).toBe(0);
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('POINT CENTRAL : relève courante trop ancienne → tout « indéterminé » → aucune approfondie', async () => {
    const insererRun = vi.fn(async () => 99);
    const bilan = await executerApprofondieAuto(makeDeps({
      derniereReleveOkLe: vi.fn(async () => new Date('2026-04-01T00:00:00Z')), // 19 j > 48 h
      insererRun,
    }));
    expect(bilan.examinees).toBe(0); // sans relève fraîche, on n'annonce aucun silence, donc aucune approfondie
    expect(insererRun).not.toHaveBeenCalled();
  });

  it('profil inactif (pas de compte IMAP) → rien, aucune lecture de demandes', async () => {
    const lireDemandesSuivies = vi.fn(async () => [DEMANDE_DEPASSEE]);
    const releverCible = vi.fn(async () => rapportApprofondi());
    const bilan = await executerApprofondieAuto(makeDeps({ profilActif: vi.fn(async () => false), lireDemandesSuivies, releverCible }));

    expect(bilan).toMatchObject({ examinees: 0, lancees: 0 });
    expect(lireDemandesSuivies).not.toHaveBeenCalled();
    expect(releverCible).not.toHaveBeenCalled();
  });

  it('ISOLATION : un échec sur une demande → journal « erreur », les suivantes continuent', async () => {
    const d2: DemandeSuivie = { ...DEMANDE_DEPASSEE, demandeId: 43 };
    const releverCible = vi.fn()
      .mockRejectedValueOnce(new Error('IMAP timeout')) // demande 42 échoue
      .mockResolvedValueOnce(rapportApprofondi({ demandeId: 43 })); // demande 43 réussit
    const finaliserRun = vi.fn(async () => {});
    const bilan = await executerApprofondieAuto(makeDeps({
      lireDemandesSuivies: vi.fn(async () => [DEMANDE_DEPASSEE, d2]),
      releverCible, finaliserRun,
    }));

    expect(bilan).toMatchObject({ examinees: 2, lancees: 1, erreurs: 1 });
    expect(finaliserRun).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ resultat: 'erreur', erreur: 'IMAP timeout' }));
  });
});

describe('R6 — depsReellesApprofondie : SQL émis (fragments sémantiques, paramètres liés)', () => {
  it('insererRun : INSERT dans releve_run avec declencheur « approfondi » et demande_id lié', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 77 }] });
    const id = await depsReellesApprofondie().insererRun('entreprise', 42);

    expect(id).toBe(77);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO releve_run');
    expect(norm).toContain("'approfondi'");
    expect(norm).toContain('demande_id');
    expect(params).toEqual(['entreprise', 42]);
  });

  it('approfondieFaiteAujourdHui : garde du jour par declencheur + demande_id (paramètre lié)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ fait: true }] });
    const fait = await depsReellesApprofondie().approfondieFaiteAujourdHui(42);

    expect(fait).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM releve_run');
    expect(norm).toContain("declencheur = 'approfondi'");
    expect(norm).toContain('demande_id = $1');
    expect(norm).toContain("date_trunc('day', now())");
    expect(params).toEqual([42]);
  });
});
