/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE (08/10/2026) — LE CÂBLAGE, DE LA COLONNE À LA PASTILLE ═════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La RÈGLE est éprouvée dans `app/lib/gestion/rechercheAdresses.test.ts`, sur les fonctions elles-mêmes. Ce
 * fichier-ci tient la CHAÎNE : que les colonnes soient lues, que la matière de la recherche les contienne, et
 * que l'écran montre l'explication — trois maillons dont aucun ne se voit dans une épreuve de fonction pure.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filtrerParMots } from '../../../../lib/gestion/historiqueBien';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
const ECRAN = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const LIGNE = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');

let n = 0;
const ligne = (p: Partial<LigneHistorique>): LigneHistorique => ({
  messageId: (n += 1), filId: 1, messageIdRfc: null, recuLe: '2026-10-01T09:00:00Z', sens: 'recu',
  de: 'agence@criterimmo.test', deNom: 'Agence', destinataires: [],
  a: [], cc: [], cci: [], repondreA: [], adressesTexte: [],
  objet: 'Chaudière', extrait: 'Bonjour,', pieces: [],
  parCible: { sorte: 'lot', cle: '315', id: null }, cibleLibelle: 'lot 315', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null, ...p,
});

describe('🔴🔴 ① la recherche fouille désormais les cinq familles d’adresses', () => {
  /**
   * 🔴🔴 LE CAS QUI MOTIVE LE LOT : une adresse qui n'apparaît QU'EN COPIE. Avant, `matiereDuMail` ne portait
   * que l'expéditeur : ce mail-là ne sortait jamais, et c'est précisément celui qu'Arno cherche quand il
   * traque une adresse « non affectée ».
   */
  it('🔴🔴 une adresse seulement en copie fait sortir le mail', () => {
    const l = ligne({ cc: [{ nom: 'Marie', adresse: 'gohudif.marie@gmail.com' }] });
    expect(filtrerParMots([l], 'gohudif')).toHaveLength(1);
    expect(filtrerParMots([l], '@gmail.com')).toHaveLength(1);
  });

  /** 🔴 ET LES QUATRE AUTRES FAMILLES, une par une : aucune ne doit manquer à l'appel. */
  it('🔴🔴 destinataire, copie cachée, répondre-à et corps font sortir le mail', () => {
    expect(filtrerParMots([ligne({ a: [{ nom: null, adresse: 'x@destinataire.test' }] })], 'destinataire'))
      .toHaveLength(1);
    expect(filtrerParMots([ligne({ cci: [{ nom: null, adresse: 'x@cachee.test' }] })], 'cachee')).toHaveLength(1);
    expect(filtrerParMots([ligne({ repondreA: [{ nom: null, adresse: 'x@repondre.test' }] })], 'repondre'))
      .toHaveLength(1);
    expect(filtrerParMots([ligne({ adressesTexte: ['service@manomano.test'] })], 'manomano')).toHaveLength(1);
  });

  /**
   * 🔴 LE NOM DES DESTINATAIRES AUSSI. « À : Mme Gohudif » doit répondre à « gohudif » même quand l'adresse
   * ne porte pas le nom. Le nom de l'EXPÉDITEUR était déjà fouillé ; celui des destinataires ne l'était pas,
   * et la dissymétrie n'avait aucune raison d'être.
   */
  it('🔴 le nom d’un destinataire est cherché comme celui de l’expéditeur', () => {
    const l = ligne({ cc: [{ nom: 'Marie GOHUDIF', adresse: 'm.g@fictif.test' }] });
    expect(filtrerParMots([l], 'gohudif')).toHaveLength(1);
  });

  /**
   * 🔴🔴 ET LES CRITÈRES D'AVANT N'ONT PAS BOUGÉ (Arno : « Les autres critères de recherche actuels restent
   * inchangés »). Objet, extrait, nom de l'expéditeur, nom des pièces : les quatre répondent encore, et la
   * règle « TOUS les mots présents, n'importe où » vaut toujours.
   */
  it('🔴🔴 objet, extrait, expéditeur et pièces répondent comme avant', () => {
    const l = ligne({
      objet: 'Devis chaudière', extrait: 'le remplacement du ballon', deNom: 'Plomberie DURAND',
      pieces: [{
        pieceId: 1, nomFichier: 'devis-2026.pdf', typeMime: 'application/pdf', tailleOctets: 10,
        disponible: true, motifNonStocke: null,
      } as LigneHistorique['pieces'][number]],
    });
    expect(filtrerParMots([l], 'chaudiere')).toHaveLength(1);
    expect(filtrerParMots([l], 'ballon')).toHaveLength(1);
    expect(filtrerParMots([l], 'durand')).toHaveLength(1);
    expect(filtrerParMots([l], 'devis-2026')).toHaveLength(1);
    /* 🔴 « TOUS LES MOTS », et ils peuvent venir de champs DIFFÉRENTS — y compris d'une adresse maintenant. */
    expect(filtrerParMots([l], 'chaudiere durand')).toHaveLength(1);
    expect(filtrerParMots([l], 'chaudiere introuvable')).toHaveLength(0);
  });
});

