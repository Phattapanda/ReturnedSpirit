import { useEffect, useSyncExternalStore } from "react";
import { loadGameSettings, updateGameSettings, type GameLanguage } from "@/src/settings/game-settings";
import { germanGame } from "./de-game";
import { germanDialogues } from "./de-dialogues";
import { germanMessages, translateDynamicMessage } from "./de-messages";
import { germanItems } from "./de-items";

const german = {
  "New Game": "Neues Spiel",
  "Load Game": "Spiel laden",
  "Settings": "Einstellungen",
  "Support": "Support",
  "Music Volume": "Musiklautstärke",
  "Sound Effects": "Soundeffekte",
  "Haptics": "Vibration",
  "Off": "Aus",
  "Light": "Leicht",
  "Medium": "Mittel",
  "Strong": "Stark",
  "Language": "Sprache",
  "Only important actions: crafting, serving guests, level ups, and story choices.": "Nur bei wichtigen Aktionen: Herstellung, Gästebedienung, Stufenaufstiegen und Dialogentscheidungen.",
  "Could not save language. Please try again.": "Die Sprache konnte nicht gespeichert werden. Bitte versuche es erneut.",
  "local save": "lokaler Spielstand",
} as const;
const dictionary: Record<string, string> = { ...germanGame, ...germanDialogues, ...germanMessages, ...germanItems, ...german };
export function translateDisplay(text: string, locale: GameLanguage): string {
  if (locale === "en") return text;
  const trimmed = text.trim();
  const translated = dictionary[trimmed];
  if (translated !== undefined) return text.replace(trimmed, translated);
  if (/^\d+ (?:Gold|Silver|Copper) Coins?(?: · \d+ (?:Gold|Silver|Copper) Coins?)+$/.test(trimmed)) {
    return text.replace(trimmed, trimmed.split(" · ").map(part => translateDisplay(part, locale)).join(" · "));
  }
  const dynamic = translateDynamicMessage(trimmed, value => translateDisplay(value, locale));
  if (dynamic !== undefined) return text.replace(trimmed, dynamic);
  const quoted = trimmed.match(/^["“](.*)["”]$/s);
  if (quoted) {
    const inner = translateDisplay(quoted[1], locale);
    if (inner !== quoted[1]) return text.replace(trimmed, `„${inner}“`);
  }
  // Combat logs concatenate independently generated sentences.
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (sentences.length > 1) return text.replace(trimmed, sentences.map(sentence => translateDisplay(sentence, locale)).join(" "));
  const greeting = trimmed.match(/^Nice to meet you, (.+)\.$/);
  const introduction = trimmed.match(/^Nice to meet you, my name is (.+)\.$/);
  if (introduction) return text.replace(trimmed, `Freut mich, mein Name ist ${introduction[1]}.`);
  const staying = trimmed.match(/^(.+) will be staying here for the time being\.$/);
  if (staying) return text.replace(trimmed, `${staying[1]} wohnt vorerst hier.`);
  const guest = trimmed.match(/^I have a guest here, (.+)\. I suppose things are about to pick up speed here\.$/);
  if (guest) return text.replace(trimmed, `Ich habe einen Gast hier: ${guest[1]}. Ich glaube, jetzt kommt hier wieder Leben hinein.`);
  if (greeting) return text.replace(trimmed, `Schön, dich kennenzulernen, ${greeting[1]}.`);
  // Labels followed by a number (e.g. Stamina: 20) retain the original number.
  const label = trimmed.match(/^(.+?)(:\s*[+−\-]?\d.*)$/);
  if (label && dictionary[label[1]]) return text.replace(trimmed, dictionary[label[1]] + label[2]);
  const quantity = trimmed.match(/^(\d+\s*[×x]\s*)(.+)$/);
  if (quantity && dictionary[quantity[2]]) return text.replace(trimmed, quantity[1] + dictionary[quantity[2]]);
  return text;
}
let language: GameLanguage = "en";
let initialization: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => language;
function publish(next: GameLanguage) {
  language = next;
  listeners.forEach(listener => listener());
}
async function initializeLanguage() {
  initialization ??= loadGameSettings().then(settings => { publish(settings.language); });
  await initialization;
}
export async function setGameLanguage(next: GameLanguage) {
  await initializeLanguage();
  const saved = await updateGameSettings({ language: next });
  publish(saved.language);
}
export function useLanguage() {
  const current = useSyncExternalStore(subscribe, snapshot, () => "en" as GameLanguage);
  useEffect(() => { void initializeLanguage(); }, []);
  return {
    language: current,
    setLanguage: setGameLanguage,
    t: (key: string): string => translateDisplay(key, current),
  };
}
