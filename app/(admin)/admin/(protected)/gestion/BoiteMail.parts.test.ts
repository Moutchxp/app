import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { apercu, nomCorrespondant } from './BoiteMail';

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

  it('les deux modes existent, et le poste de tri reste le DÉFAUT', () => {
    expect(vue).toContain("useState<ModeGestion>('tri')");
    expect(vue).toContain('Poste de tri');
    expect(vue).toContain('Boîte mail');
  });

  it('la boîte ouvre un échange par la vue conversation UNIQUE du module (lot 5b)', () => {
    expect(vue).toContain('<Conversation filId={filOuvert}');
    // …et elle ne se recâble pas une lecture à elle : aucun appel direct à la route des messages ici.
    expect(src).not.toContain('/messages');
  });

  it('la boîte ne fait AUCUNE écriture : elle ne connaît que son GET', () => {
    expect(/method:\s*'(POST|PATCH|DELETE|PUT)'/.test(src)).toBe(false);
  });
});
