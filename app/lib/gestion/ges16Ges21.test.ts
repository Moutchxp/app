import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { suivreLeMailDeplace } from './gestes';
import { citationsDuMessage } from './captureRepo';
import { motPoseDuRattachement, MOTIF_SUIVI_DANS_LE_JOURNAL } from './rattachementRepo';
import { MOTIF_POSE_PAR_SUIVI } from './periodeRepo';

/**
 * ══ 🔴🔴 LOT GES-16/21 (Arno, 10/11/2026) — LE CAS RÉEL DE PRODUCTION, REJOUÉ ═════════════════════════════════════════
 *
 * Diagnostic en lecture seule du 10/11/2026 (`.captures/diagnostic-ges-16-21/resultat-prod.txt`, production 16bd686d) :
 * l'échange 36977 « Humidité près des fenêtres et fuite à la douche, 25 rue Edith Cavell ». Le mail 59924 a été déplacé
 * à la main vers GES-2026-000016 (événement 42) ; ses réponses l'ont suivi. Le 09/11, l'artisan (gdsproprete) répond
 * dans cette conversation au sujet de l'autre affaire (GES-2026-000021, 48 bd de la Mission Marchand) : 61177 suit
 * GES-16 à 12:35, une personne le REMET dans son échange à 12:37 — puis 61178, 61179 et 61278 retombent dans GES-16.
 *
 * Les numéros, événements et horaires sont ceux de la production. Les en-têtes `In-Reply-To` / `References` n'étaient
 * pas dans le diagnostic : ils sont reconstitués comme un client de messagerie les écrit (la réponse cite son parent,
 * et toute la chaîne au-dessus). La base est simulée en mémoire ; la requête réelle a été exécutée en lecture seule sur
 * la base du Mac.
 */
interface Msg { id: number; mid: string }
interface Aff { id: number; messageId: number; evenementId: number; actif: boolean; affecteLe: number }

function baseSimulee() {
  const messages: Msg[] = [];
  const affectations: Aff[] = [];
  const references = new Map<number, string>([[42, 'GES-2026-000016'], [47, 'GES-2026-000021']]);
  let horloge = 0;
  const q = async (sql: string, p: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('WITH ORDINALITY')) {
      const cites = p[0] as string[];
      const soi = p[1] as number;
      for (let rang = 0; rang < cites.length; rang++) {
        const connus = messages.filter((m) => m.mid === cites[rang] && m.id !== soi);
        if (connus.length === 0) continue;
        const actives = affectations.filter((a) => a.actif && connus.some((m) => m.id === a.messageId))
          .sort((a, b) => b.affecteLe - a.affecteLe);
        const a = actives[0];
        return { rows: [{ rang: rang + 1, evenement_id: a?.evenementId ?? null, reference: a ? references.get(a.evenementId) : null }] };
      }
      return { rows: [] };
    }
    if (s.startsWith('SELECT id FROM gestion_affectation WHERE message_id = $1 AND actif')) {
      return { rows: affectations.filter((a) => a.actif && a.messageId === p[0]).map((a) => ({ id: a.id })) };
    }
    if (s.startsWith('INSERT INTO gestion_affectation')) {
      const id = 1000 + affectations.length;
      affectations.push({ id, messageId: p[2] as number, evenementId: p[1] as number, actif: true, affecteLe: ++horloge });
      return { rows: [{ id }] };
    }
    if (s.startsWith('INSERT INTO gestion_journal')) return { rows: [] };
    throw new Error(`requête inattendue : ${s}`);
  };
  /** Ce que fait la capture : écrire le mail, puis demander s'il suit un mail déplacé. */
  const capter = async (id: number, parent: string | null, chaine: string[]) => {
    messages.push({ id, mid: `<${id}@mail>` });
    return suivreLeMailDeplace(q as never, id, 36977,
      citationsDuMessage({ inReplyTo: parent, referencesBrut: chaine.length === 0 ? null : chaine.join(' ') }));
  };
  const deplacer = (messageId: number, evenementId: number) =>
    affectations.push({ id: 1000 + affectations.length, messageId, evenementId, actif: true, affecteLe: ++horloge });
  const remettre = (messageId: number) => { for (const a of affectations) if (a.messageId === messageId) a.actif = false; };
  const ou = (messageId: number) => affectations.find((a) => a.actif && a.messageId === messageId)?.evenementId ?? null;
  return { capter, deplacer, remettre, ou };
}

const M = (id: number) => `<${id}@mail>`;

