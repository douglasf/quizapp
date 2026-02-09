/**
 * Image compression utilities using canvas resizing.
 *
 * Goal: reduce image sizes so quiz data fits in shareable URLs while
 * preserving reasonable visual quality.
 * Images are re-encoded as JPEG/WebP at moderate quality with downscaling.
 *
 * HTTPS URL images (e.g. from R2/CDN hosting) are always skipped — they are
 * already optimised on the server and don't need client-side recompression.
 */

/**
 * Check whether a value is an HTTPS URL (i.e. a remotely-hosted image).
 * Such images are already optimised on the CDN and should never be
 * re-compressed on the client.
 */
export function isHttpsUrl(value: string): boolean {
  return value.startsWith('https://');
}

export interface CompressImageOptions {
  /** Maximum width in pixels (default: 800) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 800) */
  maxHeight?: number;
  /** JPEG quality 0-1 (default: 0.85 — balanced) */
  quality?: number;
}

/**
 * Byte-size threshold below which compression is skipped entirely.
 * Lowered to 5 KB — almost everything gets compressed now.
 */
export const COMPRESS_THRESHOLD = 5 * 1024; // 5 KB

/**
 * Compress a base64-encoded image using canvas resizing.
 *
 * Images are compressed with balanced quality settings:
 * - Downscaled to fit within maxWidth×maxHeight (default 800×800)
 * - Re-encoded as JPEG at moderate quality (default 0.85 = 85%)
 * - Compared against WebP — whichever is smaller wins
 *
 * Logs compression results to console for debugging/measurement.
 */
export function compressImage(
  imageData: string,
  options: CompressImageOptions = {},
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.85,
  } = options;

  return new Promise((resolve, reject) => {
    // Validate data URL format
    if (!imageData || typeof imageData !== 'string') {
      reject(new Error('Invalid image data: expected a non-empty string'));
      return;
    }

    // HTTPS URL images (e.g. from R2/CDN) — already optimised, skip compression
    if (isHttpsUrl(imageData)) {
      resolve(imageData);
      return;
    }

    if (!imageData.startsWith('data:image/')) {
      // Not an image data URL — return as-is
      resolve(imageData);
      return;
    }

    // Skip only truly tiny images (< 5 KB)
    const originalSize = imageData.length;
    if (originalSize <= COMPRESS_THRESHOLD) {
      console.log(`[ImageCompression] Skipping — already tiny (${(originalSize / 1024).toFixed(1)} KB)`);
      resolve(imageData);
      return;
    }

    const startTime = performance.now();
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Always downscale to fit within maxWidth×maxHeight
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageData);
          return;
        }

        // Fill with white background (JPEG has no alpha — avoids black backgrounds)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Try both formats, pick the smaller one
        const jpegUrl = canvas.toDataURL('image/jpeg', quality);
        const webpUrl = canvas.toDataURL('image/webp', quality);

        // webpUrl may fall back to PNG on unsupported browsers — check it's actually webp
        const isActualWebp = webpUrl.startsWith('data:image/webp');
        const best = isActualWebp && webpUrl.length < jpegUrl.length ? webpUrl : jpegUrl;

        const elapsed = performance.now() - startTime;
        const compressedSize = best.length;
        const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        console.log(
          `[ImageCompression] ${(originalSize / 1024).toFixed(1)} KB → ${(compressedSize / 1024).toFixed(1)} KB ` +
          `(${reduction}% reduction, ${img.naturalWidth}×${img.naturalHeight} → ${width}×${height}, ` +
          `q=${quality}, ${elapsed.toFixed(0)}ms)`
        );

        // Only use compressed version if it's actually smaller
        if (compressedSize < originalSize) {
          resolve(best);
        } else {
          console.log('[ImageCompression] Compressed larger than original — keeping original');
          resolve(imageData);
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image compression failed'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = imageData;
  });
}

/**
 * Read a File as a base64 data URL string.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convenience wrapper: read a File and compress it.
 *
 * Question images: 800×800 max, quality 0.85 (85%).
 * ALL files are compressed — the threshold is very low (5 KB).
 */
export async function compressImageFile(
  file: File,
  options?: CompressImageOptions,
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);

  // Only skip truly tiny files (< 5 KB)
  if (file.size <= COMPRESS_THRESHOLD) {
    console.log(`[ImageCompression] File skip — ${file.name} is tiny (${(file.size / 1024).toFixed(1)} KB)`);
    return dataUrl;
  }

  return compressImage(dataUrl, options);
}

/**
 * Convenience function for answer option images — moderate compression
 * with smaller dimensions (400×400, quality 0.80).
 *
 * Answer images are typically flags, icons, or logos where fine detail
 * is less important than being recognizable, but quality should still
 * be good enough for clarity.
 */
export function compressAnswerImage(imageData: string): Promise<string> {
  return compressImage(imageData, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.80,
  });
}

// ---------------------------------------------------------------------------
// Blob-output variants — used for binary uploads (e.g. R2 image hosting)
// ---------------------------------------------------------------------------

/**
 * Internal helper: load a File into an Image element via an object URL.
 * Returns the loaded Image along with a cleanup function for the object URL.
 */
function _loadFileAsImage(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    img.src = url;
  });
}

/**
 * Internal helper: draw an image onto a canvas with the given constraints
 * and return the canvas. Reuses the same resize/draw logic as `compressImage`.
 */
function _drawToCanvas(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let { width, height } = img;

  // Downscale to fit within maxWidth×maxHeight
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context');
  }

  // Fill with white background (JPEG has no alpha — avoids black backgrounds)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

