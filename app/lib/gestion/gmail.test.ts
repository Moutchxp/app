import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ecritDansGmail, lienGmail, libelleEtoile, menuMessage, type ActionMessage,
} from './gmailMenu';
import {
  agirSurGmail, basculerEtoile, lireEtatGmail, MENTION_INTROUVABLE, MENTION_SANS_CONNEXION,
  type DepsActionGmail,
} from './gmailAction';
import {
  chercherParMessageId, creerFiltreBlocage, lireMessageGmail, lireOriginalGmail, modifierLibelles, PORTEES_GESTION,
} from './google';
import { heureGmail } from './ecran';

/**
 * LOT 5-FIDÈLE — LA PRÉSENTATION ET LES ACTIONS DE GMAIL, ÉPROUVÉES SANS TOUCHER À GMAIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 AUCUNE CONNEXION NE SORT D'ICI : le transport est injecté, et c'est un espion. Chaque épreuve vérifie ce qui
 * AURAIT été demandé à Google — jamais ce que Google aurait répondu pour de vrai.
 *
 * QUATRE FAÇONS DE SE TROMPER, et chacune se paie sur la VRAIE boîte de l'équipe :
 *   ① les portées dérivent → soit l'action ne marche pas, soit on demande bien plus que nécessaire ;
 *   ② le menu s'écarte de Gmail → l'équipe cherche chaque jour où est passé ce qu'elle connaissait ;
 *   ③ une action agit sans droit, ou sans confirmation → un expéditeur bloqué par mégarde, un spam signalé à tort ;
 *   ④ une entrée fait semblant → on croit avoir signalé un hameçonnage, et rien n'est parti.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ANCRAGE = { messageIdRfc: '<m-42@orange.fr>', gmailMessageId: null, gmailThreadId: null, de: 'martin@orange.fr', deNom: 'Mme Martin' };

/** Un Gmail SIMULÉ : il note ce qu'on lui demande, et rend ce qu'on lui a dit de rendre. */
function monde(o: Partial<{
  peutEcrire: boolean; jeton: string | null; trouve: { id: string; threadId: string; libelles: string[] } | null;
  libelles: string[]; refusModif: string; refusBlocage: string;
}> = {}) {
  const trace = { modifs: [] as unknown[], blocages: [] as string[], journal: [] as unknown[], memorises: [] as unknown[] };
  const deps: DepsActionGmail = {
    peutEcrire: async () => o.peutEcrire !== false,
    jetonAcces: async () => (o.jeton === undefined ? 'acces' : o.jeton),
    ancrage: async () => ANCRAGE,
    memoriser: async (g) => { trace.memorises.push(g); },
    chercher: async () => ({ ok: true, valeur: o.trouve === undefined ? { id: 'g1', threadId: 't1', libelles: [] } : o.trouve }),
    lire: async (_t, id) => ({ ok: true, valeur: { id, threadId: 't1', libelles: o.libelles ?? [] } }),
    modifier: async (_t, id, m) => {
      trace.modifs.push({ id, ...m });
      if (o.refusModif) return { ok: false, motif: o.refusModif };
      const apres = [...(o.libelles ?? []).filter((l) => !(m.retirer ?? []).includes(l)), ...(m.ajouter ?? [])];
      return { ok: true, valeur: { id, threadId: 't1', libelles: apres } };
    },
    bloquer: async (_t, adresse) => {
      trace.blocages.push(adresse);
      return o.refusBlocage ? { ok: false, motif: o.refusBlocage } : { ok: true, valeur: 'filtre-1' };
    },
    journaliser: async (l) => { trace.journal.push(l); },
  };
  return { deps, trace };
}

describe('🔴 ① LES PORTÉES — gmail.modify remplace gmail.send, et rien de plus', () => {
  it('les trois portées sont exactement celles décidées', () => {
    expect([...PORTEES_GESTION]).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.settings.basic',
      'https://www.googleapis.com/auth/drive',
    ]);
  });

  it('🔴 la portée qui permettrait la SUPPRESSION DÉFINITIVE n’est PAS demandée', () => {
    for (const p of PORTEES_GESTION) expect(p).not.toBe('https://mail.google.com/');
    expect(PORTEES_GESTION.join(' ')).not.toContain('mail.google.com/');
  });

  it('`gmail.send` a bien disparu : elle ne savait qu’expédier', () => {
    expect(PORTEES_GESTION).not.toContain('https://www.googleapis.com/auth/gmail.send');
  });

  it('le guide dit la même chose que le code — sinon Arno coche les mauvaises cases', () => {
    const guide = readFileSync('docs/GUIDE_CONNEXION_GOOGLE_GESTION.md', 'utf8');
    for (const p of PORTEES_GESTION) expect(guide, p).toContain(p);
    expect(guide).not.toContain('auth/gmail.send\n');
  });
});

