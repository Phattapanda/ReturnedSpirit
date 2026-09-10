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
import type { AudioPlayer } from 'expo-audio';
import { loadGameSettings } from '@/src/settings/game-settings';

// ─── Theme key types ──────────────────────────────────────────────────────────

export type ThemeKey = 'main-menu' | 'main-menu-feathered-banner' | 'main-menu-marketgate-riot' | 'main-menu-stonegate-dance'
  | 'kitchen' | 'garden' | 'dining' | 'dining-dawn' | 'dormitory-morning' | 'dormitory-evening'
  | 'battle-over50' | 'battle-under50' | 'rest-area' | 'boss-battle' | null;
export type LocationKey = 'main-menu' | 'kitchen' | 'garden' | 'dining' | 'dormitory' | null;
export type TimeOfDayKey = 'morning' | 'evening';
export type MinstrelTrackKey = 'minstrel-classical' | 'minstrel-rock' | 'minstrel-pop' | 'minstrel-rave'
  | 'minstrel-metal' | 'minstrel-kpop' | 'minstrel-alpine' | 'minstrel-techno' | 'minstrel-country' | 'minstrel-hiphop';

// ─── Audio asset map ──────────────────────────────────────────────────────────

const THEME_SOURCES: Record<NonNullable<ThemeKey>, number> = {
  'main-menu':          require('../../assets/audio/Main-Page-Theme.mp3'),
  'main-menu-feathered-banner': require('../../assets/audio/minstrel_feathered_banner.mp3'),
  'main-menu-marketgate-riot': require('../../assets/audio/minstrel_marketgate_riot_instrumental.mp3'),
  'main-menu-stonegate-dance': require('../../assets/audio/minstrel_stonegate_dance_instrumental.mp3'),
  kitchen:              require('../../assets/audio/Kitchen-Theme.mp3'),
  garden:               require('../../assets/audio/Garden-Theme.mp3'),
  dining:               require('../../assets/audio/dininghall_theme.mp3'),
  'dining-dawn':        require('../../assets/audio/dininghall_dawn_theme.mp3'),
  'dormitory-morning':  require('../../assets/audio/Room-Morning-Theme.mp3'),
  'dormitory-evening':  require('../../assets/audio/Room-Evening-Theme.mp3'),
  'battle-over50':      require('../../assets/audio/battle_theme_over50.mp3'),
  'battle-under50':     require('../../assets/audio/battle_theme_under50.mp3'),
  'rest-area':          require('../../assets/audio/rest_area.mp3'),
  'boss-battle':        require('../../assets/audio/boss_battle_theme.mp3'),
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
  money:              require('../../assets/audio/money.mp3'),
  getwood:            require('../../assets/audio/getwood.mp3'),
  getstone:           require('../../assets/audio/getstone.mp3'),
  notification:       require('../../assets/audio/notification.mp3'),
  cookingpan:         require('../../assets/audio/cookingpan.mp3'),
  cookingpot:         require('../../assets/audio/cookingpot.mp3'),
  bling:              require('../../assets/audio/bling.wav'),
  eat:                require('../../assets/audio/eat.mp3'),
  footstep:           require('../../assets/audio/footstep.mp3'),
  'level-up':         require('../../assets/audio/level_up.mp3'),
  'new-recipe-found': require('../../assets/audio/new_recipe_found.mp3'),
  'upgrade-building': require('../../assets/audio/upgrade_building.mp3'),
  'deep-monster-growl': require('../../assets/audio/deep-monster-growl.mp3'),
  'sword-hit':          require('../../assets/audio/sword_hit.mp3'),
  'sword-miss':         require('../../assets/audio/sword_miss.mp3'),
  'combat-impact':      require('../../assets/audio/combat_impact.mp3'),
  'attack-miss':        require('../../assets/audio/attack_miss.mp3'),
  action:               require('../../assets/audio/action.mp3'),
  victory:              require('../../assets/audio/victory.wav'),
  'victory-boss':       require('../../assets/audio/victory_boss.wav'),
  losecoin:             require('../../assets/audio/losecoin.wav'),
};

