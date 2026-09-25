import { describe, it, expect, vi } from 'vitest';
import { executerCompletion, trancher, type DepsCompletion } from './completionPasse';
import type { AEcrire, LigneACompleter } from './completion';
import type { ClientEntetes } from './clientEntetes';

/** Une boîte pour de faux : elle sert les en-têtes qu'on lui a donnés, et JAMAIS rien d'autre. */
function boite(o: {
  uidValidite?: string | null;
  entetes?: Record<number, Record<string, string>>;
  recherche?: Record<string, number[]>;
} = {}): ClientEntetes & { fermee: boolean } {
  const etat = { fermee: false };
  return {
    get fermee() { return etat.fermee; },
    ouvrir: async () => {},
    ouvrirDossier: async () => {},
    uidValidite: () => (o.uidValidite === undefined ? '198' : o.uidValidite),
    entetesDesUids: async (uids) => {
      const m = new Map<number, Record<string, string>>();
      for (const u of uids) { const e = (o.entetes ?? {})[u]; if (e !== undefined) m.set(u, e); }
      return m;
    },
    uidsDuMessageId: async (mid) => (o.recherche ?? {})[mid] ?? [],
    fermer: async () => { etat.fermee = true; },
  };
}

function deps(o: {
  client?: ClientEntetes | null;
  lignes?: LigneACompleter[];
  schemaPret?: boolean;
  verrou?: boolean;
  restantes?: number;
  ecrit?: (lot: readonly AEcrire[]) => { completes: number; dejaFaits: number };
} = {}): DepsCompletion & { ecrits: AEcrire[]; journaux: number; verrouRendu: boolean } {
  const ecrits: AEcrire[] = [];
  const suivi = { journaux: 0, verrouRendu: false };
  return {
    get ecrits() { return ecrits; },
    get journaux() { return suivi.journaux; },
    get verrouRendu() { return suivi.verrouRendu; },
    schemaPret: async () => o.schemaPret !== false,
    dossier: async () => '_GESTION BOITE MAIL',
    acquerirVerrou: async () => o.verrou !== false,
    libererVerrou: async () => { suivi.verrouRendu = true; },
    creerClient: async () => (o.client === undefined ? boite() : o.client),
    lireACompleter: async () => o.lignes ?? [],
    compterRestantes: async () => o.restantes ?? 0,
    ecrireLot: async (lot) => {
      ecrits.push(...lot);
      return o.ecrit ? o.ecrit(lot) : { completes: lot.length, dejaFaits: 0 };
    },
    journaliser: async () => { suivi.journaux += 1; },
  };
}

const ligne = (o: Partial<LigneACompleter> = {}): LigneACompleter => ({
  id: 1, messageId: '<a@exemple.fr>', uidImap: 42, uidValidity: '198', ...o,
});

