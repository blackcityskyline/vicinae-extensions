-- @name Follow Colors Spin
-- @tag Spin
-- @description The live palette gradient rotates around the focused window.

-- Fallback colours, used only when no palette file can be resolved. Applying
-- the preset rewrites these lines from the live theme.
hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)", "rgb(250,116,111)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = true, speed = 40, bezier = "linear", style = "loop" });
