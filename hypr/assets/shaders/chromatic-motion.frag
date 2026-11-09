// @name Chromatic Drift
// @tag Motion
// @description Aberration widens and narrows continuously; needs debug:damage_tracking = 0.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;
uniform float time;

void main() {
    vec4 color = texture(tex, v_texcoord);
    float pixels = 1.0 + 0.5 * (1.0 + sin(time * 1.5));
    vec2 offset = vec2(pixels / fullSize.x, 0.0);
    float red = texture(tex, v_texcoord + offset).r;
    float blue = texture(tex, v_texcoord - offset).b;
    fragColor = vec4(red, color.g, blue, color.a);
}
