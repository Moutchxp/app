import { describe, it, expect } from 'vitest';
import { extraireIdsDrive, recupererFichiersDrive, type LimitesDrive, type ConfigDrive } from './drive';

/**
 * N6-B — module Drive PUR. Extraction stricte des FILE_ID (dédoublonnée, ordre conservé, URL non conformes ignorées) et suivi
 * SOUS GARDES par injection d'un `fetch` factice (aucun réseau) : jeton, taille sur métadonnées AVANT téléchargement, whitelist,
 * fichiers natifs Google, plafonds nombre/volume. Chaque garde a un motif distinguable (jamais un catch muet).
 */
const CONFIG: ConfigDrive = { clientId: 'cid', clientSecret: 'secret', refreshToken: 'refresh' };
const Mo = (n: number) => n * 1024 * 1024;
const LIM = (over: Partial<LimitesDrive> = {}): LimitesDrive => ({
  tailleMaxOctets: Mo(20), maxFichiers: 80, maxVolumeOctets: Mo(300),
  mimeAutorise: (m) => m === 'application/pdf' || m === 'image/jpeg', ...over,
});

/** fetch factice : token → access_token ; métadonnées (fields=) → meta[id] ; contenu (alt=media) → buffer de `size`. */
function fauxFetch(opts: {
  tokenStatus?: number;
  meta: Record<string, { name: string; mimeType: string; size: number | null; status?: number }>;
  mediaStatus?: Record<string, number>;
}) {
  const appels = { token: 0, meta: [] as string[], media: [] as string[] };
  const idDeUrl = (u: string) => decodeURIComponent(u.split('/files/')[1].split('?')[0]);
  const fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('oauth2.googleapis.com/token')) {
      appels.token += 1;
      const st = opts.tokenStatus ?? 200;
      return new Response(st === 200 ? JSON.stringify({ access_token: 'tok' }) : 'refus', { status: st });
    }
    if (url.includes('alt=media')) {
      const id = idDeUrl(url); appels.media.push(id);
      const st = opts.mediaStatus?.[id] ?? 200;
      if (st !== 200) return new Response('x', { status: st });
      const size = opts.meta[id]?.size ?? 10;
      return new Response(Buffer.alloc(size ?? 10), { status: 200 });
    }
    // métadonnées
    const id = idDeUrl(url); appels.meta.push(id);
    const m = opts.meta[id];
    if (!m || m.status) return new Response('nope', { status: m?.status ?? 404 });
    return new Response(JSON.stringify({ id, name: m.name, mimeType: m.mimeType, size: m.size == null ? undefined : String(m.size) }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, appels };
}

describe('N6-B — extraireIdsDrive (motif STRICT file/d, dédoublonnage ordonné)', () => {
  it('47 liens réalistes → 47 ids dans l’ordre', () => {
    const ids = Array.from({ length: 47 }, (_, i) => `ID${i}`);
    const corps = ids.map((id) => `fichier-${id}.pdf https://drive.google.com/file/d/${id}/view?usp=drive_web`).join('\n');
    expect(extraireIdsDrive(corps, null)).toEqual(ids);
  });
  it('dédoublonne en conservant l’ordre de première apparition', () => {
    const c = 'a https://drive.google.com/file/d/AAA/view\nb https://drive.google.com/file/d/BBB/view\nc https://drive.google.com/file/d/AAA/view';
    expect(extraireIdsDrive(c, null)).toEqual(['AAA', 'BBB']);
  });
  it('ignore les URL NON conformes (dossier, docs, page de partage, URL arbitraire)', () => {
    const c = [
      'https://drive.google.com/drive/folders/FOLDER1',       // dossier → ignoré
      'https://docs.google.com/document/d/DOC1/edit',          // docs éditeur → ignoré (motif strict file/d)
      'https://drive.google.com/open?id=OPEN1',                // page de partage → ignoré
      'https://example.com/file/d/EVIL/view',                  // pas drive.google.com → ignoré
      'https://drive.google.com/file/d/GOOD1/view',            // conforme → gardé
    ].join('\n');
    expect(extraireIdsDrive(c, null)).toEqual(['GOOD1']);
  });
  it('corps HTML seul, puis corps texte seul', () => {
    expect(extraireIdsDrive(null, '<a href="https://drive.google.com/file/d/H1/view">x</a>')).toEqual(['H1']);
    expect(extraireIdsDrive('https://drive.google.com/file/d/T1/view', null)).toEqual(['T1']);
  });
  it('texte ET html : union ordonnée (texte d’abord), sans doublon', () => {
    expect(extraireIdsDrive('https://drive.google.com/file/d/T1/view', 'x https://drive.google.com/file/d/T1/view y https://drive.google.com/file/d/H2/view')).toEqual(['T1', 'H2']);
  });
});

