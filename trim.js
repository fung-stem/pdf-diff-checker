const TRIM_SCALE = 1;

function contentSpan(counts, minInk, mergeGap, noiseWidth, noiseGap) {
    const runs = [];
    const n = counts.length;
    let i = 0;
    while (i < n) {
        while (i < n && counts[i] < minInk) i++;
        if (i >= n) break;
        const start = i;
        let end = i;
        i++;
        while (i < n) {
            if (counts[i] >= minInk) {
                end = i;
                i++;
                continue;
            }
            let gap = 0;
            while (i + gap < n && counts[i + gap] < minInk) gap++;
            if (i + gap < n && gap <= mergeGap) {
                i += gap;
                continue;
            }
            break;
        }
        runs.push({ start, end });
    }
    while (runs.length > 1 && runs[0].end - runs[0].start + 1 <= noiseWidth && runs[1].start - runs[0].end - 1 >= noiseGap) {
        runs.shift();
    }
    while (runs.length > 1) {
        const last = runs.length - 1;
        const width = runs[last].end - runs[last].start + 1;
        const gap = runs[last].start - runs[last - 1].end - 1;
        if (width <= noiseWidth && gap >= noiseGap) runs.pop();
        else break;
    }
    if (!runs.length) return null;
    return { start: runs[0].start, end: runs[runs.length - 1].end };
}

function mainContentBox(data, width, height, scale) {
    const col = new Uint32Array(width);
    const row = new Uint32Array(height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const min = Math.min(r, g, b);
            const max = Math.max(r, g, b);
            if (min < 248 || max - min > 12) {
                col[x] += 1;
                row[y] += 1;
            }
        }
    }
    const pt = (points) => Math.max(1, Math.round(points * scale));
    const xSpan = contentSpan(col, Math.max(4, Math.round(height * 0.015)), pt(4), pt(8), pt(3));
    const ySpan = contentSpan(row, Math.max(4, Math.round(width * 0.015)), pt(4), pt(8), pt(3));
    if (!xSpan || !ySpan) return null;
    return { l: xSpan.start, t: ySpan.start, r: xSpan.end, b: ySpan.end };
}

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
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 8; y <= 31; y++) {
        for (let x = 8; x <= 31; x++) {
            const i = (y * width + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
    data[0] = data[1] = data[2] = 0;
    for (let y = 0; y <= 6; y++) {
        const i = (y * width + 1) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
    }
    const box = mainContentBox(data, width, height, 1);
    if (!box || box.l !== 8 || box.t !== 8 || box.r !== 31 || box.b !== 31) {
        throw new Error('content box ' + JSON.stringify(box));
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
        const refInputs = [document.getElementById('trimRef1'), document.getElementById('trimRef2')];
        const refCounts = [document.getElementById('trimRefCount1'), document.getElementById('trimRefCount2')];

        let ready = [null, null];
        const countToken = [0, 0];

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
                refCounts[index].textContent = '';
                if (!file) {
                    names[index].textContent = 'Drag & drop or click to browse';
                    names[index].classList.remove('text-blue-600', 'font-medium');
                    names[index].classList.add('text-gray-500');
                    return;
                }
                names[index].textContent = file.name;
                names[index].classList.add('text-blue-600', 'font-medium');
                names[index].classList.remove('text-gray-500');
                const token = ++countToken[index];
                refCounts[index].textContent = 'Reading page count...';
                file.arrayBuffer().then((data) => pdfjsLib.getDocument({ data }).promise).then(async (pdf) => {
                    if (token !== countToken[index]) {
                        await pdf.destroy();
                        return;
                    }
                    refInputs[index].max = pdf.numPages;
                    refInputs[index].value = '1';
                    refCounts[index].textContent = `of ${pdf.numPages}`;
                    await pdf.destroy();
                }).catch((err) => {
                    console.error(err);
                    if (token !== countToken[index]) return;
                    refCounts[index].textContent = '';
                    showError('Could not read that PDF. It might be corrupted or password protected.');
                });
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

        async function measureReference(file, pageNumber) {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            try {
                if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
                    throw new Error(`Reference page must be from 1 to ${pdf.numPages}.`);
                }
                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: TRIM_SCALE });
                const width = Math.floor(viewport.width);
                const height = Math.floor(viewport.height);
                canvas.width = width;
                canvas.height = height;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                const box = mainContentBox(ctx.getImageData(0, 0, width, height).data, width, height, TRIM_SCALE);
                canvas.width = 0;
                canvas.height = 0;
                page.cleanup();
                if (!box) throw new Error(`No content found on reference page ${pageNumber}.`);
                return uniformCut([marginsFromBox(box, width, height, TRIM_SCALE)]);
            } finally {
                await pdf.destroy();
            }
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
            const pageNumbers = refInputs.map((input) => parseInt(input.value, 10));
            if (pageNumbers.some((page) => !Number.isInteger(page) || page < 1)) {
                showError('Enter a reference page for each PDF.');
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
                    status.textContent = `Reading reference page ${pageNumbers[index]} on PDF ${index + 1}...`;
                    progress.style.width = `${index * 40}%`;
                    cuts.push(await measureReference(files[index], pageNumbers[index]));
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
                    reports.push(`${files[index].name}\nReference page ${pageNumbers[index]}\n${cutLine(cuts[index])}\nTrimmed size: ${formatSizes(cropped.sizes)}`);
                }

                const same = sizesMatch(sizes[0], sizes[1]);
                const shared = uniqueSizes(sizes[0])[0][0].replace('×', ' × ');
                reports.push(same
                    ? `The two trimmed PDFs are the same size: ${shared} pt.`
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
                showError(err && err.message ? err.message : 'Could not trim these PDFs. They might be corrupted or password protected.');
            } finally {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
                button.innerHTML = original;
                loader.style.display = 'none';
            }
        });
    });
}
