'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initiateSpotifyAuth,
  refreshAccessToken,
  fetchCurrentPlayback,
  play as apiPlay,
  pause as apiPause,
  skipToNext as apiNext,
  skipToPrevious as apiPrev,
  seek as apiSeek,
  setVolume as apiSetVolume,
  setShuffle as apiSetShuffle,
  setRepeat as apiSetRepeat,
  transferPlayback,
} from '@/lib/spotify';

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (state: unknown) => void) => void;
  removeListener: (event: string) => void;
  getCurrentState: () => Promise<WebPlaybackState | null>;
  setName: (name: string) => void;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
}

interface WebPlaybackTrack {
  uri: string;
  id: string;
  type: string;
  media_type: string;
  name: string;
  is_playable: boolean;
  album: {
    uri: string;
    name: string;
    images: { url: string }[];
  };
  artists: { uri: string; name: string }[];
}

interface WebPlaybackState {
  context: { uri: string; metadata: unknown } | null;
  disallows: { [key: string]: boolean };
  paused: boolean;
  position: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: WebPlaybackTrack;
    previous_tracks: WebPlaybackTrack[];
    next_tracks: WebPlaybackTrack[];
  };
  duration?: number;
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export function useSpotify() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [player, setPlayer] = useState<SpotifyPlayer | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [playbackState, setPlaybackState] = useState<WebPlaybackState | null>(null);
  const [volume, setVolume] = useState(50);
  const playerRef = useRef<SpotifyPlayer | null>(null);

  // Load tokens from localStorage on mount
  useEffect(() => {
    const storedAccessToken = localStorage.getItem('spotify_access_token');
    const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
    const expiresAt = localStorage.getItem('spotify_token_expires_at');

    if (storedAccessToken && expiresAt) {
      const now = Date.now();
      if (now < parseInt(expiresAt)) {
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
      } else if (storedRefreshToken) {
        // Token expired, refresh it
        refreshAccessToken(storedRefreshToken).then(data => {
          const newExpiresAt = Date.now() + data.expires_in * 1000;
          localStorage.setItem('spotify_access_token', data.access_token);
          localStorage.setItem('spotify_token_expires_at', newExpiresAt.toString());
          if (data.refresh_token) {
            localStorage.setItem('spotify_refresh_token', data.refresh_token);
            setRefreshToken(data.refresh_token);
          }
          setAccessToken(data.access_token);
        }).catch(() => {
          localStorage.removeItem('spotify_access_token');
          localStorage.removeItem('spotify_refresh_token');
          localStorage.removeItem('spotify_token_expires_at');
        });
      }
    }
  }, []);

  // Check for token updates from callback page
  useEffect(() => {
    const checkForToken = () => {
      const storedAccessToken = localStorage.getItem('spotify_access_token');
      if (storedAccessToken && !accessToken) {
        setAccessToken(storedAccessToken);
        setRefreshToken(localStorage.getItem('spotify_refresh_token'));
      }
    };

    // Check immediately and also listen for storage changes
    checkForToken();
    window.addEventListener('storage', checkForToken);

    // Also poll briefly in case we just redirected from callback
    const interval = setInterval(checkForToken, 500);
    setTimeout(() => clearInterval(interval), 3000);

    return () => {
      window.removeEventListener('storage', checkForToken);
      clearInterval(interval);
    };
  }, [accessToken]);

  // Initialize Spotify Web Playback SDK only on localhost (SDK requirement)
  // On 127.0.0.1, use Spotify Connect mode instead
  useEffect(() => {
    if (!accessToken) return;

    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

    if (!isLocalhost) {
      // Spotify Connect mode - control existing devices
      setIsReady(true);
      console.log('Using Spotify Connect mode - control playback on your Spotify devices');
      return;
    }

    // Web Playback SDK mode - play directly in browser
    console.log('Using Web Playback SDK mode - playing in browser');

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Winamp Spotify',
        getOAuthToken: (cb: (token: string) => void) => {
          cb(accessToken);
        },
        volume: volume / 100,
      });

      spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Ready with Device ID', device_id);
        setDeviceId(device_id);
        setIsReady(true);
        transferPlayback(accessToken, device_id).catch(console.error);
      });

      spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline', device_id);
        setIsReady(false);
      });

      spotifyPlayer.addListener('player_state_changed', (state: WebPlaybackState) => {
        if (state) {
          setPlaybackState(state);
        }
      });

      spotifyPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Failed to initialize', message);
        // Fallback to Connect mode
        setIsReady(true);
      });

      spotifyPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Failed to authenticate', message);
      });

      spotifyPlayer.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Failed to validate Spotify account', message);
      });

      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
      playerRef.current = spotifyPlayer;
    };

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [accessToken]);

  const login = useCallback(() => {
    initiateSpotifyAuth();
  }, []);

  const logout = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.disconnect();
    }
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires_at');
    setAccessToken(null);
    setRefreshToken(null);
    setPlayer(null);
    setDeviceId(null);
    setIsReady(false);
    setPlaybackState(null);
  }, []);

  const togglePlay = useCallback(async () => {
    if (!accessToken) return;
    if (playbackState?.paused) {
      await apiPlay(accessToken, deviceId || undefined);
    } else {
      await apiPause(accessToken);
    }
  }, [accessToken, deviceId, playbackState?.paused]);

  const playTrack = useCallback(async (uri: string) => {
    if (!accessToken) return;
    await apiPlay(accessToken, deviceId || undefined, [uri]);
  }, [accessToken, deviceId]);

  const playContext = useCallback(async (contextUri: string) => {
    if (!accessToken) return;
    await apiPlay(accessToken, deviceId || undefined, undefined, contextUri);
  }, [accessToken, deviceId]);

  const next = useCallback(async () => {
    if (!accessToken) return;
    await apiNext(accessToken);
  }, [accessToken]);

  const previous = useCallback(async () => {
    if (!accessToken) return;
    await apiPrev(accessToken);
  }, [accessToken]);

  const seekTo = useCallback(async (positionMs: number) => {
    if (!accessToken) return;
    await apiSeek(accessToken, positionMs);
  }, [accessToken]);

  const setPlayerVolume = useCallback(async (volumePercent: number) => {
    setVolume(volumePercent);
    if (player) {
      await player.setVolume(volumePercent / 100);
    }
    if (accessToken) {
      await apiSetVolume(accessToken, volumePercent);
    }
  }, [accessToken, player]);

  const toggleShuffle = useCallback(async () => {
    if (!accessToken || !playbackState) return;
    await apiSetShuffle(accessToken, !playbackState.shuffle);
  }, [accessToken, playbackState]);

  const cycleRepeat = useCallback(async () => {
    if (!accessToken || !playbackState) return;
    const modes: ('off' | 'context' | 'track')[] = ['off', 'context', 'track'];
    const currentMode = playbackState.repeat_mode;
    const nextMode = modes[(currentMode + 1) % 3];
    await apiSetRepeat(accessToken, nextMode);
  }, [accessToken, playbackState]);

  // Poll for playback state updates
  useEffect(() => {
    if (!accessToken || !isReady) return;

    const interval = setInterval(async () => {
      try {
        const state = await fetchCurrentPlayback(accessToken);
        if (state) {
          setPlaybackState(prev => ({
            ...prev,
            ...state,
            position: state.progress_ms,
            paused: !state.is_playing,
            shuffle: state.shuffle_state,
            repeat_mode: state.repeat_state === 'off' ? 0 : state.repeat_state === 'context' ? 1 : 2,
            track_window: {
              current_track: state.item ? {
                uri: state.item.uri,
                id: state.item.id,
                name: state.item.name,
                album: state.item.album,
                artists: state.item.artists,
                type: state.item.type,
                media_type: 'audio',
                is_playable: true,
              } : prev?.track_window?.current_track,
              previous_tracks: prev?.track_window?.previous_tracks || [],
              next_tracks: prev?.track_window?.next_tracks || [],
            },
            duration: state.item?.duration_ms,
          } as WebPlaybackState));
        }
      } catch (error) {
        console.error('Failed to fetch playback state:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [accessToken, isReady]);

  return {
    isAuthenticated: !!accessToken,
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
    setVolume: setPlayerVolume,
    toggleShuffle,
    cycleRepeat,
    accessToken,
  };
}
