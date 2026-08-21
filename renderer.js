const { ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');

// DOM Elements
const video = document.getElementById('video-player');
const fileInput = document.getElementById('file-input');
const openFileBtn = document.getElementById('open-file-btn');
const filePickerOverlay = document.getElementById('file-picker-overlay');
const cycleDisplay = document.getElementById('cycle-display');
const timeDisplay = document.getElementById('time-display');
const titleDisplay = document.getElementById('title-display');
const cycleTableBody = document.getElementById('cycle-table-body');
const copyBtn = document.getElementById('copy-btn');
const copyMedianBtn = document.getElementById('copy-median-btn');
const toast = document.getElementById('toast');

// Progress Bar Elements
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBarTrack = document.getElementById('progress-bar-track');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressBarHandle = document.getElementById('progress-bar-handle');
const progressTimeTooltip = document.getElementById('progress-time-tooltip');

// Modal Elements
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameSaveBtn = document.getElementById('rename-save-btn');
const renameCancelBtn = document.getElementById('rename-cancel-btn');

// Comment Modal Elements
const commentModal = document.getElementById('comment-modal');
const commentModalTitle = document.getElementById('comment-modal-title');
const commentInput = document.getElementById('comment-input');
const commentSaveBtn = document.getElementById('comment-save-btn');
const commentCancelBtn = document.getElementById('comment-cancel-btn');
let activeCommentCycleIndex = null;

function openCommentModal(index) {
  if (index < 0 || index >= cycles.length) return;
  activeCommentCycleIndex = index;
  const c = cycles[index];
  commentModalTitle.textContent = `Cycle #${c.number} Comment`;
  commentInput.value = c.comment || '';
  commentModal.style.display = 'flex';
  setTimeout(() => {
    commentInput.focus();
    commentInput.select();
  }, 50);
}

function closeCommentModal() {
  commentModal.style.display = 'none';
  activeCommentCycleIndex = null;
}

function saveComment() {
  if (activeCommentCycleIndex === null || activeCommentCycleIndex >= cycles.length) {
    closeCommentModal();
    return;
  }
  const newComment = commentInput.value.replace(/[\r\n]+/g, ' ').trim();
  cycles[activeCommentCycleIndex].comment = newComment;
  closeCommentModal();
  renderTable();
  showToast(newComment ? `Comment saved for Cycle #${cycles[activeCommentCycleIndex].number}` : `Comment cleared`);
}

if (commentSaveBtn) commentSaveBtn.addEventListener('click', saveComment);
if (commentCancelBtn) commentCancelBtn.addEventListener('click', closeCommentModal);
if (commentInput) {
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      saveComment();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommentModal();
    }
  });

  commentInput.addEventListener('input', () => {
    if (commentInput.value.includes('\n') || commentInput.value.includes('\r')) {
      commentInput.value = commentInput.value.replace(/[\r\n]+/g, ' ');
    }
  });
}

// State
let cycles = []; // List of durations in seconds
let lastCycleTime = null; // null until timing is started by first record press
let videoFileName = "";
let videoFilePath = "";

function openRenameModal() {
  renameInput.value = videoFileName || "";
  renameModal.style.display = 'flex';
  setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 50);
}

function closeRenameModal() {
  renameModal.style.display = 'none';
}

async function saveRename() {
  const newNameInput = renameInput.value.trim();
  if (!newNameInput) {
    closeRenameModal();
    return;
  }

  if (videoFilePath && fs.existsSync(videoFilePath)) {
    try {
      // Pause video & release media source handle on OS
      const currentTime = video.currentTime;
      const wasPaused = video.paused;
      video.pause();
      video.removeAttribute('src');
      video.load();

      // Perform physical file rename via IPC in main process
      const res = await ipcRenderer.invoke('rename-video-file', videoFilePath, newNameInput);

      // Update state
      videoFilePath = res.newPath;
      videoFileName = res.newName;
      titleDisplay.textContent = videoFileName;

      // Reload video pointing to newly renamed path
      const normalizedPath = videoFilePath.replace(/\\/g, '/');
      video.src = `file:///${normalizedPath}`;
      video.currentTime = currentTime;
      if (!wasPaused) {
        video.play().catch(() => {});
      }

      showToast(`Renamed file to: ${videoFileName}`);
    } catch (err) {
      console.error("Failed to rename file on disk:", err);
      showToast(`Error renaming file: ${err.message}`);
    }
  } else {
    // In-memory rename fallback
    videoFileName = newNameInput;
    titleDisplay.textContent = videoFileName;
    showToast(`Renamed display to: ${videoFileName}`);
  }
  closeRenameModal();
}

renameSaveBtn.addEventListener('click', saveRename);
renameCancelBtn.addEventListener('click', closeRenameModal);
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveRename();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeRenameModal();
  }
});

// Format helpers
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Open File Dialog (Native OS Dialog preferred)
async function selectVideoFile() {
  try {
    const selectedPath = await ipcRenderer.invoke('select-video-file');
    if (selectedPath) {
      loadVideoFromPath(selectedPath);
    }
  } catch (err) {
    console.error("Error opening file dialog:", err);
    fileInput.click();
  }
}

