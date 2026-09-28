import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dossiersPrioritaires, mentionNbBiens, sousDossierDuBien, titreDossierPrioritaire, type BienDuMail,
} from './dossierDuBien';

/**
 * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — LA LIGNE PRIORITAIRE DU SÉLECTEUR DRIVE. Module PUR, donc éprouvé entièrement.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LA RECONNAISSANCE A TRANCHÉ (28/09/2026, lecture seule) :
 *   · « Documents clients scannés » range par NOM DE FAMILLE — 99 lots nets sur 365, 180 ambigus, 86 introuvables.
 *     Piste écartée : elle demandait à la fois de deviner ET de lever une interdiction de lecture ;
 *   · « Base de données locative › 1 Propriétaires » range par « NOM (clé WIPPIMMO) », et NOTRE base connaît déjà
 *     le lien depuis le lot 253 — 307 propriétaires sur 307, donc 365 lots sur 365. Piste retenue.
 *
 * Ce qui est protégé ici :
 *   ① 🔴 UN BIEN SANS DOSSIER NE PRODUIT PAS DE LIGNE — pas une ligne grisée, pas un message ;
 *   ② 🔴 DEUX BIENS DU MÊME PROPRIÉTAIRE NE FONT QU'UNE LIGNE : ils mènent au même dossier, et deux lignes
 *      identiques feraient hésiter sur une différence qui n'existe pas ;
 *   ③ l'ORDRE est celui des biens rattachés, jamais un tri ;
 *   ④ la ligne DIT de qui est le dossier — il est rangé par propriétaire, pas par logement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const bien = (o: Partial<BienDuMail> = {}): BienDuMail => ({
  cle: '421',
  libelle: '28 Avenue Marceau, 92400 Courbevoie — lot 421',
  proprietaire: 'GARREAU Gabrielle',
  dossierId: 'd-garreau',
  dossierNom: 'GARREAU Gabrielle (289)',
  ...o,
});

describe('🔴 ① un bien sans dossier ne produit AUCUNE ligne', () => {
  it('aucun bien ⇒ aucune ligne', () => {
    expect(dossiersPrioritaires([])).toEqual([]);
  });

  /** 🔴 « Aucun dossier trouvé : pas de ligne, et rien ne change » — demande d'Arno, mot pour mot. */
  it('🔴 un bien SANS dossier connu est écarté, il n’occupe pas une ligne morte', () => {
    expect(dossiersPrioritaires([bien({ dossierId: null })])).toEqual([]);
  });

  it('un identifiant vide vaut absent — une ligne qui n’ouvre rien est pire que pas de ligne', () => {
    expect(dossiersPrioritaires([bien({ dossierId: '   ' })])).toEqual([]);
  });

  it('les biens SANS dossier sont écartés, les autres restent', () => {
    const r = dossiersPrioritaires([
      bien({ cle: '1', dossierId: null }),
      bien({ cle: '2', dossierId: 'd2', libelle: 'B2' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].cles).toEqual(['2']);
  });
});

