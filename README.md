# SR Obernai — Suivi Athlétisme (Next.js)

## Prérequis

Installe [Node.js 18+](https://nodejs.org/) si ce n'est pas fait.

## Installation

```bash
cd C:\Users\angueno1\claude
npm install
```

## Configuration

Édite `.env.local` et remplace la clé API :

```
ANTHROPIC_API_KEY=sk-ant-TON_API_KEY_ICI
```

## Lancement

```bash
npm run dev
```

Puis ouvre http://localhost:3000

## Architecture

```
app/
  page.tsx                        # Client — même look & feel que l'original
  api/
    search/route.ts               # GET /api/search?q=<nom> → athle.fr autocomplete
    athlete/[actseq]/route.ts     # GET /api/athlete/2747642 → données athlète
lib/
  storage.ts                      # Lecture/écriture dans data/athletes.json
data/
  athletes.json                   # Cache local (créé automatiquement)
```

## Flux de données

1. **Recherche** : `/api/search?q=anguenot` → proxy vers `https://www.athle.fr/ajax/autocompletion.aspx?mode=1&recherche=anguenot`
2. **Résultats** : `/api/athlete/2747642`
   - Si présent dans `data/athletes.json` → retourné directement
   - Sinon → fetch HTML depuis `athle.fr/athletes/2747642/resultats` → Claude extrait le JSON structuré → sauvegardé dans `data/athletes.json`
3. **Actualiser** : `/api/athlete/2747642?refresh=1` → force le rechargement depuis athle.fr
