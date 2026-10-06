import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bornesEvenement, jourCivil, noteEvenement, MOT_CLOTURE_AVANT_OUVERTURE, NOTE_EVENEMENT_MAX,
} from './evenementQualite';

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LES DEUX DATES ET LA NOTE D'UNE CARTE NEUVE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD D'ARNO (06/10/2026), mot pour mot : « ajoute au formulaire PARTAGÉ de création d'événement les trois
 * champs “date d'ouverture” (préremplie à la date du mail quand on vient d'un mail, sinon aujourd'hui), “date de
 * clôture” (facultative) et “note” (facultative), dans son unique chemin d'écriture ».
 *
 * 🔴 AUCUNE MIGRATION N'A ÉTÉ NÉCESSAIRE, vérifié en base avant d'écrire une ligne : `gestion_evenement` porte
 * déjà `ouvert_le` (NOT NULL, défaut `now()`), `traite_le` et `note`. Ce qui manquait était le CHEMIN.
 *
 * 🔴🔴 ET C'EST UNE CONTRAINTE DE LA BASE QUI DICTE LA RÈGLE DE L'ÉTAT :
 * `gestion_evenement_traite_chk :: CHECK ((etat = 'traite') = (traite_le IS NOT NULL))`. Donner une clôture à la
 * création veut donc dire, en base comme en français, que la carte naît CLOSE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴 un jour civil, et rien d’autre', () => {
  it('🔴 `AAAA-MM-JJ` passe, et un instant ISO est ramené à son jour', () => {
    expect(jourCivil('2026-09-30')).toBe('2026-09-30');
    expect(jourCivil('2026-09-30T17:49:14+02:00')).toBe('2026-09-30');
  });

  it('⚠️ UNE SAISIE VIDE OU ILLISIBLE VAUT « NON RENSEIGNÉE », jamais une erreur', () => {
    for (const brut of ['', '   ', 'demain', '30/09/2026', null, undefined, 42, {}]) {
      expect(jourCivil(brut), String(brut)).toBeNull();
    }
  });

  /**
   * 🔴🔴 LA FORME NE SUFFIT PAS : « 2026-02-31 » a la bonne forme et n'existe pas. Sans ce contrôle, la base
   * aurait reçu une date que PostgreSQL refuse — une erreur technique au lieu d'un refus lisible.
   */
  it('🔴🔴 une date qui N’EXISTE PAS est refusée, même bien formée', () => {
    expect(jourCivil('2026-02-31')).toBeNull();
    expect(jourCivil('2026-13-01')).toBeNull();
    /* ⚠️ ET UN 29 FÉVRIER BISSEXTILE PASSE : 2028 est bissextile, 2027 non. */
    expect(jourCivil('2028-02-29')).toBe('2028-02-29');
    expect(jourCivil('2027-02-29')).toBeNull();
  });
});

describe('🔴🔴 les deux bornes d’une carte neuve', () => {
  it('🔴 SANS RIEN : les deux sont nulles, et la base posera aujourd’hui', () => {
    expect(bornesEvenement('', '')).toEqual({ ouvertLe: null, closLe: null, refus: null });
  });

  it('🔴 UNE OUVERTURE SEULE : la carte reste à traiter', () => {
    expect(bornesEvenement('2026-09-30', '')).toEqual({
      ouvertLe: '2026-09-30', closLe: null, refus: null,
    });
  });

  it('🔴 LES DEUX, DANS L’ORDRE : acceptées', () => {
    expect(bornesEvenement('2026-09-30', '2026-10-06')).toEqual({
      ouvertLe: '2026-09-30', closLe: '2026-10-06', refus: null,
    });
  });

  it('⚠️ LE MÊME JOUR EST ACCEPTÉ : une carte ouverte et réglée dans la journée, cela arrive', () => {
    expect(bornesEvenement('2026-09-30', '2026-09-30').refus).toBeNull();
  });

  /**
   * 🔴🔴 UNE CLÔTURE AVANT L'OUVERTURE EST REFUSÉE, et ce n'est pas une politesse d'ergonomie : une carte close
   * avant d'être ouverte fausse tous les comptes de durée, et personne ne la retrouverait pour la corriger.
   */
  it('🔴🔴 UNE CLÔTURE ANTÉRIEURE À L’OUVERTURE EST REFUSÉE, avec sa phrase', () => {
    const r = bornesEvenement('2026-09-30', '2026-09-29');
    expect(r.refus).toBe(MOT_CLOTURE_AVANT_OUVERTURE);
    /* ⚠️ LES DEUX VALEURS SONT QUAND MÊME RENDUES : l'écran les réaffiche telles que saisies, pour qu'on voie
       ce qu'on doit corriger. C'est `refus` qui empêche d'écrire, pas un effacement silencieux. */
    expect(r.ouvertLe).toBe('2026-09-30');
    expect(r.closLe).toBe('2026-09-29');
  });

  /** ⚠️ UNE CLÔTURE SANS OUVERTURE NE SE COMPARE À RIEN : elle passe, et la base posera `now()` à l'ouverture. */
  it('⚠️ une clôture seule passe — il n’y a rien à comparer', () => {
    expect(bornesEvenement('', '2026-10-06').refus).toBeNull();
  });
});

