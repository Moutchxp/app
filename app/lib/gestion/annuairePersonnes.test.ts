import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * LOT ANNUAIRE-PERSONNES — L'ANNUAIRE REND DES PERSONNES, PLUS DES BIENS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Constat d'Arno : « un annuaire sert à chercher une PERSONNE. Aujourd'hui les résultats sont des biens immobiliers.
 * Il faut afficher des noms ; un clic sur un propriétaire mène à sa fiche propriétaire, un clic sur un locataire à sa
 * fiche locataire. »
 *
 * 🔴 CE FICHIER TIENT DEUX CHOSES QU'AUCUNE AUTRE ÉPREUVE NE PEUT TENIR :
 *   ① ce que la recherche REND (des personnes) et ce qu'elle ne rend plus (des lots) ;
 *   ② ce qu'on N'A PAS touché — la recherche de BIEN du panneau « Rattacher à un bien », qui doit continuer de
 *     rendre des biens, et la commande d'épreuve de l'annuaire, qui vérifie l'indexation des lots.
 *
 * ⚠️ LES ÉPREUVES DE COMPORTEMENT SUR DONNÉES RÉELLES (« jullien » → 1 personne, « edith cavell » → 3) sont faites
 * à la main sur la vraie base, et rapportées dans le message de commit : elles dépendent du contenu de l'annuaire,
 * qu'un ré-import peut changer. Ce qui est figé ici, c'est la RÈGLE, pas le contenu.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴 le dépôt : une recherche qui rend des personnes', () => {
  const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
  const bloc = repo.slice(repo.indexOf('export async function rechercherPersonnes'),
    repo.indexOf('// ══ ③ LE PONT AVEC LA BOÎTE MAIL'));

  /**
   * 🔴 LES TROIS PORTES D'ENTRÉE, et elles rendent toutes des PERSONNES :
   *   · le NOM      → la personne ;
   *   · l'ADRESSE ou le N° DE LOT → les propriétaires, les locataires en place et les anciens de ce bien ;
   *   · le TÉLÉPHONE ou l'E-MAIL → la personne qui le porte.
   */
  it('🔴 elle cherche par nom, par coordonnée ET par bien', () => {
    expect(bloc).toContain('contacts_trouves');
    expect(bloc).toContain('lots_vises');
    // « Aucun mot ne manque » : chercher « garrido jullien » doit trouver « JULLIEN - GARRIDO ».
    expect(bloc).toContain("NOT EXISTS (SELECT 1 FROM mots WHERE pr.nom_normalise NOT LIKE '%' || m || '%')");
    expect(bloc).toContain("NOT EXISTS (SELECT 1 FROM mots WHERE lc.nom_normalise NOT LIKE '%' || m || '%')");
    // Le n° de lot et l'adresse désignent des LOTS, qui ramènent ensuite leurs personnes.
    expect(bloc).toContain('$5::text IS NOT NULL AND lo.wippimmo_id = $5');
    expect(bloc).toContain('lo.adresse_normalisee');
  });

  /** 🔴 LA RAISON EST ÉCRITE EN CLAIR quand ce n'est pas le nom qui a répondu. */
  it('🔴 chercher une adresse dit POURQUOI chaque personne répond', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain('`propriétaire du lot ${p.lot_vise}`');
    expect(assemble).toContain("'locataire en place'");
    expect(assemble).toContain("'ancien locataire'");
    // Trouvée par son NOM : pas de raison — elle est évidente.
    expect(assemble).toContain('p.par_nom || p.lot_vise === null ? null');
  });

  /**
   * ══ 🔴🔴 FONDRE DEUX FICHES : DEUX CONDITIONS, ET IL FAUT LES DEUX ══════════════════════════════════════════
   *
   * Arno : « Une personne qui est à la fois propriétaire et locataire apparaît une seule fois, avec ses deux
   * capsules (clic → fiche propriétaire, lien secondaire vers la fiche locataire). »
   *
   * MESURÉ LE 30/09/2026 : par le NOM seul, 0 couple — la règle ne fondrait jamais rien. Par la COORDONNÉE
   * seule, 10 couples, dont 9 sont NOS PROPRES sociétés (MARS AVENIR, SARL MACJ, GABRIEL ESTATE, JOREL Arnaud)
   * qui partagent nos adresses d'agence : les fondre aurait transformé quatre personnes morales distinctes en
   * une seule. Les deux ensemble : exactement un couple, GAALOUL — le vrai.
   */
  it('🔴 la fusion exige le MÊME nom ET une coordonnée partagée', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain('motsTries(l.nom_normalise)');
    expect(assemble).toContain('communes.length > 0');
    // Les mots du nom sont TRIÉS : « GAALOUL Najah et Stéphanie » retrouve « GAALOUL Stéphanie et Najah ».
    expect(repo).toContain('function motsTries');
    expect(repo).toContain(".sort().join(' ')");
    // La fiche principale est celle du PROPRIÉTAIRE, et l'autre reste atteignable.
    expect(assemble).toContain("sujet: 'proprietaire'");
    expect(assemble).toContain('autreFicheId: loc === null ? null : Number(loc.id)');
    expect(assemble).toContain('if (fusion.has(l.id)) continue;');
  });

  /**
   * 🔴 L'ORDRE : « pertinence du nom d'abord, puis Propriétaires avant Locataires en place avant Anciens
   * locataires ». Une personne trouvée par SON NOM passe devant celle trouvée par le bien qu'elle occupe.
   */
  it('🔴 l’ordre suit la pertinence du nom, puis le rôle', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain('a.pertinence - b.pertinence');
    expect(assemble).toContain('rangRole(a.roles[0]) - rangRole(b.roles[0])');
    expect(assemble).toContain("(r === 'proprietaire' ? 0 : r === 'locataire' ? 1 : 2)");
  });

  /**
   * 🔴 LE GROUPE NE SE POSE QUE SUR CE QUI EST VRAIMENT PARTAGÉ : un bien porté par une seule personne du
   * résultat ne fait pas un groupe. Sans cette condition, chacun serait « groupé » tout seul et le filet ne
   * dirait plus rien.
   */
  it('🔴 le groupe exige DEUX personnes sur le même bien', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain('(combien.get(b.numero) ?? 0) > 1');
  });

  /** 🔴 LES ARCHIVÉES SONT MASQUÉES PAR DÉFAUT, et la case les ramène — la même liste, filtrée. */
  it('🔴 les archivées sont masquées par défaut', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain('avecArchivees ? lignes : lignes.filter((x) => !x.archive)');
  });

  /** ⚠️ LE PREMIER DE CHAQUE SORTE, et rien d'autre : la ligne d'annuaire est une ligne, pas une fiche. */
  it('🔴 la ligne ne porte que le PREMIER mobile et le PREMIER e-mail, déjà formatés', () => {
    const assemble = repo.slice(repo.indexOf('async function assemblerPersonnes'));
    expect(assemble).toContain("if (r.sorte === 'telephone' && e.mobile === null)");
    expect(assemble).toContain('formaterTelephone(r.valeur, r.valeur_brute)');
  });
});

