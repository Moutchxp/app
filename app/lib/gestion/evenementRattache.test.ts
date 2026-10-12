import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lectureEvenement, motCapsuleEvenement, sqlEvenementsRattaches } from './evenementRattache';

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
