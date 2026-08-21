import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R6 — l'adaptateur IMAP multi-boîtes de la relève approfondie (`creerClientApprofondi`) : il LISTE toutes les boîtes (en
 * écartant les conteneurs non sélectionnables \Noselect) et les ouvre TOUJOURS en LECTURE STRICTE (readOnly / EXAMINE) —
 * INBOX comme indésirables. On mocke imapflow pour vérifier que `mailboxOpen` reçoit bien `{ readOnly: true }`. Aucune connexion.
 */
const h = vi.hoisted(() => ({
  fake: {
    connect: vi.fn(async () => {}),
    list: vi.fn<() => Promise<Array<{ path: string; flags: Set<string>; specialUse?: string }>>>(async () => [
      { path: 'INBOX', flags: new Set<string>() },
      { path: '[Gmail]/Spam', flags: new Set<string>(['\\Junk']) },
      { path: '[Gmail]', flags: new Set<string>(['\\Noselect']) }, // conteneur : à écarter
    ]),
    mailboxOpen: vi.fn(async () => ({})),
    search: vi.fn<(critere: unknown, options?: unknown) => Promise<number[]>>(async () => []),
    fetchOne: vi.fn(async () => false),
    // T7-C — fetch async-générateur (en-têtes seuls). Par défaut vide ; les tests envoyés le surchargent.
    fetch: vi.fn<(range: unknown, query?: unknown, options?: unknown) => AsyncGenerator<Record<string, unknown>>>(() => (async function* () {})()),
    logout: vi.fn(async () => {}),
  },
}));
// `new ImapFlow(...)` doit être constructible : une fonction (nommée) qui recopie le faux client sur l'instance.
vi.mock('imapflow', () => ({ ImapFlow: vi.fn(function FakeImapFlow(this: Record<string, unknown>) { Object.assign(this, h.fake); }) }));

import { creerClientApprofondi, creerClientEnvoyes, versMessageBoite } from './imap';
import { simpleParser } from 'mailparser';
import { estEmisParNous } from './enteteAuto';
import { estRebondNonRemise } from '../veille/rattachementReponse';

const COMPTE = { host: 'imap.exemple.fr', port: 993, user: 'u@exemple.fr', pass: 'secret', tls: true };

beforeEach(() => { vi.clearAllMocks(); });

describe('R6 — creerClientApprofondi : multi-boîtes en LECTURE STRICTE', () => {
  it('listerBoites : renvoie les chemins sélectionnables, écarte \\Noselect', async () => {
    const c = creerClientApprofondi(COMPTE);
    await c.ouvrir();
    expect(h.fake.connect).toHaveBeenCalledTimes(1);
    expect(await c.listerBoites()).toEqual(['INBOX', '[Gmail]/Spam']); // le conteneur [Gmail] est écarté
  });

  it('ouvrirBoite : ouvre TOUJOURS en readOnly (EXAMINE), y compris les indésirables', async () => {
    const c = creerClientApprofondi(COMPTE);
    await c.ouvrir();
    await c.ouvrirBoite('[Gmail]/Spam');
    expect(h.fake.mailboxOpen).toHaveBeenCalledWith('[Gmail]/Spam', { readOnly: true });
    await c.ouvrirBoite('INBOX');
    expect(h.fake.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true });
    // AUCUNE écriture dans la boîte : pas d'ajout/retrait de flag, pas de déplacement/suppression.
    expect((h.fake as Record<string, unknown>).messageFlagsAdd).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageMove).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageDelete).toBeUndefined();
  });
});

describe('T3 — un DSN de non-remise n’est PAS avalé par estEmisParNous (en-têtes RACINE seuls)', () => {
  // Dette signalée en T3 : quand une de NOS demandes CRPA n'arrive pas, le rapport de non-remise (DSN) EMBARQUE notre message
  // d'origine — donc nos en-têtes, dont X-SVAV-Auto, ET notre From. Si le filtre d'auto-émission (placé EN AMONT de la détection
  // de rebond, releveReponses.ts:483 avant :492) lisait les en-têtes de la partie embarquée, il conclurait « émis par nous » et
  // jetterait le DSN en silence → l'échéance CRPA courrait sur une demande jamais parvenue, une saisine CADA sur un délai jamais
  // commencé. On prouve ici, sur un DSN RÉEL (multipart/report à 3 parties), que l'extraction ne remonte QUE les en-têtes racine.

  // DSN RÉEL : From racine = mailer-daemon ; 3 parties (texte lisible, message/delivery-status, message/rfc822 = NOTRE message
  //   d'origine AVEC son X-SVAV-Auto et notre From). CRLF (exigé par le format MIME). Le jeton d'auto-émission est celui de prod.
  const DSN_BRUT = [
    'From: Mail Delivery System <mailer-daemon@mail.example.net>',
    'To: noreply@sansvisavis.com',
    'Subject: Undelivered Mail Returned to Sender',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="OUTER"',
    'Message-ID: <dsn-root-123@mail.example.net>',
    '',
    '--OUTER',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Delivery to the following recipient failed permanently: urbanisme@mairie-exemple.fr',
    '',
    '--OUTER',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mail.example.net',
    '',
    'Final-Recipient: rfc822; urbanisme@mairie-exemple.fr',
    'Action: failed',
    'Status: 5.1.1',
    'Diagnostic-Code: smtp; 550 5.1.1 unknown user',
    '',
    '--OUTER',
    'Content-Type: message/rfc822',
    '',
    'From: noreply@sansvisavis.com',
    'To: urbanisme@mairie-exemple.fr',
    'Subject: Demande CRPA — dossier PC 075 001 24 X0042',
    'X-SVAV-Auto: sans-vis-a-vis-emission-automatique',
    'Message-ID: <origine-abc@sansvisavis.com>',
    '',
    'Bonjour, veuillez nous communiquer le dossier…',
    '--OUTER--',
    '',
  ].join('\r\n');

  const ADRESSES_NOUS = ['noreply@sansvisavis.com'];

  it('l’extraction ne remonte QUE les en-têtes racine : X-SVAV-Auto embarqué N’ENTRE PAS dans `entetes`', async () => {
    const mb = versMessageBoite(await simpleParser(DSN_BRUT), 1);
    expect(mb.message.deAdresse).toBe('mailer-daemon@mail.example.net');   // From RACINE, jamais le From embarqué
    const cles = Object.keys(mb.message.entetes ?? {}).map((k) => k.toLowerCase());
    expect(cles).not.toContain('x-svav-auto');                             // l'en-tête embarqué ne fuit pas dans les en-têtes racine
    // La preuve structurelle : le message d'origine est isolé dans les parties de RAPPORT (message/rfc822), hors des en-têtes.
    expect((mb.partiesRapport ?? []).some((p) => /rfc822/i.test(p.typeMime) && p.contenu.includes('X-SVAV-Auto'))).toBe(true);
  });

  it('estEmisParNous = FALSE (non avalé) ET estRebondNonRemise = TRUE (reconnu comme rebond)', async () => {
    const mb = versMessageBoite(await simpleParser(DSN_BRUT), 1);
    // Les DEUX signaux d'auto-émission portent sur la RACINE : en-tête absent des en-têtes racine, From = mailer-daemon (≠ nous).
    expect(estEmisParNous(mb.message.deAdresse, mb.message.entetes, ADRESSES_NOUS)).toBe(false);
    // Donc le flux (auto-émission d'abord) ne l'écarte pas, et la détection de rebond le reconnaît. Ce test CASSE si l'extraction
    //   se met à aplatir les en-têtes embarqués (estEmisParNous repasserait à true et le DSN serait perdu avant le rebond).
    expect(estRebondNonRemise(mb.message)).toBe(true);
  });
});

