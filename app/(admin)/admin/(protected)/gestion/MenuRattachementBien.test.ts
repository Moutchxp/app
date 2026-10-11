// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, existsSync } from 'node:fs';
import { MenuRattachementBien } from './MenuRattachementBien';

/**
 * 🔴 LOT BIEN-RATTACHE — LE MENU DE RATTACHEMENT, ÉPROUVÉ À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE (11/10/2026) — CE MENU REND LE COMPOSANT PARTAGÉ DE « Rattacher ce mail à… »
 * (`ListeBiensACocher`) : cartes compactes, compteur, « Sélectionner tous les biens », « i », motif, « déjà dans la
 * sélection ». Les grandes cartes du modèle B (pastille « À trancher », colonnes, blocs e-mail + Copier, ligne
 * récapitulative) sont supprimées. Seule différence admise : « LOCATAIRE (à la date du mail) ».
 *
 * Ce qui est protégé ici :
 *   ③a les PROPOSITIONS de l'automatisation sont EN HAUT, avec leur motif ;
 *   ③b la RECHERCHE LIBRE est en dessous, ses résultats sont des BIENS, avec la DATE DU MAIL ;
 *   ③b′ les résultats sont rangés en DEUX GROUPES TITRÉS — et un bien qui répond aux deux n'est que dans le premier ;
 *   ③c UNE SEULE VALIDATION pour les deux zones, avec la portée et « Hors gestion » ;
 *   ③d le compteur et « Sélectionner / Désélectionner tous les biens » ;
 *   🔴 RIEN n'est écrit avant « Rattacher ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];
let contexte: Record<string, unknown> | null;
let resultats: { lignes: unknown[]; tronque?: boolean };

const partie = (role: string, nom: string) => ({ role, cle: nom, nom, emails: [], telephones: [] });
const propose = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `4 rue Alpha, 92000 VILLE — lot ${cle}`, adresse: `${cle} rue Alpha`, commune: 'VILLE',
  nature: 'Appartement', typeBien: 'Type 2', adresseComplete: '4 rue Alpha, 92000 VILLE',
  caracteristiques: [{ libelle: 'Nature', valeur: 'Appartement' }],
  parties: [partie('proprietaire', 'BAILLEUR A'), partie('locataire', 'LOCATAIRE A')],
  recommande: false, dejaRattache: false, replie: false,
  motif: 'un des 2 biens de BAILLEUR A', cas: 'c', certitude: 'a_trancher', ...o,
});
const trouve = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, lotId: Number(cle), libelle: `9 rue Beta, 92000 VILLE — lot ${cle}`, adresse: '9 rue Beta, 92000 VILLE',
  adresseVoie: `${cle} rue Beta`, commune: 'VILLE', nature: 'Appartement', typeBien: 'Studio',
  parties: [partie('proprietaire', 'BAILLEUR B'), partie('locataire', 'LOCATAIRE B')],
  raisons: [{ sorte: 'adresse', detail: '' }], ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  resultats = { lignes: [] };
  contexte = {
    messageId: 900, filId: 101, dateMail: '2026-08-13', nbMailsDuFil: 3,
    proprietaire: null, examen: { issue: 'a_trancher', motif: '2 bien(s) proposé(s), à trancher' },
    pieces: [], biens: [propose('445'), propose('446')], disponible: true,
  };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({
      url: u, methode: init?.method ?? 'GET',
      corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (u.includes('/classement?message=')) {
      return { ok: true, json: async () => ({ etat: 'ok', contexte }) } as unknown as Response;
    }
    if (u.includes('/classement?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', mails: [900, 901] }) } as unknown as Response;
    }
    if (u.includes('/biens?')) {
      return { ok: true, json: async () => ({ etat: 'ok', ...resultats }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(MenuRattachementBien, {
      messageId: 900, filId: 101, onFerme: () => {}, onChange: () => {}, onHorsGestion: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test(b.textContent ?? ''));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const cases = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
const casesDuHaut = () => [...container.querySelectorAll('.rec-biens input[type="checkbox"]')] as HTMLInputElement[];
const casesResultats = () => [...container.querySelectorAll('.rec-resultats input[type="checkbox"]')] as HTMLInputElement[];
const champ = () => container.querySelector('.rec-saisie') as HTMLInputElement;
const taper = async (t: string) => {
  await act(async () => {
    const c = champ();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(c, t);
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // La frappe est temporisée : on laisse passer le délai avant de lire les résultats.
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  await calmer();
};
const ecritures = () => appels.filter((a) => a.methode !== 'GET');
/** Tous les résultats de recherche, tous groupes confondus. */
const zoneResultats = () =>
  [...container.querySelectorAll('.rec-resultats')].map((e) => e.textContent ?? '').join(' ');
