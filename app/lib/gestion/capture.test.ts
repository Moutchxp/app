import { describe, it, expect, vi } from 'vitest';
import { capturer, ErreurCapture, fenetreDepuis, MARGE_JOURS, preparerMessage, sensDuMessage, type DepsCapture, type MessageBrut } from './capture';
import { ErreurConnexion } from './clientSurveille';
import { CONFIG_GESTION_DEFAUT, type ConfigGestion } from './config';
import type { RegleExclusion } from './regles';

/**
 * LOT 3 — LA CAPTURE. Testée SANS IMAP, SANS base, SANS stockage : l'orchestrateur reçoit ses dépendances.
 *
 * Les quatre propriétés qui comptent, et que ces tests tiennent :
 *   ① la SIMULATION n'écrit RIEN — ni fil, ni message, ni pièce ;
 *   ② une seconde passe n'ajoute AUCUN doublon ;
 *   ③ nos propres envois sont CAPTURÉS (contrairement au module Permis, qui les écarte) ;
 *   ④ le rattrapage AVANCE passe après passe et ne peut pas boucler.
 */

const MAINTENANT = new Date('2026-09-23T12:00:00Z');
const config: ConfigGestion = { ...CONFIG_GESTION_DEFAUT, plafondParPasse: 3 };

function message(o: Partial<MessageBrut> & { uid: number }): MessageBrut {
  return {
    messageId: `<m${o.uid}@orange.fr>`, inReplyTo: null, references: [],
    deAdresse: 'locataire@orange.fr', deNom: 'Mme M.', destinataires: 'gestion@criterimmo.fr', nbDestinataires: 1,
    objet: 'Problème de chauffage', corpsTexte: 'bonjour', corpsHtml: null,
    recuLe: new Date('2026-09-20T08:00:00Z'), entetes: {}, pieces: [], ...o,
  };
}

/** Dépendances faussées : tout est enregistré, rien n'existe pour de vrai. */
function deps(over: {
  messages?: MessageBrut[];
  regles?: RegleExclusion[];
  connus?: string[];
  bornes?: { curseurComplet: Date | null; dernierCapture: Date | null };
  config?: ConfigGestion;
  telechargerJette?: (uid: number) => boolean;
} = {}) {
  const messages = over.messages ?? [message({ uid: 1 })];
  const appels = {
    ouverts: [] as string[], recherches: [] as Date[], fermetures: 0,
    ecrits: [] as { messageId: string; filId: number; exclu: boolean }[],
    fils: [] as string[], pieces: [] as number[],
  };
  let prochainFil = 100;
  const d: DepsCapture = {
    maintenant: () => MAINTENANT,
    config: async () => over.config ?? config,
    reglesActives: async () => over.regles ?? [],
    ouvrirDossier: async (c) => { appels.ouverts.push(c); },
    chercherDepuis: async (depuis) => { appels.recherches.push(depuis); return messages.map((m) => m.uid); },
    telecharger: async (uid) => {
      if (over.telechargerJette?.(uid)) throw new Error('MIME cassé');
      const m = messages.find((x) => x.uid === uid);
      if (!m) throw new Error('introuvable');
      return m;
    },
    fermer: async () => { appels.fermetures += 1; },
    connus: async () => new Set(over.connus ?? []),
    bornes: async () => over.bornes ?? { curseurComplet: null, dernierCapture: null },
    resoudreFil: async (_ids, cle) => { appels.fils.push(cle); return { filId: prochainFil++, cree: true, fusionnes: 0 }; },
    ecrire: async (m, filId) => {
      appels.ecrits.push({ messageId: m.messageId, filId, exclu: m.exclusion !== null });
      return appels.ecrits.length;
    },
    deposerPieces: async (id, pieces) => { appels.pieces.push(id); return { deposees: pieces.length, nonDeposees: 0 }; },
  };
  return { d, appels };
}

describe('① la SIMULATION n’écrit rien', () => {
  it('lit la boîte, compte tout, et n’appelle AUCUNE écriture', async () => {
    const { d, appels } = deps({ messages: [message({ uid: 1 }), message({ uid: 2 })] });
    const r = await capturer(d, false);
    expect(r.mode).toBe('simulation');
    expect(r.vus).toBe(2);
    expect(r.captures).toBe(2);       // ce qui SERAIT capturé
    expect(appels.ecrits).toEqual([]); // mais rien n'est écrit
    expect(appels.fils).toEqual([]);
    expect(appels.pieces).toEqual([]);
  });

  it('applique quand même les règles : la simulation dit ce qui SERAIT tenu hors de la file', async () => {
    const regles: RegleExclusion[] = [{ id: 3, type: 'gabarit_objet', valeur: 'Document CRITERIMMO', sens: 'les_deux', motif: 'envoi de logiciel' }];
    const { d } = deps({ regles, messages: [message({ uid: 1, objet: 'Document CRITERIMMO' }), message({ uid: 2 })] });
    const r = await capturer(d, false);
    expect(r.exclus).toBe(1);
    expect(r.parRegle).toEqual({ 'envoi de logiciel': 1 });
  });
});

