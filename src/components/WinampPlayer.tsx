'use client';

import { useState, useEffect, useRef } from 'react';
import { useSpotify } from '@/hooks/useSpotify';
import {
  fetchUserPlaylists,
  fetchPlaylistTracks,
  getAvailableDevices,
  searchSpotify,
  getLikedSongs,
  getRecentlyPlayed,
} from '@/lib/spotify';

interface Playlist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
}

interface Track {
  track: {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    duration_ms: number;
    album: {
      name: string;
      images: { url: string }[];
    };
  };
}

interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

interface SearchResult {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
}

type LibraryTab = 'playlists' | 'liked' | 'recent' | 'search';

export default function WinampPlayer() {
  const {
    isAuthenticated,
    isReady,
    playbackState,
    volume,
    login,
    logout,
    togglePlay,
    playTrack,
    playContext,
    next,
    previous,
    seekTo,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    accessToken,
  } = useSpotify();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [showEqualizer, setShowEqualizer] = useState(true);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(Array(20).fill(5));
  const [devices, setDevices] = useState<Device[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('playlists');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch available devices
  useEffect(() => {
    if (accessToken) {
      const fetchDevices = async () => {
        try {
          const data = await getAvailableDevices(accessToken);
          setDevices(data.devices || []);
        } catch (err) {
          console.error('Failed to fetch devices:', err);
        }
      };
      fetchDevices();
      // Refresh devices every 10 seconds
      const interval = setInterval(fetchDevices, 10000);
      return () => clearInterval(interval);
    }
  }, [accessToken]);

  // Fetch playlists when authenticated
  useEffect(() => {
    if (accessToken) {
      fetchUserPlaylists(accessToken).then(data => {
        setPlaylists(data.items || []);
      });
    }
  }, [accessToken]);

  // Fetch liked songs when tab is selected
  useEffect(() => {
    if (accessToken && libraryTab === 'liked' && likedSongs.length === 0) {
      getLikedSongs(accessToken, 50).then(data => {
        setLikedSongs(data.items || []);
      });
    }
  }, [accessToken, libraryTab, likedSongs.length]);

  // Fetch recently played when tab is selected
  useEffect(() => {
    if (accessToken && libraryTab === 'recent' && recentTracks.length === 0) {
      getRecentlyPlayed(accessToken, 20).then(data => {
        setRecentTracks(data.items?.map((item: { track: Track['track'] }) => ({ track: item.track })) || []);
      });
    }
  }, [accessToken, libraryTab, recentTracks.length]);

  // Handle search with debounce
  useEffect(() => {
    if (!accessToken || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await searchSpotify(accessToken, searchQuery.trim(), 'track');
        setSearchResults(data.tracks?.items || []);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [accessToken, searchQuery]);

  // Fetch tracks when playlist selected
  useEffect(() => {
    if (accessToken && selectedPlaylist) {
      fetchPlaylistTracks(accessToken, selectedPlaylist.id).then(data => {
        setTracks(data.items || []);
      });
    }
  }, [accessToken, selectedPlaylist]);

  // Animate spectrum bars when playing
  useEffect(() => {
    if (playbackState && !playbackState.paused) {
      const interval = setInterval(() => {
        setSpectrumBars(prev =>
          prev.map(() => Math.floor(Math.random() * 100))
        );
      }, 100);
      return () => clearInterval(interval);
    } else {
      setSpectrumBars(Array(20).fill(5));
    }
  }, [playbackState?.paused]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !playbackState) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const duration = (playbackState as unknown as { duration?: number }).duration || 0;
    seekTo(Math.floor(percent * duration));
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(Math.floor(percent * 100));
  };

  const currentTrack = playbackState?.track_window?.current_track;
  const position = playbackState?.position || 0;
  const duration = (playbackState as unknown as { duration?: number })?.duration || 0;
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  if (!isAuthenticated) {
    return (
      <div className="winamp-window p-8 flex flex-col items-center gap-6">
        <div className="winamp-titlebar w-full">
          <span className="winamp-title">WINAMP SPOTIFY</span>
          <div className="winamp-controls">
            <button className="winamp-control-btn">_</button>
            <button className="winamp-control-btn">□</button>
            <button className="winamp-control-btn">×</button>
          </div>
        </div>
        <div className="led-display mt-4 text-center">
          <div className="led-info text-lg mb-2">*** WINAMP SPOTIFY ***</div>
          <div className="led-info text-sm">Connect to start playing</div>
        </div>
        <button onClick={login} className="spotify-login-btn mt-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Connect with Spotify
        </button>
        <div className="text-xs text-gray-500 mt-2">Requires Spotify Premium</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Main Player Window */}
      <div className="winamp-window w-[275px]">
        {/* Title Bar */}
        <div className="winamp-titlebar">
          <span className="winamp-title">WINAMP SPOTIFY</span>
          <div className="winamp-controls">
            <button className="winamp-control-btn" onClick={() => setShowEqualizer(!showEqualizer)}>_</button>
            <button className="winamp-control-btn">□</button>
            <button className="winamp-control-btn" onClick={logout}>×</button>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="p-2 space-y-2">
          {/* Timer, Album Art, and Info Display */}
          <div className="flex gap-2">
            {/* Album Art */}
            <div className="flex-shrink-0 w-14 h-14 bg-black/50 rounded overflow-hidden border border-gray-700">
              {currentTrack?.album?.images?.[0]?.url ? (
                <img
                  src={currentTrack.album.images[0].url}
                  alt={currentTrack.album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1">
              {/* Time Display */}
              <div className="led-display flex-shrink-0">
                <div className="led-time">
                  {formatTime(position)}
                </div>
              </div>

              {/* Spectrum Analyzer */}
              <div className="spectrum-container flex-1">
                {spectrumBars.map((height, i) => (
                  <div
                    key={i}
                    className="spectrum-bar"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Track Info Marquee */}
          <div className="led-display">
            <div className="marquee-container h-5">
              {currentTrack ? (
                <span className="marquee-text led-info">
                  {currentTrack.artists?.map((a: { name: string }) => a.name).join(', ')} - {currentTrack.name}
                  {' *** '}
                </span>
              ) : (
                <span className="led-info">No track playing</span>
              )}
            </div>
          </div>

          {/* Bitrate Display */}
          <div className="flex justify-between items-center px-1">
            <div className="bitrate-display">
              <span className="bitrate-value">320</span> kbps
            </div>
            <div className="bitrate-display">
              <span className="bitrate-value">44</span> kHz
            </div>
            <div className="flex gap-1">
              <span
                className={`mode-indicator ${playbackState?.shuffle ? 'active' : 'inactive'}`}
                onClick={toggleShuffle}
              >
                SHUF
              </span>
              <span
                className={`mode-indicator ${(playbackState?.repeat_mode ?? 0) > 0 ? 'active' : 'inactive'}`}
                onClick={cycleRepeat}
              >
                REP
              </span>
            </div>
          </div>

          {/* Seek Bar */}
          <div
            ref={seekBarRef}
            className="seek-bar"
            onClick={handleSeek}
          >
            <div
              className="seek-bar-progress"
              style={{ width: `${progress}%` }}
            >
              <div className="seek-bar-thumb" />
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center gap-1">
            {/* Transport Controls */}
            <div className="flex gap-0.5">
              <button className="transport-btn" onClick={previous} title="Previous">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>
              <button className="transport-btn" onClick={togglePlay} title={playbackState?.paused ? 'Play' : 'Pause'}>
                {playbackState?.paused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                )}
              </button>
              <button className="transport-btn" onClick={() => seekTo(0)} title="Stop">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h12v12H6z"/>
                </svg>
              </button>
              <button className="transport-btn" onClick={next} title="Next">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
              <button className="transport-btn" title="Eject">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5l-7 8h14l-7-8zm-7 9h14v2H5v-2z"/>
                </svg>
              </button>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume Slider */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">VOL</span>
              <div
                ref={volumeBarRef}
                className="winamp-slider w-16"
                onClick={handleVolumeChange}
              >
                <div
                  className="winamp-slider-track"
                  style={{ width: `${volume}%` }}
                />
                <div
                  className="winamp-slider-thumb"
                  style={{ left: `${volume}%` }}
                />
              </div>
            </div>
          </div>

          {/* Toggle Buttons */}
          <div className="flex gap-1 justify-center">
            <button
              className={`winamp-btn ${showEqualizer ? 'glow-green' : ''}`}
              onClick={() => setShowEqualizer(!showEqualizer)}
            >
              EQ
            </button>
            <button
              className={`winamp-btn ${showPlaylist ? 'glow-green' : ''}`}
              onClick={() => setShowPlaylist(!showPlaylist)}
            >
              PL
            </button>
            <button
              className={`winamp-btn ${miniMode ? 'glow-green' : ''}`}
              onClick={() => setMiniMode(!miniMode)}
              title="Mini Mode"
            >
              MINI
            </button>
          </div>
        </div>
      </div>

      {/* Equalizer Window (Visual Only) */}
      {showEqualizer && !miniMode && (
        <div className="winamp-window w-[275px]">
          <div className="winamp-titlebar">
            <span className="winamp-title">WINAMP EQUALIZER</span>
            <div className="winamp-controls">
              <button className="winamp-control-btn" onClick={() => setShowEqualizer(false)}>×</button>
            </div>
          </div>
          <div className="p-2">
            <div className="flex gap-1 items-end justify-center h-16">
              {[60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000].map((freq, i) => (
                <div key={freq} className="flex flex-col items-center gap-1">
                  <div className="w-2 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 rounded-sm"
                       style={{ height: `${30 + Math.sin(i * 0.5) * 20}px` }} />
                  <span className="text-[6px] text-gray-500">{freq >= 1000 ? `${freq/1000}K` : freq}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Playlist Window */}
      {showPlaylist && !miniMode && (
        <div className="winamp-window w-[275px]">
          <div className="winamp-titlebar">
            <span className="winamp-title">WINAMP LIBRARY</span>
            <div className="winamp-controls">
              <button className="winamp-control-btn" onClick={() => setShowPlaylist(false)}>×</button>
            </div>
          </div>
          <div className="p-2 space-y-2">
            {/* Library Tabs */}
            <div className="flex gap-1">
              <button
                className={`winamp-btn text-[7px] flex-1 ${libraryTab === 'playlists' ? 'glow-green' : ''}`}
                onClick={() => setLibraryTab('playlists')}
              >
                LISTS
              </button>
              <button
                className={`winamp-btn text-[7px] flex-1 ${libraryTab === 'liked' ? 'glow-green' : ''}`}
                onClick={() => setLibraryTab('liked')}
              >
                LIKED
              </button>
              <button
                className={`winamp-btn text-[7px] flex-1 ${libraryTab === 'recent' ? 'glow-green' : ''}`}
                onClick={() => setLibraryTab('recent')}
              >
                RECENT
              </button>
              <button
                className={`winamp-btn text-[7px] flex-1 ${libraryTab === 'search' ? 'glow-green' : ''}`}
                onClick={() => setLibraryTab('search')}
              >
                SEARCH
              </button>
            </div>

            {/* Search Input */}
            {libraryTab === 'search' && (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tracks..."
                  className="w-full bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-green-400 placeholder-gray-500 focus:outline-none focus:border-green-500"
                />
                {isSearching && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">...</span>
                )}
              </div>
            )}

            {/* Playlist Selector (only for playlists tab) */}
            {libraryTab === 'playlists' && (
              <div className="flex gap-1 flex-wrap">
                {playlists.slice(0, 5).map((playlist) => (
                  <button
                    key={playlist.id}
                    className={`winamp-btn text-[7px] ${selectedPlaylist?.id === playlist.id ? 'glow-green' : ''}`}
                    onClick={() => setSelectedPlaylist(playlist)}
                  >
                    {playlist.name.slice(0, 8)}
                  </button>
                ))}
              </div>
            )}

            {/* Track List */}
            <div className="playlist-area h-32 overflow-y-auto">
              {/* Playlists Tab */}
              {libraryTab === 'playlists' && (
                tracks.length > 0 ? (
                  tracks.map((item, index) => (
                    <div
                      key={item.track?.id || index}
                      className={`playlist-item ${currentTrack?.id === item.track?.id ? 'active' : ''}`}
                      onClick={() => item.track && playTrack(item.track.uri)}
                    >
                      <span className="playlist-item-number">{index + 1}.</span>
                      <span className="truncate flex-1">
                        {item.track?.artists?.[0]?.name} - {item.track?.name}
                      </span>
                      <span className="playlist-item-duration">
                        {item.track && formatTime(item.track.duration_ms)}
                      </span>
                    </div>
                  ))
                ) : selectedPlaylist ? (
                  <div className="playlist-item">Loading tracks...</div>
                ) : (
                  <div className="playlist-item">Select a playlist above</div>
                )
              )}

              {/* Liked Songs Tab */}
              {libraryTab === 'liked' && (
                likedSongs.length > 0 ? (
                  likedSongs.map((item, index) => (
                    <div
                      key={item.track?.id || index}
                      className={`playlist-item ${currentTrack?.id === item.track?.id ? 'active' : ''}`}
                      onClick={() => item.track && playTrack(item.track.uri)}
                    >
                      <span className="playlist-item-number">{index + 1}.</span>
                      <span className="truncate flex-1">
                        {item.track?.artists?.[0]?.name} - {item.track?.name}
                      </span>
                      <span className="playlist-item-duration">
                        {item.track && formatTime(item.track.duration_ms)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="playlist-item">Loading liked songs...</div>
                )
              )}

              {/* Recently Played Tab */}
              {libraryTab === 'recent' && (
                recentTracks.length > 0 ? (
                  recentTracks.map((item, index) => (
                    <div
                      key={`${item.track?.id}-${index}`}
                      className={`playlist-item ${currentTrack?.id === item.track?.id ? 'active' : ''}`}
                      onClick={() => item.track && playTrack(item.track.uri)}
                    >
                      <span className="playlist-item-number">{index + 1}.</span>
                      <span className="truncate flex-1">
                        {item.track?.artists?.[0]?.name} - {item.track?.name}
                      </span>
                      <span className="playlist-item-duration">
                        {item.track && formatTime(item.track.duration_ms)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="playlist-item">Loading recent tracks...</div>
                )
              )}

              {/* Search Results Tab */}
              {libraryTab === 'search' && (
                searchResults.length > 0 ? (
                  searchResults.map((track, index) => (
                    <div
                      key={track.id}
                      className={`playlist-item ${currentTrack?.id === track.id ? 'active' : ''}`}
                      onClick={() => playTrack(track.uri)}
                    >
                      <span className="playlist-item-number">{index + 1}.</span>
                      <span className="truncate flex-1">
                        {track.artists?.[0]?.name} - {track.name}
                      </span>
                      <span className="playlist-item-duration">
                        {formatTime(track.duration_ms)}
                      </span>
                    </div>
                  ))
                ) : searchQuery ? (
                  <div className="playlist-item">{isSearching ? 'Searching...' : 'No results found'}</div>
                ) : (
                  <div className="playlist-item">Type to search...</div>
                )
              )}
            </div>

            {/* Playlist Controls */}
            <div className="flex gap-1 justify-between">
              <div className="flex gap-1">
                {libraryTab === 'playlists' && selectedPlaylist && (
                  <button className="winamp-btn" onClick={() => playContext(`spotify:playlist:${selectedPlaylist.id}`)}>
                    PLAY ALL
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {libraryTab === 'playlists' && `${tracks.length} tracks`}
                {libraryTab === 'liked' && `${likedSongs.length} liked`}
                {libraryTab === 'recent' && `${recentTracks.length} recent`}
                {libraryTab === 'search' && `${searchResults.length} results`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Selector */}
      {showDevices && !miniMode && (
        <div className="winamp-window w-[275px]">
          <div className="winamp-titlebar">
            <span className="winamp-title">DEVICES</span>
            <div className="winamp-controls">
              <button className="winamp-control-btn" onClick={() => setShowDevices(false)}>×</button>
            </div>
          </div>
          <div className="p-2">
            <div className="playlist-area max-h-24 overflow-y-auto">
              {devices.length > 0 ? (
                devices.map((device) => (
                  <div
                    key={device.id}
                    className={`playlist-item ${device.is_active ? 'active' : ''}`}
                  >
                    <span className="truncate flex-1">
                      {device.name} ({device.type})
                    </span>
                    {device.is_active && <span className="text-green-400">●</span>}
                  </div>
                ))
              ) : (
                <div className="playlist-item">
                  No devices found. Open Spotify on another device.
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-2 text-center">
              Open Spotify on your phone/computer to control it
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      {!miniMode && (
        <div className="flex gap-2 mt-2 justify-center">
          <button
            className="winamp-btn text-[8px]"
            onClick={() => setShowDevices(!showDevices)}
          >
            DEVICES ({devices.length})
          </button>
          {!isReady && (
            <span className="text-xs text-amber-400">
              Connecting...
            </span>
          )}
        </div>
      )}
    </div>
  );
}
