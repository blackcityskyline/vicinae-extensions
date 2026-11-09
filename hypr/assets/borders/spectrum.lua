-- @name Spectrum
-- @tag RAINBOW
-- @description The complete colour cycle, static.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)", "rgb(250,116,111)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = false });
