/**
 * MODULE « GESTION » — LOT BOITE-INTERNE-CORBEILLE : NOS PROPRES ADRESSES, EN UN SEUL ENDROIT. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE, DEMANDÉE PAR ARNO LE 29/09/2026 : toute adresse se terminant par `@sansvisavis.com` ou
 * `@criterimmo.fr` n'est JAMAIS rapprochée d'une fiche propriétaire ou locataire, OÙ QU'ELLE APPARAISSE — De, À,
 * Cc, Cci, bloc de transfert. Elle ne produit donc aucune ligne dans le bloc des parties, ni aucune proposition
 * de bien.
 *
 * ═══ LE DÉFAUT QUI L'A PROVOQUÉE, ET POURQUOI IL EST PIRE QU'IL N'EN A L'AIR ═══════════════════════════════════
 *
 * Six fiches WIPPIMMO portent une de nos adresses — ce sont de vrais dossiers : nous sommes bailleurs ou preneurs
 * à titre personnel ou par nos sociétés. Mesuré le 29/09/2026 en base :
 *
 *     a.jorel@sansvisavis.com    → PROPRIÉTAIRE 45 (JOREL Arnaud), 149 (GABRIEL ESTATE), 344 (MARS AVENIR)
 *                                  et LOCATAIRE 850 (SARL MACJ)
 *     c.jullien@sansvisavis.com  → PROPRIÉTAIRE 79 (JULLIEN - GARRIDO Cédric), 344 (MARS AVENIR)
 *                                  et LOCATAIRE 850 (SARL MACJ)
 *     m.cohen@sansvisavis.com    → PROPRIÉTAIRE 256 (COHEN Michel)
 *
 * Conséquence : un mail interne d'Arnaud à Jean-Baptiste se coiffait de « PROPRIÉTAIRE JOREL Arnaud / MARS AVENIR /
 * GABRIEL ESTATE, LOCATAIRE SARL MACJ ». Ce n'est pas seulement du bruit : c'est FAUX au sens du dossier. Dans cet
 * échange-là, Arnaud n'écrit pas en tant que bailleur du 7 avenue de l'Union — il écrit en tant que nous. Le bloc
 * affirmait une qualité que le mail n'avait pas, et il l'affirmait sur 1 346 mails (948 échanges).
 *
 * 🔴 POURQUOI UNE LISTE CENTRALE PLUTÔT QU'UN TEST DE PLUS. La règle existait DÉJÀ, écrite deux fois, à deux
 * endroits qui s'ignoraient (`triPieces.estAdresseMaison` et `adressesMessage.estInterne`) — et une TROISIÈME voie,
 * `indicesParEmail`, ne la connaissait pas du tout. C'est exactement ce que produit une règle recopiée : elle tient
 * là où on l'a écrite, et elle manque là où on a oublié. Il n'y a donc plus qu'un seul endroit, et les trois voies
 * le lisent.
 *
 * ⚠️ CE QUE CETTE RÈGLE NE TOUCHE PAS, ET IL FAUT LE DIRE. Les propositions par ADRESSE POSTALE ou par N° DE LOT
 * cité dans l'objet, le corps ou une pièce jointe (règle d de `propositionsBien`) restent pleinement actives sur un
 * mail interne : elles ne partent pas d'une adresse électronique, donc rien ici ne les concerne. Un mail interne qui
 * cite « 28 Avenue Marceau » propose toujours ce logement — et c'est ce qu'on veut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * NOS DOMAINES. C'EST LA SEULE DÉFINITION DU DÉPÔT — les autres modules l'importent, aucun ne la recopie.
 *
 * ⚠️ LES SOUS-DOMAINES COMPTENT (`mail.criterimmo.fr`). Un jour où l'on enverra depuis un sous-domaine, la règle
 * doit tenir sans qu'on y repense : c'est le genre de détail qu'on ne découvre qu'en voyant réapparaître le bloc.
 */
export const DOMAINES_INTERNES = ['criterimmo.fr', 'sansvisavis.com'] as const;

