-- @name Organic
-- @tag Nature
-- @description Sprout movement: slow vertical growth, soft fades, almost no travel on close.
-- @generated hypr-animations 1

hl.curve("sprout", { type = "bezier", points = { { 0.25, 0.8 }, { 0.25, 1.0 } } })
hl.curve("wind", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "sprout", style = "popin 85%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "sprout", style = "popin 95%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "wind", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 6, bezier = "sprout" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 5, bezier = "sprout" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 6, bezier = "sprout" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "sprout", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "sprout", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "sprout", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "sprout", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "sprout", style = "slide" })
