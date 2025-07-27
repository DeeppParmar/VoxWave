"""
SpotifyClone FastAPI Backend - Python 3.13 Compatible Version
"""

import sys
import warnings

# Suppress deprecation warnings for Python 3.13 compatibility
warnings.filterwarnings("ignore", category=DeprecationWarning)

try:
    from fastapi import FastAPI, File, UploadFile, HTTPException, Query
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware
except ImportError as e:
    print(f"❌ FastAPI import error: {e}")
    print("Please run: python install.py")
    sys.exit(1)

import os
import uuid
from pathlib import Path
import logging
from typing import List, Optional

# Try to import optional dependencies
try:
    from youtubesearchpython import VideosSearch
    YOUTUBE_SEARCH_AVAILABLE = True
except ImportError:
    YOUTUBE_SEARCH_AVAILABLE = False
    print("⚠️  YouTube search not available. Install: pip install youtube-search-python")

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False
    print("⚠️  yt-dlp not available. Install: pip install yt-dlp")

try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False
    print("⚠️  aiofiles not available. Using synchronous file operations.")

# Pydantic models with Python 3.13 compatibility
try:
    from pydantic import BaseModel
    
    class SearchResult(BaseModel):
        id: str
        title: str
        channel: str
        duration: str
        thumbnail: str
        url: str
    
    class SearchResponse(BaseModel):
        results: List[SearchResult]
        total: int
    
    class PlayResponse(BaseModel):
        stream_url: str
        title: str
        duration: Optional[str] = None
    
    class UploadResponse(BaseModel):
        filename: str
        original_name: str
        size: int
        message: str
    
    class HealthResponse(BaseModel):
        status: str
        message: str
        
except ImportError as e:
    print(f"❌ Pydantic import error: {e}")
    print("Please run: python install.py")
    sys.exit(1)

# Create FastAPI app
app = FastAPI(
    title="SpotifyClone API",
    description="A modern music streaming API with YouTube integration",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_DIR = Path("uploads")
STATIC_DIR = Path("static")
UPLOAD_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint"""
    return HealthResponse(
        status="success",
        message="SpotifyClone API is running!"
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    features = {
        "youtube_search": YOUTUBE_SEARCH_AVAILABLE,
        "youtube_streaming": YT_DLP_AVAILABLE,
        "async_files": AIOFILES_AVAILABLE
    }
    
    return HealthResponse(
        status="healthy",
        message=f"API operational. Features: {features}"
    )

@app.get("/songs/{filename}")
async def serve_song(filename: str):
    """Serve uploaded audio files"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not supported")
    
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"}
    )

@app.post("/upload", response_model=UploadResponse)
async def upload_audio(file: UploadFile = File(...)):
    """Upload audio file to server"""
    
    # Validate file extension
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_ext} not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        # Save file (use aiofiles if available, otherwise standard file operations)
        if AIOFILES_AVAILABLE:
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(content)
        else:
            with open(file_path, 'wb') as f:
                f.write(content)
        
        logger.info(f"File uploaded successfully: {unique_filename}")
        
        return UploadResponse(
            filename=unique_filename,
            original_name=file.filename or "unknown",
            size=file_size,
            message="File uploaded successfully"
        )
    
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Upload failed")

@app.get("/search", response_model=SearchResponse)
async def search_youtube(q: str = Query(..., description="Search query")):
    """Search YouTube for videos"""
    
    if not YOUTUBE_SEARCH_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="YouTube search not available. Please install youtube-search-python"
        )
    
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    
    try:
        videos_search = VideosSearch(q, limit=20)
        results = videos_search.result()
        
        search_results = []
        
        for video in results['result']:
            search_result = SearchResult(
                id=video['id'],
                title=video['title'],
                channel=video['channel']['name'],
                duration=video.get('duration', 'Unknown'),
                thumbnail=video['thumbnails'][0]['url'] if video['thumbnails'] else '',
                url=video['link']
            )
            search_results.append(search_result)
        
        return SearchResponse(
            results=search_results,
            total=len(search_results)
        )
    
    except Exception as e:
        logger.error(f"Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/play/{video_id}", response_model=PlayResponse)
async def get_stream_url(video_id: str):
    """Get streamable URL for a YouTube video"""
    
    if not YT_DLP_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="yt-dlp not available. Please install yt-dlp"
        )
    
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extractaudio': True,
            'audioformat': 'mp3',
            'noplaylist': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            info = ydl.extract_info(video_url, download=False)
            
            # Get the best audio stream
            formats = info.get('formats', [])
            audio_url = None
            
            # Find audio-only format first
            for fmt in formats:
                if fmt.get('acodec') != 'none' and fmt.get('vcodec') == 'none':
                    audio_url = fmt.get('url')
                    break
            
            # If no audio-only, get best format with audio
            if not audio_url:
                for fmt in formats:
                    if fmt.get('acodec') != 'none':
                        audio_url = fmt.get('url')
                        break
            
            if not audio_url:
                raise HTTPException(status_code=404, detail="No playable audio stream found")
            
            return PlayResponse(
                stream_url=audio_url,
                title=info.get('title', 'Unknown Title'),
                duration=info.get('duration_string', 'Unknown')
            )
    
    except Exception as e:
        logger.error(f"Failed to get stream URL for {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stream URL: {str(e)}")

