import { describe, it, expect } from 'vitest';
import { capBatch, problemeEnvoi, classerErreurSmtp, emettreUneDemande, type DemandeAEnvoyer } from './envoiDemande';
import type { Requete } from './mairieContact';

/** Faux `q` transactionnel : enregistre chaque requête écrite, ne touche aucune base. */
function fauxQ() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const q: Requete = (async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rows: [] }; }) as Requete;
  return { q, calls };
}
/** Faux transport nodemailer : succès / 5xx (rebond) / erreur générique / messageId absent. */
const transport = {
  ok: { sendMail: async () => ({ messageId: '<abc@svav>', response: '250 2.0.0 OK' }) },
  rebond: { sendMail: async () => { const e = new Error('mailbox unavailable'); (e as { responseCode?: number }).responseCode = 550; throw e; } },
  erreur: { sendMail: async () => { throw new Error('timeout'); } },
  sansId: { sendMail: async () => ({ messageId: '', response: '250 OK' }) },
};
const D: DemandeAEnvoyer = { id: 42, reference: 'SVAV-DEM-2026-000001', communeNom: 'Nanterre', destEmail: 'urba@nanterre.fr', objet: 'Demande', corps: 'Corps' };
const OPTS = { from: 'noreply@svav.fr', replyTo: 'demandes@svav.fr', auteur: '7' };

describe('S38 — caps (capBatch) : bornent réellement une salve', () => {
  it('min(candidats, cap/run, reste du jour) ; jamais négatif', () => {
    expect(capBatch(100, 10, 25, 0)).toBe(10);   // borné par le cap/run
    expect(capBatch(100, 10, 25, 20)).toBe(5);   // borné par le reste du jour (25 − 20)
    expect(capBatch(3, 10, 25, 0)).toBe(3);      // borné par les candidats
    expect(capBatch(100, 10, 25, 25)).toBe(0);   // plafond du jour atteint → 0
    expect(capBatch(100, 10, 25, 40)).toBe(0);   // dépassé → 0 (jamais négatif)
  });
});

describe('S38 — garde-fous (problemeEnvoi)', () => {
  it('adresse de réponse vide → bloque, avec message explicite', () => {
    expect(problemeEnvoi('', true)).toMatch(/adresse de réponse/i);
    expect(problemeEnvoi('   ', true)).toMatch(/adresse de réponse/i);
  });
  it('SMTP absent → bloque', () => { expect(problemeEnvoi('demandes@svav.fr', false)).toMatch(/SMTP/i); });
  it('tout en place → null (aucun blocage)', () => { expect(problemeEnvoi('demandes@svav.fr', true)).toBeNull(); });
});

describe('S38 — classification d’échec', () => {
  it('5xx → rebond ; autre → echec', () => {
    expect(classerErreurSmtp({ responseCode: 550 })).toBe('rebond');
    expect(classerErreurSmtp({ responseCode: 421 })).toBe('echec'); // 4xx = transitoire
    expect(classerErreurSmtp(new Error('x'))).toBe('echec');
  });
});

describe('S38 — emettreUneDemande : statut envoyee UNIQUEMENT si émission confirmée', () => {
  it('succès → acheminement « envoye » + demande passée « envoyee » (garde AND statut=prete) + journal', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneDemande(transport.ok, q, D, OPTS);
    expect(r.issue).toBe('envoye');
    expect(r.messageId).toBe('<abc@svav>');
    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toMatch(/INSERT INTO demande_acheminement/i);
    expect(calls[0].params[1]).toBe('envoye');                 // statut d'acheminement
    expect(calls[0].params[3]).toBe('<abc@svav>');             // message_id capturé
    expect(calls[1].sql).toMatch(/UPDATE demande SET statut = 'envoyee'.*statut = 'prete'/i); // garde anti double-envoi (SQL sur une ligne)
    expect(calls[2].sql).toMatch(/INSERT INTO demande_journal/i);
  });

  it('ÉCHEC fournisseur (timeout) → « echec », demande NON passée en « envoyee » (réémettable)', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneDemande(transport.erreur, q, D, OPTS);
    expect(r.issue).toBe('echec');
    expect(calls).toHaveLength(1);                             // uniquement la trace d'acheminement
    expect(calls[0].params[1]).toBe('echec');
    expect(calls.some((c) => /UPDATE demande SET statut = 'envoyee'/i.test(c.sql))).toBe(false); // JAMAIS 'envoyee'
  });

  it('REBOND immédiat (5xx) → « rebond », demande reste « prete », plafond non consommé', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneDemande(transport.rebond, q, D, OPTS);
    expect(r.issue).toBe('rebond');
    expect(calls).toHaveLength(1);
    expect(calls[0].params[1]).toBe('rebond');
    expect(calls[0].params[5]).toBeInstanceOf(Date);          // rebond_le renseigné
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('messageId ABSENT → échec (pas de succès silencieux), demande NON envoyée', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneDemande(transport.sansId, q, D, OPTS);
    expect(r.issue).toBe('echec');
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });
});
