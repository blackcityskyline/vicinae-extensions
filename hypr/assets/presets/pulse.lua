-- @name Pulse
-- @tag Live
-- @description Breathing rhythm: a pulsing entry, a quick exit and a strong workspace crossfade.
-- @generated hypr-animations 1

hl.curve("pulse", { type = "bezier", points = { { 0.1, 0.9 }, { 0.1, 1.05 } } })
hl.curve("quick", { type = "bezier", points = { { 0.2, 1 }, { 0.2, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "pulse", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "quick", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "pulse", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "pulse" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "pulse" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "quick" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "pulse", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "pulse", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "quick", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "pulse", style = "slidefade 40%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "pulse", style = "slide" })