describe('trancher', () => {
  it('découpe en tranches de la taille demandée', () => {
    expect(trancher([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('une liste vide ne fait aucune tranche', () => {
    expect(trancher([], 10)).toEqual([]);
  });
});

describe('les refus, AVANT toute écriture', () => {
  /** Migration non appliquée : un message clair, jamais une transaction abandonnée ni un écran mort (piège du lot 4a). */
  it('migration 235 absente → inactif, et RIEN n’est lu ni écrit', async () => {
    const d = deps({ schemaPret: false });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('inactif');
    expect(issue.raison).toContain('235');
    expect(d.ecrits).toHaveLength(0);
  });

  it('verrou déjà pris (une relève tourne) → occupe, et rien n’est écrit', async () => {
    const d = deps({ verrou: false });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('occupe');
    expect(d.ecrits).toHaveLength(0);
  });

  it('aucun compte IMAP → inactif, ce n’est pas une erreur', async () => {
    const d = deps({ client: null });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('inactif');
    expect(d.verrouRendu).toBe(true); // le verrou est RENDU même sur un chemin de sortie précoce
  });
});

describe('la passe ordinaire', () => {
  it('complète par UID et rapporte ce qui a été écrit', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 }), ligne({ id: 2, uidImap: 43 })],
      client: boite({ entetes: { 42: { to: 'a@exemple.fr' }, 43: { to: 'b@exemple.fr', cc: 'c@exemple.fr' } } }),
      restantes: 12,
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('ok');
    expect(issue.rapport).toMatchObject({ lus: 2, entetesObtenus: 2, completes: 2, resteNull: 12 });
    expect(d.ecrits.map((e) => e.id)).toEqual([1, 2]);
    expect(d.ecrits[1].destinataires.cc[0].adresse).toBe('c@exemple.fr');
  });

  it('retrouve par Message-ID les messages sans UID (capturés avant la migration 231)', async () => {
    const d = deps({
      lignes: [ligne({ id: 5, uidImap: null, uidValidity: null, messageId: '<vieux@exemple.fr>' })],
      client: boite({ recherche: { 'vieux@exemple.fr': [777] }, entetes: { 777: { to: 'x@exemple.fr' } } }),
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.rapport?.completes).toBe(1);
    expect(d.ecrits[0].id).toBe(5);
  });

  /** On ne choisit JAMAIS entre deux messages : écrire les adresses du mauvais serait irréparable et invisible. */
  it('plusieurs messages pour un même Message-ID → AMBIGU, la ligne reste « jamais analysé »', async () => {
    const d = deps({
      lignes: [ligne({ id: 5, uidImap: null, uidValidity: null, messageId: '<double@exemple.fr>' })],
      client: boite({ recherche: { 'double@exemple.fr': [10, 11] } }),
      restantes: 1,
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.rapport).toMatchObject({ ambigus: 1, completes: 0 });
    expect(d.ecrits).toHaveLength(0);
  });

  it('un message disparu de la boîte est INTROUVABLE, et n’empêche pas les autres', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 }), ligne({ id: 2, uidImap: 43 })],
      client: boite({ entetes: { 43: { to: 'b@exemple.fr' } } }),
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.rapport).toMatchObject({ introuvables: 1, completes: 1 });
  });

  it('une ligne déjà complétée entre-temps est comptée à part, pas en succès', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 })],
      client: boite({ entetes: { 42: { to: 'a@exemple.fr' } } }),
      ecrit: () => ({ completes: 0, dejaFaits: 1 }),
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.rapport).toMatchObject({ completes: 0, dejaFaits: 1 });
  });

  it('plus rien à compléter → ok, sans ouvrir de lot d’écriture', async () => {
    const d = deps({ lignes: [] });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('ok');
    expect(issue.raison).toContain('plus aucun message');
    expect(d.ecrits).toHaveLength(0);
  });
});

describe('la SIMULATION n’écrit rien, nulle part', () => {
  it('compte ce qui SERAIT écrit, sans toucher la base ni le journal', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 })],
      client: boite({ entetes: { 42: { to: 'a@exemple.fr' } } }),
      restantes: 99,
    });
    const issue = await executerCompletion(d, false, { plafond: 200 });
    expect(issue.rapport?.completes).toBe(1);
    expect(d.ecrits).toHaveLength(0);
    expect(d.journaux).toBe(0);
  });

  it('donne des exemples, adresses tronquées', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 })],
      client: boite({ entetes: { 42: { to: 'jean.dupont@exemple.fr' } } }),
    });
    const issue = await executerCompletion(d, false, { plafond: 200 });
    expect(issue.rapport?.exemples[0]).toContain('je…@exemple.fr');
    expect(issue.rapport?.exemples[0]).not.toContain('jean.dupont@exemple.fr');
  });
});

describe('le journal', () => {
  it('une passe appliquée qui complète écrit UNE ligne de journal', async () => {
    const d = deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: boite({ entetes: { 42: { to: 'a@exemple.fr' } } }) });
    await executerCompletion(d, true, { plafond: 200 });
    expect(d.journaux).toBe(1);
  });

  it('une passe qui ne complète RIEN n’écrit aucune ligne de journal', async () => {
    const d = deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: boite({ entetes: {} }), restantes: 1 });
    await executerCompletion(d, true, { plafond: 200 });
    expect(d.journaux).toBe(0);
  });
});

