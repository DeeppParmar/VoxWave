# VoxWave
# 🎧 Spotify Clone – Music Streaming 

A sleek, dark-themed Spotify-inspired web app built with ❤️ using **HTML, CSS, JavaScript**, and **FastAPI**. Supports streaming from YouTube, local file upload, and smooth media controls.

---

## 🔥 Features

- 🎵 Play songs via YouTube URLs  
- 📂 Drag & drop local file uploads  
- ⚡ FastAPI backend to process and serve audio  
- 🌓 Fully dark mode UI (like original Spotify)  
- 📱 Mobile-friendly & responsive design  
- 🎚️ Advanced audio player (seek, skip, volume)  
- 🧠 Smart fallback handling for YouTube ads/errors  

---

## 🚀 Getting Started


### 1. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

If you don’t have a `requirements.txt`, install manually:

```bash
pip install fastapi uvicorn yt-dlp aiohttp
```

---

### 2. Run the Backend Server

```bash
python main.py
# OR
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

> Visit: [http://localhost:8000](http://localhost:8000)

---

### 3. Start Frontend (Static Server)

```bash
python -m http.server 3000
```

> Visit: [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Project Structure

```
spotify-clone/
│
├── main.py                 # FastAPI backend
├── index.html              # Frontend HTML
├── style.css               # Frontend styling
├── script.js              # Main JS logic
├── /music/                 # Uploaded songs (optional)
└── requirements.txt
```


## 📦 To-Do

- [ ] Add playlist support  
- [ ] Add user login system  
- [ ] Improve loading performance  
- [ ] Integrate lyrics API  

---

## 📄 License

This project is licensed under the MIT License – feel free to use and remix!

---

## 🤘 Made by

**Deep Parmar**  
[@deeppparmar](https://github.com/deeppparmar) – _Built with love & caffeine._
