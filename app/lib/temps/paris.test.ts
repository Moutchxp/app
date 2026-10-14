import { describe, it, expect, afterEach } from 'vitest';
import {
  FUSEAU_PARIS, partiesParis, heureParis, jourSemaineParis, anneeParis, jourParis, decalageParisMs, instantParis,
  minuitParis, auJourParis, premierDuMoisParis, jourParisDecale, msJusquaProchaineHeureParis, formatParis,
  SQL_AUJOURDHUI_PARIS, SQL_MINUIT_PARIS, sqlJourParis, sqlMuraleParis, sqlMinuitParisDe,
} from './paris';

/**
 * L'HEURE DE PARIS, SOURCE UNIQUE — épreuves du lot PRÉPARATION-PORTABILITÉ.
 *
 * Chaque épreuve est rejouée sous PLUSIEURS fuseaux de MACHINE (`process.env.TZ`, pris en compte à chaud par Node) : la
 * réponse ne doit JAMAIS bouger. C'est la seule façon de voir, depuis un Mac réglé sur Paris, ce que verrait un serveur en
 * UTC. Repères 2026 : heure d'été le dimanche 29 mars à 02:00 (→ 03:00), heure d'hiver le dimanche 25 octobre à 03:00 (→ 02:00).
 */
const FUSEAUX_MACHINE = ['Europe/Paris', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati'];
const TZ_ORIGINE = process.env.TZ;
afterEach(() => { if (TZ_ORIGINE === undefined) delete process.env.TZ; else process.env.TZ = TZ_ORIGINE; });

/** Joue `epreuve` sous chaque fuseau de machine. */
function partout(epreuve: () => void): void {
  for (const tz of FUSEAUX_MACHINE) {
    process.env.TZ = tz;
    epreuve();
  }
}
const iso = (d: Date) => d.toISOString();

describe('instantParis — horloge murale de Paris → instant', () => {
  it('été (UTC+2) et hiver (UTC+1)', () => partout(() => {
    expect(iso(instantParis(2026, 8, 24, 9))).toBe('2026-08-24T07:00:00.000Z');
    expect(iso(instantParis(2026, 1, 5, 9))).toBe('2026-01-05T08:00:00.000Z');
  }));
  it('minuit et débordements (jour 32, mois 13, jour 0) normalisés comme Date.UTC', () => partout(() => {
    expect(iso(instantParis(2026, 10, 14))).toBe('2026-10-13T22:00:00.000Z');
    expect(iso(instantParis(2026, 8, 32, 9))).toBe('2026-09-01T07:00:00.000Z');
    expect(iso(instantParis(2026, 13, 1))).toBe('2026-12-31T23:00:00.000Z'); // 1er janvier 2027 à minuit, heure d'hiver
    expect(iso(instantParis(2026, 3, 0))).toBe('2026-02-27T23:00:00.000Z');  // 28 février 2026
  }));
  it('passage à l’heure d’été (29/03/2026) : 02:30 n’existe pas → 03:30 heure d’été, comme new Date(a, m, j, h) à Paris', () => partout(() => {
    expect(iso(instantParis(2026, 3, 29, 1, 30))).toBe('2026-03-29T00:30:00.000Z');
    expect(iso(instantParis(2026, 3, 29, 2, 30))).toBe('2026-03-29T01:30:00.000Z');
    expect(iso(instantParis(2026, 3, 29, 3, 30))).toBe('2026-03-29T01:30:00.000Z');
  }));
  it('passage à l’heure d’hiver (25/10/2026) : 02:30 vécue deux fois → la PREMIÈRE (encore en heure d’été)', () => partout(() => {
    expect(iso(instantParis(2026, 10, 25, 1, 30))).toBe('2026-10-24T23:30:00.000Z');
    expect(iso(instantParis(2026, 10, 25, 2, 30))).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(instantParis(2026, 10, 25, 3, 30))).toBe('2026-10-25T02:30:00.000Z');
  }));
  it('millisecondes conservées', () => partout(() => {
    expect(iso(instantParis(2026, 8, 24, 9, 0, 0, 123))).toBe('2026-08-24T07:00:00.123Z');
  }));
  it('aller-retour : partiesParis(instantParis(…)) rend l’horloge demandée, heure par heure sur une année entière', () => partout(() => {
    for (let jour = 1; jour <= 365; jour += 7) {
      for (const h of [0, 1, 4, 9, 12, 23]) {
        const t = instantParis(2026, 1, jour, h, 17);
        const p = partiesParis(t);
        const attendu = new Date(Date.UTC(2026, 0, jour));
        expect([p.annee, p.mois, p.jour, p.heure, p.minute]).toEqual([attendu.getUTCFullYear(), attendu.getUTCMonth() + 1, attendu.getUTCDate(), h, 17]);
      }
    }
  }));
});