/** Les titres des groupes, dans l'ordre où ils s'affichent. */
const titresGroupes = () =>
  [...container.querySelectorAll('.rec-groupe-titre')].map((e) => e.textContent ?? '');
const compteur = () => container.querySelector('.rec-compte')?.textContent ?? '';

describe('🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — un seul composant, plus aucune trace du modèle B', () => {
  const dossier = 'app/(admin)/admin/(protected)/gestion';
  it('les deux fenêtres rendent LE MÊME composant de choix de biens', () => {
    const a = readFileSync(`${dossier}/RattacherEnEcrivant.tsx`, 'utf8');
    const b = readFileSync(`${dossier}/MenuRattachementBien.tsx`, 'utf8');
    for (const s of [a, b]) {
      expect(s).toContain("import { CSS_LISTE_BIENS, ListeBiensACocher, useRechercheBiens } from './ListeBiensACocher';");
      expect(s.match(/<ListeBiensACocher /g)).toHaveLength(1);
      expect(s).toContain('<style>{CSS_LISTE_BIENS}</style>');
    }
  });
  it('🔴 plus aucune trace du modèle B dans le code', () => {
    expect(existsSync(`${dossier}/PropositionsDeBiens.tsx`)).toBe(false);
    const b = readFileSync(`${dossier}/MenuRattachementBien.tsx`, 'utf8');
    for (const trace of ['EnTeteCarteBien', 'ColonneBien', 'ColonneLocataires', 'CartePersonne', 'CSS_PROPOSITIONS_BIENS',
      'CSS_BOUTON_COPIER', 'LigneResultat', 'mrb-couple', 'pdb-', 'À trancher', 'Chercher un autre bien', 'mrb-resultats']) {
      expect(b).not.toContain(trace);
    }
    /* Un seul endroit dessine une ligne de résultat de recherche de biens dans toute l'application. */
    const a = readFileSync(`${dossier}/RattacherEnEcrivant.tsx`, 'utf8');
    expect(a).not.toContain('function LigneBienCompacte');
    expect(readFileSync(`${dossier}/ListeBiensACocher.tsx`, 'utf8')).toContain('function LigneBienCompacte');
  });
});

