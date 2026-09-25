import { describe, it, expect } from 'vitest';
import {
  exemple, lireReponseRecherche, passeMuette, pourRecherche, rapportVide, repartir, tronquerAdresse, valeursAEcrire,
  type LigneACompleter,
} from './completion';

const ligne = (o: Partial<LigneACompleter> = {}): LigneACompleter => ({
  id: 1, messageId: '<a@exemple.fr>', uidImap: 42, uidValidity: '198', ...o,
});

describe('répartition entre les deux chemins de recherche', () => {
  it('UID mémorisé sous l’UIDVALIDITY COURANTE → chemin rapide', () => {
    const r = repartir([ligne()], '198');
    expect(r.parUid).toEqual([{ id: 1, uid: 42 }]);
    expect(r.parMessageId).toEqual([]);
  });

  it('aucun UID (message capturé avant la migration 231) → recherche par Message-ID', () => {
    const r = repartir([ligne({ uidImap: null, uidValidity: null })], '198');
    expect(r.parUid).toEqual([]);
    expect(r.parMessageId).toHaveLength(1);
  });

  /**
   * 🔴 LE TEST QUI PROTÈGE D'UNE CORRUPTION DÉFINITIVE. Si le serveur a changé d'UIDVALIDITY, il a réattribué les UID
   * depuis 1 : l'ancien 42 désigne un AUTRE message. Écrire ses destinataires dans notre ligne 1 mettrait les adresses
   * d'un tiers sur le message de quelqu'un d'autre, sans que rien ne permette plus de s'en apercevoir.
   */
  it('UIDVALIDITY DIFFÉRENTE → l’UID n’est PAS utilisé, on retombe sur le Message-ID', () => {
    const r = repartir([ligne({ uidValidity: '198' })], '199');
    expect(r.parUid).toEqual([]);
    expect(r.parMessageId).toHaveLength(1);
  });

  it('UIDVALIDITY du dossier inconnue → aucun UID n’est cru', () => {
    expect(repartir([ligne()], null).parUid).toEqual([]);
  });

  it('UID mémorisé mais SANS uid_validity → non utilisable non plus', () => {
    expect(repartir([ligne({ uidValidity: null })], '198').parUid).toEqual([]);
  });

  it('compare l’UIDVALIDITY en TEXTE — un bigint rendu en chaîne par pg ne doit pas faire mentir l’égalité', () => {
    expect(repartir([ligne({ uidValidity: '198' })], '198').parUid).toHaveLength(1);
  });
});

describe('Message-ID donné à la recherche', () => {
  it('les chevrons sont retirés', () => {
    expect(pourRecherche('<abc@exemple.fr>')).toBe('abc@exemple.fr');
  });
  it('un identifiant déjà nu passe tel quel', () => {
    expect(pourRecherche('  abc@exemple.fr ')).toBe('abc@exemple.fr');
  });
});

/**
 * 🔴 CE GROUPE EXISTE À CAUSE D'UN DÉFAUT MESURÉ EN PLEINE OPÉRATION, le 25/09/2026 : la passe 2 s'est arrêtée sur
 * « Cannot read properties of undefined (reading 'length') » après 941 lectures réussies. Cause établie dans le code
 * de la bibliothèque (`imapflow/lib/imap-flow.js:3254-3260`) : `search()` rend `undefined` — et non `false` — quand
 * aucun dossier n'est sélectionné. Les deux réponses ne veulent PAS dire la même chose.
 */
describe('réponse d’une recherche IMAP : « rien trouvé » n’est pas « pas cherché »', () => {
  it('un tableau est une liste de résultats', () => {
    expect(lireReponseRecherche([4, 8])).toEqual({ sorte: 'resultats', uids: [4, 8] });
  });
  it('un tableau VIDE est une réponse : personne ne correspond', () => {
    expect(lireReponseRecherche([])).toEqual({ sorte: 'resultats', uids: [] });
  });
  it('false est une réponse : la recherche a eu lieu, elle ne trouve rien', () => {
    expect(lireReponseRecherche(false)).toEqual({ sorte: 'resultats', uids: [] });
  });
  it('undefined N’EST PAS une réponse : aucun dossier sélectionné, la recherche n’a pas eu lieu', () => {
    expect(lireReponseRecherche(undefined)).toEqual({ sorte: 'dossier_perdu' });
  });
  it('null non plus', () => {
    expect(lireReponseRecherche(null)).toEqual({ sorte: 'dossier_perdu' });
  });
});

