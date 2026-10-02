import React from 'react';
import {
  Download,
  Printer,
  X,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { printPdfDocument } from '../utils/pdfGenerator';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-5xl h-[92vh] rounded-2xl bg-white shadow-2xl border border-slate-300 overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
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
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              title="Send directly to printer"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Settings & Scaling Warning Banner */}
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
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

        {/* Main PDF Embed Body */}
        <div className="flex-1 bg-slate-100 relative p-2 overflow-hidden flex items-center justify-center">
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0`}
            title="A4 Overtime Claim PDF Preview"
            className="w-full h-full rounded-lg shadow-inner border border-slate-300 bg-white"
          />
        </div>

        {/* Bottom Footer Actions */}
        <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Rendered with precise millimetric coordinates onto the official background template.
          </div>

          <div className="flex items-center gap-2">
            {onSaveClaim && (
              <button
                onClick={onSaveClaim}
                disabled={isSaved}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  isSaved
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSaved ? 'Claim Saved to History' : 'Save to Claim History'}</span>
              </button>
            )}

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition"
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
