import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * W1 — envoi des RELANCES. Mock de ../db/client pour les LECTURES (lireCandidatsRelance, compterEmisAujourdhui) ; les
 * ÉMISSIONS sont testées via un `q` transactionnel injecté (fauxQ) + des transports factices — aucune connexion, aucune base.
 * Protocole : COMPORTEMENT + PARAMÈTRES LIÉS + fragments SQL sémantiques (chaîne whitespace-normalisée), jamais la forme
 * complète d'un SQL.
 */
const { appels, etat, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[] };
  return { appels, etat, queryMock: async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: etat.rows }; } };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { planifierRelances, octetsDe, emettreUneRelance, lireCandidatsRelance, motifDesalignement, type RelanceAEnvoyer } from './envoiRelance';
import { compterEmisAujourdhui } from './envoiDemande';
import type { Requete } from './mairieContact';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
beforeEach(() => { appels.length = 0; etat.rows = []; });

/** Faux `q` transactionnel : enregistre chaque requête écrite, ne touche aucune base. */
function fauxQ() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const q: Requete = (async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rows: [] }; }) as Requete;
  return { q, calls };
}
const transport = {
  ok: { sendMail: async () => ({ messageId: '<r@svav>', response: '250 2.0.0 OK' }) },
  rebond: { sendMail: async () => { const e = new Error('mailbox unavailable'); (e as { responseCode?: number }).responseCode = 550; throw e; } },
  erreur: { sendMail: async () => { throw new Error('timeout'); } },
  sansId: { sendMail: async () => ({ messageId: '', response: '250 OK' }) },
};
const R: RelanceAEnvoyer = {
  relanceId: 7, demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnieres',
  destEmail: 'urba@asnieres.fr', objet: 'Relance', corps: 'Corps de relance propre', profil: 'entreprise',
  variante: 'saisine', envoyeLe: new Date('2026-03-14T10:00:00Z'), // H — étape enregistrée + ancre d'échéance
  numeros: ['PC0920042500001'], // LOT 6 — permis dus (compte rendu d'envoi auto)
};
const OPTS = { from: 'a.jorel@sansvisavis.com', replyTo: 'a.jorel@sansvisavis.com', auteur: 'admin' };

describe('W1 — planifierRelances : réutilise les garde-fous demandes + ajoute l’obsolescence', () => {
  const adresses = { entreprise: 'a.jorel@sansvisavis.com', personne: 'arnaud.jorel@gmail.com' };
  const comptes = { entreprise: true, personne: true };

  it('relance propre → envoyable avec l’expéditeur de son profil', () => {
    const plan = planifierRelances([R], adresses, comptes, new Map());
    expect(plan.envoyables).toHaveLength(1);
    expect(plan.envoyables[0].expediteur).toBe('a.jorel@sansvisavis.com');
    expect(plan.bloqueesCorps).toHaveLength(0);
    expect(plan.bloqueesCompte).toHaveLength(0);
    expect(plan.bloqueesObsoletes).toHaveLength(0);
  });

  it('corps à gabarit → bloqueesCorps, JAMAIS envoyable', () => {
    const plan = planifierRelances([{ ...R, corps: 'RAISON SOCIALE à REMPLIR' }], adresses, comptes, new Map());
    expect(plan.bloqueesCorps).toHaveLength(1);
    expect(plan.envoyables).toHaveLength(0);
  });

  it('compte SMTP du profil absent → bloqueesCompte (motif nommant les variables), JAMAIS envoyable', () => {
    const plan = planifierRelances([R], adresses, { entreprise: false, personne: false }, new Map());
    expect(plan.bloqueesCompte).toHaveLength(1);
    expect(plan.bloqueesCompte[0].motif).toMatch(/SMTP_HOST/);
    expect(plan.envoyables).toHaveLength(0);
  });

  it('dossiers satisfaits depuis le brouillon → bloqueesObsoletes NOMMANT les dossiers, JAMAIS envoyable', () => {
    const plan = planifierRelances([R], adresses, comptes, new Map([[42, ['PC0920042500001', 'PC0920042500002']]]));
    expect(plan.bloqueesObsoletes).toHaveLength(1);
    expect(plan.bloqueesObsoletes[0].motif).toContain('PC0920042500001');
    expect(plan.bloqueesObsoletes[0].motif).toContain('PC0920042500002');
    expect(plan.bloqueesObsoletes[0].motif).toMatch(/régénérez ou abandonnez/i);
    expect(plan.bloqueesObsoletes[0].motif).toMatch(/aucune régénération automatique/i);
    expect(plan.envoyables).toHaveLength(0); // le garde-fou bloque : la relance ne partira pas
  });

  it('H — variante DÉSALIGNÉE (relanceId dans desalignees) → bloqueesObsoletes avec le motif, JAMAIS envoyable', () => {
    const plan = planifierRelances([R], adresses, comptes, new Map(), new Map([[7, 'l’étape enregistrée « rappel » ne correspond plus à la fenêtre du jour (« avis »)']]));
    expect(plan.bloqueesObsoletes).toHaveLength(1);
    expect(plan.bloqueesObsoletes[0].motif).toMatch(/ne correspond plus à la fenêtre du jour/);
    expect(plan.envoyables).toHaveLength(0);
  });
});