/**
 * Internal helper: convert a canvas to a Blob of the given format/quality.
 * Wraps the callback-based `canvas.toBlob` in a Promise.
 */
function _canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`canvas.toBlob returned null for ${mimeType}`));
        }
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Compress a File image and return the result as a Blob.
 *
 * Uses the same canvas-based resize logic as `compressImage` but outputs
 * a binary Blob suitable for direct upload (e.g. to R2/S3).
 *
 * Tries both JPEG and WebP, picks whichever is smaller.
 *
 * Default settings match question images: 800×800 max, quality 0.85.
 */
export async function compressImageToBlob(
  file: File,
  options: CompressImageOptions = {},
): Promise<Blob> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.85,
  } = options;

  const startTime = performance.now();
  const { img, revoke } = await _loadFileAsImage(file);

  try {
    const canvas = _drawToCanvas(img, maxWidth, maxHeight);

    // Try both formats, pick the smaller one
    const jpegBlob = await _canvasToBlob(canvas, 'image/jpeg', quality);

    let best = jpegBlob;
    let bestFormat = 'jpeg';

    try {
      const webpBlob = await _canvasToBlob(canvas, 'image/webp', quality);
      if (webpBlob.type === 'image/webp' && webpBlob.size < jpegBlob.size) {
        best = webpBlob;
        bestFormat = 'webp';
      }
    } catch {
      // WebP not supported in this browser — use JPEG
    }

    const elapsed = performance.now() - startTime;
    const reduction = ((1 - best.size / file.size) * 100).toFixed(1);

    console.log(
      `[ImageCompression] Blob: ${(file.size / 1024).toFixed(1)} KB → ${(best.size / 1024).toFixed(1)} KB ` +
      `(${reduction}% reduction, ${img.naturalWidth}×${img.naturalHeight} → ${canvas.width}×${canvas.height}, ` +
      `${bestFormat}, q=${quality}, ${elapsed.toFixed(0)}ms)`,
    );

    return best;
  } finally {
    revoke();
  }
}

/**
 * Compress a File image for answer options and return the result as a Blob.
 *
 * Moderate compression: 400×400 max, quality 0.80.
 * Matches the settings used by `compressAnswerImage`.
 */
export function compressAnswerImageToBlob(file: File): Promise<Blob> {
  return compressImageToBlob(file, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.80,
  });
}

/**
 * Compress all images within a Quiz object. Used when importing quizzes
 * that may contain uncompressed or oversized images.
 *
 * Processes:
 * - question.image (question header images)
 * - question.imageOptions[] (answer option images)
 *
 * Returns a new quiz object with all images compressed.
 */
export async function compressQuizImages(quiz: {
  title: string;
  questions: Array<{
    image?: string;
    imageOptions?: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}): Promise<typeof quiz> {
  console.log('[ImageCompression] Compressing all images in quiz...');
  const startTime = performance.now();
  let imageCount = 0;
  let skippedUrlCount = 0;
  let originalTotal = 0;
  let compressedTotal = 0;

  const compressedQuestions = await Promise.all(
    quiz.questions.map(async (q) => {
      const result = { ...q };

      // Process question image
      if (q.image && typeof q.image === 'string') {
        if (isHttpsUrl(q.image)) {
          // HTTPS URL image (e.g. from R2/CDN) — already optimised, skip
          skippedUrlCount++;
        } else if (q.image.startsWith('data:image/')) {
          // Base64 image — compress
          const origLen = q.image.length;
          originalTotal += origLen;
          imageCount++;
          try {
            result.image = await compressImage(q.image);
            compressedTotal += result.image.length;
          } catch {
            // Keep original on error
            compressedTotal += origLen;
          }
        }
      }

      // Process answer option images
      if (Array.isArray(q.imageOptions)) {
        result.imageOptions = await Promise.all(
          q.imageOptions.map(async (img) => {
            if (img && typeof img === 'string') {
              if (isHttpsUrl(img)) {
                // HTTPS URL image — already optimised, skip
                skippedUrlCount++;
                return img;
              }
              if (img.startsWith('data:image/')) {
                // Base64 image — compress
                const origLen = img.length;
                originalTotal += origLen;
                imageCount++;
                try {
                  const compressed = await compressAnswerImage(img);
                  compressedTotal += compressed.length;
                  return compressed;
                } catch {
                  compressedTotal += origLen;
                  return img;
                }
              }
            }
            return img;
          }),
        );
      }

      return result;
    }),
  );

  const elapsed = performance.now() - startTime;

  if (imageCount > 0) {
    const reduction = ((1 - compressedTotal / originalTotal) * 100).toFixed(1);
    const urlSkipNote = skippedUrlCount > 0 ? `, ${skippedUrlCount} URL images skipped` : '';
    console.log(
      `[ImageCompression] Quiz compression complete: ${imageCount} base64 images compressed, ` +
      `${(originalTotal / 1024).toFixed(1)} KB → ${(compressedTotal / 1024).toFixed(1)} KB ` +
      `(${reduction}% reduction, ${elapsed.toFixed(0)}ms)${urlSkipNote}`,
    );
  } else if (skippedUrlCount > 0) {
    console.log(
      `[ImageCompression] ${skippedUrlCount} URL images skipped (already optimised on CDN) — ` +
      `no base64 images to compress (${elapsed.toFixed(0)}ms)`,
    );
  } else {
    console.log('[ImageCompression] No images found in quiz — nothing to compress');
  }

  return { ...quiz, questions: compressedQuestions };
}
