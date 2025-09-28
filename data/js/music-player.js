import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';
import { getSetting } from './idb.js';

const musicPlayerWidget = document.getElementById('musicPlayerWidget');
const songTitleEl = document.getElementById('songTitle');
const songArtistEl = document.getElementById('songArtist');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const loopBtn = document.getElementById('loopBtn');
const shuffleBtn = document.getElementById('shuffleBtn');

let audio;
let playlist = [];
let originalPlaylist = [];
let currentIndex = -1;
let playHistory = [];
let isShuffle = false;
let isLoop = false;

async function openBuddyMusicDB() {
    return openDB('BuddyMusicDB', 1);
}


async function openBuddyMusicSongsDB() {
    return openDB('BuddyMusicSongsDB', 1);
}

async function fetchSongs() {
    const songs = [];
    try {
        const musicDB = await openBuddyMusicDB();
        const favs = await musicDB.getAll('favorites');
        songs.push(...favs);
    } catch (e) {
        console.warn("Could not open BuddyMusicDB. Favorites will not be available.");
    }

    try {
        const songsDB = await openBuddyMusicSongsDB();
        const allSongs = await songsDB.getAll('songs');
        songs.push(...allSongs);
    } catch (e) {
        console.warn("Could not open BuddyMusicSongsDB. Songs will not be available.");
    }
    
    // Remove duplicates
    const uniqueSongs = [];
    const seenIds = new Set();
    for (const song of songs) {
        if (!seenIds.has(song.id)) {
            uniqueSongs.push(song);
            seenIds.add(song.id);
        }
    }

    const filterType = await getSetting('musicFilterType', 'all');
    const filterValue = await getSetting('musicFilterValue', '');

    if (filterType === 'all' || !filterValue) {
        return uniqueSongs;
    }

    return uniqueSongs.filter(song => {
        if (!song.metadata) return false;
        switch (filterType) {
            case 'genre':
                return song.metadata.genre === filterValue;
            case 'artist':
                return song.metadata.artist === filterValue;
            case 'album':
                return song.metadata.album === filterValue;
            case 'song':
                return song.id === filterValue;
            default:
                return true;
        }
    });
}

function playSong(index, isNavigatingBack = false) {
    if (index < 0 || index >= playlist.length) return;

    if (!isNavigatingBack && currentIndex !== -1) {
        playHistory.push(currentIndex);
    }

    currentIndex = index;
    const song = playlist[currentIndex];
    
    if (audio) {
        audio.pause();
        URL.revokeObjectURL(audio.src);
    }

    const blob = new Blob([song.file], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.play();

    songTitleEl.textContent = song.metadata.title || 'Unknown Title';
    songArtistEl.textContent = song.metadata.artist || 'Unknown Artist';
    playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';

    audio.onended = () => {
        if (isLoop) {
            playSong(currentIndex);
        } else {
            playNext();
        }
    };
}

function playNext() {
    let nextIndex;
    if (isShuffle) {
        nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
        nextIndex = (currentIndex + 1) % playlist.length;
    }
    playSong(nextIndex);
}

function playPrev() {
    if (playHistory.length > 0) {
        const prevIndex = playHistory.pop();
        playSong(prevIndex, true);
    } else {
        const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        playSong(prevIndex, true);
    }
}

function togglePlayPause() {
    if (!audio) {
        if (playlist.length > 0) {
            playSong(0);
        }
        return;
    }

    if (audio.paused) {
        audio.play();
        playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
    } else {
        audio.pause();
        playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active', isShuffle);

    if (isShuffle) {
        // Shuffle playlist and keep current song at the top
        const currentSong = playlist[currentIndex];
        const otherSongs = playlist.filter((_, i) => i !== currentIndex);
        for (let i = otherSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherSongs[i], otherSongs[j]] = [otherSongs[j], otherSongs[i]];
        }
        playlist = [currentSong, ...otherSongs];
        currentIndex = 0;
        playHistory = [];
    } else {
        // Restore original order and find current song's index
        const currentSongId = playlist[currentIndex].id;
        playlist = [...originalPlaylist];
        currentIndex = playlist.findIndex(song => song.id === currentSongId);
        playHistory = [];
    }
}

function toggleLoop() {
    isLoop = !isLoop;
    loopBtn.classList.toggle('active', isLoop);
}

export async function initMusicPlayer() {
    originalPlaylist = await fetchSongs();
    playlist = [...originalPlaylist];
    if (playlist.length > 0) {
        musicPlayerWidget.style.display = 'flex';
    } else {
        musicPlayerWidget.style.display = 'none';
        return;
    }

    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
    shuffleBtn.addEventListener('click', toggleShuffle);
    loopBtn.addEventListener('click', toggleLoop);
}
