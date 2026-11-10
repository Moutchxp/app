import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — DÉTECTER, TRADUIRE, RANGER À CÔTÉ ; NE JAMAIS TOUCHER L'ÉTAPE.
 *
 * Aucun réseau : le service est bouchonné (`Traducteur` injecté), la base aussi (`query` simulée). Textes RÉELS de production
 * (`.captures/monga-espagnol/resultat-prod.txt`) pour l'espagnol.
 */
const requetes: { sql: string; params: unknown[] }[] = [];
let lignes: unknown[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { requetes.push({ sql, params }); return { rows: /^\s*SELECT/.test(sql) ? lignes : [], rowCount: 1 }; }),
}));
vi.mock('./schema', () => ({ traductionDisponible: vi.fn(async () => true) }));

import {
  affichageTexte, detecterLangue, estATraduire, titreTraduction, validerReponseTraduction,
} from './traductionCommentaire';
import {
  repriseDesTextes, retenterTraductionsEchouees, traduireEtapesDuMail, traduireUnTexte, type Traducteur,
} from './traductionCommentaireRepo';
import { etapesDuMailMonga } from './mongaEtape';

const ES_INJOIGNABLE = 'No hemos podido contactar al contacto en el lugar durante nuestra segunda llamada, por lo tanto le hemos enviado un '
  + 'correo electrónico. Continuaremos dándole seguimiento, por teléfono, SMS o correo electrónico regularmente.';
const ES_RDV = 'Hola, la intervención con nuestro artesano asociado ha sido fijada para el 11/11/2026 entre 17h00 y 19h00';
const ES_ACCUSE = 'Hola, acusamos buena recepción de tu solicitud y programamos la cita con uno de nuestros artesanos asociados a la brevedad.';
const ES_LIBRE = 'Gracias, el presupuesto está disponible para su validación.';
const FR = [
  'Nous n’avons pas réussi à joindre le contact sur place lors de notre appel.',
  'Bonjour, l’intervention avec notre artisan partenaire a été fixée le 11/11/2026 entre 17h00 et 19h00',
  'Le devis est disponible, merci de le valider dans votre espace.',
];
const EN = 'Hello, we have not been able to reach the tenant, please call us back to confirm the appointment.';

const traducteur = (r: { langue: string; traduction: string | null } | Error): Traducteur & { appels: string[] } => {
  const appels: string[] = [];
  return { service: 'essai:bouchon', appels, async traduire(t) { appels.push(t); if (r instanceof Error) throw r; return r; } };
};
const q = vi.fn(async (sql: string, params: unknown[] = []) => { requetes.push({ sql, params }); return { rows: /^\s*SELECT/.test(sql) ? lignes : [], rowCount: 1 }; });
const ecrituresSurLEtape = () => requetes.filter((r) => /(INSERT INTO|UPDATE|DELETE FROM)\s+gestion_monga_etape\b/i.test(r.sql));
beforeEach(() => { requetes.length = 0; lignes = []; q.mockClear(); });

describe('la langue, détectée sans réseau', () => {
  it('les commentaires espagnols réels → « es », à traduire', () => {
    for (const t of [ES_INJOIGNABLE, ES_RDV, ES_ACCUSE, ES_LIBRE]) {
      expect(detecterLangue(t), t).toBe('es');
      expect(estATraduire(t)).toBe(true);
    }
  });
  it('🔴 un commentaire français → « fr », jamais à traduire', () => {
    for (const t of FR) { expect(detecterLangue(t), t).toBe('fr'); expect(estATraduire(t)).toBe(false); }
  });
  it('anglais → « en » ; trop court ou vide → inconnu, rien n’est envoyé', () => {
    expect(detecterLangue(EN)).toBe('en');
    for (const t of ['Ok', 'MNG-10001', '', null]) { expect(detecterLangue(t)).toBeNull(); expect(estATraduire(t)).toBe(false); }
  });
  it('le titre : « de l’espagnol », « de l’anglais », « du portugais » ; une langue inconnue n’est pas inventée', () => {
    expect(titreTraduction('es')).toBe('Traduit automatiquement de l’espagnol');
    expect(titreTraduction('en')).toBe('Traduit automatiquement de l’anglais');
    expect(titreTraduction('pt')).toBe('Traduit automatiquement du portugais');
    expect(titreTraduction('xx')).toBe('Traduit automatiquement d’une autre langue');
  });
  it('l’affichage : traduit / indisponible / original (aucune traduction, ou « déjà en français »)', () => {
    expect(affichageTexte(ES_LIBRE, { statut: 'traduite', langue: 'es', texte: 'Merci, le devis est disponible.' }))
      .toEqual({ mode: 'traduit', titre: 'Traduit automatiquement de l’espagnol', traduit: 'Merci, le devis est disponible.', original: ES_LIBRE });
    expect(affichageTexte(ES_LIBRE, { statut: 'echec', langue: null, texte: null })).toEqual({ mode: 'indisponible', original: ES_LIBRE });
    expect(affichageTexte(FR[0], null)).toEqual({ mode: 'original', original: FR[0] });
    expect(affichageTexte(FR[0], { statut: 'francais', langue: 'fr', texte: null })).toEqual({ mode: 'original', original: FR[0] });
  });
  it('la réponse du service est validée, jamais devinée', () => {
    expect(validerReponseTraduction({ langue: 'ES', traduction: ' Merci. ' })).toEqual({ langue: 'es', traduction: 'Merci.' });
    expect(validerReponseTraduction({ langue: 'fr', traduction: null })).toEqual({ langue: 'fr', traduction: null });
    for (const j of [null, {}, { langue: 'espagnol', traduction: 'x' }, { langue: 'es', traduction: '' }, 'texte']) expect(validerReponseTraduction(j)).toBeNull();
  });
});

