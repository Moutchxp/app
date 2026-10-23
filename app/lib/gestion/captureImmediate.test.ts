import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { simpleParser } from 'mailparser';
import { versMessageBoite } from '../email/imap';
import { capturer, type DepsCapture, type MessageAEcrire, type MessageBrut } from './capture';
import { capturerEnvoiImmediat, type DepsCaptureImmediate } from './captureImmediate';
import { versMessageBrut } from './captureRepo';
import { CONFIG_GESTION_DEFAUT, type ConfigGestion } from './config';
import { envoyerMessage, type DemandeEnvoi, type DepsEnvoiComplet } from './envoi';

/**
 * 🔴 Arno (23/10/2026) — « un mail envoyé depuis l'application doit apparaître IMMÉDIATEMENT dans “Envoyés”, avec ses pièces
 * jointes, son classement et son fil, sans attendre la relève ; quand la relève récupère ensuite le même mail, pas de doublon ».
 * Base et Gmail SIMULÉS : rien n'est écrit ni envoyé. L'analyse du mail, elle, est la VRAIE (mailparser + `versMessageBoite`).
 */
const CONFIG: ConfigGestion = { ...CONFIG_GESTION_DEFAUT, adresseGestion: 'gestion@criterimmo.fr' };
const MID = '<CAJ6+kPGt-gmail-reecrit@mail.gmail.com>';   // le Message-ID que Gmail a GARDÉ (il réécrit celui de l'envoi)

