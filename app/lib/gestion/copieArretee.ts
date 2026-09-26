/**
 * MODULE « GESTION » — LOT COPIE-SURV : LA COPIE EST-ELLE ARRÊTÉE, ET FAUT-IL LE DIRE ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE MODULE EMPÊCHE DE REVIVRE — 26/09/2026. La passe n° 4 s'est arrêtée à 13:58 sur « 10 échecs
 * d'affilée », après avoir copié 2 199 pièces. Personne ne l'a su : rien, dans aucun écran, ne disait que la copie
 * était à l'arrêt alors qu'il restait 24 000 pièces. L'arrêt a été découvert par hasard, deux heures plus tard, en
 * regardant l'avancement. Le bandeau de veille, lui, affichait sereinement que la relève du courrier allait bien —
 * et c'était vrai, mais ce n'était pas la question.
 *
 * ═══ 🔴 TROIS SITUATIONS, TROIS TONS, ET LA DIFFÉRENCE N'EST PAS COSMÉTIQUE ══════════════════════════════════════
 *   · ARRÊTÉE SUR ÉCHECS, et il reste des pièces ⇒ ALERTE. Personne n'a voulu cela, et personne ne le sait.
 *   · ARRÊTÉE PARCE QU'ON L'A VOULU (limite atteinte, Ctrl-C), et il reste des pièces ⇒ LIGNE CALME. C'était une
 *     décision : crier ferait de l'alerte un bruit de fond, et on apprendrait à l'ignorer — exactement ce que le
 *     bandeau de veille s'interdit depuis l'incident du 25/09.
 *   · EN COURS, ou plus rien à copier ⇒ RIEN. Un écran qui répète que tout va bien cache celui qui dit le contraire.
 *
 * ⚠️ « ARRÊTÉE SUR ÉCHECS » NE SE DEVINE PAS DU MOTIF. Le motif est une phrase écrite pour un humain, et elle
 * changera. C'est le `resultat` de la passe et son compteur d'échecs qui tranchent — des données, pas de la prose.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la base sait de la dernière passe de copie. `null` = aucune passe n'a jamais tourné. */
export interface PasseCopieVue {
  id: number;
  /** `en_cours` | `ok` | `arret` | `echec` — la valeur de la colonne, jamais une interprétation du motif. */
  resultat: string;
  /** `null` tant que la passe tourne. */
  termineLe: string | null;
  motifArret: string | null;
  echecs: number;
  piecesCopiees: number;
  /** Le processus est-il encore vivant ? `null` = on ne peut pas savoir (autre machine). */
  vivant: boolean | null;
}

export interface CopieVue {
  derniere: PasseCopieVue | null;
  /**
   * Combien de pièces restent à copier. `null` = pas encore compté (lecture différée) : on se tait alors plutôt que
   * de supposer zéro, qui ferait taire une alerte méritée.
   */
  restantes: number | null;
  /** Les derniers motifs d'échec, quand la migration 259 est là. Vide sinon. */
  motifs: MotifEchecVue[];
}

export interface MotifEchecVue {
  pieceId: number | null;
  etape: string;
  codeHttp: number | null;
  motif: string;
  survenuLe: string;
}

export type NiveauCopie = 'muet' | 'calme' | 'alerte';

export interface EtatCopie {
  niveau: NiveauCopie;
  /** La phrase du bandeau. Vide quand il n'y a rien à dire. Elle porte l'état À ELLE SEULE. */
  texte: string;
  /** Le geste à faire, ou `null`. */
  aide: string | null;
}

export const MUET: EtatCopie = { niveau: 'muet', texte: '', aide: null };

/** La commande qui reprend la copie là où elle s'est arrêtée. Écrite UNE fois, ici. */
export const COMMANDE_REPRISE =
  'nohup caffeinate -i npm run gestion:drive:copier-pieces -- --appliquer >> ~/Desktop/copie-pieces.log 2>&1 &';

