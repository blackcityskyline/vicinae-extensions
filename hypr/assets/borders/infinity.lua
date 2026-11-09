-- @name Infinity
-- @tag LOOP
-- @description Fluid loop of colours, constantly rotating.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)", "rgb(250,116,111)", "rgb(166,203,230)", "rgb(182,201,216)", "rgb(218,222,255)", "rgb(250,116,111)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.curve("linear", { type = "bezier", points = { { 0, 0 }, { 1, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 50, bezier = "linear", style = "loop" });
