// @name Film Grain
// @tag Texture
// @description Adds a fixed noise pattern; the same grain stays in place.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 color = texture(tex, v_texcoord);
    float grain = hash(floor(v_texcoord * fullSize)) - 0.5;
    fragColor = vec4(color.rgb + grain * 0.12, color.a);
}
