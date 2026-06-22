#!/usr/bin/env node
// Generates a valid 32x32 32bpp ICO file at assets/icon.ico
// No npm dependencies — pure Buffer manipulation

'use strict';

const fs = require('fs');
const path = require('path');

const WIDTH = 32;
const HEIGHT = 32;
const BPP = 32;

// BITMAPINFOHEADER (40 bytes)
const dibHeader = Buffer.alloc(40);
dibHeader.writeUInt32LE(40, 0);          // biSize
dibHeader.writeInt32LE(WIDTH, 4);        // biWidth
dibHeader.writeInt32LE(HEIGHT * 2, 8);   // biHeight (doubled for ICO)
dibHeader.writeUInt16LE(1, 12);          // biPlanes
dibHeader.writeUInt16LE(BPP, 14);        // biBitCount
dibHeader.writeUInt32LE(0, 16);          // biCompression (BI_RGB)
dibHeader.writeUInt32LE(WIDTH * HEIGHT * 4, 20); // biSizeImage
dibHeader.writeInt32LE(0, 24);           // biXPelsPerMeter
dibHeader.writeInt32LE(0, 28);           // biYPelsPerMeter
dibHeader.writeUInt32LE(0, 32);          // biClrUsed
dibHeader.writeUInt32LE(0, 36);          // biClrImportant

// Pixel data: BGRA, bottom-up, solid color B=0xFF G=0x8C R=0x4F A=0xFF
// Color: #4F8CFF (nice blue)
const pixelData = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  pixelData[i * 4 + 0] = 0xFF; // B
  pixelData[i * 4 + 1] = 0x8C; // G
  pixelData[i * 4 + 2] = 0x4F; // R
  pixelData[i * 4 + 3] = 0xFF; // A
}

// AND mask (128 bytes = 32 * 32 / 8): all zeros (fully opaque)
const andMask = Buffer.alloc(128, 0);

const imageData = Buffer.concat([dibHeader, pixelData, andMask]);
const bytesInRes = imageData.length; // 40 + 4096 + 128 = 4264

// ICONDIR header (6 bytes)
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);   // reserved
iconDir.writeUInt16LE(1, 2);   // type = 1 (ICO)
iconDir.writeUInt16LE(1, 4);   // count = 1

// ICONDIRENTRY (16 bytes)
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(WIDTH, 0);         // width (0 = 256)
dirEntry.writeUInt8(HEIGHT, 1);        // height
dirEntry.writeUInt8(0, 2);             // colorCount
dirEntry.writeUInt8(0, 3);             // reserved
dirEntry.writeUInt16LE(1, 4);          // planes
dirEntry.writeUInt16LE(BPP, 6);        // bitCount
dirEntry.writeUInt32LE(bytesInRes, 8); // bytesInRes
dirEntry.writeUInt32LE(6 + 16, 12);   // imageOffset (after ICONDIR + ICONDIRENTRY)

const ico = Buffer.concat([iconDir, dirEntry, imageData]);

const outPath = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, ico);
console.log('Generated:', outPath, `(${ico.length} bytes)`);
