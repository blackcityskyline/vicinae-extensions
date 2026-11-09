-- @name Fade
-- @tag Ghost
-- @description Spectral materialization: opacity does the work, geometry barely moves.
-- @generated hypr-animations 1

hl.curve("phantom", { type = "bezier", points = { { 0.4, 0 }, { 0.6, 1 } } })
hl.curve("mist", { type = "bezier", points = { { 0.2, 0.8 }, { 0.2, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 6, bezier = "phantom", style = "popin 90%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 7.5, bezier = "phantom", style = "popin 95%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "mist", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 6.5, bezier = "phantom" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 6, bezier = "phantom" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 6.5, bezier = "phantom" })
hl.animation({ leaf = "layers", enabled = true, speed = 5, bezier = "phantom", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 5, bezier = "phantom", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 6, bezier = "phantom", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 6.5, bezier = "phantom", style = "fade" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 6.5, bezier = "phantom", style = "fade" })