describe('🔴🔴 traduire un commentaire : rangé À CÔTÉ, l’original jamais touché', () => {
  it('espagnol → « traduite » dans gestion_monga_traduction ; seul le texte du commentaire part au service', async () => {
    const t = traducteur({ langue: 'es', traduction: 'Merci, le devis est disponible pour validation.' });
    expect(await traduireUnTexte(7, ES_LIBRE, t, q)).toBe('traduite');
    expect(t.appels).toEqual([ES_LIBRE]);
    expect(requetes).toHaveLength(1);
    expect(requetes[0].sql.replace(/\s+/g, ' ')).toContain('INSERT INTO gestion_monga_traduction');
    expect(requetes[0].params).toEqual([7, 'traduite', 'es', 'Merci, le devis est disponible pour validation.', 'essai:bouchon']);
    expect(ecrituresSurLEtape()).toEqual([]);
  });
  it('🔴 français : ni appel au service, ni écriture', async () => {
    const t = traducteur({ langue: 'fr', traduction: null });
    for (const f of FR) expect(await traduireUnTexte(8, f, t, q)).toBe('ignore');
    expect(t.appels).toEqual([]);
    expect(requetes).toEqual([]);
  });
  it('🔴 échec du service → « echec » écrit avec le motif seul (jamais le texte), aucune exception', async () => {
    const t = traducteur(new Error('fournisseur HTTP 503'));
    await expect(traduireUnTexte(9, ES_INJOIGNABLE, t, q)).resolves.toBe('echec');
    expect(requetes).toHaveLength(1);
    expect(requetes[0].sql).toMatch(/'echec'/);
    expect(requetes[0].params).toEqual([9, 'essai:bouchon', 'fournisseur HTTP 503']);
    expect(JSON.stringify(requetes[0].params)).not.toContain('contactar');
    expect(ecrituresSurLEtape()).toEqual([]);
  });
  it('⚠️ une traduction réussie n’est jamais écrasée : la mise à jour ne vise qu’une ligne restée « echec »', async () => {
    await traduireUnTexte(9, ES_INJOIGNABLE, traducteur(new Error('x')), q);
    await traduireUnTexte(9, ES_INJOIGNABLE, traducteur({ langue: 'es', traduction: 'y' }), q);
    for (const r of requetes) expect(r.sql.replace(/\s+/g, ' ')).toContain("WHERE gestion_monga_traduction.statut = 'echec'");
  });
  it('même la trace de l’échec qui échoue ne fait rien tomber', async () => {
    const qPanne = vi.fn(async () => { throw new Error('base injoignable'); });
    await expect(traduireUnTexte(9, ES_LIBRE, traducteur(new Error('x')), qPanne)).resolves.toBe('echec');
  });
});