describe('🔴 ③a les propositions de l’automatisation, EN HAUT', () => {
  it('elles sont affichées, avec leur motif, avant la recherche', async () => {
    await monter();
    expect(container.textContent).toContain('Propositions');
    expect(container.textContent).toContain('un des 2 biens de BAILLEUR A');
    const html = container.innerHTML;
    expect(html.indexOf('Propositions')).toBeLessThan(html.indexOf('Moteur de recherche'));
  });

  it('chaque proposition porte ses parties sur deux lignes — LOCATAIRE à la date du mail — et sa pastille « i »', async () => {
    await monter();
    const carte = container.querySelector('.rec-bien')?.textContent ?? '';
    expect(carte).toContain('BAILLEUR A');
    expect(carte).toContain('Locataire (à la date du mail) LOCATAIRE A');
    expect(container.querySelectorAll('.rec-bien .ifb-bouton, .rec-bien button').length).toBeGreaterThan(0);
    /* 🔴 Plus de pastille « À trancher », plus de colonnes. */
    expect(container.textContent).not.toContain('À trancher');
    expect(container.querySelector('.pdb-col--loc')).toBeNull();
  });

  it('🔴 « Vacant à cette date » quand personne n’occupait le bien au jour du mail', async () => {
    contexte = { ...contexte, biens: [propose('445', { parties: [partie('proprietaire', 'BAILLEUR A')] })] };
    await monter();
    expect(container.querySelector('.rec-bien')?.textContent).toContain('Vacant à cette date');
  });

  it('🔴 AUCUNE proposition ⇒ la phrase d’Arno, et la recherche reste', async () => {
    contexte = { ...contexte, biens: [] };
    await monter();
    expect(container.querySelector('.rec-aucune')).not.toBeNull();
    expect(container.textContent).toContain('Moteur de recherche');
  });

  it('la pré-coche vient du moteur, et se décoche sans revenir', async () => {
    contexte = { ...contexte, biens: [propose('445', { recommande: true }), propose('446')] };
    await monter();
    expect(casesDuHaut().map((c) => c.checked)).toEqual([true, false]);
    await cliquer(casesDuHaut()[0]);
    expect(casesDuHaut().map((c) => c.checked)).toEqual([false, false]);
  });
});

describe('🔴 ③b la recherche libre : des BIENS, et rien que des biens', () => {
  it('elle n’interroge pas avant deux caractères', async () => {
    await monter();
    await taper('v');
    expect(appels.filter((a) => a.url.includes('/biens?'))).toHaveLength(0);
  });

  it('elle passe la requête ET la date du mail — c’est elle qui décide qui est locataire', async () => {
    await monter();
    await taper('victor hugo');
    const r = appels.find((a) => a.url.includes('/biens?'));
    expect(r?.url).toContain('q=victor+hugo');
    expect(r?.url).toContain('date=2026-08-13');
  });

  it('chaque résultat est un BIEN, compact, avec sa raison et LOCATAIRE (à la date du mail)', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await taper('9 rue beta');
    const bloc = zoneResultats();
    expect(bloc).toContain('999 rue Beta, VILLE');
    expect(bloc).toContain('trouvé par adresse');
    expect(bloc).toContain('BAILLEUR B');
    expect(bloc).toContain('Locataire (à la date du mail) LOCATAIRE B');
    expect(container.querySelectorAll('.rec-resultats .rec-ligne')).toHaveLength(1);
  });

  it('🔴 un bien DÉJÀ PROPOSÉ n’est pas un second bien : il dit « déjà dans la sélection »', async () => {
    resultats = { lignes: [trouve('445'), trouve('999')] };
    await monter();
    await taper('rue');
    /* 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — la mention et la trame ne paraissent que COCHÉ. */
    const lignes = () => [...container.querySelectorAll('.rec-resultats .rec-ligne')];
    expect(lignes()[0].textContent).not.toContain('déjà dans la sélection');
    /* Une seule case pour ce bien : cocher l'une coche l'autre. */
    await cliquer(casesResultats()[0]);
    expect(casesDuHaut()[0].checked).toBe(true);
    expect(lignes()[0].textContent).toContain('déjà dans la sélection');
    expect(lignes()[1].textContent).not.toContain('déjà dans la sélection');
  });

  it('🔴🔴 trame verte éteinte après décochage (Modifier le rattachement)', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await taper('rue');
    const ligne = () => container.querySelector('.rec-resultats .rec-ligne') as HTMLElement;
    await cliquer(ligne().querySelector('input') as HTMLInputElement);
    expect(ligne().className).toContain('rec-ligne--deja');
    await cliquer(ligne().querySelector('input') as HTMLInputElement);
    expect(ligne().className).not.toContain('rec-ligne--deja');
    expect(ligne().textContent).not.toContain('déjà dans la sélection');
  });

  it('🔴 aucun résultat ⇒ on DIT ce qu’on a cherché, jamais « aucun résultat » tout court', async () => {
    resultats = { lignes: [] };
    await monter();
    await taper('victor hugo');
    expect(container.textContent).toContain('Aucun bien trouvé pour « victor hugo »');
  });

  it('une liste tronquée est annoncée', async () => {
    resultats = { lignes: [trouve('999')], tronque: true };
    await monter();
    await taper('puteaux');
    expect(container.textContent).toContain('précisez votre recherche');
  });
});

