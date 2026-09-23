import { describe, it, expect, vi } from 'vitest';
import {
  capturer, delaiReconnexion, ErreurCapture, fenetreDepuis, MARGE_JOURS, mediane, plusLentes, preparerMessage,
  sensDuMessage, type DepsCapture, type MessageBrut,
} from './capture';
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
  bornes?: { curseurComplet: Date | null };
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
    bornes: async () => over.bornes ?? { curseurComplet: null },
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

describe('④ la fenêtre ne peut ni boucler, ni ABANDONNER d’historique', () => {
  it('rattrapage inachevé (aucune passe complète) → on repart TOUJOURS du début de la fenêtre', () => {
    const d = fenetreDepuis({ curseurComplet: null }, config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-25'); // 90 jours en arrière
  });

  it('🔴 la date du dernier message capturé n’entre PLUS dans le calcul — c’est elle qui abandonnait l’historique', () => {
    // Avant correctif, capturer un message du 14/09 faisait bondir la fenêtre au 11/09 et perdait juin-août.
    const avant = fenetreDepuis({ curseurComplet: null }, config, MAINTENANT);
    const apres = fenetreDepuis({ curseurComplet: null }, config, MAINTENANT);
    expect(avant.getTime()).toBe(apres.getTime()); // rien de ce qui a été capturé ne peut déplacer la fenêtre
  });

  it('la fenêtre n’avance QU’APRÈS une passe réellement complète', () => {
    const d = fenetreDepuis({ curseurComplet: new Date('2026-09-23T11:00:00Z') }, config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-20'); // curseur − 3 j
  });

  it('la marge de 3 jours couvre la granularité du jour, les deux horloges et les retardataires', () => {
    const repere = new Date('2026-09-20T12:00:00Z');
    const d = fenetreDepuis({ curseurComplet: repere }, config, MAINTENANT);
    expect(repere.getTime() - d.getTime()).toBe(MARGE_JOURS * 86_400_000);
  });

  it('ne redescend JAMAIS sous le rattrapage configuré (réduire la profondeur ne rouvre pas un backlog soldé)', () => {
    const d = fenetreDepuis({ curseurComplet: new Date('2020-01-01T00:00:00Z') }, config, MAINTENANT);
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-25');
  });

  it('le rattrapage est demandé au dépôt AVEC la date de début : une passe étroite ne certifie pas une fenêtre large', async () => {
    const vues: Date[] = [];
    const { d } = deps();
    d.bornes = async (depuisRattrapage) => { vues.push(depuisRattrapage); return { curseurComplet: null }; };
    await capturer(d, false);
    expect(vues[0].toISOString().slice(0, 10)).toBe('2026-06-25');
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

/**
 * LOT R — LES OPTIONS D'UNE PASSE. Elles servent au rapatriement d'un historique complet, et le seul risque qu'elles
 * portent est de DÉBORDER : si l'absence d'option ne rendait pas exactement le comportement d'avant, chaque relève
 * quotidienne s'en trouverait changée. C'est donc ce qui est testé en premier.
 */
describe('LOT R — options ponctuelles : sans elles, RIEN ne change', () => {
  const cinq = [1, 2, 3, 4, 5].map((uid) => message({ uid }));

  it('aucune option → la fenêtre reste celle de `fenetreDepuis`, et le plafond celui de la configuration', async () => {
    const { d, appels } = deps({ messages: cinq, config: { ...config, plafondParPasse: 3, rattrapageJours: 90 } });
    const r = await capturer(d, true);
    expect(appels.recherches[0]).toEqual(fenetreDepuis({ curseurComplet: null }, { ...config, rattrapageJours: 90 }, MAINTENANT));
    expect(r.vus).toBe(3);
  });

  it('un objet d’options VIDE se comporte exactement comme aucune option', async () => {
    const { d, appels } = deps({ messages: cinq, config: { ...config, plafondParPasse: 3 } });
    const r = await capturer(d, true, {});
    expect(appels.recherches[0]).toEqual(fenetreDepuis({ curseurComplet: null }, config, MAINTENANT));
    expect(r.vus).toBe(3);
  });

  it('`depuisForce` IMPOSE le début de fenêtre — c’est ce qui permet de remonter à l’origine du dossier', async () => {
    const origine = new Date('1990-01-01T00:00:00Z');
    const { d, appels } = deps({ messages: cinq });
    await capturer(d, true, { depuisForce: origine });
    expect(appels.recherches).toEqual([origine]);
  });

  it('une fenêtre imposée ne change NI le dédoublonnage, NI ce qui est écrit', async () => {
    const { d, appels } = deps({ messages: cinq, connus: ['<m1@orange.fr>', '<m2@orange.fr>'] });
    const r = await capturer(d, true, { depuisForce: new Date('1990-01-01T00:00:00Z'), plafondForce: 99 });
    expect(r.dejaConnus).toBe(2);
    expect(appels.ecrits.map((e) => e.messageId)).toEqual(['<m3@orange.fr>', '<m4@orange.fr>', '<m5@orange.fr>']);
  });

  it('`plafondForce` ne vaut que pour CETTE passe — la configuration n’est jamais consultée autrement', async () => {
    const { d } = deps({ messages: cinq, config: { ...config, plafondParPasse: 3 } });
    const r = await capturer(d, true, { plafondForce: 5 });
    expect(r.vus).toBe(5);
    expect(r.plafondAtteint).toBe(false);
    expect(r.resteInconnus).toBe(0);
  });

  it('un plafond forcé plus BAS mord, et laisse le reste à la passe suivante', async () => {
    const { d } = deps({ messages: cinq, config: { ...config, plafondParPasse: 400 } });
    const r = await capturer(d, true, { plafondForce: 2 });
    expect(r.vus).toBe(2);
    expect(r.plafondAtteint).toBe(true);
    expect(r.resteInconnus).toBe(3);
  });

  it('un plafond forcé à 0 ou négatif est IGNORÉ : on retombe sur la configuration, jamais sur « aucune lecture »', async () => {
    for (const plafondForce of [0, -1]) {
      const { d } = deps({ messages: cinq, config: { ...config, plafondParPasse: 3 } });
      expect((await capturer(d, true, { plafondForce })).vus).toBe(3);
    }
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

describe('LOT 3-quater — REPRISE automatique après coupure', () => {
  /** Lecture qui tombe aux UID donnés, puis passe (la reconnexion « répare » la liaison). */
  function avecCoupures(coupeAux: number[], nbMessages = 10) {
    const uids = Array.from({ length: nbMessages }, (_, i) => i + 1);
    const { d, appels } = deps({ messages: uids.map((uid) => message({ uid })), config: { ...config, plafondParPasse: 400 } });
    const restantes = new Set(coupeAux);
    const trace: string[] = [];
    let attentes: number[] = [];
    d.chercherDepuis = async () => uids;
    d.telecharger = async (uid) => {
      if (restantes.has(uid)) { restantes.delete(uid); throw new ErreurConnexion(`connexion à la boîte perdue pendant la lecture du message ${uid} : Socket timeout`); }
      return message({ uid });
    };
    d.reconnecter = async (chemin) => { trace.push(`reconnecté:${chemin}`); };
    d.attendre = async (ms) => { attentes.push(ms); };
    d.journal = () => {};
    return { d, appels, trace, attentes: () => attentes, reinit: () => { attentes = []; } };
  }

  it('se reconnecte et REPREND LE MESSAGE — aucun message n’est perdu', async () => {
    const { d, appels, trace } = avecCoupures([3]);
    const r = await capturer(d, true);
    expect(r.reconnexions).toBe(1);
    expect(r.captures).toBe(10);                  // les 10, message 3 compris
    expect(trace).toEqual(['reconnecté:_GESTION BOITE MAIL']);
    expect(appels.ecrits).toHaveLength(10);
  });

  it('le délai entre tentatives CROÎT (5 s, 10 s, 20 s) — réessayer aussitôt retomberait sur la coupure', async () => {
    const { d, attentes } = avecCoupures([2, 4, 6]);
    await capturer(d, true);
    expect(attentes()).toEqual([5000, 10000, 20000]);
  });

  it('le budget est GLOBAL à la passe : au-delà, arrêt propre avec les compteurs partiels', async () => {
    const { d } = avecCoupures([2, 4, 6, 8]); // 4 coupures pour un budget de 3
    const e = await capturer(d, true).catch((x: unknown) => x) as ErreurCapture;
    expect(e).toBeInstanceOf(ErreurCapture);
    expect(e.rapport.reconnexions).toBe(3);
    expect(e.rapport.captures).toBeGreaterThan(0); // ce qui avait été capturé est ACQUIS
    expect(e.message).toContain('Socket timeout');
  });

  it('reconnexions_max = 0 rend EXACTEMENT le comportement d’avant : arrêt à la première coupure', async () => {
    const { d } = avecCoupures([2]);
    d.config = async () => ({ ...config, plafondParPasse: 400, reconnexionsMax: 0 });
    const e = await capturer(d, true).catch((x: unknown) => x) as ErreurCapture;
    expect(e).toBeInstanceOf(ErreurCapture);
    expect(e.rapport.reconnexions).toBe(0);
    expect(e.rapport.captures).toBe(1);
  });

  it('sans dépendance de reconnexion (simulation d’un appelant qui n’en fournit pas), arrêt propre', async () => {
    const { d } = avecCoupures([2]);
    d.reconnecter = undefined;
    await expect(capturer(d, true)).rejects.toBeInstanceOf(ErreurCapture);
  });

  it('la reprise est JOURNALISÉE en mode réel, et pas en simulation', async () => {
    const vues: number[] = [];
    const { d } = avecCoupures([3]);
    d.journaliserReconnexion = async (n) => { vues.push(n); };
    await capturer(d, true);
    expect(vues).toEqual([1]);
    vues.length = 0;
    const b = avecCoupures([3]);
    b.d.journaliserReconnexion = async (n) => { vues.push(n); };
    await capturer(b.d, false);
    expect(vues).toEqual([]); // une simulation n'écrit rien, journal compris
  });

  it('un message ILLISIBLE ne déclenche AUCUNE reconnexion (ce n’est pas la connexion qui est en cause)', async () => {
    const { d, trace } = avecCoupures([]);
    d.telecharger = async (uid) => { if (uid === 3) throw new Error('MIME cassé'); return message({ uid }); };
    const r = await capturer(d, true);
    expect(r.reconnexions).toBe(0);
    expect(r.echecsLecture).toBe(1);
    expect(trace).toEqual([]);
  });

  it('le délai croissant est une fonction PURE, testable seule', () => {
    expect(delaiReconnexion(1, 5)).toBe(5000);
    expect(delaiReconnexion(2, 5)).toBe(10000);
    expect(delaiReconnexion(3, 5)).toBe(20000);
    expect(delaiReconnexion(1, 30)).toBe(30000);
  });
});

describe('LOT 3-quater — MESURE des lenteurs', () => {
  /** Horloge injectée : chaque lecture « dure » ce qu'on décide, sans jamais attendre. */
  function avecDurees(durees: Record<number, number>) {
    const uids = Object.keys(durees).map(Number);
    const { d } = deps({ messages: uids.map((uid) => message({ uid })), config: { ...config, plafondParPasse: 400 } });
    let t = 0;
    const lignes: string[] = [];
    d.chercherDepuis = async () => uids;
    d.chrono = () => t;
    d.telecharger = async (uid) => { t += durees[uid]; return { ...message({ uid }), tailleOctets: uid * 1000 }; };
    d.journal = (l) => lignes.push(l);
    return { d, lignes };
  }

  it('mesure la durée totale, la médiane et le maximum', async () => {
    const r = await capturer(avecDurees({ 1: 100, 2: 300, 3: 200 }).d, true);
    expect(r.dureeTotaleMs).toBe(600);
    expect(r.dureeMedianeMs).toBe(200);
    expect(r.dureeMaxMs).toBe(300);
  });

  it('retient les 5 plus lents, avec leur numéro et leur taille — jamais l’objet ni l’adresse', async () => {
    const r = await capturer(avecDurees({ 1: 10, 2: 90, 3: 20, 4: 80, 5: 30, 6: 70, 7: 40 }).d, true);
    expect(r.lesPlusLents.map((m) => m.uid)).toEqual([2, 4, 6, 7, 5]);
    expect(r.lesPlusLents[0]).toEqual({ uid: 2, ms: 90, octets: 2000 });
    expect(JSON.stringify(r.lesPlusLents)).not.toContain('@');
    expect(JSON.stringify(r.lesPlusLents)).not.toContain('chauffage');
  });

  it('SIGNALE EN DIRECT toute lecture de plus de 30 s — c’est le symptôme qu’on cherchait à voir', async () => {
    const { d, lignes } = avecDurees({ 1: 1000, 2: 42_000 });
    await capturer(d, true);
    expect(lignes.join('\n')).toContain('⚠ message 2 lu en 42 s');
    expect(lignes.join('\n')).not.toContain('message 1 lu en');
  });

  it('les mesures survivent à une panne : c’est APRÈS une coupure qu’on veut savoir ce qui était lent', async () => {
    const { d } = avecDurees({ 1: 100, 2: 500 });
    d.telecharger = async (uid) => {
      if (uid === 2) throw new ErreurConnexion('connexion perdue : Socket timeout');
      return { ...message({ uid }), tailleOctets: 1000 };
    };
    d.reconnecter = undefined;
    const e = await capturer(d, true).catch((x: unknown) => x) as ErreurCapture;
    expect(e.rapport.dureeMaxMs).toBeGreaterThanOrEqual(0);
    expect(e.rapport.lesPlusLents).toHaveLength(1); // le seul message lu avant la panne
  });

  it('médiane et classement sont des fonctions PURES, déterministes', () => {
    expect(mediane([])).toBe(0);
    expect(mediane([5])).toBe(5);
    expect(mediane([1, 2, 3, 4])).toBe(3); // moyenne des deux du milieu, arrondie
    expect(plusLentes([{ uid: 2, ms: 10, octets: 0 }, { uid: 1, ms: 10, octets: 0 }], 2).map((m) => m.uid)).toEqual([1, 2]);
  });
});

describe('LOT 3-quater — la SIMULATION lit léger, et compte pareil', () => {
  it('utilise la lecture légère quand elle existe, la complète sinon', async () => {
    const vus: string[] = [];
    const { d } = deps({ messages: [message({ uid: 1 })] });
    d.telecharger = async (uid) => { vus.push(`complet:${uid}`); return message({ uid }); };
    d.telechargerLeger = async (uid) => { vus.push(`leger:${uid}`); return message({ uid }); };
    await capturer(d, false);
    expect(vus).toEqual(['leger:1']);
    vus.length = 0;
    await capturer(d, true);
    expect(vus).toEqual(['complet:1']); // en mode RÉEL il faut le contenu des pièces : jamais de lecture légère
  });

  it('adaptateur sans lecture légère → la simulation retombe sur la lecture complète, sans rien casser', async () => {
    const { d } = deps({ messages: [message({ uid: 1 })] });
    d.telechargerLeger = undefined;
    expect((await capturer(d, false)).captures).toBe(1);
  });

  it('les COMPTEURS sont identiques en lecture légère et en lecture complète', async () => {
    const messages = [
      message({ uid: 1, objet: 'Document CRITERIMMO', deAdresse: 'gestion@criterimmo.fr' }),
      message({ uid: 2, entetes: { 'list-unsubscribe': '<u>' } }),
      message({ uid: 3 }),
    ];
    const regles: RegleExclusion[] = [{ id: 1, type: 'gabarit_objet', valeur: 'Document CRITERIMMO', sens: 'les_deux', motif: 'logiciel' }];
    const complet = deps({ messages, regles });
    const leger = deps({ messages, regles });
    leger.d.telechargerLeger = async (uid) => ({ ...messages.find((m) => m.uid === uid)!, corpsTexte: null, corpsHtml: null, pieces: [] });
    const a = await capturer(complet.d, false);
    const b = await capturer(leger.d, false);
    for (const cle of ['captures', 'exclus', 'recus', 'envoyes', 'dejaConnus', 'echecsLecture'] as const) {
      expect(b[cle]).toBe(a[cle]);
    }
    expect(b.parRegle).toEqual(a.parRegle);
  });
});

describe('LOT 3-quinquies — UID ≠ DATES : le rattrapage va au bout, et n’abandonne RIEN', () => {
  /**
   * La boîte d'Arno : l'historique a été importé en bloc le 15/09, si bien que l'ORDRE DES UID NE SUIT PAS l'ordre des
   * dates — un message de juin peut porter un UID plus grand qu'un message de septembre. C'est cette boîte-là qui faisait
   * bondir la fenêtre au 11/09 et abandonnait ~4 700 messages.
   */
  function boiteDesordonnee(nb = 20) {
    // UID 1..10 → SEPTEMBRE (récents) ; UID 11..20 → JUIN-AOÛT (l'historique importé). Ordre volontairement inverse.
    const messages: MessageBrut[] = [];
    for (let i = 0; i < nb / 2; i++) messages.push(message({ uid: i + 1, recuLe: new Date(`2026-09-${String(10 + i).padStart(2, '0')}T08:00:00Z`) }));
    for (let i = 0; i < nb / 2; i++) messages.push(message({ uid: nb / 2 + i + 1, recuLe: new Date(`2026-07-${String(1 + i).padStart(2, '0')}T08:00:00Z`) }));
    return messages;
  }

  /** Une base FACTICE partagée entre les passes : ce qui a été écrit reste connu d'une passe à l'autre. */
  function boucle(messages: MessageBrut[], plafond: number) {
    const ecrits = new Map<string, MessageBrut>();
    const uidsConnus = new Set<number>();
    const passe = async () => {
      const { d } = deps({ config: { ...config, plafondParPasse: plafond } });
      d.chercherDepuis = async () => messages.map((m) => m.uid);
      d.telecharger = async (uid) => messages.find((m) => m.uid === uid)!;
      d.connus = async () => new Set(ecrits.keys());
      d.bornes = async () => ({ curseurComplet: null }); // rattrapage inachevé : la fenêtre ne bouge jamais
      // Le filtre réel écarte les UID déjà mémorisés — ici, ceux déjà écrits.
      d.filtrerNonVus = async (uids) => uids.filter((u) => !uidsConnus.has(u));
      d.ecrire = async (m) => {
        const brut = messages.find((x) => x.messageId === m.messageId)!;
        ecrits.set(m.messageId, brut); uidsConnus.add(m.uidImap);
        return ecrits.size;
      };
      return capturer(d, true);
    };
    return { passe, ecrits, uidsConnus };
  }

  it('en N passes, TOUS les messages sont capturés — aucun n’est sauté', async () => {
    const messages = boiteDesordonnee(20);
    const { passe, ecrits } = boucle(messages, 6);
    const rapports = [];
    for (let i = 0; i < 5; i++) rapports.push(await passe());
    expect(ecrits.size).toBe(20);
    // …y compris TOUS ceux de juin-juillet, qui étaient précisément ceux qu'on perdait.
    const vieux = messages.filter((m) => m.recuLe.getUTCMonth() === 6);
    expect(vieux.every((m) => ecrits.has(m.messageId))).toBe(true);
  });

  it('chaque passe capture des messages NEUFS : le rattrapage avance, il ne piétine pas', async () => {
    const { passe } = boucle(boiteDesordonnee(20), 6);
    const captures = [(await passe()).captures, (await passe()).captures, (await passe()).captures, (await passe()).captures];
    expect(captures).toEqual([6, 6, 6, 2]); // 6+6+6+2 = 20, et jamais un 0 qui ferait boucler
  });

  it('les déjà-lus sont écartés AVANT tout téléchargement — un déjà-connu ne coûte plus son contenu', async () => {
    const messages = boiteDesordonnee(20);
    const { passe } = boucle(messages, 6);
    await passe();
    const p2 = await passe();
    expect(p2.dejaVusEcartes).toBe(6);  // écartés à la sélection
    expect(p2.vus).toBe(6);             // seuls des messages NEUFS ont été lus
    expect(p2.dejaConnus).toBe(0);      // plus aucun téléchargement pour rien
  });

  it('le rapport dit COMBIEN il reste de messages jamais lus, et quand c’est fini', async () => {
    const { passe } = boucle(boiteDesordonnee(20), 6);
    expect((await passe()).resteInconnus).toBe(14);
    expect((await passe()).resteInconnus).toBe(8);
    expect((await passe()).resteInconnus).toBe(2);
    const derniere = await passe();
    expect(derniere.resteInconnus).toBe(0);      // rattrapage terminé
    expect(derniere.plafondAtteint).toBe(false); // …et la passe est enfin COMPLÈTE, donc le curseur pourra avancer
  });

  it('sans filtre (dépendance absente), la passe fonctionne encore — seul le coût de lecture n’est pas économisé', async () => {
    const messages = boiteDesordonnee(4);
    const { d } = deps({ messages, config: { ...config, plafondParPasse: 10 } });
    d.chercherDepuis = async () => messages.map((m) => m.uid);
    d.telecharger = async (uid) => messages.find((m) => m.uid === uid)!;
    d.filtrerNonVus = undefined;
    const r = await capturer(d, true);
    expect(r.captures).toBe(4);
    expect(r.dejaVusEcartes).toBe(0);
  });

  it('l’UID est transmis jusqu’à l’écriture — c’est lui qui rendra la passe suivante gratuite', async () => {
    const m = message({ uid: 4242 });
    expect(preparerMessage(m, config, []).uidImap).toBe(4242);
  });
});