const MINSTREL_SOURCES: Record<MinstrelTrackKey, number> = {
  'minstrel-classical': require('../../assets/audio/minstrel_feathered_banner_classical.mp3'),
  'minstrel-rock': require('../../assets/audio/minstrel_marketgate_riot_rock.mp3'),
  'minstrel-pop': require('../../assets/audio/minstrel_stonegate_dance_pop.mp3'),
  'minstrel-rave': require('../../assets/audio/minstrel_hey_ho_beneath_the_castle.mp3'),
  'minstrel-metal': require('../../assets/audio/minstrel_hold_the_line.mp3'),
  'minstrel-kpop': require('../../assets/audio/minstrel_age_of_stone.mp3'),
  'minstrel-alpine': require('../../assets/audio/minstrel_over_the_hill_we_go.mp3'),
  'minstrel-techno': require('../../assets/audio/minstrel_ride_the_wheel.mp3'),
  'minstrel-country': require('../../assets/audio/minstrel_the_road_we_own.mp3'),
  'minstrel-hiphop': require('../../assets/audio/minstrel_timber_and_stone.mp3'),
};

const MAIN_MENU_THEMES = [
  'main-menu',
  'main-menu-feathered-banner',
  'main-menu-marketgate-riot',
  'main-menu-stonegate-dance',
] as const satisfies readonly NonNullable<ThemeKey>[];

export type MainMenuThemeKey = (typeof MAIN_MENU_THEMES)[number];

