import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cibleCourte, cibleEvenement, cibleLot, cibleProprietaire,
  estVivant, examinerMessage, libelleIssue, memeCible, statutInverse, adressesUtiles,
  STATUTS_VIVANTS, type Statut,
} from './rattachement';
import type { BienConnu } from './propositionsBien';
import type { AdresseEchange } from './propositionTri';
import type { Reconnaissance } from './adressesMessage';
import { lireOptions, partFr } from '../../scripts/proposer-rattachements';

/**
 * LOT RATTACHEMENT-1 — LE MOTEUR, ÉPROUVÉ SANS BASE NI RÉSEAU.
 *
 * 🔴 CE QU'AUCUN TEST NE FERA ICI : toucher la base, Gmail ou le Drive. La preuve que PostgreSQL tient ce qu'on lui
 * demande — multi-liens, héritage des pièces, retrait réversible et journalisé, idempotence — se fait sur un CLUSTER
 * JETABLE (`npm run gestion:rattachement:epreuve`), parce que c'est la base qui la tient, pas nous.
 *
 * 🔒 Aucune donnée réelle : adresses en @fictif.fr, clés de lot inventées.
 */

const RIEN: Reconnaissance = {
  partie: null, proprietaireCle: null, locataireId: null, lotCle: null, motif: 'adresse inconnue de l’annuaire',
};

/** Un locataire reconnu, occupant `lot` (du propriétaire `prop`) à la date du mail. */
const locataire = (lot: string | null, prop: string | null): Reconnaissance => ({
  partie: 'locataire', proprietaireCle: prop, locataireId: 1, lotCle: lot, motif: 'locataire à la date du mail',
});

const proprietaire = (prop: string): Reconnaissance => ({
  partie: 'proprietaire', proprietaireCle: prop, locataireId: null, lotCle: null, motif: 'adresse d’un propriétaire',
});

const adr = (
  adresse: string, messageId: number, reconnaissance: Reconnaissance, interne = false,
): AdresseEchange => ({ adresse, messageId, interne, reconnaissance });

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — LE CATALOGUE DES BIENS, désormais indispensable au moteur : c'est lui, et lui
 * seul, qui dit si un propriétaire n'a qu'UN bien (cas b, automatique) ou plusieurs (cas c, à trancher).
 * Ici : 339 n'a qu'un bien (495) ; 800 en a trois (700, 701, 702) ; 700 est un bailleur sans aucun bien listé.
 */
const bien = (cle: string, prop: string, adresse: string): BienConnu => ({
  cle, numero: cle, adresse, commune: 'Ville-Fictive', proprietaireCle: prop, proprietaireNom: `Bailleur ${prop}`,
});
const BIENS: BienConnu[] = [
  bien('495', '339', '4 rue Fictive'),
  bien('700', '800', '10 rue Imaginaire'),
  bien('701', '800', '12 rue Imaginaire'),
  bien('702', '800', '14 rue Imaginaire'),
  bien('496', '900', '6 rue Fictive'),
];

describe('les cibles, écrites et comparées', () => {
  it('une cible se dit en une ligne, sans ambiguïté entre les trois sortes', () => {
    expect(cibleCourte(cibleLot('495'))).toBe('lot:495');
    expect(cibleCourte(cibleProprietaire('339'))).toBe('proprio:339');
    expect(cibleCourte(cibleEvenement(12))).toBe('carte:12');
  });

  it('🔴 un LOT et un PROPRIÉTAIRE de même clé ne sont PAS la même cible', () => {
    expect(memeCible(cibleLot('7'), cibleProprietaire('7'))).toBe(false);
    expect(cibleCourte(cibleLot('7'))).not.toBe(cibleCourte(cibleProprietaire('7')));
  });

  it('la même cible se reconnaît', () => {
    expect(memeCible(cibleLot('495'), cibleLot('495'))).toBe(true);
    expect(memeCible(cibleEvenement(3), cibleEvenement(3))).toBe(true);
    expect(memeCible(cibleEvenement(3), cibleEvenement(4))).toBe(false);
  });
});

