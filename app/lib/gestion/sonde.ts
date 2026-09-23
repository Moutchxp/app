/**
 * MODULE « GESTION » — LOT 0 : CŒUR PUR de la SONDE du dossier IMAP « GESTION ».
 *
 * 🔒 LECTURE SEULE PAR CONSTRUCTION : ce module n'a AUCUNE I/O — ni base, ni réseau, ni imapflow, ni système de fichiers.
 * Il ne fait que MESURER un lot de messages déjà lus et en composer un rapport texte. Le câblage réel (connexion IMAP en
 * `readOnly`) vit dans `app/scripts/sonder-gestion.ts`, qui n'appelle QUE des fonctions exportées d'`app/lib/email/imap.ts`
 * (fichier NON modifié par ce lot : la règle « un seul importeur d'imapflow » est préservée).
 *
 * POURQUOI CE LOT EXISTE : trois faits ne se lisent pas dans le code, seulement dans la vraie boîte, et chacun décide de
 * l'ergonomie du module (cf. rapport de recon) :
 *   (a) les réponses SORTANTES de gestion@criterimmo.fr sont-elles recopiées sous le libellé ? → sans elles, une carte ne
 *       montre qu'une moitié de conversation ;
 *   (b) quelle part du flux porte une référence MNG-… en objet ? → décide si la lecture de ces références vaut un lot ;
 *   (c) les en-têtes de fil (Message-ID / In-Reply-To / References) ont-ils survécu à la recopie ? → décide si « un fil de
 *       discussion par ligne » se calcule à partir des en-têtes (voie pure) ou exige l'identifiant de fil natif de Gmail.
 *
 * ⚠️ AUCUNE de ces mesures n'écrit quoi que ce soit, nulle part. Le lot 0 ne crée aucune table et ne touche pas au permis.
 */
import { normaliserMessageId } from '../veille/rapportRejet';
import {
  destinatairesDe, indiceAutomatisme, normaliserObjet, palmares, REGLE_ANONYMISATION, REGLE_AUTOMATISME,
  type Palmares,
} from './typologie';

// ⚠️ `normaliserMessageId` est IMPORTÉ, pas recopié : c'est la SOURCE UNIQUE de la normalisation d'un Message-ID dans le dépôt
//   (module PUR — aucune I/O, aucun pg, aucun imapflow : son en-tête le déclare et le graphe d'imports le confirme). Dupliquer
//   la règle ici garantirait une divergence le jour où l'une des deux évolue. Le module Permis n'est PAS modifié pour autant :
//   on ne fait que LIRE une fonction pure qu'il expose déjà.

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1) Ce que la sonde observe d'un message (projection MINIMALE de MessageBoite — aucune dépendance de type au module Permis)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Une pièce jointe, vue par la sonde : on ne regarde QUE son type et son poids — jamais son contenu. */
export interface PieceSonde {
  typeMime: string | null;
  tailleOctets: number | null;
}

/** Un message tel que la sonde le mesure. Construit par le CLI à partir de `versMessageBoite` (imap.ts). */
export interface MessageSonde {
  uid: number;
  messageId: string;            // brut, avec chevrons ; '' si absent
  inReplyTo: string | null;
  references: string[];
  deAdresse: string;
  objet: string | null;
  corpsTexte: string | null;
  entetes: Record<string, string>; // noms d'en-tête en minuscules (mailparser)
  pieces: PieceSonde[];
}

