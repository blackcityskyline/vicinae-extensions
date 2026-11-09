-- @name Lightning
-- @tag Fast
-- @description Maximum visual response: quick entry with a short, readable exit.
-- @generated hypr-animations 1

hl.curve("lightning", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })
hl.curve("lightning_soft", { type = "bezier", points = { { 0.25, 1 }, { 0.5, 1 } } })

hl.animation({ leaf = "windowsIn", enabled = true, speed = 3, bezier = "lightning", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 5, bezier = "lightning", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 2.5, bezier = "lightning", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 2.5, bezier = "lightning_soft" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 2.5, bezier = "lightning_soft" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 3, bezier = "lightning_soft" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 2.5, bezier = "lightning_soft", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 2.5, bezier = "lightning_soft", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 3, bezier = "lightning", style = "slidefade 20%" })
