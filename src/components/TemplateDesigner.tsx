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
  RotateCw,
  Maximize2,
  Code,
  ExternalLink,
  ClipboardCopy,
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
import { convertPdfToImageDataUrl } from '../utils/pdfToImage';

const MM_TO_PX_BASE = 3.779527559; // at 100% zoom (96 DPI standard: 1mm = ~3.78px)

// Standard Overtime Form Dynamic Presets for quick addition
const FIELD_PRESETS = [
  { name: 'Employee Name', key: 'employeeName', sample: 'Dasun Ramasingha', type: 'text' as const, w: 60, h: 5 },
  { name: 'Employee Number', key: 'employeeNumber', sample: 'EMP-4892', type: 'text' as const, w: 35, h: 5 },
  { name: 'Designation', key: 'designation', sample: 'Systems Engineer', type: 'text' as const, w: 50, h: 5 },
  { name: 'Department', key: 'department', sample: 'IT Infrastructure', type: 'text' as const, w: 55, h: 5 },
  { name: 'Branch', key: 'branch', sample: 'Head Office', type: 'text' as const, w: 45, h: 5 },
  { name: 'Claim Month & Year', key: 'monthYear', sample: 'October 2026', type: 'text' as const, w: 40, h: 5 },
  { name: 'Claim Date', key: 'claimDate', sample: '2026-10-04', type: 'date' as const, w: 35, h: 5 },
  { name: 'Total OT Hours', key: 'totalHours', sample: '18:30 Hours', type: 'calculated' as const, w: 40, h: 5 },
  { name: 'Claim Type', key: 'claimType', sample: 'OT Claim', type: 'text' as const, w: 30, h: 5 },
  { name: 'Officer Signature', key: 'signature', sample: 'Approved & Verified', type: 'signature' as const, w: 50, h: 8 },
  { name: 'Custom Dynamic Label', key: 'customField', sample: 'Custom Label Text', type: 'text' as const, w: 40, h: 5 },
];

