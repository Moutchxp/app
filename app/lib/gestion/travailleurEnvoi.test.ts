import { describe, it, expect, vi } from 'vitest';
import {
  envoyerCeQuiEstPret, passeEnvoi, PIECES_EN_PARALLELE, recupererLesPieces, resumePasse,
  type DepsTravailleur, type LigneFile, type PieceAFond,
} from './travailleurEnvoi';
import type { EtatPiece } from './fileEnvoi';

/**
 * 🔴 LOT ENVOI-ARRIERE-PLAN — LE TRAVAILLEUR QUI VIDE LA FILE, ÉPROUVÉ SANS QU'UN SEUL MAIL PARTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Tout est injecté : base, Drive, Gmail, horloge. C'est ce qui permet de vérifier la règle la plus importante du lot
 * — « le mail ne part pas si une pièce manque » — en la METTANT EN ÉCHEC, ce qu'on ne peut pas faire sur le vrai
 * Drive sans y toucher.
 *
 * Ce qui est protégé ici :
 *   ① 🔴🔴 JAMAIS D'ENVOI PARTIEL : une pièce perdue ⇒ Gmail n'est même pas appelé ;
 *   ② l'échec REMET LE BROUILLON, puis alerte — dans cet ordre, parce que l'alerte porte un lien vers lui ;
 *   ③ 🔴 UNE SEULE ALERTE, et jamais d'alerte sur un mail d'alerte ;
 *   ④ les pièces se récupèrent PLUSIEURS À LA FOIS, et une qui échoue n'emporte pas les autres ;
 *   ⑤ les reprises sont bornées : au troisième échec, la pièce est déclarée perdue ;
 *   ⑥ une ligne qui jette n'emporte pas la passe ;
 *   ⑦ les pièces sont traitées AVANT les mails — pour que le mail parte dans la MÊME passe.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ligne = (o: Partial<LigneFile> = {}): LigneFile => ({
  id: 1, cleIdempotence: 'k1', brouillonId: 42, objet: 'Relance loyer',
  destinataires: ['martin@orange.fr'], demandeLe: new Date(2026, 8, 28, 18, 12),
  essais: 0, alerteLe: null, estUneAlerte: false, ...o,
});

const piece = (o: Partial<PieceAFond> = {}): PieceAFond => ({
  id: 10, nom: 'bail.pdf', driveId: 'd1', essais: 0, ...o,
});

/** Un travailleur de bureau : tout répond « rien à faire », et chaque test ne redéfinit que ce qu'il éprouve. */
function deps(o: Partial<DepsTravailleur> = {}): DepsTravailleur & { journal: string[] } {
  const journal: string[] = [];
  return {
    journal,
    piecesAPrendre: async () => [],
    recupererPiece: async () => {},
    marquerPiece: async (id, m) => { journal.push(`piece:${id}:${m.etat}`); },
    lignesAPrendre: async () => [],
    etatDesPieces: async () => ({ etats: [], premiereEchouee: null }),
    remettreEnAttente: async (id) => { journal.push(`reporte:${id}`); },
    envoyer: async () => { journal.push('GMAIL'); return { ok: true, envoiId: 77 }; },
    marquerEnvoye: async (id) => { journal.push(`envoye:${id}`); },
    marquerEchec: async (id, c) => { journal.push(`echec:${id}:${c.slice(0, 40)}`); },
    // 🔴 LOT PJ-APRES-VIDAGE — « rien n'a encore été signalé » est le cas de bureau ; un test le retourne.
    dejaSignale: async () => false,
    remettreEnBrouillon: async (l) => { journal.push(`brouillon:${l.id}`); },
    alerter: async (a) => { journal.push(`alerte:${a.objet}`); },
    marquerAlerte: async (id) => { journal.push(`alerte-marquee:${id}`); },
    lienBrouillon: (b) => `https://exemple.fr/admin/gestion?brouillon=${b ?? ''}`,
    incident: (etape) => { journal.push(`incident:${etape}`); },
    maintenant: () => new Date(2026, 8, 28, 18, 13),
    ...o,
  };
}