describe('🔴 ce qu’on n’a PAS touché', () => {
  /**
   * ══ 🔴🔴 LA RECHERCHE DE BIEN RESTE UNE RECHERCHE DE BIENS ══════════════════════════════════════════════════
   *
   * Arno : « La recherche de BIEN du panneau “Rattacher à un bien” (boîte mail) reste une recherche de biens. »
   * Elle passe par `chercherBiens` (module `rechercheBienRepo`), un tout autre chemin que l'annuaire — et son
   * invariant central le dit : « LES RÉSULTATS SONT TOUJOURS DES BIENS — jamais une personne ».
   */
  it('🔴 `chercherBiens` ne connaît pas la recherche de personnes', () => {
    const src = readFileSync('app/lib/gestion/rechercheBienRepo.ts', 'utf8');
    expect(src).toContain('LES RÉSULTATS SONT TOUJOURS DES BIENS');
    expect(src).not.toContain('rechercherPersonnes');
    // Et l'écran qui s'en sert n'a pas changé de source.
    const menu = readFileSync('app/(admin)/admin/(protected)/gestion/MenuRattachementBien.tsx', 'utf8');
    expect(menu).not.toContain('rechercherPersonnes');
  });

  /**
   * 🔴 `rechercher` (LES LOTS) RESTE, ET RESTE ATTEIGNABLE. La commande d'épreuve de l'annuaire s'en sert pour
   * vérifier qu'une adresse, une commune et un n° de lot retrouvent bien LEUR LOT : la retirer aurait supprimé le
   * seul contrôle automatique de l'indexation des biens.
   */
  it('🔴 la recherche par LOT survit, derrière `?biens=1`', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('export async function rechercher(');
    const route = readFileSync('app/(admin)/api/admin/gestion/annuaire/route.ts', 'utf8');
    expect(route).toContain("url.searchParams.get('biens') === '1'");
    expect(route).toContain('rechercherPersonnes(terme, { avecArchivees })');
    const epreuve = readFileSync('app/scripts/annuaire-epreuve.ts', 'utf8');
    expect(epreuve).toContain('rechercher(analyserTerme');
  });

  /** ⚠️ LES FICHES ET LE RETOUR NE BOUGENT PAS : le retour ramène aux résultats, avec la saisie intacte. */
  it('🔴 le bouton Retour ramène aux résultats sans effacer la saisie', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    // Il repose la fiche à `null` — le terme, lui, vit dans un état qui n'est pas touché.
    expect(src).toContain('onClick={() => (fiche !== null ? onFiche(null) : onRetour())}');
    expect(src).toContain('const [terme, setTerme] = useState');
  });
});

