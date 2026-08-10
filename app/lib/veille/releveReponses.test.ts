import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R3 → R3d — orchestration de la relève. FAUX ClientBoite (aucun réseau) + `../db/client` mocké. Le faux client simule la
 * recherche serveur `from` par sous-chaîne de l'adresse d'expédition (comme IMAP SEARCH FROM). Protocole : comportement +
 * paramètres liés + fragments SQL sémantiques normalisés.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = {
    candidates: [] as { id: number; reference: string; dest_email: string; message_ids: string[]; num_daus: string[]; refs_externes?: string[] }[],
    depuis: null as Date | null,
    knownIds: [] as string[],
    domaines: [] as string[],
    references: [] as string[], // R3e — num_dau renvoyés par lireReferencesRecherche
    rebondRowCount: 1,
    conflit: false,
    nextId: 4242,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/\(dd\.satisfait_le IS NULL\) DESC/i.test(sql)) return { rows: etat.references.map((n) => ({ num_dau: n })), rowCount: etat.references.length }; // R3e/R3f lireReferencesRecherche (signature du tri)
    if (/DISTINCT re\.reference/i.test(sql)) { const refs = [...new Set(etat.candidates.flatMap((c) => c.refs_externes ?? []))]; return { rows: refs.map((reference) => ({ reference })), rowCount: refs.length }; } // R3f références MAIRIE à interroger
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
import type { PartieRapport } from './rapportRejet';

const trouver = (r: RegExp) => appels.find((a) => r.test(a.sql));
const DEPUIS = new Date('2026-08-01T00:00:00.000Z');
const CAND_A = { id: 1, reference: 'SVAV-DEM-2026-000154', dest_email: 'urba@mairie-aubervilliers.fr', message_ids: ['<abc-154@sansvisavis.com>'], num_daus: [] as string[], refs_externes: [] as string[] };
const dsnCorps = (dest: string) => ['Your message could not be delivered.', `Final-Recipient: rfc822; ${dest}`, 'Action: failed', 'Status: 5.1.1', 'Diagnostic-Code: smtp; 550 5.1.1 No such user'].join('\n');

let uidSeq = 0;
const boite = (message: Partial<MessageEntrant>, extra: { pieces?: PieceMeta[]; partiesRapport?: PartieRapport[] } = {}): MessageBoite => ({
  uid: ++uidSeq,
  message: { messageId: `<m${uidSeq}@x>`, deAdresse: 'urba@mairie-aubervilliers.fr', ...message },
  recuLe: new Date('2026-08-10T10:00:00.000Z'),
  deNom: null,
  pieces: extra.pieces ?? [],
  partiesRapport: extra.partiesRapport,
});

function fauxClient(messages: MessageBoite[], rechercheImpl?: (c: CritereRecherche) => number[], refImpl?: (refs: string[]) => number[]) {
  const suivi = { ouvert: 0, ferme: 0, recherches: [] as CritereRecherche[], referencesInterrogees: [] as string[], uidsTelecharges: [] as number[] };
  const client: ClientBoite = {
    async ouvrir() { suivi.ouvert += 1; },
    async chercher(c) {
      suivi.recherches.push(c);
      if (rechercheImpl) return rechercheImpl(c);
      const f = c.from?.toLowerCase();
      return messages.filter((m) => f === undefined || m.message.deAdresse.toLowerCase().includes(f)).map((m) => m.uid);
    },
    async chercherReferences(_depuis, references) {
      suivi.referencesInterrogees.push(...references);
      return refImpl ? refImpl(references) : [];
    },
    async telechargerMessage(uid) { suivi.uidsTelecharges.push(uid); const m = messages.find((x) => x.uid === uid); if (!m) throw new Error(`uid ${uid}`); return m; },
    async fermer() { suivi.ferme += 1; },
  };
  return { client, suivi };
}