describe('② aucun doublon', () => {
  it('un Message-ID déjà en base est ignoré sans être ni écrit ni compté comme capture', async () => {
    const { d, appels } = deps({ messages: [message({ uid: 1 }), message({ uid: 2 })], connus: ['<m1@orange.fr>'] });
    const r = await capturer(d, true);
    expect(r.dejaConnus).toBe(1);
    expect(r.captures).toBe(1);
    expect(appels.ecrits.map((e) => e.messageId)).toEqual(['<m2@orange.fr>']);
  });

  it('un même Message-ID deux fois DANS la même passe n’est écrit qu’une fois', async () => {
    const { d, appels } = deps({ messages: [message({ uid: 1 }), message({ uid: 2, messageId: '<m1@orange.fr>' })] });
    await capturer(d, true);
    expect(appels.ecrits).toHaveLength(1);
  });

  it('un message SANS Message-ID est ignoré (rien à dédoublonner, donc rien à garantir)', async () => {
    const { d, appels } = deps({ messages: [message({ uid: 1, messageId: '   ' })] });
    const r = await capturer(d, true);
    expect(r.dejaConnus).toBe(1);
    expect(appels.ecrits).toEqual([]);
  });

  it('écrit entre-temps par une autre passe (course) → compté déjà connu, jamais une erreur', async () => {
    const { d } = deps({ messages: [message({ uid: 1 })] });
    d.ecrire = async () => null; // le ON CONFLICT DO NOTHING n'a rien inséré
    const r = await capturer(d, true);
    expect(r.captures).toBe(0);
    expect(r.dejaConnus).toBe(1);
  });
});

describe('③ nos propres envois sont CAPTURÉS — la différence avec le module Permis', () => {
  it('le sens vient de la configuration, jamais d’une adresse en dur', () => {
    expect(sensDuMessage('Gestion@Criterimmo.FR', 'gestion@criterimmo.fr')).toBe('envoye');
    expect(sensDuMessage('locataire@orange.fr', 'gestion@criterimmo.fr')).toBe('recu');
  });

  it('un message émis par la boîte de gestion est ENREGISTRÉ, pas écarté', async () => {
    const { d, appels } = deps({ messages: [message({ uid: 1, deAdresse: 'gestion@criterimmo.fr' }), message({ uid: 2 })] });
    const r = await capturer(d, true);
    expect(r.envoyes).toBe(1);
    expect(r.recus).toBe(1);
    expect(appels.ecrits).toHaveLength(2); // sans lui, une carte ne montrerait qu'une moitié de conversation
  });
});

