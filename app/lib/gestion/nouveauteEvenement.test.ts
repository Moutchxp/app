import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ══ 🔴🔴 LOT NEW-EVENEMENT-PROPRE (04/11/2026) — LE « NEW » D'UN ÉVÉNEMENT, ÉTAT PROPRE ═══════════════════════════
 *
 * LA RÈGLE D'ARNO : le « New » s'allume à l'arrivée d'un mail REÇU rattaché à l'événement ; il s'éteint quand on
 * déplie la carte, ou quand on ouvre le mail (dans l'application ou dans Gmail) ; il ne revient qu'avec un NOUVEAU
 * mail reçu. L'application ne remet JAMAIS un mail en non lu d'elle-même.
 *
 * COMMENT CE FICHIER L'ÉPROUVE : les fonctions RÉELLES de `nouveauteEvenement.ts` tournent sur une petite base EN
 * MÉMOIRE (messages, rattachements, seuils), et `query` exécute chacune de leurs écritures sur cette base. La
 * lecture du « New » (`nouveau`) suit la requête de `fileRepo` (seuil, puis non-lu Gmail pour un événement sans
 * ligne), dont les FRAGMENTS sont vérifiés plus bas. Le SQL lui-même a été joué sur la recette, en transaction
 * annulée, le 04/11/2026.
 *
 * 🔒 Aucun réseau, aucune base, aucun Gmail : tout est doublé.
 */

interface Msg { id: number; fil: number; sens: 'recu' | 'envoye'; exclu?: boolean; mng?: string }
interface Aff { evt: number; fil: number; message: number | null; actif: boolean }
/** 🔴 Un lien référence MNG- ↔ événement (`gestion_monga_lien`) ; `retire` = lien retiré. */
interface LienMonga { evt: number; ref: string; retire?: boolean }
const base = {
  messages: [] as Msg[], affectations: [] as Aff[], liensMonga: [] as LienMonga[],
  seuils: new Map<number, { vu: number; motif: string; par: string }>(),
  ecrituresGmail: [] as string[],
};

/** Les mails reçus de chaque événement — la relation de `sqlMailsRecusDesEvenements`, sur la base en mémoire. */
function mailsRecus(): { evt: number; id: number; fil: number }[] {
  const ok = (m: Msg | undefined): m is Msg => m !== undefined && m.sens === 'recu' && m.exclu !== true;
  const out: { evt: number; id: number; fil: number }[] = [];
  for (const a of base.affectations.filter((x) => x.actif)) {
    if (a.message !== null) {
      const m = base.messages.find((x) => x.id === a.message);
      if (ok(m)) out.push({ evt: a.evt, id: m.id, fil: m.fil });
    } else {
      for (const m of base.messages.filter((x) => x.fil === a.fil)) {
        const deplace = base.affectations.some((x) => x.actif && x.message === m.id);
        if (ok(m) && !deplace) out.push({ evt: a.evt, id: m.id, fil: m.fil });
      }
    }
  }
  // 🔴 la branche MONGA : un mail lu par Monga, dont la référence est reliée à l'événement (lien non retiré)
  for (const l of base.liensMonga.filter((x) => x.retire !== true)) {
    for (const m of base.messages.filter((x) => x.mng === l.ref)) if (ok(m)) out.push({ evt: l.evt, id: m.id, fil: m.fil });
  }
  return out;
}

function poser(lignes: { evt: number; id: number }[], motif: string, par: string): number {
  const mx = new Map<number, number>();
  for (const l of lignes) mx.set(l.evt, Math.max(mx.get(l.evt) ?? 0, l.id));
  let n = 0;
  for (const [evt, v] of mx) {
    const avant = base.seuils.get(evt);
    if (avant !== undefined && v <= avant.vu) continue; // 🔴 le seuil ne recule jamais
    base.seuils.set(evt, { vu: v, motif, par }); n += 1;
  }
  return n;
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const plat = sql.replace(/\s+/g, ' ');
  if (plat.includes('SELECT max(id)::text AS mx FROM gestion_message')) {
    return { rows: [{ mx: String(Math.max(0, ...base.messages.map((m) => m.id))) }], rowCount: 1 };
  }
  if (plat.includes('INSERT INTO gestion_evenement_nouveaute')) {
    const [libelle, motif] = params.slice(-2) as [string, string];
    let lignes = mailsRecus();
    if (plat.includes('WHERE m.evenement_id = $1')) lignes = lignes.filter((l) => l.evt === params[0]);
    else if (plat.includes('WHERE m.fil_id = $1')) lignes = lignes.filter((l) => l.fil === params[0]);
    else if (plat.includes('HAVING NOT bool_or(m.id = ANY($2::bigint[]))')) {
      const plafond = params[0] as number; const nonLus = new Set(params[1] as number[]);
      const candidats = lignes.filter((l) => l.id <= plafond && l.id > (base.seuils.get(l.evt)?.vu ?? 0));
      const avecNonLu = new Set(candidats.filter((l) => nonLus.has(l.id)).map((l) => l.evt));
      lignes = candidats.filter((l) => !avecNonLu.has(l.evt));
    } else throw new Error(`écriture inattendue : ${plat}`);
    return { rows: [], rowCount: poser(lignes, motif, libelle) };
  }
  throw new Error(`requête inattendue : ${plat}`);
});
vi.mock('../db/client', () => ({ query: (sql: string, p?: unknown[]) => query(sql, p) }));
let avec456 = true;
vi.mock('./schema', () => ({
  evenementNouveauteDisponible: async () => avec456,
  deplacementsDeMailsDisponibles: async () => true,
  mongaDisponible: async () => true,
}));

