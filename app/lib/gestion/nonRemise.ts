/**
 * MODULE « GESTION » — LOT ENVOI-DIAG : LIRE UN AVIS DE NON-REMISE. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE PROBLÈME QU'IL RÉSOUT, ET IL EST GRAVE. Quand un mail n'arrive pas, le serveur distant le DIT — il renvoie un
 * avis de non-remise dans la boîte de gestion@. Il y en a 137 en base. Jusqu'ici ils y dormaient comme des messages
 * ordinaires, dans un échange à eux, sans aucun lien avec le message qu'ils concernent. Résultat : l'application
 * affichait « envoyé » pour un mail refusé par le serveur d'en face, et personne ne le savait — sauf à lire un mail
 * en anglais intitulé « Delivery Status Notification (Failure) », au milieu de tout le reste.
 *
 * Un envoi « accepté par Gmail » n'est PAS un envoi « arrivé ». Gmail accepte, met en file, puis tente la remise : le
 * refus survient des secondes ou des heures plus tard. Aucune réponse à l'appel d'envoi ne peut donc le prévoir — la
 * seule vérité sur l'arrivée est l'avis qui revient, ou son absence.
 *
 * ═══ 🔴 CE QU'ON NE DEVINE JAMAIS ════════════════════════════════════════════════════════════════════════════════
 * ① QUEL MESSAGE EST CONCERNÉ. On ne CHOISIT pas le bon `Message-ID` dans l'avis : on ramasse TOUS ceux qu'il porte
 *    et on demande à la base lequel elle connaît. C'est indispensable, parce qu'un avis contient aussi les en-têtes
 *    DKIM de l'original, dont des lignes `h=…:message-id:…` qu'une lecture naïve prendrait pour le champ lui-même.
 *    Laisser la base trancher, c'est ne jamais rattacher un avis au mauvais message.
 * ② PERMANENT OU TEMPORAIRE. `Status: 5.x.x` = c'est fini, le mail n'arrivera pas. `4.x.x` = le serveur distant
 *    réessaiera (boîte pleine, serveur injoignable). Les confondre ferait annoncer « non distribué » pour un retard
 *    qui se résoudra tout seul — et l'équipe rappellerait un locataire pour rien.
 * ③ CE QU'ON NE SAIT PAS LIRE RESTE NON LU. Sur les 137 avis en base, 73 portent un rapport machine complet. Les
 *    autres sont des messages de courtoisie sans rapport structuré : on ne leur invente pas de motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'un avis nous apprend. `null` partout = l'avis n'était pas lisible, et on ne comble pas les trous. */
export interface AvisNonRemise {
  /** L'adresse qui n'a pas reçu. C'est elle qu'un humain veut lire en premier. */
  destinataire: string | null;
  /** `failed` (définitif), `delayed` (temporaire), `relayed`/`delivered` (pas un échec). */
  action: string | null;
  /** Le code SMTP étendu, `5.7.1` par exemple. */
  statut: string | null;
  /** La phrase du serveur distant, telle qu'il l'a écrite. C'est elle qui dit POURQUOI. */
  diagnostic: string | null;
  /** Tous les `Message-ID` cités par l'avis, dans l'ordre de confiance décroissante. À confronter à la base. */
  candidats: string[];
  /** Jusqu'à quand le serveur réessaiera, pour un retard. */
  reessaiJusqua: string | null;
}

/** Le verdict, une fois l'avis lu. */
export type SorteNonRemise = 'permanent' | 'temporaire' | 'aucun';

/**
 * EST-CE UN AVIS DE NON-REMISE ? PUR.
 *
 * ⚠️ TROIS SIGNAUX, ET IL EN FAUT UN SEUL — mais le rapport machine, lui, compte double. Un mail dont l'objet
 * commence par « Re: Delivery Status Notification » est une RÉPONSE HUMAINE à un avis, pas un avis : c'est pour
 * l'écarter que l'objet est testé sans son préfixe de réponse.
 */
