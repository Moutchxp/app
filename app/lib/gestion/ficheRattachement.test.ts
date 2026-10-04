import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  adresseDossierDrive, adresseFicheAnnuaire, dateFr, motNbMails, motPeriode, motRole, motSansLocataire,
  motStatutBien, motSurface, ordonnerBiens, ordonnerPersonnes, qualitePersonne,
  type BienRattache, type PersonneRattachement,
} from './ficheRattachement';
import { statutDesLiens } from './ficheRattachementRepo';

/**
 * LOT FICHE-RATTACHEMENT — CE QUE MONTRE « VISUALISER / MODIFIER », ÉPROUVÉ SANS ÉCRAN NI BASE.
 *
 * Tout ce qui se décide ici — l'ordre des personnes, les mots d'une donnée absente, les adresses des deux liens
 * sortants — est PUR. C'est ce qui permet de l'éprouver exhaustivement, y compris les cas qu'on ne saurait pas
 * provoquer à la main dans une vraie boîte : un logement vacant à la date d'un mail de 2025, une colocation dont
 * l'un des deux écrit, un propriétaire sans aucune coordonnée.
 */

const personne = (p: Partial<PersonneRattachement>): PersonneRattachement => ({
  role: 'proprietaire', cle: 'P1', id: 12, nom: 'DUPONT Jean', civilite: null,
  telephones: [], emails: [], expediteur: false, ...p,
});

const bien = (p: Partial<BienRattache>): BienRattache => ({
  cle: '100', adresseComplete: '4 rue Fictive, 92400 PUTEAUX', numeroLot: '100',
  /* ⚠️ LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — `lotId` N'EST PAS `cle` : la ligne nº 7 porte le lot
     « 100 ». C'est tout l'écart que `adresseHistoriqueDuBien` protège, et il est écrit ici exprès. */
  lotId: 7,
  nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'auto',
  dateMail: '2026-09-20', nbMails: 1, dossierDriveId: null, personnes: [], lienIds: [],
  /* 🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — par défaut, personne aujourd'hui ; chaque cas dit le sien. */
  occupantsAujourdhui: [], ...p,
});

describe('🔴 la surface — « ne jamais l’inventer »', () => {
  /**
   * 🔴🔴 ELLE MANQUE TOUJOURS AUJOURD'HUI. L'export WIPPIMMO ne porte aucune colonne de surface (mesuré le
   * 28/09/2026 : `gestion_annuaire_lot` n'en a pas). La ligne dit donc « surface non renseignée » sur les 365
   * lots — et c'est la bonne réponse, pas un défaut d'affichage.
   */
  it('absente : elle est DITE absente, en toutes lettres', () => {
    expect(motSurface(null)).toBe('surface non renseignée');
    expect(motSurface(0)).toBe('surface non renseignée');
    expect(motSurface(Number.NaN)).toBe('surface non renseignée');
    // Une valeur négative est une donnée abîmée : on ne l'affiche pas comme une surface.
    expect(motSurface(-12)).toBe('surface non renseignée');
  });

  it('présente : elle s’écrit en m², à la française', () => {
    expect(motSurface(42)).toBe('42 m²');
    expect(motSurface(42.55)).toBe('42,6 m²');
  });
});