const { vuParLaCarte, vuParLeMail, constaterLecturesGmail, plafondDesMails, sqlMailsRecusDesEvenements } =
  await import('./nouveauteEvenement');

/** Le « New » tel que la requête des cartes le lit (seuil ; sans ligne : un mail reçu non lu dans Gmail). */
function nouveau(evt: number, nonLusGmail: ReadonlySet<number>): boolean {
  const s = base.seuils.get(evt);
  return mailsRecus().some((l) => l.evt === evt && l.id > (s?.vu ?? 0) && (s !== undefined || nonLusGmail.has(l.id)));
}

/** Gmail en mémoire : les messages NON LUS. L'application n'y écrit que par `ouvrirLeMail` (retirer UNREAD). */
let nonLus = new Set<number>();
/** Une lecture de l'écran : le constat des lectures Gmail, puis le « New » de chaque carte. */
async function lireLEcran(evt: number): Promise<boolean> {
  const plafond = await plafondDesMails();
  await constaterLecturesGmail([...nonLus], plafond);
  return nouveau(evt, nonLus);
}
/** Ouvrir le mail dans l'application : Gmail le marque lu (tout l'échange), et l'événement est vu. */
async function ouvrirLeMail(fil: number): Promise<void> {
  for (const m of base.messages.filter((x) => x.fil === fil)) nonLus.delete(m.id);
  base.ecrituresGmail.push(`lu:${fil}`);
  await vuParLeMail(fil, 'collegue');
}
/** Une relève : un mail arrive (reçu → non lu dans Gmail ; envoyé → lu). */
function arrive(m: Msg): void {
  base.messages.push(m);
  if (m.sens === 'recu') nonLus.add(m.id);
}

beforeEach(() => {
  base.messages = []; base.affectations = []; base.liensMonga = []; base.seuils = new Map(); base.ecrituresGmail = [];
  nonLus = new Set(); avec456 = true; query.mockClear();
});