openFileBtn.addEventListener('click', selectVideoFile);
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    let filePath = "";
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        filePath = webUtils.getPathForFile(file);
      }
    } catch (err) {}
    filePath = filePath || file.path || "";

    if (filePath) {
      loadVideoFromPath(filePath);
    } else {
      loadVideoFromFileObject(file);
    }
  }
});

function loadVideoFromPath(filePath) {
  videoFilePath = filePath;
  videoFileName = path.basename(filePath);
  
  const normalizedPath = filePath.replace(/\\/g, '/');
  video.src = `file:///${normalizedPath}`;

  titleDisplay.textContent = videoFileName;
  filePickerOverlay.style.display = 'none';
  
  ipcRenderer.send('save-last-open-dir', filePath);

  // Reset cycles
  cycles = [];
  lastCycleTime = null;
  
  resetZoom();
  resetAngle();
  renderTable();
  video.play().catch(() => {});
}

function loadVideoFromFileObject(file) {
  videoFilePath = "";
  videoFileName = file.name;
  video.src = URL.createObjectURL(file);

  titleDisplay.textContent = videoFileName;
  filePickerOverlay.style.display = 'none';
  
  // Reset cycles
  cycles = [];
  lastCycleTime = null;
  
  resetZoom();
  resetAngle();
  renderTable();
  video.play().catch(() => {});
}

// Open with / CLI File Association Handlers
ipcRenderer.on('open-file-from-shell', (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    loadVideoFromPath(filePath);
  }
});

ipcRenderer.invoke('get-initial-file').then(initialFilePath => {
  if (initialFilePath && fs.existsSync(initialFilePath)) {
    loadVideoFromPath(initialFilePath);
  }
}).catch(() => {});

// Toggle Play/Pause on Video Click
video.addEventListener('click', () => {
  if (!video.src) return;
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
});

// Update overlay current time
video.addEventListener('timeupdate', () => {
  timeDisplay.textContent = formatTime(video.currentTime);
  if (lastCycleTime === null) {
    cycleDisplay.textContent = `Cycle #1 - Press Enter to Start`;
  } else {
    const currentCycleDuration = Math.max(0, video.currentTime - lastCycleTime);
    cycleDisplay.textContent = `Cycle #${cycles.length + 1} - ${formatNumberForExcel(currentCycleDuration, 1)}s`;
  }
});

// --- Progress Bar Seeking & Scrubbing State & Logic ---
let isScrubbing = false;

function updateProgressBar() {
  if (!progressBarFill || !progressBarHandle) return;
  if (!video.duration || isNaN(video.duration)) {
    progressBarFill.style.width = '0%';
    progressBarHandle.style.left = '0%';
    return;
  }
  const pct = Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
  progressBarFill.style.width = `${pct}%`;
  progressBarHandle.style.left = `${pct}%`;
}

function seekToMousePosition(e) {
  if (!video.duration || isNaN(video.duration) || !progressBarTrack) return;
  const rect = progressBarTrack.getBoundingClientRect();
  const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const targetPercent = clickX / rect.width;
  video.currentTime = targetPercent * video.duration;
  updateProgressBar();
}

function updateTooltipPosition(e) {
  if (!video.duration || isNaN(video.duration) || !progressBarTrack || !progressTimeTooltip || !progressBarContainer) return;
  const rect = progressBarTrack.getBoundingClientRect();
  const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const targetPercent = hoverX / rect.width;
  const hoverTime = targetPercent * video.duration;

  progressTimeTooltip.textContent = `${formatTime(hoverTime)} / ${formatTime(video.duration)}`;

  const containerRect = progressBarContainer.getBoundingClientRect();
  const tooltipX = Math.max(35, Math.min(containerRect.width - 35, e.clientX - containerRect.left));
  progressTimeTooltip.style.left = `${tooltipX}px`;
  progressTimeTooltip.style.display = 'block';
}

if (progressBarContainer) {
  video.addEventListener('timeupdate', () => {
    if (!isScrubbing) {
      updateProgressBar();
    }
  });

  video.addEventListener('loadedmetadata', updateProgressBar);

  progressBarContainer.addEventListener('mousedown', (e) => {
    if (!video.src || e.button !== 0) return;
    e.stopPropagation();
    isScrubbing = true;
    progressBarContainer.classList.add('dragging');
    seekToMousePosition(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) {
      seekToMousePosition(e);
      updateTooltipPosition(e);
    }
  });

  progressBarContainer.addEventListener('mousemove', (e) => {
    if (!isScrubbing && video.src) {
      updateTooltipPosition(e);
    }
  });

  progressBarContainer.addEventListener('mouseleave', () => {
    if (!isScrubbing) {
      progressTimeTooltip.style.display = 'none';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isScrubbing) {
      isScrubbing = false;
      progressBarContainer.classList.remove('dragging');
      progressTimeTooltip.style.display = 'none';
    }
  });
}