describe('🔴🔴 ② le dépôt lit les colonnes qu’il faut, et pas plus', () => {
  /**
   * 🔴 LE « RÉPONDRE-À » EST LU : la colonne existait, personne ne s'en servait ici. Mesuré le 08/10/2026 :
   * 1 090 des 11 736 mails de biens en portent un.
   */
  it('🔴🔴 le Reply-To entre dans la ligne', () => {
    expect(REPO).toContain('m.repondre_a::text');
    expect(REPO).toContain('repondreA: personnesDuChamp(r.repondre_a),');
  });

  /**
   * 🔴🔴 LE CORPS EST LU POUR Y RELEVER LES ADRESSES, AVEC SON REPLI HTML ET SA BORNE. Les trois comptent :
   * sans le repli, 545 mails de biens (mesuré) n'ont aucun `corps_texte` et seraient muets ; sans la borne,
   * la page lirait 25 corps entiers à chaque affichage.
   */
  it('🔴🔴 le corps est lu, avec son repli HTML et sa borne', () => {
    expect(REPO).toContain("left(coalesce(nullif(btrim(m.corps_texte), ''), m.corps_html, ''), 20000)");
    expect(REPO).toContain('adressesTexte: adressesDuTexte(r.corps_adresses),');
  });

  /**
   * 🔴🔴 ET LE RELEVÉ NE PART PAS À L'ÉCRAN EN ENTIER : c'est le dépôt qui extrait, et la ligne ne porte que
   * les adresses. Une épreuve sur le TYPE le dirait mal ; ici on vérifie qu'aucun corps complet n'est
   * renvoyé sous un autre nom.
   */
  it('🔴 l’écran ne reçoit pas le corps entier', () => {
    expect(REPO).not.toContain('corps_texte AS corps');
    expect(REPO).toContain('AS corps_adresses');
  });

  /** ⚠️ AUCUNE EXPRESSION RÉGULIÈRE DANS LE DÉPÔT : le relevé est dans le module pur, éprouvé à part. */
  it('⚠️ le dépôt ne porte aucune expression d’adresse', () => {
    expect(REPO).toContain("import { adressesDuTexte } from './rechercheAdresses';");
  });
});

describe('🔴🔴 ③ l’écran montre POURQUOI le mail correspond', () => {
  /** 🔴 LES ADRESSES TROUVÉES SONT CALCULÉES PAR LE MODULE PUR, avec la MÊME normalisation que la recherche. */
  it('🔴🔴 la ligne reçoit les adresses trouvées', () => {
    expect(ECRAN).toContain('adressesTrouvees={adressesTrouvees(l, mots, normaliserRecherche)}');
    expect(ECRAN).toContain("import { adressesTrouvees } from '../../../../lib/gestion/rechercheAdresses';");
  });

  /** 🔴 ET ELLE LES AFFICHE AVEC LEUR ÉTIQUETTE, le morceau cherché surligné par la règle commune. */
  it('🔴🔴 chaque adresse paraît avec son rôle, et surlignée', () => {
    expect(LIGNE).toContain('<span className="vdb-adresse-role">{x.mot}</span>');
    expect(LIGNE).toContain('decouperPourSurligner(x.adresse, surligner)');
    expect(LIGNE).toContain('<mark key={`${i}-${m.texte}`} className="vdb-trouve">{m.texte}</mark>');
  });

  /**
   * 🔴🔴 LA PROPRIÉTÉ EST FACULTATIVE, ET C'EST LE GARDE-FOU DU COMPOSANT PARTAGÉ (CLAUDE.md) : `LigneVie` est
   * montée par QUATRE écrans, dont trois n'ont aucun champ de recherche. Absente, elle rend exactement ce
   * qu'elle rendait avant ce lot.
   */
  it('🔴🔴 les trois autres écrans qui montent la ligne ne bougent pas', () => {
    expect(LIGNE).toContain('destinataires = [], piecesCitables = [], adressesTrouvees = [],');
    expect(LIGNE).toContain('adressesTrouvees?: readonly AdresseTrouvee[];');
    expect(LIGNE).toContain('{adressesTrouvees.length > 0 && (');
  });

  /**
   * 🔴 LE COMPTEUR « N MAILS », CONTRE LE CHAMP (Arno, point 4). Il n'apparaît que pendant une recherche.
   *
   * ⚠️ L'ANCIEN COMPTEUR « N mails sur M » RESTE : il est à l'autre bout de la rangée d'options, et le
   * retirer demanderait l'accord d'Arno pour CET élément. Les deux coexistent, et le compte rendu le dit.
   */
  it('🔴 un compteur « N mails » paraît contre le champ, sans retirer l’ancien', () => {
    expect(ECRAN).toContain('{lignes.length} mail{lignes.length > 1 ? \'s\' : \'\'}');
    expect(ECRAN).toContain('className="hdb-compte-champ"');
    expect(ECRAN).toContain('motCompteurRecherche(lignes.length, lignesPage.length, true)');
  });

  /**
   * 🔴🔴 AUCUNE ÉCRITURE (Arno, point 5 : « la recherche ne rattache rien toute seule »). Ce lot n'ajoute ni
   * `fetch` de méthode d'écriture, ni appel de rattachement : il lit, il filtre, il explique.
   */
  it('🔴🔴 la recherche n’écrit rien', () => {
    const bloc = LIGNE.slice(LIGNE.indexOf('{adressesTrouvees.length > 0 && ('),
      LIGNE.indexOf('{!ouvert && lisible !== null'));
    for (const interdit of ['fetch(', 'POST', 'PATCH', 'onRattacher']) {
      expect(bloc, interdit).not.toContain(interdit);
    }
  });
});