describe('T7-C — creerClientEnvoyes : dossier envoyés en LECTURE STRICTE, EN-TÊTES SEULS', () => {
  const listeAvecSent = [
    { path: 'INBOX', flags: new Set<string>(), specialUse: '\\Inbox' },
    { path: 'Messages envoyés', flags: new Set<string>(['\\Sent']), specialUse: '\\Sent' }, // repéré par SPECIAL-USE, nom non codé en dur
  ];

  it('repère \\Sent (SPECIAL-USE) et l’ouvre en readOnly (EXAMINE)', async () => {
    h.fake.list.mockResolvedValueOnce(listeAvecSent);
    const c = creerClientEnvoyes(COMPTE);
    await c.ouvrir();
    expect(c.aBoiteEnvoyes()).toBe(true);
    expect(h.fake.mailboxOpen).toHaveBeenCalledWith('Messages envoyés', { readOnly: true });
  });

  it('recherche par EN-TÊTE (In-Reply-To/References) et lit les EN-TÊTES SEULS — JAMAIS la source (aucune lecture de corps)', async () => {
    h.fake.list.mockResolvedValueOnce(listeAvecSent);
    h.fake.search.mockResolvedValueOnce([101]);
    h.fake.fetch.mockImplementationOnce(function () {
      return (async function* () {
        yield { uid: 101, envelope: { inReplyTo: '<m7@mairie.fr>', to: [{ address: 'urba@mairie.fr' }], cc: [] }, headers: Buffer.from('References: <x@x> <m7@mairie.fr>\r\n') };
      })();
    });
    const c = creerClientEnvoyes(COMPTE);
    await c.ouvrir();
    const sortants = await c.lireEntetesReponses(['<m7@mairie.fr>'], new Date('2026-08-01T00:00:00Z'));

    // recherche par en-tête (pas par corps)
    const critere = h.fake.search.mock.calls[0][0];
    expect(JSON.stringify(critere)).toContain('in-reply-to');
    expect(JSON.stringify(critere)).toContain('references');
    // fetch EN-TÊTES SEULS : envelope + headers ['references'], JAMAIS source
    const query = h.fake.fetch.mock.calls[0][1] as Record<string, unknown>;
    expect(query).toMatchObject({ envelope: true, headers: ['references'] });
    expect(query).not.toHaveProperty('source');
    expect(h.fake.fetchOne).not.toHaveBeenCalled(); // fetchOne(source) = le SEUL lecteur de corps → jamais appelé
    // en-têtes remontés correctement
    expect(sortants).toEqual([{ inReplyTo: '<m7@mairie.fr>', references: ['<x@x>', '<m7@mairie.fr>'], destinataires: ['urba@mairie.fr'] }]);
  });

  it('aucune boîte \\Sent → aBoiteEnvoyes faux, lireEntetesReponses = [] SANS aucune recherche (repli sûr)', async () => {
    h.fake.list.mockResolvedValueOnce([{ path: 'INBOX', flags: new Set<string>(), specialUse: '\\Inbox' }]);
    const c = creerClientEnvoyes(COMPTE);
    await c.ouvrir();
    expect(c.aBoiteEnvoyes()).toBe(false);
    expect(await c.lireEntetesReponses(['<m7@mairie.fr>'], new Date())).toEqual([]);
    expect(h.fake.search).not.toHaveBeenCalled();
    expect(h.fake.mailboxOpen).not.toHaveBeenCalled(); // rien ouvert : pas de \Sent
  });

  it('LECTURE STRICTE : aucune écriture (pas de flag, pas de déplacement, pas de suppression)', () => {
    expect((h.fake as Record<string, unknown>).messageFlagsAdd).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageMove).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageDelete).toBeUndefined();
  });
});
