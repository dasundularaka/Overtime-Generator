import {
  FieldPath,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { OperationType, handleFirestoreError } from '../firebase/errors';
import {
  AppNotification,
  NotificationPriority,
  NotificationReadReceipt,
  NotificationTargetScope,
  UserProfile,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreUtils';
import { recordAuditLog } from '../utils/auditLogger';
import {
  ensureGoogleAccessToken,
  sendNotificationEmailViaGmail,
} from './googleWorkspaceService';

const NOTIFICATIONS_COLLECTION = 'notifications';
const LOCAL_NOTIFICATIONS_CACHE_KEY = 'ot_notifications_cache_v1';

export interface PriorityMeta {
  key: NotificationPriority;
  label: string;
  badgeClasses: string;
  solidBadgeClasses: string;
  dotColorClass: string;
  accentBarClass: string;
  ringClass: string;
}

export function getPriorityMeta(priority: NotificationPriority): PriorityMeta {
  switch (priority) {
    case 'high':
      return {
        key: 'high',
        label: 'High',
        badgeClasses: 'bg-red-50 text-red-700 border-red-200',
        solidBadgeClasses: 'bg-red-600 text-white',
        dotColorClass: 'bg-red-600',
        accentBarClass: 'bg-red-600',
        ringClass: 'ring-red-200',
      };
    case 'medium':
      return {
        key: 'medium',
        label: 'Medium',
        badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
        solidBadgeClasses: 'bg-amber-500 text-white',
        dotColorClass: 'bg-amber-500',
        accentBarClass: 'bg-amber-500',
        ringClass: 'ring-amber-200',
      };
    case 'low':
    default:
      return {
        key: 'low',
        label: 'Low',
        badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        solidBadgeClasses: 'bg-emerald-600 text-white',
        dotColorClass: 'bg-emerald-600',
        accentBarClass: 'bg-emerald-600',
        ringClass: 'ring-emerald-200',
      };
  }
}

export function readCachedNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedNotifications(list: AppNotification[]): void {
  try {
    localStorage.setItem(LOCAL_NOTIFICATIONS_CACHE_KEY, JSON.stringify(list.slice(0, 120)));
  } catch {
    // ignore storage quota errors
  }
}

export function isNotificationForUser(
  notification: AppNotification,
  user: UserProfile | null,
  fallbackUid?: string
): boolean {
  const uid = user?.id || fallbackUid || '';
  if (!uid && !user) return false;

  if (notification.targetScope === 'all') {
    return true;
  }

  if (notification.targetScope === 'branch') {
    if (uid && Array.isArray(notification.targetUserIds) && notification.targetUserIds.includes(uid)) {
      return true;
    }
    const targetBranch = (notification.targetBranch || '').trim().toLowerCase();
    const userBranch = (user?.branch || '').trim().toLowerCase();
    if (targetBranch && userBranch && targetBranch === userBranch) {
      return true;
    }
    const targetCode = (notification.targetBranchCode || '').trim().toLowerCase();
    const userCode = (user?.branchCode || '').trim().toLowerCase();
    if (targetCode && userCode && targetCode === userCode) {
      return true;
    }
    return false;
  }

  return uid ? Array.isArray(notification.targetUserIds) && notification.targetUserIds.includes(uid) : false;
}

export function hasUserReadNotification(
  notification: AppNotification,
  userId?: string | null
): boolean {
  if (!userId) return false;
  return Boolean(
    (Array.isArray(notification.readBy) && notification.readBy.includes(userId)) ||
      (notification.readReceipts && Boolean(notification.readReceipts[userId]))
  );
}

export function getUserReadTimestamp(
  notification: AppNotification,
  userId?: string | null
): string | null {
  if (!userId || !notification.readReceipts) return null;
  return notification.readReceipts[userId]?.readAt || null;
}

export function isNotificationUnreadForUser(
  notification: AppNotification,
  userId?: string | null
): boolean {
  if (!userId) return false;
  // Do not mark an admin's own branch/org-wide broadcast as unread for themselves
  if (notification.senderId === userId && notification.targetScope !== 'users') {
    return false;
  }
  return !hasUserReadNotification(notification, userId);
}

export function subscribeToNotifications(
  onUpdate: (notifications: AppNotification[], newAdded: AppNotification[]) => void
): () => void {
  const initialCache = readCachedNotifications();
  if (initialCache.length > 0) {
    onUpdate(initialCache, []);
  }

  const colPath = NOTIFICATIONS_COLLECTION;
  let isFirstSnapshot = true;

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(150)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: AppNotification[] = snapshot.docs.map((d) => {
          const data = d.data() as AppNotification;
          return {
            ...data,
            id: data.id || d.id,
            readBy: Array.isArray(data.readBy) ? data.readBy : [],
            readReceipts:
              data.readReceipts && typeof data.readReceipts === 'object' ? data.readReceipts : {},
            targetUserIds: Array.isArray(data.targetUserIds) ? data.targetUserIds : [],
          };
        });

        const newlyAdded: AppNotification[] = [];
        if (!isFirstSnapshot) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data() as AppNotification;
              newlyAdded.push({
                ...data,
                id: data.id || change.doc.id,
                readBy: Array.isArray(data.readBy) ? data.readBy : [],
                readReceipts:
                  data.readReceipts && typeof data.readReceipts === 'object'
                    ? data.readReceipts
                    : {},
                targetUserIds: Array.isArray(data.targetUserIds) ? data.targetUserIds : [],
              });
            }
          });
        }
        isFirstSnapshot = false;

        writeCachedNotifications(list);
        onUpdate(list, newlyAdded);
      },
      (error) => {
        console.warn('Notifications snapshot listener fallback:', colPath, error);
        onUpdate(readCachedNotifications(), []);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to notifications:', err);
    onUpdate(readCachedNotifications(), []);
    return () => {};
  }
}