describe('🔴 nos adresses ne servent JAMAIS de clé', () => {
  it('une adresse interne est écartée, même reconnue par l’annuaire', () => {
    const a = [adr('gestion@criterimmo.fr', 1, proprietaire('339'), true)];
    expect(adressesUtiles(a)).toHaveLength(0);
    // 🔴 Et le moteur n'en tire RIEN : nos adresses sont des deux côtés de presque tous les mails.
    expect(examinerMessage({ messageId: 1, adressesEchange: a, biens: BIENS }).issue).toBe('sans_candidat');
  });

  it('un mail où NOUS sommes la seule partie reconnue n’a aucun candidat', () => {
    const e = examinerMessage({
      messageId: 1,
      biens: BIENS,
      adressesEchange: [
        adr('gestion@criterimmo.fr', 1, proprietaire('339'), true),
        adr('compta@partenaire.fr', 1, locataire('495', '339'), true),
        adr('inconnu@fictif.fr', 1, RIEN),
      ],
    });
    expect(e.issue).toBe('sans_candidat');
    expect(e.adressesUtiles).toBe(0);
  });
});

describe('une seule cible certaine ⇒ rattachement automatique', () => {
  it('un locataire qui écrit depuis son logement : le LOT, règle a, confiance haute', () => {
    const e = examinerMessage({
      messageId: 10,
      biens: BIENS,
      adressesEchange: [
        adr('gestion@criterimmo.fr', 10, RIEN, true),
        adr('loc@fictif.fr', 10, locataire('495', '339')),
      ],
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('495'));
    expect(e.certain?.regle).toBe('a');
    expect(e.certain?.confiance).toBe('haute');
    expect(e.certain?.adresses).toEqual(['loc@fictif.fr']);
    expect(e.candidats).toHaveLength(0);
  });

  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — LE CAS (b) D'ARNO. Un bailleur qui écrit pour lui-même ne donne plus la cible
   * « propriétaire 339 » : il donne SON BIEN, parce qu'il n'en a qu'un. Même certitude, bon vocabulaire — et c'est
   * un dossier, là où une personne n'en était pas un.
   */
  it('(b) un bailleur qui n’a QU’UN bien : ce BIEN, jamais le propriétaire', () => {
    const e = examinerMessage({
      messageId: 11, biens: BIENS,
      adressesEchange: [adr('prop@fictif.fr', 11, proprietaire('339'))],
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('495'));
    expect(e.certain?.motif).toContain('n’a qu’un bien en gestion');
  });

  it('🔴 (c) un bailleur qui a PLUSIEURS biens ne donne AUCUN lien automatique', () => {
    const e = examinerMessage({
      messageId: 14, biens: BIENS,
      adressesEchange: [adr('gros@fictif.fr', 14, proprietaire('800'))],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => cibleCourte(c.cible))).toEqual(['lot:700', 'lot:701', 'lot:702']);
    // 🔴 Et AUCUNE cible n'est un propriétaire : c'est toute la règle de ce lot.
    expect(e.candidats.every((c) => c.cible.sorte === 'lot')).toBe(true);
  });

  it('le locataire ET son bailleur dans le même mail : UN SEUL logement, donc certain', () => {
    const e = examinerMessage({
      messageId: 12,
      biens: BIENS,
      adressesEchange: [
        adr('loc@fictif.fr', 12, locataire('495', '339')),
        adr('prop@fictif.fr', 12, proprietaire('339')),
      ],
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('495'));
    // Les deux adresses ont fondé le lien — mais seule celle qui désigne le LOT est citée pour ce lot.
    expect(e.certain?.adresses).toEqual(['loc@fictif.fr']);
  });

  it('🔴 un logement ET un bailleur ÉTRANGER : deux dossiers, donc AUCUNE certitude', () => {
    const e = examinerMessage({
      messageId: 13,
      biens: BIENS,
      adressesEchange: [
        adr('loc@fictif.fr', 13, locataire('495', '339')),
        // Un bailleur ÉTRANGER au logement : 900 possède le 496, qui n'a rien à voir avec le 495.
        adr('autre@fictif.fr', 13, proprietaire('900')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.certain).toBeNull();
    // Le logement du locataire ET le bien du bailleur étranger : deux dossiers, aucun choisi. Que des BIENS.
    expect(e.candidats.map((c) => cibleCourte(c.cible)).sort()).toEqual(['lot:495', 'lot:496']);
  });
});

describe('plusieurs cibles ⇒ la file de tri, et rien d’autre', () => {
  it('deux logements du MÊME bailleur : les DEUX LOGEMENTS, et rien d’autre', () => {
    const e = examinerMessage({
      messageId: 20,
      biens: BIENS,
      adressesEchange: [
        adr('a@fictif.fr', 20, locataire('495', '339')),
        adr('b@fictif.fr', 20, locataire('496', '339')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    /**
     * 🔴 LOT AFFECTATION-PAR-BIEN — LE BAILLEUR N'EST PLUS UN CANDIDAT. Il l'était « en plus, jamais à la place » ;
     * Arno a tranché : une personne n'est pas un dossier. Les deux logements sont là, tous les deux cochables.
     */
    expect(e.candidats.map((c) => cibleCourte(c.cible)).sort()).toEqual(['lot:495', 'lot:496']);
    expect(e.candidats.every((c) => c.cible.sorte === 'lot')).toBe(true);
  });

  it('deux logements de bailleurs DIFFÉRENTS : deux BIENS, aucun tranché', () => {
    const e = examinerMessage({
      messageId: 21,
      biens: BIENS,
      adressesEchange: [
        adr('a@fictif.fr', 21, locataire('495', '339')),
        adr('b@fictif.fr', 21, locataire('700', '800')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => cibleCourte(c.cible)).sort()).toEqual(['lot:495', 'lot:700']);
  });

  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — CE TEST A CHANGÉ DE SUJET, PARCE QUE LA RÈGLE A CHANGÉ. Il vérifiait qu'un
   * candidat PROPRIÉTAIRE portait une confiance moindre qu'un logement. Il n'existe plus de candidat propriétaire :
   * la cible est TOUJOURS un bien. Ce qui reste à protéger, c'est que la confiance suive la certitude du cas.
   */
  it('la confiance suit le cas : quasi certain ⇒ « haute », à trancher ⇒ « moyenne »', () => {
    const certain = examinerMessage({
      messageId: 1, biens: BIENS, adressesEchange: [adr('a@fictif.fr', 1, locataire('495', '339'))],
    });
    expect(certain.certain?.confiance).toBe('haute');

    const aTrancher = examinerMessage({
      messageId: 2, biens: BIENS, adressesEchange: [adr('b@fictif.fr', 2, proprietaire('800'))],
    });
    expect(aTrancher.issue).toBe('a_trier');
    expect(aTrancher.candidats.every((c) => c.confiance === 'moyenne')).toBe(true);
  });
});

describe('🔴 la règle b — l’échange — ne devient JAMAIS automatique', () => {
  it('le mail d’un tiers dans un fil clair donne un CANDIDAT, pas un lien', () => {
    const e = examinerMessage({
      messageId: 31,
      biens: BIENS,
      adressesEchange: [
        // Le mail 31 est celui d'un syndic : aucune de ses adresses n'est à l'annuaire.
        adr('syndic@fictif.fr', 31, RIEN),
        adr('gestion@criterimmo.fr', 31, RIEN, true),
        // Le mail 30, dans le même fil, porte le locataire — et il est unanime.
        adr('loc@fictif.fr', 30, locataire('495', '339')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.certain).toBeNull();
    /**
     * 🔴 CE QUI COMPTE ICI N'EST PAS LA LETTRE DE LA RÈGLE, C'EST QU'AUCUN LIEN NE SOIT POSÉ D'OFFICE. Le mail d'un
     * tiers ne doit jamais hériter du logement du voisin de fil — règle mesurée au lot RATTACHEMENT-1, reprise
     * telle quelle par le moteur des biens.
     */
    expect(e.candidats.length).toBeGreaterThan(0);
    expect(e.candidats.every((c) => c.cible.sorte === 'lot')).toBe(true);
    expect(e.motif).toContain('à confirmer à la main');
  });

  it('le mail du locataire, LUI, reste automatique dans le même fil', () => {
    const adresses = [
      adr('syndic@fictif.fr', 31, RIEN),
      adr('loc@fictif.fr', 30, locataire('495', '339')),
    ];
    expect(examinerMessage({ messageId: 30, adressesEchange: adresses, biens: BIENS }).issue).toBe('automatique');
    expect(examinerMessage({ messageId: 31, adressesEchange: adresses, biens: BIENS }).issue).toBe('a_trier');
  });

  it('l’échange n’est consulté QUE si le mail lui-même ne dit rien', () => {
    // Le mail 40 désigne le lot 1 ; le fil en porte un autre. Le mail gagne, sans arbitrage.
    const e = examinerMessage({
      messageId: 40,
      biens: BIENS,
      adressesEchange: [
        adr('a@fictif.fr', 40, locataire('1', '10')),
        adr('b@fictif.fr', 41, locataire('2', '20')),
      ],
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('1'));
  });
});

describe('🔴 LE LOT OCCUPÉ À LA DATE DU MAIL — pas celui d’aujourd’hui', () => {
  it('un locataire PARTI (aucun bail à la date) est reconnu mais ne désigne RIEN', () => {
    // C'est ce que `reconnaitre` rend dans ce cas : partie renseignée, lotCle nul.
    const parti: Reconnaissance = {
      partie: 'locataire', proprietaireCle: null, locataireId: 7, lotCle: null,
      motif: 'locataire, mais aucun bail en cours à la date du mail',
    };
    const e = examinerMessage({ messageId: 50, biens: BIENS,
      adressesEchange: [adr('parti@fictif.fr', 50, parti)] });
    expect(e.issue).toBe('sans_candidat');
    // 🔴 ET LE MOTIF NE MENT PAS : il dit qu'une adresse EST reconnue. Le premier rapport annonçait
    //   « aucune adresse connue » en ayant lui-même compté 1 reconnue — contradiction corrigée le 26/09/2026.
    expect(e.adressesUtiles).toBe(1);
    expect(e.motif).toContain('1 adresse(s) reconnue(s)');
    expect(e.motif).not.toContain('aucune adresse de l’échange');
  });

  it('le même locataire, à une date où son bail courait, désigne son logement', () => {
    const e = examinerMessage({ messageId: 51, biens: BIENS,
      adressesEchange: [adr('parti@fictif.fr', 51, locataire('495', '339'))] });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('495'));
  });

  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — CE CAS A CHANGÉ DE RÉPONSE, ET C'EST UNE AMÉLIORATION. Le moteur posait un lien
   * certain sur le BAILLEUR (« le plus précis dont on soit sûr »). Il propose désormais ses BIENS : c'est plus
   * précis encore, et surtout c'est rangeable — un propriétaire n'est pas un dossier.
   */
  it('un locataire de DEUX logements à la même date ne tranche pas : les biens du bailleur sont proposés', () => {
    const deuxLots: Reconnaissance = {
      partie: 'locataire', proprietaireCle: '800', locataireId: 9, lotCle: null,
      motif: 'locataire de 2 biens à cette date — aucun lot n’est tranché',
    };
    const e = examinerMessage({ messageId: 52, biens: BIENS,
      adressesEchange: [adr('deux@fictif.fr', 52, deuxLots)] });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => cibleCourte(c.cible))).toEqual(['lot:700', 'lot:701', 'lot:702']);
  });
});

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — `cibleCertaine`, `vueDesAdresses` et `candidatsDeLaVue` ONT ÉTÉ RETIRÉES du moteur.
 * Elles portaient la règle abandonnée : proposer un PROPRIÉTAIRE comme cible. Ce qu'elles protégeaient — « deux
 * logements ne donnent jamais une certitude » — est protégé ici, sur le moteur lui-même.
 */
describe('la certitude, prise isolément', () => {
  it('aucune adresse utile ⇒ aucune certitude', () => {
    const e = examinerMessage({ messageId: 1, biens: BIENS, adressesEchange: [adr('x@fictif.fr', 1, RIEN)] });
    expect(e.certain).toBeNull();
    expect(e.issue).toBe('sans_candidat');
  });

  it('deux logements ⇒ aucune certitude, même avec un bailleur commun', () => {
    const e = examinerMessage({
      messageId: 1, biens: BIENS,
      adressesEchange: [
        adr('a@fictif.fr', 1, locataire('700', '800')),
        adr('b@fictif.fr', 1, locataire('701', '800')),
      ],
    });
    expect(e.certain).toBeNull();
    expect(e.issue).toBe('a_trier');
  });
});

describe('les statuts : rien ne disparaît, tout se défait', () => {
  it('les statuts vivants sont « proposé » et « confirmé », et eux seuls', () => {
    expect([...STATUTS_VIVANTS]).toEqual(['propose', 'confirme']);
    expect(estVivant('propose')).toBe(true);
    expect(estVivant('confirme')).toBe(true);
    expect(estVivant('rejete')).toBe(false);
    expect(estVivant('retire')).toBe(false);
  });

  it('🔴 chaque geste a son inverse — sauf « proposé », qui n’a rien à défaire', () => {
    expect(statutInverse('confirme')).toBe('retire');
    expect(statutInverse('retire')).toBe('confirme');
    expect(statutInverse('rejete')).toBe('propose');
    expect(statutInverse('propose')).toBeNull();
  });

  it('🔴 confirmer et retirer sont exactement réciproques : on peut faire et défaire sans fin', () => {
    for (const s of ['confirme', 'retire'] as const) {
      const i = statutInverse(s) as Statut;
      expect(statutInverse(i), s).toBe(s);
    }
  });

  it('« rejeté » se défait en « proposé » — mais « proposé » n’est pas un geste, donc rien à y défaire', () => {
    expect(statutInverse('rejete')).toBe('propose');
    // L'asymétrie est VOULUE : « proposé » est l'état de DÉPART que pose le moteur, pas le résultat d'un clic.
    // Prétendre le défaire obligerait à inventer un cinquième statut (« non proposé ») qui ne signifierait rien.
    expect(statutInverse('propose')).toBeNull();
  });

  it('chaque issue se dit en français', () => {
    expect(libelleIssue('automatique')).toBe('rattaché automatiquement');
    expect(libelleIssue('a_trier')).toBe('à trier');
    expect(libelleIssue('sans_candidat')).toBe('aucun candidat');
  });
});

describe('la ligne de commande', () => {
  it('sans option : SIMULATION, aucune limite, dix exemples', () => {
    expect(lireOptions([])).toEqual({
      appliquer: false, limite: null, depuis: null, recommencer: false, exemples: 10,
    });
  });

  it('🔴 « --appliquer » est la SEULE façon d’écrire, et rien qui y ressemble ne l’active', () => {
    expect(lireOptions(['--appliquer']).appliquer).toBe(true);
    for (const presque of ['--appliquez', '-appliquer', 'appliquer', '--appliquer=1', '--APPLIQUER']) {
      expect(lireOptions([presque]).appliquer, presque).toBe(false);
    }
  });

  it('les bornes numériques refusent l’absurde et gardent leur défaut', () => {
    expect(lireOptions(['--limite=50']).limite).toBe(50);
    expect(lireOptions(['--limite=zéro']).limite).toBeNull();
    expect(lireOptions(['--limite=-3']).limite).toBeNull();
    expect(lireOptions(['--exemples=0']).exemples).toBe(0);
    expect(lireOptions(['--exemples=abc']).exemples).toBe(10);
  });

  it('un pourcentage ne divise jamais par zéro', () => {
    expect(partFr(0, 0)).toBe('—');
    expect(partFr(1, 4)).toBe('25,0 %');
  });
});

/** LA MIGRATION 257, éprouvée par sa FORME — la seule chose qu'un test unitaire puisse en dire. */
describe('la migration 257', () => {
  const sql = readFileSync('db/migrations/257_gestion_rattachement.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée les deux tables du lot', () => {
    for (const t of ['gestion_rattachement', 'gestion_rattachement_examen']) {
      expect(code, t).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('🔴 elle ne touche PAS à gestion_affectation : c’est un autre axe, pas un remplacement', () => {
    expect(code).not.toMatch(/ALTER TABLE gestion_affectation/i);
    expect(code).not.toMatch(/DROP INDEX[^;]*gestion_affectation/i);
    // Ni à aucune table de courrier : ce lot AJOUTE, il ne modifie rien d'existant sauf la règle du journal.
    const alteres = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alteres)).toEqual(new Set(['gestion_journal']));
  });

  it('🔴 les trois sortes de cible, et une cible SANS identité est refusée EN BASE', () => {
    expect(code).toContain("cible_sorte IN ('lot', 'proprietaire', 'evenement')");
    expect(code).toContain("cible_sorte = 'evenement' AND cible_id IS NOT NULL AND cible_cle IS NULL");
    expect(code).toContain("btrim(coalesce(cible_cle, '')) <> ''");
  });

  it('🔴 les quatre statuts, et les deux origines', () => {
    expect(code).toContain("statut IN ('propose', 'confirme', 'rejete', 'retire')");
    expect(code).toContain("origine IN ('automatique', 'manuel')");
  });

  it('🔴 l’unicité est PARTIELLE — sans quoi un retrait serait irréversible', () => {
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_rattachement_vivant_idx');
    const idx = code.slice(code.indexOf('gestion_rattachement_vivant_idx'));
    expect(idx.slice(0, idx.indexOf(';'))).toContain("WHERE statut IN ('propose', 'confirme')");
  });

  it('l’unicité porte sur le COUPLE (mail, pièce, cible), jamais sur le mail seul', () => {
    const idx = code.slice(code.indexOf('gestion_rattachement_vivant_idx'));
    const bloc = idx.slice(0, idx.indexOf(';'));
    for (const c of ['message_id', 'coalesce(piece_id, 0)', 'cible_sorte']) expect(bloc, c).toContain(c);
  });

  it('un lien défait dit TOUJOURS quand', () => {
    expect(code).toContain("CHECK (statut IN ('propose', 'confirme') OR statut_le IS NOT NULL)");
  });

  it('le journal accepte « rattachement », sans perdre aucune entité', () => {
    for (const e of ['message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
      'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece',
      'adresses_messages', 'production_drive', 'rattachement']) {
      expect(code, e).toContain(`'${e}'`);
    }
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_rattachement/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('elle exige ses prédécesseurs plutôt que d’échouer obscurément plus loin', () => {
    expect(code).toContain("to_regclass('public.gestion_message_adresse') IS NULL");
    expect(code).toContain("to_regclass('public.gestion_annuaire_lot') IS NULL");
  });

  it('donne la commande exacte', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/257_gestion_rattachement.sql');
  });
});
