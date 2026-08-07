import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R3 / R3b / R3c — orchestration de la relève. FAUX ClientBoite (aucun réseau) + `../db/client` mocké (candidates, date de
 * départ, Message-ID connus, domaines destinataires, écritures). Protocole : comportement + paramètres liés + fragments SQL
 * sémantiques normalisés. Le faux client simule la recherche serveur `from` par sous-chaîne de l'adresse d'expédition.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = {
    candidates: [] as { id: number; reference: string; message_ids: string[] }[],
    depuis: null as Date | null,
    knownIds: [] as string[],
    domaines: [] as string[],
    rebondRowCount: 1,
    conflit: false,
    nextId: 4242,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/min\(a\.envoye_le\)/i.test(sql)) return { rows: [{ depuis: etat.depuis }], rowCount: 1 };
    if (/array_agg\(a\.message_id\)/i.test(sql)) return { rows: etat.candidates, rowCount: etat.candidates.length };
    if (/FROM demande_reponse WHERE profil_boite/i.test(sql)) return { rows: etat.knownIds.map((m) => ({ message_id: m })), rowCount: etat.knownIds.length };
    if (/split_part\(dest_email/i.test(sql)) return { rows: etat.domaines.map((d) => ({ domaine: d })), rowCount: etat.domaines.length };
    if (/UPDATE demande_acheminement/i.test(sql)) return { rows: [], rowCount: etat.rebondRowCount };
    return { rows: [], rowCount: 0 };
  };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      if (/RETURNING id/i.test(sql)) return etat.conflit ? { rows: [], rowCount: 0 } : { rows: [{ id: etat.nextId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { releverBoite, type ClientBoite, type MessageBoite, type PieceMeta, type CritereRecherche } from './releveReponses';
import type { MessageEntrant } from './rattachementReponse';

const trouver = (r: RegExp) => appels.find((a) => r.test(a.sql));
const DEPUIS = new Date('2026-08-01T00:00:00.000Z');
const CAND_A = { id: 1, reference: 'SVAV-DEM-2026-000154', message_ids: ['<abc-154@sansvisavis.com>'] };

let uidSeq = 0;
const boite = (message: Partial<MessageEntrant>, pieces: PieceMeta[] = []): MessageBoite => ({
  uid: ++uidSeq,
  message: { messageId: `<m${uidSeq}@x>`, deAdresse: 'urba@mairie.fr', ...message },
  recuLe: new Date('2026-08-10T10:00:00.000Z'),
  deNom: null,
  pieces,
});

/** Faux client : `chercher({from})` = messages dont l'adresse contient `from` (substring) ; sans `from` = tous. Override possible. */
function fauxClient(messages: MessageBoite[], rechercheImpl?: (c: CritereRecherche) => number[]) {
  const suivi = { ouvert: 0, ferme: 0, recherches: [] as CritereRecherche[], uidsTelecharges: [] as number[] };
  const client: ClientBoite = {
    async ouvrir() { suivi.ouvert += 1; },
    async chercher(c) {
      suivi.recherches.push(c);
      if (rechercheImpl) return rechercheImpl(c);
      const f = c.from?.toLowerCase();
      return messages.filter((m) => f === undefined || m.message.deAdresse.toLowerCase().includes(f)).map((m) => m.uid);
    },
    async telechargerMessage(uid) { suivi.uidsTelecharges.push(uid); const m = messages.find((x) => x.uid === uid); if (!m) throw new Error(`uid ${uid}`); return m; },
    async fermer() { suivi.ferme += 1; },
  };
  return { client, suivi };
}

beforeEach(() => {
  appels.length = 0; uidSeq = 0;
  etat.candidates = [CAND_A]; etat.depuis = DEPUIS; etat.knownIds = []; etat.domaines = []; etat.rebondRowCount = 1; etat.conflit = false; etat.nextId = 4242;
});

describe('R3c — sélection serveur par domaine', () => {
  it('appelle la recherche une fois PAR domaine destinataire (bon critère) + une passe générale', async () => {
    etat.domaines = ['ville-a.fr', 'ville-b.fr'];
    const { client, suivi } = fauxClient([boite({ deAdresse: 'x@ville-a.fr' })]);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.recherches.filter((c) => c.from === 'ville-a.fr')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === 'ville-b.fr')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === undefined)).toHaveLength(1); // passe générale (rebonds)
  });

  it('l’union déduplique un message renvoyé par deux domaines (téléchargé une seule fois)', async () => {
    etat.domaines = ['ville-a.fr', 'ville-b.fr'];
    const { client, suivi } = fauxClient(
      [boite({ deAdresse: 'contact@ville-a.fr' })],
      (c) => (c.from !== undefined ? [1] : []), // les deux recherches par domaine renvoient le MÊME uid
    );
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.uidsServeur).toBe(1);
    expect(suivi.uidsTelecharges).toEqual([1]); // dédupliqué
    expect(r.vus).toBe(1);
    expect(r.retenus).toBe(1);
  });

  it('aucune demande envoyée → PAS de connexion, aucune recherche', async () => {
    etat.candidates = []; etat.depuis = null;
    const { client, suivi } = fauxClient([boite({})]);
    const r = await releverBoite({ client, profil: 'entreprise' });
    expect(r.connecte).toBe(false);
    expect(suivi.ouvert).toBe(0);
    expect(suivi.recherches).toHaveLength(0);
  });

  it('dépassement du plafond → on garde les plus récents ET on le signale', async () => {
    etat.domaines = ['mairie.fr'];
    const cinq = [1, 2, 3, 4, 5].map(() => boite({ deAdresse: 'urba@mairie.fr' }));
    const { client, suivi } = fauxClient(cinq);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, plafond: 2 });
    expect(r.uidsServeur).toBe(5);
    expect(r.plafondAtteint).toBe(true);
    expect(r.vus).toBe(2);
    expect(suivi.uidsTelecharges).toEqual([4, 5]); // les plus récents
  });
});

