import { describe, it, expect, afterEach } from 'vitest';
import { fenetreEnvoiOuverte, prochainCreneauEnvoi, estJourOuvre } from '../veille/envoiOuvre';
import { dansFenetre, nuitCourante } from '../veille/ingestionAuto';
import { dateLiberationQuota } from '../sitadel/demande';
import { heureFr } from '../gestion/fileEnvoi';
import { formaterDateFr } from '../gestion/ecran';
import { dateDos } from '../gestion/zip';
import { instantParis } from './paris';

/**
 * LES RÈGLES MÉTIER NE DÉPENDENT PLUS DU FUSEAU DE LA MACHINE — lot PRÉPARATION-PORTABILITÉ (14/10/2026).
 *
 * Ce que ces épreuves verrouillent, rejouées sous plusieurs fuseaux de MACHINE : la fenêtre d'envoi, le jour ouvré, la
 * fenêtre nocturne d'ingestion, la date de libération du quota mensuel, les heures écrites dans les mails et à l'écran,
 * et l'horodatage des archives — AUTOUR DE MINUIT et AUTOUR DES DEUX CHANGEMENTS D'HEURE, là où un serveur en UTC se
 * trompait d'une ou deux heures, voire d'un jour (mesuré : docs/RECON_PORTABILITE_SERVEUR.md §6).
 */
const FUSEAUX_MACHINE = ['Europe/Paris', 'UTC', 'America/New_York', 'Asia/Tokyo'];
const TZ_ORIGINE = process.env.TZ;
afterEach(() => { if (TZ_ORIGINE === undefined) delete process.env.TZ; else process.env.TZ = TZ_ORIGINE; });
function partout(epreuve: () => void): void {
  for (const tz of FUSEAUX_MACHINE) { process.env.TZ = tz; epreuve(); }
}

describe('fenêtre d’envoi et jour ouvré — heure de PARIS', () => {
  it('fenêtre 9 h–11 h : ouverte à 9 h 00 et 10 h 59 heure de Paris, fermée à 8 h 59 et 11 h 00 (été)', () => partout(() => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 9, 16, 9, 0), 9, 11).ouverte).toBe(true);
    expect(fenetreEnvoiOuverte(instantParis(2026, 9, 16, 10, 59), 9, 11).ouverte).toBe(true);
    expect(fenetreEnvoiOuverte(instantParis(2026, 9, 16, 8, 59), 9, 11).ouverte).toBe(false);
    expect(fenetreEnvoiOuverte(instantParis(2026, 9, 16, 11, 0), 9, 11).ouverte).toBe(false);
  }));
  it('même fenêtre en heure d’hiver (UTC+1)', () => partout(() => {
    expect(fenetreEnvoiOuverte(instantParis(2026, 12, 16, 9, 0), 9, 11).ouverte).toBe(true);
    expect(fenetreEnvoiOuverte(instantParis(2026, 12, 16, 8, 59), 9, 11).ouverte).toBe(false);
  }));
  it('minuit : lundi 00 h 30 à Paris est un LUNDI (jour ouvré), samedi 00 h 30 un SAMEDI', () => partout(() => {
    // Lundi 31/08/2026 00:30 Paris = dimanche 30/08 22:30 UTC : un serveur en UTC y voyait encore dimanche.
    expect(estJourOuvre(instantParis(2026, 8, 31, 0, 30))).toBe(true);
    // Samedi 29/08/2026 00:30 Paris = vendredi 22:30 UTC : un serveur en UTC y voyait encore vendredi.
    expect(estJourOuvre(instantParis(2026, 8, 29, 0, 30))).toBe(false);
  }));
  it('prochain créneau à 9 h : vendredi soir → lundi 9 h heure de Paris, y compris au passage à l’heure d’été', () => partout(() => {
    expect(prochainCreneauEnvoi(instantParis(2026, 8, 28, 21), 9).toISOString()).toBe('2026-08-31T07:00:00.000Z');
    // Vendredi 27/03/2026 21 h (hiver) → lundi 30/03 9 h (été) = 07:00 UTC.
    expect(prochainCreneauEnvoi(instantParis(2026, 3, 27, 21), 9).toISOString()).toBe('2026-03-30T07:00:00.000Z');
    // Vendredi 23/10/2026 21 h (été) → lundi 26/10 9 h (hiver) = 08:00 UTC.
    expect(prochainCreneauEnvoi(instantParis(2026, 10, 23, 21), 9).toISOString()).toBe('2026-10-26T08:00:00.000Z');
  }));
});