export interface SendNotificationInput {
  heading: string;
  body: string;
  priority: NotificationPriority;
  imageUrl?: string;
  targetScope: NotificationTargetScope;
  targetBranch?: string;
  targetBranchCode?: string;
  selectedUserIds: string[];
  allUsers: UserProfile[];
  sendViaApp: boolean;
  sendViaEmail: boolean;
  sender: UserProfile;
  isSuperAdmin: boolean;
}

export interface SendNotificationResult {
  notification: AppNotification;
  emailSentCount: number;
  emailFailedCount: number;
  emailError?: string;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const cleanHeading = input.heading.trim();
  const cleanBody = input.body.trim();

  if (!cleanHeading) throw new Error('Please enter a notification heading.');
  if (!cleanBody) throw new Error('Please enter a notification message body.');
  if (!input.sendViaApp && !input.sendViaEmail) {
    throw new Error('Select at least one delivery channel (App or Email).');
  }

  const isAdminSender = input.isSuperAdmin || input.sender.role === 'admin' || input.sender.role === 'super_admin';
  if (!isAdminSender) {
    throw new Error('Only administrators can broadcast notifications.');
  }

  // Enforce strict role-based branch isolation:
  // Regular admins can ONLY notify users in their own assigned branch.
  const senderBranch = (input.sender.branch || '').trim();
  const effectiveTargetBranch = input.isSuperAdmin
    ? (input.targetBranch || 'ALL').trim()
    : senderBranch;

  if (!input.isSuperAdmin && !senderBranch) {
    throw new Error('Your administrator profile does not have an assigned branch.');
  }

  // Resolve target user records
  const branchFilteredUsers =
    effectiveTargetBranch === 'ALL'
      ? input.allUsers
      : input.allUsers.filter(
          (u) => (u.branch || '').trim().toLowerCase() === effectiveTargetBranch.toLowerCase()
        );

  const isAllUsersSelected =
    input.selectedUserIds.length === 0 || input.selectedUserIds.includes('ALL');

  const rawRecipients = isAllUsersSelected
    ? branchFilteredUsers
    : branchFilteredUsers.filter((u) => input.selectedUserIds.includes(u.id));

  let effectiveScope: NotificationTargetScope = 'users';
  if (input.isSuperAdmin && effectiveTargetBranch === 'ALL' && isAllUsersSelected) {
    effectiveScope = 'all';
  } else if (effectiveTargetBranch !== 'ALL' && isAllUsersSelected) {
    effectiveScope = 'branch';
  } else {
    effectiveScope = 'users';
  }

