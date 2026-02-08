/** Shared image compression utilities using canvas resizing. */

export interface CompressImageOptions {
  /** Maximum width in pixels (default: 800) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 800) */
  maxHeight?: number;
  /** JPEG quality 0-1 (default: 0.8) */
  quality?: number;
}

/** Byte-size threshold below which compression is skipped entirely. */
export const COMPRESS_THRESHOLD = 100 * 1024; // 100 KB

/**
 * Compress a base64-encoded image using canvas resizing.
 *
 * If the raw data URL is already small (≤ COMPRESS_THRESHOLD bytes), the
 * original string is returned unchanged.  Otherwise the image is drawn onto
 * an off-screen canvas at the requested maximum dimensions and re-encoded as
 * both WebP and JPEG — whichever is smaller wins.
 */
export function compressImage(
  imageData: string,
  options: CompressImageOptions = {},
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.8,
  } = options;

  return new Promise((resolve, reject) => {
    // Quick size check — base64 data URLs are ~33 % larger than the raw bytes,
    // but comparing against the threshold on the encoded string length is a
    // cheap and reasonable heuristic.
    if (imageData.length <= COMPRESS_THRESHOLD) {
      resolve(imageData);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Canvas 2D context unavailable — return original data
          resolve(imageData);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first, fall back to JPEG — pick whichever is smaller
        const webpUrl = canvas.toDataURL('image/webp', quality);
        const jpegUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(webpUrl.length <= jpegUrl.length ? webpUrl : jpegUrl);
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
 * Convenience wrapper: read a File and compress it using standard question-
 * image defaults (800x800, quality 0.8).
 *
 * Files smaller than COMPRESS_THRESHOLD are returned without re-encoding.
 */
export async function compressImageFile(
  file: File,
  options?: CompressImageOptions,
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);

  // If the source file is small, skip compression entirely
  if (file.size <= COMPRESS_THRESHOLD) {
    return dataUrl;
  }

  return compressImage(dataUrl, options);
}

/**
 * Convenience function for answer images — uses smaller dimensions and
 * slightly lower quality than the default question-image settings.
 */
export function compressAnswerImage(imageData: string): Promise<string> {
  return compressImage(imageData, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.7,
  });
}
