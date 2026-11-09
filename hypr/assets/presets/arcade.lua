-- @name Arcade
-- @tag Arcade
-- @description Toon physics: exaggerated jump on entry and a squash before the window closes.
-- @generated hypr-animations 1

hl.curve("jump", { type = "bezier", points = { { 0.5, -0.3 }, { 0.68, 1.4 } } })
hl.curve("squash", { type = "bezier", points = { { 0.5, -0.5 }, { 0.1, 1.0 } } })
hl.curve("rubber", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "jump", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "squash", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 3, bezier = "rubber", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 2.5, bezier = "rubber" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 2.5, bezier = "rubber" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 3, bezier = "rubber" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "rubber", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "rubber", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 3.5, bezier = "rubber", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "jump", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 4, bezier = "jump", style = "slide" })
