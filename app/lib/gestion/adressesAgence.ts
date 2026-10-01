/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LES ADRESSES POSTALES DE L'AGENCE, EN UN SEUL ENDROIT. PUR. ════════
 *
 * ═══ LE DÉFAUT QU'IL FERME, CONSTATÉ PAR ARNO LE 01/10/2026 ═══════════════════════════════════════════════════
 *
 * Sur le mail 57306 (Mme THAI, fil 36558), l'automatisation proposait « 2 Rue Mars et Roty, Puteaux — Local
 * commercial — lot 494 ». Pourquoi ? Parce que la SIGNATURE de l'agence — « Service Gestion, 2 rue Mars et Roty,
 * 92800 Puteaux » — figurait dans le texte cité en dessous, et que la règle (d) y a reconnu l'adresse d'un lot.
 * MESURÉ le 01/10/2026 : 2 226 propositions vivantes portaient le lot 494 pour cette seule raison.
 *
 * 🔴 UNE SIGNATURE DIT QUI ENVOIE, PAS DE QUOI LE MAIL PARLE. C'est la même règle que le tri des pièces avait déjà
 * payée : sans elle, 1 853 pièces étaient expédiées dans le dossier du lot 494 (correctif du 26/09/2026). Elle
 * était écrite là-bas, dans `triPiecesRepo`, pour la seule adresse de Puteaux et pour le seul tri des pièces. Elle
 * vit désormais ICI, et les deux moteurs la lisent au même endroit.
 *
 * ═══ 🔴 CE QUE CE MODULE N'INTERDIT PAS, ET C'EST LA MOITIÉ DE LA RÈGLE ══════════════════════════════════════════
 *
 * Le lot 494 EST un lot en gestion, et il reste parfaitement proposable quand un TIERS cite son adresse dans un
 * texte qu'il a écrit lui-même. Ce module ne met pas une adresse sur une liste noire : il reconnaît la LIGNE DE
 * SIGNATURE, c'est-à-dire une ligne qui ne porte QUE l'adresse postale de l'agence et rien d'autre. Une phrase qui
 * parle du local de Puteaux n'est pas une signature, et elle continue de compter.
 *
 * ⚠️ POURQUOI PAS EN BASE. Ces adresses ne viennent ni de WIPPIMMO ni de `gestion_config` : elles sont celles du
 * papier à en-tête, posées par Google dans la signature des envois. Une table ajouterait un endroit à tenir à jour
 * sans rien apprendre de plus.
 *
 * ⚠️ MODULE FEUILLE : aucun import. C'est lui que `texteCite` et le tri des pièces lisent, jamais l'inverse.
 */

export interface AdresseAgence {
  voie: string;
  codePostal: string;
  commune: string;
  /** Ce qu'elle est : le bureau où l'on travaille, ou le siège social inscrit au bas des courriers. */
  role: 'bureau' | 'siege';
}

/**
 * 🔴 LES ADRESSES DE L'AGENCE, LA LISTE CENTRALE (demande d'Arno du 01/10/2026).
 *
 * ⚠️ LE SIÈGE Y FIGURE MÊME SANS DÉFAUT CONSTATÉ. Il apparaît au bas des courriers officiels et des baux ; le jour
 * où un lot sera géré au 191-195 avenue Charles de Gaulle, la même erreur se reproduirait à l'identique. L'ajouter
 * coûte une ligne ; l'oublier coûte un dossier client mal rangé que personne ne verrait.
 */
export const ADRESSES_AGENCE: readonly AdresseAgence[] = [
  { voie: '2 rue Mars et Roty', codePostal: '92800', commune: 'Puteaux', role: 'bureau' },
  { voie: '191-195 avenue Charles de Gaulle', codePostal: '92200', commune: 'Neuilly-sur-Seine', role: 'siege' },
];

/** Les voies seules — la forme qu'attend le tri des pièces (`adressesPostalesMaison`). */
export const VOIES_AGENCE: readonly string[] = ADRESSES_AGENCE.map((a) => a.voie);

/**
 * UNE MISE À PLAT MINIMALE : minuscules, accents ôtés, ponctuation réduite à des espaces. PUR.
 *
 * ⚠️ CE N'EST PAS `normaliser` DE `propositionsBien`, et la duplication est assumée. Ce module est un PRÉALABLE à
 * la reconnaissance des biens : c'est lui qui nettoie le texte AVANT que l'autre ne le fouille. L'importer ici
 * ferait un cycle entre les deux modules — et la règle, elle, est de quatre lignes.
 */
export function aplatir(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * LES MOTS QU'UNE LIGNE DE SIGNATURE PORTE EN PLUS DE L'ADRESSE, et qui ne la disqualifient pas.
 *
 * Code postal, commune, nom de la maison, mentions administratives : ils font partie de l'en-tête, pas d'une
 * phrase. Tout le reste compte comme du texte écrit par quelqu'un.
 */
const MOTS_DE_SIGNATURE = new Set([
  ...ADRESSES_AGENCE.flatMap((a) => [...aplatir(`${a.codePostal} ${a.commune}`).split(' ')]),
  'france', 'sarl', 'sas', 'criterimmo', 'svav', 'sansvisavis', 'immobilier', 'sans', 'vis', 'a',
  'service', 'gestion', 'agence', 'siege', 'social', 'adresse', 'bureau', 'tel', 'fax', 'cedex',
]);

/**
 * 🔴 UN SEUL MOT ÉTRANGER TOLÉRÉ, ET C'EST MESURÉ. À deux, « intervention au 2 rue Mars et Roty » passait pour une
 * signature — et la phrase d'un tiers aurait cessé de désigner le lot 494, ce qu'Arno demande expressément de
 * garder. Les vraies signatures, elles, n'emploient que les mots d'en-tête ci-dessus.
 */
const RESTE_TOLERE = 1;

/**
 * 🔴 CETTE LIGNE N'EST-ELLE QUE L'ADRESSE POSTALE DE L'AGENCE ? PUR.
 *
 * VRAI pour « 2 rue Mars et Roty, 92800 Puteaux » ou « Siège social : 191-195 avenue Charles de Gaulle » — des
 * lignes d'en-tête. FAUX pour « Le technicien passera au 2 rue Mars et Roty mardi matin », qui est une phrase, et
 * dont l'adresse doit continuer de désigner le lot 494.
 */
export function ligneEstAdresseAgence(ligne: string): boolean {
  const l = aplatir(ligne);
  if (l === '') return false;
  for (const a of ADRESSES_AGENCE) {
    for (const forme of [aplatir(`${a.voie} ${a.codePostal} ${a.commune}`), aplatir(a.voie)]) {
      if (forme === '' || !l.includes(forme)) continue;
      const reste = l.replace(forme, ' ').split(' ').filter((m) => m !== '' && !MOTS_DE_SIGNATURE.has(m));
      if (reste.length <= RESTE_TOLERE) return true;
    }
  }
  return false;
}

/** L'adresse de l'agence est-elle quelque part dans ce texte ? PUR — sert aux épreuves et aux rapports. */
export function citeUneAdresseAgence(texte: string): boolean {
  const t = aplatir(texte);
  return ADRESSES_AGENCE.some((a) => t.includes(aplatir(a.voie)));
}
