import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  motBasculeAutomatique, phraseCourrierAutomatique, sqlSansCourrierAutomatique,
} from './courrierAutomatique';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — LE COURRIER AUTOMATIQUE, AUX DEUX ÉCRANS ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « ajoute le même interrupteur à l'écran partagé : même libellé, même place, MÊME
 * état partagé entre les deux écrans (activé d'un côté = activé de l'autre). L'ordre chronologique est strict sur
 * l'ensemble. La route /reception accepte le même paramètre que /boite, par le même code SQL : pas de second
 * chemin. »
 *
 * ═══ 🔴🔴 CE QUE L'ÉTAT DES LIEUX A TROUVÉ, ET CE N'ÉTAIT PAS « UN BOUTON MANQUANT » ═════════════════════════════
 *
 * La colonne de réception de l'écran partagé n'avait pas seulement perdu l'interrupteur : elle n'avait AUCUN
 * filtre de courrier automatique. Les deux écrans filtraient donc différemment le même courrier, et l'écran
 * partagé montrait par défaut ce que le plein écran cachait.
 *
 * 🔴 MESURE EN BASE (04/10/2026, hors spam) : 40 177 messages ENVOYÉS dont 24 891 écartés par une règle ; 17 017
 * messages REÇUS dont **ZÉRO** écarté. L'écart réel entre les deux écrans est donc aujourd'hui de zéro mail — et
 * l'interrupteur ne peut rien changer sur une liste de mails reçus.
 *
 * 🔴 LE CÂBLAGE EST POURTANT COMPLET, et c'est ce que ce fichier fige : paramètre `?auto=1`, même prédicat SQL,
 * compteur jumeau `automatiquesIci`, bouton, et état PARTAGÉ. Il parlera le jour où une règle écartera un message
 * reçu. En attendant, le bouton ne s'affiche pas — par l'arbitrage qu'Arno a rendu au point 6 de ce même lot :
 * « zéro ⇒ ni la phrase, ni le bouton », pour que plus personne ne cherche un changement impossible.
 *
 * ⚠️ VÉRIFIÉ SUR LA ROUTE RÉELLE : `?filtre=tous` et `?filtre=tous&auto=1` rendent le même total (16 978) et
 * `automatiquesIci: 0`. Sur « Envoyés », au plein écran, `automatiquesIci` vaut 23 195 et le bandeau s'affiche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const RECEPTION_REPO = readFileSync('app/lib/gestion/receptionRepo.ts', 'utf8');
const BOITE_REPO = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/reception/route.ts', 'utf8');
const BRC = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

