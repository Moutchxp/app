/**
 * MODULE « GESTION » — LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE : SUR QUEL(S) BIEN(S) LA FENÊTRE DRIVE S'OUVRE.
 * Module PUR : aucune base, aucun réseau, aucun DOM, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « dans la fenêtre d'envoi (Nouveau message, Répondre, Répondre à tous,
 * Transférer), le bouton Drive (▲) et la fenêtre Drive qu'il ouvre se configurent tout seuls sur le ou les biens
 * concernés. »
 *
 * ═══ 🔴🔴 L'ORDRE DE PRIORITÉ EST UNE RÈGLE, PAS UNE PRÉFÉRENCE ════════════════════════════════════════════════
 *
 *   ⓐ LE MAIL (ou sa conversation) EST DÉJÀ RATTACHÉ à un ou plusieurs biens → CES BIENS-LÀ, ET RIEN D'AUTRE.
 *   ⓑ SINON, la PREMIÈRE adresse du champ « À » qui n'est pas une des nôtres, cherchée dans l'annuaire.
 *   ⓒ Aucune correspondance → aucune vignette, et la fenêtre est exactement celle d'avant ce lot.
 *
 * 🔴 « ET RIEN D'AUTRE » EST LA MOITIÉ IMPORTANTE DE ⓐ. Un mail rattaché au lot 418 dont le destinataire est le
 * bailleur de six autres lots ne doit PAS proposer les sept : quelqu'un a déjà tranché en rattachant, et une
 * déduction ne discute pas une décision. Les deux sources ne se mélangent donc jamais — on prend l'une OU
 * l'autre, et ce module ne connaît pas d'autre arbitrage.
 *
 * 🔴 UNE ADRESSE DE L'AGENCE N'EST JAMAIS UNE CLÉ, et ce n'est pas un détail : six fiches WIPPIMMO portent une de
 * nos adresses (nous sommes bailleurs ou preneurs à titre personnel). Répondre à un collègue ouvrirait sinon le
 * dossier d'un logement qui n'a rien à voir avec l'échange. La règle n'est pas réécrite ici : elle vient
 * d'`adresseInterne.ts`, l'unique définition du dépôt, par `adressesRapprochables`.
 *
 * ⚠️ CE MODULE NE SAIT RIEN DU DRIVE NI DE L'ANNUAIRE : il reçoit des biens déjà lus et les met en forme. C'est
 * ce qui le rend éprouvable sans base — et c'est aussi ce qui permet à l'écran d'importer ses mots sans tirer
 * `pg` dans le navigateur (incident du 24/09/2026, tenu par `clientBoundary.guard.test.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * POURQUOI CE BIEN EST PROPOSÉ. C'est ce que la vignette DIT, et c'est ce qui rend le raccourci relisible : on
 * doit pouvoir répondre « parce que » sans ouvrir la fiche.
 *
 * ⚠️ `ancien_locataire` EST UNE RAISON À PART de `locataire`, alors que les deux donnent le même dossier. Le mot
 * change ce qu'on comprend : écrire « locataire » pour quelqu'un parti il y a deux ans ferait douter de tout le
 * reste de la vignette.
 */
export type RaisonBien =
  | 'rattache'
  | 'locataire'
  | 'ancien_locataire'
  | 'proprietaire'
  | 'proprietaire_multi'
  /**
   * 🔴 LA CARTE DE CONTACT CRÉÉE PAR LE « + ». Arno : « mêmes règles que son client, pour le bien concerné ».
   * Son CÔTÉ est donc dit — « contact du propriétaire » ou « contact du locataire » : les deux mènent au même
   * dossier, mais pas pour la même raison, et c'est la raison qu'on lit avant de cliquer.
   */
  | 'contact_proprietaire'
  | 'contact_locataire';

/** Un bien à proposer, tel que le serveur le rend : déjà nommé, déjà daté, déjà pourvu de son dossier. */
export interface BienPourLaFenetre {
  /** La clé WIPPIMMO du lot — « 418 ». */
  cle: string;
  /** « 38-44 rue de la Vanne, 92120 MONTROUGE — lot 418 », composé par le dépôt. */
  libelle: string;
  /** Le propriétaire, dit en clair. `null` quand l'annuaire ne le connaît pas. */
  proprietaire: string | null;
  raison: RaisonBien;
  /**
   * 🔴 LE DOSSIER DU BIEN LUI-MÊME — celui de « Dossier Drive » sur la fiche du bien (`gestion_drive_arbre`,
   * sorte « bien »), et non le dossier du propriétaire. Demande d'Arno, mot pour mot : « Elle s'ouvre directement
   * à la RACINE du dossier Drive du bien (celui de “Dossier Drive” sur la fiche bien) ».
   *
   * ⚠️ `null` = l'arbre ne connaît pas ce bien : PAS DE VIGNETTE, jamais une vignette morte. Une ligne qui ne
   * mène nulle part se clique quand même, et c'est elle qu'on accuse ensuite.
   */
  dossierId: string | null;
  dossierNom: string | null;
}

