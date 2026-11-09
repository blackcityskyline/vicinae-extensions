-- @name Impact
-- @tag FX
-- @description Jelly effect: elastic entry and a visible pullback before the window leaves.
-- @generated hypr-animations 1

hl.curve("elastic", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })
hl.curve("retro", { type = "bezier", points = { { 0.6, -0.28 }, { 0.735, 0.045 } } })
hl.curve("smooth", { type = "bezier", points = { { 0.1, 1 }, { 0.1, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "elastic", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "retro", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "smooth", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "smooth" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "smooth" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "smooth" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "smooth", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "smooth", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "smooth", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "elastic", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "elastic", style = "slide" })