describe('🔴 ② LE MENU, À L’IDENTIQUE DE GMAIL', () => {
  const menu = menuMessage({ nomExpediteur: 'Mme Martin' });

  it('l’ORDRE et les MOTS sont ceux de Gmail, au mot près', () => {
    expect(menu.map((e) => e.libelle)).toEqual([
      'Répondre',
      'Répondre à tous',
      'Transférer',
      'Partager dans le chat',
      'Marquer comme non lu',
      'Bloquer « Mme Martin »',
      'Signaler comme spam',
      'Signaler comme hameçonnage',
      'Signaler un contenu illégal',
      'Filtrer les messages similaires',
      'Traduire',
      'Imprimer',
      'Télécharger le message',
      'Afficher l’original',
      'Déplacer ce mail vers un autre événement…',
      'Détacher ce mail',
    ]);
  });

  it('🔴 « Supprimer » n’est PAS affiché : la règle n’est pas tranchée, on ne montre pas le geste', () => {
    expect(menu.map((e) => e.libelle).join(' | ')).not.toContain('Supprimer');
  });

  it('les séparateurs sont aux places de Gmail, et nos entrées sont rangées sous « Gestion »', () => {
    expect(menu.find((e) => e.cle === 'partager_chat')?.separateurAvant).toBe(true);
    expect(menu.find((e) => e.cle === 'deplacer_mail')?.separateurAvant).toBe(true);
    expect(menu.find((e) => e.cle === 'deplacer_mail')?.section).toBe('Gestion');
  });

  it('« Bloquer » NOMME l’expéditeur — on doit lire qui l’on bloque avant de le bloquer', () => {
    expect(menuMessage({ nomExpediteur: 'Plomberie Dupont' }).find((e) => e.cle === 'bloquer')?.libelle)
      .toBe('Bloquer « Plomberie Dupont »');
    // Sans nom, une formule qui reste lisible plutôt qu'un « Bloquer «  » » vide.
    expect(menuMessage({ nomExpediteur: '  ' }).find((e) => e.cle === 'bloquer')?.libelle)
      .toBe('Bloquer « cet expéditeur »');
  });

  it('sans nos gestes maison (un mail hors conversation), le menu s’arrête avant la section « Gestion »', () => {
    const court = menuMessage({ nomExpediteur: 'X', avecGestes: false });
    expect(court.map((e) => e.cle)).not.toContain('deplacer_mail');
    expect(court[court.length - 1].cle).toBe('afficher_original');
  });
});

describe('🔴 ④ AUCUNE ENTRÉE NE FAIT SEMBLANT', () => {
  const menu = menuMessage({ nomExpediteur: 'X' });
  const par = (c: ActionMessage) => menu.find((e) => e.cle === c);

  it('les quatre entrées que l’API ne sait pas faire OUVRENT Gmail, et le DISENT', () => {
    for (const c of ['partager_chat', 'hameconnage', 'illegal', 'traduire'] as const) {
      expect(par(c)?.nature, c).toBe('lien');
      expect(par(c)?.aide, c).toBeTruthy();
    }
    expect(par('hameconnage')?.aide).toContain('Gmail ne permet pas ce signalement');
  });

  it('les trois qui MODIFIENT la boîte sont marquées comme telles, et elles seules', () => {
    expect(menu.filter((e) => ecritDansGmail(e.cle)).map((e) => e.cle)).toEqual(['non_lu', 'bloquer', 'spam']);
  });

  it('🔴 « Bloquer » et « Signaler comme spam » DEMANDENT confirmation, et la question dit ce qui va arriver', () => {
    expect(par('bloquer')?.confirmation).toContain('n’arriveront plus dans la boîte de réception');
    expect(par('bloquer')?.confirmation).toContain('se défait dans Gmail');
    expect(par('spam')?.confirmation).toContain('indésirables');
    expect(par('spam')?.confirmation).toContain('se défait');
    // Marquer non lu se défait d'un clic : pas de question pour ça.
    expect(par('non_lu')?.confirmation).toBeUndefined();
  });
});

