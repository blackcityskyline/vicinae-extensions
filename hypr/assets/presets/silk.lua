-- @name Silk
-- @tag Soft
-- @description Absolute smoothness: no bounce, just a long soft landing.
-- @generated hypr-animations 1

hl.curve("quart", { type = "bezier", points = { { 0.25, 1 }, { 0.5, 1 } } })
hl.curve("expo", { type = "bezier", points = { { 0.16, 1 }, { 0.3, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "quart", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "quart", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "quart", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 5, bezier = "quart" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 5, bezier = "quart" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 6, bezier = "quart" })
hl.animation({ leaf = "layers", enabled = true, speed = 5, bezier = "quart", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 5, bezier = "quart", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 6, bezier = "quart", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "expo", style = "slidefade 20%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "expo", style = "slide" })