// Record Cycle
function recordCycle() {
  if (!video.src) return;
  const currentTime = video.currentTime;

  // First press sets start of Cycle #1
  if (lastCycleTime === null) {
    lastCycleTime = currentTime;
    showToast(`Cycle timing started at ${formatTime(currentTime)}`);
    return;
  }

  const duration = parseFloat((currentTime - lastCycleTime).toFixed(2));
  cycles.push({
    number: cycles.length + 1,
    timestamp: formatTime(currentTime),
    rawTimestampSeconds: currentTime,
    duration: duration > 0 ? duration : 0
  });

  lastCycleTime = currentTime;
  renderTable();
}

// Undo Last Cycle
function deleteLastCycle(rewind = true) {
  if (cycles.length === 0) {
    if (lastCycleTime !== null) {
      lastCycleTime = null;
      showToast("Reset cycle timing start");
    }
    return;
  }

  const deletedCycle = cycles.pop();
  if (cycles.length > 0) {
    lastCycleTime = cycles[cycles.length - 1].rawTimestampSeconds;
  } else {
    lastCycleTime = null;
  }

  if (rewind) {
    // Rewind to timestamp of deleted cycle minus 2 seconds
    const deletedTimestamp = deletedCycle.rawTimestampSeconds !== undefined ? deletedCycle.rawTimestampSeconds : video.currentTime;
    video.currentTime = Math.max(0, deletedTimestamp - 2);
  }

  renderTable();
}

// --- Internationalization & Decimal Separator State ---
let decimalSeparatorSetting = 'comma'; // 'comma' or 'dot'

function getActiveDecimalSeparator() {
  return decimalSeparatorSetting === 'dot' ? '.' : ',';
}

function formatNumberForExcel(num, decimals = 2) {
  const val = typeof num === 'number' ? num : parseFloat(num);
  if (isNaN(val)) return '0';
  const formatted = val.toFixed(decimals);
  const sep = getActiveDecimalSeparator();
  return sep === ',' ? formatted.replace('.', ',') : formatted;
}

// Delete cycle at a specific index
function deleteCycleAtIndex(index) {
  if (index < 0 || index >= cycles.length) return;

  const deletedNum = cycles[index].number || (index + 1);
  cycles.splice(index, 1);

  // Renumber remaining cycles sequentially
  cycles.forEach((c, idx) => {
    c.number = idx + 1;
  });

  // Update lastCycleTime if the last cycle was deleted
  if (cycles.length > 0) {
    lastCycleTime = cycles[cycles.length - 1].rawTimestampSeconds;
  } else {
    lastCycleTime = null;
  }

  renderTable();
  showToast(`Deleted Cycle #${deletedNum}`);
}

