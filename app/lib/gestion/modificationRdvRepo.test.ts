import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (19/11/2026, règles D, H, K) — après une modification, le collaborateur initial retiré par QUELQU'UN D'AUTRE reçoit le mail « Rendez-vous
 * modifié » (agenda Google retiré si l'événement y était) ; la personne qui modifie ne se prévient jamais ; chaque mail est journalisé. Base et
 * transport simulés : on regarde ce qui part, à qui, et ce qui s'écrit.
 */
const h = vi.hoisted(() => ({
  tache: { jour: '2026-11-25', heure: '14:00', duree: 60, objet: 'État des lieux de sortie', confiee_a: '4', libelle: 'Claire Test', email: 'claire@exemple.test', agenda: true, adresse: '12 rue de l’Essai' },
  invites: [] as { id: string | null; libelle: string; email: string | null; agenda: boolean }[],
  ecrits: [] as unknown[][], envoiMail: true,
}));
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('FROM gestion_tache t LEFT JOIN admin_utilisateur')) return { rows: [{ ...h.tache }] };
    if (s.includes('FROM gestion_tache_invite i')) return { rows: h.invites };
    if (s.startsWith('INSERT INTO gestion_tache_action')) { h.ecrits.push(p); return { rows: [] }; }
    return { rows: [] };
  },
}));
vi.mock('./acceptationRepo', () => ({ lireReglageTaches: async () => ({ envoiMail: h.envoiMail, dureeLienJours: 7 }) }));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));
import { etatDuRdv, prevenirCollaborateurInitial } from './modificationRdvRepo';

const envoyes: { a: readonly string[]; objet: string; corps: string }[] = [];
const transport = { envoyer: async (m: { a: readonly string[]; objet: string; corps: string }) => { envoyes.push(m); return { ok: true as const, id: null, factice: true }; } };
beforeEach(() => {
  envoyes.length = 0; h.ecrits = []; h.envoiMail = true; h.invites = [];
  h.tache = { ...h.tache, confiee_a: '4', libelle: 'Claire Test', email: 'claire@exemple.test', agenda: true, jour: '2026-11-25' };
});
const changerPour = (id: string, libelle: string, email: string, agenda = false) => { h.tache = { ...h.tache, confiee_a: id, libelle, email, agenda }; };

describe('🔴 D / H / K — prévenir le collaborateur initial', () => {
  it('confié à un autre par QUELQU’UN D’AUTRE : le mail part à l’initial (créneaux, collaborateurs, auteur, agenda retiré), journalisé', async () => {
    const avant = await etatDuRdv(41);
    changerPour('5', 'Paul Test', 'paul@exemple.test');
    h.tache = { ...h.tache, jour: '2026-11-27' };
    expect(await prevenirCollaborateurInitial(41, avant, { id: 3, libelle: 'Arnaud Jorel' }, transport as never)).toEqual(['claire@exemple.test']);
    expect(envoyes.map((m) => m.a)).toEqual([['claire@exemple.test']]);
    expect(envoyes[0].objet).toBe('[Copie interne] Rendez-vous modifié — État des lieux de sortie — 12 rue de l’Essai');
    for (const t of ['Ancien créneau : 25/11/2026 de 14h00 à 15h00', 'Nouveau créneau : 27/11/2026 de 14h00 à 15h00', 'Ancien collaborateur : Claire Test',
      'Nouveau collaborateur : Paul Test', 'modifié par Arnaud Jorel', 'L’événement est retiré de votre agenda Google.']) expect(envoyes[0].corps).toContain(t);
    expect(h.ecrits).toHaveLength(1);
  });
  it('la personne qui modifie EST le collaborateur initial : aucun mail', async () => {
    const avant = await etatDuRdv(41);
    changerPour('5', 'Paul Test', 'paul@exemple.test');
    expect(await prevenirCollaborateurInitial(41, avant, { id: 4, libelle: 'Claire Test' }, transport as never)).toEqual([]);
    expect(envoyes).toEqual([]);
  });
  it('même collaborateur (seule la date change) : pas de mail D — la nouvelle invitation existante l’informe (G)', async () => {
    const avant = await etatDuRdv(41);
    h.tache = { ...h.tache, jour: '2026-11-27' };
    expect(await prevenirCollaborateurInitial(41, avant, { id: 3, libelle: 'Arnaud Jorel' }, transport as never)).toEqual([]);
  });
  it('l’envoi des demandes par mail coupé (réglage des tâches) : rien ne part', async () => {
    h.envoiMail = false;
    const avant = await etatDuRdv(41);
    changerPour('5', 'Paul Test', 'paul@exemple.test');
    expect(await prevenirCollaborateurInitial(41, avant, { id: 3, libelle: 'Arnaud Jorel' }, transport as never)).toEqual([]);
  });
  it('pré-visite à plusieurs collègues : seul celui qu’on retire est prévenu', async () => {
    h.invites = [{ id: '4', libelle: 'Claire Test', email: 'claire@exemple.test', agenda: false }, { id: '6', libelle: 'Léa Test', email: 'lea@exemple.test', agenda: true }];
    const avant = await etatDuRdv(40);
    h.invites = [{ id: '4', libelle: 'Claire Test', email: 'claire@exemple.test', agenda: false }, { id: '5', libelle: 'Paul Test', email: 'paul@exemple.test', agenda: false }];
    expect(await prevenirCollaborateurInitial(40, avant, { id: 3, libelle: 'Arnaud Jorel' }, transport as never)).toEqual(['lea@exemple.test']);
  });
});
