import { describe, it, expect } from 'vitest';
import { choixRecu, classementRecu } from './route';

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — CE QUE LA ROUTE ACCEPTE DU NAVIGATEUR ════════════════════════════════════════
 *
 * 🔴 RIEN N'EST CRU SUR PAROLE. Une période est une décision qui reclasse des mails — parfois toute une
 * conversation. Ce qui arrive du navigateur est donc re-validé ici, et c'est la SEULE ligne qu'un navigateur ne
 * puisse pas contourner. C'est le même raisonnement que l'assainissement du HTML à l'envoi.
 *
 * ⚠️ ON ÉPROUVE LES DEUX FONCTIONS PURES, pas la route entière : la route n'est que de la plomberie autour
 * d'elles, et le reste (le droit, l'auteur de la session) est tenu par `exigerCompteActif`.
 */
describe('🔴 le classement reçu, re-validé', () => {
  it('🔴 des biens, avec leur clé et leur libellé', () => {
    expect(classementRecu({ sorte: 'biens', biens: [{ cle: '421', libelle: '28 av. Marceau' }] }))
      .toEqual({ sorte: 'biens', biens: [{ cle: '421', libelle: '28 av. Marceau' }] });
  });

  it('🔴 « interne » et « hors gestion » ne portent aucun bien', () => {
    expect(classementRecu({ sorte: 'interne', biens: [{ cle: 'X', libelle: 'X' }] }))
      .toEqual({ sorte: 'interne', biens: [] });
    expect(classementRecu({ sorte: 'hors_gestion' })).toEqual({ sorte: 'hors_gestion', biens: [] });
  });

  /** 🔴 UNE SORTE INCONNUE EST REFUSÉE, jamais traduite : on ne devine pas une décision de classement. */
  it('🔴 une sorte inconnue rend `null`', () => {
    for (const x of [{ sorte: 'autre' }, { sorte: 42 }, {}, null, 'biens', []]) {
      expect(classementRecu(x), JSON.stringify(x)).toBeNull();
    }
  });

  /** ⚠️ UN LIBELLÉ VIDE RETOMBE SUR LA CLÉ : une ligne sans nom dans une période se relirait sans savoir de
   *  quel bien elle parle. */
  it('⚠️ un libellé manquant est remplacé par la clé', () => {
    expect(classementRecu({ sorte: 'biens', biens: [{ cle: '421' }] })?.biens)
      .toEqual([{ cle: '421', libelle: '421' }]);
  });

  it('⚠️ un bien sans clé est écarté : il ne désigne rien', () => {
    expect(classementRecu({ sorte: 'biens', biens: [{ libelle: 'x' }, { cle: '  ' }, 7, null] })?.biens)
      .toEqual([]);
  });

  /** 🔴 LA SÉLECTION EST UN ENSEMBLE, et elle le reste en base (lot MODALE-RATTACHER-PROPRE). */
  it('🔴 un même bien envoyé deux fois n’entre qu’une', () => {
    expect(classementRecu({ sorte: 'biens', biens: [
      { cle: '421', libelle: 'A' }, { cle: '421', libelle: 'A' },
    ] })?.biens).toHaveLength(1);
  });

  it('⚠️ la liste est bornée, et les libellés aussi', () => {
    const cinquante = Array.from({ length: 80 }, (_, i) => ({ cle: `k${i}`, libelle: 'x' }));
    expect(classementRecu({ sorte: 'biens', biens: cinquante })?.biens).toHaveLength(50);
    expect(classementRecu({ sorte: 'biens', biens: [{ cle: 'a', libelle: 'z'.repeat(400) }] })?.biens[0].libelle)
      .toHaveLength(300);
  });
});

describe('🔴🔴 le choix de suivi reçu', () => {
  it('🔴 les trois choix d’Arno sont reconnus', () => {
    expect(choixRecu('mail')).toBe('mail');
    expect(choixRecu('suite')).toBe('suite');
    expect(choixRecu('conversation')).toBe('conversation');
  });

  /**
   * 🔴🔴 UN CHOIX ABSENT OU INCONNU NE VAUT JAMAIS « TOUTE LA CONVERSATION ». C'est le seul des trois qui
   * reclasse des mails PASSÉS : le laisser arriver par défaut ferait du geste le plus large celui qu'on obtient
   * en ne demandant rien. Le repli est « suite », qui est aussi le défaut d'Arno à l'écran.
   */
  it('🔴🔴 absent ou inconnu ⇒ « suite », jamais « conversation »', () => {
    for (const x of [undefined, null, '', 'tout', 'CONVERSATION', 42, {}]) {
      expect(choixRecu(x), JSON.stringify(x)).toBe('suite');
    }
  });
});
