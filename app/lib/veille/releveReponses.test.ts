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
    curseur: null as Date | null, // P1 — max(termine_le) du dernier scan courant complet réussi
    rebondRowCount: 1,
    conflit: false,
    nextId: 4242,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/max\(termine_le\) AS t FROM releve_run/i.test(sql)) return { rows: [{ t: etat.curseur }], rowCount: etat.curseur ? 1 : 0 }; // P1 curseurReleve
    if (/\(dd\.satisfait_le IS NULL\) DESC/i.test(sql)) return { rows: etat.references.map((n) => ({ num_dau: n })), rowCount: etat.references.length }; // R3e/R3f lireReferencesRecherche (signature du tri)
    if (/DISTINCT re\.reference/i.test(sql)) { const refs = [...new Set(etat.candidates.flatMap((c) => c.refs_externes ?? []))]; return { rows: refs.map((reference) => ({ reference })), rowCount: refs.length }; } // R3f références MAIRIE à interroger
    if (/min\(a\.envoye_le\)/i.test(sql)) return { rows: [{ depuis: etat.depuis }], rowCount: 1 };
    if (/array_agg\(a\.message_id\)/i.test(sql)) return { rows: etat.candidates, rowCount: etat.candidates.length };
    if (/FROM demande_reponse WHERE profil_boite/i.test(sql)) return { rows: etat.knownIds.map((m) => ({ message_id: m })), rowCount: etat.knownIds.length };
    if (/split_part\(dest_email/i.test(sql)) return { rows: etat.domaines.map((d) => ({ domaine: d })), rowCount: etat.domaines.length };
    if (/UPDATE demande_acheminement/i.test(sql)) return { rows: [], rowCount: etat.rebondRowCount };
    if (/INSERT INTO demande_reponse_lien/i.test(sql)) return { rows: [], rowCount: 1 }; // L1 : un lien inséré
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

import { releverBoite, fenetreDepuis, type ClientBoite, type MessageBoite, type PieceMeta, type CritereRecherche } from './releveReponses';
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
  const suivi = { ouvert: 0, ferme: 0, recherches: [] as CritereRecherche[], referencesInterrogees: [] as string[], messageIdsInterroges: [] as number[], uidsTelecharges: [] as number[] };
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
    async messageIds(uids) {
      suivi.messageIdsInterroges.push(...uids); // P1 : fetch léger des Message-ID (plafond chronologique)
      const m = new Map<number, string>();
      for (const uid of uids) { const mb = messages.find((x) => x.uid === uid); const mid = mb?.message.messageId.trim(); if (mid) m.set(uid, mid); }
      return m;
    },
    async telechargerMessage(uid) { suivi.uidsTelecharges.push(uid); const m = messages.find((x) => x.uid === uid); if (!m) throw new Error(`uid ${uid}`); return m; },
    async fermer() { suivi.ferme += 1; },
  };
  return { client, suivi };
}

