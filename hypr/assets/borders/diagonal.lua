-- @name Diagonal
-- @tag FADE
-- @description Smooth gradient at a 45 degree angle.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(11,15,17)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = false });