@app.get("/library")
async def get_library():
    """Get list of uploaded songs"""
    try:
        songs = []
        
        if UPLOAD_DIR.exists():
            for file_path in UPLOAD_DIR.iterdir():
                if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                    stat = file_path.stat()
                    songs.append({
                        'id': file_path.name,
                        'filename': file_path.name,
                        'original_name': file_path.stem,
                        'size': stat.st_size,
                        'modified': stat.st_mtime,
                        'url': f'/songs/{file_path.name}'
                    })
        
        songs.sort(key=lambda x: x['modified'], reverse=True)
        
        return {
            'songs': songs,
            'total': len(songs)
        }
    
    except Exception as e:
        logger.error(f"Failed to get library: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get library")

@app.delete("/songs/{filename}")
async def delete_song(filename: str):
    """Delete an uploaded song"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        file_path.unlink()
        logger.info(f"File deleted successfully: {filename}")
        return {"message": f"File {filename} deleted successfully"}
    
    except Exception as e:
        logger.error(f"Failed to delete file {filename}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete file")

@app.get("/trending", response_model=SearchResponse)
async def get_trending():
    """Get trending music from YouTube"""
    
    if not YOUTUBE_SEARCH_AVAILABLE:
        # Return mock data if YouTube search is not available
        mock_results = [
            SearchResult(
                id="mock1",
                title="Demo Song 1",
                channel="Demo Artist",
                duration="3:45",
                thumbnail="https://via.placeholder.com/120x120/1db954/ffffff?text=♪",
                url="https://example.com"
            ),
            SearchResult(
                id="mock2", 
                title="Demo Song 2",
                channel="Demo Artist 2",
                duration="4:12",
                thumbnail="https://via.placeholder.com/120x120/1db954/ffffff?text=♪",
                url="https://example.com"
            )
        ]
        
        return SearchResponse(
            results=mock_results,
            total=len(mock_results)
        )
    
    try:
        import random
        trending_queries = [
            "trending music 2024",
            "popular songs",
            "top hits",
            "viral music"
        ]
        
        query = random.choice(trending_queries)
        videos_search = VideosSearch(query, limit=10)
        results = videos_search.result()
        
        search_results = []
        
        for video in results['result']:
            search_result = SearchResult(
                id=video['id'],
                title=video['title'],
                channel=video['channel']['name'],
                duration=video.get('duration', 'Unknown'),
                thumbnail=video['thumbnails'][0]['url'] if video['thumbnails'] else '',
                url=video['link']
            )
            search_results.append(search_result)
        
        return SearchResponse(
            results=search_results,
            total=len(search_results)
        )
    
    except Exception as e:
        logger.error(f"Failed to get trending: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get trending: {str(e)}")

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize the application"""
    logger.info("🎵 SpotifyClone API starting up...")
    
    # Check Python version
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    logger.info(f"Python version: {python_version}")
    
    # Check dependencies
    dependencies = {
        "youtube-search-python": YOUTUBE_SEARCH_AVAILABLE,
        "yt-dlp": YT_DLP_AVAILABLE,
        "aiofiles": AIOFILES_AVAILABLE
    }
    
    for dep, available in dependencies.items():
        status = "✓" if available else "✗"
        logger.info(f"{status} {dep}: {'Available' if available else 'Not available'}")
    
    # Create directories
    UPLOAD_DIR.mkdir(exist_ok=True)
    STATIC_DIR.mkdir(exist_ok=True)
    
    logger.info("✅ SpotifyClone API started successfully!")
    logger.info("📝 API Documentation: http://localhost:8000/docs")

if __name__ == "__main__":
    try:
        import uvicorn
        print("🚀 Starting SpotifyClone API...")
        print("📍 Backend: http://localhost:8000")
        print("📝 API Docs: http://localhost:8000/docs")
        print("🎵 Frontend: http://localhost:3000 (after running: python -m http.server 3000)")
        print("\n⏹️  Press Ctrl+C to stop\n")
        
        uvicorn.run(
            "main_python313:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
    except ImportError:
        print("❌ Uvicorn not available. Please run: python install.py")
    except KeyboardInterrupt:
        print("\n👋 SpotifyClone API stopped.")
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        print("Please run: python install.py")