/** Contexte mesuré CÔTÉ SERVEUR (SEARCH), donc sur la TOTALITÉ de la fenêtre — jamais sur l'échantillon. */
export interface ContexteSonde {
  dossier: string;              // chemin IMAP réellement ouvert
  jours: number;                // profondeur de la fenêtre
  depuis: Date;
  totalFenetre: number;         // UID renvoyés par SEARCH SINCE (tout le dossier sur la fenêtre)
  sortantsGestion: number;      // UID renvoyés par SEARCH SINCE FROM gestion@criterimmo.fr  ← mesure (a), exhaustive
  adresseSortante: string;      // l'adresse interrogée (tracée pour que le chiffre soit lisible sans le code)
  echecsTelechargement: number; // messages que la sonde n'a pas pu lire (isolés, jamais fatals)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2) Fonctions pures de mesure
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ÉCHANTILLONNAGE À PAS CONSTANT sur la liste d'UID triée. `max <= 0` ou `max >= uids.length` → TOUT (aucun échantillonnage).
 * Le pas constant ÉTALE l'échantillon sur toute la fenêtre plutôt que de ne prendre que les plus récents : un dossier de
 * courrier a des saisons (relances de loyer en début de mois, sinistres l'hiver) et les 150 derniers messages ne couvrent
 * que quelques jours. PUR, déterministe, jamais aléatoire (deux passes donnent le même échantillon → comparables).
 */
export function echantillonner(uids: readonly number[], max: number): number[] {
  const tries = [...uids].sort((a, b) => a - b);
  if (max <= 0 || tries.length <= max) return tries;
  const pris = new Set<number>();
  for (let i = 0; i < max; i++) pris.add(tries[Math.floor((i * tries.length) / max)]);
  return [...pris].sort((a, b) => a - b);
}

/** Domaine d'une adresse e-mail (minuscules), ou '' si l'adresse n'en porte pas. PUR. */
export function domaineDe(adresse: string): string {
  const at = adresse.lastIndexOf('@');
  return at === -1 ? '' : adresse.slice(at + 1).trim().toLowerCase().replace(/>$/, '');
}

/** Domaine porté par un Message-ID (`<abc@mail.gmail.com>` → `mail.gmail.com`), ou '' s'il n'en porte pas. PUR. */
export function domaineIdentifiant(messageId: string): string {
  return domaineDe(normaliserMessageId(messageId));
}

/**
 * L'objet est-il celui d'une RÉPONSE ou d'un TRANSFERT ? Préfixes FR + EN, avec ou sans compteur (`Re:`, `RE :`, `Rép :`,
 * `Re[2]:`, `Fwd:`, `TR :`). Sert à ne mesurer la présence d'ancres de fil que là où elle DOIT exister : un premier message
 * n'a légitimement ni In-Reply-To ni References — l'inclure ferait passer une boîte saine pour cassée. PUR.
 */
export function estReponseOuTransfert(objet: string | null): boolean {
  if (objet === null) return false;
  return /^\s*(?:re|r[ée]p(?:onse)?|fwd?|tr|transf(?:ert)?)\s*(?:\[\d+\])?\s*:/i.test(objet);
}

/** Références MNG-… DISTINCTES d'un texte, en MAJUSCULES. Lecture de TEXTE, sans aucun appel à Monga. PUR. */
export function referencesMng(texte: string | null): string[] {
  if (texte === null) return [];
  return [...new Set((texte.match(/MNG-\d+/gi) ?? []).map((r) => r.toUpperCase()))];
}

/**
 * En-têtes posés par une REDIRECTION AUTOMATIQUE (Gmail « Transférer une copie »). Leur présence est l'indice que la copie
 * est une redirection — laquelle CONSERVE le Message-ID d'origine — et non un transfert manuel, qui en frappe un nouveau et
 * casse le fil. Indice, jamais preuve : on le présente comme tel dans le rapport. PUR.
 */
export function aEnteteRedirection(entetes: Record<string, string>): boolean {
  const cles = new Set(Object.keys(entetes).map((k) => k.toLowerCase()));
  return ['x-forwarded-for', 'x-forwarded-to', 'x-gm-original-to', 'delivered-to', 'resent-from'].some((k) => cles.has(k));
}

/** Tous les identifiants de fil NORMALISÉS d'un message (le sien + ses ancres), non vides et dédupliqués. PUR. */
export function identifiantsFil(m: MessageSonde): string[] {
  const bruts = [m.messageId, m.inReplyTo ?? '', ...m.references];
  return [...new Set(bruts.map((b) => normaliserMessageId(b)).filter((b) => b !== ''))];
}

/**
 * REGROUPEMENT EN FILS par COMPOSANTES CONNEXES sur `Message-ID ∪ In-Reply-To ∪ References` (union-find). C'est la voie PURE :
 * aucun appel réseau, aucune dépendance à Gmail, rejouable hors ligne sur un export. Deux messages qui citent un même
 * identifiant — même absent de la boîte — tombent dans le même fil ; un message SANS aucun identifiant reste seul (clé de
 * repli sur son UID, jamais fusionné au hasard). Renvoie les fils, chacun trié par UID croissant. PUR.
 */
export function grouperEnFils(messages: readonly MessageSonde[]): MessageSonde[][] {
  const parent = new Map<string, string>();
  const trouver = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    let c = x; // compression de chemin
    while (parent.get(c) !== undefined && parent.get(c) !== c) { const suiv = parent.get(c)!; parent.set(c, r); c = suiv; }
    return r;
  };
  const unir = (a: string, b: string): void => {
    if (parent.get(a) === undefined) parent.set(a, a);
    if (parent.get(b) === undefined) parent.set(b, b);
    const ra = trouver(a), rb = trouver(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const clePar = new Map<number, string>();
  for (const m of messages) {
    const ids = identifiantsFil(m);
    if (ids.length === 0) { const seul = `uid:${m.uid}`; parent.set(seul, seul); clePar.set(m.uid, seul); continue; }
    for (const id of ids) unir(ids[0], id);
    clePar.set(m.uid, ids[0]);
  }

  const parRacine = new Map<string, MessageSonde[]>();
  for (const m of messages) {
    const racine = trouver(clePar.get(m.uid)!);
    const groupe = parRacine.get(racine);
    if (groupe) groupe.push(m); else parRacine.set(racine, [m]);
  }
  return [...parRacine.values()].map((g) => [...g].sort((a, b) => a.uid - b.uid));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3) Synthèse
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SyntheseType { type: string; nb: number; octets: number }

/**
 * LOT 0-bis — profil d'UN SENS du flux (ce qui sort / ce qui entre). Tout y est un COMPTE ou un GABARIT : aucune adresse
 * complète, aucun nom. C'est ce bloc qui répond à « la file sera-t-elle noyée ? ».
 */
export interface ProfilSens {
  total: number;
  automatiques: number;          // indice `indiceAutomatisme` (règle affichée en clair dans le rapport)
  reponses: number;              // In-Reply-To présent → s'inscrit dans un échange
  multiDestinataires: number;    // 2 destinataires ou plus (To + Cc), COMPTÉS, jamais rendus
  sansDestinataireLisible: number; // ni To ni Cc exploitables (liste de diffusion, Bcc…)
  parSignal: { signal: string; nb: number }[]; // quel signal a classé, et combien de fois — pour juger la règle
  objets: Palmares;
  domaines: Palmares | null;     // côté REÇU seulement (côté envoyé, l'expéditeur est constant par construction)
}

export interface Synthese {
  contexte: ContexteSonde;
  analyses: number;                 // messages RÉELLEMENT lus (l'échantillon, moins les échecs)
  couvertureTotale: boolean;        // l'échantillon couvre-t-il TOUT le dossier sur la fenêtre ? (décide si les fils sont exacts)
  // (a) sortants
  sortantsEchantillon: number;
  // (b) références MNG
  mngObjet: number; mngObjetRefs: number; mngCorps: number; mngRefsToutes: number;
  // (c) identité et fils
  sansMessageId: number;
  domaineIdentifiantConforme: number;   // domaine du Message-ID == domaine de l'expéditeur → identifiant d'ORIGINE conservé
  avecEnteteRedirection: number;
  reponses: number; reponsesAvecAncre: number;
  nbFils: number; plusGrandFil: number;
  // pièces
  messagesAvecPieces: number; nbPieces: number; octetsPieces: number; plusGrossePiece: number;
  parType: SyntheseType[];
  // (d) et (e) — typologie du flux, par sens
  envois: ProfilSens;
  recus: ProfilSens;
  recusMemeDomaine: number;      // reçus venant d'une AUTRE adresse du domaine de la boîte de gestion (courrier interne)
}

/** Construit le profil d'un sens. PUR : ne compte que ce qu'on lui donne, ne rend jamais une adresse. */
function profiler(messages: readonly MessageSonde[], avecDomaines: boolean): ProfilSens {
  const signaux = new Map<string, number>();
  let automatiques = 0, reponses = 0, multiDestinataires = 0, sansDestinataireLisible = 0;
  const objets: string[] = [], domaines: string[] = [];

  for (const m of messages) {
    const indice = indiceAutomatisme(m.deAdresse, m.entetes);
    if (indice.automatique) automatiques += 1;
    for (const motif of indice.motifs) signaux.set(motif, (signaux.get(motif) ?? 0) + 1);

    if ((m.inReplyTo ?? '').trim() !== '') reponses += 1;

    const dest = destinatairesDe(m.entetes); // COMPTÉS uniquement — aucune adresse ne sort d'ici
    if (dest.length === 0) sansDestinataireLisible += 1;
    else if (dest.length >= 2) multiDestinataires += 1;

    objets.push(normaliserObjet(m.objet));
    if (avecDomaines) { const d = domaineDe(m.deAdresse); if (d !== '') domaines.push(d); }
  }

  return {
    total: messages.length, automatiques, reponses, multiDestinataires, sansDestinataireLisible,
    parSignal: [...signaux.entries()].map(([signal, nb]) => ({ signal, nb })).sort((a, b) => b.nb - a.nb || a.signal.localeCompare(b.signal)),
    objets: palmares(objets),
    // Les DOMAINES ne passent pas par le seuil d'occurrences : un domaine n'identifie personne (orange.fr, monga.io),
    //   et c'est justement la liste qu'il faut voir en entier pour reconnaître les plateformes.
    domaines: avecDomaines ? palmares(domaines, 15, 1) : null,
  };
}

/** Compose la synthèse. PURE : ne lit rien, n'écrit rien — elle ne fait que compter ce qu'on lui donne. */
export function synthetiser(contexte: ContexteSonde, messages: readonly MessageSonde[]): Synthese {
  const fils = grouperEnFils(messages);
  const parType = new Map<string, SyntheseType>();
  const refsToutes = new Set<string>();
  const refsObjet = new Set<string>();

  let sortantsEchantillon = 0, mngObjet = 0, mngCorps = 0;
  let sansMessageId = 0, domaineIdentifiantConforme = 0, avecEnteteRedirection = 0;
  let reponses = 0, reponsesAvecAncre = 0;
  let messagesAvecPieces = 0, nbPieces = 0, octetsPieces = 0, plusGrossePiece = 0;

  const adresseSortante = contexte.adresseSortante.trim().toLowerCase();
  for (const m of messages) {
    if (m.deAdresse.trim().toLowerCase() === adresseSortante) sortantsEchantillon += 1;

    const enObjet = referencesMng(m.objet);
    const enCorps = referencesMng(m.corpsTexte);
    if (enObjet.length > 0) mngObjet += 1;
    if (enCorps.length > 0) mngCorps += 1;
    for (const r of enObjet) { refsObjet.add(r); refsToutes.add(r); }
    for (const r of enCorps) refsToutes.add(r);

    if (m.messageId.trim() === '') sansMessageId += 1;
    else if (domaineIdentifiant(m.messageId) !== '' && domaineIdentifiant(m.messageId) === domaineDe(m.deAdresse)) domaineIdentifiantConforme += 1;
    if (aEnteteRedirection(m.entetes)) avecEnteteRedirection += 1;

    if (estReponseOuTransfert(m.objet)) {
      reponses += 1;
      if ((m.inReplyTo ?? '').trim() !== '' || m.references.length > 0) reponsesAvecAncre += 1;
    }

    if (m.pieces.length > 0) messagesAvecPieces += 1;
    for (const p of m.pieces) {
      nbPieces += 1;
      const octets = p.tailleOctets ?? 0;
      octetsPieces += octets;
      if (octets > plusGrossePiece) plusGrossePiece = octets;
      const type = (p.typeMime ?? '(inconnu)').trim().toLowerCase() || '(inconnu)';
      const ligne = parType.get(type);
      if (ligne) { ligne.nb += 1; ligne.octets += octets; } else parType.set(type, { type, nb: 1, octets });
    }
  }

  // (d)/(e) — partage du flux par SENS. « Envoyé » = expéditeur STRICTEMENT égal à l'adresse de gestion ; tout le reste est
  //   « reçu ». Le courrier venu d'une AUTRE adresse du même domaine est compté à part : c'est du courrier interne, qui
  //   gonflerait la file sans être une demande d'un tiers.
  const envoyes = messages.filter((m) => m.deAdresse.trim().toLowerCase() === adresseSortante);
  const recus = messages.filter((m) => m.deAdresse.trim().toLowerCase() !== adresseSortante);
  const domaineGestion = domaineDe(adresseSortante);

  return {
    contexte, analyses: messages.length,
    couvertureTotale: messages.length + contexte.echecsTelechargement >= contexte.totalFenetre,
    envois: profiler(envoyes, false),
    recus: profiler(recus, true),
    recusMemeDomaine: domaineGestion === '' ? 0 : recus.filter((m) => domaineDe(m.deAdresse) === domaineGestion).length,
    sortantsEchantillon,
    mngObjet, mngObjetRefs: refsObjet.size, mngCorps, mngRefsToutes: refsToutes.size,
    sansMessageId, domaineIdentifiantConforme, avecEnteteRedirection,
    reponses, reponsesAvecAncre,
    nbFils: fils.length, plusGrandFil: fils.reduce((max, f) => Math.max(max, f.length), 0),
    messagesAvecPieces, nbPieces, octetsPieces, plusGrossePiece,
    parType: [...parType.values()].sort((a, b) => b.nb - a.nb || a.type.localeCompare(b.type)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4) Rapport texte
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Pourcentage lisible (`n/total`), ou '—' si le total est nul (jamais « 0 % » là où il n'y avait rien à mesurer). PUR. */
export function part(n: number, total: number): string {
  return total <= 0 ? '—' : `${Math.round((n / total) * 100)} %`;
}

/** Poids lisible (Ko/Mo). PUR. */
export function poids(octets: number): string {
  if (octets <= 0) return '0 o';
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Rend un palmarès, seuil d'affichage compris (ce qui est masqué est ANNONCÉ, jamais escamoté). PUR. */
function lignesPalmares(p: Palmares, indentation: string): string[] {
  const l = p.lignes.map((x) => `${indentation}${String(x.nb).padStart(5, ' ')}  ${x.valeur}`);
  if (p.lignes.length === 0) l.push(`${indentation}(aucune valeur au-dessus du seuil d'affichage)`);
  if (p.restantes > 0) l.push(`${indentation}… et ${p.restantes} autre(s) gabarit(s) au-dessus du seuil, hors du classement`);
  if (p.masquees > 0) l.push(`${indentation}(${p.masquees} gabarit(s) vu(s) moins de 3 fois, ${p.masqueesOccurrences} message(s) — comptés, non montrés : anonymisation)`);
  return l;
}

/** Rend le profil d'un sens (d ou e). PUR. */
function bloc(titre: string, precision: string, p: ProfilSens, totalAnalyse: number): string[] {
  const l: string[] = [];
  l.push(`──  ${titre} — ${precision}  ${'─'.repeat(Math.max(3, 78 - (titre.length + precision.length + 9)))}`);
  l.push(`  messages de ce sens dans l'échantillon : ${p.total} sur ${totalAnalyse}  (${part(p.total, totalAnalyse)})`);
  if (p.total === 0) { l.push('  (rien à profiler dans ce sens)'); return l; }
  l.push(`  probablement AUTOMATIQUES              : ${p.automatiques}  (${part(p.automatiques, p.total)})`);
  l.push(`  probablement HUMAINS                   : ${p.total - p.automatiques}  (${part(p.total - p.automatiques, p.total)})`);
  l.push(`  s'inscrivant dans un échange (In-Reply-To) : ${p.reponses}  (${part(p.reponses, p.total)})`);
  l.push(`  à PLUSIEURS destinataires (To + Cc)    : ${p.multiDestinataires}  (${part(p.multiDestinataires, p.total)})`);
  l.push(`  sans destinataire lisible (diffusion, Cci) : ${p.sansDestinataireLisible}  (${part(p.sansDestinataireLisible, p.total)})`);
  l.push('  signaux qui ont classé « automatique » :');
  if (p.parSignal.length === 0) l.push('      (aucun)');
  for (const s of p.parSignal) l.push(`      ${s.signal.padEnd(28, ' ')} ${String(s.nb).padStart(5, ' ')}`);
  if (p.domaines !== null) {
    l.push('  domaines d\'expéditeurs les plus fréquents :');
    l.push(...lignesPalmares(p.domaines, '      '));
  }
  l.push('  objets NORMALISÉS les plus fréquents :');
  l.push(...lignesPalmares(p.objets, '      '));
  return l;
}

/**
 * Compose le rapport, ligne à ligne. PUR (aucun `console.log` ici — l'impression est au CLI, donc le rapport est TESTABLE).
 * Les TROIS MESURES DEMANDÉES sont regroupées et nommées : elles décident de l'ergonomie, elles ne doivent pas se chercher.
 */
export function formaterRapport(s: Synthese): string[] {
  const c = s.contexte;
  const l: string[] = [];
  l.push('');
  l.push('══════════════════════════════════════════════════════════════════════════════');
  l.push('  SONDE DE LA BOÎTE DE GESTION — LECTURE STRICTE (aucune écriture, nulle part)');
  l.push('══════════════════════════════════════════════════════════════════════════════');
  l.push(`  dossier IMAP ouvert        : ${c.dossier}`);
  l.push(`  fenêtre                    : ${c.jours} jours (depuis le ${c.depuis.toISOString().slice(0, 10)})`);
  l.push(`  messages dans la fenêtre   : ${c.totalFenetre}  (compté côté serveur, exhaustif)`);
  l.push(`  messages analysés          : ${s.analyses}${c.echecsTelechargement > 0 ? `  (+ ${c.echecsTelechargement} illisibles, ignorés)` : ''}`);
  if (!s.couvertureTotale) {
    l.push('  ⚠ ÉCHANTILLON PARTIEL, à pas constant sur toute la fenêtre. Les chiffres ci-dessous sont des TAUX.');
    l.push('    Le nombre de fils est MINORÉ (des messages d\'un même échange manquent) → relancer avec --echantillon=0 pour l\'exact.');
  }
  l.push('');
  l.push('──  LES TROIS MESURES QUI DÉCIDENT DE L\'ERGONOMIE  ───────────────────────────');
  l.push('');
  l.push(`  (a) RÉPONSES SORTANTES recopiées sous le libellé`);
  l.push(`      messages envoyés par ${c.adresseSortante} : ${c.sortantsGestion} sur ${c.totalFenetre}  (${part(c.sortantsGestion, c.totalFenetre)}) — compté côté serveur, exhaustif`);
  l.push(`      (recoupement sur l'échantillon : ${s.sortantsEchantillon} sur ${s.analyses})`);
  l.push(c.sortantsGestion === 0
    ? '      → AUCUNE réponse sortante dans le libellé : une carte ne montrera QUE ce qui arrive, jamais ce qui a été répondu.'
    : '      → les réponses sortantes SONT là : une carte pourra montrer la conversation des deux côtés.');
  l.push('');
  l.push(`  (b) RÉFÉRENCES MNG- présentes dans le texte`);
  l.push(`      messages dont l'OBJET porte une référence MNG- : ${s.mngObjet} sur ${s.analyses}  (${part(s.mngObjet, s.analyses)})`);
  l.push(`      références MNG- DISTINCTES vues en objet       : ${s.mngObjetRefs}`);
  l.push(`      (appoint — messages dont le CORPS en porte une : ${s.mngCorps} ; références distinctes objet+corps : ${s.mngRefsToutes})`);
  l.push('');
  l.push(`  (c) EN-TÊTES DE FIL : ont-ils survécu à la recopie ?`);
  l.push(`      messages SANS Message-ID                       : ${s.sansMessageId} sur ${s.analyses}  (${part(s.sansMessageId, s.analyses)})`);
  l.push(`      Message-ID du domaine de l'expéditeur          : ${s.domaineIdentifiantConforme} sur ${s.analyses}  (${part(s.domaineIdentifiantConforme, s.analyses)})  ← indice « identifiant d'ORIGINE conservé »`);
  l.push(`      messages portant un en-tête de redirection     : ${s.avecEnteteRedirection} sur ${s.analyses}  (${part(s.avecEnteteRedirection, s.analyses)})  ← indice « copie par redirection, pas par transfert »`);
  l.push(`      réponses/transferts (objet « Re: », « TR : »)  : ${s.reponses}`);
  l.push(`      …dont In-Reply-To ou References exploitables   : ${s.reponsesAvecAncre}  (${part(s.reponsesAvecAncre, s.reponses)})  ← LA mesure décisive`);
  l.push(`      fils reconstitués sur l'échantillon            : ${s.nbFils} fils pour ${s.analyses} messages (plus grand fil : ${s.plusGrandFil} message(s))`);
  l.push(s.reponses === 0
    ? '      → aucune réponse dans l\'échantillon : indécis, élargir la fenêtre ou l\'échantillon.'
    : s.reponsesAvecAncre * 100 >= s.reponses * 90
      ? '      → en-têtes EXPLOITABLES : « un fil par ligne » se calcule à partir des en-têtes, voie PURE, sans dépendance à Gmail.'
      : '      → en-têtes ABÎMÉS par la recopie : prévoir l\'identifiant de fil natif de Gmail (X-GM-THRID) au lot 3.');
  l.push('');
  l.push(...bloc('(d) CE QUI SORT', `émis par ${c.adresseSortante}`, s.envois, s.analyses));
  l.push('');
  l.push(...bloc('(e) CE QUI ENTRE', 'tout le reste', s.recus, s.analyses));
  if (s.recusMemeDomaine > 0) {
    l.push(`  ⓘ dont ${s.recusMemeDomaine} venu(s) d'une AUTRE adresse du domaine de la gestion : c'est du courrier INTERNE,`);
    l.push('    qui gonflerait la file sans être la demande d\'un tiers. À écarter ou à marquer, au lot 3.');
  }
  l.push('');
  l.push('──  (f) LA RÈGLE « humain / automatique », EN CLAIR — juge-la  ───────────────');
  for (const ligne of REGLE_AUTOMATISME) l.push(ligne === '' ? '' : `  ${ligne}`);
  l.push('');
  l.push('──  ANONYMISATION — ce que ce rapport ne montre jamais  ──────────────────────');
  for (const ligne of REGLE_ANONYMISATION) l.push(ligne === '' ? '' : `  ${ligne}`);
  l.push('');
  l.push('──  PIÈCES JOINTES (ce que le stockage devra accepter)  ──────────────────────');
  l.push(`  messages avec pièce(s) : ${s.messagesAvecPieces} sur ${s.analyses}  (${part(s.messagesAvecPieces, s.analyses)})`);
  l.push(`  pièces au total        : ${s.nbPieces}  ·  poids cumulé ${poids(s.octetsPieces)}  ·  plus grosse ${poids(s.plusGrossePiece)}`);
  if (s.parType.length === 0) l.push('  (aucune pièce jointe dans l\'échantillon)');
  for (const t of s.parType) l.push(`    ${t.type.padEnd(56, ' ')} ${String(t.nb).padStart(4, ' ')} pièce(s)  ${poids(t.octets)}`);
  l.push('');
  l.push('  ⓘ Les types listés ci-dessus seront comparés à la liste d\'acceptation du stockage au lot 3 :');
  l.push('    la liste actuelle est celle du module Permis (urbanisme) et ne connaît PAS image/heic (photo iPhone).');
  l.push('');
  l.push('  ⓘ Non mesurable à ce lot : l\'identifiant de fil natif de Gmail (X-GM-THRID) n\'est pas un en-tête du message,');
  l.push('    c\'est une donnée de protocole — l\'obtenir exigerait de modifier app/lib/email/imap.ts, hors périmètre du lot 0.');
  l.push('    C\'est précisément la mesure (c) ci-dessus qui dit si on en a besoin.');
  l.push('');
  l.push('══════════════════════════════════════════════════════════════════════════════');
  l.push('  Aucune écriture n\'a eu lieu : ni en base, ni sur le stockage, ni dans la boîte.');
  l.push('══════════════════════════════════════════════════════════════════════════════');
  l.push('');
  return l;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5) Options de ligne de commande (pures, donc testables sans lancer le CLI)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Entier > 0 d'une option `--nom=N`, sinon `defaut`. `--nom=0` est ACCEPTÉ si `zeroPermis` (0 = « tout »). PUR. */
export function lireEntier(argv: readonly string[], nom: string, defaut: number, zeroPermis = false): number {
  const brut = argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1];
  if (brut === undefined) return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n)) return defaut;
  if (n > 0) return n;
  return zeroPermis && n === 0 ? 0 : defaut;
}

/** Valeur d'une option texte `--nom=valeur`, sinon `defaut`. PUR. */
export function lireTexte(argv: readonly string[], nom: string, defaut: string): string {
  const brut = argv.find((a) => a.startsWith(`--${nom}=`))?.split('=').slice(1).join('=');
  return brut !== undefined && brut.trim() !== '' ? brut.trim() : defaut;
}

/**
 * CHOISIT le dossier IMAP à ouvrir parmi ceux que le serveur annonce. Un libellé Gmail EST un dossier IMAP, mais son chemin
 * exact n'est pas devinable (casse, accents, préfixe de hiérarchie, sous-libellé). On essaie, dans l'ordre : égalité exacte,
 * égalité insensible à la casse, dernier segment du chemin (séparateur `/`, celui de Gmail), puis inclusion. `null` si rien
 * ne correspond — le CLI affiche alors la liste complète plutôt que d'ouvrir un dossier au hasard. PUR.
 */
export function choisirDossier(boites: readonly string[], demande: string): string | null {
  const d = demande.trim();
  if (d === '') return null;
  const dMin = d.toLowerCase();
  const dernier = (chemin: string): string => chemin.split('/').pop() ?? chemin;
  return boites.find((b) => b === d)
    ?? boites.find((b) => b.toLowerCase() === dMin)
    ?? boites.find((b) => dernier(b).toLowerCase() === dMin)
    ?? boites.find((b) => b.toLowerCase().includes(dMin))
    ?? null;
}
