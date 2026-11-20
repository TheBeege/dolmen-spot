/**
 * The save-data file the error screen offers (src/components/ErrorScreen.tsx):
 * a copy of everything Dolmen Spot keeps in this browser, not a character file,
 * so Import refuses it with this message (parseImportedCharacters() in
 * src/lib/storage.ts). Its format starts with "dolmen-spot-recovery", like the
 * other recovery files Dolmen Spot writes.
 *
 * Kept free of other imports: the error screen must load even when the rest of
 * the app can't.
 */
export const SAVE_DATA_FORMAT = 'dolmen-spot-recovery-error-screen';

export const SAVE_DATA_IMPORT_MESSAGE =
  "That's a save-data file from Dolmen Spot's error screen, not a character file, so it can't be imported. Keep it, or attach it to a bug report.";
