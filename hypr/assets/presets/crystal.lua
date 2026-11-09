-- @name Crystal
-- @tag Vibe
-- @description Ethereal glide: glassy curves, slow fades and almost no travel on close.
-- @generated hypr-animations 1

hl.curve("glass", { type = "bezier", points = { { 0.16, 1 }, { 0.3, 1 } } })
hl.curve("crystal_fade", { type = "bezier", points = { { 0.33, 1 }, { 0.68, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "glass", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "glass", style = "popin 90%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "glass", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 6, bezier = "crystal_fade" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 5, bezier = "crystal_fade" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 6, bezier = "crystal_fade" })
hl.animation({ leaf = "layers", enabled = true, speed = 5, bezier = "glass", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 5, bezier = "glass", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 6, bezier = "glass", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "glass", style = "slidefade 10%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "glass", style = "slide" })