  // Exclude sender from recipient read-receipt target count for org/branch broadcasts
  // unless they are the only user (solo test scenario) or explicitly targeted by user.
  const nonSenderRecipients = rawRecipients.filter((u) => u.id !== input.sender.id);
  const resolvedRecipients =
    effectiveScope !== 'users' && nonSenderRecipients.length > 0
      ? nonSenderRecipients
      : rawRecipients;

  const resolvedUserIds = Array.from(
    new Set(resolvedRecipients.map((u) => u.id).filter(Boolean))
  ).slice(0, 1000);

  if (effectiveScope === 'users' && resolvedUserIds.length === 0) {
    throw new Error('Please select at least one recipient user.');
  }

  const targetLabel =
    effectiveScope === 'all'
      ? 'All Branches · All Users'
      : effectiveScope === 'branch'
      ? `${effectiveTargetBranch}${input.targetBranchCode ? ` (#${input.targetBranchCode})` : ''} · All Branch Users`
      : resolvedRecipients.length === 1
      ? `${resolvedRecipients[0].name} (${resolvedRecipients[0].branch || effectiveTargetBranch})`
      : `${resolvedRecipients.length} Selected Users (${effectiveTargetBranch === 'ALL' ? 'Multi-Branch' : effectiveTargetBranch})`;

  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();

  const notificationRecord: AppNotification = {
    id,
    heading: cleanHeading.slice(0, 160),
    body: cleanBody.slice(0, 4000),
    priority: input.priority,
    ...(input.imageUrl?.trim() ? { imageUrl: input.imageUrl.trim() } : {}),
    targetScope: effectiveScope,
    targetLabel: targetLabel.slice(0, 200),
    ...(effectiveTargetBranch !== 'ALL' ? { targetBranch: effectiveTargetBranch.slice(0, 120) } : {}),
    ...(input.targetBranchCode?.trim() ? { targetBranchCode: input.targetBranchCode.trim().slice(0, 40) } : {}),
    targetUserIds: resolvedUserIds,
    recipientCount: resolvedRecipients.length,
    sendViaApp: input.sendViaApp,
    sendViaEmail: input.sendViaEmail,
    emailDispatchStatus: input.sendViaEmail ? 'sent' : 'not_requested',
    emailDispatchedCount: 0,
    senderId: input.sender.id,
    senderName: (input.sender.name || 'Administrator').slice(0, 120),
    ...(input.sender.email ? { senderEmail: input.sender.email.slice(0, 160) } : {}),
    senderRole: input.isSuperAdmin ? 'super_admin' : input.sender.role || 'admin',
    senderBranch: (senderBranch || 'Head Office').slice(0, 120),
    readBy: [],
    readReceipts: {},
    createdAt: nowIso,
  };

  let emailSentCount = 0;
  let emailFailedCount = 0;
  let emailError: string | undefined;

  if (input.sendViaEmail) {
    const recipientsWithEmail = resolvedRecipients.filter(
      (u) => typeof u.email === 'string' && u.email.includes('@')
    );

    if (recipientsWithEmail.length === 0) {
      notificationRecord.emailDispatchStatus = 'failed';
      emailError = 'No selected recipients have valid email addresses.';
    } else {
      try {
        await ensureGoogleAccessToken();
        for (const recipient of recipientsWithEmail) {
          try {
            await sendNotificationEmailViaGmail({
              to: recipient.email,
              recipientName: recipient.name,
              heading: notificationRecord.heading,
              body: notificationRecord.body,
              priority: notificationRecord.priority,
              imageUrl: notificationRecord.imageUrl,
              senderName: notificationRecord.senderName,
              senderBranch: notificationRecord.senderBranch,
            });
            emailSentCount += 1;
          } catch (err: any) {
            emailFailedCount += 1;
            if (!emailError) emailError = err?.message || 'Email dispatch failed';
          }
        }
        notificationRecord.emailDispatchedCount = emailSentCount;
        notificationRecord.emailDispatchStatus =
          emailSentCount > 0 && emailFailedCount === 0
            ? 'sent'
            : emailSentCount > 0
            ? 'partial'
            : 'failed';
      } catch (authErr: any) {
        notificationRecord.emailDispatchStatus = 'failed';
        emailFailedCount = recipientsWithEmail.length;
        emailError = authErr?.message || 'Google Workspace authorization required for email dispatch.';
      }
    }
  }

  const docPath = `${NOTIFICATIONS_COLLECTION}/${id}`;
  try {
    await setDoc(doc(db, NOTIFICATIONS_COLLECTION, id), sanitizeFirestoreData(notificationRecord));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }

  await recordAuditLog({
    action: 'NOTIFICATION_SEND',
    actionLabel: `Sent ${getPriorityMeta(input.priority).label} Priority Notification`,
    targetType: 'notification',
    targetId: id,
    targetDescription: `${notificationRecord.heading} -> ${targetLabel}`,
    afterState: {
      heading: notificationRecord.heading,
      priority: notificationRecord.priority,
      targetScope: notificationRecord.targetScope,
      targetLabel,
      sendViaApp: notificationRecord.sendViaApp,
      sendViaEmail: notificationRecord.sendViaEmail,
      recipientCount: resolvedRecipients.length,
    },
  });

  return {
    notification: notificationRecord,
    emailSentCount,
    emailFailedCount,
    emailError,
  };
}

export type ReaderProfileSummary = Pick<
  UserProfile,
  'name' | 'branch' | 'employeeNumber' | 'pfNumber'
>;

export async function markNotificationAsRead(
  notificationId: string,
  userId?: string | null,
  readerProfile?: ReaderProfileSummary | null
): Promise<void> {
  if (!notificationId || !userId) return;
  const docPath = `${NOTIFICATIONS_COLLECTION}/${notificationId}`;
  const readAt = new Date().toISOString();
  const receipt: NotificationReadReceipt = {
    userId,
    readAt,
    ...(readerProfile?.name ? { userName: readerProfile.name.slice(0, 120) } : {}),
    ...(readerProfile?.employeeNumber || readerProfile?.pfNumber
      ? {
          userPfNumber: String(
            readerProfile.employeeNumber || readerProfile.pfNumber
          ).slice(0, 40),
        }
      : {}),
    ...(readerProfile?.branch ? { userBranch: readerProfile.branch.slice(0, 120) } : {}),
  };

  // Update local cache optimistically for instant UI feedback
  try {
    const cached = readCachedNotifications();
    if (cached.length > 0) {
      const nextCached = cached.map((item) => {
        if (item.id !== notificationId) return item;
        const nextReadBy = Array.from(new Set([...(item.readBy || []), userId]));
        const existingReceipt = item.readReceipts?.[userId];
        return {
          ...item,
          readBy: nextReadBy,
          readReceipts: {
            ...(item.readReceipts || {}),
            [userId]: existingReceipt || receipt,
          },
        };
      });
      writeCachedNotifications(nextCached);
    }
  } catch {
    // ignore local cache error
  }

  try {
    await updateDoc(
      doc(db, NOTIFICATIONS_COLLECTION, notificationId),
      new FieldPath('readBy'),
      arrayUnion(userId),
      new FieldPath('readReceipts', userId),
      sanitizeFirestoreData(receipt)
    );
  } catch (error) {
    console.warn('Could not mark notification read:', docPath, error);
  }
}

export async function markAllNotificationsAsRead(
  notifications: AppNotification[],
  userId?: string | null,
  readerProfile?: ReaderProfileSummary | null
): Promise<void> {
  if (!userId) return;
  const unread = notifications.filter((n) => isNotificationUnreadForUser(n, userId));
  await Promise.all(unread.map((n) => markNotificationAsRead(n.id, userId, readerProfile)));
}

export interface NotificationRecipientReceipt {
  userId: string;
  name: string;
  pfNumber?: string;
  branch?: string;
  hasRead: boolean;
  readAt?: string;
}

export interface NotificationReadSummary {
  totalRecipients: number;
  openedCount: number;
  unopenedCount: number;
  openRatePercent: number;
  recipients: NotificationRecipientReceipt[];
}

export function getNotificationReadSummary(
  notification: AppNotification,
  allUsers: UserProfile[] = []
): NotificationReadSummary {
  const userMap = new Map<string, UserProfile>();
  allUsers.forEach((u) => {
    if (u.id) userMap.set(u.id, u);
  });

  // Determine canonical target recipient IDs
  let targetIds = Array.isArray(notification.targetUserIds)
    ? Array.from(new Set(notification.targetUserIds.filter(Boolean)))
    : [];

  // Fallback for legacy org/branch broadcasts created before targetUserIds populated
  if (targetIds.length === 0 && allUsers.length > 0) {
    if (notification.targetScope === 'all') {
      targetIds = allUsers
        .map((u) => u.id)
        .filter((id) => id && id !== notification.senderId);
    } else if (notification.targetScope === 'branch' && notification.targetBranch) {
      const targetBranchLower = notification.targetBranch.trim().toLowerCase();
      targetIds = allUsers
        .filter((u) => (u.branch || '').trim().toLowerCase() === targetBranchLower)
        .map((u) => u.id)
        .filter((id) => id && id !== notification.senderId);
    }
  }

  const targetSet = new Set(targetIds);
  const receiptMap = notification.readReceipts || {};
  const rawReaders = new Set<string>([
    ...(Array.isArray(notification.readBy) ? notification.readBy : []),
    ...Object.keys(receiptMap),
  ]);

  // For non-user-specific broadcasts created with legacy sender auto-read (no receipt entry),
  // avoid counting sender as a recipient open unless they are explicitly in targetSet & have a receipt or no other targets exist.
  const validReaderIds = Array.from(rawReaders).filter((readerId) => {
    if (!readerId) return false;
    if (
      readerId === notification.senderId &&
      notification.targetScope !== 'users' &&
      !receiptMap[readerId] &&
      targetIds.length > 1
    ) {
      return false;
    }
    return targetSet.size > 0 ? targetSet.has(readerId) : readerId !== notification.senderId;
  });

  const validReaderSet = new Set(validReaderIds);

  // Include any targeted user + any unexpected reader
  const combinedIds = Array.from(new Set([...targetIds, ...validReaderIds]));
  const recipients: NotificationRecipientReceipt[] = combinedIds.map((uid) => {
    const profile = userMap.get(uid);
    const receipt = receiptMap[uid];
    const hasRead = validReaderSet.has(uid);
    return {
      userId: uid,
      name: receipt?.userName || profile?.name || 'Staff Member',
      pfNumber: receipt?.userPfNumber || profile?.employeeNumber || profile?.pfNumber,
      branch: receipt?.userBranch || profile?.branch || notification.targetBranch,
      hasRead,
      readAt: receipt?.readAt,
    };
  });

  recipients.sort((a, b) => {
    if (a.hasRead !== b.hasRead) return a.hasRead ? -1 : 1;
    if (a.hasRead && b.hasRead && a.readAt && b.readAt) {
      return b.readAt.localeCompare(a.readAt);
    }
    return a.name.localeCompare(b.name);
  });

  const totalRecipients = Math.max(
    combinedIds.length,
    typeof notification.recipientCount === 'number' ? notification.recipientCount : 0
  );
  const openedCount = validReaderIds.length;
  const unopenedCount = Math.max(0, totalRecipients - openedCount);
  const openRatePercent =
    totalRecipients > 0 ? Math.min(100, Math.round((openedCount / totalRecipients) * 100)) : 0;

  return {
    totalRecipients,
    openedCount,
    unopenedCount,
    openRatePercent,
    recipients,
  };
}

export async function deleteNotificationById(
  notification: AppNotification
): Promise<void> {
  const docPath = `${NOTIFICATIONS_COLLECTION}/${notification.id}`;
  try {
    await deleteDoc(doc(db, NOTIFICATIONS_COLLECTION, notification.id));
    await recordAuditLog({
      action: 'NOTIFICATION_DELETE',
      actionLabel: 'Deleted Notification',
      targetType: 'notification',
      targetId: notification.id,
      targetDescription: notification.heading,
      beforeState: {
        heading: notification.heading,
        priority: notification.priority,
        targetLabel: notification.targetLabel,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

/**
 * Compresses an uploaded image file to stay well inside Firestore document size limits.
 */
export async function compressNotificationImage(
  file: File,
  maxWidth = 960,
  maxChars = 420000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file selected.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser canvas unavailable for image compression.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxChars && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > maxChars) {
          reject(new Error('Image is too large even after compression. Please pick a smaller image or paste an image URL.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