describe('LE LIEN VERS GMAIL', () => {
  it('par identifiant de fil quand on le connaît — Gmail y va directement', () => {
    expect(lienGmail('gestion@criterimmo.fr', { gmailThreadId: 'abc123' }))
      .toBe('https://mail.google.com/mail/u/?authuser=gestion%40criterimmo.fr#all/abc123');
  });

  it('sinon par RECHERCHE sur le Message-ID, chevrons retirés — Gmail les refuse', () => {
    expect(lienGmail('gestion@criterimmo.fr', { messageIdRfc: '<m-42@orange.fr>' }))
      .toContain('#search/rfc822msgid%3Am-42%40orange.fr');
  });

  it('🔴 `authuser` est TOUJOURS présent : sans lui, un double compte Google ouvre la mauvaise boîte', () => {
    expect(lienGmail('gestion@criterimmo.fr', { gmailThreadId: 'x' })).toContain('authuser=');
  });

  it('rien pour pointer → AUCUN lien. Mieux vaut pas de lien qu’un lien qui ouvre autre chose', () => {
    expect(lienGmail('gestion@criterimmo.fr', {})).toBeNull();
    expect(lienGmail('', { gmailThreadId: 'x' })).toBeNull();
  });
});

describe('🔴 ③ LES ACTIONS : droit, connexion, message retrouvé — dans cet ordre', () => {
  it('sans DROIT : refusé, et rien n’est demandé à Gmail', async () => {
    const { deps, trace } = monde({ peutEcrire: false });
    const r = await agirSurGmail('spam', 1, deps);
    expect(r).toMatchObject({ ok: false, code: 'droit' });
    expect(trace.modifs).toEqual([]);
  });

  it('sans CONNEXION : on le dit, et le message renvoie au guide', async () => {
    const { deps, trace } = monde({ jeton: null });
    const r = await agirSurGmail('non_lu', 1, deps);
    expect(r).toMatchObject({ ok: false, code: 'sans_jeton', motif: MENTION_SANS_CONNEXION });
    expect(r.ok === false && r.motif).toContain('GUIDE_CONNEXION_GOOGLE_GESTION.md');
    expect(trace.modifs).toEqual([]);
  });

  it('🔴 message INTROUVABLE dans Gmail : ce n’est PAS une panne, et on le dit tel quel', async () => {
    const { deps } = monde({ trouve: null });
    const r = await agirSurGmail('non_lu', 1, deps);
    expect(r).toMatchObject({ ok: false, code: 'introuvable', motif: MENTION_INTROUVABLE });
    expect(r.ok === false && r.motif).toContain('il vient peut-être d’ailleurs');
  });

  it('« Marquer comme non lu » pose le libellé UNREAD, et le journal le dit', async () => {
    const { deps, trace } = monde();
    const r = await agirSurGmail('non_lu', 42, deps);
    expect(r.ok).toBe(true);
    expect(trace.modifs[0]).toMatchObject({ id: 'g1', ajouter: ['UNREAD'] });
    expect(trace.journal[0]).toMatchObject({ action: 'non_lu', messageId: 42 });
  });

  it('« Signaler comme spam » pose SPAM et RETIRE de la boîte de réception', async () => {
    const { deps, trace } = monde();
    await agirSurGmail('spam', 1, deps);
    expect(trace.modifs[0]).toMatchObject({ ajouter: ['SPAM'], retirer: ['INBOX'] });
  });

  it('« Bloquer » crée le filtre sur l’ADRESSE, et le message dit comment le défaire', async () => {
    const { deps, trace } = monde();
    const r = await agirSurGmail('bloquer', 1, deps);
    expect(trace.blocages).toEqual(['martin@orange.fr']);
    expect(r.ok && r.message).toContain('Filtres et adresses bloquées');
  });

  it('🔴 AUCUNE action ne demande jamais la corbeille ni la suppression', async () => {
    const { deps, trace } = monde();
    for (const a of ['non_lu', 'spam'] as const) await agirSurGmail(a, 1, deps);
    const tout = JSON.stringify(trace.modifs);
    expect(tout).not.toContain('TRASH');
    expect(tout).not.toContain('delete');
  });

  it('un refus de Gmail remonte TEL QUEL — jamais noyé dans « erreur interne »', async () => {
    const { deps } = monde({ refusModif: 'Gmail a refusé la modification : insufficientPermissions' });
    const r = await agirSurGmail('spam', 1, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('insufficientPermissions');
  });
});

describe('L’ÉTOILE — elle BASCULE, comme le clic de Gmail', () => {
  it('éteinte → on la pose', async () => {
    const { deps, trace } = monde({ libelles: [] });
    const r = await basculerEtoile(1, deps);
    expect(trace.modifs[0]).toMatchObject({ ajouter: ['STARRED'] });
    expect(r.ok && r.etat?.etoile).toBe(true);
  });

  it('posée → on la retire', async () => {
    const { deps, trace } = monde({ libelles: ['STARRED', 'INBOX'] });
    const r = await basculerEtoile(1, deps);
    expect(trace.modifs[0]).toMatchObject({ retirer: ['STARRED'] });
    expect(r.ok && r.etat?.etoile).toBe(false);
  });

  it('son libellé accessible CHANGE avec son état — jamais la couleur seule', () => {
    expect(libelleEtoile(false)).toBe('Ajouter une étoile');
    expect(libelleEtoile(true)).toBe('Retirer l’étoile');
  });
});

describe('LA CORRESPONDANCE AVEC GMAIL', () => {
  it('🔴 trouvée par `rfc822msgid:` puis MÉMORISÉE — on ne redemande pas ce qu’on sait déjà', async () => {
    const { deps, trace } = monde();
    await lireEtatGmail(deps);
    expect(trace.memorises).toEqual([{ id: 'g1', threadId: 't1' }]);
  });

  it('introuvable → l’état est `null`, et l’écran n’affiche simplement pas l’étoile', async () => {
    const { deps } = monde({ trouve: null });
    expect(await lireEtatGmail(deps)).toBeNull();
  });

  it('sans connexion → `null` aussi : on ne montre pas une étoile éteinte qui ne dirait rien', async () => {
    const { deps } = monde({ jeton: null });
    expect(await lireEtatGmail(deps)).toBeNull();
  });

  it('l’état VRAI vient de Gmail : étoile et non-lu se lisent dans ses libellés', async () => {
    const { deps } = monde({ libelles: ['STARRED', 'UNREAD', 'INBOX'] });
    expect(await lireEtatGmail(deps)).toMatchObject({ etoile: true, nonLu: true, gmailMessageId: 'g1' });
  });
});

describe('LES APPELS À GMAIL, simulés', () => {
  const faux = (reponse: { status?: number; corps: unknown }) => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({ url: String(url), init });
      return { ok: (reponse.status ?? 200) < 400, status: reponse.status ?? 200, json: async () => reponse.corps } as unknown as Response;
    });
    return { appels, deps: { fetch: f as unknown as typeof fetch } };
  };

  it('la recherche utilise `rfc822msgid:` et RETIRE les chevrons', async () => {
    const g = faux({ corps: { messages: [{ id: 'g9', threadId: 't9' }] } });
    const r = await chercherParMessageId('j', '<abc@x.fr>', g.deps);
    expect(r).toEqual({ ok: true, valeur: { id: 'g9', threadId: 't9', libelles: [] } });
    expect(g.appels[0].url).toContain('rfc822msgid%3Aabc%40x.fr');
    expect(g.appels[0].init?.method ?? 'GET').toBe('GET');
  });

  it('aucun résultat → `null`, jamais une erreur : le message vient peut-être d’ailleurs', async () => {
    const g = faux({ corps: {} });
    expect(await chercherParMessageId('j', '<abc@x.fr>', g.deps)).toEqual({ ok: true, valeur: null });
  });

  it('la lecture ne rapatrie QUE les métadonnées — ni corps ni pièces, dont nous avons déjà copie', async () => {
    const g = faux({ corps: { id: 'g1', threadId: 't1', labelIds: ['STARRED'] } });
    await lireMessageGmail('j', 'g1', g.deps);
    expect(g.appels[0].url).toContain('format=metadata');
  });

  it('l’original est demandé en `format=raw` et décodé — c’est la SOURCE, pas notre reconstitution', async () => {
    const brut = 'From: a@b.fr\r\nSubject: Essai\r\n\r\nBonjour à vous';
    const b64 = Buffer.from(brut, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    const g = faux({ corps: { raw: b64 } });
    const r = await lireOriginalGmail('j', 'g1', g.deps);
    expect(r).toEqual({ ok: true, valeur: brut });
    expect(g.appels[0].url).toContain('format=raw');
  });

  it('un 404 dit que le message n’existe plus, pas « erreur HTTP 404 »', async () => {
    const g = faux({ status: 404, corps: {} });
    const r = await modifierLibelles('j', 'g1', { ajouter: ['STARRED'] }, g.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('n’existe plus dans Gmail');
  });

  it('le blocage crée un filtre sur l’expéditeur, qui sort les futurs messages de la boîte de réception', async () => {
    const g = faux({ corps: { id: 'f1' } });
    await creerFiltreBlocage('j', 'martin@orange.fr', g.deps);
    const corps = JSON.parse(String(g.appels[0].init?.body)) as { criteria: { from: string }; action: { addLabelIds: string[]; removeLabelIds: string[] } };
    expect(corps.criteria.from).toBe('martin@orange.fr');
    expect(corps.action.addLabelIds).toEqual(['SPAM']);
    expect(corps.action.removeLabelIds).toEqual(['INBOX']);
  });
});

