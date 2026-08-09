import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * X3 — envoi de la saisine CADA. L'ÉCRITURE passe par le withTransaction mocké ; les LECTURES + la production de PJ sont
 * INJECTÉES (test node-pur). emettreUneSaisine est testée avec transport + q injectés. Protocole : comportement + paramètres
 * liés + fragments SQL sémantiques (jamais la forme complète).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { txCalled: 0 };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: [] as unknown[] }; };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    etat.txCalled += 1;
    const q = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: [] as unknown[] }; };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import {
  partitionForclusion, emettreUneSaisine, envoyerSaisinesCada,
  type SaisineAEnvoyer, type DepsEnvoiSaisine,
} from './envoiSaisineCada';
import type { Requete } from './mairieContact';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.txCalled = 0; });

const ENVOI = new Date('2026-03-14T10:00:00Z');            // refus 14 avr, forclusion 14 juin
const DANS_FENETRE = new Date('2026-05-10T12:00:00Z');
const APRES_FORCLUSION = new Date('2026-07-01T12:00:00Z');

function fauxQ() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const q: Requete = (async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rows: [] }; }) as Requete;
  return { q, calls };
}
function transportOk() { const arg: { v?: Record<string, unknown> } = {}; return { arg, t: { sendMail: async (m: Record<string, unknown>) => { arg.v = m; return { messageId: '<c@svav>', response: '250 OK' }; } } }; }
const transportRebond = { sendMail: async () => { const e = new Error('mailbox unavailable'); (e as { responseCode?: number }).responseCode = 550; throw e; } };
const transportErreur = { sendMail: async () => { throw new Error('timeout'); } };
const transportSansId = { sendMail: async () => ({ messageId: '', response: '250' }) };

const S = (over: Partial<SaisineAEnvoyer> = {}): SaisineAEnvoyer => ({
  saisineId: 7, demandeId: 42, profil: 'entreprise', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine',
  objet: 'Saisine — réf. SVAV-DEM-2026-000042', corps: 'Corps de saisine propre', envoyeLe: ENVOI,
  demandeDestEmail: 'urba@asnieres.fr', demandeCorps: 'Corps figé de la demande initiale', ...over,
});
const OPTS = { from: 'a.jorel@sansvisavis.com', replyTo: 'a.jorel@sansvisavis.com', to: 'cada@cada.fr', piece: Buffer.from('%PDF-1.7'), auteur: 'admin' };

function deps(over: Partial<DepsEnvoiSaisine> = {}): DepsEnvoiSaisine {
  return {
    cadaEmail: async () => 'cada@cada.fr',
    cadaUrlFormulaire: async () => 'https://www.cada.fr/formulaire-de-saisine',
    caps: async () => ({ capParRun: 10, capParJour: 25 }),
    candidats: async () => [S()],
    adresses: async () => ({ entreprise: 'a.jorel@sansvisavis.com', personne: 'arnaud.jorel@gmail.com' }),
    comptes: () => ({ entreprise: { host: 'h', port: 587, user: 'u', pass: 'p' }, personne: null }),
    emisAujourdhui: async () => 0,
    produireCopie: async () => Buffer.from('%PDF-1.7 copie'),
    maintenant: () => DANS_FENETRE,
    ...over,
  };
}

describe('X3 — partitionForclusion : forclusion revérifiée à l’envoi', () => {
  it('fenêtre ouverte → recevable ; fermée → forclose avec motif nommant la date ; le transport ne la verra jamais', () => {
    expect(partitionForclusion([S()], DANS_FENETRE).recevables).toHaveLength(1);
    const p = partitionForclusion([S()], APRES_FORCLUSION);
    expect(p.recevables).toHaveLength(0);
    expect(p.forcloses).toHaveLength(1);
    expect(p.forcloses[0].motif).toMatch(/forclos/i);
    expect(p.forcloses[0].motif).toContain('14 juin 2026'); // date de forclusion nommée
  });
});