describe('les mots d’une donnée absente', () => {
  /** 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE : il explique pourquoi le mail vient du bailleur. */
  it('« Vacant à cette date », avec la date, et jamais une case vide', () => {
    expect(motSansLocataire('2026-09-20')).toBe('Vacant à cette date (20/09/2026)');
    expect(motSansLocataire(null)).toContain('Vacant');
  });

  it('les dates s’écrivent à la française, et une date illisible est rendue telle quelle', () => {
    expect(dateFr('2026-09-20')).toBe('20/09/2026');
    expect(dateFr('2026-09-20T12:00:00Z')).toBe('20/09/2026');
    expect(dateFr('jamais')).toBe('jamais');
    expect(dateFr(null)).toBe('');
  });

  it('la période d’occupation se dit selon ce qu’on sait, et rien si l’on ne sait rien', () => {
    expect(motPeriode({ depuis: '2024-01-01', jusqua: '2026-06-30' })).toBe('du 01/01/2024 au 30/06/2026');
    expect(motPeriode({ depuis: '2024-01-01' })).toBe('depuis le 01/01/2024');
    expect(motPeriode({ jusqua: '2026-06-30' })).toBe('jusqu’au 30/06/2026');
    expect(motPeriode({})).toBeNull();
  });

  /** 🔴 « Sté » DÉSIGNE UNE SOCIÉTÉ : sans cette mention, « MARS AVENIR » se lit comme un patronyme. */
  it('une société est dite comme telle', () => {
    for (const c of ['Sté', 'Ste', 'sté.', 'SOCIETE', 'SARL', 's.a.r.l.']) {
      expect(qualitePersonne(c), c).toBe('Société');
    }
    expect(qualitePersonne('Mme')).toBe('Mme');
    expect(qualitePersonne(null)).toBeNull();
    expect(qualitePersonne('  ')).toBeNull();
  });

  it('les mots des rôles et des statuts sont écrits, jamais des codes de base', () => {
    expect(motRole('proprietaire')).toBe('Propriétaire');
    expect(motRole('locataire')).toBe('Locataire');
    expect(motStatutBien('classe')).toBe('Classé');
    expect(motStatutBien('auto')).toBe('Auto');
    expect(motStatutBien('a_trancher')).toBe('À trancher');
  });

  /** « 1 mails » se lit comme un bogue, et fait douter du reste de la fenêtre. */
  it('le nombre de mails est au pluriel EXACT', () => {
    expect(motNbMails(1)).toBe('1 mail dans la conversation');
    expect(motNbMails(0)).toBe('1 mail dans la conversation');
    expect(motNbMails(12)).toBe('12 mails dans la conversation');
  });
});

describe('🔴 l’ordre des personnes — l’expéditeur d’abord', () => {
  /** 🔴 « Mail envoyé par le propriétaire : son bloc en premier, mis en évidence Expéditeur » — demande d'Arno. */
  it('un propriétaire expéditeur passe devant, et il l’est déjà par défaut', () => {
    const l = ordonnerPersonnes([
      personne({ role: 'locataire', cle: 'L1', nom: 'MARTIN Alice' }),
      personne({ role: 'proprietaire', cle: 'P1', nom: 'DUPONT Jean', expediteur: true }),
    ]);
    expect(l.map((p) => p.nom)).toEqual(['DUPONT Jean', 'MARTIN Alice']);
  });

  /**
   * 🔴 ET C'EST LE CAS QUI COMPTE : « Mail envoyé par un locataire : le bloc locataire en premier ». Sans cette
   * règle, on rappellerait le bailleur alors que c'est le locataire qui a écrit.
   */
  it('🔴 un LOCATAIRE expéditeur passe devant son propriétaire', () => {
    const l = ordonnerPersonnes([
      personne({ role: 'proprietaire', cle: 'P1', nom: 'DUPONT Jean' }),
      personne({ role: 'locataire', cle: 'L1', nom: 'MARTIN Alice', expediteur: true }),
    ]);
    expect(l.map((p) => p.nom)).toEqual(['MARTIN Alice', 'DUPONT Jean']);
  });

  it('sans expéditeur reconnu : le propriétaire, puis les locataires — l’ordre du dossier', () => {
    const l = ordonnerPersonnes([
      personne({ role: 'locataire', cle: 'L1', nom: 'MARTIN Alice' }),
      personne({ role: 'locataire', cle: 'L2', nom: 'BERNARD Paul' }),
      personne({ role: 'proprietaire', cle: 'P1', nom: 'DUPONT Jean' }),
    ]);
    expect(l.map((p) => p.nom)).toEqual(['DUPONT Jean', 'MARTIN Alice', 'BERNARD Paul']);
  });

  /** ⚠️ À RÔLE ÉGAL, L'ORDRE D'ARRIVÉE TIENT : un tri alphabétique séparerait les deux membres d'un couple. */
  it('une colocation garde l’ordre de l’import, jamais l’ordre alphabétique', () => {
    const l = ordonnerPersonnes([
      personne({ role: 'locataire', cle: 'L1', nom: 'ZOLA Émile' }),
      personne({ role: 'locataire', cle: 'L2', nom: 'ABEL Anne' }),
    ]);
    expect(l.map((p) => p.nom)).toEqual(['ZOLA Émile', 'ABEL Anne']);
  });
});