describe('L’HEURE, ÉCRITE COMME GMAIL L’ÉCRIT', () => {
  const maintenant = new Date('2026-09-24T19:07:00+02:00');
  const il_y_a = (h: number) => new Date(maintenant.getTime() - h * 3_600_000).toISOString();

  it('aujourd’hui : l’heure exacte ET depuis combien de temps', () => {
    expect(heureGmail(il_y_a(3), maintenant)).toBe('16:07 (il y a 3 heures)');
    expect(heureGmail(il_y_a(0), maintenant)).toBe('19:07 (à l’instant)');
  });

  it('hier : « hier 17:24 »', () => {
    expect(heureGmail('2026-09-23T17:24:00+02:00', maintenant)).toBe('hier 17:24');
  });

  it('avant : « 22 sept. 18:44 » — au-delà d’un jour, « il y a 6 jours » ne dit pas si c’était lundi', () => {
    expect(heureGmail('2026-09-22T18:44:00+02:00', maintenant)).toBe('22 sept. 18:44');
  });

  it('une autre année porte son année', () => {
    expect(heureGmail('2025-03-10T09:35:00+01:00', maintenant)).toContain('2025');
  });

  it('une date absente ou illisible ne casse rien', () => {
    expect(heureGmail(null, maintenant)).toBe('—');
    expect(heureGmail('pas une date', maintenant)).toBe('—');
  });
});

describe('garanties STATIQUES', () => {
  it('🔴 le menu est un module PUR : aucun import, donc chargeable par le navigateur sans rien tirer', () => {
    const src = readFileSync('app/lib/gestion/gmailMenu.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('🔴 aucun composant du navigateur n’atteint le chemin d’action Gmail', async () => {
    const { readdirSync } = await import('node:fs');
    const clients = readdirSync('app', { recursive: true })
      .map((p) => `app/${String(p).split(/[\\/]/).join('/')}`)
      .filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p))
      .filter((p) => { try { return /^\s*(['"])use client\1/.test(readFileSync(p, 'utf8')); } catch { return false; } });
    expect(clients.length).toBeGreaterThan(50);
    for (const c of clients) {
      for (const interdit of ['gestion/gmailAction', 'gestion/gmailRepo']) {
        expect(readFileSync(c, 'utf8').includes(interdit), `${c} atteint ${interdit}`).toBe(false);
      }
    }
  });

  it('le chemin d’action n’écrit rien dans les journaux applicatifs au-delà du métier', () => {
    const code = readFileSync('app/lib/gestion/gmailAction.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l.trim())).join('\n');
    expect(/console\.(log|info|warn|error)/.test(code)).toBe(false);
  });
});
