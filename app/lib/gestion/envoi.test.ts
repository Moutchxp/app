import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { envoyerMessage, MENTION_SANS_JETON, type DemandeEnvoi, type DepsEnvoiComplet } from './envoi';
import {
  base64Url, chainerReferences, construireRfc822, domaineDe, encoderEnTete, envoyerViaGmail, fabriquerMessageId,
} from './envoiGmail';
import type { Auteur, EnvoiEnBase } from './redactionRepo';

/**
 * LOT 5e — L'ENVOI, ÉPROUVÉ SANS QU'UN SEUL MAIL PARTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 AUCUNE CONNEXION NE SORT D'ICI : base, Gmail, horloge et aléa sont tous INJECTÉS, et ce sont des espions. Chaque
 * épreuve vérifie ce qui AURAIT été demandé — jamais ce que Gmail aurait répondu pour de vrai.
 *
 * CINQ FAÇONS DE SE TROMPER, et chacune coûte cher, parce qu'un mail parti ne se rattrape pas :
 *   ① le droit n'est pas relu → un collaborateur dont on vient de retirer le droit écrit encore au nom de l'agence ;
 *   ② la ligne est écrite APRÈS l'appel → un envoi réussi dont la réponse n'est jamais revenue est réémis, et le
 *      correspondant reçoit deux fois le même mail ;
 *   ③ le double-clic passe → idem, mais en une seconde ;
 *   ④ l'échec est silencieux → on croit avoir répondu, et le locataire attend ;
 *   ⑤ `In-Reply-To` manque → le mail arrive ORPHELIN chez le correspondant, qui ne voit plus de quoi on parle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const AUTEUR: Auteur = { id: 7, libelle: 'arno' };
const DEMANDE: DemandeEnvoi = {
  cleIdempotence: 'cle-essai-123456', brouillonId: 12, filId: 101, repondAMessageId: 900,
  a: ['martin@orange.fr'], cc: ['syndic@immo.fr'], cci: ['archive@criterimmo.fr'],
  objet: 'Re: Fuite salle de bain', corps: 'Bonjour,\nNous intervenons demain.',
};

const LIGNE: EnvoiEnBase = {
  id: 55, etat: 'en_cours', messageIdRfc: '<x@criterimmo.fr>', objet: DEMANDE.objet,
  a: DEMANDE.a, cc: DEMANDE.cc, cci: DEMANDE.cci, auteurLibelle: 'arno', erreur: null,
  demandeLe: '2026-09-24T12:00:00Z', deja: false,
};

/** Un monde SIMULÉ : il note tout ce qu'on lui demande, et rend ce qu'on lui a dit de rendre. */
function monde(o: Partial<{
  peutEnvoyer: boolean; jeton: string | null; deja: boolean;
  issueGmail: Awaited<ReturnType<DepsEnvoiComplet['envoyer']>>;
  /** Les gestes d'APRÈS-envoi qu'on fait échouer, pour éprouver qu'aucun ne change le verdict. */
  casser: ('finaliser' | 'brouillon' | 'journal')[];
}> = {}) {
  const trace = {
    ouvertures: [] as unknown[], envois: [] as unknown[], finalisations: [] as unknown[],
    journal: [] as unknown[], brouillonsEnvoyes: [] as number[], ordre: [] as string[],
    incidents: [] as { etape: string; message: string }[],
  };
  const casse = (q: 'finaliser' | 'brouillon' | 'journal') => {
    if (!(o.casser ?? []).includes(q)) return;
    // Une VRAIE erreur PostgreSQL, code compris : c'est celle qui a fait échouer l'envoi d'Arno le 23/09.
    const e = Object.assign(new Error('new row violates check constraint'), {
      code: '23514', constraint: 'gestion_journal_entite_chk',
    });
    throw e;
  };
  const deps: DepsEnvoiComplet = {
    peutEnvoyer: async () => { trace.ordre.push('droit'); return o.peutEnvoyer !== false; },
    jetonAcces: async () => { trace.ordre.push('jeton'); return o.jeton === undefined ? 'acces-essai' : o.jeton; },
    expediteur: async () => ({ adresse: 'gestion@criterimmo.fr', nom: 'CRITERIMMO' }),
    ancrage: async () => ({
      messageIdRfc: '<origine-42@orange.fr>', references: '<racine-1@orange.fr>', threadId: 'fil-gmail-9',
    }),
    ouvrirEnvoi: async (e) => { trace.ordre.push('ligne'); trace.ouvertures.push(e); return { ...LIGNE, deja: o.deja === true }; },
    envoyer: async (e) => { trace.ordre.push('gmail'); trace.envois.push(e); return o.issueGmail ?? { ok: true, gmailMessageId: 'g-1' }; },
    finaliser: async (id, maj) => { trace.ordre.push('finalisation'); casse('finaliser'); trace.finalisations.push({ id, ...maj }); },
    marquerBrouillonEnvoye: async (id) => { casse('brouillon'); trace.brouillonsEnvoyes.push(id); },
    journaliser: async (l) => { casse('journal'); trace.journal.push(l); },
    incident: (etape, e) => { trace.incidents.push({ etape, message: e instanceof Error ? e.message : String(e) }); },
    maintenant: () => new Date('2026-09-24T12:00:00Z'),
    alea: () => 'abc123',
  };
  return { deps, trace };
}