describe('🔴 la note', () => {
  it('🔴 elle est rognée de ses blancs, et une note vide vaut `null`', () => {
    expect(noteEvenement('  rappeler le syndic  ')).toBe('rappeler le syndic');
    expect(noteEvenement('   ')).toBeNull();
    expect(noteEvenement('')).toBeNull();
    expect(noteEvenement(undefined)).toBeNull();
  });

  /**
   * ⚠️ LE PLAFOND EST NOMMÉ ET NON DEVINÉ : la colonne est un `text` sans borne, et c'est donc l'écran qui doit
   * en poser une — sans quoi un copier-coller de dix pages entrerait dans une carte et la rendrait illisible
   * partout où elle s'affiche.
   */
  it('⚠️ elle est TRONQUÉE au plafond, jamais refusée', () => {
    const longue = 'a'.repeat(NOTE_EVENEMENT_MAX + 500);
    expect(noteEvenement(longue)).toHaveLength(NOTE_EVENEMENT_MAX);
  });
});

/**
 * ══ 🔴🔴 UN SEUL CHEMIN D'ÉCRITURE, ET IL ÉCRIT LES TROIS CHAMPS ════════════════════════════════════════════════
 *
 * Arno : « dans son unique chemin d'écriture ». `creerEvenementDansTransaction` est ce chemin — il sert les DEUX
 * portées (« toute la conversation » par `affecter`, « ce mail seul » par `deplacerMessageVersNouveau`). Ce garde
 * lit la source par FRAGMENTS sémantiques, sur une chaîne normalisée : la règle du dépôt interdit de figer la
 * forme d'un SQL émis, et un reformatage ne doit pas casser une épreuve qui ne garde pas un comportement.
 */