// Render Table UI
function renderTable() {
  cycleTableBody.innerHTML = '';
  cycles.forEach((c, index) => {
    const tr = document.createElement('tr');
    const commentText = c.comment || '';
    tr.innerHTML = `
      <td>${c.number}</td>
      <td>${c.timestamp}</td>
      <td class="duration">${formatNumberForExcel(c.duration)}s</td>
      <td class="cycle-comment-cell" data-index="${index}" title="${commentText ? commentText : 'Click to edit comment'}">
        ${commentText ? `<span class="comment-text">${commentText}</span>` : `<span class="comment-placeholder">+ Add</span>`}
      </td>
      <td style="text-align: center;">
        <button class="btn-delete-row" data-index="${index}" title="Delete Cycle #${c.number}">🗑️</button>
      </td>
    `;
    cycleTableBody.appendChild(tr);
  });

  // Attach event listeners for row delete buttons
  const deleteBtns = cycleTableBody.querySelectorAll('.btn-delete-row');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        deleteCycleAtIndex(idx);
      }
    });
  });

  // Attach event listeners for comment cells
  const commentCells = cycleTableBody.querySelectorAll('.cycle-comment-cell');
  commentCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(cell.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        openCommentModal(idx);
      }
    });
  });
  
  // Auto scroll table to bottom
  const container = document.getElementById('table-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Helper to show toast messages
function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

// Copy to Clipboard in Excel-ready format (All cycles + Comments)
function copyToClipboard() {
  if (cycles.length === 0) return;
  
  const sep = getActiveDecimalSeparator();
  // Format each cycle duration with active decimal separator, tab-separated from comment if present
  const clipboardText = cycles.map(c => {
    const formattedDuration = formatNumberForExcel(c.duration);
    return c.comment ? `${formattedDuration}\t${c.comment}` : formattedDuration;
  }).join('\n');

  ipcRenderer.send('copy-to-clipboard', clipboardText);

  showToast(`Copied all cycles! (decimal: '${sep}')`);
}

// Calculate Median Cycle Time (excluding index 0, and min/max if N > 2)
function calculateMedianCycleTime() {
  if (cycles.length <= 1) return null;

  // Exclude time at index 0 (cycles[0])
  let values = cycles.slice(1).map(c => c.duration);
  const N = values.length;
  if (N === 0) return null;

  // If there are more than 2 values, remove min and max
  if (N > 2) {
    values.sort((a, b) => a - b);
    values.shift(); // Remove min
    values.pop();   // Remove max
  } else {
    values.sort((a, b) => a - b);
  }

  const len = values.length;
  if (len === 0) return null;

  if (len % 2 === 1) {
    return values[Math.floor(len / 2)];
  } else {
    return (values[len / 2 - 1] + values[len / 2]) / 2;
  }
}

// Copy Median Time to Clipboard
function copyMedianToClipboard() {
  if (cycles.length <= 1) {
    showToast("Need cycles after index 0 to calculate median!");
    return;
  }

  const median = calculateMedianCycleTime();
  if (median === null || isNaN(median)) {
    showToast("Not enough cycle data for median!");
    return;
  }

  const formattedMedian = formatNumberForExcel(median);
  const sep = getActiveDecimalSeparator();
  ipcRenderer.send('copy-to-clipboard', formattedMedian);

  showToast(`Copied median: ${formattedMedian}s (decimal: '${sep}')`);
}

copyBtn.addEventListener('click', copyToClipboard);
if (copyMedianBtn) {
  copyMedianBtn.addEventListener('click', copyMedianToClipboard);
}

// --- Zoom, Pan & Rotation State ---
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let rotationAngle = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let initialPanX = 0;
let initialPanY = 0;

// DOM Elements for Zoom & Rotation
const videoContainer = document.getElementById('video-container');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const zoomLevelDisplay = document.getElementById('zoom-level-display');
const rotateVideoBtn = document.getElementById('rotate-video-btn');
const rotationAngleDisplay = document.getElementById('rotation-angle-display');

function applyZoomTransform() {
  zoomScale = Math.max(1.0, Math.min(10.0, zoomScale));

  if (zoomScale === 1.0) {
    panX = 0;
    panY = 0;
  } else {
    const maxPanX = (videoContainer.clientWidth * (zoomScale - 1)) / 2;
    const maxPanY = (videoContainer.clientHeight * (zoomScale - 1)) / 2;
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  video.style.transform = `scale(${zoomScale}) rotate(${rotationAngle}deg) translate(${panX / zoomScale}px, ${panY / zoomScale}px)`;
  zoomLevelDisplay.textContent = `${Math.round(zoomScale * 100)}%`;
  if (rotationAngleDisplay) {
    rotationAngleDisplay.textContent = `${rotationAngle}°`;
  }

  if (isPanning) {
    videoContainer.className = 'grabbing-cursor';
  } else {
    videoContainer.className = '';
  }
}

function rotateVideoClockwise() {
  rotationAngle = (rotationAngle + 90) % 360;
  applyZoomTransform();
  showToast(`Rotated video to ${rotationAngle}°`);
}

function setZoomLevel(newScale) {
  zoomScale = newScale;
  applyZoomTransform();
}

function resetAngle() {
  rotationAngle = 0;
  applyZoomTransform();
}

function resetZoom() {
  zoomScale = 1.0;
  panX = 0;
  panY = 0;
  applyZoomTransform();
}

// Button Listeners for Zoom & Rotation
if (rotateVideoBtn) {
  rotateVideoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rotateVideoClockwise();
  });
}
zoomInBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setZoomLevel(zoomScale + 0.25);
});
zoomOutBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setZoomLevel(zoomScale - 0.25);
});
zoomResetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetZoom();
});

// Mouse Wheel Zoom
videoContainer.addEventListener('wheel', (e) => {
  if (!video.src) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.2 : -0.2;
  setZoomLevel(zoomScale + delta);
}, { passive: false });

// Prevent default middle click autoscroll icon
videoContainer.addEventListener('auxclick', (e) => {
  if (e.button === 1) e.preventDefault();
});

// Mouse Down (Drag Panning on Middle Click)
videoContainer.addEventListener('mousedown', (e) => {
  if (!video.src) return;
  if (e.target.closest('#zoom-controls') || e.target.closest('#overlay') || e.target.closest('#file-picker-overlay') || e.target.closest('#progress-bar-container')) return;

  // Middle Click (button === 1): Drag Pan
  if (e.button === 1) {
    e.preventDefault();
    if (zoomScale > 1.0) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      initialPanX = panX;
      initialPanY = panY;
      applyZoomTransform();
    }
  }
});

// Mouse Move (Middle Mouse Panning)
window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    if (rotationAngle === 90) {
      panX = initialPanX + dy;
      panY = initialPanY - dx;
    } else if (rotationAngle === 180) {
      panX = initialPanX - dx;
      panY = initialPanY - dy;
    } else if (rotationAngle === 270) {
      panX = initialPanX - dy;
      panY = initialPanY + dx;
    } else {
      panX = initialPanX + dx;
      panY = initialPanY + dy;
    }
    applyZoomTransform();
  }
});

// Mouse Up (Finish Panning)
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    applyZoomTransform();
  }
});

