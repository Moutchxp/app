import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cibleCourte, cibleCertaine, cibleEvenement, cibleLot, cibleProprietaire, candidatsDeLaVue,
  estVivant, examinerMessage, libelleIssue, memeCible, statutInverse, vueDesAdresses, adressesUtiles,
  STATUTS_VIVANTS, type Statut,
} from './rattachement';
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
    const v = vueDesAdresses(a);
    expect(v.lots.size).toBe(0);
    expect(v.proprietaires.size).toBe(0);
  });

  it('un mail où NOUS sommes la seule partie reconnue n’a aucun candidat', () => {
    const e = examinerMessage({
      messageId: 1,
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

  it('un bailleur qui écrit pour lui-même, sans locataire : le PROPRIÉTAIRE', () => {
    const e = examinerMessage({
      messageId: 11, adressesEchange: [adr('prop@fictif.fr', 11, proprietaire('339'))],
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleProprietaire('339'));
  });

  it('le locataire ET son bailleur dans le même mail : UN SEUL logement, donc certain', () => {
    const e = examinerMessage({
      messageId: 12,
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
      adressesEchange: [
        adr('loc@fictif.fr', 13, locataire('495', '339')),
        adr('autre@fictif.fr', 13, proprietaire('700')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.certain).toBeNull();
    // Le logement, son bailleur, ET le bailleur étranger : trois candidats, aucun choisi.
    expect(e.candidats.map((c) => cibleCourte(c.cible)).sort())
      .toEqual(['lot:495', 'proprio:339', 'proprio:700']);
  });
});

describe('plusieurs cibles ⇒ la file de tri, et rien d’autre', () => {
  it('deux logements du MÊME bailleur : les deux logements ET le bailleur sont proposés', () => {
    const e = examinerMessage({
      messageId: 20,
      adressesEchange: [
        adr('a@fictif.fr', 20, locataire('495', '339')),
        adr('b@fictif.fr', 20, locataire('496', '339')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats.map((c) => cibleCourte(c.cible)).sort()).toEqual(['lot:495', 'lot:496', 'proprio:339']);
    // 🔴 Le bailleur est un candidat EN PLUS, jamais à la place : c'est au tri de choisir l'échelle.
    const bailleur = e.candidats.find((c) => c.cible.sorte === 'proprietaire');
    expect(bailleur?.confiance).toBe('moyenne');
    expect(bailleur?.motif).toContain('propriétaire des logements désignés');
  });

  it('deux logements de bailleurs DIFFÉRENTS : quatre candidats, aucun tranché', () => {
    const e = examinerMessage({
      messageId: 21,
      adressesEchange: [
        adr('a@fictif.fr', 21, locataire('495', '339')),
        adr('b@fictif.fr', 21, locataire('700', '800')),
      ],
    });
    expect(e.issue).toBe('a_trier');
    expect(e.candidats).toHaveLength(4);
  });

  it('un candidat PROPRIÉTAIRE n’est jamais « haute » : il est moins précis qu’un logement', () => {
    const v = vueDesAdresses([adr('a@fictif.fr', 1, locataire('495', '339'))]);
    const cands = candidatsDeLaVue(v, 'a', 'haute', 'essai');
    expect(cands.find((c) => c.cible.sorte === 'lot')?.confiance).toBe('haute');
    expect(cands.find((c) => c.cible.sorte === 'proprietaire')?.confiance).toBe('moyenne');
  });
});

describe('🔴 la règle b — l’échange — ne devient JAMAIS automatique', () => {
  it('le mail d’un tiers dans un fil clair donne un CANDIDAT, pas un lien', () => {
    const e = examinerMessage({
      messageId: 31,
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
    // TOUS les candidats viennent de la règle b, et AUCUN n'a la confiance « haute ».
    expect(e.candidats.length).toBeGreaterThan(0);
    expect(e.candidats.every((c) => c.regle === 'b')).toBe(true);
    expect(e.candidats.every((c) => c.confiance !== 'haute')).toBe(true);
    expect(e.motif).toContain('à confirmer à la main');
  });

  it('le mail du locataire, LUI, reste automatique dans le même fil', () => {
    const adresses = [
      adr('syndic@fictif.fr', 31, RIEN),
      adr('loc@fictif.fr', 30, locataire('495', '339')),
    ];
    expect(examinerMessage({ messageId: 30, adressesEchange: adresses }).issue).toBe('automatique');
    expect(examinerMessage({ messageId: 31, adressesEchange: adresses }).issue).toBe('a_trier');
  });

  it('l’échange n’est consulté QUE si le mail lui-même ne dit rien', () => {
    // Le mail 40 désigne le lot 1 ; le fil en porte un autre. Le mail gagne, sans arbitrage.
    const e = examinerMessage({
      messageId: 40,
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
    const e = examinerMessage({ messageId: 50, adressesEchange: [adr('parti@fictif.fr', 50, parti)] });
    expect(e.issue).toBe('sans_candidat');
    // 🔴 ET LE MOTIF NE MENT PAS : il dit qu'une adresse EST reconnue. Le premier rapport annonçait
    //   « aucune adresse connue » en ayant lui-même compté 1 reconnue — contradiction corrigée le 26/09/2026.
    expect(e.adressesUtiles).toBe(1);
    expect(e.motif).toContain('1 adresse(s) reconnue(s)');
    expect(e.motif).not.toContain('aucune adresse de l’échange');
  });

  it('le même locataire, à une date où son bail courait, désigne son logement', () => {
    const e = examinerMessage({ messageId: 51, adressesEchange: [adr('parti@fictif.fr', 51, locataire('495', '339'))] });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleLot('495'));
  });

  it('un locataire de DEUX logements à la même date ne tranche pas : son bailleur commun est proposé', () => {
    // `reconnaitre` rend lotCle nul et le bailleur commun quand il y en a un. Le moteur en fait un lien certain
    // sur le BAILLEUR — c'est le plus précis dont on soit sûr, et c'est réversible.
    const deuxLots: Reconnaissance = {
      partie: 'locataire', proprietaireCle: '339', locataireId: 9, lotCle: null,
      motif: 'locataire de 2 biens à cette date — aucun lot n’est tranché',
    };
    const e = examinerMessage({ messageId: 52, adressesEchange: [adr('deux@fictif.fr', 52, deuxLots)] });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual(cibleProprietaire('339'));
  });
});

describe('la cible certaine, prise isolément', () => {
  it('aucune adresse utile ⇒ aucune cible certaine', () => {
    expect(cibleCertaine(vueDesAdresses([adr('x@fictif.fr', 1, RIEN)]))).toBeNull();
  });

  it('deux logements ⇒ aucune cible certaine, même avec un bailleur commun', () => {
    const v = vueDesAdresses([
      adr('a@fictif.fr', 1, locataire('1', '10')),
      adr('b@fictif.fr', 1, locataire('2', '10')),
    ]);
    expect(cibleCertaine(v)).toBeNull();
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
