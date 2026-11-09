-- Base layer for every preset.
--
-- Every animation leaf is enabled here, so a preset that overrides only a few
-- of them still animates windows in, out, layers, workspaces and fades. Before
-- this, presets inherited whatever the previous preset had switched off, which
-- is why window close animations rarely played.
--
-- Keep this file free of style choices: each preset overrides what it cares
-- about. A larger `speed` is a longer animation in Hyprland, so every out leaf
-- gets a larger number than its in leaf and the close animation is visible.

hl.config({ animations = { enabled = true } })

hl.curve("hve_default", { type = "bezier", points = { { 0.05, 0.9 }, { 0.1, 1.05 } } })

hl.animation({ leaf = "global", enabled = true, speed = 6.5, bezier = "default" })
hl.animation({ leaf = "windows", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 4, bezier = "hve_default", style = "popin 80%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 6, bezier = "hve_default", style = "popin 80%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 4, bezier = "hve_default", style = "slide" })
hl.animation({ leaf = "fade", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3, bezier = "hve_default" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 5, bezier = "hve_default" })
hl.animation({ leaf = "fadeSwitch", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "fadeShadow", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "fadeDim", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "fadePopups", enabled = true, speed = 3, bezier = "hve_default" })
hl.animation({ leaf = "fadePopupsIn", enabled = true, speed = 3, bezier = "hve_default" })
hl.animation({ leaf = "fadePopupsOut", enabled = true, speed = 5, bezier = "hve_default" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "hve_default", style = "fade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3, bezier = "hve_default", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 5, bezier = "hve_default", style = "fade" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 4, bezier = "hve_default" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 3, bezier = "hve_default" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 5, bezier = "hve_default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "hve_default", style = "slide" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 4, bezier = "hve_default", style = "slide" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 6, bezier = "hve_default", style = "slide" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 5, bezier = "hve_default", style = "slidevert" })
hl.animation({ leaf = "specialWorkspaceIn", enabled = true, speed = 4, bezier = "hve_default", style = "slidevert" })
hl.animation({ leaf = "specialWorkspaceOut", enabled = true, speed = 6, bezier = "hve_default", style = "slidevert" })
hl.animation({ leaf = "border", enabled = true, speed = 6.5, bezier = "hve_default" })
hl.animation({ leaf = "borderangle", enabled = false })
