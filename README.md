# MacroMind

MacroMind is an Android-first Expo MVP for AI-first nutrition tracking. The main workflow is capture-first food logging: meal photo, barcode, nutrition label, text, or voice-style input flows into a structured AI review screen before a meal is saved.

## Architecture Summary

- **Mobile shell:** Expo + React Native + TypeScript, with React Navigation for tabs and stack flows.
- **State:** Zustand stores onboarding, goals, daily logs, provider settings, and chat history.
- **Async services:** TanStack Query wraps AI inference calls and keeps the UI responsive.
- **AI abstraction:** Provider adapters implement a shared `ModelProvider` interface. Mock, local Codex, local Claude, and future hosted providers can be swapped without changing screens.
- **Structured AI tasks:** OCR, barcode interpretation, meal photo recognition, label parsing, text parsing, portion estimation, nutrition estimation, and chat reasoning are represented as typed tasks with Zod schemas.
- **Provenance:** Estimated foods and macros carry value sources such as AI vision, OCR, barcode lookup, nutrition database, user correction, and manual entry.

## Folder Structure

```text
src/
  components/       Reusable mobile UI primitives
  config/           Theme, defaults, provider presets
  hooks/            Screen hooks and app selectors
  navigation/       Root stack and tab navigation
  screens/          Product screens
  services/         AI, meal pipeline, nutrition helpers
  store/            Zustand app store
  types/            Domain, AI, and navigation types
```

## Run On Android

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start Expo:

   ```sh
   npm run android
   ```

3. Use an Android emulator or Expo Go on a physical Android phone.

The MVP uses mock AI by default. To connect a local assistant on your LAN, open **Settings**, choose `local-codex` or `local-claude`, and set a base URL such as `http://192.168.1.20:8787`.

If Metro reports `EMFILE: too many open files`, raise the shell watcher limit before starting Expo:

```sh
ulimit -n 65536
npm start -- --localhost --port 8081
```

## Android Notes

- Camera permission is required for meal photos, barcodes, and nutrition labels.
- Microphone permission is declared for the voice flow. The current MVP models voice as text capture so the UI and pipeline are in place without committing to a speech-to-text provider.
- For real local inference from an Android device, use your machine LAN IP instead of `localhost`.

## Next High-Value Features

1. Add real camera capture previews and barcode frame detection using `expo-camera`.
2. Add on-device or local-network speech-to-text for the voice meal flow.
3. Persist logs and settings with SQLite or a backend sync service.
4. Connect provider adapters to real Codex/Claude local endpoints with streaming and retries.
5. Add correction learning so user edits improve future serving and food estimates.
