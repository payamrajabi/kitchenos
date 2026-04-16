/**
 * Downscale and re-encode images in the browser so Server Action payloads stay
 * under default body limits and uploads are faster. Used only from client components.
 */

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.88;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function resizeToJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale = maxDim > MAX_EDGE_PX ? MAX_EDGE_PX / maxDim : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available.");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * Returns data URLs suitable for `importRecipeFromImagesAction` (JPEG when possible).
 */
export async function prepareImagesForRecipeImport(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      out.push(await resizeToJpegDataUrl(file));
    } catch {
      out.push(await readFileAsDataUrl(file));
    }
  }
  return out;
}
