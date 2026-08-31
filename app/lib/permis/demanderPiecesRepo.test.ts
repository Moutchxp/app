import { describe, it, expect, vi } from 'vitest';
import { executerDemandePieces, declarerRelanceComplement, executerReponseLibre, type DepsDemandePieces, type DepsDeclaration, type DepsReponse, type CibleComplement, type CibleReponse, type TraceEnvoi, type TraceDeclaration } from './demanderPiecesRepo';

/**
 * PART-3a/3c — orchestrateur du geste « demander les pièces manquantes » (par INJECTION : aucun SMTP, aucune base, aucun e-mail réel).
 * PART-3c : l'objet + le corps sont FOURNIS (éventuellement modifiés à la main) et envoyés VERBATIM ; le journal les conserve.
 */
const cible = (over: Partial<CibleComplement> = {}): CibleComplement => ({
  demandeId: 154, numDau: '0930012500081', destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', deNom: 'Lauriane Pangui',
  messageId: '<abc@mairie-aubervilliers.fr>', referencesBrut: '<x@svav.com>', from: 'contact@sansvisavis.com', profil: 'entreprise',
  recuLe: '2026-08-28T14:39:59+02:00', motifIndisponible: null, ...over,
});

const OBJET = 'Permis n° X — complément';
const CORPS = 'Madame, Monsieur,\n\nMerci de me communiquer le Cerfa.\n\nCordialement,';

function makeDeps(over: Partial<DepsDemandePieces> = {}): DepsDemandePieces {
  return {
    lireCible: vi.fn(async () => cible()),
    envoyer: vi.fn(async (_c: CibleComplement, _o: string, _co: string) => { void _c; void _o; void _co; return { messageId: '<envoye@svav.com>' }; }),
    journaliser: vi.fn(async (_d: number, _t: TraceEnvoi, _a: string) => { void _d; void _t; void _a; }),
    marquerPartiel: vi.fn(async () => {}), // CASC-1
    reserverCreneauSiCompte: vi.fn(async () => ({ compte: true, creneau: 'relance-1', rang: 1 })), // LOT 30 (②) : créneau libre par défaut → compte
    ...over,
  };
}
const arg = (over: Partial<{ dossierId: number; familles: ('cerfa'|'masse'|'coupe'|'etage')[]; objet: string; corps: string; auteur: string }> = {}) =>
  ({ dossierId: 7424, familles: ['cerfa'] as ('cerfa'|'masse'|'coupe'|'etage')[], objet: OBJET, corps: CORPS, auteur: 'admin:decision', ...over });