describe('🔴 la règle d’Arno, pas à pas', () => {
  beforeEach(() => {
    base.affectations.push({ evt: 1, fil: 10, message: null, actif: true });
    arrive({ id: 100, fil: 10, sens: 'recu' });
  });

  it('① un mail reçu rattaché arrive → « New »', async () => {
    expect(await lireLEcran(1)).toBe(true);
  });

  it('② déplier la carte → plus de « New », et les mails restent NON LUS dans Gmail', async () => {
    await lireLEcran(1);
    expect(await vuParLaCarte(1, 'collegue')).toBe(1);
    expect(await lireLEcran(1)).toBe(false);
    expect(nonLus.has(100)).toBe(true);
    expect(base.ecrituresGmail).toEqual([]);
    expect(base.seuils.get(1)).toMatchObject({ vu: 100, motif: 'carte', par: 'collegue' });
  });

  it('③ ouvrir le mail déclencheur → lu dans Gmail ET plus de « New »', async () => {
    await ouvrirLeMail(10);
    expect(nonLus.has(100)).toBe(false);
    expect(await lireLEcran(1)).toBe(false);
    expect(base.seuils.get(1)?.motif).toBe('mail');
  });

  it('④ une nouvelle relève (rien de neuf, ou un ENVOI de notre part) → toujours lu, toujours pas de « New »', async () => {
    await ouvrirLeMail(10);
    expect(await lireLEcran(1)).toBe(false);
    expect(await lireLEcran(1)).toBe(false);
    arrive({ id: 101, fil: 10, sens: 'envoye' }); // nos propres envois n'allument rien
    expect(await lireLEcran(1)).toBe(false);
    expect(nonLus.has(100)).toBe(false);
  });

  it('⑤ un NOUVEAU mail reçu → le « New » revient ; et lui seul le rallume', async () => {
    await vuParLaCarte(1, 'collegue');
    arrive({ id: 102, fil: 10, sens: 'recu' });
    expect(await lireLEcran(1)).toBe(true);
    await ouvrirLeMail(10);
    expect(await lireLEcran(1)).toBe(false);
  });

  it('rouvrir un mail, ou le marquer NON LU à la main, ne rallume pas le « New »', async () => {
    await ouvrirLeMail(10);
    nonLus.add(100); // « Marquer comme non lu » (geste humain, dans Gmail ou ici)
    expect(await lireLEcran(1)).toBe(false);
    await ouvrirLeMail(10);
    expect(await lireLEcran(1)).toBe(false);
  });

  it('le mail ouvert DIRECTEMENT DANS GMAIL : la lecture de l’écran le constate et éteint le « New »', async () => {
    expect(await lireLEcran(1)).toBe(true);
    nonLus.delete(100); // la collègue l'a lu dans Gmail
    expect(await lireLEcran(1)).toBe(false);
    expect(base.seuils.get(1)).toMatchObject({ vu: 100, motif: 'gmail' });
    nonLus.add(100); // puis remis non lu dans Gmail : le « New » ne revient pas pour autant
    expect(await lireLEcran(1)).toBe(false);
  });

  it('un mail capturé APRÈS la liste Gmail n’est pas jugé lu : il reste hors du constat', async () => {
    await vuParLaCarte(1, 'collegue');
    const plafond = await plafondDesMails();
    arrive({ id: 103, fil: 10, sens: 'recu' });
    await constaterLecturesGmail([], plafond); // la liste avait été lue AVANT son arrivée
    expect(nouveau(1, nonLus)).toBe(true);
  });
});

