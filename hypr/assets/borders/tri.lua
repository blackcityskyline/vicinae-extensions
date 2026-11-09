-- @name Noctalia Trident
-- @tag 3-TONE
-- @description Primary, secondary and tertiary in balance.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)" }, angle = 90 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.animation({ leaf = "borderangle", enabled = false });
