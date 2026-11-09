-- @name Neon Cyber-Glow
-- @tag GLOW
-- @description Two-colour glow over a white and violet light base.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgba(00fff7ff)", "rgba(1a0026ff)", "rgba(ff00ffff)" }, angle = 45 },
			inactive_border = "rgba(0f0f2655)",
		},
	},
});

hl.config({
	decoration = {
		shadow = {
			enabled = true,
			range = 20,
			render_power = 4,
			color = "rgba(ffffff44)",
			offset = { 0, 0 },
		},
	},
});

hl.curve("nv_neon_flow", { type = "bezier", points = { { 0.4, 0 }, { 0.2, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 30, bezier = "nv_neon_flow", style = "loop" });
