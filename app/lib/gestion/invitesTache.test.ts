import { describe, expect, it } from 'vitest';
import {
  attenteAvantRenvoi, DELAI_RENVOI_MS, messageAttenteRenvoi, compterEnAttente, filtrerParAcceptation, phraseInvitations, refusChangementDestinataire, resumeInvites, titreLienRefuse,
  verdictLien, type InviteTache,
} from './acceptationTache';
import { filtrerParPastille, invitesDeLaSaisie, lireIdsInvites, lireSaisie, phraseTrace } from './taches';

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES — LES RÈGLES PURES DES INVITÉS (Arno, 17/10/2026) ═══════════════════════════
 * Plusieurs invités par tâche ; « N acceptées sur M » ; un lien dont l'invité a été remplacé « ne vous est plus
 * destiné » ; on ne change pas le destinataire d'un invité qui a accepté ; les filtres voient chaque invité.
 */
const invite = (p: Partial<InviteTache>): InviteTache => ({
  inviteId: 1, collaborateurId: 2, libelle: 'X', principal: false, statut: 'en_attente', automatique: false, motif: null,
  reponduLe: null, demandeLe: null, mailEtat: 'envoye', dernierRenvoiLe: null, ...p,
});

describe('« N acceptées sur M »', () => {
  it('compte les acceptées parmi tous les invités actifs', () => {
    expect(resumeInvites([invite({ statut: 'acceptee' }), invite({ statut: 'refusee' }), invite({ statut: 'en_attente' })])).toBe('1 acceptée sur 3');
    expect(resumeInvites([invite({ statut: 'acceptee' }), invite({ statut: 'acceptee' })])).toBe('2 acceptées sur 2');
    expect(resumeInvites([invite({ statut: 'en_attente' })])).toBe('0 acceptée sur 1');
  });
});

describe('le lien d’un invité remplacé', () => {
  const d = { statut: 'remplacee', destinataireId: 5, expireLe: null, utiliseLe: null };
  it('« Cette invitation ne vous est plus destinée », avant tout autre motif', () => {
    const v = verdictLien({ ...d, inviteRetire: true }, 'a_faire', 5, new Date());
    expect(v).toMatchObject({ ok: false, cause: 'plus_destinee' });
    expect(v.ok ? '' : v.message).toMatch(/ne vous est plus destinée/);
    expect(titreLienRefuse('plus_destinee')).toBe('Cette invitation ne vous est plus destinée');
  });
  it('un renvoi (invité toujours là) reste « remplacée par une plus récente »', () => {
    expect(verdictLien(d, 'a_faire', 5, new Date())).toMatchObject({ ok: false, cause: 'remplace' });
    expect(titreLienRefuse('remplace')).toBe('Ce lien ne peut plus servir');
  });
});

describe('changer le destinataire', () => {
  it('permis en attente ou refusée ; interdit si acceptée, avec le chemin à suivre', () => {
    expect(refusChangementDestinataire('en_attente')).toBeNull();
    expect(refusChangementDestinataire('refusee')).toBeNull();
    expect(refusChangementDestinataire('acceptee')).toMatch(/déjà accepté.*« Modifier »/);
  });
});

describe('les filtres et les compteurs voient CHAQUE invité', () => {
  const tache = {
    confieeA: 2, creePar: 1, acceptation: { statut: 'acceptee' as const, demandeurId: 1 },
    invites: [invite({ collaborateurId: 2, statut: 'acceptee' }), invite({ collaborateurId: 5, statut: 'en_attente' })],
    jour: '2026-10-21', etat: 'a_faire' as const,
  };
  it('« Confiées à moi » : je suis un invité (pas seulement « Confiée à »)', () => {
    expect(filtrerParAcceptation([tache], 'confiees', 'toutes', 5)).toHaveLength(1);
    expect(filtrerParAcceptation([tache], 'confiees', 'toutes', 9)).toHaveLength(0);
  });
  it('statut « En attente » : au moins un invité en attente ; compteur et pastille idem', () => {
    expect(filtrerParAcceptation([tache], 'toutes', 'en_attente', 1)).toHaveLength(1);
    expect(compterEnAttente([tache])).toBe(1);
    expect(filtrerParPastille([tache as unknown as Parameters<typeof filtrerParPastille>[0][number]], 'en_attente', new Date())).toHaveLength(1);
  });
  it('sans invités (base sans la 365) : la règle d’avant, inchangée', () => {
    const seul = { confieeA: 2, acceptation: { statut: 'en_attente' as const, demandeurId: 1 } };
    expect(filtrerParAcceptation([seul], 'confiees', 'toutes', 2)).toHaveLength(1);
    expect(compterEnAttente([seul])).toBe(1);
  });
});

