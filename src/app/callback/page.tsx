'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { exchangeCodeForToken } from '@/lib/spotify';

export default function Callback() {
  const router = useRouter();
  const [status, setStatus] = useState('Connecting to Spotify...');

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const error = urlParams.get('error');

      if (error) {
        setStatus(`Error: ${error}`);
        setTimeout(() => router.push('/'), 2000);
        return;
      }

      if (code) {
        try {
          setStatus('Exchanging token...');
          const data = await exchangeCodeForToken(code);
          const expiresAt = Date.now() + data.expires_in * 1000;

          localStorage.setItem('spotify_access_token', data.access_token);
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
          localStorage.setItem('spotify_token_expires_at', expiresAt.toString());

          setStatus('Connected! Redirecting...');
          router.push('/');
        } catch (err) {
          console.error('Token exchange failed:', err);
          setStatus('Failed to connect. Retrying...');
          setTimeout(() => router.push('/'), 2000);
        }
      } else {
        router.push('/');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="winamp-window p-8">
        <div className="winamp-titlebar">
          <span className="winamp-title">WINAMP SPOTIFY</span>
        </div>
        <div className="led-display mt-4 text-center">
          <div className="led-info">{status}</div>
        </div>
      </div>
    </main>
  );
}
