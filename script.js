// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
    const downloadBtn = document.getElementById('downloadBtn');

    // Store canvases for downloading later
    let pageCanvases = [];

    // Handle file selection display
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

    // Helper to read file as ArrayBuffer
    const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    };

    // Helper to render a PDF page to a canvas
    const renderPageToCanvas = async (pdf, pageNum, scale = 1.5) => {
        if (pageNum > pdf.numPages) return null;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        return { canvas, ctx, width: canvas.width, height: canvas.height };
    };

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMessage.classList.add('hidden');
        controlsSection.classList.add('hidden');
        pagesContainer.innerHTML = '';
        pageCanvases = [];
        
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
            // 1. Load PDFs
            const data1 = await readFileAsArrayBuffer(pdf1Input.files[0]);
            const data2 = await readFileAsArrayBuffer(pdf2Input.files[0]);

            const pdf1 = await pdfjsLib.getDocument({ data: data1 }).promise;
            const pdf2 = await pdfjsLib.getDocument({ data: data2 }).promise;

            const numPages = Math.max(pdf1.numPages, pdf2.numPages);

            // 2. Process page by page
            for (let i = 1; i <= numPages; i++) {
                loadingText.textContent = `Comparing page ${i} of ${numPages}...`;
                progressBar.style.width = `${(i / numPages) * 100}%`;

                const page1 = await renderPageToCanvas(pdf1, i);
                const page2 = await renderPageToCanvas(pdf2, i);

                const width = page1 ? page1.width : page2.width;
                const height = page1 ? page1.height : page2.height;

                // Create DOM canvases
                const identicalCanvas = document.createElement('canvas');
                const diffCanvas = document.createElement('canvas');
                identicalCanvas.width = diffCanvas.width = width;
                identicalCanvas.height = diffCanvas.height = height;
                
                // Styling for stacking them perfectly
                identicalCanvas.className = 'identical-layer absolute top-0 left-0 w-full h-full object-contain transition-opacity duration-200';
                diffCanvas.className = 'diff-layer absolute top-0 left-0 w-full h-full object-contain pointer-events-none';
                
                // Apply initial opacity
                identicalCanvas.style.opacity = opacitySlider.value / 100;

                const idCtx = identicalCanvas.getContext('2d');
                const diffCtx = diffCanvas.getContext('2d');

                const identicalData = idCtx.createImageData(width, height);
                const diffData = diffCtx.createImageData(width, height);

                // Get pixel data (handle missing pages by treating them as blank white)
                const blankData = new Uint8ClampedArray(width * height * 4).fill(255);
                const pixels1 = page1 ? page1.ctx.getImageData(0, 0, width, height).data : blankData;
                const pixels2 = page2 ? page2.ctx.getImageData(0, 0, width, height).data : blankData;

                // Pixel comparison loop
                for (let j = 0; j < pixels1.length; j += 4) {
                    const r1 = pixels1[j], g1 = pixels1[j+1], b1 = pixels1[j+2];
                    const r2 = pixels2[j], g2 = pixels2[j+1], b2 = pixels2[j+2];

                    // Calculate perceived brightness (luminance)
                    const lum1 = (r1 + g1 + b1) / 3;
                    const lum2 = (r2 + g2 + b2) / 3;

                    // If pixels are very similar
                    if (Math.abs(lum1 - lum2) < 20) {
                        // Put in identical layer
                        identicalData.data[j] = r2;
                        identicalData.data[j+1] = g2;
                        identicalData.data[j+2] = b2;
                        identicalData.data[j+3] = 255; // Keep fully opaque (CSS handles the fading)

                        // Transparent in diff layer
                        diffData.data[j+3] = 0;
                    } else {
                        // Pixels are different
                        // Transparent in identical layer
                        identicalData.data[j+3] = 0;
                        
                        // Opaque in diff layer
                        diffData.data[j+3] = 255;

                        if (lum1 < lum2) {
                            // PDF1 is darker (text removed) -> Dark Red
                            diffData.data[j] = 220;     // R
                            diffData.data[j+1] = 38;    // G
                            diffData.data[j+2] = 38;    // B
                        } else {
                            // PDF2 is darker (text added) -> Dark Blue
                            diffData.data[j] = 37;      // R
                            diffData.data[j+1] = 99;    // G
                            diffData.data[j+2] = 235;   // B
                        }
                    }
                }

                idCtx.putImageData(identicalData, 0, 0);
                diffCtx.putImageData(diffData, 0, 0);

                // Create a container for this page
                const pageContainer = document.createElement('div');
                pageContainer.className = 'relative w-full max-w-4xl bg-white shadow-lg border border-gray-300';
                pageContainer.style.aspectRatio = `${width} / ${height}`;

                // Add a page number badge
                const pageBadge = document.createElement('div');
                pageBadge.className = 'absolute -left-12 top-4 bg-gray-800 text-white font-bold py-1 px-3 rounded-l-lg shadow-md z-10';
                pageBadge.textContent = `Pg ${i}`;

                pageContainer.appendChild(pageBadge);
                pageContainer.appendChild(identicalCanvas);
                pageContainer.appendChild(diffCanvas);
                
                pagesContainer.appendChild(pageContainer);

                // Store for downloading later
                pageCanvases.push({ identicalCanvas, diffCanvas, width, height });
            }

            // Show controls
            controlsSection.classList.remove('hidden');
            
            // Scroll to results
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

    // Handle Opacity Slider
    opacitySlider.addEventListener('input', (e) => {
        const val = e.target.value;
        opacityValue.textContent = `${val}%`;
        const opacity = val / 100;
        
        document.querySelectorAll('.identical-layer').forEach(canvas => {
            canvas.style.opacity = opacity;
        });
    });

    // Handle Download
    downloadBtn.addEventListener('click', async () => {
        if (pageCanvases.length === 0) return;

        const originalText = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';
        downloadBtn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const currentOpacity = opacitySlider.value / 100;

            for (let i = 0; i < pageCanvases.length; i++) {
                if (i > 0) pdf.addPage();

                const { identicalCanvas, diffCanvas, width, height } = pageCanvases[i];

                // Create a temporary canvas to merge the layers with the current opacity
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = width;
                tempCanvas.height = height;
                const ctx = tempCanvas.getContext('2d');

                // Fill white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);

                // Draw identical layer with opacity
                ctx.globalAlpha = currentOpacity;
                ctx.drawImage(identicalCanvas, 0, 0);

                // Draw diff layer fully opaque
                ctx.globalAlpha = 1.0;
                ctx.drawImage(diffCanvas, 0, 0);

                // Calculate scaling to fit A4
                const ratio = Math.min(pdfWidth / width, pdfHeight / height);
                const scaledWidth = width * ratio;
                const scaledHeight = height * ratio;
                const x = (pdfWidth - scaledWidth) / 2;
                const y = (pdfHeight - scaledHeight) / 2;

                // Add to PDF
                const imgData = tempCanvas.toDataURL('image/jpeg', 0.8);
                pdf.addImage(imgData, 'JPEG', x, y, scaledWidth, scaledHeight);
            }

            pdf.save(`diff_${pdf1Input.files[0].name}_vs_${pdf2Input.files[0].name}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Failed to generate PDF download.');
        } finally {
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    // Drag and drop visual feedback
    const dropzones = [
        { zone: document.getElementById('dropzone1'), input: pdf1Input },
        { zone: document.getElementById('dropzone2'), input: pdf2Input }
    ];

    dropzones.forEach(({ zone, input }) => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            zone.addEventListener(eventName, () => zone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
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