// --- Hotkey Configuration & Persistence State ---
const DEFAULT_HOTKEYS = {
  recordCycle: { key: 'enter', label: 'Record Cycle', section: 'General Controls' },
  undoCycle: { key: 'backspace', label: 'Undo Last (-5s)', section: 'General Controls' },
  deleteCycle: { key: 'delete', label: 'Delete Cycle', section: 'General Controls' },
  togglePlay: { key: 'space', label: 'Play / Pause', section: 'General Controls' },
  copyExcel: { key: 'ctrl+c', label: 'Copy Excel', section: 'General Controls' },
  copyMedianExcel: { key: 'ctrl+shift+c', label: 'Copy Median Time', section: 'General Controls' },
  renameVideo: { key: 'g', label: 'Rename Video', section: 'General Controls' },
  openVideo: { key: 'h', label: 'Open Video', section: 'General Controls' },
  rotateVideo: { key: 'shift+r', label: 'Rotate Video 90°', section: 'General Controls' },

  stepFrameBack: { key: 'arrowleft', label: 'Step Backward (Frames)', section: 'Seeking' },
  stepFrameFwd: { key: 'arrowright', label: 'Step Forward (Frames)', section: 'Seeking' },

  zoomIn: { key: '=', label: 'Zoom In (+)', section: 'Seeking' },
  zoomOut: { key: '-', label: 'Zoom Out (-)', section: 'Seeking' },
  resetZoom: { key: '0', label: 'Reset Zoom (100%)', section: 'Seeking' },

  speed025: { key: 'z', label: 'Speed 0.25x', section: 'Playback Speed', speed: 0.25 },
  speed050: { key: 'x', label: 'Speed 0.50x', section: 'Playback Speed', speed: 0.5 },
  speed075: { key: 'c', label: 'Speed 0.75x', section: 'Playback Speed', speed: 0.75 },
  speed100: { key: 'v', label: 'Speed 1.00x', section: 'Playback Speed', speed: 1.0 },
  speed125: { key: 'b', label: 'Speed 1.25x', section: 'Playback Speed', speed: 1.25 },
  speed150: { key: 'n', label: 'Speed 1.50x', section: 'Playback Speed', speed: 1.5 },
  speed200: { key: 'm', label: 'Speed 2.00x', section: 'Playback Speed', speed: 2.0 },

  seekBack60: { key: 'q', label: 'Rewind -60s', section: 'Seeking', seek: -60 },
  seekBack30: { key: 'w', label: 'Rewind -30s', section: 'Seeking', seek: -30 },
  seekBack10: { key: 'e', label: 'Rewind -10s', section: 'Seeking', seek: -10 },
  seekBack5: { key: 'r', label: 'Rewind -5s', section: 'Seeking', seek: -5 },
  seekBack1: { key: 't', label: 'Rewind -1s', section: 'Seeking', seek: -1 },
  seekFwd1: { key: 'y', label: 'Forward +1s', section: 'Seeking', seek: 1 },
  seekFwd5: { key: 'u', label: 'Forward +5s', section: 'Seeking', seek: 5 },
  seekFwd10: { key: 'i', label: 'Forward +10s', section: 'Seeking', seek: 10 },
  seekFwd30: { key: 'o', label: 'Forward +30s', section: 'Seeking', seek: 30 },
  seekFwd60: { key: 'p', label: 'Forward +60s', section: 'Seeking', seek: 60 }
};

let currentHotkeys = JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
let listeningActionId = null;
let frameStepAmount = 1;

// Settings DOM Elements
const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseX = document.getElementById('settings-close-x');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsResetBtn = document.getElementById('settings-reset-btn');
const settingsContainer = document.getElementById('settings-hotkeys-container');
const controlsLegend = document.getElementById('controls-legend');

// Helpers for Hotkeys
function getEventKeyCombo(e) {
  let parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && e.key !== 'Shift') parts.push('shift');

  let k = e.key.toLowerCase();
  if (e.code === 'Space') k = 'space';
  if (e.code === 'ArrowLeft' || k === 'arrowleft') k = 'arrowleft';
  if (e.code === 'ArrowRight' || k === 'arrowright') k = 'arrowright';
  if (e.code === 'ArrowUp' || k === 'arrowup') k = 'arrowup';
  if (e.code === 'ArrowDown' || k === 'arrowdown') k = 'arrowdown';

  if (k === 'control' || k === 'meta' || k === 'alt' || k === 'shift') return null;

  parts.push(k);
  return parts.join('+');
}

function formatKeyComboDisplay(combo) {
  if (!combo) return 'None';
  return combo.split('+').map(p => {
    if (p === 'ctrl') return 'Ctrl';
    if (p === 'alt') return 'Alt';
    if (p === 'shift') return 'Shift';
    if (p === 'space') return 'Space';
    if (p === 'enter') return 'Enter';
    if (p === 'backspace') return 'Backspace';
    if (p === 'arrowleft') return '←';
    if (p === 'arrowright') return '→';
    if (p === 'arrowup') return '↑';
    if (p === 'arrowdown') return '↓';
    return p.toUpperCase();
  }).join('+');
}

