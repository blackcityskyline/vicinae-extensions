-- @name Waterfall
-- @tag FLOW
-- @description Dynamic border with a vertical gradient.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(11,15,17)" }, angle = 90 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = false });