describe('🔴 ① LE DROIT EST RELU, ET IL EST RELU EN PREMIER', () => {
  it('sans droit : on refuse, et RIEN n’est écrit ni envoyé', async () => {
    const { deps, trace } = monde({ peutEnvoyer: false });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: false, code: 'droit' });
    expect(trace.ouvertures).toEqual([]);
    expect(trace.envois).toEqual([]);
  });

  it('le droit est demandé AVANT tout le reste — pas après avoir écrit la ligne', async () => {
    const { deps, trace } = monde();
    await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(trace.ordre[0]).toBe('droit');
  });
});

describe('🔴 ② LA LIGNE EST ÉCRITE AVANT L’APPEL RÉSEAU', () => {
  it('l’ordre est : droit → jeton → ligne → Gmail → finalisation', async () => {
    const { deps, trace } = monde();
    await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(trace.ordre).toEqual(['droit', 'jeton', 'ligne', 'gmail', 'finalisation']);
  });

  it('la ligne porte NOTRE Message-ID, l’ancrage, et les trois listes de destinataires', async () => {
    const { deps, trace } = monde();
    await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(trace.ouvertures[0]).toMatchObject({
      cleIdempotence: 'cle-essai-123456', brouillonId: 12, filId: 101,
      inReplyTo: '<origine-42@orange.fr>',
      a: ['martin@orange.fr'], cc: ['syndic@immo.fr'], cci: ['archive@criterimmo.fr'],
    });
    expect((trace.ouvertures[0] as { messageIdRfc: string }).messageIdRfc).toContain('@criterimmo.fr');
  });
});

describe('🔴 ③ DOUBLE-CLIC : un seul envoi', () => {
  it('la ligne existait déjà → on ne rappelle PAS Gmail, et on rend l’issue du premier clic', async () => {
    const { deps, trace } = monde({ deja: true });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: true, deja: true });
    expect(trace.envois).toEqual([]);            // 🔴 RIEN n'est reparti
    expect(trace.finalisations).toEqual([]);     // …et on ne réécrit pas l'état du premier
  });
});

describe('🔴 ④ UN ÉCHEC N’EST JAMAIS SILENCIEUX', () => {
  it('Gmail refuse → la ligne passe à « echec » AVEC son motif, et le journal le dit', async () => {
    const { deps, trace } = monde({ issueGmail: { ok: false, motif: 'Gmail a refusé l’envoi : quotaExceeded' } });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: false, code: 'refus_gmail' });
    expect(trace.finalisations[0]).toMatchObject({ id: 55, etat: 'echec', erreur: expect.stringContaining('quotaExceeded') });
    expect(trace.journal[0]).toMatchObject({ issue: 'echec', objet: DEMANDE.objet });
    expect(trace.brouillonsEnvoyes).toEqual([]); // le brouillon reste VIVANT : on n'a pas envoyé
  });

  it('Gmail accepte → « envoye », le brouillon quitte la liste, et le journal porte qui / à qui / quel objet', async () => {
    const { deps, trace } = monde();
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r.ok).toBe(true);
    expect(trace.finalisations[0]).toMatchObject({ id: 55, etat: 'envoye', gmailMessageId: 'g-1' });
    expect(trace.brouillonsEnvoyes).toEqual([12]);
    expect(trace.journal[0]).toMatchObject({
      issue: 'envoye', objet: 'Re: Fuite salle de bain',
      destinataires: ['martin@orange.fr', 'syndic@immo.fr', 'archive@criterimmo.fr'],
    });
    expect((trace.journal[0] as { auteur: Auteur }).auteur).toEqual(AUTEUR);
  });
});

