// @name Color Blind Correction
// @tag Accessibility
// @description Daltonizes the screen for deutan colour vision deficiency; choose the type in Preferences.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;

// Viénot, Brettel & Mollon (1999): the simulated dichromat response.
const vec3 SIM_R = vec3(0.292750, 0.707250, 0);
const vec3 SIM_G = vec3(0.292750, 0.707250, 0);
const vec3 SIM_B = vec3(-0.022337, 0.022337, 1.000000);

void main() {
    vec4 color = texture(tex, v_texcoord);
    vec3 sim = vec3(dot(color.rgb, SIM_R), dot(color.rgb, SIM_G), dot(color.rgb, SIM_B));
    vec3 err = color.rgb - sim;
    vec3 corrected = color.rgb + vec3(0.7 * (err.g + err.b), 0.0, 0.0);
    fragColor = vec4(clamp(corrected, 0.0, 1.0), color.a);
}
