-- @name Elastic
-- @tag Flex
-- @description Rubber band physics: a 15% overshoot on open and a snap on close.
-- @generated hypr-animations 1

hl.curve("rubber", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.15 } } })
hl.curve("snap", { type = "bezier", points = { { 0.1, 1 }, { 0, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "snap", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 3, bezier = "snap" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, bezier = "snap" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 4, bezier = "snap" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "snap", style = "slide" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "rubber", style = "slide" })