describe('les pannes', () => {
  /**
   * 🔴 LA LEÇON DES NUITS DES 23 ET 24/09/2026 : quand Gmail atteint sa limite, il ne renvoie ni erreur ni code — il
   * annonce les messages et ne sert plus rien. Rendre « ok » ferait croire à un progrès et empêcherait toute attente.
   */
  it('AUCUN en-tête servi sur toute la passe = ÉCHEC, pas un succès silencieux', async () => {
    const d = deps({
      lignes: [ligne({ id: 1, uidImap: 42 }), ligne({ id: 2, uidImap: 43 })],
      client: boite({ entetes: {} }), restantes: 2,
    });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('erreur');
    expect(issue.rapport).toMatchObject({ lus: 2, entetesObtenus: 0 });
  });

  it('une connexion qui tombe rend un échec, et le verrou est RENDU', async () => {
    const casse = boite();
    casse.entetesDesUids = async () => { throw new Error('Socket timeout'); };
    const d = deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: casse });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('erreur');
    expect(issue.raison).toContain('Socket timeout');
    expect(d.verrouRendu).toBe(true);
  });

  /**
   * Défaut vu en vrai le 25/09/2026 : la passe échouait et le compte rendu annonçait « reste à compléter : 0 », alors
   * qu'il restait 25 000 lignes. Un chiffre faux fait croire que c'est fini — pire qu'un chiffre absent.
   */
  it('un échec mesure quand même ce qui RESTE, il n’annonce pas zéro', async () => {
    const casse = boite();
    casse.entetesDesUids = async () => { throw new Error('coupure'); };
    const d = deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: casse, restantes: 25_033 });
    const issue = await executerCompletion(d, true, { plafond: 200 });
    expect(issue.resultat).toBe('erreur');
    expect(issue.rapport?.resteNull).toBe(25_033);
  });

  /**
   * Mesuré le 25/09/2026 : une passe a écrit 800 lignes puis s'est interrompue, et le journal n'en a rien su. Tout le
   * module repose sur « tout geste est journalisé » — une écriture sans trace est une entorse à ce principe.
   */
  it('une passe qui a ÉCRIT avant d’échouer laisse quand même sa ligne de journal', async () => {
    const lignes = Array.from({ length: 250 }, (_, i) => ligne({ id: i + 1, uidImap: 1000 + i }));
    const entetes: Record<number, Record<string, string>> = {};
    for (let i = 0; i < 250; i += 1) entetes[1000 + i] = { to: `a${i}@exemple.fr` };
    const client = boite({ entetes });
    let appels = 0;
    const origine = client.entetesDesUids;
    client.entetesDesUids = async (uids) => {
      appels += 1;
      if (appels > 1) throw new Error('coupure');
      return origine(uids);
    };
    const d = deps({ lignes, client, restantes: 50 });
    const issue = await executerCompletion(d, true, { plafond: 250 });
    expect(issue.resultat).toBe('erreur');
    expect(d.journaux).toBe(1);
  });

  it('une passe qui échoue SANS rien avoir écrit ne journalise pas', async () => {
    const casse = boite();
    casse.entetesDesUids = async () => { throw new Error('coupure'); };
    const d = deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: casse });
    await executerCompletion(d, true, { plafond: 200 });
    expect(d.journaux).toBe(0);
  });

  it('la boîte est refermée même quand la passe échoue', async () => {
    const casse = boite();
    const fermer = vi.fn(async () => {});
    casse.fermer = fermer;
    casse.entetesDesUids = async () => { throw new Error('coupure'); };
    await executerCompletion(deps({ lignes: [ligne({ id: 1, uidImap: 42 })], client: casse }), true, { plafond: 200 });
    expect(fermer).toHaveBeenCalled();
  });

  /** Écrire AU FIL DE L'EAU : une coupure au bout de trois heures doit laisser acquis tout ce qui précède. */
  it('ce qui a été écrit avant une coupure reste acquis', async () => {
    const lignes = Array.from({ length: 250 }, (_, i) => ligne({ id: i + 1, uidImap: 1000 + i }));
    const entetes: Record<number, Record<string, string>> = {};
    for (let i = 0; i < 250; i += 1) entetes[1000 + i] = { to: `a${i}@exemple.fr` };
    const client = boite({ entetes });
    let appels = 0;
    const origine = client.entetesDesUids;
    client.entetesDesUids = async (uids) => {
      appels += 1;
      if (appels > 1) throw new Error('coupure à la deuxième tranche');
      return origine(uids);
    };
    const d = deps({ lignes, client });
    const issue = await executerCompletion(d, true, { plafond: 250 });
    expect(issue.resultat).toBe('erreur');
    expect(d.ecrits.length).toBeGreaterThanOrEqual(200); // le premier lot a bien été écrit avant la coupure
  });
});