describe('l’ordre des biens — le plus sûr d’abord', () => {
  it('classé, puis auto, puis à trancher', () => {
    const l = ordonnerBiens([
      bien({ cle: 'c', statut: 'a_trancher', adresseComplete: 'A' }),
      bien({ cle: 'a', statut: 'auto', adresseComplete: 'B' }),
      bien({ cle: 'b', statut: 'classe', adresseComplete: 'C' }),
    ]);
    expect(l.map((b) => b.cle)).toEqual(['b', 'a', 'c']);
  });

  it('à certitude égale, celui qui porte le plus de mails de la conversation', () => {
    const l = ordonnerBiens([
      bien({ cle: 'a', statut: 'auto', nbMails: 1 }),
      bien({ cle: 'b', statut: 'auto', nbMails: 5 }),
    ]);
    expect(l.map((b) => b.cle)).toEqual(['b', 'a']);
  });
});

describe('🔒 les deux liens sortants', () => {
  /**
   * 🔒 UNE ADRESSE DE CONSULTATION, ET RIEN D'AUTRE. Le navigateur ouvre Drive avec les droits Google de la
   * personne connectée ; l'application ne lit rien, ne télécharge rien, ne crée rien.
   */
  it('le dossier du bien : une adresse Drive, ou rien du tout', () => {
    expect(adresseDossierDrive('1abcDEF')).toBe('https://drive.google.com/drive/folders/1abcDEF');
    // Pas de lien plutôt qu'un lien mort : un identifiant vide mènerait à une page d'erreur Google.
    expect(adresseDossierDrive(null)).toBeNull();
    expect(adresseDossierDrive('   ')).toBeNull();
  });

  /** ⚠️ SUR L'IDENTIFIANT INTERNE, pas sur la clé WIPPIMMO : confondre les deux ouvrirait la fiche d'un autre. */
  it('la fiche d’annuaire : construite sur l’identifiant interne, et absente sans lui', () => {
    expect(adresseFicheAnnuaire({ role: 'proprietaire', id: 12 }))
      .toBe('/admin/gestion?ecran=annuaire&fiche=proprietaire-12');
    expect(adresseFicheAnnuaire({ role: 'locataire', id: 7 }))
      .toBe('/admin/gestion?ecran=annuaire&fiche=locataire-7');
    expect(adresseFicheAnnuaire({ role: 'proprietaire', id: null })).toBeNull();
    expect(adresseFicheAnnuaire({ role: 'proprietaire', id: 0 })).toBeNull();
  });
});

describe('🔴 le statut d’un bien, à partir de ses liens', () => {
  const l = (statut: string, origine = 'automatique', statut_par_libelle: string | null = null) =>
    ({ statut, origine, statut_par_libelle });

  /**
   * 🔴 « CLASSÉ » L'EMPORTE SUR « AUTO ». Un bien qu'un humain a confirmé une fois reste classé, même si dix
   * autres mails de la conversation ne portent qu'une proposition : l'inverse ferait descendre un classement
   * humain au rang de proposition dès qu'un mail de plus arrive.
   */
  it('un geste humain qualifie le bien, même noyé dans des liens automatiques', () => {
    expect(statutDesLiens([l('confirme'), l('confirme', 'manuel'), l('propose')])).toBe('classe');
    expect(statutDesLiens([l('confirme', 'automatique', 'a.jorel@sansvisavis.com')])).toBe('classe');
  });

  it('sans geste humain : « auto » dès qu’un lien est confirmé, « à trancher » sinon', () => {
    expect(statutDesLiens([l('confirme'), l('propose')])).toBe('auto');
    expect(statutDesLiens([l('propose'), l('propose')])).toBe('a_trancher');
    expect(statutDesLiens([])).toBe('a_trancher');
  });
});

