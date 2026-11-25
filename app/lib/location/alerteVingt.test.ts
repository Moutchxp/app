import { describe, expect, it } from 'vitest';
import { alerteDue, INTERVALLE_JOURS_ALERTE, ligneAlerteVingt, mailAlerteVingt, momentParis, nombreLocatairesAlerte, objetAlerteVingt } from './alerteVingt';
import type { LigneVingtPourcent } from './vingtPourcent';

/**
 * 🔴🔴 Arno (25/11/2026) — l'alerte « 20 % à restituer en retard » (remplace celle du lundi du 24/11) : tous les 2 jours, le matin à partir de 8 h
 * (Paris), l'objet « [Alerte] 20 % à restituer en retard — N locataire(s) », la liste (locataire, logement, AGO officielle, date limite, jours de
 * retard), le lien.
 */
describe('le matin à partir de 8 h, heure de Paris', () => {
  it('hiver (UTC+1) : 07:00 UTC = 08:00 Paris → l’heure est venue ; 06:59 UTC = 07:59 → pas encore', () => {
    expect(momentParis(new Date('2026-11-30T07:00:00Z'))).toEqual({ jour: '2026-11-30', jourSemaine: 1, heure: 8 });
    expect(alerteDue(momentParis(new Date('2026-11-30T07:00:00Z')), null)).toBe(true);
    expect(alerteDue(momentParis(new Date('2026-11-30T06:59:00Z')), null)).toBe(false);
  });
  it('été (UTC+2) : 06:00 UTC = 08:00 Paris → oui ; 23:30 UTC = 01:30 Paris le lendemain → pas encore', () => {
    expect(alerteDue(momentParis(new Date('2026-07-06T06:00:00Z')), null)).toBe(true);
    expect(momentParis(new Date('2026-07-05T23:30:00Z'))).toEqual({ jour: '2026-07-06', jourSemaine: 1, heure: 1 });
    expect(alerteDue(momentParis(new Date('2026-07-05T23:30:00Z')), null)).toBe(false);
  });
});

describe('🔴 tous les 2 jours (choix d’Arno)', () => {
  const a = (jour: string, heure = 9) => ({ jour, heure });
  it('jamais envoyée : oui ; envoyée aujourd’hui : non ; hier : non ; avant-hier : oui ; il y a 5 jours (serveur arrêté) : oui', () => {
    expect(INTERVALLE_JOURS_ALERTE).toBe(2);
    expect(alerteDue(a('2026-11-26'), null)).toBe(true);
    expect(alerteDue(a('2026-11-26'), '2026-11-26')).toBe(false);
    expect(alerteDue(a('2026-11-26'), '2026-11-25')).toBe(false);
    expect(alerteDue(a('2026-11-26'), '2026-11-24')).toBe(true);
    expect(alerteDue(a('2026-11-26'), '2026-11-21')).toBe(true);
  });
  it('le jour prévu, serveur arrêté : le lendemain matin (dès 8 h) ; le jour prévu avant 8 h : non', () => {
    // envoyée le 24 → prévue le 26 ; serveur arrêté le 26 → le 27 au matin
    expect(alerteDue(a('2026-11-27', 8), '2026-11-24')).toBe(true);
    expect(alerteDue(a('2026-11-26', 7), '2026-11-24')).toBe(false);
  });
  it('passage de mois et d’année', () => {
    expect(alerteDue(a('2026-12-01'), '2026-11-29')).toBe(true);
    expect(alerteDue(a('2027-01-01'), '2026-12-31')).toBe(false);
  });
});

describe('le mail', () => {
  const L = (o: Partial<LigneVingtPourcent> = {}): LigneVingtPourcent => ({
    sortieId: 1, lotId: 1, locataires: ['DUPONT Alice'], logement: '1 rue A, 92800 Puteaux', dateSortie: '2026-03-01', valideLe: '2026-03-03',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 30, mois: 6 },
    suivi: { etat: 'ok', exercice: '2026-06-30', ago: { date: '2026-09-15', statut: 'officielle' }, incertaine: false, limite: '2026-10-15', alerte: 'depassee', joursRestants: -46 }, ...o });
  it('objet « [Alerte] 20 % à restituer en retard — N locataire(s) »', () => {
    expect(objetAlerteVingt(1)).toBe('[Alerte] 20 % à restituer en retard — 1 locataire');
    expect(objetAlerteVingt(3)).toBe('[Alerte] 20 % à restituer en retard — 3 locataires');
  });
  it('chaque ligne : locataire, logement, AGO officielle, date limite, jours de retard', () => {
    expect(ligneAlerteVingt(L(), '2026-11-30')).toBe('DUPONT Alice — 1 rue A, 92800 Puteaux — AGO officielle du 15/09/2026 — date limite 15/10/2026 — 46 jours de retard');
    expect(ligneAlerteVingt(L(), '2026-10-16')).toBe('DUPONT Alice — 1 rue A, 92800 Puteaux — AGO officielle du 15/09/2026 — date limite 15/10/2026 — 1 jour de retard');
  });
  it('le texte et le HTML : la liste, le lien vers l’écran (échappé), plus aucune mention du lundi', () => {
    const m = mailAlerteVingt([L(), L({ sortieId: 2, locataires: ['<B> & C'] })], 'https://exemple.test/admin/location/vingt-pourcent', '2026-11-30');
    expect(m.objet).toBe('[Alerte] 20 % à restituer en retard — 2 locataires');
    expect(m.texte).toContain('2 locataires sont en « Alerte restitution en retard » sur l’écran « 20 % à restituer » au 30/11/2026');
    expect(m.texte).toContain('- DUPONT Alice — 1 rue A, 92800 Puteaux — AGO officielle du 15/09/2026 — date limite 15/10/2026 — 46 jours de retard');
    expect(m.texte).toContain('Ouvrir l’écran : https://exemple.test/admin/location/vingt-pourcent');
    expect(m.texte).toContain('cliquez sur « Faire restitution »');
    expect(m.html).toContain('<li>&lt;B&gt; &amp; C — 1 rue A');
    expect(m.html).toContain('<a href="https://exemple.test/admin/location/vingt-pourcent">');
    expect(`${m.texte}${m.html}`).not.toMatch(/lundi|Urgent/);
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
    expect(m.objet).toBe('[Alerte] 20 % à restituer en retard — 3 locataires');
    expect(m.texte).toContain('3 locataires sont en « Alerte restitution en retard »');
    expect(nombreLocatairesAlerte([L(1, ['MARTIN Paul', 'MARTIN Léa'])])).toBe(2);
    expect(mailAlerteVingt([L(1, ['MARTIN Paul', 'MARTIN Léa'])], 'https://exemple.test/x', '2026-11-30').texte).toContain('2 locataires sont en « Alerte restitution en retard »');
    // une sortie sans nom compte pour un
    expect(nombreLocatairesAlerte([L(3, [])])).toBe(1);
  });
});
