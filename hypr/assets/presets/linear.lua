-- @name Linear
-- @tag Flat
-- @description Constant motion with no curve: the straight sci-fi HUD look.
-- @generated hypr-animations 1

hl.curve("linear", { type = "bezier", points = { { 0, 0 }, { 1, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "linear", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "linear", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "linear", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 3, bezier = "linear" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, bezier = "linear" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 4, bezier = "linear" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "linear", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "linear", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "linear", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "linear", style = "slide" })