describe('executerDemandePieces', () => {
  it('texte MODIFIÉ à la main → envoyé BYTE-IDENTIQUE à la brique d’envoi', async () => {
    let corpsEnvoye = ''; let objetEnvoye = '';
    const custom = 'Bonjour,\n\nJ’ai édité ce texte à la main — merci pour le plan de coupe.\n\n— A.J.';
    const deps = makeDeps({ envoyer: async (_c, o, co) => { objetEnvoye = o; corpsEnvoye = co; return { messageId: '<m@svav.com>' }; } });
    const r = await executerDemandePieces(deps, arg({ objet: 'Objet édité', corps: custom }));
    expect(r.ok).toBe(true);
    expect(objetEnvoye).toBe('Objet édité');
    expect(corpsEnvoye).toBe(custom); // exactement, sans retraitement
  });

  it('le JOURNAL conserve l’objet ET le corps réellement envoyés + les familles', async () => {
    let trace: TraceEnvoi | null = null;
    const deps = makeDeps({ journaliser: async (_d, t) => { trace = t; } });
    await executerDemandePieces(deps, arg({ familles: ['cerfa', 'etage'], objet: 'O', corps: 'C' }));
    expect(trace!.objet).toBe('O');
    expect(trace!.corps).toBe('C');
    expect(trace!.familles).toEqual(['cerfa', 'etage']);
    expect(trace!.destinataire).toBe('lauriane.pangui@mairie-aubervilliers.fr');
  });

  it('corps VIDE → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ corps: '   ' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('objet VIDE → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ objet: '' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('entité HTML saisie à la main → refus, aucun envoi', async () => {
    const deps = makeDeps();
    const r = await executerDemandePieces(deps, arg({ corps: 'Bonjour&nbsp;&nbsp;merci' }));
    expect(r.ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('aucune famille → refus', async () => {
    const deps = makeDeps();
    expect((await executerDemandePieces(deps, arg({ familles: [] }))).ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('no-reply (motif indisponible) → refus avec motif inchangé, aucun envoi', async () => {
    const deps = makeDeps({ lireCible: vi.fn(async () => cible({ motifIndisponible: 'adresse non répondable' })) });
    const r = await executerDemandePieces(deps, arg());
    expect(r).toEqual({ ok: false, motif: 'adresse non répondable' });
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('OK : envoi AVANT journal, sur le fil du dernier message reçu', async () => {
    const ordre: string[] = [];
    let cibleEnvoyee: CibleComplement | null = null;
    const deps = makeDeps({
      envoyer: async (c) => { ordre.push('envoyer'); cibleEnvoyee = c; return { messageId: '<m@svav.com>' }; },
      journaliser: async () => { ordre.push('journal'); },
    });
    const r = await executerDemandePieces(deps, arg());
    expect(r.ok).toBe(true);
    expect(ordre).toEqual(['envoyer', 'journal']);
    expect(cibleEnvoyee!.messageId).toBe('<abc@mairie-aubervilliers.fr>');
  });

  it('CASC-1 — pose le marqueur « dossier partiel » (avec les familles) après le journal', async () => {
    let marque: { demandeId: number; familles: readonly string[] } | null = null;
    const deps = makeDeps({ marquerPartiel: async (demandeId, familles) => { marque = { demandeId, familles }; } });
    const r = await executerDemandePieces(deps, arg({ familles: ['cerfa', 'masse'] }));
    expect(r.ok).toBe(true);
    expect(marque!.familles).toEqual(['cerfa', 'masse']); // origine 'outil' figée dans depsReelles
  });
});

// ── PART-3e — DÉCLARER une relance faite hors outil (AUCUN envoi) ─────────────────────────────────────────────────────────────
const ctx = { demandeId: 154, destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', dernierMessageLe: '2026-08-28T14:39:59+02:00' };
function makeDepsDecl(over: Partial<DepsDeclaration> = {}): DepsDeclaration {
  return {
    lireContexte: vi.fn(async () => ctx),
    journaliserDeclaration: vi.fn(async (_d: number, _t: TraceDeclaration, _a: string) => { void _d; void _t; void _a; }),
    marquerPartiel: vi.fn(async () => {}), // CASC-1
    aujourdhui: () => '2026-08-30',
    reserverCreneauSiCompte: vi.fn(async () => ({ compte: true, creneau: 'relance-1', rang: 1 })), // LOT 30 (②)
    ...over,
  };
}
const argD = (over: Partial<{ dossierId: number; familles: ('cerfa'|'masse'|'coupe'|'etage')[]; dateRelance: string; auteur: string }> = {}) =>
  ({ dossierId: 7424, familles: ['cerfa'] as ('cerfa'|'masse'|'coupe'|'etage')[], dateRelance: '2026-08-29', auteur: 'admin:decision', ...over });

describe('declarerRelanceComplement — constat sans envoi', () => {
  it('AUCUN chemin d’envoi : les dépendances de déclaration ne comportent PAS de fonction envoyer', () => {
    const deps = makeDepsDecl();
    expect('envoyer' in deps).toBe(false); // structurellement, ce chemin ne peut pas envoyer d'e-mail
  });

  it('date valide → journalise (même état : dateRelance + familles), aucun envoi possible', async () => {
    let trace: TraceDeclaration | null = null;
    const deps = makeDepsDecl({ journaliserDeclaration: async (_d, t) => { trace = t; } });
    const r = await declarerRelanceComplement(deps, argD({ familles: ['cerfa', 'etage'] }));
    expect(r.ok).toBe(true);
    expect(trace!.dateRelance).toBe('2026-08-29');
    expect(trace!.familles).toEqual(['cerfa', 'etage']);
    expect(trace!.destinataire).toBe('lauriane.pangui@mairie-aubervilliers.fr');
  });

  it('CASC-1 — la déclaration pose AUSSI le marqueur « dossier partiel » (même effet qu’un envoi)', async () => {
    let marque: { demandeId: number; familles: readonly string[] } | null = null;
    const deps = makeDepsDecl({ marquerPartiel: async (demandeId, familles) => { marque = { demandeId, familles }; } });
    const r = await declarerRelanceComplement(deps, argD({ familles: ['coupe'] }));
    expect(r.ok).toBe(true);
    expect(marque!.demandeId).toBe(154);
    expect(marque!.familles).toEqual(['coupe']); // origine 'declaree' figée dans depsReelles
  });

  it('date dans le FUTUR → refus, rien journalisé', async () => {
    const journaliserDeclaration = vi.fn(async () => {});
    const r = await declarerRelanceComplement(makeDepsDecl({ journaliserDeclaration }), argD({ dateRelance: '2026-09-15' }));
    expect(r.ok).toBe(false);
    expect(journaliserDeclaration).not.toHaveBeenCalled();
  });

  it('date ANTÉRIEURE au dernier message reçu → refus, rien journalisé', async () => {
    const journaliserDeclaration = vi.fn(async () => {});
    const r = await declarerRelanceComplement(makeDepsDecl({ journaliserDeclaration }), argD({ dateRelance: '2026-08-01' }));
    expect(r.ok).toBe(false);
    expect(journaliserDeclaration).not.toHaveBeenCalled();
  });

  it('aucune famille → refus ; aucun message de mairie → refus', async () => {
    expect((await declarerRelanceComplement(makeDepsDecl(), argD({ familles: [] }))).ok).toBe(false);
    expect((await declarerRelanceComplement(makeDepsDecl({ lireContexte: vi.fn(async () => null) }), argD())).ok).toBe(false);
  });

  // 🔴 RÉGRESSION FIX-1 — le mock injectait une CHAÎNE (tests verts) là où le VRAI `lireContexteDeclaration` renvoie un objet Date
  // (colonne timestamptz). `.slice()` sur un Date jetait → 503 « déclaration impossible » : geste cassé pour TOUS. Ce test injecte le
  // VRAI type (Date) et REJOUE le cas réel d'Arno (demande 154 / dossier 7424, 28/08, « Plans d'étages » + « Formulaire Cerfa »).
  it('dernierMessageLe en objet Date (vrai type runtime) → la déclaration RÉUSSIT (cas réel demande 154)', async () => {
    const ctxDate = { demandeId: 154, destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', dernierMessageLe: new Date('2026-08-28T15:04:00+02:00') };
    let trace: TraceDeclaration | null = null;
    let marque: { demandeId: number; familles: readonly string[]; ancre: string } | null = null;
    const deps = makeDepsDecl({
      lireContexte: vi.fn(async () => ctxDate),          // ← objet Date, comme la vraie base
      aujourdhui: () => '2026-08-31',                    // date d'Arno = 28/08, aujourd'hui = 31/08
      journaliserDeclaration: async (_d, t) => { trace = t; },
      marquerPartiel: async (demandeId, familles, ancreCivile) => { marque = { demandeId, familles, ancre: ancreCivile }; },
    });
    const r = await declarerRelanceComplement(deps, argD({ dossierId: 7424, familles: ['etage', 'cerfa'], dateRelance: '2026-08-28' }));
    expect(r.ok).toBe(true); // AVANT FIX-1 : throw → jamais atteint
    expect(trace!.dateRelance).toBe('2026-08-28');
    expect(trace!.familles).toEqual(['etage', 'cerfa']);
    expect(marque!.demandeId).toBe(154); // CASC-1 : marqueur « dossier partiel » posé
    expect(marque!.ancre).toBe('2026-08-28'); // 🔴 CASC-2 : l'ancre du butoir = la date d'envoi DÉCLARÉE (28/08), pas l'instant du clic (31/08)
  });
});

// ── FIL-B — RÉPONSE LIBRE à un message choisi ────────────────────────────────────────────────────────────────────────────────
const cibleRep = (over: Partial<CibleReponse> = {}): CibleReponse => ({
  demandeId: 154, destinataire: 'lauriane.pangui@mairie-aubervilliers.fr', messageId: '<msg-17@mairie-aubervilliers.fr>',
  referencesBrut: '<x@svav.com>', objetOrigine: 'Nouvelle demande', from: 'contact@sansvisavis.com', profil: 'entreprise', motifIndisponible: null, ...over,
});
function makeDepsRep(over: Partial<DepsReponse> = {}): DepsReponse {
  return {
    lireCible: vi.fn(async () => cibleRep()),
    envoyer: vi.fn(async (_c: CibleReponse, _o: string, _co: string) => { void _c; void _o; void _co; return { messageId: '<envoye@svav.com>' }; }),
    journaliser: vi.fn(async () => {}),
    ...over,
  };
}
const argR = (over: Partial<{ reponseId: number; objet: string; corps: string; auteur: string }> = {}) =>
  ({ reponseId: 17, objet: 'Re: Nouvelle demande', corps: 'Bonjour, merci.', auteur: 'admin:decision', ...over });

describe('executerReponseLibre', () => {
  it('répond dans le fil DU message choisi (ses en-têtes à lui) + envoi VERBATIM', async () => {
    let cibleEnvoyee: CibleReponse | null = null; let corpsEnvoye = '';
    const custom = 'Texte tapé à la main par Arno.';
    // Message 17 : messageId distinct des autres → on prouve que ce sont SES en-têtes qui partent.
    const deps = makeDepsRep({ lireCible: vi.fn(async () => cibleRep({ messageId: '<msg-17@mairie-aubervilliers.fr>' })), envoyer: async (c, _o, co) => { cibleEnvoyee = c; corpsEnvoye = co; return { messageId: '<m@svav.com>' }; } });
    const r = await executerReponseLibre(deps, argR({ corps: custom }));
    expect(r.ok).toBe(true);
    expect(cibleEnvoyee!.messageId).toBe('<msg-17@mairie-aubervilliers.fr>'); // pas le dernier, CE message
    expect(corpsEnvoye).toBe(custom); // verbatim
  });

  it('corps vide → refus, aucun envoi', async () => {
    const deps = makeDepsRep();
    expect((await executerReponseLibre(deps, argR({ corps: '  ' }))).ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('objet vide → refus ; entité HTML → refus', async () => {
    const deps = makeDepsRep();
    expect((await executerReponseLibre(deps, argR({ objet: '' }))).ok).toBe(false);
    expect((await executerReponseLibre(deps, argR({ corps: 'x&nbsp;y' }))).ok).toBe(false);
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('expéditeur no-reply / demande multi-dossiers (motifIndisponible) → refus, aucun envoi', async () => {
    const deps = makeDepsRep({ lireCible: vi.fn(async () => cibleRep({ motifIndisponible: 'cette demande couvre plusieurs permis' })) });
    const r = await executerReponseLibre(deps, argR());
    expect(r).toEqual({ ok: false, motif: 'cette demande couvre plusieurs permis' });
    expect(deps.envoyer).not.toHaveBeenCalled();
  });

  it('message introuvable (cible null) → refus', async () => {
    expect((await executerReponseLibre(makeDepsRep({ lireCible: vi.fn(async () => null) }), argR())).ok).toBe(false);
  });

  it('envoi AVANT journal ; le journal reçoit objet + corps + le message d’origine', async () => {
    const ordre: string[] = []; let journalObjet = ''; let enReponseA = '';
    const deps = makeDepsRep({
      envoyer: async () => { ordre.push('envoyer'); return { messageId: '<m@svav.com>' }; },
      journaliser: async (_d, t) => { ordre.push('journal'); journalObjet = t.objet; enReponseA = t.enReponseA; },
    });
    await executerReponseLibre(deps, argR({ objet: 'Re: X', corps: 'Y' }));
    expect(ordre).toEqual(['envoyer', 'journal']);
    expect(journalObjet).toBe('Re: X');
    expect(enReponseA).toBe('<msg-17@mairie-aubervilliers.fr>');
  });
});

describe('LOT 30 (②) — option « compter cet envoi comme la relance suivante »', () => {
  it('DÉFAUT (compteCommeRelance absent) → NE compte pas : réservation JAMAIS appelée, journal compte=false', async () => {
    let trace: TraceEnvoi | null = null;
    const reserver = vi.fn(async () => ({ compte: true, creneau: 'relance-1', rang: 1 }));
    const deps = makeDeps({ reserverCreneauSiCompte: reserver, journaliser: async (_d, t) => { trace = t; } });
    await executerDemandePieces(deps, arg());
    expect(reserver).not.toHaveBeenCalled();
    expect(trace!).toMatchObject({ compte: false, creneau: null, rang: null });
  });
  it('COMPTE (créneau libre → réservé) → journal compte=true + créneau/rang du créneau consommé', async () => {
    let trace: TraceEnvoi | null = null;
    const deps = makeDeps({ reserverCreneauSiCompte: async () => ({ compte: true, creneau: 'relance-2', rang: 2 }), journaliser: async (_d, t) => { trace = t; } });
    await executerDemandePieces(deps, { ...arg(), compteCommeRelance: true });
    expect(trace!).toMatchObject({ compte: true, creneau: 'relance-2', rang: 2 });
  });
  it('COMPTE demandé mais créneau DÉJÀ pris par l’automatique → journal compte=false (envoi supplémentaire, jamais de double avance)', async () => {
    let trace: TraceEnvoi | null = null;
    const deps = makeDeps({ reserverCreneauSiCompte: async () => ({ compte: false, creneau: 'relance-1', rang: 1 }), journaliser: async (_d, t) => { trace = t; } });
    await executerDemandePieces(deps, { ...arg(), compteCommeRelance: true });
    expect(trace!.compte).toBe(false);
  });
  it('DÉCLARER : même option (compteCommeRelance) portée dans la trace', async () => {
    let trace: TraceDeclaration | null = null;
    const deps = makeDepsDecl({ reserverCreneauSiCompte: async () => ({ compte: true, creneau: 'relance-1', rang: 1 }), journaliserDeclaration: async (_d, t) => { trace = t; } });
    await declarerRelanceComplement(deps, { ...argD(), compteCommeRelance: true });
    expect(trace!).toMatchObject({ compte: true, creneau: 'relance-1', rang: 1 });
  });
});