describe('H — motifDesalignement : la variante enregistrée est re-dérivée sur la date d’envoi réelle', () => {
  const REG = { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 };
  const ENVOI = new Date('2026-03-14T10:00:00Z'); // échéance 14 avril
  it('alignée (saisine le jour de l’échéance) → null (pas obsolète)', () => {
    expect(motifDesalignement('saisine', ENVOI, new Date('2026-04-14T10:00:00Z'), REG)).toBeNull();
  });
  it('« formelle » (héritée) ≡ saisine → null', () => {
    expect(motifDesalignement('formelle', ENVOI, new Date('2026-04-20T10:00:00Z'), REG)).toBeNull();
  });
  it('« rappel » enregistrée mais fenêtre du jour = « avis » → motif nommant l’écart', () => {
    const m = motifDesalignement('rappel', ENVOI, new Date('2026-04-12T10:00:00Z'), REG); // reste 2 j → avis
    expect(m).toContain('« rappel »');
    expect(m).toContain('« avis »');
    expect(m).toMatch(/aucune régénération automatique/);
  });
  it('ancre d’envoi inconnue → null (laissé aux autres gardes)', () => {
    expect(motifDesalignement('rappel', null, new Date('2026-04-12T10:00:00Z'), REG)).toBeNull();
  });
});

describe('W1 — octetsDe : 0 en simulation, octets réels en --appliquer (correction du 0 trompeur de demandes:envoyer)', () => {
  it('appliquer=false → 0 même avec des envois', () => {
    expect(octetsDe([{ objet: 'Relance', corps: 'x'.repeat(100) }], false)).toBe(0);
  });
  it('appliquer=true → somme des octets (objet + corps)', () => {
    expect(octetsDe([{ objet: 'AB', corps: 'CDE' }], true)).toBe(5);            // 2 + 3 octets ASCII
    expect(octetsDe([{ objet: 'A', corps: 'B' }, { objet: 'CD', corps: 'E' }], true)).toBe(5);
  });
});