describe('🔴🔴 GES-16/21 — une réponse suit le mail auquel elle répond, pas le dernier mail déplacé de la conversation', () => {
  it('le cas du 09/11/2026 : l’artisan répond dans la conversation « Humidité » au sujet de la fuite — rien ne retombe dans GES-16 après le geste humain', async () => {
    const b = baseSimulee();
    await b.capter(59924, null, []);
    b.deplacer(59924, 42);                                         // 30/10 10:30 — déplacé à la main vers GES-16
    expect(await b.capter(61171, M(59924), [M(59924)])).toEqual({ suivi: true, evenementId: 42 });  // 12:19, suit (inchangé)
    expect(await b.capter(61177, M(61171), [M(59924), M(61171)])).toEqual({ suivi: true, evenementId: 42 }); // 12:35, suit
    b.remettre(61177);                                             // 12:37 — remis dans son échange par une personne

    // 12:39, 12:40 : les réponses à 61177 restent avec lui, dans l'échange (avant le correctif : GES-16).
    expect(await b.capter(61178, M(61177), [M(59924), M(61171), M(61177)])).toEqual({ suivi: false });
    expect(await b.capter(61179, M(61177), [M(59924), M(61171), M(61177)])).toEqual({ suivi: false });
    // 18:08 — l'artisan répond à 61179 : même branche, même place.
    expect(await b.capter(61278, M(61179), [M(59924), M(61171), M(61177), M(61179)])).toEqual({ suivi: false });
    expect([b.ou(61177), b.ou(61178), b.ou(61179), b.ou(61278)]).toEqual([null, null, null, null]);
  });

  it('la branche « Humidité » continue de suivre GES-16 : le locataire qui répond à un mail rangé dans GES-16 y va', async () => {
    const b = baseSimulee();
    await b.capter(59924, null, []);
    b.deplacer(59924, 42);
    await b.capter(61171, M(59924), [M(59924)]);
    await b.capter(61177, M(61171), [M(59924), M(61171)]);
    b.remettre(61177);
    expect(await b.capter(61182, M(61171), [M(59924), M(61171)])).toEqual({ suivi: true, evenementId: 42 });
    // Et une réponse à une réponse qui a suivi suit encore : la chaîne ne se coupe pas.
    expect(await b.capter(61277, M(61182), [M(59924), M(61171), M(61182)])).toEqual({ suivi: true, evenementId: 42 });
  });

  it('parent inconnu de la base (jamais relevé) : on remonte au plus proche CONNU, dans l’ordre de la chaîne', async () => {
    const b = baseSimulee();
    await b.capter(1, null, []);
    await b.capter(2, M(1), [M(1)]);
    b.deplacer(1, 42);
    b.deplacer(2, 47);
    // Le parent <absent@mail> n'est pas en base ; le plus proche connu est 2 (GES-21), pas 1 (GES-16).
    expect(await b.capter(3, '<absent@mail>', [M(1), M(2), '<absent@mail>'])).toEqual({ suivi: true, evenementId: 47 });
  });
});

describe('🔴 citationsDuMessage : du plus proche au plus lointain', () => {
  it('In-Reply-To d’abord, puis References à rebours, sans doublon', () => {
    expect(citationsDuMessage({ inReplyTo: '<c@t>', referencesBrut: '<a@t> <b@t>\r\n <c@t>' })).toEqual(['<c@t>', '<b@t>', '<a@t>']);
    expect(citationsDuMessage({ inReplyTo: null, referencesBrut: '<a@t> <b@t>' })).toEqual(['<b@t>', '<a@t>']);
    expect(citationsDuMessage({ inReplyTo: null, referencesBrut: null })).toEqual([]);
  });
});

describe('🔴 le journal dit qui a posé le lien (le « posé à la main » du 09/11 à 18:09 venait du suivi)', () => {
  it('le motif du suivi s’écrit « par le suivi de la conversation » ; un geste humain reste « à la main »', () => {
    expect(MOTIF_SUIVI_DANS_LE_JOURNAL).toBe(MOTIF_POSE_PAR_SUIVI);
    expect(motPoseDuRattachement(false, MOTIF_POSE_PAR_SUIVI)).toBe('par le suivi de la conversation');
    expect(motPoseDuRattachement(false, undefined)).toBe('à la main');
    expect(motPoseDuRattachement(false, 'rattaché à la main')).toBe('à la main');
    expect(motPoseDuRattachement(true, MOTIF_POSE_PAR_SUIVI)).toBe('automatiquement');
  });
});

