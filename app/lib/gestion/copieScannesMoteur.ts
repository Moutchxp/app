/**
 * ══ 🔴🔴 LE MOTEUR DE LA COPIE DE « Documents clients scannés » — CE QUI JUGE ET CE QUI ORDONNE. Module PUR ═══════════
 *
 * Correctif du 19/10/2026, après l'arrêt du 18/10 (`docs/COPIE_ARCHIVE_ARRET_2026-10-18.md`). Trois défauts établis :
 *   ① un document Google natif (sans md5) était jugé sur la taille rendue À LA CRÉATION — provisoire (« 1 ») — et sa
 *      copie s'appelait « Copie de … » ;
 *   ② l'« arrêt » n'arrêtait que la promesse globale : les autres ouvriers ont continué 47 minutes, et le second écart
 *      n'a été écrit nulle part ;
 *   ③ une copie retrouvée par son étiquette à la reprise était ADOPTÉE SANS CONTRÔLE.
 *
 * Ce module ne parle ni à Google ni à la base : il reçoit des fiches et des fonctions, il rend des verdicts. Tout ce qu'il
 * décide s'éprouve sans réseau (`copieScannesMoteur.test.ts`).
 */

export const PREFIXE_NATIF = 'application/vnd.google-apps.';

/** Un document Google natif (Docs, Sheets, Slides…) : il n'a pas de md5, il se juge autrement. PUR. */
export const estNatif = (mime: string): boolean => mime.startsWith(PREFIXE_NATIF);

/** Ce qu'on compare d'un fichier, source ou copie — tel que Google le rend. */
export interface FicheFichier {
  nom: string;
  mime: string;
  md5: string | null;
  taille: string | null;
}

export type EcartCopie = 'nom' | 'type' | 'md5' | 'taille';
export type JugementCopie = { ok: true } | { ok: false; ecart: EcartCopie; detail: string };

/**
 * UNE COPIE EST-ELLE CONFORME À SA SOURCE ? PUR.
 *   · toujours : le NOM EXACT (octet pour octet) et le MÊME type ;
 *   · fichier ordinaire : le MÊME md5 — et une source sans md5 ne prouve rien, donc elle ne passe pas ;
 *   · document Google natif : la MÊME taille (celle de la copie relue après stabilisation, voir `tailleStabilisee`).
 * Rien n'est assoupli : ce qui ne se prouve pas est un écart.
 */
export function jugerCopie(source: FicheFichier, copie: FicheFichier): JugementCopie {
  if (copie.nom !== source.nom) return { ok: false, ecart: 'nom', detail: `nom « ${source.nom} » → « ${copie.nom} »` };
  if (copie.mime !== source.mime) return { ok: false, ecart: 'type', detail: `type ${source.mime} → ${copie.mime}` };
  if (estNatif(source.mime)) {
    if (source.taille === null || copie.taille !== source.taille) {
      return { ok: false, ecart: 'taille', detail: `taille ${source.taille ?? '(absente)'} → ${copie.taille ?? '(absente)'}` };
    }
    return { ok: true };
  }
  if (source.md5 === null || copie.md5 !== source.md5) {
    return { ok: false, ecart: 'md5', detail: `md5 ${source.md5 ?? '(absent)'} → ${copie.md5 ?? '(absent)'}` };
  }
  return { ok: true };
}

/**
 * Les attentes entre deux relectures de la taille d'un document Google copié : d'abord courtes, puis plus longues.
 * Plafond ≈ 1 min 40 s en tout (somme), puis on renonce : c'est un écart, et l'écart arrête tout.
 */
export const ATTENTES_STABILISATION_MS: readonly number[] = [3_000, 3_000, 5_000, 8_000, 12_000, 20_000, 20_000, 30_000];

export type Stabilisation = { stable: true; taille: string; lues: (string | null)[] } | { stable: false; lues: (string | null)[] };

/**
 * LA TAILLE D'UNE COPIE DE DOCUMENT GOOGLE, RELUE APRÈS STABILISATION. Google rend une taille PROVISOIRE à la création
 * (constaté : « 1 » pour un document de 19 675 octets). On relit donc, à intervalles croissants, jusqu'à DEUX
 * LECTURES CONSÉCUTIVES IDENTIQUES ET ÉGALES À LA TAILLE DE LA SOURCE ; au plafond, on rend « instable » avec tout ce
 * qu'on a lu. Deux lectures identiques mais différentes de la source ne suffisent pas à conclure à un écart : la taille
 * provisoire peut se répéter — on attend le plafond avant de déclarer l'écart. PUR (lecture et attente injectées).
 */
export async function tailleStabilisee(
  lire: () => Promise<string | null>,
  tailleSource: string | null,
  attendre: (ms: number) => Promise<void>,
  attentes: readonly number[] = ATTENTES_STABILISATION_MS,
): Promise<Stabilisation> {
  const lues: (string | null)[] = [];
  let precedente: string | null | undefined;
  for (const ms of attentes) {
    await attendre(ms);
    const v = await lire();
    lues.push(v);
    if (v !== null && v === precedente && v === tailleSource) return { stable: true, taille: v, lues };
    precedente = v;
  }
  return { stable: false, lues };
}

// ══ LES OUVRIERS : UN ARRÊT ARRÊTE TOUT, ET L'EMPREINTE EST RÉELLEMENT CONTRÔLÉE ══════════════════════════════════════

/** L'arrêt global : il porte TOUS les motifs, pas seulement le premier. */
export class ArretGlobal extends Error {
  constructor(public readonly motifs: readonly string[]) {
    super(motifs.length === 1 ? motifs[0] : `${motifs.length} motifs d’arrêt : ${motifs.join(' ‖ ')}`);
    this.name = 'ArretGlobal';
  }
}

