-- @name Dynamic Duo
-- @tag 2-TONE
-- @description High contrast between the primary and secondary colours.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)" }, angle = 90 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = false });
