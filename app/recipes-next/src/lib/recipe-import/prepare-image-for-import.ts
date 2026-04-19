/**
 * Downscale and re-encode images in the browser so Server Action payloads stay
 * under default body limits and uploads are faster. Returns Blob[] so the
 * images can be passed to server actions as raw bytes (FormData multipart)
 * rather than as base64 data URLs — base64 strings trip React's array-size
 * limit on the action-decoding path for files over ~750 KB of JPEG data.
 * Used only from client components.
 */

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.88;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode image."));
      },
      type,
      quality,
    );
  });
}

async function resizeToJpegBlob(file: File): Promise<Blob> {
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
    return await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * Returns Blobs suitable for a server action that takes a Blob[] argument.
 * If resizing/encoding fails for a given file, the original File is passed
 * through unchanged (File extends Blob).
 */
export async function prepareImagesForRecipeImport(
  files: File[],
): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      out.push(await resizeToJpegBlob(file));
    } catch {
      out.push(file);
    }
  }
  return out;
}
