// Spotify API configuration
// Dynamic redirect URI based on current origin
const getRedirectUri = () => {
  if (typeof window === 'undefined') return 'http://localhost:3000/callback';
  return `${window.location.origin}/callback`;
};

export const SPOTIFY_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '',
  get redirectUri() { return getRedirectUri(); },
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
  ].join(' '),
};

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).map(x => possible[x % possible.length]).join('');
}

// Generate code challenge for PKCE
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function initiateSpotifyAuth(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store code verifier for later
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    scope: SPOTIFY_CONFIG.scopes,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');

  if (!codeVerifier) {
    throw new Error('No code verifier found');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CONFIG.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_CONFIG.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  const data = await response.json();
  localStorage.removeItem('spotify_code_verifier');

  return data;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CONFIG.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  return response.json();
}

// Spotify API calls
export async function fetchCurrentUser(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

export async function fetchUserPlaylists(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

export async function fetchPlaylistTracks(accessToken: string, playlistId: string) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

export async function fetchCurrentPlayback(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  return response.json();
}

export async function play(accessToken: string, deviceId?: string, uris?: string[], contextUri?: string) {
  const body: Record<string, unknown> = {};
  if (uris) body.uris = uris;
  if (contextUri) body.context_uri = contextUri;

  await fetch(`https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: Object.keys(body).length ? JSON.stringify(body) : undefined,
  });
}

export async function pause(accessToken: string) {
  await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function skipToNext(accessToken: string) {
  await fetch('https://api.spotify.com/v1/me/player/next', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function skipToPrevious(accessToken: string) {
  await fetch('https://api.spotify.com/v1/me/player/previous', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function seek(accessToken: string, positionMs: number) {
  await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function setVolume(accessToken: string, volumePercent: number) {
  await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function setShuffle(accessToken: string, state: boolean) {
  await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${state}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function setRepeat(accessToken: string, state: 'track' | 'context' | 'off') {
  await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${state}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function transferPlayback(accessToken: string, deviceId: string) {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play: true }),
  });
}

export async function getAvailableDevices(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

export async function searchSpotify(accessToken: string, query: string, types = 'track,artist,album') {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${types}&limit=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}

export async function getLikedSongs(accessToken: string, limit = 50) {
  const response = await fetch(
    `https://api.spotify.com/v1/me/tracks?limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}

export async function getRecentlyPlayed(accessToken: string, limit = 20) {
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}
