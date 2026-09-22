// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DISPLAY_SCALE = 1.5; // Screen preview only (faster)

document.addEventListener('DOMContentLoaded', () => {
    const diffView = document.getElementById('diffView');
    const splitView = document.getElementById('splitView');
    const navDiff = document.getElementById('navDiff');
    const navSplit = document.getElementById('navSplit');

    function showView(name) {
        const split = name === 'split';
        diffView.classList.toggle('hidden', split);
        splitView.classList.toggle('hidden', !split);
        navDiff.className = split
            ? 'text-lg sm:text-2xl font-bold text-gray-400 hover:text-blue-600 flex items-center gap-2'
            : 'text-lg sm:text-2xl font-bold text-blue-600 flex items-center gap-2';
        navSplit.className = split
            ? 'text-lg sm:text-2xl font-bold text-blue-600'
            : 'text-lg sm:text-2xl font-bold text-gray-400 hover:text-blue-600';
        document.title = split ? 'PDF Split' : 'PDF Diff Checker';
    }

    function viewFromHash() {
        showView(location.hash === '#split' ? 'split' : 'diff');
    }

    viewFromHash();
    window.addEventListener('hashchange', viewFromHash);

    const form = document.getElementById('uploadForm');
    const pdf1Input = document.getElementById('pdf1');
    const pdf2Input = document.getElementById('pdf2');
    const filename1 = document.getElementById('filename1');
    const filename2 = document.getElementById('filename2');
    const submitBtn = document.getElementById('submitBtn');
    const loader = document.getElementById('loader');
    const progressBar = document.getElementById('progressBar');
    const loadingText = document.getElementById('loadingText');
    const errorMessage = document.getElementById('errorMessage');

    const controlsSection = document.getElementById('controlsSection');
    const pagesContainer = document.getElementById('pagesContainer');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const exportDpi = document.getElementById('exportDpi');
    const downloadBtn = document.getElementById('downloadBtn');
    const pageRangeSection = document.getElementById('pageRangeSection');
    const pdf1From = document.getElementById('pdf1From');
    const pdf1To = document.getElementById('pdf1To');
    const pdf2From = document.getElementById('pdf2From');
    const pdf2To = document.getElementById('pdf2To');
    const pdf1PageCount = document.getElementById('pdf1PageCount');
    const pdf2PageCount = document.getElementById('pdf2PageCount');
    const pageRangeSummary = document.getElementById('pageRangeSummary');

    let loaded1 = null;
    let loaded2 = null;
    let pagePairs = [];
    const loadToken = { 1: 0, 2: 0 };

    const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    };

    const renderPageToCanvas = async (pdf, pageNum, scale) => {
        if (!pdf || pageNum < 1 || pageNum > pdf.numPages) return null;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        return { canvas, ctx, width: canvas.width, height: canvas.height };
    };

    const buildDiffLayers = (pixels1, pixels2, width, height) => {
        const identicalCanvas = document.createElement('canvas');
        const diffCanvas = document.createElement('canvas');
        identicalCanvas.width = diffCanvas.width = width;
        identicalCanvas.height = diffCanvas.height = height;

        const idCtx = identicalCanvas.getContext('2d');
        const diffCtx = diffCanvas.getContext('2d');
        const identicalData = idCtx.createImageData(width, height);
        const diffData = diffCtx.createImageData(width, height);

        for (let j = 0; j < pixels1.length; j += 4) {
            const r1 = pixels1[j], g1 = pixels1[j + 1], b1 = pixels1[j + 2];
            const r2 = pixels2[j], g2 = pixels2[j + 1], b2 = pixels2[j + 2];
            const lum1 = (r1 + g1 + b1) / 3;
            const lum2 = (r2 + g2 + b2) / 3;

            if (Math.abs(lum1 - lum2) < 20) {
                identicalData.data[j] = r2;
                identicalData.data[j + 1] = g2;
                identicalData.data[j + 2] = b2;
                identicalData.data[j + 3] = 255;
                diffData.data[j + 3] = 0;
            } else {
                identicalData.data[j + 3] = 0;
                diffData.data[j + 3] = 255;
                if (lum1 < lum2) {
                    diffData.data[j] = 220;
                    diffData.data[j + 1] = 38;
                    diffData.data[j + 2] = 38;
                } else {
                    diffData.data[j] = 37;
                    diffData.data[j + 1] = 99;
                    diffData.data[j + 2] = 235;
                }
            }
        }

        idCtx.putImageData(identicalData, 0, 0);
        diffCtx.putImageData(diffData, 0, 0);
        return { identicalCanvas, diffCanvas, width, height };
    };

    const pixelsOnCanvas = (rendered, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        if (rendered) ctx.drawImage(rendered.canvas, 0, 0);
        return ctx.getImageData(0, 0, width, height).data;
    };

    const comparePagesAtScale = async (pdf1, pdf2, pageNum1, pageNum2, scale) => {
        const page1 = await renderPageToCanvas(pdf1, pageNum1, scale);
        const page2 = await renderPageToCanvas(pdf2, pageNum2, scale);

        const width = Math.max(page1 ? page1.width : 0, page2 ? page2.width : 0);
        const height = Math.max(page1 ? page1.height : 0, page2 ? page2.height : 0);
        const pixels1 = pixelsOnCanvas(page1, width, height);
        const pixels2 = pixelsOnCanvas(page2, width, height);

        return buildDiffLayers(pixels1, pixels2, width, height);
    };

    const readRange = (fromEl, toEl, maxPages, label) => {
        const from = parseInt(fromEl.value, 10);
        const to = parseInt(toEl.value, 10);
        if (!Number.isInteger(from) || !Number.isInteger(to)) {
            throw new Error(`${label}: enter a start and end page.`);
        }
        if (from < 1 || to > maxPages || from > to) {
            throw new Error(`${label}: use pages from 1 to ${maxPages}, with start less than or equal to end.`);
        }
        return { from, to, length: to - from + 1 };
    };

    const buildPagePairs = () => {
        const oldRange = readRange(pdf1From, pdf1To, loaded1.doc.numPages, 'Old PDF');
        const newRange = readRange(pdf2From, pdf2To, loaded2.doc.numPages, 'New PDF');
        if (oldRange.length !== newRange.length) {
            throw new Error(`Both ranges must cover the same number of pages. Old has ${oldRange.length}, new has ${newRange.length}.`);
        }
        const pairs = [];
        for (let i = 0; i < oldRange.length; i++) {
            pairs.push({
                oldPage: oldRange.from + i,
                newPage: newRange.from + i
            });
        }
        return pairs;
    };

    const updatePageRangeSummary = () => {
        if (!loaded1 || !loaded2) return;
        try {
            const pairs = buildPagePairs();
            const first = pairs[0];
            const last = pairs[pairs.length - 1];
            const mapping = pairs.length === 1
                ? `Old page ${first.oldPage} with new page ${first.newPage}`
                : `Old ${first.oldPage}–${last.oldPage} with new ${first.newPage}–${last.newPage} (${pairs.length} pages)`;
            pageRangeSummary.textContent = `Will compare ${mapping}.`;
            pageRangeSummary.className = 'text-sm text-gray-600';
        } catch (err) {
            pageRangeSummary.textContent = err.message;
            pageRangeSummary.className = 'text-sm text-red-600';
        }
    };

    const setRangeInputs = (fromEl, toEl, pages) => {
        fromEl.min = 1;
        fromEl.max = pages;
        toEl.min = 1;
        toEl.max = pages;
        fromEl.value = 1;
        toEl.value = pages;
    };

    const refreshPageRangeUI = () => {
        if (!loaded1 || !loaded2) {
            pageRangeSection.classList.add('hidden');
            return;
        }
        pdf1PageCount.textContent = `(${loaded1.doc.numPages} pages)`;
        pdf2PageCount.textContent = `(${loaded2.doc.numPages} pages)`;
        pageRangeSection.classList.remove('hidden');
        updatePageRangeSummary();
    };

    const loadSelectedPdf = async (input) => {
        const file = input.files[0];
        if (!file) return null;
        const data = await readFileAsArrayBuffer(file);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        return { file, doc };
    };

    const mergeLayersToCanvas = (identicalCanvas, diffCanvas, width, height, opacity) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = opacity;
        ctx.drawImage(identicalCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
        ctx.drawImage(diffCanvas, 0, 0);
        return tempCanvas;
    };

    pdf1Input.addEventListener('change', () => onPdfChosen(pdf1Input, filename1, 1));
    pdf2Input.addEventListener('change', () => onPdfChosen(pdf2Input, filename2, 2));

    async function onPdfChosen(input, filenameEl, which) {
        const token = ++loadToken[which];
        updateFilename(input, filenameEl);
        hideError();
        if (!input.files[0]) {
            if (which === 1) loaded1 = null;
            else loaded2 = null;
            refreshPageRangeUI();
            return;
        }
        try {
            const loaded = await loadSelectedPdf(input);
            if (token !== loadToken[which]) return;
            if (which === 1) {
                loaded1 = loaded;
                setRangeInputs(pdf1From, pdf1To, loaded.doc.numPages);
            } else {
                loaded2 = loaded;
                setRangeInputs(pdf2From, pdf2To, loaded.doc.numPages);
            }
            refreshPageRangeUI();
        } catch (err) {
            console.error(err);
            if (which === 1) loaded1 = null;
            else loaded2 = null;
            refreshPageRangeUI();
            showError('Could not read that PDF. It might be corrupted or password protected.');
        }
    }

    [pdf1From, pdf1To, pdf2From, pdf2To].forEach((input) => {
        input.addEventListener('input', updatePageRangeSummary);
    });

    function updateFilename(input, displayElement) {
        if (input.files.length > 0) {
            displayElement.textContent = input.files[0].name;
            displayElement.classList.add('text-blue-600', 'font-medium');
            displayElement.classList.remove('text-gray-500');
        } else {
            displayElement.textContent = 'Drag & drop or click to browse';
            displayElement.classList.remove('text-blue-600', 'font-medium');
            displayElement.classList.add('text-gray-500');
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        hideError();
        controlsSection.classList.add('hidden');
        pagesContainer.innerHTML = '';
        pagePairs = [];

        if (!loaded1 || !loaded2) {
            showError('Please select both PDF files.');
            return;
        }

        let pairs;
        try {
            pairs = buildPagePairs();
        } catch (err) {
            showError(err.message);
            return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        loader.style.display = 'flex';
        progressBar.style.width = '0%';
        loadingText.textContent = 'Comparing selected pages...';

        try {
            pagePairs = pairs;

            for (let i = 0; i < pagePairs.length; i++) {
                const pair = pagePairs[i];
                loadingText.textContent = `Comparing old page ${pair.oldPage} with new page ${pair.newPage} (${i + 1} of ${pagePairs.length})...`;
                progressBar.style.width = `${((i + 1) / pagePairs.length) * 100}%`;

                const { identicalCanvas, diffCanvas, width, height } =
                    await comparePagesAtScale(loaded1.doc, loaded2.doc, pair.oldPage, pair.newPage, DISPLAY_SCALE);

                identicalCanvas.className = 'identical-layer absolute top-0 left-0 w-full h-full object-contain transition-opacity duration-200';
                diffCanvas.className = 'diff-layer absolute top-0 left-0 w-full h-full object-contain pointer-events-none';
                identicalCanvas.style.opacity = opacitySlider.value / 100;

                const pageContainer = document.createElement('div');
                pageContainer.className = 'relative w-full max-w-4xl bg-white shadow-lg border border-gray-300';
                pageContainer.style.aspectRatio = `${width} / ${height}`;

                const pageBadge = document.createElement('div');
                pageBadge.className = 'absolute top-3 left-3 bg-gray-800 text-white text-sm font-bold py-1 px-3 rounded-lg shadow-md z-10';
                pageBadge.textContent = `Old p.${pair.oldPage} ↔ New p.${pair.newPage}`;

                pageContainer.appendChild(pageBadge);
                pageContainer.appendChild(identicalCanvas);
                pageContainer.appendChild(diffCanvas);
                pagesContainer.appendChild(pageContainer);
            }

            controlsSection.classList.remove('hidden');
            controlsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            console.error(error);
            showError('Failed to process PDFs. They might be corrupted or password protected.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            loader.style.display = 'none';
        }
    });

    opacitySlider.addEventListener('input', (e) => {
        const val = e.target.value;
        opacityValue.textContent = `${val}%`;
        const opacity = val / 100;
        document.querySelectorAll('.identical-layer').forEach((canvas) => {
            canvas.style.opacity = opacity;
        });
    });

    downloadBtn.addEventListener('click', async () => {
        if (!loaded1 || !loaded2 || pagePairs.length === 0) return;

        const dpi = parseInt(exportDpi.value, 10);
        const exportScale = dpi / 72;
        const currentOpacity = opacitySlider.value / 100;
        const jpegQuality = dpi >= 300 ? 0.92 : dpi >= 200 ? 0.88 : 0.85;

        const originalText = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
        downloadBtn.disabled = true;
        exportDpi.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            let pdf = null;

            loader.style.display = 'flex';
            for (let i = 0; i < pagePairs.length; i++) {
                const pair = pagePairs[i];
                loadingText.textContent = `Exporting old p.${pair.oldPage} ↔ new p.${pair.newPage} (${i + 1} of ${pagePairs.length}) at ${dpi} DPI...`;
                progressBar.style.width = `${((i + 1) / pagePairs.length) * 100}%`;

                const { identicalCanvas, diffCanvas, width, height } =
                    await comparePagesAtScale(loaded1.doc, loaded2.doc, pair.oldPage, pair.newPage, exportScale);

                const merged = mergeLayersToCanvas(identicalCanvas, diffCanvas, width, height, currentOpacity);
                const imgData = merged.toDataURL('image/jpeg', jpegQuality);

                if (i === 0) {
                    pdf = new jsPDF({
                        orientation: width > height ? 'l' : 'p',
                        unit: 'px',
                        format: [width, height],
                        compress: true
                    });
                } else {
                    pdf.addPage([width, height], width > height ? 'l' : 'p');
                }

                pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
            }

            pdf.save(`diff_${dpi}dpi_${pdf1Input.files[0].name}_vs_${pdf2Input.files[0].name}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Failed to generate PDF. Try a lower resolution if the file is very large.');
        } finally {
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
            exportDpi.disabled = false;
            loader.style.display = 'none';
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.textContent = '';
        errorMessage.classList.add('hidden');
    }

    const dropzones = [
        { zone: document.getElementById('dropzone1'), input: pdf1Input },
        { zone: document.getElementById('dropzone2'), input: pdf2Input }
    ];

    dropzones.forEach(({ zone, input }) => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
            zone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        ['dragenter', 'dragover'].forEach((eventName) => {
            zone.addEventListener(eventName, () => zone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            zone.addEventListener(eventName, () => zone.classList.remove('drag-active'), false);
        });

        zone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                input.files = files;
                input.dispatchEvent(new Event('change'));
            } else {
                showError('Please drop a valid PDF file.');
            }
        }, false);
    });
});