export function estAvisNonRemise(m: {
  deAdresse: string | null; objet: string | null; corps: string | null;
}): boolean {
  const de = (m.deAdresse ?? '').toLowerCase();
  const objet = (m.objet ?? '').trim();
  const corps = m.corps ?? '';

  // Une réponse à un avis n'est pas un avis. « Re: », « Fwd: », « TR: », « Rép : »…
  if (/^\s*(re|ré[pf]?|fwd?|tr)\s*:/i.test(objet)) return false;

  const expediteurSysteme = /(mailer-daemon|postmaster|mail-daemon)@/.test(de);
  const objetTypique = /^(delivery status notification|undelivered mail|returned mail|mail delivery|non remis|message non distribu|address not found|échec de la remise|undeliverable)/i
    .test(objet);
  // Le rapport machine (RFC 3464) : deux champs qui n'existent nulle part ailleurs.
  const rapport = /^\s*Final-Recipient:/im.test(corps) && /^\s*Action:/im.test(corps);

  return rapport || (expediteurSysteme && objetTypique) || (expediteurSysteme && rapport);
}

/** La valeur d'un en-tête du rapport, cherchée en début de ligne. `null` si absent. PUR. */
function champ(corps: string, nom: string): string | null {
  const re = new RegExp(`^[ \\t]*${nom}[ \\t]*:[ \\t]*(.*)$`, 'im');
  const v = re.exec(corps)?.[1]?.trim();
  return v === undefined || v === '' ? null : v;
}

/**
 * LE DESTINATAIRE, débarrassé de son préfixe de type. `Final-Recipient: rfc822; jean@exemple.fr` → `jean@exemple.fr`.
 * Les deux formes existent en base (`rfc822;` collé ou espacé selon le serveur). PUR.
 */