describe('fenêtre nocturne d’ingestion — heure de PARIS', () => {
  it('fenêtre 3 h–6 h, y compris la nuit du passage à l’heure d’hiver', () => partout(() => {
    expect(dansFenetre(instantParis(2026, 8, 23, 3), 3, 6)).toBe(true);
    expect(dansFenetre(instantParis(2026, 8, 23, 6), 3, 6)).toBe(false);
    expect(dansFenetre(instantParis(2026, 8, 23, 2, 59), 3, 6)).toBe(false);
    expect(dansFenetre(instantParis(2026, 10, 25, 3, 30), 3, 6)).toBe(true);
  }));
  it('fenêtre qui traverse minuit (23 h–2 h) : 00 h 30 compte pour la nuit de la VEILLE', () => partout(() => {
    expect(dansFenetre(instantParis(2026, 8, 23, 0, 30), 23, 2)).toBe(true);
    expect(nuitCourante(instantParis(2026, 8, 23, 0, 30), 23, 2)).toBe('2026-08-22');
    expect(nuitCourante(instantParis(2026, 8, 23, 23, 30), 23, 2)).toBe('2026-08-23');
    expect(nuitCourante(instantParis(2026, 8, 23, 4), 3, 6)).toBe('2026-08-23');
  }));
});

describe('plafond mensuel — date de libération du quota', () => {
  it('le 1er à 00 h 30 heure de Paris, le mois courant est déjà le nouveau : libération le 1er du suivant', () => partout(() => {
    expect(dateLiberationQuota(instantParis(2026, 10, 1, 0, 30))).toBe('01/11/2026');
    expect(dateLiberationQuota(instantParis(2026, 9, 30, 23, 30))).toBe('01/10/2026');
    expect(dateLiberationQuota(instantParis(2026, 12, 31, 23, 59))).toBe('01/01/2027');
    expect(dateLiberationQuota(instantParis(2026, 1, 31, 12))).toBe('01/02/2026'); // 31 janvier : jamais de saut à mars
  }));
});

describe('heures écrites — mails, écran, archives', () => {
  it('mail d’alerte d’envoi : heure de Paris, autour de minuit et des changements d’heure', () => partout(() => {
    expect(heureFr(new Date('2026-10-13T22:30:00Z'))).toBe('14/10/2026 à 00 h 30');
    expect(heureFr(new Date('2026-03-29T01:00:00Z'))).toBe('29/03/2026 à 03 h 00');
    expect(heureFr(new Date('2026-10-25T01:30:00Z'))).toBe('25/10/2026 à 02 h 30');
  }));
  it('bandeau « Dernière relève » : heure de Paris', () => partout(() => {
    expect(formaterDateFr('2026-09-23T12:00:00Z')).toBe('23 septembre 2026, 14:00');
    expect(formaterDateFr('2026-12-31T23:30:00Z')).toBe('1 janvier 2027, 00:30');
  }));
  it('horodatage DOS des archives : heure de Paris', () => partout(() => {
    const { date, heure } = dateDos(new Date('2026-10-13T22:30:10Z')); // 14/10/2026 00:30:10 à Paris
    expect([(date >> 9) + 1980, (date >> 5) & 0xf, date & 0x1f]).toEqual([2026, 10, 14]);
    expect([heure >> 11, (heure >> 5) & 0x3f, (heure & 0x1f) * 2]).toEqual([0, 30, 10]);
  }));
});