describe('🔴🔴 ① jamais d’envoi partiel', () => {
  it('🔴 une pièce en échec ⇒ GMAIL N’EST MÊME PAS APPELÉ', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['prete', 'echec'] as EtatPiece[], premiereEchouee: 'annexe.pdf' }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(d.journal).not.toContain('GMAIL');
    expect(r.envoyes).toBe(0);
    expect(r.echecs).toBe(1);
  });

  it('la cause NOMME la pièce perdue', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'annexe.pdf' }),
    });
    await envoyerCeQuiEstPret(d);
    expect(d.journal.find((l) => l.startsWith('echec:'))).toContain('annexe.pdf');
  });

  it('une pièce encore en route ⇒ la ligne est RENDUE à la file, rien n’est tenté', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['prete', 'attente'] as EtatPiece[], premiereEchouee: null }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(d.journal).toEqual(['reporte:1']);
    expect(d.journal).not.toContain('GMAIL');
    expect(r.reportes).toBe(1);
    expect(r.echecs).toBe(0);   // reporter n'est PAS échouer : rien n'est perdu, on repassera
  });

  it('toutes prêtes ⇒ le mail part, et la ligne est marquée', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['prete', 'prete'] as EtatPiece[], premiereEchouee: null }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(d.journal).toEqual(['GMAIL', 'envoye:1']);
    expect(r.envoyes).toBe(1);
  });

  it('un mail SANS pièce part, évidemment', async () => {
    const d = deps({ lignesAPrendre: async () => [ligne()] });
    expect((await envoyerCeQuiEstPret(d)).envoyes).toBe(1);
  });

  it('un refus de Gmail devient un échec, avec son motif', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      envoyer: async () => ({ ok: false, motif: 'destinataire inconnu' }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.echecs).toBe(1);
    expect(d.journal.find((l) => l.startsWith('echec:'))).toContain('Gmail a refusé');
  });
});

describe('🔴 ② l’échec remet le brouillon, PUIS alerte', () => {
  /**
   * 🔴 L'ORDRE COMPTE : l'alerte porte un lien vers le brouillon. Alerter d'abord, c'est risquer qu'on clique le
   * lien avant que le brouillon existe — et qu'on cherche un mail perdu sur une page vide.
   */
  it('🔴 le brouillon est remis AVANT que l’alerte ne parte', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
    });
    await envoyerCeQuiEstPret(d);
    const iBrouillon = d.journal.findIndex((l) => l.startsWith('brouillon:'));
    const iAlerte = d.journal.findIndex((l) => l.startsWith('alerte:'));
    expect(iBrouillon).toBeGreaterThan(-1);
    expect(iAlerte).toBeGreaterThan(iBrouillon);
  });

  it('l’objet de l’alerte est celui d’Arno', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne({ objet: 'Relance loyer' })],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
    });
    await envoyerCeQuiEstPret(d);
    expect(d.journal).toContain('alerte:⚠️ Mail non envoyé : Relance loyer');
  });

  /** 🔴 Si l'alerte ne part pas, on perd un SIGNAL, jamais le travail : la ligne et le brouillon restent. */
  it('🔴 une alerte qui échoue ne fait PAS échouer le reste', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
      alerter: async () => { throw new Error('smtp muet'); },
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.echecs).toBe(1);
    expect(d.journal).toContain('brouillon:1');
    expect(d.journal).toContain('incident:alerte');
    // …et elle n'est PAS marquée comme partie : on pourra la renvoyer.
    expect(d.journal.some((l) => l.startsWith('alerte-marquee'))).toBe(false);
  });

  /** ⚠️ Un brouillon qu'on ne peut pas remettre ne doit pas empêcher l'alerte : c'est elle qui préviendra. */
  it('un brouillon qu’on ne peut pas remettre n’empêche pas l’alerte', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
      remettreEnBrouillon: async () => { throw new Error('base'); },
    });
    await envoyerCeQuiEstPret(d);
    expect(d.journal).toContain('incident:brouillon');
    expect(d.journal.some((l) => l.startsWith('alerte:'))).toBe(true);
  });
});

