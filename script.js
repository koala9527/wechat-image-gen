// JavaScript for interactivity can be added here
console.log('Welcome to 9527 Koala\'s Personal Website!');

// Constants for image dimensions
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 384;
const TOP_EDITABLE_HEIGHT = 96;
const BOTTOM_EDITABLE_HEIGHT = 72;
const NON_EDITABLE_HEIGHT = CANVAS_HEIGHT - TOP_EDITABLE_HEIGHT - BOTTOM_EDITABLE_HEIGHT;

// Image transform state
let imageState = {
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    image: null
};

// DOM Elements
const promptInput = document.getElementById('prompt');
const generateButton = document.getElementById('generate');
const mattingSwitch = document.getElementById('matting-switch');
const loadingDiv = document.querySelector('.loading');
const errorDiv = document.querySelector('.error');
const previewContainer = document.querySelector('.preview-container');
const generatedImage = document.getElementById('generated-image');
const croppedCanvas = document.getElementById('cropped-canvas');
const downloadButton = document.getElementById('download');

// Event Listeners
generateButton.addEventListener('click', generateImage);
downloadButton.addEventListener('click', downloadImage);

// Add enter key listener
promptInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission
        generateImage();
    }
});

// Canvas interaction events
croppedCanvas.addEventListener('mousedown', startDragging);
croppedCanvas.addEventListener('mousemove', drag);
croppedCanvas.addEventListener('mouseup', stopDragging);
croppedCanvas.addEventListener('mouseleave', stopDragging);
croppedCanvas.addEventListener('wheel', handleZoom);

function startDragging(e) {
    const rect = croppedCanvas.getBoundingClientRect();
    imageState.dragging = true;
    imageState.lastX = e.clientX - rect.left;
    imageState.lastY = e.clientY - rect.top;
}

function drag(e) {
    if (!imageState.dragging) return;
    
    const rect = croppedCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    imageState.x += x - imageState.lastX;
    imageState.y += y - imageState.lastY;
    
    imageState.lastX = x;
    imageState.lastY = y;
    
    drawImage();
}

function stopDragging() {
    imageState.dragging = false;
}

function handleZoom(e) {
    e.preventDefault();
    
    const rect = croppedCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to canvas space
    const canvasX = mouseX * (CANVAS_WIDTH / rect.width);
    const canvasY = mouseY * (CANVAS_HEIGHT / rect.height);
    
    // Calculate zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = imageState.scale * delta;
    
    // Limit zoom level
    if (newScale >= 0.5 && newScale <= 3) {
        // Adjust position to zoom towards mouse position
        imageState.x = canvasX - (canvasX - imageState.x) * delta;
        imageState.y = canvasY - (canvasY - imageState.y) * delta;
        imageState.scale = newScale;
        
        drawImage();
    }
}

function drawImage() {
    if (!imageState.image) return;
    
    const ctx = croppedCanvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Save the current context state
    ctx.save();
    
    // Apply transformations
    ctx.translate(imageState.x, imageState.y);
    ctx.scale(imageState.scale, imageState.scale);
    
    // Calculate scaled dimensions
    const scaledWidth = CANVAS_WIDTH;
    const scaledHeight = imageState.image.height * (CANVAS_WIDTH / imageState.image.width);
    
    // Draw the image centered
    const x = -scaledWidth / 2;
    const y = -(scaledHeight / 2);
    ctx.drawImage(imageState.image, x, y, scaledWidth, scaledHeight);
    
    // Restore the context state
    ctx.restore();
    
    // Draw non-editable area overlay
    ctx.fillStyle = 'rgba(255, 192, 203, 0.3)';
    ctx.fillRect(0, TOP_EDITABLE_HEIGHT, CANVAS_WIDTH, NON_EDITABLE_HEIGHT);
}

async function generateImage() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        showError('请输入图片描述');
        return;
    }

    showLoading(true);
    hideError();

    try {
        const response = await fetch('/proxy/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                enable_matting: mattingSwitch.checked
            })
        });

        const data = await response.json();
        
        if (data.data && data.data[0]) {
            const imageData = data.data[0];
            
            // Display original image
            if (imageData.url) {
                generatedImage.src = `/proxy/image?url=${encodeURIComponent(imageData.url)}`;
                generatedImage.style.display = 'block';
            }
            
            // Process the image for cropping preview
            if (imageData.processed_image) {
                await loadAndProcessImage(`data:image/png;base64,${imageData.processed_image}`);
            }
            
            previewContainer.style.display = 'block';
        } else {
            throw new Error('生成图片失败');
        }
    } catch (error) {
        showError(error.message || '生成图片时出错');
    } finally {
        showLoading(false);
    }
}

async function loadAndProcessImage(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            // Store the image for later use
            imageState.image = img;
            
            // Reset transform state
            imageState.scale = 1;
            imageState.x = CANVAS_WIDTH / 2;
            imageState.y = CANVAS_HEIGHT / 2;
            
            // Initial draw
            drawImage();
            
            resolve();
        };
        
        img.onerror = () => {
            reject(new Error('加载图片失败'));
        };
        
        img.src = imageUrl;
    });
}

function downloadImage() {
    // Create a temporary canvas for the final output
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = CANVAS_WIDTH;
    tempCanvas.height = CANVAS_HEIGHT;
    const ctx = tempCanvas.getContext('2d');
    
    // Copy the current canvas state
    ctx.drawImage(croppedCanvas, 0, 0);
    
    // Clear the non-editable area to make it transparent
    ctx.clearRect(0, TOP_EDITABLE_HEIGHT, CANVAS_WIDTH, NON_EDITABLE_HEIGHT);
    
    // Convert to PNG with transparency
    const link = document.createElement('a');
    link.download = '气泡挂件.png';
    
    // Use toDataURL with PNG format and maximum quality
    link.href = tempCanvas.toDataURL('image/png', 1.0);
    
    // Check file size before downloading
    const base64 = link.href.split(',')[1];
    const fileSize = Math.round((base64.length * 3) / 4);
    
    if (fileSize > 300 * 1024) { // 300KB in bytes
        showError('文件大小超过300KB限制，请尝试生成新的图片');
        return;
    }
    
    link.click();
}

function showLoading(show) {
    loadingDiv.style.display = show ? 'block' : 'none';
    generateButton.disabled = show;
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    errorDiv.style.display = 'none';
}
