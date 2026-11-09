-- @name Cyber Glitch
-- @tag ERROR
-- @description Alert colours with ultra-fast rotation.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(250,116,111)", "rgb(11,15,17)", "rgb(166,203,230)", "rgb(11,15,17)" }, angle = 90 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.curve("rapid", { type = "bezier", points = { { 0, 1 }, { 0, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 15, bezier = "rapid", style = "loop" });
