import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  RotateCw,
  Maximize2,
  RefreshCw,
  FileText,
  Layers,
  Loader2,
  Check,
  Cloud,
  Maximize,
  Minimize,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { printPdfDocument } from '../utils/pdfGenerator';
import {
  uploadClaimPdfToGoogleDrive,
  hasGoogleWorkspaceToken,
  ensureGoogleAccessToken,
} from '../services/googleWorkspaceService';

// Configure PDF.js worker
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
  pdfBlob?: Blob | null;
  onSaveClaim?: () => void;
  isSaved?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  filename,
  pdfBlob,
  onSaveClaim,
  isSaved,
  onRefresh,
  isRefreshing = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Viewer State
  const [engineMode, setEngineMode] = useState<'canvas' | 'native'>('canvas');
  const [numPages, setNumPages] = useState<number>(1);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.15);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [localRefreshTick, setLocalRefreshTick] = useState<number>(0);

  // Optional Cloud Backup state (without replacing the in-site viewer)
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [driveUploadSuccess, setDriveUploadSuccess] = useState<boolean>(false);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);

  // Helper to obtain the PDF binary array buffer
  const getArrayBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (pdfBlob) {
      return await pdfBlob.arrayBuffer();
    }
    if (!pdfUrl) {
      throw new Error('No PDF URL or Blob provided for rendering');
    }
    // Append timestamp cache-buster to prevent any browser HTTP caching
    const fetchUrl = pdfUrl.startsWith('blob:') ? pdfUrl : `${pdfUrl}?t=${Date.now()}`;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) {
      throw new Error(`Failed to load PDF (${resp.status})`);
    }
    return await resp.arrayBuffer();
  }, [pdfBlob, pdfUrl]);

  // Render the current page on canvas via PDF.js
  const renderPage = useCallback(async () => {
    if (!isOpen || !pdfUrl || engineMode !== 'canvas') return;

    setLoading(true);
    setRenderError(null);

    try {
      const buffer = await getArrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const doc = await loadingTask.promise;

      setNumPages(doc.numPages);
      const safePage = Math.min(Math.max(1, pageNumber), doc.numPages);
      const page = await doc.getPage(safePage);

      const canvas = canvasRef.current;
      if (!canvas) {
        setLoading(false);
        return;
      }

      // Cancel previous ongoing render task if any
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }

      const viewport = page.getViewport({ scale, rotation });
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1.5 : 1.5, 2.5);

      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire 2D canvas context');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: page.getViewport({ scale: scale * dpr, rotation }),
        canvas: canvas,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      setLoading(false);
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') {
        return;
      }
      console.warn('PDF.js canvas rendering notice:', err?.message || err);
      setRenderError(err?.message || 'Could not render PDF with interactive engine.');
      setLoading(false);
    }
  }, [isOpen, pdfUrl, engineMode, pageNumber, scale, rotation, getArrayBuffer]);

  // Trigger render on dependency changes
  useEffect(() => {
    if (isOpen && pdfUrl) {
      renderPage();
    }
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [isOpen, pdfUrl, pdfBlob, pageNumber, scale, rotation, engineMode, localRefreshTick, renderPage]);

  // Reset page when document changes
  useEffect(() => {
    setPageNumber(1);
    setDriveUploadSuccess(false);
    setDriveUploadError(null);
  }, [pdfUrl, pdfBlob]);

  // Auto-fit scale on first open based on container dimensions
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48;
      // Standard A4 aspect ratio width ~595pt
      if (containerWidth > 300) {
        const calculatedScale = Math.min(1.4, Math.max(0.65, containerWidth / 650));
        setScale(parseFloat(calculatedScale.toFixed(2)));
      }
    }
  }, [isOpen]);

  if (!isOpen || !pdfUrl) return null;

  // Zoom Helpers
  const handleZoomIn = () => setScale(s => Math.min(2.5, parseFloat((s + 0.15).toFixed(2))));
  const handleZoomOut = () => setScale(s => Math.max(0.5, parseFloat((s - 0.15).toFixed(2))));
  const handleFitWidth = () => {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth - 48;
      setScale(parseFloat(Math.min(2.0, Math.max(0.6, w / 630)).toFixed(2)));
    }
  };
  const handleFitPage = () => {
    if (containerRef.current) {
      const h = containerRef.current.clientHeight - 80;
      setScale(parseFloat(Math.min(1.8, Math.max(0.5, h / 860)).toFixed(2)));
    }
  };
  const handleActualSize = () => setScale(1.0);
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  // Manual Refresh Handler
  const handleTriggerRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      setLocalRefreshTick(t => t + 1);
    }
  };

  // Download Handler
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = filename || 'Overtime_Claim_Form_10756.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Direct Print Handler
  const handlePrint = () => {
    printPdfDocument(pdfUrl);
  };

  // Optional Cloud Backup to Google Drive
  const handleBackupToGoogleDrive = async () => {
    setIsUploadingToDrive(true);
    setDriveUploadError(null);
    try {
      if (!hasGoogleWorkspaceToken()) {
        await ensureGoogleAccessToken();
      }
      const buffer = await getArrayBuffer();
      const blob = new Blob([buffer], { type: 'application/pdf' });
      await uploadClaimPdfToGoogleDrive(blob, filename);
      setDriveUploadSuccess(true);
      setTimeout(() => setDriveUploadSuccess(false), 5000);
    } catch (err: any) {
      setDriveUploadError(err.message || 'Google Drive backup could not be completed.');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-1 sm:p-4 backdrop-blur-xs animate-fade-in">
      <div
        className={`relative flex flex-col w-full bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'h-full max-w-full rounded-none border-0'
            : 'max-w-5xl h-[94vh]'
        }`}
      >
        {/* ======================================================== */}
        {/* Top Header Bar with Live Controls */}
        {/* ======================================================== */}
        <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-2.5 bg-slate-950 text-white border-b border-slate-800 gap-2 shrink-0">
          {/* File Title & Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-md">
                  {filename}
                </h2>
                <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Form 10756 A4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Interactive Vector PDF Preview &bull; Always Live &bull; Ready for Print &amp; Submission
              </p>
            </div>
          </div>

          {/* Center / Right Toolbar Controls */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {/* Engine Mode Toggle (PDF.js Canvas vs Native Embed) */}
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs text-slate-300">
              <button
                type="button"
                onClick={() => setEngineMode('canvas')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                  engineMode === 'canvas'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'hover:text-white hover:bg-slate-800'
                }`}
                title="Interactive High-Precision Vector Engine"
              >
                <Layers className="w-3 h-3" />
                <span className="hidden sm:inline">Interactive</span>
              </button>
              <button
                type="button"
                onClick={() => setEngineMode('native')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                  engineMode === 'native'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'hover:text-white hover:bg-slate-800'
                }`}
                title="Browser Native PDF Engine"
              >
                <FileText className="w-3 h-3" />
                <span className="hidden sm:inline">Native</span>
              </button>
            </div>

            {/* Page Navigation (if multi-page) */}
            {numPages > 1 && engineMode === 'canvas' && (
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs text-slate-300">
                <button
                  type="button"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  className="p-1 hover:text-white disabled:opacity-30 rounded transition cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-mono">
                  {pageNumber} / {numPages}
                </span>
                <button
                  type="button"
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                  className="p-1 hover:text-white disabled:opacity-30 rounded transition cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Canvas Zoom Controls (Canvas Mode) */}
            {engineMode === 'canvas' && (
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Zoom Out (-15%)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 font-mono text-[11px] w-11 text-center font-semibold">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Zoom In (+15%)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {/* Preset shortcuts on larger screens */}
                <div className="hidden lg:flex items-center border-l border-slate-800 ml-1 pl-1 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={handleFitWidth}
                    className="px-1.5 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Fit to Width"
                  >
                    Width
                  </button>
                  <button
                    type="button"
                    onClick={handleFitPage}
                    className="px-1.5 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Fit Whole Page"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={handleActualSize}
                    className="px-1.5 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Actual 100% Size (A4 Print)"
                  >
                    100%
                  </button>
                </div>
              </div>
            )}

            {/* Rotate Button (Canvas Mode) */}
            {engineMode === 'canvas' && (
              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition border border-slate-800 cursor-pointer hidden sm:block"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Live Refresh Preview Button */}
            <button
              type="button"
              onClick={handleTriggerRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Refresh preview immediately with current timesheet data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Direct Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Send directly to printer"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              title="Download official PDF to device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(f => !f)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer hidden md:block"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* Crucial Printing Requirement Banner */}
        {/* ======================================================== */}
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Crucial Printing Requirement:</strong> Set Paper Size to <strong>A4</strong> and Scaling to <strong>"100% / Actual Size"</strong> in printer dialog.
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-amber-300 font-mono">
            <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">A4 210×297mm</span>
            <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">Scale 100%</span>
            <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">Portrait</span>
          </div>
        </div>

        {/* Feedback Notices (Drive Sync or Error) */}
        {driveUploadSuccess && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Backup copy successfully synced to your Google Drive!</span>
            </div>
            <button onClick={() => setDriveUploadSuccess(false)} className="text-emerald-400 hover:text-white">✕</button>
          </div>
        )}
        {driveUploadError && (
          <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{driveUploadError}</span>
            </div>
            <button onClick={() => setDriveUploadError(null)} className="text-rose-400 hover:text-white">✕</button>
          </div>
        )}

        {/* ======================================================== */}
        {/* Main Viewer Body (Real-time Canvas or Native Embed) */}
        {/* ======================================================== */}
        <div
          ref={containerRef}
          className="flex-1 bg-slate-950/90 relative p-3 sm:p-6 overflow-auto flex items-center justify-center min-h-[300px]"
        >
          {engineMode === 'canvas' ? (
            <div className="w-full h-full flex items-center justify-center relative min-h-[350px]">
              {/* Spinner during rendering */}
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 z-10 backdrop-blur-2xs">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  <p className="text-xs font-bold text-slate-200">
                    {isRefreshing ? 'Re-generating with fresh claim data...' : 'Rendering high-precision A4 sheet...'}
                  </p>
                </div>
              )}

              {/* Render Error Fallback */}
              {renderError && !loading && (
                <div className="flex flex-col items-center justify-center gap-3 p-8 bg-slate-900 rounded-2xl border border-rose-500/30 max-w-md text-center text-white">
                  <AlertTriangle className="w-8 h-8 text-rose-400" />
                  <p className="text-sm font-bold text-rose-200">Canvas Rendering Note</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {renderError}
                  </p>
                  <button
                    onClick={() => setEngineMode('native')}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Switch to Native Browser Viewer</span>
                  </button>
                </div>
              )}

              {/* Vector Canvas Container */}
              <div
                className={`transition-opacity duration-200 flex items-center justify-center p-2 ${
                  loading ? 'opacity-40' : 'opacity-100'
                }`}
              >
                <canvas
                  ref={canvasRef}
                  className="bg-white shadow-2xl rounded-xs border border-slate-300 mx-auto transition-transform duration-100"
                />
              </div>
            </div>
          ) : (
            /* Native Browser Embed Mode */
            <div className="w-full h-full rounded-xl overflow-hidden bg-white shadow-2xl border border-slate-700 flex flex-col">
              <iframe
                key={`${pdfUrl}_${localRefreshTick}`}
                src={`${pdfUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full border-0 bg-white"
                title={`Native PDF Preview - ${filename}`}
              />
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* Bottom Footer Actions */}
        {/* ======================================================== */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-white">
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-300">Form 10756 Calibration:</span>
            <span>Accurate A4 Coordinates</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-400">
              {engineMode === 'canvas'
                ? `Vector Renderer (${Math.round(scale * 100)}%)`
                : 'Native Browser PDF Plugin'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Optional Cloud Backup Button (Clean backup without blocking preview) */}
            <button
              type="button"
              onClick={handleBackupToGoogleDrive}
              disabled={isUploadingToDrive}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="Save a backup copy to your Google Drive"
            >
              {isUploadingToDrive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="hidden sm:inline">Backup to Google Drive</span>
            </button>

            {/* Save to Claim History Button */}
            {onSaveClaim && (
              <button
                type="button"
                onClick={onSaveClaim}
                disabled={isSaved}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  isSaved
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSaved ? 'Claim Saved to History' : 'Save to Claim History'}</span>
              </button>
            )}

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
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