beforeEach(() => {
  appels.length = 0; uidSeq = 0;
  etat.candidates = [CAND_A]; etat.depuis = DEPUIS; etat.knownIds = []; etat.domaines = ['mairie-aubervilliers.fr']; etat.references = []; etat.curseur = null; etat.rebondRowCount = 1; etat.conflit = false; etat.nextId = 4242;
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

  it('P1 — dépassement du plafond → les plus ANCIENS non-vus d’abord (chronologique), pas les plus récents + avertissement', async () => {
    etat.domaines = ['mairie.fr'];
    const cinq = [1, 2, 3, 4, 5].map(() => boite({ deAdresse: 'urba@mairie.fr' }));
    const { client, suivi } = fauxClient(cinq);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, plafond: 2 });
    expect(r.uidsServeur).toBe(5);
    expect(r.plafondAtteint).toBe(true);
    expect(suivi.uidsTelecharges).toEqual([1, 2]);                 // P1 : UID croissant = les plus ANCIENS (jamais les plus récents jetés à jamais)
    expect(suivi.messageIdsInterroges.length).toBeGreaterThan(0);  // dédup au niveau SÉLECTION (fetch léger avant troncature)
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

describe('T3 — nature du message : accusé enregistré (jamais rebond étranger), rebond rattaché, message ordinaire', () => {
  it('accusé auto (Auto-Submitted) rattaché par threading → ENREGISTRÉ nature=accuse, compté « accuses », JAMAIS rebond, acheminement INTACT, aucune satisfaction auto', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Accusé de réception de votre demande', corpsTexte: 'Votre demande a bien été reçue.',
        entetes: { 'Auto-Submitted': 'auto-replied' } },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.accuses).toBe(1);
    expect(r.rebondsDetectes).toBe(0);   // ⚠️ n'est PLUS pris pour un rebond (l'ancien bug)
    expect(r.rebondsEtrangers).toBe(0);  // …donc PLUS jeté en « rebond étranger »
    expect(r.retenus).toBe(1);
    expect(r.rattaches).toBe(1);
    expect(r.lignes[0].nature).toBe('accuse');
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBe(1);          // rattaché à la demande 154
    expect(ins.params[13]).toBe('accuse');  // nature liée
    expect(trouver(/UPDATE demande_acheminement/i)).toBeUndefined();     // pas un rebond → acheminement intact
    expect(trouver(/SELECT dd\.dossier_id, s\.num_dau/i)).toBeUndefined(); // un accusé ne déclenche AUCUNE satisfaction auto de dossier
  });

  it('accusé auto SANS Message-ID d’origine ni référence (du domaine) → ENREGISTRÉ nature=accuse, en file « à rattacher », jamais perdu', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'ne-pas-repondre@mairie-aubervilliers.fr', objet: 'Accusé de réception automatique', corpsTexte: 'Message automatique — ne pas répondre.',
        entetes: { 'Auto-Submitted': 'auto-generated' } },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.accuses).toBe(1);
    expect(r.rebondsEtrangers).toBe(0);
    expect(r.retenus).toBe(1);
    expect(r.rattaches).toBe(0);            // pas de rattachement certain → file « à rattacher »
    expect(r.lignes[0].nature).toBe('accuse');
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBeNull();       // demande_id NULL (à rattacher), mais ENREGISTRÉ
    expect(ins.params[13]).toBe('accuse');
  });

  it('rebond de non-remise RATTACHÉ → ENREGISTRÉ nature=rebond (preuve), acheminement basculé, mais N’EST PAS un accusé', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'MAILER-DAEMON@google.com', objet: 'Delivery Status Notification (Failure)', corpsTexte: dsnCorps('urba@mairie-aubervilliers.fr') },
      { partiesRapport: [{ typeMime: 'message/rfc822', contenu: 'Message-ID: <abc-154@sansvisavis.com>\r\n' }] },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rebondsRattaches).toBe(1);
    expect(r.rebondsAppliques).toBe(1);
    expect(r.accuses).toBe(0);
    expect(r.lignes[0].nature).toBe('rebond');
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[13]).toBe('rebond');
    expect(trouver(/UPDATE demande_acheminement/i)).toBeDefined(); // la bascule 'envoye' → 'rebond' reste l'autorité
  });

  it('T7-A — message ORDINAIRE sans pièce ni lien fort (texte seul) → nature=autre (le texte n’est JAMAIS lu pour décider)', async () => {
    const { client } = fauxClient([boite(
      // « Voici les documents » : le TEXTE parle de documents, mais AUCUNE pièce ni lien n'est capté → autre (déterministe).
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Réponse à votre demande', corpsTexte: 'Voici les documents.' },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.accuses).toBe(0);
    expect(r.rattaches).toBe(1);
    expect(r.lignes[0].nature).toBe('autre');
    expect(trouver(/INSERT INTO demande_reponse\b/i)!.params[13]).toBe('autre');
  });

  it('T7-A — message avec une PIÈCE JOINTE → nature=documents (la présence de la pièce suffit)', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Réponse', corpsTexte: 'ci-joint' },
      { pieces: [{ nomFichier: 'arrete.pdf', typeMime: 'application/pdf', tailleOctets: 1024, contenu: Buffer.from('x') }] },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.lignes[0].nature).toBe('documents');
    expect(trouver(/INSERT INTO demande_reponse\b/i)!.params[13]).toBe('documents');
  });

  it('T7-A — pièce REFUSÉE au dépôt (trop volumineuse) → nature=documents quand même (la nature décrit ce que la mairie a ENVOYÉ)', async () => {
    // Le dépôt échouera (le mock DB renvoie 0 ligne demande_reponse_piece à mettre à jour) : la nature ne dépend PAS du succès
    // du stockage, seulement de la présence d'une pièce → documents.
    const { client } = fauxClient([boite(
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Réponse', corpsTexte: 'plan lourd' },
      { pieces: [{ nomFichier: 'plan-60mo.pdf', typeMime: 'application/pdf', tailleOctets: 60 * 1024 * 1024, contenu: Buffer.from('x') }] },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.lignes[0].nature).toBe('documents');
  });

  it('T7-A — message SANS pièce mais avec un LIEN FORT (jeton) → nature=documents', async () => {
    const LIEN = 'https://ged-pcpr.apps.paris.fr/share/s/aB3x9Kf2mNqR7wZ1tYcV0pL5s8Dh/folder';
    const { client } = fauxClient([boite(
      { deAdresse: 'no-reply@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Réponse', corpsTexte: 'votre dossier en ligne', corpsHtml: `<a href="${LIEN}">ici</a>` },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.lignes[0].nature).toBe('documents');
    expect(r.liensCaptes).toBe(1);
  });
});

describe('L1 — capture des liens de téléchargement d’une réponse rattachée', () => {
  const LIEN = 'https://ged-pcpr.apps.paris.fr/share/s/aB3x9Kf2mNqR7wZ1tYcV0pL5s8Dh/folder'; // jeton FACTICE

  it('lien à jeton dans le corps HTML → EXTRAIT + marqué fort + ENREGISTRÉ ; corps_html stocké ; expiration relative captée', async () => {
    const html = `<p>Votre dossier : <a href="${LIEN}">ici</a> — le lien étant valable 7 jours.</p>`;
    const { client } = fauxClient([boite(
      { deAdresse: 'no-reply@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], objet: 'Réponse à votre demande', corpsTexte: 'Votre dossier en ligne.', corpsHtml: html },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.rattaches).toBe(1);
    expect(r.liensCaptes).toBe(1);
    expect(trouver(/INSERT INTO demande_reponse\b/i)!.params[14]).toBe(html); // corps_html = dernier paramètre du message
    const insLien = appels.find((a) => /INSERT INTO demande_reponse_lien/i.test(a.sql))!;
    expect(insLien).toBeDefined();
    expect(insLien.params[1]).toBe(LIEN);        // url BRUTE (jamais réécrite)
    expect(insLien.params[2]).toBe(true);        // fort (chemin à jeton)
    expect(insLien.params[4]).toBe('relative');  // expiration_source (valable 7 jours)
  });

  it('RÈGLE DURE : la relève n’émet AUCUN appel réseau sortant vers un lien capté', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { client } = fauxClient([boite(
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], corpsHtml: `<a href="${LIEN}">x</a>` },
    )]);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('corps SANS lien sérieux → aucun INSERT de lien', async () => {
    const { client } = fauxClient([boite(
      { deAdresse: 'urba@mairie-aubervilliers.fr', references: ['<abc-154@sansvisavis.com>'], corpsTexte: 'Voici les documents ci-joints.' },
    )]);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(r.liensCaptes).toBe(0);
    expect(appels.find((a) => /INSERT INTO demande_reponse_lien/i.test(a.sql))).toBeUndefined();
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

describe('T4 — la recherche par référence porte sur les envoyées ET les demandes EN ATTENTE (brouillon/prête)', () => {
  it('la requête des références inclut envoyée + brouillon + prête (jamais close/annulée)', async () => {
    etat.references = ['0930012500081'];
    const { client } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    const q = appels.find((a) => /s\.num_dau/i.test(a.sql) && /demande_dossier/i.test(a.sql) && /\(dd\.satisfait_le IS NULL\) DESC/i.test(a.sql));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain("d.statut IN ('envoyee', 'brouillon', 'prete')"); // T4 : les permis en attente sont AUSSI cherchés
    expect(norm).not.toContain("'close'");   // une close a déjà ses pièces
    expect(norm).not.toContain("'annulee'"); // une annulée n'attend rien
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

  it('la requête des n° de dossier NE filtre PLUS sur dd.actif (périmètre = envoyée + en attente)', async () => {
    etat.references = ['0930012500081'];
    const { client } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS });
    const q = appels.find((a) => /s\.num_dau/i.test(a.sql) && /demande_dossier/i.test(a.sql) && /\(dd\.satisfait_le IS NULL\) DESC/i.test(a.sql));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain("d.statut IN ('envoyee', 'brouillon', 'prete')"); // T4 : périmètre élargi
    expect(norm).not.toContain('dd.actif');          // le gate a disparu (cause du défaut 1a)
  });
});

describe('T4 (commit A) — VOIR un message citant un permis EN ATTENTE, sans le rattacher ni rien écrire de moteur', () => {
  it('cite un num_dau cherché mais AUCUNE envoyée candidate → vu, retenu, demande_id null, aucune satisfaction', async () => {
    etat.candidates = [CAND_A];          // une envoyée SANS num_dau (ne matche pas)
    etat.references = ['0930012500081']; // num_dau d'une demande EN ATTENTE (cherché par lireReferencesRecherche élargi)
    etat.domaines = [];                  // aucun domaine → seule la citation du permis peut rendre pertinent
    const m = boite({ deAdresse: 'no-reply@mairie-x.fr', objet: 'Dépôt PC 093 001 25 00081', corpsTexte: 'Votre dossier 0930012500081 a bien été déposé.' });
    const { client, suivi } = fauxClient([m], () => [], (refs) => refs.includes('0930012500081') ? [m.uid] : []);
    const r = await releverBoite({ client, profil: 'entreprise', depuis: DEPUIS, appliquer: true });
    expect(suivi.uidsTelecharges).toContain(m.uid);                       // VU (recherche par référence élargie)
    expect(r.horsPerimetre).toBe(0);                                      // R3b ne l'écarte plus
    expect(r.retenus).toBe(1);
    expect(r.rattaches).toBe(0);                                          // rattaché à RIEN (candidates = envoyées seules)
    expect(r.nonRattaches).toBe(1);
    expect(appels.some((a) => /SET satisfait_le/i.test(a.sql))).toBe(false); // aucune satisfaction (demandeId null)
    expect(appels.some((a) => /UPDATE demande SET statut/i.test(a.sql))).toBe(false); // aucune écriture de demande.statut
  });
});

describe('T4 (commit A) — la fenêtre SINCE ne dépend plus des seules envoyées', () => {
  it('la borne inclut le cree_le des demandes en attente (LEAST envoye_le / cree_le des brouillon/prête)', async () => {
    const { client } = fauxClient([], undefined, () => []);
    await releverBoite({ client, profil: 'entreprise' }); // pas de `depuis` fourni → dateDepart est appelé
    const q = appels.find((a) => /LEAST/i.test(a.sql) && /min\(a\.envoye_le\)/i.test(a.sql));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain("d.statut IN ('brouillon', 'prete')");
    expect(norm).toContain('min(d.cree_le)');
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

describe('P1 — curseur (fin de scan réussi), marge 3 j, plafond chronologique progressif', () => {
  it('fenêtre = curseur − 3 j : la MARGE capte un retardataire daté AVANT le curseur (spam/livraison différée)', async () => {
    etat.curseur = new Date('2026-08-20T10:00:00Z');
    const d = await fenetreDepuis('entreprise');
    // 20/08 − 3 j = 17/08 → un message d'INTERNALDATE 18/08 (avant le curseur) tombe DANS la fenêtre. La fenêtre est
    //   curseur-based : la suppression d'un message déjà scanné n'y change RIEN (aucune dépendance à un message côté serveur).
    expect(d?.toISOString()).toBe('2026-08-17T10:00:00.000Z');
  });

  it('curseur null (premier run / journal purgé) → repli backfill via dateDepart, sans erreur ; ni curseur ni demande → null', async () => {
    etat.curseur = null; etat.depuis = new Date('2026-07-01T00:00:00Z');
    expect((await fenetreDepuis('entreprise'))?.toISOString()).toBe('2026-07-01T00:00:00.000Z'); // backfill complet
    etat.depuis = null;
    expect(await fenetreDepuis('entreprise')).toBeNull(); // pas de connexion, aucune exception
  });

  it('panne de 10 jours : le curseur figé remonte la fenêtre de 10 j + marge (couvre tout l’intervalle)', async () => {
    etat.curseur = new Date('2026-08-01T12:00:00Z'); // dernier scan réussi il y a 10 j
    expect((await fenetreDepuis('entreprise'))?.toISOString()).toBe('2026-07-29T12:00:00.000Z'); // 01/08 − 3 j
  });

  it('une semaine SANS mail : le curseur avance quand même (termine_le du run réussi) → la fenêtre SUIT, ne grossit pas', async () => {
    etat.curseur = new Date('2026-08-10T00:00:00Z');
    expect((await fenetreDepuis('entreprise'))?.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    etat.curseur = new Date('2026-08-17T00:00:00Z'); // +7 j (7 passes réussies, 0 mail) → le curseur a avancé
    expect((await fenetreDepuis('entreprise'))?.toISOString()).toBe('2026-08-14T00:00:00.000Z'); // fenêtre toujours ~3 j, PAS 2 semaines
  });

  it('curseur EXCLUT les relèves approfondies ET les passes tronquées par le plafond (fragments SQL)', async () => {
    await fenetreDepuis('entreprise');
    const sql = trouver(/max\(termine_le\) AS t FROM releve_run/i)!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain("resultat = 'ok'");
    expect(sql).toContain("declencheur = 'planifie'");    // 'approfondi' ne déplace JAMAIS le curseur courant
    expect(sql).toContain('plafond_atteint IS NOT TRUE');  // un échec/troncature ne « certifie vu » que ce qui l'a été
  });

  it('plafond : progression SANS BOUCLE — chaque passe traite les ANCIENS non-vus suivants, jamais les mêmes deux fois', async () => {
    etat.domaines = ['mairie.fr'];
    const dix = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => boite({ messageId: `<p${n}@x>`, deAdresse: 'urba@mairie.fr' }));
    // Passe 1 : rien de connu → 4 plus anciens (uid 1..4), plafondAtteint (il reste des non-vus).
    const c1 = fauxClient(dix);
    const r1 = await releverBoite({ client: c1.client, profil: 'entreprise', depuis: DEPUIS, plafond: 4, appliquer: true });
    expect(r1.plafondAtteint).toBe(true);
    expect(c1.suivi.uidsTelecharges).toEqual([1, 2, 3, 4]);
    // Passe 2 : les 4 premiers désormais connus → 4 SUIVANTS (uid 5..8), progression réelle.
    etat.knownIds = ['<p1@x>', '<p2@x>', '<p3@x>', '<p4@x>'];
    const c2 = fauxClient(dix);
    const r2 = await releverBoite({ client: c2.client, profil: 'entreprise', depuis: DEPUIS, plafond: 4, appliquer: true });
    expect(r2.plafondAtteint).toBe(true);
    expect(c2.suivi.uidsTelecharges).toEqual([5, 6, 7, 8]);
    // Passe 3 : le reliquat (uid 9, 10) tient sous le plafond → plafondAtteint FAUX → le curseur pourra avancer.
    etat.knownIds = ['<p1@x>', '<p2@x>', '<p3@x>', '<p4@x>', '<p5@x>', '<p6@x>', '<p7@x>', '<p8@x>'];
    const c3 = fauxClient(dix);
    const r3 = await releverBoite({ client: c3.client, profil: 'entreprise', depuis: DEPUIS, plafond: 4, appliquer: true });
    expect(r3.plafondAtteint).toBe(false);
    expect(c3.suivi.uidsTelecharges).toEqual([9, 10]);
  });
});
