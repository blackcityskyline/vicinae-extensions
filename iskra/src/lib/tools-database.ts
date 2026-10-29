import { isCommandAvailable } from "../backends/utils";

export type PackageManager = "pacman" | "apt" | "dnf" | "brew" | "winget";

export interface ToolInfo {
	id: string;
	displayName: string;
	description: string;
	category: "capture" | "annotate" | "dependency";
	checkCommand: string | null; // null = bundled npm package, always present
	packages: Partial<Record<PackageManager, string>>;
	notes?: string;
}

export const detectPackageManager = (): PackageManager | "unknown" => {
	if (process.platform === "win32") return "winget";
	if (process.platform === "darwin") return "brew";
	if (isCommandAvailable("pacman")) return "pacman";
	if (isCommandAvailable("apt")) return "apt";
	if (isCommandAvailable("dnf")) return "dnf";
	return "unknown";
};

/**
 * Install command for one Tesseract language's data. Each distribution names
 * the package differently: Arch and Fedora keep the underscore of the language
 * code (`chi_sim`), Debian turns it into a hyphen, and Homebrew ships every
 * language in one formula.
 */
export const ocrLanguageInstallCommand = (
	lang: string,
	pm: PackageManager,
): string | null => {
	switch (pm) {
		case "pacman":
			return `sudo pacman -S tesseract-data-${lang}`;
		case "apt":
			return `sudo apt install tesseract-ocr-${lang.replace(/_/g, "-")}`;
		case "dnf":
			return `sudo dnf install tesseract-langpack-${lang}`;
		case "brew":
			return "brew install tesseract-lang";
		case "winget":
			return null;
	}
};

export const getInstallCommand = (
	tool: ToolInfo,
	pm: PackageManager,
): string | null => tool.packages[pm] ?? null;

export const isToolInstalled = (tool: ToolInfo): boolean => {
	if (tool.checkCommand === null) return true;
	return isCommandAvailable(tool.checkCommand);
};