describe('W1 — emettreUneRelance : statut relance « envoyee » UNIQUEMENT si émission confirmée', () => {
  it('succès → acheminement « envoye » AVEC relance_id + demande_relance envoyee/envoyee_le (garde brouillon) + journal', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneRelance(transport.ok, q, R, OPTS);
    expect(r.issue).toBe('envoye');
    expect(r.messageId).toBe('<r@svav>');
    expect(calls).toHaveLength(3);
    expect(norm(calls[0].sql)).toContain('INSERT INTO demande_acheminement');
    expect(calls[0].params[1]).toBe('envoye');       // statut d'acheminement
    expect(calls[0].params[3]).toBe('<r@svav>');     // message_id capturé
    expect(calls[0].params[8]).toBe(7);              // relance_id (traçabilité W1)
    const upd = norm(calls[1].sql);
    expect(upd).toContain("UPDATE demande_relance SET statut = 'envoyee'");
    expect(upd).toContain('envoyee_le = now()');
    expect(upd).toContain("statut = 'brouillon'");   // garde anti-double-envoi
    expect(calls[1].params).toEqual([7]);
    expect(norm(calls[2].sql)).toContain('INSERT INTO demande_journal');
    expect(calls[2].params[0]).toBe(42);             // journal sur la DEMANDE
  });

  it('garde ANTI-DOUBLE-ENVOI : l’UPDATE ne cible qu’un brouillon (une relance déjà envoyée n’est pas réémise)', async () => {
    const { q, calls } = fauxQ();
    await emettreUneRelance(transport.ok, q, R, OPTS);
    expect(norm(calls[1].sql)).toContain("WHERE id = $1 AND statut = 'brouillon'");
  });

  it('ÉCHEC fournisseur → « echec », relance RESTE brouillon (réémettable), acheminement seul avec relance_id', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneRelance(transport.erreur, q, R, OPTS);
    expect(r.issue).toBe('echec');
    expect(calls).toHaveLength(1);
    expect(calls[0].params[1]).toBe('echec');
    expect(calls[0].params[8]).toBe(7);              // relance_id sur la trace d'échec
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false); // jamais 'envoyee'
  });

  it('REBOND 5xx → « rebond », relance reste brouillon, rebond_le renseigné', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneRelance(transport.rebond, q, R, OPTS);
    expect(r.issue).toBe('rebond');
    expect(calls).toHaveLength(1);
    expect(calls[0].params[1]).toBe('rebond');
    expect(calls[0].params[5]).toBeInstanceOf(Date); // rebond_le
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('messageId ABSENT → échec (pas de succès silencieux), relance NON envoyée', async () => {
    const { q, calls } = fauxQ();
    const r = await emettreUneRelance(transport.sansId, q, R, OPTS);
    expect(r.issue).toBe('echec');
    expect(calls.some((c) => /statut = 'envoyee'/i.test(c.sql))).toBe(false);
  });

  it('corps à gabarit → « gabarit » : AUCUNE émission, AUCUNE écriture (transport JAMAIS appelé)', async () => {
    const { q, calls } = fauxQ();
    let appele = false;
    const espion = { sendMail: async () => { appele = true; return { messageId: '<x>', response: '250' }; } };
    const r = await emettreUneRelance(espion, q, { ...R, corps: 'représentée par PRENOM NOM, QUALITE.' }, OPTS);
    expect(r.issue).toBe('gabarit');
    expect(r.motif).toMatch(/PRENOM NOM|QUALITE/);
    expect(appele).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('INVARIANT : demande.statut n’est JAMAIS écrit (aucun UPDATE de la table demande)', async () => {
    const { q, calls } = fauxQ();
    await emettreUneRelance(transport.ok, q, R, OPTS);
    // demande_acheminement / demande_relance / demande_journal sont écrits ; la table `demande` NON.
    expect(calls.some((c) => /UPDATE\s+demande\b/i.test(c.sql))).toBe(false);
  });
});

describe('W1 — lireCandidatsRelance : sélectionne les brouillons de demandes envoyées, e-mail adressable', () => {
  it('WHERE : brouillon + demande envoyée + canal e-mail + dest_email non vide (close & non-brouillon exclus) ; profil de LA RELANCE', async () => {
    etat.rows = [];
    await lireCandidatsRelance();
    const sel = appels.find((a) => /FROM demande_relance dr/i.test(a.sql))!;
    const s = norm(sel.sql);
    expect(s).toContain("dr.statut = 'brouillon'");             // relance non-brouillon (envoyée/abandonnée) exclue
    expect(s).toContain("d.statut = 'envoyee'");                // demande close/non-envoyée exclue
    expect(s).toContain("d.dest_canal = 'email'");
    expect(s).toContain("coalesce(btrim(d.dest_email), '') <> ''");
    expect(s).toContain('dr.profil_demandeur AS profil');       // le compte SMTP vient du profil de la relance
  });

  it('mappe relanceId/demandeId + normalise le profil', async () => {
    etat.rows = [{ relance_id: 7, demande_id: 42, reference: 'R', commune_nom: 'Asnieres', dest_email: 'a@b.fr', objet: 'O', corps: 'C', profil: 'personne' }];
    const [c] = await lireCandidatsRelance();
    expect(c).toMatchObject({ relanceId: 7, demandeId: 42, destEmail: 'a@b.fr', objet: 'O', corps: 'C', profil: 'personne' });
  });
});

describe('W1 — budget PARTAGÉ : compterEmisAujourdhui compte TOUTES les émissions e-mail du jour', () => {
  it('canal e-mail + statut envoye + jour, SANS filtre relance_id (donc demandes ET relances comptées)', async () => {
    etat.rows = [{ n: 24 }];
    const n = await compterEmisAujourdhui();
    expect(n).toBe(24);
    const s = norm(appels[0].sql);
    expect(s).toContain("canal = 'email'");
    expect(s).toContain("statut = 'envoye'");
    expect(s).toContain('CURRENT_DATE');
    expect(s).not.toContain('relance_id'); // ne distingue pas → un jour chargé en demandes réduit le budget des relances
  });
});
