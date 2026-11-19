import { describe, expect, it } from 'vitest';
import { collaborateursAPrevenirAnnulation, mailAnnulationTache, PHRASE_AVANT_ANNULATION, phraseApresAnnulation, tacheVisible } from './annulationTache';

/** 🔴🔴 Arno (19/11/2026, choix A) — une tâche annulée disparaît des écrans ; seuls ceux qui avaient ACCEPTÉ reçoivent le mail d'annulation. */
describe('🔴 qui est prévenu de l’annulation', () => {
  const R = [
    { id: 2, libelle: 'Arnaud Jorel', email: 'a.jorel@sansvisavis.com', statut: 'acceptee' },
    { id: 6, libelle: 'Cédric JULLIEN', email: 'c@sansvisavis.com', statut: 'acceptee' },
    { id: 5, libelle: 'Jean-Baptiste PONS', email: 'jb@sansvisavis.com', statut: 'en_attente' },
    { id: 9, libelle: 'Service Gestion', email: 'g@sansvisavis.com', statut: 'refusee' },
    { id: 7, libelle: 'Sans adresse', email: null, statut: 'acceptee' },
    { id: 6, libelle: 'Cédric JULLIEN', email: 'c@sansvisavis.com', statut: 'acceptee' },
  ];
  it('seuls ceux qui avaient accepté, avec une adresse, une seule fois ; jamais la personne qui annule', () => {
    expect(collaborateursAPrevenirAnnulation(R, 2).map((c) => c.libelle)).toEqual(['Cédric JULLIEN']);
    expect(collaborateursAPrevenirAnnulation(R, 5).map((c) => c.libelle)).toEqual(['Arnaud Jorel', 'Cédric JULLIEN']);
    expect(collaborateursAPrevenirAnnulation(R.filter((r) => r.statut !== 'acceptee'), 2)).toEqual([]);
  });
});

describe('🔴 le mail d’annulation et les phrases des fenêtres', () => {
  it('le mail dit la tâche, la date et l’heure, et qui annule ; objet « [Copie interne] »', () => {
    const m = mailAnnulationTache({ pour: { libelle: 'Cédric JULLIEN' }, rdv: true, titre: 'Pré-visite d’état des lieux de sortie', adresse: '1 rue du Préavis, Puteaux',
      quand: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 30 }, auteur: 'Arnaud Jorel' });
    expect(m.objet).toBe('[Copie interne] Rendez-vous annulé — Pré-visite d’état des lieux de sortie — 1 rue du Préavis, Puteaux');
    expect(m.corps).toContain('Le rendez-vous « Pré-visite d’état des lieux de sortie » (1 rue du Préavis, Puteaux), prévu le 20/11/2026 de 10h00 à 10h30, est annulé par Arnaud Jorel.');
    expect(m.corps).toContain('L’événement est retiré de votre agenda Google.');
    expect(mailAnnulationTache({ pour: { libelle: 'X' }, rdv: false, titre: 'Relancer', adresse: null, quand: { jour: '2026-11-20', heure: null, dureeMinutes: null }, auteur: 'Y' }).objet)
      .toBe('[Copie interne] Tâche annulée — Relancer');
  });
  it('avant : la phrase mot pour mot ; après : la confirmation ; une tâche annulée ne se montre jamais', () => {
    expect(PHRASE_AVANT_ANNULATION).toBe('La tâche disparaîtra de l’interface et les personnes ayant accepté le rendez-vous seront prévenues par mail.');
    expect(phraseApresAnnulation({ titre: 'Visite', prevenus: 2, echecs: 0 })).toBe('La tâche « Visite » est annulée : elle n’apparaît plus dans l’interface. 2 personnes ont été prévenues par mail.');
    expect(phraseApresAnnulation({ titre: 'Visite', prevenus: 0, echecs: 1 })).toContain('Personne n’avait accepté : aucun mail n’est parti. 1 mail n’est pas parti.');
    expect([{ etat: 'a_faire' }, { etat: 'faite' }, { etat: 'annulee' }].filter(tacheVisible).map((t) => t.etat)).toEqual(['a_faire', 'faite']);
  });
});
