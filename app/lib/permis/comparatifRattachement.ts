/**
 * FUS-3b — construction PURE du TABLEAU COMPARATIF « trois sources » d'un dossier de rattachement, testable et sans I/O :
 *   · EN BASE   = ce que l'analyse du permis a établi (permis_caracteristique / corps / parcelles déclarées) ;
 *   · CADASTRE  = ce que dit le cadastre (contenance, ST_Area des parcelles rattachées) ;
 *   · BD TOPO   = ce que disent les bâtiments présents dans l'empreinte (nombre, étages, altitude toit, usages).
 *
 * RÈGLE : une valeur ABSENTE d'une source le DIT — jamais une case vide muette. Deux nuances distinctes :
 *   · `presente:false` + « sans objet pour cette source » = la source ne PORTE pas cette grandeur (ex. le cadastre n'a pas
 *     d'altitude de toit) ;
 *   · `presente:false` + « non renseigné » = la source POURRAIT la porter mais la donnée manque (ex. étages BD TOPO à null).
 * Aucune cellule n'est jamais vide : toutes portent un texte lisible.
 */

export interface CelluleComparative { texte: string; presente: boolean } // presente=true ⇒ une vraie valeur mesurée est affichée
export interface LigneComparative { intitule: string; enBase: CelluleComparative; cadastre: CelluleComparative; bdTopo: CelluleComparative }

export interface DonneesComparatif {
  // EN BASE (analyse du permis)
  surfaceParcelleDeclareeM2: number | null;   // Σ des superficies déclarées (permis_parcelle, origine)
  nbCorps: number;                              // nb de corps de bâtiment déclarés
  etagesCorps: (number | null)[];               // nb_etages par corps
  altitudesCorps: (number | null)[];            // altitude_sommet_ngf par corps
  destinationsPermis: string[] | null;          // sous-destinations déclarées
  sousSolsCorps: (number | null)[];             // nb_niveaux_sous_sol par corps
  stationnementPermis: number | null;           // nb de places déclarées (niveau permis)
  // CADASTRE (parcelles rattachées)
  nbParcellesCadastre: number;
  surfaceCadastraleM2: number | null;           // Σ contenance
  surfaceCadastralePostgisM2: number | null;    // Σ ST_Area
  // BD TOPO (bâtiments dans l'empreinte)
  empreinteFigee: boolean;                       // false ⇒ pas d'empreinte → BD TOPO « sans objet »
  nbBatimentsBdTopo: number;                     // 0 = mesuré (terrain nu), significatif
  etagesBdTopo: (number | null)[];
  altitudesToitBdTopo: (number | null)[];
  usagesBdTopo: string[];
}

const sansObjet: CelluleComparative = { texte: 'sans objet pour cette source', presente: false };
const val = (texte: string): CelluleComparative => ({ texte, presente: true });
const nonRenseigne: CelluleComparative = { texte: 'non renseigné', presente: false };

/** Formate une liste de nombres (par corps / par bâtiment) : les non-nuls joints ; tous nuls → « non renseigné » ; vide → null. */
function listeNombres(vals: (number | null)[], unite: string): CelluleComparative | null {
  if (vals.length === 0) return null;
  const presents = vals.filter((v): v is number => v !== null);
  if (presents.length === 0) return { ...nonRenseigne, texte: `renseigné pour aucun des ${vals.length}` };
  const rendu = presents.map((v) => `${v}${unite}`).join(' · ');
  return val(presents.length === vals.length ? rendu : `${rendu} (sur ${vals.length})`);
}

/** Construit les lignes du tableau comparatif à partir des données déjà lues. PUR. */
export function construireComparatif(d: DonneesComparatif): LigneComparative[] {
  const bdTopoAbsent = !d.empreinteFigee;
  const nbBatCell: CelluleComparative = bdTopoAbsent ? sansObjet : val(d.nbBatimentsBdTopo === 0 ? 'aucun bâtiment dans l’empreinte' : `${d.nbBatimentsBdTopo}`);
  // Pour les listes BD TOPO : si empreinte non figée OU aucun bâtiment → « sans objet » ; sinon liste (ou « non renseigné »).
  const bdTopoListe = (vals: (number | null)[], unite: string): CelluleComparative =>
    bdTopoAbsent || d.nbBatimentsBdTopo === 0 ? sansObjet : (listeNombres(vals, unite) ?? sansObjet);

  const surfaceCadastre: CelluleComparative = d.surfaceCadastraleM2 === null
    ? { ...nonRenseigne, texte: 'parcelle non rattachée au cadastre' }
    : val(`${d.surfaceCadastraleM2} m²${d.surfaceCadastralePostgisM2 !== null ? ` (ST_Area ${d.surfaceCadastralePostgisM2} m²)` : ''} · ${d.nbParcellesCadastre} parcelle${d.nbParcellesCadastre > 1 ? 's' : ''}`);

  const destinationsBdTopo: CelluleComparative = bdTopoAbsent || d.usagesBdTopo.length === 0 ? sansObjet : val([...new Set(d.usagesBdTopo)].join(', '));

  return [
    {
      intitule: 'Surface de parcelle',
      enBase: d.surfaceParcelleDeclareeM2 === null ? nonRenseigne : val(`${d.surfaceParcelleDeclareeM2} m² déclarés`),
      cadastre: surfaceCadastre,
      bdTopo: sansObjet, // BD TOPO ne porte pas la parcelle
    },
    {
      intitule: 'Nombre de bâtiments',
      enBase: val(`${d.nbCorps} corps déclaré${d.nbCorps > 1 ? 's' : ''}`),
      cadastre: sansObjet,
      bdTopo: nbBatCell,
    },
    {
      intitule: 'Étages',
      enBase: listeNombres(d.etagesCorps, ' ét.') ?? nonRenseigne,
      cadastre: sansObjet,
      bdTopo: bdTopoListe(d.etagesBdTopo, ' ét.'),
    },
    {
      intitule: 'Altitudes (sommet permis / toit BD TOPO, NGF)',
      enBase: listeNombres(d.altitudesCorps, ' m') ?? nonRenseigne,
      cadastre: sansObjet,
      bdTopo: bdTopoListe(d.altitudesToitBdTopo, ' m'),
    },
    {
      intitule: 'Destinations',
      enBase: d.destinationsPermis && d.destinationsPermis.length > 0 ? val(d.destinationsPermis.join(', ')) : nonRenseigne,
      cadastre: sansObjet,
      bdTopo: destinationsBdTopo,
    },
    {
      intitule: 'Sous-sols',
      enBase: listeNombres(d.sousSolsCorps, ' niv.') ?? nonRenseigne,
      cadastre: sansObjet,
      bdTopo: sansObjet,
    },
    {
      intitule: 'Stationnement',
      enBase: d.stationnementPermis === null ? nonRenseigne : val(`${d.stationnementPermis} place${d.stationnementPermis > 1 ? 's' : ''}`),
      cadastre: sansObjet,
      bdTopo: sansObjet,
    },
  ];
}
