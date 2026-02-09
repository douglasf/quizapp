# Quiz Images Worker

Cloudflare Worker for handling quiz image uploads to R2 object storage. Provides a simple REST API for uploading, storing, and serving images used in quizzes.

## Architecture

```
Browser (Quiz App)           Cloudflare Edge
┌──────────────────┐        ┌────────────────────────────────────┐
│                  │  POST  │  Quiz Image Worker                 │
│  QuizCreator     │───────>│  /api/upload                       │
│  (cloud mode)    │<───────│    → compress → store in R2        │
│                  │  {url} │    → return CDN URL                │
│                  │        │                                    │
│  Quiz Player     │  GET   │  /images/:key                      │
│  (displays img)  │───────>│    → serve from R2 with caching    │
│                  │<───────│    → Cache-Control: 1 year         │
└──────────────────┘        └────────────────────────────────────┘
```

Images are compressed client-side before upload (JPEG/WebP, 400x400 max for questions, 200x200 for answers), then stored in R2 with immutable cache headers.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as dev dependency)

## Setup

### 1. Install dependencies

```bash
cd worker
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authorize Wrangler with your Cloudflare account.

### 3. Create the R2 bucket

```bash
npx wrangler r2 bucket create quiz-images
```

### 4. Configure allowed origins

Edit `wrangler.toml` and set `ALLOWED_ORIGINS` to your production domain(s):

```toml
[vars]
ALLOWED_ORIGINS = "https://yourusername.github.io,http://localhost:5173"
```

Multiple origins are comma-separated. Include `http://localhost:5173` for local development.

### 5. Deploy

```bash
cd worker
npx wrangler deploy
```

Wrangler will output the deployed URL, e.g.:

```
Published quiz-image-worker (x.xx sec)
  https://quiz-image-worker.your-account.workers.dev
```

### 6. Configure the client app

Set `VITE_IMAGE_WORKER_URL` in your environment so the quiz app knows where to upload images:

**For local development** — create `.env.local` in the project root:

```env
VITE_IMAGE_WORKER_URL=https://quiz-image-worker.your-account.workers.dev
```

**For production builds** — set the variable in `.env.production` or your CI/CD environment:

```env
VITE_IMAGE_WORKER_URL=https://quiz-image-worker.your-account.workers.dev
```

## Local Development

Run the Worker locally with Wrangler dev server:

```bash
cd worker
npm run dev
```

This starts the Worker at `http://localhost:8787` with a local R2 emulator. To test with the quiz app, set:

```env
VITE_IMAGE_WORKER_URL=http://localhost:8787
```

And make sure `http://localhost:5173` is in the `ALLOWED_ORIGINS` list in `wrangler.toml`.

## API Endpoints

### `POST /api/upload` — Upload an image

Accepts a `multipart/form-data` request with a single `file` field.

**Request:**

```bash
curl -X POST https://quiz-image-worker.your-account.workers.dev/api/upload \
  -F "file=@photo.jpg"
```

**Success response (200):**

```json
{
  "url": "https://quiz-image-worker.your-account.workers.dev/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
}
```

**Error responses:**

| Status | Reason |
|--------|--------|
| 400 | Missing `file` field, wrong Content-Type, or unsupported image format |
| 413 | File exceeds size limit (default 2 MB) |
| 500 | R2 storage error |

**Supported formats:** JPEG, PNG, WebP, GIF

### `GET /api/health` — Health check

Returns service status. Used by the quiz app to determine if cloud upload is available.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-02-09T12:00:00.000Z"
}
```

### `GET /images/:key` — Retrieve an uploaded image

Serves an image from R2 with aggressive caching headers (`Cache-Control: public, max-age=31536000`).

**Response:** The image binary with appropriate `Content-Type` and `ETag` headers.

| Status | Reason |
|--------|--------|
| 200 | Image found and served |
| 400 | Invalid image key format |
| 404 | Image not found in R2 |

## Configuration

All configuration is in `wrangler.toml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `"http://localhost:5173,https://quizapp.pages.dev"` | Comma-separated list of allowed CORS origins |
| `MAX_IMAGE_SIZE` | `"2097152"` (2 MB) | Maximum upload size in bytes |

The R2 bucket binding is configured as:

```toml
[[r2_buckets]]
binding = "IMAGES_BUCKET"
bucket_name = "quiz-images"
```

## Type Checking

```bash
cd worker
npm run typecheck
```

## Costs

Cloudflare Workers and R2 have generous free tiers:

- **Workers:** 100,000 requests/day free
- **R2 Storage:** 10 GB free, 1 million Class A ops/month, 10 million Class B ops/month
- **R2 Egress:** Free (no bandwidth charges)

For a quiz app, you're unlikely to exceed free tier limits.
