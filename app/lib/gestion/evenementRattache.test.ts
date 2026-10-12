import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  lectureEvenement, listeEnCours, motCapsuleEvenement, motSurvolUrgence, motTypeEvenement, nEvenements, resumeBlocEvenement,
  sqlEvenementsRattaches, trameEvenement, trierParUrgence,
} from './evenementRattache';
import { etapeEnMots } from './etapeVignette';

/**
 * ══ 🔴🔴 LOT EVENEMENT-RATTACHE-COHERENT-ET-BLOC-DEPLIABLE — LE CALCUL UNIQUE ═══════════════════════════════════════
 * 🔒 Données de banc ; aucune base.
 */
const GES1 = { id: 1, reference: 'GES-2026-000001', objet: 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE', ouvert: true };
const GES2 = { id: 2, reference: 'GES-2026-000002', objet: 'Fuite', ouvert: true };
const CLOS = { id: 3, reference: 'GES-2026-000003', objet: 'Ancien', ouvert: false };
const plat = (s: string): string => s.replace(/\s+/g, ' ');

describe('🔴🔴 a) rattaché, b) ouvert sur le bien, ou aucun — une seule réponse', () => {
  it('a) le mail est rattaché à un événement en cours : pastille pleine, la fenêtre affiche CET événement', () => {
    const l = lectureEvenement([GES1], [GES1]);
    expect(l.cas).toBe('rattache');
    expect(l.enCours).toEqual([GES1]);
    expect(l.evenement).toEqual(GES1);
    /* L'événement du bien que le mail porte déjà n'est pas proposé une seconde fois. */
    expect(l.surLeBien).toEqual([]);
  });
  it('b) non rattaché, un événement ouvert sur le bien : pas de pastille, « aucun », et la proposition', () => {
    const l = lectureEvenement([], [GES1]);
    expect(l.cas).toBe('ouvert_sur_le_bien');
    expect(l.enCours).toEqual([]);
    expect(l.evenement).toBeNull();
    expect(l.surLeBien).toEqual([GES1]);
  });
  it('aucun : ni rattaché, ni ouvert sur le bien — et un événement CLOS du bien n’est jamais proposé', () => {
    expect(lectureEvenement([], [])).toEqual({ cas: 'aucun', enCours: [], evenement: null, surLeBien: [] });
    expect(lectureEvenement([], [CLOS]).cas).toBe('aucun');
  });
  it('rattaché à un événement clos : pas de pastille, la fenêtre l’affiche (gris) — et le bien peut proposer un autre', () => {
    const l = lectureEvenement([CLOS], [GES2]);
    expect(l.enCours).toEqual([]);
    expect(l.evenement).toEqual(CLOS);
    expect(l.cas).toBe('ouvert_sur_le_bien');
  });
  it('plusieurs rattachés : la fenêtre affiche celui que la pastille compte (en cours d’abord)', () => {
    expect(lectureEvenement([CLOS, GES2]).evenement).toEqual(GES2);
  });
  it('le mot de la capsule : « numéro — titre »', () => {
    expect(motCapsuleEvenement(GES1)).toBe('GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE');
  });
});

describe('🔒 « rattaché » a UNE définition SQL, lue par la ligne, la fenêtre, le filtre et la boîte', () => {
  it('la portée de l’affectation est respectée (migration 234)', () => {
    const sql = plat(sqlEvenementsRattaches(true, '$1::bigint[]'));
    expect(sql).toContain('af.message_id = msg.id');
    expect(sql).toContain('af.message_id IS NULL AND af.fil_id = msg.fil_id');
    expect(sql).toContain('AS ouvert');
    expect(sql).toContain('AS dans_periode');
    expect(plat(sqlEvenementsRattaches(false, '$1::bigint[]'))).not.toContain('af.message_id');
  });
  it('la fenêtre (`evenementDuMail`), la ligne et le filtre appellent la même fonction', () => {
    const gestes = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    const repo = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
    expect(gestes).toContain("sqlEvenementsRattaches(surLeMail, 'ARRAY[$1::bigint]')");
    expect(repo).toContain('${sqlEvenementsRattaches(avecMessageId, messages)}');
    expect(repo).toContain("sqlEvenementsRattaches(avecMessageId, 'ARRAY[m.id]')");
    /* La fenêtre reçoit, par sa route, les deux listes de la ligne. */
    const route = readFileSync('app/(admin)/api/admin/gestion/messages/[id]/affectation/route.ts', 'utf8');
    expect(route).toContain('evenementsLusDuMail(id)');
  });
  it('🔴 rien n’est jamais rattaché automatiquement : aucun écrit dans le module ni dans la lecture', () => {
    const mod = readFileSync('app/lib/gestion/evenementRattache.ts', 'utf8');
    for (const v of ['INSERT', 'UPDATE ', 'DELETE']) expect(mod, v).not.toContain(v);
  });
  it('⚠️ aucun accent dans le SQL émis (piège du lot 19d3c67d)', () => {
    expect(sqlEvenementsRattaches(true, '$1::bigint[]')).not.toMatch(/[À-ÿ]/);
  });
});

describe('🔴🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET — capsule, tri, ligne repliée, étape', () => {
  const U = (id: number, urgence: string | null, ouvertLe: string, ouvert = true) =>
    ({ id, reference: `GES-${id}`, objet: `objet ${id}`, ouvert, urgence, ouvertLe });
  it('la trame : l’échelle de l’application (normale vert, haute orange, urgent rouge), non précisée ambre, clos gris', () => {
    expect(trameEvenement({ ouvert: true, urgence: 'normale' })).toBe('vert');
    expect(trameEvenement({ ouvert: true, urgence: 'haute' })).toBe('orange');
    expect(trameEvenement({ ouvert: true, urgence: 'urgent' })).toBe('rouge');
    expect(trameEvenement({ ouvert: true, urgence: null })).toBe('non-precisee');
    expect(trameEvenement({ ouvert: false, urgence: 'urgent' })).toBe('clos');
    expect(motSurvolUrgence({ ouvert: true, urgence: 'haute' })).toBe('Urgence : intermédiaire');
    expect(motTypeEvenement(null)).toBe('non précisée');
  });
  it('le tri : urgence décroissante, puis ouverture la plus récente', () => {
    const l = trierParUrgence([U(1, null, '2026-10-01'), U(2, 'normale', '2026-09-01'), U(3, 'urgent', '2026-08-01'),
      U(4, 'urgent', '2026-09-15')]);
    expect(l.map((e) => e.id)).toEqual([4, 3, 2, 1]);
  });
  it('les accords : 1 événement, 2 événements ; + 1 autre, + 2 autres', () => {
    expect(nEvenements(1)).toBe('1 événement');
    expect(nEvenements(2)).toBe('2 événements');
    const a = U(1, null, '2026-09-01');
    expect(resumeBlocEvenement(lectureEvenement([a], [U(2, null, 'x')]), [a]).mot).toBe('+ 1 autre en cours');
    expect(resumeBlocEvenement(lectureEvenement([a], [U(2, null, 'x'), U(3, null, 'y')]), [a]).mot).toBe('+ 2 autres en cours');
    expect(resumeBlocEvenement(lectureEvenement([], [U(2, null, 'x')]), []).mot).toBe('aucun — 1 événement en cours sur ce bien :');
    expect(resumeBlocEvenement(lectureEvenement([], []), []).cas).toBe('aucun');
  });
  it('la liste dépliée : rattachés et non rattachés en cours, une fois chacun, triés', () => {
    const l = listeEnCours(lectureEvenement([U(1, null, '2026-09-01')], [U(1, null, '2026-09-01'), U(2, 'urgent', '2026-08-01')]));
    expect(l.map((e) => [e.id, e.rattache])).toEqual([[2, false], [1, true]]);
  });
  it('l’étape : la dernière étape de la frise, sinon « Ouverture » et la date d’ouverture', () => {
    expect(etapeEnMots(null, '2026-09-23T08:00:00Z')).toEqual({ mot: 'Ouverture', date: '23/09/2026', aConfirmer: false, deMonga: false });
    expect(etapeEnMots({ type: 'devis_recu', titre: null, survenuLe: '2026-10-02T09:00:00Z', heureConnue: false,
      jourConnu: true, source: 'monga', certitude: 'a_confirmer' }, null))
      .toEqual({ mot: 'Devis reçu', date: '02/10/2026', aConfirmer: true, deMonga: true });
  });
});
