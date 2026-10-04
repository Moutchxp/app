import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aideIconeReintegrer, aideReintegrer, boiteDuMessage, LIBELLE_REINTEGRER, PICTO_REINTEGRER,
} from './boiteOrigine';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — DANS LA CORBEILLE, LA CORBEILLE DEVIENT « RÉINTÉGRER » ══════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (04/10/2026, fil 36698 / message 57477, « _TEST corbeille », ouvert depuis la Corbeille) : « la
 * grande icône corbeille du bloc gris De/À/Date est toujours là. C'est illogique pour un mail déjà à la corbeille. »
 *
 * SA DEMANDE : « partout où une icône “mettre à la corbeille” apparaît (grande icône de l'en-tête du message, barre
 * de survol des lignes de la liste Corbeille, barre d'actions de la sélection multiple) : remplace-la par une icône
 * “Réintégrer” (flèche qui sort de la corbeille ↩), même case blanche, même taille, info-bulle “Réintégrer dans
 * <nom de la boîte d'origine>”. Le geste est le même que “Réintégrer” du menu “…”, avec le même code serveur et le
 * même Annuler. Hors de la Corbeille, rien ne change. »
 *
 * ═══ 🔴🔴 L'INVENTAIRE, FAIT À L'ÉCRAN AVANT D'ÉCRIRE UNE LIGNE ══════════════════════════════════════════════════
 *
 * Arno nomme trois endroits. Mesurés dans la liste Corbeille, DEUX portaient une icône « mettre à la corbeille » :
 *   ① la grande icône du bloc gris De/À/Date (`Conversation`) — vue sur « _TEST corbeille » ;
 *   ② la barre de survol d'une ligne (`BarreLigne`) — info-bulle « Mettre à la corbeille », sur un mail qui y était
 *      déjà.
 * Le troisième — la barre d'actions de la sélection multiple (`EnteteCorbeille`) — n'en portait PAS : elle offre
 * depuis le lot REINTEGRER deux boutons de TEXTE, « Réintégrer » et « Supprimer définitivement ». Il n'y avait donc
 * rien à y remplacer, et ce fichier le FIGE pour qu'on ne vienne pas y ajouter une corbeille plus tard.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CNV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const BRL = readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const ECB = readFileSync('app/(admin)/admin/(protected)/gestion/EnteteCorbeille.tsx', 'utf8');
const CARTE = readFileSync('app/lib/gestion/carteRepo.ts', 'utf8');

describe('🔴🔴 ① les mots et le glyphe, écrits une seule fois', () => {
  /** 🔴 LE GLYPHE EST CELUI QU'ARNO A ÉCRIT : une flèche qui sort, en demi-tour. */
  it('🔴 le picto est « ↩ », et jamais une corbeille barrée', () => {
    expect(PICTO_REINTEGRER).toBe('↩');
    /* ⚠️ UNE CORBEILLE BARRÉE SE LIRAIT « supprimer définitivement », l'inverse du geste. On fige donc l'absence
       de tout glyphe de corbeille dans ce mot-là. */
    expect(PICTO_REINTEGRER).not.toContain('🗑');
  });

  /** 🔴 L'INFOBULLE NOMME LA BOÎTE, mot pour mot la demande d'Arno : « Réintégrer dans <nom de la boîte> ». */
  it('🔴🔴 « Réintégrer dans « Réception » », et « Réintégrer » seul quand on ne sait pas', () => {
    expect(aideIconeReintegrer('reception')).toBe('Réintégrer dans « Réception »');
    expect(aideIconeReintegrer('envoyes')).toBe('Réintégrer dans « Envoyés »');
    expect(aideIconeReintegrer('automatique')).toBe('Réintégrer dans « Courrier automatique »');
    expect(aideIconeReintegrer('spam')).toBe('Réintégrer dans « Spam »');
    /* 🔴 `null` ⇒ ON NE NOMME PAS DE BOÎTE : inventer « Réception » parce que c'est le cas le plus fréquent
       enverrait chercher dans la mauvaise liste une fois sur mille, et ce sont ces fois-là qui coûtent. */
    expect(aideIconeReintegrer(null)).toBe(LIBELLE_REINTEGRER);
  });

  /**
   * ⚠️ L'INFOBULLE DE L'ICÔNE N'EST PAS CELLE DU MENU, ET C'EST VOULU : le menu a la place d'une phrase, une icône
   * a trois mots. Les deux nomment la MÊME boîte — c'est cela qui compte, et c'est ce qu'on fige.
   */
  it('⚠️ l’icône et le menu nomment la même boîte, chacun à sa longueur', () => {
    for (const b of ['reception', 'envoyes', 'automatique', 'spam'] as const) {
      expect(aideReintegrer(b)).toContain(aideIconeReintegrer(b).replace(`${LIBELLE_REINTEGRER} dans « `, '')
        .replace(' »', ''));
    }
  });
});

describe('🔴🔴 ② la boîte d’origine d’un MESSAGE', () => {
  /**
   * 🔴 LA FENÊTRE DE CONVERSATION N'EST PAS UNE LIGNE DE LISTE : elle n'a ni le nombre de messages lisibles de
   * l'échange, ni la marque spam. Elle a le message. `boiteDuMessage` traduit ses deux signaux.
   */
  it('🔴 le sens décide, et une règle qui l’écarte le met dans « Courrier automatique »', () => {
    expect(boiteDuMessage({ sens: 'recu', horsFile: false })).toBe('reception');
    expect(boiteDuMessage({ sens: 'envoye', horsFile: false })).toBe('envoyes');
    expect(boiteDuMessage({ sens: 'envoye', horsFile: true })).toBe('automatique');
    expect(boiteDuMessage({ sens: 'recu', horsFile: true })).toBe('automatique');
  });

  /**
   * ⚠️ LE SPAM N'EST PAS CONNU AU GRAIN DU MESSAGE, ET ON NE L'INVENTE PAS. Conséquence assumée et bornée : sur un
   * mail à la fois spam ET à la corbeille, l'info-bulle nommera la boîte que son SENS désigne. Le geste, lui, est
   * exact dans tous les cas — il retire la marque de corbeille, et le mail retrouve la liste que ses colonnes lui
   * destinent. On fige la limite plutôt que de la découvrir un jour dans un ticket.
   */
  it('⚠️ le spam par message n’est pas deviné : le sens répond', () => {
    const b = readFileSync('app/lib/gestion/boiteOrigine.ts', 'utf8');
    expect(b).toContain('spam: false, lisibles: m.horsFile ? 0 : 1');
    expect(b).toContain("LE SPAM N'EST PAS CONNU AU GRAIN DU MESSAGE");
  });
});

describe('🔴🔴 ③ la grande icône de l’en-tête', () => {
  /**
   * 🔴🔴 C'EST LE MESSAGE QUI DÉCIDE, PAS L'ÉCRAN D'OÙ L'ON VIENT. Un échange peut mêler un mail jeté et un mail
   * vivant — « _TEST corbeille » en est un —, et déduire l'état de « la conversation a été ouverte depuis la
   * Corbeille » l'aurait dit faux une ligne sur deux. La base répond, l'écran affiche.
   */
  it('🔴🔴 la bascule lit `message.aLaCorbeille`, rendu par la base', () => {
    expect(CNV).toContain('{message.aLaCorbeille && onReintegrerMessage !== undefined ? (');
    /* 🔴 LA DONNÉE EXISTE, ET SOUS SA SONDE : sans la migration 275 la colonne n'est nommée nulle part. */
    expect(CARTE).toContain("${avecCorbeille ? '(corbeille_le IS NOT NULL)' : 'false'} AS a_la_corbeille,");
    expect(CARTE).toContain('const avecCorbeille = await corbeilleGmailDisponible();');
    expect(CARTE).toContain('aLaCorbeille: m.a_la_corbeille === true,');
    /* ⚠️ ET LE TYPE L'EXIGE : un écran qui l'oublierait ne compilerait pas. */
    expect(CARTE).toContain('aLaCorbeille: boolean;');
  });

  /**
   * 🔴🔴 LE GESTE EST CELUI DU MENU « … », PAR LA MÊME PORTE. `annulerCorbeilleDuMessage` EST
   * `gesteCorbeilleMessage(id, false)` — c'est déjà ce qu'« Annuler » appelle. Aucun second appel n'est écrit pour
   * ce bouton, et c'est tout ce qu'il fallait vérifier : « le même code serveur et le même Annuler » (Arno).
   */
  it('🔴🔴 aucun second appel réseau : le bouton réutilise le geste d’« Annuler »', () => {
    expect(CNV).toContain('onReintegrerMessage={barreActions ? () => void annulerCorbeilleDuMessage(m.messageId) '
      + ': undefined}');
    expect(CNV).toContain('async function annulerCorbeilleDuMessage(messageId: number): Promise<void> {');
    expect(CNV).toContain('const r = await gesteCorbeilleMessage(messageId, false);');
    /* ⚠️ UN SEUL APPELANT DE `gesteCorbeilleMessage` POUR CHAQUE SENS : deux pour le même sens seraient deux
       chemins, donc deux comportements le jour où l'un change. */
    expect((CNV.match(/gesteCorbeilleMessage\(messageId, false\)/g) ?? [])).toHaveLength(1);
    expect((CNV.match(/gesteCorbeilleMessage\(m\.messageId, true\)/g) ?? [])).toHaveLength(1);
  });

  /** 🔴 MÊME CASE, MÊME TAILLE, MÊME PLACE : seules la classe de variante et le survol changent. */
  it('🔴 la case ne bouge pas, et son survol cesse d’alerter', () => {
    expect(CNV).toContain('className="cnv-corbeille cnv-corbeille--retour"');
    expect(CNV).toContain('.cnv-corbeille--retour:hover{color:var(--color-svv-green-ink)');
    /* 🔴 LE ROUGE DU SURVOL DE LA CORBEILLE DIT « CE GESTE RETIRE ». Réintégrer remet : garder le rouge aurait
       menti sur le sens du bouton. Et la couleur vient d'un JETON, jamais en dur. */
    expect(CNV).not.toContain('.cnv-corbeille--retour:hover{color:#');
  });
});

describe('🔴🔴 ④ la barre de survol d’une ligne', () => {
  /** 🔴 LE BOUTON NE DISPARAÎT PAS, IL CHANGE DE SENS — règle de cette barre depuis le lot BARRE-STATUT. */
  it('🔴🔴 même classe `brl-icone`, et le glyphe partagé', () => {
    expect(BRL).toContain('etat.enCorbeille === true && onReintegrer !== undefined');
    expect(BRL).toContain('aria-label={aideIconeReintegrer(etat.boiteOrigine ?? null)}');
    expect(BRL).toContain('<span aria-hidden="true">{PICTO_REINTEGRER}</span>');
    /* ⚠️ LA CORBEILLE RESTE, inchangée, dans l'autre branche : hors de la Corbeille rien ne change. */
    expect(BRL).toContain('aria-label="Mettre à la corbeille" title="Mettre à la corbeille"');
    expect(BRL).toContain('<Corbeille />');
  });

  /**
   * 🔴🔴 PAS DE CONFIRMATION SUR « RÉINTÉGRER », et c'est délibéré : le menu « … » n'en demande pas non plus, pour
   * une raison — le geste se défait d'un clic (bandeau « Annuler »). Confirmer un geste réversible pose deux
   * questions là où il n'y en a aucune. La corbeille, elle, GARDE sa confirmation.
   */
  it('🔴🔴 « Réintégrer » agit tout de suite, la corbeille demande toujours', () => {
    expect(BRL).toContain('onClick={geste(onReintegrer)}');
    expect(BRL).toContain('onClick={geste(() => onConfirmer(true))}');
  });

  /**
   * 🔴🔴 LES DEUX SIGNAUX SONT CEUX QUE LE MENU UTILISE DÉJÀ, aux mêmes lignes. Une seconde façon de répondre à
   * « ce mail est-il à la corbeille ? » aurait pu dire le contraire du menu posé deux centimètres plus loin.
   */
  it('🔴🔴 la liste branche l’étiquette et la MÊME `boiteOrigine` que le menu', () => {
    expect(BTE).toContain("enCorbeille: etiquette.sorte === 'corbeille',");
    expect((BTE.match(/boiteOrigine\(\{ sens: l\.dernierSens, spam: l\.spam === true, lisibles: l\.nbLisibles \}\)/g)
      ?? []).length).toBe(2);
    /* 🔴 ET LA CLÉ ENVOYÉE EST CELLE DU MENU : `restaurer`, donc le même code serveur et le même bandeau. */
    expect(BTE).toContain("onReintegrer={() => onActionLigne(l.filId, 'restaurer')}");
  });
});

describe('🔴 ⑤ la barre de sélection multiple n’avait pas de corbeille, et n’en aura pas', () => {
  /**
   * 🔴🔴 CONSTAT, PAS SUPPOSITION. Arno cite trois endroits ; celui-ci offre depuis le lot REINTEGRER deux boutons
   * de TEXTE — « Réintégrer » et « Supprimer définitivement ». Il n'y avait donc rien à remplacer.
   *
   * ⚠️ CE TEST EXISTE POUR L'AVENIR : il rougira le jour où quelqu'un ajoutera une corbeille à cette barre, c'est-
   * à-dire le jour où elle proposerait de jeter ce qui est déjà jeté. C'est la seule chose utile à figer ici.
   */
  it('🔴 « Réintégrer » en texte, et aucune icône de mise à la corbeille', () => {
    expect(ECB).toContain('{LIBELLE_REINTEGRER}');
    expect(ECB).toContain('Supprimer définitivement');
    expect(ECB).not.toContain('Mettre à la corbeille');
    expect(ECB).not.toContain('🗑');
  });
});

describe('🔴🔴 ⑥ LA CHRONOLOGIE — un mail réintégré reprend SA place, pas la première', () => {
  /**
   * ══ 🔴🔴 CE QUE LA DEMANDE D'ARNO FAISAIT CHERCHER ════════════════════════════════════════════════════════════
   *
   * « Un mail réintégré reprend sa place d'origine, triée par SA date d'origine (date de réception ou d'envoi),
   * jamais par la date de réintégration. Vérifie que rien (date d'activité, last_message_at de la conversation,
   * tri par mise à jour) ne le fait remonter en tête. »
   *
   * 🔴 LA RÉPONSE EST STRUCTURELLE, ET C'EST LA MEILLEURE SORTE : les listes de courrier trient sur `recu_le`, la
   * date du message — jamais sur `maj_le`. Le geste de corbeille, lui, n'écrit QUE `corbeille_le` et `maj_le`. Il
   * ne peut donc pas déplacer une ligne, et il n'y avait rien à corriger.
   *
   * ⚠️ LES SEULS `ORDER BY maj_le` DU MODULE SONT CEUX DES BROUILLONS, qui trient légitimement par dernière
   * modification — un brouillon n'a pas de date de réception. C'est ce que cette épreuve distingue.
   *
   * 🔴 MESURÉ À L'ÉCRAN, SUR « _TEST corbeille » (message 57477, envoyé le 03/10/2026 à 20:26, réintégré le
   * 04/10 à 11:21) :
   *   · en base après le geste : `recu_le` INCHANGÉ (2026-10-03 20:26), seul `maj_le` a bougé ;
   *   · dans « À classer » : l'échange revient au RANG 2, inséré entre le 04/10 06:41 et le 03/10 13:37 — donc à
   *     sa date, au milieu de la liste, et non en tête ;
   *   · dans « Envoyés » : rang 1, parce que sa date EST la plus récente des envois vivants — et le total passe de
   *     9 656 à 9 657.
   * Puis il a été remis à la corbeille, sa date toujours intacte.
   */
  it('🔴🔴 aucune liste de courrier ne trie par `maj_le` — seuls les brouillons', () => {
    const sources = [
      'app/lib/gestion/boiteRepo.ts', 'app/lib/gestion/receptionRepo.ts', 'app/lib/gestion/corbeilleRepo.ts',
    ];
    for (const f of sources) {
      const src = readFileSync(f, 'utf8');
      expect(src.match(/ORDER BY[^`;]*maj_le/g) ?? [], f).toEqual([]);
    }
    /* 🔴 ET LE TRI EST BIEN SUR LA DATE DU MESSAGE, aux deux étages du parcours de la boîte. */
    const boite = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    expect(boite).toContain('ORDER BY m.recu_le DESC, m.fil_id DESC');
  });

  /**
   * 🔴🔴 LE GESTE N'ÉCRIT QUE LA MARQUE DE CORBEILLE. S'il touchait `recu_le`, la ligne changerait de place — et
   * s'il touchait `gestion_fil`, un tri par activité d'échange la remonterait. Il ne fait ni l'un ni l'autre.
   */
  it('🔴🔴 le geste n’écrit ni `recu_le`, ni la moindre colonne de `gestion_fil`', () => {
    const corb = readFileSync('app/lib/gestion/corbeilleRepo.ts', 'utf8');
    const code = corb.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
    expect(code).toContain('UPDATE gestion_message SET corbeille_le = coalesce(corbeille_le, now()), maj_le = now()');
    expect(code).toContain('UPDATE gestion_message SET corbeille_le = NULL, maj_le = now()');
    /* 🔴 AUCUN `UPDATE gestion_fil` : c'est ce qui garantit qu'aucune « date d'activité » d'échange ne bouge. */
    expect(code).not.toContain('UPDATE gestion_fil');
    /* 🔴 ET `recu_le` N'EST JAMAIS À GAUCHE D'UN `=` : la date d'origine est intouchable par ce geste. */
    expect(code).not.toMatch(/recu_le\s*=/);
  });
});
