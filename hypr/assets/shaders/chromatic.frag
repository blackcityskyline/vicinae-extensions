// @name Chromatic Aberration
// @tag Retro
// @description Splits red and blue one pixel apart, like a cheap lens.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;

void main() {
    vec2 offset = vec2(1.0 / fullSize.x, 0.0);
    vec4 color = texture(tex, v_texcoord);
    float red = texture(tex, v_texcoord + offset).r;
    float blue = texture(tex, v_texcoord - offset).b;
    fragColor = vec4(red, color.g, blue, color.a);
}
