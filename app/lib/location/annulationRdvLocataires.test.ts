import { describe, expect, it } from 'vitest';
import { mailsAnnulationLocataires, objetAnnulationLocataire, SORTE_ANNULATION_LOCATAIRES } from './annulationRdvLocataires';
import type { Contexte } from './previsiteBase';

/** 🔴🔴 Arno (19/11/2026, choix A) — l'annulation d'un rendez-vous du préavis : SEULS les locataires qui avaient accepté reçoivent le mail (avec l'annulation d'agenda). */
const C = {
  adresse: '1 rue du Préavis, 92800 Puteaux', lotId: 11, expediteur: 'gestion@criterimmo.fr', brute: '',
  qui: { email: 'a.jorel@sansvisavis.com', nom: 'Arnaud Jorel' }, signature: { html: '', texte: 'Sans Vis-à-Vis' },
  locataires: [
    { occupationId: 11, nom: 'BERNARD', prenom: 'Alice', emails: ['alice@exemple.test'], entree: null, sortie: null },
    { occupationId: 12, nom: 'MARTIN', prenom: 'Bruno', emails: ['bruno@exemple.test'], entree: null, sortie: null },
  ],
} as unknown as Contexte;
const RDV = { jour: '2026-11-20', heure: '10:00', dureeMinutes: 30 };

describe('🔴 le mail d’annulation aux locataires', () => {
  it('seul le locataire qui avait accepté le reçoit ; l’invitation jointe ANNULE l’événement (même UID que l’invitation)', () => {
    const m = mailsAnnulationLocataires(C, { sorte: 'previsite', rdvId: 7, tacheId: 41, rdv: RDV, acceptes: [12], sequence: 3, maintenant: new Date('2026-11-19T10:00:00Z') });
    expect(m.map((x) => x.a)).toEqual([['bruno@exemple.test']]);
    expect(m[0].sorte).toBe(SORTE_ANNULATION_LOCATAIRES);
    expect(m[0].objet).toBe('Pré-visite annulée — 1 rue du Préavis, 92800 Puteaux');
    expect(m[0].texte).toContain('prévu le 20/11/2026 de 10h00 à 10h30, est annulé.');
    expect(m[0].ics?.contenu).toContain('METHOD:CANCEL');
    expect(m[0].ics?.contenu).toContain('STATUS:CANCELLED');
    expect(m[0].ics?.contenu).toContain('UID:previsite-7@criterimmo.fr');
  });
  it('personne n’avait accepté : aucun mail', () => {
    expect(mailsAnnulationLocataires(C, { sorte: 'edl', rdvId: 3, tacheId: 41, rdv: RDV, acceptes: [], sequence: 1, maintenant: new Date() })).toEqual([]);
    expect(objetAnnulationLocataire('edl', 'X')).toBe('État des lieux de sortie annulé — X');
  });
});