/** L'original tel que Gmail le rend (format=raw) : un mail parti de gestion@, avec deux pièces jointes. */
function original(): Buffer {
  const b = 'frontiere-essai';
  return Buffer.from([
    'From: Gestion <gestion@criterimmo.fr>', 'To: a.jorel@sansvisavis.com', 'Subject: test',
    `Message-ID: ${MID}`, 'Date: Fri, 23 Oct 2026 22:10:04 +0200', 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`, '',
    `--${b}`, 'Content-Type: text/plain; charset=utf-8', '', 'Bonjour, voici les pièces.', '',
    `--${b}`, 'Content-Type: application/pdf; name="bail.pdf"', 'Content-Disposition: attachment; filename="bail.pdf"',
    'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-1.4 essai').toString('base64'), '',
    `--${b}`, 'Content-Type: image/jpeg; name="photo.jpg"', 'Content-Disposition: attachment; filename="photo.jpg"',
    'Content-Transfer-Encoding: base64', '', Buffer.from('jpeg-essai').toString('base64'), '',
    `--${b}--`, '',
  ].join('\r\n'));
}
const analyser = async (raw: Buffer): Promise<MessageBrut> => versMessageBrut(versMessageBoite(await simpleParser(raw), 0) as never);

/** Une base simulée PARTAGÉE par la capture immédiate et la relève : `message_id` y est UNIQUE, comme en vrai. */
function base() {
  const messages = new Map<string, { id: number; m: MessageAEcrire; filId: number; gmailId: string | null; pieces: string[] }>();
  const ordre: string[] = [];
  const ecrire = async (m: MessageAEcrire, filId: number): Promise<number | null> => {
    if (messages.has(m.messageId)) return null;   // ON CONFLICT (message_id) DO NOTHING
    const id = messages.size + 1;
    messages.set(m.messageId, { id, m, filId, gmailId: null, pieces: [] });
    ordre.push('ecrire');
    return id;
  };
  return { messages, ordre, ecrire };
}
function depsImmediat(b: ReturnType<typeof base>, o: Partial<DepsCaptureImmediate> = {}): DepsCaptureImmediate {
  return {
    jetonAcces: async () => 'jeton-essai',
    lireOriginal: async () => ({ ok: true, valeur: original() }),
    analyser,
    config: async () => CONFIG,
    reglesActives: async () => [],
    dejaConnu: async (mid) => b.messages.has(mid),
    resoudreFil: async () => ({ filId: 70, cree: true, fusionnes: 0 }),
    ecrire: b.ecrire,
    deposerPieces: async (id, pieces) => {
      const e = [...b.messages.values()].find((x) => x.id === id)!;
      e.pieces.push(...pieces.map((p) => p.nomFichier));
      b.ordre.push('pieces');
      return { deposees: pieces.length, nonDeposees: 0 };
    },
    memoriserGmailId: async (id, g) => { [...b.messages.values()].find((x) => x.id === id)!.gmailId = g; b.ordre.push('gmailId'); },
    appliquerIntentions: async () => { b.ordre.push('intentions'); },
    ...o,
  };
}

describe('🔴 l’envoi entre tout de suite dans « Envoyés », avec ses pièces, son fil et son classement', () => {
  it('l’original relu chez Gmail est écrit en ENVOYÉ, sur son fil, avec ses deux pièces, puis les intentions sont posées', async () => {
    const b = base();
    const r = await capturerEnvoiImmediat('18f3a9c2e1', depsImmediat(b));
    expect(r).toEqual({ etat: 'capture', messageId: 1, pieces: 2 });
    const e = b.messages.get(MID)!;
    expect(e.m.sens).toBe('envoye');            // « Envoyés » lit sens = 'envoye'
    expect(e.m.objet).toBe('test');
    expect(e.m.deAdresse).toBe('gestion@criterimmo.fr');
    expect(e.filId).toBe(70);
    expect(e.pieces).toEqual(['bail.pdf', 'photo.jpg']);
    expect(e.gmailId).toBe('18f3a9c2e1');        // l'identifiant exact que l'intention de classement cherche en premier
    // les intentions (bien, interne, hors gestion…) se posent APRÈS que le message et son identifiant Gmail sont là
    expect(b.ordre).toEqual(['ecrire', 'gmailId', 'pieces', 'intentions']);
  });
  it('déjà en base (la relève est passée avant) : rien n’est réécrit, les intentions sont quand même posées', async () => {
    const b = base();
    await capturerEnvoiImmediat('g1', depsImmediat(b));
    b.ordre.length = 0;
    expect(await capturerEnvoiImmediat('g1', depsImmediat(b))).toEqual({ etat: 'deja' });
    expect(b.ordre).toEqual(['intentions']);
    expect(b.messages.size).toBe(1);
  });
  it('sans jeton, ou si Gmail ne rend pas l’original : impossible, rien n’est écrit (la relève le prendra)', async () => {
    const b = base();
    expect(await capturerEnvoiImmediat('g1', depsImmediat(b, { jetonAcces: async () => null }))).toMatchObject({ etat: 'impossible' });
    expect(await capturerEnvoiImmediat('g1', depsImmediat(b, { lireOriginal: async () => ({ ok: false, motif: 'HTTP 500' }) })))
      .toEqual({ etat: 'impossible', motif: 'HTTP 500' });
    expect(b.messages.size).toBe(0);
  });
});

describe('🔴 la relève qui retrouve ensuite le même mail dans la boîte : AUCUN doublon', () => {
  function depsReleve(b: ReturnType<typeof base>, m: MessageBrut): DepsCapture & { ecrites: number } {
    const d = {
      ecrites: 0,
      maintenant: () => new Date('2026-10-23T20:15:00Z'),
      config: async () => CONFIG, reglesActives: async () => [],
      ouvrirDossier: async () => {}, chercherDepuis: async () => [4242], telecharger: async () => ({ ...m, uid: 4242 }),
      fermer: async () => {},
      connus: async () => new Set(b.messages.keys()),
      bornes: async () => ({ curseurComplet: null }),
      resoudreFil: async () => ({ filId: 70, cree: false, fusionnes: 0 }),
      ecrire: async (x: MessageAEcrire, f: number) => { d.ecrites += 1; return b.ecrire(x, f); },
      deposerPieces: async () => ({ deposees: 0, nonDeposees: 0 }),
    };
    return d;
  }
  it('le Message-ID est déjà connu : la relève le compte « déjà connu », n’écrit rien, ne redépose aucune pièce', async () => {
    const b = base();
    await capturerEnvoiImmediat('g1', depsImmediat(b));
    const d = depsReleve(b, await analyser(original()));
    const r = await capturer(d, true);
    expect(r.dejaConnus).toBe(1);
    expect(r.captures).toBe(0);
    expect(d.ecrites).toBe(0);
    expect(b.messages.size).toBe(1);
    expect(b.messages.get(MID)!.pieces).toEqual(['bail.pdf', 'photo.jpg']);   // pièces conservées
  });
  it('même dans la course (écrit entre la lecture des connus et l’écriture) : l’index unique refuse le doublon', async () => {
    const b = base();
    const d = depsReleve(b, await analyser(original()));
    d.connus = async () => new Set();
    await capturerEnvoiImmediat('g1', depsImmediat(b));
    const r = await capturer(d, true);
    expect(r.captures).toBe(0);
    expect(b.messages.size).toBe(1);
  });
  it('et dans l’autre ordre (relève d’abord) : la capture immédiate ne double rien', async () => {
    const b = base();
    await capturer(depsReleve(b, await analyser(original())), true);
    expect(await capturerEnvoiImmediat('g1', depsImmediat(b))).toEqual({ etat: 'deja' });
    expect(b.messages.size).toBe(1);
  });
  it('la relève écarte ce message dès l’enveloppe : il ne porte pas d’UID, et son Message-ID est en base', () => {
    const repo = readFileSync('app/lib/gestion/captureRepo.ts', 'utf8');
    expect(repo).toContain('SELECT message_id FROM gestion_message WHERE message_id = ANY($1)');
    expect(repo).toContain('ON CONFLICT (message_id) DO NOTHING RETURNING id::int AS id');
    expect(readFileSync('app/lib/gestion/captureImmediateReelle.ts', 'utf8'))
      .toContain('return ecrireMessage(m, filId, null, false,');
  });
});

describe('🔴 branché dans l’envoi : en dernier, au mieux-effort', () => {
  const DEMANDE: DemandeEnvoi = {
    cleIdempotence: 'cle-capture-1', brouillonId: 3, filId: null, repondAMessageId: null,
    a: ['a.jorel@sansvisavis.com'], cc: [], cci: [], objet: 'test', corps: 'Bonjour', interne: true,
    cibles: [{ sorte: 'lot', cle: '211', id: null, libelle: 'lot 211' }],
  } as DemandeEnvoi;
  const monde = (capture: DepsEnvoiComplet['capturerEnvoi']) => {
    const ordre: string[] = [];
    const incidents: string[] = [];
    const deps: DepsEnvoiComplet = {
      peutEnvoyer: async () => true, jetonAcces: async () => 'j',
      expediteur: async () => ({ adresse: 'gestion@criterimmo.fr', nom: 'Gestion' }),
      ancrage: async () => ({ messageIdRfc: null, references: null, threadId: null }) as never,
      ouvrirEnvoi: async () => ({ id: 55, etat: 'en_cours', messageIdRfc: '<x@criterimmo.fr>', objet: 'test', a: [], cc: [], cci: [],
        auteurLibelle: 'arno', erreur: null, demandeLe: '2026-10-23T20:10:00Z', deja: false }),
      envoyer: async () => ({ ok: true, gmailMessageId: 'g-77' }),
      finaliser: async () => { ordre.push('finaliser'); },
      marquerBrouillonEnvoye: async () => { ordre.push('brouillon'); },
      journaliser: async () => { ordre.push('journal'); },
      classer: async () => { ordre.push('classer'); },
      marquerInterne: async () => { ordre.push('interne'); },
      capturerEnvoi: capture === undefined ? undefined : async (o) => { ordre.push(`capture:${o.gmailMessageId}`); await capture(o); },
      incident: (etape) => { incidents.push(etape); },
      maintenant: () => new Date('2026-10-23T20:10:00Z'), alea: () => 'a',
    };
    return { deps, ordre, incidents };
  };
  it('la capture vient APRÈS le classement et l’intention « Interne », avec l’identifiant Gmail de l’envoi', async () => {
    const { deps, ordre } = monde(async () => {});
    const r = await envoyerMessage(DEMANDE, { id: 1, libelle: 'arno' }, deps);
    expect(r.ok).toBe(true);
    expect(ordre).toEqual(['finaliser', 'brouillon', 'journal', 'classer', 'interne', 'capture:g-77']);
  });
  it('si la capture échoue, l’envoi reste un succès et l’incident est signalé (la relève reste le filet)', async () => {
    const { deps, incidents } = monde(async () => { throw new Error('base indisponible'); });
    expect((await envoyerMessage(DEMANDE, { id: 1, libelle: 'arno' }, deps)).ok).toBe(true);
    expect(incidents).toEqual(['capture']);
  });
  it('les deux portes d’envoi réelles la câblent (travailleur de la file et envoi direct)', () => {
    expect(readFileSync('app/lib/gestion/envoiReel.ts', 'utf8')).toContain('await capturerApresEnvoi(o, () => deps.jetonAcces(), c.origine);');
    expect(readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8'))
      .toContain("await capturerApresEnvoi(o, () => deps.jetonAcces(), 'envois');");
    vi.restoreAllMocks();
  });
});
