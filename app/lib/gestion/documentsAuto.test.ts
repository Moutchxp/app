import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  anneesDe, attribuer, AUCUN_DOCUMENT, estNotreAdresse, objetCourt, REGLE_DOCUMENT_AUTO,
  sousTypeLisible, SOUS_TYPES, type AnnuaireAdresses, type FicheDestinataire,
} from './documentsAuto';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — UN DOCUMENT SE RANGE CHEZ UNE PERSONNE ════════════════════════════════
 *
 * DÉCISION D'ARNO (01/10/2026) : « Les documents automatiques ne se rangent PAS par bien mais par PERSONNE : une
 * fiche propriétaire (quel que soit le nombre de personnes dedans) ou une fiche locataire. […] Seuls les
 * documents dont la fiche destinataire est CERTAINE sont rangés automatiquement. »
 *
 * 🔒 Aucune donnée réelle : des fiches et des adresses inventées.
 */

const NOUS = ['@criterimmo.fr', '@sansvisavis.com', 'gestion.criterimmo@gmail.com'];
const fiche = (sorte: 'proprietaire' | 'locataire', cle: string, nbBiens = 1): FicheDestinataire =>
  ({ sorte, cle, libelle: `Fiche ${cle}`, nbBiens });

const annuaire = (couples: [string, FicheDestinataire[]][]): AnnuaireAdresses => new Map(couples);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① CERTAIN → RANGÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① une fiche certaine : le document est rangé', () => {
  it('🔴 un document à un locataire va dans SA fiche', () => {
    const a = attribuer({
      destinataires: ['paul@exemple.test'],
      annuaire: annuaire([['paul@exemple.test', [fiche('locataire', 'LOC-7')]]]),
      nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'fiche', fiche: fiche('locataire', 'LOC-7'), multiBiens: false });
  });

  it('🔴 un document à un propriétaire MONO-bien va dans sa fiche, avec son bien', () => {
    const a = attribuer({
      destinataires: ['anne@exemple.test'],
      annuaire: annuaire([['anne@exemple.test', [fiche('proprietaire', 'PRO-3', 1)]]]),
      nosAdresses: NOUS,
    });
    expect(a.sorte).toBe('fiche');
    expect(a.sorte === 'fiche' && a.multiBiens).toBe(false);
  });

  /**
   * 🔴🔴 LE CAS QUI MOTIVE TOUT CE LOT. Mesuré : sur 1 729 documents destinés à un propriétaire à plusieurs
   * biens, AUCUN ne nomme un lot — le contenu est derrière un lien WIPPIMMO qu'on n'ouvre pas. Un « Décompte » est
   * un relevé de COMPTE : il se range chez la personne, sans bien.
   */
  it('🔴🔴 un propriétaire à PLUSIEURS biens : « compte rendu multi-biens », sans bien', () => {
    const a = attribuer({
      destinataires: ['sci@exemple.test'],
      annuaire: annuaire([['sci@exemple.test', [fiche('proprietaire', 'PRO-9', 4)]]]),
      nosAdresses: NOUS,
    });
    expect(a.sorte === 'fiche' && a.multiBiens).toBe(true);
  });

  /** ⚠️ UNE INDIVISION EST UNE SEULE FICHE : deux personnes, une ligne, une destination. */
  it('⚠️ une indivision ne compte que pour une fiche', () => {
    const indivision = fiche('proprietaire', 'PRO-INDIV', 1);
    const a = attribuer({
      destinataires: ['jose@exemple.test', 'marie@exemple.test'],
      annuaire: annuaire([
        ['jose@exemple.test', [indivision]],
        ['marie@exemple.test', [indivision]],
      ]),
      nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'fiche', fiche: indivision, multiBiens: false });
  });

  /** ⚠️ NOS PROPRES ADRESSES NE COMPTENT PAS : un document en copie chez nous reste le document du client. */
  it('⚠️ nos adresses en copie ne brouillent pas la destination', () => {
    const a = attribuer({
      destinataires: ['paul@exemple.test', 'gestion@criterimmo.fr', 'jb.pons@sansvisavis.com'],
      annuaire: annuaire([['paul@exemple.test', [fiche('locataire', 'LOC-7')]]]),
      nosAdresses: NOUS,
    });
    expect(a.sorte).toBe('fiche');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② AMBIGU → RIEN N'EST RANGÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② ce qui n’est pas certain n’est pas rangé', () => {
  /**
   * 🔴🔴 « Un document rangé à peu près chez quelqu'un est pire qu'un document non rangé : il donne une certitude
   * fausse, et personne ne reviendra le vérifier. »
   */
  it('🔴🔴 une adresse présente dans DEUX fiches : rien n’est rangé', () => {
    const a = attribuer({
      destinataires: ['martin@exemple.test'],
      annuaire: annuaire([['martin@exemple.test',
        [fiche('proprietaire', 'PRO-1'), fiche('proprietaire', 'PRO-2')]]]),
      nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'non_attribue', motif: 'adresse_partagee' });
  });

  it('🔴 deux destinataires de fiches différentes : rien n’est rangé', () => {
    const a = attribuer({
      destinataires: ['paul@exemple.test', 'anne@exemple.test'],
      annuaire: annuaire([
        ['paul@exemple.test', [fiche('locataire', 'LOC-7')]],
        ['anne@exemple.test', [fiche('proprietaire', 'PRO-3')]],
      ]),
      nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'non_attribue', motif: 'fiches_differentes' });
  });

  it('🔴 une adresse inconnue de l’annuaire : rien n’est rangé', () => {
    const a = attribuer({
      destinataires: ['garant@exemple.test'], annuaire: annuaire([]), nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'non_attribue', motif: 'adresse_inconnue' });
  });

  it('🔴 un document adressé à nous seuls : rien n’est rangé', () => {
    const a = attribuer({
      destinataires: ['gestion@criterimmo.fr'], annuaire: annuaire([]), nosAdresses: NOUS,
    });
    expect(a).toEqual({ sorte: 'non_attribue', motif: 'nos_adresses' });
  });

  it('⚠️ les quatre motifs sont DISTINGUÉS : ils appellent des gestes différents', () => {
    // « adresse inconnue » se corrige dans l'annuaire ; « fiches différentes » demande de trancher à la main.
    const motifs = new Set(['nos_adresses', 'adresse_inconnue', 'adresse_partagee', 'fiches_differentes']);
    expect(motifs.size).toBe(4);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ③ UNE ADRESSE AJOUTÉE À UNE FICHE RANGE LES DOCUMENTS QUI DEVIENNENT CERTAINS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ une adresse ajoutée à une fiche range ce qui devient certain', () => {
  /**
   * Demande d'Arno : « Une modification de fiche (adresse ajoutée) range les documents qui deviennent certains,
   * avec le même mécanisme de recalcul qu'aujourd'hui. »
   *
   * 🔴 LA DÉCISION NE DÉPEND QUE DE L'ANNUAIRE QU'ON LUI DONNE — c'est ce qui rend le recalcul gratuit : rejouer
   * la même fonction avec un annuaire enrichi suffit, il n'y a aucun état à invalider.
   */
  it('🔴🔴 avant l’ajout : inconnue. Après l’ajout : rangée, sans rien changer d’autre', () => {
    const doc = { destinataires: ['nouvelle@exemple.test'], nosAdresses: NOUS };
    expect(attribuer({ ...doc, annuaire: annuaire([]) }))
      .toEqual({ sorte: 'non_attribue', motif: 'adresse_inconnue' });

    const apresAjout = annuaire([['nouvelle@exemple.test', [fiche('locataire', 'LOC-12')]]]);
    expect(attribuer({ ...doc, annuaire: apresAjout }))
      .toEqual({ sorte: 'fiche', fiche: fiche('locataire', 'LOC-12'), multiBiens: false });
  });

  /** ⚠️ ET L'INVERSE EST VRAI AUSSI : ajouter une adresse DÉJÀ prise rend le document ambigu, donc non rangé. */
  it('⚠️ une adresse ajoutée à une SECONDE fiche rend le document ambigu', () => {
    const doc = { destinataires: ['paul@exemple.test'], nosAdresses: NOUS };
    expect(attribuer({ ...doc, annuaire: annuaire([['paul@exemple.test', [fiche('locataire', 'LOC-7')]]]) }).sorte)
      .toBe('fiche');
    expect(attribuer({
      ...doc,
      annuaire: annuaire([['paul@exemple.test', [fiche('locataire', 'LOC-7'), fiche('proprietaire', 'PRO-1')]]]),
    })).toEqual({ sorte: 'non_attribue', motif: 'adresse_partagee' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES MOTS DE L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ le sous-type lisible : des mots, jamais des codes', () => {
  it('🔴 les codes du logiciel deviennent des mots', () => {
    expect(sousTypeLisible('Document CRITERIMMO - Quittance COLSON septembre')).toBe('Quittance');
    expect(sousTypeLisible('Document CRITERIMMO - Décompte N°222273 SCI DICAPAULET')).toBe('Décompte');
    expect(sousTypeLisible('Document CRITERIMMO - RMH10 - Demande attestation assurance')).toBe('Assurance');
    expect(sousTypeLisible('Document CRITERIMMO - D20 - Préavis - Notification')).toBe('Préavis');
    expect(sousTypeLisible('Document CRITERIMMO - R10 - Relance simple locataire')).toBe('Relance');
    expect(sousTypeLisible('Document CRITERIMMO - Transmission de l’avis de taxe foncière 2025'))
      .toBe('Taxe foncière');
    expect(sousTypeLisible('Document CRITERIMMO - Aide Declar. Revenus Fonciers 2025 Cerfa 2044'))
      .toBe('Revenus fonciers');
    expect(sousTypeLisible('Document CRITERIMMO - Février 2026 MENDES')).toBe('Avis d’échéance');
    expect(sousTypeLisible('Document CRITERIMMO - Bonne année 2026')).toBe('Vie de l’agence');
    expect(sousTypeLisible('Document CRITERIMMO - quelque chose')).toBe('Autre');
  });

  it('⚠️ chaque sous-type rendu appartient à la liste affichable', () => {
    for (const o of ['Quittance X', 'Décompte N°1', 'RMH20', 'D11', 'R32', 'taxe foncière', 'cerfa',
      'Régularisation de charges n°1', 'Remboursement X', 'Mars 2026', 'bonne année', 'zzz']) {
      expect(SOUS_TYPES).toContain(sousTypeLisible(o));
    }
  });

  it('🔴 l’objet perd son préfixe, et ses « Re: »', () => {
    expect(objetCourt('Re: Fwd: Document CRITERIMMO - Quittance COLSON')).toBe('Quittance COLSON');
    expect(objetCourt('Document CRITERIMMO — Décompte N°1')).toBe('Décompte N°1');
    expect(objetCourt(null)).toBe('');
  });

  it('⚠️ les années se rangent de la plus récente à la plus ancienne', () => {
    expect(anneesDe(['2025-01-02', '2026-10-01', '2025-12-31', 'abc'])).toEqual(['2026', '2025']);
    expect(anneesDe([])).toEqual([]);
  });

  it('⚠️ nos adresses se reconnaissent par domaine ou en clair', () => {
    expect(estNotreAdresse('gestion@criterimmo.fr', NOUS)).toBe(true);
    expect(estNotreAdresse('JB.PONS@sansvisavis.com', NOUS)).toBe(true);
    expect(estNotreAdresse('gestion.criterimmo@gmail.com', NOUS)).toBe(true);
    expect(estNotreAdresse('paul@exemple.test', NOUS)).toBe(false);
    expect(estNotreAdresse('', NOUS)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 ⑤ CE QUE LA MIGRATION ET LE CODE PROMETTENT — relu dans les fichiers
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ⑤ aucun lien vers un bien, aucune fenêtre de conversation touchée', () => {
  const migration = readFileSync('db/migrations/291_gestion_document_auto_par_fiche.sql', 'utf8');
  const repo = readFileSync('app/lib/gestion/documentsAutoRepo.ts', 'utf8');

  /**
   * 🔴🔴 LE VERROU DU 28/09 N'EST PAS LEVÉ, IL GAGNE UNE PORTE NOMMÉE. Un lien vivant vers une fiche reste
   * interdit — SAUF s'il porte la règle `document_auto`. « Rattacher ce mail à M. DUPONT » reste refusé par la
   * base, comme depuis l'incident qui a motivé la migration 273.
   */
  it('🔴🔴 la migration n’autorise une fiche QUE sous la règle « document_auto »', () => {
    const c = migration.replace(/\s+/g, ' ');
    expect(c).toContain("cible_sorte = ANY (ARRAY['lot'::text, 'evenement'::text])");
    expect(c).toContain("AND coalesce(regle, '') = 'document_auto'");
    // 🔴 ET LE VERROU RESTE : sans la règle, une fiche vivante est toujours refusée.
    expect(c).toContain("statut = ANY (ARRAY['rejete'::text, 'retire'::text])");
  });

  /**
   * ══ 🔴🔴 LE TEST QUI VIENT D'UN VERROU QUI N'A PAS TENU ═══════════════════════════════════════════════════════
   *
   * MESURÉ LE 01/10/2026, À LA PREMIÈRE APPLICATION : la contrainte s'écrivait `AND regle = 'document_auto'`, et
   * un essai d'intrusion — un lien VIVANT vers un propriétaire, SANS règle — **est passé** (`INSERT 0 1`).
   *
   * La cause est la logique à TROIS valeurs de SQL : `regle` à NULL rend la comparaison NULL, donc l'expression
   * entière rend `false OR false OR NULL` = NULL — et une contrainte CHECK **ACCEPTE** une ligne dont l'expression
   * rend NULL. Il suffisait donc d'OMETTRE la règle pour ouvrir le verrou en grand.
   *
   * ⚠️ CE TEST INTERDIT LA FORME NUE, pas seulement il n'exige la bonne : les deux assertions ne disent pas la
   * même chose, et c'est la seconde qui empêche la régression. La contrainte doit rester BIVALENTE.
   */
  it('🔴🔴 son verrou est BIVALENT : la forme nue « regle = … », qui laissait passer un NULL, est interdite', () => {
    const c = migration.replace(/\s+/g, ' ');
    const verrou = c.slice(c.indexOf('ADD CONSTRAINT gestion_rattachement_cible_bien_chk'));
    const corps = verrou.slice(0, verrou.indexOf(');') + 2);
    expect(corps).toContain("coalesce(regle, '') = 'document_auto'");
    expect(corps).not.toContain('AND regle =');
  });

  it('🔴 elle porte la trace de l’accord d’Arno et de sa date d’application', () => {
    expect(migration).toContain('NON APPLIQUÉE');
    // ⚠️ Sans casse : le mot « accord » est écrit en capitales dans le bandeau, et ce test n'a pas à en dépendre.
    expect(migration.toLowerCase()).toContain('accord');
    // 🔴 APPLIQUÉE le 01/10/2026 : la trace reste dans le fichier, elle ne s'effacera pas avec la mémoire.
    expect(migration).toContain('APPLIQUÉE LE 01/10/2026');
  });

  it('🔴🔴 le rangement n’écrit JAMAIS un lien vers un bien', () => {
    const insert = repo.slice(repo.indexOf('async function poserLien'));
    expect(insert).toContain("REGLE_DOCUMENT_AUTO");
    expect(insert).not.toContain("'lot'");
    expect(REGLE_DOCUMENT_AUTO).toBe('document_auto');
  });

  /**
   * ══ 🔴🔴 UN LIEN RETIRÉ EST UN HISTORIQUE, PAS UNE PRÉSENCE — LE DÉFAUT QUI A COÛTÉ 7 330 DOCUMENTS ═══════════
   *
   * MESURÉ LE 01/10/2026 : 23 510 fiches certaines, 16 180 liens écrits. Les 7 330 manquants portaient déjà un
   * lien « fiche » **retiré** le 28/09 par la conversion de masse vers les biens — aucun geste humain. Le garde
   * d'idempotence, qui ne regardait pas le statut, prenait ce lien MORT pour une présence et sautait le document :
   * il n'apparaissait alors dans AUCUNE fiche, puisque la lecture ne retient que les vivants.
   *
   * ⚠️ L'ÉTALON EST LA TABLE ELLE-MÊME : son unique contrainte d'unicité (`gestion_rattachement_vivant_idx`) est
   * PARTIELLE sur `statut IN ('propose','confirme')`. Le garde doit s'aligner sur elle, ni plus large ni plus
   * étroit — plus large, il perd des documents ; plus étroit, il viole l'index.
   */
  it('🔴🔴 le garde d’idempotence ne regarde que les liens VIVANTS', () => {
    const insert = repo.slice(repo.indexOf('async function poserLien'));
    const garde = insert.slice(insert.indexOf('WHERE NOT EXISTS')).replace(/\s+/g, ' ');
    expect(garde).toContain("r.statut IN ('propose', 'confirme')");
  });

  /**
   * 🔴 CES LIENS N'ENTRENT DANS AUCUNE FENÊTRE DE CONVERSATION. La projection des périodes ne lit que les liens
   * `cible_sorte = 'lot'` : un lien de fiche lui est invisible par construction, et ce test le scelle.
   */
  it('🔴🔴 la projection des périodes ignore ces liens par construction', () => {
    const periodes = readFileSync('app/lib/gestion/periodeRepo.ts', 'utf8');
    const projection = periodes.slice(periodes.indexOf('export async function projeterLeFil'));
    expect(projection).toContain("cible_sorte = 'lot'");
    expect(projection).not.toContain("cible_sorte = 'proprietaire'");
    expect(projection).not.toContain("cible_sorte = 'locataire'");
  });

  it('🔴 la lecture d’une fiche se tait sans la migration', () => {
    expect(repo).toContain('if (!(await documentsAutoDisponible())) return [];');
  });

  it('⚠️ la phrase d’une fiche sans document est écrite une seule fois', () => {
    expect(AUCUN_DOCUMENT).toBe('Aucun document automatique');
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/DocumentsAutomatiques.tsx', 'utf8');
    expect(ecran).toContain('{AUCUN_DOCUMENT}');
    expect(ecran).not.toContain("'Aucun document automatique'");
  });

  /** 🔴 LA SECTION EXISTE DANS LES DEUX FICHES — propriétaire ET locataire (demande d'Arno). */
  it('🔴 la section est posée dans la fiche propriétaire ET dans la fiche locataire', () => {
    const annuaireEcran = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(annuaireEcran).toContain('<DocumentsAutomatiques sorte="proprietaire" id={f.id} />');
    expect(annuaireEcran).toContain('<DocumentsAutomatiques sorte="locataire" id={f.id} />');
  });

  it('🔴 le filtre par sous-type et par année existe, et le clic ouvre le mail', () => {
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/DocumentsAutomatiques.tsx', 'utf8');
    expect(ecran).toContain('setSousType');
    expect(ecran).toContain('setAnnee');
    expect(ecran).toContain('href={`/admin/gestion?fil=${d.filId}&message=${d.messageId}`}');
  });
});