/**
 * ══ 🔴🔴 NOS ADRESSES NOMMÉES UNE PAR UNE — celles qui ne sont pas sur un de nos domaines ══════════════════════
 *
 * DÉCISION D'ARNO (02/10/2026) : « gestion.criterimmo@gmail.com est NOTRE adresse. Ajoute-la à la liste centrale
 * des adresses internes (comme @criterimmo.fr et @sansvisavis.com) : jamais d'étape 2, jamais de bloc des
 * parties, jamais de proposition par expéditeur. »
 *
 * 🔴 POURQUOI UNE SECONDE LISTE, ET NON UN DOMAINE DE PLUS. `gmail.com` ne peut évidemment pas entrer dans
 * `DOMAINES_INTERNES` : il rendrait internes des centaines de locataires et de propriétaires, et le module
 * cesserait de rapprocher la moitié de son courrier. Une adresse NOMMÉE est donc le seul moyen juste, et la
 * comparaison se fait sur l'adresse ENTIÈRE, jamais sur un morceau.
 *
 * ⚠️ CE QUE CETTE ENTRÉE A RÉVÉLÉ, ET C'EST LA VRAIE LEÇON. Elle existait DÉJÀ, mais ailleurs : dans
 * `documentsAutoRepo.NOS_ADRESSES`, recopiée à la main. Le rangement des documents automatiques la connaissait
 * donc, et le moteur de rattachement l'ignorait — 940 mails de notre propre boîte attendaient dans la file « À
 * rattacher » comme s'ils venaient d'un inconnu. C'est exactement ce que produit une règle recopiée : elle tient
 * là où on l'a écrite, et elle manque là où on a oublié. `NOS_ADRESSES` DÉRIVE désormais de cette liste-ci.
 *
 * ⚠️ EN MINUSCULES, SANS BLANC : la comparaison normalise des deux côtés, mais une entrée mal formée ici ne
 * correspondrait jamais à rien, en silence.
 */
export const ADRESSES_INTERNES = ['gestion.criterimmo@gmail.com'] as const;

/**
 * CETTE ADRESSE EST-ELLE UNE DES NÔTRES ? PUR.
 *
 * ⚠️ UNE ADRESSE VIDE OU ILLISIBLE REND `true`, et ce n'est pas une facilité : la question posée est « peut-on s'en
 * servir pour désigner une partie ? ». Une adresse qu'on ne sait pas lire ne désigne personne — la traiter comme
 * utilisable ferait chercher une fiche pour une chaîne vide.
 *
 * ⚠️ `partenaires` — la comptabilité externalisée (ADHOC, lot 4d). Elle n'est ni nous ni un client : elle est des
 * DEUX CÔTÉS de tous les dossiers, donc jamais une clé non plus. Elle voyage en paramètre parce qu'elle vit en base
 * et que ce module est PUR.
 */
export function estAdresseInterne(
  adresse: string | null | undefined,
  autres: readonly (string | null | undefined)[] = [],
): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  if (a === '' || !a.includes('@')) return true;
  if (autres.some((x) => (x ?? '').trim().toLowerCase() === a)) return true;
  // 🔴 NOS ADRESSES NOMMÉES, comparées EN ENTIER : « gestion.criterimmo@gmail.com » est à nous, « gmail.com »
  //   ne l'est pas. Un test sur le domaine seul rendrait internes des centaines de clients.
  if ((ADRESSES_INTERNES as readonly string[]).includes(a)) return true;
  const domaine = a.slice(a.indexOf('@') + 1);
  return DOMAINES_INTERNES.some((d) => domaine === d || domaine.endsWith(`.${d}`));
}

/**
 * NE GARDE QUE LES ADRESSES UTILISABLES COMME CLÉ. Dédoublonnées, minuscules, dans l'ordre d'arrivée. PUR.
 *
 * 🔴 UN TABLEAU VIDE EST UNE RÉPONSE, PAS UN ÉCHEC : il veut dire « il ne reste personne à rapprocher », et
 * l'appelant doit alors n'afficher AUCUN bloc — pas un bloc vide, pas un bloc « expéditeur inconnu ».
 */
export function adressesRapprochables(
  adresses: readonly (string | null | undefined)[],
  autres: readonly (string | null | undefined)[] = [],
): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const brut of adresses) {
    const a = (brut ?? '').trim().toLowerCase();
    if (a === '' || vues.has(a) || estAdresseInterne(a, autres)) continue;
    vues.add(a);
    out.push(a);
  }
  return out;
}