async function loadSavedHotkeys() {
  try {
    const saved = await ipcRenderer.invoke('load-settings');
    if (saved && typeof saved === 'object') {
      const keysObj = saved.hotkeys || saved;
      Object.keys(DEFAULT_HOTKEYS).forEach(id => {
        if (keysObj[id] && keysObj[id].key) {
          currentHotkeys[id].key = keysObj[id].key;
        }
        if (keysObj[id] && typeof keysObj[id].seek === 'number') {
          currentHotkeys[id].seek = keysObj[id].seek;
          const isRewind = keysObj[id].seek < 0;
          const sec = Math.abs(keysObj[id].seek);
          currentHotkeys[id].label = isRewind ? `Rewind -${sec}s` : `Forward +${sec}s`;
        }
        if (keysObj[id] && typeof keysObj[id].speed === 'number') {
          currentHotkeys[id].speed = keysObj[id].speed;
          currentHotkeys[id].label = `Speed ${keysObj[id].speed}x`;
        }
      });
      if (typeof saved.frameStepAmount === 'number' && saved.frameStepAmount > 0) {
        frameStepAmount = saved.frameStepAmount;
      }
      if (typeof saved.decimalSeparatorSetting === 'string') {
        decimalSeparatorSetting = saved.decimalSeparatorSetting;
      }
    } else {
      const local = localStorage.getItem('cycleAnalyzerHotkeys');
      if (local) {
        const parsed = JSON.parse(local);
        const keysObj = parsed.hotkeys || parsed;
        Object.keys(DEFAULT_HOTKEYS).forEach(id => {
          if (keysObj[id] && keysObj[id].key) {
            currentHotkeys[id].key = parsed[id].key;
          }
          if (keysObj[id] && typeof keysObj[id].seek === 'number') {
            currentHotkeys[id].seek = keysObj[id].seek;
            const isRewind = keysObj[id].seek < 0;
            const sec = Math.abs(keysObj[id].seek);
            currentHotkeys[id].label = isRewind ? `Rewind -${sec}s` : `Forward +${sec}s`;
          }
          if (keysObj[id] && typeof keysObj[id].speed === 'number') {
            currentHotkeys[id].speed = keysObj[id].speed;
            currentHotkeys[id].label = `Speed ${keysObj[id].speed}x`;
          }
        });
        if (typeof parsed.frameStepAmount === 'number') {
          frameStepAmount = parsed.frameStepAmount;
        }
        if (typeof parsed.decimalSeparatorSetting === 'string') {
          decimalSeparatorSetting = parsed.decimalSeparatorSetting;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  updateLegendUI();
}

async function saveHotkeys() {
  try {
    const payload = {
      hotkeys: currentHotkeys,
      frameStepAmount: frameStepAmount,
      decimalSeparatorSetting: decimalSeparatorSetting
    };
    Object.keys(currentHotkeys).forEach(id => {
      payload[id] = currentHotkeys[id];
    });

    await ipcRenderer.invoke('save-settings', payload);
    localStorage.setItem('cycleAnalyzerHotkeys', JSON.stringify(payload));
    showToast('Settings saved!');
  } catch (err) {
    console.error('Failed to save settings:', err);
    showToast('Failed to save settings');
  }
  updateLegendUI();
}

function renderSettingsModal() {
  settingsContainer.innerHTML = '';
  const sections = ['General Controls', 'Seeking', 'Playback Speed'];

  sections.forEach(sectionName => {
    const titleEl = document.createElement('div');
    titleEl.className = 'settings-section-title';
    titleEl.textContent = sectionName;
    settingsContainer.appendChild(titleEl);

    // If General Controls section, add Decimal Separator option
    if (sectionName === 'General Controls') {
      const decRow = document.createElement('div');
      decRow.className = 'hotkey-row';
      decRow.innerHTML = `
        <span class="hotkey-label">Excel Decimal Separator</span>
        <select id="decimal-separator-select" style="padding: 6px 10px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 0.85rem; cursor: pointer;">
          <option value="comma" ${decimalSeparatorSetting === 'comma' ? 'selected' : ''}>Comma ( , ) - Polish / EU</option>
          <option value="dot" ${decimalSeparatorSetting === 'dot' ? 'selected' : ''}>Dot ( . ) - US / Standard</option>
        </select>
      `;
      settingsContainer.appendChild(decRow);

      const decSelect = decRow.querySelector('#decimal-separator-select');
      decSelect.addEventListener('change', (e) => {
        decimalSeparatorSetting = e.target.value;
        renderTable();
      });
    }

    // If Seeking section, add Frame Step Size input
    if (sectionName === 'Seeking') {
      const frameStepRow = document.createElement('div');
      frameStepRow.className = 'hotkey-row';
      frameStepRow.innerHTML = `
        <span class="hotkey-label">Frame Step Size (frames per arrow press)</span>
        <input type="number" id="frame-step-input" min="1" max="60" value="${frameStepAmount}" style="width: 70px; padding: 6px 10px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; text-align: center; font-family: monospace;" />
      `;
      settingsContainer.appendChild(frameStepRow);

      const frameStepInput = frameStepRow.querySelector('#frame-step-input');
      frameStepInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val > 0) {
          frameStepAmount = val;
        }
      });
    }

    Object.keys(currentHotkeys).forEach(actionId => {
      const item = currentHotkeys[actionId];
      if (item.section === sectionName) {
        const row = document.createElement('div');
        row.className = 'hotkey-row';

        const label = document.createElement('span');
        label.className = 'hotkey-label';
        label.textContent = item.label;

        const controlsWrapper = document.createElement('div');
        controlsWrapper.style.display = 'flex';
        controlsWrapper.style.alignItems = 'center';
        controlsWrapper.style.gap = '8px';

        // Add customizable seek seconds input for rewind/forward actions
        if (item.seek !== undefined) {
          const seekInput = document.createElement('input');
          seekInput.type = 'number';
          seekInput.min = '0.1';
          seekInput.step = '0.5';
          seekInput.value = Math.abs(item.seek);
          seekInput.style.cssText = 'width: 55px; padding: 4px 6px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-family: monospace; text-align: center; font-size: 0.85rem;';
          seekInput.title = 'Customize seek time in seconds';

          const secLabel = document.createElement('span');
          secLabel.textContent = 's';
          secLabel.style.cssText = 'font-size: 0.8rem; color: #888; margin-right: 4px;';

          seekInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
              const isRewind = item.seek < 0;
              item.seek = isRewind ? -val : val;
              item.label = isRewind ? `Rewind -${val}s` : `Forward +${val}s`;
              label.textContent = item.label;
            }
          });

          controlsWrapper.appendChild(seekInput);
          controlsWrapper.appendChild(secLabel);
        }

        // Add customizable speed multiplier input for playback speed actions
        if (item.speed !== undefined) {
          const speedInput = document.createElement('input');
          speedInput.type = 'number';
          speedInput.min = '0.1';
          speedInput.max = '16.0';
          speedInput.step = '0.05';
          speedInput.value = item.speed;
          speedInput.style.cssText = 'width: 60px; padding: 4px 6px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-family: monospace; text-align: center; font-size: 0.85rem;';
          speedInput.title = 'Customize playback speed multiplier (0.1x to 16.0x)';

          const speedLabel = document.createElement('span');
          speedLabel.textContent = 'x';
          speedLabel.style.cssText = 'font-size: 0.8rem; color: #888; margin-right: 4px;';

          speedInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 1.0;
            // Enforce allowed range [0.1, 16.0]
            val = Math.max(0.1, Math.min(16.0, val));
            val = Math.round(val * 100) / 100;
            e.target.value = val;
            item.speed = val;
            item.label = `Speed ${val}x`;
            label.textContent = item.label;
          });

          controlsWrapper.appendChild(speedInput);
          controlsWrapper.appendChild(speedLabel);
        }

        const btn = document.createElement('button');
        btn.className = 'hotkey-input-btn';
        btn.id = `hotkey-btn-${actionId}`;
        btn.textContent = formatKeyComboDisplay(item.key);

        btn.addEventListener('click', () => {
          if (listeningActionId) {
            const prevBtn = document.getElementById(`hotkey-btn-${listeningActionId}`);
            if (prevBtn) prevBtn.classList.remove('listening');
          }
          listeningActionId = actionId;
          btn.classList.add('listening');
          btn.textContent = 'Press key...';
        });

        controlsWrapper.appendChild(btn);
        row.appendChild(label);
        row.appendChild(controlsWrapper);
        settingsContainer.appendChild(row);
      }
    });
  });
}

