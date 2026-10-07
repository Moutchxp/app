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

  /**
   * 🔴🔴 LOT FLECHES-RETOUR — LA PROPRIÉTÉ N'A PAS CHANGÉ, LE MOYEN SI.
   *
   * Le bouton reposait la fiche à `null` quand une fiche était ouverte, et menait à la boîte sinon : deux
   * destinations FIXES, dont aucune n'était le mail d'où l'on venait (constat d'Arno). Il passe désormais par le
   * RETOUR COMMUN du module (`onRetour`), qui recule dans l'historique.
   *
   * ══ ⚠️ RÈGLE RÉÉCRITE LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ═══════════════════════════════════════════
   *
   * ELLE S'INTITULAIT « … sans effacer la saisie » et lisait `const [terme, setTerme] = useState` : la preuve
   * que le terme cherché survivait au retour. IL N'Y A PLUS DE SAISIE À SAUVER sur cet écran — la recherche est
   * passée à la barre partagée, qui se vide de toute façon dès qu'on ouvre une fiche (c'était déjà sa règle).
   *
   * 🔴 CE QUE LA RÈGLE PROTÉGEAIT ET QUI EST ÉPROUVÉ ICI : le bouton existe toujours SUR UNE FICHE, il passe par
   * le retour commun, et il ne rejoue plus les deux destinations fixes d'avant. Son retrait sur l'état « aucune
   * fiche ouverte » est la demande explicite d'Arno du 07/10/2026.
   */
  it('🔴 le bouton Retour d’une fiche passe par le retour commun du module', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain('onClick={() => onRetour()}');
    expect(src).not.toContain('fiche !== null ? onFiche(null) : onRetour()');
    /* 🔴 ET IL NE VIT QUE DANS LA BRANCHE D'UNE FICHE : l'écran sans fiche n'a plus que son titre et la barre. */
    /* ⚠️ SANS LES COMMENTAIRES : l'encadré du haut de fiche EXPLIQUE que « ← Retour » reste sur une fiche —
       une lecture brute serait tombée sur cette explication plutôt que sur du code. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const sansFiche = code.slice(code.indexOf('{fiche === null ? ('), code.indexOf('<div className="ann-entete">'));
    expect(sansFiche).not.toContain('← Retour');
  });
});

/**
 * ══ 🔴🔴 BLOC RÉÉCRIT LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ════════════════════════════════════════════════════
 *
 * IL S'INTITULAIT « l'écran : des noms, pas des adresses » et éprouvait la LISTE DE RÉSULTATS de l'écran Annuaire,
 * ligne par ligne : `<LignePersonne`, le compteur « N personnes », le mobile, l'e-mail, le bien, la raison, le filet
 * de groupe et la case « Afficher les archivées ».
 *
 * CETTE LISTE N'EXISTE PLUS. Arno (07/10/2026) : « l'écran Annuaire est à reconstruire, minimal : un titre, une
 * phrase, et LE MÊME composant `BarreAnnuaire` que l'écran partagé. » Le retrait a été vérifié avant d'être fait,
 * et rendu point par point — voir l'encadré de retrait dans `Annuaire.tsx`.
 *
 * 🔴 CE QUE LE BLOC PROTÉGEAIT, ET QUI EST ÉPROUVÉ ICI PLUTÔT QUE SUPPRIMÉ : l'annuaire répond par des PERSONNES, et
 * un clic mène à la fiche DE SON RÔLE. C'est désormais la barre partagée qui le tient — et elle le tient pour de
 * vrai, montée dans un DOM, dans `BarreAnnuaire.test.ts` (« un propriétaire ouvre la fiche propriétaire », « un
 * locataire ouvre la fiche locataire », « un double rôle donne deux lignes, chacune vers SA fiche »). Le reste du
 * présent fichier — ce que le DÉPÔT rend, et ce qu'on n'a PAS touché — n'a pas bougé d'une ligne.
 *
 * ⚠️ ON NE GARDE DONC PAS DEUX ÉPREUVES DE LA MÊME CHOSE : ce qui suit vérifie que l'écran ne rend PLUS de seconde
 * liste, et qu'il passe bien par le composant partagé. Le détail du rendu d'une suggestion appartient à la barre.
 */
describe('🔴🔴 l’écran Annuaire : plus de seconde liste, la barre partagée', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
  /**
   * ⚠️ ON ÉPROUVE LE CODE, PAS LES COMMENTAIRES, et il le faut ici plus qu'ailleurs : la convention de ce dépôt
   * veut qu'un retrait LAISSE UN ENCADRÉ disant ce qui vivait là et pourquoi c'est parti. Cet encadré nomme donc
   * `Resultats`, `LignePersonne` et « Afficher les archivées » — un `not.toContain` sur le fichier entier serait
   * tombé sur la trace écrite du retrait, et aurait obligé à choisir entre la mémoire du lot et l'épreuve.
   */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /** 🔴🔴 LA LISTE ET SES PIÈCES SONT PARTIES, et rien n'en est gardé en dormance. */
  it('🔴🔴 ni `Resultats`, ni `LignePersonne`, ni compteur, ni case des archivées', () => {
    for (const mort of ['function Resultats', 'function LignePersonne', '<LignePersonne', 'MOT_ROLE',
      'Afficher les archivées', 'ann-personnes', 'ann-pers-corps', 'reponse.personnes']) {
      expect(code, mort).not.toContain(mort);
    }
  });

  /** 🔴🔴 ET L'ÉCRAN N'A PLUS DE RECHERCHE À LUI : ni champ, ni délai de frappe, ni requête. */
  it('🔴🔴 plus aucune recherche écrite dans l’écran', () => {
    expect(code).not.toContain('/api/admin/gestion/annuaire?q=');
    expect(code).not.toContain('const [terme, setTerme]');
    expect(code).not.toContain('ATTENTE_FRAPPE_MS');
    /* ⚠️ AUCUN CHAMP DE RECHERCHE PROPRE À L'ÉCRAN : les `<input>` qui restent sont ceux des formulaires de
       fiche (créer une personne, enregistrer un départ), et aucun n'est un `type="search"`. */
    const champs = (code.match(/<input[\s\S]*?\/>/g) ?? []).filter((c) => c.includes('type="search"'));
    expect(champs).toEqual([]);
  });

  /**
   * 🔴🔴 LE MÊME COMPOSANT, PAS UNE COPIE (Arno, mot pour mot). C'est la garantie centrale du lot : l'écran
   * Annuaire et l'écran partagé montent le MÊME `BarreAnnuaire`, donc interrogent la même route par le même
   * code. Deux copies auraient fini par ne plus trouver les mêmes personnes — ce qui était déjà en train
   * d'arriver.
   */
  it('🔴🔴 l’écran monte `BarreAnnuaire`, le composant de l’écran partagé', () => {
    expect(src).toContain("import { BarreAnnuaire } from './BarreAnnuaire'");
    expect(src).toContain('<BarreAnnuaire onFiche={onFiche} focusAuMontage />');
    const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(VUE).toContain("import { BarreAnnuaire } from './BarreAnnuaire'");
  });

  /** ⚠️ L'OPTION SERVEUR DES ARCHIVÉES N'EST PAS SUPPRIMÉE : c'est son appelant d'écran qui part. */
  it('⚠️ la route et le dépôt savent toujours rendre les archivées', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/annuaire/route.ts', 'utf8');
    expect(route).toContain("url.searchParams.get('archivees') === '1'");
    expect(route).toContain('rechercherPersonnes(terme, { avecArchivees })');
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('avecArchivees ? lignes : lignes.filter((x) => !x.archive)');
  });

  /** ⚠️ MOBILE D'ABORD (§15) : rien au seul survol. */
  it('mobile d’abord : aucune information révélée au seul survol', () => {
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });
});
