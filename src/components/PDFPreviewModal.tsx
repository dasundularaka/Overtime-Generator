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
  ExternalLink,
  Cloud,
  Check,
  RefreshCw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { printPdfDocument } from '../utils/pdfGenerator';
import {
  uploadClaimPdfToGoogleDrive,
  GoogleDriveUploadResult,
  ensureGoogleAccessToken,
  hasGoogleWorkspaceToken,
} from '../services/googleWorkspaceService';

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
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  filename,
  pdfBlob,
  onSaveClaim,
  isSaved,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<'embedded' | 'gdrive' | 'canvas'>('embedded');
  const [numPages, setNumPages] = useState<number>(1);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [canvasLoading, setCanvasLoading] = useState<boolean>(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const pdfDocRef = useRef<any>(null);

  // Google Drive State
  const [driveResult, setDriveResult] = useState<GoogleDriveUploadResult | null>(null);
  const [isDriveUploading, setIsDriveUploading] = useState<boolean>(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState<boolean>(false);

  // Helper to obtain the PDF blob
  const getBlob = async (): Promise<Blob> => {
    if (pdfBlob) return pdfBlob;
    if (!pdfUrl) throw new Error('No PDF URL available');
    const resp = await fetch(pdfUrl);
    return await resp.blob();
  };

  // Upload to Google Drive and generate in-site preview
  const handleUploadToGoogleDrive = async () => {
    setIsDriveUploading(true);
    setDriveError(null);
    setDriveNotice(null);
    try {
      const blob = await getBlob();
      const result = await uploadClaimPdfToGoogleDrive(blob, filename);
      setDriveResult(result);
      setViewMode('gdrive');
    } catch (err: any) {
      console.warn('Google Drive preview upload note:', err?.message);
      const is403 = err?.message?.includes('403') || err?.message?.includes('not been used') || err?.message?.includes('disabled');
      const friendlyMsg = is403
        ? 'Preview through Google Drive is supported for self-registered Google accounts with Drive API enabled. Showing built-in PDF viewer.'
        : (err.message || 'Drive preview unavailable. Showing built-in PDF viewer.');
      setDriveNotice(friendlyMsg);
      // Seamlessly fall back to embedded viewer so the user is never blocked!
      setViewMode('embedded');
    } finally {
      setIsDriveUploading(false);
    }
  };

  // Connect Google account and immediately upload
  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    setDriveError(null);
    try {
      await ensureGoogleAccessToken();
      await handleUploadToGoogleDrive();
    } catch (err: any) {
      setDriveError(err.message || 'Google authentication was not completed.');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

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
          setViewMode('embedded');
        }
      }
    };

    loadAndRenderPdf();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, pdfUrl, viewMode, pageNumber, scale]);

  // When modal opens, if user already has an active Google token, automatically upload to Drive if not already done
  useEffect(() => {
    if (isOpen && pdfUrl && !driveResult && !isDriveUploading) {
      if (hasGoogleWorkspaceToken()) {
        handleUploadToGoogleDrive();
      }
    }
  }, [isOpen, pdfUrl]);

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
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md">
                {filename}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>Official A4 Print-Ready Document</span>
                {driveResult && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <Check className="w-3 h-3" />
                    Google Drive Synced
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs text-slate-300 mr-1">
              {/* Google Drive Preview Switch */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('gdrive');
                  if (!driveResult && !isDriveUploading) {
                    handleUploadToGoogleDrive();
                  }
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'gdrive'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'hover:text-white hover:bg-slate-700/60'
                }`}
                title="Preview using Google Drive facility"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 87.3 78" fill="currentColor">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" fill="#0066da" />
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.35-1.2 2.9-1.2 4.45h27.5z" fill="#00ac47" />
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335" />
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
                <span>Google Drive Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('embedded')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                  viewMode === 'embedded' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-white'
                }`}
                title="Browser Native PDF Engine"
              >
                <FileText className="w-3 h-3" />
                <span>PDF Viewer</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('canvas')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                  viewMode === 'canvas' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-white'
                }`}
                title="High-Res Canvas Rendering"
              >
                <Layers className="w-3 h-3" />
                <span>Canvas</span>
              </button>
            </div>

            {/* External Google Drive Link if uploaded */}
            {driveResult && (
              <a
                href={driveResult.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 hover:text-white text-xs font-semibold border border-blue-500/30 transition cursor-pointer"
                title="Open file in Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Drive</span>
              </a>
            )}

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
              <span>Download</span>
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
              <strong>Crucial Printing Requirement:</strong> When printing this PDF, set Paper Size to <strong>A4</strong> and Scaling to <strong>"100% / Actual Size"</strong>.
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-amber-800">
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Paper: A4</span>
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Scale: 100%</span>
            <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono">Portrait</span>
          </div>
        </div>

        {/* Informative Google Drive Notice Banner */}
        {driveNotice && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 text-xs text-blue-900 shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{driveNotice}</span>
            </div>
            <button
              onClick={() => setDriveNotice(null)}
              className="text-blue-500 hover:text-blue-800 p-0.5 rounded hover:bg-blue-100"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Viewer Body */}
        <div className="flex-1 bg-slate-200/90 relative p-3 sm:p-4 overflow-hidden flex items-center justify-center">
          {viewMode === 'gdrive' ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative">
              {/* If uploaded, show in-site Google Drive iframe preview */}
              {driveResult && !isDriveUploading ? (
                <div className="w-full h-full rounded-xl overflow-hidden bg-white shadow-2xl border border-slate-300 flex flex-col relative">
                  <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-xs text-slate-600 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-semibold text-slate-800">Google Drive Embedded Preview Facility</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={driveResult.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                      >
                        <span>Open full document in Google Drive</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <iframe
                    src={driveResult.previewUrl}
                    className="w-full h-full border-0 bg-white"
                    title={`Google Drive In-Site Preview - ${filename}`}
                    allow="autoplay; encrypted-media; fullscreen"
                  />
                </div>
              ) : isDriveUploading ? (
                /* Uploading to Google Drive loading screen */
                <div className="flex flex-col items-center justify-center gap-4 p-8 bg-white/95 rounded-2xl shadow-xl border border-slate-200 max-w-md text-center">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    <Cloud className="w-4 h-4 text-blue-500 absolute inset-0 m-auto" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Preparing Google Drive In-Site Preview</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Uploading print-ready A4 PDF to Google Drive facility to enable full in-site vector preview...
                    </p>
                  </div>
                </div>
              ) : driveError ? (
                /* Drive Error State */
                <div className="flex flex-col items-center justify-center gap-4 p-6 sm:p-8 bg-white rounded-2xl shadow-xl border border-blue-200 max-w-md text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Google Drive Facility</h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Preview through Google Drive is supported for self-registered Google accounts with Drive permissions enabled. You can continue viewing via the high-fidelity built-in PDF viewer.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full pt-2">
                    <button
                      onClick={() => setViewMode('embedded')}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Use Built-in PDF Viewer</span>
                    </button>
                    <button
                      onClick={handleConnectGoogle}
                      disabled={isConnectingGoogle}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                    >
                      {isConnectingGoogle ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3.5 h-3.5" />
                          <span>Retry Account Sign-in</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Unconnected state: Provide 1-click Google Drive preview button */
                <div className="flex flex-col items-center justify-center gap-5 p-8 bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 shadow-inner">
                    <svg className="w-8 h-8" viewBox="0 0 87.3 78" fill="currentColor">
                      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" fill="#0066da" />
                      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.35-1.2 2.9-1.2 4.45h27.5z" fill="#00ac47" />
                      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335" />
                      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      Enable Google Drive Facility for In-Site Preview
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Connect your Google Drive to render instant, interactive in-site previews of your generated claim forms with zoom, page navigation, and cloud backup.
                    </p>
                  </div>

                  {/* Official Google Sign-In Button */}
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    className="flex items-center justify-center gap-3 w-full max-w-xs py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-sm transition hover:shadow cursor-pointer"
                  >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>{isConnectingGoogle ? 'Connecting Google Drive...' : 'Connect with Google Drive'}</span>
                  </button>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Or</span>
                    <button
                      onClick={() => setViewMode('embedded')}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                    >
                      use standard browser viewer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'embedded' ? (
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
                  <p className="text-xs text-slate-600">Switching back to Google Drive facility or embedded PDF viewer.</p>
                  <button
                    onClick={() => setViewMode('gdrive')}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition cursor-pointer"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>View in Google Drive Facility</span>
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
          <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
            <span>Rendered with exact coordinates on official template background.</span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline text-slate-400">
              {viewMode === 'gdrive'
                ? driveResult
                  ? 'Google Drive Cloud Engine'
                  : 'Google Drive Facility'
                : viewMode === 'embedded'
                ? 'Native Vector Engine'
                : `Page ${pageNumber} of ${numPages}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Save to Drive button if not yet uploaded */}
            {!driveResult && (
              <button
                type="button"
                onClick={handleUploadToGoogleDrive}
                disabled={isDriveUploading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition cursor-pointer"
              >
                {isDriveUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>Sync to Google Drive</span>
              </button>
            )}

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
