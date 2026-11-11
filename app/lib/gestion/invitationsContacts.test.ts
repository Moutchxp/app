import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 INVITER LES CONTACTS D'UNE TÂCHE, EN TOUTE CONFIDENTIALITÉ (Arno, 10/11/2026, migration 465) — le mail d'un extérieur (pur) et
 * l'envoi (base simulée, transport factice : rien ne part). Case décochée = aucun mail ; chaque type de contact extérieur = son mail, seul
 * destinataire, AUCUNE coordonnée de tiers (ni dans le mail, ni dans le .ics) ; modification seulement si la date change.
 */
const CONTACTS: Record<string, unknown>[] = [];
let tache: Record<string, unknown>;
const journal: unknown[][] = [];
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('FROM gestion_tache t LEFT JOIN gestion_annuaire_lot')) return { rows: [tache] };
    if (s.includes('FROM gestion_tache_contact c WHERE c.tache_id')) return { rows: CONTACTS.filter((c) => c.inviter) };
    if (s.includes('FROM gestion_tache_action')) return { rows: [{ n: 0 }] };
    // 🔴 466 — la colonne du texte d'origine existe (sondée une fois).
    if (s.includes('information_schema.columns') && s.includes('texte_origine')) return { rows: [{ n: 1 }] };
    if (s.startsWith('INSERT INTO gestion_tache_contact_envoi')) { journal.push(params); return { rows: [] }; }
    return { rows: [] };
  },
}));
vi.mock('./schema', () => ({ creneauTacheDisponible: async () => false, sorteTacheDisponible: async () => false, invitationContactsDisponible: async () => true }));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('../location/mailsPreavisSortieRepo', () => ({ signatureEcran: async () => ({ brute: '', ecran: { html: '<b>L’agence</b>', texte: 'L’agence' } }) }));
vi.mock('./signatureImagesReel', () => ({ imagesSignaturePourEnvoi: async () => ({ images: [] }) }));

import { envoyerAuxContacts } from './invitationsContactsRepo';
import { icsTacheExterne, mailTacheExterne } from './mailTacheExterne';

const envoyes: { a: readonly string[]; cc: readonly string[]; cci: readonly string[]; objet: string; corps: string; corpsHtml?: string | null; pieces?: readonly { octets: Buffer }[] }[] = [];
const transport = { envoyer: vi.fn(async (m: (typeof envoyes)[number]) => { envoyes.push(m); return { ok: true as const, id: 'x', factice: true }; }) };
const AUTEUR = { id: 3, libelle: 'Arno Test' };
const contact = (id: number, nom: string, email: string | null, inviter: boolean, deja = false, telephone = '0611223344') => ({
  id: String(id), cle: `c:${id}`, nom, deja, inviter,
  coordonnees: [{ sorte: 'telephone', valeur: telephone }, ...(email ? [{ sorte: 'email', valeur: email }] : [])],
});
/** Tout ce qu'un extérieur ne doit JAMAIS lire : les autres contacts, le collaborateur, gestion@ (copie). */
const TIERS = ['MARTIN Alice', 'alice@exemple.test', 'DUPONT Jean', 'jean@exemple.test', 'Plombier Test', 'plombier@exemple.test', '0611223344', 'Claire Test', 'claire@exemple.test', 'Arno Test'];

beforeEach(() => {
  CONTACTS.length = 0; journal.length = 0; envoyes.length = 0; transport.envoyer.mockClear();
  tache = { objet: 'Visite du logement', note: 'Merci de prévoir les clés.', jour: '2026-11-20', heure: '10:00', duree: 60, lot_id: 7, adresse: '4 rue Fictive', commune: 'Paris' };
});

describe('le mail d’un contact extérieur (pur) : titre, date, durée, adresse, notes, signature — rien d’autre', () => {
  it('aucun nom, téléphone ou e-mail de tiers ; la phrase et les champs permis', () => {
    const m = mailTacheExterne({ sorte: 'invitation', titre: 'Visite', jour: '2026-11-20', heure: '10:00', dureeMinutes: 90, adresse: '4 rue Fictive, Paris',
      notes: 'Clés chez le gardien.', signature: { texte: 'L’agence', html: '<b>L’agence</b>' } });
    expect(m.objet).toBe('Rendez-vous : Visite — 20/11/2026 à 10h00');
    expect(m.texte).toBe('Bonjour,\n\nNous vous confirmons le rendez-vous suivant.\n\nObjet : Visite\nDate : le 20/11/2026 10h00-11h30\nDurée : 1 h 30\nAdresse : 4 rue Fictive, Paris\n\nNotes :\nClés chez le gardien.\n\nVous trouverez en pièce jointe une invitation à ajouter à votre agenda.\n\n-- \nL’agence');
  });
  it('le .ics : ni participants, ni organisateur ; l’annulation le retire', () => {
    const c = { sorte: 'invitation' as const, titre: 'Visite', jour: '2026-11-20', heure: '10:00', dureeMinutes: 60, adresse: '4 rue Fictive', notes: null, signature: { texte: '', html: '' } };
    const ics = icsTacheExterne({ ...c, tacheId: 9, domaine: 'exemple.test', sequence: 0, maintenant: new Date('2026-11-10T08:00:00Z') })!;
    expect(ics).toContain('UID:tache-9@exemple.test');
    expect(ics).not.toMatch(/ATTENDEE|ORGANIZER/);
    expect(icsTacheExterne({ ...c, sorte: 'annulation', tacheId: 9, domaine: 'exemple.test', sequence: 1, maintenant: new Date() })).toContain('METHOD:CANCEL');
  });
});

