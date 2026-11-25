import { describe, expect, it } from 'vitest';
import { alerteDue, ligneAlerteVingt, mailAlerteVingt, momentParis, nombreLocatairesAlerte, objetAlerteVingt } from './alerteVingt';
import type { LigneVingtPourcent } from './vingtPourcent';

/** 🔴🔴 Arno (24/11/2026) — l'alerte hebdomadaire « 20 % à restituer » : le lundi matin à Paris, l'objet, la liste, le lien. */
describe('le lundi matin, heure de Paris', () => {
  it('hiver (UTC+1) : lundi 30/11/2026 07:00 UTC = 08:00 Paris → due ; 06:59 UTC = 07:59 → pas encore', () => {
    expect(momentParis(new Date('2026-11-30T07:00:00Z'))).toEqual({ jour: '2026-11-30', jourSemaine: 1, heure: 8 });
    expect(alerteDue(momentParis(new Date('2026-11-30T07:00:00Z')))).toBe(true);
    expect(alerteDue(momentParis(new Date('2026-11-30T06:59:00Z')))).toBe(false);
  });
  it('été (UTC+2) : lundi 06/07/2026 06:00 UTC = 08:00 Paris → due ; dimanche 23:30 UTC = lundi 01:30 Paris → pas encore ; mardi → jamais', () => {
    expect(alerteDue(momentParis(new Date('2026-07-06T06:00:00Z')))).toBe(true);
    expect(momentParis(new Date('2026-07-05T23:30:00Z'))).toEqual({ jour: '2026-07-06', jourSemaine: 1, heure: 1 });
    expect(alerteDue(momentParis(new Date('2026-07-05T23:30:00Z')))).toBe(false);
    expect(alerteDue(momentParis(new Date('2026-11-24T10:00:00Z')))).toBe(false);
  });
});

describe('le mail', () => {
  const L = (o: Partial<LigneVingtPourcent> & { j: number; statut?: 'officielle' | 'projetee' }): LigneVingtPourcent => ({
    sortieId: 1, lotId: 1, locataires: ['DUPONT Alice'], logement: '1 rue A, 92800 Puteaux', dateSortie: '2026-03-01', valideLe: '2026-03-03',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 30, mois: 6 },
    suivi: { etat: 'ok', exercice: '2026-06-30', ago: { date: '2026-09-15', statut: o.statut ?? 'officielle' }, incertaine: false, limite: '2026-10-15', alerte: 'depassee', joursRestants: o.j }, ...o });
  it('objet « [Urgent] 20 % à restituer — N locataire(s) »', () => {
    expect(objetAlerteVingt(1)).toBe('[Urgent] 20 % à restituer — 1 locataire');
    expect(objetAlerteVingt(3)).toBe('[Urgent] 20 % à restituer — 3 locataires');
  });
  it('chaque ligne : locataire, logement, AG (statut), date limite, jours dépassés / restants', () => {
    expect(ligneAlerteVingt(L({ j: -40 }))).toBe('DUPONT Alice — 1 rue A, 92800 Puteaux — AG du 15/09/2026 (date officielle) — date limite 15/10/2026 — dépassée de 40 jours');
    expect(ligneAlerteVingt(L({ j: 5, statut: 'projetee' }))).toBe('DUPONT Alice — 1 rue A, 92800 Puteaux — AG du 15/09/2026 (date projetée) — date limite 15/10/2026 — 5 jours restants');
  });
  it('le texte et le HTML : la liste, le lien vers l’écran (échappé)', () => {
    const m = mailAlerteVingt([L({ j: -40 }), L({ j: 3, sortieId: 2, locataires: ['<B> & C'] })], 'https://exemple.test/admin/location/vingt-pourcent', '2026-11-30');
    expect(m.objet).toBe('[Urgent] 20 % à restituer — 2 locataires');
    expect(m.texte).toContain('2 locataires sont en « Urgence » sur l’écran « 20 % à restituer » au 30/11/2026');
    expect(m.texte).toContain('- DUPONT Alice — 1 rue A, 92800 Puteaux — AG du 15/09/2026 (date officielle) — date limite 15/10/2026 — dépassée de 40 jours');
    expect(m.texte).toContain('Ouvrir l’écran : https://exemple.test/admin/location/vingt-pourcent');
    expect(m.html).toContain('<li>&lt;B&gt; &amp; C — 1 rue A');
    expect(m.html).toContain('<a href="https://exemple.test/admin/location/vingt-pourcent">');
  });
});

/** 🔴 Arno (25/11/2026) — « compter en locataires partout » : l'objet et l'intro du mail comptent des LOCATAIRES (colocataires un par un). */
describe('🔴 Arno (25/11/2026) — le mail compte des locataires', () => {
  const L = (sortieId: number, locataires: string[]): LigneVingtPourcent => ({
    sortieId, lotId: sortieId, locataires, logement: `${sortieId} rue A`, dateSortie: '2026-03-01', valideLe: '2026-03-03',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 30, mois: 6 },
    suivi: { etat: 'ok', exercice: '2026-06-30', ago: { date: '2026-09-15', statut: 'officielle' }, incertaine: false, limite: '2026-10-15', alerte: 'depassee', joursRestants: -40 } });
  it('une colocation (une ligne, deux locataires) + un locataire seul → « 3 locataires » ; une seule ligne de deux → « 2 locataires sont »', () => {
    const m = mailAlerteVingt([L(1, ['MARTIN Paul', 'MARTIN Léa']), L(2, ['SEUL Jean'])], 'https://exemple.test/x', '2026-11-30');
    expect(m.objet).toBe('[Urgent] 20 % à restituer — 3 locataires');
    expect(m.texte).toContain('3 locataires sont en « Urgence »');
    expect(nombreLocatairesAlerte([L(1, ['MARTIN Paul', 'MARTIN Léa'])])).toBe(2);
    expect(mailAlerteVingt([L(1, ['MARTIN Paul', 'MARTIN Léa'])], 'https://exemple.test/x', '2026-11-30').texte).toContain('2 locataires sont en « Urgence »');
    // une sortie sans nom compte pour un
    expect(nombreLocatairesAlerte([L(3, [])])).toBe(1);
  });
});
