import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFfmpegVersion } from "../../src/utils/ffmpegPath";

describe("parseFfmpegVersion", () => {
  it("reads a release version", () => {
    assert.equal(parseFfmpegVersion("ffmpeg version 6.1.1 Copyright (c) 2000-2023"), 6.1);
  });

  it("reads a git-master version, which is prefixed with n", () => {
    assert.equal(parseFfmpegVersion("ffmpeg version n9.0.2 Copyright (c) 2000-2026"), 9);
  });

  it("returns null for a binary that is not ffmpeg", () => {
    assert.equal(parseFfmpegVersion("/usr/bin/ffmpeg: No such file or directory"), null);
  });
});
