/**
 * SR Obernai Athlétisme — Serveur local
 * Lance avec : node server.js
 * Puis ouvre http://localhost:3000 dans le navigateur
 *
 * Installe les dépendances : npm install
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const PORT        = 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';  // Met ta clé ici ou via variable d'environnement

// ── Cache en mémoire ──────────────────────────────────
const cache = {};

// ── Helpers ──────────────────────────────────────────
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function fetchAthleUrl(actseq) {
  return new Promise((resolve, reject) => {
    const url = `https://www.athle.fr/athletes/${actseq}/resultats`;
    const opts = {
      hostname: 'www.athle.fr',
      path: `/athletes/${actseq}/resultats`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.athle.fr/'
      }
    };
    let data = '';
    const req = https.get(opts, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout athle.fr')); });
  });
}

function callAnthropicAPI(htmlContent, actseq) {
  return new Promise((resolve, reject) => {
    if (!ANTHROPIC_KEY) {
      reject(new Error('ANTHROPIC_API_KEY non définie. Lance le serveur avec : ANTHROPIC_API_KEY=sk-ant-... node server.js'));
      return;
    }

    const systemPrompt = `Tu es un extracteur de données sportives. On te donne le HTML brut de la page athle.fr d'un athlète.
Extrais TOUS les résultats individuels (chaque compétition séparément, pas seulement les meilleures par saison).
Retourne UNIQUEMENT du JSON valide, sans texte autour, sans backticks :
{
  "nom":"Prénom Nom",
  "club":"Sr Obernai",
  "categorie":"CA/F",
  "licence":"2328099",
  "nee":2010,
  "niveau":{"annee":2026,"niveau":"IR3","pts":19},
  "podiums":{
    "national":{"or":0,"argent":0,"bronze":0},
    "regional":{"or":0,"argent":0,"bronze":0},
    "dept":{"or":0,"argent":0,"bronze":0}
  },
  "disciplines":{
    "NomEpreuve":{
      "lower":true,
      "unit":"s",
      "resultats":[
        {"date":"DD/MM/YYYY","perf":26.47,"perfStr":"26\\"47","vent":"+0.2","lieu":"Ville","place":2,"comp":"Nom compétition","salle":false,"dq":false}
      ]
    }
  }
}
Pour les courses : "perf" = secondes décimales (ex 26.47). Hauteur/longueur = mètres (1.46). Triathlon = points. "dq":true si disqualifié. "lower":true si plus bas = mieux.`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Extrais les données de cet athlète (actseq: ${actseq}) depuis ce HTML athle.fr :\n\n${htmlContent.substring(0, 80000)}` }]
    });

    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    let respData = '';
    const req = https.request(opts, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(respData);
          if (json.error) { reject(new Error(json.error.message)); return; }
          let text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          text = text.replace(/```json|```/g, '').trim();
          const si = text.indexOf('{'), ei = text.lastIndexOf('}');
          if (si === -1) { reject(new Error('Pas de JSON dans la réponse')); return; }
          const parsed = JSON.parse(text.substring(si, ei + 1));
          resolve(parsed);
        } catch (e) {
          reject(new Error('Parsing JSON échoué : ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout API Anthropic')); });
    req.write(body);
    req.end();
  });
}

// ── Serveur HTTP ──────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // GET /api/athlete/:actseq
  const m = u.pathname.match(/^\/api\/athlete\/(\d+)$/);
  if (m) {
    const actseq = m[1];
    const forceRefresh = u.searchParams.get('refresh') === '1';

    // Cache hit
    if (cache[actseq] && !forceRefresh) {
      console.log(`[CACHE] actseq=${actseq}`);
      jsonResponse(res, { ok: true, data: cache[actseq], source: 'cache' });
      return;
    }

    console.log(`[FETCH] athle.fr actseq=${actseq}…`);
    try {
      const html = await fetchAthleUrl(actseq);
      console.log(`[OK] HTML reçu ${html.length} bytes`);

      console.log(`[API] Appel Anthropic…`);
      const data = await callAnthropicAPI(html, actseq);
      data._loadedAt = new Date().toLocaleString('fr-FR');
      data._actseq   = actseq;
      cache[actseq]  = data;

      console.log(`[OK] Données extraites : ${Object.keys(data.disciplines || {}).length} disciplines`);
      jsonResponse(res, { ok: true, data, source: 'athle.fr' });
    } catch (e) {
      console.error(`[ERR] ${e.message}`);
      jsonResponse(res, { ok: false, error: e.message }, 500);
    }
    return;
  }

  // GET / → sert index.html
  if (u.pathname === '/' || u.pathname === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404); res.end('index.html introuvable');
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   SR Obernai Athlétisme — Serveur local      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL : http://localhost:${PORT}                 ║`);
  console.log(`║  Clé API : ${ANTHROPIC_KEY ? '✓ définie' : '✗ MANQUANTE — voir README'}         ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  if (!ANTHROPIC_KEY) {
    console.log('⚠️  Lance avec : ANTHROPIC_API_KEY=sk-ant-... node server.js');
    console.log('   Ou édite server.js ligne 14 pour mettre ta clé directement.');
    console.log('');
  }
});