export const TemplateDesigner: React.FC = () => {
  const { currentUser, userProfile, isAdmin } = useAuth();

  // Template list & current working template
  const [templateList, setTemplateList] = useState<TemplateConfig[]>([DEFAULT_TEMPLATE]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [template, setTemplate] = useState<TemplateConfig>(getActiveTemplate());

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    template.fields[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<'fields' | 'pageSize' | 'table' | 'printer'>('fields');
  const [zoom, setZoom] = useState<number>(0.75); // 75% default for desktop viewport
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showBoundaries, setShowBoundaries] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<number>(1); // 1 mm snap (0 = disabled)

  // Cloud Save & Status States
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateDesc, setNewTemplateDesc] = useState<string>('');
  const [copyFromCurrent, setCopyFromCurrent] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showPresetsMenu, setShowPresetsMenu] = useState<boolean>(false);
  const [copiedRules, setCopiedRules] = useState<boolean>(false);

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
    fetchTemplatesFromFirestore(isAdmin).then(templates => {
      if (templates.length > 0) {
        setTemplateList(templates);
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

  // Save current template to Cloud Firestore (with automatic local storage cache)
  const handleSaveToCloud = async (setAsDefaultOverride?: boolean) => {
    setIsSaving(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    const willBeDefault =
      setAsDefaultOverride !== undefined ? setAsDefaultOverride : !!template.isDefault;

    try {
      const saved = await saveTemplateToFirestore(template, {
        setAsDefault: willBeDefault,
        userId: currentUser?.uid,
        userName: userProfile?.name || currentUser?.email || 'Admin',
      });

      setTemplate(saved);
      setTemplateList(prev => {
        const idx = prev.findIndex(t => t.id === saved.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        }
        return [saved, ...prev];
      });

      setSaveSuccessMsg(`Template "${saved.name}" successfully saved to Cloud Firestore and local storage!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.warn('Notice: Firestore save error, cached locally:', err);
      const isPerm = err?.message?.includes('permission') || err?.code === 'permission-denied';
      if (isPerm) {
        setSaveSuccessMsg(`Template "${template.name}" saved in browser storage! To sync across all devices on overtimerequest-prod, publish the Firestore security rules.`);
        setShowRulesModal(true);
      } else {
        setSaveErrorMsg('Saved locally in browser. Cloud message: ' + (err.message || 'Permission check'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Set as Organization Default template
  const handleSetAsDefault = async () => {
    setIsSaving(true);
    try {
      await setDefaultTemplateInFirestore(template.id);
      setTemplate(prev => ({ ...prev, isDefault: true }));
      setSaveSuccessMsg(`"${template.name}" is now the active default template for all users!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setSaveErrorMsg('Notice: Default updated locally. Cloud sync: ' + (err.message || 'Complete'));
    } finally {
      setIsSaving(false);
    }
  };

  // Create new template modal action
  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    setIsSaving(true);
    const base = copyFromCurrent ? template : DEFAULT_TEMPLATE;
    const newId = `tpl-${Date.now()}`;
    const newTemplate: TemplateConfig = {
      ...base,
      id: newId,
      name: newTemplateName.trim(),
      description: newTemplateDesc.trim(),
      isDefault: false,
      pageSize: 'A4',
      widthMm: 210,
      heightMm: 297,
      updatedAt: new Date().toISOString(),
      createdBy: currentUser?.uid,
      createdByName: userProfile?.name || currentUser?.email || 'Admin',
    };

    try {
      const saved = await saveTemplateToFirestore(newTemplate, {
        setAsDefault: false,
        userId: currentUser?.uid,
        userName: userProfile?.name || currentUser?.email || 'Admin',
      });

      setTemplate(saved);
      setCurrentTemplateId(saved.id);
      setSelectedFieldId(saved.fields[0]?.id || null);
      setTemplateList(prev => [saved, ...prev.filter(t => t.id !== saved.id)]);
      setIsNewModalOpen(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setSaveSuccessMsg(`New template "${saved.name}" created and saved!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.warn('Template created locally:', err);
      // Fallback: template is already saved in local storage
      setTemplate(newTemplate);
      setCurrentTemplateId(newTemplate.id);
      setSelectedFieldId(newTemplate.fields[0]?.id || null);
      setTemplateList(prev => [newTemplate, ...prev.filter(t => t.id !== newTemplate.id)]);
      setIsNewModalOpen(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setSaveSuccessMsg(`New template "${newTemplate.name}" created and saved locally! (To sync to Cloud Firestore, publish rules in Firebase Console)`);
      setShowRulesModal(true);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
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

    if (!window.confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteTemplateFromFirestore(template.id);
      const fallback = templateList.find(t => t.id !== template.id) || DEFAULT_TEMPLATE;
      setTemplate(fallback);
      setCurrentTemplateId(fallback.id);
      setSelectedFieldId(fallback.fields[0]?.id || null);
      setSaveSuccessMsg(`Template removed successfully.`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setSaveErrorMsg('Notice: Template deleted locally: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to standard official overtime template
  const handleResetToStandard = () => {
    if (window.confirm('Reset this template layout to the standard official overtime form? Any unsaved custom coordinates will be discarded.')) {
      setTemplate(prev => ({
        ...DEFAULT_TEMPLATE,
        id: prev.id,
        name: prev.name,
        isDefault: prev.isDefault,
        pageSize: 'A4',
        widthMm: 210,
        heightMm: 297,
        updatedAt: new Date().toISOString(),
      }));
      setSelectedFieldId(DEFAULT_TEMPLATE.fields[0]?.id || null);
    }
  };

  // Upload custom template file (PDF or Image) with automatic conversion & compression
  const handleTemplateFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let resultDataUrl: string;

      if (isPdf) {
        setIsUploadingBackground(true);
        // Render PDF page 1 into a crisp A4 canvas image
        resultDataUrl = await convertPdfToImageDataUrl(file, 1600);
      } else if (file.type.startsWith('image/')) {
        setIsUploadingBackground(true);
        // Compress image to ensure it fits comfortably within Firestore storage (< 350KB)
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
        pageSize: 'A4',
        widthMm: 210,
        heightMm: 297,
        backgroundImageUrl: resultDataUrl,
        backgroundType: isPdf ? 'pdf' : 'image',
        updatedAt: new Date().toISOString(),
      }));

      setSaveSuccessMsg(
        isPdf
          ? 'PDF Background loaded and converted to A4 (210 x 297 mm)! Click "Save to Cloud" to persist.'
          : 'Background image loaded! Click "Save to Cloud" to persist.'
      );
    } catch (err: any) {
      alert('Could not process template file: ' + err.message);
    } finally {
      setIsUploadingBackground(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export template configuration as JSON
  const handleExportJson = () => {
    const exportData = {
      ...template,
      exportedAt: new Date().toISOString(),
      version: '2.0',
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${template.name.replace(/\s+/g, '_')}_A4_config.json`);
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
        if (parsed.fields && Array.isArray(parsed.fields)) {
          const imported: TemplateConfig = {
            ...template,
            ...parsed,
            id: template.id, // keep current ID or create new
            pageSize: 'A4',
            widthMm: parsed.widthMm || 210,
            heightMm: parsed.heightMm || 297,
            updatedAt: new Date().toISOString(),
          };
          setTemplate(imported);
          setSelectedFieldId(imported.fields[0]?.id || null);
          setSaveSuccessMsg(`Configuration successfully imported (${imported.fields.length} dynamic fields loaded). Click "Save to Cloud" to save.`);
        } else {
          alert('Invalid template JSON file format. Missing "fields" array.');
        }
      } catch {
        alert('Could not parse JSON template file.');
      } finally {
        if (jsonImportRef.current) jsonImportRef.current.value = '';
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
  const handleAddField = (presetKey?: string) => {
    const preset = FIELD_PRESETS.find(p => p.key === presetKey);
    const newId = 'field_' + Date.now();
    const newField: FieldConfig = {
      id: newId,
      name: preset ? preset.name : 'Custom Dynamic Field',
      key: preset ? preset.key : 'custom_' + Math.random().toString(36).substring(2, 6),
      type: preset ? preset.type : 'text',
      x: 30,
      y: 100 + (template.fields.length % 15) * 6,
      width: preset ? preset.w : 50,
      height: preset ? preset.h : 5,
      fontSize: 9,
      fontFamily: 'Helvetica',
      isBold: false,
      alignment: 'left',
      rotation: 0,
      isVisible: true,
      sampleValue: preset ? preset.sample : 'Sample Text Value',
      color: '#000000',
    };

    setTemplate(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
    setShowPresetsMenu(false);
  };

  // Duplicate currently selected field
  const handleDuplicateField = () => {
    if (!selectedField) return;
    const newId = 'field_' + Date.now();
    const duplicated: FieldConfig = {
      ...selectedField,
      id: newId,
      name: `${selectedField.name} (Copy)`,
      x: Math.min(190, selectedField.x + 4),
      y: Math.min(280, selectedField.y + 4),
    };

    setTemplate(prev => ({
      ...prev,
      fields: [...prev.fields, duplicated],
    }));
    setSelectedFieldId(newId);
  };

  // Remove field
  const handleRemoveField = (id: string) => {
    if (window.confirm('Remove this field from the template?')) {
      setTemplate(prev => ({
        ...prev,
        fields: prev.fields.filter(f => f.id !== id),
      }));
      setSelectedFieldId(template.fields.find(f => f.id !== id)?.id || null);
    }
  };

  // Mouse drag handling for positioning fields on A4 visual canvas
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

    if (gridSnap > 0) {
      nextX = Math.round(nextX / gridSnap) * gridSnap;
      nextY = Math.round(nextY / gridSnap) * gridSnap;
    }

    // Keep within A4 sheet boundaries
    nextX = Math.max(0, Math.min(template.widthMm - 5, parseFloat(nextX.toFixed(1))));
    nextY = Math.max(0, Math.min(template.heightMm - 5, parseFloat(nextY.toFixed(1))));

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
      id: 'test-designer-claim',
      claimNumber: 'OT-DESIGN-PREVIEW',
      employeeName: userProfile?.name || 'Dasun Ramasingha',
      employeeNumber: userProfile?.employeeNumber || 'EMP-1001',
      designation: userProfile?.designation || 'Software Engineer',
      branch: userProfile?.branch || 'Colombo Head Office',
      department: userProfile?.department || 'IT Infrastructure & Operations',
      claimType: 'OT',
      month: 'October',
      year: 2026,
      claimDate: '2026-10-04',
      status: 'draft',
      rows: [
        {
          id: 'row-1',
          date: '2026-10-01',
          dayOfWeek: 'Thu',
          startTime: '08:00',
          endTime: '18:45',
          breakMinutes: 0,
          totalWorkMinutes: 645,
          rawOtMinutes: 120,
          totalMinutes: 120,
          totalFormatted: '02:00',
          reason: 'Emergency server patching & database synchronization',
        },
        {
          id: 'row-2',
          date: '2026-10-02',
          dayOfWeek: 'Fri',
          startTime: '08:00',
          endTime: '19:15',
          breakMinutes: 0,
          totalWorkMinutes: 675,
          rawOtMinutes: 150,
          totalMinutes: 120,
          totalFormatted: '02:00',
          reason: 'Network firewall deployment & verification',
        },
      ],
      totalMinutes: 240,
      totalHoursFormatted: '04:00',
      totalDecimalHours: 4.0,
      otDaysCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      templateId: template.id,
      userId: currentUser?.uid || 'user-admin',
    };

    try {
      const result = await generateOvertimePdf(testClaim, template, settings.globalPrinterOffsetX, settings.globalPrinterOffsetY);
      setTestPdfUrl(result.url);
      setIsTestPdfOpen(true);
    } catch (err: any) {
      alert('Could not render test PDF: ' + err.message);
    }
  };

  // Copy Firestore Security Rules to clipboard
  const FIRESTORE_RULES_TEXT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && (
        request.auth.uid == 'qdGIZL4RtYeppzf8SYTcWN9zUkp1' ||
        (request.auth.token.email != null && request.auth.token.email.lower() == 'dasundularaka@gmail.com') ||
        request.auth.token.role == 'admin' ||
        exists(/databases/$(database)/documents/admins/$(request.auth.uid)) ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }
    match /test/{docId} { allow read: if true; }
    match /admins/{adminId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    match /users/{userId} {
      allow get: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow list: if isAdmin();
      allow create, update: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow delete: if isAdmin();
    }
    match /claims/{claimId} {
      allow get, list, create, update, delete: if isSignedIn() && (
        resource == null || resource.data.userId == request.auth.uid || isAdmin()
      );
    }
    match /templates/{templateId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
  }
}`;

  const handleCopyRules = () => {
    navigator.clipboard.writeText(FIRESTORE_RULES_TEXT);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 3000);
  };

  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Banner & Template Selector Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Template Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Template Designer
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-200">
                  A4 ISO 216
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload your blank PDF/Image form and visually position dynamic text fields with millimeter accuracy.
              </p>
            </div>

            {/* Template Dropdown Selector */}
            <div className="flex items-center gap-2 ml-0 sm:ml-4">
              <select
                value={currentTemplateId}
                onChange={e => handleSwitchTemplate(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {templateList.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isDefault ? '★ (Default)' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setNewTemplateName('');
                  setNewTemplateDesc('');
                  setIsNewModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition"
                title="Create a new template"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>

              {!template.isDefault && (
                <button
                  onClick={handleSetAsDefault}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition"
                  title="Make this template the default for all employee claim forms"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span>Set Default</span>
                </button>
              )}

              {template.id !== DEFAULT_TEMPLATE.id && (
                <button
                  onClick={handleDeleteTemplate}
                  disabled={isSaving}
                  className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition"
                  title="Delete this template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Upload PDF/Image Template Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={handleTemplateFileUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingBackground}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition disabled:opacity-50"
              title="Upload PDF or Image background template"
            >
              {isUploadingBackground ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span>{isUploadingBackground ? 'Rendering PDF...' : 'Upload PDF / Image'}</span>
            </button>

            {/* Test Print Preview Button */}
            <button
              onClick={handleTestPrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
              title="Generate a test print PDF with sample overtime hours"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Test Print</span>
            </button>

            {/* Export JSON Button */}
            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
              title="Export configuration as JSON file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            {/* Import JSON Button */}
            <button
              onClick={() => jsonImportRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
              title="Import JSON template configuration"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
            <input
              ref={jsonImportRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJson}
            />

            {/* Reset to standard */}
            <button
              onClick={handleResetToStandard}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
              title="Reset coordinates to official baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            {/* Security Rules Helper Modal Trigger */}
            <button
              onClick={() => setShowRulesModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition"
              title="View & copy Firestore security rules"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Rules</span>
            </button>

            {/* Primary Save Button */}
            <button
              onClick={() => handleSaveToCloud()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-xs hover:shadow-md transition disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save to Cloud'}</span>
            </button>
          </div>
        </div>

        {/* Feedback Notifications */}
        {saveSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 font-medium animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
            <button
              onClick={() => setSaveSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {saveErrorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900 font-medium animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{saveErrorMsg}</span>
            </div>
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-2 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 text-[11px] font-bold underline"
            >
              View Firestore Rules
            </button>
          </div>
        )}
      </div>

      {/* Main Designer Grid: Live Preview Canvas (Left) + Property Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Visual Live Preview Canvas & Rulers */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-center">
          {/* Canvas Controls Header */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 mb-2 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 shadow-2xs">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Zoom:</span>
              <button
                onClick={() => setZoom(z => Math.max(0.35, parseFloat((z - 0.15).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] font-bold">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(2.0, parseFloat((z + 0.15).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(0.75)}
                className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded"
              >
                Fit
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
                <span className="text-[11px]">Field Outlines</span>
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

              {/* Grid Snap Selector */}
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

              {/* A4 Sheet Dimensions Chip */}
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                {template.widthMm} × {template.heightMm} mm
              </span>
            </div>
          </div>

          {/* Canvas Wrapper with Rulers */}
          <div className="relative overflow-auto p-4 bg-slate-200/60 rounded-2xl border border-slate-300 max-h-[82vh] w-full flex justify-center items-start shadow-inner">
            {/* Horizontal Millimeter Ruler */}
            {showRulers && (
              <div
                className="absolute top-1 left-9 h-4 border-b border-slate-400 flex text-[8px] font-mono text-slate-500 select-none pointer-events-none"
                style={{ width: `${template.widthMm * MM_TO_PX_BASE * zoom}px` }}
              >
                {Array.from({ length: Math.ceil(template.widthMm / 10) }).map((_, i) => (
                  <div
                    key={i}
                    className="border-r border-slate-400 h-full flex items-end justify-end pr-0.5 text-[7px]"
                    style={{ width: `${10 * MM_TO_PX_BASE * zoom}px` }}
                  >
                    {i * 10}
                  </div>
                ))}
              </div>
            )}

            {/* Vertical Millimeter Ruler */}
            {showRulers && (
              <div
                className="absolute top-9 left-1 w-6 border-r border-slate-400 flex flex-col text-[8px] font-mono text-slate-500 select-none pointer-events-none"
                style={{ height: `${template.heightMm * MM_TO_PX_BASE * zoom}px` }}
              >
                {Array.from({ length: Math.ceil(template.heightMm / 10) }).map((_, i) => (
                  <div
                    key={i}
                    className="border-b border-slate-400 w-full flex items-end justify-end pr-0.5 text-[7px]"
                    style={{ height: `${10 * MM_TO_PX_BASE * zoom}px` }}
                  >
                    {i * 10}
                  </div>
                ))}
              </div>
            )}

            {/* A4 Sheet Canvas */}
            <div
              ref={canvasRef}
              className="relative bg-white shadow-2xl transition-all border border-slate-300 mt-6 ml-6 select-none"
              style={{
                width: `${template.widthMm * MM_TO_PX_BASE * zoom}px`,
                height: `${template.heightMm * MM_TO_PX_BASE * zoom}px`,
                transformOrigin: 'top center',
              }}
              onClick={() => setSelectedFieldId(null)}
            >
              {/* Background Layer: Blank Form (from uploaded PDF or default) */}
              {template.backgroundImageUrl && (
                <img
                  src={template.backgroundImageUrl}
                  alt="A4 Blank Form Template"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none opacity-95"
                />
              )}

              {/* Uploading Spinner Overlay */}
              {isUploadingBackground && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-40">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-xs font-semibold text-slate-800">
                    Converting PDF Page 1 into high-resolution A4 canvas background...
                  </p>
                </div>
              )}

              {/* Dynamic Field Overlays with Real-Time Rotation & Positioning */}
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
                    onMouseDown={e => handleFieldMouseDown(e, field)}
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedFieldId(field.id);
                    }}
                    className={`absolute flex items-center px-1 overflow-hidden transition-colors cursor-move ${
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
                      textAlign: field.alignment || 'left',
                      color: field.color || '#000000',
                      transform: field.rotation ? `rotate(${field.rotation}deg)` : undefined,
                      transformOrigin: 'top left',
                    }}
                    title={`${field.name} (${field.x.toFixed(1)}mm, ${field.y.toFixed(1)}mm, rot: ${field.rotation || 0}°)`}
                  >
                    <span className="truncate w-full select-none leading-none">
                      {field.sampleValue || field.name}
                    </span>

                    {/* Coordinates chip badge when selected */}
                    {isSelected && (
                      <span className="absolute -top-5 left-0 px-1.5 py-0.5 bg-indigo-600 text-white font-mono text-[9px] font-bold rounded shadow-xs pointer-events-none whitespace-nowrap z-50">
                        {field.x.toFixed(1)}mm, {field.y.toFixed(1)}mm {field.rotation ? `(${field.rotation}°)` : ''}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Table Region Guideline */}
              {template.tableConfig?.enabled && showBoundaries && (
                <div
                  className="absolute pointer-events-none border border-dashed border-amber-400 bg-amber-500/5 z-5"
                  style={{
                    left: `${template.tableConfig.columns.date.x * MM_TO_PX_BASE * zoom}px`,
                    top: `${template.tableConfig.startY * MM_TO_PX_BASE * zoom}px`,
                    width: `${
                      (template.tableConfig.columns.reason.x +
                        template.tableConfig.columns.reason.width -
                        template.tableConfig.columns.date.x) *
                      MM_TO_PX_BASE *
                      zoom
                    }px`,
                    height: `${template.tableConfig.rowHeight * template.tableConfig.maxRows * MM_TO_PX_BASE * zoom}px`,
                  }}
                >
                  <span className="absolute -top-4 left-0 text-[8px] font-mono text-amber-700 bg-amber-100 px-1 rounded">
                    31-Day Table Rows Area ({template.tableConfig.startY.toFixed(1)}mm)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Field Inspector, Page Size, & Properties Panel */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Navigation Tabs for Inspector */}
          <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setActiveTab('fields')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'fields' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Fields ({template.fields.length})
            </button>
            <button
              onClick={() => setActiveTab('pageSize')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'pageSize' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              A4 Page Size
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'table' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Table Area
            </button>
            <button
              onClick={() => setActiveTab('printer')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeTab === 'printer' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Offset
            </button>
          </div>

          {/* TAB 1: Dynamic Text Fields Manager */}
          {activeTab === 'fields' && (
            <div className="space-y-4">
              {/* Field Selector & Add Field Dropdown */}
              <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Template Fields
                  </label>

                  <div className="relative">
                    <button
                      onClick={() => setShowPresetsMenu(prev => !prev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Field</span>
                    </button>

                    {/* Presets Dropdown */}
                    {showPresetsMenu && (
                      <div className="absolute right-0 top-8 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-fadeIn">
                        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Overtime Form Presets
                        </div>
                        {FIELD_PRESETS.map(preset => (
                          <button
                            key={preset.key}
                            onClick={() => handleAddField(preset.key)}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between"
                          >
                            <span>{preset.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{preset.key}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Field List Pills */}
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
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
                      <span
                        className={`text-[10px] font-mono ${
                          f.id === selectedFieldId ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {f.x.toFixed(1)}, {f.y.toFixed(1)} mm {f.rotation ? `(${f.rotation}°)` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Field Editor Form */}
              {selectedField ? (
                <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
                  {/* Field Header & Controls */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{selectedField.name}</h3>
                      <span className="text-[11px] font-mono text-slate-400">Key: {selectedField.key}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleDuplicateField}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
                        title="Duplicate Field"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => updateFieldProperty('isVisible', !selectedField.isVisible)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
                        title={selectedField.isVisible ? 'Hide Field' : 'Show Field'}
                      >
                        {selectedField.isVisible ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <button
                        onClick={() => handleRemoveField(selectedField.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                        title="Delete Field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 1. Field Label Name */}
                  <div>
                    <label className="block text-slate-700 text-[11px] font-semibold mb-1">
                      Field Display Name
                    </label>
                    <input
                      type="text"
                      value={selectedField.name}
                      onChange={e => updateFieldProperty('name', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      placeholder="e.g. Employee Full Name"
                    />
                  </div>

                  {/* 2. Position Coordinates in Millimeters (X / Y) */}
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
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center bg-white"
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
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Dimensions (Width & Height in mm) */}
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
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center bg-white"
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
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center bg-white"
                      />
                    </div>
                  </div>

                  {/* 4. Typography (Font Size & Font Family) */}
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
                          min="5"
                          max="36"
                          value={selectedField.fontSize}
                          onChange={e => updateFieldProperty('fontSize', parseFloat(e.target.value) || 8)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                          Font Family
                        </label>
                        <select
                          value={selectedField.fontFamily}
                          onChange={e => updateFieldProperty('fontFamily', e.target.value as FontFamily)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-xs"
                        >
                          <option value="Helvetica">Helvetica / Arial</option>
                          <option value="TimesRoman">Times New Roman</option>
                          <option value="Courier">Courier Monospace</option>
                        </select>
                      </div>
                    </div>

                    {/* Weight & Alignment */}
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedField.isBold}
                          onChange={e => updateFieldProperty('isBold', e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">Bold Weight</span>
                      </label>

                      {/* Alignment Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateFieldProperty('alignment', 'left')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'left'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Left
                        </button>
                        <button
                          onClick={() => updateFieldProperty('alignment', 'center')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'center'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Center
                        </button>
                        <button
                          onClick={() => updateFieldProperty('alignment', 'right')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold ${
                            selectedField.alignment === 'right'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Right
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 5. Rotation (0°, 90°, 180°, 270°, or fine angle) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                        Field Rotation
                      </span>
                      <span className="font-mono text-indigo-600 font-bold text-[11px]">
                        {selectedField.rotation || 0}°
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-2">
                      {[0, 90, 180, 270].map(angle => (
                        <button
                          key={angle}
                          onClick={() => updateFieldProperty('rotation', angle)}
                          className={`flex-1 py-1 rounded text-[10px] font-semibold border ${
                            (selectedField.rotation || 0) === angle
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {angle}°
                        </button>
                      ))}
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={selectedField.rotation || 0}
                      onChange={e => updateFieldProperty('rotation', parseInt(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                  </div>

                  {/* 6. Sample Value Input */}
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Sample Preview Text
                    </label>
                    <input
                      type="text"
                      value={selectedField.sampleValue || ''}
                      onChange={e => updateFieldProperty('sampleValue', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-800 bg-white"
                      placeholder="e.g. Dasun Ramasingha"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                  <Sliders className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold">Select a field on the canvas or from the list to edit its properties.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: A4 Page Size & Background Template */}
          {activeTab === 'pageSize' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-5 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">A4 Page Settings</h3>
                <p className="text-slate-500 text-xs">
                  Standard ISO 216 dimensions used across governmental and organizational overtime claims.
                </p>
              </div>

              {/* Standard Dimensions Display */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">Width</span>
                  <span className="text-base font-bold text-slate-800">210 mm</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">8.27 inches</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Height</span>
                  <span className="text-base font-bold text-slate-800">297 mm</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">11.69 inches</span>
                </div>
              </div>

              {/* Orientation Buttons */}
              <div>
                <label className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                  Page Orientation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setTemplate(prev => ({
                        ...prev,
                        pageSize: 'A4',
                        widthMm: 210,
                        heightMm: 297,
                      }))
                    }
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      template.widthMm === 210 && template.heightMm === 297
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Portrait (210 × 297 mm)
                  </button>
                  <button
                    onClick={() =>
                      setTemplate(prev => ({
                        ...prev,
                        pageSize: 'A4',
                        widthMm: 297,
                        heightMm: 210,
                      }))
                    }
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      template.widthMm === 297 && template.heightMm === 210
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Landscape (297 × 210 mm)
                  </button>
                </div>
              </div>

              {/* Background Status & Re-upload */}
              <div className="pt-2 border-t border-slate-100">
                <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                  Background Template
                </span>
                <p className="text-slate-500 mb-3 text-[11px]">
                  Format:{' '}
                  <span className="font-semibold text-slate-700 uppercase">
                    {template.backgroundType || 'image'}
                  </span>{' '}
                  ({template.backgroundImageUrl ? 'Custom uploaded form loaded' : 'Official baseline'})
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload New PDF / Image Template</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: 31-Day Table Configuration */}
          {activeTab === 'table' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Overtime Table Overlay</h3>
                <p className="text-slate-500 text-xs">
                  Configure coordinates for the daily entries grid (1st - 31st days of the month).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Start Y (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={template.tableConfig.startY}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        tableConfig: {
                          ...prev.tableConfig,
                          startY: parseFloat(e.target.value) || 72.8,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Row Height (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={template.tableConfig.rowHeight}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        tableConfig: {
                          ...prev.tableConfig,
                          rowHeight: parseFloat(e.target.value) || 5.4,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Font Size (pt)</label>
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
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Font Family</label>
                  <select
                    value={template.tableConfig.fontFamily}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        tableConfig: {
                          ...prev.tableConfig,
                          fontFamily: e.target.value as FontFamily,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  >
                    <option value="Helvetica">Helvetica</option>
                    <option value="TimesRoman">Times New Roman</option>
                    <option value="Courier">Courier</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Printer Calibration Offset */}
          {activeTab === 'printer' && (
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Hardware Printer Alignment</h3>
                <p className="text-slate-500 text-xs">
                  Global hardware offsets to align prints on pre-printed blank sheets.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Offset X (mm)</label>
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
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Offset Y (mm)</label>
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
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-center"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Create New Template */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Create New Overtime Template</h3>
            <p className="text-xs text-slate-500 mb-4">
              Create a custom A4 template configuration with custom field coordinates.
            </p>

            <form onSubmit={handleCreateNewTemplate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Branch Special Form B"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newTemplateDesc}
                  onChange={e => setNewTemplateDesc(e.target.value)}
                  placeholder="e.g. For regional branch overtime claims"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyFromCurrent}
                    onChange={e => setCopyFromCurrent(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">Copy fields from current template</span>
                    <p className="text-[11px] text-slate-500">
                      Inherits existing coordinates so you don&apos;t have to start from scratch.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition disabled:opacity-50"
                >
                  {isSaving ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Firebase Security Rules Helper & One-Click Copy */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Firestore Security Rules (overtimerequest-prod)
                </h3>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-3 text-xs text-slate-600 flex-1">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900">
                <p className="font-semibold mb-1">
                  How to resolve &quot;Missing or insufficient permissions&quot; in Firebase:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-indigo-800">
                  <li>Click <strong>Copy Rules</strong> below.</li>
                  <li>
                    Open your Firebase Console:{' '}
                    <a
                      href="https://console.firebase.google.com/project/overtimerequest-prod/firestore/rules"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline text-indigo-900 inline-flex items-center gap-0.5"
                    >
                      Firebase Console Rules Tab <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Paste these rules and click <strong>Publish</strong>.</li>
                </ol>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] text-slate-500">firestore.rules</span>
                  <button
                    onClick={handleCopyRules}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition"
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    <span>{copiedRules ? 'Copied to Clipboard!' : 'Copy Rules'}</span>
                  </button>
                </div>

                <pre className="p-3 bg-slate-900 text-indigo-200 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800 max-h-56">
                  {FIRESTORE_RULES_TEXT}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Note: Your templates remain securely cached locally in your browser.
              </span>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test PDF Preview Modal */}
      {isTestPdfOpen && (
        <PDFPreviewModal
          isOpen={isTestPdfOpen}
          pdfUrl={testPdfUrl}
          filename={`${template.name}_Test_Preview.pdf`}
          onClose={() => {
            setIsTestPdfOpen(false);
            if (testPdfUrl) URL.revokeObjectURL(testPdfUrl);
            setTestPdfUrl(null);
          }}
        />
      )}
    </div>
  );
};