/** Le dossier du PROPRIÉTAIRE, en tête quand il porte plusieurs biens. */
export interface ProprietairePourLaFenetre {
  nom: string;
  dossierId: string | null;
  dossierNom: string | null;
  /** Combien de biens il porte — c'est ce nombre que la vignette annonce (« propriétaire de 3 biens »). */
  nbBiens: number;
}

/** Ce que la colonne de gauche affiche, une entrée par ligne. */
export interface VignetteDrive {
  /** Clé React ET clé d'activation : c'est elle qui dit quelle vignette est surlignée. */
  cle: string;
  sorte: 'proprietaire' | 'bien';
  /** « Dossier du bien — NDOLO et BILE Agnès et Jean David » / « Dossier propriétaire — RD PROMOTION ET CIE ». */
  titre: string;
  /** « 38-44 rue de la Vanne, 92120 MONTROUGE — lot 418 · rattaché au mail ». */
  detail: string;
  dossierId: string;
  dossierNom: string | null;
}

/**
 * LE MOT DE LA RAISON. PUR.
 *
 * 🔴 LE NOMBRE N'EST DIT QUE POUR LE CAS MULTI, et c'est voulu : « propriétaire de 1 bien » serait du bruit, et
 * surtout cela ferait croire qu'il y a quelque chose à choisir alors qu'il n'y a qu'un dossier.
 */
export function motRaison(raison: RaisonBien, nbBiens = 0): string {
  if (raison === 'rattache') return 'rattaché au mail';
  if (raison === 'locataire') return 'locataire';
  if (raison === 'ancien_locataire') return 'ancien locataire';
  if (raison === 'proprietaire') return 'propriétaire';
  if (raison === 'contact_proprietaire') return 'contact du propriétaire';
  if (raison === 'contact_locataire') return 'contact du locataire';
  return nbBiens > 1 ? `propriétaire de ${nbBiens} biens` : 'propriétaire';
}

/**
 * ══ 🔴 LE TITRE D'UNE VIGNETTE DE BIEN ═══════════════════════════════════════════════════════════════════════════
 *
 * Le modèle est celui qu'Arno a nommé : « Dossier du bien — NDOLO et BILE… ». Le NOM du propriétaire y figure
 * parce que c'est lui qui identifie le dossier dans le Drive ; l'adresse et le lot sont sur la ligne du dessous.
 *
 * ⚠️ SANS PROPRIÉTAIRE CONNU, LE TIRET DISPARAÎT AVEC LUI : « Dossier du bien — » laisserait croire à un nom
 * perdu en route.
 */
export function titreDuBien(proprietaire: string | null): string {
  const qui = (proprietaire ?? '').trim();
  return qui === '' ? 'Dossier du bien' : `Dossier du bien — ${qui}`;
}

/** Le titre de la vignette de tête, dans le cas multi-biens. */
export function titreDuProprietaire(nom: string): string {
  const qui = nom.trim();
  return qui === '' ? 'Dossier propriétaire' : `Dossier propriétaire — ${qui}`;
}

/**
 * ══ 🔴🔴 LES VIGNETTES, DANS L'ORDRE OÙ LA COLONNE LES MONTRE. PUR. ══════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Multi-biens : une vignette “Dossier propriétaire — <nom>” en tête, puis une par bien. »
 *
 * 🔴 LA VIGNETTE DE TÊTE N'APPARAÎT QUE SI SON DOSSIER EXISTE, et c'est la réponse au cas qu'Arno a prévu lui-même
 * — « Si ce dossier n'existe pas ou est introuvable, on ouvre le premier bien, et les vignettes permettent de
 * passer aux autres ». Elle ne se dégrade donc pas en ligne morte : elle n'est simplement pas là, et la première
 * vignette de bien devient l'ouverture. Rien d'autre à écrire : `dossierDOuverture` prend la première de la
 * liste, quelle qu'elle soit.
 *
 * ⚠️ L'ORDRE DES BIENS EST CELUI QU'ON REÇOIT, jamais un tri de plus. Il porte déjà une intention : les biens
 * rattachés viennent dans l'ordre où on les a rattachés, les occupations d'un locataire du bail le plus récent au
 * plus ancien (demande d'Arno : « le plus récent en premier »). Retrier ici effacerait les deux.
 *
 * ⚠️ UN BIEN SANS DOSSIER CONNU NE PRODUIT PAS DE VIGNETTE. Il n'y a rien à ouvrir, et une vignette grisée
 * n'apprendrait rien que l'absence n'apprenne déjà.
 */
