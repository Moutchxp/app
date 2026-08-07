import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R3 — orchestration de la relève. FAUX ClientBoite (aucun réseau) + `../db/client` mocké (candidates, date de départ,
 * Message-ID connus, écritures). Protocole : comportement + paramètres liés + fragments SQL sémantiques normalisés.
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

import { releverBoite, type ClientBoite, type MessageBoite, type PieceMeta } from './releveReponses';
import type { MessageEntrant } from './rattachementReponse';

const trouver = (r: RegExp) => appels.find((a) => r.test(a.sql));
const DEPUIS = new Date('2026-08-01T00:00:00.000Z');
const CAND_A = { id: 1, reference: 'SVAV-DEM-2026-000154', message_ids: ['<abc-154@sansvisavis.com>'] };

let uidSeq = 0;
const boite = (message: Partial<MessageEntrant>, pieces: PieceMeta[] = []): MessageBoite => ({
  uid: ++uidSeq,
  message: { messageId: '<m@x>', deAdresse: 'urba@mairie.fr', ...message },
  recuLe: new Date('2026-08-10T10:00:00.000Z'),
  deNom: null,
  pieces,
});

function fauxClient(messages: MessageBoite[]) {
  const suivi = { ouvert: 0, ferme: 0, recherches: [] as Date[], uidsTelecharges: [] as number[] };
  const client: ClientBoite = {
    async ouvrir() { suivi.ouvert += 1; },
    async chercherDepuis(d) { suivi.recherches.push(d); return messages.map((m) => m.uid); },
    async telechargerMessage(uid) { suivi.uidsTelecharges.push(uid); const m = messages.find((x) => x.uid === uid); if (!m) throw new Error(`uid ${uid}`); return m; },
    async fermer() { suivi.ferme += 1; },
  };
  return { client, suivi };
}

beforeEach(() => {
  appels.length = 0; uidSeq = 0;
  etat.candidates = [CAND_A]; etat.depuis = DEPUIS; etat.knownIds = []; etat.domaines = []; etat.rebondRowCount = 1; etat.conflit = false; etat.nextId = 4242;
});

