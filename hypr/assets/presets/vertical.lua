-- @name Vertical
-- @tag Gestures
-- @description Vertical workspace flow with a vertical slide fade, tuned for column gestures.
-- @generated hypr-animations 1

hl.curve("fluent_decel", { type = "bezier", points = { { 0, 0.2 }, { 0.4, 1 } } })
hl.curve("easeOutCubic", { type = "bezier", points = { { 0.33, 1 }, { 0.68, 1 } } })
hl.curve("easeinoutsine", { type = "bezier", points = { { 0.37, 0 }, { 0.63, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "easeinoutsine", style = "popin 60%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "easeOutCubic", style = "popin 60%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "easeinoutsine", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 3, bezier = "fluent_decel" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, bezier = "fluent_decel" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 4, bezier = "fluent_decel" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 3, bezier = "fluent_decel" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 4, bezier = "fluent_decel" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "easeinoutsine", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "easeinoutsine", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "fluent_decel", style = "slidefadevert 30%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 3, bezier = "fluent_decel", style = "slidefade 10%" })
