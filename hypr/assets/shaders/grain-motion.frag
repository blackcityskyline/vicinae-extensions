// @name Film Grain Motion
// @tag Motion
// @description Noise redrawn every frame; needs debug:damage_tracking = 0.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;
uniform float time;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 color = texture(tex, v_texcoord);
    float grain = hash(floor(v_texcoord * fullSize) + floor(time * 24.0) * 17.0) - 0.5;
    fragColor = vec4(color.rgb + grain * 0.12, color.a);
}
