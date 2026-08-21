/**
 * AudioEngine – standalone singleton for music crossfade and SFX.
 *
 * Architecture: This module owns all AudioPlayer instances.
 * React components interact via AudioProvider / useAudioManager().
 *
 * Design principles:
 * - Two music channels A/B for seamless crossfade
 * - Race-safe via requestId: every new crossfade increments crossfadeRequestId
 * - Settings (musicVolume / sfxVolume) synced with game_settings AsyncStorage key
 * - SFX volume is independent from music volume
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioPlayer } from 'expo-audio';

// ─── Theme key types ──────────────────────────────────────────────────────────

export type ThemeKey = 'main-menu' | 'kitchen' | 'garden' | 'dining' | 'dining-dawn' | 'dormitory-morning' | 'dormitory-evening' | null;
export type LocationKey = 'main-menu' | 'kitchen' | 'garden' | 'dining' | 'dormitory' | null;
export type TimeOfDayKey = 'morning' | 'evening';

// ─── Audio asset map ──────────────────────────────────────────────────────────

const THEME_SOURCES: Record<NonNullable<ThemeKey>, number> = {
  'main-menu':          require('../../assets/audio/Main-Page-Theme.mp3'),
  kitchen:              require('../../assets/audio/Kitchen-Theme.mp3'),
  garden:               require('../../assets/audio/Garden-Theme.mp3'),
  dining:               require('../../assets/audio/dininghall_theme.mp3'),
  'dining-dawn':        require('../../assets/audio/dininghall_dawn_theme.mp3'),
  'dormitory-morning':  require('../../assets/audio/Room-Morning-Theme.mp3'),
  'dormitory-evening':  require('../../assets/audio/Room-Evening-Theme.mp3'),
};

const SFX_SOURCES: Record<string, number> = {
  owl:                require('../../assets/audio/owl.mp3'),
  'morning-birds':    require('../../assets/audio/morning-birds.mp3'),
  'walking-on-wood':  require('../../assets/audio/walking-on-wood.mp3'),
  'door-close':       require('../../assets/audio/door-close.mp3'),
  'dragging-on-floor':require('../../assets/audio/dragging-on-floor.mp3'),
  'heavy-breathing':  require('../../assets/audio/heavy-breathing.mp3'),
  knock:              require('../../assets/audio/knock.mp3'),
  slowfootsteps:      require('../../assets/audio/slowfootsteps.mp3'),
  tap:                require('../../assets/audio/tap.wav'),
  walkingslowondirt:  require('../../assets/audio/walkingslowondirt.mp3'),
  getwater:           require('../../assets/audio/getwater.mp3'),
  confirm:            require('../../assets/audio/confirm.mp3'),
  moveitem:           require('../../assets/audio/moveitem.mp3'),
  getwood:            require('../../assets/audio/getwood.mp3'),
  getstone:           require('../../assets/audio/getstone.mp3'),
  notification:       require('../../assets/audio/notification.mp3'),
  cookingpan:         require('../../assets/audio/cookingpan.mp3'),
  cookingpot:         require('../../assets/audio/cookingpot.mp3'),
  bling:              require('../../assets/audio/bling.wav'),
  eat:                require('../../assets/audio/eat.mp3'),
  footstep:           require('../../assets/audio/footstep.mp3'),
};

// ─── Theme resolver (pure function) ──────────────────────────────────────────

export function getMusicTheme(location: LocationKey, timeOfDay?: TimeOfDayKey): ThemeKey {
  if (location === 'main-menu') return 'main-menu';
  if (location === 'kitchen') return 'kitchen';
  if (location === 'garden') return 'garden';
  if (location === 'dining') return 'dining';
  if (location === 'dormitory') return timeOfDay === 'morning' ? 'dormitory-morning' : 'dormitory-evening';
  return null;
}

// ─── Engine state (exposed to React) ─────────────────────────────────────────

export type AudioEngineState = {
  currentThemeKey: ThemeKey;
  musicVolume: number;   // 0–100
  sfxVolume: number;     // 0–100
  audioUnlocked: boolean;
};

// ─── SFX handle ───────────────────────────────────────────────────────────────

type SFXHandle = {
  player: AudioPlayer;
  startTimer?: ReturnType<typeof setTimeout>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

// ─── AudioEngine class ────────────────────────────────────────────────────────

class AudioEngine {
  // Music channels (A and B)
  private channelA: AudioPlayer | null = null;
  private channelB: AudioPlayer | null = null;
  private activeChannel: 'A' | 'B' | null = null;

  // Current playing theme
  private currentThemeKey: ThemeKey = null;

  // Race-safety: incremented on every new crossfade request
  private crossfadeRequestId = 0;

  // Active timers
  private crossfadeIntervalId: ReturnType<typeof setInterval> | null = null;
  private loadCheckTimerId: ReturnType<typeof setTimeout> | null = null;
  private duckIntervalId: ReturnType<typeof setInterval> | null = null;
  private stopFadeIntervalId: ReturnType<typeof setInterval> | null = null;

  // Volume (0.0–1.0)
  private musicVolume = 0.75;
  private sfxVolume = 0.75;
  private duckLevel = 1.0;

  // SFX players
  private sfxPlayers = new Map<string, SFXHandle>();

  // State
  private audioUnlocked = false;
  private initialized = false;

  // React listeners
  private listeners = new Set<() => void>();

  // ── Init ────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] setAudioModeAsync:', e);
    }
    await this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem('game_settings');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.musicVolume === 'number') this.musicVolume = Math.max(0, Math.min(100, s.musicVolume)) / 100;
      if (typeof s.sfxVolume  === 'number') this.sfxVolume  = Math.max(0, Math.min(100, s.sfxVolume))  / 100;
      this.notifyListeners();
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] loadSettings:', e);
    }
  }

  // ── Listeners ───────────────────────────────────────────────────────────────

  getState(): AudioEngineState {
    return {
      currentThemeKey: this.currentThemeKey,
      musicVolume: Math.round(this.musicVolume * 100),
      sfxVolume:   Math.round(this.sfxVolume   * 100),
      audioUnlocked: this.audioUnlocked,
    };
  }

  addListener(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notifyListeners(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  // ── Unlock ──────────────────────────────────────────────────────────────────

  async unlockAudio(): Promise<void> {
    if (this.audioUnlocked) return;
    await this.initialize();
    this.audioUnlocked = true;
    this.notifyListeners();
  }

  // ── Gameplay warm-up (called from GameLoadingScreen) ────────────────────────
  // Ensures audio mode is configured and user settings are loaded before the
  // first SFX / theme request. Does NOT start playback (autoplay rules apply).

  async prepareForGameplay(): Promise<void> {
    await this.initialize();
    // Reload settings in case they were changed while on the main menu
    await this.loadSettings();
  }

  // ── Channel helpers ─────────────────────────────────────────────────────────

  private getChannel(ch: 'A' | 'B'): AudioPlayer | null {
    return ch === 'A' ? this.channelA : this.channelB;
  }

  private setChannel(ch: 'A' | 'B', p: AudioPlayer | null): void {
    if (ch === 'A') this.channelA = p;
    else            this.channelB = p;
  }

  private inactiveChannel(): 'A' | 'B' {
    return this.activeChannel === 'A' ? 'B' : 'A';
  }

  private effectiveMusicVol(): number {
    return this.musicVolume * this.duckLevel;
  }

  // ── Timer management ────────────────────────────────────────────────────────

  private clearCrossfadeTimers(): void {
    if (this.crossfadeIntervalId !== null) { clearInterval(this.crossfadeIntervalId);  this.crossfadeIntervalId = null; }
    if (this.loadCheckTimerId    !== null) { clearTimeout(this.loadCheckTimerId);       this.loadCheckTimerId    = null; }
    if (this.stopFadeIntervalId  !== null) { clearInterval(this.stopFadeIntervalId);    this.stopFadeIntervalId  = null; }
  }

  // ── Crossfade entry point ───────────────────────────────────────────────────

  crossfadeTo(themeKey: ThemeKey, durationMs = 3000): void {
    if (!this.audioUnlocked) return;

    // Same theme already active → no-op
    if (themeKey === this.currentThemeKey && this.activeChannel !== null && themeKey !== null) return;

    // Null → stop music
    if (themeKey === null) {
      this.stopGameplayMusic(Math.min(durationMs, 1500));
      return;
    }

    const myId = ++this.crossfadeRequestId;
    this.clearCrossfadeTimers();

    const source = THEME_SOURCES[themeKey];
    const inactiveCh = this.inactiveChannel();

    // Dispose existing inactive player
    const oldInactive = this.getChannel(inactiveCh);
    if (oldInactive) {
      try { oldInactive.pause(); } catch {}
      try { oldInactive.remove(); } catch {}
      this.setChannel(inactiveCh, null);
    }

    // Create new player
    let newPlayer: AudioPlayer;
    try {
      newPlayer = createAudioPlayer(source);
      newPlayer.loop = true;
      newPlayer.volume = 0;
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] createAudioPlayer failed:', e);
      return;
    }
    this.setChannel(inactiveCh, newPlayer);

    // Begin load polling
    this._pollForLoad(myId, themeKey, newPlayer, inactiveCh, durationMs, 0);
  }

  private _pollForLoad(
    myId: number, themeKey: NonNullable<ThemeKey>, newPlayer: AudioPlayer,
    inactiveCh: 'A' | 'B', durationMs: number, attempt: number,
  ): void {
    // Race check
    if (myId !== this.crossfadeRequestId) return;

    if (newPlayer.isLoaded) {
      this._beginCrossfade(myId, themeKey, newPlayer, inactiveCh, durationMs);
      return;
    }

    if (attempt >= 50) {
      if (__DEV__) console.warn('[AudioEngine] Load timeout for', themeKey);
      try { newPlayer.remove(); } catch {}
      this.setChannel(inactiveCh, null);
      return;
    }

    this.loadCheckTimerId = setTimeout(() => {
      this.loadCheckTimerId = null;
      this._pollForLoad(myId, themeKey, newPlayer, inactiveCh, durationMs, attempt + 1);
    }, 100);
  }

  private _beginCrossfade(
    myId: number, themeKey: NonNullable<ThemeKey>, newPlayer: AudioPlayer,
    inactiveCh: 'A' | 'B', durationMs: number,
  ): void {
    if (myId !== this.crossfadeRequestId) return;

    // Start new track silently
    try { newPlayer.seekTo(0); newPlayer.play(); } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] play failed:', e);
    }

    const activeCh  = this.activeChannel;
    const oldPlayer = activeCh ? this.getChannel(activeCh) : null;

    // Instant swap if durationMs ≤ 0
    if (durationMs <= 0) {
      if (oldPlayer && activeCh) {
        try { oldPlayer.pause(); } catch {}
        try { oldPlayer.remove(); } catch {}
        this.setChannel(activeCh, null);
      }
      newPlayer.volume = this.effectiveMusicVol();
      this.activeChannel = inactiveCh;
      this.currentThemeKey = themeKey;
      this.notifyListeners();
      return;
    }

    const STEPS  = 30;
    const stepMs = durationMs / STEPS;
    let step = 0;

    const iid = setInterval(() => {
      if (myId !== this.crossfadeRequestId) { clearInterval(iid); return; }
      step++;
      const t = Math.min(step / STEPS, 1.0);
      const eVol = this.effectiveMusicVol();

      try { newPlayer.volume = eVol * t; } catch {}
      if (oldPlayer) try { oldPlayer.volume = eVol * (1 - t); } catch {}

      if (step >= STEPS) {
        clearInterval(iid);
        if (this.crossfadeIntervalId === iid) this.crossfadeIntervalId = null;
        if (myId !== this.crossfadeRequestId) return;

        if (oldPlayer && activeCh) {
          try { oldPlayer.pause(); } catch {}
          try { oldPlayer.remove(); } catch {}
          this.setChannel(activeCh, null);
        }
        newPlayer.volume = this.effectiveMusicVol();
        this.activeChannel  = inactiveCh;
        this.currentThemeKey = themeKey;
        this.notifyListeners();
      }
    }, stepMs);

    this.crossfadeIntervalId = iid;
  }

  // ── Stop gameplay music ─────────────────────────────────────────────────────

  stopGameplayMusic(durationMs = 1500): void {
    this.crossfadeRequestId++;
    this.clearCrossfadeTimers();

    const activeCh = this.activeChannel;
    if (!activeCh) {
      this.currentThemeKey = null;
      this.notifyListeners();
      return;
    }

    const player = this.getChannel(activeCh);
    if (!player) {
      this.activeChannel   = null;
      this.currentThemeKey = null;
      this.notifyListeners();
      return;
    }

    if (durationMs <= 0) {
      try { player.pause(); } catch {}
      try { player.remove(); } catch {}
      this.setChannel(activeCh, null);
      this.activeChannel   = null;
      this.currentThemeKey = null;
      this.notifyListeners();
      return;
    }

    const STEPS  = 15;
    const stepMs = durationMs / STEPS;
    const startVol = player.volume;
    let step = 0;

    const iid = setInterval(() => {
      step++;
      try { player.volume = startVol * (1 - step / STEPS); } catch {}
      if (step >= STEPS) {
        clearInterval(iid);
        if (this.stopFadeIntervalId === iid) this.stopFadeIntervalId = null;
        try { player.pause(); } catch {}
        try { player.remove(); } catch {}
        this.setChannel(activeCh, null);
        this.activeChannel   = null;
        this.currentThemeKey = null;
        this.notifyListeners();
      }
    }, stepMs);

    this.stopFadeIntervalId = iid;
  }

  // ── Volume ──────────────────────────────────────────────────────────────────

  setMusicVolume(value: number): void {
    this.musicVolume = Math.max(0, Math.min(100, value)) / 100;
    if (this.activeChannel) {
      const p = this.getChannel(this.activeChannel);
      if (p) try { p.volume = this.effectiveMusicVol(); } catch {}
    }
    this.notifyListeners();
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(100, value)) / 100;
    this.sfxPlayers.forEach(({ player }) => {
      try { player.volume = this.sfxVolume; } catch {}
    });
    this.notifyListeners();
  }

  getMusicVolumePercent(): number { return Math.round(this.musicVolume * 100); }
  getSfxVolumePercent():   number { return Math.round(this.sfxVolume   * 100); }

  // ── Duck music ──────────────────────────────────────────────────────────────

  duckMusic(target: number, durationMs = 500): void {
    if (this.duckIntervalId !== null) { clearInterval(this.duckIntervalId); this.duckIntervalId = null; }

    const start    = this.duckLevel;
    const clamped  = Math.max(0, Math.min(1, target));
    if (Math.abs(start - clamped) < 0.01) {
      this.duckLevel = clamped;
      if (this.activeChannel) {
        const p = this.getChannel(this.activeChannel);
        if (p) try { p.volume = this.effectiveMusicVol(); } catch {}
      }
      return;
    }

    const STEPS = 10;
    const stepMs = Math.max(16, durationMs / STEPS);
    let step = 0;

    const iid = setInterval(() => {
      step++;
      const t = Math.min(step / STEPS, 1);
      this.duckLevel = start + (clamped - start) * t;
      if (this.activeChannel) {
        const p = this.getChannel(this.activeChannel);
        if (p) try { p.volume = this.effectiveMusicVol(); } catch {}
      }
      if (step >= STEPS) {
        clearInterval(iid);
        if (this.duckIntervalId === iid) this.duckIntervalId = null;
        this.duckLevel = clamped;
      }
    }, stepMs);

    this.duckIntervalId = iid;
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────

  playSoundEffect(key: string, options?: { maxDurationMs?: number; loop?: boolean }): void {
    if (!this.audioUnlocked) return;

    const source = SFX_SOURCES[key];
    if (!source) {
      if (__DEV__) console.warn('[AudioEngine] Unknown SFX key:', key);
      return;
    }

    // Clean up existing player for this key
    this.stopSoundEffect(key);

    try {
      const player = createAudioPlayer(source);
      player.volume = this.sfxVolume;
      player.loop   = options?.loop ?? false;

      const handle: SFXHandle = { player };
      this.sfxPlayers.set(key, handle);

      handle.startTimer = setTimeout(() => {
        handle.startTimer = undefined;
        try { player.seekTo(0); player.play(); } catch {}
      }, 80);

      if (!options?.loop) {
        const maxMs = options?.maxDurationMs ?? 30000;
        handle.cleanupTimer = setTimeout(() => {
          handle.cleanupTimer = undefined;
          try { player.pause(); } catch {}
          try { player.remove(); } catch {}
          this.sfxPlayers.delete(key);
        }, maxMs + 600);
      }
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] Failed to create SFX player:', key, e);
    }
  }

  stopSoundEffect(key: string): void {
    const h = this.sfxPlayers.get(key);
    if (!h) return;
    if (h.startTimer)   clearTimeout(h.startTimer);
    if (h.cleanupTimer) clearTimeout(h.cleanupTimer);
    try { h.player.pause(); } catch {}
    try { h.player.remove(); } catch {}
    this.sfxPlayers.delete(key);
  }

  isSfxPlaying(key: string): boolean {
    return this.sfxPlayers.has(key);
  }
}

// ─── Singleton (hot-reload safe) ──────────────────────────────────────────────

const _GLOBAL_KEY = '__audioEngineV1__';
const _globalRef = (typeof globalThis !== 'undefined' ? globalThis : global) as Record<string, unknown>;
if (!_globalRef[_GLOBAL_KEY]) {
  _globalRef[_GLOBAL_KEY] = new AudioEngine();
}
export const audioEngine: AudioEngine = _globalRef[_GLOBAL_KEY] as AudioEngine;
