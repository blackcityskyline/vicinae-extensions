/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface ObjectConstructor {
    /**
     * `Object.keys` that preserves the type of the keys.
     */
    keys<T extends object>(obj: T): (keyof T)[];
  }

  interface JSON {
    /**
     * Converts a JavaScript Object Notation (JSON) string into an object.
     */
    parse<T = unknown>(text: string, reviver?: (this: any, key: string, value: any) => any): T;
  }

  export type AllPreferences = Preferences &
    Preferences.Authenticator &
    Preferences.CreateFolder &
    Preferences.GeneratePassword &
    Preferences.GeneratePasswordQuick &
    Preferences.LockVault &
    Preferences.LogoutVault &
    Preferences.Search;

  type RecordOfAny = Record<string, any>;
  type RecordOfStrings = Record<string, string>;
  type MaybePromise<T> = T | Promise<T>;
  type Nullable<T> = T | null | undefined;
  type Falsy = false | "" | 0 | null | undefined;
}

export {};
