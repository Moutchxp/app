import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motifLisible, phraseEchecEnvoi } from './motifEchec';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LA RÈGLE D'ARNO, MISE À L'ÉPREUVE : « un échec doit dire la VRAIE raison en français clair — jamais “erreur
 * interne” quand la cause est connue. Le détail technique complet va au journal, pas à l'écran. »
 *
 * Ces épreuves vérifient les deux moitiés de la règle : ce qui EST dit (une raison, et un geste à faire), et ce qui
 * n'est PAS dit (le message brut de PostgreSQL ou de Google, qui peut contenir une requête ou une adresse).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une erreur PostgreSQL telle que le pilote `pg` la lève : un message, un code, parfois le nom de la contrainte. */
const erreurPg = (code: string, constraint?: string) =>
  Object.assign(new Error('new row for relation "x" violates check constraint'), { code, constraint });

describe('🔴 LE DÉFAUT DU 23/09 — LA RÈGLE DU JOURNAL QUI REFUSE L’ÉCRITURE', () => {
  it('une contrainte violée est DITE : une valeur refusée, et une mise à jour à appliquer', () => {
    const m = motifLisible(erreurPg('23514', 'gestion_journal_entite_chk'));
    expect(m.phrase).toContain('refusé une écriture');
    expect(m.phrase).toContain('gestion_journal_entite_chk');
    expect(m.phrase).toContain('mise à jour de la base');
    // 🔴 Ce que la phrase ne dit JAMAIS : le mot qui n'apprend rien.
    expect(m.phrase).not.toContain('interne');
  });

  it('l’étiquette technique, elle, porte le code — et elle ne va QU’au journal du serveur', () => {
    expect(motifLisible(erreurPg('23514', 'gestion_journal_entite_chk')).etiquette)
      .toBe('postgres 23514 gestion_journal_entite_chk');
  });

  it('le message BRUT de PostgreSQL ne ressort jamais dans la phrase', () => {
    const m = motifLisible(erreurPg('23514', 'c'));
    expect(m.phrase).not.toContain('new row for relation');
    expect(m.phrase).not.toContain('violates');
  });
});

describe('CHAQUE CAUSE A SA CONDUITE À TENIR', () => {
  it('table ou colonne absente → une migration n’a pas été appliquée', () => {
    for (const code of ['42P01', '42703']) {
      expect(motifLisible(erreurPg(code)).phrase).toContain('mise à jour de la base n’a pas été appliquée');
    }
  });

  it('doublon → rien n’a été envoyé une seconde fois (on RASSURE, on n’alarme pas)', () => {
    expect(motifLisible(erreurPg('23505', 'gestion_envoi_cle_idempotence_key')).phrase)
      .toContain('rien n’a été envoyé une seconde fois');
  });

  it('base injoignable ou arrêtée → le message n’est pas parti, et on peut réessayer', () => {
    for (const code of ['57P01', '57P03', '08006', '53300']) {
      const p = motifLisible(erreurPg(code)).phrase;
      expect(p).toContain('n’est pas parti');
      expect(p).toContain('réessaie');
    }
  });

  it('délai dépassé → on le dit comme un délai, pas comme un refus', () => {
    expect(motifLisible(erreurPg('57014')).phrase).toContain('trop longtemps');
  });

  it('réseau → on nomme le réseau, quelle que soit la forme du message', () => {
    for (const m of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:5432', 'getaddrinfo ENOTFOUND', 'socket hang up']) {
      expect(motifLisible(new Error(m)).phrase).toContain('réseau');
    }
  });

  it('un code PostgreSQL non listé est quand même NOMMÉ — jamais « interne »', () => {
    const m = motifLisible(erreurPg('22001'));
    expect(m.phrase).toContain('22001');
    expect(m.phrase).not.toContain('interne');
  });

  it('une erreur vraiment inconnue le dit HONNÊTEMENT, et invite à la signaler', () => {
    const m = motifLisible(new Error('quelque chose d’inédit'));
    expect(m.phrase).toContain('inattendue');
    expect(m.phrase).toContain('signale');
    expect(m.phrase).not.toContain('interne');
    expect(m.etiquette).toBe('inconnue');
  });

  it('une valeur qui n’est même pas une erreur ne fait pas tomber la traduction', () => {
    for (const v of [null, undefined, 42, {}, 'texte']) {
      expect(motifLisible(v).phrase.length).toBeGreaterThan(10);
    }
  });
});

describe('LA PHRASE D’UN ENVOI QUI A ÉCHOUÉ', () => {
  it('annonce l’échec, donne la raison, et dit que le brouillon est conservé', () => {
    const p = phraseEchecEnvoi(erreurPg('23514', 'gestion_journal_entite_chk')).phrase;
    expect(p.startsWith('Envoi impossible : la base a refusé')).toBe(true);
    expect(p.endsWith('Le brouillon est conservé.')).toBe(true);
  });

  it('ne met pas de majuscule au milieu de la phrase — mais respecte un sigle', () => {
    expect(phraseEchecEnvoi(new Error('fetch failed')).phrase).toContain(': le service');
  });
});

describe('CE QUI NE DOIT PAS CHANGER', () => {
  it('le module est PUR : aucun import, donc utilisable des deux côtés de la frontière client/serveur', () => {
    const code = readFileSync('app/lib/gestion/motifEchec.ts', 'utf8');
    expect(code.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('aucune phrase ne contient le mot qu’Arno a lu à tort', () => {
    const cas: unknown[] = [
      erreurPg('23514'), erreurPg('42P01'), erreurPg('23505'), erreurPg('23502'), erreurPg('57P01'),
      erreurPg('57014'), erreurPg('99999'), new Error('fetch failed'), new Error('abort'), new Error('?'), null,
    ];
    for (const e of cas) expect(motifLisible(e).phrase).not.toMatch(/erreur interne/i);
  });
});