describe('SANS CONNEXION GOOGLE, et sur un brouillon incomplet', () => {
  it('🔴 sans jeton : on le DIT, rien n’est écrit, et le message renvoie au guide', async () => {
    const { deps, trace } = monde({ jeton: null });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: false, code: 'sans_jeton', motif: MENTION_SANS_JETON });
    expect(r.ok === false && r.motif).toContain('GUIDE_CONNEXION_GOOGLE_GESTION.md');
    expect(trace.ouvertures).toEqual([]); // le brouillon est conservé : rien n'a bougé
  });

  it('brouillon invalide : refusé AVANT de demander le jeton — on ne réveille pas Google pour rien', async () => {
    const { deps, trace } = monde();
    const r = await envoyerMessage({ ...DEMANDE, a: [], cc: [], cci: [] }, AUTEUR, deps);
    expect(r).toMatchObject({ ok: false, code: 'invalide' });
    expect(trace.ordre).toEqual(['droit']);
  });
});

describe('🔴 ⑤ LES EN-TÊTES QUI RANGENT LE MAIL DANS LE BON FIL', () => {
  it('In-Reply-To = le Message-ID d’origine ; References = la chaîne, complétée', async () => {
    const { deps, trace } = monde();
    await envoyerMessage(DEMANDE, AUTEUR, deps);
    const rfc = (trace.envois[0] as { rfc822: string }).rfc822;
    expect(rfc).toContain('In-Reply-To: <origine-42@orange.fr>');
    expect(rfc).toContain('References: <racine-1@orange.fr> <origine-42@orange.fr>');
  });

  it('la chaîne References garde la RACINE et les derniers — un en-tête sans fin fait rejeter le mail', () => {
    const longue = Array.from({ length: 40 }, (_, i) => `<m${i}@x.fr>`).join(' ');
    const c = chainerReferences(longue, '<dernier@x.fr>', 5) ?? '';
    const ids = c.split(' ');
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe('<m0@x.fr>');          // la racine identifie la conversation : elle ne se perd jamais
    expect(ids[4]).toBe('<dernier@x.fr>');
  });

  it('un nouveau message n’a NI In-Reply-To NI References — il n’est la réponse de personne', () => {
    expect(chainerReferences(null, null)).toBeNull();
    const rfc = construireRfc822({
      de: 'gestion@criterimmo.fr', deNom: 'CRITERIMMO', a: ['a@b.fr'], cc: [], cci: [],
      objet: 'Bonjour', corps: 'Texte', messageId: '<n@criterimmo.fr>',
    });
    expect(rfc).not.toContain('In-Reply-To');
    expect(rfc).not.toContain('References');
  });
});

