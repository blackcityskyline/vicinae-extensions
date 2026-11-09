// @name Duotone
// @tag Palette
// @description Maps the screen onto a shadow and a highlight role; choose both in Preferences.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;

const vec3 SHADOW = vec3(0.109, 0.116, 0.123);
const vec3 HIGHLIGHT = vec3(0.651, 0.796, 0.902);

void main() {
    vec4 color = texture(tex, v_texcoord);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(mix(SHADOW, HIGHLIGHT, luma), color.a);
}
