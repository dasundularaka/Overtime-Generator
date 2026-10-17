const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tempDir = '/tmp/clock_gif_frames';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const TOTAL_FRAMES = 48; // Smooth 48-frame loop
const SIZE = 256;
const CX = 128;
const CY = 128;

console.log(`Rendering ${TOTAL_FRAMES} frames for transparent infinite clock GIF...`);

for (let i = 0; i < TOTAL_FRAMES; i++) {
  // Hour hand completes 1 full 360-degree rotation across the 48 frames
  const hourDeg = (i / TOTAL_FRAMES) * 360;
  // Minute hand completes 3 full 360-degree rotations (slower than frantic, faster than hour)
  const minDeg = ((i * 3) / TOTAL_FRAMES) * 360;

  const hourRad = (hourDeg * Math.PI) / 180;
  const minRad = (minDeg * Math.PI) / 180;

  // Hour hand coords
  const hLen = 64;
  const hTail = 18;
  const hW = 5.5;
  const hx = CX + hLen * Math.sin(hourRad);
  const hy = CY - hLen * Math.cos(hourRad);
  const htx = CX - hTail * Math.sin(hourRad);
  const hty = CY + hTail * Math.cos(hourRad);
  const hpx = hW * Math.cos(hourRad);
  const hpy = hW * Math.sin(hourRad);

  const hPoly = [
    `${CX - hpx},${CY - hpy}`,
    `${hx - hpx * 0.4},${hy - hpy * 0.4}`,
    `${hx},${hy}`,
    `${hx + hpx * 0.4},${hy + hpy * 0.4}`,
    `${CX + hpx},${CY + hpy}`,
    `${htx + hpx * 0.7},${hty + hpy * 0.7}`,
    `${htx - hpx * 0.7},${hty - hpy * 0.7}`
  ].join(' ');

  // Minute hand coords
  const mLen = 96;
  const mTail = 22;
  const mW = 3.5;
  const mx = CX + mLen * Math.sin(minRad);
  const my = CY - mLen * Math.cos(minRad);
  const mtx = CX - mTail * Math.sin(minRad);
  const mty = CY + mTail * Math.cos(minRad);
  const mpx = mW * Math.cos(minRad);
  const mpy = mW * Math.sin(minRad);

  const mPoly = [
    `${CX - mpx},${CY - mpy}`,
    `${mx - mpx * 0.3},${my - mpy * 0.3}`,
    `${mx},${my}`,
    `${mx + mpx * 0.3},${my + mpy * 0.3}`,
    `${CX + mpx},${CY + mpy}`,
    `${mtx + mpx * 0.6},${mty + mpy * 0.6}`,
    `${mtx - mpx * 0.6},${mty - mpy * 0.6}`
  ].join(' ');

  // Secondary hour tick dots
  let ticksDraw = '';
  for (let h = 1; h <= 12; h++) {
    if (h % 3 === 0) continue; // 3, 6, 9, 12 are primary ticks
    const rad = (h * 30 * Math.PI) / 180;
    const tx = CX + 108 * Math.sin(rad);
    const ty = CY - 108 * Math.cos(rad);
    ticksDraw += ` fill "#94a3b8" circle ${tx},${ty} ${tx + 3.2},${ty}`;
  }

  // Draw frame with convert:
  // - Transparent background
  // - NO outline circle
  // - 4 major tick pills at 12, 3, 6, 9
  // - 8 secondary dots
  // - Hour hand polygon (#4f46e5)
  // - Minute hand polygon (#0284c7)
  // - Concentric central hub
  const frameCmd = `convert -size ${SIZE}x${SIZE} xc:none \
    -fill "#6366f1" -draw "roundrectangle 124,14 132,32 4,4" \
    -fill "#6366f1" -draw "roundrectangle 224,124 242,132 4,4" \
    -fill "#6366f1" -draw "roundrectangle 124,224 132,242 4,4" \
    -fill "#6366f1" -draw "roundrectangle 14,124 32,132 4,4" \
    -draw "${ticksDraw}" \
    -fill "#4f46e5" -draw "polygon ${hPoly}" \
    -fill "#0284c7" -draw "polygon ${mPoly}" \
    -fill "#1e1b4b" -stroke "#6366f1" -strokewidth 2 -draw "circle ${CX},${CY} ${CX + 10},${CY}" \
    -fill "#38bdf8" -stroke none -draw "circle ${CX},${CY} ${CX + 5},${CY}" \
    -fill "#ffffff" -stroke none -draw "circle ${CX},${CY} ${CX + 2},${CY}" \
    ${tempDir}/frame_${String(i).padStart(3, '0')}.png`;

  execSync(frameCmd);
}

console.log('Assembling GIF with ImageMagick convert...');
// Combine into infinite looping GIF with transparent background
execSync(`convert -delay 10 -dispose previous ${tempDir}/frame_*.png -loop 0 public/infinite-clock.gif`);
console.log('Generated public/infinite-clock.gif');

// Also create PNG versions for PWA and favicon
execSync(`convert ${tempDir}/frame_000.png -resize 192x192 public/pwa-192x192.png`);
execSync(`convert ${tempDir}/frame_000.png -resize 512x512 public/pwa-512x512.png`);
execSync(`convert ${tempDir}/frame_000.png -resize 512x512 public/pwa-maskable-512x512.png`);
execSync(`convert ${tempDir}/frame_000.png -resize 180x180 public/apple-touch-icon.png`);
execSync(`convert ${tempDir}/frame_000.png -resize 48x48 public/favicon.ico`);
console.log('Generated PWA and app icons.');

// Clean up frames
fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Done!');