function updateLegendUI() {
  if (!controlsLegend) return;
  const k = (id) => formatKeyComboDisplay(currentHotkeys[id]?.key);
  const s = (id) => Math.abs(currentHotkeys[id]?.seek || 0);

  controlsLegend.innerHTML = `
    <div><kbd>${k('recordCycle')}</kbd> Record Cycle | <kbd>${k('undoCycle')}</kbd> Undo (-5s) | <kbd>${k('deleteCycle')}</kbd> Delete Cycle</div>
    <div><kbd>${k('togglePlay')}</kbd> Pause/Play | <kbd>${k('copyExcel')}</kbd> Copy All | <kbd>${k('copyMedianExcel')}</kbd> Copy Median</div>
    <div><kbd>${k('rotateVideo')}</kbd> Rotate 90° | <kbd>${k('resetZoom')}</kbd> Reset Zoom</div>
    <div><kbd>${k('stepFrameBack')}</kbd> <kbd>${k('stepFrameFwd')}</kbd> Frame Step (${frameStepAmount}f)</div>
    <div><kbd>${k('seekBack60')}</kbd> <kbd>${k('seekBack30')}</kbd> <kbd>${k('seekBack10')}</kbd> <kbd>${k('seekBack5')}</kbd> <kbd>${k('seekBack1')}</kbd> Rewind (-${s('seekBack60')}s to -${s('seekBack1')}s)</div>
    <div><kbd>${k('seekFwd1')}</kbd> <kbd>${k('seekFwd5')}</kbd> <kbd>${k('seekFwd10')}</kbd> <kbd>${k('seekFwd30')}</kbd> <kbd>${k('seekFwd60')}</kbd> Forward (+${s('seekFwd1')}s to +${s('seekFwd60')}s)</div>
    <div><kbd>${k('speed025')}</kbd>-<kbd>${k('speed200')}</kbd> Speed Controls | <kbd>${k('renameVideo')}</kbd> Rename | <kbd>${k('openVideo')}</kbd> Open</div>
  `;
}

// Modal open/close listeners
openSettingsBtn.addEventListener('click', () => {
  renderSettingsModal();
  settingsModal.style.display = 'flex';
});

function closeSettingsModal(wasSaved = false) {
  if (listeningActionId) {
    const btn = document.getElementById(`hotkey-btn-${listeningActionId}`);
    if (btn) btn.classList.remove('listening');
    listeningActionId = null;
  }
  if (!wasSaved) {
    renderTable();
  }
  settingsModal.style.display = 'none';
}