describe('X3 — emettreUneSaisine : émission + trace (relance_id = id de la saisine)', () => {
  it('succès → PJ transmise + acheminement « envoye » (relance_id) + saisine envoyee/envoyee_le (garde brouillon) + journal', async () => {
    const { q, calls } = fauxQ();
    const { arg, t } = transportOk();
    const r = await emettreUneSaisine(t, q, S(), OPTS);
    expect(r.issue).toBe('envoye');
    // La copie est bien jointe à l'e-mail (R343-1)
    expect((arg.v!.attachments as { filename: string }[])[0].filename).toBe('Copie-demande-SVAV-DEM-2026-000042.pdf');
    expect(calls).toHaveLength(3);
    expect(norm(calls[0].sql)).toContain('INSERT INTO demande_acheminement');
    expect(calls[0].params[1]).toBe('envoye');
    expect(calls[0].params[8]).toBe(7);          // relance_id = id de la saisine
    const upd = norm(calls[1].sql);
    expect(upd).toContain("UPDATE demande_relance SET statut = 'envoyee'");
    expect(upd).toContain('envoyee_le = now()');
    expect(upd).toContain("statut = 'brouillon'"); // anti-double-envoi
    expect(calls[1].params).toEqual([7]);
    expect(norm(calls[2].sql)).toContain('INSERT INTO demande_journal');
  });

  it('échec fournisseur → « echec », saisine RESTE brouillon (acheminement seul avec relance_id)', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneSaisine(transportErreur, q, S(), OPTS);
    expect(r.issue).toBe('echec');
    expect(calls).toHaveLength(1);
    expect(calls[0].params[1]).toBe('echec');
    expect(calls[0].params[8]).toBe(7);
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('rebond 5xx → « rebond », saisine reste brouillon', async () => {
    const { q, calls } = fauxQ();
    expect((await emettreUneSaisine(transportRebond, q, S(), OPTS)).issue).toBe('rebond');
    expect(calls[0].params[1]).toBe('rebond');
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('messageId absent → échec (pas de succès silencieux)', async () => {
    const { q, calls } = fauxQ();
    expect((await emettreUneSaisine(transportSansId, q, S(), OPTS)).issue).toBe('echec');
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('corps à gabarit → « gabarit » : transport JAMAIS appelé, AUCUNE écriture', async () => {
    const { q, calls } = fauxQ();
    let appele = false;
    const espion = { sendMail: async () => { appele = true; return { messageId: '<x>' }; } };
    const r = await emettreUneSaisine(espion, q, S({ corps: 'RAISON SOCIALE à REMPLIR' }), OPTS);
    expect(r.issue).toBe('gabarit');
    expect(appele).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('INVARIANT : demande.statut jamais écrit (aucun UPDATE de la table demande)', async () => {
    const { q, calls } = fauxQ();
    await emettreUneSaisine(transportOk().t, q, S(), OPTS);
    expect(calls.some((c) => /UPDATE\s+demande\b/i.test(c.sql))).toBe(false);
  });
});

describe('X3 — envoyerSaisinesCada : canaux, garde-fous, budget', () => {
  it('cada_email renseigné + recevable → envoyée (sim), acheminement écrit avec relance_id, octets=0 en simulation', async () => {
    const r = await envoyerSaisinesCada({}, deps());
    expect(r.canal).toBe('email');
    expect(r.resultats.map((x) => x.issue)).toEqual(['envoye']);
    expect(r.destinataires[0].email).toBe('cada@cada.fr');
    expect(r.destinataires[0].expediteur).toBe('a.jorel@sansvisavis.com');
    expect(r.octetsPartis).toBe(0);
    const ins = trouver(/INSERT INTO demande_acheminement/i)!;
    expect(ins.params[8]).toBe(7); // relance_id = saisine
  });

  it('cada_email VIDE → canal formulaire : AUCUN appel transport, AUCUNE écriture d’acheminement, file renvoyée', async () => {
    const r = await envoyerSaisinesCada({}, deps({ cadaEmail: async () => '' }));
    expect(r.canal).toBe('formulaire');
    expect(r.resultats).toHaveLength(0);
    expect(r.fileADeposer).toHaveLength(1);
    expect(r.fileADeposer[0].urlFormulaire).toBe('https://www.cada.fr/formulaire-de-saisine');
    expect(r.fileADeposer[0].objet).toContain('Saisine');
    expect(etat.txCalled).toBe(0);                         // aucune transaction → aucune émission
    expect(trouver(/INSERT INTO demande_acheminement/i)).toBeUndefined();
  });

  it('saisine hors fenêtre à l’envoi → écartée (forclusion), non envoyée', async () => {
    const r = await envoyerSaisinesCada({}, deps({ maintenant: () => APRES_FORCLUSION }));
    expect(r.bloqueesForclusion).toHaveLength(1);
    expect(r.resultats).toHaveLength(0);
    expect(r.destinataires).toHaveLength(0);
    expect(trouver(/INSERT INTO demande_acheminement/i)).toBeUndefined();
  });

  it('pièce jointe impossible à produire → écartée (bloqueesPiece), jamais envoyée', async () => {
    const r = await envoyerSaisinesCada({}, deps({ produireCopie: async () => { throw new Error('PdfError'); } }));
    expect(r.bloqueesPiece).toHaveLength(1);
    expect(r.bloqueesPiece[0].motif).toMatch(/R343-1/);
    expect(r.resultats).toHaveLength(0);
    expect(trouver(/INSERT INTO demande_acheminement/i)).toBeUndefined();
  });

  it('corps à gabarit → bloqueesCorps ; SMTP du profil absent → bloqueesCompte ; aucune n’est envoyée', async () => {
    const gab = await envoyerSaisinesCada({}, deps({ candidats: async () => [S({ corps: 'RAISON SOCIALE à REMPLIR' })] }));
    expect(gab.bloqueesCorps).toHaveLength(1);
    expect(gab.resultats).toHaveLength(0);
    const sansCompte = await envoyerSaisinesCada({}, deps({ comptes: () => ({ entreprise: null, personne: null }) }));
    expect(sansCompte.bloqueesCompte).toHaveLength(1);
    expect(sansCompte.resultats).toHaveLength(0);
  });

  it('budget PARTAGÉ : le plafond du jour déjà atteint (demandes+relances) → budget 0, rien n’est envoyé', async () => {
    const r = await envoyerSaisinesCada({}, deps({ emisAujourdhui: async () => 25 })); // cap/jour = 25
    expect(r.budget).toBe(0);
    expect(r.resultats).toHaveLength(0);
  });
});
