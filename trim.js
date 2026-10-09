const TRIM_SCALE = 0.5;

function cropRect(box, rotation, margins) {
    const { left, right, top, bottom } = margins;
    let { x, y, width, height } = box;
    // Visual edges after the page's clockwise rotation, mapped back to user space.
    if (rotation === 90) {
        x += top;
        y += left;
        width -= top + bottom;
        height -= left + right;
    } else if (rotation === 180) {
        x += right;
        y += top;
        width -= left + right;
        height -= top + bottom;
    } else if (rotation === 270) {
        x += bottom;
        y += right;
        width -= top + bottom;
        height -= left + right;
    } else {
        x += left;
        y += bottom;
        width -= left + right;
        height -= top + bottom;
    }
    return { x, y, width, height };
}

function marginsFromBox(box, width, height, scale) {
    return {
        left: box.l / scale,
        top: box.t / scale,
        right: (width - 1 - box.r) / scale,
        bottom: (height - 1 - box.b) / scale
    };
}

function uniformCut(margins) {
    const cut = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!margins.length) return cut;
    cut.left = cut.top = cut.right = cut.bottom = Infinity;
    for (const margin of margins) {
        cut.left = Math.min(cut.left, margin.left);
        cut.top = Math.min(cut.top, margin.top);
        cut.right = Math.min(cut.right, margin.right);
        cut.bottom = Math.min(cut.bottom, margin.bottom);
    }
    for (const side of ['left', 'top', 'right', 'bottom']) {
        cut[side] = Math.max(0, Math.floor(cut[side] * 10 + 1e-6) / 10);
    }
    return cut;
}

function sizeKey(width, height) {
    return `${(Math.round(width * 10) / 10).toFixed(1)}×${(Math.round(height * 10) / 10).toFixed(1)}`;
}

function uniqueSizes(pages) {
    const counts = new Map();
    for (const page of pages) {
        const key = sizeKey(page.width, page.height);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()];
}

function sizesMatch(a, b) {
    const left = uniqueSizes(a);
    const right = uniqueSizes(b);
    return left.length === 1 && right.length === 1 && left[0][0] === right[0][0];
}

function formatSizes(pages) {
    return uniqueSizes(pages).map(([key, count]) => {
        const [width, height] = key.split('×');
        const label = count === 1 ? 'page' : 'pages';
        return `${width} × ${height} pt (${count} ${label})`;
    }).join('; ');
}

function trimmedName(name) {
    return name.replace(/\.pdf$/i, '') + '-trimmed.pdf';
}

function selfCheckTrim() {
    const rect = cropRect({ x: 0, y: 0, width: 100, height: 200 }, 0, { left: 8, right: 8, top: 10, bottom: 6 });
    if (rect.x !== 8 || rect.y !== 6 || rect.width !== 84 || rect.height !== 184) {
        throw new Error('crop ' + JSON.stringify(rect));
    }
    const turned = cropRect({ x: 0, y: 0, width: 100, height: 200 }, 90, { left: 5, right: 7, top: 3, bottom: 11 });
    if (turned.x !== 3 || turned.y !== 5 || turned.width !== 86 || turned.height !== 188) {
        throw new Error('crop90 ' + JSON.stringify(turned));
    }
    const edge = marginsFromBox({ l: 8, t: 8, r: 91, b: 191 }, 100, 200, 1);
    if (edge.left !== 8 || edge.top !== 8 || edge.right !== 8 || edge.bottom !== 8) {
        throw new Error('margins ' + JSON.stringify(edge));
    }
    const cut = uniformCut([{ left: 8, top: 8, right: 8, bottom: 8 }, { left: 0.4, top: 9.2, right: 8, bottom: 8 }]);
    if (cut.left !== 0.4 || cut.top !== 8 || cut.right !== 8 || cut.bottom !== 8) {
        throw new Error('cut ' + JSON.stringify(cut));
    }
    if (!sizesMatch([{ width: 613.29, height: 803.21 }], [{ width: 613.34, height: 803.16 }])) {
        throw new Error('expected matching sizes');
    }
    if (sizesMatch([{ width: 629.3, height: 803.2 }], [{ width: 613.0, height: 802.9 }])) {
        throw new Error('expected different sizes');
    }
}