describe('🔴 les cas qui touchaient « certains » mails', () => {
  it('un échange qui couvre PLUSIEURS conversations Gmail : l’ouvrir éteint le « New », même si Gmail n’a pas tout marqué', async () => {
    base.affectations.push({ evt: 1, fil: 5881, message: null, actif: true });
    arrive({ id: 200, fil: 5881, sens: 'recu' });
    arrive({ id: 201, fil: 5881, sens: 'recu' });
    await vuParLeMail(5881, 'collegue'); // Gmail aurait refusé ou raté une conversation : l'état est EN BASE
    expect(nouveau(1, nonLus)).toBe(false);
    expect(nonLus.size).toBe(2); // rien n'a été écrit dans Gmail par ce geste-là
  });

  it('un mail MONGA (référence MNG-) rattaché à l’événement se comporte comme les autres', async () => {
    base.affectations.push({ evt: 7, fil: 2022, message: null, actif: true });
    arrive({ id: 300, fil: 2022, sens: 'recu', mng: 'MNG-20336' });
    expect(await lireLEcran(7)).toBe(true);
    await ouvrirLeMail(2022);
    expect(await lireLEcran(7)).toBe(false);
    arrive({ id: 301, fil: 2022, sens: 'recu', mng: 'MNG-20336' }); // « MNG-20336 - Nouveau commentaire »
    expect(await lireLEcran(7)).toBe(true);
    await vuParLaCarte(7, 'collegue');
    expect(await lireLEcran(7)).toBe(false);
  });

  it('un mail rattaché à DEUX biens (deux événements : l’échange à l’un, le mail déplacé à l’autre) : l’ouvrir éteint les deux', async () => {
    base.affectations.push({ evt: 1, fil: 40, message: null, actif: true });
    base.affectations.push({ evt: 2, fil: 40, message: 401, actif: true });
    arrive({ id: 400, fil: 40, sens: 'recu' });
    arrive({ id: 401, fil: 40, sens: 'recu' });
    expect(await lireLEcran(1)).toBe(true);
    expect(nouveau(2, nonLus)).toBe(true);
    await ouvrirLeMail(40);
    expect(await lireLEcran(1)).toBe(false);
    expect(nouveau(2, nonLus)).toBe(false);
    // déplier la carte de l'un n'éteint PAS l'autre
    arrive({ id: 402, fil: 40, sens: 'recu' });
    await vuParLaCarte(2, 'collegue');
    expect(nouveau(1, nonLus)).toBe(true);
  });

  it('ouvrir le mail d’un AUTRE échange de l’événement ne cache pas un mail plus récent', async () => {
    base.affectations.push({ evt: 1, fil: 50, message: null, actif: true });
    base.affectations.push({ evt: 1, fil: 51, message: null, actif: true });
    arrive({ id: 500, fil: 50, sens: 'recu' });
    await vuParLaCarte(1, 'collegue');
    arrive({ id: 501, fil: 51, sens: 'recu' });
    await ouvrirLeMail(50);
    expect(nouveau(1, nonLus)).toBe(true);
    await ouvrirLeMail(51);
    expect(nouveau(1, nonLus)).toBe(false);
  });
});

describe('🔴 un mail MONGA relié par sa référence MNG- seulement (décision d’Arno, 04/11/2026)', () => {
  beforeEach(() => {
    base.liensMonga.push({ evt: 3, ref: 'MNG-23387' }); // aucun rattachement manuel : le seul lien est la référence
  });

  it('il allume le « New » ; déplier l’éteint ; une nouvelle relève le laisse éteint', async () => {
    arrive({ id: 600, fil: 747, sens: 'recu', mng: 'MNG-23387' }); // « Le ticket MONGA 23387 requiert votre attention »
    expect(await lireLEcran(3)).toBe(true);
    await vuParLaCarte(3, 'collegue');
    expect(await lireLEcran(3)).toBe(false);
    expect(nonLus.has(600)).toBe(true); // déplier n'écrit rien dans Gmail
    expect(await lireLEcran(3)).toBe(false); // relève sans rien de neuf
    arrive({ id: 601, fil: 999, sens: 'envoye', mng: 'MNG-23387' }); // un envoi n'allume rien
    expect(await lireLEcran(3)).toBe(false);
  });

  it('le mail suivant de la même intervention le rallume ; l’ouvrir l’éteint', async () => {
    arrive({ id: 610, fil: 748, sens: 'recu', mng: 'MNG-23387' });
    await vuParLaCarte(3, 'collegue');
    arrive({ id: 611, fil: 749, sens: 'recu', mng: 'MNG-23387' }); // « MNG-23387 - Nouveau commentaire »
    expect(await lireLEcran(3)).toBe(true);
    await ouvrirLeMail(749);
    expect(await lireLEcran(3)).toBe(false);
    expect(base.seuils.get(3)?.motif).toBe('mail');
  });

  it('lu directement dans Gmail : la lecture de l’écran l’éteint', async () => {
    arrive({ id: 620, fil: 750, sens: 'recu', mng: 'MNG-23387' });
    expect(await lireLEcran(3)).toBe(true);
    nonLus.delete(620);
    expect(await lireLEcran(3)).toBe(false);
    expect(base.seuils.get(3)?.motif).toBe('gmail');
  });

  it('une autre référence, ou un lien RETIRÉ, n’allume rien', async () => {
    arrive({ id: 630, fil: 751, sens: 'recu', mng: 'MNG-99999' });
    expect(await lireLEcran(3)).toBe(false);
    base.liensMonga = [{ evt: 3, ref: 'MNG-23387', retire: true }];
    arrive({ id: 631, fil: 752, sens: 'recu', mng: 'MNG-23387' });
    expect(await lireLEcran(3)).toBe(false);
  });
});

