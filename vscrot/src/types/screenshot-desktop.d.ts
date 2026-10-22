/**
 * `screenshot-desktop` ships JavaScript with no types of its own, and nothing on npm
 * declares them (`@types/screenshot-desktop` does not exist). Only what this extension
 * calls is described here.
 */
declare module "screenshot-desktop" {
	type ShotOptions = {
		filename?: string;
		format?: "png" | "jpg";
		screen?: number | string;
	};
	type Display = { id: number | string; name?: string };

	function screenshot(options?: ShotOptions): Promise<Buffer | string>;
	namespace screenshot {
		function listDisplays(): Promise<Display[]>;
	}
	export default screenshot;
}
