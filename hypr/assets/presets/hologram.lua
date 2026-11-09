-- @name Hologram
-- @tag Tech
-- @description Digital precision: exponential stops, vertical slides and no overshoot.
-- @generated hypr-animations 1

hl.curve("holo", { type = "bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })
hl.curve("data", { type = "bezier", points = { { 0.16, 1 }, { 0.3, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "holo", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "holo", style = "popin 100%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "holo", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "data" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "data" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "data" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "holo", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "holo", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "holo", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "holo", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "holo", style = "slide" })