/**
 * LA PASSE S'EST-ELLE ARRÊTÉE SUR DES ÉCHECS ? PUR.
 *
 * 🔴 ON JUGE SUR LES DONNÉES, PAS SUR LA PHRASE. `resultat = 'echec'` est un échec d'emblée (jeton refusé, migration
 * manquante) ; `resultat = 'arret'` avec des échecs au compteur est un arrêt SUBI — c'est le cas des « 10 échecs
 * d'affilée » et celui du garde-fou. Un `arret` sans aucun échec est un arrêt VOULU : limite atteinte, ou Ctrl-C.
 */
export function arretSubi(p: PasseCopieVue): boolean {
  if (p.resultat === 'echec') return true;
  return p.resultat === 'arret' && p.echecs > 0;
}

/**
 * LE PROCESSUS `pid` TOURNE-T-IL ENCORE SUR CETTE MACHINE ? `null` = on ne peut pas savoir (autre hôte).
 *
 * 🔴 ELLE VIT ICI, DANS LE MODULE PUR, ET NON DANS LA COMMANDE `copie-etat` où elle est née. L'écran en a besoin
 * autant qu'elle, et l'importer depuis un script aurait tiré `chargerEnv` — donc une lecture de fichier au
 * démarrage — dans le graphe de la page. Une seule définition : deux façons de dire « ce processus vit encore »
 * finiraient par se contredire, et c'est l'écran le moins regardé qui garderait le faux.
 *
 * ⚠️ « PUR-ISH » : elle n'écrit rien et ne jette pas, mais elle interroge le système. `process.kill(pid, 0)` ne tue
 * rien — le signal 0 ne fait que demander si le processus existe.
 */
export function processusVivant(pid: number | null, hote: string | null, hoteLocal: string): boolean | null {
  if (pid === null || hote === null || hote !== hoteLocal) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Un motif d'échec, dit en une ligne courte. PUR. */
export function motifCourtCopie(m: MotifEchecVue): string {
  const code = m.codeHttp === null ? '' : ` (${m.codeHttp})`;
  const piece = m.pieceId === null ? '' : `pièce ${m.pieceId} · `;
  return `${piece}${m.etape}${code} — ${m.motif}`;
}

/**
 * FAUT-IL DIRE QUELQUE CHOSE DE LA COPIE, ET SUR QUEL TON ? PUR.
 *
 * ⚠️ UNE PASSE EN COURS NE DIT RIEN, même si elle a déjà des échecs au compteur : elle travaille, et les échecs
 * passagers font partie de son fonctionnement normal (attente croissante, puis reprise). On ne parle qu'une fois
 * qu'elle s'est ARRÊTÉE — et alors la question est « reste-t-il du travail ? », pas « y a-t-il eu des ratés ? ».
 *
 * ⚠️ `restantes === null` (compte non encore fait) NE VAUT PAS ZÉRO. On se tait, parce qu'on ne sait pas — taire une
 * alerte méritée serait pire que de la dire une minute plus tard.
 */
export function etatCopie(v: CopieVue): EtatCopie {
  const p = v.derniere;
  if (p === null) return MUET;                     // aucune passe n'a jamais tourné : rien à dire
  if (p.termineLe === null) return MUET;           // elle tourne
  if (v.restantes === null || v.restantes === 0) return MUET;  // rien à reprendre, ou on ne sait pas encore

  const reste = `${v.restantes} pièce${v.restantes > 1 ? 's' : ''} restante${v.restantes > 1 ? 's' : ''}`;

  if (arretSubi(p)) {
    const motif = (p.motifArret ?? '').trim();
    const premier = v.motifs[0];
    return {
      niveau: 'alerte',
      texte: `⚠ La copie des pièces vers le Drive est ARRÊTÉE — ${reste}.`
        + (motif === '' ? '' : ` Motif : ${motif}`)
        + (premier === undefined ? '' : ` Dernier échec : ${motifCourtCopie(premier)}`),
      aide: `Pour reprendre (elle repart où elle s’est arrêtée, rien n’est recopié) : ${COMMANDE_REPRISE}`,
    };
  }

  // Arrêt VOULU : on le dit, calmement. C'est un rappel, pas une alarme.
  return {
    niveau: 'calme',
    texte: `Copie des pièces vers le Drive à reprendre — ${reste}.`,
    aide: null,
  };
}