describe('④ la fenêtre AVANCE et ne peut pas boucler', () => {
  it('premier run (aucun repère) → rattrapage complet', () => {
    const d = fenetreDepuis({ curseurComplet: null, dernierCapture: null }, config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-25'); // 90 jours en arrière
  });

  it('passes TRONQUÉES (curseur gelé) : c’est le dernier message capturé qui fait avancer', () => {
    const d1 = fenetreDepuis({ curseurComplet: null, dernierCapture: new Date('2026-07-10T00:00:00Z') }, config, MAINTENANT);
    const d2 = fenetreDepuis({ curseurComplet: null, dernierCapture: new Date('2026-07-20T00:00:00Z') }, config, MAINTENANT);
    expect(d2.getTime()).toBeGreaterThan(d1.getTime()); // chaque passe part plus loin : le backlog se vide
  });

  it('boîte MUETTE six mois (rien de nouveau) : le curseur, lui, avance — sinon on re-téléchargerait tout', () => {
    const d = fenetreDepuis(
      { curseurComplet: new Date('2026-09-23T11:00:00Z'), dernierCapture: new Date('2026-03-01T00:00:00Z') },
      config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-20'); // curseur − 3 j, pas mars
  });

  it('la marge de 3 jours couvre la granularité du jour, les deux horloges et les retardataires', () => {
    const repere = new Date('2026-09-20T12:00:00Z');
    const d = fenetreDepuis({ curseurComplet: repere, dernierCapture: null }, config, MAINTENANT);
    expect(repere.getTime() - d.getTime()).toBe(MARGE_JOURS * 86_400_000);
  });

  it('ne redescend JAMAIS sous le rattrapage configuré (réduire la profondeur ne rouvre pas un backlog soldé)', () => {
    const d = fenetreDepuis({ curseurComplet: new Date('2020-01-01T00:00:00Z'), dernierCapture: null }, config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-25');
  });
});

describe('le plafond garde les plus ANCIENS', () => {
  it('au-delà du plafond, ce sont les plus vieux qui passent — jeter les vieux les perdrait pour toujours', async () => {
    const messages = [1, 2, 3, 4, 5].map((uid) => message({ uid }));
    const { d, appels } = deps({ messages, config: { ...config, plafondParPasse: 3 } });
    const r = await capturer(d, true);
    expect(r.uidsServeur).toBe(5);
    expect(r.vus).toBe(3);
    expect(r.plafondAtteint).toBe(true);
    expect(appels.ecrits.map((e) => e.messageId)).toEqual(['<m1@orange.fr>', '<m2@orange.fr>', '<m3@orange.fr>']);
  });

  it('sous le plafond, rien n’est tronqué et le drapeau reste faux', async () => {
    const { d } = deps({ messages: [message({ uid: 1 })], config: { ...config, plafondParPasse: 400 } });
    const r = await capturer(d, true);
    expect(r.plafondAtteint).toBe(false);
  });
});

describe('robustesse d’une passe', () => {
  it('un message illisible est ISOLÉ : compté, jamais fatal, les autres passent', async () => {
    const { d, appels } = deps({
      messages: [message({ uid: 1 }), message({ uid: 2 }), message({ uid: 3 })],
      telechargerJette: (uid) => uid === 2,
    });
    const r = await capturer(d, true);
    expect(r.echecsLecture).toBe(1);
    expect(r.captures).toBe(2);
    expect(appels.ecrits).toHaveLength(2);
  });

  it('la boîte est TOUJOURS refermée, même si la recherche échoue', async () => {
    const { d, appels } = deps();
    d.chercherDepuis = async () => { throw new Error('boîte indisponible'); };
    await expect(capturer(d, true)).rejects.toThrow('boîte indisponible');
    expect(appels.fermetures).toBe(1);
  });

  it('ouvre le dossier RÉGLÉ EN BASE, jamais un nom en dur', async () => {
    const { d, appels } = deps({ config: { ...config, dossierImap: 'UN AUTRE DOSSIER' } });
    await capturer(d, false);
    expect(appels.ouverts).toEqual(['UN AUTRE DOSSIER']);
  });

  it('ne dépose des pièces que pour les messages qui en portent', async () => {
    const piece = { nomFichier: 'photo.heic', typeMime: 'image/heic', tailleOctets: 42, contenu: Buffer.from('x') };
    const { d, appels } = deps({ messages: [message({ uid: 1 }), message({ uid: 2, pieces: [piece] })] });
    const r = await capturer(d, true);
    expect(appels.pieces).toHaveLength(1);
    expect(r.piecesDeposees).toBe(1);
  });
});

describe('préparation d’un message — ce qui sera écrit', () => {
  it('calcule sens, gabarit d’objet, indice d’automatisme et exclusion, sans rien écrire', () => {
    const m = message({ uid: 1, objet: 'Re: Quittance de loyer septembre 2026 — Mme Martin', entetes: { 'x-mailer': 'Logiciel' } });
    const p = preparerMessage(m, config, []);
    expect(p.sens).toBe('recu');
    expect(p.objetGabarit).toBe('Quittance de loyer <date>'); // préfixe retiré, coupe à la séparation, date remplacée
    expect(p.automatique).toBe(true);
    expect(p.signauxAutomatisme).toBe('x-mailer');
    expect(p.exclusion).toBeNull();
  });

  it('conserve les ancres de fil BRUTES → les fils restent recalculables sans retourner à la boîte', () => {
    const p = preparerMessage(message({ uid: 1, inReplyTo: '<a@x.fr>', references: ['<a@x.fr>', '<b@x.fr>'] }), config, []);
    expect(p.inReplyTo).toBe('<a@x.fr>');
    expect(p.referencesBrut).toBe('<a@x.fr> <b@x.fr>');
  });

  it('un message sans en-tête d’automatisme et d’une adresse ordinaire est dit HUMAIN', () => {
    const p = preparerMessage(message({ uid: 1 }), config, []);
    expect(p.automatique).toBe(false);
    expect(p.signauxAutomatisme).toBeNull();
  });
});

describe('garantie STATIQUE — ce module ne fait aucune I/O', () => {
  it('n’importe ni base, ni stockage, ni imapflow : tout passe par les dépendances injectées', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/capture.ts', 'utf8');
    const modules = src.split('\n').filter((l) => !/^\s*import\s+type\b/.test(l))
      .flatMap((l) => [...l.matchAll(/(?:from\s*|import\s*\(\s*|^\s*import\s+)'([^']+)'/g)].map((m) => m[1]));
    for (const interdit of ['db/client', 'stockage', 'imapflow', 'email/imap']) {
      expect(modules.filter((m) => m.includes(interdit))).toEqual([]);
    }
    expect(vi.isMockFunction(vi.fn())).toBe(true); // (garde-fou du harnais, sans effet métier)
  });
});

describe('LOT 3-ter — une connexion perdue ARRÊTE la passe (elle ne passe plus pour un succès)', () => {
  /** 400 messages, la connexion tombe au 4ᵉ. Avant correctif : « 3 capturés, 397 illisibles », rapport d'allure normale. */
  function passeCoupee() {
    const uids = Array.from({ length: 400 }, (_, i) => i + 1);
    // Plafond large : c'est la COUPURE qu'on veut voir mordre, pas le plafond.
    const { d, appels } = deps({ messages: uids.map((uid) => message({ uid })), config: { ...config, plafondParPasse: 400 } });
    d.chercherDepuis = async () => uids;
    d.telecharger = async (uid) => {
      if (uid >= 4) throw new ErreurConnexion('connexion à la boîte perdue pendant la lecture du message 4 : Socket timeout');
      return message({ uid });
    };
    return { d, appels };
  }

  it('la passe JETTE au lieu de compter 397 « illisibles »', async () => {
    const { d } = passeCoupee();
    await expect(capturer(d, false)).rejects.toBeInstanceOf(ErreurCapture);
  });

  it('l’erreur PORTE le rapport partiel : ce qui a été capturé avant la panne reste compté', async () => {
    const { d } = passeCoupee();
    const e = await capturer(d, true).catch((x: unknown) => x) as ErreurCapture;
    expect(e.rapport.captures).toBe(3);
    expect(e.rapport.vus).toBe(4);
    expect(e.rapport.echecsLecture).toBe(0); // surtout PAS 397 : ce n'étaient pas des messages illisibles
    expect(e.message).toContain('Socket timeout'); // la vraie cause, pas un symptôme
  });

  it('la boîte est refermée malgré tout', async () => {
    const { d, appels } = passeCoupee();
    await capturer(d, true).catch(() => undefined);
    expect(appels.fermetures).toBe(1);
  });

  it('un message ILLISIBLE, lui, laisse toujours la passe continuer — la distinction est le cœur du correctif', async () => {
    const { d } = deps({
      messages: [message({ uid: 1 }), message({ uid: 2 }), message({ uid: 3 })],
      telechargerJette: (uid) => uid === 2,
    });
    const r = await capturer(d, true);
    expect(r.echecsLecture).toBe(1);
    expect(r.captures).toBe(2);
  });

  it('une panne d’OUVERTURE est rapportée avec ses compteurs à zéro, jamais avalée', async () => {
    const { d } = deps();
    d.ouvrirDossier = async () => { throw new ErreurConnexion('connexion à la boîte perdue avant la connexion : ETIMEOUT'); };
    const e = await capturer(d, false).catch((x: unknown) => x) as ErreurCapture;
    expect(e).toBeInstanceOf(ErreurCapture);
    expect(e.rapport.vus).toBe(0);
  });
});

describe('LOT 3-ter — la progression est ANNONCÉE (un terminal muet ne dit pas s’il travaille)', () => {
  it('annonce le dossier, la fenêtre, le nombre de messages, puis un point tous les 25', async () => {
    const lignes: string[] = [];
    const { d } = deps({ messages: Array.from({ length: 60 }, (_, i) => message({ uid: i + 1 })), config: { ...config, plafondParPasse: 400 } });
    d.journal = (l) => lignes.push(l);
    await capturer(d, false);
    const texte = lignes.join('\n');
    expect(texte).toContain('_GESTION BOITE MAIL');
    expect(texte).toContain('fenêtre depuis le');
    expect(texte).toContain('60 message(s) dans la fenêtre');
    expect(texte).toContain('… 25/60 lus');
    expect(texte).toContain('… 50/60 lus');
    expect(texte).toContain('passe terminée');
  });

  it('annonce aussi l’interruption, avec le nombre de messages déjà lus', async () => {
    const lignes: string[] = [];
    const { d } = deps();
    d.journal = (l) => lignes.push(l);
    d.chercherDepuis = async () => { throw new Error('boîte indisponible'); };
    await capturer(d, false).catch(() => undefined);
    expect(lignes.join('\n')).toContain('⚠ passe interrompue après 0 message(s) lu(s) : boîte indisponible');
  });

  it('sans journal fourni, la capture fonctionne exactement pareil (la progression est optionnelle)', async () => {
    const { d } = deps();
    expect((await capturer(d, false)).captures).toBe(1);
  });
});
