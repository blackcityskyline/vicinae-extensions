/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** API Key - Your Wallhaven API key. Required to access NSFW content and your collections. Get it from https://wallhaven.cc/settings/account */
	"apiKey"?: string;

	/** Username - Your Wallhaven username. Required for the My Collections command. Find it at https://wallhaven.cc/settings/account */
	"username"?: string;

	/** Download Directory - Folder where downloaded wallpapers are saved. Defaults to ~/Downloads. */
	"downloadDir"?: string;

	/** Safe Search - Always restrict results to SFW content, even when an API key is provided. Disables the purity filter in Search Wallpapers. */
	"sfwOnly"?: boolean;

	/** Wallpaper Backend - Which program draws your wallpaper. Auto detects what is running. Pick one only if detection picks the wrong program. */
	"backend"?: "auto" | "noctalia" | "awww" | "swww" | "hyprpaper" | "swaybg" | "feh" | "mpvpaper" | "waypaper" | "skwd-wall";
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Search Wallpapers */
	export type SearchWallpapers = ExtensionPreferences & {
		
	}

	/** Command: Top Wallpapers */
	export type TopWallpapers = ExtensionPreferences & {
		
	}

	/** Command: My Collections */
	export type MyCollections = ExtensionPreferences & {
		
	}

	/** Command: Random Wallpaper */
	export type RandomWallpaper = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Search Wallpapers */
	export type SearchWallpapers = {
		
	}

	/** Command: Top Wallpapers */
	export type TopWallpapers = {
		
	}

	/** Command: My Collections */
	export type MyCollections = {
		
	}

	/** Command: Random Wallpaper */
	export type RandomWallpaper = {
		
	}
}