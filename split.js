function sheetPlan(pageNo, width, height) {
    const single = width < height;
    if (single) {
        return { label: String(pageNo), single: true, next: pageNo + 1 };
    }
    return { label: `${pageNo}-${pageNo + 1}`, single: false, next: pageNo + 2 };
}

function sliceBoxes(width, height, single) {
    if (single) {
        const top = Math.floor(height / 2);
        return [
            ['top', 0, 0, width, top],
            ['bottom', 0, top, width, height - top]
        ];
    }
    const hw = Math.floor(width / 2);
    const hh = Math.floor(height / 2);
    return [
        ['top-left', 0, 0, hw, hh],
        ['bottom-left', 0, hh, hw, height - hh],
        ['top-right', hw, 0, width - hw, hh],
        ['bottom-right', hw, hh, width - hw, height - hh]
    ];
}

function crc32(bytes) {
    let c = ~0;
    for (let i = 0; i < bytes.length; i++) {
        c ^= bytes[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
}

function insertPngDpi(png, dpi) {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const ihdrLen = view.getUint32(8);
    const ihdrEnd = 8 + 12 + ihdrLen;
    const ppm = Math.round(dpi / 0.0254);
    const payload = new Uint8Array(9);
    const payloadView = new DataView(payload.buffer);
    payloadView.setUint32(0, ppm);
    payloadView.setUint32(4, ppm);
    payload[8] = 1;
    const typeAndData = new Uint8Array(13);
    typeAndData.set([112, 72, 89, 115], 0);
    typeAndData.set(payload, 4);
    const chunk = new Uint8Array(21);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, 9);
    chunk.set(typeAndData.subarray(0, 4), 4);
    chunk.set(payload, 8);
    chunkView.setUint32(17, crc32(typeAndData));
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
}

function selfCheck() {
    let pageNo = 1;
    const labels = [];
    for (const [w, h] of [[100, 200], [200, 100], [200, 100], [100, 200]]) {
        const plan = sheetPlan(pageNo, w, h);
        labels.push(plan.label);
        pageNo = plan.next;
    }
    if (labels.join(',') !== '1,2-3,4-5,6') throw new Error(labels.join(','));
    const spread = sliceBoxes(200, 100, false).map((box) => box[0]).join(',');
    if (spread !== 'top-left,bottom-left,top-right,bottom-right') throw new Error(spread);
    const single = sliceBoxes(100, 200, true).map((box) => box[0]).join(',');
    if (single !== 'top,bottom') throw new Error(single);
}

selfCheck();

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('splitForm');
        const input = document.getElementById('splitPdf');
        const filename = document.getElementById('splitFilename');
        const dropzone = document.getElementById('splitDropzone');
        const info = document.getElementById('splitInfo');
        const pageCount = document.getElementById('splitPageCount');
        const dpiSelect = document.getElementById('splitDpi');
        const errorBox = document.getElementById('splitError');
        const button = document.getElementById('splitBtn');
        const loader = document.getElementById('splitLoader');
        const progress = document.getElementById('splitProgress');
        const status = document.getElementById('splitStatus');

        let pdfDoc = null;
        let sheets = [];
        let loadToken = 0;

        function showError(message) {
            errorBox.textContent = message;
            errorBox.classList.remove('hidden');
        }

        function hideError() {
            errorBox.textContent = '';
            errorBox.classList.add('hidden');
        }

        async function readFile(file) {
            const data = await file.arrayBuffer();
            return pdfjsLib.getDocument({ data }).promise;
        }

        async function planBook(pdf) {
            let pageNo = 1;
            const planned = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1 });
                const plan = sheetPlan(pageNo, viewport.width, viewport.height);
                planned.push({ pdfPage: i, label: plan.label, single: plan.single });
                pageNo = plan.next;
            }
            return planned;
        }

        function describePlan(planned) {
            if (planned.length === 0) return '';
            const labels = planned.map((sheet) => sheet.label);
            const preview = labels.length <= 6
                ? labels.join(', ')
                : `${labels.slice(0, 3).join(', ')}, …, ${labels[labels.length - 1]}`;
            const pngs = planned.reduce((sum, sheet) => sum + (sheet.single ? 2 : 4), 0);
            return `${planned.length} sheets, ${pngs} PNGs: ${preview}`;
        }

        input.addEventListener('change', async () => {
            const token = ++loadToken;
            hideError();
            pdfDoc = null;
            sheets = [];
            info.classList.add('hidden');
            const file = input.files[0];
            if (!file) {
                filename.textContent = 'Drag & drop or click to browse';
                filename.classList.remove('text-blue-600', 'font-medium');
                filename.classList.add('text-gray-500');
                return;
            }
            filename.textContent = file.name;
            filename.classList.add('text-blue-600', 'font-medium');
            filename.classList.remove('text-gray-500');
            try {
                const doc = await readFile(file);
                if (token !== loadToken) return;
                pdfDoc = doc;
                sheets = await planBook(doc);
                if (token !== loadToken) return;
                pageCount.textContent = describePlan(sheets);
                info.classList.remove('hidden');
            } catch (err) {
                console.error(err);
                if (token !== loadToken) return;
                showError('Could not read that PDF. It might be corrupted or password protected.');
            }
        });

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'));
        });
        ['dragleave', 'drop'].forEach((eventName) => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'));
        });
        dropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (!file || file.type !== 'application/pdf') {
                showError('Please drop a PDF file.');
                return;
            }
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event('change'));
        });

        async function renderPage(pdf, pageNumber, scale) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            return canvas;
        }

        function cropToPng(source, x, y, w, h, dpi) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(source, x, y, w, h, 0, 0, w, h);
            return new Promise((resolve, reject) => {
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        reject(new Error('Could not encode a PNG.'));
                        return;
                    }
                    resolve(insertPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi));
                }, 'image/png');
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            if (!pdfDoc || sheets.length === 0) {
                showError('Upload a PDF first.');
                return;
            }

            const dpi = parseInt(dpiSelect.value, 10);
            const scale = dpi / 72;
            const original = button.innerHTML;
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
            loader.style.display = 'flex';
            progress.style.width = '0%';

            try {
                const zip = new JSZip();
                for (let i = 0; i < sheets.length; i++) {
                    const sheet = sheets[i];
                    status.textContent = `Splitting ${sheet.label} (${i + 1} of ${sheets.length}) at ${dpi} DPI...`;
                    progress.style.width = `${(i / sheets.length) * 100}%`;
                    const canvas = await renderPage(pdfDoc, sheet.pdfPage, scale);
                    for (const [suffix, x, y, w, h] of sliceBoxes(canvas.width, canvas.height, sheet.single)) {
                        const png = await cropToPng(canvas, x, y, w, h, dpi);
                        zip.file(`${sheet.label}-${suffix}.png`, png);
                    }
                    canvas.width = 0;
                    canvas.height = 0;
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }

                status.textContent = 'Packing ZIP...';
                progress.style.width = '100%';
                const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
                const stem = input.files[0].name.replace(/\.pdf$/i, '');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${stem}-${dpi}dpi-png.zip`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 10000);
                status.textContent = `Downloaded ${stem}-${dpi}dpi-png.zip`;
            } catch (err) {
                console.error(err);
                showError('Could not split this PDF. Try 100 DPI if the file is very large.');
            } finally {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
                button.innerHTML = original;
                loader.style.display = 'none';
            }
        });
    });
}