describe('🔴 ② deux biens du même propriétaire = UNE ligne', () => {
  /**
   * 🔴 MESURÉ : 58 propriétaires portent plusieurs lots. Deux lignes qui ouvrent le MÊME dossier ne donnent pas un
   * choix — elles font hésiter sur une différence qui n'existe pas.
   */
  it('🔴 une seule ligne, et elle NOMME les deux biens', () => {
    const r = dossiersPrioritaires([
      bien({ cle: '421', libelle: '28 Avenue Marceau — lot 421' }),
      bien({ cle: '422', libelle: '30 Avenue Marceau — lot 422' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].cles).toEqual(['421', '422']);
    expect(r[0].libelle).toContain('lot 421');
    expect(r[0].libelle).toContain('lot 422');
  });

  it('deux propriétaires DIFFÉRENTS font bien deux lignes', () => {
    const r = dossiersPrioritaires([
      bien({ cle: '421', dossierId: 'd-a', proprietaire: 'A' }),
      bien({ cle: '494', dossierId: 'd-b', proprietaire: 'B', libelle: '2 Rue Mars et Roty — lot 494' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.proprietaire)).toEqual(['A', 'B']);
  });

  it('le même bien deux fois (choisi ET rattaché) ne se compte qu’une fois', () => {
    const r = dossiersPrioritaires([bien(), bien()]);
    expect(r).toHaveLength(1);
    expect(r[0].cles).toEqual(['421']);
    expect(r[0].libelle).toBe('28 Avenue Marceau, 92400 Courbevoie — lot 421');
  });
});

describe('🔴 ③④ l’ordre, et ce que la ligne dit', () => {
  it('🔴 l’ordre est celui des biens rattachés — jamais un tri alphabétique', () => {
    const r = dossiersPrioritaires([
      bien({ cle: 'z', dossierId: 'd-z', proprietaire: 'ZOLA' }),
      bien({ cle: 'a', dossierId: 'd-a', proprietaire: 'ABEL' }),
    ]);
    expect(r.map((x) => x.proprietaire)).toEqual(['ZOLA', 'ABEL']);
  });

  /**
   * 🔴 LE DOSSIER EST CELUI DU PROPRIÉTAIRE. Écrire « Dossier du bien » tout court ferait promettre un rangement
   * par logement qui n'existe pas dans ce Drive — et en ouvrant le dossier d'un bailleur à deux lots, on croirait
   * s'être trompé.
   */
  it('🔴 le titre NOMME le propriétaire', () => {
    expect(titreDossierPrioritaire(dossiersPrioritaires([bien()])[0]))
      .toBe('Dossier du bien — GARREAU Gabrielle');
  });

  it('sans propriétaire connu, le titre reste lisible plutôt que de laisser un tiret orphelin', () => {
    const d = dossiersPrioritaires([bien({ proprietaire: null })])[0];
    expect(titreDossierPrioritaire(d)).toBe('Dossier du bien');
  });

  it('le nombre de biens n’est dit QUE s’il y en a plusieurs — « 1 bien » est du bruit', () => {
    expect(mentionNbBiens(dossiersPrioritaires([bien()])[0])).toBeNull();
    const deux = dossiersPrioritaires([bien({ cle: '1' }), bien({ cle: '2' })])[0];
    expect(mentionNbBiens(deux)).toBe('2 biens dans ce dossier');
  });

  it('le nom RÉEL du dossier est conservé : c’est lui qu’on verra dans le fil d’Ariane', () => {
    expect(dossiersPrioritaires([bien()])[0].dossierNom).toBe('GARREAU Gabrielle (289)');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE SOUS-DOSSIER DU BIEN — MESURÉ DANS LE VRAI DRIVE.
 *
 * Le dossier d'un propriétaire contient « En attente » et un sous-dossier par bien, nommé
 * « → 28 Avenue Marceau, 92400 Courbevoie — Appartement meublé Type 2 — lot 421 ».
 *
 * 🔴 C'EST LE NUMÉRO DE LOT QUI TRANCHE, JAMAIS L'ADRESSE : relevé sur EKAMAI, cinq sous-dossiers à la MÊME
 * adresse (1bis rue des Pavillons), que seule la fin du nom distingue. Rapprocher les adresses choisirait le
 * premier venu — le mauvais quatre fois sur cinq, et personne ne s'en apercevrait avant le destinataire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 le sous-dossier du bien, par son numéro de lot', () => {
  const vrai = [
    { id: 'attente', nom: 'En attente' },
    { id: 'd421', nom: '→ 28 Avenue Marceau, 92400 Courbevoie — Appartement meublé Type 2 — lot 421' },
  ];

  it('🔴 il est trouvé par son numéro, pas par son adresse', () => {
    expect(sousDossierDuBien(vrai, '421')).toEqual(vrai[1]);
  });

  it('« En attente » n’est jamais pris pour un bien', () => {
    expect(sousDossierDuBien([vrai[0]], '421')).toBeNull();
  });

  /** 🔴 LE CAS EKAMAI : cinq lots à la même adresse. Seul le numéro les sépare. */
  it('🔴 cinq biens à la MÊME adresse : c’est le numéro qui choisit', () => {
    const ekamai = [
      { id: 'a', nom: '→ 1bis rue des Pavillons, 92800 PUTEAUX — Appartement meublé Type 2 — lot 374' },
      { id: 'b', nom: '→ 1bis rue des Pavillons, 92800 PUTEAUX — Appartement meublé Type 2 — lot 375' },
      { id: 'c', nom: '→ 1bis rue des Pavillons, 92800 PUTEAUX — Appartement Studio — lot 376' },
    ];
    expect(sousDossierDuBien(ekamai, '375')?.id).toBe('b');
    expect(sousDossierDuBien(ekamai, '376')?.id).toBe('c');
  });

  /** 🔴 « lot 42 » ne doit PAS attraper « lot 421 » : la fin du nom est ancrée. */
  it('🔴 un numéro PLUS COURT n’attrape pas un numéro plus long', () => {
    expect(sousDossierDuBien(vrai, '42')).toBeNull();
    expect(sousDossierDuBien(vrai, '4')).toBeNull();
  });

  it('les espaces et le type de tiret ne changent rien', () => {
    expect(sousDossierDuBien([{ id: 'x', nom: 'Bien - lot  421' }], '421')?.id).toBe('x');
    expect(sousDossierDuBien([{ id: 'y', nom: 'Bien – LOT 421' }], '421')?.id).toBe('y');
  });

  /** 🔴 DEUX CANDIDATS ⇒ AUCUN : si le Drive est ambigu, choisir pour lui serait une invention. */
  it('🔴 deux sous-dossiers pour le même lot ⇒ on ne choisit PAS', () => {
    expect(sousDossierDuBien([
      { id: 'a', nom: 'X — lot 421' }, { id: 'b', nom: 'Y — lot 421' },
    ], '421')).toBeNull();
  });

  it('rien ne correspond ⇒ `null`, et l’appelant reste sur le dossier du propriétaire', () => {
    expect(sousDossierDuBien(vrai, '999')).toBeNull();
    expect(sousDossierDuBien([], '421')).toBeNull();
    expect(sousDossierDuBien(vrai, '  ')).toBeNull();
  });

  /** ⚠️ Une clé exotique ne doit pas devenir une expression régulière : elle est échappée. */
  it('une clé contenant des caractères spéciaux ne casse pas la recherche', () => {
    expect(() => sousDossierDuBien(vrai, 'a.*b')).not.toThrow();
    expect(sousDossierDuBien(vrai, 'a.*b')).toBeNull();
  });
});

describe('garanties STATIQUES', () => {
  /** 🔴 Module PUR : aucun import, donc rien qui puisse tirer `pg` jusque dans le navigateur (incident 24/09/2026). */
  it('🔴 aucun import — il tourne à l’identique sur le serveur et dans le navigateur', () => {
    const src = readFileSync('app/lib/gestion/dossierDuBien.ts', 'utf8');
    expect(/^\s*import\s/m.test(src)).toBe(false);
    expect(/require\(/.test(src)).toBe(false);
  });

  /**
   * 🔴🔴 LA PISTE « Documents clients scannés » A ÉTÉ ÉCARTÉE, ET LE CODE NE DOIT PAS L'EMPRUNTER PAR MÉGARDE.
   * Ni ce module ni son dépôt ne nomment ce dossier : le jour où quelqu'un voudrait « améliorer » la
   * correspondance en rapprochant des noms de famille, il faudra le décider — pas le glisser.
   */
  it('🔴🔴 ni le module ni son dépôt ne touchent à « Documents clients scannés »', () => {
    for (const f of ['app/lib/gestion/dossierDuBien.ts', 'app/lib/gestion/dossierDuBienRepo.ts']) {
      const code = readFileSync(f, 'utf8')
        .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
      expect(code, f).not.toContain('Documents clients scannés');
      expect(code, f).not.toContain('1 actifs');
    }
  });

  /** 🔴🔴 Et le dépôt ne parle jamais à Google : la correspondance est DÉJÀ en base, on ne cherche rien. */
  it('🔴🔴 le dépôt ne fait AUCUN appel Drive', () => {
    const code = readFileSync('app/lib/gestion/dossierDuBienRepo.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/fetch\s*\(|googleapis|files\.list|files\.get/.test(code)).toBe(false);
  });

  /** 🔴 ET IL N'ÉCRIT RIEN : ce lot ne fait que LIRE une correspondance posée par le lot 253. */
  it('🔴 le dépôt est en LECTURE SEULE, y compris dans notre propre base', () => {
    const code = readFileSync('app/lib/gestion/dossierDuBienRepo.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/INSERT |UPDATE |DELETE /.test(code)).toBe(false);
  });
});