describe('🔴 ③ une seule alerte, jamais de rafale', () => {
  it('🔴 une ligne DÉJÀ alertée n’alerte plus — sinon une passe par minute ferait une alerte par minute', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne({ alerteLe: new Date(2026, 8, 28, 18, 12, 30) })],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.alertes).toBe(0);
    expect(d.journal.some((l) => l.startsWith('alerte:'))).toBe(false);
    // …mais le brouillon est quand même remis : c'est le travail, pas le signal.
    expect(d.journal).toContain('brouillon:1');
  });

  /**
   * 🔴🔴 LE VERROU LE PLUS IMPORTANT. L'alerte part à `gestion@`, NOTRE propre boîte. Si son envoi échouait et
   * qu'on alertait là-dessus, on alerterait sur l'alerte, sans fin.
   */
  it('🔴🔴 un mail d’ALERTE qui échoue ne déclenche JAMAIS une autre alerte', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne({ estUneAlerte: true })],
      envoyer: async () => ({ ok: false, motif: 'gmail muet' }),
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.echecs).toBe(1);
    expect(r.alertes).toBe(0);
    expect(d.journal.some((l) => l.startsWith('alerte:'))).toBe(false);
  });

  /**
   * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — LE TROISIÈME VERROU : DEUX CLICS, UNE ALERTE ════════════════════════════════
   *
   * Les deux verrous ci-dessus ne voient qu'UNE ligne. Mesuré en base le 30/09/2026 (fil 3494) : deux clics sur
   * « transférer », à 14:55:31 et 14:56:53, ont fait DEUX lignes portant le MÊME brouillon et la MÊME cause —
   * donc deux alertes identiques dans la boîte, pour une seule chose à réparer.
   */
  it('🔴 la MÊME panne, déjà signalée il y a peu, ne re-alerte pas', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
      dejaSignale: async () => true,
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.alertes).toBe(0);
    expect(d.journal.some((l) => l.startsWith('alerte:'))).toBe(false);
    // …et l'échec reste MARQUÉ, et le brouillon remis : on tait le signal en double, jamais l'état.
    expect(d.journal.some((l) => l.startsWith('echec:1'))).toBe(true);
    expect(d.journal).toContain('brouillon:1');
  });

  /**
   * 🔴 UNE LECTURE QUI NE RÉPOND PAS NE DOIT PAS FAIRE TAIRE L'ALERTE. Une alerte en double est une gêne ; une
   * alerte perdue est un mail qu'on croit parti.
   */
  it('🔴 si la question « déjà signalé ? » échoue, on alerte quand même', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: ['echec'] as EtatPiece[], premiereEchouee: 'x.pdf' }),
      dejaSignale: async () => { throw new Error('base muette'); },
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(r.alertes).toBe(1);
    expect(d.journal).toContain('incident:alerte-doublon');
  });
});