describe('🔴 ③b′ les résultats, en DEUX GROUPES TITRÉS', () => {
  /** Le même bien, mais trouvé par le NOM de son locataire plutôt que par l'adresse. */
  const parNom = (cle: string, detail = 'RUELLAN Océane et Victor Hugo') =>
    trouve(cle, { raisons: [{ sorte: 'locataire', detail }] });

  it('🔴 « Par adresse » EN PREMIER, « Par nom ou coordonnée » ensuite, chaque bien sous le bon titre', async () => {
    resultats = { lignes: [parNom('998'), trouve('999')] };
    await monter();
    await taper('victor hugo');
    expect(titresGroupes()).toEqual(['Par adresse', 'Par nom ou coordonnée']);
    const groupes = [...container.querySelectorAll('.rec-groupe')].map((e) => e.textContent ?? '');
    expect(groupes[0]).toContain('999 rue Beta');
    expect(groupes[0]).not.toContain('998 rue Beta');
    expect(groupes[1]).toContain('998 rue Beta');
  });

  it('🔴 un bien trouvé PAR L’ADRESSE ET PAR UN NOM n’apparaît QUE dans le premier groupe', async () => {
    resultats = {
      lignes: [trouve('999', {
        raisons: [{ sorte: 'adresse', detail: '' }, { sorte: 'locataire', detail: 'DUPONT Jean' }],
      })],
    };
    await monter();
    await taper('dupont beta');
    expect(titresGroupes()).toEqual(['Par adresse']);
    expect(zoneResultats().match(/999 rue Beta/g)).toHaveLength(1);
    expect(zoneResultats()).toContain('trouvé par adresse · locataire DUPONT Jean');
  });

  it('un bien trouvé par TÉLÉPHONE est « par nom ou coordonnée » ; par N° DE LOT, « par adresse »', async () => {
    resultats = { lignes: [trouve('999', { raisons: [{ sorte: 'telephone_proprietaire', detail: 'BAILLEUR B' }] })] };
    await monter();
    await taper('06 69 14 28 07');
    expect(titresGroupes()).toEqual(['Par nom ou coordonnée']);
    expect(zoneResultats()).toContain('trouvé par téléphone de BAILLEUR B');
    resultats = { lignes: [trouve('997', { raisons: [{ sorte: 'lot', detail: '' }] })] };
    await taper('997');
    expect(titresGroupes()).toEqual(['Par adresse']);
    expect(zoneResultats()).toContain('trouvé par n° de lot');
  });

  it('🔴 les deux groupes se valident ENSEMBLE — le titre range, il ne sépare pas le geste', async () => {
    resultats = { lignes: [parNom('998'), trouve('999')] };
    await monter();
    await taper('victor hugo');
    await cliquer(casesResultats()[0]);
    await cliquer(casesResultats()[1]);
    await cliquer(boutonPar(/^Rattacher$/));
    const posts = ecritures().filter((a) => a.methode === 'POST');
    expect(posts.map((p) => (p.corps as { cible: { cle: string } }).cible.cle).sort()).toEqual(['998', '999']);
  });
});

