import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SORTES_RATTACHEMENT_PERMISES, examinerMessage, motifSorteRefusee, sortePermise,
} from './rattachement';
import { proposerBiens, type AdresseVue, type BienConnu } from './propositionsBien';
import type { AdresseEchange } from './propositionTri';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT FICHE-RATTACHEMENT — « AUCUNE VOIE NE PEUT PLUS CRÉER UN LIEN PROPRIÉTAIRE OU LOCATAIRE DIRECT ».
 *
 * CE QUI S'EST PASSÉ, ET QUI EXPLIQUE LA FORME DE CE FICHIER. Le 28/09/2026 à 14h26, la règle a changé : la cible
 * d'un classement est TOUJOURS un bien. Le code a suivi le jour même. Et pourtant, le soir, le mail « modification
 * adresse mail » d'Isabelle MENN (19h41) portait « PROPRIÉTAIRE BALIABINE épouse MENN Isabelle (234) ».
 *
 * La cause n'était pas dans le code : le processus de relève continue tournait depuis le 27/09 à 16h41 et exécutait
 * l'ANCIEN moteur, chargé en mémoire avant la conversion. 17 liens « propriétaire » sont nés entre 15h23 et 23h11.
 *
 * 🔴 D'OÙ TROIS NIVEAUX DE PREUVE, ET IL LES FAUT TOUS LES TROIS :
 *   ① LE MOTEUR ne PEUT PAS émettre autre chose qu'un lot — éprouvé sur des entrées qui, hier, donnaient une
 *      personne ;
 *   ② CHAQUE PORTE D'ÉCRITURE refuse ce qui n'est pas permis — éprouvé sur la fonction, et LU dans le source des
 *      routes, parce qu'une porte qu'on oublierait de brancher ne se verrait nulle part ailleurs ;
 *   ③ LA BASE refuse aussi (migration 273) — c'est le SEUL niveau qui arrête un processus tournant depuis la
 *      veille avec l'ancien code en mémoire. Les deux premiers ne protègent que le code qu'on vient de charger.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SORTES_INTERDITES = ['proprietaire', 'locataire'] as const;