describe('🔴🔴 ① un seul prédicat SQL, lu par les deux dépôts', () => {
  /** 🔴 LE FRAGMENT, DANS LES DEUX SENS. `true` ⇒ chaîne vide : la requête d'avant tout filtre, mot pour mot. */
  it('🔴 le prédicat écarte `exclu_le`, et disparaît quand on inclut tout', () => {
    expect(sqlSansCourrierAutomatique(false, 'm')).toBe('AND m.exclu_le IS NULL');
    expect(sqlSansCourrierAutomatique(false, 'm2')).toBe('AND m2.exclu_le IS NULL');
    expect(sqlSansCourrierAutomatique(true, 'm')).toBe('');
  });

  /**
   * 🔴🔴 LES DEUX DÉPÔTS L'APPELLENT, ET AUCUN NE L'ÉCRIT À LA MAIN. C'est la réponse littérale à « pas de second
   * chemin » : recopié, ce prédicat aurait divergé au premier correctif — et ce lot vient d'en payer deux autres
   * exemples (le nom générique de racine, l'`ON CONFLICT` de la 301).
   */
  it('🔴🔴 la boîte ET la réception passent par le module, jamais par une chaîne à elles', () => {
    for (const [nom, src] of [['boiteRepo', BOITE_REPO], ['receptionRepo', RECEPTION_REPO]] as const) {
      expect(src, nom).toMatch(/import \{[^}]*sqlSansCourrierAutomatique[^}]*\} from '\.\/courrierAutomatique';/);
      expect(src, nom).toContain('sqlSansCourrierAutomatique(');
      /**
       * ⚠️ ET PLUS AUCUNE COPIE **CONDITIONNELLE** du prédicat : c'est l'assertion qui attrapera celle qu'on
       * refera dans six mois. Elle a déjà servi en l'écrivant — elle a trouvé DEUX copies que je venais de
       * manquer, inline dans `sqlCompteBoite`, et le compteur de la boîte aurait donc gardé l'ancien chemin.
       *
       * 🔴 ON NE CHERCHE QUE LA FORME « drapeau + prédicat », PAS `exclu_le IS NULL` tout court. Les autres
       * occurrences répondent à d'AUTRES questions, et les interdire serait une fausse alerte permanente :
       *   · `count(*) FILTER (WHERE exclu_le IS NULL)` — combien de messages sont lisibles dans cet échange ;
       *   · `NOT EXISTS (… ml.exclu_le IS NULL)` — le prédicat de l'ÉTIQUETTE « Courrier automatique », qui est
       *     une liste (les échanges dont AUCUN message n'est lisible), et non l'interrupteur.
       */
      const lignes = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
        .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
      expect(lignes.filter((l) => /exclu_le IS NULL/.test(l) && /inclureAutomatiques|\btous\b/.test(l)), nom)
        .toEqual([]);
    }
  });

  /** 🔴 LA BOÎTE L'APPLIQUE AUX DEUX ÉTAGES du parcours — c'est la règle que le module documente. */
  it('🔴 la boîte filtre `m` ET `m2`', () => {
    expect(BOITE_REPO).toContain("sqlSansCourrierAutomatique(inclureAutomatiques, 'm')");
    expect(BOITE_REPO).toContain("sqlSansCourrierAutomatique(inclureAutomatiques, 'm2')");
  });

  /**
   * 🔴🔴 ET LE COMPTEUR DE LA RÉCEPTION LE PORTE AUSSI. « Un compteur calculé autrement mais équivalent annonce
   * tôt ou tard un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit » : la liste et
   * son total DOIVENT sortir du même prédicat, sinon « 1–30 sur N » désigne une dernière page inatteignable.
   */
  it('🔴🔴 la liste et son total sortent du même prédicat', () => {
    expect(RECEPTION_REPO).toContain("${sqlSansCourrierAutomatique(tous, 'm')}");
    expect((RECEPTION_REPO.match(/sqlSansCourrierAutomatique\(tous, 'm'\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, tous)');
  });
});

describe('🔴🔴 ② la route accepte le MÊME paramètre que /boite', () => {
  /** 🔴 MÊME NOM, MÊME VALEUR RECONNUE. Un `?automatique=true` ici aurait été un second dialecte. */
  it('🔴 `?auto=1`, exactement comme /boite', () => {
    const boite = readFileSync('app/(admin)/api/admin/gestion/boite/route.ts', 'utf8');
    expect(boite).toContain("url.searchParams.get('auto') === '1'");
    expect(ROUTE).toContain("url.searchParams.get('auto') === '1'");
    expect(ROUTE).toContain('inclureAutomatiques:');
    /* ⚠️ ET LE NOM DE L'OPTION EST CELUI DE LA BOÎTE : `inclureAutomatiques`, pas un synonyme. */
    expect(RECEPTION_REPO).toContain('inclureAutomatiques?: boolean;');
  });

  /**
   * 🔴🔴 LE COMPTEUR JUMEAU, PAR LA MÊME MÉTHODE QUE LA BOÎTE : la DIFFÉRENCE des deux comptes, le seul drapeau
   * changeant. C'est ce qui garantit que le nombre annoncé est celui que le bouton ramènerait — et c'est le
   * correctif du point 6, appliqué ici d'avance plutôt que découvert plus tard.
   */
  it('🔴🔴 `automatiquesIci` est la différence des deux comptes, pas un compte global', () => {
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, true)');
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, false)');
    expect(RECEPTION_REPO).toContain('return Math.max(0, avecAuto - sansAuto);');
    /* ⚠️ ET SEULEMENT À LA PREMIÈRE PAGE : deux `count(*)` à chaque « voir plus » se paieraient pour rien. */
    expect(RECEPTION_REPO).toContain('automatiquesIci: curseur !== null ? null : await (async () => {');
  });
});

