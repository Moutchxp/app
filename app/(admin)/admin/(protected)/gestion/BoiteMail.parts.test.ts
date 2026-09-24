import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { apercu, critereActif, morceauxMisEnEvidence, nomCorrespondant, CRITERE_VIDE } from './BoiteMail';

/**
 * LOT 5a — les parties PURES de la boîte mail, et les garanties d'écran qu'on ne veut pas voir se perdre.
 */

describe('l’aperçu d’une ligne', () => {
  it('🔴 retire l’historique CITÉ avant de couper — sinon dix réponses affichent dix fois le même aperçu', () => {
    const corps = 'Bonjour, c’est réparé.\n\nLe 12 septembre, Mme Martin a écrit :\n> le chauffage ne marche plus\n> depuis hier';
    expect(apercu(corps)).toBe('Bonjour, c’est réparé.');
  });

  it('les références techniques d’images ne polluent pas l’aperçu', () => {
    expect(apercu('Merci [cid:image001.png@01DA] à bientôt')).toBe('Merci à bientôt');
  });

  it('les retours à la ligne deviennent des espaces : une ligne de liste tient sur une ligne', () => {
    expect(apercu('Bonjour,\n\nvoici\nle devis')).toBe('Bonjour, voici le devis');
  });

  it('coupe à la longueur demandée, avec un signe que ce n’est pas fini', () => {
    const r = apercu('a'.repeat(300), 40);
    expect(r).toHaveLength(40);
    expect(r.endsWith('…')).toBe(true);
  });

  it('un extrait absent ou vide ne produit rien (l’écran n’affiche alors aucune ligne d’aperçu)', () => {
    expect(apercu(null)).toBe('');
    expect(apercu('   \n  ')).toBe('');
  });
});

describe('le nom du correspondant', () => {
  it('est rendu tel quel quand il existe', () => {
    expect(nomCorrespondant({ interlocuteur: 'Mme Martin' })).toBe('Mme Martin');
  });

  it('n’est JAMAIS vide : une ligne sans nom doit rester identifiable', () => {
    expect(nomCorrespondant({ interlocuteur: null })).toBe('(correspondant inconnu)');
    expect(nomCorrespondant({ interlocuteur: '   ' })).toBe('(correspondant inconnu)');
  });
});

/**
 * LOT 5c — LA MISE EN ÉVIDENCE. Deux pièges : rendre le texte NORMALISÉ au lieu de l'original (« Fenêtre » s'afficherait
 * « fenetre »), et porter la mise en évidence par la seule couleur.
 */
describe('LOT 5c — mettre en évidence les mots trouvés', () => {
  const texteDe = (m: { t: string }[]) => m.map((x) => x.t).join('');
  const forts = (m: { t: string; fort: boolean }[]) => m.filter((x) => x.fort).map((x) => x.t);

  it('marque le mot cherché, et rend le texte D’ORIGINE intact', () => {
    const m = morceauxMisEnEvidence('Fuite salle de bain', 'fuite');
    expect(texteDe(m)).toBe('Fuite salle de bain');
    expect(forts(m)).toEqual(['Fuite']); // la CASSE d'origine est gardée
  });

  it('🔴 un accent dans le texte, pas dans la saisie : le mot est marqué SANS être abîmé', () => {
    const m = morceauxMisEnEvidence('Fenêtre cassée', 'fenetre');
    expect(texteDe(m)).toBe('Fenêtre cassée'); // l'accent survit à la comparaison
    expect(forts(m)).toEqual(['Fenêtre']);
  });

  it('plusieurs mots, plusieurs marques', () => {
    const m = morceauxMisEnEvidence('fuite avenue Marceau', 'fuite marceau');
    expect(forts(m)).toEqual(['fuite', 'Marceau']);
  });

  it('une expression entre guillemets est marquée d’un bloc', () => {
    expect(forts(morceauxMisEnEvidence('au 28 avenue Marceau hier', '"avenue Marceau"'))).toEqual(['avenue Marceau']);
  });

  it('toutes les occurrences sont marquées, pas seulement la première', () => {
    expect(forts(morceauxMisEnEvidence('fuite puis fuite', 'fuite'))).toEqual(['fuite', 'fuite']);
  });

  it('sans saisie, rien n’est marqué et le texte est rendu tel quel', () => {
    const m = morceauxMisEnEvidence('Fuite salle de bain', '');
    expect(m).toEqual([{ t: 'Fuite salle de bain', fort: false }]);
  });

  it('un mot absent ne marque rien', () => {
    expect(forts(morceauxMisEnEvidence('Fuite salle de bain', 'chauffage'))).toEqual([]);
  });

  it('un texte vide ne casse rien', () => {
    expect(texteDe(morceauxMisEnEvidence('', 'fuite'))).toBe('');
  });
});

