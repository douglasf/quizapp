# Integration Testing Checklist

Complete end-to-end testing guide for the Cloudflare R2 image hosting feature. Run through these tests after deploying the Worker and building the client app.

## Prerequisites

Before testing, ensure:

- [ ] Cloudflare Worker is deployed (`cd worker && npx wrangler deploy`)
- [ ] R2 bucket `quiz-images` exists (`npx wrangler r2 bucket create quiz-images`)
- [ ] `ALLOWED_ORIGINS` in `wrangler.toml` includes your production domain
- [ ] `VITE_IMAGE_WORKER_URL` is set to your deployed Worker URL
- [ ] Client app is built and deployed (`npm run build`)

## 1. Worker Health Check

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 1.1 | `curl https://<worker-url>/api/health` | `{"status":"ok","timestamp":"..."}` | |
| 1.2 | Open quiz creator — check console for health check | No errors; cloud toggle visible | |
| 1.3 | Cloud upload toggle defaults to ON | Toggle shows "Cloud Image Upload" enabled | |

## 2. End-to-End Upload Flow

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 2.1 | Create quiz with cloud upload ON | Upload toggle shows "Images uploaded to CDN" | |
| 2.2 | Add question image (JPEG, < 2 MB) | Image uploads, HTTPS URL stored in question | |
| 2.3 | Add question image (PNG) | Compressed to JPEG/WebP, uploaded, HTTPS URL stored | |
| 2.4 | Add answer option images | Images compressed (200x200), uploaded, HTTPS URLs stored | |
| 2.5 | Verify R2 bucket has images | `npx wrangler r2 object list quiz-images` shows uploaded files | |
| 2.6 | Verify quiz JSON contains HTTPS URLs | No `data:image/...` strings — all `https://` URLs | |

## 3. Image Display

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 3.1 | Host the quiz — question images display | Images load from Worker URL, visible to host | |
| 3.2 | Join as player — question images display | Images load via HTTPS, visible to players | |
| 3.3 | Answer option images display correctly | All 4 option images render in player view | |
| 3.4 | Images load quickly (CDN caching) | Second load is near-instant (cached) | |

## 4. Export & Import

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 4.1 | Export quiz as JSON file | JSON file contains HTTPS image URLs (not base64) | |
| 4.2 | Export JSON file size is small | File much smaller than equivalent with base64 images | |
| 4.3 | Import the exported JSON | Quiz loads correctly, all images display | |
| 4.4 | Copy quiz JSON to clipboard and re-import | Works correctly, images still accessible | |

## 5. Share as Link

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.1 | Create quiz with cloud images → share as link | URL is short (no bloated base64 in hash) | |
| 5.2 | Open shared link in new browser | Quiz loads, all images display from CDN | |
| 5.3 | Compare link length: cloud vs inline | Cloud link significantly shorter | |

## 6. Backward Compatibility

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 6.1 | Import old quiz with base64 images | Quiz loads and displays correctly | |
| 6.2 | Base64 images display in host view | Images render from inline data | |
| 6.3 | Base64 images display in player view | Images render from inline data | |
| 6.4 | Create quiz with inline mode (toggle OFF) | Images stored as base64 data URLs | |
| 6.5 | Mixed quiz: some cloud URLs, some base64 | Both types display correctly | |

## 7. Error Handling & Fallback

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 7.1 | Set invalid `VITE_IMAGE_WORKER_URL` → create quiz | Health check fails, toggle hidden, inline mode used | |
| 7.2 | Unset `VITE_IMAGE_WORKER_URL` entirely | Cloud toggle not shown, inline mode automatic | |
| 7.3 | Worker available → upload image → Worker goes down | Upload fails, falls back to base64 with warning notification | |
| 7.4 | Upload file > 2 MB | Worker returns 413, falls back to inline with notification | |
| 7.5 | Upload non-image file | Worker returns 400, user sees error | |
| 7.6 | Network disconnects mid-upload | Timeout/error, falls back to inline | |

## 8. CORS & Security

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.1 | Upload from allowed origin (production domain) | Upload succeeds | |
| 8.2 | Upload from `localhost:5173` (if in allowed list) | Upload succeeds | |
| 8.3 | `curl` upload without Origin header | Upload succeeds (no origin = no CORS restriction) | |
| 8.4 | Image key with path traversal (`../etc/passwd`) | Returns 400 "Invalid image key" | |
| 8.5 | OPTIONS preflight request | Returns 204 with correct CORS headers | |

## 9. Performance

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 9.1 | Upload time for 1 MB JPEG | < 3 seconds (compressed + uploaded) | |
| 9.2 | Image serve time (first load) | < 500ms from Cloudflare edge | |
| 9.3 | Image serve time (cached) | < 50ms (browser cache / CF cache) | |
| 9.4 | Quiz with 10 cloud images — host game | All images load without noticeable lag | |

## Quick Smoke Test

Minimal test to verify the integration works:

```bash
# 1. Health check
curl -s https://<worker-url>/api/health | jq .

# 2. Upload a test image
curl -s -X POST https://<worker-url>/api/upload \
  -F "file=@test-image.jpg" | jq .

# 3. Fetch the uploaded image (use URL from step 2)
curl -s -o /dev/null -w "%{http_code}" https://<worker-url>/images/<key>
# Should output: 200
```

Then open the quiz app, create a quiz with an image, and verify the image URL in the exported JSON starts with `https://`.
