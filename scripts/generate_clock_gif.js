import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Output dimensions
const OUT_W = 160;
const OUT_H = 160;
// Render at 2x supersampling for ultra-crisp anti-aliasing
const SCALE = 2;
const W = OUT_W * SCALE;
const H = OUT_H * SCALE;

const framesDir = '/tmp/clock_supersample';
if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

// 60 frames at 20fps = 3.0s total cycle (smooth, slow, continuous)
const totalFrames = 60;
const cx = W / 2;
const cy = H / 2;

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

console.log('Rendering 60 transparent frames with infinite continuous slow rotation...');

for (let f = 0; f < totalFrames; f++) {
  // High-res RGBA buffer
  const hiBuf = Buffer.alloc(W * H * 4);
  const progress = f / totalFrames;

  // Rotational angles (starts at top 12 o'clock = -Math.PI / 2)
  // 1. Hour hand: 1 full 360-degree continuous rotation (slowest)
  const hourAngle = -Math.PI / 2 + progress * 2 * Math.PI;

  // 2. Minute hand: 3 full 360-degree continuous rotations (faster than hour hand)
  const minAngle = -Math.PI / 2 + progress * 3 * 2 * Math.PI;

  // 3. Second hand: 6 full 360-degree continuous rotations (sleek sweep)
  const secAngle = -Math.PI / 2 + progress * 6 * 2 * Math.PI;

  // Geometry dimensions in supersampled space
  const markerRadius = 124;
  const hourLen = 64;
  const hourTail = 16;
  const minLen = 100;
  const minTail = 20;
  const secLen = 114;
  const secTail = 28;

  // Coordinates for Hour Hand
  const hx1 = cx - Math.cos(hourAngle) * hourTail;
  const hy1 = cy - Math.sin(hourAngle) * hourTail;
  const hx2 = cx + Math.cos(hourAngle) * hourLen;
  const hy2 = cy + Math.sin(hourAngle) * hourLen;

  // Coordinates for Minute Hand
  const mx1 = cx - Math.cos(minAngle) * minTail;
  const my1 = cy - Math.sin(minAngle) * minTail;
  const mx2 = cx + Math.cos(minAngle) * minLen;
  const my2 = cy + Math.sin(minAngle) * minLen;

  // Coordinates for Second Hand
  const sx1 = cx - Math.cos(secAngle) * secTail;
  const sy1 = cy - Math.sin(secAngle) * secTail;
  const sx2 = cx + Math.cos(secAngle) * secLen;
  const sy2 = cy + Math.sin(secAngle) * secLen;

  // Pre-calculate 12 Floating Hour Markers (NO OUTLINE CIRCLE!)
  const markers = [];
  for (let m = 0; m < 12; m++) {
    const ang = -Math.PI / 2 + (m / 12) * 2 * Math.PI;
    const isMajor = m % 3 === 0;
    const rStart = isMajor ? markerRadius - 16 : markerRadius - 10;
    const rEnd = markerRadius;
    markers.push({
      x1: cx + Math.cos(ang) * rStart,
      y1: cy + Math.sin(ang) * rStart,
      x2: cx + Math.cos(ang) * rEnd,
      y2: cy + Math.sin(ang) * rEnd,
      isMajor,
    });
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const d = dist(x, y, cx, cy);

      // Default: 100% transparent background (NO circle background, NO outline circle!)
      let r = 0, g = 0, b = 0, a = 0;

      // 1. Render 12 Floating Dial Markers
      for (const m of markers) {
        const dSeg = distToSegment(x, y, m.x1, m.y1, m.x2, m.y2);
        const radius = m.isMajor ? 4.2 : 2.5;
        if (dSeg < radius) {
          const alphaFactor = Math.min(1, Math.max(0, (radius - dSeg) / 1.0));
          if (m.isMajor) {
            // Indigo-600 #4f46e5
            r = 79; g = 70; b = 229;
          } else {
            // Blue-500 #3b82f6
            r = 59; g = 130; b = 246;
          }
          a = Math.round(alphaFactor * 255);
        }
      }

      // 2. Hour Hand (shorter, solid, rich indigo #4338ca with rounded cap)
      const dHour = distToSegment(x, y, hx1, hy1, hx2, hy2);
      if (dHour < 7.0) {
        const alphaFactor = Math.min(1, Math.max(0, (7.0 - dHour) / 1.2));
        r = 67; g = 56; b = 202; // #4338ca
        a = Math.max(a, Math.round(alphaFactor * 255));
      }

      // 3. Minute Hand (longer, sleek sapphire #2563eb / #1d4ed8)
      const dMin = distToSegment(x, y, mx1, my1, mx2, my2);
      if (dMin < 5.0) {
        const alphaFactor = Math.min(1, Math.max(0, (5.0 - dMin) / 1.2));
        r = 29; g = 78; b = 216; // #1d4ed8
        a = Math.max(a, Math.round(alphaFactor * 255));
      }

      // 4. Second Hand (delicate vibrant cyan/sky needle with counterweight #0284c7)
      const dSec = distToSegment(x, y, sx1, sy1, sx2, sy2);
      if (dSec < 2.5) {
        const alphaFactor = Math.min(1, Math.max(0, (2.5 - dSec) / 1.0));
        r = 2; g = 132; b = 199; // #0284c7 vibrant cyan-blue
        a = Math.max(a, Math.round(alphaFactor * 255));
      }
      // Second hand tail circle counterweight
      const dTail = dist(x, y, sx1, sy1);
      if (dTail < 6.0) {
        const alphaFactor = Math.min(1, Math.max(0, (6.0 - dTail) / 1.0));
        r = 2; g = 132; b = 199;
        a = Math.max(a, Math.round(alphaFactor * 255));
      }

      // 5. Center Hub / Pivot Assembly
      // Outer brass/indigo hub ring (radius 14)
      if (d < 14.0) {
        const alphaFactor = Math.min(1, Math.max(0, (14.0 - d) / 1.2));
        r = 30; g = 41; b = 59; // Slate-800
        a = Math.max(a, Math.round(alphaFactor * 255));
      }
      // Inner metallic core (radius 10)
      if (d < 10.0) {
        r = 79; g = 70; b = 229; // Indigo-600
        a = 255;
      }
      // Center jewel pin (radius 4.5)
      if (d < 4.5) {
        r = 248; g = 250; b = 252; // Crisp silver white
        a = 255;
      }

      hiBuf[idx] = r;
      hiBuf[idx + 1] = g;
      hiBuf[idx + 2] = b;
      hiBuf[idx + 3] = a;
    }
  }

  // Downsample 2x to OUT_W x OUT_H using box filter with gamma correction
  const outBuf = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let oy = 0; oy < OUT_H; oy++) {
    for (let ox = 0; ox < OUT_W; ox++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const iy = oy * SCALE + sy;
          const ix = ox * SCALE + sx;
          const iIdx = (iy * W + ix) * 4;
          const aVal = hiBuf[iIdx + 3] / 255;
          sumR += hiBuf[iIdx] * aVal;
          sumG += hiBuf[iIdx + 1] * aVal;
          sumB += hiBuf[iIdx + 2] * aVal;
          sumA += hiBuf[iIdx + 3];
        }
      }
      const count = SCALE * SCALE;
      const avgA = sumA / count;
      const oIdx = (oy * OUT_W + ox) * 4;
      if (avgA > 0) {
        const normFactor = 255 / (avgA * count);
        outBuf[oIdx] = Math.min(255, Math.round(sumR * normFactor));
        outBuf[oIdx + 1] = Math.min(255, Math.round(sumG * normFactor));
        outBuf[oIdx + 2] = Math.min(255, Math.round(sumB * normFactor));
        outBuf[oIdx + 3] = Math.min(255, Math.round(avgA));
      } else {
        outBuf[oIdx] = 0;
        outBuf[oIdx + 1] = 0;
        outBuf[oIdx + 2] = 0;
        outBuf[oIdx + 3] = 0;
      }
    }
  }

  // Write PAM RGBA file
  const header = `P7\nWIDTH ${OUT_W}\nHEIGHT ${OUT_H}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`;
  const frameFile = `${framesDir}/frame_${String(f).padStart(3, '0')}.pam`;
  fs.writeFileSync(frameFile, Buffer.concat([Buffer.from(header, 'ascii'), outBuf]));
}

console.log('Compiling frames into infinite transparent GIF...');
// Use ImageMagick convert with -dispose Background -delay 5 (20fps, 3s loop) to guarantee clean transparency without trail artifacts
execSync(
  `convert -delay 5 -dispose 2 ${framesDir}/frame_*.pam -loop 0 public/infinite-clock.gif`
);

// Also copy or generate static representations for favicon, touch icons, and PWA
execSync(`convert ${framesDir}/frame_000.pam -resize 32x32 public/favicon.ico`);
execSync(`convert ${framesDir}/frame_000.pam -resize 180x180 public/apple-touch-icon.png`);
execSync(`convert ${framesDir}/frame_000.pam -resize 192x192 public/pwa-192x192.png`);
execSync(`convert ${framesDir}/frame_000.pam -resize 512x512 public/pwa-512x512.png`);

console.log('Clock GIF and asset icons generated successfully!');