describe('🔴 l’état d’avant, et sans la migration 456', () => {
  it('un événement SANS ligne suit le non-lu Gmail (état initial), et la première lecture pose sa ligne s’il est lu', async () => {
    base.affectations.push({ evt: 1, fil: 10, message: null, actif: true });
    base.affectations.push({ evt: 2, fil: 20, message: null, actif: true });
    base.messages.push({ id: 10, fil: 10, sens: 'recu' }, { id: 20, fil: 20, sens: 'recu' });
    nonLus = new Set([20]);
    expect(await lireLEcran(1)).toBe(false);
    expect(nouveau(2, nonLus)).toBe(true);
    expect(base.seuils.has(1)).toBe(true); // tout est lu : la ligne est posée, en LISANT Gmail
    expect(base.seuils.has(2)).toBe(false); // un non-lu : la règle d'avant le tient
  });

  it('sans la 456, aucune écriture', async () => {
    avec456 = false;
    base.affectations.push({ evt: 1, fil: 10, message: null, actif: true });
    base.messages.push({ id: 10, fil: 10, sens: 'recu' });
    expect(await vuParLaCarte(1, 'x')).toBe(0);
    expect(await vuParLeMail(10, 'x')).toBe(0);
    expect(await constaterLecturesGmail([], 10)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('identifiants invalides : rien n’est demandé à la base', async () => {
    expect(await vuParLaCarte(0, 'x')).toBe(0);
    expect(await vuParLeMail(-1, 'x')).toBe(0);
    expect(await constaterLecturesGmail([], 0)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('🔴 le SQL, par fragments', () => {
  const plat = (s: string) => s.replace(/\s+/g, ' ');
  it('les mails d’un événement : reçus, hors file écartés, l’échange ET le mail déplacé', () => {
    const s = plat(sqlMailsRecusDesEvenements(true));
    expect(s).toContain("mn.sens = 'recu'");
    expect(s).toContain('mn.exclu_le IS NULL');
    expect(s).toContain('mn.id = an.message_id');
    expect(s).toContain('NOT EXISTS (SELECT 1 FROM gestion_affectation a2 WHERE a2.message_id = mn.id AND a2.actif)');
    expect(plat(sqlMailsRecusDesEvenements(false))).not.toContain('message_id');
  });

  it('la branche MONGA : référence reliée, lien non retiré, mail reçu — et seulement avec la 311', () => {
    const s = plat(sqlMailsRecusDesEvenements(true, true));
    expect(s).toContain('FROM gestion_monga_lien ml JOIN gestion_monga_mail mm ON mm.reference = ml.reference JOIN gestion_message mn ON mn.id = mm.message_id');
    expect(s).toContain("WHERE ml.retire_le IS NULL AND mn.exclu_le IS NULL AND mn.sens = 'recu'");
    expect(plat(sqlMailsRecusDesEvenements(true))).not.toContain('gestion_monga');
  });

  it('la lecture des cartes lit la MÊME liste que les gestes qui éteignent le « New »', () => {
    const src = plat(readFileSync('app/lib/gestion/fileRepo.ts', 'utf8'));
    expect(src).toContain('FROM (${sqlMailsRecusDesEvenements(avecMessageId, avecMonga)}) mn');
    expect(src).toContain('evenementNouveauteDisponible(), mongaDisponible()');
  });

  it('le seuil ne recule jamais', () => {
    const src = plat(readFileSync('app/lib/gestion/nouveauteEvenement.ts', 'utf8'));
    expect(src).toContain('WHERE EXCLUDED.vu_jusqu_au > gestion_evenement_nouveaute.vu_jusqu_au');
  });

  it('la lecture des cartes : seuil, puis non-lu Gmail pour un événement sans ligne', () => {
    const src = plat(readFileSync('app/lib/gestion/fileRepo.ts', 'utf8'));
    expect(src).toContain('LEFT JOIN gestion_evenement_nouveaute nv ON nv.evenement_id = e.id');
    expect(src).toContain('WHERE mn.evenement_id = e.id AND mn.id > coalesce(nv.vu_jusqu_au, 0)');
    expect(src).toContain('AND (nv.evenement_id IS NOT NULL${aucunNonLu ? \'\' : ` OR mn.id = ANY(${param}::bigint[])`})');
    // le plafond est lu AVANT la liste Gmail, et le constat seulement sur une liste complète
    const i = src.indexOf('const plafond = await plafondDesMails()');
    expect(i).toBeGreaterThan(0);
    expect(src.indexOf('await lireMessagesNonLus()')).toBeGreaterThan(i);
    expect(src).toContain('if (etatGmail.constatable) await constaterLesLecturesGmail(etatGmail.messages, plafond);');
    expect(src).toContain('constatable: nl.disponible && nl.complet');
  });

  it('la migration 456 : additive, sans BEGIN/COMMIT, et n’écrit aucune donnée', () => {
    const sql = readFileSync('db/migrations/456_gestion_evenement_nouveaute.sql', 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gestion_evenement_nouveaute');
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/);
  });
});

/**
 * 🔴 AUCUNE REMISE AUTOMATIQUE EN NON LU. Le libellé `UNREAD` n'est POSÉ que par les deux gestes humains « Marquer
 * comme non lu » : le menu d'un échange (`marquerFilGmail`, `lu = false`) et celui d'un message (`gmailAction`,
 * action `non_lu`). Tout autre fichier qui l'ajouterait — une relève, un rattachement, la frise — casse ce garde.
 */
describe('🔴 l’application ne remet jamais un mail en non lu d’elle-même', () => {
  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((n) => {
      const p = path.join(dossier, n);
      if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : fichiers(p);
      return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  }
  it('seuls les deux gestes humains ajoutent UNREAD', () => {
    const ajouts = fichiers('app').filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /ajouter:\s*\[\s*(?:'UNREAD'|LIBELLE_NON_LU)/.test(s) || /addLabelIds:\s*\[\s*(?:'UNREAD'|LIBELLE_NON_LU)/.test(s);
    }).map((f) => path.relative('app', f)).sort();
    expect(ajouts).toEqual(['lib/gestion/gmailAction.ts', 'lib/gestion/lectureGmail.ts']);
    const marquage = readFileSync('app/lib/gestion/lectureGmail.ts', 'utf8');
    expect(marquage.replace(/\s+/g, ' ')).toContain("lu ? { retirer: ['UNREAD'] } : { ajouter: ['UNREAD'] }");
    expect(readFileSync('app/lib/gestion/gmailAction.ts', 'utf8')).toContain("if (action === 'non_lu') {");
  });
});
