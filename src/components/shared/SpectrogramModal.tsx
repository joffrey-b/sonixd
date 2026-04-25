import React, { useEffect, useRef, useState } from 'react';
import { InfoModal } from '../modal/Modal';

// Cooley-Tukey in-place FFT (power-of-2 size)
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      // eslint-disable-next-line no-param-reassign
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      // eslint-disable-next-line no-param-reassign
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wCosBase = Math.cos(ang);
    const wSinBase = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wCos = 1;
      let wSin = 0;
      for (let j = 0; j < len >> 1; j++) {
        const k = i + j + (len >> 1);
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[k] * wCos - im[k] * wSin;
        const vIm = re[k] * wSin + im[k] * wCos;
        // eslint-disable-next-line no-param-reassign
        re[i + j] = uRe + vRe;
        // eslint-disable-next-line no-param-reassign
        im[i + j] = uIm + vIm;
        // eslint-disable-next-line no-param-reassign
        re[k] = uRe - vRe;
        // eslint-disable-next-line no-param-reassign
        im[k] = uIm - vIm;
        const nextWCos = wCos * wCosBase - wSin * wSinBase;
        wSin = wCos * wSinBase + wSin * wCosBase;
        wCos = nextWCos;
      }
    }
  }
}

function makeHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// Maps a dB value in [-90, 0] to an RGB color.
// black → blue → cyan → green → yellow → red
function dbToRgb(db: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (db + 90) / 90));
  if (t < 0.25) {
    return [0, 0, Math.round(t * 4 * 255)];
  }
  if (t < 0.5) {
    const s = (t - 0.25) * 4;
    return [0, Math.round(s * 255), 255];
  }
  if (t < 0.75) {
    const s = (t - 0.5) * 4;
    return [Math.round(s * 255), 255, Math.round((1 - s) * 255)];
  }
  const s = (t - 0.75) * 4;
  return [255, Math.round((1 - s) * 255), 0];
}

interface Props {
  show: boolean;
  handleHide: () => void;
  streamUrl?: string;
  title?: string;
  artist?: string;
}

const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 400;
const FFT_SIZE = 2048;

const SpectrogramModal = ({ show, handleHide, streamUrl, title, artist }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!show) {
      setStatus('idle');
      return;
    }
    if (!streamUrl) return;

    setStatus('loading');

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(streamUrl);
        if (!response.ok || cancelled) throw new Error('fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const audioCtx = new window.AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();
        if (cancelled) return;

        const numChannels = audioBuffer.numberOfChannels;
        const totalSamples = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const nyquist = sampleRate / 2;

        // Mix down to mono
        const samples = new Float32Array(totalSamples);
        for (let c = 0; c < numChannels; c++) {
          const ch = audioBuffer.getChannelData(c);
          for (let i = 0; i < totalSamples; i++) {
            samples[i] += ch[i] / numChannels;
          }
        }

        // Use exactly CANVAS_WIDTH frames so each column = 1 pixel
        const numFrames = CANVAS_WIDTH;
        const hopSize = Math.max(1, Math.floor((totalSamples - FFT_SIZE) / numFrames));
        const hann = makeHannWindow(FFT_SIZE);
        const re = new Float32Array(FFT_SIZE);
        const im = new Float32Array(FFT_SIZE);

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
        const pixels = imgData.data;

        // Precompute log-frequency mapping: each canvas row → FFT bin
        const minLogFreq = Math.log10(20);
        const maxLogFreq = Math.log10(nyquist);
        const freqPerBin = nyquist / (FFT_SIZE / 2);
        const rowToBin = new Int32Array(CANVAS_HEIGHT);
        for (let row = 0; row < CANVAS_HEIGHT; row++) {
          // row 0 = top = high frequency
          const t = (CANVAS_HEIGHT - 1 - row) / (CANVAS_HEIGHT - 1);
          const logF = minLogFreq + t * (maxLogFreq - minLogFreq);
          const freq = 10 ** logF;
          rowToBin[row] = Math.min(FFT_SIZE / 2 - 1, Math.max(0, Math.round(freq / freqPerBin)));
        }

        for (let frame = 0; frame < numFrames; frame++) {
          if (cancelled) return;
          const offset = frame * hopSize;
          for (let i = 0; i < FFT_SIZE; i++) {
            re[i] = (samples[offset + i] || 0) * hann[i];
            im[i] = 0;
          }
          fft(re, im);

          for (let row = 0; row < CANVAS_HEIGHT; row++) {
            const bin = rowToBin[row];
            const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
            const db = mag > 1e-10 ? 20 * Math.log10(mag / (FFT_SIZE / 2)) : -90;
            const [r, g, b] = dbToRgb(db);
            const idx = (row * CANVAS_WIDTH + frame) * 4;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
            pixels[idx + 3] = 255;
          }
        }

        if (cancelled) return;
        ctx.putImageData(imgData, 0, 0);

        // Frequency axis labels and grid lines
        const freqLabels = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000, 20000];
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        for (const freq of freqLabels) {
          if (freq > nyquist) continue;
          const t = (Math.log10(freq) - minLogFreq) / (maxLogFreq - minLogFreq);
          const y = Math.round((1 - t) * (CANVAS_HEIGHT - 1));
          const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(0, y, CANVAS_WIDTH - 28, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(label, CANVAS_WIDTH - 2, y + 4);
        }

        setStatus('done');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
  }, [show, streamUrl]);

  const label = [artist, title].filter(Boolean).join(' — ');

  return (
    <InfoModal width="820px" show={show} handleHide={handleHide}>
      <div style={{ padding: '8px 0 4px', textAlign: 'center', opacity: 0.75, fontSize: '0.9em' }}>
        {label}
      </div>
      {status === 'loading' && (
        <div
          style={{ padding: '4px 0 6px', textAlign: 'center', opacity: 0.55, fontSize: '0.82em' }}
        >
          Analyzing audio...
        </div>
      )}
      {status === 'error' && (
        <div style={{ padding: '8px', color: '#e06c75', textAlign: 'center' }}>
          Failed to load audio for analysis.
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ display: 'block', width: '100%', background: '#000' }}
      />
    </InfoModal>
  );
};

export default SpectrogramModal;