describe('🔴🔴 la traduction ne crée, ne modifie ni ne valide aucune étape', () => {
  it('la lecture des étapes se fait sur le texte d’origine : un commentaire espagnol inconnu reste un commentaire, traduit ou non', () => {
    const mail = (c: string) => `Un nouveau message vous a été envoyé concernant la mission MNG-10001.\n\n${c}\n\nEnvoyé par Prénom Nom, le 09/11/2026 à 12:22`;
    expect(etapesDuMailMonga('MNG-10001 - Nouveau commentaire', mail(ES_LIBRE)).map((e) => [e.type, e.texte])).toEqual([['commentaire', ES_LIBRE]]);
  });
  it('les modules de traduction n’importent pas la lecture des étapes, et n’écrivent dans aucune table d’étape', () => {
    for (const f of ['app/lib/gestion/traductionCommentaire.ts', 'app/lib/gestion/traductionCommentaireRepo.ts', 'app/scripts/monga-commentaires-traduire.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from '[^']*mongaEtape(Repo)?'/);
      expect(src, f).not.toMatch(/etapesDuMailMonga\(/);
      expect(src, f).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+gestion_monga_etape\b/);
      expect(src, f).not.toMatch(/certitude\s*=|'confirmee'/);
    }
  });
  it('la relève traduit APRÈS avoir enregistré les étapes, seulement si le mail vient d’en écrire, et sans pouvoir tomber', () => {
    const src = readFileSync('app/lib/gestion/mongaClassement.ts', 'utf8');
    const p = src.slice(src.indexOf('export async function passeMongaSurLesMails'));
    const i = p.indexOf('enregistrerEtapesDuMail(');
    const j = p.indexOf('traduireEtapesDuMail(');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(p.slice(i, j)).toContain('if (ecritesDuMail > 0)');
    expect(p.slice(j - 200, j)).toContain('try {');
    const suite = readFileSync('app/lib/gestion/suiteReleveReel.ts', 'utf8');
    const k = suite.indexOf('retenterTraductionsEchouees(traducteurMistral())');
    expect(suite.slice(k - 300, k)).toContain('try {');
  });
});

describe('à l’arrivée, et la nouvelle tentative plus tard', () => {
  it('les commentaires du mail qui viennent d’être enregistrés, sans traduction encore : traduits', async () => {
    lignes = [{ id: '41', texte: ES_ACCUSE }];
    const t = traducteur({ langue: 'es', traduction: 'Bonjour, nous accusons bonne réception de ta demande.' });
    expect(await traduireEtapesDuMail(900, t)).toBe(1);
    expect(requetes[0].sql.replace(/\s+/g, ' ')).toContain("e.message_id = $1 AND e.source = 'monga' AND e.texte IS NOT NULL");
    expect(requetes[0].params).toEqual([900]);
    expect(t.appels).toEqual([ES_ACCUSE]);
  });
  it('🔴 jamais de blocage : une panne de lecture rend 0', async () => {
    const { query } = await import('../db/client');
    vi.mocked(query).mockRejectedValueOnce(new Error('base injoignable'));
    await expect(traduireEtapesDuMail(900, traducteur({ langue: 'es', traduction: 'x' }))).resolves.toBe(0);
  });
  it('la nouvelle tentative ne reprend QUE des lignes « echec », espacées, bornées en nombre', async () => {
    lignes = [{ id: '42', texte: ES_LIBRE }];
    expect(await retenterTraductionsEchouees(traducteur({ langue: 'es', traduction: 'Merci.' }))).toBe(1);
    const s = requetes[0].sql.replace(/\s+/g, ' ');
    expect(s).toContain("t.statut = 'echec' AND t.tentatives < $1");
    expect(s).toContain('make_interval(mins => $2)');
    expect(requetes[0].params).toEqual([10, 60, 5]);
  });
});

describe('🔴🔴 le script, en --essai : liste, sans rien écrire ni envoyer', () => {
  it('liste les commentaires à traduire (espagnol), laisse le français ; une seule requête, un SELECT ; aucun appel au service', async () => {
    lignes = [
      { id: '1', reference: 'MNG-24544', type: 'commentaire', survenu: '04/11/2026', texte: ES_INJOIGNABLE },
      { id: '2', reference: 'MNG-24544', survenu: '05/11/2026', texte: FR[2] },
      { id: '3', reference: 'MNG-25370', survenu: '09/11/2026', texte: ES_ACCUSE },
    ];
    const t = traducteur({ langue: 'es', traduction: 'x' });
    const dit: string[] = [];
    const bilan = await repriseDesTextes({ appliquer: false, q, traducteur: t, dire: (l) => dit.push(l) });
    expect(bilan).toEqual({ candidats: 2, ignores: 1, traduits: 0, francais: 0, echecs: 0 });
    expect(requetes).toHaveLength(1);
    expect(requetes[0].sql).toMatch(/^\s*SELECT/);
    expect(t.appels).toEqual([]);
    expect(dit.filter((l) => l.includes('À TRADUIRE'))).toHaveLength(2);
    expect(dit.join('\n')).toContain('étape 1 (commentaire) · 04/11/2026 · MNG-24544 · langue probable : es');
  });
  it('le script ouvre sa session en LECTURE SEULE hors --appliquer, et annule', () => {
    const src = readFileSync('app/scripts/monga-commentaires-traduire.ts', 'utf8');
    expect(src).toContain("await q('SET TRANSACTION READ ONLY');");
    expect(src).toContain("traducteur: appliquer ? traducteurMistral() : null");
    expect(src).toContain("await q('ROLLBACK');");
  });
  it('en --appliquer : chacun traduit et rangé à côté, rien sur l’étape', async () => {
    lignes = [{ id: '3', reference: 'MNG-25370', survenu: '09/11/2026', texte: ES_ACCUSE }];
    const bilan = await repriseDesTextes({ appliquer: true, q, traducteur: traducteur({ langue: 'es', traduction: 'Bonjour…' }), dire: () => {} });
    expect(bilan.traduits).toBe(1);
    expect(ecrituresSurLEtape()).toEqual([]);
  });
});

/**
 * 🔴🔴 2e TEMPS (Arno, 10/11/2026) — « traduis aussi le texte des étapes reconnues depuis un mail non français (rendez-vous, contact
 * injoignable, ouverture…), avec la même présentation, en affichage seulement : l'étape, sa date et sa validation ne changent pas. »
 */
describe('🔴🔴 les étapes reconnues aussi : rendez-vous, contact injoignable, ouverture', () => {
  it('la relève et la reprise ne filtrent plus sur le type : toute étape Monga qui a un texte', () => {
    const src = readFileSync('app/lib/gestion/traductionCommentaireRepo.ts', 'utf8');
    expect(src).not.toMatch(/type\s*=\s*'commentaire'/);
    expect(src.replace(/\s+/g, ' ')).toContain("WHERE e.source = 'monga' AND e.texte IS NOT NULL AND NOT EXISTS");
  });
  it('à l’arrivée : le rendez-vous espagnol est traduit comme un commentaire ; seul son texte part au service', async () => {
    lignes = [{ id: '51', texte: ES_RDV }];
    const t = traducteur({ langue: 'es', traduction: 'Bonjour, l’intervention avec notre artisan partenaire a été fixée au 11/11/2026 entre 17h00 et 19h00' });
    expect(await traduireEtapesDuMail(901, t)).toBe(1);
    expect(t.appels).toEqual([ES_RDV]);
    expect(ecrituresSurLEtape()).toEqual([]);
  });
  it('🔴 l’étape, sa date et sa validation ne changent pas : la lecture du mail rend la même étape, et la traduction n’écrit que sa table', async () => {
    const mail = (c: string) => `Un nouveau message vous a été envoyé concernant la mission MNG-10001.\n\n${c}\n\nEnvoyé par Prénom Nom, le 09/11/2026 à 12:22`;
    const avant = etapesDuMailMonga('MNG-10001 - Nouveau commentaire', mail(ES_RDV));
    await traduireUnTexte(51, ES_RDV, traducteur({ langue: 'es', traduction: 'L’intervention a été fixée.' }), q);
    expect(etapesDuMailMonga('MNG-10001 - Nouveau commentaire', mail(ES_RDV))).toEqual(avant);
    expect(avant.map((e) => [e.type, e.jour, e.heure, e.certitude])).toEqual([['rdv_intervention', '2026-11-11', { de: '17:00', a: '19:00' }, 'fiable']]);
    for (const r of requetes) {
      expect(r.sql).toMatch(/gestion_monga_traduction/);
      expect(r.sql).not.toMatch(/survenu_le|certitude|\btype\b/);
    }
  });
  it('le script --essai liste aussi les étapes reconnues, avec leur type ; l’ouverture de repli (texte français) est laissée', async () => {
    lignes = [
      { id: '61', reference: 'MNG-24544', type: 'rdv_intervention', survenu: '11/11/2026', texte: ES_RDV },
      { id: '62', reference: 'MNG-24548', type: 'contact_injoignable', survenu: '04/11/2026', texte: ES_INJOIGNABLE },
      { id: '63', reference: 'MNG-25370', type: 'ouverture', survenu: '09/11/2026', texte: ES_ACCUSE },
      { id: '64', reference: 'MNG-25370', type: 'ouverture', survenu: '01/11/2026', texte: 'Ouverture déduite de la date du premier mail Monga, à confirmer.' },
    ];
    const t = traducteur({ langue: 'es', traduction: 'x' });
    const dit: string[] = [];
    const bilan = await repriseDesTextes({ appliquer: false, q, traducteur: t, dire: (l) => dit.push(l) });
    expect(bilan).toEqual({ candidats: 3, ignores: 1, traduits: 0, francais: 0, echecs: 0 });
    expect(t.appels).toEqual([]);
    expect(requetes.every((r) => /^\s*SELECT/.test(r.sql))).toBe(true);
    const texte = dit.join('\n');
    for (const l of ['étape 61 (rdv_intervention)', 'étape 62 (contact_injoignable)', 'étape 63 (ouverture)']) expect(texte).toContain(l);
    expect(texte).not.toContain('étape 64');
  });
});
