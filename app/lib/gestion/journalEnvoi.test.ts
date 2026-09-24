import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  actionJournalEnvoi, cibleJournalEnvoi, commentaireJournalEnvoi, ENTITES_JOURNAL_AVANT_243,
} from './journalEnvoi';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT MESURÉ LE 24/09/2026. La route écrivait `entite = 'envoi'` dans `gestion_journal`. La règle de la
 * table ne connaissait pas ce mot ; PostgreSQL refusait (23514) ; l'exception remontait, et un message PARTI était
 * rendu comme un échec à l'écran.
 *
 * Ces épreuves fixent le rangement RETENU, et surtout la limite qu'on ne franchit pas : plutôt PAS de ligne qu'une
 * ligne rangée sous une entité fausse. Un journal incomplet se voit ; un journal qui ment, non.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 OÙ SE RANGE LA LIGNE DE JOURNAL D’UN ENVOI', () => {
  it('un envoi RATTACHÉ À UN ÉCHANGE se range sur l’échange — sans aucune migration', () => {
    expect(cibleJournalEnvoi({ envoiId: 55, filId: 101, repondAMessageId: 900, envoiPermis: false }))
      .toEqual({ entite: 'fil', entiteId: 101 });
  });

  it('…et il s’y range ENCORE une fois la migration 243 appliquée : c’est là qu’on relit une conversation', () => {
    expect(cibleJournalEnvoi({ envoiId: 55, filId: 101, repondAMessageId: 900, envoiPermis: true }))
      .toEqual({ entite: 'fil', entiteId: 101 });
  });

  it('un message NEUF (sans échange) se range sur lui-même, une fois la 243 appliquée', () => {
    expect(cibleJournalEnvoi({ envoiId: 55, filId: null, repondAMessageId: null, envoiPermis: true }))
      .toEqual({ entite: 'envoi', entiteId: 55 });
  });

  it('🔴 le CAS D’ARNO — message neuf, migration 243 PAS encore appliquée : AUCUNE ligne inventée', () => {
    expect(cibleJournalEnvoi({ envoiId: 1, filId: null, repondAMessageId: null, envoiPermis: false })).toBeNull();
  });

  it('à défaut d’échange, on se range sur le message auquel on répondait', () => {
    expect(cibleJournalEnvoi({ envoiId: 55, filId: null, repondAMessageId: 900, envoiPermis: false }))
      .toEqual({ entite: 'message', entiteId: 900 });
  });

  it('🔴 « 0 » N’EST PAS UN IDENTIFIANT. C’est exactement ce que la route écrivait faute de mieux', () => {
    expect(cibleJournalEnvoi({ envoiId: 0, filId: 0, repondAMessageId: 0, envoiPermis: true })).toBeNull();
    expect(cibleJournalEnvoi({ envoiId: -3, filId: null, repondAMessageId: null, envoiPermis: true })).toBeNull();
  });

  it('l’entité choisie est TOUJOURS acceptée par la base — avant comme après la 243', () => {
    const avant = cibleJournalEnvoi({ envoiId: 55, filId: 101, repondAMessageId: 900, envoiPermis: false });
    expect(ENTITES_JOURNAL_AVANT_243).toContain(avant?.entite as never);
    const neuf = cibleJournalEnvoi({ envoiId: 55, filId: null, repondAMessageId: null, envoiPermis: false });
    expect(neuf).toBeNull(); // le seul cas non couvert AVANT la migration, et il est rendu explicitement
  });

  it('« envoi » n’est jamais choisi tant que la 243 n’est pas appliquée', () => {
    for (const filId of [null, 101]) {
      for (const repondAMessageId of [null, 900]) {
        const c = cibleJournalEnvoi({ envoiId: 55, filId, repondAMessageId, envoiPermis: false });
        expect(c?.entite).not.toBe('envoi');
      }
    }
  });
});

describe('CE QUE LA LIGNE DIT', () => {
  it('l’action distingue un envoi parti d’un envoi refusé', () => {
    expect(actionJournalEnvoi('envoye')).toBe('envoi');
    expect(actionJournalEnvoi('echec')).toBe('envoi_echec');
  });

  it('le commentaire porte l’objet et les destinataires — et RIEN du corps', () => {
    expect(commentaireJournalEnvoi({ objet: 'Fuite salle de bain', destinataires: ['a@b.fr', 'c@d.fr'] }))
      .toBe('« Fuite salle de bain » à a@b.fr, c@d.fr');
  });

  it('un objet vide est DIT vide, jamais rendu par des guillemets qui ne contiennent rien', () => {
    expect(commentaireJournalEnvoi({ objet: '   ', destinataires: ['a@b.fr'] })).toContain('(sans objet)');
    expect(commentaireJournalEnvoi({ objet: 'x', destinataires: [] })).toContain('(aucun destinataire)');
  });
});

describe('CE QUI NE DOIT PAS CHANGER', () => {
  it('le module est PUR : aucun import', () => {
    const code = readFileSync('app/lib/gestion/journalEnvoi.ts', 'utf8');
    expect(code.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('la migration 243 ajoute « envoi » SANS retirer aucune des huit entités existantes', () => {
    const sql = readFileSync('db/migrations/243_gestion_journal_envoi.sql', 'utf8');
    for (const e of ENTITES_JOURNAL_AVANT_243) expect(sql).toContain(`'${e}'`);
    expect(sql).toContain("'envoi'");
  });
});
