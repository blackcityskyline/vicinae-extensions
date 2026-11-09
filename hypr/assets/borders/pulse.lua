-- @name Heartbeat
-- @tag EKG
-- @description A pulse of colour runs along the edge of the focused window.

hl.config({
	general = {
		border_size = 2,
		col = {
			active_border = { colors = { "rgb(166,203,230)", "rgb(11,15,17)", "rgb(11,15,17)", "rgb(11,15,17)" }, angle = 45 },
			inactive_border = "rgb(0,0,0)",
		},
	},
});

hl.curve("heartbeat", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1 } } });
hl.animation({ leaf = "borderangle", enabled = true, speed = 40, bezier = "heartbeat", style = "loop" });
hl.animation({ leaf = "border", enabled = true, speed = 10, bezier = "default" });