function adresseFinale(brut: string | null): string | null {
  if (brut === null) return null;
  const sansType = brut.replace(/^[A-Za-z0-9-]+\s*;\s*/, '').trim();
  const m = /<?([^\s<>,;]+@[^\s<>,;]+)>?/.exec(sansType);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * TOUS LES `Message-ID` CITÉS PAR L'AVIS, du plus fiable au moins fiable. PUR.
 *
 * 🔴 ON NE CHOISIT PAS, ON PROPOSE. `X-Original-Message-ID` est l'en-tête que Google pose exprès pour dire « voici le
 * message dont je parle » : il vient en tête. Viennent ensuite les `Message-ID:` trouvés en début de ligne — dans un
 * avis Exchange, ce sont les en-têtes de l'original recopiés dans le corps. C'est la BASE qui dira lequel elle
 * connaît : une ligne de signature DKIM (`h=…:message-id:…`) ne commence pas par `Message-ID:` et n'est donc pas
 * ramassée, et si elle l'était, aucun message de la base ne lui correspondrait.
 */
export function candidatsMessageId(corps: string): string[] {
  const vus = new Set<string>();
  const ajouter = (v: string | undefined): void => {
    const t = (v ?? '').trim();
    if (t.startsWith('<') && t.endsWith('>') && t.length > 2) vus.add(t);
  };
  ajouter(champ(corps, 'X-Original-Message-ID') ?? undefined);
  for (const m of corps.matchAll(/^[ \t]*Message-ID[ \t]*:[ \t]*(<[^>\n]*>)/gim)) ajouter(m[1]);
  return [...vus];
}

/** LIT UN AVIS. Ne jette jamais : un avis illisible rend des `null`, et c'est une information en soi. PUR. */
export function lireAvis(corps: string | null): AvisNonRemise {
  const c = corps ?? '';
  return {
    destinataire: adresseFinale(champ(c, 'Final-Recipient')),
    action: champ(c, 'Action')?.toLowerCase() ?? null,
    statut: champ(c, 'Status'),
    // `Diagnostic-Code: smtp; 550 5.7.1 …` — on garde la phrase du serveur, sans le préfixe de protocole.
    diagnostic: champ(c, 'Diagnostic-Code')?.replace(/^[A-Za-z0-9-]+\s*;\s*/, '').trim() || null,
    candidats: candidatsMessageId(c),
    reessaiJusqua: champ(c, 'Will-Retry-Until'),
  };
}

/**
 * PERMANENT, TEMPORAIRE, OU PAS UN ÉCHEC ? PUR.
 *
 * 🔴 LE CODE `Status` FAIT FOI QUAND IL EST LÀ, parce qu'il est normalisé (RFC 3463) alors que `Action` et les
 * phrases sont écrites par chaque serveur à sa façon. `5.` = échec définitif, `4.` = le distant réessaiera.
 *
 * ⚠️ `delivered` ET `relayed` NE SONT PAS DES ÉCHECS : certains serveurs envoient un avis de BONNE remise. Les
 * compter comme des non-remises afficherait « non distribué » sur des messages parfaitement arrivés — l'inverse
 * exact du service rendu.
 */
export function sorteAvis(a: AvisNonRemise): SorteNonRemise {
  if (a.action === 'delivered' || a.action === 'relayed' || a.action === 'expanded') return 'aucun';
  const s = (a.statut ?? '').trim();
  if (s.startsWith('5.')) return 'permanent';
  if (s.startsWith('4.')) return 'temporaire';
  if (a.action === 'failed') return 'permanent';
  if (a.action === 'delayed') return 'temporaire';
  return 'aucun';
}

/**
 * LE MOTIF, EN FRANÇAIS, POUR QUELQU'UN QUI N'A PAS ÉCRIT LE CODE. PUR.
 *
 * ⚠️ ON TRADUIT LES CAUSES QU'ON RENCONTRE VRAIMENT, et pour les autres on rend la phrase du serveur telle quelle.
 * Inventer une traduction générique (« erreur de remise ») retirerait la seule information exploitable — un
 * administrateur a besoin du texte exact, et l'équipe a besoin de savoir quoi faire.
 */
export function motifNonRemise(a: AvisNonRemise): string {
  const d = (a.diagnostic ?? '').toLowerCase();
  const s = (a.statut ?? '').trim();

  if (s === '5.1.1' || s === '5.1.10' || /recipient not found|user unknown|address not found|no such user|does not exist/.test(d)) {
    return 'cette adresse n’existe pas chez le destinataire';
  }
  if (s === '5.2.2' || s === '4.2.2' || /out of storage|quota|mailbox full/.test(d)) {
    return 'la boîte du destinataire est pleine';
  }
  if (s === '5.7.1' || /spam policy|rejected per spam|blocked using|listed in|reputation/.test(d)) {
    return 'le serveur du destinataire a refusé le message (filtre anti-spam)';
  }
  if (s.startsWith('5.7.') || /dmarc|spf|dkim|not authorized|authentication/.test(d)) {
    return 'le serveur du destinataire a refusé le message (authentification du domaine)';
  }
  if (s === '4.4.1' || /did not accept our requests to connect|timed out|connection refused|unable to connect/.test(d)) {
    return 'le serveur du destinataire ne répond pas';
  }
  /**
   * ⚠️ « VIDE » VAUT « ABSENT », et ce n'est pas une politesse de style. Un `Diagnostic-Code:` présent mais vide
   * rendait ici la chaîne vide — que la contrainte `btrim(motif) <> ''` de la table refuse. L'INSERT échouait, et
   * c'est l'avis ENTIER qui était perdu : exactement le silence que ce lot existe pour supprimer.
   */
  const phrase = (a.diagnostic ?? '').trim();
  if (phrase !== '') return phrase;
  if (s !== '') return `refus du serveur distant (code ${s})`;
  return 'le serveur distant a signalé un problème de remise, sans en préciser la cause';
}

/**
 * LA PHRASE MONTRÉE À L'ÉCRAN, sur le message d'origine et sur la ligne de la liste. PUR.
 *
 * 🔴 « NON DISTRIBUÉ » N'EST DIT QUE POUR UN ÉCHEC DÉFINITIF. Un retard se dit « remise retardée » : le message
 * peut encore arriver, et faire croire le contraire pousserait à renvoyer inutilement — donc à écrire deux fois au
 * même locataire.
 */
export function phraseNonRemise(o: { sorte: SorteNonRemise; destinataire: string | null; motif: string }): string {
  if (o.sorte === 'aucun') return '';
  const a = o.destinataire === null ? '' : ` à ${o.destinataire}`;
  return o.sorte === 'permanent'
    ? `non distribué${a} : ${o.motif}`
    : `remise retardée${a} : ${o.motif}`;
}