export function getRandomMainMenuTheme(): MainMenuThemeKey {
  return MAIN_MENU_THEMES[Math.floor(Math.random() * MAIN_MENU_THEMES.length)];
}

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
  private minstrelPlayer: AudioPlayer | null = null;
  private minstrelTrackKey: MinstrelTrackKey | null = null;
  private minstrelStartTimer: ReturnType<typeof setTimeout> | null = null;

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
      const settings = await loadGameSettings();
      this.musicVolume = settings.musicVolume / 100;
      this.sfxVolume = settings.sfxVolume / 100;
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

  private disposeChannel(ch: 'A' | 'B'): void {
    const player = this.getChannel(ch);
    if (!player) return;
    try { player.pause(); } catch {}
    try { player.remove(); } catch {}
    this.setChannel(ch, null);
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
    this.disposeChannel(inactiveCh);

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
    // An interrupted load/crossfade can leave a player in the inactive channel.
    // It is never audible, but without disposal it retains a native decoder.
    if (activeCh) this.disposeChannel(activeCh === 'A' ? 'B' : 'A');
    else {
      this.disposeChannel('A');
      this.disposeChannel('B');
    }
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
    if (this.minstrelPlayer) try { this.minstrelPlayer.volume = this.musicVolume; } catch {}
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

    // Loops stay unique and addressable. Short effects receive their own handle
    // so rapid taps can overlap instead of cutting off the previous sound.
    if (options?.loop) this.stopSoundEffect(key);
    const handleKey = options?.loop ? key : `${key}:${Date.now()}:${Math.random()}`;

    try {
      const player = createAudioPlayer(source);
      player.volume = this.sfxVolume;
      player.loop   = options?.loop ?? false;

      const handle: SFXHandle = { player };
      this.sfxPlayers.set(handleKey, handle);

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
          this.sfxPlayers.delete(handleKey);
        }, maxMs + 600);
      }
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] Failed to create SFX player:', key, e);
    }
  }

  stopSoundEffect(key: string): void {
    const matching = [...this.sfxPlayers.entries()].filter(([handleKey]) => handleKey === key || handleKey.startsWith(`${key}:`));
    for (const [handleKey, h] of matching) {
      if (h.startTimer) clearTimeout(h.startTimer);
      if (h.cleanupTimer) clearTimeout(h.cleanupTimer);
      try { h.player.pause(); } catch {}
      try { h.player.remove(); } catch {}
      this.sfxPlayers.delete(handleKey);
    }
  }

  playMinstrelTrack(key: MinstrelTrackKey, restart = false): void {
    if (!this.audioUnlocked) return;
    if (this.minstrelPlayer && this.minstrelTrackKey === key) {
      if (this.minstrelStartTimer) clearTimeout(this.minstrelStartTimer);
      this.minstrelStartTimer = null;
      this.startMinstrelWhenLoaded(this.minstrelPlayer, key, restart, 0);
      return;
    }
    this.stopMinstrelTrack();
    try {
      const player = createAudioPlayer(MINSTREL_SOURCES[key]);
      player.volume = this.musicVolume;
      player.loop = false;
      this.minstrelPlayer = player;
      this.minstrelTrackKey = key;
      this.startMinstrelWhenLoaded(player, key, true, 0);
    } catch (e) {
      if (__DEV__) console.warn('[AudioEngine] Failed to create minstrel player:', key, e);
    }
  }

  private startMinstrelWhenLoaded(player: AudioPlayer, key: MinstrelTrackKey, restart: boolean, attempt: number): void {
    if (this.minstrelPlayer !== player || this.minstrelTrackKey !== key) return;
    if (player.isLoaded) {
      try {
        player.volume = this.musicVolume;
        if (restart) player.seekTo(0);
        player.play();
      } catch {}
      return;
    }
    if (attempt >= 100) {
      if (__DEV__) console.warn('[AudioEngine] Load timeout for', key);
      this.stopMinstrelTrack();
      return;
    }
    this.minstrelStartTimer = setTimeout(() => {
      this.minstrelStartTimer = null;
      this.startMinstrelWhenLoaded(player, key, restart, attempt + 1);
    }, 100);
  }

  pauseMinstrelTrack(): void {
    if (this.minstrelStartTimer) {
      clearTimeout(this.minstrelStartTimer);
      this.minstrelStartTimer = null;
    }
    if (this.minstrelPlayer) try { this.minstrelPlayer.pause(); } catch {}
  }

  stopMinstrelTrack(): void {
    if (this.minstrelStartTimer) {
      clearTimeout(this.minstrelStartTimer);
      this.minstrelStartTimer = null;
    }
    if (this.minstrelPlayer) {
      try { this.minstrelPlayer.pause(); } catch {}
      try { this.minstrelPlayer.remove(); } catch {}
    }
    this.minstrelPlayer = null;
    this.minstrelTrackKey = null;
  }

  /** Release short-lived native players when the app leaves the foreground. */
  suspendTransientAudio(): void {
    if (this.duckIntervalId !== null) {
      clearInterval(this.duckIntervalId);
      this.duckIntervalId = null;
    }
    this.duckLevel = 1;
    for (const key of [...this.sfxPlayers.keys()]) this.stopSoundEffect(key);
    this.pauseMinstrelTrack();
    if (this.activeChannel) {
      const player = this.getChannel(this.activeChannel);
      if (player) try { player.volume = this.effectiveMusicVol(); } catch {}
    }
  }

  isSfxPlaying(key: string): boolean {
    return [...this.sfxPlayers.keys()].some((handleKey) => handleKey === key || handleKey.startsWith(`${key}:`));
  }
}

// ─── Singleton (hot-reload safe) ──────────────────────────────────────────────

const _GLOBAL_KEY = '__audioEngineV2__';
const _globalRef = globalThis as unknown as Record<string, unknown>;
if (!_globalRef[_GLOBAL_KEY]) {
  _globalRef[_GLOBAL_KEY] = new AudioEngine();
}
export const audioEngine: AudioEngine = _globalRef[_GLOBAL_KEY] as AudioEngine;