beforeEach(() => {
  appels.length = 0; uidSeq = 0;
  etat.candidates = [CAND_A]; etat.depuis = DEPUIS; etat.knownIds = []; etat.domaines = ['mairie-aubervilliers.fr']; etat.references = []; etat.rebondRowCount = 1; etat.conflit = false; etat.nextId = 4242;
});

describe('R3c/R3d — recherches serveur', () => {
  it('une recherche PAR domaine destinataire + sondes mailer-daemon & postmaster (pas de passe générale)', async () => {
    etat.domaines = ['ville-a.fr', 'ville-b.fr'];
    const { client, suivi } = fauxClient([boite({ deAdresse: 'x@ville-a.fr' })]);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.recherches.filter((c) => c.from === 'ville-a.fr')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === 'ville-b.fr')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === 'mailer-daemon')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === 'postmaster')).toHaveLength(1);
    expect(suivi.recherches.filter((c) => c.from === undefined)).toHaveLength(0); // plus de passe générale
  });

  it('union déduplique un UID renvoyé par deux domaines (téléchargé une fois)', async () => {
    etat.domaines = ['ville-a.fr', 'ville-b.fr'];
    const { client, suivi } = fauxClient([boite({ deAdresse: 'contact@ville-a.fr' })], (c) => (['ville-a.fr', 'ville-b.fr'].includes(c.from ?? '') ? [1] : []));
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.uidsServeur).toBe(1);
    expect(suivi.uidsTelecharges).toEqual([1]);
  });

  it('aucune demande envoyée → pas de connexion, aucune recherche', async () => {
    etat.candidates = []; etat.depuis = null; etat.domaines = [];
    const { client, suivi } = fauxClient([boite({})]);
    const r = await releverBoite({ client, profil: 'entreprise' });
    expect(r.connecte).toBe(false);
    expect(suivi.ouvert).toBe(0);
    expect(suivi.recherches).toHaveLength(0);
  });

  it('dépassement du plafond → plus récents + avertissement', async () => {
    etat.domaines = ['mairie.fr'];
    const cinq = [1, 2, 3, 4, 5].map(() => boite({ deAdresse: 'urba@mairie.fr' }));
    const { client, suivi } = fauxClient(cinq);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, plafond: 2 });
    expect(r.uidsServeur).toBe(5);
    expect(r.plafondAtteint).toBe(true);
    expect(suivi.uidsTelecharges).toEqual([4, 5]);
  });
});

describe('R3d — rattachement réel des rebonds', () => {
  it('rebond dont le Message-ID d’origine est connu → rattaché + acheminement passe à « rebond »', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'MAILER-DAEMON@google.com', objet: 'Delivery Status Notification (Failure)', corpsTexte: dsnCorps('urba@mairie-aubervilliers.fr') },
      { partiesRapport: [{ typeMime: 'message/rfc822', contenu: 'Message-ID: <abc-154@sansvisavis.com>\r\n' }] },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsDetectes).toBe(1);
    expect(r.rebondsRattaches).toBe(1);
    expect(r.rebondsAppliques).toBe(1);
    expect(r.rattaches).toBe(1);
    const upd = trouver(/UPDATE demande_acheminement/i)!;
    expect(upd.params[0]).toBe(1);
    const s = upd.sql.replace(/\s+/g, ' ');
    expect(s).toContain("statut = 'rebond'");
    expect(s).toContain("statut = 'envoye'");
    expect(s).not.toContain('demande SET statut');
  });

  it('rebond dont seul le destinataire correspond à un dest_email → rattaché + bascule', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'postmaster@google.com', objet: 'Undeliverable', corpsTexte: dsnCorps('urba@mairie-aubervilliers.fr') }, // pas de partie rfc822 → pas de Message-ID
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsRattaches).toBe(1);
    expect(r.rebondsAppliques).toBe(1);
    expect(r.lignes[0].demandeId).toBe(1);
  });

  it('rebond ÉTRANGER (ni Message-ID connu, ni destinataire connu) → NON enregistré, compté en rebondsEtrangers', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'mailer-daemon@google.com', objet: 'Failure', corpsTexte: dsnCorps('quelquun-dautre@random.org') },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsDetectes).toBe(1);
    expect(r.rebondsEtrangers).toBe(1);
    expect(r.rebondsRattaches).toBe(0);
    expect(r.retenus).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();       // jamais enregistré
    expect(trouver(/UPDATE demande_acheminement/i)).toBeUndefined();
  });
});

