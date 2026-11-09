-- @name Neon
-- @tag GLITCH
-- @description The edge light flickers back and forth like unstable electricity.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(11,15,17)", "rgb(166,203,230)", "rgb(11,15,17)", "rgb(166,203,230)", "rgb(11,15,17)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.curve("glitch", { type = "bezier", points = { { 0.1, 1.5 }, { 0.9, -0.5 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 40, bezier = "glitch", style = "loop" });
