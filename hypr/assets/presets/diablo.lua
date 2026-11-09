-- @name Diablo
-- @tag Game
-- @description Diablo-style vertical snap: windows drop in, slide out and bounce when moved.
-- @generated hypr-animations 1

hl.curve("snappyReturn", { type = "bezier", points = { { 0.4, 0.9 }, { 0.6, 1.0 } } })
hl.curve("bounce", { type = "bezier", points = { { 0.4, 0.9 }, { 0.6, 1.0 } } })
hl.curve("overshot", { type = "bezier", points = { { 0.13, 0.99 }, { 0.29, 1.08 } } })
hl.curve("liner", { type = "bezier", points = { { 0, 0 }, { 1, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "snappyReturn", style = "slidevert right" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "snappyReturn", style = "slide" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "bounce", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "snappyReturn" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 4, bezier = "snappyReturn" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "snappyReturn" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 4, bezier = "snappyReturn" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "bounce", style = "slidevert right" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "bounce", style = "slidevert right" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "bounce", style = "slidevert right" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "overshot", style = "slidevert" })
hl.animation({ leaf = "border", enabled = true, speed = 0.5, bezier = "liner" })