describe('la saisie des invités', () => {
  it('« Confiée à » d’abord, puis les autres, sans doublon ni valeur invalide', () => {
    expect(invitesDeLaSaisie({ confieeA: 2, invites: [5, 2, 7, 5] })).toEqual([2, 5, 7]);
    expect(lireIdsInvites(['5', 7, -1, 'x', 7])).toEqual([5, 7]);
    expect(lireIdsInvites('5')).toBeUndefined();
  });
  it('un corps sans `invites` ne touche pas aux invités ; avec, il les lit', () => {
    const base = { objet: 'a', jour: '2026-10-21', confieeA: 2, rappels: [] };
    expect('invites' in lireSaisie(base)).toBe(false);
    expect(lireSaisie({ ...base, invites: [5, 7] }).invites).toEqual([5, 7]);
  });
});

describe('les traces et la phrase du geste', () => {
  const tr = (apres: Record<string, unknown>, avant: Record<string, unknown> | null = null) =>
    phraseTrace({ action: 'modification', avant, apres, survenuLe: '2026-10-17T08:00:00Z', auteurLibelle: 'Arnaud Jorel' });
  it('invité ajouté, retiré, destinataire changé', () => {
    expect(tr({ inviteAjoute: 'Emma' })).toMatch(/^Invité ajouté par Arnaud Jorel .*\(Emma\)$/);
    expect(tr({ inviteRetire: 'Emma' })).toMatch(/^Invité retiré par Arnaud Jorel .*\(Emma\)$/);
    expect(tr({ destinataireChange: 'Gaspard' }, { destinataire: 'Félix' })).toMatch(/^Destinataire changé par .*\(Félix → Gaspard\)$/);
  });
  it('la route dit à qui chaque invitation est partie', () => {
    expect(phraseInvitations([{ destinataire: 'Claire', etat: 'envoye' }, { destinataire: 'Emma', etat: 'echec' }]))
      .toBe(' Invitations : Claire (envoyée par mail), Emma (mail non envoyé (échec de l’envoi)).');
    expect(phraseInvitations([])).toBe('');
  });
});

describe('🔴 LOT 2 — le délai entre deux renvois au même invité', () => {
  it('2 minutes : avant, le temps qui reste (arrondi à la seconde au-dessus) ; après, 0', () => {
    const t0 = new Date('2026-10-17T10:00:00Z');
    expect(DELAI_RENVOI_MS).toBe(120_000);
    expect(attenteAvantRenvoi(null, t0)).toBe(0);
    expect(attenteAvantRenvoi('2026-10-17T10:00:00Z', t0)).toBe(120);
    expect(attenteAvantRenvoi('2026-10-17T09:59:00.500Z', t0)).toBe(61);
    expect(attenteAvantRenvoi('2026-10-17T09:58:00Z', t0)).toBe(0);
  });
  it('le message dit à qui, et combien de temps', () => {
    expect(messageAttenteRenvoi(80, 'Emma')).toBe('L’invitation à Emma vient d’être renvoyée : patientez encore 1 min 20 s avant un nouveau renvoi.');
    expect(messageAttenteRenvoi(45, 'Emma')).toContain('patientez encore 45 s');
  });
});