describe('🔴🔴 le seul chemin d’écriture nomme les trois colonnes', () => {
  const SRC = readFileSync('app/lib/gestion/gestes.ts', 'utf8').replace(/\s+/g, ' ');

  it('🔴 il n’existe QU’UNE création de carte, et elle est partagée', () => {
    const creations = readFileSync('app/lib/gestion/gestes.ts', 'utf8')
      .match(/INSERT INTO gestion_evenement \(/g) ?? [];
    /* Deux occurrences = les deux branches (migration 268 appliquée ou non) de la MÊME fonction. */
    expect(creations).toHaveLength(2);
    expect(SRC).toContain('async function creerEvenementDansTransaction(');
  });

  it('🔴🔴 les trois colonnes sont écrites, dans les DEUX branches', () => {
    for (const col of ['ouvert_le', 'traite_le', 'note']) {
      /* Deux fois : la branche « 268 appliquée » et l'autre. */
      expect(SRC.split(col).length - 1, col).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * 🔴🔴 ANCRÉES À MIDI, HEURE DE PARIS — jamais à minuit, jamais en UTC. C'est la convention de ce dépôt pour
   * toute date DÉCLARÉE : à minuit, une heure de décalage fait changer de jour, et la carte s'ouvrirait la veille.
   */
  it('🔴🔴 les deux dates sont ancrées à MIDI, heure de Paris', () => {
    expect(SRC).toContain("' 12:00:00')::timestamp AT TIME ZONE 'Europe/Paris'");
    expect(SRC).not.toContain('T00:00:00');
  });

  /** 🔴 L'OUVERTURE RETOMBE SUR `now()` : la colonne est NOT NULL, et un paramètre nul ne doit pas faire échouer. */
  it('🔴 une ouverture absente retombe sur `now()`, jamais sur une erreur', () => {
    expect(SRC.split('coalesce(').length - 1).toBeGreaterThanOrEqual(2);
    expect(SRC).toContain(', now())');
  });

  /**
   * 🔴🔴 L'ÉTAT SUIT LA CLÔTURE PARCE QUE LA BASE L'EXIGE :
   * `CHECK ((etat = 'traite') = (traite_le IS NOT NULL))`. Les deux s'écrivent donc d'un seul geste.
   */
  it('🔴🔴 l’état devient `traite` avec la clôture, et `a_traiter` sans elle', () => {
    expect(SRC).toContain("THEN 'a_traiter' ELSE 'traite' END");
  });

  /** 🔴 ET LE REFUS DU MODULE PUR ARRÊTE L'ÉCRITURE AVANT LA REQUÊTE. */
  it('🔴 les bornes sont validées avant d’écrire', () => {
    expect(SRC).toContain('const bornes = bornesEvenement(n.ouvertLe, n.closLe);');
    expect(SRC).toContain('if (bornes.refus !== null) throw new Error(bornes.refus);');
  });
});

/**
 * ══ 🔴🔴 LE FORMULAIRE EST PARTAGÉ, ET LES DEUX ÉCRANS LE MONTENT AVEC LES TROIS CHAMPS ══════════════════════════
 *
 * Arno : « Le bloc de l'encart qui utilise ce formulaire gagne les mêmes champs. » Il les gagne parce que c'est
 * LE MÊME composant — pas parce qu'on les y a recopiés, et ce garde le vérifie des deux côtés.
 */
describe('🔴🔴 les deux écrans montent le même formulaire, avec les trois champs', () => {
  const BEV = readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8');
  const RDF = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');

  it('🔴 le formulaire porte les trois champs, écrits UNE fois', () => {
    expect(BEV).toContain('Date d’ouverture');
    expect(BEV).toContain('Date de clôture (facultative)');
    expect(BEV).toContain('Note (facultative)');
    /* ⚠️ ET LA FENÊTRE NE LES RECOPIE PAS : elle monte le composant. */
    expect(RDF).not.toContain('Date d’ouverture');
    expect(RDF).toContain('<ChampsEvenement titre={evtTitre}');
  });

  it('🔴🔴 les deux écrans passent les trois valeurs au formulaire', () => {
    for (const src of [BEV, RDF]) {
      expect(src).toMatch(/ouvertLe=\{\w+\} onOuvertLe=\{set\w+\}/);
      expect(src).toMatch(/closLe=\{\w+\} onClosLe=\{set\w+\}/);
      expect(src).toMatch(/note=\{\w+\} onNote=\{set\w+\}/);
    }
  });

  /**
   * 🔴🔴 LE PRÉREMPLISSAGE EST CELUI D'ARNO : la date du MAIL quand on vient d'un mail, sinon aujourd'hui — et
   * par `jourParis`, jamais `toISOString()`, qui rend le jour UTC et change de date une heure par nuit.
   */
  it('🔴🔴 la date d’ouverture est préremplie à la date du mail, sinon aujourd’hui', () => {
    expect(BEV).toContain('setOuvertLe(jourDuMail ?? jourParis(new Date()));');
    expect(RDF).toContain('setEvtOuvertLe(jourDuMailDeLaFenetre ?? jourParis(new Date()));');
    for (const src of [BEV, RDF]) expect(src).not.toContain('toISOString().slice(0, 10)');
  });

  /** 🔴 ET LA DATE DU MAIL DESCEND BIEN JUSQU'AU BLOC DE L'ENCART, par l'écran qui seul la connaît. */
  it('🔴 la conversation passe la date du mail au bloc de l’encart', () => {
    const cnv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(cnv).toContain('jourDuMail={jourParis(new Date(message.recuLe))}');
    const ert = readFileSync('app/(admin)/admin/(protected)/gestion/EncartRattachement.tsx', 'utf8');
    expect(ert).toContain('jourDuMail={jourDuMail}');
  });
});
