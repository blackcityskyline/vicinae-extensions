-- @name Follow Colors Pulse
-- @tag Pulse
-- @description The live palette turns in a heartbeat rhythm, then rests.

-- Fallback colours, used only when no palette file can be resolved. Applying
-- the preset rewrites these lines from the live theme.
hl.curve("follow_pulse", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1 } } });

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)", "rgb(250,116,111)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = true, speed = 40, bezier = "follow_pulse", style = "loop" });