describe('🔴 ① le moteur ne peut émettre qu’un LOT', () => {
  const bien = (p: Partial<BienConnu>): BienConnu => ({
    cle: '100', numero: '100', adresse: '4 rue Fictive', commune: 'PUTEAUX',
    proprietaireCle: 'P1', proprietaireNom: 'DUPONT Jean', ...p,
  });
  const adr = (p: Partial<AdresseVue>): AdresseVue => ({
    adresse: 'x@fictif.fr', interne: false, partie: null, lotCle: null, proprietaireCle: null, duMail: true, ...p,
  });

  /**
   * 🔴 L'ENTRÉE EXACTE QUI PRODUISAIT LE DÉFAUT : une adresse de propriétaire, et lui seul. L'ancien moteur en
   * faisait « PROPRIÉTAIRE X ». Le nouveau en fait SON bien quand il n'en a qu'un — la règle (b).
   */
  it('une adresse de propriétaire à bien unique donne SON BIEN, en automatique', () => {
    const e = proposerBiens({
      adresses: [adr({ partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [bien({})],
    });
    expect(e.issue).toBe('automatique');
    expect(e.propositions.map((p) => p.cle)).toEqual(['100']);
    expect(e.propositions[0].cas).toBe('b');
  });

  it('une adresse de propriétaire à PLUSIEURS biens donne ses biens, à trancher, aucun pré-coché', () => {
    const e = proposerBiens({
      adresses: [adr({ partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [bien({ cle: '100', numero: '100' }), bien({ cle: '101', numero: '101', adresse: '7 rue Autre' })],
    });
    expect(e.issue).toBe('a_trancher');
    expect(e.propositions.every((p) => p.cas === 'c' && !p.preCoche)).toBe(true);
  });

  it('…sauf si l’adresse ou le n° de lot est cité : alors ce bien-là est pré-coché, et le motif le dit', () => {
    const e = proposerBiens({
      adresses: [adr({ partie: 'proprietaire', proprietaireCle: 'P1' })],
      textes: { objet: 'charges du lot 101' },
      biens: [bien({ cle: '100', numero: '100' }), bien({ cle: '101', numero: '101', adresse: '7 rue Autre' })],
    });
    const p101 = e.propositions.find((p) => p.cle === '101');
    expect(p101?.preCoche).toBe(true);
    expect(p101?.motif).toContain('lot');
    expect(e.propositions.find((p) => p.cle === '100')?.preCoche).toBe(false);
  });

  it('une adresse de LOCATAIRE donne son bien, en automatique', () => {
    const e = proposerBiens({
      adresses: [adr({ partie: 'locataire', lotCle: '100', proprietaireCle: 'P1' })],
      biens: [bien({})],
    });
    expect(e.issue).toBe('automatique');
    expect(e.propositions[0].cas).toBe('a');
  });

  /** 🔴 CAS (e) — nos adresses ne sont jamais une clé, et ne produisent donc jamais de cible. */
  it('une adresse interne ne produit AUCUNE cible', () => {
    const e = proposerBiens({
      adresses: [adr({ interne: true, partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [bien({})],
    });
    expect(e.issue).toBe('sans_candidat');
    expect(e.propositions).toEqual([]);
  });

  /**
   * 🔴🔴 LA PROPRIÉTÉ QUI COMPTE, ÉPROUVÉE SUR TOUTES LES COMBINAISONS D'ENTRÉE DU MOTEUR : quoi qu'on lui donne,
   * toute cible qui sort est un LOT. C'est la formulation exacte de la demande d'Arno, et elle se vérifie sans
   * base, sans réseau et sans écran.
   */
  it('🔴🔴 quelles que soient les entrées, TOUTE cible émise est un lot', () => {
    const biens = [bien({ cle: '100', numero: '100' }), bien({ cle: '101', numero: '101', adresse: '7 rue Autre' })];
    const parties: (AdresseVue['partie'])[] = ['locataire', 'proprietaire', null];
    const cas: AdresseEchange[] = [];   // tenu pour la signature d'`examinerMessage`, plus bas
    expect(cas).toEqual([]);

    for (const partie of parties) {
      for (const interne of [true, false]) {
        for (const lotCle of [null, '100', '999']) {
          for (const proprietaireCle of [null, 'P1', 'P9']) {
            for (const duMail of [true, false]) {
              for (const objet of ['', 'charges du lot 101', '4 rue Fictive, réparation']) {
                const e = proposerBiens({
                  adresses: [adr({ partie, interne, lotCle, proprietaireCle, duMail })],
                  textes: { objet },
                  biens,
                });
                for (const p of e.propositions) {
                  /**
                   * 🔴 LA PROPRIÉTÉ EXACTE : la clé émise est celle d'un BIEN — soit un bien du catalogue, soit le
                   * lot que l'annuaire attache à l'adresse (cas a). Elle n'est JAMAIS une clé de personne.
                   *
                   * ⚠️ POURQUOI PAS « toujours dans le catalogue » : le cas (a) fait confiance au lot porté par
                   * l'adresse (`gestion_message_adresse.lot_cle`), qui vient du même annuaire mais peut désigner
                   * un lot absent du catalogue chargé. C'est un lot quand même — et exiger davantage ferait
                   * échouer ce test sur une situation parfaitement normale, sans rien prouver de plus.
                   */
                  const clesDePersonnes = ['P1', 'P9'];
                  expect(clesDePersonnes.includes(p.cle), `cle ${p.cle}`).toBe(false);
                  expect(biens.some((b) => b.cle === p.cle) || p.cle === lotCle, `cle ${p.cle}`).toBe(true);
                }
              }
            }
          }
        }
      }
    }
  });

  /** Et à l'étage au-dessus, `examinerMessage` traduit tout en cibles : elles sont toutes des lots. */
  it('🔴🔴 `examinerMessage` ne rend que des cibles de sorte « lot »', () => {
    const adresses: AdresseEchange[] = [
      { adresse: 'bailleur@fictif.fr', messageId: 1, interne: false,
        reconnaissance: {
          partie: 'proprietaire', proprietaireCle: 'P1', locataireId: null, lotCle: null,
          motif: 'adresse d’un propriétaire',
        } },
      { adresse: 'locataire@fictif.fr', messageId: 1, interne: false,
        reconnaissance: {
          partie: 'locataire', proprietaireCle: 'P1', locataireId: 5, lotCle: '101',
          motif: 'locataire, et il occupait ce bien à la date du mail',
        } },
    ];
    const e = examinerMessage({
      messageId: 1,
      adressesEchange: adresses,
      biens: [bien({ cle: '100', numero: '100' }), bien({ cle: '101', numero: '101', adresse: '7 rue Autre' })],
    });
    const cibles = [...(e.certain ? [e.certain] : []), ...e.candidats].map((c) => c.cible);
    expect(cibles.length).toBeGreaterThan(0);
    expect(cibles.every((c) => c.sorte === 'lot')).toBe(true);
  });
});

describe('🔴 ② la liste blanche, et les portes qui s’y réfèrent', () => {
  it('elle ne contient AUCUNE personne', () => {
    expect([...SORTES_RATTACHEMENT_PERMISES].sort()).toEqual(['evenement', 'lot']);
    for (const s of SORTES_INTERDITES) expect(sortePermise(s)).toBe(false);
    expect(sortePermise('lot')).toBe(true);
    // 🔴 L'ÉVÉNEMENT RESTE PERMIS : une carte de travail n'est pas une personne.
    expect(sortePermise('evenement')).toBe(true);
  });

  /** Le refus DIT QUOI FAIRE À LA PLACE : un refus qui interdit sans proposer laisse devant un écran bloqué. */
  it('le motif du refus nomme le geste juste', () => {
    for (const s of SORTES_INTERDITES) {
      expect(motifSorteRefusee(s)).toContain('toujours un BIEN');
      expect(motifSorteRefusee(s)).toContain('logement');
    }
    expect(motifSorteRefusee('proprietaire')).toContain('propriétaire');
    expect(motifSorteRefusee('locataire')).toContain('locataire');
  });

  /**
   * ⚠️ GARANTIE STATIQUE — aucune exécution ne peut la donner : il s'agit de prouver qu'il n'existe pas AILLEURS
   * une seconde liste, recopiée, qui dirait autre chose. C'est exactement ce qui était arrivé : la route des
   * rattachements portait sa propre liste avec `proprietaire` dedans, et c'était elle qui commandait.
   */
  const source = (chemin: string): string => readFileSync(chemin, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  const PORTES = [
    'app/(admin)/api/admin/gestion/rattachements/route.ts',
    'app/(admin)/api/admin/gestion/envois/route.ts',
  ];

  it('🔴🔴 aucune porte d’écriture ne recopie une liste de sortes avec une personne dedans', () => {
    for (const chemin of [...PORTES, 'app/lib/gestion/rattachementRepo.ts', 'app/lib/gestion/redaction.ts']) {
      const code = source(chemin);
      for (const s of SORTES_INTERDITES) {
        // Une liste littérale qui contiendrait la sorte : `'proprietaire',` ou `'locataire']`.
        expect(code, `${chemin} / ${s}`).not.toMatch(new RegExp(`\\['[^\\]]*'${s}'`));
        expect(code, `${chemin} / ${s}`).not.toMatch(new RegExp(`'${s}',\\s*'`));
      }
    }
  });

  it('les deux portes lisent la liste du module PUR, et ne l’écrivent pas elles-mêmes', () => {
    for (const chemin of PORTES) {
      expect(source(chemin), chemin).toContain('SORTES_RATTACHEMENT_PERMISES');
    }
  });

  /**
   * 🔴 LES DEUX SEULES FONCTIONS QUI INSÈRENT dans `gestion_rattachement` interrogent la liste AVANT d'écrire.
   * On compte les `INSERT` et les appels au garde : s'il apparaît un troisième chemin d'insertion sans garde,
   * ce test le dit.
   */
  it('🔴🔴 chaque INSERT de rattachement est précédé d’un appel à `sortePermise`', () => {
    const code = source('app/lib/gestion/rattachementRepo.ts');
    const inserts = code.match(/INSERT INTO gestion_rattachement\b(?!_)/g) ?? [];
    expect(inserts).toHaveLength(2);           // `ecrireLienMoteur` (moteur) et `rattacher` (geste manuel)
    expect((code.match(/sortePermise\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * 🔴 ③ LE NIVEAU QUI ARRÊTE UN PROCESSUS ANCIEN. La migration 273 pose une contrainte de base. C'est le seul garde
 * qui vaille contre ce qui s'est réellement passé : un démon qui tourne depuis la veille avec l'autre règle en
 * mémoire. On vérifie ici que la migration DIT bien cela — on ne peut pas l'exécuter dans un test unitaire.
 */
describe('🔴 ③ la contrainte de base (migration 273)', () => {
  const sql = readFileSync('db/migrations/273_gestion_rattachement_cible_bien.sql', 'utf8');

  it('elle interdit les sortes « personne » sur un lien VIVANT, et laisse l’histoire intacte', () => {
    expect(sql).toContain('gestion_rattachement_cible_bien_chk');
    expect(sql).toMatch(/cible_sorte\s+IN\s*\('lot',\s*'evenement'\)/);
    // Les lignes RETIRÉES ou REJETÉES restent permises : on n'efface pas le passé, on cesse d'en écrire.
    expect(sql).toMatch(/statut\s+IN\s*\('rejete',\s*'retire'\)/);
  });

  it('elle est livrée NON APPLIQUÉE, et le dit', () => {
    expect(sql).toContain('NON APPLIQUÉE');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE GESTE MANUEL LUI-MÊME REFUSE, ET N'ÉCRIT PAS UNE LIGNE.
 *
 * C'est le dernier chemin possible — celui où un humain désigne explicitement une cible. On l'éprouve ici sur la
 * VRAIE fonction, avec la base doublée : ce qui compte n'est pas seulement le refus rendu, c'est qu'AUCUNE requête
 * d'écriture ne parte. Un refus poli après un INSERT ne serait pas un refus (piège `withTransaction`, déjà mesuré
 * dans ce dépôt : la transaction valide au retour normal).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 « rattacher » — le geste manuel refuse une personne, sans rien écrire', () => {
  it('refuse propriétaire et locataire, et n’émet AUCUNE requête', async () => {
    vi.resetModules();
    const queryMock = vi.fn();
    const txMock = vi.fn();
    vi.doMock('../db/client', () => ({
      query: (...a: unknown[]) => queryMock(...a),
      withTransaction: (...a: unknown[]) => txMock(...a),
    }));
    vi.doMock('./schema', () => ({
      rattachementsDisponibles: async () => true,
      annuaireDisponible: async () => true,
      libelleSourceContactDisponible: async () => true,
      miniaturesDisponibles: async () => false,
      horsGestionDisponible: async () => false,
    }));
    vi.doMock('./horsGestionRepo', () => ({ leverHorsGestionApresRattachement: async () => {} }));

    const { rattacher } = await import('./rattachementRepo');
    const auteur = { id: 1, libelle: 'essai' };

    for (const sorte of SORTES_INTERDITES) {
      const issue = await rattacher({ messageId: 1, cible: { sorte, cle: '234', id: null }, auteur });
      expect(issue.ok, sorte).toBe(false);
      if (!issue.ok) expect(issue.motif).toContain('toujours un BIEN');
    }

    // 🔴 LA PREUVE QUI COMPTE : rien n'est parti vers la base, ni lecture de libellé, ni transaction.
    expect(queryMock).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
    vi.doUnmock('../db/client');
    vi.doUnmock('./schema');
    vi.doUnmock('./horsGestionRepo');
    vi.resetModules();
  });
});
