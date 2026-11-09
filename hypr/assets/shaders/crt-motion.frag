// @name CRT Motion
// @tag Motion
// @description Scanlines with a bright bar rolling down; needs debug:damage_tracking = 0.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;
uniform float time;

void main() {
    vec4 color = texture(tex, v_texcoord);
    float scan = 0.80 + 0.20 * mod(floor(v_texcoord.y * fullSize.y), 2.0);
    // One bar per screen, travelling down once every ten seconds.
    float bar = 0.10 * smoothstep(0.25, 0.0, abs(fract(v_texcoord.y + time * 0.10) - 0.5));
    fragColor = vec4((color.rgb + bar) * scan, color.a);
}
