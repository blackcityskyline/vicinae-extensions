-- @name Subtle
-- @tag Pro
-- @description Zero distractions: tiny movement, quick fades and no bounce anywhere.
-- @generated hypr-animations 1

hl.curve("soft", { type = "bezier", points = { { 0.25, 1 }, { 0.5, 1 } } })
hl.curve("focus", { type = "bezier", points = { { 0.16, 1 }, { 0.3, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "soft", style = "popin 95%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "focus", style = "popin 98%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "soft", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 3, bezier = "soft" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, bezier = "soft" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 4, bezier = "focus" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "soft", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "soft", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "focus", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "soft", style = "slidefade 5%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 4, bezier = "soft", style = "slidefade 5%" })
