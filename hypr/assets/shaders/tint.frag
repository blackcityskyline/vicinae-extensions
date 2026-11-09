// @name Follow Colors Tint
// @tag Tint
// @description Blends a palette role into the screen; choose the role in Preferences.

// Fallback colour (primary), used only when no palette file can be resolved.
// Applying the preset rewrites the TINT line from the live theme.
#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;

const vec3 TINT = vec3(0.651, 0.796, 0.902);
const float AMOUNT = 0.35;

void main() {
    vec4 color = texture(tex, v_texcoord);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(mix(color.rgb, TINT * luma, AMOUNT), color.a);
}