settingsCloseX.addEventListener('click', () => closeSettingsModal(false));
settingsCancelBtn.addEventListener('click', () => closeSettingsModal(false));
settingsSaveBtn.addEventListener('click', () => {
  preModalDecimalSeparatorSetting = decimalSeparatorSetting;
  saveHotkeys();
  closeSettingsModal(true);
});
settingsResetBtn.addEventListener('click', () => {
  currentHotkeys = JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
  frameStepAmount = 1;
  decimalSeparatorSetting = 'auto';
  renderSettingsModal();
  renderTable();
  showToast('Reset to default hotkeys');
});

// --- Metal Mode Easter Egg State & Handler ---
let metalModeActive = false;
const konamiCode = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let konamiBuffer = [];
let metalAudio = null;

function toggleMetalMode() {
  metalModeActive = !metalModeActive;
  const metalOverlay = document.getElementById('metal-overlay');

  if (!metalAudio) {
    metalAudio = new Audio('assets/music.mp3');
    metalAudio.loop = true;
  }

  if (metalModeActive) {
    metalOverlay.style.display = 'flex';
    metalAudio.currentTime = 0;
    metalAudio.play().catch(err => console.error("Metal audio playback error:", err));
    showToast('🤘 METAL MODE ACTIVATED 🤘');
  } else {
    metalOverlay.style.display = 'none';
    metalAudio.pause();
    showToast('Metal mode deactivated');
  }
}

// Dynamic Keyboard Shortcuts Listener
window.addEventListener('keydown', (e) => {
  // Check for Konami Code sequence: ↑ ↑ ↓ ↓ ← → ← → B A
  let rawKey = e.key.toLowerCase();
  if (e.code === 'ArrowUp') rawKey = 'arrowup';
  if (e.code === 'ArrowDown') rawKey = 'arrowdown';
  if (e.code === 'ArrowLeft') rawKey = 'arrowleft';
  if (e.code === 'ArrowRight') rawKey = 'arrowright';

  konamiBuffer.push(rawKey);
  if (konamiBuffer.length > konamiCode.length) {
    konamiBuffer.shift();
  }

  if (konamiBuffer.length === konamiCode.length && konamiBuffer.every((val, idx) => val === konamiCode[idx])) {
    konamiBuffer = [];
    toggleMetalMode();
    return;
  }

  // If in rebind listening mode in settings modal:
  if (listeningActionId) {
    e.preventDefault();
    e.stopPropagation();
    const combo = getEventKeyCombo(e);
    if (combo) {
      currentHotkeys[listeningActionId].key = combo;
      const btn = document.getElementById(`hotkey-btn-${listeningActionId}`);
      if (btn) {
        btn.classList.remove('listening');
        btn.textContent = formatKeyComboDisplay(combo);
      }
      listeningActionId = null;
    }
    return;
  }

  // Prevent hotkeys if user is editing text/number inputs or textareas in modals
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  const combo = getEventKeyCombo(e);
  if (!combo) return;

  // Find matching action
  const matchedActionId = Object.keys(currentHotkeys).find(id => currentHotkeys[id].key === combo);

  if (matchedActionId) {
    e.preventDefault();
    const action = currentHotkeys[matchedActionId];

    if (matchedActionId === 'recordCycle') recordCycle();
    else if (matchedActionId === 'undoCycle') deleteLastCycle();
    else if (matchedActionId === 'deleteCycle') deleteLastCycle(false);
    else if (matchedActionId === 'togglePlay') {
      if (video.paused) video.play();
      else video.pause();
    }
    else if (matchedActionId === 'copyExcel') copyToClipboard();
    else if (matchedActionId === 'copyMedianExcel') copyMedianToClipboard();
    else if (matchedActionId === 'renameVideo') openRenameModal();
    else if (matchedActionId === 'openVideo') selectVideoFile();
    else if (matchedActionId === 'rotateVideo') rotateVideoClockwise();
    else if (matchedActionId === 'stepFrameBack') {
      video.pause();
      const frameSec = (1 / 30) * frameStepAmount;
      video.currentTime = Math.max(0, video.currentTime - frameSec);
    }
    else if (matchedActionId === 'stepFrameFwd') {
      video.pause();
      const frameSec = (1 / 30) * frameStepAmount;
      video.currentTime = Math.min(video.duration || 0, video.currentTime + frameSec);
    }
    else if (matchedActionId === 'zoomIn') setZoomLevel(zoomScale + 0.25);
    else if (matchedActionId === 'zoomOut') setZoomLevel(zoomScale - 0.25);
    else if (matchedActionId === 'resetZoom') resetZoom();
    else if (action.speed !== undefined) {
      const clampedSpeed = Math.max(0.1, Math.min(16.0, action.speed));
      video.playbackRate = clampedSpeed;
      showToast(`Speed: ${clampedSpeed}x`);
    }
    else if (action.seek !== undefined) {
      if (action.seek < 0) {
        video.currentTime = Math.max(0, video.currentTime + action.seek);
      } else {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + action.seek);
      }
    }
  }
});

// Load hotkeys on app startup
loadSavedHotkeys();