## Iteration 16 (Feb 2026) – PATCH: Soup Demo, Global Dismiss, Logbuch, Regen-Animation

### Neue Dateien:
- `src/game/logbook.ts` – LogEntry-Typ, appendLogEntry, loadLogbook (AsyncStorage Key @game:logbook)
- `app/logbook.tsx` – Dedizierter Logbuch-Screen (/logbook Route)

### Geänderte Dateien:
- `kitchen.tsx`:
  - DLine-Type mit optionalem `id`-Feld für Logbuch-Dedup
  - Alle Dialog-Arrays (D_POST_CONSUMPTION, D_WHERE_AM_I, D_WHO_INTRO, dFinal, dPostGarden) mit stabilen IDs
  - `showBubble` + `showDialog` schreiben automatisch in Logbuch
  - `afterSoupLanded`: Zweite Bubble 'Pull it closer to you to eat.' + startSoupDemoAnim()
  - Demo-Animation: demoX/Y/Vis/Scale SharedValues, zIndex 402 (über Bubble)
  - `soupDemoActive` State: Slot-0-Suppe ausgeblendet während Demo, nach Demo restored
  - BLOCK_ALL + ALLOW_ITEM Bubbles: Fullscreen Pressable mit onPress=dismissBubble (globales Schließen)
  - SK.SOUP_DEMO_SEEN Storage-Key (einmalige Demo)
  - Menü: Resume → Logbook → Save → Main Menu → Settings
  - Logbuch-Modal in kitchen inline
  - dayIdxRef für korrekte Tag-Labels im Logbuch

- `garden.tsx`:
  - Logbuch importiert + geladen beim Mount
  - showBubble: logId-Parameter, alle Rupert-Bubbles mit stabilen IDs
  - renderBubble: globales Dismiss via Pressable-Wrapper
  - Menü: Logbook-Eintrag → router.push('/logbook')
  - Logbuch-Modal inline

- `dormitory.tsx`:
  - lifeSV SharedValue für animierte Life-Bar
  - lifeFillStyle als useAnimatedStyle
  - regenPending ref: speichert oldSta/newSta/oldLife/newLife vor Schlafen
  - processDayAndWake: SVs bleiben bei alten Werten, regenPending gesetzt
  - onMorningDone: ruft animateRegen auf
  - animateRegen: Stamina + Life animieren von alt→neu (900ms), Counter-Animation, Floating +X Texts
  - Floating Texts: regenStaStyle/regenLifeStyle (translateY + opacity), nur wenn Gewinn > 0
  - Menü: Logbook-Eintrag → router.push('/logbook')