describe('🔴 l’envoi aux contacts', () => {
  it('case DÉCOCHÉE : aucun mail', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', false), contact(2, 'DUPONT Jean', 'jean@exemple.test', false));
    expect(await envoyerAuxContacts(10, { ancien: null }, AUTEUR, { transport })).toEqual([]);
    expect(transport.envoyer).not.toHaveBeenCalled();
  });
  it('chaque type de contact extérieur coché (locataire, propriétaire, tiers) : SON mail, seul destinataire, sans aucune coordonnée de tiers, ni dans le .ics', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true), contact(2, 'DUPONT Jean', 'jean@exemple.test', true),
      contact(3, 'Plombier Test', 'plombier@exemple.test', true), contact(4, 'Non coché', 'non@exemple.test', false));
    const r = await envoyerAuxContacts(10, { ancien: null }, AUTEUR, { transport });
    expect(r.map((x) => [x.nom, x.sorte, x.envoye])).toEqual([['MARTIN Alice', 'invitation', true], ['DUPONT Jean', 'invitation', true], ['Plombier Test', 'invitation', true]]);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test'], ['jean@exemple.test'], ['plombier@exemple.test']]);
    for (const m of envoyes) {
      expect(m.cc).toEqual([]);
      expect(m.cci).toEqual([]);
      const tout = `${m.objet}\n${m.corps}\n${m.corpsHtml ?? ''}\n${(m.pieces ?? []).map((p) => p.octets.toString('utf8')).join('\n')}`;
      for (const t of TIERS) expect(tout, t).not.toContain(t);
      expect(tout).not.toContain('non@exemple.test');
      expect(tout).not.toMatch(/ATTENDEE|ORGANIZER/);
      expect(m.corps).toContain('Merci de prévoir les clés.');
    }
    expect(journal).toHaveLength(3);
  });
  it('déjà invité : rien, sauf si la date change (mail de modification)', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true, true));
    expect(await envoyerAuxContacts(10, { ancien: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 } }, AUTEUR, { transport })).toEqual([]);
    const r = await envoyerAuxContacts(10, { ancien: { jour: '2026-11-18', heure: '09:00', dureeMinutes: 60 } }, AUTEUR, { transport });
    expect(r).toEqual([{ nom: 'MARTIN Alice', email: 'alice@exemple.test', sorte: 'modification', envoye: true, motif: null,
      objet: 'Rendez-vous modifié : Visite du logement — 20/11/2026 à 10h00' }]);
    expect(envoyes[0].objet).toBe('Rendez-vous modifié : Visite du logement — 20/11/2026 à 10h00');
  });
  it('coché sans adresse : rien ne part, et c’est dit', async () => {
    CONTACTS.push(contact(1, 'Sans Adresse', null, true));
    expect(await envoyerAuxContacts(10, { ancien: null }, AUTEUR, { transport })).toEqual([{ nom: 'Sans Adresse', email: null, sorte: 'invitation', envoye: false, motif: 'pas d’adresse e-mail' }]);
    expect(transport.envoyer).not.toHaveBeenCalled();
  });
});

