-- @name Hybrid
-- @tag Hybrid
-- @description Energetic entry, calm exit and stable workspaces with one small overshoot.
-- @generated hypr-animations 1

hl.curve("overshot", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })
hl.curve("smoothOut", { type = "bezier", points = { { 0.3, 0 }, { 0.3, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "overshot", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "smoothOut", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "overshot", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "smoothOut" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "smoothOut" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "smoothOut" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "overshot", style = "slide" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "overshot", style = "slide" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "smoothOut", style = "slide" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "overshot", style = "slide" })
