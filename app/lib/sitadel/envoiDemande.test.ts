import { describe, it, expect } from 'vitest';
import { capBatch, problemeEnvoi, classerErreurSmtp, emettreUneDemande, planifierSalve, type DemandeAEnvoyer } from './envoiDemande';
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
const D: DemandeAEnvoyer = { id: 42, reference: 'SVAV-DEM-2026-000001', communeNom: 'Nanterre', destEmail: 'urba@nanterre.fr', objet: 'Demande', corps: 'Corps', profil: 'entreprise' };
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

describe('S43 — garde-fou PAR PROFIL (problemeEnvoi)', () => {
  it('adresse d’expédition/réponse vide → écarte, motif nommant le profil', () => {
    expect(problemeEnvoi('entreprise', '', true)).toMatch(/Société.*adresse|adresse/i);
    expect(problemeEnvoi('personne', '   ', true)).toMatch(/adresse/i);
  });
  it('compte SMTP absent → écarte, motif nommant les variables du BON compte', () => {
    expect(problemeEnvoi('entreprise', 'a.jorel@sansvisavis.com', false)).toMatch(/SMTP_HOST/);
    expect(problemeEnvoi('personne', 'arnaud.jorel@gmail.com', false)).toMatch(/SMTP_PERSONNE_/);
  });
  it('adresse + compte en place → null (aucun écartement)', () => {
    expect(problemeEnvoi('entreprise', 'a.jorel@sansvisavis.com', true)).toBeNull();
    expect(problemeEnvoi('personne', 'arnaud.jorel@gmail.com', true)).toBeNull();
  });
});

describe('S43 — planifierSalve : identité d’expédition PAR PROFIL', () => {
  const dEnt: DemandeAEnvoyer = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Nanterre', destEmail: 'urba@nanterre.fr', objet: 'Demande', corps: 'Corps société propre', profil: 'entreprise' };
  const dPers: DemandeAEnvoyer = { id: 2, reference: 'SVAV-DEM-2026-000002', communeNom: 'Paris', destEmail: 'urba@paris.fr', objet: 'Demande', corps: 'Corps personne propre', profil: 'personne' };
  const adresses = { entreprise: 'a.jorel@sansvisavis.com', personne: 'arnaud.jorel@gmail.com' };

  it('salve MIXTE, deux comptes configurés → deux expéditeurs DISTINCTS, aucun écartement', () => {
    const plan = planifierSalve([dEnt, dPers], adresses, { entreprise: true, personne: true });
    expect(plan.bloqueesCorps).toHaveLength(0);
    expect(plan.bloqueesCompte).toHaveLength(0);
    const parRef = Object.fromEntries(plan.envoyables.map((e) => [e.reference, e.expediteur]));
    expect(parRef['SVAV-DEM-2026-000001']).toBe('a.jorel@sansvisavis.com');
    expect(parRef['SVAV-DEM-2026-000002']).toBe('arnaud.jorel@gmail.com');
    expect(new Set(plan.envoyables.map((e) => e.expediteur)).size).toBe(2); // deux expéditeurs distincts
  });

  it('compte « personne » absent → écarte SEULEMENT la demande personne ; l’entreprise passe', () => {
    const plan = planifierSalve([dEnt, dPers], adresses, { entreprise: true, personne: false });
    expect(plan.envoyables.map((e) => e.reference)).toEqual(['SVAV-DEM-2026-000001']);
    expect(plan.envoyables[0].expediteur).toBe('a.jorel@sansvisavis.com');
    expect(plan.bloqueesCompte).toHaveLength(1);
    expect(plan.bloqueesCompte[0].reference).toBe('SVAV-DEM-2026-000002');
    expect(plan.bloqueesCompte[0].motif).toMatch(/SMTP_PERSONNE_/);
  });

  it('adresse du profil vide → écarte cette demande avec un motif d’adresse (sans toucher l’autre)', () => {
    const plan = planifierSalve([dEnt, dPers], { entreprise: 'a.jorel@sansvisavis.com', personne: '' }, { entreprise: true, personne: true });
    expect(plan.envoyables.map((e) => e.reference)).toEqual(['SVAV-DEM-2026-000001']);
    expect(plan.bloqueesCompte[0].reference).toBe('SVAV-DEM-2026-000002');
    expect(plan.bloqueesCompte[0].motif).toMatch(/adresse/i);
  });

  it('corps avec GABARIT → bloqueesCorps (prioritaire, court-circuite le contrôle de compte)', () => {
    const dGab: DemandeAEnvoyer = { ...dEnt, corps: 'RAISON SOCIALE à REMPLIR' };
    const plan = planifierSalve([dGab], adresses, { entreprise: false, personne: false });
    expect(plan.bloqueesCorps).toHaveLength(1);
    expect(plan.bloqueesCompte).toHaveLength(0);
    expect(plan.envoyables).toHaveLength(0);
  });
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

  it('S39 (A) — corps avec GABARIT → « gabarit » : AUCUNE émission, AUCUNE écriture (garde-fou non contournable, y compris en simulation)', async () => {
    const { q, calls } = fauxQ();
    let sendAppele = false;
    const espion = { sendMail: async () => { sendAppele = true; return { messageId: '<x>', response: '250' }; } };
    const dGabarit: DemandeAEnvoyer = { ...D, corps: 'RAISON SOCIALE EXACTE, représentée par PRENOM NOM, QUALITE.' };
    const r = await emettreUneDemande(espion, q, dGabarit, OPTS);
    expect(r.issue).toBe('gabarit');
    expect(r.motif).toMatch(/RAISON SOCIALE/);
    expect(sendAppele).toBe(false);   // aucun appel au transport → aucun octet, même chemin en simulation
    expect(calls).toHaveLength(0);     // aucune écriture
  });
});