describe('🔴 l’annulation d’une tâche (Arno, 10/11/2026) : le mail et le .ics d’annulation aux SEULS contacts déjà invités', () => {
  const pieces = (m: (typeof envoyes)[number]) => (m.pieces ?? []).map((p) => p.octets.toString('utf8')).join('\n');
  it('invité (invitation partie) : SON mail d’annulation, seul destinataire, .ics CANCEL sans participants ; coché mais jamais invité, ou déjà prévenu : rien', async () => {
    tache = { ...tache, heure: '10:00' };
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true, true), contact(2, 'DUPONT Jean', 'jean@exemple.test', true, false),
      { ...contact(3, 'Plombier Test', 'plombier@exemple.test', true, true), annule: true }, contact(4, 'Non coché', 'non@exemple.test', false, true));
    const r = await envoyerAuxContacts(10, { ancien: null, annulation: true }, AUTEUR, { transport });
    expect(r).toEqual([{ nom: 'MARTIN Alice', email: 'alice@exemple.test', sorte: 'annulation', envoye: true, motif: null,
      objet: 'Rendez-vous annulé : Visite du logement — 20/11/2026 à 10h00' }]);
    expect(envoyes.map((m) => [m.a, m.cc, m.cci])).toEqual([[['alice@exemple.test'], [], []]]);
    const tout = `${envoyes[0].objet}\n${envoyes[0].corps}\n${envoyes[0].corpsHtml ?? ''}\n${pieces(envoyes[0])}`;
    for (const t of TIERS.filter((x) => !['MARTIN Alice', 'alice@exemple.test'].includes(x))) expect(tout, t).not.toContain(t);
    expect(tout).not.toContain('MARTIN Alice');
    expect(pieces(envoyes[0])).toContain('METHOD:CANCEL');
    expect(pieces(envoyes[0])).not.toMatch(/ATTENDEE|ORGANIZER/);
    expect(envoyes[0].corps).toContain('Le rendez-vous ci-dessous est annulé.');
    expect(journal.map((p) => p[2])).toEqual(['annulation']);
  });
  it('sans l’option : une annulation n’est jamais envoyée (le geste normal ne prévient personne de déjà invité)', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true, true));
    expect(await envoyerAuxContacts(10, { ancien: null }, AUTEUR, { transport })).toEqual([]);
  });
});

describe('🔴🔴 Arno (10/11/2026) — le texte modifiable des mails aux extérieurs : parties protégées, journal, confidentialité inchangée', () => {
  it('la retouche vaut pour CHAQUE extérieur ; le rendez-vous, les notes et la signature restent ; aucune coordonnée de tiers ; le journal garde l’origine', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true), contact(2, 'DUPONT Jean', 'jean@exemple.test', true));
    const r = await envoyerAuxContacts(10, { ancien: null, retouches: { tache_exterieur_invitation: { appel: 'Bonjour à vous,', conclusion: 'Sonnez à l’interphone 12.', politesse: 'Cordialement,' } } }, AUTEUR, { transport });
    expect(r.map((x) => x.envoye)).toEqual([true, true]);
    for (const m of envoyes) {
      expect(m.corps.startsWith('Bonjour à vous,\n\nNous vous confirmons le rendez-vous suivant.\n\nObjet : Visite du logement')).toBe(true);
      expect(m.corps).toContain('Notes :\nMerci de prévoir les clés.');
      expect(m.corps).toContain('Sonnez à l’interphone 12.\n\nCordialement,\n\n-- \nL’agence');
      for (const t of TIERS) expect(`${m.corps}${m.corpsHtml ?? ''}`, t).not.toContain(t);
      expect(m.a).toHaveLength(1);
    }
    // Le journal : qui, le texte ENVOYÉ et le texte d'ORIGINE.
    expect(journal).toHaveLength(2);
    expect(journal[0][5]).toBe(envoyes[0].corps);
    expect(String(journal[0][11]).startsWith('Bonjour,\n\nNous vous confirmons le rendez-vous suivant.')).toBe(true);
    expect(journal[0][10]).toBe('Arno Test');
  });
  it('sans retouche : le texte d’origine part, aucun texte d’origine au journal', async () => {
    CONTACTS.push(contact(1, 'MARTIN Alice', 'alice@exemple.test', true));
    await envoyerAuxContacts(10, { ancien: null }, AUTEUR, { transport });
    expect(envoyes[0].corps.startsWith('Bonjour,\n\nNous vous confirmons')).toBe(true);
    expect(journal[0]).toHaveLength(11);
  });
  it('🔴 un repère protégé retiré (l’ancienne date d’une modification) ou une partie protégée : REFUSÉ', async () => {
    const { refusRetouchesExterieurs } = await import('./invitationsContactsRepo');
    expect(refusRetouchesExterieurs({ tache_exterieur_modification: { intro: 'Le rendez-vous est déplacé.' } })).toContain('{ancien rendez-vous}');
    expect(refusRetouchesExterieurs({ tache_exterieur_modification: { intro: 'Déplacé (au lieu du {ancien rendez-vous}).' } })).toBeNull();
    expect(refusRetouchesExterieurs({ tache_exterieur_invitation: { protege_0: 'Objet : autre' } as never })).toContain('n’est pas modifiable');
  });
});
