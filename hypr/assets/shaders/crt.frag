// @name CRT Scanlines
// @tag Retro
// @description One dark line every two pixels plus a soft vignette, aligned to the panel grid.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;

void main() {
    vec4 color = texture(tex, v_texcoord);
    // Physical pixel rows, so the lines do not beat against the content.
    float scan = 0.80 + 0.20 * mod(floor(v_texcoord.y * fullSize.y), 2.0);
    vec2 d = v_texcoord - 0.5;
    float vignette = 1.0 - 0.5 * dot(d, d);
    fragColor = vec4(color.rgb * scan * vignette, color.a);
}