describe('🔴 ④⑤ les pièces : en parallèle, et bornées', () => {
  it('🔴 elles sont récupérées PLUSIEURS À LA FOIS, pas l’une après l’autre', async () => {
    let enVol = 0;
    let maxEnVol = 0;
    const d = deps({
      piecesAPrendre: async () => [piece({ id: 1 }), piece({ id: 2 }), piece({ id: 3 }), piece({ id: 4 })],
      recupererPiece: async () => {
        enVol += 1;
        maxEnVol = Math.max(maxEnVol, enVol);
        await new Promise((r) => setTimeout(r, 5));
        enVol -= 1;
      },
    });
    await recupererLesPieces(d);
    expect(maxEnVol).toBeGreaterThan(1);
  });

  /** ⚠️ `allSettled`, jamais `all` : sinon une pièce en échec abandonnerait les autres EN VOL. */
  it('🔴 une pièce en échec n’emporte pas les autres', async () => {
    const d = deps({
      piecesAPrendre: async () => [piece({ id: 1 }), piece({ id: 2, essais: 2 }), piece({ id: 3 })],
      recupererPiece: async (p) => { if (p.id === 2) throw new Error('403'); },
    });
    const r = await recupererLesPieces(d);
    expect(r.piecesRecuperees).toBe(2);
    expect(r.piecesEchouees).toBe(1);
    expect(d.journal).toContain('piece:1:prete');
    expect(d.journal).toContain('piece:3:prete');
    expect(d.journal).toContain('piece:2:echec');
  });

  it('🔴 une erreur PASSAGÈRE laisse la pièce en attente : on réessaiera', async () => {
    const d = deps({
      piecesAPrendre: async () => [piece({ id: 5, essais: 0 })],
      recupererPiece: async () => { throw new Error('réseau coupé'); },
    });
    const r = await recupererLesPieces(d);
    expect(d.journal).toContain('piece:5:attente');
    expect(r.piecesEchouees).toBe(0);
  });

  it('🔴 au TROISIÈME échec, la pièce est déclarée perdue — s’acharner retarde l’alerte', async () => {
    const d = deps({
      piecesAPrendre: async () => [piece({ id: 5, essais: 2 })],
      recupererPiece: async () => { throw new Error('403'); },
    });
    const r = await recupererLesPieces(d);
    expect(d.journal).toContain('piece:5:echec');
    expect(r.piecesEchouees).toBe(1);
  });

  it('le parallélisme est raisonnable : assez pour ne pas attendre, assez peu pour ne pas se faire limiter', () => {
    expect(PIECES_EN_PARALLELE).toBeGreaterThanOrEqual(2);
    expect(PIECES_EN_PARALLELE).toBeLessThanOrEqual(8);
  });

  it('rien à récupérer ⇒ aucune requête', async () => {
    const espion = vi.fn(async () => {});
    const d = deps({ piecesAPrendre: async () => [], recupererPiece: espion });
    expect(await recupererLesPieces(d)).toMatchObject({ piecesRecuperees: 0 });
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('🔴 ⑥ une ligne qui jette n’emporte pas la passe', () => {
  it('les autres mails de la file partent quand même', async () => {
    const d = deps({
      lignesAPrendre: async () => [ligne({ id: 1 }), ligne({ id: 2, cleIdempotence: 'k2' })],
      etatDesPieces: async (l) => {
        if (l.id === 1) throw new Error('base indisponible');
        return { etats: [], premiereEchouee: null };
      },
    });
    const r = await envoyerCeQuiEstPret(d);
    expect(d.journal).toContain('incident:file');
    expect(r.envoyes).toBe(1);      // le second est bien parti
    expect(r.echecs).toBe(1);       // le premier est marqué, pas oublié
  });
});

describe('🔴 ⑦ les pièces AVANT les mails', () => {
  /**
   * 🔴 L'ORDRE DONNE UNE PASSE D'AVANCE. Récupérer avant d'examiner la file permet au mail de partir DANS LA MÊME
   * passe. L'ordre inverse le reporterait d'un tour, soit une minute de retard sur chaque envoi, pour rien.
   */
  it('une passe récupère la pièce PUIS envoie le mail, du même coup', async () => {
    const ordre: string[] = [];
    let etat: EtatPiece = 'attente';
    const d = deps({
      piecesAPrendre: async () => (etat === 'attente' ? [piece({ id: 9 })] : []),
      recupererPiece: async () => { ordre.push('recup'); },
      marquerPiece: async (_id, m) => { etat = m.etat; },
      lignesAPrendre: async () => [ligne()],
      etatDesPieces: async () => ({ etats: [etat], premiereEchouee: null }),
      envoyer: async () => { ordre.push('gmail'); return { ok: true, envoiId: 1 }; },
    });
    const r = await passeEnvoi(d);
    expect(ordre).toEqual(['recup', 'gmail']);
    expect(r.piecesRecuperees).toBe(1);
    expect(r.envoyes).toBe(1);
  });
});

describe('le résumé de passe', () => {
  it('une passe qui n’a rien fait ne DIT rien — un journal bavard ne se lit plus', () => {
    expect(resumePasse({
      piecesRecuperees: 0, piecesEchouees: 0, envoyes: 0, echecs: 0, alertes: 0, reportes: 0,
    })).toBeNull();
  });

  it('…et une passe qui a fait quelque chose le dit en clair', () => {
    const s = resumePasse({
      piecesRecuperees: 4, piecesEchouees: 1, envoyes: 2, echecs: 1, alertes: 1, reportes: 3,
    });
    expect(s).toContain('4 pièce(s) récupérée(s)');
    expect(s).toContain('2 mail(s) envoyé(s)');
    expect(s).toContain('1 mail(s) NON envoyé(s)');
    expect(s).toContain('3 en attente de pièces');
  });
});
