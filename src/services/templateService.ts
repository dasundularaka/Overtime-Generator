import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { TemplateConfig } from '../types';
import { DEFAULT_TEMPLATE } from '../utils/defaultTemplate';
import { saveTemplate as saveTemplateToLocal, getTemplates as getLocalTemplates, deleteTemplate as deleteTemplateFromLocal, saveSettings, getSettings } from '../utils/storage';

const TEMPLATES_COLLECTION = 'templates';

/**
 * Strips undefined properties and optimizes payload size before saving to Firestore
 */
export function sanitizeTemplate(template: TemplateConfig): TemplateConfig {
  const clean: TemplateConfig = {
    id: template.id || `tpl-${Date.now()}`,
    name: (template.name || 'Untitled Template').trim(),
    description: template.description || '',
    isDefault: !!template.isDefault,
    pageSize: template.pageSize || 'A4',
    widthMm: template.widthMm || 210,
    heightMm: template.heightMm || 297,
    backgroundImageUrl: template.backgroundImageUrl || DEFAULT_TEMPLATE.backgroundImageUrl,
    backgroundType: template.backgroundType || 'image',
    printerOffsetX: Number(template.printerOffsetX) || 0,
    printerOffsetY: Number(template.printerOffsetY) || 0,
    updatedAt: new Date().toISOString(),
    fields: (template.fields || []).map(f => ({
      id: f.id,
      name: f.name,
      key: f.key,
      type: f.type,
      x: Number(f.x) || 0,
      y: Number(f.y) || 0,
      width: Number(f.width) || 10,
      height: Number(f.height) || 4,
      fontSize: Number(f.fontSize) || 8,
      fontFamily: f.fontFamily || 'Helvetica',
      isBold: !!f.isBold,
      alignment: f.alignment || 'left',
      rotation: Number(f.rotation) || 0,
      charSpacing: Number(f.charSpacing) || 0,
      isVisible: f.isVisible !== false,
      sampleValue: f.sampleValue || '',
      color: f.color || '#000000',
    })),
    tableConfig: {
      enabled: template.tableConfig?.enabled !== false,
      startY: Number(template.tableConfig?.startY) || 72.8,
      rowHeight: Number(template.tableConfig?.rowHeight) || 5.4,
      maxRows: Number(template.tableConfig?.maxRows) || 31,
      fontSize: Number(template.tableConfig?.fontSize) || 8,
      fontFamily: template.tableConfig?.fontFamily || 'Helvetica',
      isBold: !!template.tableConfig?.isBold,
      columns: {
        date: template.tableConfig?.columns?.date || DEFAULT_TEMPLATE.tableConfig.columns.date,
        day: template.tableConfig?.columns?.day || DEFAULT_TEMPLATE.tableConfig.columns.day,
        reason: template.tableConfig?.columns?.reason || DEFAULT_TEMPLATE.tableConfig.columns.reason,
        startTime: template.tableConfig?.columns?.startTime || DEFAULT_TEMPLATE.tableConfig.columns.startTime,
        endTime: template.tableConfig?.columns?.endTime || DEFAULT_TEMPLATE.tableConfig.columns.endTime,
        totalHours: template.tableConfig?.columns?.totalHours || DEFAULT_TEMPLATE.tableConfig.columns.totalHours,
        ...(template.tableConfig?.columns?.approvedBy ? { approvedBy: template.tableConfig.columns.approvedBy } : {}),
        ...(template.tableConfig?.columns?.breakMinutes ? { breakMinutes: template.tableConfig.columns.breakMinutes } : {}),
        ...(template.tableConfig?.columns?.otHoursClaimed ? { otHoursClaimed: template.tableConfig.columns.otHoursClaimed } : {}),
        ...(template.tableConfig?.columns?.specialHoursClaimed ? { specialHoursClaimed: template.tableConfig.columns.specialHoursClaimed } : {}),
      },
    },
  };

  if (template.createdBy) clean.createdBy = template.createdBy;
  if (template.createdByName) clean.createdByName = template.createdByName;

  return clean;
}

/**
 * Fetch all templates from Cloud Firestore.
 * If empty in Firestore, initializes the standard default template so it's ready.
 */
