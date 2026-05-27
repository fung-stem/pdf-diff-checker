// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DISPLAY_SCALE = 1.5; // Screen preview only (faster)

document.addEventListener('DOMContentLoaded', () => {
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

    let pdfDoc1 = null;
    let pdfDoc2 = null;
    let numPages = 0;

    const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    };

    const renderPageToCanvas = async (pdf, pageNum, scale) => {
        if (pageNum > pdf.numPages) return null;
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

    const comparePageAtScale = async (pdf1, pdf2, pageNum, scale) => {
        const page1 = await renderPageToCanvas(pdf1, pageNum, scale);
        const page2 = await renderPageToCanvas(pdf2, pageNum, scale);

        const width = page1 ? page1.width : page2.width;
        const height = page1 ? page1.height : page2.height;
        const blankData = new Uint8ClampedArray(width * height * 4).fill(255);
        const pixels1 = page1 ? page1.ctx.getImageData(0, 0, width, height).data : blankData;
        const pixels2 = page2 ? page2.ctx.getImageData(0, 0, width, height).data : blankData;

        return buildDiffLayers(pixels1, pixels2, width, height);
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

    pdf1Input.addEventListener('change', (e) => updateFilename(e.target, filename1));
    pdf2Input.addEventListener('change', (e) => updateFilename(e.target, filename2));

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

        errorMessage.classList.add('hidden');
        controlsSection.classList.add('hidden');
        pagesContainer.innerHTML = '';
        pdfDoc1 = null;
        pdfDoc2 = null;

        if (!pdf1Input.files[0] || !pdf2Input.files[0]) {
            showError('Please select both PDF files.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        loader.style.display = 'flex';
        progressBar.style.width = '0%';
        loadingText.textContent = 'Loading PDFs...';

        try {
            const data1 = await readFileAsArrayBuffer(pdf1Input.files[0]);
            const data2 = await readFileAsArrayBuffer(pdf2Input.files[0]);

            pdfDoc1 = await pdfjsLib.getDocument({ data: data1 }).promise;
            pdfDoc2 = await pdfjsLib.getDocument({ data: data2 }).promise;
            numPages = Math.max(pdfDoc1.numPages, pdfDoc2.numPages);

            for (let i = 1; i <= numPages; i++) {
                loadingText.textContent = `Comparing page ${i} of ${numPages}...`;
                progressBar.style.width = `${(i / numPages) * 100}%`;

                const { identicalCanvas, diffCanvas, width, height } =
                    await comparePageAtScale(pdfDoc1, pdfDoc2, i, DISPLAY_SCALE);

                identicalCanvas.className = 'identical-layer absolute top-0 left-0 w-full h-full object-contain transition-opacity duration-200';
                diffCanvas.className = 'diff-layer absolute top-0 left-0 w-full h-full object-contain pointer-events-none';
                identicalCanvas.style.opacity = opacitySlider.value / 100;

                const pageContainer = document.createElement('div');
                pageContainer.className = 'relative w-full max-w-4xl bg-white shadow-lg border border-gray-300';
                pageContainer.style.aspectRatio = `${width} / ${height}`;

                const pageBadge = document.createElement('div');
                pageBadge.className = 'absolute -left-12 top-4 bg-gray-800 text-white font-bold py-1 px-3 rounded-l-lg shadow-md z-10';
                pageBadge.textContent = `Pg ${i}`;

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
        if (!pdfDoc1 || !pdfDoc2 || numPages === 0) return;

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
            for (let i = 1; i <= numPages; i++) {
                loadingText.textContent = `Exporting page ${i} of ${numPages} at ${dpi} DPI...`;
                progressBar.style.width = `${(i / numPages) * 100}%`;

                const { identicalCanvas, diffCanvas, width, height } =
                    await comparePageAtScale(pdfDoc1, pdfDoc2, i, exportScale);

                const merged = mergeLayersToCanvas(identicalCanvas, diffCanvas, width, height, currentOpacity);
                const imgData = merged.toDataURL('image/jpeg', jpegQuality);

                if (i === 1) {
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