describe('🔴🔴 GES-16/21 — le rejeu sur la production (script reaffecter-reponses-suivies, mode essai)', () => {
  it('les réponses de la branche de l’artisan sont REMISES ; celles de la branche du locataire restent dans GES-16', async () => {
    const { rejouerReponsesSuivies } = await import('./repriseReponsesSuivies');
    const cite = (parent: number, chaine: number[]) => citationsDuMessage({ inReplyTo: M(parent), referencesBrut: chaine.map(M).join(' ') });
    const tous = [59924, 61171, 61177, 61178, 61179, 61182, 61188, 61277, 61278];
    const connus = new Map(tous.map((id) => [M(id), [id]]));
    // Aujourd'hui en production : 59924 (à la main) et les réponses suivies sont dans GES-16 (42) ; 61177 a été remis.
    const aujourdhui = new Map([59924, 61171, 61178, 61179, 61182, 61188, 61277, 61278].map((id) => [id, 42]));
    const v = rejouerReponsesSuivies(42, [
      { affectationId: 128, messageId: 61171, citations: cite(59924, [59924]) },
      { affectationId: 135, messageId: 61178, citations: cite(61177, [59924, 61171, 61177]) },
      { affectationId: 136, messageId: 61179, citations: cite(61177, [59924, 61171, 61177]) },
      { affectationId: 138, messageId: 61182, citations: cite(61171, [59924, 61171]) },
      { affectationId: 140, messageId: 61188, citations: cite(61182, [59924, 61171, 61182]) },
      { affectationId: 144, messageId: 61277, citations: cite(61188, [59924, 61171, 61182, 61188]) },
      { affectationId: 145, messageId: 61278, citations: cite(61179, [59924, 61171, 61177, 61179]) },
    ], connus, aujourdhui);
    expect(v.filter((x) => !x.garder).map((x) => x.messageId)).toEqual([61178, 61179, 61278]);
    expect(v.find((x) => x.messageId === 61278)).toMatchObject({ parent: 61179, evenementDuParent: null });
    expect(v.filter((x) => x.garder).map((x) => x.messageId)).toEqual([61171, 61182, 61188, 61277]);
  });
});

describe('🔴🔴 Arno (11/11/2026) — la règle PAR LE BIEN, rejouée sur l’essai en production de GES-2026-000016', () => {
  // Les 15 mails de l'essai (.captures/scripts-prod/reaffecter-reponses-suivies-GES16-essai.txt) : leur parent, leurs biens.
  const ESSAI: [number, number, string[]][] = [
    [60457, 60422, ['219']], [60763, 60423, ['219']], [60794, 60763, ['219']], [60795, 60763, ['219']], [60876, 60794, ['219']],
    [60882, 60876, ['219']], [61171, 60882, ['219']], [61178, 60423, ['219']], [61179, 61177, ['155', '219']], [61182, 61178, ['219']],
    [61188, 61182, ['219']], [61277, 61188, ['219']], [61278, 61179, ['219']], [61371, 61278, []], [61372, 61277, []],
  ];
  const suivies = ESSAI.map(([m, parent], i) => ({ affectationId: 900 + i, messageId: m, citations: [], parent }));
  const biens = new Map(ESSAI.map(([m, , b]) => [m, b] as [number, string[]]));
  it('seul 61179 (48 bd de la Mission Marchand) est retiré ; l’échange du 25 rue Edith Cavell reste dans GES-16 ; 61278 est signalé', async () => {
    const { trierParBien } = await import('./repriseReponsesSuivies');
    const v = trierParBien(suivies, biens, new Set(['219']));
    expect(v.filter((x) => !x.garder).map((x) => [x.messageId, x.autresBiens])).toEqual([[61179, ['155']]]);
    expect(v.filter((x) => x.aVerifier).map((x) => x.messageId)).toEqual([61278]);
    expect(v.filter((x) => x.garder)).toHaveLength(14);
  });
  it('un événement dont on ne connaît aucun bien : rien n’est retiré (on ne devine pas)', async () => {
    const { trierParBien } = await import('./repriseReponsesSuivies');
    expect(trierParBien(suivies, biens, new Set()).every((x) => x.garder)).toBe(true);
  });
  it('le script juge par le bien (plus par le parent) et dit les biens de l’événement', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/scripts/reaffecter-reponses-suivies.ts', 'utf8');
    expect(src).toMatch(/const verdicts = trierParBien\(/);
    expect(src).toContain('Biens de ${reference}');
  });
});
