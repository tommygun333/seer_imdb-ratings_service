# IMDB Ratings Sidecar for Seerr

This standalone TypeScript/Express microservice replaces Seerr's Radarr-only IMDB proxy flow and adds reliable IMDB ratings for both movies and TV by using two strategies with fallback:

1. IMDB GraphQL API (primary)
2. IMDB flat-file dataset cache (fallback)

It exposes a small API Seerr can call directly:

- `GET /api/ratings/movie/:imdbId`
- `GET /api/ratings/tv/:imdbId`
- `GET /health`

## Run with Docker

```bash
docker compose up -d --build
```

Service defaults to port `3001` and stores dataset cache under `./data/cache`.

## Seerr changes required

Update the following files in Seerr:

1. `server/api/rating/imdbRadarrProxy.ts`
   - Change base URL to `http://imdb-sidecar:3001`
   - Add `getTvRatings()` method
2. `server/routes/tv.ts`
   - Add a `ratingscombined` endpoint that mirrors `movie.ts`

Set Seerr env var:

- `IMDB_SIDECAR_URL=http://imdb-sidecar:3001`

## Docker Compose integration with Seerr

```yaml
services:
  seerr:
    image: seerrteam/seerr:latest
    environment:
      - IMDB_SIDECAR_URL=http://imdb-sidecar:3001
    depends_on:
      - imdb-sidecar

  imdb-sidecar:
    image: your-registry/imdb-sidecar:latest
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
```
