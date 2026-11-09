-- @name The Joker
-- @tag THEME
-- @description Acid green and deep purple with an electric glow.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgba(39ff14ff)", "rgba(1a0026ff)", "rgba(9d00ffff)" }, angle = 45 },
			inactive_border = "rgba(1a002655)",
		},
	},
});

hl.config({
	decoration = {
		shadow = {
			enabled = true,
			range = 18,
			render_power = 3,
			color = "rgba(9d00ff55)",
			offset = { 0, 0 },
		},
	},
});

hl.curve("nv_joker_flow", { type = "bezier", points = { { 0.4, 0 }, { 0.2, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 30, bezier = "nv_joker_flow", style = "loop" });