describe('N6-B — recupererFichiersDrive : gardes (aucun réseau réel)', () => {
  it('cas nominal : PDF dans les bornes → pièce téléchargée, nom + mime des MÉTADONNÉES (font foi)', async () => {
    const f = fauxFetch({ meta: { AAA: { name: 'arrete.pdf', mimeType: 'application/pdf', size: Mo(1) } } });
    const r = await recupererFichiersDrive(['AAA'], CONFIG, { fetch: f.fetch }, LIM(), { AAA: 'nom-du-corps.pdf' });
    expect(r).toMatchObject({ configure: true });
    if (r.configure && !r.jetonRefuse) {
      expect(r.pieces).toHaveLength(1);
      expect(r.pieces[0].nomFichier).toBe('arrete.pdf'); // métadonnée, pas le repli du corps
      expect(r.pieces[0].typeMime).toBe('application/pdf');
      expect(r.echecs).toHaveLength(0);
    }
  });

  it('jeton refusé (401) → jetonRefuse, AUCUN appel métadonnées/média', async () => {
    const f = fauxFetch({ tokenStatus: 401, meta: {} });
    const r = await recupererFichiersDrive(['AAA'], CONFIG, { fetch: f.fetch }, LIM());
    expect(r).toEqual({ configure: true, jetonRefuse: true });
    expect(f.appels.meta).toHaveLength(0);
    expect(f.appels.media).toHaveLength(0);
  });

  it('trop gros → refusé sur la MÉTADONNÉE, AVANT tout téléchargement', async () => {
    const f = fauxFetch({ meta: { BIG: { name: 'gros.pdf', mimeType: 'application/pdf', size: Mo(42) } } });
    const r = await recupererFichiersDrive(['BIG'], CONFIG, { fetch: f.fetch }, LIM());
    if (r.configure && !r.jetonRefuse) {
      expect(r.pieces).toHaveLength(0);
      expect(r.echecs[0].motif).toContain('trop volumineux');
    }
    expect(f.appels.media).toHaveLength(0); // jamais téléchargé
  });

  it('type hors whitelist → ignoré avec motif, non téléchargé', async () => {
    const f = fauxFetch({ meta: { Z: { name: 'archive.zip', mimeType: 'application/zip', size: Mo(1) } } });
    const r = await recupererFichiersDrive(['Z'], CONFIG, { fetch: f.fetch }, LIM());
    if (r.configure && !r.jetonRefuse) { expect(r.pieces).toHaveLength(0); expect(r.echecs[0].motif).toContain('type non autorisé'); }
    expect(f.appels.media).toHaveLength(0);
  });

  it('fichier natif Google (application/vnd.google-apps.*) → ignoré avec motif, non téléchargé', async () => {
    const f = fauxFetch({ meta: { G: { name: 'feuille', mimeType: 'application/vnd.google-apps.spreadsheet', size: null } } });
    const r = await recupererFichiersDrive(['G'], CONFIG, { fetch: f.fetch }, LIM());
    if (r.configure && !r.jetonRefuse) { expect(r.pieces).toHaveLength(0); expect(r.echecs[0].motif).toContain('natif Google'); }
    expect(f.appels.media).toHaveLength(0);
  });

  it('métadonnées 403/404 → « inaccessible » (motif distinguable, jamais opaque)', async () => {
    const f = fauxFetch({ meta: { X: { name: '', mimeType: '', size: null, status: 403 } } });
    const r = await recupererFichiersDrive(['X'], CONFIG, { fetch: f.fetch }, LIM(), { X: 'repli.pdf' });
    if (r.configure && !r.jetonRefuse) { expect(r.echecs[0].ref).toBe('repli.pdf'); expect(r.echecs[0].motif).toContain('inaccessible'); }
  });

  it('plafond de NOMBRE : au-delà de maxFichiers, les liens en trop ne sont pas suivis', async () => {
    const meta: Record<string, { name: string; mimeType: string; size: number }> = {};
    const ids = Array.from({ length: 5 }, (_, i) => `ID${i}`);
    for (const id of ids) meta[id] = { name: `${id}.pdf`, mimeType: 'application/pdf', size: Mo(1) };
    const f = fauxFetch({ meta });
    const r = await recupererFichiersDrive(ids, CONFIG, { fetch: f.fetch }, LIM({ maxFichiers: 3 }));
    if (r.configure && !r.jetonRefuse) { expect(r.plafondFichiers).toBe(true); expect(r.pieces).toHaveLength(3); }
    expect(f.appels.meta).toEqual(['ID0', 'ID1', 'ID2']); // seuls les 3 premiers interrogés
  });

  it('plafond de VOLUME : on s’arrête et on verse ce qui a été obtenu', async () => {
    const f = fauxFetch({ meta: {
      A: { name: 'a.pdf', mimeType: 'application/pdf', size: Mo(200) },
      B: { name: 'b.pdf', mimeType: 'application/pdf', size: Mo(200) },
      C: { name: 'c.pdf', mimeType: 'application/pdf', size: Mo(1) },
    } });
    const r = await recupererFichiersDrive(['A', 'B', 'C'], CONFIG, { fetch: f.fetch }, LIM({ maxVolumeOctets: Mo(300), tailleMaxOctets: Mo(300) }));
    if (r.configure && !r.jetonRefuse) {
      expect(r.pieces.map((p) => p.nomFichier)).toEqual(['a.pdf']); // A versé (200), B pré-contrôlé (200+200>300) → arrêt
      expect(r.plafondVolume).toBe(true);
    }
    expect(f.appels.media).toEqual(['A']); // B et C jamais téléchargés
  });
});