describe('R3 — releverBoite', () => {
  it('message déjà connu (Message-ID en base) → ignoré, aucune écriture', async () => {
    etat.knownIds = ['<known@x>'];
    const { client, suivi } = fauxClient([boite({ messageId: '<known@x>', corpsTexte: 'SVAV-DEM-2026-000154' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.vus).toBe(1);
    expect(r.dejaConnus).toBe(1);
    expect(r.lignes).toHaveLength(0);
    expect(suivi.ouvert).toBe(1);
    expect(trouver(/RETURNING id/i)).toBeUndefined(); // rien enregistré
  });

  it('rattaché par threading → ligne demande_id + enregistré (appliquer)', async () => {
    const { client } = fauxClient([boite({ messageId: '<r1@mairie>', references: ['<abc-154@sansvisavis.com>'], corpsTexte: 'Bonjour, voici.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rattaches).toBe(1);
    expect(r.nonRattaches).toBe(0);
    expect(r.parMethode).toEqual({ message_id: 1 });
    expect(r.ecrites).toBe(1);
    expect(r.lignes[0]).toMatchObject({ demandeId: 1, methode: 'message_id' });
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBe(1);           // demande_id lié
    expect(ins.params[10]).toBe('message_id'); // rattachement_methode lié
  });

  it('domaine expéditeur = domaine d’un dest_email, sans référence → RETENU, demande_id null (file à rattacher)', async () => {
    etat.domaines = ['mairie-aubervilliers.fr'];
    const { client } = fauxClient([boite({ messageId: '<r2@mairie>', deAdresse: 'agent.urbanisme@mairie-aubervilliers.fr', corpsTexte: 'Bonjour, bien reçu, nous traitons.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
    expect(r.rattaches).toBe(0);
    expect(r.nonRattaches).toBe(1);
    expect(r.lignes[0].demandeId).toBeNull();
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBeNull();        // demande_id null (file à rattacher)
  });

  it('rebond rattaché de façon certaine → passe l’acheminement à « rebond »', async () => {
    const { client } = fauxClient([boite({ messageId: '<ndr@google>', references: ['<abc-154@sansvisavis.com>'], deAdresse: 'mailer-daemon@googlemail.com', objet: 'Delivery Status Notification (Failure)' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsDetectes).toBe(1);
    expect(r.rebondsAppliques).toBe(1);
    const upd = trouver(/UPDATE demande_acheminement/i)!;
    expect(upd.params[0]).toBe(1);           // demande_id
    const s = upd.sql.replace(/\s+/g, ' ');
    expect(s).toContain("statut = 'rebond'");
    expect(s).toContain("statut = 'envoye'"); // uniquement sur les lignes encore 'envoye'
    expect(s).not.toContain('demande SET statut'); // n'écrit JAMAIS demande.statut
  });

  it('appliquer=false (simulation) → aucune écriture, mais rapport complet', async () => {
    const { client } = fauxClient([boite({ messageId: '<r3@mairie>', references: ['<abc-154@sansvisavis.com>'], deAdresse: 'mailer-daemon@x' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false });
    expect(r.mode).toBe('simulation');
    expect(r.lignes).toHaveLength(1);          // ce qui SERAIT écrit
    expect(r.ecrites).toBe(0);
    expect(r.rebondsAppliques).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
    expect(trouver(/UPDATE demande_acheminement/i)).toBeUndefined();
  });

  it('plafond respecté : ne traite que les plus récents', async () => {
    const cinq = [1, 2, 3, 4, 5].map((n) => boite({ messageId: `<m${n}@x>` }));
    const { client, suivi } = fauxClient(cinq);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, plafond: 2, appliquer: false });
    expect(r.vus).toBe(2);
    expect(suivi.uidsTelecharges).toHaveLength(2);
  });

  it('aucune demande envoyée → PAS de connexion', async () => {
    etat.candidates = []; etat.depuis = null;
    const { client, suivi } = fauxClient([boite({ messageId: '<x@y>' })]);
    const r = await releverBoite({ client, profil: 'entreprise' }); // pas d'override depuis → calcul → null
    expect(r.connecte).toBe(false);
    expect(r.vus).toBe(0);
    expect(suivi.ouvert).toBe(0); // jamais connecté
  });
});

describe('R3b — filtre de pertinence', () => {
  it('newsletter (aucun critère) → ignorée, comptée « hors périmètre », jamais enregistrée', async () => {
    etat.domaines = ['mairie-aubervilliers.fr'];
    const { client } = fauxClient([boite({ messageId: '<promo@newsletter-immo.fr>', deAdresse: 'news@newsletter-immo.fr', objet: 'Nos annonces immobilières de la semaine', corpsTexte: 'Découvrez nos biens.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.horsPerimetre).toBe(1);
    expect(r.retenus).toBe(0);
    expect(r.lignes).toHaveLength(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined(); // jamais enregistrée
  });

  it('domaine tiers mais objet contenant le fragment émis → RETENU', async () => {
    etat.domaines = ['mairie-aubervilliers.fr'];
    const { client } = fauxClient([boite({ messageId: '<x@prestataire.fr>', deAdresse: 'contact@prestataire-tiers.fr', objet: 'RE: Demande de communication de documents administratifs — Aubervilliers' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false });
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
    expect(r.lignes[0].demandeId).toBeNull();
  });

  it('rebond depuis un domaine tiers → RETENU (critère rebond)', async () => {
    etat.domaines = ['mairie-aubervilliers.fr'];
    const { client } = fauxClient([boite({ messageId: '<ndr@googlemail.com>', deAdresse: 'mailer-daemon@googlemail.com', objet: 'Delivery Status Notification (Failure)' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.retenus).toBe(1);
    expect(r.rebondsDetectes).toBe(1);
    expect(r.rebondsAppliques).toBe(0); // non rattaché → pas de MAJ d'acheminement
    expect(r.lignes[0].demandeId).toBeNull();
  });

  it('message rattaché → RETENU quel que soit le domaine', async () => {
    const { client } = fauxClient([boite({ messageId: '<r@tiers-inconnu.fr>', deAdresse: 'inconnu@tiers-inconnu.fr', references: ['<abc-154@sansvisavis.com>'] })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false });
    expect(r.retenus).toBe(1);
    expect(r.rattaches).toBe(1);
    expect(r.lignes[0].methode).toBe('message_id');
  });

  it('--sans-filtre → tout est retenu (même une newsletter)', async () => {
    const { client } = fauxClient([boite({ messageId: '<promo@x>', deAdresse: 'news@newsletter.fr', objet: 'Promo' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false, sansFiltre: true });
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
  });
});