export function vignettesDeLaFenetre(
  biens: readonly BienPourLaFenetre[],
  proprietaire: ProprietairePourLaFenetre | null = null,
): VignetteDrive[] {
  const out: VignetteDrive[] = [];

  if (proprietaire !== null && (proprietaire.dossierId ?? '').trim() !== '') {
    out.push({
      cle: `proprietaire:${proprietaire.dossierId as string}`,
      sorte: 'proprietaire',
      titre: titreDuProprietaire(proprietaire.nom),
      detail: motRaison('proprietaire_multi', proprietaire.nbBiens),
      dossierId: proprietaire.dossierId as string,
      dossierNom: proprietaire.dossierNom,
    });
  }

  const vues = new Set<string>();
  for (const b of biens) {
    const id = (b.dossierId ?? '').trim();
    if (id === '') continue;
    // ⚠️ DEUX BIENS NE PEUVENT PAS PARTAGER UN DOSSIER (l'arbre en pose un par lot), mais la garde ne coûte rien
    //   et elle évite une clé React en double si l'arbre venait à se dédoubler.
    if (vues.has(id)) continue;
    vues.add(id);
    out.push({
      cle: `bien:${b.cle}`,
      sorte: 'bien',
      titre: titreDuBien(b.proprietaire),
      detail: `${b.libelle} · ${motRaison(b.raison, proprietaire?.nbBiens ?? 0)}`,
      dossierId: id,
      dossierNom: b.dossierNom,
    });
  }
  return out;
}

/**
 * ══ 🔴 OÙ LA FENÊTRE S'OUVRE. PUR. ═══════════════════════════════════════════════════════════════════════════════
 *
 * La PREMIÈRE vignette : le dossier du propriétaire quand il y en a un, sinon le premier bien. C'est exactement
 * ce qu'Arno décrit, et l'écrire comme « la première de la liste » plutôt que par un test sur la sorte évite
 * qu'un jour l'ordre d'affichage et l'ordre d'ouverture se contredisent.
 *
 * ⚠️ `null` = on n'ouvre rien de particulier, et la fenêtre reste celle d'avant ce lot (cas ⓒ).
 */
export function dossierDOuverture(vignettes: readonly VignetteDrive[]): VignetteDrive | null {
  return vignettes[0] ?? null;
}

/**
 * ══ 🔴🔴 QUAND LE CALCUL SE REFAIT, ET QUAND IL EST FIGÉ ═════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Le calcul se met à jour en direct quand on modifie le champ À (nouveau message) ; pour une
 * réponse, il vaut dès l'ouverture. »
 *
 * 🔴 LES DEUX PHRASES DISENT LA MÊME RÈGLE, et c'est pour cela qu'il n'y a qu'une fonction. Une RÉPONSE a un
 * échange (`filId`), donc la voie ⓐ : ses biens ne dépendent pas du champ « À », et retoucher les destinataires
 * ne doit RIEN changer — c'est ce que « il vaut dès l'ouverture » veut dire. Un message NEUF n'a pas d'échange :
 * la voie ⓑ est la seule, et elle suit forcément le champ. La « différence » entre les deux cas est donc une
 * conséquence de l'ordre de priorité, pas une règle de plus.
 *
 * ⚠️ ON REND LA CLÉ DE CALCUL, PAS UN BOOLÉEN. L'écran s'en sert comme dépendance d'effet : deux clés égales ⇒
 * aucune relecture. Un booléen « faut-il recalculer ? » aurait demandé à l'appelant de se souvenir de l'état
 * précédent, c'est-à-dire de tenir la moitié de la règle chez lui.
 */
export function cleDuCalcul(o: {
  filId: number | null;
  /** Les lots explicitement choisis à l'écriture (« Classer ce mail »). */
  lots: readonly string[];
  /** Les adresses du champ « À », déjà réduites à celles qui ne sont pas des nôtres. */
  adresses: readonly string[];
}): string {
  const lots = [...o.lots].join(',');
  // 🔴 L'ÉCHANGE OU LES LOTS SUFFISENT : tant qu'ils désignent quelque chose, le champ « À » n'entre pas dans la
  //   clé — retoucher un destinataire d'une réponse ne relance donc aucune lecture, et ne change aucune vignette.
  if (o.filId !== null || lots !== '') return `fil:${o.filId ?? ''}|lots:${lots}`;
  // ⚠️ SEULE LA PREMIÈRE ADRESSE COMPTE (règle ⓑ) : ajouter un second destinataire ne doit pas relire.
  return `a:${o.adresses[0] ?? ''}`;
}