describe('R3c — passe générale (rebonds) & filtre R3b en dernier rideau', () => {
  it('rebond depuis un domaine tiers → attrapé par la passe générale', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'mailer-daemon@google.com', objet: 'Delivery Status Notification (Failure)' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.retenus).toBe(1);
    expect(r.rebondsDetectes).toBe(1);
    expect(r.rebondsPasseGenerale).toBe(1);
    expect(r.lignes[0].demandeId).toBeNull();
  });

  it('rebond rattaché (référence) → passe l’acheminement à « rebond », jamais demande.statut', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'mailer-daemon@google.com', references: ['<abc-154@sansvisavis.com>'], objet: 'Delivery Status Notification (Failure)' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsAppliques).toBe(1);
    const upd = trouver(/UPDATE demande_acheminement/i)!;
    expect(upd.params[0]).toBe(1);
    const s = upd.sql.replace(/\s+/g, ' ');
    expect(s).toContain("statut = 'rebond'");
    expect(s).toContain("statut = 'envoye'");
    expect(s).not.toContain('demande SET statut');
  });

  it('newsletter d’un domaine tiers (ni rebond, ni rattachée) → hors périmètre, jamais enregistrée', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'news@newsletter-immo.fr', objet: 'Nos annonces de la semaine', corpsTexte: 'Découvrez nos biens.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.horsPerimetre).toBe(1);
    expect(r.retenus).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
  });

  it('--sans-filtre → tout est retenu (même une newsletter tierce)', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'news@newsletter.fr', objet: 'Promo' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false, sansFiltre: true });
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
  });
});

describe('R3 — cas de base (adaptés à la sélection serveur)', () => {
  it('message déjà connu (Message-ID en base) → ignoré, aucune écriture', async () => {
    etat.domaines = ['mairie.fr']; etat.knownIds = ['<known@x>'];
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie.fr', messageId: '<known@x>' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.vus).toBe(1);
    expect(r.dejaConnus).toBe(1);
    expect(r.lignes).toHaveLength(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
  });

  it('réponse d’un domaine destinataire, rattachée par threading → retenue + enregistrée', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie.fr', references: ['<abc-154@sansvisavis.com>'], corpsTexte: 'Bonjour.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rattaches).toBe(1);
    expect(r.parMethode).toEqual({ message_id: 1 });
    expect(r.ecrites).toBe(1);
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBe(1);
    expect(ins.params[10]).toBe('message_id');
  });

  it('réponse d’un domaine destinataire, sans référence → retenue, demande_id null (file à rattacher)', async () => {
    etat.domaines = ['mairie-aubervilliers.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'agent.urbanisme@mairie-aubervilliers.fr', corpsTexte: 'Bien reçu, nous traitons.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.retenus).toBe(1);
    expect(r.rattaches).toBe(0);
    expect(r.nonRattaches).toBe(1);
    expect(r.lignes[0].demandeId).toBeNull();
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBeNull();
  });

  it('appliquer=false (simulation) → aucune écriture, mais rapport complet', async () => {
    etat.domaines = ['mairie.fr'];
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie.fr', references: ['<abc-154@sansvisavis.com>'] })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false });
    expect(r.mode).toBe('simulation');
    expect(r.retenus).toBe(1);
    expect(r.ecrites).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
    expect(trouver(/UPDATE demande_acheminement/i)).toBeUndefined();
  });
});
