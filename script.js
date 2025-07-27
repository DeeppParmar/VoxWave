// Global Variables
const API_BASE_URL = 'http://localhost:8000';
let currentSong = null;
let currentPlaylist = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffled = false;
let repeatMode = 0; // 0: no repeat, 1: repeat all, 2: repeat one
let currentVolume = 0.7;
let recentlyPlayed = [];
let userLibrary = [];

// DOM Elements
const audioPlayer = document.getElementById('audioPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('playerProgressFill');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const volumeSlider = document.getElementById('volumeSlider');
const volumeFill = document.getElementById('volumeFill');
const volumeBtn = document.getElementById('volumeBtn');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadProgress = document.getElementById('uploadProgress');
const progressFillUpload = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Player Info Elements
const playerSongImage = document.getElementById('playerSongImage');
const playerSongTitle = document.getElementById('playerSongTitle');
const playerSongArtist = document.getElementById('playerSongArtist');
const likeBtn = document.getElementById('likeBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadRecentlyPlayed();
    loadUserLibrary();
    populateArtists();
});

function initializeApp() {
    // Set initial volume
    audioPlayer.volume = currentVolume;
    updateVolumeSlider();
    
    // Load saved settings
    const savedVolume = localStorage.getItem('musicPlayerVolume');
    if (savedVolume) {
        currentVolume = parseFloat(savedVolume);
        audioPlayer.volume = currentVolume;
        updateVolumeSlider();
    }

    const savedRecentlyPlayed = localStorage.getItem('recentlyPlayed');
    if (savedRecentlyPlayed) {
        recentlyPlayed = JSON.parse(savedRecentlyPlayed);
    }

    const savedLibrary = localStorage.getItem('userLibrary');
    if (savedLibrary) {
        userLibrary = JSON.parse(savedLibrary);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item a').forEach(link => {
        link.addEventListener('click', handleNavigation);
    });

    // Player Controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    prevBtn.addEventListener('click', playPreviousSong);
    nextBtn.addEventListener('click', playNextSong);
    shuffleBtn.addEventListener('click', toggleShuffle);
    repeatBtn.addEventListener('click', toggleRepeat);
    
    // Progress Bar
    progressBar.addEventListener('click', seekTo);
    
    // Volume Control
    volumeSlider.addEventListener('click', setVolume);
    volumeBtn.addEventListener('click', toggleMute);
    
    // Audio Events
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('ended', handleSongEnd);
    audioPlayer.addEventListener('play', () => updatePlayPauseButton(true));
    audioPlayer.addEventListener('pause', () => updatePlayPauseButton(false));
    
    // Search
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // File Upload
    document.getElementById('selectFilesBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    // Drag and Drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Like Button
    likeBtn.addEventListener('click', toggleLike);
    
    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Navigation
function handleNavigation(e) {
    e.preventDefault();
    const section = e.currentTarget.dataset.section;
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    e.currentTarget.parentElement.classList.add('active');
    
    // Show corresponding section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');
    
    // Special handling for search section
    if (section === 'search') {
        searchInput.focus();
    }
}

// Player Controls
function togglePlayPause() {
    if (!currentSong) return;
    
    if (isPlaying) {
        audioPlayer.pause();
    } else {
        audioPlayer.play().catch(error => {
            console.error('Playback failed:', error);
            showNotification('Playback failed', 'error');
        });
    }
}

function playPreviousSong() {
    if (currentPlaylist.length === 0) return;
    
    currentIndex = currentIndex > 0 ? currentIndex - 1 : currentPlaylist.length - 1;
    playSong(currentPlaylist[currentIndex]);
}

function playNextSong() {
    if (currentPlaylist.length === 0) return;
    
    if (isShuffled) {
        currentIndex = Math.floor(Math.random() * currentPlaylist.length);
    } else {
        currentIndex = currentIndex < currentPlaylist.length - 1 ? currentIndex + 1 : 0;
    }
    
    playSong(currentPlaylist[currentIndex]);
}

function toggleShuffle() {
    isShuffled = !isShuffled;
    shuffleBtn.classList.toggle('active', isShuffled);
    showNotification(isShuffled ? 'Shuffle on' : 'Shuffle off');
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const repeatIcon = repeatBtn.querySelector('i');
    
    switch (repeatMode) {
        case 0:
            repeatBtn.classList.remove('active');
            repeatIcon.className = 'fas fa-redo';
            showNotification('Repeat off');
            break;
        case 1:
            repeatBtn.classList.add('active');
            repeatIcon.className = 'fas fa-redo';
            showNotification('Repeat all');
            break;
        case 2:
            repeatBtn.classList.add('active');
            repeatIcon.className = 'fas fa-redo-alt';
            showNotification('Repeat one');
            break;
    }
}

function handleSongEnd() {
    if (repeatMode === 2) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else if (repeatMode === 1 || currentIndex < currentPlaylist.length - 1) {
        playNextSong();
    } else {
        isPlaying = false;
        updatePlayPauseButton(false);
    }
}

// Audio Control Functions
function playSong(song) {
    if (!song) return;
    
    currentSong = song;
    audioPlayer.src = song.url;
    
    // Update UI
    playerSongTitle.textContent = song.title;
    playerSongArtist.textContent = song.artist;
    playerSongImage.src = song.thumbnail || 'https://via.placeholder.com/56x56/333/fff?text=♪';
    
    // Add to recently played
    addToRecentlyPlayed(song);
    
    // Play the song
    audioPlayer.play().then(() => {
        isPlaying = true;
        updatePlayPauseButton(true);
    }).catch(error => {
        console.error('Playback failed:', error);
        showNotification('Failed to play song', 'error');
    });
}

function updatePlayPauseButton(playing) {
    const icon = playPauseBtn.querySelector('i');
    icon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    isPlaying = playing;
}

function updateProgress() {
    if (audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFill.style.width = `${progress}%`;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
}

function updateDuration() {
    totalTimeEl.textContent = formatTime(audioPlayer.duration);
}

function seekTo(e) {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = percent * audioPlayer.duration;
}

function setVolume(e) {
    const rect = volumeSlider.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    currentVolume = Math.max(0, Math.min(1, percent));
    audioPlayer.volume = currentVolume;
    updateVolumeSlider();
    localStorage.setItem('musicPlayerVolume', currentVolume);
}

function updateVolumeSlider() {
    volumeFill.style.width = `${currentVolume * 100}%`;
    const volumeIcon = volumeBtn.querySelector('i');
    
    if (currentVolume === 0) {
        volumeIcon.className = 'fas fa-volume-mute';
    } else if (currentVolume < 0.5) {
        volumeIcon.className = 'fas fa-volume-down';
    } else {
        volumeIcon.className = 'fas fa-volume-up';
    }
}

function toggleMute() {
    if (audioPlayer.volume > 0) {
        audioPlayer.volume = 0;
        currentVolume = 0;
    } else {
        currentVolume = 0.7;
        audioPlayer.volume = currentVolume;
    }
    updateVolumeSlider();
}

// Search Functionality
async function handleSearch() {
    const query = searchInput.value.trim();
    
    if (!query) {
        searchResults.innerHTML = `
            <div class="no-results">
                <i class="fas fa-music"></i>
                <p>Start typing to search for music</p>
            </div>
        `;
        return;
    }
    
    searchResults.innerHTML = `
        <div class="no-results">
            <div class="loading"></div>
            <p>Searching...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            displaySearchResults(data.results);
        } else {
            searchResults.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>No results found for "${query}"</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Search failed:', error);
        searchResults.innerHTML = `
            <div class="no-results">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Search failed. Please try again.</p>
            </div>
        `;
    }
}

function displaySearchResults(results) {
    searchResults.innerHTML = results.map(song => `
        <div class="search-result-item" onclick="playFromSearch('${song.id}', '${escapeHtml(song.title)}', '${escapeHtml(song.channel)}', '${song.thumbnail}')">
            <img src="${song.thumbnail}" alt="${escapeHtml(song.title)}">
            <div class="search-result-info">
                <h4>${escapeHtml(song.title)}</h4>
                <p>${escapeHtml(song.channel)} • ${song.duration}</p>
            </div>
        </div>
    `).join('');
}

async function playFromSearch(id, title, artist, thumbnail) {
    try {
        showNotification('Loading song...');
        
        const response = await fetch(`${API_BASE_URL}/play/${id}`);
        const data = await response.json();
        
        if (data.stream_url) {
            const song = {
                id: id,
                title: title,
                artist: artist,
                url: data.stream_url,
                thumbnail: thumbnail,
                source: 'youtube'
            };
            
            currentPlaylist = [song];
            currentIndex = 0;
            playSong(song);
        } else {
            showNotification('Failed to load song', 'error');
        }
    } catch (error) {
        console.error('Failed to play song:', error);
        showNotification('Failed to play song', 'error');
    }
}

// File Upload
function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(file => 
        file.type.startsWith('audio/') || 
        file.name.toLowerCase().endsWith('.mp3') || 
        file.name.toLowerCase().endsWith('.wav')
    );
    
    if (audioFiles.length > 0) {
        uploadFiles(audioFiles);
    } else {
        showNotification('Please upload audio files only', 'error');
    }
}

async function uploadFiles(files) {
    if (files.length === 0) return;
    
    uploadProgress.style.display = 'block';
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            progressText.textContent = `Uploading ${file.name}... (${i + 1}/${files.length})`;
            
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Add to user library
                const song = {
                    id: result.filename,
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    artist: 'Unknown Artist',
                    url: `${API_BASE_URL}/songs/${result.filename}`,
                    thumbnail: 'https://via.placeholder.com/300x300/333/fff?text=♪',
                    source: 'local'
                };
                
                userLibrary.push(song);
                saveUserLibrary();
                
                showNotification(`${file.name} uploaded successfully`);
            } else {
                showNotification(`Failed to upload ${file.name}`, 'error');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            showNotification(`Failed to upload ${file.name}`, 'error');
        }
        
        // Update progress
        const progress = ((i + 1) / files.length) * 100;
        progressFillUpload.style.width = `${progress}%`;
    }
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        progressFillUpload.style.width = '0%';
        updateLibraryView();
    }, 1000);
}

// Library Management
function addToRecentlyPlayed(song) {
    // Remove if already exists
    recentlyPlayed = recentlyPlayed.filter(s => s.id !== song.id);
    
    // Add to beginning
    recentlyPlayed.unshift(song);
    
    // Keep only last 20
    recentlyPlayed = recentlyPlayed.slice(0, 20);
    
    // Save to localStorage
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    
    // Update UI
    updateRecentlyPlayedView();
}

function loadRecentlyPlayed() {
    updateRecentlyPlayedView();
}

function updateRecentlyPlayedView() {
    const recentPlaylist = document.getElementById('recentPlaylist');
    
    if (recentlyPlayed.length === 0) {
        recentPlaylist.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">No recent songs</p>';
        return;
    }
    
    recentPlaylist.innerHTML = recentlyPlayed.slice(0, 10).map(song => `
        <div class="playlist-item" onclick="playSong(${JSON.stringify(song).replace(/"/g, '&quot;')})">
            <img src="${song.thumbnail}" alt="${escapeHtml(song.title)}">
            <div class="playlist-item-info">
                <div class="playlist-item-title">${escapeHtml(song.title)}</div>
                <div class="playlist-item-artist">${escapeHtml(song.artist)}</div>
            </div>
        </div>
    `).join('');
}

function loadUserLibrary() {
    updateLibraryView();
}

function updateLibraryView() {
    const libraryContent = document.getElementById('libraryContent');
    
    if (userLibrary.length === 0) {
        libraryContent.innerHTML = `
            <div class="empty-library">
                <i class="fas fa-music"></i>
                <p>Your library is empty</p>
                <p class="sub-text">Upload some music to get started</p>
            </div>
        `;
        return;
    }
    
    libraryContent.innerHTML = userLibrary.map(song => `
        <div class="search-result-item" onclick="playFromLibrary('${song.id}')">
            <img src="${song.thumbnail}" alt="${escapeHtml(song.title)}">
            <div class="search-result-info">
                <h4>${escapeHtml(song.title)}</h4>
                <p>${escapeHtml(song.artist)}</p>
            </div>
        </div>
    `).join('');
}

// Continuing from where the script.js file was cut off...

function playFromLibrary(id) {
    const song = userLibrary.find(s => s.id === id);
    if (song) {
        currentPlaylist = userLibrary;
        currentIndex = userLibrary.indexOf(song);
        playSong(song);
    }
}

function saveUserLibrary() {
    localStorage.setItem('userLibrary', JSON.stringify(userLibrary));
}

// Artists Population
function populateArtists() {
    const artistsGrid = document.getElementById('artistsGrid');
    const featuredArtists = [
        {
            name: 'The Weeknd',
            genre: 'R&B, Pop',
            image: 'https://via.placeholder.com/120x120/ff6b6b/ffffff?text=TW'
        },
        {
            name: 'Billie Eilish',
            genre: 'Alternative, Pop',
            image: 'https://via.placeholder.com/120x120/4ecdc4/ffffff?text=BE'
        },
        {
            name: 'Post Malone',
            genre: 'Hip Hop, Pop',
            image: 'https://via.placeholder.com/120x120/45b7d1/ffffff?text=PM'
        },
        {
            name: 'Ariana Grande',
            genre: 'Pop, R&B',
            image: 'https://via.placeholder.com/120x120/f9ca24/ffffff?text=AG'
        },
        {
            name: 'Drake',
            genre: 'Hip Hop, R&B',
            image: 'https://via.placeholder.com/120x120/6c5ce7/ffffff?text=D'
        },
        {
            name: 'Taylor Swift',
            genre: 'Pop, Country',
            image: 'https://via.placeholder.com/120x120/fd79a8/ffffff?text=TS'
        },
        {
            name: 'Ed Sheeran',
            genre: 'Pop, Folk',
            image: 'https://via.placeholder.com/120x120/00b894/ffffff?text=ES'
        },
        {
            name: 'Dua Lipa',
            genre: 'Pop, Dance',
            image: 'https://via.placeholder.com/120x120/e84393/ffffff?text=DL'
        }
    ];

    artistsGrid.innerHTML = featuredArtists.map(artist => `
        <div class="artist-card" onclick="searchArtist('${escapeHtml(artist.name)}')">
            <img src="${artist.image}" alt="${escapeHtml(artist.name)}">
            <h3>${escapeHtml(artist.name)}</h3>
            <p>${escapeHtml(artist.genre)}</p>
        </div>
    `).join('');
}

function searchArtist(artistName) {
    // Switch to search section
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector('[data-section="search"]').parentElement.classList.add('active');
    
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('search-section').classList.add('active');
    
    // Set search input and trigger search
    searchInput.value = artistName;
    handleSearch();
    searchInput.focus();
}

// Like/Unlike functionality
function toggleLike() {
    if (!currentSong) return;
    
    const isLiked = likeBtn.classList.contains('active');
    
    if (isLiked) {
        likeBtn.classList.remove('active');
        likeBtn.querySelector('i').className = 'far fa-heart';
        showNotification('Removed from liked songs');
    } else {
        likeBtn.classList.add('active');
        likeBtn.querySelector('i').className = 'fas fa-heart';
        showNotification('Added to liked songs');
    }
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
    // Prevent shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT') return;
    
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'KeyM':
            e.preventDefault();
            toggleMute();
            break;
        case 'KeyL':
            e.preventDefault();
            toggleLike();
            break;
        case 'KeyS':
            e.preventDefault();
            toggleShuffle();
            break;
        case 'KeyR':
            e.preventDefault();
            toggleRepeat();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (e.shiftKey) {
                playPreviousSong();
            } else {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
            }
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (e.shiftKey) {
                playNextSong();
            } else {
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            currentVolume = Math.min(1, currentVolume + 0.1);
            audioPlayer.volume = currentVolume;
            updateVolumeSlider();
            break;
        case 'ArrowDown':
            e.preventDefault();
            currentVolume = Math.max(0, currentVolume - 0.1);
            audioPlayer.volume = currentVolume;
            updateVolumeSlider();
            break;
    }
}

// Utility Functions
function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Notification System
function showNotification(message, type = 'success') {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create new notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Hide and remove notification
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Context Menu (Right-click functionality)
let contextMenu = null;

function createContextMenu(items, x, y) {
    // Remove existing context menu
    if (contextMenu) {
        contextMenu.remove();
    }
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
    
    contextMenu.innerHTML = items.map(item => `
        <div class="context-menu-item" onclick="${item.action}">
            <i class="${item.icon}"></i>
            <span>${item.label}</span>
        </div>
    `).join('');
    
    document.body.appendChild(contextMenu);
    
    // Close context menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
    document.removeEventListener('click', closeContextMenu);
}

// Queue Management
let queuePanel = null;

function toggleQueue() {
    if (!queuePanel) {
        createQueuePanel();
    }
    
    queuePanel.classList.toggle('open');
}

function createQueuePanel() {
    queuePanel = document.createElement('div');
    queuePanel.className = 'queue-panel';
    queuePanel.innerHTML = `
        <div class="queue-header">
            <h3>Queue</h3>
            <button class="close-queue" onclick="toggleQueue()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="queue-content" id="queueContent">
            <!-- Queue items will be populated here -->
        </div>
    `;
    
    document.body.appendChild(queuePanel);
    updateQueueView();
}

function updateQueueView() {
    if (!queuePanel) return;
    
    const queueContent = document.getElementById('queueContent');
    
    if (currentPlaylist.length === 0) {
        queueContent.innerHTML = `
            <div class="empty-library">
                <i class="fas fa-list"></i>
                <p>Queue is empty</p>
                <p class="sub-text">Play some music to see it here</p>
            </div>
        `;
        return;
    }
    
    queueContent.innerHTML = currentPlaylist.map((song, index) => `
        <div class="queue-item ${index === currentIndex ? 'current' : ''}" onclick="jumpToSong(${index})">
            <img src="${song.thumbnail}" alt="${escapeHtml(song.title)}">
            <div class="queue-item-info">
                <div class="queue-item-title">${escapeHtml(song.title)}</div>
                <div class="queue-item-artist">${escapeHtml(song.artist)}</div>
            </div>
            <div class="queue-item-duration">${song.duration || '0:00'}</div>
        </div>
    `).join('');
}

function jumpToSong(index) {
    if (index >= 0 && index < currentPlaylist.length) {
        currentIndex = index;
        playSong(currentPlaylist[index]);
        updateQueueView();
    }
}

// Add event listener for queue button
document.getElementById('queueBtn').addEventListener('click', toggleQueue);

// Equalizer Visualization
function createEqualizer() {
    const equalizer = document.createElement('div');
    equalizer.className = 'equalizer';
    
    for (let i = 0; i < 4; i++) {
        const bar = document.createElement('div');
        bar.className = 'equalizer-bar';
        equalizer.appendChild(bar);
    }
    
    return equalizer;
}

// Waveform Visualization (Basic)
function createWaveform() {
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'waveform-container';
    
    for (let i = 0; i < 50; i++) {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.height = `${Math.random() * 30 + 5}px`;
        waveformContainer.appendChild(bar);
    }
    
    return waveformContainer;
}

// Enhanced Progress Bar Interaction
function enhanceProgressBar() {
    const progressContainer = document.querySelector('.progress-container');
    const progressThumb = document.getElementById('progressThumb');
    let isDragging = false;
    
    progressBar.addEventListener('mouseenter', () => {
        progressThumb.style.opacity = '1';
    });
    
    progressBar.addEventListener('mouseleave', () => {
        if (!isDragging) {
            progressThumb.style.opacity = '0';
        }
    });
    
    progressBar.addEventListener('mousemove', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        progressThumb.style.left = `${percent * 100}%`;
    });
    
    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.addEventListener('mousemove', handleProgressDrag);
        document.addEventListener('mouseup', stopProgressDrag);
    });
    
    function handleProgressDrag(e) {
        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        progressThumb.style.left = `${percent * 100}%`;
        
        if (audioPlayer.duration) {
            audioPlayer.currentTime = percent * audioPlayer.duration;
        }
    }
    
    function stopProgressDrag() {
        isDragging = false;
        progressThumb.style.opacity = '0';
        document.removeEventListener('mousemove', handleProgressDrag);
        document.removeEventListener('mouseup', stopProgressDrag);
    }
}

// Enhanced Volume Slider Interaction
function enhanceVolumeSlider() {
    const volumeThumb = document.getElementById('volumeThumb');
    let isDragging = false;
    
    volumeSlider.addEventListener('mouseenter', () => {
        volumeThumb.style.opacity = '1';
    });
    
    volumeSlider.addEventListener('mouseleave', () => {
        if (!isDragging) {
            volumeThumb.style.opacity = '0';
        }
    });
    
    volumeSlider.addEventListener('mousemove', (e) => {
        const rect = volumeSlider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        volumeThumb.style.left = `${percent * 100}%`;
    });
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.addEventListener('mousemove', handleVolumeDrag);
        document.addEventListener('mouseup', stopVolumeDrag);
    });
    
    function handleVolumeDrag(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        volumeThumb.style.left = `${percent * 100}%`;
        
        currentVolume = percent;
        audioPlayer.volume = currentVolume;
        updateVolumeSlider();
    }
    
    function stopVolumeDrag() {
        isDragging = false;
        volumeThumb.style.opacity = '0';
        document.removeEventListener('mousemove', handleVolumeDrag);
        document.removeEventListener('mouseup', stopVolumeDrag);
    }
}

// Initialize enhanced interactions
document.addEventListener('DOMContentLoaded', function() {
    enhanceProgressBar();
    enhanceVolumeSlider();
});

// Auto-save settings
function saveSettings() {
    const settings = {
        volume: currentVolume,
        shuffle: isShuffled,
        repeat: repeatMode,
        recentlyPlayed: recentlyPlayed,
        userLibrary: userLibrary
    };
    
    localStorage.setItem('musicPlayerSettings', JSON.stringify(settings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('musicPlayerSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        
        currentVolume = settings.volume || 0.7;
        isShuffled = settings.shuffle || false;
        repeatMode = settings.repeat || 0;
        recentlyPlayed = settings.recentlyPlayed || [];
        userLibrary = settings.userLibrary || [];
        
        // Apply loaded settings
        audioPlayer.volume = currentVolume;
        updateVolumeSlider();
        
        if (isShuffled) {
            shuffleBtn.classList.add('active');
        }
        
        // Update repeat button
        const repeatIcon = repeatBtn.querySelector('i');
        switch (repeatMode) {
            case 1:
                repeatBtn.classList.add('active');
                repeatIcon.className = 'fas fa-redo';
                break;
            case 2:
                repeatBtn.classList.add('active');
                repeatIcon.className = 'fas fa-redo-alt';
                break;
        }
    }
}

// Auto-save periodically
setInterval(saveSettings, 30000); // Save every 30 seconds

// Save on page unload
window.addEventListener('beforeunload', saveSettings);

// Error Handling
function handleAudioError() {
    showNotification('Error playing audio', 'error');
    isPlaying = false;
    updatePlayPauseButton(false);
}

audioPlayer.addEventListener('error', handleAudioError);

// Media Session API for better media controls
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        if (currentSong && audioPlayer.paused) {
            audioPlayer.play();
        }
    });
    
    navigator.mediaSession.setActionHandler('pause', () => {
        if (currentSong && !audioPlayer.paused) {
            audioPlayer.pause();
        }
    });
    
    navigator.mediaSession.setActionHandler('previoustrack', playPreviousSong);
    navigator.mediaSession.setActionHandler('nexttrack', playNextSong);
    
    navigator.mediaSession.setActionHandler('seekto', (event) => {
        if (audioPlayer.duration && event.seekTime) {
            audioPlayer.currentTime = event.seekTime;
        }
    });
}

// Update media session metadata when song changes
function updateMediaSession(song) {
    if ('mediaSession' in navigator && song) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            artwork: [
                { src: song.thumbnail, sizes: '512x512', type: 'image/png' }
            ]
        });
    }
}

// Call updateMediaSession when playing a song
const originalPlaySong = playSong;
playSong = function(song) {
    originalPlaySong(song);
    updateMediaSession(song);
};

// Performance optimization: Lazy loading for images
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Initialize lazy loading
document.addEventListener('DOMContentLoaded', lazyLoadImages);

// Service Worker for offline functionality (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Touch gestures for mobile
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // Horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
            // Swipe right - previous song
            playPreviousSong();
        } else {
            // Swipe left - next song
            playNextSong();
        }
    }
    
    // Vertical swipe
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
        if (deltaY > 0) {
            // Swipe down - decrease volume
            currentVolume = Math.max(0, currentVolume - 0.1);
            audioPlayer.volume = currentVolume;
            updateVolumeSlider();
        } else {
            // Swipe up - increase volume
            currentVolume = Math.min(1, currentVolume + 0.1);
            audioPlayer.volume = currentVolume;
            updateVolumeSlider();
        }
    }
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    console.log('SpotifyClone Music Player initialized successfully!');
    
    // Show welcome notification
    setTimeout(() => {
        showNotification('Welcome to SpotifyClone! 🎵');
    }, 1000);
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    saveSettings();
    if (audioPlayer) {
        audioPlayer.pause();
    }
    
    // Close context menu
    closeContextMenu();
});

// Debug helpers (remove in production)
window.musicPlayer = {
    currentSong,
    currentPlaylist,
    currentIndex,
    isPlaying,
    isShuffled,
    repeatMode,
    currentVolume,
    recentlyPlayed,
    userLibrary,
    
    // Debug functions
    playTestSong: () => {
        const testSong = {
            id: 'test',
            title: 'Test Song',
            artist: 'Test Artist',
            url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
            thumbnail: 'https://via.placeholder.com/56x56/1db954/ffffff?text=T'
        };
        playSong(testSong);
    },
    
    clearLibrary: () => {
        userLibrary = [];
        saveUserLibrary();
        updateLibraryView();
        showNotification('Library cleared');
    },
    
    clearRecent: () => {
        recentlyPlayed = [];
        localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
        updateRecentlyPlayedView();
        showNotification('Recently played cleared');
    }
};

console.log('Music Player Debug Helper available at window.musicPlayer');