describe('🔴 ③c une seule validation pour les DEUX zones', () => {
  it('rien n’est écrit tant qu’on n’a pas validé', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await cliquer(casesDuHaut()[0]);
    await taper('rue');
    await cliquer(casesResultats()[0]);
    expect(ecritures()).toEqual([]);
  });

  it('🔴 une proposition ET un résultat de recherche se valident ENSEMBLE ; le résultat coché rejoint les cartes du haut', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await cliquer(casesDuHaut()[0]);            // la proposition 445
    await taper('rue');
    await cliquer(casesResultats()[0]);         // le résultat 999
    expect(container.querySelector('.rec-biens')?.textContent).toContain('ajouté à la main depuis la recherche');
    await cliquer(boutonPar(/^Rattacher$/));

    const posts = ecritures().filter((a) => a.methode === 'POST');
    expect(posts).toHaveLength(2);
    const cles = posts.map((p) => (p.corps as { cible: { cle: string } }).cible.cle).sort();
    expect(cles).toEqual(['445', '999']);
    // 🔴 ET LA CIBLE EST TOUJOURS UN LOT : jamais une personne.
    expect(posts.every((p) => (p.corps as { cible: { sorte: string } }).cible.sorte === 'lot')).toBe(true);
  });

  it('sans rien de coché, « Rattacher » est INACTIF et le dit', async () => {
    await monter();
    expect(boutonPar(/^Rattacher$/)?.disabled).toBe(true);
    expect(container.textContent).toContain('Aucun bien coché');
  });

  it('la PORTÉE est le même choix qu’ailleurs, « ce mail » par défaut', async () => {
    await monter();
    const radios = [...container.querySelectorAll('input[name="mrb-portee"]')] as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
  });

  it('🔴 « toute la conversation » DEMANDE au serveur les mails sans classement manuel', async () => {
    await monter();
    await cliquer(casesDuHaut()[0]);
    const radios = [...container.querySelectorAll('input[name="mrb-portee"]')] as HTMLInputElement[];
    await cliquer(radios[1]);
    await cliquer(boutonPar(/^Rattacher$/));
    expect(appels.some((a) => a.url.includes('/classement?fil=101&portee=1'))).toBe(true);
    // Deux mails × un bien = deux rattachements.
    expect(ecritures().filter((a) => a.methode === 'POST')).toHaveLength(2);
  });

  it('« Hors gestion » reste accessible depuis le menu', async () => {
    const ouvert: string[] = [];
    await monter({ onHorsGestion: () => ouvert.push('ok') });
    await cliquer(boutonPar(/Hors gestion/));
    expect(ouvert).toEqual(['ok']);
  });
});

