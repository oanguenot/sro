'use client';
import { useEffect, useState } from 'react';

type Athlete = { nom: string; actseq: string | null; initiales: string; color: string; cat: string; sexe: string; licence?: string | null };

export default function HomeClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Charge Chart.js via CDN comme l'original
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.onload = () => init();
    document.head.appendChild(script);

    const ROSTER_KEY = 'srobernai_roster';

    const DEFAULT_ATHLETES: Athlete[] = [
      { nom: 'Emma Anguenot',    actseq: '2747642', initiales: 'EA', color: '#f5a623', cat: 'Cadette', sexe: 'F' },
      { nom: 'Chloé Greulich',   actseq: '2234044', initiales: 'CG', color: '#22d3ee', cat: 'Cadette', sexe: 'F' },
      { nom: 'Jessica Greulich', actseq: null,       initiales: 'JG', color: '#f472b6', cat: 'Cadette', sexe: 'F', licence: '2006273' },
      { nom: 'Zoé Martinache',   actseq: '2438136', initiales: 'ZM', color: '#a78bfa', cat: 'Cadette', sexe: 'F' },
      { nom: 'Lise Meyer',       actseq: '1767821', initiales: 'LM', color: '#4ade80', cat: '—',       sexe: 'F' },
      { nom: 'Olivier Anguenot', actseq: null,       initiales: 'OA', color: '#60a5fa', cat: '—',       sexe: 'M', licence: null },
      { nom: 'William Rudlof',   actseq: null,       initiales: 'WR', color: '#f87171', cat: '—',       sexe: 'M' },
      { nom: 'Agathe Thomas',    actseq: null,       initiales: 'AT', color: '#c084fc', cat: '—',       sexe: 'F' },
      { nom: 'Benjamin Laroche', actseq: null,       initiales: 'BL', color: '#818cf8', cat: '—',       sexe: 'M' },
      { nom: 'Leou Tholosan',    actseq: '2665267',  initiales: 'LT', color: '#34d399', cat: '—',       sexe: 'M' },
      { nom: 'Steyer Louise',    actseq: '2283902',  initiales: 'SL', color: '#2dd4bf', cat: '—',       sexe: 'F' },
    ];

    let ATHLETES: Athlete[] = DEFAULT_ATHLETES.map(a => ({ ...a }));

    const PALETTE = [
      '#f5a623', // or doré   (38°)
      '#fb923c', // tangerine (25°)
      '#f87171', // corail    (0°)
      '#fbbf24', // ambre     (44°)
      '#fde047', // jaune     (50°)
      '#a3e635', // lime      (83°)
      '#4ade80', // vert      (140°)
      '#86efac', // menthe    (143°)
      '#6ee7b7', // aqua      (156°)
      '#34d399', // émeraude  (160°)
      '#10b981', // jade      (158°)
      '#2dd4bf', // teal      (177°)
      '#22d3ee', // cyan      (188°)
      '#38bdf8', // azur      (199°)
      '#7dd3fc', // bleu poudre (206°)
      '#60a5fa', // bleu ciel (217°)
      '#818cf8', // péri      (234°)
      '#a5b4fc', // indigo    (238°)
      '#a78bfa', // lavande   (263°)
      '#c084fc', // violet    (279°)
      '#d946ef', // orchidée  (292°)
      '#e879f9', // fuchsia   (296°)
      '#f472b6', // rose      (329°)
      '#fb7185', // flamant   (349°)
    ];

    function normalizeColors() {
      const used = new Set<string>();
      ATHLETES.forEach(ath => {
        // Athlète connu → utilise sa couleur désignée si elle est libre
        const def = DEFAULT_ATHLETES.find(d =>
          d.actseq !== null ? d.actseq === ath.actseq : d.nom === ath.nom
        );
        if (def && !used.has(def.color)) {
          ath.color = def.color;
        } else {
          // Athlète ajouté (ou couleur déjà prise) → prochaine couleur libre
          ath.color = PALETTE.find(c => !used.has(c)) ?? PALETTE[used.size % PALETTE.length];
        }
        used.add(ath.color);
      });
    }

    const cache: Record<string, any> = {};
    let currentActseq = '2747642';
    let currentDisc: string | null = null;
    let chartInst: any = null;
    let dropdownOpen = false;
    let searchResults: any[] = [];
    let searchQuery = '';
    let searchTimer: any = null;
    let yearFilter: number | null = null;
    let currentData: any = null;

    // ---- Persistance du roster (localStorage) -------------------------------
    function loadRoster(): Athlete[] | null {
      try {
        const raw = localStorage.getItem(ROSTER_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            // Migration : mauvais actseq pour Lise Meyer (Ac Centre Alsace → Sr Obernai)
            const migrated = parsed.map((a: Athlete) =>
              a.actseq === '3127014' ? { ...a, actseq: '1767821' } : a
            );
            return migrated;
          }
        }
      } catch { /* ignore */ }
      return null;
    }
    function saveRoster() {
      try { localStorage.setItem(ROSTER_KEY, JSON.stringify(ATHLETES)); } catch { /* ignore */ }
    }

    async function init() {
      const saved = loadRoster();
      if (saved) {
        ATHLETES = saved;
      } else {
        await resolveActseqs();
      }
      normalizeColors();
      saveRoster();

      // Choisit l'athlète courant (fallback si l'athlète par défaut a été supprimé)
      if (!ATHLETES.find(a => a.actseq === currentActseq)) {
        const firstWithActseq = ATHLETES.find(a => a.actseq);
        currentActseq = firstWithActseq?.actseq ?? '';
      }

      buildDropdown();
      updateCurrentHeader(ATHLETES.find(a => a.actseq === currentActseq));

      if (currentActseq) await loadAthlete(currentActseq, false);
      document.getElementById('overlay')!.classList.add('hidden');
    }

    document.addEventListener('click', (e: MouseEvent) => {
      if (!document.getElementById('athleteWrap')!.contains(e.target as Node)) closeDropdown();
      if (!document.getElementById('searchWrap')!.contains(e.target as Node)) closeSearch();
    });

    document.getElementById('refreshBtn')!.addEventListener('click', () => refreshAll());

    // ---- Mobile sidebar toggle -----------------------------------------------
    function openMobileSidebar() {
      document.getElementById('sidebar')!.classList.add('mobile-open');
      document.getElementById('sidebarBackdrop')!.classList.add('visible');
      document.getElementById('mobileDiscToggle')?.classList.add('active');
    }
    function closeMobileSidebar() {
      document.getElementById('sidebar')?.classList.remove('mobile-open');
      document.getElementById('sidebarBackdrop')?.classList.remove('visible');
      document.getElementById('mobileDiscToggle')?.classList.remove('active');
    }
    // Expose via window to avoid React StrictMode double-listener toggle issue
    (window as any).__toggleMobileSidebar = () => {
      document.getElementById('sidebar')!.classList.contains('mobile-open')
        ? closeMobileSidebar()
        : openMobileSidebar();
    };
    (window as any).__closeMobileSidebar = closeMobileSidebar;

    async function refreshAll() {
      const toRefresh = ATHLETES.filter(a => a.actseq);
      const total = toRefresh.length;
      if (total === 0) return;

      const btn = document.getElementById('refreshBtn') as HTMLButtonElement;
      btn.disabled = true;

      const overlay = document.getElementById('overlay')!;
      const omsg    = document.getElementById('omsg')!;
      const progressWrap = document.getElementById('progressWrap')!;
      const progressFill = document.getElementById('progressFill')!;
      const progressPct  = document.getElementById('progressPct')!;

      overlay.classList.remove('hidden');
      progressWrap.style.display = 'block';
      setStatus('loading', `Actualisation de ${total} athlètes…`);

      for (let i = 0; i < toRefresh.length; i++) {
        const ath = toRefresh[i];
        const pct = Math.round((i / total) * 100);
        progressFill.style.width = pct + '%';
        progressPct.textContent  = pct + '%';
        omsg.textContent = `${ath.nom} (${i + 1} / ${total})`;

        try {
          const resp = await fetch(`/api/athlete/${ath.actseq!}?refresh=1`);
          const json = await resp.json();
          if (json.ok && json.data?.disciplines) {
            json.data._loadedAt = new Date().toLocaleTimeString('fr-FR');
            json.data._loadedTs = Date.now();
            cache[ath.actseq!] = json.data;
          }
        } catch { /* continue */ }
      }

      progressFill.style.width = '100%';
      progressPct.textContent  = '100%';
      omsg.textContent = `${total} athlètes mis à jour`;

      await new Promise(r => setTimeout(r, 600));

      overlay.classList.add('hidden');
      progressWrap.style.display = 'none';
      btn.disabled = false;

      if (currentActseq && cache[currentActseq]) {
        renderAll(cache[currentActseq]);
        setStatus('ok', `${total} athlètes actualisés · ${new Date().toLocaleTimeString('fr-FR')}`);
      }
    }

    // ---- Recherche athle.fr -------------------------------------------------
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      if (searchTimer) clearTimeout(searchTimer);
      if (!q.trim()) {
        searchQuery = '';
        searchResults = [];
        renderSearchResults();
        return;
      }
      searchTimer = setTimeout(() => searchAthletes(q), 250);
    });
    searchInput.addEventListener('focus', () => { if (searchQuery.trim()) openSearch(); });

    async function searchAthletes(query: string) {
      searchQuery = query;
      openSearch();
      document.getElementById('searchResults')!.innerHTML =
        '<div class="search-loading"><div class="mini-spinner"></div>Recherche…</div>';
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await resp.json();
        searchResults = Array.isArray(json) ? json : [];
      } catch {
        searchResults = [];
      }
      renderSearchResults();
    }

    function renderSearchResults() {
      const list = document.getElementById('searchResults')!;
      list.innerHTML = '';
      if (!searchQuery.trim()) { closeSearch(); return; }
      if (searchResults.length === 0) {
        const div = document.createElement('div');
        div.className = 'search-empty';
        div.textContent = 'Aucun résultat';
        list.appendChild(div);
        return;
      }
      searchResults.forEach(result => {
        const already = ATHLETES.some(a => a.actseq === result.id);
        const div = document.createElement('div');
        div.className = 'search-result-item' + (already ? ' added' : '');
        div.innerHTML = `
          <div class="sri-info">
            <div class="sri-name">${result.nom}</div>
            <div class="sri-sub">${result.raw?.club || '—'}</div>
          </div>
          ${already ? '<span class="sri-tag">déjà ajouté</span>' : '<span class="sri-add">+ Ajouter</span>'}`;
        div.onclick = (e) => {
          e.stopPropagation();
          loadSearchResult(result);
        };
        list.appendChild(div);
      });
    }

    function openSearch() {
      document.getElementById('searchResults')!.classList.add('open');
    }
    function closeSearch() {
      document.getElementById('searchResults')!.classList.remove('open');
    }

    async function loadSearchResult(result: any) {
      closeSearch();
      (document.getElementById('searchInput') as HTMLInputElement).value = '';
      searchQuery = '';
      searchResults = [];

      const existing = ATHLETES.find(a => a.actseq === result.id);
      if (existing) {
        await selectAthlete(existing);
        return;
      }

      const parts = result.nom.trim().split(/\s+/);
      const newAth: Athlete = {
        nom: result.nom,
        actseq: result.id,
        initiales: (parts.map((w: string) => w[0]).join('').toUpperCase()).substring(0, 2) || '?',
        color: randomColor(),
        cat: '—',
        sexe: result.raw?.sexe || 'M',
      };
      ATHLETES.push(newAth);
      saveRoster();
      buildDropdown();
      await selectAthlete(newAth);
    }

    function randomColor(): string {
      const used = new Set(ATHLETES.map(a => a.color));
      return PALETTE.find(c => !used.has(c)) ?? PALETTE[ATHLETES.length % PALETTE.length];
    }

    function avatarGradient(color: string): string {
      const hex = parseInt(color.slice(1), 16);
      const r = (hex >> 16) / 255, g = ((hex >> 8) & 0xff) / 255, b = (hex & 0xff) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const l = (max + min) / 2;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (d > 0) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      const hslToHex = (hh: number, ss: number, ll: number) => {
        const a = ss * Math.min(ll, 1 - ll);
        return '#' + [0, 8, 4].map(x => {
          const k = (x + hh / 30) % 12;
          return Math.round((ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
            .toString(16).padStart(2, '0');
        }).join('');
      };
      const c1 = hslToHex((h + 28) % 360, Math.min(1, s * 0.85), Math.min(0.92, l + 0.2));
      return `linear-gradient(135deg,${c1},${color})`;
    }

    async function resolveActseqs() {
      const missing = ATHLETES.filter(a => !a.actseq);
      if (!missing.length) return;
      document.getElementById('omsg')!.textContent = 'Recherche des profils athle.fr…';
      for (const ath of missing) {
        try {
          const lastName = ath.nom.split(' ').pop()!;
          const resp = await fetch(`/api/search?q=${encodeURIComponent(lastName)}`);
          const results: Array<{ id: string; nom: string }> = await resp.json();
          const match = results.find(r =>
            r.nom.toLowerCase().includes(ath.nom.split(' ')[0].toLowerCase()) &&
            r.nom.toLowerCase().includes(ath.nom.split(' ').pop()!.toLowerCase())
          );
          if (match) ath.actseq = match.id;
        } catch { /* silencieux */ }
      }
    }

    function hexToHue(hex: string): number {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) / 255, g = ((n >> 8) & 0xff) / 255, b = (n & 0xff) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return 0;
      let h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    }

    function buildDropdown() {
      const dd = document.getElementById('athleteDropdown')!;
      dd.innerHTML = '';
      if (!ATHLETES.length) {
        dd.innerHTML = '<div class="ath-loading">Aucun athlète. Utilise la recherche pour en ajouter.</div>';
        return;
      }
      const sorted = [...ATHLETES].sort((a, b) => hexToHue(a.color) - hexToHue(b.color));
      sorted.forEach(ath => {
        const div = document.createElement('div');
        div.className = 'ath-opt' + (ath.actseq === currentActseq ? ' selected' : '');
        div.dataset.actseq = ath.actseq || '';
        const ts = ath.actseq ? cache[ath.actseq]?._loadedTs : null;
        let freshBadge = '';
        if (ts) {
          const mins = (Date.now() - ts) / 60000;
          if (mins < 120) freshBadge = '<span class="cfresh cfok">●</span>';
          else if (mins < 2880) freshBadge = `<span class="cfresh cfwarn">${Math.round(mins / 60)}h</span>`;
          else freshBadge = `<span class="cfresh cferr">${Math.round(mins / 1440)}j</span>`;
        }
        div.innerHTML = `
          <div class="av" style="background:${avatarGradient(ath.color)}">${ath.initiales}</div>
          <div class="ath-opt-info">
            <div class="name">${ath.nom}</div>
            <div class="sub">${freshBadge}${ath.cat} · SR Obernai${!ath.actseq ? ' · <span style="color:var(--red)">profil introuvable</span>' : ''}</div>
          </div>
          <button class="ath-opt-remove" title="Supprimer cet athlète" aria-label="Supprimer ${ath.nom}">✕</button>`;
        const info = div.querySelector('.ath-opt-info') as HTMLElement;
        const av = div.querySelector('.av') as HTMLElement;
        if (ath.actseq) {
          info.onclick = (e) => { e.stopPropagation(); selectAthlete(ath); };
          av.onclick = (e) => { e.stopPropagation(); selectAthlete(ath); };
        } else {
          info.style.opacity = '.45';
          av.style.opacity = '.45';
        }
        const rmBtn = div.querySelector('.ath-opt-remove') as HTMLButtonElement;
        rmBtn.onclick = (e) => { e.stopPropagation(); removeAthlete(ath); };
        dd.appendChild(div);
      });
    }

    async function removeAthlete(ath: Athlete) {
      const ok = window.confirm(
        `Supprimer « ${ath.nom} » de la liste ?\n\n` +
        `Toutes les données associées (résultats mis en cache) seront définitivement effacées.`
      );
      if (!ok) return;

      // Efface les données associées côté serveur + cache mémoire
      if (ath.actseq) {
        try { await fetch(`/api/athlete/${ath.actseq}`, { method: 'DELETE' }); } catch { /* ignore */ }
        delete cache[ath.actseq];
      }
      const wasCurrent = ath.actseq === currentActseq;
      ATHLETES = ATHLETES.filter(a => a !== ath);
      saveRoster();
      buildDropdown();

      if (wasCurrent) {
        const next = ATHLETES.find(a => a.actseq);
        if (next) {
          await selectAthlete(next);
        } else {
          currentActseq = '';
          updateCurrentHeader(undefined);
          document.getElementById('discList')!.innerHTML = '';
          document.getElementById('chartArea')!.style.display = 'none';
          document.getElementById('emptyMain')!.style.display = 'flex';
          document.getElementById('emptyMain')!.querySelector('p')!.textContent =
            'Aucun athlète sélectionné. Recherche un athlète pour commencer.';
          setStatus('', '—');
        }
      }
    }

    function updateCurrentHeader(ath?: Athlete) {
      const avatar = document.getElementById('curAvatar') as HTMLElement;
      if (!ath) {
        avatar.textContent = '—';
        avatar.style.background = 'var(--surface2)';
        document.getElementById('curName')!.textContent = 'Aucun athlète';
        document.getElementById('curSub')!.textContent = 'SR Obernai';
        return;
      }
      avatar.textContent = ath.initiales;
      avatar.style.background = avatarGradient(ath.color);
      document.getElementById('curName')!.textContent = ath.nom;
      document.getElementById('curSub')!.textContent = ath.cat + ' · SR Obernai';
    }

    function toggleDropdown() {
      dropdownOpen = !dropdownOpen;
      document.getElementById('athleteDropdown')!.classList.toggle('open', dropdownOpen);
      document.getElementById('chevron')!.classList.toggle('open', dropdownOpen);
    }
    function closeDropdown() {
      dropdownOpen = false;
      document.getElementById('athleteDropdown')!.classList.remove('open');
      document.getElementById('chevron')!.classList.remove('open');
    }
    (window as any).__toggleDropdown = toggleDropdown;

    async function selectAthlete(ath: Athlete) {
      closeDropdown();
      if (ath.actseq === currentActseq) return;
      updateCurrentHeader(ath);
      document.querySelectorAll('.ath-opt').forEach(el =>
        (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).dataset.actseq === ath.actseq)
      );
      await loadAthlete(ath.actseq!, false);
    }

    function setStatus(type: string, msg: string) {
      document.getElementById('sdot')!.className = 'sdot ' + type;
      document.getElementById('stxt')!.textContent = msg;
    }

    async function loadAthlete(actseq: string, forceRefresh: boolean) {
      currentActseq = actseq;
      currentDisc = null;
      yearFilter = null;

      if (cache[actseq] && !forceRefresh) {
        renderAll(cache[actseq]);
        setStatus('ok', 'Données en cache · ' + cache[actseq]._loadedAt);
        return;
      }

      const btn = document.getElementById('refreshBtn') as HTMLButtonElement;
      btn.disabled = true;
      document.getElementById('overlay')!.classList.remove('hidden');
      document.getElementById('omsg')!.textContent = 'Chargement depuis athle.fr…';
      setStatus('loading', 'Connexion à athle.fr…');
      document.getElementById('discList')!.innerHTML = '';
      document.getElementById('chartArea')!.style.display = 'none';
      document.getElementById('emptyMain')!.style.display = 'flex';

      try {
        const resp = await fetch(`/api/athlete/${actseq}${forceRefresh ? '?refresh=1' : ''}`);
        const json = await resp.json();
        if (!json.ok) throw new Error(json.error || 'Erreur serveur');
        const parsed = json.data;
        if (!parsed.disciplines) throw new Error('Pas de disciplines');
        parsed._loadedAt = new Date().toLocaleTimeString('fr-FR');
        parsed._loadedTs = Date.now();
        parsed._actseq = actseq;
        cache[actseq] = parsed;
        const ath = ATHLETES.find(a => a.actseq === actseq);
        if (ath && parsed.nom) {
          document.getElementById('curName')!.textContent = parsed.nom;
          document.getElementById('curSub')!.textContent =
            (parsed.categorie || ath.cat) + ' · ' + (parsed.club || 'SR Obernai');
        }
        renderAll(parsed);
        setStatus('ok', (json.source === 'cache' ? 'Cache local' : 'athle.fr') + ' · ' + parsed._loadedAt);
      } catch (e: any) {
        document.getElementById('emptyMain')!.style.display = 'flex';
        document.getElementById('emptyMain')!.querySelector('p')!.textContent =
          'Impossible de charger les données : ' + e.message;
        setStatus('err', e.message);
      }

      btn.disabled = false;
      document.getElementById('overlay')!.classList.add('hidden');
    }

    function renderAll(data: any) {
      currentData = data;
      renderStats(data);
      renderSidebar(data);
      const first = Object.keys(data.disciplines || {})[0];
      if (currentDisc && data.disciplines[currentDisc]) renderChart(data, currentDisc);
      else if (first) selectDisc(data, first);
    }

    function renderStats(data: any) {
      const D = data.disciplines || {};
      const keys = Object.keys(D);
      const total = keys.reduce((a: number, k: string) => a + (D[k].resultats || []).filter((r: any) => !r.dq).length, 0);
      const years = new Set<number>();
      keys.forEach((k: string) => (D[k].resultats || []).forEach((r: any) => {
        const y = r.date?.split('/')[2]; if (y) years.add(+y);
      }));
      const ya = [...years].sort();
      document.getElementById('st-d')!.textContent = String(keys.length);
      document.getElementById('st-r')!.textContent = String(total);
      document.getElementById('st-s')!.textContent = String(years.size);
      document.getElementById('st-sr')!.textContent = ya.length ? ya[0] + '–' + ya[ya.length - 1] : '—';
      const niv = data.niveau;
      document.getElementById('st-niv')!.textContent = niv?.niveau || '—';
      document.getElementById('st-niv2')!.textContent = niv ? niv.pts + ' pts · ' + niv.annee : '—';
      const pt = data.podiums?.total    || { or: 0, argent: 0, bronze: 0 };
      const pn = data.podiums?.national  || { or: 0, argent: 0, bronze: 0 };
      const pr = data.podiums?.regional  || { or: 0, argent: 0, bronze: 0 };
      const pd = data.podiums?.dept      || { or: 0, argent: 0, bronze: 0 };
      const ppHTML = (p: any) => `<span class="pp g">🥇 ${p.or}</span><span class="pp s">🥈 ${p.argent}</span><span class="pp b">🥉 ${p.bronze}</span>`;
      document.getElementById('pd-all')!.innerHTML  = ppHTML(pt);
      document.getElementById('pd-n')!.innerHTML    = ppHTML(pn);
      document.getElementById('pd-reg')!.innerHTML  = ppHTML(pr);
      document.getElementById('pd-dep')!.innerHTML  = ppHTML(pd);
    }

    function renderSidebar(data: any) {
      const list = document.getElementById('discList')!;
      list.innerHTML = '';

      function categDisc(name: string): number {
        const n = name.trim();
        if (/^4[\s]?[xX]/i.test(n) || /^relais/i.test(n) || /^\d+m-\d+/.test(n)) return 1;
        if (/^\d/.test(n)) return 0;
        if (/^(hauteur|longueur|triple saut|pentabond|perche|disque|poids|javelot|marteau|masse)/i.test(n)) return 2;
        return 3;
      }

      function courseSort(name: string): number {
        const m = name.match(/^(\d[\d\s]*)/);
        const dist = m ? parseInt(m[1].replace(/\s/g, ''), 10) : 9999;
        const v = name.includes('Haies') ? 1 : name.includes('Piste Courte') ? 2 : name.includes('Salle') ? 3 : 0;
        return dist * 10 + v;
      }

      const SAUT_ORDER = ['hauteur','longueur','triple saut','pentabond','perche'];
      function sautLancerSort(name: string): number {
        const n = name.toLowerCase();
        const si = SAUT_ORDER.findIndex(s => n.startsWith(s));
        return si >= 0 ? si : 100 + name.charCodeAt(0);
      }

      const LABELS = ['COURSES', 'RELAIS', 'SAUTS & LANCERS', 'AUTRES'];
      const groups: [string, any][][] = [[], [], [], []];

      Object.entries(data.disciplines || {}).forEach(([disc, info]) => {
        groups[categDisc(disc)].push([disc, info]);
      });

      groups[0].sort((a, b) => courseSort(a[0]) - courseSort(b[0]));
      groups[1].sort((a, b) => a[0].localeCompare(b[0]));
      groups[2].sort((a, b) => sautLancerSort(a[0]) - sautLancerSort(b[0]));
      groups[3].sort((a, b) => a[0].localeCompare(b[0]));

      groups.forEach((group, gi) => {
        if (!group.length) return;
        const lbl = document.createElement('div');
        lbl.className = 'slabel';
        lbl.textContent = LABELS[gi];
        list.appendChild(lbl);
        group.forEach(([disc, info]: [string, any]) => {
          const n = (info.resultats || []).length;
          const btn = document.createElement('button');
          const isActive = disc === currentDisc;
          btn.className = 'dbtn' + (isActive ? ' active' : '');
          btn.dataset.disc = disc;
          btn.innerHTML = `<span>${disc}</span><span class="dcnt">${n}</span>`;
          if (isActive) applyDiscActiveStyle(btn);
          btn.onclick = () => {
            (window as any).__closeMobileSidebar?.();
            selectDisc(data, disc);
            document.getElementById('main')!.scrollTop = 0;
          };
          list.appendChild(btn);
        });
      });
    }

    function applyDiscActiveStyle(el: HTMLElement) {
      const ath = ATHLETES.find(a => a.actseq === currentActseq);
      const c = ath?.color || '#f5a623';
      el.style.cssText = `background:${c}1a;color:${c};border-left:3px solid ${c};padding-left:9px;`;
      const cnt = el.querySelector('.dcnt') as HTMLElement;
      if (cnt) cnt.style.cssText = `background:${c}26;color:${c};`;
    }

    function selectDisc(data: any, disc: string) {
      currentDisc = disc;
      document.querySelectorAll('.dbtn').forEach((b: Element) => {
        const el = b as HTMLElement;
        const active = el.dataset.disc === disc;
        el.classList.toggle('active', active);
        if (active) {
          applyDiscActiveStyle(el);
          if (window.innerWidth > 640) el.scrollIntoView({ block: 'nearest' });
        } else {
          el.style.cssText = '';
          const cnt = el.querySelector('.dcnt') as HTMLElement;
          if (cnt) cnt.style.cssText = '';
        }
      });
      renderChart(data, disc);
    }

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || dropdownOpen) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const data = cache[currentActseq];
      if (!data) return;
      const keys = Object.keys(data.disciplines || {});
      const idx = keys.indexOf(currentDisc!);
      if (idx === -1) return;
      const next = e.key === 'ArrowDown' ? keys[Math.min(idx + 1, keys.length - 1)] : keys[Math.max(idx - 1, 0)];
      selectDisc(data, next);
    });

    function pdDate(str: string): Date {
      if (!str) return new Date(0);
      const p = str.split('/');
      return new Date(+p[2], +p[1] - 1, +p[0]);
    }
    function fmtLbl(r: any): string {
      if (!r.date) return '?';
      const [d, m, y] = r.date.split('/');
      const mn = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
      return d + ' ' + mn[+m - 1] + ' ' + y + (r.salle ? ' 🏟' : '');
    }

    function renderChart(data: any, disc: string) {
      const Chart = (window as any).Chart;
      const info = (data.disciplines || {})[disc];
      if (!info) return;
      document.getElementById('emptyMain')!.style.display = 'none';
      const area = document.getElementById('chartArea')!;
      area.style.display = 'flex';
      area.style.flexDirection = 'column';
      area.style.gap = '18px';
      area.innerHTML = '';

      const allResultats = info.resultats || [];
      if (!allResultats.length) { area.innerHTML = '<div class="empty"><p>Aucun résultat.</p></div>'; return; }

      // Years available for filter pills
      const allYears = [...new Set<number>(
        allResultats.filter((r: any) => r.date).map((r: any) => +r.date.split('/')[2])
      )].sort((a: number, b: number) => a - b);

      // Apply year filter
      const allSorted = [...allResultats]
        .filter((r: any) => !yearFilter || (r.date && +r.date.split('/')[2] === yearFilter))
        .sort((a: any, b: any) => pdDate(a.date).getTime() - pdDate(b.date).getTime());

      const valid = allSorted.filter((r: any) => !r.dq && r.perf !== null);
      const lower = info.lower !== false;
      const isBarDisc = ['Hauteur', 'Longueur', 'Triple', 'Pentabond', 'Perche', 'Disque', 'Javelot', 'Poids', 'Marteau', 'Masse'].some(x => disc.toLowerCase().includes(x.toLowerCase()));
      const values = valid.map((r: any) => r.perf);
      const best = values.length ? (lower ? Math.min(...values) : Math.max(...values)) : null;
      const first = values[0], last = values[values.length - 1];
      const diff = (first !== undefined && last !== undefined) ? last - first : 0;
      const improved = lower ? diff < 0 : diff > 0;
      const bestRow = valid.find((r: any) => r.perf === best);
      const dqCount = allSorted.filter((r: any) => r.dq).length;

      function fmtD(v: number): string {
        const a = Math.abs(v);
        if (info.unit === 'pts') return a.toFixed(0) + ' pts';
        if (['Hauteur', 'Longueur', 'saut', 'Disque', 'Javelot', 'Poids'].some(x => disc.includes(x))) return a.toFixed(2) + 'm';
        return a.toFixed(2) + '"';
      }
      function yFmt(v: number): string {
        if (info.unit === 'pts') return v + ' pts';
        if (['Hauteur', 'Longueur', 'saut', 'Disque', 'Javelot', 'Poids'].some(x => disc.includes(x))) return v.toFixed(2) + 'm';
        if (disc.includes('1000m') || disc.includes('Relais') || disc.includes('800m') || disc.includes('4 X')) {
          const mm = Math.floor(v / 60);
          return mm > 0 ? mm + "'" + ((v % 60).toFixed(2)) + '"' : v.toFixed(2) + '"';
        }
        return v.toFixed(2) + '"';
      }

      let progBadge = '';
      if (valid.length >= 2) progBadge = `<span class="badge ${improved ? 'bup' : 'bdn'}">${improved ? '↑ +' : '↓ '}${fmtD(diff)} depuis le début</span>`;
      const subtitle = `${valid.length} résultat(s) valide(s)${dqCount ? ' · ' + dqCount + ' DQ' : ''}${info.note ? ' · ℹ ' + info.note : ''} · ${lower ? 'plus bas = mieux' : 'plus haut = mieux'}`;
      const ath = ATHLETES.find(a => a.actseq === currentActseq);
      const athColor = ath?.color || '#f5a623';

      const pillsHTML = allYears.length > 1 ? `
        <div class="year-filters">
          <span class="yf-pill${!yearFilter ? ' active' : ''}" data-y=""${!yearFilter ? ` style="background:${athColor};color:#000;border-color:transparent;"` : ''}>Tout</span>
          ${allYears.map(y => `<span class="yf-pill${yearFilter === y ? ' active' : ''}" data-y="${y}"${yearFilter === y ? ` style="background:${athColor};color:#000;border-color:transparent;"` : ''}>${y}</span>`).join('')}
        </div>` : '';

      const card = document.createElement('div');
      card.className = 'ccard';

      if (!allSorted.length) {
        // Year filter active but no results for that year — show pills + empty message
        card.innerHTML = `
          <div class="cheader">
            <div><div class="ctitle">${disc}</div><div class="csubtitle">${subtitle}</div></div>
            <div class="cbadges">
              ${best !== null ? `<span class="badge" style="background:${athColor}1a;color:${athColor};border:1px solid ${athColor}33;">RP : ${bestRow?.perfStr}</span>` : ''}
              <button class="export-btn" title="Télécharger le graphique PNG">↓ PNG</button>
            </div>
          </div>
          ${pillsHTML}
          <div class="empty" style="padding:30px 0;"><p>Aucun résultat pour ${yearFilter}.</p></div>`;
        area.appendChild(card);
        card.querySelectorAll('.yf-pill').forEach(pill => {
          (pill as HTMLElement).addEventListener('click', () => {
            const val = pill.getAttribute('data-y');
            yearFilter = val ? +val : null;
            if (currentData && currentDisc) renderChart(currentData, currentDisc);
          });
        });
        return;
      }

      card.innerHTML = `
        <div class="cheader">
          <div><div class="ctitle">${disc}</div><div class="csubtitle">${subtitle}</div></div>
          <div class="cbadges">
            ${best !== null ? `<span class="badge" style="background:${athColor}1a;color:${athColor};border:1px solid ${athColor}33;">RP : ${bestRow?.perfStr}</span>` : ''}
            ${progBadge}
            <button class="export-btn" title="Télécharger le graphique PNG">↓ PNG</button>
          </div>
        </div>
        ${pillsHTML}
        <div id="cwrap" style="position:relative;width:100%;"></div>
        <div class="rtable-scroll"><table class="rtable">
          <thead><tr><th>Date</th><th>Performance</th><th>Lieu</th><th>Compétition</th><th>Infos</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table></div>`;
      area.appendChild(card);

      // Wire year filter pills
      card.querySelectorAll('.yf-pill').forEach(pill => {
        (pill as HTMLElement).addEventListener('click', () => {
          const val = pill.getAttribute('data-y');
          yearFilter = val ? +val : null;
          if (currentData && currentDisc) renderChart(currentData, currentDisc);
        });
      });

      // Wire export button
      const exportBtn = card.querySelector('.export-btn') as HTMLElement | null;
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          const canvas = card.querySelector('canvas') as HTMLCanvasElement | null;
          if (!canvas) { alert('Pas de graphique à exporter'); return; }
          canvas.toBlob((blob: Blob | null) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (ath?.nom?.replace(/ /g, '_') || 'athlete') + '_' + disc.replace(/[ /()]/g, '_') + '.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          });
        });
      }

      const cwrap = card.querySelector('#cwrap') as HTMLElement;
      if (valid.length === 1) {
        const r = valid[0];
        cwrap.innerHTML = `
          <div style="display:flex;align-items:center;gap:24px;padding:20px 0 8px;">
            <div style="text-align:center;background:${athColor}14;border:1px solid ${athColor}33;border-radius:12px;padding:20px 32px;">
              <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Unique performance</div>
              <div style="font-size:40px;font-weight:700;color:${athColor};line-height:1;">${r.perfStr}</div>
              ${r.vent ? `<div style="font-size:12px;color:var(--txt3);margin-top:4px;">vent ${r.vent}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div style="font-size:13px;color:var(--txt2);">📅 ${r.date || '—'}</div>
              <div style="font-size:13px;color:var(--txt2);">📍 ${r.lieu || '—'}</div>
              <div style="font-size:13px;color:var(--txt2);">🏟 ${r.comp || '—'}</div>
              ${r.place ? `<div style="font-size:13px;color:var(--txt2);">${r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : '🎽'} ${r.place}e place</div>` : ''}
            </div>
          </div>`;
        if (chartInst) { chartInst.destroy(); chartInst = null; }
      } else if (isBarDisc) {
        const chartH = Math.max(260, Math.min(360, valid.length * 22 + 80));
        cwrap.style.height = chartH + 'px';
        cwrap.innerHTML = `<canvas id="theChart" role="img" aria-label="Progression ${disc}"></canvas>`;
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        const labels = valid.map((r: any) => fmtLbl(r));
        const yMin = values.length ? Math.max(0, Math.min(...values) * 0.97) : 0;
        chartInst = new Chart(card.querySelector('#theChart'), {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: disc,
              data: values,
              backgroundColor: valid.map((r: any) => r.perf === best ? athColor : athColor + '55'),
              borderColor: valid.map((r: any) => r.perf === best ? athColor : athColor + '99'),
              borderWidth: 2,
              borderRadius: 5,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1e2333', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#8891a8',
                callbacks: {
                  title: (items: any[]) => valid[items[0].dataIndex]?.date || '',
                  label: (item: any) => {
                    const r = valid[item.dataIndex];
                    if (!r) return '';
                    let s = '  ' + r.perfStr;
                    if (r.comp) s += '  — ' + r.comp;
                    if (r.place) s += '  · ' + r.place + 'e';
                    if (r.salle) s += '  [salle]';
                    return s;
                  }
                }
              }
            },
            scales: {
              x: { ticks: { color: '#555e72', font: { size: 11 }, autoSkip: false, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } },
              y: { min: yMin, reverse: lower, ticks: { color: '#555e72', font: { size: 12 }, callback: (v: any) => yFmt(v) }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } }
            }
          }
        });
      } else {
        const chartH = Math.max(260, Math.min(400, valid.length * 40 + 100));
        cwrap.style.height = chartH + 'px';
        cwrap.innerHTML = `<canvas id="theChart" role="img" aria-label="Progression ${disc}"></canvas>`;
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        const labels = valid.map((r: any) => fmtLbl(r));
        const ptColors = valid.map(() => athColor);
        const ptRadii = valid.map((r: any) => r.perf === best ? 9 : 5);
        const datasets: any[] = [
          { label: disc, data: values, borderColor: athColor, backgroundColor: athColor + '12', pointBackgroundColor: ptColors, pointBorderColor: '#0f1117', pointBorderWidth: 2, pointRadius: ptRadii, pointHoverRadius: 10, fill: true, tension: 0.3, borderWidth: 2.5 }
        ];
        chartInst = new Chart(card.querySelector('#theChart'), {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1e2333', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#8891a8',
                callbacks: {
                  title: (items: any[]) => valid[items[0].dataIndex]?.date || '',
                  label: (item: any) => {
                    const r = valid[item.dataIndex];
                    if (!r) return '';
                    let s = '  ' + r.perfStr;
                    if (r.comp) s += '  — ' + r.comp;
                    if (r.vent) s += '  (vent ' + r.vent + ')';
                    if (r.place) s += '  · ' + r.place + 'e';
                    if (r.salle) s += '  [salle]';
                    return s;
                  }
                }
              }
            },
            scales: {
              x: { ticks: { color: '#555e72', font: { size: 11 }, autoSkip: false, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } },
              y: { reverse: lower, ticks: { color: '#555e72', font: { size: 12 }, callback: (v: any) => yFmt(v) }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } }
            }
          }
        });
      }
      const tbody = card.querySelector('#tbody')!;
      const nonDq = [...allSorted].filter((r: any) => !r.dq).reverse();
      const dqs   = [...allSorted].filter((r: any) => r.dq).reverse();
      [...nonDq, ...dqs].forEach((r: any) => {
        const isRp = r.perf === best && !r.dq;
        const tr = document.createElement('tr');
        if (r.dq) tr.className = 'dq-row';
        tr.innerHTML = `
          <td style="color:var(--txt3);white-space:nowrap">${r.date || '—'}</td>
          <td class="perf" ${isRp ? `style="color:${athColor}"` : ''}>${r.perfStr}${isRp ? `<span class="tag" style="background:${athColor}1a;color:${athColor};">RP</span>` : ''}${r.salle ? '<span class="tag sal">salle</span>' : ''}${r.dq ? '<span class="tag dq">DQ</span>' : ''}${r.place && !r.dq ? `<span style="font-size:11px;color:var(--txt3);margin-left:6px">${r.place <= 3 ? ['🥇','🥈','🥉'][r.place-1] : ''}${r.place}e</span>` : ''}</td>
          <td style="font-size:12px;color:var(--txt3)">${r.lieu || '—'}</td>
          <td style="font-size:12px">${r.comp || '—'}</td>
          <td style="color:var(--txt3);font-size:12px">${r.vent ? 'vent ' + r.vent : '—'}</td>`;
        tbody.appendChild(tr);
      });
    }

    return () => { if (chartInst) { chartInst.destroy(); chartInst = null; } };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <>
      <div id="overlay">
        <div className="spinner"></div>
        <p id="omsg">Chargement des données…</p>
        <div id="progressWrap" style={{display:'none'}}>
          <div id="progressTrack"><div id="progressFill"></div></div>
          <span id="progressPct">0%</span>
        </div>
      </div>
      <header>
        <div className="logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="5" r="2"/><path d="M10 22v-5h-2l2-9 5 3-2 6h-2"/><path d="M14 22v-5l3-3-1-7"/>
          </svg>
          <em>SR Obernai</em>
        </div>
        <button id="mobileDiscToggle" aria-label="Disciplines" onClick={() => (window as any).__toggleMobileSidebar?.()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          Disciplines
        </button>
        <div className="search-wrap" id="searchWrap">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input id="searchInput" className="search-input" type="text" placeholder="Rechercher un athlète sur athle.fr…" autoComplete="off" />
          <div id="searchResults"></div>
        </div>
        <div className="athlete-select-wrap" id="athleteWrap" onClick={() => (window as any).__toggleDropdown?.()}>
          <div className="athlete-avatar" id="curAvatar">EA</div>
          <div className="athlete-info">
            <div className="athlete-name" id="curName">Emma Anguenot</div>
            <div className="athlete-sub" id="curSub">Cadette · SR Obernai</div>
          </div>
          <span className="chevron" id="chevron">▼</span>
          <div id="athleteDropdown">
            <div className="ath-loading"><div className="mini-spinner"></div>Chargement des athlètes…</div>
          </div>
        </div>
        <div className="hright">
          <div className="sdot" id="sdot"></div>
          <span id="stxt">—</span>
          <button id="refreshBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span className="rbtn-txt">Actualiser</span>
          </button>
        </div>
      </header>
      <div id="statsBar">
        <div className="scell"><div className="slbl">Disciplines</div><div className="sval" id="st-d">—</div><div className="ssub">pratiquées</div></div>
        <div className="scell"><div className="slbl">Résultats</div><div className="sval" id="st-r">—</div><div className="ssub">compétitions</div></div>
        <div className="scell"><div className="slbl">Saisons</div><div className="sval" id="st-s">—</div><div className="ssub" id="st-sr">—</div></div>
        <div className="scell"><div className="slbl">Tous podiums</div><div className="pprow" id="pd-all"></div></div>
        <div className="scell"><div className="slbl">Nationaux</div><div className="pprow" id="pd-n"></div></div>
        <div className="scell"><div className="slbl">Régionaux</div><div className="pprow" id="pd-reg"></div></div>
        <div className="scell"><div className="slbl">Départ.</div><div className="pprow" id="pd-dep"></div></div>
        <div className="scell"><div className="slbl">Niveau actuel</div><div className="sval" id="st-niv" style={{fontSize:'16px',marginTop:'4px'}}>—</div><div className="ssub" id="st-niv2">—</div></div>
      </div>
      <div id="layout">
        {/* Backdrop must live inside #layout: #layout is position:fixed and thus
            creates a stacking context, so a backdrop placed outside it would paint
            above the drawer (z-index is only comparable within the same context)
            and swallow taps on the discipline buttons. */}
        <div id="sidebarBackdrop" onClick={() => (window as any).__closeMobileSidebar?.()}></div>
        <div id="sidebar"><div className="slabel">Disciplines</div><div id="discList"></div></div>
        <div id="main">
          <div className="empty" id="emptyMain">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/>
            </svg>
            <p>Sélectionne une discipline à gauche</p>
          </div>
          <div id="chartArea" style={{display:'none'}}></div>
        </div>
      </div>
    </>
  );
}
