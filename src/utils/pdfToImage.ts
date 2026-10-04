import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source for pdfjs in Vite
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

/**
 * Converts the first page of a PDF File to a compressed base64 JPEG data URL
 * suited for template preview canvas and background rendering.
 */
export async function convertPdfToImageDataUrl(file: File, maxDimension = 1600): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;

  if (pdfDoc.numPages < 1) {
    throw new Error('PDF has no pages');
  }

  // Load first page
  const page = await pdfDoc.getPage(1);
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  // Compute scale so longest edge is around maxDimension (e.g. 1600px for crisp A4)
  const maxOriginal = Math.max(unscaledViewport.width, unscaledViewport.height);
  const scale = Math.min(2.5, Math.max(1.0, maxDimension / maxOriginal));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // In pdfjs-dist v6, canvas property is required
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;

  // Convert to high-quality JPEG data URL (quality 0.88 keeps size well under 300KB)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return dataUrl;
}