describe('🔴 ③d le compteur et « Sélectionner / Désélectionner tous les biens » (comme « Rattacher ce mail à… »)', () => {
  /* 🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE (11/10/2026) — le compteur porte UNIQUEMENT sur la carte Propositions. */
  it('« N bien(s) coché(s) sur M affiché(s) » : la carte Propositions seule — ni les résultats, ni les biens suivis', async () => {
    resultats = { lignes: [trouve('445'), trouve('999')] };
    await monter();
    expect(compteur()).toBe('0 bien(s) coché(s) sur 2 affiché(s).');
    await cliquer(casesDuHaut()[0]);
    expect(compteur()).toBe('1 bien(s) coché(s) sur 2 affiché(s).');
    await taper('rue');
    expect(compteur()).toBe('1 bien(s) coché(s) sur 2 affiché(s).');
    /* Un résultat coché rejoint la carte Propositions : il y compte, une fois. */
    await cliquer(casesResultats()[1]);
    expect(compteur()).toBe('2 bien(s) coché(s) sur 3 affiché(s).');
  });

  it('« Sélectionner tous les biens » coche tout ce qui est visible, puis devient « Désélectionner »', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await taper('rue');
    await cliquer(boutonPar(/^Sélectionner tous les biens$/));
    expect(cases().every((c) => c.checked)).toBe(true);
    expect(compteur()).toBe('3 bien(s) coché(s) sur 3 affiché(s).');  // 445, 446, et le résultat 999 rangé en haut
    expect(boutonPar(/^Désélectionner tous les biens$/)).toBeDefined();
    await cliquer(boutonPar(/^Rattacher$/));
    expect(ecritures().filter((a) => a.methode === 'POST')
      .map((p) => (p.corps as { cible: { cle: string } }).cible.cle).sort()).toEqual(['445', '446', '999']);
  });

  it('🔴 en mode commandé (Modifier le rattachement) : les biens déjà suivis ne comptent plus, la validation reçoit la liste', async () => {
    const recu: { voulue: readonly { cle: string }[] | null } = { voulue: null };
    let coches: readonly string[] = ['445'];
    const remonter = async () => monter({
      preCoches: ['445'], cochesImposees: coches,
      onCochesChange: (c: readonly string[]) => { coches = c; },
      onValider: async (v: readonly { cle: string }[]) => { recu.voulue = v; },
      motValider: 'Valider pour ce mail uniquement',
    });
    await remonter();
    /* 445 est déjà rattaché : sa carte est au-dessus, il n'est pas répété ici — mais il compte. */
    expect(container.querySelector('.rec-biens')?.textContent).not.toContain('445 rue Alpha');
    expect(compteur()).toBe('0 bien(s) coché(s) sur 1 affiché(s).');
    await cliquer(casesDuHaut()[0]);
    await remonter();
    expect(coches).toEqual(['445', '446']);
    await cliquer(boutonPar(/^Valider pour ce mail uniquement$/));
    expect((recu.voulue ?? []).map((x) => x.cle)).toEqual(['445', '446']);
  });
});

describe('🔴🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE — jamais de coupure silencieuse', () => {
  it('8 cartes visibles sans défilement ; au-delà, « voir les autres (N) » explicite', async () => {
    contexte = { ...contexte, biens: Array.from({ length: 11 }, (_, i) => propose(String(500 + i))) };
    await monter();
    const cartes = () => [...container.querySelectorAll('.rec-biens .rec-bien')].filter((c) => !c.classList.contains('rec-autres'));
    expect(cartes()).toHaveLength(8);
    expect(compteur()).toBe('0 bien(s) coché(s) sur 8 affiché(s).');
    const voir = boutonPar(/^voir les autres \(3\)$/);
    expect(voir).toBeDefined();
    await cliquer(voir);
    expect(cartes()).toHaveLength(11);
    expect(compteur()).toBe('0 bien(s) coché(s) sur 11 affiché(s).');
    expect(boutonPar(/^masquer les autres biens$/)).toBeDefined();
  });

  it('une proposition cochée au-delà de la 8e reste visible une fois repliée', async () => {
    contexte = { ...contexte, biens: Array.from({ length: 10 }, (_, i) => propose(String(600 + i))) };
    await monter();
    await cliquer(boutonPar(/^voir les autres \(2\)$/));
    await cliquer(casesDuHaut()[9]);
    await cliquer(boutonPar(/^masquer les autres biens$/));
    expect(casesDuHaut()).toHaveLength(9);
    expect(compteur()).toBe('1 bien(s) coché(s) sur 9 affiché(s).');
    expect(boutonPar(/^voir les autres \(1\)$/)).toBeDefined();
  });
});

describe('🔴 un bien proposé ET trouvé à la recherche n’est pas son propre homonyme', () => {
  it('son titre ne prend pas « · lot N » quand la recherche le retrouve', async () => {
    resultats = { lignes: [trouve('445', { adresseVoie: '445 rue Alpha', typeBien: 'Type 2' })] };
    await monter();
    const titre = () => container.querySelector('.rec-biens .rec-bien-nom')?.textContent ?? '';
    const avant = titre();
    await taper('alpha');
    expect(titre()).toBe(avant);
    expect(titre()).not.toContain('lot 445');
  });
});