export async function fetchTemplatesFromFirestore(isAdmin = false): Promise<TemplateConfig[]> {
  try {
    const snap = await getDocs(collection(db, TEMPLATES_COLLECTION));
    if (snap.empty) {
      // If Firestore has no templates yet and user is admin, seed the official default template
      if (isAdmin) {
        const seed = sanitizeTemplate({
          ...DEFAULT_TEMPLATE,
          isDefault: true,
          description: 'Official standard A4 Overtime Claim Form',
        });
        await setDoc(doc(db, TEMPLATES_COLLECTION, seed.id), seed);
        saveTemplateToLocal(seed);
        return [seed];
      }
      // For standard users, return the local default
      return [DEFAULT_TEMPLATE];
    }

    const templates: TemplateConfig[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data() as TemplateConfig;
      templates.push(data);
      saveTemplateToLocal(data); // Sync to local storage cache
    });

    // Sort: Default first, then by name
    templates.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    return templates;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, TEMPLATES_COLLECTION);
    return getLocalTemplates();
  }
}

/**
 * Save or update a template in Cloud Firestore (Admin only)
 */
export async function saveTemplateToFirestore(
  template: TemplateConfig,
  options?: {
    setAsDefault?: boolean;
    userId?: string;
    userName?: string;
  }
): Promise<TemplateConfig> {
  const clean = sanitizeTemplate(template);

  if (options?.userId) clean.createdBy = options.userId;
  if (options?.userName) clean.createdByName = options.userName;
  if (options?.setAsDefault) clean.isDefault = true;

  // Optimistically save to local cache so user work is NEVER lost
  saveTemplateToLocal(clean);

  if (clean.isDefault) {
    const settings = getSettings();
    saveSettings({ ...settings, activeTemplateId: clean.id });
  }

  try {
    if (clean.isDefault) {
      try {
        const batch = writeBatch(db);
        const snap = await getDocs(collection(db, TEMPLATES_COLLECTION));
        snap.forEach(docSnap => {
          if (docSnap.id !== clean.id && docSnap.data().isDefault) {
            batch.update(doc(db, TEMPLATES_COLLECTION, docSnap.id), { isDefault: false });
          }
        });
        batch.set(doc(db, TEMPLATES_COLLECTION, clean.id), clean);
        await batch.commit();
      } catch (batchErr) {
        console.warn('Batch default update fallback to setDoc:', batchErr);
        await setDoc(doc(db, TEMPLATES_COLLECTION, clean.id), clean);
      }
    } else {
      // Direct setDoc for new or custom template
      await setDoc(doc(db, TEMPLATES_COLLECTION, clean.id), clean);
    }

    return clean;
  } catch (err: any) {
    console.warn('Could not write to Cloud Firestore collection, template saved in local cache:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, `${TEMPLATES_COLLECTION}/${clean.id}`);
    } catch (formattedErr) {
      throw formattedErr;
    }
    return clean;
  }
}

/**
 * Sets a specific template as the organization default in Cloud Firestore
 */
export async function setDefaultTemplateInFirestore(templateId: string): Promise<void> {
  try {
    const snap = await getDocs(collection(db, TEMPLATES_COLLECTION));
    const batch = writeBatch(db);

    snap.forEach(docSnap => {
      batch.update(doc(db, TEMPLATES_COLLECTION, docSnap.id), {
        isDefault: docSnap.id === templateId,
      });
    });

    await batch.commit();

    // Update local setting
    const settings = getSettings();
    saveSettings({ ...settings, activeTemplateId: templateId });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${TEMPLATES_COLLECTION}/${templateId}`);
    throw err;
  }
}

/**
 * Delete a custom template from Cloud Firestore
 */
export async function deleteTemplateFromFirestore(templateId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TEMPLATES_COLLECTION, templateId));
    deleteTemplateFromLocal(templateId);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${TEMPLATES_COLLECTION}/${templateId}`);
    throw err;
  }
}

/**
 * Real-time listener for templates.
 * Dispatches live updates to all clients when Admin saves or updates templates.
 */
export function subscribeToTemplates(
  onUpdate: (templates: TemplateConfig[]) => void
): () => void {
  const unsubscribe = onSnapshot(
    collection(db, TEMPLATES_COLLECTION),
    snapshot => {
      const list: TemplateConfig[] = [];
      snapshot.forEach(docSnap => {
        const item = docSnap.data() as TemplateConfig;
        list.push(item);
        saveTemplateToLocal(item);
      });

      if (list.length > 0) {
        list.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.name.localeCompare(b.name);
        });
        onUpdate(list);
      } else {
        onUpdate([DEFAULT_TEMPLATE]);
      }
    },
    error => {
      handleFirestoreError(error, OperationType.LIST, TEMPLATES_COLLECTION);
    }
  );

  return unsubscribe;
}

/**
 * Resizes an image before encoding to base64 DataURL so it fits safely in Firestore (< 400KB)
 */
export function compressImageFile(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Use JPEG with 0.85 quality to keep size compact
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
