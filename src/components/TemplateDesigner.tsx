import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Save,
  RotateCcw,
  Download,
  FileUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Move,
  Type,
  Printer,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sliders,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Table as TableIcon,
} from 'lucide-react';
import {
  ClaimRecord,
  FieldConfig,
  FontFamily,
  TemplateConfig,
  TextAlignment,
} from '../types';
import {
  getActiveTemplate,
  saveTemplate,
  resetTemplateToDefault,
  getSettings,
} from '../utils/storage';
import { generateOvertimePdf, printPdfDocument } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { useAuth } from '../context/AuthContext';
import { Lock, ShieldAlert } from 'lucide-react';

const MM_TO_PX_BASE = 3.779527559; // at 100% zoom (96 DPI standard)

export const TemplateDesigner: React.FC = () => {
  const { isAdmin } = useAuth();
  const [template, setTemplate] = useState<TemplateConfig>(getActiveTemplate());
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    template.fields[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<'fields' | 'table' | 'printer'>('fields');
  const [zoom, setZoom] = useState<number>(0.75); // 75% default for desktop viewport
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showBoundaries, setShowBoundaries] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<number>(1); // 1 mm snap (0 = disabled)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [testPdfUrl, setTestPdfUrl] = useState<string | null>(null);
  const [isTestPdfOpen, setIsTestPdfOpen] = useState<boolean>(false);

  // Dragging state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [dragStartMm, setDragStartMm] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fieldStartMm, setFieldStartMm] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  // Currently selected field
  const selectedField = template.fields.find(f => f.id === selectedFieldId) || null;

  // Save changes
  const handleSave = () => {
    saveTemplate(template);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Reset to default standard template
  const handleReset = () => {
    if (window.confirm('Reset template to standard official overtime form? Any unsaved custom adjustments will be discarded.')) {
      const reset = resetTemplateToDefault();
      setTemplate(reset);
      setSelectedFieldId(reset.fields[0]?.id || null);
    }
  };

  // Upload custom template file (image or PDF)
  const handleTemplateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      setTemplate(prev => ({
        ...prev,
        backgroundImageUrl: result,
        backgroundType: isPdf ? 'pdf' : 'image',
        updatedAt: new Date().toISOString(),
      }));
    };

    reader.readAsDataURL(file);
  };

  // Export template configuration as JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${template.name.replace(/\s+/g, '_')}_config.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import template configuration from JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.fields && parsed.pageSize) {
          setTemplate(parsed);
          saveTemplate(parsed);
          setSelectedFieldId(parsed.fields[0]?.id || null);
          alert('Template configuration imported successfully!');
        } else {
          alert('Invalid template JSON file.');
        }
      } catch (err) {
        alert('Could not parse JSON template file.');
      }
    };
    reader.readAsText(file);
  };

  // Update selected field property
  const updateFieldProperty = (prop: keyof FieldConfig, value: any) => {
    if (!selectedFieldId) return;

    setTemplate(prev => ({
      ...prev,
      fields: prev.fields.map(f => {
        if (f.id === selectedFieldId) {
          return { ...f, [prop]: value };
        }
        return f;
      }),
    }));
  };

  // Add new dynamic field
  const handleAddField = () => {
    const newId = 'custom_' + Date.now();
    const newField: FieldConfig = {
      id: newId,
      name: 'Custom Field',
      key: 'custom_' + Math.random().toString(36).substring(2, 6),
      type: 'text',
      x: 30,
      y: 100,
      width: 50,
      height: 5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: 'Sample Value',
    };

    setTemplate(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
    setActiveTab('fields');
  };

  // Delete field
  const handleDeleteField = (id: string) => {
    if (template.fields.length <= 1) {
      alert('Cannot delete the last remaining field.');
      return;
    }
    setTemplate(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== id),
    }));
    if (selectedFieldId === id) {
      setSelectedFieldId(template.fields.find(f => f.id !== id)?.id || null);
    }
  };

  // Mouse drag handling for positioning fields
  const handleFieldMouseDown = (e: React.MouseEvent, field: FieldConfig) => {
    e.stopPropagation();
    setSelectedFieldId(field.id);
    setIsDragging(true);
    setDragFieldId(field.id);
    setFieldStartMm({ x: field.x, y: field.y });

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const currentXMm = (e.clientX - rect.left) / (MM_TO_PX_BASE * zoom);
      const currentYMm = (e.clientY - rect.top) / (MM_TO_PX_BASE * zoom);
      setDragStartMm({ x: currentXMm, y: currentYMm });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragFieldId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseXMm = (e.clientX - rect.left) / (MM_TO_PX_BASE * zoom);
    const mouseYMm = (e.clientY - rect.top) / (MM_TO_PX_BASE * zoom);

    const deltaX = mouseXMm - dragStartMm.x;
    const deltaY = mouseYMm - dragStartMm.y;

    let nextX = fieldStartMm.x + deltaX;
    let nextY = fieldStartMm.y + deltaY;

    // Apply grid snap
    if (gridSnap > 0) {
      nextX = Math.round(nextX / gridSnap) * gridSnap;
      nextY = Math.round(nextY / gridSnap) * gridSnap;
    }

    // Keep within A4 bounds (210 x 297 mm)
    nextX = Math.max(0, Math.min(205, parseFloat(nextX.toFixed(1))));
    nextY = Math.max(0, Math.min(292, parseFloat(nextY.toFixed(1))));

    setTemplate(prev => ({
      ...prev,
      fields: prev.fields.map(f => {
        if (f.id === dragFieldId) {
          return { ...f, x: nextX, y: nextY };
        }
        return f;
      }),
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragFieldId(null);
  };

  // Test Print / PDF generation
  const handleTestPrint = async () => {
    const settings = getSettings();
    const testClaim: ClaimRecord = {
      id: 'test_claim',
      userId: 'usr_test',
      claimNumber: 'CLM-TEST-001',
      employeeId: 'emp_test',
      employeeName: 'Dasun Ramasingha',
      employeeNumber: 'EMP-4892',
      designation: 'Senior Technical Officer',
      branch: 'Headquarters',
      department: 'IT & Infrastructure Operations',
      claimType: 'OT',
      month: 'March',
      year: 2026,
      claimDate: '2026-03-25',
      rows: [
        {
          id: 't-1',
          date: '2026-03-02',
          dayOfWeek: 'Mon',
          startTime: '08:00',
          endTime: '19:45',
          breakMinutes: 0,
          isOvernight: false,
          totalWorkMinutes: 705,
          rawOtMinutes: 180,
          totalMinutes: 180,
          totalFormatted: '03:00',
          reason: 'Infrastructure calibration & security verification test',
        },
        {
          id: 't-2',
          date: '2026-03-05',
          dayOfWeek: 'Thu',
          startTime: '08:00',
          endTime: '19:45',
          breakMinutes: 0,
          isOvernight: false,
          totalWorkMinutes: 705,
          rawOtMinutes: 180,
          totalMinutes: 180,
          totalFormatted: '03:00',
          reason: 'Emergency database failover validation check',
        },
      ],
      totalMinutes: 360,
      totalHoursFormatted: '06:00',
      totalDecimalHours: 6.0,
      otDaysCount: 2,
      status: 'completed' as const,
      templateId: template.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const { url } = await generateOvertimePdf(
        testClaim,
        template,
        settings.globalPrinterOffsetX,
        settings.globalPrinterOffsetY
      );
      setTestPdfUrl(url);
      setIsTestPdfOpen(true);
    } catch (err: any) {
      alert('Error generating test PDF: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 pb-16">
      {/* Non-Admin Notice */}
      {!isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>View-Only Mode:</strong> Only administrators can edit template coordinates, calibrate printer margins, or upload new blank form backgrounds.
            </span>
          </div>
          <span className="font-semibold text-[11px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
            Admin Required
          </span>
        </div>
      )}

      {/* Top Studio Toolbar */}
      <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Template Designer &amp; Calibration
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                A4 Millimeter Precision
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upload your company&apos;s blank overtime form, drag fields into position, and calibrate printer margins in millimeters.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition"
                title="Upload scanned official form (PNG/JPG/PDF)"
              >
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>Upload Blank Form</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleTemplateFileUpload}
            />

            {isAdmin && (
              <button
                onClick={handleAddField}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Add Field</span>
              </button>
            )}

            <button
              onClick={handleTestPrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition"
              title="Generate a sample PDF to check alignment"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Test Print</span>
            </button>

            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium transition"
              title="Export configuration as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => jsonImportRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium transition"
                  title="Import JSON template"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Import</span>
                </button>
                <input
                  ref={jsonImportRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportJson}
                />

                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium transition"
                  title="Reset to default official form"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>

                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </>
            )}
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Template coordinates and printer offsets saved successfully!</span>
          </div>
        )}
      </div>

      {/* Main Designer Grid: Canvas (Left) + Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Visual Canvas & Rulers (Cols 7 or 8) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-center">
          {/* Canvas Controls Header */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 mb-2 bg-white rounded-xl border border-slate-200 text-xs text-slate-600">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Zoom:</span>
              <button
                onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] font-bold">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(2.0, parseFloat((z + 0.25).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(0.75)}
                className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded"
              >
                Reset
              </button>
            </div>

            {/* Visual Toggles */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBoundaries}
                  onChange={e => setShowBoundaries(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="text-[11px]">Show Boxes</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRulers}
                  onChange={e => setShowRulers(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="text-[11px]">Rulers (mm)</span>
              </label>

              {/* Grid Snap selector */}
              <div className="flex items-center gap-1">
                <Grid className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={gridSnap}
                  onChange={e => setGridSnap(parseFloat(e.target.value))}
                  className="rounded border border-slate-200 bg-white py-0.5 px-1.5 text-[11px] text-slate-700"
                >
                  <option value="0">Snap: Off</option>
                  <option value="0.5">Snap: 0.5mm</option>
                  <option value="1">Snap: 1mm</option>
                  <option value="2">Snap: 2mm</option>
                </select>
              </div>
            </div>
          </div>

          {/* Scrollable Canvas Viewport */}
          <div className="w-full overflow-auto max-h-[80vh] p-4 bg-slate-200/80 rounded-2xl border border-slate-300 flex justify-center items-start">
            <div className="relative flex flex-col items-start select-none">
              {/* Top Millimeter Ruler */}
              {showRulers && (
                <div
                  style={{
                    width: `${210 * MM_TO_PX_BASE * zoom}px`,
                    height: '24px',
                    marginLeft: '24px', // offset for left ruler
                  }}
                  className="relative bg-slate-800 text-slate-300 text-[9px] font-mono border-b border-slate-700 overflow-hidden"
                >
                  {Array.from({ length: 22 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${i * 10 * MM_TO_PX_BASE * zoom}px`,
                        top: 0,
                        bottom: 0,
                      }}
                      className="border-l border-slate-600 pl-0.5 pt-0.5"
                    >
                      {i * 10}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-start">
                {/* Left Millimeter Ruler */}
                {showRulers && (
                  <div
                    style={{
                      width: '24px',
                      height: `${297 * MM_TO_PX_BASE * zoom}px`,
                    }}
                    className="relative bg-slate-800 text-slate-300 text-[9px] font-mono border-r border-slate-700 shrink-0 overflow-hidden"
                  >
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          top: `${i * 10 * MM_TO_PX_BASE * zoom}px`,
                          left: 0,
                          right: 0,
                        }}
                        className="border-t border-slate-600 pl-0.5"
                      >
                        {i * 10}
                      </div>
                    ))}
                  </div>
                )}

                {/* A4 Sheet Container */}
                <div
                  ref={canvasRef}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{
                    width: `${210 * MM_TO_PX_BASE * zoom}px`,
                    height: `${297 * MM_TO_PX_BASE * zoom}px`,
                  }}
                  className="relative bg-white shadow-2xl overflow-hidden cursor-crosshair"
                >
                  {/* Background Template Layer */}
                  {template.backgroundImageUrl && (
                    <img
                      src={template.backgroundImageUrl}
                      alt="Blank Official Overtime Claim Form"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}

                  {/* Dynamic Table Rows Visual Highlight (if enabled) */}
                  {template.tableConfig?.enabled && (
                    <div className="pointer-events-none">
                      {Array.from({ length: 4 }).map((_, idx) => {
                        const rowYMm = template.tableConfig.startY + idx * template.tableConfig.rowHeight;
                        const rowYPx = rowYMm * MM_TO_PX_BASE * zoom;
                        return (
                          <div
                            key={idx}
                            style={{
                              position: 'absolute',
                              top: `${rowYPx}px`,
                              left: `${16 * MM_TO_PX_BASE * zoom}px`,
                              width: `${178 * MM_TO_PX_BASE * zoom}px`,
                              height: `${template.tableConfig.rowHeight * MM_TO_PX_BASE * zoom}px`,
                            }}
                            className="border border-indigo-400/40 bg-indigo-500/5 text-[9px] font-mono text-indigo-700/60 pl-1"
                          >
                            Row {idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Dynamic Field Pins / Boxes */}
                  {template.fields.map(field => {
                    const isSelected = field.id === selectedFieldId;
                    const leftPx = field.x * MM_TO_PX_BASE * zoom;
                    const topPx = field.y * MM_TO_PX_BASE * zoom;
                    const widthPx = field.width * MM_TO_PX_BASE * zoom;
                    const heightPx = Math.max(16, field.height * MM_TO_PX_BASE * zoom);

                    if (!field.isVisible) return null;

                    return (
                      <div
                        key={field.id}
                        onMouseDown={e => handleFieldMouseDown(e, field)}
                        style={{
                          position: 'absolute',
                          left: `${leftPx}px`,
                          top: `${topPx}px`,
                          width: `${widthPx}px`,
                          minHeight: `${heightPx}px`,
                          fontSize: `${Math.max(8, field.fontSize * zoom * 1.3)}px`,
                          textAlign: field.alignment,
                          fontWeight: field.isBold ? 'bold' : 'normal',
                          fontFamily: field.fontFamily === 'Courier' ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif',
                        }}
                        className={`group cursor-move transition-shadow ${
                          isSelected
                            ? 'ring-2 ring-indigo-600 bg-indigo-500/20 z-30 shadow-md'
                            : showBoundaries
                            ? 'border border-dashed border-blue-400 bg-blue-500/10 hover:border-indigo-500 hover:bg-indigo-500/15 z-10'
                            : 'hover:border hover:border-indigo-400 z-10'
                        }`}
                      >
                        {/* Field Badge Label */}
                        <div
                          className={`absolute -top-4 left-0 px-1 py-0.2 rounded text-[8px] font-mono font-bold uppercase tracking-wider whitespace-nowrap pointer-events-none ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800/80 text-white opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {field.name} ({field.x.toFixed(1)}, {field.y.toFixed(1)}mm)
                        </div>

                        {/* Sample Value Display */}
                        <div className="truncate px-0.5 leading-tight text-slate-900 pointer-events-none">
                          {field.sampleValue || field.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Field Property Inspector & Settings (Cols 5 or 4) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Sub tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setActiveTab('fields')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'fields'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Field Properties
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'table'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Table Calibration
            </button>
            <button
              onClick={() => setActiveTab('printer')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'printer'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Printer Offset
            </button>
          </div>

          {/* TAB 1: FIELD PROPERTIES */}
          {activeTab === 'fields' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4">
              {/* Field Selector Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Select Field to Calibrate
                </label>
                <select
                  value={selectedFieldId || ''}
                  onChange={e => setSelectedFieldId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {template.fields.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.x.toFixed(1)}mm, {f.y.toFixed(1)}mm)
                    </option>
                  ))}
                </select>
              </div>

              {selectedField ? (
                <div className="space-y-3.5 text-xs">
                  {/* Field Label & Key */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Field Name</label>
                      <input
                        type="text"
                        value={selectedField.name}
                        onChange={e => updateFieldProperty('name', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Data Key</label>
                      <input
                        type="text"
                        value={selectedField.key}
                        onChange={e => updateFieldProperty('key', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-800 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Millimeter Coordinates with Steppers */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                      Millimeter Coordinates (A4)
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-slate-500 text-[11px] mb-1">
                          <span>X Position (from left)</span>
                          <span className="font-mono font-bold text-indigo-600">{selectedField.x.toFixed(1)} mm</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateFieldProperty('x', Math.max(0, parseFloat((selectedField.x - 0.5).toFixed(1))))}
                            className="px-2 py-1 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.5"
                            value={selectedField.x}
                            onChange={e => updateFieldProperty('x', parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-center font-mono"
                          />
                          <button
                            onClick={() => updateFieldProperty('x', Math.min(210, parseFloat((selectedField.x + 0.5).toFixed(1))))}
                            className="px-2 py-1 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-500 text-[11px] mb-1">
                          <span>Y Position (from top)</span>
                          <span className="font-mono font-bold text-indigo-600">{selectedField.y.toFixed(1)} mm</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateFieldProperty('y', Math.max(0, parseFloat((selectedField.y - 0.5).toFixed(1))))}
                            className="px-2 py-1 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.5"
                            value={selectedField.y}
                            onChange={e => updateFieldProperty('y', parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-center font-mono"
                          />
                          <button
                            onClick={() => updateFieldProperty('y', Math.min(297, parseFloat((selectedField.y + 0.5).toFixed(1))))}
                            className="px-2 py-1 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Width & Height */}
                    <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Width (mm)</label>
                        <input
                          type="number"
                          step="1"
                          value={selectedField.width}
                          onChange={e => updateFieldProperty('width', parseFloat(e.target.value) || 10)}
                          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Height (mm)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={selectedField.height}
                          onChange={e => updateFieldProperty('height', parseFloat(e.target.value) || 4)}
                          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Typography & Styling */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Font Size (pt)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedField.fontSize}
                        onChange={e => updateFieldProperty('fontSize', parseFloat(e.target.value) || 9)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Font Family</label>
                      <select
                        value={selectedField.fontFamily}
                        onChange={e => updateFieldProperty('fontFamily', e.target.value as FontFamily)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 bg-white"
                      >
                        <option value="Helvetica">Helvetica (Standard)</option>
                        <option value="TimesRoman">Times Roman</option>
                        <option value="Courier">Courier (Monospace)</option>
                      </select>
                    </div>
                  </div>

                  {/* Alignment & Weight */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Text Alignment</label>
                      <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                        {(['left', 'center', 'right'] as TextAlignment[]).map(align => (
                          <button
                            key={align}
                            onClick={() => updateFieldProperty('alignment', align)}
                            className={`flex-1 py-1 text-[11px] font-semibold rounded capitalize ${
                              selectedField.alignment === align
                                ? 'bg-white text-indigo-600 shadow-xs'
                                : 'text-slate-600'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Font Weight</label>
                      <button
                        onClick={() => updateFieldProperty('isBold', !selectedField.isBold)}
                        className={`w-full py-1.5 px-3 rounded-lg border text-xs font-bold transition ${
                          selectedField.isBold
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'border-slate-200 text-slate-600 bg-white'
                        }`}
                      >
                        {selectedField.isBold ? 'Bold' : 'Regular'}
                      </button>
                    </div>
                  </div>

                  {/* Sample Value */}
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Sample Value for Preview</label>
                    <input
                      type="text"
                      value={selectedField.sampleValue || ''}
                      onChange={e => updateFieldProperty('sampleValue', e.target.value)}
                      placeholder="e.g. Dasun Ramasingha"
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>

                  {/* Visibility & Delete */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <button
                      onClick={() => updateFieldProperty('isVisible', !selectedField.isVisible)}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                    >
                      {selectedField.isVisible ? (
                        <>
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Visible</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>Hidden</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteField(selectedField.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Field</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Click on any field on the template canvas to select and calibrate it.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TABLE CALIBRATION */}
          {activeTab === 'table' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">31-Day Overtime Table Grid</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Calibrate the vertical row step and column positions to match your official paper table lines.
                </p>
              </div>

              {/* Start Y & Row Height */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Row 1 Start Y (mm)
                    </label>
                    <input
                      type="number"
                      step="0.2"
                      value={template.tableConfig.startY}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          tableConfig: {
                            ...prev.tableConfig,
                            startY: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Row Height Step (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={template.tableConfig.rowHeight}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          tableConfig: {
                            ...prev.tableConfig,
                            rowHeight: parseFloat(e.target.value) || 5,
                          },
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Max Rows
                    </label>
                    <input
                      type="number"
                      value={template.tableConfig.maxRows}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          tableConfig: {
                            ...prev.tableConfig,
                            maxRows: parseInt(e.target.value, 10) || 31,
                          },
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Table Font Size (pt)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={template.tableConfig.fontSize}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          tableConfig: {
                            ...prev.tableConfig,
                            fontSize: parseFloat(e.target.value) || 8,
                          },
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Columns X positioning */}
              <div>
                <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                  Column Positions (X in mm)
                </span>
                <div className="space-y-2">
                  {Object.entries(template.tableConfig.columns).map(([colKey, colVal]) => (
                    <div
                      key={colKey}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                        {colKey}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">X:</span>
                        <input
                          type="number"
                          step="0.5"
                          value={colVal.x}
                          onChange={e => {
                            const newX = parseFloat(e.target.value) || 0;
                            setTemplate(prev => ({
                              ...prev,
                              tableConfig: {
                                ...prev.tableConfig,
                                columns: {
                                  ...prev.tableConfig.columns,
                                  [colKey]: { ...colVal, x: newX },
                                },
                              },
                            }));
                          }}
                          className="w-16 rounded border border-slate-300 px-1 py-0.5 text-center font-mono text-[11px] bg-white"
                        />
                        <span className="text-[10px] text-slate-400">W:</span>
                        <input
                          type="number"
                          step="0.5"
                          value={colVal.width}
                          onChange={e => {
                            const newW = parseFloat(e.target.value) || 10;
                            setTemplate(prev => ({
                              ...prev,
                              tableConfig: {
                                ...prev.tableConfig,
                                columns: {
                                  ...prev.tableConfig.columns,
                                  [colKey]: { ...colVal, width: newW },
                                },
                              },
                            }));
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5 text-center font-mono text-[11px] bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRINTER CALIBRATION */}
          {activeTab === 'printer' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Printer Alignment Offsets</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Some physical laser and inkjet printers shift margins by 1–3 mm. Adjust global offsets here to calibrate the output to your exact office printer tray.
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <Printer className="w-4 h-4 text-amber-700" />
                  <span>Calibration Instructions:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                  <li>Click &quot;Test Print&quot; to print a test page on your office paper.</li>
                  <li>Hold the printed sheet up to the light over your official blank form.</li>
                  <li>If text is 2mm too far to the right, enter <strong>-2.0</strong> in Horizontal Offset.</li>
                  <li>If text is 1mm too low, enter <strong>-1.0</strong> in Vertical Offset.</li>
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Horizontal Offset (X mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={template.printerOffsetX}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        printerOffsetX: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                  />
                  <span className="block text-[10px] text-slate-400 mt-1 text-center">
                    + = right, - = left
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vertical Offset (Y mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={template.printerOffsetY}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        printerOffsetY: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                  />
                  <span className="block text-[10px] text-slate-400 mt-1 text-center">
                    + = down, - = up
                  </span>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs transition"
              >
                Save Calibration Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Test Print Preview Modal */}
      <PDFPreviewModal
        isOpen={isTestPdfOpen}
        onClose={() => setIsTestPdfOpen(false)}
        pdfUrl={testPdfUrl}
        filename={`Alignment_Test_${template.name.replace(/\s+/g, '_')}.pdf`}
      />
    </div>
  );
};