describe('LE MESSAGE LUI-MÊME', () => {
  const rfc = construireRfc822({
    de: 'gestion@criterimmo.fr', deNom: 'CRITERIMMO', a: ['a@b.fr'], cc: ['c@d.fr'], cci: ['secret@e.fr'],
    objet: 'Réponse à votre demande', corps: 'Bonjour à vous', messageId: '<m@criterimmo.fr>',
  });

  it('🔴 LA COPIE CACHÉE N’EST PAS DANS LE MESSAGE : c’est précisément ce qu’elle existe pour éviter', () => {
    expect(rfc).not.toContain('secret@e.fr');
    expect(rfc).not.toContain('Bcc:');
  });

  it('l’objet accentué est encodé (RFC 2047) — sinon « Réponse » arrive en « R?ponse »', () => {
    expect(rfc).toContain('Subject: =?UTF-8?B?');
    expect(encoderEnTete('Reponse')).toBe('Reponse'); // pur ASCII : laissé lisible tel quel
    expect(encoderEnTete('Réponse')).toContain('=?UTF-8?B?');
  });

  it('le corps est en base64 déclaré : les accents et les lignes longues passent intacts', () => {
    expect(rfc).toContain('Content-Transfer-Encoding: base64');
    expect(rfc).toContain('charset="UTF-8"');
    const corps = rfc.split('\r\n\r\n')[1];
    expect(Buffer.from(corps.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('Bonjour à vous');
  });

  it('le Message-ID porte NOTRE domaine, une horloge et un aléa — deux envois n’en partagent jamais un', () => {
    const a = fabriquerMessageId('criterimmo.fr', 'aaa', new Date('2026-09-24T12:00:00Z'));
    const b = fabriquerMessageId('criterimmo.fr', 'bbb', new Date('2026-09-24T12:00:00Z'));
    expect(a).toMatch(/^<\d+\.aaa@criterimmo\.fr>$/);
    expect(a).not.toBe(b);
    expect(domaineDe('Gestion <gestion@CRITERIMMO.fr>')).toBe('criterimmo.fr');
    expect(domaineDe('n’importe quoi')).toBe('criterimmo.fr'); // repli sûr, jamais un domaine inventé
  });

  it('le base64 remis à Gmail est « URL-safe » — la seule forme que l’API accepte', () => {
    const b = base64Url('ùûü??>>');
    expect(b).not.toContain('+');
    expect(b).not.toContain('/');
    expect(b).not.toContain('=');
  });
});

describe('L’APPEL À GMAIL, simulé', () => {
  it('un seul POST, avec le jeton en en-tête, la copie cachée dans l’enveloppe et le fil visé', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const faux = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ id: 'g-42' }) } as unknown as Response;
    });
    const r = await envoyerViaGmail({
      accessToken: 'jeton', rfc822: 'To: a@b.fr\r\n\r\ncorps', cci: ['secret@e.fr'], threadId: 'fil-9',
    }, { fetch: faux as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, gmailMessageId: 'g-42' });
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(appels[0].init?.method).toBe('POST');
    const corps = JSON.parse(String(appels[0].init?.body)) as { raw: string; threadId: string };
    expect(corps.threadId).toBe('fil-9');
    // La copie cachée est dans l'ENVELOPPE remise à Gmail (qui distribue puis la retire), jamais lisible ailleurs.
    const brut = Buffer.from(corps.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(brut).toContain('Bcc: secret@e.fr');
  });

  it('un 403 dit la cause DOMINANTE et réparable : la portée d’envoi n’a pas été accordée', async () => {
    const faux = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'insufficient' } }) } as unknown as Response));
    const r = await envoyerViaGmail({ accessToken: 'j', rfc822: 'x\r\n\r\ny' }, { fetch: faux as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('GUIDE_CONNEXION_GOOGLE_GESTION.md');
  });

  it('le réseau tombe → « le message n’est pas parti », pas une erreur opaque', async () => {
    const faux = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await envoyerViaGmail({ accessToken: 'j', rfc822: 'x\r\n\r\ny' }, { fetch: faux as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('n’est pas parti');
  });
});

