-- @name Spring
-- @tag Spring
-- @description Real spring curves: soft, physical settling without bezier overshoot artefacts.
-- @generated hypr-animations 1

hl.curve("spring_layer", { type = "spring", mass = 1, stiffness = 60, dampening = 14 })
hl.curve("spring_window", { type = "spring", mass = 1, stiffness = 65, dampening = 14 })
hl.curve("spring_open", { type = "spring", mass = 1, stiffness = 35, dampening = 8 })
hl.curve("spring_workspace", { type = "spring", mass = 1.3, stiffness = 30, dampening = 10 })
hl.curve("spring_special", { type = "spring", mass = 1, stiffness = 30, dampening = 8 })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, spring = "spring_open", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, spring = "spring_window", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, spring = "spring_window", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 3, spring = "spring_window" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, spring = "spring_window" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 4, spring = "spring_window" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 3, spring = "spring_layer" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 3, spring = "spring_layer" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 4, spring = "spring_layer" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, spring = "spring_layer", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, spring = "spring_layer", style = "fade" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 4, spring = "spring_workspace", style = "slide" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 5, spring = "spring_workspace", style = "slide" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, spring = "spring_workspace", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 4, spring = "spring_special", style = "slidevert" })
