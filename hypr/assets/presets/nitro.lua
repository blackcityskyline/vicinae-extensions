-- @name Nitro
-- @tag Bold
-- @description Maximum impact: a 56% overshoot on open and a hard recoil on close.
-- @generated hypr-animations 1

hl.curve("nitro", { type = "bezier", points = { { 0.34, 1.56 }, { 0.64, 1 } } })
hl.curve("recoil", { type = "bezier", points = { { 0.36, 0 }, { 0.66, -0.56 } } })
hl.curve("crazy", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "nitro", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6.5, bezier = "recoil", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "crazy", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 2.5, bezier = "crazy" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 2.5, bezier = "crazy" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 3, bezier = "crazy" })
hl.animation({ leaf = "layers", enabled = true, speed = 3, bezier = "nitro", style = "popin" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "nitro", style = "popin" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "recoil", style = "popin" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "nitro", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 4, bezier = "nitro", style = "slide" })