describe('🔴 l’écran : des noms, pas des adresses', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  it('🔴 la liste rend des PERSONNES, et le compteur les compte', () => {
    expect(src).toContain('<LignePersonne');
    expect(src).toContain('personne{reponse.personnes.length > 1 ? \'s\' : \'\'}');
    // 🔴 L'ANCIENNE LISTE PAR LOGEMENT A DISPARU : plus de titre d'adresse, plus de « Locataire actuel ».
    const liste = src.slice(src.indexOf('function Resultats'), src.indexOf('function LignePersonne'));
    expect(liste).not.toContain("ouvrir('lot'");
    expect(liste).not.toContain('Locataire actuel');
  });

  /** 🔴 UN CLIC MÈNE À LA FICHE DE SON RÔLE : propriétaire → fiche propriétaire, locataire → fiche locataire. */
  it('🔴 le clic ouvre la fiche de la personne, selon son rôle principal', () => {
    const ligne = src.slice(src.indexOf('function LignePersonne'));
    expect(ligne).toContain('onClick={() => ouvrir(p.sujet, p.id)}');
    // Et la seconde fiche reste atteignable, hors du bouton de la ligne.
    expect(ligne).toContain("ouvrir('locataire', p.autreFicheId as number)");
    const corps = ligne.slice(ligne.indexOf('ann-pers-corps'), ligne.indexOf('</button>'));
    expect(corps).not.toContain('<button');
    expect(corps).not.toContain('<a ');
  });

  /** 🔴 CE QU'UNE LIGNE PORTE, mot pour mot : nom en gras, capsule de rôle, puis le gris. */
  it('🔴 la ligne porte le nom, le rôle, le mobile, l’e-mail et le bien', () => {
    const ligne = src.slice(src.indexOf('function LignePersonne'));
    expect(ligne).toContain('{nom}');
    expect(ligne).toContain('MOT_ROLE[r]');
    expect(ligne).toContain('{p.mobile ?? \'—\'}');
    expect(ligne).toContain('{p.email ?? \'—\'}');
    expect(ligne).toContain('titreLogement(premier.adresse, premier.commune)} — lot {premier.numero}');
    expect(ligne).toContain('+{p.biens.length - 1} bien');
    expect(src).toContain("proprietaire: 'Propriétaire'");
    expect(src).toContain("ancien_locataire: 'Ancien locataire'");
  });

  /** 🔴 LE FILET NE SE POSE QU'ENTRE DEUX VOISINES DU MÊME GROUPE. */
  it('🔴 le filet relie deux voisines, jamais la dernière d’un groupe', () => {
    expect(src).toContain('reponse.personnes[i + 1]?.groupe === p.groupe');
    expect(src).toContain('.ann-pers--groupe{');
    expect(src).toContain('.ann-pers--groupe + .ann-pers{');
  });

  /** ⚠️ LA CASE EST TOUJOURS VISIBLE, même sur un résultat vide : c'est souvent elle qu'on vient cocher. */
  it('🔴 « Afficher les archivées » existe, et relance la recherche', () => {
    expect(src).toContain('Afficher les archivées');
    expect(src).toContain("archivees ? '&archivees=1' : ''");
    expect(src).toContain('}, [terme, archivees]);');
    expect(src).toContain('ann-etiq--absent">archivée');
  });

  /** ⚠️ MOBILE D'ABORD (§15) : rien au seul survol, et la ligne tient à 390 px. */
  it('mobile d’abord : aucune information révélée au seul survol', () => {
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });
});
