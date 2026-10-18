import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le MAIL de la tâche d'un état des lieux de sortie (Arno, 19/10/2026) : le vrai `messageDeLaDemande` du module de tâches,
 * base simulée. Objet « EDL de sortie — adresse — JJ/MM/AAAA HHhMM-HHhMM », récapitulatif complet (les « Précisions »),
 * date et plage, expéditeur, liens Accepter / Refuser ; « Rendez-vous déplacé — » après un déplacement ; confirmation
 * « EDLS du JJ/MM accepté (refusé) par X » à l'expéditeur.
 */
let demande: Record<string, unknown>;
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => (sql.includes('FROM gestion_tache_demande d') && sql.includes('JOIN gestion_tache t')
    ? { rows: [demande] } : { rows: [] })),
}));
vi.mock('./schema', () => ({ invitesTacheDisponible: async () => false }));

const { messageDeLaDemande } = await import('./mailTacheRepo');
const lecteur = { preparer: async () => [] } as never;

const RECAP = 'Mission : état des lieux de sortie.\n\nAccès :\n· Digicode : 4521A\n\nLots concernés (2) :\n· Appartement T3\n· Parking · place 12';

beforeEach(() => {
  demande = {
    id: 9, tache_id: 5, destinataire_id: 4, destinataire_libelle: 'Claire Test', destinataire_email: 'claire@exemple.test',
    demandeur_libelle: 'Arno Test', demandeur_email: 'arno@exemple.test', cree_le: new Date('2026-10-19T08:00:00Z'),
    expire_le: new Date('2026-10-26T08:00:00Z'), statut: 'en_attente', repondu_le: null, repondu_par_libelle: null, motif: null,
    objet: 'EDL de sortie', note: RECAP, jour: '2026-11-03', heure: '10:00', duree_minutes: 90, lot_id: 7, adresse: '4 rue Fictive', commune: 'Puteaux',
  };
});

describe('le mail d’une tâche d’EDLS', () => {
  it('invitation : objet, date et plage, récapitulatif, expéditeur, liens Accepter / Refuser', async () => {
    const r = await messageDeLaDemande({ demandeId: 9, sorte: 'invitation', jeton: 'jeton-essai', de: 'gestion@exemple.test', lecteur });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.m.message;
    expect(m.objet).toBe('EDL de sortie — 4 rue Fictive — 03/11/2026 10h00-11h30');
    expect(m.a).toEqual(['claire@exemple.test']);
    expect(m.corps).toContain('DATE DE LA MISSION : MARDI 3 NOVEMBRE 2026 — 10 h 00 (1 h 30)');
    expect(m.corps).toContain('EDL de sortie');
    expect(m.corps).toContain(RECAP);
    expect(m.corps).toContain('Invitation envoyée par Arno Test');
    expect(m.corps).toMatch(/Accepter : \S+jeton-essai/);
    expect(m.corps).toMatch(/Refuser : \S+jeton-essai/);
  });

  it('après un déplacement : « Rendez-vous déplacé — … », ancienne date barrée', async () => {
    const r = await messageDeLaDemande({ demandeId: 9, sorte: 'invitation', jeton: 'j', de: 'gestion@exemple.test', lecteur,
      ancienneDate: { jour: '2026-11-02', heure: '14:00', dureeMinutes: 60 } });
    if (!r.ok) throw new Error(r.motif);
    expect(r.m.message.objet).toBe('Rendez-vous déplacé — EDL de sortie — 4 rue Fictive — 03/11/2026 10h00-11h30');
    expect(r.m.message.corps).toContain('ANCIENNE DATE (annulée)');
  });

  it('acceptation / refus : la confirmation part à l’expéditeur, objet « EDLS du 03/11 accepté (refusé) par Claire Test »', async () => {
    demande = { ...demande, statut: 'acceptee', repondu_par_libelle: 'Claire Test', repondu_le: new Date('2026-10-19T09:00:00Z') };
    let r = await messageDeLaDemande({ demandeId: 9, sorte: 'confirmation', de: 'gestion@exemple.test', lecteur, a: ['gestion@exemple.test', 'arno@exemple.test'] });
    if (!r.ok) throw new Error(r.motif);
    expect(r.m.message.objet).toBe('EDLS du 03/11 accepté par Claire Test');
    expect(r.m.message.a).toEqual(['gestion@exemple.test', 'arno@exemple.test']);
    demande = { ...demande, statut: 'refusee', motif: 'indisponible ce jour-là' };
    r = await messageDeLaDemande({ demandeId: 9, sorte: 'confirmation', de: 'gestion@exemple.test', lecteur, a: ['arno@exemple.test'] });
    if (!r.ok) throw new Error(r.motif);
    expect(r.m.message.objet).toBe('EDLS du 03/11 refusé par Claire Test');
    expect(r.m.message.corps).toContain('Motif du refus : indisponible ce jour-là');
  });

  it('une autre tâche garde son objet d’avant', async () => {
    demande = { ...demande, objet: 'Visite' };
    const r = await messageDeLaDemande({ demandeId: 9, sorte: 'invitation', jeton: 'j', de: 'gestion@exemple.test', lecteur });
    if (!r.ok) throw new Error(r.motif);
    expect(r.m.message.objet.startsWith('Tâche à accepter — ')).toBe(true);
  });
});
