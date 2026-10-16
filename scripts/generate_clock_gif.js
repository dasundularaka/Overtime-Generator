import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const W = 160, H = 160;
const framesDir = '/tmp/clock_frames';
if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

const totalFrames = 30; // 30 frames for smooth 25fps loop (1.2s per full sweep)

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

for (let f = 0; f < totalFrames; f++) {
  const buf = Buffer.alloc(W * H * 3);
  const cx = W / 2, cy = H / 2;
  const progress = f / totalFrames;
  
  // Rotating angles
  const secAngle = progress * 2 * Math.PI - Math.PI / 2;
  const minAngle = progress * 2 * Math.PI - Math.PI / 2;
  const hourAngle = (progress / 12) * 2 * Math.PI - Math.PI / 2 + Math.PI / 4;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 3;
      const d = dist(x, y, cx, cy);

      // Deep dark rounded background / transparent-look deep navy (#0f172a)
      let r = 15, g = 23, b = 42;

      // Outer bezel ring (d between 70 and 77)
      if (d >= 70 && d <= 77) {
        // Glowing gradient bezel ring with rotating light phase
        const bezelAngle = Math.atan2(y - cy, x - cx);
        const t = (Math.sin(bezelAngle - progress * 2 * Math.PI) + 1) / 2;
        r = Math.round(79 + t * (99 - 79));    // #4f46e5 to #6366f1
        g = Math.round(70 + t * (102 - 70));
        b = Math.round(229 + t * (241 - 229));
      } else if (d < 70) {
        // Clock dial face gradient
        const tDial = d / 70;
        r = Math.round(17 + tDial * 15);
        g = Math.round(24 + tDial * 20);
        b = Math.round(39 + tDial * 30); // #111827 to #1e293b

        // 12 Glowing hour ticks
        for (let h = 0; h < 12; h++) {
          const tickAng = (h / 12) * 2 * Math.PI - Math.PI / 2;
          const tx = cx + Math.cos(tickAng) * 58;
          const ty = cy + Math.sin(tickAng) * 58;
          const dt = dist(x, y, tx, ty);
          if (dt < (h % 3 === 0 ? 3.2 : 2.0)) {
            r = 224; g = 231; b = 255; // #e0e7ff
          }
        }

        // Elegant Infinity Symbol (∞) glowing at the center
        // Two connected loops at cx - 14 and cx + 14, radius 12
        const dL = dist(x, y, cx - 14, cy);
        const dR = dist(x, y, cx + 14, cy);
        if ((dL >= 9 && dL <= 13) || (dR >= 9 && dR <= 13)) {
          // Luminous cyan/indigo infinite flow
          const infPhase = Math.atan2(y - cy, x - cx);
          const infGlow = (Math.sin(infPhase + progress * 4 * Math.PI) + 1) / 2;
          r = Math.round(99 + infGlow * 40);
          g = Math.round(102 + infGlow * 120);
          b = Math.round(241);
        }

        // Hour hand (length 34, width ~4)
        const vx = x - cx, vy = y - cy;
        const projHour = vx * Math.cos(hourAngle) + vy * Math.sin(hourAngle);
        const perpHour = Math.abs(-vx * Math.sin(hourAngle) + vy * Math.cos(hourAngle));
        if (projHour >= -7 && projHour <= 34 && perpHour <= 3.2) {
          r = 165; g = 180; b = 252; // #a5b4fc
        }

        // Minute hand (length 48, width ~3)
        const projMin = vx * Math.cos(minAngle) + vy * Math.sin(minAngle);
        const perpMin = Math.abs(-vx * Math.sin(minAngle) + vy * Math.cos(minAngle));
        if (projMin >= -8 && projMin <= 48 && perpMin <= (projMin > 0 ? (projMin < 38 ? 2.5 : 1.5) : 3.0)) {
          r = 255; g = 255; b = 255; // crisp white
        }

        // Continuous sweeping neon second hand (length 58, glowing cyan)
        const projSec = vx * Math.cos(secAngle) + vy * Math.sin(secAngle);
        const perpSec = Math.abs(-vx * Math.sin(secAngle) + vy * Math.cos(secAngle));
        if (projSec >= -12 && projSec <= 58 && perpSec <= 1.2) {
          r = 56; g = 189; b = 248; // #38bdf8 cyan
        }

        // Center hub pin
        if (d < 5.5) {
          r = 255; g = 255; b = 255;
        } else if (d < 8.0) {
          r = 79; g = 70; b = 229;
        }
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
    }
  }

  const ppmHeader = `P6\n${W} ${H}\n255\n`;
  fs.writeFileSync(`${framesDir}/f_${String(f).padStart(3, '0')}.ppm`, Buffer.concat([Buffer.from(ppmHeader), buf]));
}

console.log('Rendering high quality looping GIF with palettegen...');
execSync('ffmpeg -y -framerate 25 -i /tmp/clock_frames/f_%03d.ppm -filter_complex "[0:v] split [a][b];[a] palettegen [p];[b][p] paletteuse" public/infinite-clock.gif');

// Also copy to apple-touch-icon, favicon
fs.copyFileSync('public/infinite-clock.gif', 'public/favicon.ico');
fs.copyFileSync('public/infinite-clock.gif', 'public/apple-touch-icon.png');
fs.copyFileSync('public/infinite-clock.gif', 'public/pwa-192x192.png');
fs.copyFileSync('public/infinite-clock.gif', 'public/pwa-512x512.png');

console.log('Generated infinite-clock.gif successfully!');
