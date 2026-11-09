// @name Edge Detect
// @tag Stylize
// @description Draws Sobel contours on black instead of the screen content.

#version 300 es
precision highp float;

in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fullSize;

float luma(vec2 uv) {
    return dot(texture(tex, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 px = 1.0 / fullSize;
    float tl = luma(v_texcoord + vec2(-px.x, -px.y));
    float tc = luma(v_texcoord + vec2(0.0, -px.y));
    float tr = luma(v_texcoord + vec2(px.x, -px.y));
    float ml = luma(v_texcoord + vec2(-px.x, 0.0));
    float mr = luma(v_texcoord + vec2(px.x, 0.0));
    float bl = luma(v_texcoord + vec2(-px.x, px.y));
    float bc = luma(v_texcoord + vec2(0.0, px.y));
    float br = luma(v_texcoord + vec2(px.x, px.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = clamp(length(vec2(gx, gy)), 0.0, 1.0);
    fragColor = vec4(vec3(edge), 1.0);
}
