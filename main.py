from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import asyncio
from typing import List, Optional
import json
import uuid
from pathlib import Path
import aiofiles
from pydantic import BaseModel
import logging
from urllib.parse import quote, unquote
import requests
from datetime import datetime, timedelta

# YouTube search imports
try:
    from youtubesearchpython import VideosSearch
    YOUTUBE_SEARCH_AVAILABLE = True
except ImportError:
    YOUTUBE_SEARCH_AVAILABLE = False
    print("Warning: youtube-search-python not available. Install with: pip install youtube-search-python")

# yt-dlp for getting stream URLs
try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False
    print("Warning: yt-dlp not available. Install with: pip install yt-dlp")

# Create FastAPI app
app = FastAPI(
    title="SpotifyClone API",
    description="A modern music streaming API with YouTube integration and local file support",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create directories
UPLOAD_DIR = Path("uploads")
STATIC_DIR = Path("static")
CACHE_DIR = Path("cache")
UPLOAD_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

# Allowed file extensions
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Cache for stream URLs to avoid repeated yt-dlp calls
stream_cache = {}
CACHE_DURATION = timedelta(hours=1)  # Cache URLs for 1 hour

# Data models
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
    error: Optional[str] = None

class UploadResponse(BaseModel):
    filename: str
    original_name: str
    size: int
    message: str

class HealthResponse(BaseModel):
    status: str
    message: str
    youtube_available: bool
    ytdlp_available: bool

class ErrorResponse(BaseModel):
    error: str
    detail: str
    suggestions: List[str] = []

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint with system status"""
    return HealthResponse(
        status="success",
        message="SpotifyClone API is running!",
        youtube_available=YOUTUBE_SEARCH_AVAILABLE,
        ytdlp_available=YT_DLP_AVAILABLE
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Detailed health check endpoint"""
    return HealthResponse(
        status="healthy",
        message="API is operational",
        youtube_available=YOUTUBE_SEARCH_AVAILABLE,
        ytdlp_available=YT_DLP_AVAILABLE
    )

# Enhanced error handler
def create_error_response(error_msg: str, detail: str, suggestions: List[str] = None) -> ErrorResponse:
    """Create a standardized error response with helpful suggestions"""
    if suggestions is None:
        suggestions = []
    
    return ErrorResponse(
        error=error_msg,
        detail=detail,
        suggestions=suggestions
    )

# Serve uploaded songs
@app.get("/songs/{filename}")
async def serve_song(filename: str):
    """Serve uploaded audio files with proper headers"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if file extension is allowed
    if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not supported")
    
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
        }
    )

@app.post("/upload", response_model=UploadResponse)
async def upload_audio(file: UploadFile = File(...)):
    """Upload audio file to server with enhanced validation"""
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_ext} not supported. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Check file size
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
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        logger.info(f"File uploaded successfully: {unique_filename}")
        
        return UploadResponse(
            filename=unique_filename,
            original_name=file.filename,
            size=file_size,
            message="File uploaded successfully"
        )
    
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Upload failed")

@app.get("/search", response_model=SearchResponse)
async def search_youtube(q: str = Query(..., description="Search query")):
    """Search YouTube for videos with enhanced error handling"""
    
    if not YOUTUBE_SEARCH_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="YouTube search not available. Please install youtube-search-python"
        )
    
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    
    try:
        logger.info(f"Searching for: {q}")
        
        # Search YouTube with additional parameters
        videos_search = VideosSearch(q, limit=20, region='US', language='en')
        results = videos_search.result()
        
        if not results or 'result' not in results:
            logger.warning(f"No results found for query: {q}")
            return SearchResponse(results=[], total=0)
        
        search_results = []
        
        for video in results['result']:
            try:
                # Skip shorts and very short videos
                duration = video.get('duration', '0:00')
                if 'Shorts' in video.get('title', '') or duration in ['0:00', None]:
                    continue
                
                search_result = SearchResult(
                    id=video['id'],
                    title=video['title'],
                    channel=video['channel']['name'],
                    duration=duration,
                    thumbnail=video['thumbnails'][0]['url'] if video.get('thumbnails') else '',
                    url=video['link']
                )
                search_results.append(search_result)
            except KeyError as e:
                logger.warning(f"Skipping video due to missing field: {e}")
                continue
        
        logger.info(f"Found {len(search_results)} valid results")
        return SearchResponse(
            results=search_results,
            total=len(search_results)
        )
    
    except Exception as e:
        logger.error(f"Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

def get_yt_dlp_options():
    """Get optimized yt-dlp options"""
    return {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extractaudio': True,
        'audioformat': 'mp3',
        'noplaylist': True,
        'nocheckcertificate': True,
        'ignoreerrors': False,
        'extract_flat': False,
        'writethumbnail': False,
        'writeinfojson': False,
        'no_color': True,
        'age_limit': 18,
        # Add user agent to avoid blocking
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    }

@app.get("/play/{video_id}")
async def get_stream_url(video_id: str):
    """Get streamable URL for a YouTube video with caching and fallbacks"""
    
    if not YT_DLP_AVAILABLE:
        return create_error_response(
            "Service Unavailable",
            "yt-dlp not available. Please install yt-dlp",
            ["Install yt-dlp: pip install yt-dlp", "Try uploading local files instead"]
        )
    
    # Check cache first
    cache_key = f"{video_id}_{datetime.now().strftime('%Y%m%d%H')}"
    if cache_key in stream_cache:
        cached_data = stream_cache[cache_key]
        if datetime.now() - cached_data['timestamp'] < CACHE_DURATION:
            logger.info(f"Returning cached URL for {video_id}")
            return PlayResponse(**cached_data['data'])
    
    try:
        logger.info(f"Extracting stream URL for video: {video_id}")
        
        ydl_opts = get_yt_dlp_options()
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            try:
                # Extract info
                info = ydl.extract_info(video_url, download=False)
            except yt_dlp.utils.DownloadError as e:
                logger.error(f"yt-dlp download error for {video_id}: {str(e)}")
                error_msg = str(e).lower()
                
                if "403" in error_msg or "forbidden" in error_msg:
                    return create_error_response(
                        "Access Forbidden",
                        "This video is currently blocked by YouTube",
                        [
                            "Try a different video",
                            "This is a temporary YouTube restriction",
                            "The video may be geo-blocked"
                        ]
                    )
                elif "404" in error_msg or "not found" in error_msg:
                    return create_error_response(
                        "Video Not Found",
                        "This video is not available",
                        [
                            "The video may have been deleted",
                            "Check if the video ID is correct",
                            "Try searching for the song again"
                        ]
                    )
                else:
                    return create_error_response(
                        "Extraction Failed",
                        f"Could not extract video: {str(e)[:100]}",
                        [
                            "Try a different video",
                            "Check your internet connection",
                            "YouTube may be blocking requests"
                        ]
                    )
            
            if not info:
                return create_error_response(
                    "No Video Info",
                    "Could not retrieve video information",
                    ["Try a different video", "The video may be private"]
                )
            
            # Get the best audio stream
            formats = info.get('formats', [])
            audio_url = None
            
            # Priority order for audio formats
            format_priorities = ['m4a', 'mp3', 'webm', 'mp4']
            
            # First try to find audio-only streams
            for priority in format_priorities:
                for fmt in formats:
                    if (fmt.get('acodec') != 'none' and 
                        fmt.get('vcodec') == 'none' and 
                        fmt.get('ext') == priority):
                        audio_url = fmt.get('url')
                        logger.info(f"Found {priority} audio-only stream")
                        break
                if audio_url:
                    break
            
            # If no audio-only format found, try any format with audio
            if not audio_url:
                for fmt in formats:
                    if fmt.get('acodec') != 'none':
                        audio_url = fmt.get('url')
                        logger.info(f"Using mixed format: {fmt.get('ext', 'unknown')}")
                        break
            
            if not audio_url:
                return create_error_response(
                    "No Audio Stream",
                    "No playable audio stream found for this video",
                    [
                        "This video may not have audio",
                        "Try a different video",
                        "The video format may not be supported"
                    ]
                )
            
            # Test if the URL is accessible
            try:
                response = requests.head(audio_url, timeout=5, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                if response.status_code >= 400:
                    logger.warning(f"Stream URL returned status {response.status_code}")
            except requests.RequestException as e:
                logger.warning(f"Could not verify stream URL: {e}")
            
            play_response = PlayResponse(
                stream_url=audio_url,
                title=info.get('title', 'Unknown Title'),
                duration=info.get('duration_string', 'Unknown')
            )
            
            # Cache the successful response
            stream_cache[cache_key] = {
                'data': play_response.dict(),
                'timestamp': datetime.now()
            }
            
            # Clean old cache entries
            current_time = datetime.now()
            expired_keys = [
                key for key, value in stream_cache.items()
                if current_time - value['timestamp'] > CACHE_DURATION
            ]
            for expired_key in expired_keys:
                del stream_cache[expired_key]
            
            logger.info(f"Successfully extracted stream URL for {video_id}")
            return play_response
    
    except Exception as e:
        logger.error(f"Unexpected error getting stream URL for {video_id}: {str(e)}")
        return create_error_response(
            "Internal Error",
            f"An unexpected error occurred: {str(e)[:100]}",
            [
                "Try again in a few moments",
                "Check your internet connection",
                "Try a different video"
            ]
        )

@app.get("/library")
async def get_library():
    """Get list of uploaded songs with metadata"""
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
                        'url': f'/songs/{file_path.name}',
                        'source': 'local'
                    })
        
        # Sort by modification time (newest first)
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

@app.get("/debug/{video_id}")
async def debug_video(video_id: str):
    """Debug endpoint to test video extraction"""
    if not YT_DLP_AVAILABLE:
        return {"error": "yt-dlp not available"}
    
    try:
        ydl_opts = get_yt_dlp_options()
        ydl_opts['verbose'] = True
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            info = ydl.extract_info(video_url, download=False)
            
            debug_info = {
                'title': info.get('title'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'formats_count': len(info.get('formats', [])),
                'available_formats': []
            }
            
            for fmt in info.get('formats', [])[:5]:  # Show first 5 formats
                debug_info['available_formats'].append({
                    'format_id': fmt.get('format_id'),
                    'ext': fmt.get('ext'),
                    'acodec': fmt.get('acodec'),
                    'vcodec': fmt.get('vcodec'),
                    'url_available': bool(fmt.get('url'))
                })
            
            return debug_info
    
    except Exception as e:
        return {"error": str(e)}

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return {"error": "Not found", "detail": "The requested resource was not found"}

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return {"error": "Internal server error", "detail": "An unexpected error occurred"}

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup"""
    logger.info("SpotifyClone API starting up...")
    
    # Check dependencies
    dependencies = {
        "youtube-search-python": YOUTUBE_SEARCH_AVAILABLE,
        "yt-dlp": YT_DLP_AVAILABLE
    }
    
    for dep, available in dependencies.items():
        status = "✓" if available else "✗"
        logger.info(f"{status} {dep}: {'Available' if available else 'Not available'}")
    
    # Create necessary directories
    UPLOAD_DIR.mkdir(exist_ok=True)
    STATIC_DIR.mkdir(exist_ok=True)
    CACHE_DIR.mkdir(exist_ok=True)
    
    logger.info("SpotifyClone API started successfully!")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown"""
    logger.info("SpotifyClone API shutting down...")

if __name__ == "__main__":
    import uvicorn
        
    # Run the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )