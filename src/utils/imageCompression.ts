/**
 * Aggressive image compression utilities using canvas resizing.
 *
 * Goal: reduce image sizes dramatically so quiz data fits in shareable URLs.
 * All images are re-encoded as JPEG at low quality with aggressive downscaling.
 */

export interface CompressImageOptions {
  /** Maximum width in pixels (default: 400) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 400) */
  maxHeight?: number;
  /** JPEG quality 0-1 (default: 0.3 — aggressive) */
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
 * ALL images are aggressively compressed:
 * - Downscaled to fit within maxWidth×maxHeight (default 400×400)
 * - Re-encoded as JPEG at low quality (default 0.3 = 30%)
 * - Compared against WebP — whichever is smaller wins
 *
 * Logs compression results to console for debugging/measurement.
 */
export function compressImage(
  imageData: string,
  options: CompressImageOptions = {},
): Promise<string> {
  const {
    maxWidth = 400,
    maxHeight = 400,
    quality = 0.3,
  } = options;

  return new Promise((resolve, reject) => {
    // Validate data URL format
    if (!imageData || typeof imageData !== 'string') {
      reject(new Error('Invalid image data: expected a non-empty string'));
      return;
    }

    if (!imageData.startsWith('data:image/')) {
      // Not an image data URL — return as-is (e.g. could be an external URL)
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
 * Convenience wrapper: read a File and compress it aggressively.
 *
 * Question images: 400×400 max, quality 0.3 (30%).
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
 * Convenience function for answer option images — even more aggressive
 * compression with smaller dimensions (200×200, quality 0.25).
 *
 * Answer images are typically flags, icons, or logos where fine detail
 * is less important than being recognizable.
 */
export function compressAnswerImage(imageData: string): Promise<string> {
  return compressImage(imageData, {
    maxWidth: 200,
    maxHeight: 200,
    quality: 0.25,
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
  let originalTotal = 0;
  let compressedTotal = 0;

  const compressedQuestions = await Promise.all(
    quiz.questions.map(async (q) => {
      const result = { ...q };

      // Compress question image
      if (q.image && typeof q.image === 'string' && q.image.startsWith('data:image/')) {
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

      // Compress answer option images
      if (Array.isArray(q.imageOptions)) {
        result.imageOptions = await Promise.all(
          q.imageOptions.map(async (img) => {
            if (img && typeof img === 'string' && img.startsWith('data:image/')) {
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
    console.log(
      `[ImageCompression] Quiz compression complete: ${imageCount} images, ` +
      `${(originalTotal / 1024).toFixed(1)} KB → ${(compressedTotal / 1024).toFixed(1)} KB ` +
      `(${reduction}% reduction, ${elapsed.toFixed(0)}ms)`
    );
  } else {
    console.log('[ImageCompression] No images found in quiz — nothing to compress');
  }

  return { ...quiz, questions: compressedQuestions };
}
