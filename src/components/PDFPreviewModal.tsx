import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Printer,
  X,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Layers,
  FileText,
  Loader2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { printPdfDocument } from '../utils/pdfGenerator';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  } catch (e) {
    console.warn('PDF worker configuration error:', e);
  }
}

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  filename: string;
  onSaveClaim?: () => void;
  isSaved?: boolean;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  filename,
  onSaveClaim,
  isSaved,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<'embedded' | 'canvas'>('embedded');
  const [numPages, setNumPages] = useState<number>(1);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [canvasLoading, setCanvasLoading] = useState<boolean>(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const pdfDocRef = useRef<any>(null);

  // If in canvas view mode, try rendering with pdfjs
  useEffect(() => {
    if (!isOpen || !pdfUrl || viewMode !== 'canvas') return;

    let isCancelled = false;
    setCanvasLoading(true);
    setCanvasError(null);

    const loadAndRenderPdf = async () => {
      try {
        const resp = await fetch(pdfUrl);
        const arrayBuffer = await resp.arrayBuffer();
        if (isCancelled) return;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const doc = await loadingTask.promise;
        if (isCancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);

        const page = await doc.getPage(pageNumber);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1.5, 2);
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: page.getViewport({ scale: scale * dpr }),
          canvas: canvas,
        }).promise;

        setCanvasLoading(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Canvas rendering via pdfjs could not complete:', err);
          setCanvasError(err.message || 'Canvas rendering failed.');
          setCanvasLoading(false);
          // Auto fallback to embedded view so the user is never stuck
          setViewMode('embedded');
        }
      }
    };

    loadAndRenderPdf();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, pdfUrl, viewMode, pageNumber, scale]);

  if (!isOpen || !pdfUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    printPdfDocument(pdfUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-5xl h-[92vh] rounded-2xl bg-white shadow-2xl border border-slate-300 overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md">
                {filename}
              </h2>
              <p className="text-[11px] text-slate-400">
                Official A4 Print-Ready Document Preview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs text-slate-300 mr-1">
              <button
                type="button"
                onClick={() => setViewMode('embedded')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                  viewMode === 'embedded' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-white'
                }`}
                title="Browser Native PDF Engine"
              >
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  <span>PDF Viewer</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('canvas')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                  viewMode === 'canvas' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-white'
                }`}
                title="High-Res Canvas Rendering"
              >
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  <span>Canvas View</span>
                </span>
              </button>
            </div>

            {/* Canvas Zoom Controls (Only if Canvas Mode) */}
            {viewMode === 'canvas' && (
              <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs text-slate-300 mr-1">
                <button
                  type="button"
                  onClick={() => setScale(s => Math.max(0.6, s - 0.15))}
                  className="p-1 hover:text-white hover:bg-slate-700 rounded transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono text-[11px]">{Math.round(scale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setScale(s => Math.min(2.5, s + 0.15))}
                  className="p-1 hover:text-white hover:bg-slate-700 rounded transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Page Nav (if multiple pages in canvas mode) */}
            {viewMode === 'canvas' && numPages > 1 && (
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs text-slate-300 mr-1">
                <button
                  type="button"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  className="p-1 hover:text-white disabled:opacity-30 rounded transition"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px]">
                  {pageNumber} / {numPages}
                </span>
                <button
                  type="button"
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                  className="p-1 hover:text-white disabled:opacity-30 rounded transition"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Send directly to printer"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Settings & Scaling Warning Banner */}
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Crucial Printing Requirement:</strong> When printing this PDF, set Paper Size to <strong>A4</strong> and Scaling to <strong>"100% / Actual Size"</strong> (Do NOT select "Fit to Printable Area").
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-amber-800">
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Paper: A4 (210×297mm)</span>
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Scale: 100%</span>
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Orientation: Portrait</span>
          </div>
        </div>

        {/* Main PDF Viewer Body */}
        <div className="flex-1 bg-slate-200/90 relative p-3 sm:p-4 overflow-hidden flex items-center justify-center">
          {viewMode === 'embedded' ? (
            <div className="w-full h-full rounded-xl overflow-hidden bg-white shadow-2xl border border-slate-300 flex flex-col">
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full border-0"
                title={filename}
              />
            </div>
          ) : (
            <div className="w-full h-full overflow-auto flex items-center justify-center relative">
              {canvasLoading && (
                <div className="flex flex-col items-center justify-center gap-3 p-8 bg-white/90 rounded-2xl shadow-lg border border-slate-200">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">Rendering A4 Claim Sheet...</p>
                    <p className="text-xs text-slate-500 mt-0.5">Generating high-precision preview</p>
                  </div>
                </div>
              )}

              {canvasError && !canvasLoading && (
                <div className="flex flex-col items-center justify-center gap-3 p-8 bg-white rounded-2xl shadow-lg border border-rose-200 max-w-md text-center">
                  <AlertTriangle className="w-8 h-8 text-rose-600" />
                  <p className="text-sm font-bold text-rose-800">Canvas Rendering Note</p>
                  <p className="text-xs text-slate-600">Switching back to standard embedded PDF viewer.</p>
                  <button
                    onClick={() => setViewMode('embedded')}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View in Embedded PDF Engine</span>
                  </button>
                </div>
              )}

              <div className={`transition-opacity duration-200 ${canvasLoading ? 'opacity-0' : 'opacity-100'}`}>
                <canvas
                  ref={canvasRef}
                  className="bg-white shadow-2xl rounded-xs border border-slate-300 mx-auto"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Footer Actions */}
        <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Rendered with exact coordinates on official template background.</span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline text-slate-400">
              {viewMode === 'embedded' ? 'Native Vector Engine' : `Page ${pageNumber} of ${numPages}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onSaveClaim && (
              <button
                onClick={onSaveClaim}
                disabled={isSaved}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  isSaved
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSaved ? 'Claim Saved to History' : 'Save to Claim History'}</span>
              </button>
            )}

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download A4 PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