/**
 * ⚠️ GARANTIE STATIQUE — ce qu'aucune exécution ne prouve : que ce dépôt ne fait QUE lire. Même forme que le garde
 * de `classementBien.ts`, et pour la même raison : le geste d'écriture doit rester celui de la route des
 * rattachements, avec son journal.
 */
describe('🔒 le dépôt de la fiche ne fait QUE lire', () => {
  const code = readFileSync('app/lib/gestion/ficheRattachementRepo.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  it('aucun INSERT, UPDATE ni DELETE', () => {
    expect(/\bINSERT\s+INTO\b/i.test(code)).toBe(false);
    expect(/\bUPDATE\s+\w/i.test(code)).toBe(false);
    expect(/\bDELETE\s+FROM\b/i.test(code)).toBe(false);
  });

  /** 🔒 ET AUCUN APPEL AU DRIVE : le lien affiché est une ADRESSE, jamais une requête de l'application à Google. */
  it('aucun appel au Drive — le lien du dossier est une adresse, pas une lecture', () => {
    expect(code).not.toContain('googleapis.com');
    expect(code).not.toContain('listerContenu');
    expect(code).not.toContain('jetonPour');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 « QUI A ÉCRIT » — DÉFAUT TROUVÉ À L'ÉCRAN LE 28/09/2026, fil 36505 « Paiement loyer Octobre ».
 *
 * La fenêtre marquait DEUX expéditeurs : la locataire LEWINTRE Valentine, qui avait bien écrit, ET sa bailleresse
 * DELAHAYE Karene, qui n'avait rien envoyé — et c'est cette dernière qui passait en tête. On aurait rappelé la
 * mauvaise personne.
 *
 * LA CAUSE : une adresse de LOCATAIRE porte aussi la clé de son bailleur (`proprietaire_cle`), parce que la
 * reconnaissance dit tout ce qu'elle sait. Lire cette colonne sans regarder `partie` faisait du bailleur un
 * expéditeur à chaque fois qu'un locataire écrivait.
 *
 * ⚠️ LA REQUÊTE EST ÉPROUVÉE SUR SON SOURCE, et non en l'exécutant : ce qu'on veut garantir est qu'elle REGARDE
 * `partie`. Une exécution sur une base doublée prouverait que notre double se comporte comme on l'a écrit, ce qui
 * n'apprend rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 l’expéditeur est reconnu par sa PARTIE, jamais par la clé qu’il traîne', () => {
  const code = readFileSync('app/lib/gestion/ficheRattachementRepo.ts', 'utf8');

  it('la requête des expéditeurs lit la colonne `partie`', () => {
    const sql = code.replace(/\s+/g, ' ');
    expect(sql).toContain("a.role = 'expediteur'");
    expect(sql).toContain('a.partie');
    expect(sql).toContain('a.partie IS NOT NULL');
  });

  it('et le tri des expéditeurs sépare bien les deux rôles', () => {
    expect(code).toContain("e.partie === 'proprietaire'");
    expect(code).toContain("e.partie === 'locataire'");
  });

  /**
   * 🔴 LA CONSÉQUENCE VISIBLE, éprouvée sur le module PUR : quand la locataire est la seule expéditrice, c'est
   * SON bloc qui passe devant. C'est la demande d'Arno, mot pour mot.
   */
  it('🔴 la locataire expéditrice passe devant sa bailleresse', () => {
    const l = ordonnerPersonnes([
      personne({ role: 'proprietaire', cle: 'P1', nom: 'DELAHAYE Karene', expediteur: false }),
      personne({ role: 'locataire', cle: 'L1', nom: 'LEWINTRE Valentine', expediteur: true }),
    ]);
    expect(l.map((p) => p.nom)).toEqual(['LEWINTRE Valentine', 'DELAHAYE Karene']);
    expect(l.filter((p) => p.expediteur)).toHaveLength(1);
  });
});