describe('🔴🔴 ③ même libellé, même place, même état', () => {
  /** 🔴 LES MOTS VIENNENT DU MODULE, DANS LES DEUX ÉCRANS. « Même libellé » ne se tient pas autrement. */
  it('🔴🔴 les deux écrans lisent les mêmes mots', () => {
    for (const [nom, src] of [['BoiteMail', BTE], ['BoiteReception', BRC]] as const) {
      expect(src, nom).toContain('motBasculeAutomatique');
      expect(src, nom).toContain('phraseCourrierAutomatique');
      expect(src, nom).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/gestion\/courrierAutomatique';/);
    }
    /* ⚠️ ET PLUS AUCUNE FORMULATION EN DUR dans le plein écran : elle y était, en JSX. */
    expect(BTE).not.toContain('Afficher aussi le courrier automatique<');
    expect(BTE).not.toContain("'Masquer le courrier automatique'");
  });

  /**
   * 🔴🔴 LA PHRASE EST IDENTIQUE AU CARACTÈRE PRÈS à celle que le plein écran composait avant ce point. Vérifié à
   * l'écran sur « Envoyés » : « 23195 échanges ne contiennent que du courrier automatique et ne sont pas affichés
   * ici. Rien n'est supprimé. » Déplacer un mot dans un module ne doit pas le réécrire en passant.
   */
  it('🔴🔴 la phrase des échanges n’a pas changé d’un caractère', () => {
    expect(phraseCourrierAutomatique(23195, false, 'echange')).toBe(
      '23195 échanges ne contiennent que du courrier automatique et ne sont pas affichés ici. '
      + 'Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(23195, true, 'echange')).toBe(
      'Le courrier automatique est inclus : 23195 échanges ne contiennent que des messages tenus hors de la file '
      + 'par une règle.');
    /* ⚠️ LE SINGULIER AUSSI : « 1 échange ne contient que… n'est pas affiché ». */
    expect(phraseCourrierAutomatique(1, false, 'echange')).toBe(
      '1 échange ne contient que du courrier automatique et n’est pas affiché ici. Rien n’est supprimé.');
  });

  /** 🔴 ET L'UNITÉ SUIT L'ÉCRAN : la colonne compte des MAILS, pas des échanges. */
  it('🔴 la colonne de réception parle de mails', () => {
    expect(phraseCourrierAutomatique(3, false, 'mail')).toBe(
      '3 mails sont tenus hors de la file par une règle et ne sont pas affichés ici. Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(1, true, 'mail')).toBe(
      'Le courrier automatique est inclus : 1 mail est tenu hors de la file par une règle.');
    expect(BRC).toContain("phraseCourrierAutomatique(etat.automatiquesIci, auto, 'mail')");
  });

  /** 🔴 LE MOT DU BOUTON DIT CE QUE LE CLIC VA FAIRE, jamais l'état où l'on est. */
  it('🔴 le bouton annonce le geste', () => {
    expect(motBasculeAutomatique(false)).toBe('Afficher aussi le courrier automatique');
    expect(motBasculeAutomatique(true)).toBe('Masquer le courrier automatique');
  });

  /**
   * 🔴🔴 L'ÉTAT EST LA MÊME VARIABLE, pas une copie. `GestionVue` rend LES DEUX colonnes et tient `auto` : il le
   * passe au plein écran depuis toujours, et désormais à la colonne. Un `useState` local aurait donné deux
   * interrupteurs capables de se contredire — et c'est l'un des deux qu'on aurait cru.
   */
  it('🔴🔴 un seul `useState`, passé aux deux écrans', () => {
    expect(VUE).toContain('const [auto, setAuto] = useState(false);');
    expect((VUE.match(/auto=\{auto\} onAuto=\{setAuto\}/g) ?? [])).toHaveLength(2);
    /* ⚠️ ET LA COLONNE N'EN FABRIQUE PAS UN DEUXIÈME : elle le reçoit, point. */
    expect(BRC).toContain('auto = false, onAuto,');
    expect(BRC).not.toContain('const [auto, setAuto] = useState');
  });

  /**
   * 🔴 LE BOUTON NE PARAÎT QUE S'IL PEUT CHANGER QUELQUE CHOSE — arbitrage d'Arno au point 6, appliqué ici aussi.
   * Et `onAuto` absent ⇒ pas de bouton : on ne propose jamais un geste qui n'irait nulle part.
   */
  it('🔴 ni phrase ni bouton quand le nombre est nul, ou sans rappel', () => {
    expect(BRC).toContain('etat.v === \'ok\' && onAuto !== undefined && etat.automatiquesIci !== null');
    expect(BRC).toContain('&& etat.automatiquesIci > 0 && (');
  });

  /**
   * 🔴🔴 L'ORDRE CHRONOLOGIQUE RESTE STRICT SUR L'ENSEMBLE (demande d'Arno). Le drapeau voyage donc avec la page
   * SUIVANTE : sans lui, « voir plus » rendrait une page filtrée autrement que celle qu'on lit, et des mails
   * apparaîtraient ou manqueraient au milieu de la liste.
   */
  it('🔴🔴 « voir plus » garde le même filtre que la page affichée', () => {
    expect(BRC).toContain("filtre, avant: etat.suivant.recuLe, apres: etat.suivant.messageId, "
      + "...(auto ? { auto: '1' } : {}),");
    /* 🔴 ET L'INTERRUPTEUR RELIT LA LISTE : il est une dépendance de l'effet, pas un drapeau lu au geste suivant. */
    expect(BRC).toContain('}, [charger, filtre, auto]);');
  });
});