selfCheckTrim();

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('trimForm');
        const inputs = [document.getElementById('trimPdf1'), document.getElementById('trimPdf2')];
        const names = [document.getElementById('trimFilename1'), document.getElementById('trimFilename2')];
        const zones = [document.getElementById('trimDropzone1'), document.getElementById('trimDropzone2')];
        const errorBox = document.getElementById('trimError');
        const button = document.getElementById('trimBtn');
        const loader = document.getElementById('trimLoader');
        const progress = document.getElementById('trimProgress');
        const status = document.getElementById('trimStatus');
        const result = document.getElementById('trimResult');
        const log = document.getElementById('trimLog');
        const downloads = [document.getElementById('trimDownload1'), document.getElementById('trimDownload2')];

        let ready = [null, null];

        function showError(message) {
            errorBox.textContent = message;
            errorBox.classList.remove('hidden');
        }

        function hideError() {
            errorBox.textContent = '';
            errorBox.classList.add('hidden');
        }

        function bindFile(index) {
            inputs[index].addEventListener('change', () => {
                hideError();
                result.classList.add('hidden');
                ready[index] = null;
                const file = inputs[index].files[0];
                if (!file) {
                    names[index].textContent = 'Drag & drop or click to browse';
                    names[index].classList.remove('text-blue-600', 'font-medium');
                    names[index].classList.add('text-gray-500');
                    return;
                }
                names[index].textContent = file.name;
                names[index].classList.add('text-blue-600', 'font-medium');
                names[index].classList.remove('text-gray-500');
            });

            const zone = zones[index];
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
                zone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
            });
            ['dragenter', 'dragover'].forEach((eventName) => {
                zone.addEventListener(eventName, () => zone.classList.add('drag-active'));
            });
            ['dragleave', 'drop'].forEach((eventName) => {
                zone.addEventListener(eventName, () => zone.classList.remove('drag-active'));
            });
            zone.addEventListener('drop', (event) => {
                const file = event.dataTransfer.files[0];
                if (!file || file.type !== 'application/pdf') {
                    showError('Please drop a PDF file.');
                    return;
                }
                const transfer = new DataTransfer();
                transfer.items.add(file);
                inputs[index].files = transfer.files;
                inputs[index].dispatchEvent(new Event('change'));
            });

            downloads[index].addEventListener('click', () => {
                const item = ready[index];
                if (!item) return;
                const url = URL.createObjectURL(new Blob([item.bytes], { type: 'application/pdf' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = item.filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            });
        }

        bindFile(0);
        bindFile(1);

        async function measureMargins(file, onPage) {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            const found = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            try {
                for (let i = 1; i <= pdf.numPages; i++) {
                    onPage(i, pdf.numPages);
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: TRIM_SCALE });
                    const width = Math.floor(viewport.width);
                    const height = Math.floor(viewport.height);
                    canvas.width = width;
                    canvas.height = height;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const box = contentBox(ctx.getImageData(0, 0, width, height).data, width, height);
                    if (box) found.push(marginsFromBox(box, width, height, TRIM_SCALE));
                    canvas.width = 0;
                    canvas.height = 0;
                    page.cleanup();
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            } finally {
                await pdf.destroy();
            }
            return uniformCut(found);
        }

        async function cropFile(file, cut) {
            const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
            const sizes = [];
            for (const page of doc.getPages()) {
                const rotation = page.getRotation().angle % 360;
                const next = cropRect(page.getCropBox(), rotation, cut);
                if (next.width <= 1 || next.height <= 1) {
                    throw new Error('The white edge is larger than the page.');
                }
                page.setMediaBox(next.x, next.y, next.width, next.height);
                page.setCropBox(next.x, next.y, next.width, next.height);
                page.setBleedBox(next.x, next.y, next.width, next.height);
                page.setTrimBox(next.x, next.y, next.width, next.height);
                page.setArtBox(next.x, next.y, next.width, next.height);
                const turned = rotation === 90 || rotation === 270;
                sizes.push(turned
                    ? { width: next.height, height: next.width }
                    : { width: next.width, height: next.height });
            }
            return { bytes: await doc.save(), sizes };
        }

        function cutLine(cut) {
            return `Cut: left ${cut.left.toFixed(1)} pt, top ${cut.top.toFixed(1)} pt, right ${cut.right.toFixed(1)} pt, bottom ${cut.bottom.toFixed(1)} pt`;
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            hideError();
            result.classList.add('hidden');
            ready = [null, null];
            const files = inputs.map((input) => input.files[0]);
            if (!files[0] || !files[1]) {
                showError('Upload both PDFs first.');
                return;
            }

            const original = button.innerHTML;
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
            loader.style.display = 'flex';
            progress.style.width = '0%';

            try {
                const cuts = [];
                for (let index = 0; index < files.length; index++) {
                    status.textContent = `Finding the white edge on PDF ${index + 1}...`;
                    cuts.push(await measureMargins(files[index], (page, total) => {
                        const done = index * 0.4 + ((page - 1) / total) * 0.4;
                        progress.style.width = `${done * 100}%`;
                        status.textContent = `Finding the white edge on PDF ${index + 1}, page ${page} of ${total}...`;
                    }));
                }

                const reports = [];
                const sizes = [];
                for (let index = 0; index < files.length; index++) {
                    status.textContent = `Cutting PDF ${index + 1}...`;
                    progress.style.width = `${80 + index * 10}%`;
                    const cropped = await cropFile(files[index], cuts[index]);
                    const filename = trimmedName(files[index].name);
                    ready[index] = { bytes: cropped.bytes, filename };
                    downloads[index].querySelector('span').textContent = filename;
                    sizes.push(cropped.sizes);
                    reports.push(`${files[index].name}\n${cutLine(cuts[index])}\nTrimmed size: ${formatSizes(cropped.sizes)}`);
                }

                const same = sizesMatch(sizes[0], sizes[1]);
                reports.push(same
                    ? `The two trimmed PDFs are the same size: ${formatSizes(sizes[0])}.`
                    : 'The two trimmed PDFs are different in size.');
                log.textContent = reports.join('\n\n');
                log.className = same
                    ? 'text-sm whitespace-pre-wrap rounded-lg border border-green-200 bg-green-50 text-green-900 p-4'
                    : 'text-sm whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 text-amber-950 p-4';
                progress.style.width = '100%';
                status.textContent = 'Both trimmed PDFs are ready to download.';
                result.classList.remove('hidden');
            } catch (err) {
                console.error(err);
                ready = [null, null];
                showError('Could not trim these PDFs. They might be corrupted or password protected.');
            } finally {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
                button.innerHTML = original;
                loader.style.display = 'none';
            }
        });
    });
}
