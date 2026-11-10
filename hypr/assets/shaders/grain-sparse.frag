// @name Film Grain Sparse
// @tag Texture
// @description Same one-pixel grain as Film Grain, drawn on about a third of the pixels; the same speckle stays in place.

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
    vec2 cell = floor(v_texcoord * fullSize);
    // Same grain size, but seven cells in ten stay clean.
    float keep = step(0.65, hash(cell + 41.0));
    float grain = (hash(cell) - 0.5) * keep;
    fragColor = vec4(color.rgb + grain * 0.12, color.a);
}
