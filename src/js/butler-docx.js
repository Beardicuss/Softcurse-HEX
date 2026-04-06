'use strict';
// ── butler-docx.js ──────────────────────────────────────────
// Creates a minimal valid .docx file (Open XML) using Node.js built-in zlib
// No external dependencies needed!

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// A .docx is a ZIP archive containing XML files.
// We build the minimum required structure manually.

function createDocx(filePath, textContent) {
    return new Promise((resolve, reject) => {
        const paragraphs = (textContent || '').split('\n').map(line =>
            `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
        ).join('\n');

        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml">
  <w:body>
    ${paragraphs}
  </w:body>
</w:document>`;

        const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

        const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

        const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

        // Build ZIP manually (simplified ZIP format)
        try {
            const entries = [
                { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
                { name: '_rels/.rels', data: Buffer.from(relsXml, 'utf8') },
                { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
                { name: 'word/_rels/document.xml.rels', data: Buffer.from(wordRelsXml, 'utf8') },
            ];

            const buffers = [];
            const centralDir = [];
            let offset = 0;

            for (const entry of entries) {
                const nameBuffer = Buffer.from(entry.name, 'utf8');
                const compressed = zlib.deflateRawSync(entry.data);

                // Local file header
                const localHeader = Buffer.alloc(30);
                localHeader.writeUInt32LE(0x04034b50, 0);  // signature
                localHeader.writeUInt16LE(20, 4);           // version needed
                localHeader.writeUInt16LE(0, 6);            // flags
                localHeader.writeUInt16LE(8, 8);            // compression (deflate)
                localHeader.writeUInt16LE(0, 10);           // mod time
                localHeader.writeUInt16LE(0, 12);           // mod date
                localHeader.writeUInt32LE(crc32(entry.data), 14); // CRC-32
                localHeader.writeUInt32LE(compressed.length, 18);  // compressed size
                localHeader.writeUInt32LE(entry.data.length, 22);  // uncompressed size
                localHeader.writeUInt16LE(nameBuffer.length, 26);  // filename length
                localHeader.writeUInt16LE(0, 28);           // extra field length

                // Central directory header
                const cdHeader = Buffer.alloc(46);
                cdHeader.writeUInt32LE(0x02014b50, 0);  // signature
                cdHeader.writeUInt16LE(20, 4);           // version made by
                cdHeader.writeUInt16LE(20, 6);           // version needed
                cdHeader.writeUInt16LE(0, 8);            // flags
                cdHeader.writeUInt16LE(8, 10);           // compression
                cdHeader.writeUInt16LE(0, 12);           // mod time
                cdHeader.writeUInt16LE(0, 14);           // mod date
                cdHeader.writeUInt32LE(crc32(entry.data), 16);
                cdHeader.writeUInt32LE(compressed.length, 20);
                cdHeader.writeUInt32LE(entry.data.length, 24);
                cdHeader.writeUInt16LE(nameBuffer.length, 28);
                cdHeader.writeUInt16LE(0, 30);           // extra field length
                cdHeader.writeUInt16LE(0, 32);           // comment length
                cdHeader.writeUInt16LE(0, 34);           // disk number
                cdHeader.writeUInt16LE(0, 36);           // internal attr
                cdHeader.writeUInt32LE(0, 38);           // external attr
                cdHeader.writeUInt32LE(offset, 42);      // local header offset

                centralDir.push(Buffer.concat([cdHeader, nameBuffer]));
                buffers.push(localHeader, nameBuffer, compressed);
                offset += localHeader.length + nameBuffer.length + compressed.length;
            }

            const cdData = Buffer.concat(centralDir);
            const cdOffset = offset;

            // End of central directory
            const eocd = Buffer.alloc(22);
            eocd.writeUInt32LE(0x06054b50, 0);
            eocd.writeUInt16LE(0, 4);                    // disk number
            eocd.writeUInt16LE(0, 6);                    // disk with CD
            eocd.writeUInt16LE(entries.length, 8);       // entries on disk
            eocd.writeUInt16LE(entries.length, 10);      // total entries
            eocd.writeUInt32LE(cdData.length, 12);       // CD size
            eocd.writeUInt32LE(cdOffset, 16);            // CD offset
            eocd.writeUInt16LE(0, 20);                   // comment length

            const zipBuffer = Buffer.concat([...buffers, cdData, eocd]);
            fs.writeFileSync(filePath, zipBuffer);
            resolve(filePath);
        } catch (e) {
            reject(e);
        }
    });
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// CRC-32 (standard polynomial)
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

module.exports = { createDocx };