describe('R3 — réponses normales & garde-fous', () => {
  it('message déjà connu → ignoré, aucune écriture', async () => {
    etat.knownIds = ['<known@x>'];
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie-aubervilliers.fr', messageId: '<known@x>' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.dejaConnus).toBe(1);
    expect(r.lignes).toHaveLength(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
  });

  it('réponse d’un domaine destinataire rattachée par threading → retenue + enregistrée', async () => {
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], corpsTexte: 'Bonjour.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rattaches).toBe(1);
    expect(r.parMethode).toEqual({ message_id: 1 });
    expect(r.ecrites).toBe(1);
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBe(1);
    expect(ins.params[10]).toBe('message_id');
  });

  it('réponse d’un domaine destinataire sans référence → retenue, demande_id null', async () => {
    const { client } = fauxClient([boite({ deAdresse: 'agent.urbanisme@mairie-aubervilliers.fr', corpsTexte: 'Bien reçu.' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.retenus).toBe(1);
    expect(r.nonRattaches).toBe(1);
    expect(r.lignes[0].demandeId).toBeNull();
  });

  it('message remonté par une sonde rebond mais PAS un vrai rebond → hors périmètre, pas enregistré', async () => {
    // 'postmaster-news@promo.fr' est attrapé par la sonde 'postmaster' (sous-chaîne) mais n'est pas un DSN.
    const { client } = fauxClient([boite({ deAdresse: 'postmaster-news@promo.fr', objet: 'Promo' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.horsPerimetre).toBe(1);
    expect(r.retenus).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
  });

  it('--sans-filtre → un message de sonde non-rebond est tout de même retenu', async () => {
    const { client } = fauxClient([boite({ deAdresse: 'postmaster-news@promo.fr', objet: 'Promo' })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false, sansFiltre: true });
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
  });

  it('appliquer=false (simulation) → aucune écriture, rapport complet', async () => {
    const { client } = fauxClient([boite({ deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'] })]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: false });
    expect(r.mode).toBe('simulation');
    expect(r.retenus).toBe(1);
    expect(r.ecrites).toBe(0);
    expect(trouver(/RETURNING id/i)).toBeUndefined();
    expect(trouver(/UPDATE demande_acheminement/i)).toBeUndefined();
  });
});

describe('R3e — recherche serveur par référence de dossier (en plus des sondes)', () => {
  it('interroge les numéros de dossier (union avec les domaines), distinctement des sondes', async () => {
    etat.domaines = ['ville.fr'];
    etat.references = ['0930012500081', '0930012500082'];
    const parDomaine = boite({ deAdresse: 'x@ville.fr' });          // uid 1 (domaine)
    const parReference = boite({ deAdresse: 'agent@tiers.fr', corpsTexte: 'dossier 0930012500081' }); // uid 2 (référence)
    const { client, suivi } = fauxClient([parDomaine, parReference], undefined, (refs) => refs.includes('0930012500081') ? [parReference.uid] : []);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });

    expect(suivi.referencesInterrogees).toEqual(['0930012500081', '0930012500082']); // les 2 références interrogées
    expect(suivi.uidsTelecharges).toEqual([1, 2]);                                     // union domaine + référence
    expect(r.referencesInterrogees).toBe(2);
    expect(r.uidsReferences).toBe(1);                                                  // 1 UID ramené par les références
    expect(r.uidsServeur).toBe(1);                                                     // 1 UID par domaine (distinct)
  });

  it('message d’un domaine TIERS citant le n° de dossier dans le CORPS → téléchargé, retenu et RATTACHÉ', async () => {
    etat.candidates = [{ ...CAND_A, num_daus: ['0930012500081'] }]; // la demande 1 a ce dossier
    etat.references = ['0930012500081'];
    const tiers = boite({ deAdresse: 'agent@prestataire.fr', corpsTexte: 'Concernant le dossier 0930012500081, voici la réponse.' });
    const { client, suivi } = fauxClient([tiers], undefined, (refs) => refs.includes('0930012500081') ? [tiers.uid] : []);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });

    expect(suivi.uidsTelecharges).toContain(tiers.uid); // vu alors qu'il ne vient d'aucun domaine/sonde
    expect(r.retenus).toBe(1);
    expect(r.lignes[0]).toMatchObject({ demandeId: 1, methode: 'numero_dossier' });
  });

  it('numéro TRONQUÉ dans le corps → non retenu', async () => {
    etat.candidates = [{ ...CAND_A, num_daus: ['0930012500081'] }];
    etat.references = ['0930012500081'];
    const tiers = boite({ deAdresse: 'agent@prestataire.fr', corpsTexte: 'dossier 093001250008 (incomplet)' });
    const { client } = fauxClient([tiers], undefined, () => [tiers.uid]); // le serveur l'a ramené, mais le filtre client le rejette
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.retenus).toBe(0);
    expect(r.horsPerimetre).toBe(1);
  });

  it('plafond de références atteint → les plus urgentes prises ET avertissement dans le rapport', async () => {
    etat.references = Array.from({ length: 51 }, (_, i) => String(9300000000000 + i)); // 51 > défaut 50
    let recus: string[] = [];
    const { client } = fauxClient([], undefined, (refs) => { recus = refs; return []; });
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.plafondReferencesAtteint).toBe(true);
    expect(r.referencesInterrogees).toBe(50); // plafond par défaut
    expect(recus).toHaveLength(50);
  });
});

describe('R3f — la recherche par référence ne porte QUE sur les demandes envoyées', () => {
  it('la requête des références filtre statut = envoyee (jamais brouillon/prête/abandonnée/close)', async () => {
    etat.references = ['0930012500081'];
    const { client } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    const q = appels.find((a) => /s\.num_dau/i.test(a.sql) && /demande_dossier/i.test(a.sql) && /\(dd\.satisfait_le IS NULL\) DESC/i.test(a.sql));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain("d.statut = 'envoyee'");
    expect(norm).not.toContain("NOT IN ('close'"); // plus de brouillons/abandonnées embarqués
  });

  it('1 envoyée (le SQL exclut brouillons/abandonnées) → une seule référence interrogée', async () => {
    etat.references = ['0930012500081']; // ce que renvoie la requête filtrée sur 'envoyee'
    const { client, suivi } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.referencesInterrogees).toEqual(['0930012500081']);
  });

  it('aucune demande envoyée → aucune recherche par référence, aucune connexion', async () => {
    etat.candidates = []; etat.depuis = null; etat.domaines = []; etat.references = ['0930012500081'];
    const { client, suivi } = fauxClient([], undefined, () => [999]);
    const r = await releverBoite({ client, profil: 'entreprise' });
    expect(r.connecte).toBe(false);
    expect(suivi.ouvert).toBe(0);
    expect(suivi.referencesInterrogees).toEqual([]); // lireReferencesRecherche pas atteint (retour anticipé « pas de connexion »)
  });
});

describe('R3f (correctif 1a) — TOUS les dossiers non satisfaits des demandes envoyées sont interrogés (plus de gate dd.actif)', () => {
  it('les 5 références de dossier (154→1, 119→4) sont interrogées, même quand des attaches sont actif=false', async () => {
    // ce que renvoie la requête CORRIGÉE (sans AND dd.actif) : les 5 num_dau des 2 demandes envoyées
    etat.references = ['0930012500081', '075112250010', '075112450025', '075120240037', '075120250035'];
    const { client, suivi } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.referencesInterrogees).toEqual(etat.references); // 5, pas 1
  });

  it('la requête des n° de dossier NE filtre PLUS sur dd.actif (mais garde le périmètre envoyee)', async () => {
    etat.references = ['0930012500081'];
    const { client } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    const q = appels.find((a) => /s\.num_dau/i.test(a.sql) && /demande_dossier/i.test(a.sql) && /\(dd\.satisfait_le IS NULL\) DESC/i.test(a.sql));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain("d.statut = 'envoyee'"); // périmètre correct conservé
    expect(norm).not.toContain('dd.actif');          // le gate a disparu (cause du défaut 1a)
  });
});

describe('R3f — référence MAIRIE : commune FORMULAIRE (aucun domaine), réponse citant SA référence', () => {
  const CAND_119 = { id: 119, reference: 'SVAV-DEM-2026-000119', dest_email: '', message_ids: [] as string[], num_daus: [] as string[], refs_externes: ['SLC260810440700'] };

  it('la référence mairie est interrogée côté serveur (au même titre que les n° de dossier)', async () => {
    etat.candidates = [CAND_119]; etat.domaines = []; etat.references = [];
    const { client, suivi } = fauxClient([], () => [], () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.referencesInterrogees).toContain('SLC260810440700');
  });

  it('message d’un domaine JAMAIS contacté (paris.fr) citant la référence mairie → retenu ET rattaché (reference_mairie)', async () => {
    etat.candidates = [CAND_119]; etat.domaines = []; etat.references = [];
    const m = boite({ deAdresse: 'no-reply@paris.fr', objet: 'Votre demande SLC260810440700', corpsTexte: 'Bonjour, votre dossier SLC260810440700 a bien été enregistré.' });
    const { client, suivi } = fauxClient([m], () => [], (refs) => refs.includes('SLC260810440700') ? [m.uid] : []);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(suivi.uidsTelecharges).toContain(m.uid); // vu alors qu'il ne vient d'aucun domaine/sonde
    expect(r.retenus).toBe(1);
    expect(r.horsPerimetre).toBe(0);
    expect(r.lignes[0]).toMatchObject({ demandeId: 119, methode: 'reference_mairie' });
  });

  it('pertinence R3b : un message citant une réf mairie connue est RETENU même si le rattachement est ambigu (aucun)', async () => {
    // deux demandes partagent la même référence → rattachement 'aucun', MAIS le message reste pertinent (cité) → retenu
    const dup = { ...CAND_A, id: 155, reference: 'SVAV-DEM-2026-000155', dest_email: '', refs_externes: ['SLC260810440700'] };
    etat.candidates = [{ ...CAND_119 }, dup]; etat.domaines = []; etat.references = [];
    const m = boite({ deAdresse: 'no-reply@paris.fr', corpsTexte: 'dossier SLC260810440700' });
    const { client } = fauxClient([m], () => [], (refs) => refs.includes('SLC260810440700') ? [m.uid] : []);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.retenus).toBe(1);          // retenu (pertinent via réf mairie)
    expect(r.horsPerimetre).toBe(0);
    expect(r.lignes[0]).toMatchObject({ demandeId: null, methode: 'aucun' }); // mais NON rattaché (ambigu)
  });

  it('une référence INCONNUE ne rattache rien et n’est pas retenue', async () => {
    etat.candidates = [CAND_119]; etat.domaines = []; etat.references = [];
    const m = boite({ deAdresse: 'no-reply@paris.fr', corpsTexte: 'référence SLC999999999999 inconnue' });
    const { client } = fauxClient([m], () => [], () => [m.uid]); // serveur le ramène, mais le filtre client le rejette
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    expect(r.retenus).toBe(0);
    expect(r.horsPerimetre).toBe(1);
  });
});
