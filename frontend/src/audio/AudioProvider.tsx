/**
 * AudioProvider – React Context wrapping the AudioEngine singleton.
 *
 * Mount exactly ONCE at the application root (_layout.tsx).
 * Components use `useAudioManager()` hook to interact with audio.
 *
 * React state only stores UI-relevant values:
 *   currentThemeKey, musicVolume, sfxVolume, audioUnlocked
 * All AudioPlayer objects and timers live in the AudioEngine.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { audioEngine, getMusicTheme } from './audioEngine';
import type { ThemeKey, LocationKey, TimeOfDayKey, AudioEngineState } from './audioEngine';

// ─── Context shape ────────────────────────────────────────────────────────────

export type AudioManagerContextValue = {
  // UI-readable state
  currentThemeKey: ThemeKey;
  musicVolume: number;   // 0–100
  sfxVolume: number;     // 0–100
  audioUnlocked: boolean;

  // Methods
  crossfadeTo: (themeKey: ThemeKey, durationMs?: number) => void;
  stopGameplayMusic: (durationMs?: number) => void;
  playSoundEffect: (key: string, options?: { maxDurationMs?: number; loop?: boolean }) => void;
  stopSoundEffect: (key: string) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  duckMusic: (level: number, durationMs?: number) => void;
  unlockAudio: () => void;
  getMusicTheme: (location: LocationKey, timeOfDay?: TimeOfDayKey) => ThemeKey;
};

export const AudioManagerContext = createContext<AudioManagerContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AudioEngineState>(() => audioEngine.getState());

  // Mount-once effect: subscribe to engine, initialize, handle app state
  useEffect(() => {
    // Init (loads settings, sets audio mode)
    audioEngine.initialize().catch(() => {});

    // Subscribe to engine state changes → update React state
    const unsub = audioEngine.addListener(() => {
      setState(audioEngine.getState());
    });

    // App foreground/background handling
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        // Reload settings in case they changed while in background
        audioEngine.loadSettings().catch(() => {});
      }
    });

    return () => {
      unsub();
      appStateSub.remove();
    };
  }, []);

  // ── Methods (stable references via useCallback) ───────────────────────────

  const crossfadeTo = useCallback((themeKey: ThemeKey, durationMs?: number) => {
    audioEngine.crossfadeTo(themeKey, durationMs);
  }, []);

  const stopGameplayMusic = useCallback((durationMs?: number) => {
    audioEngine.stopGameplayMusic(durationMs);
  }, []);

  const playSoundEffect = useCallback((key: string, options?: { maxDurationMs?: number; loop?: boolean }) => {
    audioEngine.playSoundEffect(key, options);
  }, []);

  const stopSoundEffect = useCallback((key: string) => {
    audioEngine.stopSoundEffect(key);
  }, []);

  const setMusicVolume = useCallback((value: number) => {
    audioEngine.setMusicVolume(value);
  }, []);

  const setSfxVolume = useCallback((value: number) => {
    audioEngine.setSfxVolume(value);
  }, []);

  const duckMusic = useCallback((level: number, durationMs?: number) => {
    audioEngine.duckMusic(level, durationMs);
  }, []);

  const unlockAudio = useCallback(() => {
    audioEngine.unlockAudio().catch(() => {});
  }, []);

  const ctxValue: AudioManagerContextValue = {
    currentThemeKey: state.currentThemeKey,
    musicVolume:     state.musicVolume,
    sfxVolume:       state.sfxVolume,
    audioUnlocked:   state.audioUnlocked,
    crossfadeTo,
    stopGameplayMusic,
    playSoundEffect,
    stopSoundEffect,
    setMusicVolume,
    setSfxVolume,
    duckMusic,
    unlockAudio,
    getMusicTheme,
  };

  return (
    <AudioManagerContext.Provider value={ctxValue}>
      {children}
    </AudioManagerContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudioManager(): AudioManagerContextValue {
  const ctx = useContext(AudioManagerContext);
  if (!ctx) throw new Error('useAudioManager must be used within AudioProvider');
  return ctx;
}
