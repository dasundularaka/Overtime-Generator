/**
 * Zero-dependency CI script to publish an instant OTA release signal to Firebase Firestore
 * right after Vercel completes a production deployment.
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  - Full JSON of a Firebase/GCP service account with Firestore write access
 * Optional environment variables:
 *   DEPLOYMENT_URL                 - Live Vercel deployment URL (used to fetch /version.json)
 *   FIREBASE_PROJECT_ID            - Overrides project_id from service account or firebase-applet-config.json
 *   FIREBASE_DATABASE_ID           - Firestore database ID (default: '(default)')
 *   RELEASE_NOTES                  - Optional release message shown in Settings / update toast
 *   GITHUB_SHA                     - Fallback commit SHA if DEPLOYMENT_URL is omitted
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claimSet)
  )}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = base64UrlEncode(signer.sign(serviceAccount.private_key));
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch(claimSet.aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to mint Google OAuth access token (${tokenRes.status}): ${errText}`);
  }
  const tokenJson = await tokenRes.json();
  return tokenJson.access_token;
}

async function fetchDeployedVersion(deploymentUrl) {
  if (!deploymentUrl) return null;
  const normalizedUrl = deploymentUrl.startsWith('http')
    ? deploymentUrl.replace(/\/$/, '')
    : `https://${deploymentUrl.replace(/\/$/, '')}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${normalizedUrl}/version.json?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.version) return data;
      }
    } catch {
      // retry briefly in case edge propagation is still warming
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function main() {
  const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawSa) {
    console.log('FIREBASE_SERVICE_ACCOUNT_JSON secret not set; skipping Firestore push notification.');
    console.log('Open tabs will still detect the new Vercel deployment via /version.json checks.');
    return;
  }

  const serviceAccount = JSON.parse(rawSa);
  let fallbackProjectId = serviceAccount.project_id;
  let fallbackDbId = '(default)';

  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      fallbackProjectId = cfg.projectId || fallbackProjectId;
      fallbackDbId = cfg.firestoreDatabaseId || fallbackDbId;
    }
  } catch {
    // ignore local config lookup errors
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || fallbackProjectId;
  const databaseId = process.env.FIREBASE_DATABASE_ID || fallbackDbId;

  const deployedMeta = await fetchDeployedVersion(process.env.DEPLOYMENT_URL);
  const nowIso = new Date().toISOString();
  const shaShort = (process.env.GITHUB_SHA || 'manual').slice(0, 8);
  const version = deployedMeta?.version || `${nowIso.replace(/[-:T.Z]/g, '').slice(0, 14)}-${shaShort}`;
  const buildTime = deployedMeta?.buildTime || nowIso;
  const commitSha = deployedMeta?.commitSha || shaShort;
  const releaseNotes = (process.env.RELEASE_NOTES || 'Automatic production deployment').slice(0, 200);

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/systemConfig/appRelease`;

  const body = {
    fields: {
      id: { stringValue: 'appRelease' },
      version: { stringValue: version },
      buildTime: { stringValue: buildTime },
      commitSha: { stringValue: commitSha },
      releaseNotes: { stringValue: releaseNotes },
      forceImmediate: { booleanValue: true },
      broadcastId: { stringValue: `rel_${Date.now()}` },
      updatedAt: { stringValue: nowIso },
      updatedBy: { stringValue: process.env.GITHUB_ACTOR || 'github-actions' },
    },
  };

  const res = await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update Firestore systemConfig/appRelease (${res.status}): ${text}`);
  }

  console.log(`Published OTA release signal to Firestore: version=${version} (project=${projectId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
