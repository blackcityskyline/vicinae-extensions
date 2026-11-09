// @name Screen Curvature
// @tag Retro
// @description Barrels the screen into a curved tube and stretches the edges to fill.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;

const float CURVE = 0.04;

void main() {
    vec2 uv = v_texcoord * 2.0 - 1.0;
    uv *= 1.0 + CURVE * dot(uv, uv);
    // Clamp instead of painting black corners: the edge pixels stretch.
    fragColor = texture(tex, clamp(uv * 0.5 + 0.5, 0.0, 1.0));
}
