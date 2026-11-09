-- @name Inertia
-- @tag Physics
-- @description Organic movement: windows gain momentum entering and pull back before leaving.
-- @generated hypr-animations 1

hl.curve("inertia", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })
hl.curve("anticipate", { type = "bezier", points = { { 0.1, -0.1 }, { 0.1, 1.0 } } })
hl.curve("friction", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.0 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "inertia", style = "slide" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "anticipate", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "friction", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "friction" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "friction" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "friction" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "friction", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "friction", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "friction", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "inertia", style = "slidefade 20%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "inertia", style = "slide" })