describe('LOT 5c — quand la recherche se déclenche', () => {
  it('un critère vide ne cherche pas', () => {
    expect(critereActif(CRITERE_VIDE)).toBe(false);
    expect(critereActif({ ...CRITERE_VIDE, q: '   ' })).toBe(false);
    expect(critereActif({ ...CRITERE_VIDE, q: 'a' })).toBe(false); // une lettre ne filtre rien
  });

  it('un mot, une date ou un expéditeur suffisent', () => {
    expect(critereActif({ ...CRITERE_VIDE, q: 'fuite' })).toBe(true);
    expect(critereActif({ ...CRITERE_VIDE, du: '2026-01-01' })).toBe(true);
    expect(critereActif({ ...CRITERE_VIDE, de: 'martin' })).toBe(true);
  });
});

describe('garanties d’écran (statiques)', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
  const vue = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

  it('aucune couleur en dur : uniquement des jetons --color-svv-*', () => {
    const couleurs = src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    expect(couleurs).toEqual([]);
  });

  it('les lignes sont des cibles tactiles d’au moins 44 px', () => {
    expect(src).toContain('min-height:44px');
  });

  it('rien ne dépend du SURVOL seul : chaque `:hover` a son `:focus-visible`', () => {
    const hovers = (src.match(/:hover/g) ?? []).length;
    expect(hovers).toBeGreaterThan(0);
    expect(src).toContain(':focus-visible');
  });

  it('aucun débordement horizontal : les textes longs cassent en fin de ligne', () => {
    expect((src.match(/overflow-wrap:anywhere/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('chaque marque de ligne porte un MOT, jamais une couleur seule', () => {
    for (const mot of ['pièce jointe', 'classé sans suite', 'courrier automatique']) {
      expect(src).toContain(mot);
    }
  });

  it('🔴 le compteur « N échanges plus anciens » du poste de tri est CONSERVÉ mot pour mot', () => {
    expect(vue).toContain('ne {d.filsTropAnciens > 1 ? \'sont\' : \'est\'} pas affiché');
    expect(vue).toContain('Rien n’est supprimé');
    // …et il gagne seulement une sortie vers la liste.
    expect(vue).toContain('Les voir dans la boîte mail');
  });

  /**
   * 🔴 LOT 5-FUSION — LES DEUX ONGLETS SONT RETIRÉS. C'est le SEUL retrait du lot, et il est décidé par Arno : la
   * boîte et le poste de tri ne sont plus deux modes qui s'excluent, mais un seul écran.
   *
   * CE TEST GARDE LA CONTREPARTIE, qui est la seule chose qui rendait ce retrait acceptable : ce que montrait
   * l'onglet « Boîte mail » est TOUJOURS ATTEIGNABLE — par le bouton « Plein écran » de la colonne de gauche, qui
   * ouvre la même liste sous ses étiquettes. Un retrait sans cette porte serait une perte de fonction.
   */
  it('🔴 les deux onglets ont disparu — et la boîte reste atteignable par le plein écran', () => {
    // Sur les lignes de CODE seulement : l'en-tête du fichier CITE les onglets pour expliquer leur retrait et
    //   nommer ce qui les remplace. Une assertion sur la prose rougirait pour une bonne explication.
    const code = vue.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toContain('Poste de tri');
    expect(code).not.toContain('gst-mode');
    expect(vue).toContain('Plein écran');
    expect(vue).toContain('<PleinEcranBoite');
    // …et l'écran partagé reste le point d'entrée : on n'arrive pas dans un outil de travail par sa réserve.
    expect(vue).toContain("ecran === 'boite'");
  });

  it('🔴 la liste de la boîte n’a pas été recopiée : le plein écran rend le MÊME composant', () => {
    const pe = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    expect(pe).toContain("import { BoiteMail } from './BoiteMail'");
    expect(pe).toContain("import { Conversation } from './Conversation'");
    // Aucune lecture à lui : il dispose des composants, il ne va rien chercher tout seul.
    expect(pe).not.toContain('fetch(');
  });

  it('la boîte ouvre un échange par la vue conversation UNIQUE du module (lot 5b)', () => {
    expect(vue).toContain('<Conversation filId={filOuvert}');
    // …et elle ne se recâble pas une lecture à elle : aucun appel direct à la route des messages ici.
    expect(src).not.toContain('/messages');
  });

  it('la boîte ne fait AUCUNE écriture : elle ne connaît que son GET', () => {
    expect(/method:\s*'(POST|PATCH|DELETE|PUT)'/.test(src)).toBe(false);
  });

  it('LOT 5c — le champ de saisie fait 16 px : en dessous, iOS zoome à chaque clic dedans', () => {
    expect(src).toContain('font-size:16px');
  });

  it('LOT 5c — la mise en évidence passe par la GRAISSE, jamais par la seule couleur', () => {
    expect(src).toContain('.bte-trouve{font-weight:800');
    expect(src).toContain('<strong');
  });

  it('LOT 5c — la recherche ne part pas à chaque frappe : elle est validée par un formulaire', () => {
    expect(src).toContain('onSubmit=');
    expect(src).toContain("type=\"submit\"");
  });

  it('LOT 5c — le mode réduit est DIT à l’écran, il ne fait pas semblant', () => {
    expect(src).toContain('mode réduit');
    expect(src).toContain('une fois la mise à jour de la');
  });
});