export interface OptionsOuvriers<T> {
  parallele: number;
  /** Le contrôle d'empreinte, exécuté toutes les `controleToutes` COPIES, ouvriers à l'arrêt. Il lève s'il faut arrêter. */
  controleToutes?: number;
  controle?: () => Promise<void>;
  /**
   * Le travail d'un élément. Rend `'copie'` s'il a créé une copie, `'saute'` sinon (déjà fait, adopté). Il LÈVE pour
   * arrêter. `arrete()` lui permet de vérifier, juste avant d'écrire, qu'aucun autre ouvrier n'a arrêté entre-temps.
   */
  travail: (element: T, arrete: () => boolean) => Promise<'copie' | 'saute'>;
  /** Chaque motif d'arrêt y est écrit, un par un. */
  journal: (ligne: string) => void;
  /** Une borne facultative : on s'arrête PROPREMENT après ce nombre de copies (essai court). */
  maxCopies?: number;
}

export interface BilanOuvriers { traites: number; copies: number; controles: number; borneAtteinte: boolean }

/**
 * FAIT TRAVAILLER `parallele` OUVRIERS SUR LA LISTE.
 *   🔴 Au premier motif d'arrêt (écart, refus, trop d'erreurs, contrôle d'empreinte), un drapeau partagé se lève :
 *      AUCUN ouvrier ne prend plus d'élément, et le travail en cours peut le lire (`arrete()`) avant d'écrire. On
 *      attend que TOUS aient rendu la main (`allSettled`), on écrit CHAQUE motif au journal, puis on lève `ArretGlobal`.
 *   🔴 Toutes les `controleToutes` copies, les ouvriers s'arrêtent ensemble et le contrôle d'empreinte S'EXÉCUTE.
 */
export async function faireTravaillerOuvriers<T>(elements: readonly T[], o: OptionsOuvriers<T>): Promise<BilanOuvriers> {
  let i = 0;
  let copies = 0;
  let depuisControle = 0;
  let controles = 0;
  let arret = false;
  let borneAtteinte = false;
  const motifs: string[] = [];
  const arrete = (): boolean => arret;
  const borne = o.controleToutes ?? Number.POSITIVE_INFINITY;

  const arreter = (m: string): void => {
    arret = true;
    motifs.push(m);
    o.journal(`ARRÊT GLOBAL (motif ${motifs.length}) : ${m}`);
  };

  // Les éléments EN VOL comptent comme des copies possibles : ni le contrôle ni la borne d'essai ne sont dépassés.
  let enVol = 0;
  while (i < elements.length && !arret && !borneAtteinte) {
    const ouvrier = async (): Promise<void> => {
      while (!arret && i < elements.length && depuisControle + enVol < borne) {
        if (o.maxCopies !== undefined && copies + enVol >= o.maxCopies) {
          if (copies >= o.maxCopies) borneAtteinte = true;
          return;
        }
        const e = elements[i];
        i += 1;
        enVol += 1;
        try {
          const r = await o.travail(e, arrete);
          if (r === 'copie') { copies += 1; depuisControle += 1; }
        } catch (x) {
          arreter((x as Error).message);
        } finally {
          enVol -= 1;
        }
      }
    };
    await Promise.allSettled(Array.from({ length: Math.max(1, o.parallele) }, ouvrier));
    if (arret) break;
    if (o.controle !== undefined && depuisControle >= borne) {
      try {
        await o.controle();
        controles += 1;
        depuisControle = 0;
      } catch (x) {
        arreter(`contrôle d’empreinte : ${(x as Error).message}`);
      }
    }
  }
  if (arret) throw new ArretGlobal(motifs);
  return { traites: i, copies, controles, borneAtteinte };
}

// ══ LA REPRISE : UNE COPIE RETROUVÉE N'EST ADOPTÉE QUE SI ELLE EST CONFORME ══════════════════════════════════════════

/** Une copie trouvée dans un dossier de destination, avec ses étiquettes. */
export interface CopieTrouvee extends FicheFichier {
  id: string;
  sourceId: string | null;
  sourceModifie: string | null;
}

export type DecisionAdoption =
  | { action: 'copier' }
  | { action: 'adopter'; id: string }
  | { action: 'arreter'; motif: string };

/**
 * QUE FAIRE D'UNE SOURCE AU VU DE SON DOSSIER DE DESTINATION ? PUR.
 *   · aucune copie étiquetée pour cette source et cette version → la copier ;
 *   · une seule, CONFORME (`jugerCopie`) → l'adopter ;
 *   · une seule NON conforme, ou plusieurs → ARRÊTER : on n'adopte jamais une copie fautive, et on ne fabrique pas de
 *     doublon à côté d'elle. C'est à la revérification (et à Arno) de la traiter.
 */
export function deciderAdoption(
  source: FicheFichier & { id: string; modifie: string }, trouvees: readonly CopieTrouvee[],
): DecisionAdoption {
  const siennes = trouvees.filter((c) => c.sourceId === source.id && c.sourceModifie === source.modifie);
  if (siennes.length === 0) return { action: 'copier' };
  if (siennes.length > 1) {
    return { action: 'arreter', motif: `${siennes.length} copies étiquetées pour ${source.id} (${siennes.map((c) => c.id).join(', ')}) — doublon` };
  }
  const j = jugerCopie(source, siennes[0]);
  if (!j.ok) return { action: 'arreter', motif: `copie ${siennes[0].id} de ${source.id} NON conforme (${j.detail}) — jamais adoptée` };
  return { action: 'adopter', id: siennes[0].id };
}
