-- @name Golden Luxury
-- @tag PRO
-- @description An intense white reflection travelling over gold.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "0xffC5A000", "0xffFFD700", "0xffFFFFFF", "0xffFFD700", "0xffC5A000" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.curve("shimmer", { type = "bezier", points = { { 0.45, 0 }, { 0.55, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 60, bezier = "shimmer", style = "loop" });