export const TOOLS_DATABASE: ToolInfo[] = [
	// ── Capture tools ────────────────────────────────────────────────────────
	{
		id: "grimblast",
		displayName: "grimblast",
		description: "All-in-one capture tool for Hyprland (wraps grim + slurp)",
		category: "capture",
		checkCommand: "grimblast",
		packages: {
			pacman: "sudo pacman -S grimblast",
		},
	},
	{
		id: "grim",
		displayName: "grim",
		description: "Wayland image grabber - pair with slurp for area selection",
		category: "capture",
		checkCommand: "grim",
		packages: {
			pacman: "sudo pacman -S grim",
			apt: "sudo apt install grim",
			dnf: "sudo dnf install grim",
		},
	},
	{
		id: "spectacle",
		displayName: "spectacle",
		description: "KDE screenshot utility - works on Wayland and X11",
		category: "capture",
		checkCommand: "spectacle",
		packages: {
			pacman: "sudo pacman -S spectacle",
			apt: "sudo apt install spectacle",
			dnf: "sudo dnf install spectacle",
		},
	},
	{
		id: "gnome-screenshot",
		displayName: "gnome-screenshot",
		description: "GNOME screenshot utility",
		category: "capture",
		checkCommand: "gnome-screenshot",
		packages: {
			pacman: "sudo pacman -S gnome-screenshot",
			apt: "sudo apt install gnome-screenshot",
			dnf: "sudo dnf install gnome-utils",
		},
	},
	{
		id: "flameshot",
		displayName: "flameshot",
		description: "Cross-platform screenshot tool with built-in annotation GUI",
		category: "capture",
		checkCommand: "flameshot",
		packages: {
			pacman: "sudo pacman -S flameshot",
			apt: "sudo apt install flameshot",
			dnf: "sudo dnf install flameshot",
			brew: "brew install flameshot",
			winget: "winget install Ablaze.Flameshot",
		},
	},
	{
		id: "maim",
		displayName: "maim",
		description:
			"Lightweight X11 screenshot tool - pair with slop for selection",
		category: "capture",
		checkCommand: "maim",
		packages: {
			pacman: "sudo pacman -S maim",
			apt: "sudo apt install maim",
			dnf: "sudo dnf install maim",
		},
	},
	{
		id: "scrot",
		displayName: "scrot",
		description: "Classic X11 screen capture utility",
		category: "capture",
		checkCommand: "scrot",
		packages: {
			pacman: "sudo pacman -S scrot",
			apt: "sudo apt install scrot",
			dnf: "sudo dnf install scrot",
			brew: "brew install scrot",
		},
	},
	{
		id: "screenshot-desktop",
		displayName: "screenshot-desktop",
		description:
			"npm package - uses native OS APIs (Windows/macOS only in this extension)",
		category: "capture",
		checkCommand: null,
		packages: {},
		notes: "Bundled as an npm dependency - no installation required.",
	},
	// ── Annotate tools ───────────────────────────────────────────────────────
	{
		id: "satty",
		displayName: "satty",
		description:
			"Modern Wayland-native screenshot annotation tool (auto-reload)",
		category: "annotate",
		checkCommand: "satty",
		packages: {
			pacman: "yay -S satty",
		},
		notes: "AUR package - requires an AUR helper (yay, paru, etc.).",
	},
	{
		id: "swappy",
		displayName: "swappy",
		description:
			"Wayland snapshot editing tool, common grim companion (auto-reload)",
		category: "annotate",
		checkCommand: "swappy",
		packages: {
			pacman: "sudo pacman -S swappy",
			apt: "sudo apt install swappy",
		},
	},
	{
		id: "gradia",
		displayName: "Gradia",
		description:
			"Screenshot annotation editor for GNOME-family desktops (manual save)",
		category: "annotate",
		checkCommand: "gradia",
		packages: {
			pacman: "yay -S gradia",
			apt: "sudo apt install gradia",
		},
		notes: "Packaged as a Flatpak upstream (`flatpak install flathub be.alexandervanhee.gradia`); a distro package or the Flatpak both work.",
	},
	{
		id: "noctalia",
		displayName: "Noctalia",
		description:
			"Noctalia shell's built-in annotator, driven over its own IPC (manual save)",
		category: "annotate",
		checkCommand: "noctalia",
		packages: {
			pacman: "yay -S noctalia-shell",
		},
		notes: "Requires the Noctalia shell to be running: `noctalia msg annotate <file>` reaches it over IPC.",
	},
	{
		id: "gimp",
		displayName: "GIMP",
		description: "Powerful cross-platform image editor (manual save)",
		category: "annotate",
		checkCommand: "gimp",
		packages: {
			pacman: "sudo pacman -S gimp",
			apt: "sudo apt install gimp",
			dnf: "sudo dnf install gimp",
			brew: "brew install gimp",
			winget: "winget install GIMP.GIMP",
		},
	},
	{
		id: "pinta",
		displayName: "Pinta",
		description: "Simple cross-platform paint/annotation tool (manual save)",
		category: "annotate",
		checkCommand: "pinta",
		packages: {
			pacman: "sudo pacman -S pinta",
			apt: "sudo apt install pinta",
			dnf: "sudo dnf install pinta",
			brew: "brew install pinta",
		},
	},
	// ── Dependencies ─────────────────────────────────────────────────────────
	{
		id: "slurp",
		displayName: "slurp",
		description:
			"Wayland region selector - required by grim for area/window/monitor capture",
		category: "dependency",
		checkCommand: "slurp",
		packages: {
			pacman: "sudo pacman -S slurp",
			apt: "sudo apt install slurp",
			dnf: "sudo dnf install slurp",
		},
	},
	{
		id: "slop",
		displayName: "slop",
		description: "X11 region selector - required by maim for area selection",
		category: "dependency",
		checkCommand: "slop",
		packages: {
			pacman: "sudo pacman -S slop",
			apt: "sudo apt install slop",
			dnf: "sudo dnf install slop",
		},
	},
	{
		id: "xdotool",
		displayName: "xdotool",
		description: "X11 window tool - required by maim for window capture",
		category: "dependency",
		checkCommand: "xdotool",
		packages: {
			pacman: "sudo pacman -S xdotool",
			apt: "sudo apt install xdotool",
			dnf: "sudo dnf install xdotool",
		},
	},
	{
		id: "tesseract",
		displayName: "tesseract-ocr",
		description: "OCR engine used for text extraction",
		category: "dependency",
		checkCommand: "tesseract",
		packages: {
			pacman: "sudo pacman -S tesseract tesseract-data-eng",
			apt: "sudo apt install tesseract-ocr",
			dnf: "sudo dnf install tesseract tesseract-langpack-eng",
			brew: "brew install tesseract tesseract-lang",
		},
	},
	{
		id: "zbarimg",
		displayName: "zbarimg",
		description: "Barcode/QR code decoder",
		category: "dependency",
		checkCommand: "zbarimg",
		packages: {
			pacman: "sudo pacman -S zbar",
			apt: "sudo apt install zbar-tools",
			dnf: "sudo dnf install zbar",
			brew: "brew install zbar",
		},
	},
];