describe('garanties STATIQUES — aucun envoi ne peut partir d’ailleurs', () => {
  it('🔴 AUCUN composant du navigateur n’atteint le chemin d’envoi', () => {
    const fichiers = readdirSync('app', { recursive: true })
      .map((p) => `app/${String(p).split(/[\\/]/).join('/')}`)
      .filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p));
    const clients = fichiers.filter((p) => {
      try { return /^\s*(['"])use client\1/.test(readFileSync(p, 'utf8')); } catch { return false; }
    });
    expect(clients.length).toBeGreaterThan(50); // témoin : la découverte fonctionne
    for (const c of clients) {
      const src = readFileSync(c, 'utf8');
      for (const interdit of ['gestion/envoiGmail', 'gestion/envoi\'', 'gestion/redactionRepo', 'gestion/gardeEnvoi']) {
        expect(src.includes(interdit), `${c} atteint ${interdit}`).toBe(false);
      }
    }
  });

  it('🔴 la route des BROUILLONS n’importe aucun chemin d’envoi : enregistrer ne peut pas expédier', () => {
    // Sur les lignes d'IMPORT seulement : l'en-tête CITE ces chemins pour dire qu'elle ne les emprunte pas.
    const imports = readFileSync('app/(admin)/api/admin/gestion/brouillons/route.ts', 'utf8')
      .split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
    for (const interdit of ['gestion/envoi', 'gestion/google', 'envoiGmail', 'messages/send']) {
      expect(imports.includes(interdit), interdit).toBe(false);
    }
  });

  it('le chemin d’envoi n’écrit RIEN dans les journaux applicatifs au-delà du métier', () => {
    for (const f of ['app/lib/gestion/envoi.ts', 'app/lib/gestion/envoiGmail.ts']) {
      const code = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l.trim())).join('\n');
      expect(/console\.(log|info|warn|error)/.test(code), f).toBe(false);
    }
  });

  it('`envoiGmail` n’ouvre aucune connexion par lui-même : le transport est injecté', () => {
    const code = readFileSync('app/lib/gestion/envoiGmail.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l.trim())).join('\n');
    // Le SEUL `fetch` du fichier est `deps.fetch` — jamais le global.
    expect(/(?<!deps\.)\bfetch\(/.test(code)).toBe(false);
    expect(code.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CORRECTIF DU 24/09/2026 — LE PREMIER VRAI ENVOI D'ARNO, RENDU COMME UN ÉCHEC ALORS QU'IL ÉTAIT PARTI.
 *
 * Mesuré en base avant d'écrire une ligne de correctif : `gestion_envoi` id 1 en état `envoye`, son `gmail_message_id`
 * renseigné, le brouillon 7 marqué envoyé — et ZÉRO ligne de journal. La cause : l'écriture du journal, APRÈS l'envoi,
 * était refusée par la règle `gestion_journal_entite_chk` (code 23514), et l'exception remontait jusqu'à la route.
 *
 * Ces épreuves FONT échouer chacun des trois gestes d'après-envoi, l'un après l'autre, et exigent à chaque fois la
 * même chose : le verdict rendu reste « envoyé ». C'est le seul point qui compte — le message, lui, est chez le
 * destinataire, et aucune écriture en retard ne le rappellera.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 UNE FOIS GMAIL ACCEPTÉ, PLUS RIEN NE PEUT RENDRE UN ÉCHEC', () => {
  it('le JOURNAL refusé par la base (le défaut du 23/09) : l’envoi reste un SUCCÈS', async () => {
    const { deps, trace } = monde({ casser: ['journal'] });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: true, deja: false });
    expect(r.ok && r.envoi.etat).toBe('envoye');
    // L'incident est signalé — au serveur, pas à l'écran — et il NOMME l'étape qui a manqué.
    expect(trace.incidents.map((i) => i.etape)).toEqual(['journal']);
  });

  it('la FINALISATION de la ligne refusée : l’envoi reste un succès, et le reste se fait quand même', async () => {
    const { deps, trace } = monde({ casser: ['finaliser'] });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: true });
    expect(trace.incidents.map((i) => i.etape)).toEqual(['finaliser']);
    // 🔴 Un geste manqué n'annule pas les suivants : le brouillon est marqué, le journal est écrit.
    expect(trace.brouillonsEnvoyes).toEqual([12]);
    expect(trace.journal).toHaveLength(1);
  });

  it('le MARQUAGE du brouillon refusé : l’envoi reste un succès, et le journal est écrit', async () => {
    const { deps, trace } = monde({ casser: ['brouillon'] });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: true });
    expect(trace.incidents.map((i) => i.etape)).toEqual(['brouillon']);
    expect(trace.journal).toHaveLength(1);
  });

  it('les TROIS refusés d’un coup : l’envoi reste un succès, et les trois incidents sont signalés', async () => {
    const { deps, trace } = monde({ casser: ['finaliser', 'brouillon', 'journal'] });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(r).toMatchObject({ ok: true });
    expect(trace.incidents.map((i) => i.etape)).toEqual(['finaliser', 'brouillon', 'journal']);
  });

  it('CÔTÉ ÉCHEC AUSSI : un journal refusé ne doit pas recouvrir le motif RÉEL du refus de Gmail', async () => {
    const { deps, trace } = monde({
      casser: ['journal', 'finaliser'],
      issueGmail: { ok: false, motif: 'Gmail a refusé : quota d’envoi dépassé.' },
    });
    const r = await envoyerMessage(DEMANDE, AUTEUR, deps);
    // C'est la raison de GMAIL qu'Arno doit lire, pas l'incident de journal qui l'aurait masquée.
    expect(r).toMatchObject({ ok: false, code: 'refus_gmail', motif: 'Gmail a refusé : quota d’envoi dépassé.' });
    expect(trace.incidents.map((i) => i.etape)).toEqual(['finaliser', 'journal']);
  });

  it('le journal reçoit l’identifiant de la ligne d’envoi — c’est lui qui dit OÙ la ranger', async () => {
    const { deps, trace } = monde();
    await envoyerMessage(DEMANDE, AUTEUR, deps);
    expect(trace.journal[0]).toMatchObject({ envoiId: 55, issue: 'envoye' });
  });
});