describe('lecture d’un instant à Paris — autour de minuit', () => {
  it('22:30 UTC en été = 00:30 le LENDEMAIN à Paris (le cas qui trompait un serveur en UTC)', () => partout(() => {
    const t = new Date('2026-10-13T22:30:00Z');
    expect(jourParis(t)).toBe('2026-10-14');
    expect(heureParis(t)).toBe(0);
    expect(jourSemaineParis(t)).toBe(3); // mercredi 14/10/2026
  }));
  it('23:30 UTC le 31/12 = 00:30 le 1er janvier à Paris → année suivante (numéros annuels)', () => partout(() => {
    const t = new Date('2025-12-31T23:30:00Z');
    expect(anneeParis(t)).toBe(2026);
    expect(jourParis(t)).toBe('2026-01-01');
  }));
  it('minuitParis rend le début du jour civil de Paris', () => partout(() => {
    expect(iso(minuitParis(new Date('2026-10-13T22:30:00Z')))).toBe('2026-10-13T22:00:00.000Z');
    expect(iso(minuitParis(new Date('2026-01-15T12:00:00Z')))).toBe('2026-01-14T23:00:00.000Z');
  }));
  it('heure de Paris autour du passage à l’heure d’été : 01:59 puis 03:00', () => partout(() => {
    expect(heureParis(new Date('2026-03-29T00:59:00Z'))).toBe(1);
    expect(heureParis(new Date('2026-03-29T01:00:00Z'))).toBe(3);
  }));
  it('décalage : +1 h en hiver, +2 h en été', () => partout(() => {
    expect(decalageParisMs(new Date('2026-01-15T12:00:00Z'))).toBe(3_600_000);
    expect(decalageParisMs(new Date('2026-07-15T12:00:00Z'))).toBe(7_200_000);
  }));
});

describe('arithmétique de jours civils', () => {
  it('auJourParis : « demain 9 h » reste 9 h à travers un changement d’heure', () => partout(() => {
    const samediMatin = instantParis(2026, 3, 28, 10); // samedi 28/03, heure d'hiver
    expect(iso(auJourParis(samediMatin, 1, 9))).toBe('2026-03-29T07:00:00.000Z'); // dimanche 9 h, heure d'été
    const samediOctobre = instantParis(2026, 10, 24, 10);
    expect(iso(auJourParis(samediOctobre, 1, 9))).toBe('2026-10-25T08:00:00.000Z'); // dimanche 9 h, heure d'hiver
  }));
  it('premierDuMoisParis : le 1er à 00:30 heure de Paris est déjà le nouveau mois', () => partout(() => {
    const t = new Date('2026-09-30T22:30:00Z'); // 01/10/2026 00:30 à Paris
    expect(jourParis(premierDuMoisParis(t, 0))).toBe('2026-10-01');
    expect(jourParis(premierDuMoisParis(t, 1))).toBe('2026-11-01');
  }));
  it('jourParisDecale suit setFullYear / setMonth (29 février − 1 an → 1er mars)', () => partout(() => {
    expect(jourParisDecale(instantParis(2028, 2, 29, 12), { annees: -1 })).toBe('2027-03-01');
    expect(jourParisDecale(instantParis(2026, 3, 31, 12), { mois: -1 })).toBe('2026-03-03');
    expect(jourParisDecale(new Date('2026-10-13T22:30:00Z'), { jours: -1 })).toBe('2026-10-13'); // veille du 14 à Paris
  }));
  it('msJusquaProchaineHeureParis : aujourd’hui si l’heure est à venir, demain sinon', () => partout(() => {
    expect(msJusquaProchaineHeureParis(instantParis(2026, 8, 24, 7), 8)).toBe(3_600_000);
    expect(msJusquaProchaineHeureParis(instantParis(2026, 8, 24, 9), 8)).toBe(23 * 3_600_000);
  }));
});

describe('formatParis — affichage', () => {
  it('impose le fuseau de Paris, même si on tente de l’écraser', () => partout(() => {
    const t = new Date('2026-09-23T12:00:00Z');
    expect(formatParis('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)).toBe('14:00');
    expect(formatParis('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(t)).toBe('14:00');
    expect(formatParis('fr-FR', {}).resolvedOptions().timeZone).toBe(FUSEAU_PARIS);
  }));
});

describe('fragments SQL — le fuseau est EXPLICITE', () => {
  it('aujourd’hui, minuit, jour et horloge d’une expression', () => {
    expect(SQL_AUJOURDHUI_PARIS).toBe("(now() AT TIME ZONE 'Europe/Paris')::date");
    expect(SQL_MINUIT_PARIS).toBe("(date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')");
    expect(sqlJourParis('m.recu_le')).toBe("((m.recu_le) AT TIME ZONE 'Europe/Paris')::date");
    expect(sqlMuraleParis('r.valide_le')).toBe("((r.valide_le) AT TIME ZONE 'Europe/Paris')");
    expect(sqlMinuitParisDe('$1::date + 1')).toBe("(($1::date + 1)::timestamp AT TIME ZONE 'Europe/Paris')");
  });
  it('aucun fragment ne dépend du fuseau de session (pas de CURRENT_DATE, ni de ::date nu sur now())', () => {
    for (const f of [SQL_AUJOURDHUI_PARIS, SQL_MINUIT_PARIS]) {
      expect(f).not.toMatch(/current_date/i);
      expect(f).toContain("AT TIME ZONE 'Europe/Paris'");
    }
  });
});
