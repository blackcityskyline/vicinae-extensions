-- @name Rebound
-- @tag Bouncy
-- @description Spring physics: a 10% overshoot on open and a crouch before close.
-- @generated hypr-animations 1

hl.curve("spring", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.1 } } })
hl.curve("crouch", { type = "bezier", points = { { 0.1, -0.1 }, { 0.1, 1.0 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "spring", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "crouch", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "spring", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 2.5, bezier = "spring" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 2.5, bezier = "spring" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 3, bezier = "spring" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "spring", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "spring", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 3.5, bezier = "spring", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "spring", style = "slide" })
