import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Save,
  RotateCcw,
  Download,
  FileUp,
  ZoomIn,
  ZoomOut,
  Grid,
  Printer,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Lock,
  Layers,
  Star,
  Copy,
  AlertCircle,
  Loader2,
  FileText,
  Sliders,
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
  getSettings,
  saveSettings,
} from '../utils/storage';
import { DEFAULT_TEMPLATE } from '../utils/defaultTemplate';
import { generateOvertimePdf } from '../utils/pdfGenerator';
import { PDFPreviewModal } from './PDFPreviewModal';
import { useAuth } from '../context/AuthContext';
import {
  fetchTemplatesFromFirestore,
  saveTemplateToFirestore,
  deleteTemplateFromFirestore,
  setDefaultTemplateInFirestore,
  subscribeToTemplates,
  compressImageFile,
} from '../services/templateService';

const MM_TO_PX_BASE = 3.779527559; // at 100% zoom (96 DPI standard)

export const TemplateDesigner: React.FC = () => {
  const { currentUser, userProfile, isAdmin } = useAuth();

  // Template list from Firestore
  const [templateList, setTemplateList] = useState<TemplateConfig[]>([DEFAULT_TEMPLATE]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [template, setTemplate] = useState<TemplateConfig>(getActiveTemplate());

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    template.fields[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<'fields' | 'table' | 'printer' | 'metadata'>('fields');
  const [zoom, setZoom] = useState<number>(0.75); // 75% default for desktop viewport
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showBoundaries, setShowBoundaries] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<number>(1); // 1 mm snap (0 = disabled)

  // Cloud Save & Action State
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateDesc, setNewTemplateDesc] = useState<string>('');
  const [copyFromCurrent, setCopyFromCurrent] = useState<boolean>(true);

  // Test PDF State
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

  // Subscribe to Cloud Firestore templates
  useEffect(() => {
    // Initial fetch
    fetchTemplatesFromFirestore(isAdmin).then(templates => {
      if (templates.length > 0) {
        setTemplateList(templates);
        // Find default or first
        const activeSettingId = getSettings().activeTemplateId;
        const matching =
          templates.find(t => t.id === activeSettingId) ||
          templates.find(t => t.isDefault) ||
          templates[0];
        if (matching) {
          setCurrentTemplateId(matching.id);
          setTemplate(matching);
          setSelectedFieldId(matching.fields[0]?.id || null);
        }
      }
    });

    // Real-time updates
    const unsub = subscribeToTemplates(templates => {
      if (templates.length > 0) {
        setTemplateList(templates);
      }
    });

    return () => unsub();
  }, [isAdmin]);

  // Handle switching template from dropdown
  const handleSwitchTemplate = (id: string) => {
    const selected = templateList.find(t => t.id === id);
    if (selected) {
      setCurrentTemplateId(selected.id);
      setTemplate(selected);
      setSelectedFieldId(selected.fields[0]?.id || null);
      setSaveSuccessMsg(null);
      setSaveErrorMsg(null);
    }
  };

  // Currently selected field
  const selectedField = template.fields.find(f => f.id === selectedFieldId) || null;

  // Save current template to Cloud Firestore
  const handleSaveToCloud = async (setAsDefaultOverride?: boolean) => {
    if (!isAdmin) {
      alert('Only administrators can save templates.');
      return;
    }

    setIsSaving(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const willBeDefault =
        setAsDefaultOverride !== undefined ? setAsDefaultOverride : !!template.isDefault;

      const saved = await saveTemplateToFirestore(template, {
        setAsDefault: willBeDefault,
        userId: currentUser?.uid,
        userName: userProfile?.name || currentUser?.email || 'Admin',
      });

      setTemplate(saved);
      setSaveSuccessMsg(`Template "${saved.name}" successfully saved to Cloud Firestore! All users can now select this template.`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error saving template:', err);
      setSaveErrorMsg('Failed to save template to Cloud: ' + (err.message || 'Permission denied'));
    } finally {
      setIsSaving(false);
    }
  };

  // Set as Organization Default template
  const handleSetAsDefault = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    try {
      await setDefaultTemplateInFirestore(template.id);
      setTemplate(prev => ({ ...prev, isDefault: true }));
      setSaveSuccessMsg(`"${template.name}" is now the active default template for all users!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setSaveErrorMsg('Failed to set default template: ' + (err.message || 'Error occurred'));
    } finally {
      setIsSaving(false);
    }
  };

  // Create new template modal action
  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    setIsSaving(true);
    try {
      const base = copyFromCurrent ? template : DEFAULT_TEMPLATE;
      const newId = `tpl-${Date.now()}`;
      const newTemplate: TemplateConfig = {
        ...base,
        id: newId,
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim(),
        isDefault: false,
        updatedAt: new Date().toISOString(),
        createdBy: currentUser?.uid,
        createdByName: userProfile?.name || currentUser?.email || 'Admin',
      };

      const saved = await saveTemplateToFirestore(newTemplate, {
        setAsDefault: false,
        userId: currentUser?.uid,
        userName: userProfile?.name || currentUser?.email || 'Admin',
      });

      setTemplate(saved);
      setCurrentTemplateId(saved.id);
      setSelectedFieldId(saved.fields[0]?.id || null);
      setIsNewModalOpen(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setSaveSuccessMsg(`New template "${saved.name}" created and saved to Cloud Firestore!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setSaveErrorMsg('Failed to create new template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete current custom template
  const handleDeleteTemplate = async () => {
    if (template.id === DEFAULT_TEMPLATE.id) {
      alert('The system standard official template cannot be deleted.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the template "${template.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteTemplateFromFirestore(template.id);
      // Switch back to default
      const fallback = templateList.find(t => t.id !== template.id) || DEFAULT_TEMPLATE;
      setTemplate(fallback);
      setCurrentTemplateId(fallback.id);
      setSelectedFieldId(fallback.fields[0]?.id || null);
      setSaveSuccessMsg(`Template removed successfully.`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setSaveErrorMsg('Failed to delete template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default standard template
  const handleResetToStandard = () => {
    if (window.confirm('Reset this template layout to the standard official overtime form? Any unsaved custom coordinates will be discarded.')) {
      setTemplate(prev => ({
        ...DEFAULT_TEMPLATE,
        id: prev.id,
        name: prev.name,
        isDefault: prev.isDefault,
        updatedAt: new Date().toISOString(),
      }));
      setSelectedFieldId(DEFAULT_TEMPLATE.fields[0]?.id || null);
    }
  };

  // Upload custom template file (image or PDF) with automatic compression
  const handleTemplateFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let resultDataUrl: string;

      if (!isPdf && file.type.startsWith('image/')) {
        // Compress image to ensure it easily fits within Firestore's limits (< 350KB)
        resultDataUrl = await compressImageFile(file, 1600);
      } else {
        resultDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      setTemplate(prev => ({
        ...prev,
        backgroundImageUrl: resultDataUrl,
        backgroundType: isPdf ? 'pdf' : 'image',
        updatedAt: new Date().toISOString(),
      }));

      setSaveSuccessMsg('Background image loaded. Click "Save to Cloud" to persist it for all users.');
    } catch (err: any) {
      alert('Could not process image file: ' + err.message);
    }
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
          setSelectedFieldId(parsed.fields[0]?.id || null);
          setSaveSuccessMsg('Configuration imported from file. Click "Save to Cloud" to save it.');
        } else {
          alert('Invalid template JSON file format.');
        }
      } catch {
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
  };

  // Remove field
  const handleRemoveField = (id: string) => {
    if (window.confirm('Remove this field overlay from the template?')) {
      setTemplate(prev => ({
        ...prev,
        fields: prev.fields.filter(f => f.id !== id),
      }));
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
      userId: currentUser?.uid || 'usr_test',
      claimNumber: 'CLM-TEST-001',
      employeeId: 'emp_test',
      employeeName: userProfile?.name || 'Dasun Ramasingha',
      employeeNumber: userProfile?.employeeNumber || 'EMP-4892',
      designation: userProfile?.designation || 'Senior Technical Officer',
      branch: userProfile?.branch || 'Headquarters',
      department: userProfile?.department || 'IT & Infrastructure Operations',
      claimType: userProfile?.claimType || 'OT',
      month: 'October',
      year: 2026,
      claimDate: '2026-10-04',
      rows: [
        {
          id: 't-1',
          date: '2026-10-01',
          dayOfWeek: 'Thu',
          startTime: '08:00',
          endTime: '19:45',
          breakMinutes: 0,
          isOvernight: false,
          totalWorkMinutes: 705,
          rawOtMinutes: 180,
          totalMinutes: 180,
          totalFormatted: '03:00',
          reason: 'Template alignment calibration and print margin verification',
        },
        {
          id: 't-2',
          date: '2026-10-02',
          dayOfWeek: 'Fri',
          startTime: '08:00',
          endTime: '20:15',
          breakMinutes: 30,
          isOvernight: false,
          totalWorkMinutes: 735,
          rawOtMinutes: 180,
          totalMinutes: 180,
          totalFormatted: '03:00',
          reason: 'Scheduled database integrity check & off-peak server maintenance',
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
              <strong>View-Only Mode:</strong> Only administrators can edit template coordinates, calibrate printer margins, or save changes to the company cloud.
            </span>
          </div>
          <span className="font-semibold text-[11px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
            Admin Required
          </span>
        </div>
      )}

      {/* Top Template Selector & Management Bar */}
      <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Active Organization Template
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={currentTemplateId}
                  onChange={e => handleSwitchTemplate(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                >
                  {templateList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isDefault ? '★ (Default)' : ''}
                    </option>
                  ))}
                </select>

                {template.isDefault && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                    <Star className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                    Default For All Users
                  </span>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-1.5 sm:border-l sm:border-slate-200 sm:pl-3">
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition"
                  title="Create a new template"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Template</span>
                </button>

                {!template.isDefault && (
                  <button
                    onClick={handleSetAsDefault}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition"
                    title="Make this template the default for all employee claim forms"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <span>Set As Default</span>
                  </button>
                )}

                {template.id !== DEFAULT_TEMPLATE.id && (
                  <button
                    onClick={handleDeleteTemplate}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition"
                    title="Delete this template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Cloud Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTestPrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
              title="Generate a test print PDF with sample overtime hours"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Test Print</span>
            </button>

            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
              title="Export configuration as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => jsonImportRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
                  title="Import JSON template"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
                <input
                  ref={jsonImportRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportJson}
                />

                <button
                  onClick={handleResetToStandard}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
                  title="Reset coordinates to official baseline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                {/* Primary Save Button */}
                <button
                  onClick={() => handleSaveToCloud()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-xs hover:shadow-md transition disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{isSaving ? 'Saving to Cloud...' : 'Save to Cloud'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        {saveSuccessMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 font-medium animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {saveErrorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-800 font-medium animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{saveErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Main Designer Grid: Canvas (Left) + Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Visual Canvas & Rulers */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-center">
          {/* Canvas Controls Header */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 mb-2 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 shadow-2xs">
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
                  className="rounded border border-slate-200 px-1 py-0.5 text-[11px] bg-slate-50"
                >
                  <option value={0}>Snap: Off</option>
                  <option value={0.5}>Snap: 0.5 mm</option>
                  <option value={1}>Snap: 1.0 mm</option>
                  <option value={2}>Snap: 2.0 mm</option>
                </select>
              </div>
            </div>
          </div>

          {/* The Visual A4 Workspace Container */}
          <div
            className="relative overflow-auto max-h-[820px] w-full p-6 bg-slate-200 rounded-2xl flex justify-center border border-slate-300 select-none shadow-inner"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Rulers: Horizontal Top */}
            {showRulers && (
              <div
                className="absolute top-1 bg-slate-700 text-[8px] font-mono text-slate-300 h-4 flex items-center justify-between px-1 rounded-sm opacity-80 pointer-events-none"
                style={{
                  width: `${template.widthMm * MM_TO_PX_BASE * zoom}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                <span>0</span>
                <span>50mm</span>
                <span>100mm</span>
                <span>150mm</span>
                <span>210mm (A4)</span>
              </div>
            )}

            {/* A4 Sheet Canvas */}
            <div
              ref={canvasRef}
              className="relative bg-white shadow-2xl transition-all border border-slate-300"
              style={{
                width: `${template.widthMm * MM_TO_PX_BASE * zoom}px`,
                height: `${template.heightMm * MM_TO_PX_BASE * zoom}px`,
                transformOrigin: 'top center',
              }}
              onClick={() => setSelectedFieldId(null)}
            >
              {/* Background Layer: Official Blank Form */}
              {template.backgroundImageUrl && (
                <img
                  src={template.backgroundImageUrl}
                  alt="A4 Official Form Background"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none opacity-90"
                />
              )}

              {/* Dynamic Field Overlays */}
              {template.fields.map(field => {
                if (!field.isVisible) return null;
                const isSelected = field.id === selectedFieldId;

                const leftPx = field.x * MM_TO_PX_BASE * zoom;
                const topPx = field.y * MM_TO_PX_BASE * zoom;
                const widthPx = field.width * MM_TO_PX_BASE * zoom;
                const heightPx = field.height * MM_TO_PX_BASE * zoom;
                const fontSizePx = (field.fontSize * (96 / 72)) * zoom;

                return (
                  <div
                    key={field.id}
                    onMouseDown={e => {
                      if (isAdmin) handleFieldMouseDown(e, field);
                      else {
                        e.stopPropagation();
                        setSelectedFieldId(field.id);
                      }
                    }}
                    onClick={e => e.stopPropagation()}
                    className={`absolute flex items-center px-1 overflow-hidden transition-colors ${
                      isAdmin ? 'cursor-move' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'border-2 border-indigo-600 bg-indigo-500/20 z-30 shadow-md ring-2 ring-indigo-300'
                        : showBoundaries
                        ? 'border border-dashed border-indigo-400 bg-indigo-50/20 hover:border-indigo-600 hover:bg-indigo-100/30 z-10'
                        : 'border border-transparent hover:border-slate-400 z-10'
                    }`}
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      width: `${widthPx}px`,
                      height: `${heightPx}px`,
                      fontSize: `${fontSizePx}px`,
                      fontFamily: field.fontFamily || 'Helvetica',
                      fontWeight: field.isBold ? 'bold' : 'normal',
                      textAlign: field.alignment,
                      color: field.color || '#000000',
                      transform: field.rotation ? `rotate(${field.rotation}deg)` : undefined,
                    }}
                    title={`${field.name} (${field.x.toFixed(1)}mm, ${field.y.toFixed(1)}mm)`}
                  >
                    <span className="truncate w-full select-none leading-none">
                      {field.sampleValue || field.name}
                    </span>

                    {/* Coordinates chip badge when selected */}
                    {isSelected && (
                      <span className="absolute -top-5 left-0 px-1.5 py-0.5 bg-indigo-600 text-white font-mono text-[9px] font-bold rounded shadow-xs pointer-events-none whitespace-nowrap">
                        {field.x.toFixed(1)}mm, {field.y.toFixed(1)}mm
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Table Region Guideline */}
              {template.tableConfig.enabled && showBoundaries && (
                <div
                  className="absolute pointer-events-none border border-emerald-500/50 bg-emerald-500/5"
                  style={{
                    left: `${16 * MM_TO_PX_BASE * zoom}px`,
                    top: `${template.tableConfig.startY * MM_TO_PX_BASE * zoom}px`,
                    width: `${178 * MM_TO_PX_BASE * zoom}px`,
                    height: `${template.tableConfig.maxRows * template.tableConfig.rowHeight * MM_TO_PX_BASE * zoom}px`,
                  }}
                >
                  <span className="absolute -top-4 left-0 px-1 py-0.2 text-[8px] bg-emerald-600 text-white font-semibold rounded">
                    Table Rows Region ({template.tableConfig.maxRows} Rows @ {template.tableConfig.rowHeight}mm)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Inspector & Settings Sidebar */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Navigation Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('fields')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'fields'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fields ({template.fields.length})
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'table'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Table Grid
            </button>
            <button
              onClick={() => setActiveTab('printer')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'printer'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Printer (Offsets)
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'metadata'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Settings
            </button>
          </div>

          {/* TAB 1: FIELD INSPECTOR */}
          {activeTab === 'fields' && (
            <div className="space-y-4">
              {/* Field Selector List */}
              <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Select Overlay Field
                  </span>
                  {isAdmin && (
                    <button
                      onClick={handleAddField}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Field</span>
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {template.fields.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFieldId(f.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition text-left ${
                        f.id === selectedFieldId
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="truncate">{f.name}</span>
                      <span className={`text-[10px] font-mono ${f.id === selectedFieldId ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {f.x.toFixed(1)}, {f.y.toFixed(1)} mm
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Field Editor */}
              {selectedField ? (
                <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{selectedField.name}</h3>
                      <span className="text-[11px] font-mono text-slate-400">Key: {selectedField.key}</span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateFieldProperty('isVisible', !selectedField.isVisible)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                          title={selectedField.isVisible ? 'Hide Field' : 'Show Field'}
                        >
                          {selectedField.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                        </button>
                        {selectedField.id.startsWith('custom_') && (
                          <button
                            onClick={() => handleRemoveField(selectedField.id)}
                            className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
                            title="Delete Field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Position Coordinates in Millimeters */}
                  <div>
                    <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                      Position Coordinates (A4 mm)
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                          Horizontal X (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={selectedField.x}
                          onChange={e => updateFieldProperty('x', parseFloat(e.target.value) || 0)}
                          disabled={!isAdmin}
                          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                          Vertical Y (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={selectedField.y}
                          onChange={e => updateFieldProperty('y', parseFloat(e.target.value) || 0)}
                          disabled={!isAdmin}
                          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                        Width (mm)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={selectedField.width}
                        onChange={e => updateFieldProperty('width', parseFloat(e.target.value) || 10)}
                        disabled={!isAdmin}
                        className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                        Height (mm)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedField.height}
                        onChange={e => updateFieldProperty('height', parseFloat(e.target.value) || 4)}
                        disabled={!isAdmin}
                        className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                      />
                    </div>
                  </div>

                  {/* Typography */}
                  <div>
                    <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                      Typography &amp; Style
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                          Font Size (pt)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={selectedField.fontSize}
                          onChange={e => updateFieldProperty('fontSize', parseFloat(e.target.value) || 8)}
                          disabled={!isAdmin}
                          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-center bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                          Font Family
                        </label>
                        <select
                          value={selectedField.fontFamily}
                          onChange={e => updateFieldProperty('fontFamily', e.target.value as FontFamily)}
                          disabled={!isAdmin}
                          className="w-full rounded border border-slate-300 px-2 py-1 bg-white"
                        >
                          <option value="Helvetica">Helvetica / Arial</option>
                          <option value="Times">Times New Roman</option>
                          <option value="Courier">Courier Monospace</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedField.isBold}
                          onChange={e => updateFieldProperty('isBold', e.target.checked)}
                          disabled={!isAdmin}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">Bold Text</span>
                      </label>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateFieldProperty('alignment', 'left')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'left' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Left
                        </button>
                        <button
                          onClick={() => updateFieldProperty('alignment', 'center')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'center' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Center
                        </button>
                        <button
                          onClick={() => updateFieldProperty('alignment', 'right')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'right' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Right
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sample Value Input */}
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Sample Preview Text
                    </label>
                    <input
                      type="text"
                      value={selectedField.sampleValue || ''}
                      onChange={e => updateFieldProperty('sampleValue', e.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-slate-800 bg-white"
                      placeholder="e.g. Dasun Ramasingha"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white p-8 text-center text-slate-400 border border-slate-200">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Click on any text box on the A4 canvas to inspect and adjust its millimeter position.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TABLE CONFIGURATION */}
          {activeTab === 'table' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Monthly Table Grid Alignment</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Calibrate the vertical step and column coordinates for the 31-day overtime table.
                </p>
              </div>

              {/* Table Vertical Origin */}
              <div>
                <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                  Row Baseline Step
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Start Y Position (mm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={template.tableConfig.startY}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          tableConfig: {
                            ...prev.tableConfig,
                            startY: parseFloat(e.target.value) || 72,
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

                <div className="grid grid-cols-2 gap-3 mt-3">
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
            </div>
          )}

          {/* TAB 4: TEMPLATE DETAILS & CLOUD PERSISTENCE */}
          {activeTab === 'metadata' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Template Cloud Configuration</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Configure template metadata, background form graphics, and organization availability.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={template.name}
                  onChange={e => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 bg-white"
                  placeholder="e.g. Operations Overtime Claim A4"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Description / Department Notes
                </label>
                <textarea
                  rows={2}
                  value={template.description || ''}
                  onChange={e => setTemplate(prev => ({ ...prev, description: e.target.value }))}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                  placeholder="e.g. Standard form for IT and Network staff with special lunch break hours"
                />
              </div>

              {isAdmin && (
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!template.isDefault}
                      onChange={e => setTemplate(prev => ({ ...prev, isDefault: e.target.checked }))}
                      className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-indigo-950 block">Set as Default Template</span>
                      <span className="text-[11px] text-indigo-700">All employees will automatically use this layout when creating new overtime claims.</span>
                    </div>
                  </label>
                </div>
              )}

              {/* Background File Upload */}
              {isAdmin && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                    Scanned Blank Form Background
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Upload New Background Form</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleTemplateFileUpload}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    PNG, JPG, or PDF supported. Images are automatically optimized for cloud storage.
                  </p>
                </div>
              )}

              {/* Save Button in Tab */}
              {isAdmin && (
                <div className="pt-3">
                  <button
                    onClick={() => handleSaveToCloud()}
                    disabled={isSaving}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-xs transition flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{isSaving ? 'Saving to Cloud Firestore...' : 'Save Template to Cloud'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CREATE NEW TEMPLATE MODAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Create New Form Template</h2>
            <p className="text-xs text-slate-500 mb-4">
              Add a new custom A4 overtime claim layout that can be selected by employees.
            </p>

            <form onSubmit={handleCreateNewTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Operations Branch Overtime Form"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Department Notes
                </label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={e => setNewTemplateDesc(e.target.value)}
                  placeholder="e.g. Used for regional warehouse dispatch crew"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyFromCurrent}
                    onChange={e => setCopyFromCurrent(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 block">Copy layout from current template</span>
                    <span className="text-[11px] text-slate-500">Clones field positions from &quot;{template.name}&quot; as starting baseline.</span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !newTemplateName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