describe('valeurs à écrire — la convention NULL / [] de la migration 235', () => {
  it('les quatre listes sont analysées par le code du lot 5-0', () => {
    const v = valeursAEcrire(7, {
      to: 'Jean <jean@exemple.fr>, Marie <marie@exemple.fr>',
      cc: 'copie@exemple.fr',
      'reply-to': 'repondre@exemple.fr',
    });
    expect(v.id).toBe(7);
    expect(v.destinataires.a.map((a) => a.adresse)).toEqual(['jean@exemple.fr', 'marie@exemple.fr']);
    expect(v.destinataires.cc.map((a) => a.adresse)).toEqual(['copie@exemple.fr']);
    expect(v.destinataires.repondreA.map((a) => a.adresse)).toEqual(['repondre@exemple.fr']);
  });

  /**
   * C'est TOUTE la raison d'être du lot : un message relu sans `Cc` doit sortir avec `[]` — « on a regardé, il n'y
   * avait personne » — et cesser d'être `NULL`, « on n'a jamais regardé ». Rendre `null` ici le laisserait dans la
   * file des choses à compléter pour toujours, et la commande tournerait en rond chaque nuit.
   */
  it('un en-tête ABSENT donne un tableau VIDE, jamais null', () => {
    const v = valeursAEcrire(7, { to: 'jean@exemple.fr' });
    expect(v.destinataires.cc).toEqual([]);
    expect(v.destinataires.cci).toEqual([]);
    expect(v.destinataires.repondreA).toEqual([]);
  });

  it('un message sans AUCUN destinataire lisible donne quatre listes vides — il est analysé, pas ignoré', () => {
    const v = valeursAEcrire(7, {});
    expect(v.destinataires).toEqual({ a: [], cc: [], cci: [], repondreA: [] });
  });

  it('un nom accentué encodé est décodé (RFC 2047), comme à la capture', () => {
    const v = valeursAEcrire(7, { to: '=?UTF-8?Q?Ga=C3=ABlle?= <g@exemple.fr>' });
    expect(v.destinataires.a[0].nom).toBe('Gaëlle');
  });
});

describe('compte rendu : reconnaître sans pouvoir contacter', () => {
  it('une adresse est tronquée', () => {
    expect(tronquerAdresse('jean.dupont@exemple.fr')).toBe('je…@exemple.fr');
  });
  it('une partie locale trop courte est entièrement masquée', () => {
    expect(tronquerAdresse('ab@exemple.fr')).toBe('…@exemple.fr');
  });
  it('ce qui n’est pas une adresse ne fuit pas', () => {
    expect(tronquerAdresse('pas-une-adresse')).toBe('…');
  });
  it('un exemple n’imprime JAMAIS une adresse entière', () => {
    const texte = exemple(valeursAEcrire(3, { to: 'jean.dupont@exemple.fr' }));
    expect(texte).toContain('message 3');
    expect(texte).toContain('je…@exemple.fr');
    expect(texte).not.toContain('jean.dupont@exemple.fr');
  });
  it('une liste vide s’imprime en tiret, pas en crochets', () => {
    expect(exemple(valeursAEcrire(3, {}))).toContain('À : —');
  });
});

describe('passe muette — le serveur annonce et ne sert rien', () => {
  it('des en-têtes DEMANDÉS et AUCUN servi = muette', () => {
    expect(passeMuette({ ...rapportVide(), lus: 200, demandes: 200, entetesObtenus: 0 })).toBe(true);
  });
  /** Seuil STRICT : une passe qui progresse encore n'est jamais traitée comme un échec (leçon de la nuit du 23/09). */
  it('un seul en-tête servi suffit à ne PAS être muette', () => {
    expect(passeMuette({ ...rapportVide(), lus: 200, demandes: 200, entetesObtenus: 1 })).toBe(false);
  });
  it('rien à lire n’est pas une passe muette — c’est une passe terminée', () => {
    expect(passeMuette({ ...rapportVide(), lus: 0, demandes: 0, entetesObtenus: 0 })).toBe(false);
  });
  /**
   * 🔴 LE FAUX POSITIF QU'ON REFUSE. 200 lignes dont tous les Message-ID sont ambigus : on n'a demandé AUCUN en-tête,
   * le serveur n'a donc rien refusé. Le déclarer muet enverrait attendre une limite de téléchargement imaginaire, au
   * lieu de constater — à raison — qu'il reste des lignes que cette commande ne sait pas compléter.
   */
  it('des lignes lues mais AUCUN en-tête demandé (tous ambigus) n’est PAS une passe muette', () => {
    expect(passeMuette({ ...rapportVide(), lus: 200, demandes: 0, entetesObtenus: 0, ambigus: 200 })).toBe(false);
  });
  it('aucun rapport → pas de verdict de muette', () => {
    expect(passeMuette(null)).toBe(false);
  });
});
